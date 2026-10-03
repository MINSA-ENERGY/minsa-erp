// MINSA ERP v1.0.0 — el BUSCADOR GLOBAL (rediseño 2026-10-02, cubeta 4; plan «Buscador global»; supera «buscador global no» del 12-sep y
// «Ctrl+K NO» del 11-sep). La lupa del rail (y la de la barra del celular), la tecla `/` y Ctrl+K abren #dlgBuscar con el input de la maqueta.
//   · Índice LOCAL normalizado sin acentos (reglas.js indiceBusqueda / buscarEnIndice, con prueba): pantallas y reportes que el rol ve (las
//     entradas del panel), proyectos, tareas, archivos ligados, personas del equipo, órdenes de compra, expedientes y vigencias (estos tres
//     solo si el rol ve su módulo y el JSON ya se leyó: la apertura pide la lectura única de la sesión).
//   · Además, desde 3 letras y con retardo, la búsqueda por nombre de «Ligar» (docs.js buscarEnBibliotecas) en cada biblioteca con permiso;
//     las de 403 no se pintan. Sus resultados abren el archivo en SharePoint (pestaña nueva).
//   · Resultados agrupados (combobox → listbox): ↑ ↓ mueven, Enter abre, Esc cierra. `/` y Ctrl+K NO se roban cuando el foco está en un
//     campo de texto; en Proyectos `/` sigue siendo su buscador (R-04, v0.mejorar-app del 29-sep).
// Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { MODULOS, modulosDe, indiceBusqueda, buscarEnIndice, GRUPOS_BUSQUEDA, ordenarProyectos, nombreDe, hrefSeguro, HECHO } from './reglas.js';
import { $, estado, el, iconoEquipo, iconoArchivo, abrirDialogo, cerrarDialogo, porId, equipoDe, conRetardo } from './comun.js';
import { arbolDe, cerrarHoja } from './armazon.js';
import { buscarEnBibliotecas } from './docs.js';
import { archivosDe } from './archivos.js';   // v1.0.0 (cubeta 5): los archivos ya leídos de las carpetas de ERP_Proyectos
import { datosPublicados } from './inicio.js';
import { abrirCargaPersona } from './vistas.js';
import { conceptoDe } from './compras-reglas.js';
import { fechaVigencia } from './vigencias-reglas.js';
import { fechaCorta as fechaServicio } from './servicios-reglas.js';

let nav = { irARuta: () => {}, abrirProyecto: () => {} };
const NOMBRE_MODULO = { ...Object.fromEntries(MODULOS.map(m => [m.clave, m.nombre])), cuenta: 'Cuenta' };
const MIN_REMOTO = 3, TOPE = 6;

// ---------------------------------------------------------------- el índice local (se arma al abrir y en cada búsqueda: los datos cambian)

/** Las entradas del índice para el rol de la sesión (ver indiceBusqueda en reglas.js). */
export function entradasLocales() {
    const xs = [], vistas = new Set();
    for (const m of [...modulosDe(estado.rol).map(x => x.clave), 'cuenta'])
        for (const g of arbolDe(m)) if (!g.oculto) for (const e of g.entradas) if (e.ir && !e.oculto && !e.eq && !vistas.has(e.ir)) {
            vistas.add(e.ir); xs.push({ grupo: 'Pantallas y reportes', texto: e.texto, sub: `${NOMBRE_MODULO[m]} · ${g.titulo}`, ir: e.ir, extra: g.titulo });
        }
    for (const p of ordenarProyectos(estado.proyectos)) {
        const eq = equipoDe(p);
        xs.push({ grupo: 'Proyectos', texto: p.Title, sub: `${p.Estado === 'cerrado' ? 'Proyecto cerrado' : 'Proyecto'} · ${eq.nombre}`, ir: `#p/${p.Clave}`, eq, extra: [p.Clave, p.Descripcion], orden: p.Estado === 'cerrado' ? 1 : 0 });
    }
    for (const t of estado.tareas) {
        const p = porId(estado.proyectos, t.ProyectoId); if (!p) continue;
        xs.push({ grupo: 'Tareas', texto: t.Title, sub: `${t.Columna === HECHO ? 'Hecha · ' : ''}${p.Title}${t.Asignado ? ' · ' + nombreDe(t.Asignado, estado.roles) : ''}`, ir: `#p/${p.Clave}/t/${t.id}`, eq: equipoDe(p), orden: t.Columna === HECHO ? 1 : 0 });
    }
    for (const l of estado.ligas) {
        const p = porId(estado.proyectos, l.ProyectoId); if (!p) continue;
        const url = l.Tipo !== 'buzon' ? hrefSeguro(l.Url, { tipo: l.Tipo, host: CONFIG.sharepointHost }) : null;
        xs.push({ grupo: 'Archivos', texto: String(l.Title || ''), sub: `${l.Tipo === 'buzon' ? 'Lote en el buzón' : l.Tipo === 'enlace' ? 'Enlace' : 'Archivado'} · ${p.Title}`, url, ir: url ? null : `#p/${p.Clave}/docs`, archivo: l.Title, externo: l.Tipo === 'enlace', extra: l.Ruta });
    }
    // v1.0.0 (cubeta 5): los archivos de las carpetas de ERP_Proyectos que la sesión ya leyó (sin pedir nada a Graph): abren su carpeta
    for (const p of estado.proyectos) for (const a of archivosDe(p.Clave))
        xs.push({ grupo: 'Archivos', texto: a.nombre, sub: `Carpeta del proyecto · ${p.Title}${a.enviado ? ' · enviado a archivar' : ''}`, ir: `#archivos/proyecto/${p.Clave}`, archivo: a.nombre, extra: p.Clave });
    for (const r of estado.roles) {
        if (r.Activo === false || !r.Title) continue;
        const correo = String(r.Title).toLowerCase();
        xs.push({ grupo: 'Personas', texto: nombreDe(correo, estado.roles), sub: `${correo} · ${r.Rol || 'lectura'}`, persona: correo, extra: correo });
    }
    const d = datosPublicados(false);
    for (const o of (d.compras.datos && d.compras.datos.ordenes) || [])
        xs.push({ grupo: 'Órdenes', texto: o.folio, sub: [o.proveedor, fechaServicio(String(o.fecha || ''))].filter(Boolean).join(' · '), ir: '#compras', extra: Array.isArray(o.partidas) ? conceptoDe(o) : '' });
    for (const e of (d.servicios.datos && d.servicios.datos.expedientes) || [])
        xs.push({ grupo: 'Expedientes', texto: `${e.clave} · ${e.tipo || ''} ${e.id || ''}`.replace(/\s+/g, ' ').trim(), sub: `paso ${e.paso}${e.titulo ? ' · ' + e.titulo : ''}`, ir: '#servicios/' + e.clave, extra: [e.alcance, e.espera_a] });
    for (const v of (d.vigencias.datos && d.vigencias.datos.vigencias) || [])
        xs.push({ grupo: 'Vigencias', texto: String(v.titulo), sub: `${v.unidad ? v.unidad + ' · ' : ''}vence el ${/^\d{4}-\d{2}-\d{2}$/.test(v.vence || '') ? fechaVigencia(v.vence) : v.vence}`, ir: '#vigencias', extra: v.nota });
    return xs;
}

// ---------------------------------------------------------------- pintar

let activa = -1;   // la opción resaltada (aria-activedescendant)
let remoto = { q: '', grupos: null, buscando: false, gen: 0 };
const opciones = () => [...$('bsResultados').querySelectorAll('[role="option"]')];
function marcar(i) {
    const ops = opciones(); activa = ops.length ? (i + ops.length) % ops.length : -1;
    ops.forEach((o, k) => { o.classList.toggle('is-activa', k === activa); o.setAttribute('aria-selected', String(k === activa)); });
    const a = ops[activa];
    if (a) { $('bsTexto').setAttribute('aria-activedescendant', a.id); if (a.scrollIntoView) a.scrollIntoView({ block: 'nearest' }); } else $('bsTexto').removeAttribute('aria-activedescendant');
}
function elegir(it) {
    cerrarDialogo('dlgBuscar');
    if (it.persona) { abrirCargaPersona(it.persona); return; }
    if (it.ir) nav.irARuta(it.ir);
}
function opcion(it, n) {
    const o = el(it.url ? 'a' : 'div', 'bs-r'); o.id = 'bs-op-' + n; o.setAttribute('role', 'option'); o.setAttribute('aria-selected', 'false'); o.tabIndex = -1;
    if (it.url) { o.href = it.url; o.target = '_blank'; o.rel = 'noopener'; o.dataset.url = it.url; o.addEventListener('click', () => cerrarDialogo('dlgBuscar')); }
    else { if (it.ir) o.dataset.ir = it.ir; if (it.persona) o.dataset.persona = it.persona; o.addEventListener('click', () => elegir(it)); }
    o.dataset.grupo = it.grupo;
    if (it.eq) o.appendChild(iconoEquipo(it.eq, 'sm'));
    else if (it.archivo) o.appendChild(iconoArchivo(it.archivo, null, 'sm'));
    const t = el('span', 't'); t.appendChild(el('b', '', it.texto)); if (it.sub) t.appendChild(el('small', '', it.sub)); o.appendChild(t);
    if (it.url) o.appendChild(el('span', 'bs-ext', it.externo ? 'abre en otra pestaña' : 'abre en SharePoint'));
    return o;
}
/** Pinta los grupos: los locales y, en «Archivos», lo que trajeron las bibliotecas (si ya llegó para este texto). */
export function pintarBusqueda() {
    const r = $('bsResultados'); r.textContent = ''; activa = -1;
    const q = $('bsTexto').value, s = q.trim();
    $('bsTexto').setAttribute('aria-expanded', String(!!s)); $('bsTexto').removeAttribute('aria-activedescendant');
    if (!s) { r.appendChild(el('p', 'mn-help bs-vacio', 'Escribe parte del nombre de una pantalla, un proyecto, una tarea, un archivo, una persona, una orden, un expediente o una vigencia.')); return; }
    const locales = buscarEnIndice(indiceBusqueda(entradasLocales()), s, TOPE);
    const rem = remoto.q === s && remoto.grupos ? remoto.grupos : [];
    const remotos = rem.flatMap(b => b.items.map(x => ({ grupo: 'Archivos', texto: x.nombre, sub: `${b.nombre} · ${x.ruta}`, url: hrefSeguro(x.url, { tipo: 'archivado', host: CONFIG.sharepointHost }), archivo: x.nombre })).filter(x => x.url));
    let n = 0, hay = false;
    for (const grupo of GRUPOS_BUSQUEDA) {
        const g = locales.find(x => x.grupo === grupo), extra = grupo === 'Archivos' ? remotos : [];
        const items = [...(g ? g.items : []), ...extra.slice(0, TOPE)];
        if (!items.length && !(grupo === 'Archivos' && s.length >= MIN_REMOTO && remoto.buscando)) continue;
        hay = hay || !!items.length;
        const caja = el('div', 'bs-grupo'); caja.setAttribute('role', 'group'); caja.dataset.grupo = grupo;
        const h = el('p', 'mn-label bs-g', grupo); h.id = 'bs-g-' + GRUPOS_BUSQUEDA.indexOf(grupo); caja.setAttribute('aria-labelledby', h.id); caja.appendChild(h);
        for (const it of items) caja.appendChild(opcion(it, n++));
        const mas = (g ? g.mas : 0) + Math.max(0, extra.length - TOPE);
        if (mas) caja.appendChild(el('p', 'mn-help bs-mas', `y ${mas} más: afina el texto.`));
        if (grupo === 'Archivos' && s.length >= MIN_REMOTO && remoto.buscando) caja.appendChild(el('p', 'mn-help bs-buscando', 'Buscando en las bibliotecas…'));
        r.appendChild(caja);
    }
    if (!hay && !(s.length >= MIN_REMOTO && remoto.buscando)) r.appendChild(el('p', 'vacio', 'Nada casa con ese texto.'));
    if (s.length < MIN_REMOTO) r.appendChild(el('p', 'mn-help bs-pista', `Desde ${MIN_REMOTO} letras también se busca en las bibliotecas de las unidades.`));
}
/** La búsqueda en las bibliotecas, con retardo (una por pausa al teclear). La respuesta de un texto viejo se descarta. */
const buscarRemoto = conRetardo(async () => {
    const s = $('bsTexto').value.trim();
    if (s.length < MIN_REMOTO || !$('dlgBuscar').open || !estado.sesion) { remoto.buscando = false; return; }
    const gen = ++remoto.gen; remoto.buscando = true; remoto.q = s; remoto.grupos = null; pintarBusqueda();
    let grupos = [];
    try { grupos = await buscarEnBibliotecas(s); } catch (_) { grupos = []; }
    if (gen !== remoto.gen || $('bsTexto').value.trim() !== s) return;
    remoto = { ...remoto, grupos, buscando: false }; pintarBusqueda();
}, 350);

export function abrirBuscador() {
    if (!estado.sesion) return;
    datosPublicados(true);   // las órdenes, expedientes y vigencias entran al índice en cuanto su JSON se lee
    $('bsTexto').value = ''; remoto = { q: '', grupos: null, buscando: false, gen: remoto.gen + 1 };
    pintarBusqueda(); abrirDialogo('dlgBuscar'); $('bsTexto').focus();
}
/** ¿El foco está en algo donde `/` o Ctrl+K son texto? (un campo, un área o algo editable) */
function escribiendo(t) { return !!t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === 'INPUT' && !/^(button|checkbox|radio|submit|reset|file|range|color)$/i.test(t.type || ''))); }

export function engancharBuscador(fns) {
    nav = { ...nav, ...fns };
    for (const id of ['btnBuscar', 'btnBuscarMovil']) $(id).addEventListener('click', () => { cerrarHoja(); abrirBuscador(); });
    $('bsTexto').addEventListener('input', () => { pintarBusqueda(); buscarRemoto(); });
    $('bsTexto').addEventListener('keydown', ev => {
        const ops = opciones();
        if (ev.key === 'ArrowDown') { ev.preventDefault(); marcar(activa + 1); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); marcar(activa < 0 ? ops.length - 1 : activa - 1); }
        else if (ev.key === 'Enter') { const o = ops[activa >= 0 ? activa : 0]; if (o) { ev.preventDefault(); o.click(); } }
    });
    $('bsCerrar').addEventListener('click', () => cerrarDialogo('dlgBuscar'));
    // `/` y Ctrl+K (⌘K) abren el buscador desde cualquier pantalla, salvo escribiendo en un campo o con otro diálogo abierto
    document.addEventListener('keydown', ev => {
        if (ev.defaultPrevented || !estado.sesion || ev.altKey) return;
        const k = String(ev.key || '').toLowerCase();
        const atajo = (k === 'k' && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey) || (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && estado.pestana !== 'proyectos');
        if (!atajo || escribiendo(document.activeElement) || escribiendo(ev.target)) return;
        if (document.querySelector('dialog[open]')) return;
        ev.preventDefault(); abrirBuscador();
    });
}
/** Para las pruebas y el driver: cuántas opciones hay a la vista y cuál está resaltada. */
export const estadoBuscador = () => ({ opciones: opciones().length, activa, remoto: { ...remoto } });
