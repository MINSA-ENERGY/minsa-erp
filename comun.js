// Lo que comparten app.js, tablero.js y docs.js: el estado, las utilerias de DOM (sin innerHTML:
// todo textContent, regla heredada de captura y planta), los avisos, el dialogo de confirmacion y
// la bitacora PROY_Actividad.

import { CONFIG } from './config.js';
import { PUEDE, nombreDe, diasPara, diaDe, estadoVence, tipoArchivo, trozosConMenciones, columnasDe, leerVisto, fundirVisto, marcaFiable, vistosDe, aliasParaMencion, activosDe, proyectosVisibles , fechaMexico } from './reglas.js';

export const VERSION = '0.121.0';
export const $ = id => document.getElementById(id);
export const L = CONFIG.listas;
/** C-13 (v0.95.0): el filtro de tarjetas vacio, en UN lugar — su forma ya cambio dos veces (quien paso a arreglo en v0.30.0, se sumo
 *  sinDueno) y vivia literal en cinco sitios de tres modulos. `extra` va encima (irASinDueno: { sinDueno: true }). */
export const filtroVacio = (extra = {}) => ({ quien: [], alta: false, vencidas: false, sinDueno: false, texto: '', ...extra });
/** Deja el filtro de tarjetas vacio (con `extra` encima) y vacia el buscador que lo refleja. */
export function limpiarFiltroTareas(extra) { estado.filtroTareas = filtroVacio(extra); $('filtroTexto').value = ''; }

export const estado = {
    cuenta: null, cliente: null, siteId: null, sesion: false, rol: 'lectura',   // C-03 (v0.87.0): `sesion` es lo que consultan timers y eventos; la enciende sesionIniciada cuando cargarTodo ya termino, antes de destapar el shell. C-06: `token` salio (nadie lo leia)
    proyectos: [], tareas: [], ligas: [], roles: [], actividad: [],
    proyectoAbiertoId: null,   // C-11 (v0.115.0): el ID del renglon de PROY_Proyectos; el objeto lo resuelve proyectoAbierto() (antes se guardaba el objeto y una relectura lo dejaba viejo)
    mensajesSel: null, buscaMensajes: '',   // v0.42.0: lo elegido en Mensajes ({t:'f'|'d', k: clave | correo}) y su buscador
    pestana: 'inicio', tab: 'tablero',
    filtroEquipo: null,
    // v0.3.0: filtro y orden dentro del proyecto (F9/F10), columna visible en celular (U5), filtro de Mis tareas (U3)
    filtroTareas: filtroVacio(),   // v0.30.0: quien es ARRAY (varias personas)
    // v0.6.0 (C3): buscador fuera del proyecto — Proyectos (nombre, clave, descripcion) y Mis tareas (titulo).
    textoProyectos: '', textoMis: '',
    // v0.5.0 (B1): en celular los chips + buscador van plegados detras de «Filtrar»; en escritorio
    // el CSS los muestra siempre y esta bandera no se nota.
    filtrosAbiertos: false,
    ordenLista: { col: 'vence', dir: 1 },
    colMovil: null,   // v0.11.0: null = la primera cubeta del proyecto abierto (antes 'por-hacer' fijo)
    filtroMis: null,
    columnasTareas: null,   // C-02 (v0.91.0): Set con los nombres internos REALES de PROY_Tareas (una lectura por sesion); AsignadoPor solo se manda si esta
    filtroMisAlLlegar: null,   // U-03 (v0.90.0): el filtro con que Inicio manda a Mis tareas; irA lo consume en esa visita
    // v0.4.0: «ver las N anteriores» de Hecho (U6), filtro de Documentos (U10), firma de la ultima carga (T3)
    hechoTodas: false,
    filtroDocs: null,
    ordenDocs: { col: 'del', dir: -1 },
    abiertasDocs: new Set(),                   // v0.52.0: ids de carpeta ABIERTAS en el arbol de Docs (0 = «Del proyecto», id de tarjeta, -1 = «sin documentos»): nace todo plegado (Carlos, 15-sep); se reinicia por proyecto. v0.33.0 guardaba las plegadas y -1 iba al reves         // v0.19.0: por la fecha del DOCUMENTO (la unica de las dos que se ve en el panel de Docs a 1366); v0.18.0: orden de la tabla de Docs del proyecto (se reinicia al cambiar de proyecto, como ordenLista)
    abiertasArchivos: new Set(),               // v0.51.0: llaves ABIERTAS del arbol de #archivos («p7», «p7/0», «p7/t12»): nace todo plegado (Carlos, 15-sep); vive la sesion, como su filtro. v0.36.0 guardaba las plegadas
    ordenArchivos: { col: 'del', dir: -1 },     // v0.19.0: idem; v0.18.0: orden de #archivos (vive la sesion, como su filtro); separado del de Docs (revisor, 13-sep)
    hoySoloMias: false,                     // v0.21.0: la cola «Hoy» de Inicio filtra a lo mio (la sesion; el default es todo el frente)
    densidad: 'comodo',                     // v0.20.0: 'comodo' | 'compacto' — tablero a una linea por tarjeta; se recuerda por dispositivo (localStorage)
    // v0.10.0: mes del calendario (YYYY-MM) y dia elegido; filtro de Archivos
    mesCal: null, calDia: null,
    filtroArchivos: { proyectoId: null, tipo: null, texto: '' },
    cargadoEl: 0,
    // Sitios de bibliotecas de unidad ya resueltos: clave -> { id, motivo }
    sitiosUnidad: {},
    // Rutas del buzon ya consultadas en esta carga: ruta -> true|false (existe)
    buzonExiste: {},
    buzonAvisado: false,   // C-03 (v0.81.0): ya se aviso una vez en esta carga que el buzon no contesta
    // v0.13.1: ids de proyecto cuya actividad esta COMPLETA en memoria (fuera de la ventana de CONFIG.actividadDias)
    actividadCompleta: new Set(),
    // v0.100.0: capital de trabajo (PROY_Capital, solo gerencia). capitalLista: null = no se sabe, true = existe, false = FALTA en el
    // sitio (se deja de preguntar en esta sesion; tras provisionar, recargar la pagina). capitalError: la ultima lectura fallo por otra cosa.
    capital: [], capitalLista: null, capitalError: null,
    filtroCapital: null,                       // id del proyecto elegido en la seccion Capital (null = todos)
    ordenCapital: { col: 'fecha', dir: 1 }
};

// ---------------------------------------------------------------- DOM

export function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = String(texto);
    return e;
}
export function vaciar(id) { $(id).textContent = ''; }
export function opciones(sel, items, valor, textoDe, primera = '— elige —') {
    sel.textContent = '';
    if (primera !== null) { const o = el('option', '', primera); o.value = ''; sel.appendChild(o); }
    for (const it of items) { const op = el('option', '', textoDe(it)); op.value = String(valor(it)); sel.appendChild(op); }
}
export function boton(texto, clase, alClic, atributos = {}) {
    const b = el('button', clase, texto); b.type = 'button';
    for (const k in atributos) b.dataset[k] = atributos[k];
    if (alClic) b.addEventListener('click', alClic);
    return b;
}
/** C-07 (mejorar-app archivos, 17-sep): la misma funcion con retardo — una llamada por rafaga de teclas del buscador;
 *  `.ahora()` cancela el temporizador y corre ya (el `change` del <input type=search>: Enter o salir del campo). */
export function conRetardo(fn, ms = 120) {
    let t = 0; const r = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    r.ahora = (...a) => { clearTimeout(t); fn(...a); };
    return r;
}
/**
 * v0.30.0 (B5): la ONDA que sale desde el punto tocado en todo .mn-btn (tambien los summary.mn-btn de
 * los menus). Un solo listener delegado en el documento; la animacion y el recorte viven en estilo.css
 * (.mn-btn .onda). Sin coordenadas (clic por teclado o .click() de las pruebas) la onda nace en el centro.
 */
export function ondaAlPulsar() {
    document.addEventListener('pointerdown', e => {
        const b = e.target.closest('.mn-btn'); if (!b || b.disabled) return;
        const r = b.getBoundingClientRect(); const d = Math.max(r.width, r.height);
        const o = el('span', 'onda'); o.style.width = o.style.height = d + 'px';
        o.style.left = ((e.clientX || r.left + r.width / 2) - r.left - d / 2) + 'px'; o.style.top = ((e.clientY || r.top + r.height / 2) - r.top - d / 2) + 'px';
        b.appendChild(o); setTimeout(() => o.remove(), 600);
    });
}
/**
 * v0.8.0: cada persona tiene SU color (Trello/Asana): el mismo correo da siempre el mismo indice sobre
 * una paleta de 8 tonos (estilo.css --av-N). Desde v0.61.0 solo lo usan las burbujas del chat (.msg[data-tono]).
 */
const AVATAR_TONOS = 8;
export function tonoDe(correo) {
    const s = String(correo || '').trim().toLowerCase(); if (!s) return 0;
    // Por POSICION en PROY_Roles (ordenada por correo, la misma lista para todos): con 8 tonos y 10
    // cuentas, un hash daba el mismo color a 2 de 3 personas en la primera captura (medido 2026-09-12).
    // Limite declarado: de la 9.a cuenta en adelante los tonos se repiten, y dar de alta un correo
    // alfabeticamente anterior corre el color de los que le siguen — es un color de apoyo, no una identidad.
    const lista = estado.roles.map(r => String(r.Title || '').trim().toLowerCase()).filter(Boolean).sort();
    const i = lista.indexOf(s);
    if (i >= 0) return (i % AVATAR_TONOS) + 1;
    let h = 0; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;   // fuera del roster: hash
    return (h % AVATAR_TONOS) + 1;
}
// v0.61.0 (Carlos, 15-sep): sin avatares en toda la app — «no me gusta como se ve». Se fue avatar(); tonoDe() se queda para el nombre de cada mensaje del chat (v0.98.0: sin burbuja).
export function chip(texto, estado2) { return el('span', 'mn-chip' + (estado2 ? ' is-' + estado2 : ''), texto); }
export function limpiar(obj) { const o = {}; for (const k in obj) if (obj[k] !== undefined && obj[k] !== '') o[k] = obj[k]; return o; }
export function porId(coleccion, id) { return coleccion.find(x => x.id === Number(id)) || null; }
/** C-11 (v0.115.0): el proyecto abierto, resuelto por id contra estado.proyectos en cada lectura (null si no hay o ya no existe). */
export function proyectoAbierto() { return estado.proyectoAbiertoId == null ? null : porId(estado.proyectos, estado.proyectoAbiertoId); }
/** C-07 (mensajes, 17-sep): el frente por su clave del hash, en UN sitio (antes app.js x2 y vistas.js x2 repetian el find). */
export const proyectoPorClave = clave => estado.proyectos.find(x => String(x.Clave || '') === String(clave || '')) || null;

// ---------------------------------------------------------------- avisos

/**
 * Un aviso REEMPLAZA al anterior: la pantalla dice el estado de la ultima accion, no la historia.
 * Es un TOAST fijo abajo (v0.2.0, U1 de la auditoria): no mueve el scroll, lo anuncia el lector de
 * pantalla (#avisos lleva role=status), el ok/info se va solo a los 4 s y el error se queda hasta
 * cerrarlo. Dentro de un dialogo abierto se pinta en su .dlg-avisos, como antes.
 */
let temporizadorAviso = 0;
/** `opts.accion` + `opts.alClic` ponen un boton en el toast («Deshacer», U7); `opts.ms` cambia cuanto dura. */
export function avisar(texto, clase = '', opts = {}) {
    limpiarAvisos();
    const d = el('div', 'mensaje' + (clase ? ' ' + clase : ''));
    d.appendChild(el('span', 'texto', texto));
    if (opts.accion) d.appendChild(boton(opts.accion, 'accion', () => { limpiarAvisos(); if (opts.alClic) opts.alClic(); }, { accion: '1' }));
    const dlg = document.querySelector('dialog[open] .dlg-avisos');
    if (dlg) { dlg.appendChild(d); return; }
    const x = boton('×', 'cerrar', limpiarAvisos); x.setAttribute('aria-label', 'Cerrar el aviso'); d.appendChild(x);
    $('avisos').appendChild(d);
    if (clase !== 'error') temporizadorAviso = setTimeout(limpiarAvisos, opts.ms || CONFIG.avisoMs);
}
/** Tras un PATCH propio el `_etag` leido ya no vale. v0.53.1: actualizarRenglon lo RELEE y lo trae en `_etag` de lo que
 *  devuelve; se pasa aqui como tercer argumento y el renglon conserva el candado. Sin el (GET fallido), se olvida hasta la
 *  siguiente lectura, como antes. `campos` se aplica sin su `_etag` por si alguien pasa la respuesta entera. */
export function aplicar(renglon, campos, etag) {
    const { _etag, ...resto } = campos || {}; Object.assign(renglon, resto);
    const e = etag || _etag; if (e) renglon._etag = String(e); else delete renglon._etag;
    return renglon;
}
// Releer las listas (la pone app.js): es lo que hace un modulo al recibir 412 — la verdad esta en SharePoint.
let releer = async () => {};
export function fijarReleer(fn) { releer = fn; }
export function pedirRelectura() { return releer(); }
export function limpiarAvisos() {
    clearTimeout(temporizadorAviso);
    $('avisos').textContent = '';
    for (const z of document.querySelectorAll('.dlg-avisos')) z.textContent = '';
}
/**
 * B8 (v0.6.0): Atras del navegador cierra CUALQUIER dialogo, no solo la tarjeta. La tarjeta ya vive
 * en el hash; los otros seis empujan una entrada de historial SIN cambiar el hash al abrirse, y
 * popstate los cierra. Al cerrar con su boton la entrada se queda (history.back() es asincrono y
 * se cruzaria con el pushState de lo que la persona abra despues — medido con la E2E): un Atras de
 * mas que no hace nada, contra el gesto de Android que sacaba de la pantalla con el dialogo abierto.
 */
export function abrirDialogo(id) {
    const d = $(id); limpiarAvisos();
    if (!d.open) {
        if (id !== 'dlgTarea') { history.pushState({ dlg: id }, '', location.href); d.dataset.enHistorial = '1'; }
        d.showModal();
    }
    d.scrollTo({ top: 0 });
}
// E4: app.js se entera SINCRONO de cada cierre (el evento `close` del <dialog> no llega bajo tiempo virtual).
let alCerrar = () => {};
export function fijarAlCerrar(fn) { alCerrar = fn; }
export function cerrarDialogo(id) {
    const d = $(id); if (d.open) { d.close(); alCerrar(id); }
    delete d.dataset.enHistorial;
    // La tarjeta vive en el hash: al cerrarla por codigo el hash vuelve AQUI, sincrono. El evento
    // `close` (Esc, Atras) lo repite en tablero.js; con tiempo virtual (E2E) ese evento llega tarde.
    if (id === 'dlgTarea') fijarHash(hashDe());
}
// U-08 (mejorar-app proyectos, 24-sep): un dialogo con guarda no se cierra con Atras si tiene algo a medio escribir:
// se re-empuja su entrada y la guarda pregunta. Si en ese Atras estaba abierta la confirmacion (#dlg), solo se cierra
// ella (= «seguir escribiendo»): la entrada del dialogo de abajo sigue en el historial.
const guardas = {};
export function fijarGuarda(id, g) { guardas[id] = g; }
window.addEventListener('popstate', () => {
    const abiertos = [...document.querySelectorAll('dialog[open][data-en-historial]')];
    const conConfirmacion = abiertos.some(d => d.id === 'dlg');
    for (const d of abiertos) {
        const g = guardas[d.id];
        if (g && conConfirmacion) continue;
        if (g && g.sucio()) { history.pushState({ dlg: d.id }, '', location.href); g.intentar(); continue; }
        delete d.dataset.enHistorial; d.close();
        if (d.id !== 'dlg') alCerrar(d.id); else if (d.onclose) d.onclose();   // U-08: #dlg resuelve YA (el `close` llega tarde bajo tiempo virtual) y la guarda puede volver a preguntar
    }
});
/** Navega como lo haria una URL pegada: escribe el hash y dispara el router (app.js escucha popstate). */
export function irAHash(h) { fijarHash(h); window.dispatchEvent(new PopStateEvent('popstate')); }

/** Confirmacion propia (sustituye al confirm() nativo). Devuelve {ok, motivo}. */
export function confirmar({ titulo, texto, ok = 'Confirmar', motivo = false, etiquetaMotivo = 'Motivo' }) {
    return new Promise(resolver => {
        const d = $('dlg');
        $('dlgTitulo').textContent = titulo;
        $('dlgTexto').textContent = texto || '';
        $('dlgOk').textContent = ok;
        $('dlgMotivoEtiqueta').textContent = etiquetaMotivo + (motivo === true ? ' · obligatorio' : '');
        $('dlgMotivoCampo').classList.toggle('oculto', !motivo);
        $('dlgMotivo').value = '';
        $('dlgError').classList.add('oculto');
        const cerrar = ok2 => {
            $('dlgOk').onclick = $('dlgCancelar').onclick = d.onclose = null;
            delete d.dataset.enHistorial;
            if (d.open) { d.close(); alCerrar('dlg'); }
            resolver({ ok: ok2, motivo: $('dlgMotivo').value.trim() });
        };
        $('dlgOk').onclick = () => {
            if (motivo === true && !$('dlgMotivo').value.trim()) { $('dlgError').classList.remove('oculto'); $('dlgMotivo').focus(); return; }
            cerrar(true);
        };
        $('dlgCancelar').onclick = () => cerrar(false);
        d.onclose = () => cerrar(false);
        $('dlgMotivo').oninput = () => $('dlgError').classList.add('oculto');
        // B8: tambien la confirmacion se cierra con Atras (popstate → close → onclose → cerrar(false)).
        history.pushState({ dlg: 'dlg' }, '', location.href); d.dataset.enHistorial = '1';
        d.showModal();
        if (motivo) $('dlgMotivo').focus();
    });
}

// ---------------------------------------------------------------- ruta (hash) — v0.2.0, F8 de la auditoria

/**
 * El hash que describe lo que esta en pantalla: #inicio · #proyectos · #mis · #p/<clave> ·
 * #p/<clave>/lista · #p/<clave>/docs, y con una tarjeta abierta se le pega /t/<id> (tambien sobre
 * #mis). Es lo que se comparte («abre esta tarjeta») y lo que sobrevive a un F5. app.js lo LEE en
 * hashchange (aplicarHash); aqui solo se ESCRIBE. La clave del proyecto es un slug estable, hecho
 * para esto.
 */
export function hashDe(tareaId) {
    let h;
    const pa = proyectoAbierto();
    if (estado.pestana === 'proyecto' && pa) {
        h = '#p/' + pa.Clave;
        if (estado.tab && estado.tab !== 'tablero') h += '/' + estado.tab;
    } else h = '#' + (estado.pestana || 'inicio');
    // v0.42.0: Mensajes lleva lo elegido (el hilo de un frente o la ficha de una persona, por su alias de @mencion)
    if (estado.pestana === 'mensajes' && estado.mensajesSel) h += estado.mensajesSel.t === 'f' ? `/f/${estado.mensajesSel.k}` : `/d/${aliasParaMencion(estado.mensajesSel.k, estado.roles) || String(estado.mensajesSel.k).split('@')[0]}`;
    // v0.100.0: Capital lleva el proyecto filtrado (#capital/f/<clave>), para que la tarjeta del Resumen y una liga pegada abran ese corte
    if (estado.pestana === 'capital' && estado.filtroCapital) { const p = porId(estado.proyectos, estado.filtroCapital); if (p && p.Clave) h += '/f/' + p.Clave; }
    if (tareaId) h += '/t/' + tareaId;
    return h;
}
/**
 * Escribe el hash con pushState (SINCRONO y sin evento): `location.hash = x` es una navegacion que
 * el navegador puede diferir y reordenar —medido en Edge headless el 2026-09-11: el close del
 * dialogo y el hash se cruzaban y la pantalla se quedaba con el hash viejo—. Atras/Adelante llegan
 * por popstate y una URL pegada por hashchange; los dos caen en aplicarHash (app.js), que es idempotente.
 */
export function fijarHash(h) { if (location.hash !== h) history.pushState(null, '', h); }
/** La liga COMPLETA de una tarjeta, siempre por su proyecto (para compartir, aunque se abra desde Mis tareas). */
export function ligaDeTarjeta(t) {
    const p = porId(estado.proyectos, t.ProyectoId);
    const base = location.href.split('#')[0];
    return p ? `${base}#p/${p.Clave}/t/${t.id}` : `${base}#mis/t/${t.id}`;
}

// ---------------------------------------------------------------- fechas (dd/mm/aaaa en pantalla, ISO en SharePoint)

/** dd/mm/aaaa. v0.21.0: un ISO con hora se lee en el dia de MEXICO (diaDe), el mismo reloj que diasPara; hasta v0.20.0 tomaba
 *  la fecha UTC del string y desde las 18:00 «Hecho el» / «cerrado el» / «ligada» imprimian MAÑANA (revisor, 13-sep). Un dia
 *  suelto (YYYY-MM-DD) se imprime tal cual. */
export function fechaCorta(iso) {
    if (!iso) return '—';
    const s = String(iso);
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
    const d = /T/.test(s) ? (diaDe(s) || s) : s;
    return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}
/** C-14 (v0.120.0): «dd/mm» de una fecha (fechaCorta sin el año). */
export const diaMes = iso => fechaCorta(iso).slice(0, 5);
export function fechaHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
/** U-04 (mensajes, 17-sep): la fecha de la bandeja — solo la hora si es de hoy, «ayer», y dd/mm (con año si no es este) para lo
 *  demas: la fecha completa se comia el titulo del frente en 390 px. Fecha invalida: «—». */
export function fechaBandeja(iso, hoy = new Date()) {
    const r = rotuloDia(iso, hoy); if (r === '—' || r === 'ayer') return r;
    if (r === 'hoy') return new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
    const d = diaDe(iso); return `${d.slice(8, 10)}/${d.slice(5, 7)}${d.slice(0, 4) !== fechaMexico(hoy).slice(0, 4) ? '/' + d.slice(0, 4) : ''}`;
}
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
/** «hoy» · «ayer» · «martes 9 sep» (con año si no es este): el separador de dia del hilo, en hora de Mexico. Vivia en chat.js;
 *  C-06/U-04 (17-sep): un solo sitio decide que es hoy y ayer (diaDe/fechaMexico de reglas.js); fecha invalida → «—». */
export function rotuloDia(iso, hoy = new Date()) {
    const d = diaDe(iso); if (!d) return '—';
    const h = fechaMexico(hoy), a = fechaMexico(new Date(hoy.getTime() - 86400000));
    if (d === h) return 'hoy'; if (d === a) return 'ayer';
    const x = new Date(d + 'T12:00:00Z');
    return `${DIAS_LARGOS[x.getUTCDay()]} ${x.getUTCDate()} ${MESES[x.getUTCMonth()]}${d.slice(0, 4) !== h.slice(0, 4) ? ' ' + x.getUTCFullYear() : ''}`;
}
/** v0.63.0: «hace 12 min» / «hace 3 h» dentro de las ultimas 24 h; mas viejo, fechaHora. Para las listas de actividad. */
export function haceCuanto(iso, ahora = new Date()) {
    if (!iso) return '—';
    const t = ahora - new Date(iso);
    if (!(t >= 0) || t >= 86400000) return fechaHora(iso);
    if (t < 60000) return 'ahora';
    if (t < 3600000) return `hace ${Math.round(t / 60000)} min`;
    return `hace ${Math.round(t / 3600000)} h`;
}
/** Acepta dd/mm/aaaa y aaaa-mm-dd. Vacio = null; otra cosa es un error que se muestra, nunca una fecha adivinada. */
export function aIsoDia(texto) {
    const s = String(texto || '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
    let y, mo, d;
    if (m) { d = +m[1]; mo = +m[2]; y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; }
    else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else throw new Error(`Fecha «${s}» no válida: elígela en el calendario (o escríbela como aaaa-mm-dd)`);
    if (y < 2000 || y > 2100) throw new Error(`Fecha «${s}» fuera de rango (año ${y}): elígela en el calendario`);   // C-08 (v0.120.0): un 2226 tecleado estiraba el roadmap a siglos
    const f = new Date(Date.UTC(y, mo - 1, d, 18));
    if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mo - 1 || f.getUTCDate() !== d) throw new Error(`Fecha «${s}» no existe: elígela en el calendario`);
    return f.toISOString();
}
/** Valor para un <input type="date"> (U9, v0.4.0): la parte de dia del ISO guardado, o vacio. */
export function diaInput(iso) { const s = String(iso || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; }
/** v0.106.0: valor para un campo de fecha de la casa (dd/mm/aaaa), o vacio. */
export function fechaInput(iso) { const s = diaInput(iso); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : ''; }
/** v0.106.0: lo escrito en un campo de fecha como aaaa-mm-dd; vacio si esta vacio o aun no es una fecha valida. */
export function diaDeCampo(texto) { try { const i = aIsoDia(texto); return i ? i.slice(0, 10) : ''; } catch { return ''; } }
/**
 * v0.106.0 (Carlos, 25-sep: «todas las fechas dd/mm/aaaa»). El <input type="date"> se pinta en el idioma del DISPOSITIVO
 * (mm/dd/yyyy en una laptop en ingles) y ni <html lang="es"> ni CSS lo cambian. El campo pasa a texto con mascara
 * dd/mm/aaaa, y un boton abre el calendario nativo (un type=date invisible) que escribe de vuelta en dd/mm/aaaa.
 * Se lee con aIsoDia, que ya aceptaba dd/mm/aaaa. Idempotente.
 */
export function campoFecha(id) {
    const inp = $(id); if (!inp || inp.dataset.fecha === '1') return;
    inp.dataset.fecha = '1'; inp.type = 'text'; inp.inputMode = 'numeric'; inp.placeholder = 'dd/mm/aaaa'; inp.maxLength = 10; inp.autocomplete = 'off';
    inp.addEventListener('input', e => {
        if (e.inputType && !e.inputType.startsWith('insert')) return;   // borrar no re-enmascara: dejaria la diagonal pegada
        if (/-/.test(inp.value)) return;   // aaaa-mm-dd pegado tal cual: aIsoDia lo acepta
        const d = inp.value.replace(/\D/g, '').slice(0, 8);
        inp.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    });
    const caja = el('span', 'fecha-campo'); inp.parentNode.insertBefore(caja, inp); caja.appendChild(inp);
    const nativo = document.createElement('input'); nativo.type = 'date'; nativo.className = 'fecha-nativa'; nativo.tabIndex = -1; nativo.setAttribute('aria-hidden', 'true');
    const b = el('button', 'mn-btn is-sm fecha-cal'); b.type = 'button'; b.title = 'Elegir en el calendario'; b.setAttribute('aria-label', 'Elegir en el calendario');
    b.appendChild(iconoSvg(['M4 6h16v14H4z', 'M4 10h16', 'M8 3v5M16 3v5']));
    b.addEventListener('click', () => { nativo.value = diaDeCampo(inp.value); try { nativo.showPicker(); } catch { nativo.focus(); nativo.click(); } });
    nativo.addEventListener('change', () => { inp.value = fechaInput(nativo.value); inp.dispatchEvent(new Event('input', { bubbles: true })); });
    caja.appendChild(nativo); caja.appendChild(b);
}
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** D1: «jue 18 sep» — el input type=date se pinta en el idioma del DISPOSITIVO (mm/dd/yyyy en una
 *  laptop en ingles) y <html lang="es"> no lo cambia; esta linea dice en el formato de la casa lo
 *  que quedo escrito. */
/** v0.25.0: la fecha como hoja de calendario —{ mes: 'oct', dia: 31 }— en el dia de Mexico (diaDe); null sin fecha. */
export function mesDia(iso) { const s = diaInput(diaDe(iso) || iso); if (!s) return null; return { mes: MESES[+s.slice(5, 7) - 1], dia: +s.slice(8, 10) }; }
export function fechaLegible(iso) {
    const s = diaInput(iso); if (!s) return '';
    const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 12));
    return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}
/**
 * C2 + D1: bajo un campo de fecha, los cuatro atajos (hoy · mañana · +7 d · fin del frente) y la
 * fecha leida en el formato de la casa. El calendario nativo obliga a navegar para «mañana».
 * `finDelFrente` es el Vence del proyecto, o null.
 */
export function atajosFecha(idInput, idCaja, finDelFrente) {
    const inp = $(idInput), caja = $(idCaja); if (!inp || !caja) return;
    // El dia se arma con los componentes LOCALES. Con `toISOString()` —que es UTC y aqui vamos
    // UTC-6— «hoy» pasaba a ser MAÑANA a partir de las 18:00 hora de México, y eso no se pinta
    // mal: se ESCRIBE mal en SharePoint (cazado por el revisor el 2026-09-12).
    const dia = n => {
        const d = new Date(); d.setDate(d.getDate() + n);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const pintar = () => {
        caja.textContent = '';
        const opciones = [['hoy', dia(0)], ['mañana', dia(1)], ['+7 d', dia(7)]];
        const fin = diaInput(finDelFrente);
        if (fin) opciones.push(['fin del frente', fin]);
        const g = el('div', 'grupo'); caja.appendChild(g);   // v0.32.0: los atajos son excluyentes -> un solo marco
        for (const [texto, valor] of opciones) {
            const b = boton(texto, diaDeCampo(inp.value) === valor ? 'is-on' : '', () => { inp.value = fechaInput(valor); pintar(); }, { fecha: valor });   // v0.106.0: el campo guarda dd/mm/aaaa
            g.appendChild(b);
        }
        // D1: con valor, la fecha leida en el formato de la casa; vacio, el formato que se espera
        // (el campo nativo enseña mm/dd/yyyy si el DISPOSITIVO esta en ingles, que es el caso que
        // motivo D1: justo cuando la persona va a teclear no habia ninguna pista).
        caja.appendChild(el('span', 'leida', diaDeCampo(inp.value) ? fechaLegible(diaDeCampo(inp.value)) : 'día/mes/año'));
    };
    // El manejador se pone UNA vez y llama al `pintar` vigente: cada apertura del dialogo trae otro
    // proyecto (otro «fin del frente»), y un `oninput = pintar` ademas pisaria cualquier otro manejador.
    inp._pintarAtajos = pintar;
    if (inp.dataset.atajos !== '1') { inp.addEventListener('input', () => inp._pintarAtajos()); inp.dataset.atajos = '1'; }
    pintar();
}
/** Chip de vencimiento de una tarea (vencida / vence pronto / vence), o null. */
export function chipVence(t) {
    const e = estadoVence(t, CONFIG.vencePronto);
    if (!e) return null;
    const d = diasPara(t.Vence);
    if (e === 'danger') return chip(`venció ${fechaCorta(t.Vence)}`, 'danger');
    if (e === 'warn') return chip(d === 0 ? 'vence hoy' : `vence ${fechaCorta(t.Vence)}`, 'warn');
    return chip(`vence ${fechaCorta(t.Vence)}`);
}

// ---------------------------------------------------------------- bitacora

/**
 * Un renglon en PROY_Actividad, DESPUES de una escritura exitosa y best-effort: si falla, la
 * accion ya quedo en su lista y solo se pierde la bitacora (se avisa en consola, no en pantalla).
 */
export async function registrarActividad(accion, frase, proyectoId, tareaId) {
    const r = {
        Title: frase.slice(0, 250), Accion: accion, Quien: estado.cuenta.username, Cuando: new Date().toISOString(),
        ProyectoId: proyectoId ? Number(proyectoId) : undefined, TareaId: tareaId ? Number(tareaId) : undefined
    };
    try {
        const n = await estado.cliente.crearRenglon(estado.siteId, L.actividad, limpiar(r));
        estado.actividad.unshift(n);
    } catch (e) { console.warn('no se pudo registrar la actividad:', e && e.message ? e.message : e); }
}

/**
 * v0.11.0 (Carlos, 12-sep): los movimientos («de Por hacer a En curso») NO se ensenan en ninguna lista de
 * actividad — se siguen escribiendo en PROY_Actividad (bitacora y metrica del piloto), solo no se pintan.
 */
export const actividadVisible = () => estado.actividad.filter(a => a.Accion !== 'mover-tarea' && a.Accion !== 'visto');   // v0.15.0: los ✓ tampoco son actividad

// ---------------------------------------------------------------- actividad acotada (v0.13.1, auditoria de rendimiento)
//
// PROY_Actividad es la unica lista que crece sin tope (un renglon por accion, nunca se poda) y antes se bajaba
// ENTERA cada 120 s por cada persona conectada. Ahora la carga trae solo los ultimos CONFIG.actividadDias, y el
// proyecto que se abre se COMPLETA una vez por carga con todo su historial (ProyectoId esta indexada): el chat y
// las notas de una tarjeta vieja no pierden nada, y lo global (Inicio, Mensajes, Reportes) ya miraba ventanas
// mas cortas que esa. Lo que llega se FUSIONA por id, nunca se duplica, y queda ordenado del mas nuevo al mas viejo.

/** Mete `nuevos` en estado.actividad sin duplicar (por id) y deja la lista ordenada por Cuando desc. */
export function fusionarActividad(nuevos) {
    const vistos = new Set(estado.actividad.map(a => a.id));
    let sumo = 0;
    for (const a of nuevos || []) if (!vistos.has(a.id)) { vistos.add(a.id); estado.actividad.push(a); sumo++; }
    if (sumo) estado.actividad.sort((a, b) => String(b.Cuando || '').localeCompare(String(a.Cuando || '')) || b.id - a.id);
    return sumo;
}
/**
 * Trae TODA la actividad de un proyecto si aun no esta completa en esta carga. Devuelve true si trajo algo
 * nuevo (quien llama repinta). Best-effort: un fallo de red deja la ventana que ya habia, no tira la pantalla.
 */
export async function asegurarActividadDe(proyectoId) {
    const id = Number(proyectoId);
    if (!id || !estado.cliente || !estado.sesion || estado.actividadCompleta.has(id)) return false;
    if (!(CONFIG.actividadDias > 0)) { estado.actividadCompleta.add(id); return false; }   // se leyo entera
    try {
        const filas = await estado.cliente.renglones(estado.siteId, L.actividad, `fields/ProyectoId eq ${id}`);
        estado.actividadCompleta.add(id);
        return fusionarActividad(filas) > 0;
    } catch (e) { console.warn('no se pudo completar la actividad del proyecto', id, e && e.message ? e.message : e); return false; }
}

// Indices por tarjeta, calculados UNA vez por pintada (v0.13.1): la cara de cada tarjeta preguntaba «cuantas notas
// tiene» recorriendo toda la actividad y «cuantas ligas» recorriendo todas las ligas — O(tarjetas x renglones) en
// cada repintado, cada 120 s. La llave es la identidad y el largo de la lista: toda escritura la cambia.
let idxNotas = { lista: null, n: -1, mapa: new Map() }, idxLigas = { lista: null, n: -1, mapa: new Map() };
function indice(idx, lista, llaveDe, cuenta) {
    if (idx.lista !== lista || idx.n !== lista.length) {
        idx.lista = lista; idx.n = lista.length; idx.mapa = new Map();
        for (const x of lista) { if (!cuenta(x)) continue; const k = Number(llaveDe(x)); if (!k) continue; idx.mapa.set(k, (idx.mapa.get(k) || 0) + 1); }
    }
    return idx.mapa;
}
/** Map tareaId -> cuantas notas (Accion=comentar con TareaId). */
export const notasPorTarea = () => indice(idxNotas, estado.actividad, a => a.TareaId, a => a.Accion === 'comentar');
/** Map tareaId -> cuantas ligas. */
export const ligasPorTarea = () => indice(idxLigas, estado.ligas, l => l.TareaId, () => true);
/** ¿La tarjeta tiene alguna liga de tipo buzon? (indice aparte, misma llave). */
let idxBuzon = { lista: null, n: -1, mapa: new Map() };
export const buzonPorTarea = () => indice(idxBuzon, estado.ligas, l => l.TareaId, l => l.Tipo === 'buzon');

/** Las cubetas del proyecto de una tarjeta (v0.11.0); sin proyecto en memoria, el default. */
export function columnasDeTarea(t) { return columnasDe(porId(estado.proyectos, t && t.ProyectoId)); }

/** Frase de un renglon de actividad para las listas de «actividad reciente»: «Lorena movió …»; una nota va entre comillas. */
export function fraseActividad(a) {
    const quien = nombreDe(a.Quien, estado.roles).split(' ')[0];
    return a.Accion === 'comentar' ? `${quien} ${verboComentario(a)}: «${a.Title}»` : `${quien} ${a.Title}`;
}
/** v0.8.0: la nota de una tarjeta se «anota»; el comentario del chat del proyecto (sin tarjeta) se «comenta». */
export function verboComentario(a) { return a.TareaId ? 'anotó' : 'comentó'; }
/** Las notas de una tarjeta (Accion=comentar), de la mas vieja a la mas nueva. */
export function notasDe(tareaId) {
    return estado.actividad.filter(a => a.Accion === 'comentar' && Number(a.TareaId) === Number(tareaId))
        .sort((a, b) => String(a.Cuando || '').localeCompare(String(b.Cuando || '')));
}

/** Equipo (config) de un proyecto. */
// C-03 (mejorar-app, 16-sep): los tres atajos sobre `estado` que app.js y vistas.js tenian cada uno por su cuenta.
export const activos = () => activosDe(estado.proyectos);
export const visibles = () => proyectosVisibles(estado.proyectos, estado.filtroEquipo);
export const nombreEquipoFiltrado = () => estado.filtroEquipo ? equipoDe({ Equipo: estado.filtroEquipo }).nombre : '';
// C-06 (mejorar-app proyecto, 17-sep): las cuentas activas del directorio, en minusculas — tablero.js, chat.js y app.js
// traian cada uno su copia literal (menciones, asignado, filtro).
export const personasActivas = () => estado.roles.filter(r => r.Activo !== false).map(r => String(r.Title || '').toLowerCase()).filter(Boolean);
/** C-06: el contador «N/max» de un cuadro de texto acotado (nota de tarjeta y chat): aparece desde `aviso` y va en rojo al tope. */
/** v0.105.0 (Carlos, 25-sep): MAYUSCULAS mientras se teclea, conservando el cursor. Proyecto, tarea nueva y partida (v0.107.0). */
export function mayusculasEnVivo(inp) {
    const v = inp.value.toLocaleUpperCase('es-MX'); if (v === inp.value) return;
    const [a, b] = [inp.selectionStart, inp.selectionEnd]; inp.value = v; inp.setSelectionRange(a, b);
}

export function contadorTexto(idInput, idCont, max, aviso) {
    const n = $(idInput).value.length; const c = $(idCont);
    c.textContent = n >= aviso ? `${n}/${max}` : '';
    c.classList.toggle('is-danger', n >= max);
}
export function equipoDe(p) { return CONFIG.equipos.find(e => e.clave === (p && p.Equipo)) || { clave: p && p.Equipo, nombre: (p && p.Equipo) || 'Sin equipo', unidad: null, rama: null, color: 'var(--status-idle-solid)', icono: ['M12 8v4M12 16h.01', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'] }; }
/**
 * v0.7.0: el equipo se ve por su ICONO + COLOR, no por su nombre (Carlos, 2026-09-12). Un <span class="eqi">
 * con el SVG armado por DOM (createElementNS: la CSP prohibe innerHTML y aqui no se usa en ningun lado), el
 * color del equipo en `--c` y el nombre en `title` y `aria-label`, que es donde vive para el lector de pantalla.
 * `tam`: 'sm' (24 px, listas densas) · '' (30 px) · 'lg' (40 px, cabecera del proyecto).
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
export function iconoEquipo(eq, tam = '') {
    const w = el('span', 'eqi' + (tam ? ' is-' + tam : ''));
    w.style.setProperty('--c', eq.color); w.title = eq.nombre; w.setAttribute('role', 'img'); w.setAttribute('aria-label', eq.nombre); w.dataset.equipo = eq.clave;
    const svg = document.createElementNS(SVG_NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    for (const d of eq.icono || []) { const path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('d', d); svg.appendChild(path); }
    w.appendChild(svg);
    return w;
}

/** Un <svg> de trazos (viewBox 24) armado por DOM, para insignias y botones (v0.8.0). */
export function iconoSvg(trazos, clase = '') {
    const svg = document.createElementNS(SVG_NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    if (clase) svg.setAttribute('class', clase);
    for (const d of trazos) { const path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('d', d); svg.appendChild(path); }
    return svg;
}
export const TRAZOS = {
    burbuja: ['M21 12a8 8 0 0 1-11.6 7.1L4 21l1.6-4.5A8 8 0 1 1 21 12z'],
    clip: ['M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8'],
    arroba: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M16 8v5.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5'],
    enviar: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z'],
    tarjeta: ['M4 5h16v14H4z', 'M8 10h8M8 14h5'],
    basura: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],   // v0.9.0: borrar comentario/nota
    lapiz: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],   // v0.53.0: el valor editable de la ficha
    // v0.69.0: los Documentos de la ficha — la tachita de «Quitar» y los tres botones cortos (Ligar · Subir · Enlace)
    cerrar: ['M18 6L6 18', 'M6 6l12 12'],
    liga: ['M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1'],
    subir: ['M12 16V4', 'M6 10l6-6 6 6', 'M4 20h16'],
    globo: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18']
};
/** Insignia «icono + numero» para la cara de la tarjeta (Trello): notas, documentos, menciones. */
export function insignia(trazos, n, titulo, clase = '') {
    const s = el('span', 'insig' + (clase ? ' ' + clase : '')); s.title = titulo; s.setAttribute('aria-label', titulo);
    s.appendChild(iconoSvg(trazos)); s.appendChild(el('span', '', String(n)));
    return s;
}

// ---------------------------------------------------------------- icono de archivo (v0.8.0)

/**
 * El icono de un documento en lugar de su extension escrita («.docx», «.pdf»): hoja con la esquina
 * doblada y, adentro, la marca del tipo — el color hace el trabajo (PDF rojo, Word azul, Excel verde,
 * PowerPoint naranja, imagen, correo, plano, comprimido); el lote del buzon es una carpeta y el enlace
 * una cadena. Todo por DOM (CSP sin innerHTML). `title` y `aria-label` llevan el tipo escrito; la
 * extension sigue viva en el nombre del archivo y en la ruta.
 */
const HOJA = 'M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z';
const DOBLEZ = 'M14 2l5 5h-5z';   // v0.27.0: hoja SOLIDA (Carlos, 14-sep): el doblez es un triangulo relleno mas claro, no un trazo
const MARCAS = {
    pdf: [],   // la marca es el texto «PDF» (abajo); las letras dibujadas se leian «PD»
    word: ['M8 11l1.5 6 1.5-4.5 1.5 4.5 1.5-6'],
    excel: ['M9 11l6 6M15 11l-6 6'],
    ppt: ['M9 17v-6h2.5a1.75 1.75 0 0 1 0 3.5H9'],
    imagen: ['M8 17l3-3 2 2 3-4 2 3', 'M9.5 11.5h.01'],
    correo: ['M7 11h10v6H7z', 'M7 11l5 3.5 5-3.5'],
    plano: ['M7 17l3-9 4 6 3-3', 'M7 17h10'],
    zip: ['M12 10v1M12 13v1M12 16v1'],
    texto: ['M8 11h8M8 14h8M8 17h5'],
    archivo: ['M8 13h8M8 16h5']
};
const CARPETA = ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'];
const CADENA = ['M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1'];
export function iconoArchivo(nombre, tipoLiga = null, tam = '') {
    const t = tipoArchivo(nombre, tipoLiga);
    const w = el('span', 'fico is-' + t.clave + (tam ? ' is-' + tam : ''));
    w.title = t.etiqueta; w.setAttribute('role', 'img'); w.setAttribute('aria-label', t.etiqueta); w.dataset.tipo = t.clave;
    const svg = document.createElementNS(SVG_NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const trazos = t.clave === 'lote' ? CARPETA : t.clave === 'enlace' ? CADENA : [HOJA, DOBLEZ, ...(MARCAS[t.clave] || MARCAS.archivo)];
    for (const [i, d] of trazos.entries()) {
        const path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('d', d);
        // cuerpo (relleno del color) · doblez (relleno claro) · marca (trazo blanco encima); el enlace es solo trazo
        if (t.clave !== 'enlace') path.setAttribute('class', i === 0 ? 'cuerpo' : i === 1 && t.clave !== 'lote' ? 'doblez' : 'marca');
        svg.appendChild(path);
    }
    if (t.clave === 'pdf') { const tx = document.createElementNS(SVG_NS, 'text'); tx.setAttribute('x', '12'); tx.setAttribute('y', '17.5'); tx.setAttribute('class', 'letras'); tx.textContent = 'PDF'; svg.appendChild(tx); }
    w.appendChild(svg);
    return w;
}

// ---------------------------------------------------------------- comentarios y menciones (v0.8.0)

/**
 * Un texto con sus @menciones como chips: quien fue mencionado se ve (y su nombre completo va en el
 * title). La mencion de la persona que mira lleva `is-yo`. Sin innerHTML: nodos de texto + <span>.
 */
export function textoConMenciones(texto, yo = estado.cuenta && estado.cuenta.username, conEnlaces = true) {
    const f = document.createDocumentFragment();
    for (const tr of trozosConMenciones(texto, estado.roles)) {
        // v0.9.0: `conEnlaces=false` cuando el texto va DENTRO de un boton (renglones de actividad): un <a> anidado es invalido y dispararia dos acciones.
        if (!tr.mencion) { f.appendChild(conEnlaces ? textoConEnlaces(tr.texto) : document.createTextNode(tr.texto)); continue; }
        const m = el('span', 'mencion' + (yo && tr.mencion === String(yo).toLowerCase() ? ' is-yo' : ''), tr.texto);
        m.title = nombreDe(tr.mencion, estado.roles); m.dataset.mencion = tr.mencion;
        f.appendChild(m);
    }
    return f;
}
/**
 * v0.9.0: una direccion https:// pegada en el chat o en una nota se abre con un clic (antes era texto
 * plano y habia que copiarla). Solo http(s), en pestana nueva, sin `opener`; la puntuacion pegada al
 * final («…pdf.», «…aspx)») se queda fuera del enlace. El texto visible es la URL tal cual.
 */
const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
export function textoConEnlaces(texto) {
    const f = document.createDocumentFragment(); const s = String(texto || '');
    let i = 0;
    for (const m of s.matchAll(URL_RE)) {
        let url = m[0]; const cola = /[.,;:!?)\]]+$/.exec(url); if (cola) url = url.slice(0, -cola[0].length);
        if (m.index > i) f.appendChild(document.createTextNode(s.slice(i, m.index)));
        const a = el('a', 'enlace', url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'Abrir en otra pestaña';
        f.appendChild(a); i = m.index + url.length;
    }
    if (i < s.length) f.appendChild(document.createTextNode(s.slice(i)));
    return f;
}

/**
 * v0.9.0: borrar un comentario (del chat o la nota de una tarjeta). Lo borra quien lo escribio o
 * gerencia, y solo si el proyecto sigue activo (cerrado = registro). No hay renglon de bitacora del
 * borrado: `Accion` es una columna de opciones y una nueva obliga a re-provisionar; el renglon va a
 * la papelera del sitio de SharePoint, de donde un administrador lo recupera.
 */
export function puedeBorrarComentario(c, p) {
    if (!c || !estado.cuenta) return false;
    const proyecto = p || porId(estado.proyectos, c.ProyectoId);
    if (!proyecto || proyecto.Estado !== 'activo') return false;
    if (estado.rol === 'gerencia') return true;
    return PUEDE.tarea(estado.rol) && String(c.Quien || '').toLowerCase() === String(estado.cuenta.username).toLowerCase();
}
export async function borrarComentario(c, p) {
    if (!puedeBorrarComentario(c, p)) { avisar('Solo quien lo escribió o gerencia borran un comentario.', 'error'); return false; }
    const ajeno = String(c.Quien || '').toLowerCase() !== String(estado.cuenta.username).toLowerCase();
    const { ok } = await confirmar({
        titulo: c.TareaId ? 'Borrar la nota' : 'Borrar el comentario', ok: 'Borrar',
        texto: `«${String(c.Title || '').slice(0, 120)}»${ajeno ? ` — lo escribió ${nombreDe(c.Quien, estado.roles)}.` : ''} Desaparece del hilo para todos; queda en la papelera del sitio.`
    });
    if (!ok) return false;
    try {
        await estado.cliente.borrarRenglon(estado.siteId, L.actividad, c.id, m => avisar(m, 'ojo'));
        // v0.15.0: sus ✓ se van con el (best-effort; si alguno falla queda invisible, actividadVisible los filtra).
        const vs = vistosDe(estado.actividad, c.id);
        for (const v of vs) { try { await estado.cliente.borrarRenglon(estado.siteId, L.actividad, v.id); } catch (_) {} }
        const fuera = new Set([c.id, ...vs.map(v => v.id)]);
        estado.actividad = estado.actividad.filter(a => !fuera.has(a.id));
        avisar(c.TareaId ? 'Nota borrada.' : 'Comentario borrado.', 'ok');
        return true;
    } catch (e) { avisar('No se pudo borrar: ' + (e && e.message ? e.message : e), 'error'); return false; }
}

/**
 * v0.9.0: «nuevos desde tu última visita». Por proyecto se guarda en este dispositivo (localStorage)
 * el `Cuando` del comentario mas nuevo que la persona ya tuvo en pantalla; lo escrito por otros
 * despues de esa marca es «nuevo» (punto en la pestana Chat, raya en el hilo). Sin la marca (primera
 * vez, o el navegador no guarda) nada es nuevo: mejor callar que gritar todo.
 */
const LLAVE_VISTO = pid => `proy.chatVisto.${pid}`;
const LLAVE_VISTO_INICIO = 'proy.inicioVisto';
const leerLocal = k => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
let vistoLocalVersion = 0;   // C-04: cada escritura local invalida el indice de nuevos por proyecto
const guardarLocal = (k, v) => { vistoLocalVersion++; try { localStorage.setItem(k, v); } catch (_) {} };
// ...y la escritura de OTRA pestaña del mismo navegador llega por `storage` (revisor 17-sep: sin esto la insignia contaba «nuevos»
// ya leidos en la otra pestaña hasta el siguiente refresco). El evento no se dispara en la pestaña que escribe.
if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (e.key && e.key.startsWith('proy.')) vistoLocalVersion++; });
/**
 * v0.15.0: la marca es COMPARTIDA entre los dispositivos de la misma persona. Vive en su renglon de
 * PROY_Roles (columna Visto, JSON) y localStorage queda como cache: se lee la fecha mayor de las dos y se
 * escribe en las dos. La escritura al tenant se agrupa (1.5 s) y es best-effort: sin la columna (400) o sin permiso
 * sobre el renglon (403: Miembros en solo lectura sobre PROY_Roles, la guarda contra subirse de rol; v0.73.0, S-04) se
 * apaga para esta carga y todo sigue por dispositivo, como en v0.9.0.
 */
export const miRenglonRol = () => { const yo = String(estado.cuenta && estado.cuenta.username || '').toLowerCase(); return (estado.roles || []).find(r => String(r.Title || '').toLowerCase() === yo) || null; };
const vistoCompartido = () => { const r = miRenglonRol(); return leerVisto(r && r.Visto); };
export function chatVistoHasta(pid) { const local = leerLocal(LLAVE_VISTO(pid)); const c = vistoCompartido().chat[String(pid)] || ''; return c > local ? c : local; }
export function inicioVistoHasta() { const local = leerLocal(LLAVE_VISTO_INICIO); const c = vistoCompartido().inicio; return c > local ? c : local; }
// S-12 (24-sep): la marca nunca sube por encima de la hora actual (un Cuando del futuro la dejaba arriba para siempre)
export function marcarChatVisto(pid, iso) { iso = iso && marcaFiable(iso); if (!iso || !(iso > chatVistoHasta(pid))) return; guardarLocal(LLAVE_VISTO(pid), iso); encolarVisto({ chat: { [String(pid)]: iso } }); }
export function marcarInicioVisto(iso) { iso = iso && marcaFiable(iso); if (!iso || !(iso > inicioVistoHasta())) return; guardarLocal(LLAVE_VISTO_INICIO, iso); encolarVisto({ inicio: iso }); }
let vistoPendiente = null, vistoTimer = 0, vistoApagado = false;
function encolarVisto(cambio) { vistoPendiente = fundirVisto(vistoPendiente || {}, cambio); clearTimeout(vistoTimer); vistoTimer = setTimeout(guardarVisto, 1500); }
/** Manda al tenant lo encolado (app.js lo llama tambien al ocultarse la pagina). Devuelve true si escribio. */
export async function guardarVisto() {
    clearTimeout(vistoTimer);
    const r = miRenglonRol(); const cambio = vistoPendiente; vistoPendiente = null;
    if (!r || !cambio || vistoApagado || !estado.cliente || !estado.sesion) return false;
    // Dos dispositivos de la misma persona escriben el mismo renglon: se RELEE antes de fundir (la copia local
    // puede tener minutos) y se manda con If-Match; un 412 (alguien escribio en medio) se reintenta una vez (revisor, 13-sep).
    for (let intento = 0; intento < 2; intento++) {
        let fresco = r;
        try { const f = await estado.cliente.renglones(estado.siteId, L.roles, `fields/Title eq '${String(r.Title || '').replace(/'/g, "''")}'`); if (f && f.length) fresco = f.find(x => x.id === r.id) || f[0]; } catch (_) { /* sin red o 400: se funde con la copia local */ }
        const celda = JSON.stringify(fundirVisto(fresco.Visto, cambio));
        if (celda === String(fresco.Visto || '')) { r.Visto = fresco.Visto; return false; }
        try { const res = await estado.cliente.actualizarRenglon(estado.siteId, L.roles, r.id, { Visto: celda }, undefined, fresco._etag); aplicar(r, { Visto: celda }, res && res._etag); return true; }
        catch (e) {
            if (e && e.status === 412 && intento === 0) continue;
            if (e && (e.status === 400 || e.status === 403)) vistoApagado = true;
            console.warn('la marca de lectura compartida no se guardó:', e && e.message ? e.message : e); return false;
        }
    }
    return false;
}
/** Solo para pruebas: si la escritura compartida se apago en esta carga. */
export const vistoCompartidoApagado = () => vistoApagado;

/**
 * v0.15.0: la reaccion ✓ «visto» a un comentario del chat — un renglon Accion=visto con Title = id del
 * comentario, uno por persona; volver a pulsar lo quita (se borra). Contesta «¿ya viste el oficio?» sin escribir.
 */
export const vistosDeComentario = c => vistosDe(estado.actividad, c && c.id);
export function miVistoDe(c) { const yo = String(estado.cuenta && estado.cuenta.username || '').toLowerCase(); return vistosDeComentario(c).find(a => String(a.Quien || '').toLowerCase() === yo) || null; }
export const puedeMarcarVisto = (c, p) => !!c && !!p && p.Estado === 'activo' && PUEDE.tarea(estado.rol) && String(c.Quien || '').toLowerCase() !== String(estado.cuenta && estado.cuenta.username || '').toLowerCase();
export async function alternarVisto(c, p) {
    if (!puedeMarcarVisto(c, p)) { avisar('Tu rol es de lectura o el proyecto está cerrado: no puedes marcar visto.', 'error'); return false; }
    const mio = miVistoDe(c);
    try {
        if (mio) { await estado.cliente.borrarRenglon(estado.siteId, L.actividad, mio.id, m => avisar(m, 'ojo')); estado.actividad = estado.actividad.filter(a => a.id !== mio.id); }
        else {
            const n = await estado.cliente.crearRenglon(estado.siteId, L.actividad, { Title: String(c.id), Accion: 'visto', Quien: estado.cuenta.username, Cuando: new Date().toISOString(), ProyectoId: Number(p.id) }, m => avisar(m, 'ojo'));
            fusionarActividad([n]);   // C-03 (mensajes, 17-sep): un refresco a medio POST ya lo pudo traer; unshift lo duplicaba
        }
        return true;
    } catch (e) { avisar('No se pudo marcar: ' + (e && e.message ? e.message : e), 'error'); return false; }
}
export function comentariosNuevos(pid, desde = chatVistoHasta(pid)) {
    if (!desde) return [];
    const yo = String(estado.cuenta && estado.cuenta.username || '').toLowerCase();
    return comentariosDe(pid).filter(c => String(c.Cuando || '') > desde && String(c.Quien || '').toLowerCase() !== yo);
}
// C-04 (mensajes, 17-sep): Map pid -> cuantos comentarios nuevos, calculado UNA vez por pintada con el patron de indice():
// pintarMensajes lo preguntaba 3 veces por proyecto y pintarInsignias otra en toda pantalla, y cada pregunta leia localStorage,
// parseaba el Visto compartido y filtraba+ordenaba toda la actividad. La llave: identidad y largo de la actividad, la cuenta, la
// celda Visto de mi renglon y el contador de escrituras locales — todo lo que mueve el resultado. Cuenta, no lista: el hilo,
// que necesita los ids (la raya «nuevos»), sigue con comentariosNuevos al entrar.
let idxNuevos = { lista: null, n: -1, llave: '', mapa: new Map() };
export function nuevosPorProyecto() {
    const lista = estado.actividad; const r = miRenglonRol();
    const llave = `${vistoLocalVersion}|${String(estado.cuenta && estado.cuenta.username || '')}|${r ? String(r.Visto || '') : ''}`;
    if (idxNuevos.lista !== lista || idxNuevos.n !== lista.length || idxNuevos.llave !== llave) {
        idxNuevos = { lista, n: lista.length, llave, mapa: new Map() };
        const yo = String(estado.cuenta && estado.cuenta.username || '').toLowerCase();
        const comp = vistoCompartido().chat, desde = new Map();
        for (const a of lista) {
            if (a.Accion !== 'comentar' || String(a.Quien || '').toLowerCase() === yo) continue;
            const pid = Number(a.ProyectoId); if (!pid) continue;
            if (!desde.has(pid)) { const local = leerLocal(LLAVE_VISTO(pid)), c = comp[String(pid)] || ''; desde.set(pid, c > local ? c : local); }
            const d = desde.get(pid); if (!d || !(String(a.Cuando || '') > d)) continue;
            idxNuevos.mapa.set(pid, (idxNuevos.mapa.get(pid) || 0) + 1);
        }
    }
    return idxNuevos.mapa;
}
/** Cuantos comentarios nuevos tiene el proyecto (del indice de arriba). */
export const nuevosDe = pid => nuevosPorProyecto().get(Number(pid)) || 0;
/**
 * El hilo de un proyecto (chat, v0.8.0): TODOS los renglones Accion=comentar del proyecto —los del
 * proyecto entero (sin TareaId) y las notas de sus tarjetas—, del mas viejo al mas nuevo. Es una sola
 * conversacion por frente; la nota de una tarjeta sale con su chip para abrirla.
 */
export function comentariosDe(proyectoId) {
    return estado.actividad.filter(a => a.Accion === 'comentar' && Number(a.ProyectoId) === Number(proyectoId))
        .sort((a, b) => String(a.Cuando || '').localeCompare(String(b.Cuando || '')) || a.id - b.id);
}
/** Comentarios (de cualquier proyecto) que mencionan a `correo`, del mas nuevo al mas viejo, no escritos por esa persona. */
export function mencionesA(correo, dias = CONFIG.mencionesDias) {
    const yo = String(correo || '').toLowerCase();
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    return estado.actividad.filter(a => a.Accion === 'comentar' && String(a.Quien || '').toLowerCase() !== yo
        && String(a.Cuando || '') >= desde && trozosConMenciones(a.Title, estado.roles).some(t => t.mencion === yo));
}
