// Tablero de un proyecto: sus cubetas (columnas), lista, «Mis tareas», la tarjeta (ver / mover /
// editar / borrar), la tarea nueva y el editor de cubetas. El movimiento canonico es el boton
// «Mover a…» (default del plan); nada de drag & drop en el piloto. v0.3.0 sumo el filtro y el orden
// dentro del proyecto (F9/F10), Subir/Bajar y mover de proyecto (F11), las pestanas de columna en
// celular (U5) y el 412 de If-Match (T1): se relee, no se pisa. v0.11.0 (Carlos, 12-sep): las
// cubetas se renombran, agregan y quitan POR PROYECTO (PROY_Proyectos.Columnas); el atajo
// «→ siguiente» de la cara de la tarjeta se quito, y «Origen en la KB» ya no se ensena ni se pide.

import { CONFIG } from './config.js';
import { sellarAsignadoPor, PUEDE, ordenar, tareasDe, diasQuieta, rotuloQuieta, camposDeMovimiento, nombreDe, nombreCorto, diasPara, estadoVence, semaforo, vencidasEn, filtrarTareas, ordenarLista, reordenar, sinAcentos, columnasDe, normalizarColumnas, nombreColumnaEn, claseDeColumna, HECHO, MAX_COLUMNAS, MAX_NOMBRE_COLUMNA, COLORES, colorValido, hrefSeguro, delegadas, misAbiertas, porVence, claseVence } from './reglas.js';
import { $, L, estado, limpiarFiltroTareas, PESTANAS_CON_FILTRO, el, boton, chip, chipVence, avisar, abrirDialogo, cerrarDialogo, confirmar, fechaCorta, fechaHora, aIsoDia, diaInput, fechaInput, atajosFecha, opciones, limpiar, porId, proyectoAbierto, registrarActividad, hashDe, fijarHash, irAHash, ligaDeTarjeta, notasDe, aplicarVivo, agregarSinDuplicar, fusionarActividad, pedirRelectura, equipoDe, iconoEquipo, iconoArchivo, textoConMenciones, insignia, TRAZOS, iconoSvg, puedeBorrarComentario, borrarComentario, columnasDeTarea, notasPorTarea, ligasPorTarea, buzonPorTarea, mesDia, personasActivas, contadorTexto, mayusculasEnVivo } from './comun.js';
import { abrirPartida } from './capital.js';   // v0.103.0: «Nueva partida» desde la pestaña Capital del proyecto
import { abrirLigar, abrirSubir, abrirEnlace, quitarLiga, puedeLigarEn, puedeEnlazarEn } from './docs.js';
import { esConflicto } from './graph.js';
import { engancharSelectorMenciones } from './chat.js';

let alCambiar = () => {};   // app.js la pone: repinta la pantalla actual tras una escritura
export function alCambiarTareas(fn) { alCambiar = fn; }

/** Nombre de la cubeta de una tarjeta segun SU proyecto (v0.11.0: ya no hay una lista global). */
const nombreColumna = t => nombreColumnaEn(t.Columna, columnasDeTarea(t));
/** Chip de cubeta: verde hecho, azul en proceso, sin color la primera. */
const chipColumna = t => chip(nombreColumna(t), t.Columna === HECHO ? 'ok' : claseDeColumna(t.Columna, columnasDeTarea(t)) === 'p' ? null : 'info');
/**
 * Las cubetas de un proyecto MAS las huerfanas: una tarjeta cuya cubeta alguien quito (o que llego de
 * otro proyecto con una clave que aqui no existe) no desaparece: se pinta en una columna de nombre
 * igual a su clave, marcada, para que alguien la mueva. La E2E lo prueba.
 */
function columnasConHuerfanas(p, ts) {
    const cols = columnasDe(p);
    for (const t of ts) if (!cols.some(c => c.clave === t.Columna)) cols.push({ clave: t.Columna, nombre: t.Columna, huerfana: true });
    return cols;
}
const personas = personasActivas;   // C-06 (17-sep): la copia vive en comun.js

// ---------------------------------------------------------------- tarjeta (elemento)

// ---------------------------------------------------------------- selector de color (v0.12.0)
//
// Una fila de circulos (sin color + los 8 de COLORES) con aria-pressed; el valor vive en cont.dataset.valor.
// Sirve para la cubeta (editor de cubetas) y para la tarjeta (editar / nueva). `alElegir` es opcional.
// Accesible como grupo de radios (revisor 12-sep): role=radio + aria-checked, UN solo tab por fila (roving tabindex)
// y flechas para moverse; asi «Cubetas» con 5 filas no son 45 tabulaciones hasta «Guardar».
export function selectorTonos(cont, actual, alElegir, rotulo = 'Color') {
    cont.textContent = ''; cont.dataset.valor = colorValido(actual); cont.setAttribute('role', 'radiogroup');
    const opciones = [{ clave: '', nombre: 'Sin color' }, ...COLORES];
    const marcar = clave => { cont.dataset.valor = clave; for (const x of cont.children) { const on = x.dataset.tono === clave; x.setAttribute('aria-checked', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; } };
    for (const c of opciones) {
        const b = el('button'); b.type = 'button'; b.dataset.tono = c.clave; b.title = c.nombre; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', `${rotulo}: ${c.nombre}`);
        b.addEventListener('click', () => { marcar(c.clave); if (alElegir) alElegir(c.clave); });
        b.addEventListener('keydown', ev => {
            const d = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0; if (!d) return;
            ev.preventDefault(); const i = (opciones.findIndex(o => o.clave === c.clave) + d + opciones.length) % opciones.length;
            marcar(opciones[i].clave); cont.children[i].focus(); if (alElegir) alElegir(opciones[i].clave);
        });
        cont.appendChild(b);
    }
    marcar(cont.dataset.valor);
    return cont;
}

/* v0.50.0 (Carlos, 15-sep; artifact 1mTr2BGa, opcion 3A): la prioridad se elige en un SEGMENTADO con barras de senal —una
   (baja) · dos (normal) · tres (alta)— en vez del <select>, que no admite
   icono ni color por opcion. El valor vive en un <input type="hidden"> con el id de siempre (ftPrioridad / ntPrioridad): quien
   lee $(id).value no cambia, y `poner()` de la E2E (value + change) tambien lo mueve, porque el segmento escucha 'change'. */
const PRIORIDADES = [['baja', 'Baja', 'Puede esperar'], ['normal', 'Normal', 'Lo de siempre'], ['alta', 'Alta', 'Va primero']];
export function barrasPrioridad(v) {
    const n = v === 'alta' ? 3 : v === 'baja' ? 1 : 2;
    const s = el('span', 'barras is-' + (v === 'alta' ? 'alta' : v === 'baja' ? 'baja' : 'normal')); s.setAttribute('aria-hidden', 'true');
    for (let i = 1; i <= 3; i++) s.appendChild(el('i', i <= n ? 'on' : ''));
    return s;
}
/* v0.60.0 (Carlos, 15-sep; artifact 2dJkkWxg): la prioridad va en TODAS las tarjetas —tablero, Lista («P») y Mis tareas— como las
   mismas barras del segmentado, en SEMAFORO (rojo alta · ambar normal · verde baja) y a la DERECHA del titulo. Sustituye al punto
   azul de v0.20.0, que solo marcaba la alta. Con rol img: la E2E y el lector de pantalla leen «Prioridad alta/normal/baja». */
export function marcaPrioridad(v) {
    const s = barrasPrioridad(v); s.removeAttribute('aria-hidden'); s.setAttribute('role', 'img');
    s.setAttribute('aria-label', 'Prioridad ' + (v === 'alta' ? 'alta' : v === 'baja' ? 'baja' : 'normal'));
    return s;
}
export function selectorPrioridad(seg) {
    const inp = $(seg.dataset.prioDe); seg.textContent = ''; seg.setAttribute('role', 'radiogroup');
    const marcar = v => { for (const b of seg.children) { const on = b.dataset.prio === v; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; } };
    for (const [clave, nombre, ayuda] of PRIORIDADES) {
        const b = el('button'); b.type = 'button'; b.dataset.prio = clave; b.title = ayuda; b.setAttribute('role', 'radio');
        b.appendChild(barrasPrioridad(clave)); b.appendChild(el('span', '', nombre));
        b.addEventListener('click', () => { inp.value = clave; marcar(clave); });
        b.addEventListener('keydown', ev => {
            const d = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0; if (!d) return;
            ev.preventDefault(); const i = (PRIORIDADES.findIndex(p => p[0] === clave) + d + 3) % 3;
            inp.value = PRIORIDADES[i][0]; marcar(inp.value); seg.children[i].focus();
        });
        seg.appendChild(b);
    }
    inp.addEventListener('change', () => marcar(inp.value || 'normal'));
    marcar(inp.value || 'normal');
    return seg;
}
/** Fija el valor y repinta el segmento (asignar .value a un hidden no dispara nada). */
function ponerPrioridad(id, v) { const inp = $(id); inp.value = v || 'normal'; inp.dispatchEvent(new Event('change')); }

/** v0.50.0 (2B): abre / cierra el menu de cubetas colgado del renglon «Cubeta» y mantiene aria-expanded en su boton. */
function alternarMover(mostrar) {
    const mv = $('tMover'); mv.classList.toggle('oculto', !mostrar);
    const abre = document.querySelector('#tChips [data-abre-mover]'); if (abre) abre.setAttribute('aria-expanded', mostrar ? 'true' : 'false');
}

export function tarjeta(t, conProyecto = false) {
    // D4 (v0.6.0): la prioridad alta es un atributo estable (clase .alta); el chip rojo se queda solo
    // para «venció». v0.20.0 (iteracion 2): el filete izquierdo pasa a ser SEMAFORO de fecha
    // (.is-vencida / .is-pronto / .is-hecha; gris en tiempo) y la prioridad alta se pinta como un
    // PUNTO de marca junto al titulo — el borde ya no puede decir dos cosas.
    const sem = semaforo(t, CONFIG.semaforoDias);
    const b = el('button', 'tarjeta' + (t.Prioridad === 'alta' ? ' alta' : '') + (sem ? ' is-' + sem : '')); b.type = 'button'; b.dataset.t = String(t.id);
    if (colorValido(t.Color)) b.dataset.tono = colorValido(t.Color);   // v0.12.0: el color elegido tiñe la tarjeta
    // En compacto el titulo va a una linea con puntos suspensivos: el completo vive en el title.
    const compacto = !conProyecto && estado.densidad === 'compacto';
    const enTitle = [t.Prioridad === 'alta' ? 'Prioridad alta' : ''];   // lo que el compacto esconde se suma abajo y va al hover
    const tt = el('span', 't');
    tt.appendChild(marcaPrioridad(t.Prioridad));   // v0.60.0: flotan a la derecha del titulo (estilo.css)
    tt.appendChild(document.createTextNode(t.Title));
    b.appendChild(tt);
    const f = el('span', 'f');
    const quien = t.Asignado ? nombreCorto(t.Asignado, estado.roles) : 'sin asignar';
    f.appendChild(el('span', 'nom', quien)); enTitle.push(quien);
    if (conProyecto) { const p = porId(estado.proyectos, t.ProyectoId); if (p) f.appendChild(chip(p.Clave)); }
    if (conProyecto) f.appendChild(chipColumna(t));
    const v = chipVence(t);
    if (v) {
        v.classList.add('vence');   // .vence: lo unico que el compacto no esconde
        // Compacto: el chip pierde el año y el verbo («12/09», «hoy»): el color del chip y el filete ya dicen si
        // venció — con «venció 12/09/2026» entero el titulo quedaba en cuatro letras a 1366 (medido, revisor).
        if (compacto) { enTitle.push(v.textContent); v.textContent = v.textContent.replace(/\/\d{4}$/, '').replace(/^venci[oó] |^vence /, ''); }
        f.appendChild(v);
    }
    // v0.13.1: indices por tarjeta calculados una vez por pintada (antes cada tarjeta recorria toda la actividad y todas las ligas).
    if (buzonPorTarea().get(t.id)) { f.appendChild(chip('en el buzón', 'info')); enTitle.push('en el buzón'); }
    { const q = diasQuieta(t, CONFIG.sinMovimientoDias, new Date(), columnasDeTarea); if (q !== null) { const s = rotuloQuieta(q); f.appendChild(el('span', 'stale', '· ' + s)); enTitle.push(s); } }   // C-15 (v0.94.0)
    // v0.8.0: insignias de la cara (Trello): cuantas notas y cuantos documentos trae, sin abrirla.
    const nNotas = notasPorTarea().get(t.id) || 0, nDocs = ligasPorTarea().get(t.id) || 0;
    if (nNotas) { const s = `${nNotas} nota${nNotas === 1 ? '' : 's'}`; f.appendChild(insignia(TRAZOS.burbuja, nNotas, s, 'is-notas')); enTitle.push(s); }
    if (nDocs) { const s = `${nDocs} documento${nDocs === 1 ? '' : 's'}`; f.appendChild(insignia(TRAZOS.clip, nDocs, s, 'is-docs')); enTitle.push(s); }
    b.appendChild(f);
    // Compacto: el hover trae el titulo completo y todo lo que la linea esconde (spec: «quedan en el hover y en la ficha»).
    b.title = (compacto ? [t.Title, ...enTitle] : enTitle.slice(0, 1)).filter(Boolean).join(' · ');
    b.addEventListener('click', () => abrirTarjeta(t.id));
    // La caja se conserva (la rejilla de Mis tareas y la E2E la conocen); desde v0.11.0 solo trae la
    // tarjeta: el atajo «→ siguiente» (U7) se quito a pedido de Carlos — mover es abrir y «Mover a…».
    const caja = el('div', 'tarjeta-caja'); caja.appendChild(b);
    return caja;
}

// ---------------------------------------------------------------- filtro dentro del proyecto (F9)

const CHIPS_FILTRO = [['alta', 'solo alta'], ['vencidas', 'solo vencidas']];   // C7 (v0.6.0); v0.30.0: «sin dueño» vive en el menu «Quién»
/**
 * Filtro de tarjetas dentro del proyecto. v0.30.0 (Carlos, 14-sep; artifact YLnjhT3a, opcion F3): las personas
 * ya no son una pildora cada una — viven en un MENU PLEGABLE «Quién» (details) con casillas y el conteo de
 * tarjetas de cada quien, que permite marcar VARIAS (f.quien es array) y trae abajo «Sin dueño» y «Quitar».
 * El summary lleva el avatar de la primera marcada y cuantas hay. Fuera del menu quedan «solo alta»,
 * «solo vencidas» y «× limpiar»; el texto vive en #filtroTexto. Como se repinta entero con cada cambio,
 * el menu conserva su estado abierto/cerrado entre repintados.
 */
/** C-20 (v0.124.0): los handlers del tablero, la lista y el filtro resuelven el proyecto abierto AL CLIC (regla v0.4.0), no el de la pintada. */
const conAbierto = fn => () => { const p = proyectoAbierto(); if (p) fn(p); };
export function pintarFiltroTareas(proyecto) {
    const f = estado.filtroTareas; const c = $('filtroChips');
    const abierto = !!c.querySelector('.menu-quien[open]'); c.textContent = '';
    if (!Array.isArray(f.quien)) f.quien = f.quien ? [String(f.quien).toLowerCase()] : [];
    const ts = tareasDe(proyecto, estado.tareas);
    // Conteo por persona (todas sus tarjetas, hechas incluidas: es lo que su casilla deja pasar); el de «sin dueño» solo
    // las huerfanas ABIERTAS, que es lo que filtra esa casilla (reglas.js: huerfana).
    const conteo = {}; for (const t of ts) { const q = String(t.Asignado || '').toLowerCase(); if (q || t.Columna !== 'hecho') conteo[q] = (conteo[q] || 0) + 1; }
    const quienes = Object.keys(conteo).filter(Boolean).sort();
    const repintar = () => { conAbierto(pintarFiltroTareas)(); pintarSoloTareas(); };
    const chipBtn = (texto, on, alClic, datos) => {
        const b = boton(texto, on ? 'is-on' : '', () => { alClic(); repintar(); }, datos);
        b.setAttribute('aria-pressed', on ? 'true' : 'false'); c.appendChild(b);
    };
    // ---- el menu «Quién»
    const menu = el('details', 'menu-quien'); menu.open = abierto; menu.dataset.menu = 'quien';
    const sum = el('summary'); sum.className = 'mn-btn is-sm' + (f.quien.length || f.sinDueno ? ' is-on' : '');
    const etiqueta = q => nombreCorto(q, estado.roles, quienes);   // dos «Ana» en el menu: nombre completo (C-09, v0.133.0: la regla vive en reglas.js)
    // Una sola persona (sin «sin dueño») → su nombre; cualquier otra combinacion → «Quién» + cuantas marcas.
    const marcas = f.quien.length + (f.sinDueno ? 1 : 0);
    sum.appendChild(el('span', 'nom', marcas === 1 && f.quien.length === 1 ? etiqueta(f.quien[0]) : 'Quién'));
    if (marcas && !(marcas === 1 && f.quien.length === 1)) sum.appendChild(el('span', 'n', String(marcas)));
    sum.appendChild(iconoSvg(['M6 9l6 6 6-6']));
    sum.title = 'Filtrar por persona'; menu.appendChild(sum);
    const caja = el('div', 'caja'); caja.setAttribute('role', 'group'); caja.setAttribute('aria-label', 'Personas con tarjetas en este frente');
    caja.appendChild(el('span', 'mn-label tit', 'Con tarjetas en este frente'));
    // Cada cambio repinta la fila entera (el input enfocado se destruye): la casilla se vuelve a enfocar por su data-*
    // para que el teclado no caiga al inicio del documento (revisor, 14-sep).
    const casilla = (texto, on, alCambiar, datos) => {
        const l = el('label'); for (const k in datos) l.dataset[k] = datos[k];
        const sel = Object.keys(datos).map(k => '[data-' + k + '="' + datos[k] + '"]').join('');
        const i = el('input'); i.type = 'checkbox'; i.checked = on; i.addEventListener('change', () => { alCambiar(i.checked); repintar(); const n = c.querySelector('.menu-quien label' + sel + ' input'); if (n) n.focus({ preventScroll: true }); });
        l.appendChild(i); l.appendChild(el('span', 'nom', texto)); return l;
    };
    for (const [i, q] of quienes.entries()) {
        const l = casilla(etiqueta(q), f.quien.includes(q), on => { f.quien = on ? [...f.quien, q] : f.quien.filter(x => x !== q); }, { quien: q });
        l.appendChild(el('span', 'n mn-mono', String(conteo[q]))); caja.appendChild(l);
    }
    if (!quienes.length) caja.appendChild(el('span', 'vacio', 'Ninguna tarjeta asignada.'));
    caja.appendChild(el('hr'));
    const lsd = casilla('Sin dueño', !!f.sinDueno, on => { f.sinDueno = on; }, { filtro: 'sinDueno' });
    if (conteo['']) lsd.appendChild(el('span', 'n mn-mono', String(conteo['']))); caja.appendChild(lsd);
    if (f.quien.length || f.sinDueno) caja.appendChild(boton('Quitar el filtro de persona', 'limp', () => { f.quien = []; f.sinDueno = false; repintar(); }, { filtro: 'quitarQuien' }));
    menu.appendChild(caja); c.appendChild(menu);
    // ---- los fijos. R-01 (27-sep, Jira «Only My Issues»): «mías» primero, de un toque; es el mismo filtro que marcar solo mi casilla en «Quién».
    const yo = String(estado.cuenta && estado.cuenta.username || '').toLowerCase();
    const soloYo = f.quien.length === 1 && f.quien[0] === yo && !f.sinDueno;
    if (yo) chipBtn('mías', soloYo, () => { f.quien = soloYo ? [] : [yo]; f.sinDueno = false; }, { filtro: 'mias' });
    for (const [k, texto] of CHIPS_FILTRO) chipBtn(texto, !!f[k], () => { f[k] = !f[k]; }, { filtro: k });
    const activo = !!(f.quien.length || f.alta || f.vencidas || f.sinDueno || f.texto);
    if (activo) chipBtn('× limpiar', false, () => limpiarFiltroTareas(), { filtro: 'limpiar' });   // C-13 (v0.95.0)
}
/** B1: «Filtrar» dice cuantos filtros hay puestos; sin eso, plegarlos los esconde en silencio.
 *  v0.6.0: vive aqui (no en app.js) para repintarse con CADA cambio de filtro — un chip pulsado
 *  dejaba el boton en «Filtrar» hasta el siguiente repintado de la pantalla (lo cazo la E2E de C7). */
export function pintarBotonFiltros() {
    const f = estado.filtroTareas;
    const n = [f.quien && f.quien.length, f.alta, f.vencidas, f.sinDueno, f.texto].filter(Boolean).length;   // v0.30.0: quien es array
    const b = $('btnFiltros');
    b.textContent = n ? `Filtrar · ${n}` : 'Filtrar';
    b.classList.toggle('is-on', !!n || estado.filtrosAbiertos);
    b.setAttribute('aria-expanded', estado.filtrosAbiertos ? 'true' : 'false');
    b.classList.toggle('oculto', !PESTANAS_CON_FILTRO.includes(estado.tab));   // C-18 (v0.123.0): la misma lista que la barra (faltaba roadmap)
    $('densidad').classList.toggle('oculto', estado.tab !== 'tablero');   // v0.20.0: el conmutador solo tiene sentido en el tablero
    // U-01 (17-sep): con filtro puesto, el propio tablero/lista lo dice — a 390 «Filtrar · N» vive al final de la fila de pestañas, fuera de la vista.
    const av = $('filtroAviso'); av.textContent = '';
    const partes = [];
    if (f.quien && f.quien.length) partes.push(f.quien.map(q => nombreCorto(q, estado.roles)).join(', '));
    if (f.sinDueno) partes.push('sin dueño'); if (f.alta) partes.push('solo alta'); if (f.vencidas) partes.push('solo vencidas');
    if (f.texto) partes.push(`«${f.texto}»`);
    const mostrar = n > 0 && ['tablero', 'lista'].includes(estado.tab);
    av.classList.toggle('oculto', !mostrar);
    if (mostrar) {
        av.appendChild(el('span', 'txt', 'Filtrado: ' + partes.join(' · ')));
        av.appendChild(boton('× limpiar', 'mn-btn is-ghost is-sm', () => { limpiarFiltroTareas(); if (proyectoAbierto()) pintarFiltroTareas(proyectoAbierto()); pintarSoloTareas(); }, { filtro: 'limpiarAviso' }));
    }
}

// ---------------------------------------------------------------- densidad del tablero (v0.20.0, iteracion 2)

const LLAVE_DENSIDAD = 'densidad';
/** Cómodo / Compacto: se lee del dispositivo al arrancar (localStorage; sin él, cómodo) y se guarda al cambiar. */
function leerDensidad() {
    let v = ''; try { v = localStorage.getItem(LLAVE_DENSIDAD) || ''; } catch (_) {}
    estado.densidad = v === 'compacto' ? 'compacto' : 'comodo';
}
function fijarDensidad(d) {
    estado.densidad = d === 'compacto' ? 'compacto' : 'comodo';
    try { localStorage.setItem(LLAVE_DENSIDAD, estado.densidad); } catch (_) {}
    pintarSoloTareas();
}
/** Marca el botón activo del conmutador (aria-pressed); la clase del tablero la pone pintarTablero. */
function pintarDensidad() {
    for (const b of document.querySelectorAll('#densidad button')) b.setAttribute('aria-pressed', b.dataset.densidad === estado.densidad ? 'true' : 'false');
}
/** Repinta solo el tablero o la lista (no la pantalla entera: el foco del cuadro de texto se queda). */
function pintarSoloTareas() {
    const p = proyectoAbierto(); if (!p) return;
    pintarBotonFiltros();
    if (estado.tab === 'tablero') pintarTablero(p); else if (estado.tab === 'lista') pintarLista(p);
}
const tareasVisibles = proyecto => filtrarTareas(tareasDe(proyecto, estado.tareas), estado.filtroTareas);

// ---------------------------------------------------------------- tablero y lista

const HECHO_VISIBLES = 5;
/** U-04: la primera cubeta no-Hecho con tarjetas vencidas; si no, la primera no-Hecho con tarjetas; si no, la primera. */
export function primeraCubetaConTarjetas(columnas, ts) {
    const abiertas = columnas.filter(c => c.clave !== HECHO);
    const con = f => abiertas.find(c => f(ts.filter(t => t.Columna === c.clave)));
    const c = con(cs => vencidasEn(cs) > 0) || con(cs => cs.length > 0) || columnas[0];
    return c.clave;
}
export function pintarTablero(proyecto) {
    const cont = $('tableroCols'); cont.textContent = '';
    const ts = tareasVisibles(proyecto);
    const filtrado = ts.length !== tareasDe(proyecto, estado.tareas).length;
    // v0.11.0: las cubetas son las del proyecto (mas las huerfanas, si una tarjeta quedo en una que ya no existe).
    const columnas = columnasConHuerfanas(proyecto, tareasDe(proyecto, estado.tareas));
    // U5: en celular se ve UNA columna y estas pestanas la eligen; en escritorio el CSS las esconde.
    const tabs = $('colTabs'); tabs.textContent = '';
    // U-04 (17-sep): sin cubeta fijada, en celular se abre la primera ABIERTA con tarjetas (la que tenga vencidas, si hay), no columnas[0] vacia.
    if (!columnas.some(c => c.clave === estado.colMovil)) estado.colMovil = primeraCubetaConTarjetas(columnas, ts);
    for (const c of columnas) {
        const enCubeta = ts.filter(t => t.Columna === c.clave);
        const b = boton('', estado.colMovil === c.clave ? 'is-on' : '', () => { estado.colMovil = c.clave; conAbierto(pintarTablero)(); }, { colTab: c.clave });
        b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', estado.colMovil === c.clave ? 'true' : 'false');
        b.appendChild(el('span', '', c.nombre)); b.appendChild(el('span', 'n' + (vencidasEn(enCubeta) ? ' is-hot' : ''), String(enCubeta.length)));   // v0.20.0: rojo si trae vencidas
        tabs.appendChild(b);
    }
    // v0.47.0: la rejilla tiene tantas columnas como cubetas (el CSS lee `--n`; data-n queda para el caso de 1 en tableta); en celular sigue siendo una a la vez.
    $('tableroCols').dataset.n = String(columnas.length); $('tableroCols').style.setProperty('--n', String(columnas.length));
    cont.classList.toggle('is-compacto', estado.densidad === 'compacto');   // v0.20.0: una linea por tarjeta
    pintarDensidad();
    for (const [i, c] of columnas.entries()) {
        const col = el('div', 'col' + (estado.colMovil === c.clave ? ' is-activa' : '') + (c.huerfana ? ' is-huerfana' : '')); col.dataset.col = c.clave;
        col.dataset.cls = claseDeColumna(c.clave, columnas);   // v0.11.0: el color del filete va por POSICION, no por nombre
        if (c.color) col.dataset.tono = c.color;   // v0.12.0: salvo que la cubeta tenga color elegido
        const h = el('h3'); h.appendChild(el('span', '', c.nombre));   // v0.64.0: sin punto — el color de la cubeta es el FILETE bajo la cabecera (estilo.css: --cub)
        if (c.huerfana) h.title = 'Esta cubeta ya no existe en el proyecto: mueve sus tarjetas a otra.';
        let cs = ordenar(ts.filter(t => t.Columna === c.clave));
        // v0.20.0: el contador se pone rojo y dice cuantas vencidas trae la cubeta (mockup de la iteracion 2).
        // El detalle «· 1 vencida» solo cabe en cubetas anchas (container query): a 1366 con lateral miden 195 px.
        const nv = vencidasEn(cs);
        const cnt = el('span', 'n' + (nv ? ' is-hot' : ''), String(cs.length));
        if (nv) { cnt.appendChild(el('span', 'largo', ` · ${nv} vencida${nv === 1 ? '' : 's'}`)); cnt.title = `${nv} tarjeta${nv === 1 ? '' : 's'} con la fecha vencida`; }
        h.appendChild(cnt);
        col.appendChild(h);
        if (!cs.length) col.appendChild(el('div', 'vacio', filtrado ? 'Nada con ese filtro.' : i === 0 ? 'Nada por hacer.' : '—'));
        // U6: Hecho enseña las ultimas HECHO_VISIBLES (por HechoEl) y un boton para el resto; la cuenta de arriba es la real.
        let ocultas = 0;
        if (c.clave === HECHO) {
            cs = cs.slice().sort((a, b) => String(b.HechoEl || '').localeCompare(String(a.HechoEl || '')) || a.id - b.id);   // lo ultimo hecho, arriba
            if (!estado.hechoTodas && cs.length > HECHO_VISIBLES) { ocultas = cs.length - HECHO_VISIBLES; cs = cs.slice(0, HECHO_VISIBLES); }
        }
        for (const t of cs) col.appendChild(tarjeta(t));
        if (ocultas) col.appendChild(boton(`ver las ${ocultas} anteriores`, 'mn-btn is-ghost is-sm mas', () => { estado.hechoTodas = true; conAbierto(pintarTablero)(); }, { mas: 'hecho' }));
        cont.appendChild(col);
    }
}

// D4: la columna «P» lleva el mismo borde de prioridad alta que la tarjeta; no ordena (es un atributo, no una llave).
// v0.11.0: la columna «Origen en la KB» salio de la Lista (Carlos, 12-sep: a nadie le importa de donde vino).
const COLUMNAS_LISTA = [['prioridad', 'P'], ['tarea', 'Tarea'], ['asignado', 'Asignado'], ['columna', 'Cubeta'], ['vence', 'Vence']];
export function pintarLista(proyecto) {
    const cont = $('tab-lista'); cont.textContent = '';
    const o = estado.ordenLista;
    const todas = ordenarLista(tareasVisibles(proyecto), o.col, o.dir, c => nombreDe(c, estado.roles), columnasDe(proyecto));
    // R-02 (27-sep, Linear «Show completed»): la Lista pinta las abiertas y cierra con «ver las N hechas», el mismo gesto que Hecho del tablero.
    const nHechas = todas.filter(t => t.Columna === HECHO).length;
    const ts = estado.listaHechas ? todas : todas.filter(t => t.Columna !== HECHO);
    const tabla = el('table'); const thead = el('thead'); const tr = el('tr');
    // F10: clic en el encabezado ordena; segundo clic invierte. La flecha va en el activo (aria-sort).
    for (const [clave, texto] of COLUMNAS_LISTA) {
        const th = el('th', clave === 'prioridad' ? 'col-p' : '', clave === 'prioridad' ? texto : null);
        if (clave === 'prioridad') { th.title = 'Prioridad alta'; th.setAttribute('aria-label', 'Prioridad'); tr.appendChild(th); continue; }
        th.dataset.sort = clave;
        const bo = el('button', 'th-orden', texto); bo.type = 'button'; th.appendChild(bo);   // U-30 (v0.123.0): el encabezado que ordena se alcanza con Tab; su clic llega al th
        if (o.col === clave) th.setAttribute('aria-sort', o.dir === 1 ? 'ascending' : 'descending');
        th.addEventListener('click', () => { estado.ordenLista = o.col === clave ? { col: clave, dir: -o.dir } : { col: clave, dir: 1 }; conAbierto(pintarLista)(); });
        tr.appendChild(th);
    }
    thead.appendChild(tr); tabla.appendChild(thead);
    const tbody = el('tbody'); const fin = (columnasDe(proyecto).at(-1) || {}).clave;   // U-29 (v0.123.0): lo de la cubeta final va atenuado
    for (const t of ts) {
        const r = el('tr', 'clic' + (t.Prioridad === 'alta' ? ' alta' : '') + (t.Columna === fin ? ' is-hecha' : '')); r.dataset.t = String(t.id);
        const tdp = el('td', 'col-p'); tdp.appendChild(marcaPrioridad(t.Prioridad)); tdp.title = 'Prioridad ' + (t.Prioridad || 'normal'); r.appendChild(tdp);   // v0.60.0: barras en las tres
        r.appendChild(el('td', '', t.Title));
        r.appendChild(el('td', '', t.Asignado ? nombreDe(t.Asignado, estado.roles) : 'sin asignar'));   // U-31 (v0.123.0): lo mismo que dice la tarjeta del tablero
        r.appendChild(el('td', '', nombreColumna(t)));   // v0.59.0: texto plano, sin chip (Carlos, 15-sep) — el chip sigue en tarjeta y Mis tareas
        // U-09 (mejorar-app proyecto, 17-sep): bajo 720 px el CSS acomoda el renglon como FICHA y enseña la fecha corta («15 sep»);
        // la larga (con año) es la de la tabla. Van las dos en el DOM y el CSS elige; textContent del td trae ambas.
        // U-15 (v0.114.0): el td lleva el mismo estado de fecha que el chip de la tarjeta (vencida / hoy o pronto).
        const ev = estadoVence(t, CONFIG.vencePronto);
        const tdv = el('td', 'mn-mono vence' + (ev === 'danger' || ev === 'warn' ? ' is-' + ev : '')); const md = t.Vence ? mesDia(t.Vence) : null;
        tdv.appendChild(el('span', 'fecha-larga', fechaCorta(t.Vence))); tdv.appendChild(el('span', 'fecha-corta', md ? `${md.dia} ${md.mes}` : '—'));
        r.appendChild(tdv);
        r.addEventListener('click', () => abrirTarjeta(t.id));
        r.tabIndex = 0; r.setAttribute('role', 'button'); r.setAttribute('aria-label', [t.Title, t.Asignado ? nombreDe(t.Asignado, estado.roles) : 'sin asignar', nombreColumna(t), t.Vence ? 'vence ' + fechaCorta(t.Vence) : 'sin fecha'].join(' · '));   // U-10 (17-sep): el renglon se alcanza con Tab y abre con Enter/Espacio; U-30 (v0.123.0): su nombre trae asignado, cubeta y fecha
        r.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirTarjeta(t.id); } });
        tbody.appendChild(r);
    }
    if (!todas.length) { const r = el('tr'); const td = el('td', 'vacio', tareasDe(proyecto, estado.tareas).length ? 'Nada con ese filtro.' : 'Sin tareas todavía.'); td.colSpan = COLUMNAS_LISTA.length; r.appendChild(td); tbody.appendChild(r); }
    else if (!ts.length) { const r = el('tr'); const td = el('td', 'vacio', 'Nada abierto.'); td.colSpan = COLUMNAS_LISTA.length; r.appendChild(td); tbody.appendChild(r); }
    if (nHechas && !estado.listaHechas) {
        const r = el('tr', 'mas-hechas'); const td = el('td'); td.colSpan = COLUMNAS_LISTA.length;
        td.appendChild(boton(`ver las ${nHechas} hecha${nHechas === 1 ? '' : 's'}`, 'mn-btn is-ghost is-sm mas', () => { estado.listaHechas = true; conAbierto(pintarLista)(); }, { mas: 'hechas-lista' }));
        r.appendChild(td); tbody.appendChild(r);
    }
    tabla.appendChild(tbody); cont.appendChild(tabla);
}

/**
 * Mis tareas. v0.58.0 (Carlos, 15-sep: «aplica "lista densa" del artifact en vez de agenda por día»; artifact
 * CrSMdQaxRzctu9VFqrU1dP, corte C «Lista densa con contadores»): ARRIBA cinco contadores grandes que también FILTRAN
 * (abiertas · vencidas · vencen en 7 días · sin fecha · las que delegué), abajo UNA tabla de un renglón por tarjeta
 * —título · proyecto · cubeta · vence— partida por bloques (Vencidas · Esta semana · Después · Sin fecha) con el
 * renglón vencido tintado. Sustituye a la agenda por día de v0.57.x (rótulo a la izquierda + renglones; recuperable
 * en git) y antes al bloque «Urgentes» en rejilla (v0.2.0-v0.56.0). Cabecera en versalitas mono como la Lista del tablero.
 * El renglón NO es tarjeta(): es un `button.tr[data-t]` propio (clic abre la ficha) con las columnas fijas de la tabla.
 * v0.66.0 (Carlos, 15-sep): la FECHA va en columna a la IZQUIERDA como la cola «Hoy» de Inicio (día fuerte + mes tenue,
 * «—» sin fecha; el color del estado en el número), el filete semáforo de 4 px se fue, y proyecto y cubeta son texto plano
 * —sin pastillas—. La columna «Vence» de la derecha y `fechaDensa` («12/09 · −3») salieron con ella (recuperables en git).
 * v0.67.0 (Carlos, 15-sep; artifact BSj9zHeiWcCGM1DLGQfgiK, corte B «una tarjeta por bloque»): cada bloque es su propia
 * tarjeta `.bloq[data-bloque]` —rótulo `.rot` con la cifra fuera, arriba, y su `.densa` de renglones— separadas por el gris
 * de la página; la cabecera de columnas `.hd` y los separadores `.sep` dentro de la tabla ya no existen.
 */
const FILTROS_MIS = [[null, 'abiertas'], ['vencidas', 'vencidas'], ['pronto', 'vencen en 7 días'], ['sinfecha', 'sin fecha'], ['delegadas', 'las que delegué']];   // v0.15.0: quien reparte no las pierde de vista; v0.58.0: «sin fecha» nace con los contadores
export function pintarMisTareas() {
    const yo = estado.cuenta.username.toLowerCase();
    $('misTitulo').textContent = 'Mis tareas · ' + nombreDe(yo, estado.roles);
    const propias = misAbiertas(estado.tareas, yo).sort(porVence);   // C-03 (v0.90.0): la misma regla que la insignia del rail (app.js)
    // v0.15.0: «Las que delegué» = abiertas de OTRO que yo cree o asigne (createdBy o la bitacora); el renglón enseña a quien. Ya vienen en orden de fecha.
    const delego = estado.filtroMis === 'delegadas';
    const ajenas = delegadas(estado.tareas, estado.actividad, yo);
    // C-05 (v0.90.0): la fecha de cada tarjeta se lee UNA vez por pintada (antes ~9 llamadas a estadoVence por tarjeta, y la pintada
    // corre en cada tecla del buscador): {e, bloque, sem} por id, y los contadores salen de esa misma pasada.
    const info = new Map(); for (const t of propias) info.set(t.id, infoVence(t)); for (const t of ajenas) info.set(t.id, infoVence(t));
    // U3: los KPI de Inicio aterrizan aqui con el filtro puesto; los contadores lo muestran y lo cambian (v0.58.0: cada uno con su cifra).
    const cuenta = { todas: propias.length, vencidas: 0, pronto: 0, sinfecha: 0, delegadas: ajenas.length };
    for (const t of propias) { const e = info.get(t.id).e; if (e === 'danger') cuenta.vencidas++; else if (e === 'warn') cuenta.pronto++; if (!t.Vence) cuenta.sinfecha++; }
    const fm = $('filtroMis'); fm.textContent = '';
    for (const [k, texto] of FILTROS_MIS) {
        const on = estado.filtroMis === k;
        const b = el('button', 'kpi' + (on ? ' is-on' : '') + (k === 'vencidas' ? ' is-danger' : k === 'pronto' ? ' is-warn' : '')); b.type = 'button'; b.dataset.mis = k || 'todas';
        b.appendChild(el('b', '', String(cuenta[k || 'todas']))); b.appendChild(el('small', '', texto));
        b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', `${cuenta[k || 'todas']} ${texto}`);
        b.addEventListener('click', () => { estado.filtroMis = k; pintarMisTareas(); }); fm.appendChild(b);
    }
    const cont = $('misLista'); cont.textContent = '';
    $('misSub').textContent = delego ? 'Tarjetas abiertas de otros que tú creaste o asignaste, en orden de fecha. Las vencidas arriba.' : 'Tus tarjetas abiertas, en todos los proyectos, en orden de fecha. Las vencidas arriba.';
    const todas = delego ? ajenas : propias;
    // C3 (v0.6.0): buscador por titulo, sin acentos, encima del filtro por vencimiento.
    const q = sinAcentos(estado.textoMis).trim();
    const conTexto = q ? todas.filter(t => sinAcentos(t.Title).includes(q)) : todas;
    const mias = estado.filtroMis === 'vencidas' ? conTexto.filter(t => info.get(t.id).e === 'danger')
        : estado.filtroMis === 'pronto' ? conTexto.filter(t => info.get(t.id).e === 'warn')
        : estado.filtroMis === 'sinfecha' ? conTexto.filter(t => !t.Vence) : conTexto;
    if (!mias.length) { cont.appendChild(el('p', 'vacio', todas.length ? (q ? 'Ninguna con ese texto.' : 'Nada con ese filtro.') : delego ? 'No has delegado ninguna tarjeta abierta: las que crees o asignes a otros salen aquí.' : 'Sin tareas abiertas asignadas a ti.')); return; }
    // v0.67.0: una tarjeta por bloque. `mias` viene en orden de fecha, asi que los bloques salen contiguos y en el orden fijo.
    const porBloque = new Map(); for (const t of mias) { const b = info.get(t.id).bloque; porBloque.set(b, (porBloque.get(b) || 0) + 1); }
    let bloque = '', densa = null;
    for (const t of mias) {
        const b = info.get(t.id).bloque;
        if (b !== bloque) {
            bloque = b;
            const n = porBloque.get(b);
            const sec = el('section', 'bloq' + (b === 'Vencidas' ? ' is-vencida' : b === 'Esta semana' ? ' is-pronto' : '')); sec.dataset.bloque = BLOQUES[b];
            const rot = el('h3', 'rot'); rot.appendChild(el('b', '', String(n))); rot.appendChild(document.createTextNode(' ' + b)); sec.appendChild(rot);
            densa = el('div', 'densa'); sec.appendChild(densa); cont.appendChild(sec);
        }
        densa.appendChild(renglonDenso(t, delego, info.get(t.id).sem));
    }
}
const BLOQUES = { 'Vencidas': 'vencidas', 'Esta semana': 'semana', 'Después': 'despues', 'Sin fecha': 'sinfecha' };
/**
 * C-05 (v0.90.0): una sola lectura de la fecha por tarjeta. `e` = estadoVence (umbral CONFIG.vencePronto), `bloque` de la lista —por el
 * mismo umbral que el chip: «Esta semana» = hasta `vencePronto` días, hoy incluido— y `sem` = semaforo (umbral CONFIG.semaforoDias).
 * Reproduce estadoVence() y semaforo() de reglas.js sobre un solo diasPara; las unitarias de esas dos siguen siendo la referencia.
 */
function infoVence(t) {
    const hecha = t.Columna === 'hecho', d = hecha ? null : diasPara(t.Vence);
    const e = d === null ? null : claseVence(d, CONFIG.vencePronto), s = d === null ? null : claseVence(d, CONFIG.semaforoDias);
    return { e, bloque: e === 'danger' ? 'Vencidas' : e === 'warn' ? 'Esta semana' : t.Vence ? 'Después' : 'Sin fecha', sem: hecha ? 'hecha' : s === 'danger' ? 'vencida' : s === 'warn' ? 'pronto' : '' };
}
/** Un renglón de la tabla densa: fecha en columna · título (barras de prioridad, insignias; en «delegué», a quién) · proyecto · cubeta. `sem` viene de infoVence (C-05): sin default, para que un llamador nuevo no vuelva a leer la fecha. */
function renglonDenso(t, conQuien, sem) {
    const b = el('button', 'tr' + (sem ? ' is-' + sem : '') + (t.Prioridad === 'alta' ? ' alta' : '')); b.type = 'button'; b.dataset.t = String(t.id);
    if (colorValido(t.Color)) b.dataset.tono = colorValido(t.Color);
    // v0.66.0: la fecha a la izquierda, como `.hoy-r .k` de Inicio: dia fuerte + mes tenue; «—» sin fecha.
    const m = mesDia(t.Vence); const k = el('span', 'k'); k.setAttribute('aria-hidden', 'true');
    k.appendChild(el('b', '', m ? String(m.dia) : '—')); k.appendChild(el('small', '', m ? m.mes : '')); b.appendChild(k);
    b.appendChild(el('span', 'mn-sr', t.Vence ? `vence ${fechaCorta(t.Vence)}` : 'sin fecha'));   // U-07 (v0.90.0): la columna .k es aria-hidden y el title no lo leen los lectores moviles
    const tt = el('span', 't');
    tt.appendChild(el('span', 'tit', t.Title));
    tt.appendChild(marcaPrioridad(t.Prioridad));   // v0.60.0: a la derecha del titulo
    if (conQuien) { const q = el('span', 'quien'); q.appendChild(document.createTextNode(t.Asignado ? nombreCorto(t.Asignado, estado.roles) : 'sin asignar')); tt.appendChild(q); }
    const nNotas = notasPorTarea().get(t.id) || 0, nDocs = ligasPorTarea().get(t.id) || 0;
    if (nNotas) tt.appendChild(insignia(TRAZOS.burbuja, nNotas, `${nNotas} nota${nNotas === 1 ? '' : 's'}`, 'is-notas'));
    if (nDocs) tt.appendChild(insignia(TRAZOS.clip, nDocs, `${nDocs} documento${nDocs === 1 ? '' : 's'}`, 'is-docs'));
    if (buzonPorTarea().get(t.id)) tt.appendChild(chip('en el buzón', 'info'));
    b.appendChild(tt);
    const p = porId(estado.proyectos, t.ProyectoId); b.appendChild(el('span', 'eqc', p ? p.Clave : ''));   // v0.66.0: texto plano, sin pastilla
    b.appendChild(el('span', 'cu', nombreColumna(t)));
    // El título se corta con puntos suspensivos si es largo (artifact C): el completo vive en el title, con lo que la fila no enseña.
    b.title = [t.Title, t.Prioridad === 'alta' ? 'Prioridad alta' : '', p ? p.Title : '', t.Vence ? 'vence ' + fechaCorta(t.Vence) : 'sin fecha'].filter(Boolean).join(' · ');
    b.addEventListener('click', () => abrirTarjeta(t.id));
    return b;
}

// ---------------------------------------------------------------- tarjeta (dialogo)

// C-02 (mejorar-app proyecto, 17-sep): se guarda el ID, no el objeto — cargarTodo REEMPLAZA estado.tareas en cada relectura
// (la del evento `online` incluida) y el objeto capturado quedaba huerfano: la ficha editaba una copia con _etag viejo que el
// tablero ya no pintaba. Cada manejador resuelve la tarjeta viva con tarjetaAbiertaObj(), como ya hacia moverTarea.
let tarjetaAbiertaIdNum = null;
const tarjetaAbiertaObj = () => tarjetaAbiertaIdNum === null ? null : porId(estado.tareas, tarjetaAbiertaIdNum);
/** Id de la tarjeta abierta en el dialogo, o null (lo lee el router de app.js). */
export function tarjetaAbiertaId() { return $('dlgTarea').open && tarjetaAbiertaIdNum !== null ? tarjetaAbiertaIdNum : null; }

export function abrirTarjeta(id) {
    const t = porId(estado.tareas, id); if (!t) return;
    tarjetaAbiertaIdNum = t.id;
    pintarFicha(t);
    $('tNota').value = ''; contarNota();   // C-04: el cuadro de la nota se vacia al ABRIR (y tras guardar), no en cada repintado de la ficha
    abrirDialogo('dlgTarea');
    fijarHash(hashDe(t.id));
}

const TITULO_EDITA = { asignado: 'Cambiar el asignado', vence: 'Cambiar la fecha', prioridad: 'Cambiar la prioridad', color: 'Cambiar el color' };
/** v0.53.0: pinta la ficha de `t` en #dlgTarea sin abrirlo ni tocar el hash — abrirTarjeta la usa, y guardarEdicion la re-pinta
 *  tras cada PATCH sin que abrirDialogo mande el scroll arriba.
 *  C-05 (mejorar-app proyecto, 17-sep): eran 153 lineas con seis responsabilidades; ahora cada pieza de #dlgTarea la pinta su
 *  funcion (titulo · ceja · propiedades · descripcion · kv · permisos · mover · orden) y esta solo ensambla. El orden es el de antes salvo
 *  el bloque «solo lectura / cerrado / Borrar», que iba al final y ahora va en pintarPermisosFicha antes de mover/orden: DOM disjunto, sin efecto. */
function pintarFicha(t) {
    const p = porId(estado.proyectos, t.ProyectoId);
    const puedeEditar = PUEDE.tarea(estado.rol) && !!p && p.Estado === 'activo';
    cerrarPop();   // si se re-pinta con el popover abierto (conflicto, relectura), se cierra sin guardar
    pintarTituloFicha(t, puedeEditar);
    pintarCejaFicha(t, p);
    // #tMover y #tOrden viven DENTRO del renglon de la cubeta desde la primera apertura: se toman antes de vaciar los renglones,
    // o el vaciado se los lleva (la E2E lo cazo: null en la segunda apertura).
    const mv = $('tMover'), or = $('tOrden');
    const celdaCubeta = pintarPropiedadesFicha(t, puedeEditar);
    pintarDescripcionFicha(t, puedeEditar);
    pintarKvFicha(t, p);
    pintarDocsDeTarjeta(t, p);
    pintarNotas(t, p);
    pintarPermisosFicha(p);
    pintarMoverFicha(t, p, celdaCubeta, mv);
    pintarOrdenFicha(t, p, celdaCubeta, or);
}

/** El titulo: boton con lapiz que abre el popover «titulo» si se puede editar; texto plano si no. */
function pintarTituloFicha(t, puedeEditar) {
    // v0.24.0 (iteracion 6) puso asignado · cubeta · vence · prioridad como CHIPS bajo el titulo. v0.50.0 (Carlos, 15-sep;
    // artifact 1mTr2BGa, opcion 1A) los vuelve RENGLONES rotulo · valor —el mismo kv de la columna derecha—, porque cuatro
    // pastillas del mismo peso decian cosas de peso distinto («normal» y «sin fecha» son el default). Regla: lo que esta en
    // su valor por defecto va en gris tenue. v0.53.0 (Carlos, 15-sep; artifact CMmGTirt, opcion D): el valor de asignado / vence /
    // prioridad / color es un boton con LAPIZ que abre el popover #tPop de ESE campo ahi mismo (antes mandaba al acordeon
    // «Editar la tarjeta», que ya no existe); el de cubeta abre el menu #tMover (opcion 2B). El titulo y la descripcion tambien.
    const tit = $('tTitulo'); tit.textContent = '';
    if (puedeEditar) {
        const b = el('button', 'prop-btn is-titulo'); b.type = 'button'; b.title = 'Cambiar el título'; b.dataset.edita = 'titulo';
        b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
        b.appendChild(el('span', '', t.Title)); b.appendChild(iconoSvg(TRAZOS.lapiz, 'lapiz'));
        b.addEventListener('click', () => abrirPop('titulo', tit.closest('.mn-dialog-head'), b));
        tit.appendChild(b);
    } else tit.textContent = t.Title;
}

/** La ceja sobre el titulo (equipo · frente · T-id) y la banda de color del dialogo. */
function pintarCejaFicha(t, p) {
    // v0.69.0 (Carlos, 16-sep; artifact 2BTfe3Yo, opcion A2): la CEJA sobre el titulo dice de quien es la tarjeta sin leer la
    // columna derecha —icono + nombre del equipo · liga al frente · T-id—, y el dialogo lleva una BANDA del color del equipo en
    // el borde izquierdo (--t-eq). Sin proyecto (huerfana), solo el id y la banda gris.
    const ceja = $('tCeja'); ceja.textContent = '';
    const eqCeja = equipoDe(p);
    $('dlgTarea').style.setProperty('--t-eq', p ? eqCeja.color : 'var(--status-idle-solid)');
    if (p) {
        ceja.appendChild(iconoEquipo(eqCeja, 'sm'));
        ceja.appendChild(el('span', 'eq', eqCeja.nombre));
        ceja.appendChild(el('span', 'sep', '·'));
        const a = el('a', '', p.Title); a.href = `#p/${p.Clave}`; a.dataset.proyecto = p.Clave;
        a.addEventListener('click', ev => { ev.preventDefault(); cerrarDialogo('dlgTarea'); irAHash(`#p/${p.Clave}`); });
        ceja.appendChild(a);
        ceja.appendChild(el('span', 'sep', '·'));
    }
    ceja.appendChild(el('span', 'id mn-mono', `T-${t.id}`));
}

/** La franja de propiedades (#tChips): Asignado · Cubeta · Vence · Prioridad · Color. Devuelve la celda de la cubeta, donde
 *  pintarMoverFicha y pintarOrdenFicha cuelgan #tMover y #tOrden. */
function pintarPropiedadesFicha(t, puedeEditar) {
    const props = $('tChips'); props.textContent = '';
    // v0.69.0 (A2): cada propiedad es una CELDA (.t-cel: rotulo arriba, valor abajo) de UNA franja con divisores, no un renglon
    // rotulo · valor; el DOM de adentro (b + .val, data-chip, .prop-btn) es el mismo, solo cambia el envoltorio.
    const renglon = (rotulo, nodo, clave, campo) => {
        nodo.dataset.chip = clave;
        const cel = el('div', 't-cel'); cel.dataset.cel = clave; props.appendChild(cel);
        cel.appendChild(el('b', '', rotulo));
        const celda = el('span', 'val');
        if (!campo || !puedeEditar) { celda.appendChild(nodo); cel.appendChild(celda); return celda; }
        const b = el('button', 'prop-btn is-edita'); b.type = 'button'; b.title = TITULO_EDITA[campo] || `Cambiar ${rotulo.toLowerCase()}`; b.dataset.edita = campo;
        b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
        b.appendChild(nodo); b.appendChild(iconoSvg(TRAZOS.lapiz, 'lapiz'));
        b.addEventListener('click', () => abrirPop(campo, celda, b));
        celda.appendChild(b); cel.appendChild(celda);
        return celda;
    };
    const quien = el('span', t.Asignado ? '' : 'default', t.Asignado ? nombreDe(t.Asignado, estado.roles) : 'Sin asignar');
    renglon('Asignado', quien, 'asignado', 'asignado');
    const celdaCubeta = renglon('Cubeta', el('span', '', nombreColumna(t)), 'cubeta');
    // Vence: el semaforo de la fecha (vencio / hoy / pronto) tine el texto; sin fecha, «Poner fecha» en gris tenue; hecha, la fecha a secas.
    const ev = estadoVence(t, CONFIG.vencePronto);   // null en «hecho»: ya no vence
    const vence = el('span', !t.Vence ? 'default' : ev === 'danger' ? 'is-danger' : ev === 'warn' ? 'is-warn' : '',
        !t.Vence ? (puedeEditar ? 'Poner fecha' : 'Sin fecha') : ev === 'danger' ? `venció ${fechaCorta(t.Vence)}` : ev === 'warn' && diasPara(t.Vence) === 0 ? 'hoy' : fechaCorta(t.Vence));
    const celdaVence = renglon('Vence', vence, 'vence', 'vence');
    // v0.69.0 (A2): «en N d» al lado de la fecha, fuera del boton (el data-chip sigue diciendo solo la fecha); vencida u hoy ya lo dicen.
    if (t.Vence && ev !== 'danger' && diasPara(t.Vence) > 0) celdaVence.appendChild(el('span', 'rel mn-mono', `en ${diasPara(t.Vence)} d`));
    const prio = el('span', t.Prioridad === 'alta' || t.Prioridad === 'baja' ? '' : 'default'); prio.appendChild(barrasPrioridad(t.Prioridad)); prio.appendChild(document.createTextNode(t.Prioridad === 'alta' ? 'Alta' : t.Prioridad === 'baja' ? 'Baja' : 'Normal'));
    renglon('Prioridad', prio, 'prioridad', 'prioridad');
    // v0.53.0: Color es un renglon mas (antes solo vivia en el editor): la muestra redonda con el nombre del tono; sin color, gris tenue.
    const tono = COLORES.find(c => c.clave === colorValido(t.Color));
    const color = el('span', tono ? '' : 'default'); const muestra = el('i', 'muestra'); if (tono) muestra.dataset.tono = tono.clave; color.appendChild(muestra); color.appendChild(document.createTextNode(tono ? tono.nombre : 'Sin color'));
    renglon('Color', color, 'color', 'color');
    return celdaCubeta;
}

/** La descripcion (#tDescCaja): texto pre-line con lapiz al final si se puede editar; vacia, «Agregar descripción» en gris tenue (o nada en lectura). */
function pintarDescripcionFicha(t, puedeEditar) {
    const caja = $('tDescCaja'); caja.textContent = '';
    const desc = el('p', 't-desc', t.Descripcion || ''); desc.id = 'tDesc';
    if (puedeEditar) {
        const b = el('button', 'prop-btn is-edita' + (t.Descripcion ? ' is-lapiz' : ' default')); b.type = 'button'; b.id = 'tDescEditar'; b.dataset.edita = 'descripcion';
        b.title = t.Descripcion ? 'Cambiar la descripción' : ''; b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
        if (!t.Descripcion) b.appendChild(el('span', '', 'Agregar descripción')); else b.setAttribute('aria-label', 'Cambiar la descripción');
        b.appendChild(iconoSvg(TRAZOS.lapiz, 'lapiz'));
        b.addEventListener('click', () => abrirPop('descripcion', caja, b));
        desc.appendChild(b);
    } else desc.classList.toggle('oculto', !t.Descripcion);
    caja.appendChild(desc);
}

/** La columna derecha (#tKv): lo que se consulta del frente (Proyecto · Hecho por · Creada · Último cambio). */
function pintarKvFicha(t, p) {
    const kv = $('tKv'); kv.textContent = '';
    const par = (k, v, clase) => { kv.appendChild(el('b', '', k)); const s = el('span', clase || '', typeof v === 'string' ? v : null); if (typeof v !== 'string') s.appendChild(v); kv.appendChild(s); return s; };
    // D2 (v0.6.0) puso aqui la liga al frente con el icono del equipo; U-33 (v0.123.0): la ceja sobre el titulo ya la trae (v0.69.0),
    // asi que aqui solo se dice cuando la tarjeta se quedo sin proyecto.
    if (!p) par('Proyecto', '—');
    // v0.11.0: «Origen» (el puntero a la KB) ya no se ensena; el dato sigue en la lista para los scripts.
    if (t.HechoPor) par('Hecho por', `${nombreDe(t.HechoPor, estado.roles)} · ${fechaCorta(t.HechoEl)}`);
    if (t._creado) par('Creada', `${t._creadoPor ? nombreDe(t._creadoPor, estado.roles) + ' · ' : ''}${fechaHora(t._creado)}`, 'creada');
    // SharePoint no dice QUIEN modifico (graph.js solo trae lastModifiedDateTime); si coincide con la creacion, no se repite.
    if (t._modificado && t._modificado !== t._creado) par('Último cambio', fechaHora(t._modificado), 'creada');
}

/** Lo que el rol y el estado del proyecto dejan hacer: la linea «solo lectura», la banda «cerrado» y el menu «···» con Borrar. */
function pintarPermisosFicha(p) {
    // C6 (v0.6.0): con rol lectura la tarjeta decia lo mismo tres veces (cuatro botones apagados, la
    // banda roja y «Borrar» apagado). Ahora: sin «Mover a…», y una linea gris de una frase. La banda
    // roja se queda para el proyecto CERRADO, que si es una alarma. Los botones se siguen armando
    // (ocultos): moverTarea se niega sola aunque alguien los fuerce (la E2E lo prueba).
    const lectura = !PUEDE.mover(estado.rol);
    $('tSoloLectura').classList.toggle('oculto', !lectura);
    const cerrado = !!p && p.Estado !== 'activo';
    $('tDeny').classList.toggle('oculto', !cerrado);   // tambien lectura ve «cerrado»
    $('tDeny').textContent = cerrado ? 'El proyecto está cerrado: sus tarjetas quedan como registro.' : '';
    // v0.53.0: «Borrar tarjeta» vive en el menu «···» de la cabecera (Carlos, 15-sep). El menu entero se esconde a quien no puede
    // borrar (un menu con su unico renglon apagado no dice nada); el boton sigue disabled por si alguien lo fuerza — borrarTarea se niega sola.
    $('tBorrar').disabled = !PUEDE.borrar(estado.rol);
    $('tBorrar').title = PUEDE.borrar(estado.rol) ? '' : 'Solo gerencia borra tarjetas';
    $('tMenu').classList.toggle('oculto', !PUEDE.borrar(estado.rol)); $('tMenu').open = false;
}

/** El menu «Mover a…» (#tMover) colgado del renglon de la cubeta, con un boton por cubeta del proyecto. */
function pintarMoverFicha(t, p, celdaCubeta, mv) {
    const puedeMover = PUEDE.mover(estado.rol) && !!p && p.Estado === 'activo';
    // v0.50.0 (opcion 2B): #tMover es un MENU colgado del renglon «Cubeta»: el valor es un boton con chevron que lo abre,
    // y dentro va un boton por cubeta (data-move, como siempre). Con rol lectura el valor es texto y el menu queda oculto;
    // los botones se siguen armando: moverTarea se niega sola aunque alguien los fuerce (la E2E lo prueba).
    mv.textContent = ''; mv.classList.add('oculto');
    celdaCubeta.appendChild(mv);
    if (puedeMover) {
        const valor = celdaCubeta.querySelector('[data-chip="cubeta"]');
        const abre = el('button', 'prop-btn is-menu'); abre.type = 'button'; abre.title = 'Mover a otra cubeta'; abre.dataset.abreMover = '1';
        abre.setAttribute('aria-haspopup', 'menu'); abre.setAttribute('aria-expanded', 'false'); abre.setAttribute('aria-controls', 'tMover');
        abre.appendChild(valor); celdaCubeta.prepend(abre);
        abre.addEventListener('click', () => { cerrarPop(); alternarMover(mv.classList.contains('oculto')); if (!mv.classList.contains('oculto')) { const f = mv.querySelector('button:not([disabled])'); if (f) f.focus(); } });
        // cerrar con clic fuera y con Esc lo engancha engancharTablero UNA vez (aqui se re-pinta en cada apertura)
    }
    // v0.11.0: las cubetas de SU proyecto (+ la huerfana en la que este, para que se lea como «actual»).
    for (const c of columnasConHuerfanas(p, [t])) {
        // C5: la columna actual se lee como «X · actual», no como el boton que hay que pulsar.
        const aqui = t.Columna === c.clave;
        const b = boton(aqui ? `${c.nombre} · actual` : c.nombre, 'mn-btn is-sm' + (aqui ? ' is-here' : ''), () => moverTarea(t.id, c.clave), { move: c.clave });
        b.setAttribute('role', 'menuitem');
        if (aqui) b.setAttribute('aria-current', 'true');
        b.disabled = !puedeMover || aqui || !!c.huerfana;
        mv.appendChild(b);
    }
}

/** F11: Subir / Bajar dentro de la columna (#tOrden, renumera Orden en el orden visual). v0.50.0: va en el mismo renglon de la cubeta. */
function pintarOrdenFicha(t, p, celdaCubeta, or) {
    const puedeMover = PUEDE.mover(estado.rol) && !!p && p.Estado === 'activo';
    or.textContent = '';
    celdaCubeta.appendChild(or);
    if (puedeMover) {
        const hermanas = ordenar(tareasDe(p, estado.tareas).filter(x => x.Columna === t.Columna));
        const i = hermanas.findIndex(x => x.id === t.id);
        if (hermanas.length > 1) {
            or.appendChild(el('span', '', `${i + 1} de ${hermanas.length}`));
            // U-16 (v0.114.0): .flecha = 36 px de ancho minimo y separacion (estilo.css); antes 26 px pegadas.
            const up = boton('↑', 'mn-btn is-ghost is-sm flecha',() => reordenarTarea(t.id, -1), { orden: 'subir' }); up.disabled = i <= 0; up.title = 'Subir un lugar'; up.setAttribute('aria-label', 'Subir'); or.appendChild(up);
            const dn = boton('↓', 'mn-btn is-ghost is-sm flecha',() => reordenarTarea(t.id, 1), { orden: 'bajar' }); dn.disabled = i >= hermanas.length - 1; dn.title = 'Bajar un lugar'; dn.setAttribute('aria-label', 'Bajar'); or.appendChild(dn);
        }
    }
}

// ---------------------------------------------------------------- popover de edicion (v0.53.0, opcion D)

/** Campo abierto en #tPop, o null. */
let popAbierto = null;
/** Boton que abrio el popover (recupera el foco al cerrar). */
let popDesde = null;
/** Cuelga #tPop de `ancla` mostrando solo la seccion de `campo`, con el valor actual de la tarjeta cargado. */
function abrirPop(campo, ancla, desde) {
    const t = tarjetaAbiertaObj(); if (!t) return;
    const p = porId(estado.proyectos, t.ProyectoId);
    if (popAbierto === campo && popDesde === desde) { cerrarPop(); return; }   // el mismo lapiz otra vez: conmuta (revisor)
    if (popAbierto) cerrarPop();
    alternarMover(false);
    const pop = $('tPop');
    for (const s of pop.querySelectorAll('.pop-campo')) s.hidden = s.dataset.campo !== campo;
    pop.dataset.campo = campo; popAbierto = campo; popDesde = desde || null;
    // el valor se carga al ABRIR, de la tarjeta viva (no al pintar la ficha): asi un Cancelar nunca deja basura para la siguiente
    if (campo === 'titulo') $('ftTitulo').value = t.Title || '';
    if (campo === 'asignado') { opciones($('ftAsignado'), personas(), x => x, x => nombreDe(x, estado.roles), 'sin asignar'); $('ftAsignado').value = String(t.Asignado || '').toLowerCase(); }
    if (campo === 'prioridad') ponerPrioridad('ftPrioridad', t.Prioridad);
    if (campo === 'color') selectorTonos($('ftColor'), t.Color, null, 'Color de la tarjeta');   // v0.12.0
    if (campo === 'vence') { $('ftVence').value = fechaInput(t.Vence); atajosFecha('ftVence', 'ftAtajos', p && p.Vence); }   // C2 + D1. v0.70.1: sin «Quitar la fecha» (Carlos, 16-sep); vaciar el input y Guardar sigue dejando Vence en null
    if (campo === 'descripcion') $('ftDesc').value = t.Descripcion || '';
    ancla.appendChild(pop); pop.classList.remove('oculto');
    if (desde) desde.setAttribute('aria-expanded', 'true');
    // el hidden de prioridad no toma foco: lo toma su opcion marcada; en color, el tono marcado
    const f = campo === 'prioridad' ? $('ftPrioridadSeg').querySelector('[aria-checked="true"]') : campo === 'color' ? $('ftColor').querySelector('[aria-checked="true"]') : pop.querySelector('.pop-campo:not([hidden]) input:not([type="hidden"]), .pop-campo:not([hidden]) select, .pop-campo:not([hidden]) textarea');
    // el titulo se selecciona entero (convencion «renombrar»); la descripcion NO: seleccionarla dejaria un parrafo a un tecleo de
    // borrarse (revisor) — caret al final
    if (f) { f.focus(); if (f.tagName === 'TEXTAREA') f.setSelectionRange(f.value.length, f.value.length); else if (f.select && f.type !== 'date') f.select(); }
}
/** Cierra #tPop sin guardar y lo estaciona al final del dialogo; el foco vuelve al boton que lo abrio. */
export function cerrarPop() {
    const pop = $('tPop'); if (!pop) return;
    pop.classList.add('oculto'); $('dlgTarea').appendChild(pop);
    if (popDesde) { popDesde.setAttribute('aria-expanded', 'false'); if (popAbierto && document.activeElement && (document.activeElement === document.body || pop.contains(document.activeElement))) popDesde.focus(); }
    popAbierto = null; popDesde = null;
}
/** Id del campo abierto en el popover, o null (la E2E lo lee). */
export function popCampo() { return popAbierto; }

/** Documentos de la tarjeta (F3): las ligas con «Quitar», y «Ligar archivo» / «Subir al buzón» con esta tarjeta ya puesta. */
/** C-20 (v0.124.0): repinta los documentos de la tarjeta `id` contra el estado vivo (tras un await, el `t` de la pintada ya es viejo). */
function repintarDocsDeTarjeta(id) { const t = porId(estado.tareas, id); if (t) pintarDocsDeTarjeta(t, porId(estado.proyectos, t.ProyectoId)); }
function pintarDocsDeTarjeta(t, p) {
    const tId = t.id;   // C-20: los handlers guardan ids
    const c = $('tDocs'); c.textContent = '';
    const ligas = estado.ligas.filter(l => Number(l.TareaId) === t.id);
    $('tDocsN').textContent = ligas.length ? String(ligas.length) : '';   // v0.24.0: «Documentos · 2»
    const puede = puedeLigarEn(p);
    for (const l of ligas) {
        const lId = l.id;
        // v0.69.0 (Carlos, 16-sep; artifact 2BTfe3Yo, A2): cada documento es una TARJETA (icono · nombre con el estado debajo · ✕).
        // El estado sigue siendo chip() (.mn-chip, lo que la E2E y Docs conocen); la piel lo pinta como texto plano sin pastilla
        // (estilo.css v0.68.0 + v0.69.0). «Quitar» es una tachita con el texto en aria-label/title.
        const fila = el('div', 'tdoc');
        fila.appendChild(iconoArchivo(l.Ruta || l.Title, l.Tipo, 'sm'));   // v0.8.0
        const cuerpo = el('div', 't');
        const a = el('a', '', l.Title); const href = hrefSeguro(l.Url, { tipo: l.Tipo, host: CONFIG.sharepointHost }); if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; if (l.Tipo === 'enlace') a.title = `abre ${new URL(href).hostname}`; }   // v0.13.1 + S-15
        cuerpo.appendChild(a);
        const fuera = l.Tipo !== 'enlace' && l.Url && !href;   // S-15: Url editada desde SharePoint hacia otro sitio
        cuerpo.appendChild(fuera ? chip('dirección externa', 'danger') : chip(l.Tipo === 'buzon' ? 'en el buzón' : l.Tipo === 'enlace' ? 'enlace' : 'archivado', l.Tipo === 'buzon' ? 'info' : l.Tipo === 'enlace' ? null : 'ok'));
        fila.appendChild(cuerpo);
        if (puede || (l.Tipo === 'enlace' && puedeEnlazarEn(p))) {
            const q = boton('', 'mn-btn is-ghost is-sm is-icono quitar', async () => { const lv = porId(estado.ligas, lId); if (!lv) { avisar('Esa liga ya no está.', 'ojo'); return; } if (await quitarLiga(lv)) repintarDocsDeTarjeta(tId); }, { quitar: String(l.id) });
            q.title = 'Quitar este documento de la tarjeta'; q.setAttribute('aria-label', 'Quitar'); q.appendChild(iconoSvg(TRAZOS.cerrar));
            fila.appendChild(q);
        }
        c.appendChild(fila);
    }
    // v0.69.0: los tres botones cortos con icono en UNA fila (Ligar · Subir · Enlace), como en la opcion B del artifact; el texto largo va en title.
    const accion = (texto, titulo, trazos, alClic, atributos) => { const b = boton('', 'mn-btn is-sm', alClic, atributos); b.title = titulo; b.appendChild(iconoSvg(trazos)); b.appendChild(el('span', '', texto)); return b; };
    if (!ligas.length) c.appendChild(el('span', 'vacio', puede ? 'Sin documentos: liga uno de la biblioteca, sube al buzón o pega un enlace.' : puedeEnlazarEn(p) ? 'Sin documentos: pega un enlace.' : 'Sin documentos.'));
    if (puede) {
        const acciones = el('div', 'tdoc-acciones');
        const volver = () => abrirTarjeta(t.id);
        acciones.appendChild(accion('Ligar', 'Ligar un archivo de la biblioteca', TRAZOS.liga, () => { cerrarDialogo('dlgTarea'); abrirLigar({ proyectoId: p.id, tareaId: t.id, alTerminar: volver }); }, { ligar: String(t.id) }));
        acciones.appendChild(accion('Subir', 'Subir al buzón de la unidad', TRAZOS.subir, () => { cerrarDialogo('dlgTarea'); abrirSubir({ proyectoId: p.id, tareaId: t.id, alTerminar: volver }); }, { subir: String(t.id) }));
        c.appendChild(acciones);
    }
    // F4: un enlace no necesita biblioteca; se ofrece aunque el equipo no tenga una en el piloto.
    if (puedeEnlazarEn(p)) {
        const acc = c.querySelector('.tdoc-acciones') || c.appendChild(el('div', 'tdoc-acciones'));
        acc.appendChild(accion('Enlace', 'Pegar un enlace', TRAZOS.globo, () => { cerrarDialogo('dlgTarea'); abrirEnlace({ proyectoId: p.id, tareaId: t.id, alTerminar: () => abrirTarjeta(tId) }); }, { enlace: String(t.id) }));
    }
}

const ACCIONES_HISTORIAL = ['crear-tarea', 'editar-tarea', 'mover-tarea'];   // R-04: lo que la ficha ensena plegado entre las notas
/** R-04: un tramo de cambios seguidos, plegado: «3 cambios» y al abrir quien · cuando · que, en la mono de la cabecera de nota. */
function bloqueHistorial(grupo) {
    const d = el('details', 'nota-hist'); d.dataset.historial = String(grupo.length);
    d.appendChild(el('summary', '', `${grupo.length} cambio${grupo.length === 1 ? '' : 's'}`));
    const ul = el('ul');
    for (const a of grupo) {
        const li = el('li'); li.appendChild(el('span', 'w mn-mono', `${nombreDe(a.Quien, estado.roles)} · ${fechaHora(a.Cuando)}`));
        li.appendChild(el('span', 't', a.Title || '')); ul.appendChild(li);
    }
    d.appendChild(ul); return d;
}
/** Notas de la tarjeta (F5): renglones de PROY_Actividad con Accion=comentar, en orden, y el campo para anotar. */
function pintarNotas(t, p) {
    const tId = t.id;   // C-20 (v0.124.0): los handlers guardan ids
    const c = $('tNotasLista'); c.textContent = '';
    const notas = notasDe(t.id);
    $('tNotasN').textContent = notas.length ? String(notas.length) : '';   // v0.24.0: «Notas · 2»
    // R-04 (27-sep, Linear «collapsed issue history»): los cambios de la tarjeta que ya estan en PROY_Actividad (creo, movio,
    // edito, asigno) se intercalan con las notas por fecha; los seguidos entre dos notas se pliegan en un renglon gris «N cambios».
    const cambios = estado.actividad.filter(a => ACCIONES_HISTORIAL.includes(a.Accion) && Number(a.TareaId) === Number(t.id));
    const linea = [...notas.map(n => ({ n, cuando: n.Cuando })), ...cambios.map(a => ({ a, cuando: a.Cuando }))]
        .sort((x, y) => String(x.cuando || '').localeCompare(String(y.cuando || '')));
    let grupo = [];
    const soltar = () => { if (grupo.length) c.appendChild(bloqueHistorial(grupo)); grupo = []; };
    for (const { n, a } of linea) {
        if (a) { grupo.push(a); continue; }
        soltar();
        const nId = n.id;
        const it = el('div', 'nota');
        const cuerpo = el('div');
        const cab = el('div', 'w'); cab.appendChild(el('span', '', nombreDe(n.Quien, estado.roles))); cab.appendChild(el('span', 'mn-mono', ' · ' + fechaHora(n.Cuando)));
        const texto = el('p'); texto.appendChild(textoConMenciones(n.Title)); cuerpo.appendChild(cab); cuerpo.appendChild(texto);   // v0.8.0: @menciones como chips
        it.appendChild(cuerpo);
        // v0.9.0: borrar la nota (propia, o cualquiera si gerencia) — el mismo renglon que ve el chat.
        if (puedeBorrarComentario(n, p)) {
            const b = boton('', 'borrar-msg', async () => { const nv = porId(estado.actividad, nId); const tv = porId(estado.tareas, tId); const pv = tv && porId(estado.proyectos, tv.ProyectoId); if (!nv || !tv) { avisar('Esa nota ya no está.', 'ojo'); return; } if (await borrarComentario(nv, pv)) { pintarNotas(tv, pv); alCambiar(); } }, { borrar: String(n.id) });
            b.title = 'Borrar esta nota'; b.setAttribute('aria-label', b.title); b.appendChild(iconoSvg(TRAZOS.basura));
            it.classList.add('has-borrar'); it.appendChild(b);
        }
        c.appendChild(it);
    }
    soltar();
    if (!notas.length) c.appendChild(el('span', 'vacio', 'Sin notas todavía.'));
    const puede = PUEDE.tarea(estado.rol) && !!p && p.Estado === 'activo';
    $('formNota').classList.toggle('oculto', !puede);
    // C-04 (17-sep): aqui YA NO se vacia #tNota — pintarNotas corre tras cada PATCH de propiedad y borraba la nota a medio escribir.
}
/** C4: el contador «180/250» aparece a partir de 200 caracteres; antes el placeholder era la unica pista del limite. C-06: comun.js. */
const NOTA_MAX = 250, NOTA_AVISO = 200;
const contarNota = () => contadorTexto('tNota', 'tNotaCont', NOTA_MAX, NOTA_AVISO);

async function anotar(ev) {
    ev.preventDefault();
    const t = tarjetaAbiertaObj(); if (!t) return;
    if (!PUEDE.tarea(estado.rol)) { avisar('Tu rol es de lectura: no puedes anotar.', 'error'); return; }
    if (navigator.onLine === false) { avisar('Sin conexión: la nota se guarda cuando regrese la red (vuelve a intentarlo).', 'ojo'); return; }   // T2 (v0.8.0): Ctrl+Enter no pasa por pointer-events
    if ($('tAnotar').disabled) return;   // C4: Ctrl+Enter no respeta `disabled` como el clic; sin esto, dos renglones
    const texto = $('tNota').value.trim();
    if (!texto) { $('tNota').focus(); return; }
    if (texto.length > 250) { avisar('La nota no cabe: máximo 250 caracteres (es un renglón de la bitácora).', 'error'); return; }
    $('tAnotar').disabled = true;
    try {
        // A diferencia del resto de la bitacora, aqui la escritura ES la accion: si falla, se ve.
        const r = { Title: texto, Accion: 'comentar', Quien: estado.cuenta.username, Cuando: new Date().toISOString(), ProyectoId: Number(t.ProyectoId), TareaId: t.id };
        const n = await estado.cliente.crearRenglon(estado.siteId, L.actividad, r, m => avisar(m, 'ojo'));
        fusionarActividad([n]);   // C-19: un refresco a medio POST ya lo pudo traer
        $('tNota').value = ''; contarNota();   // C-04: la nota se vacia tras GUARDARLA
        pintarNotas(t, porId(estado.proyectos, t.ProyectoId));
        avisar('Nota guardada.', 'ok');
        alCambiar();
    } catch (e) { avisar('No se pudo guardar la nota: ' + (e && e.message ? e.message : e), 'error'); }
    finally { $('tAnotar').disabled = false; }
}

/** «Copiar liga» (F8): comparte o copia la URL de la tarjeta por su proyecto; si nada de eso existe, la deja en el aviso. */
async function compartirTarjeta() {
    const t = tarjetaAbiertaObj(); if (!t) return;
    const url = ligaDeTarjeta(t);
    try {
        if (navigator.share) { await navigator.share({ title: t.Title, url }); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); avisar('Liga copiada: pégala en el chat.', 'ok'); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    avisar(url, 'ojo');
}

/**
 * Un 412 (T1): alguien cambio la tarjeta desde que se leyo. No se pisa: se releen las listas, se avisa
 * y, si el dialogo estaba abierto, se vuelve a abrir con lo nuevo para que la persona decida.
 */
async function conflicto(t) {
    const estabaAbierta = $('dlgTarea').open;
    await pedirRelectura();
    const fresca = porId(estado.tareas, t.id);
    if (estabaAbierta && fresca) abrirTarjeta(t.id);   // abrir limpia los avisos: el aviso va DESPUES, dentro del dialogo
    avisar(fresca ? `Alguien cambió «${fresca.Title.slice(0, 60)}» hace un momento: se releyó. Revisa y vuelve a intentarlo.` : 'Esa tarjeta ya no existe: alguien la borró hace un momento.', 'ojo');
}

/** Nucleo de mover: PATCH con If-Match, sello, bitacora. Devuelve la cubeta anterior. */
async function ejecutarMovimiento(t, columna) {
    const antes = t.Columna; const cols = columnasDeTarea(t);
    const campos = camposDeMovimiento(columna, estado.cuenta.username, new Date(), cols);
    const res = await estado.cliente.actualizarRenglon(estado.siteId, L.tareas, t.id, campos, m => avisar(m, 'ojo'), t._etag);
    const deNombre = nombreColumnaEn(antes, cols);
    aplicarVivo(estado.tareas, t.id, campos, res && res._etag, t);   // C-19
    alCambiar();
    // Se sigue escribiendo en la bitacora (metrica del piloto); desde v0.11.0 no se pinta en Actividad.
    await registrarActividad('mover-tarea', `movió «${t.Title.slice(0, 80)}» de ${deNombre} a ${nombreColumnaEn(columna, cols)}`, t.ProyectoId, t.id);
    alCambiar();
    return antes;
}

async function moverTarea(id, columna) {
    const t = porId(estado.tareas, id); if (!t) return;
    if (!PUEDE.mover(estado.rol)) { avisar('Tu rol es de lectura: no puedes mover tarjetas.', 'error'); return; }
    const p = porId(estado.proyectos, t.ProyectoId);
    if (!p || p.Estado !== 'activo') { avisar('El proyecto está cerrado.', 'error'); return; }
    for (const b of $('tMover').querySelectorAll('button')) b.disabled = true;
    try {
        await ejecutarMovimiento(t, columna);
        cerrarDialogo('dlgTarea');
        avisar(`«${t.Title}» → ${nombreColumna(t)}.`, 'ok');
    } catch (e) {
        if (esConflicto(e)) { await conflicto(t); return; }
        avisar('No se pudo mover: ' + (e && e.message ? e.message : e), 'error');
        for (const b of $('tMover').querySelectorAll('button')) b.disabled = b.dataset.move === t.Columna;
    }
}

/** F11: Subir / Bajar. Renumera lo que cambie (reordenar()); cada cambio es un PATCH con If-Match. */
/** C-02/C-04: vuelve a pintar la ficha de la tarjeta abierta con el objeto VIVO de estado.tareas (tras una relectura) sin tocar la nota. */
export function repintarFicha() { const t = tarjetaAbiertaObj(); if (t && $('dlgTarea').open) pintarFicha(t); }
async function reordenarTarea(id, delta) {
    const t = porId(estado.tareas, id); if (!t) return;
    if (!PUEDE.mover(estado.rol)) { avisar('Tu rol es de lectura: no puedes reordenar.', 'error'); return; }
    const p = porId(estado.proyectos, t.ProyectoId);
    if (!p || p.Estado !== 'activo') { avisar('El proyecto está cerrado.', 'error'); return; }
    const cambios = reordenar(tareasDe(p, estado.tareas).filter(x => x.Columna === t.Columna), t.id, delta);
    if (!cambios.length) return;
    for (const b of $('tOrden').querySelectorAll('button')) b.disabled = true;
    try {
        for (const c of cambios) {
            const x = porId(estado.tareas, c.id);
            const res = await estado.cliente.actualizarRenglon(estado.siteId, L.tareas, x.id, { Orden: c.Orden }, m => avisar(m, 'ojo'), x._etag);
            aplicarVivo(estado.tareas, x.id, { Orden: c.Orden }, res && res._etag, x);   // C-19
        }
        alCambiar();
        repintarFicha();   // C-04: re-pinta sin vaciar la nota a medio escribir
        avisar(delta < 0 ? 'Subida un lugar.' : 'Bajada un lugar.', 'ok');
    } catch (e) {
        if (esConflicto(e)) { await conflicto(t); return; }
        // Los PATCH van en serie: si fallo el segundo, el primero ya aplico. Se relee para no quedar a medias.
        await pedirRelectura(); if (porId(estado.tareas, t.id)) abrirTarjeta(t.id);
        avisar('No se pudo reordenar: ' + (e && e.message ? e.message : e), 'error');
    }
}

/** v0.53.0 (opcion D): guarda el UNICO campo abierto en #tPop — un PATCH por propiedad, y la ficha se re-pinta sin cerrarse.
 *  Hasta v0.52.0 el acordeon «Editar la tarjeta» mandaba los seis campos juntos y cerraba el dialogo. */
async function guardarEdicion(ev) {
    if (ev) ev.preventDefault();
    const t = tarjetaAbiertaObj(), campo = popAbierto; if (!t || !campo) return;
    if (!PUEDE.tarea(estado.rol)) { avisar('Tu rol es de lectura: no puedes editar tarjetas.', 'error'); return; }
    const campos = {};
    if (campo === 'titulo') {
        const titulo = $('ftTitulo').value.trim();
        if (!titulo) { avisar('La tarea necesita un título.', 'error'); $('ftTitulo').focus(); return; }
        if (titulo !== t.Title) campos.Title = titulo;
    }
    if (campo === 'asignado') { const v = $('ftAsignado').value || null; if (String(t.Asignado || '').toLowerCase() !== String(v || '').toLowerCase()) campos.Asignado = v; }
    if (campo === 'prioridad') { const v = $('ftPrioridad').value || 'normal'; if (v !== (t.Prioridad || 'normal')) campos.Prioridad = v; }
    if (campo === 'vence') {
        let vence; try { vence = aIsoDia($('ftVence').value); } catch (e) { avisar(e.message, 'error'); return; }
        if (diaInput(vence) !== diaInput(t.Vence)) campos.Vence = vence;
    }
    if (campo === 'descripcion') { const v = $('ftDesc').value.trim() || null; if (v !== (t.Descripcion || null)) campos.Descripcion = v; }
    // v0.12.0: Color solo si cambio (antes de provisionar, un Color siempre presente daria 400 en toda edicion — revisor)
    if (campo === 'color') { const v = $('ftColor').dataset.valor || ''; if (v !== colorValido(t.Color)) campos.Color = v || null; }
    if (!Object.keys(campos).length) { cerrarPop(); return; }   // nada cambio: cerrar sin PATCH ni bitacora
    const cambioAsignado = 'Asignado' in campos;
    sellarAsignadoPor(campos, estado.columnasTareas, estado.cuenta.username);   // C-02 (v0.91.0): quien asigna queda en la tarjeta
    const titulo = campos.Title || t.Title || '';
    $('btnGuardarTarea').disabled = true;
    try {
        const res = await estado.cliente.actualizarRenglon(estado.siteId, L.tareas, t.id, campos, m => avisar(m, 'ojo'), t._etag);
        const tv = aplicarVivo(estado.tareas, t.id, campos, res && res._etag, t);   // C-19: la ficha se repinta con el renglon vivo
        cerrarPop();
        pintarFicha(tv);
        { const b = document.querySelector(`#dlgTarea [data-edita="${campo}"]`); if (b) b.focus(); }   // pintarFicha destruyo el lapiz viejo: el foco al nuevo (revisor)
        avisar('Tarjeta actualizada.', 'ok');
        alCambiar();
        await registrarActividad('editar-tarea', cambioAsignado && campos.Asignado ? `asignó «${titulo.slice(0, 80)}» a ${nombreDe(campos.Asignado, estado.roles)}` : `editó «${titulo.slice(0, 80)}»`, t.ProyectoId, t.id);
        alCambiar();
    } catch (e) {
        if (esConflicto(e)) { await conflicto(t); return; }
        avisar('No se pudo guardar: ' + (e && e.message ? e.message : e), 'error');
    } finally { $('btnGuardarTarea').disabled = false; }
}

async function borrarTarea() {
    const t = tarjetaAbiertaObj(); if (!t) return;
    if (!PUEDE.borrar(estado.rol)) { avisar('Solo gerencia borra tarjetas.', 'error'); return; }
    const { ok } = await confirmar({ titulo: 'Borrar la tarjeta', texto: `«${t.Title}» se borra de PROY_Tareas. Sus ligas a documentos se quedan en el proyecto. No se puede deshacer desde la app.`, ok: 'Borrar' });
    if (!ok) return;
    try {
        await estado.cliente.borrarRenglon(estado.siteId, L.tareas, t.id, m => avisar(m, 'ojo'));
        estado.tareas = estado.tareas.filter(x => x.id !== t.id);
        // Las ligas de la tarjeta se quedan en el proyecto, ya sin tarjeta (best-effort: si falla, el
        // Docs las muestra como «tarjeta #N» y nada mas).
        for (const l of estado.ligas) if (Number(l.TareaId) === t.id) {
            try { const res = await estado.cliente.actualizarRenglon(estado.siteId, L.ligas, l.id, { TareaId: null }, undefined, l._etag); aplicarVivo(estado.ligas, l.id, { TareaId: null }, res && res._etag, l); } catch (_) { /* se queda colgada */ }
        }
        cerrarDialogo('dlgTarea');
        avisar('Tarjeta borrada.', 'ok');
        alCambiar();
        await registrarActividad('borrar-tarea', `borró «${t.Title.slice(0, 80)}»`, t.ProyectoId, null);
        alCambiar();
    } catch (e) { avisar('No se pudo borrar: ' + (e && e.message ? e.message : e), 'error'); }
}

// ---------------------------------------------------------------- nueva tarea

$('ntTitulo').addEventListener('input', () => mayusculasEnVivo($('ntTitulo')));   // v0.106.0

export function abrirNuevaTarea() {
    const p = proyectoAbierto(); if (!p) return;
    if (!PUEDE.tarea(estado.rol)) { avisar('Tu rol es de lectura: no puedes crear tarjetas.', 'error'); return; }
    if (p.Estado !== 'activo') { avisar('El proyecto está cerrado.', 'error'); return; }
    opciones($('ntAsignado'), personas(), x => x, x => nombreDe(x, estado.roles), 'sin asignar');
    $('ntAsignado').value = personas().includes(estado.cuenta.username.toLowerCase()) ? estado.cuenta.username.toLowerCase() : '';
    const cols = columnasDe(p);   // v0.11.0: las cubetas de este proyecto; nace en la primera
    opciones($('ntColumna'), cols, c => c.clave, c => c.nombre, null);
    // R-03 (27-sep, Linear): en celular (las pestañas de cubeta a la vista) nace en la cubeta que se está mirando; en escritorio, en la primera.
    const enVista = estado.tab === 'tablero' && $('colTabs').offsetParent !== null && cols.some(c => c.clave === estado.colMovil);
    $('ntColumna').value = enVista ? estado.colMovil : cols[0].clave;
    $('ntTitulo').value = ''; ponerPrioridad('ntPrioridad', 'normal'); $('ntVence').value = ''; $('ntDesc').value = '';
    selectorTonos($('ntColor'), '', null, 'Color de la tarjeta');   // v0.12.0
    atajosFecha('ntVence', 'ntAtajos', p.Vence);   // C2 + D1
    abrirDialogo('dlgNuevaTarea');
    $('ntTitulo').focus();
}

/**
 * C1 (v0.5.0): «Crear y otra» guarda y deja el dialogo abierto con asignado, prioridad, columna y
 * vence puestos: capturar los 17 entregables de un frente eran 17 aperturas con todo desde cero.
 */
async function guardarNuevaTarea(ev, seguirCapturando = false) {
    if (ev) ev.preventDefault();
    const p = proyectoAbierto(); if (!p) return;
    if (!PUEDE.tarea(estado.rol)) { avisar('Tu rol es de lectura: no puedes crear tarjetas.', 'error'); return; }
    const titulo = $('ntTitulo').value.trim().toLocaleUpperCase('es-MX');   // v0.107.0 (Carlos, 25-sep): la tarea nueva siempre en MAYUSCULAS
    if (!titulo) { avisar('La tarea necesita un título.', 'error'); $('ntTitulo').focus(); return; }
    let vence;
    try { vence = aIsoDia($('ntVence').value); } catch (e) { avisar(e.message, 'error'); return; }
    const cols = columnasDe(p);
    const columna = cols.some(c => c.clave === $('ntColumna').value) ? $('ntColumna').value : cols[0].clave;
    const ahora = new Date().toISOString();
    const campos = limpiar({
        Title: titulo, ProyectoId: p.id, Columna: columna, Asignado: $('ntAsignado').value || undefined,
        Vence: vence || undefined, Prioridad: $('ntPrioridad').value, Orden: tareasDe(p, estado.tareas).filter(t => t.Columna === columna).length + 1,
        Descripcion: $('ntDesc').value.trim() || undefined, Desde: ahora, Color: $('ntColor').dataset.valor || undefined,   // v0.12.0
        HechoPor: columna === HECHO ? estado.cuenta.username : undefined, HechoEl: columna === HECHO ? ahora : undefined
    });
    if (campos.Asignado) sellarAsignadoPor(campos, estado.columnasTareas, estado.cuenta.username);   // C-02 (v0.91.0): crear ya asignada = delegarla
    // Los dos botones se apagan AQUI, dentro del alcance del `finally` que los repone: apagar
    // «Crear y otra» en su propio manejador lo dejaba muerto para siempre si la validacion de
    // arriba retornaba antes (p. ej. tarea sin titulo) — cazado por el revisor el 2026-09-12.
    $('ntGuardar').disabled = true; $('ntGuardarYOtra').disabled = true;
    try {
        const n = await estado.cliente.crearRenglon(estado.siteId, L.tareas, campos, m => avisar(m, 'ojo'));
        agregarSinDuplicar(estado.tareas, n);   // C-19
        if (seguirCapturando) {
            // Se limpia lo que cambia de una tarjeta a otra; lo demas se queda puesto a proposito.
            $('ntTitulo').value = ''; $('ntDesc').value = '';
            $('ntTitulo').focus();
        } else cerrarDialogo('dlgNuevaTarea');
        avisar(`Tarea creada en ${nombreColumnaEn(columna, cols)}.`, 'ok');
        alCambiar();
        await registrarActividad('crear-tarea', `creó «${titulo.slice(0, 80)}»${campos.Asignado ? ' para ' + nombreDe(campos.Asignado, estado.roles) : ''}`, p.id, n.id);
        alCambiar();
    } catch (e) { avisar('No se pudo crear: ' + (e && e.message ? e.message : e), 'error'); }
    finally { $('ntGuardar').disabled = false; $('ntGuardarYOtra').disabled = false; }
}

// ---------------------------------------------------------------- cubetas del proyecto (v0.11.0)
//
// Solo gerencia (es estructura del frente, como editarlo). Se edita una copia en memoria y se guarda
// de un golpe en PROY_Proyectos.Columnas (PATCH con If-Match). Reglas que el editor hace visibles:
// «Hecho» se renombra pero no se quita ni se mueve (siempre al final); una cubeta CON tarjetas no se
// quita (dice cuantas: primero se mueven); minimo 1 abierta + Hecho, maximo MAX_COLUMNAS. La clave de
// una cubeta nueva sale de su nombre y ya no cambia al renombrarla: las tarjetas no se pierden.

let cubetasEdicion = null;   // [{clave, nombre, nueva?}] mientras el dialogo esta abierto
export function abrirCubetas() {
    const p = proyectoAbierto(); if (!p) return;
    if (!PUEDE.proyecto(estado.rol)) { avisar('Solo gerencia cambia las cubetas del proyecto.', 'error'); return; }
    if (p.Estado !== 'activo') { avisar('El proyecto está cerrado.', 'error'); return; }
    cubetasEdicion = columnasDe(p);
    pintarCubetas();
    abrirDialogo('dlgCubetas');
}
function pintarCubetas() {
    const p = proyectoAbierto(); const ts = tareasDe(p, estado.tareas);
    const l = $('cbLista'); l.textContent = '';
    for (const [i, c] of cubetasEdicion.entries()) {
        const esHecho = c.clave === HECHO; const n = ts.filter(t => t.Columna === c.clave).length;
        const fila = el('div', 'cubeta' + (esHecho ? ' is-hecho' : '')); fila.dataset.cubeta = c.clave;
        const punto = el('i', 'punto is-' + claseDeColumna(c.clave, cubetasEdicion)); if (c.color) punto.dataset.tono = c.color; fila.appendChild(punto);
        const inp = el('input'); inp.value = c.nombre; inp.maxLength = MAX_NOMBRE_COLUMNA; inp.setAttribute('aria-label', `Nombre de la cubeta ${i + 1}`); inp.placeholder = 'Nombre de la cubeta';
        inp.addEventListener('input', () => { c.nombre = inp.value; });
        fila.appendChild(inp);
        fila.appendChild(el('span', 'n', n ? `${n} tarjeta${n === 1 ? '' : 's'}` : (c.nueva ? 'nueva' : 'vacía')));
        const up = boton('↑', 'mn-btn is-ghost is-sm is-icono', () => { [cubetasEdicion[i - 1], cubetasEdicion[i]] = [cubetasEdicion[i], cubetasEdicion[i - 1]]; pintarCubetas(); }, { sube: c.clave });
        up.title = 'Subir'; up.setAttribute('aria-label', 'Subir'); up.disabled = esHecho || i === 0; fila.appendChild(up);
        const dn = boton('↓', 'mn-btn is-ghost is-sm is-icono', () => { [cubetasEdicion[i + 1], cubetasEdicion[i]] = [cubetasEdicion[i], cubetasEdicion[i + 1]]; pintarCubetas(); }, { baja: c.clave });
        dn.title = 'Bajar'; dn.setAttribute('aria-label', 'Bajar'); dn.disabled = esHecho || i >= cubetasEdicion.length - 2; fila.appendChild(dn);   // la penultima no baja: abajo esta Hecho
        const q = boton('Quitar', 'mn-btn is-ghost is-sm', () => { cubetasEdicion.splice(i, 1); pintarCubetas(); }, { quita: c.clave });
        q.disabled = esHecho || n > 0 || cubetasEdicion.length <= 2;
        q.title = esHecho ? '«Hecho» no se quita: es la cubeta que cierra las tarjetas.' : n ? `Tiene ${n} tarjeta${n === 1 ? '' : 's'}: muéve${n === 1 ? 'la' : 'las'} antes de quitarla.` : cubetasEdicion.length <= 2 ? 'Hace falta al menos una cubeta abierta.' : 'Quitar esta cubeta';
        fila.appendChild(q);
        // v0.12.0: el color de la cubeta; cambia el punto al instante, se guarda con las demas.
        fila.appendChild(selectorTonos(el('div', 'tonos'), c.color, v => { c.color = v; if (v) punto.dataset.tono = v; else delete punto.dataset.tono; }, `Color de «${c.nombre || 'la cubeta'}»`));
        l.appendChild(fila);
    }
    $('cbAgregar').disabled = cubetasEdicion.length >= MAX_COLUMNAS;
    $('cbAgregar').title = cubetasEdicion.length >= MAX_COLUMNAS ? `Máximo ${MAX_COLUMNAS} cubetas.` : '';
}
function agregarCubeta() {
    if (cubetasEdicion.length >= MAX_COLUMNAS) return;
    cubetasEdicion.splice(cubetasEdicion.length - 1, 0, { clave: '', nombre: '', nueva: true });   // antes de Hecho
    pintarCubetas();
    const inputs = $('cbLista').querySelectorAll('input'); inputs[inputs.length - 2].focus();
}
async function guardarCubetas(ev) {
    ev.preventDefault();
    const p = proyectoAbierto(); if (!p || !cubetasEdicion) return;
    if (!PUEDE.proyecto(estado.rol)) { avisar('Solo gerencia cambia las cubetas del proyecto.', 'error'); return; }
    // Las claves ya usadas no cambian; una nueva nace del nombre y no puede chocar con una existente.
    const v = normalizarColumnas(cubetasEdicion.map(c => ({ clave: c.nueva ? '' : c.clave, nombre: c.nombre, color: c.color || '' })));
    if (!v.ok) { avisar('Cubetas: ' + v.motivo, 'error'); return; }
    const antes = columnasDe(p); const nuevas = v.columnas;
    const quitadas = antes.filter(c => !nuevas.some(n => n.clave === c.clave)).map(c => c.clave);
    const igual = JSON.stringify(antes) === JSON.stringify(nuevas);
    if (igual) { cerrarDialogo('dlgCubetas'); return; }
    // Vacio si son exactamente las de siempre: el default no se guarda (una lista limpia sigue leyendose igual).
    const esDefault = JSON.stringify(nuevas) === JSON.stringify(columnasDe(null));
    const campos = { Columnas: esDefault ? null : JSON.stringify(nuevas) };
    $('cbGuardar').disabled = true;
    try {
        // Al quitar una cubeta se cuenta EN VIVO (no en la copia de hace hasta 120 s): alguien pudo mover una
        // tarjeta ahi despues de la ultima relectura, y el If-Match de PROY_Proyectos no lo ve (revisor 12-sep).
        if (quitadas.length) {
            const enVivo = await estado.cliente.renglones(estado.siteId, L.tareas, `fields/ProyectoId eq ${Number(p.id)}`);
            const perdidas = enVivo.filter(t => quitadas.includes(t.Columna));
            if (perdidas.length) { avisar(`Hay ${perdidas.length} tarjeta${perdidas.length === 1 ? '' : 's'} en una cubeta que quieres quitar (alguien ${perdidas.length === 1 ? 'la' : 'las'} movió hace un momento): se releyó, muéve${perdidas.length === 1 ? 'la' : 'las'} primero.`, 'error'); await pedirRelectura(); pintarCubetas(); return; }
        }
        const res = await estado.cliente.actualizarRenglon(estado.siteId, L.proyectos, p.id, campos, m => avisar(m, 'ojo'), p._etag);
        aplicarVivo(estado.proyectos, p.id, campos, res && res._etag, p);   // C-19
        cerrarDialogo('dlgCubetas');
        estado.colMovil = null;
        avisar(`Cubetas guardadas: ${nuevas.map(c => c.nombre).join(' · ')}.`, 'ok');
        alCambiar();
        const cambio = nuevas.length !== antes.length ? `dejó ${nuevas.length} cubetas` : 'renombró u ordenó las cubetas';
        await registrarActividad('editar-proyecto', `${cambio} del proyecto «${p.Title.slice(0, 60)}»: ${nuevas.map(c => c.nombre).join(' · ').slice(0, 120)}`, p.id, null);
        alCambiar();
    } catch (e) {
        if (esConflicto(e)) { cerrarDialogo('dlgCubetas'); avisar('Alguien cambió este proyecto hace un momento: se releyó. Revisa y vuelve a intentarlo.', 'ojo'); await pedirRelectura(); return; }
        avisar('No se pudieron guardar las cubetas: ' + (e && e.message ? e.message : e), 'error');
    } finally { $('cbGuardar').disabled = false; }
}

// ---------------------------------------------------------------- enganche

export function engancharTablero() {
    leerDensidad();   // v0.20.0: lo que este dispositivo eligió la última vez
    for (const b of document.querySelectorAll('#densidad button')) b.addEventListener('click', () => fijarDensidad(b.dataset.densidad));
    $('leyendaPronto').textContent = `hoy o en ${CONFIG.semaforoDias} días`;   // la leyenda dice lo que CONFIG manda
    $('btnCubetas').addEventListener('click', abrirCubetas);   // v0.11.0
    $('formCubetas').addEventListener('submit', guardarCubetas);
    $('cbAgregar').addEventListener('click', agregarCubeta);
    $('cbCancelar').addEventListener('click', () => cerrarDialogo('dlgCubetas'));
    $('filtroTexto').addEventListener('input', () => { estado.filtroTareas.texto = $('filtroTexto').value; if (proyectoAbierto()) pintarFiltroTareas(proyectoAbierto()); pintarSoloTareas(); });
    // v0.30.0 (F3): el menu «Quién» se cierra al hacer clic fuera o con Esc (un details abierto no se cierra solo).
    // Se juzga por ANCESTRO del nodo pulsado (closest), no por contains: «Quitar el filtro» repinta en fase objetivo y cuando el
    // evento llega aqui el boton ya esta desprendido — con contains el menu nuevo se cerraba (revisor, 14-sep).
    document.addEventListener('click', e => { const m = document.querySelector('#filtroChips .menu-quien[open]'); if (m && !(e.target.closest && e.target.closest('.menu-quien'))) m.open = false; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = document.querySelector('#filtroChips .menu-quien[open]'); if (m) { m.open = false; m.querySelector('summary').focus(); } } });
    $('tCerrar').addEventListener('click', () => cerrarDialogo('dlgTarea'));
    // Al cerrar (boton, Esc o Atras) el hash vuelve a la pantalla. El evento `close` es ASINCRONO: si entre el close() y su evento ya se
    // abrio OTRA tarjeta (cerrar una y tocar la siguiente), pisaba el hash `/t/<id>` de la nueva con el de la pantalla — la E2E lo veia
    // como el intermitente «U-03: el texto de al lado abre la tarjeta de su barra» (3 veces, 16-17 sep). Solo se repone si sigue cerrado.
    $('dlgTarea').addEventListener('close', () => { if (!$('dlgTarea').open) fijarHash(hashDe()); });
    // v0.50.0 (2B): el menu de cubetas se cierra con clic fuera (por ancestro, como el menu «Quién») y con Esc — Esc con el menu
    // abierto NO cierra el dialogo. Los segmentados de prioridad (3A) se pintan una vez: el input oculto conserva el valor.
    $('dlgTarea').addEventListener('click', e => { if (!$('tMover').classList.contains('oculto') && !(e.target.closest && e.target.closest('#tMover, [data-abre-mover]'))) alternarMover(false); });
    $('dlgTarea').addEventListener('keydown', e => { if (e.key === 'Escape' && !$('tMover').classList.contains('oculto')) { e.preventDefault(); e.stopPropagation(); alternarMover(false); const a = document.querySelector('#tChips [data-abre-mover]'); if (a) a.focus(); } });
    // v0.53.0 (opcion D): el popover #tPop se cierra SIN guardar con clic fuera (por ancestro), con Cancelar y con Esc — Esc con el
    // popover abierto NO cierra el dialogo. Enter en un input guarda (el form lo hace solo); en la descripcion, Ctrl/Cmd+Enter.
    // «···» de la cabecera: clic fuera lo cierra el enganche global de .fila-menu (docs.js); Esc lo cierra aqui sin cerrar el dialogo.
    $('dlgTarea').addEventListener('click', e => {
        // Un atajo de fecha se RE-PINTA en su propio clic (atajosFecha): cuando el evento llega aqui el boton ya esta desprendido y
        // closest() no encuentra #tPop — se juzga solo lo que sigue en el DOM (la E2E lo cazo: «hoy» cerraba el popover sin guardar).
        if (!e.target.isConnected) return;
        if (popCampo() && !(e.target.closest && e.target.closest('#tPop, [data-edita]'))) cerrarPop();
        if ($('tMenu').open && !(e.target.closest && e.target.closest('#tMenu'))) $('tMenu').open = false;
    });
    $('dlgTarea').addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (popCampo()) { e.preventDefault(); e.stopPropagation(); cerrarPop(); return; }
        if ($('tMenu').open) { e.preventDefault(); e.stopPropagation(); $('tMenu').open = false; $('tMenu').querySelector('summary').focus(); }
    });
    $('tPop').addEventListener('submit', guardarEdicion);
    $('tPopCancelar').addEventListener('click', () => cerrarPop());
    $('ftDesc').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('tPop').requestSubmit(); } });
    $('tMenu').addEventListener('toggle', () => { if ($('tMenu').open) { cerrarPop(); alternarMover(false); } });
    for (const seg of document.querySelectorAll('.prio[data-prio-de]')) selectorPrioridad(seg);
    $('tCompartir').addEventListener('click', compartirTarjeta);
    $('formNota').addEventListener('submit', anotar);
    // C4: Ctrl/Cmd+Enter envia la nota (el unico envio era el boton) y el contador sigue al teclado.
    // v0.8.0: el selector de @menciones del chat tambien aqui; Ctrl+Enter lo enruta el mismo enganche.
    $('tNota').addEventListener('input', contarNota);
    engancharSelectorMenciones('tNota', 'tNotaSelector', () => $('formNota').requestSubmit());
    $('tBorrar').addEventListener('click', borrarTarea);
    // v0.103.0: en la pestaña Capital del proyecto el mismo boton es «Nueva partida», con el proyecto fijo
    $('btnNuevaTarea').addEventListener('click', () => { const p = proyectoAbierto(); if (estado.tab === 'capital' && p) abrirPartida(null, p.id); else abrirNuevaTarea(); });
    $('formNuevaTarea').addEventListener('submit', guardarNuevaTarea);
    $('ntGuardarYOtra').addEventListener('click', () => guardarNuevaTarea(null, true));   // C1
    $('ntCancelar').addEventListener('click', () => cerrarDialogo('dlgNuevaTarea'));
}
