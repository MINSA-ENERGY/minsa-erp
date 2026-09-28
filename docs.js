// Documentos de un proyecto (decision 4): LIGAS a archivos ya archivados en la biblioteca de la
// unidad (buscador Graph, solo lectura, excluye el buzon) + «Subir al buzon» 99_Pendiente-Archivar
// con `_lote.json` al final (lote.js). «En el buzon» se DERIVA en vivo: si la carpeta del lote ya
// no existe (404) es que la skill de archivar lo acomodo. Nada se escribe fuera del buzon.
// v0.108.0: si la skill dejo su recibo en `_resueltos/` (recibo-lote.py), la liga se reemplaza sola (aplicarRecibo).
//
// v0.2.0 (tanda 1 de la auditoria): una liga se QUITA y se cambia de tarjeta desde la app (F1);
// la liga cuyo lote ya acomodo la skill se REEMPLAZA buscando el archivado (F2); y ligar / subir
// se abren tambien desde la tarjeta, con esa tarjeta ya puesta (F3).
// v0.3.0 (tanda 2): el tercer tipo de liga es «enlace» (F4) — titulo + URL pegada, sin biblioteca:
// un correo, un oficio en Legal o Finanzas, una pagina. No toca permisos del tenant.
// v0.4.1: PROY_Ligas.Url y .Ruta son texto de UNA linea (255): el webUrl de Graph por un .docx con
// nombre de la convencion de la casa pasa de 255 y SharePoint contesta 400 «Invalid request» sin
// decir por que (2026-09-12, LAU). Al ligar se relee el elemento por id (ruta real + GUID), la URL se
// acorta con `urlParaLiga` y ningun texto sale hacia Graph sin pasar por `textosLargos`.

import { CONFIG } from './config.js';
import { PUEDE, tareasDe, slug, fechaMexico, nombreDe, validarUrl, urlParaLiga, urlCortaDeGuid, resumenLargos, textosLargos, TEXTO_MAX, hrefSeguro, filtrarLigas, tipoArchivo, ordenarLigas, direccionInicial, nombreDeLiga, columnasDe, nombreColumnaEn, claseDeColumna, colorValido, HECHO, TIPOS_LIGA } from './reglas.js';
import { construirManifiesto, validarManifiesto, bytesDelManifiesto, nombreCarpetaLote, NOMBRE_MANIFIESTO, rutaRecibo, validarRecibo } from './lote.js';
import { $, L, VERSION, estado, el, boton, chip, iconoArchivo, iconoSvg, avisar, abrirDialogo, cerrarDialogo, confirmar, opciones, limpiar, porId, proyectoAbierto, registrarActividad, equipoDe, fechaCorta, fechaHora, aplicar, pedirRelectura, irAHash, chipVence, conRetardo } from './comun.js';
import { esConflicto } from './graph.js';

let alCambiar = () => {};
export function alCambiarDocs(fn) { alCambiar = fn; }

/** Biblioteca de la unidad de un proyecto, o null si el equipo no tiene una en el piloto. */
export function bibliotecaDe(p) {
    const eq = equipoDe(p);
    const b = eq.unidad ? CONFIG.bibliotecas[eq.unidad] : null;
    return b ? { clave: eq.unidad, ...b } : null;
}

/** Resuelve (y cachea) el siteId de una biblioteca. `{ id, motivo }`; id null si 403/404.
 *  C-08 (mejorar-app archivos, 17-sep): se cachea la PROMESA, no el resultado — dos llamadas concurrentes (pintarDocs esperando
 *  el sitio y «Ligar» buscando) esperan la misma peticion; si falla, se suelta para que la siguiente vuelva a pedir. */
function sitioDe(bib) {
    if (!estado.sitiosUnidad[bib.clave]) estado.sitiosUnidad[bib.clave] = estado.cliente.sitioOpcional(CONFIG.sharepointHost, bib.sitio).catch(e => { delete estado.sitiosUnidad[bib.clave]; throw e; });
    return estado.sitiosUnidad[bib.clave];
}

/** Puede ligar/subir en este proyecto: rol, proyecto activo y biblioteca AUTORIZADA (piloto).
 *  A1 (2026-09-12): antes bastaba con que el equipo tuviera biblioteca, asi que sobre RABASA o
 *  PITEPEC los botones seguian vivos y la busqueda terminaba en un 403 con la ruta de un script
 *  que el colaborador no puede correr. El dato se sabe antes de abrir el dialogo. */
export function puedeLigarEn(p) { const b = bibliotecaDe(p); return PUEDE.ligar(estado.rol) && !!p && p.Estado === 'activo' && !!b && b.piloto !== false; }
/** Puede pegar un enlace (F4): rol y proyecto activo; la biblioteca no hace falta. */
export function puedeEnlazarEn(p) { return PUEDE.ligar(estado.rol) && !!p && p.Estado === 'activo'; }

// Con que proyecto / tarjeta se abrio el dialogo de ligar o subir (desde Docs o desde la tarjeta).
// `reemplaza` es la liga vieja que se quita al ligar el resultado (F2); `alTerminar` vuelve a la
// tarjeta si se abrio desde ahi.
// C-20 (v0.124.0): el contexto guarda IDS (proyecto y liga a reemplazar), no objetos — el dialogo vive lo que tarde la busqueda o la
// subida, y un refresco de 120 s en medio reemplaza estado.proyectos / estado.ligas (regla v0.4.0). Se resuelven al usarse.
let ctx = { proyectoId: null, tareaId: null, reemplazaId: null, alTerminar: null };
const proyectoCtx = () => porId(estado.proyectos, ctx.proyectoId);
/** C-20 (v0.124.0): los handlers de la pestaña resuelven el proyecto abierto AL CLIC, no el `p` de la pintada. */
const pintarDocsAbierto = () => { const q = proyectoAbierto(); if (q) pintarDocs(q); };
/** v0.70.0 (Carlos, 16-sep): Cancelar, Esc o Atras en Ligar / Subir / Enlace VUELVEN a la tarjeta desde la que se abrio, no a la
 *  pantalla. Consume `alTerminar` (idempotente: el boton lo llama y el evento `close` lo repite sin efecto); el camino que si ligo
 *  lo vacia antes de cerrar, porque ya lo llama el mismo. */
function volverSiCancela() { const f = ctx.alTerminar; ctx.alTerminar = null; if (f) f(); }

// ---------------------------------------------------------------- pintar

// C-03 (mejorar-app proyecto, 17-sep): generacion de la pintada. pintarDocs es async (consulta el buzon al final) y dos pintadas
// solapadas —tecleo en el buscador, plegar una carpeta, el refresco de 120 s— volvian las dos sobre el MISMO #docsLista y
// duplicaban el chip «ya lo acomodo la skill» y su boton. Tras cada await, la pintada vieja se retira; la promesa de cada
// consulta se cachea para no pedirla dos veces; y la cola async lleva catch (antes era una promesa suelta sin catch).
let pintadaDocs = 0;
export async function pintarDocs(p) {
    const gen = ++pintadaDocs;
    const cont = $('docsLista'); cont.textContent = '';
    const bib = bibliotecaDe(p);
    const puede = puedeLigarEn(p);
    const todas = estado.ligas.filter(l => Number(l.ProyectoId) === p.id);
    // U10: chips por tipo (solo si hay de mas de uno), grupos «Del proyecto» y por tarjeta, chip de estado junto al nombre.
    const fl = $('docsFiltro'); fl.textContent = '';
    const tipos = [...new Set(todas.map(l => l.Tipo))];
    if (tipos.length > 1) for (const [k, texto] of TIPOS_LIGA) {   // C-05: la misma tupla que #archivos
        if (k && !tipos.includes(k)) continue;
        const b = boton(texto, estado.filtroDocs === k ? 'is-on' : '', () => { estado.filtroDocs = k; pintarDocsAbierto(); }, { docs: k || 'todos' }); b.setAttribute('aria-pressed', estado.filtroDocs === k ? 'true' : 'false'); fl.appendChild(b);
    } else estado.filtroDocs = null;
    // v0.17.0: buscador propio de la pestaña (nombre, ruta o dirección, sin acentos) y el conteo «N de M».
    if ($('docsBusca').value !== (estado.buscaDocs || '')) $('docsBusca').value = estado.buscaDocs || '';
    // Con menos de 2 ligas el buscador se esconde Y deja de filtrar: un filtro sin control en pantalla no se puede quitar (revisor, 13-sep).
    $('docsBusca').hidden = todas.length < 2; if (todas.length < 2) estado.buscaDocs = '';
    const ligas = ordenarDocs(filtrarLigas(todas, { tipo: estado.filtroDocs, texto: estado.buscaDocs }));   // v0.18.0: por la columna elegida, dentro de cada grupo
    $('docsResumen').textContent = todas.length ? `${ligas.length} de ${todas.length}` : '';
    $('docsTodo').hidden = true;   // v0.34.0: «Abrir todo / Plegar todo» solo con arbol pintado
    if (!ligas.length) { cont.appendChild(el('p', 'vacio', todas.length ? 'Nada con ese filtro.' : 'Sin documentos ligados todavía. Se ligan desde una tarjeta: ábrela y usa Ligar, Subir o Enlace.')); return; }   // U-19 (v0.114.0)
    const puedeDe = l => puede || (l.Tipo === 'enlace' && puedeEnlazarEn(p));
    // v0.33.0 (Carlos, 14-sep; artifact HMVvZx2L, opcion E de ocho): Docs es un ARBOL DE EXPEDIENTE. La misma tabla
    // (.dtabla.is-arbol, mismas columnas y orden) con el proyecto como raiz, cada tarjeta como CARPETA —icono con el
    // color de su cubeta, nombre de la cubeta y vencimiento— que se pliega con un clic, los documentos colgando con
    // linea de conexion, y al final un nodo con las tarjetas ABIERTAS que aun no tienen expediente («Ligar aqui»).
    // v0.55.0 (Carlos, 15-sep): la columna «Tarjeta» SALE tambien de Docs, como en #archivos (v0.45.0) — la carpeta ya la
    // nombra— y el select que MUEVE la liga (F1) vive ahora en el menu «⋯» de cada documento (renglon «Mover a»).
    const tabla = tablaDocs({ orden: estado.ordenDocs, alOrdenar: o => { estado.ordenDocs = o; pintarDocsAbierto(); }, sinTarjeta: true }); const tb = tabla.querySelector('tbody');
    tabla.classList.add('is-arbol');
    const columnas = columnasDe(p);
    tb.appendChild(filaRaiz(p.Title, ligas.length, todas.length, { sinTarjeta: true }));
    // v0.52.0 (Carlos, 15-sep): el arbol NACE TODO PLEGADO —el Set guarda lo abierto, no lo plegado, incluido el nodo de vacias—.
    const plegada = k => !estado.abiertasDocs.has(k);
    const alPlegar = k => { if (estado.abiertasDocs.has(k)) estado.abiertasDocs.delete(k); else estado.abiertasDocs.add(k); pintarDocsAbierto(); };
    const { llaves } = filasDeExpediente(tb, p, ligas, { plegada, alPlegar, sinTarjeta: true, doc: l => ({ p, puede: puedeDe(l) }) });
    // Las tarjetas abiertas (no hechas) sin ningun documento: UN nodo, plegado por default, para que un frente de 30
    // tarjetas no llene el arbol de carpetas vacias y aun asi se vea cuantas van sin expediente. Solo sin filtro ni busqueda.
    let hayVacias = false;
    if (!estado.filtroDocs && !estado.buscaDocs) {
        const conDocs = new Set(todas.map(l => Number(l.TareaId)).filter(Boolean));
        const vacias = tareasDe(p, estado.tareas).filter(t => t.Columna !== HECHO && !conDocs.has(t.id)).sort((a, b) => String(a.Title).localeCompare(String(b.Title)));
        if (vacias.length) { hayVacias = true; const ab = estado.abiertasDocs.has(-1); tb.appendChild(filaVacias(vacias.length, ab, () => alPlegar(-1))); if (ab) for (const t of vacias) tb.appendChild(filaVacia(t, columnas, puede ? () => abrirLigar({ proyectoId: p.id, tareaId: t.id }) : null)); }
    }
    // v0.34.0: «Abrir todo» / «Plegar todo». Las llaves del arbol: 0 = Del proyecto, id de cada tarjeta con expediente, y
    // -1 = el nodo de vacias (desde v0.52.0 con la misma regla: presente = ABIERTO). Cada boton se apaga cuando ya no tiene nada que hacer.
    const todoPlegado = llaves.every(k => plegada(k)) && (!hayVacias || !estado.abiertasDocs.has(-1));
    const todoAbierto = llaves.every(k => !plegada(k)) && (!hayVacias || estado.abiertasDocs.has(-1));
    $('docsTodo').hidden = false;
    $('docsAbrirTodo').disabled = todoAbierto; $('docsPlegarTodo').disabled = todoPlegado;
    $('docsAbrirTodo').onclick = () => { estado.abiertasDocs = new Set(hayVacias ? [...llaves, -1] : llaves); pintarDocsAbierto(); };
    $('docsPlegarTodo').onclick = () => { estado.abiertasDocs = new Set(); pintarDocsAbierto(); };
    cont.appendChild(tabla);
    if (bib) await marcarBuzonEnVivo(p, ligas, cont, gen, bib, puede);
}

/** C-03 (mejorar-app archivos, 17-sep): la cola async del buzon, fuera de pintarDocs. Recibe el contenedor que pinto la
 *  generacion `gen` y SALE en cuanto esa pintada ya no es la vigente (`gen !== pintadaDocs`) o el contenedor ya no esta en el
 *  documento (`!cont.isConnected`, p. ej. se cerro el proyecto): la garantia de que un repintado en medio no deja un chip
 *  duplicado ya no depende de que `n.textContent = ''` la cubra por accidente. Una consulta por liga de tipo buzon, cacheada
 *  por carga en `estado.buzonExiste`. Es la unica que escribe sobre un DOM que otra pintada pudo reemplazar. */
async function marcarBuzonEnVivo(p, ligas, cont, gen, bib, puede) {
    const vigente = () => gen === pintadaDocs && cont.isConnected;
    try {
        const s = await sitioDe(bib);
        if (!vigente()) return;
        if (s.id) for (const l of ligas.filter(x => x.Tipo === 'buzon' && x.Ruta)) {
            if (estado.buzonExiste[l.Ruta] === undefined) estado.buzonExiste[l.Ruta] = estado.cliente.existeRuta(s.id, l.Ruta).catch(() => { delete estado.buzonExiste[l.Ruta]; return undefined; });
            const existe = await estado.buzonExiste[l.Ruta];   // promesa (en vuelo) o valor (ya resuelto): await sirve a los dos
            if (!vigente()) return;
            if (existe === undefined) continue;
            estado.buzonExiste[l.Ruta] = existe;
            // v0.108.0: con recibo de la skill la liga se reemplaza sola (y alCambiar repinta); sin el, el camino de antes.
            if (existe === false && puede && await aplicarRecibo(p, bib, s, l)) return;
            if (!vigente()) return;
            const n = cont.querySelector(`[data-liga="${l.id}"] .estado`);
            if (n && existe === false) {
                n.textContent = ''; n.appendChild(chip('ya lo acomodó la skill', 'ok'));
                // F2: buscar el archivado y reemplazar la liga en una sola operacion.
                if (puede) n.appendChild(boton('Buscar el archivado', 'mn-btn is-sm', () => abrirLigar({ proyectoId: p.id, tareaId: l.TareaId, texto: l.Title, reemplazaId: l.id }), { buscar: String(l.id) }));
                else n.appendChild(el('span', 'p', 'busca y reemplaza la liga'));
            }
        }
    } catch (e) {
        if (!vigente()) return;
        if (!estado.buzonAvisado) { estado.buzonAvisado = true; avisar('No se pudo consultar el buzón: el estado «en el buzón» puede estar atrasado hasta la próxima relectura.', 'ojo'); }   // C-03 (proyecto): una sola vez por carga
        console.warn('Docs: no se pudo consultar el buzón.', e && e.message ? e.message : e);
    }
}

// ---------------------------------------------------------------- v0.17.0: la tabla de documentos (Docs del proyecto y #archivos)
// Carlos (13-sep) pidio que la seccion de archivos se viera como «My Documents» de la captura de referencia: UNA tabla
// con columnas (Nombre · Tipo · Estado · Tarjeta · Ligado por · Fecha · acciones «⋯»), buscador y conteo. La agrupacion
// de v0.16.0 (pestaña que sobresale, opcion C) sobrevive como RENGLON de grupo dentro de la tabla, con la misma lengüeta.
// Sin columna «Tamaño»: PROY_Ligas no lo guarda (la busqueda de Graph si lo trae, pero no se persiste). En celular la
// tabla se apila en fichas por CSS (.dtabla), sin segunda estructura.
const TRAZOS_TARJETA = ['M4 5h16v14H4z', 'M4 10h16', 'M9 5v14'];
const TRAZOS_PROYECTO = ['M3 7h7l2 2h9v10H3z'];
// v0.18.0: el tercer valor es la llave de orden (ordenarLigas); «⋯» no ordena.
// v0.19.0: «Fecha» es la del DOCUMENTO (el prefijo AAAA-MM-DD de la convencion, nombreHumano) y «Ligada» la de la liga
// (_creado, la que antes se llamaba Fecha; conserva la llave `fecha` y sigue siendo el orden de arranque).
// v0.29.0 (Carlos, 14-sep; artifact c43ad139, opcion H2): «Ligado por» y «Ligada» SALEN de la tabla para que cada documento
// quepa en UNA hilera; las dos viven ahora en el menu «⋯» (renglon de nota) y en el title del renglon. Sus llaves de orden
// (`quien`, `fecha`) siguen en ordenarLigas por si un estado guardado las trae; tablaDocs las cae a `del`.
export const COLUMNAS_DOCS = [['c-nombre', 'Nombre', 'nombre'], ['c-del', 'Fecha', 'del'], ['c-tipo', 'Tipo', 'tipo'], ['c-estado', 'Estado', 'estado'], ['c-tarjeta', 'Tarjeta', 'tarjeta'], ['c-acc', '', null]];
const COLUMNAS_IDAS = new Set(['quien', 'fecha']);
// v0.45.0 (Carlos, 15-sep): en #archivos la columna «Tarjeta» SALE — cada documento ya cuelga de la carpeta con el nombre de
// su tarjeta (v0.36.0), asi que repetirlo por renglon era redundante. Docs del proyecto la conserva: ahi la celda es el select
// que cambia una liga de tarjeta (F1). `sinTarjeta` recorre tablaDocs, filaRaiz, filasDeExpediente, filaGrupo y filaDoc;
// «Abrir tarjeta» pasa al menu «⋯» y un orden guardado por `tarjeta` cae a `del` (dentro de una carpeta todos la comparten).
export const columnasDocs = (sinTarjeta = false) => sinTarjeta ? COLUMNAS_DOCS.filter(([cls]) => cls !== 'c-tarjeta') : COLUMNAS_DOCS;

/** v0.18.0: las ligas en el orden `o` ({ col, dir }; nombre visible de quien ligo y titulo de la tarjeta, como se ven). */
export function ordenarDocs(ligas, o = estado.ordenDocs) {
    return ordenarLigas(ligas, o.col, o.dir, { nombre: c => nombreDe(c, estado.roles), tarjeta: id => { const t = porId(estado.tareas, id); return t ? t.Title : `tarjeta #${id}`; } });
}

/**
 * La tabla vacia con su encabezado; el que pinta le llena el <tbody>. v0.18.0: con `{ orden, alOrdenar }`, clic (o Enter /
 * espacio) en un encabezado elige esa columna (Fecha arranca con la mas nueva arriba; las demas ascendente) y el segundo
 * clic invierte; la flecha va en el activo (aria-sort), como en la Lista de tareas (F10). `alOrdenar(nuevo)` recibe el orden
 * nuevo y lo guarda donde le toque: Docs en estado.ordenDocs (se reinicia por proyecto), #archivos en estado.ordenArchivos.
 * Se ordena dentro de cada grupo: los grupos (tarjeta o proyecto) conservan su acomodo.
 */
export function tablaDocs({ orden = null, alOrdenar = null, sinTarjeta = false } = {}) {
    const w = el('div', 'dtabla'); const t = el('table'); const th = el('thead'); const tr = el('tr');
    const o = orden && (COLUMNAS_IDAS.has(orden.col) || (sinTarjeta && orden.col === 'tarjeta')) ? { col: 'del', dir: -1 } : orden;   // v0.29.0: una columna que ya no existe no puede quedar mandando
    for (const [cls, texto, clave] of columnasDocs(sinTarjeta)) {
        const h = el('th', cls, texto); h.scope = 'col'; if (!texto) h.setAttribute('aria-label', 'Acciones');
        if (clave && o && alOrdenar) {
            const activo = o.col === clave;
            h.dataset.sort = clave; h.tabIndex = 0;
            h.title = activo ? `Ordenar por ${texto.toLowerCase()} ${o.dir === 1 ? 'descendente' : 'ascendente'}` : `Ordenar por ${texto.toLowerCase()}`;
            if (activo) h.setAttribute('aria-sort', o.dir === 1 ? 'ascending' : 'descending');
            const elegir = () => alOrdenar(activo ? { col: clave, dir: -o.dir } : { col: clave, dir: direccionInicial(clave) });
            h.addEventListener('click', elegir);
            h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } });
        }
        tr.appendChild(h);
    }
    th.appendChild(tr); t.appendChild(th); t.appendChild(el('tbody')); w.appendChild(t);
    return w;
}

/**
 * Renglon de grupo: la lengüeta de v0.16.0 (icono + `.grupo` con el titulo + conteo) sobre un <tr class="pest">.
 * Con `icono` (un nodo) y `alClic` es la cabecera de un PROYECTO en #archivos: la lengüeta es un boton .grupo-proy.
 */
export function filaGrupo(tareaId, titulo, n, { icono = null, alClic = null, title = '', tarea = null, columnas = null, plegada = false, alPlegar = null, oculta = false, sinTarjeta = false } = {}) {
    const tr = el('tr', 'pest' + (tareaId ? '' : ' is-proyecto') + (plegada ? ' is-plegada' : '')); if (tareaId) tr.dataset.tarjeta = String(tareaId);
    if (oculta) tr.hidden = true;   // v0.36.0: su raiz (#archivos) esta plegada
    const td = el('td'); td.colSpan = columnasDocs(sinTarjeta).length;
    // v0.33.0: con `alPlegar` es un NODO del arbol (Docs del proyecto): boton que pliega/despliega, con el caret, la carpeta
    // del color de la cubeta (data-tono si la tarjeta eligio color; si no, la clase por posicion), cubeta y vencimiento.
    const cab = alClic || alPlegar ? el('button', 'cab' + (alClic ? ' grupo-proy' : ' nodo')) : el('div', 'cab');
    if (alClic) { cab.type = 'button'; cab.addEventListener('click', alClic); if (title) cab.title = title; }
    if (alPlegar) { cab.type = 'button'; cab.setAttribute('aria-expanded', plegada ? 'false' : 'true'); cab.title = plegada ? 'Desplegar' : 'Plegar'; cab.addEventListener('click', alPlegar); cab.appendChild(iconoSvg(TRAZOS_CARET, 'caret')); }
    cab.appendChild(icono || iconoSvg(alPlegar ? TRAZOS_CARPETA : tareaId ? TRAZOS_TARJETA : TRAZOS_PROYECTO, alPlegar ? 'carpeta' : ''));
    if (tarea) { const color = colorValido(tarea.Color); if (color) cab.dataset.tono = color; else cab.classList.add('is-' + claseDeColumna(tarea.Columna, columnas)); }
    cab.appendChild(el('span', 'grupo', titulo));
    if (tarea) { cab.appendChild(el('span', 'cubeta-de', nombreColumnaEn(tarea.Columna, columnas))); const v = chipVence(tarea); if (v) cab.appendChild(v); }
    cab.appendChild(el('span', 'n', alPlegar ? `${n} doc${n === 1 ? '' : 's'}` : String(n)));   // U-26 (v0.123.0): en el arbol la cifra dice que cuenta
    td.appendChild(cab); tr.appendChild(td);
    return tr;
}
const TRAZOS_CARET = ['M9 6l6 6-6 6'];
const TRAZOS_CARPETA = ['M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'];

/**
 * v0.36.0: las filas del EXPEDIENTE de un proyecto dentro del arbol — «Del proyecto» y una carpeta por tarjeta con sus hojas
 * en bloque tintado (v0.35.0). Lo comparten Docs del proyecto (raiz = el proyecto) y #archivos (una raiz plegable por
 * proyecto, con el mismo formato). `llave(k)` traduce la llave local (0 = Del proyecto, id de tarjeta) a la del Set de
 * plegadas —Docs la usa tal cual; #archivos la prefija por proyecto—; `doc(l)` da las opciones de filaDoc de cada hoja;
 * `ocultas` esconde todas las filas (la raiz de #archivos esta plegada). Devuelve las llaves locales usadas.
 */
export function filasDeExpediente(tb, p, ligas, { llave = k => k, plegada, alPlegar, doc = () => ({}), ocultas = false, sinTarjeta = false }) {
    const columnas = columnasDe(p);
    const delProyecto = ligas.filter(l => !l.TareaId);
    const cerrada = k => plegada(llave(k));
    if (delProyecto.length) { tb.appendChild(filaGrupo(null, 'Del proyecto', delProyecto.length, { plegada: cerrada(0), alPlegar: () => alPlegar(llave(0)), oculta: ocultas, sinTarjeta })); for (const l of delProyecto) tb.appendChild(filaDoc(l, { ...doc(l), oculta: ocultas || cerrada(0), sinTarjeta })); }
    const porTarjeta = new Map();
    for (const l of ligas.filter(l => l.TareaId)) { const k = Number(l.TareaId); if (!porTarjeta.has(k)) porTarjeta.set(k, []); porTarjeta.get(k).push(l); }
    const tarjetas = [...porTarjeta.keys()].sort((a, b) => { const ta = porId(estado.tareas, a), tb2 = porId(estado.tareas, b); return String(ta ? ta.Title : '').localeCompare(String(tb2 ? tb2.Title : '')) || a - b; });
    // v0.35.0 (Carlos, 14-sep; artifact 2Kb1WRx5, opcion B de seis): la carpeta y sus hojas forman un BLOQUE TINTADO con el
    // color de la tarjeta (tr.bloque + data-tono o is-p/c/r/h en el <tr>, que el CSS lee como --tono). Sustituye la cebra
    // is-par de v0.34.0: la banda separaba renglones sin decir de que tarjeta eran. «Del proyecto» y vacias no llevan tinte.
    const enBloque = (tr, t) => { if (!t) return tr; tr.classList.add('bloque'); const color = colorValido(t.Color); if (color) tr.dataset.tono = color; else tr.classList.add('is-' + claseDeColumna(t.Columna, columnas)); return tr; };
    for (const k of tarjetas) { const tt = porId(estado.tareas, k); tb.appendChild(enBloque(filaGrupo(k, tt ? tt.Title : `Tarjeta #${k}`, porTarjeta.get(k).length, { tarea: tt, columnas, plegada: cerrada(k), alPlegar: () => alPlegar(llave(k)), oculta: ocultas, sinTarjeta }), tt)); for (const l of porTarjeta.get(k)) tb.appendChild(enBloque(filaDoc(l, { ...doc(l), oculta: ocultas || cerrada(k), sinTarjeta }), tt)); }
    return { llaves: [...(delProyecto.length ? [0] : []), ...tarjetas] };
}

/**
 * v0.33.0: la raiz del arbol — el proyecto como carpeta abierta con el conteo («N de M» si hay filtro).
 * v0.36.0: con `alPlegar` es un NODO plegable (#archivos: una raiz por proyecto) con caret, el icono del equipo si viene, y
 * un boton aparte «Documentos» (`.ir-docs`, `alAbrir`) que abre la pestaña Documentos del proyecto.
 */
export function filaRaiz(titulo, n, total, { icono = null, plegada = false, alPlegar = null, alAbrir = null, sinTarjeta = false } = {}) {
    const tr = el('tr', 'raiz' + (plegada ? ' is-plegada' : '')); const td = el('td'); td.colSpan = columnasDocs(sinTarjeta).length;
    const cab = alPlegar ? el('button', 'cab nodo') : el('div', 'cab');
    if (alPlegar) { cab.type = 'button'; cab.setAttribute('aria-expanded', plegada ? 'false' : 'true'); cab.title = plegada ? 'Desplegar' : 'Plegar'; cab.addEventListener('click', alPlegar); cab.appendChild(iconoSvg(TRAZOS_CARET, 'caret')); }
    cab.appendChild(iconoSvg(TRAZOS_CARPETA, 'carpeta')); if (icono) cab.appendChild(icono); cab.appendChild(el('span', 'grupo-raiz', titulo));
    cab.appendChild(el('span', 'n', n === total ? `${total} ${total === 1 ? 'documento' : 'documentos'}` : `${n} de ${total}`));
    if (alAbrir) { const fila = el('div', 'raiz-fila'); fila.appendChild(cab); const b = boton('Documentos', 'mn-btn is-ghost is-sm ir-docs', alAbrir); b.title = 'Abrir Documentos del proyecto'; fila.appendChild(b); td.appendChild(fila); } else td.appendChild(cab);
    tr.appendChild(td); return tr;
}
/** v0.33.0: el nodo «N tarjetas abiertas sin documentos». Plegado por default: en estado.abiertasDocs la llave -1 significa ABIERTO (v0.52.0: como todas). */
function filaVacias(n, abierto, alPlegar) {
    const tr = el('tr', 'vacias' + (abierto ? '' : ' is-plegada')); const td = el('td'); td.colSpan = columnasDocs(true).length;
    const cab = el('button', 'cab nodo is-vacio'); cab.type = 'button'; cab.setAttribute('aria-expanded', abierto ? 'true' : 'false'); cab.title = abierto ? 'Plegar' : 'Desplegar'; cab.addEventListener('click', alPlegar);
    cab.appendChild(iconoSvg(TRAZOS_CARET, 'caret')); cab.appendChild(iconoSvg(TRAZOS_CARPETA, 'carpeta'));
    cab.appendChild(el('span', 'grupo-vacio', `${n} ${n === 1 ? 'tarjeta abierta sin documentos' : 'tarjetas abiertas sin documentos'}`));
    td.appendChild(cab); tr.appendChild(td); return tr;
}
/** v0.33.0: una tarjeta sin expediente, como hoja: carpeta vacia + cubeta + vencimiento + «Ligar aqui» (si puede). */
function filaVacia(t, columnas, alLigar) {
    const tr = el('tr', 'doc vacia'); tr.dataset.vacia = String(t.id); const td = el('td'); td.colSpan = columnasDocs(true).length;
    const caja = el('div', 'nombre'); const ic = iconoSvg(TRAZOS_CARPETA, 'carpeta'); const color = colorValido(t.Color); if (color) ic.dataset.tono = color; else ic.classList.add('is-' + claseDeColumna(t.Columna, columnas));
    caja.appendChild(ic); const tt = el('div', 't', t.Title); tt.title = t.Title; caja.appendChild(tt); caja.appendChild(el('span', 'cubeta-de', nombreColumnaEn(t.Columna, columnas)));
    const v = chipVence(t); if (v) caja.appendChild(v);
    if (alLigar) caja.appendChild(boton('Ligar aquí', 'mn-btn is-ghost is-sm', alLigar, { ligarA: String(t.id) }));
    td.appendChild(caja); tr.appendChild(td); return tr;
}

/**
 * Renglon de un documento. `puede` habilita el select de tarjeta y «Quitar» (Docs del proyecto); `enArchivos`
 * pinta la tarjeta como boton que la abre y marca el renglon con data-archivo (la E2E de #archivos lo cuenta).
 */
/** C-05 (mejorar-app archivos, 17-sep): el select de tarjeta de una liga — la columna «Tarjeta» de Docs o «Mover a» del menu «⋯»;
 *  un solo data-tarjeta-de y una sola confirmacion (reasignarLiga). */
function selectTarjeta(l, p, aria) {
    const sel = el('select'); sel.dataset.tarjetaDe = String(l.id); sel.setAttribute('aria-label', aria);
    opcionesTarjetas(sel, p); sel.value = l.TareaId ? String(l.TareaId) : '';
    sel.addEventListener('change', () => reasignarLiga(l, sel.value, sel));
    return sel;
}
/** U-02 (mejorar-app archivos, 17-sep): ¿el menu «⋯» recien abierto cabe por debajo de su «⋯»? En celular la barra de pestanas
 *  (#rail) es fija abajo y lo tapaba: el piso es el borde superior del rail cuando esta pegado abajo, o la ventana. Si tampoco
 *  cabe arriba, se queda abajo (el scroll lo alcanza). */
function cabeAbajo(menu) {
    const r = menu.getBoundingClientRect(); const rail = $('rail'); const rr = rail ? rail.getBoundingClientRect() : null;
    const piso = rr && rr.height && rr.top > 0 && rr.bottom >= window.innerHeight - 1 ? rr.top : window.innerHeight;
    return r.bottom <= piso || r.top - r.height < 0;
}
export function filaDoc(l, { p = null, puede = false, enArchivos = false, alTarjeta = null, oculta = false, sinTarjeta = false } = {}) {
    const tr = el('tr', 'doc'); tr.dataset.liga = String(l.id); if (enArchivos) tr.dataset.archivo = String(l.id);
    if (oculta) tr.hidden = true;   // v0.33.0: su carpeta esta plegada
    // Nombre (v0.19.0): icono + [emisor] + titulo humano (liga) + [rev]. La ruta ya no va debajo: vive en el title del
    // nombre (hover) y en «Copiar ruta» del menu «⋯»; el buscador la sigue leyendo (filtrarLigas). Un renglon por documento.
    const tdN = el('td', 'c-nombre'); const caja = el('div', 'nombre');
    caja.appendChild(iconoArchivo(l.Ruta || l.Title, l.Tipo));
    const nh = nombreDeLiga(l);   // la misma lectura con la que ordenarLigas ordena y filtrarLigas busca
    const ruta = l.Tipo === 'enlace' ? String(l.Url || '') : `${l.Unidad ? l.Unidad + '/' : ''}${l.Ruta || ''}`;
    const pista = nh.original === nh.titulo ? ruta : `${nh.original}\n${ruta}`;
    if (nh.emisor) caja.appendChild(el('span', 'emisor', nh.emisor));
    const t = el('div', 't');
    const href = hrefSeguro(l.Url, { tipo: l.Tipo, host: CONFIG.sharepointHost });   // v0.13.1 + S-15: solo http(s), y una liga de la casa solo a SharePoint
    const fuera = l.Tipo !== 'enlace' && l.Url && !href;   // S-15: alguien editó la Url desde SharePoint hacia otro sitio
    const pistaH = l.Tipo === 'enlace' && href ? `${pista}\n(abre ${new URL(href).hostname})` : fuera ? `${pista}\nLa dirección no es de SharePoint de MINSA: no se abre.` : pista;
    if (href) { const a = el('a', '', nh.titulo); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = pistaH; t.appendChild(a); } else { const s = el('span', '', nh.titulo); s.title = pistaH; t.appendChild(s); }
    caja.appendChild(t);
    if (nh.rev) caja.appendChild(el('span', 'mn-chip rev', nh.rev));
    tdN.appendChild(caja); tr.appendChild(tdN);
    // Fecha del documento (la del nombre); «—» si el nombre no la trae.
    const tdD = el('td', 'c-del'); const fd = el('span', nh.fecha ? '' : 'p', nh.fecha ? fechaCorta(nh.fecha) : '—'); if (nh.fecha) fd.title = 'Fecha del documento, según su nombre'; tdD.appendChild(fd); tr.appendChild(tdD);
    // Tipo de archivo: la misma clave que colorea el icono. v0.27.0 (Carlos, 14-sep): «etiqueta de expediente» —la SIGLA
    // (PDF · DOC · XLS · LOTE · URL) en una pestaña sólida con punta—; la etiqueta larga va en el title.
    const ta = tipoArchivo(l.Ruta || l.Title, l.Tipo);
    const tdT = el('td', 'c-tipo'); const bt = el('span', 'mn-chip tipo is-' + ta.clave, ta.sigla); bt.dataset.tipo = ta.clave; bt.title = ta.etiqueta; tdT.appendChild(bt); tr.appendChild(tdT);
    // Estado de la liga (archivado / en el buzon / enlace); el 404 del buzon lo reemplaza pintarDocs.
    const tdE = el('td', 'c-estado'); const est = el('span', 'estado'); est.appendChild(fuera ? chip('dirección externa', 'danger') : l.Tipo === 'buzon' ? chip('en el buzón', 'info') : l.Tipo === 'enlace' ? chip('enlace') : chip('archivado', 'ok')); tdE.appendChild(est); tr.appendChild(tdE);
    // Tarjeta: select (F1) si puede; boton que la abre en #archivos; texto en lectura. v0.45.0: con `sinTarjeta` la celda
    // no existe (la carpeta ya la nombra) y «Abrir tarjeta» va al menu «⋯».
    const tt = l.TareaId ? porId(estado.tareas, l.TareaId) : null;
    const tdC = sinTarjeta ? null : el('td', 'c-tarjeta');
    // v0.55.0: sin columna y con permiso, el select vive en el menu «⋯» (renglon «Mover a»); mismo data-tarjeta-de y misma confirmacion.
    let mover = null;
    if (sinTarjeta && puede && p && !enArchivos) {
        mover = el('label', 'menu-mover'); mover.appendChild(el('span', '', 'Mover a'));
        mover.appendChild(selectTarjeta(l, p, 'Mover el documento a otra tarjeta'));   // C-05
    }
    if (sinTarjeta) { /* nada */ }
    else if (puede && p) tdC.appendChild(selectTarjeta(l, p, 'Tarjeta de la liga'));   // C-05
    else if (l.TareaId && enArchivos) { const b = boton(tt ? tt.Title : `tarjeta #${l.TareaId}`, 'tarjeta-liga', tt && alTarjeta ? () => alTarjeta(tt.id) : null); b.title = tt ? tt.Title : ''; tdC.appendChild(b); }   // C-02: por id
    else { const s = el('span', 'tarjeta-liga' + (l.TareaId ? '' : ' sin'), tt ? tt.Title : l.TareaId ? `tarjeta #${l.TareaId}` : 'el proyecto entero'); if (tt) s.title = tt.Title; tdC.appendChild(s); }   // v0.29.0: pildora de ancho fijo con «…», como el boton
    if (tdC) tr.appendChild(tdC);
    // Quien y cuando (v0.29.0): ya no son columnas; van al title del renglon y como nota del menu «⋯».
    const quien = l.LigadoPor ? nombreDe(l.LigadoPor, estado.roles) : '', cuando = l._creado ? fechaCorta(l._creado) : '';
    const ligada = quien || cuando ? `Ligado por ${quien || '—'}${cuando ? ' · ' + cuando : ''}` : '';
    if (ligada) tr.title = ligada;
    // Acciones «⋯»: Abrir · Quitar (si puede) · Documentos del proyecto (en #archivos).
    const tdA = el('td', 'c-acc');
    const acciones = [];
    if (ligada) { const n = el('span', 'menu-nota quien'); n.appendChild(el('span', '', `Ligado por ${quien || '—'}`)); if (cuando) { const f = el('span', 'fecha', cuando); f.title = fechaHora(l._creado); n.appendChild(f); } acciones.push(n); }   // U-13: la fecha en su propia linea
    if (href) { const a = el('a', 'mn-btn is-ghost is-sm', 'Abrir'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; acciones.push(a); }
    if (ruta) acciones.push(boton(l.Tipo === 'enlace' ? 'Copiar dirección' : 'Copiar ruta', 'mn-btn is-ghost is-sm', () => copiarTexto(ruta), { copiar: String(l.id) }));   // v0.19.0: la ruta que salio de debajo del nombre
    if (sinTarjeta && tt && alTarjeta) acciones.push(boton('Abrir tarjeta', 'mn-btn is-ghost is-sm', () => alTarjeta(tt.id), { abrirTarjeta: String(tt.id) }));   // v0.45.0; v0.54.1: sin .tarjeta-liga, que le ponia la pildora encima del mn-btn; C-02 (17-sep): el id, y quien recibe resuelve al clic
    if (enArchivos && p) acciones.push(boton('Documentos del proyecto', 'mn-btn is-ghost is-sm', () => { const q = porId(estado.proyectos, p.id); if (q) irAHash(`#p/${q.Clave}/docs`); }, { irDocs: String(p.id) }));   // C-02: resuelve el proyecto por id al clic
    if (mover) acciones.push(mover);   // v0.55.0: antes de Quitar, que es lo destructivo
    if (puede) acciones.push(boton('Quitar', 'mn-btn is-ghost is-sm is-peligro', () => quitarLiga(porId(estado.ligas, l.id) || l), { quitar: String(l.id) }));
    if (acciones.length) {
        const d = el('details', 'fila-menu'); const s = el('summary', 'mn-btn is-ghost is-sm is-icono', '⋯'); s.setAttribute('aria-label', 'Acciones del documento'); s.title = 'Acciones'; d.appendChild(s);
        const m = el('div', 'menu'); for (const a of acciones) m.appendChild(a); d.appendChild(m); tdA.appendChild(d);
        d.addEventListener('toggle', () => { d.classList.remove('is-arriba'); if (!d.open) return; for (const o of document.querySelectorAll('.fila-menu[open]')) if (o !== d) o.open = false; if (!cabeAbajo(m)) d.classList.add('is-arriba'); });   // U-02: se mide sin la clase y se voltea si no cabe
    }
    tr.appendChild(tdA);
    return tr;
}

/** v0.19.0: «Copiar ruta» del menu «⋯». Sin portapapeles (http, permiso negado) la ruta se deja en el aviso, como compartirTarjeta. */
async function copiarTexto(texto) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texto); avisar('Ruta copiada.', 'ok'); return; } } catch (e) { /* cae al aviso */ }
    avisar(texto, 'ojo');
}

// ---------------------------------------------------------------- quitar / cambiar de tarjeta (F1)

/**
 * Quita una liga: borra su renglon de PROY_Ligas y deja «desligó» en la bitacora. El archivo no se
 * toca. Quien liga, desliga (PUEDE.ligar). Con `reemplazadaPor` (F2) no pregunta: es la segunda
 * mitad de «ligar el archivado».
 */
export async function quitarLiga(l, reemplazadaPor = null) {
    if (!PUEDE.ligar(estado.rol)) { avisar('Tu rol es de lectura: no puedes quitar ligas.', 'error'); return false; }
    if (!reemplazadaPor) {
        const { ok } = await confirmar({ titulo: 'Quitar la liga', ok: 'Quitar', texto: `«${l.Title}» deja de estar ligado a este proyecto. El archivo no se toca: sigue en la biblioteca${l.Tipo === 'buzon' ? ' (o donde lo haya acomodado la skill)' : ''}.` });
        if (!ok) return false;
    }
    try {
        await estado.cliente.borrarRenglon(estado.siteId, L.ligas, l.id, m => avisar(m, 'ojo'));
        estado.ligas = estado.ligas.filter(x => x.id !== l.id);
        if (!reemplazadaPor) avisar(`Liga «${l.Title}» quitada.`, 'ok');
        alCambiar();
        await registrarActividad('desligar', reemplazadaPor ? `reemplazó la liga «${l.Title.slice(0, 60)}» por «${reemplazadaPor.slice(0, 60)}»` : `desligó «${l.Title.slice(0, 80)}»`, l.ProyectoId, l.TareaId);
        alCambiar();
        return true;
    } catch (e) { avisar('No se pudo quitar la liga: ' + (e && e.message ? e.message : e), 'error'); return false; }
}

/** Cambia la tarjeta de una liga; vacio = del proyecto entero. */
async function reasignarLiga(liga, tareaId, sel = null) {
    const l = porId(estado.ligas, liga.id) || liga;   // resolver por id AL CLIC: un refresco reemplaza los objetos de estado
    if (!PUEDE.ligar(estado.rol)) { avisar('Tu rol es de lectura: no puedes cambiar ligas.', 'error'); return; }
    const nuevo = tareaId ? Number(tareaId) : null;
    const actual = l.TareaId ? Number(l.TareaId) : null;
    if (actual === nuevo) return;
    // v0.34.0 (Carlos, 14-sep): el select cambia con una rueda o un dedo de mas — antes de escribir se CONFIRMA, nombrando
    // de donde a donde; al cancelar el select vuelve a la tarjeta actual y nada sale hacia Graph.
    const t = nuevo ? porId(estado.tareas, nuevo) : null, de = actual ? porId(estado.tareas, actual) : null;
    const desde = de ? `de la tarjeta «${de.Title}»` : actual ? `de la tarjeta #${actual}` : 'del proyecto entero';
    const hacia = t ? `a la tarjeta «${t.Title}»` : 'al proyecto entero';
    const { ok } = await confirmar({ titulo: 'Mover el documento', ok: 'Mover', texto: `¿Mover «${l.Title}» ${desde} ${hacia}? El archivo no se toca: solo cambia a qué tarjeta está ligado.` });
    if (!ok) { if (sel) sel.value = actual ? String(actual) : ''; return; }
    try {
        const res = await estado.cliente.actualizarRenglon(estado.siteId, L.ligas, l.id, { TareaId: nuevo }, m => avisar(m, 'ojo'), l._etag);
        aplicar(l, { TareaId: nuevo }, res && res._etag);
        avisar(t ? `«${l.Title}» ahora es de la tarjeta «${t.Title}».` : `«${l.Title}» ahora es del proyecto entero.`, 'ok');
        alCambiar();
        await registrarActividad('ligar', t ? `pasó la liga «${l.Title.slice(0, 60)}» a «${t.Title.slice(0, 60)}»` : `dejó la liga «${l.Title.slice(0, 60)}» para el proyecto entero`, l.ProyectoId, nuevo);
        alCambiar();
    } catch (e) {
        if (esConflicto(e)) { avisar('Alguien cambió esa liga hace un momento: se releyó.', 'ojo'); await pedirRelectura(); return; }
        avisar('No se pudo cambiar la tarjeta de la liga: ' + (e && e.message ? e.message : e), 'error'); alCambiar();
    }
}

// ---------------------------------------------------------------- ligar

function opcionesTarjetas(sel, p) {
    opciones(sel, tareasDe(p, estado.tareas), t => t.id, t => t.Title.slice(0, 70), 'el proyecto entero');
}

/**
 * Abre «Ligar archivo». Sin argumentos es el boton de Docs (proyecto abierto). Desde la tarjeta
 * (F3) llega { proyecto, tareaId, alTerminar }; desde «Buscar el archivado» (F2) llega ademas
 * { texto, reemplaza }.
 */
export function abrirLigar(opts = {}) {
    const p = opts.proyectoId != null ? porId(estado.proyectos, opts.proyectoId) : proyectoAbierto(); const bib = p && bibliotecaDe(p);   // C-20 (v0.124.0): por id
    if (!p || !bib) return;
    if (!PUEDE.ligar(estado.rol)) { avisar('Tu rol es de lectura: no puedes ligar documentos.', 'error'); return; }
    const vieja = opts.reemplazaId != null ? porId(estado.ligas, opts.reemplazaId) : null;
    ctx = { proyectoId: p.id, tareaId: opts.tareaId ? Number(opts.tareaId) : null, reemplazaId: vieja ? vieja.id : null, alTerminar: opts.alTerminar || null };
    $('lgBiblioteca').textContent = `Busca en ${bib.nombre} (solo lectura; el buzón no aparece).`;
    $('lgNota').textContent = vieja ? `Al ligar el resultado se quita la liga vieja «${vieja.Title}».` : '';
    $('lgNota').classList.toggle('oculto', !vieja);
    $('lgTexto').value = opts.texto || ''; $('lgResultados').textContent = '';
    opcionesTarjetas($('lgTarea'), p);
    $('lgTarea').value = ctx.tareaId ? String(ctx.tareaId) : '';
    abrirDialogo('dlgLigar');
    if ($('lgTexto').value) buscarDocumento(); else $('lgTexto').focus();
}

async function buscarDocumento() {
    const p = proyectoCtx(); if (!p) { avisar('Ese proyecto ya no existe.', 'ojo'); return; } const bib = bibliotecaDe(p);
    const texto = $('lgTexto').value.trim();
    const cont = $('lgResultados'); cont.textContent = '';
    if (texto.length < 2) { avisar('Escribe al menos dos letras.', 'ojo'); return; }
    $('lgBuscar').disabled = true;
    try {
        const s = await sitioDe(bib);
        // A1: la ruta del script solo le sirve a gerencia; a los demas les toca pedirlo, no correrlo.
        if (!s.id) {
            avisar(PUEDE.proyecto(estado.rol)
                ? `Sin acceso a ${bib.nombre}: ${s.motivo}. Esta biblioteca no tiene el permiso de la app; se otorga con docs/otorgar-permiso-sitio-dispositivo.ps1 (y \`piloto: true\` en config.js).`
                : `Todavía no hay permiso sobre ${bib.nombre}. Pídelo a gerencia; mientras tanto puedes pegar un enlace.`, 'error');
            return;
        }
        const r = await estado.cliente.buscarEnDrive(s.id, texto, CONFIG.buzon, m => avisar(m, 'ojo'));
        if (!r.length) { cont.appendChild(el('p', 'vacio', 'Nada con ese nombre fuera del buzón.')); return; }
        for (const x of r.slice(0, 30)) {
            const fila = el('div', 'lg-resultado');
            fila.appendChild(iconoArchivo(x.nombre, null, 'sm'));   // v0.8.0
            const izq = el('div'); izq.appendChild(el('div', '', x.nombre)); izq.appendChild(el('div', 'p', `${x.rutaConocida === false ? '(carpeta: se resuelve al ligar)' : x.ruta} · ${fechaHora(x.modificado)}`));
            fila.appendChild(izq);
            fila.appendChild(boton('Ligar', 'mn-btn is-sm', () => ligarDocumento(x)));
            cont.appendChild(fila);
        }
    } catch (e) { avisar('No se pudo buscar: ' + (e && e.message ? e.message : e), 'error'); }
    finally { $('lgBuscar').disabled = false; }
}

async function ligarDocumento(x) {
    const p = proyectoCtx(); if (!p) { avisar('Ese proyecto ya no existe.', 'ojo'); return; } const bib = bibliotecaDe(p);
    if (!PUEDE.ligar(estado.rol)) { avisar('Tu rol es de lectura: no puedes ligar documentos.', 'error'); return; }
    if (estado.ligas.some(l => Number(l.ProyectoId) === p.id && l.DriveItemId === x.id)) { avisar('Ese archivo ya está ligado a este proyecto.', 'ojo'); return; }
    const tareaId = $('lgTarea').value ? Number($('lgTarea').value) : undefined;
    try {
        // La busqueda no garantiza la carpeta ni trae el GUID: se relee el elemento por id. Un 404 es
        // que ya no esta (se movio o borro desde que se busco); otro fallo liga con lo que trajo la
        // busqueda (peor ruta, misma liga).
        let item = x;
        try { const s = await sitioDe(bib); if (s.id) item = { ...x, ...(await estado.cliente.itemDeDrive(s.id, x.id, m => avisar(m, 'ojo'))) }; }
        catch (e) {
            if (e && e.status === 404) { avisar(`«${x.nombre}» ya no está donde la búsqueda lo vio (lo movieron o borraron); vuelve a buscar.`, 'error'); return; }
            console.warn('itemDeDrive:', e && e.message ? e.message : e);
        }
        // Con la carpeta real ya se sabe si es del buzon, que la busqueda solo excluye cuando Graph manda la ruta.
        if (item.ruta === CONFIG.buzon || String(item.ruta || '').startsWith(CONFIG.buzon + '/')) { avisar(`«${item.nombre}» está en el buzón ${CONFIG.buzon}: todavía no está archivado. Cuando la skill lo acomode vuelve a ligarlo; si es tuyo, súbelo como lote desde «Subir al buzón».`, 'ojo'); return; }
        await crearLigaArchivado(p, bib, item, tareaId);
        const vieja = ctx.reemplazaId != null ? porId(estado.ligas, ctx.reemplazaId) : null; const alTerminar = ctx.alTerminar; ctx.alTerminar = null;   // C-20: si alguien ya la quito, no hay que quitarla   // v0.70.0: que el `close` no vuelva por su cuenta
        cerrarDialogo('dlgLigar');
        avisar(vieja ? `«${item.nombre}» ligado en lugar de «${vieja.Title}».` : `«${item.nombre}» ligado.`, 'ok');
        alCambiar();
        await registrarActividad('ligar', `ligó «${item.nombre.slice(0, 80)}»`, p.id, tareaId);
        if (vieja) await quitarLiga(vieja, item.nombre);   // F2: la vieja se va en la misma operacion, sin preguntar
        alCambiar();
        if (alTerminar) alTerminar();
    } catch (e) { avisar('No se pudo ligar: ' + (e && e.message ? e.message : e), 'error'); }
}

/**
 * Crea el renglon de PROY_Ligas de tipo «archivado» para un elemento ya releido ({ id, nombre, ruta, url, guid }).
 * Lo comparten «Ligar» y el recibo de la skill (v0.108.0). Revienta con el motivo; no avisa.
 */
async function crearLigaArchivado(p, bib, item, tareaId) {
    const sitioUrl = `https://${CONFIG.sharepointHost}${bib.sitio}`;
    const corta = urlCortaDeGuid(sitioUrl, item.guid);
    const url = urlParaLiga(item.url, { sitioUrl, guid: item.guid });
    if (!url) throw new Error(`la liga web de «${item.nombre}» mide ${String(item.url || '').length} caracteres y no cabe en los ${TEXTO_MAX} de la lista; renómbralo más corto o pega un enlace.`);
    const campos = limpiar({ Title: item.nombre, ProyectoId: p.id, TareaId: tareaId, Tipo: 'archivado', Unidad: bib.clave, Ruta: item.ruta, Url: url, DriveItemId: item.id, LigadoPor: estado.cuenta.username });
    const largos = textosLargos(campos);
    if (largos.length) throw new Error(`${largos.join(', ')} pasa(n) de los ${TEXTO_MAX} caracteres que admite una columna de texto de SharePoint.`);
    let n;
    try { n = await estado.cliente.crearRenglon(estado.siteId, L.ligas, campos, m => avisar(m, 'ojo')); }
    catch (e) {
        // El 400 de SharePoint no dice cual campo. Si la Url iba en la forma larga de Graph y hay
        // forma corta, se reintenta UNA vez con ella (un 400 no escribe nada); si tambien falla,
        // el aviso lleva el largo de cada texto para que el siguiente diagnostico tenga datos.
        if (!(e && e.status === 400)) throw e;
        if (!corta || campos.Url === corta) throw new Error(`${e.message} · largos: ${resumenLargos(campos)}`);
        console.warn(`PROY_Ligas rechazó la Url larga (${campos.Url.length}); se reintenta con la corta (${corta.length}).`);
        campos.Url = corta;
        try { n = await estado.cliente.crearRenglon(estado.siteId, L.ligas, campos, m => avisar(m, 'ojo')); }
        catch (e2) { throw (e2 && e2.status === 400) ? new Error(`${e2.message} · largos: ${resumenLargos(campos)} (ya reintentado con la Url corta)`) : e2; }
    }
    estado.ligas.push(n);
    return n;
}

// ---------------------------------------------------------------- el recibo de la skill (v0.108.0)

// Una aplicacion por liga y por CARGA (`estado.cargadoEl`, como `estado.buzonExiste`): dos pintadas solapadas esperan la misma
// promesa, y la siguiente carga (refresco de 120 s o «Actualizar») vuelve a mirar — el recibo puede sincronizar DESPUES de que
// la carpeta del lote desaparecio.
const recibosEnCurso = new Map();

/**
 * La carpeta del lote ya no esta en el buzon: si la skill dejo su recibo en `_resueltos/`, la liga de tipo buzon se
 * REEMPLAZA por ligas a la ruta final de cada pieza —la renombrada, o el archivo que ya estaba cuando la pieza era
 * duplicado— y el recibo se borra. true si reemplazo; false si no hay recibo o algo no cuadra (queda el camino de antes,
 * «Buscar el archivado»). Idempotente: una pieza ya ligada no se liga dos veces, asi que un corte a medias se completa
 * en la siguiente carga. La liga vieja solo se quita cuando TODAS las piezas quedaron ligadas.
 */
function aplicarRecibo(p, bib, s, l) {
    const k = `${estado.cargadoEl}:${l.id}`;
    if (!recibosEnCurso.has(k)) {
        for (const vieja of recibosEnCurso.keys()) if (!vieja.startsWith(`${estado.cargadoEl}:`)) recibosEnCurso.delete(vieja);
        recibosEnCurso.set(k, aplicarReciboUnaVez(p, bib, s, l).catch(e => { console.warn('Docs: no se pudo aplicar el recibo.', e && e.message ? e.message : e); return false; }));
    }
    return recibosEnCurso.get(k);
}

async function aplicarReciboUnaVez(p, bib, s, l) {
    const ruta = rutaRecibo(l.Ruta, CONFIG.buzon);
    const leido = ruta ? await estado.cliente.leerJson(s.id, ruta) : null;
    if (!leido) return false;
    const v = validarRecibo(leido.datos, { lote: ruta.split('/').pop().replace(/\.json$/, ''), proyecto: p.Clave });
    if (!v.ok) { console.warn('Docs: recibo ignorado:', v.motivo); return false; }
    const tareaId = l.TareaId ? Number(l.TareaId) : undefined;
    const items = [];
    for (const x of v.rutas) {
        const item = await estado.cliente.itemPorRuta(s.id, x.ruta);
        // Una ruta que aun no existe es casi siempre la sincronizacion de OneDrive atrasada: se reintenta en la siguiente carga.
        if (!item || !item.esArchivo) { console.warn(`Docs: el recibo nombra ${x.ruta} y aun no esta en la biblioteca.`); return false; }
        items.push(item);
    }
    for (const item of items) {
        if (estado.ligas.some(k => Number(k.ProyectoId) === p.id && k.DriveItemId === item.id)) continue;
        await crearLigaArchivado(p, bib, item, tareaId);
        await registrarActividad('ligar', `ligó «${item.nombre.slice(0, 80)}» (archivado por la skill)`, p.id, tareaId);
    }
    const nombres = items.map(i => i.nombre).join(', ');
    await quitarLiga(l, nombres);
    try { await estado.cliente.borrarItemDrive(s.id, leido.id); } catch (e) { console.warn('Docs: el recibo no se pudo borrar (lo purga la skill).', e && e.message ? e.message : e); }
    avisar(`«${l.Title}» ya está archivado: la liga ahora apunta a ${items.length === 1 ? `«${items[0].nombre}»` : `${items.length} archivos`}.`, 'ok');
    alCambiar();
    return true;
}

// ---------------------------------------------------------------- pegar un enlace (F4)

/** Abre «Pegar un enlace». Sin argumentos es el boton de Docs; desde la tarjeta llega { proyecto, tareaId, alTerminar }. */
export function abrirEnlace(opts = {}) {
    const p = opts.proyectoId != null ? porId(estado.proyectos, opts.proyectoId) : proyectoAbierto(); if (!p) return;   // C-20 (v0.124.0): por id
    if (!puedeEnlazarEn(p)) { avisar(PUEDE.ligar(estado.rol) ? 'El proyecto está cerrado.' : 'Tu rol es de lectura: no puedes pegar enlaces.', 'error'); return; }
    ctx = { proyectoId: p.id, tareaId: opts.tareaId ? Number(opts.tareaId) : null, reemplazaId: null, alTerminar: opts.alTerminar || null };
    $('enTitulo').value = ''; $('enUrl').value = '';
    opcionesTarjetas($('enTarea'), p);
    $('enTarea').value = ctx.tareaId ? String(ctx.tareaId) : '';
    abrirDialogo('dlgEnlace');
    $('enTitulo').focus();
}

async function guardarEnlace(ev) {
    ev.preventDefault();
    const p = proyectoCtx(); if (!p) { avisar('Ese proyecto ya no existe.', 'ojo'); return; }
    if (!puedeEnlazarEn(p)) { avisar('Tu rol es de lectura: no puedes pegar enlaces.', 'error'); return; }
    const titulo = $('enTitulo').value.trim();
    if (!titulo) { avisar('Di qué es el enlace.', 'error'); $('enTitulo').focus(); return; }
    const v = validarUrl($('enUrl').value);
    if (!v.ok) { avisar('Enlace: ' + v.motivo, 'error'); $('enUrl').focus(); return; }
    if (estado.ligas.some(l => Number(l.ProyectoId) === p.id && l.Tipo === 'enlace' && l.Url === v.url)) { avisar('Ese enlace ya está en este proyecto.', 'ojo'); return; }
    const tareaId = $('enTarea').value ? Number($('enTarea').value) : undefined;
    const campos = limpiar({ Title: titulo, ProyectoId: p.id, TareaId: tareaId, Tipo: 'enlace', Url: v.url, LigadoPor: estado.cuenta.username });
    const largos = textosLargos(campos);
    if (largos.length) { avisar(`Enlace: ${largos.join(', ')} pasa(n) de los ${TEXTO_MAX} caracteres que admite la lista; acórtalo (un enlace de SharePoint se acorta con «Copiar vínculo»).`, 'error'); $('enUrl').focus(); return; }
    $('enGuardar').disabled = true;
    try {
        const n = await estado.cliente.crearRenglon(estado.siteId, L.ligas, campos, m => avisar(m, 'ojo'));
        estado.ligas.push(n);
        const alTerminar = ctx.alTerminar; ctx.alTerminar = null;
        cerrarDialogo('dlgEnlace');
        avisar(`Enlace «${titulo}» guardado.`, 'ok');
        alCambiar();
        await registrarActividad('ligar', `pegó el enlace «${titulo.slice(0, 80)}»`, p.id, tareaId);
        alCambiar();
        if (alTerminar) alTerminar();
    } catch (e) { avisar('No se pudo guardar el enlace: ' + (e && e.message ? e.message : e), 'error'); }
    finally { $('enGuardar').disabled = false; }
}

// ---------------------------------------------------------------- subir al buzon

/** Abre «Subir al buzon». Sin argumentos es el boton de Docs; desde la tarjeta (F3) llega { proyecto, tareaId, alTerminar }. */
export function abrirSubir(opts = {}) {
    const p = opts.proyectoId != null ? porId(estado.proyectos, opts.proyectoId) : proyectoAbierto(); const bib = p && bibliotecaDe(p);   // C-20 (v0.124.0): por id
    if (!p || !bib) return;
    if (!PUEDE.ligar(estado.rol)) { avisar('Tu rol es de lectura: no puedes subir documentos.', 'error'); return; }
    ctx = { proyectoId: p.id, tareaId: opts.tareaId ? Number(opts.tareaId) : null, reemplazaId: null, alTerminar: opts.alTerminar || null };
    $('sbBiblioteca').textContent = `Va a ${bib.nombre}/${CONFIG.buzon}/.`;
    $('sbConcepto').value = ''; $('sbArchivos').value = ''; $('sbProgreso').textContent = '';
    opcionesTarjetas($('sbTarea'), p);
    $('sbTarea').value = ctx.tareaId ? String(ctx.tareaId) : '';
    abrirDialogo('dlgSubir');
    $('sbConcepto').focus();
}

/**
 * Sube carpeta -> piezas -> `_lote.json` AL FINAL (igual que captura): el manifiesto es la prueba
 * de que el lote llego completo. Si algo falla a medias, se borra la carpeta y se avisa.
 */
async function subirAlBuzon(ev) {
    ev.preventDefault();
    const p = proyectoCtx(); if (!p) { avisar('Ese proyecto ya no existe.', 'ojo'); return; } const bib = bibliotecaDe(p);
    if (!PUEDE.ligar(estado.rol)) { avisar('Tu rol es de lectura: no puedes subir documentos.', 'error'); return; }
    const concepto = $('sbConcepto').value.trim();
    const archivos = [...$('sbArchivos').files];
    if (!concepto) { avisar('Di qué es lo que subes.', 'error'); $('sbConcepto').focus(); return; }
    if (!archivos.length) { avisar('Elige al menos un archivo.', 'error'); return; }
    if (archivos.some(a => a.name === NOMBRE_MANIFIESTO)) { avisar(`Un archivo no se puede llamar ${NOMBRE_MANIFIESTO}.`, 'error'); return; }
    // v0.13.1 (auditoria de seguridad): el nombre va en la RUTA de Graph; nada que suba de carpeta ni cambie de carpeta.
    const raro = archivos.find(a => !a.name || a.name === '.' || a.name === '..' || /[\\/]/.test(a.name));
    if (raro) { avisar(`El nombre «${raro.name}» no es válido para subirlo.`, 'error'); return; }
    const tareaId = $('sbTarea').value ? Number($('sbTarea').value) : undefined;
    const fecha = fechaMexico();
    const nombreCarpeta = nombreCarpetaLote(fecha, CONFIG.etiquetaLote, p.Clave, slug(concepto));
    // Destino que la app PROPONE en el _lote.json: la Carpeta declarada en el proyecto, o el default de
    // la biblioteca. La skill de archivar lo valida contra la biblioteca real y Carlos da el OK.
    const destino = String(p.Carpeta || bib.destinoLotes || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const manifiesto = construirManifiesto({ appVersion: VERSION, unidad: bib.clave, etiqueta: CONFIG.etiquetaLote, destino, fecha, concepto, archivos: archivos.map(a => a.name), proyecto: p.Clave, tarea: tareaId });
    const v = validarManifiesto(manifiesto);
    if (!v.ok) { avisar('El lote no es válido: ' + v.motivo, 'error'); return; }
    const largos0 = textosLargos({ Title: concepto, Ruta: `${CONFIG.buzon}/${nombreCarpeta}` });
    if (largos0.length) { avisar(`No se pudo subir: ${largos0.join(', ')} pasa(n) de los ${TEXTO_MAX} caracteres que admite la lista; acorta el concepto.`, 'error'); return; }
    const prog = t => { $('sbProgreso').textContent = t; };
    $('sbGuardar').disabled = true;
    let carpeta = null; let s = null;
    try {
        s = await sitioDe(bib);
        if (!s.id) throw new Error(`sin acceso a ${bib.nombre}: ${s.motivo}`);
        prog('Creando la carpeta del lote…');
        carpeta = await estado.cliente.crearCarpeta(s.id, CONFIG.buzon, nombreCarpeta, m => prog(m));
        const ruta = `${CONFIG.buzon}/${carpeta.nombreReal}`;
        for (const [i, a] of archivos.entries()) {
            prog(`Subiendo ${i + 1} de ${archivos.length}: ${a.name}`);
            await estado.cliente.subirPieza(s.id, ruta, a.name, await a.arrayBuffer(), a.type || 'application/octet-stream', m => prog(m));
        }
        prog('Cerrando el lote…');
        await estado.cliente.subirPieza(s.id, ruta, NOMBRE_MANIFIESTO, bytesDelManifiesto(manifiesto), 'application/json', m => prog(m));
        const campos = limpiar({ Title: concepto, ProyectoId: p.id, TareaId: tareaId, Tipo: 'buzon', Unidad: bib.clave, Ruta: ruta, DriveItemId: carpeta.id, LigadoPor: estado.cuenta.username });
        const largos = textosLargos(campos);
        if (largos.length) throw new Error(`${largos.join(', ')} pasa(n) de los ${TEXTO_MAX} caracteres que admite la lista`);
        const n = await estado.cliente.crearRenglon(estado.siteId, L.ligas, campos, m => prog(m));
        estado.ligas.push(n); estado.buzonExiste[ruta] = true;
        const alTerminar = ctx.alTerminar; ctx.alTerminar = null;
        cerrarDialogo('dlgSubir');
        avisar(`Lote «${concepto}» en el buzón de ${bib.nombre} (${archivos.length} archivo(s)).`, 'ok');
        alCambiar();
        await registrarActividad('subir', `subió «${concepto.slice(0, 80)}» al buzón (${archivos.length} archivo(s))`, p.id, tareaId);
        alCambiar();
        if (alTerminar) alTerminar();
    } catch (e) {
        if (carpeta && s && s.id) { try { await estado.cliente.borrarItemDrive(s.id, carpeta.id); prog('Lote a medias borrado.'); } catch (_) { prog('Quedó una carpeta a medias en el buzón; la skill la trata como lote incompleto.'); } }
        avisar('No se pudo subir: ' + (e && e.message ? e.message : e), 'error');
    } finally { $('sbGuardar').disabled = false; }
}

// ---------------------------------------------------------------- enganche

export function engancharDocs() {
    $('lgCerrar').addEventListener('click', () => { cerrarDialogo('dlgLigar'); volverSiCancela(); });
    $('lgBuscar').addEventListener('click', buscarDocumento);
    $('lgTexto').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscarDocumento(); } });
    $('sbCancelar').addEventListener('click', () => { cerrarDialogo('dlgSubir'); volverSiCancela(); });
    $('formSubir').addEventListener('submit', subirAlBuzon);
    // v0.17.0: buscador de la pestaña; el proyecto abierto se repinta al teclear.
    // C-07 (17-sep): con retardo — el arbol se reconstruye entero por tecla; `change` (Enter, salir del campo) pinta al instante.
    const buscar = conRetardo(() => { estado.buscaDocs = $('docsBusca').value; if (proyectoAbierto()) pintarDocs(proyectoAbierto()); });
    $('docsBusca').addEventListener('input', buscar); $('docsBusca').addEventListener('change', buscar.ahora);
    // Un clic fuera cierra el menu «⋯» abierto.
    document.addEventListener('click', e => { for (const o of document.querySelectorAll('.fila-menu[open]')) if (!o.contains(e.target)) o.open = false; });
    // U-07 (17-sep): Esc cierra el menu «⋯» abierto y devuelve el foco a su «⋯», como los otros dos menus (tablero.js #filtroChips, app.js #selProyecto).
    document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; const o = document.querySelector('.fila-menu[open]'); if (o) { o.open = false; o.querySelector('summary').focus(); } });
    $('enCancelar').addEventListener('click', () => { cerrarDialogo('dlgEnlace'); volverSiCancela(); });
    $('formEnlace').addEventListener('submit', guardarEnlace);
    // v0.70.0: Esc y Atras (B8) no pasan por los botones; el `close` del <dialog> vuelve a la tarjeta igual (no llega bajo tiempo virtual: la E2E prueba el boton)
    for (const id of ['dlgLigar', 'dlgSubir', 'dlgEnlace']) $(id).addEventListener('close', volverSiCancela);
}
