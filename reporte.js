// MINSA ERP v1.0.0 — la PLANTILLA DE REPORTE, en DOM (rediseño 2026-10-02; plan, «Plantilla de página»; maqueta maqueta-reportes.html:
// cabecera, controles, grafica, dd, kpiPct y la tabla de «Datos del reporte»). Las cuentas viven en reporte-reglas.js (puras, con prueba);
// aquí solo se arma el DOM con el() / createElementNS — nada de innerHTML (test/sw.test.js) y ningún estilo en línea salvo el color de un
// segmento (dato) y la posición del globo.
//
// CÓMO SE ARMA UN REPORTE NUEVO (≤ 20 líneas; lo usa la cubeta 3 para Servicios, Compras, Vigencias y los reportes de Trabajo):
//
//   import { pintarReporte } from './reporte.js';
//   pintarReporte($('comprasCuerpo'), {
//       id: 'compras-ordenes', titulo: 'Órdenes de compra', ayuda: 'Cómo se calcula: …', corte: datos.generado,
//       grafica: { tipos: false, grano: false, moneda: v => 'MXN', datos: v => ({ puntos: ordenes.map(o => ({ etiqueta: o.folio, y: o.total })) }) },
//       kpis: v => [{ valor: '7', texto: 'Órdenes emitidas' }, { valor: fmtCorto(total, 'MXN'), texto: 'Emitido en 2026' }],
//       datos: {
//           columnas: [{ texto: '' }, { texto: 'Fecha' }, { texto: 'Total MXN', n: true }],
//           filas: v => ordenes.map(o => ({ clave: o.folio, celdas: [{ t: o.folio, lk: true }, o.fecha, fmtMonto(o.total, 'MXN')],
//               hijos: o.partidas.map(p => ({ celdas: [p.descripcion, '', fmtMonto(p.total, 'MXN')] })) })),
//           pie: v => [{ celdas: [{ t: 'Total emitido', lk: true }, '', fmtMonto(total, 'MXN')] }],
//           csv: v => ({ columnas: ['Folio', 'Fecha', 'Total'], filas: ordenes.map(o => [o.folio, o.fecha, o.total]) }),
//           nota: 'Leído del .docx de cada orden.'
//       }
//   });
//
// `v` es el estado de la vista ({ tipo, grano, rango, valores, serieVis, moneda, abiertos }); vive la sesión por `id` y el tipo de gráfica
// y la moneda se recuerdan por dispositivo. Cada clic que cambia `v` vuelve a pintar el reporte (pintarReporte con el mismo def).
//
// Lo que sumó la cubeta 3 (Operación + Trabajo), todo opcional: `hasta` (AAAA-MM-DD: el rango sin chip de corte, lo que no sale de JSON) ·
// `kpisId` · `datosEn` (otra caja para «Datos del reporte») · en `grafica`: `fmtCorto`/`fmtLargo`/`fmtEje` (cifras que no son dinero),
// `leyenda` [{ color, nombre }] y `nombresEnGlobo` · en cada KPI: `malo` (subir es malo), `dif` + `difClase` (un cambio ya escrito), `titulo`
// · y `desplegable({ id, opciones, actual, alElegir })`, el «TODOS LOS EXPEDIENTES ⌄» de la maqueta.

import { el, boton, iconoSvg, TRAZOS, conservarFoco } from './comun.js';
import { RANGOS, GRANOS, escala, textoRango, fmtMonto, fmtCorto, fmtEje, textoPct, colorCorte, diaIso, fechaCorta, csv, nombreCsv, diasDelCorte } from './reporte-reglas.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, clase = '') => { const e = document.createElementNS(SVG_NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); if (clase) e.setAttribute('class', clase); return e; };
const icono = (k, clase = '') => iconoSvg(TRAZOS[k] || [], clase);

// ---------------------------------------------------------------- estado de cada vista

const VISTAS = new Map();
const LLAVE_PREF = 'erp.reporte';
function leerPref() { try { return JSON.parse(localStorage.getItem(LLAVE_PREF) || '{}') || {}; } catch (_) { return {}; } }
function guardarPref(cambio) { try { localStorage.setItem(LLAVE_PREF, JSON.stringify({ ...leerPref(), ...cambio })); } catch (_) { /* sin almacenamiento: se queda en la sesión */ } }
/** El estado de la vista `id` (lo crea con las preferencias del dispositivo la primera vez). */
export function vistaDe(id) {
    if (!VISTAS.has(id)) { const p = leerPref(); VISTAS.set(id, { tipo: p.tipo === 'bar' ? 'bar' : 'line', grano: 'mes', rango: '2a', valores: p.valores !== false, serieVis: true, moneda: p.moneda || null, abiertos: new Set() }); }
    return VISTAS.get(id);
}
/** Cambia la moneda de TODAS las vistas de dinero a la vez (la persona eligió pesos: lo demás la sigue) y la recuerda. */
export function fijarMoneda(m) { for (const v of VISTAS.values()) v.moneda = m; guardarPref({ moneda: m }); }

// ---------------------------------------------------------------- menús flotantes (rango, moneda, «?») — uno abierto a la vez

let menu = null;   // { caja, boton }
export function cerrarMenu() { if (!menu) return; menu.caja.remove(); menu.boton.setAttribute('aria-expanded', 'false'); const b = menu.boton; menu = null; return b; }
function abrirMenu(btn, construir, clase = '') {
    if (menu && menu.boton === btn) { cerrarMenu(); return; }
    cerrarMenu();
    const caja = el('div', 'rp-menu' + (clase ? ' ' + clase : '')); caja.setAttribute('role', 'menu');
    construir(caja);
    btn.parentElement.appendChild(caja); btn.setAttribute('aria-expanded', 'true');
    menu = { caja, boton: btn };
    const b = caja.querySelector('button'); if (b) b.focus();
}
document.addEventListener('click', ev => { if (menu && !menu.caja.contains(ev.target) && !menu.boton.contains(ev.target)) cerrarMenu(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && menu) { ev.preventDefault(); const b = cerrarMenu(); if (b) b.focus(); } });
function opcionMenu(texto, on, alClic, datos = {}) {
    const b = boton(texto, 'rp-op' + (on ? ' on' : ''), () => { cerrarMenu(); alClic(); }, datos); b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(!!on));
    return b;
}

// ---------------------------------------------------------------- cabecera

/**
 * La cabecera de la plantilla (maqueta .top): título + «?» (cómo se calcula) · chip «corte: fecha» (ámbar > 8 días, rojo > 15) · filtro y ojo ·
 * guardar · rango de fechas · PREGUNTAR (cubeta 4: abre el panel de preguntar.js) · acciones propias (p. ej. «Nueva partida»). Cada botón solo si
 * `def` lo trae. Sirve sola (Capital, Gastos) o dentro de pintarReporte.
 */
export function cabecera(def, v, repintar) {
    const top = el('header', 'rp-top'); top.dataset.reporte = def.id || '';
    const tit = el('div', 'rp-titulo');
    const h = el('h1', 'rp-h', def.titulo); h.id = 'rpTitulo'; tit.appendChild(h);
    if (def.ayuda) {
        const qm = boton('?', 'rp-qm', ev => { ev.stopPropagation(); abrirMenu(qm, c => { c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', 'Cómo se calcula'); c.appendChild(el('p', '', def.ayuda)); }, 'rp-ayuda'); }, { rp: 'ayuda' });
        qm.title = 'Cómo se calcula'; qm.setAttribute('aria-label', 'Cómo se calcula'); qm.setAttribute('aria-haspopup', 'dialog'); qm.setAttribute('aria-expanded', 'false');
        tit.appendChild(qm);
    }
    top.appendChild(tit);
    const lado = el('div', 'rp-top-der');
    if (def.corte) {
        // v1.0.0 (vuelta 1): días de calendario del corte a hoy — la MISMA cuenta que el KPI de Inicio (reporte-reglas diasDelCorte)
        const dias = diasDelCorte(def.corte);
        const c = el('span', 'rp-corte is-' + colorCorte(dias), `corte: ${fechaCorta(def.corte)}`); c.id = 'rpCorte'; c.dataset.dias = String(dias);
        c.title = dias === 0 ? 'Publicado hoy' : `Publicado hace ${dias} ${dias === 1 ? 'día' : 'días'}${dias > 8 ? ': hay que re-publicar' : ''}`;
        lado.appendChild(c);
    }
    if (def.filtro || def.ojo) {
        const bx = el('div', 'rp-bx');
        if (def.filtro) {
            const f = boton('', 'rp-ic' + (def.filtro.activo ? ' on' : ''), ev => { ev.stopPropagation(); def.filtro.alClic(f); }, { rp: 'filtro' }); f.id = 'rpFiltro';
            f.title = 'Aplicar un filtro o un segmento guardado'; f.setAttribute('aria-label', f.title); f.appendChild(icono('filtro')); bx.appendChild(f);
        }
        if (def.ojo) {
            const o = boton('', 'rp-ic' + (v.serieVis ? '' : ' on'), () => { v.serieVis = !v.serieVis; repintar(); }, { rp: 'ojo' }); o.id = 'rpOjo';
            o.title = v.serieVis ? 'Ocultar la serie' : 'Mostrar la serie'; o.setAttribute('aria-label', o.title); o.setAttribute('aria-pressed', String(!v.serieVis)); o.appendChild(icono('ojo')); bx.appendChild(o);
        }
        lado.appendChild(bx);
    }
    if (def.guardar) {
        const bx = el('div', 'rp-bx');
        const g = boton('', 'rp-ic', ev => { ev.stopPropagation(); def.guardar(g); }, { rp: 'guardar' }); g.id = 'rpGuardar';
        g.title = 'Guardar esta vista en «Guardados»'; g.setAttribute('aria-label', g.title); g.appendChild(icono('disco')); bx.appendChild(g);
        lado.appendChild(bx);
    }
    // v1.0.0 (cubeta 3): lo que NO sale de un JSON (los reportes de Trabajo) cuenta el rango desde `def.hasta` (hoy) y no pinta el chip del corte
    const finRango = def.corte ? diaIso(def.corte) : def.hasta || null;
    if (def.rango && finRango) {
        const caja = el('div', 'rp-rng');
        const b = boton('', 'rp-rng-b', ev => { ev.stopPropagation(); abrirMenu(b, m => { for (const r of RANGOS) m.appendChild(opcionMenu(`${r.texto} · ${textoRango(r.clave, finRango, def.primera)}`, v.rango === r.clave, () => { v.rango = r.clave; repintar(); }, { rango: r.clave })); }); }, { rp: 'rango' });
        b.id = 'rpRango'; b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.title = def.corte ? 'Rango de fechas (contado desde el corte)' : 'Rango de fechas (contado desde hoy)';
        b.appendChild(el('span', '', textoRango(v.rango, finRango, def.primera))); b.appendChild(icono('chev'));
        caja.appendChild(b); lado.appendChild(caja);
    }
    // v1.0.0 (cubeta 4): PREGUNTAR (maqueta .ask) abre y cierra el panel «Preguntar» (preguntar.js, un listener delegado sobre [data-preguntar])
    const ask = el('button', 'ask rp-ask'); ask.type = 'button'; ask.dataset.preguntar = def.id || '';
    ask.setAttribute('aria-controls', 'preguntar'); ask.setAttribute('aria-expanded', String(document.body.classList.contains('con-preguntar'))); ask.title = 'Pregunta lo que sea sobre los datos de la app';
    ask.appendChild(icono('ai')); ask.appendChild(document.createTextNode('PREGUNTAR'));
    // v1.0.0 (cubeta 6, fidelidad #11): PREGUNTAR va AL FINAL de la cabecera, como la maqueta y ChartMogul — en el DOM (orden del tabulador), no solo a la vista
    for (const a of def.acciones || []) lado.appendChild(a);
    lado.appendChild(ask);
    top.appendChild(lado);
    if (def.sub) { const p = el('p', 'rp-sub', def.sub); p.id = def.subId || 'rpSub'; top.appendChild(p); }
    return top;
}

// ---------------------------------------------------------------- tarjeta 1: controles, gráfica y KPIs

function segmentado(etiqueta, opciones, actual, alElegir, rp) {
    const g = el('div', 'rp-seg'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', etiqueta);
    for (const o of opciones) {
        const b = boton(o.texto, o.clave === actual ? 'on' : '', () => { if (!o.apagado) alElegir(o.clave); }, { rp: rp + ':' + o.clave });
        if (o.apagado) { b.disabled = true; b.title = o.apagado; } else b.setAttribute('aria-pressed', String(o.clave === actual));
        g.appendChild(b);
    }
    return g;
}
function controles(g, v, repintar) {
    const c = el('div', 'rp-ctl');
    if (g.tipos !== false) c.appendChild(segmentado('Tipo de gráfica', [{ clave: 'line', texto: 'LÍNEA' }, { clave: 'bar', texto: 'BARRAS' }], v.tipo, t => { v.tipo = t; guardarPref({ tipo: t }); repintar(); }, 'tipo'));
    else c.appendChild(segmentado('Tipo de gráfica', [{ clave: 'bar', texto: 'BARRAS' }], 'bar', () => {}, 'tipo'));
    const tl = el('div', 'rp-tl');
    const val = boton('', 'rp-tl-b' + (v.valores ? ' on' : ''), () => { v.valores = !v.valores; guardarPref({ valores: v.valores }); repintar(); }, { rp: 'valores' });
    val.id = 'rpValores'; val.title = 'Mostrar valores'; val.setAttribute('aria-label', 'Mostrar valores'); val.setAttribute('aria-pressed', String(v.valores));
    const n = el('span', 'rp-n123'); n.appendChild(el('span', '', '123')); n.appendChild(icono('onda')); val.appendChild(n); tl.appendChild(val);
    c.appendChild(tl);
    // v1.0.0 (cubeta 3): con varias series (Hechas y nuevas) la leyenda va en la fila de controles: color + nombre de cada una
    if (g.leyenda && g.leyenda.length) { const ly = el('div', 'rp-ley-graf'); for (const s of g.leyenda) { const x = el('span', 'rp-leyenda'); const i = el('i'); i.style.background = s.color; x.appendChild(i); x.appendChild(document.createTextNode(s.nombre)); ly.appendChild(x); } c.appendChild(ly); }
    c.appendChild(el('span', 'rp-esp'));
    if (g.grano !== false) c.appendChild(segmentado('Periodo', GRANOS, v.grano, k => { v.grano = k; repintar(); }, 'grano'));
    return c;
}
/**
 * v1.0.0 (cubeta 3): un desplegable de la maqueta (.dd: «TODOS LOS EXPEDIENTES ⌄», «PROVEEDOR: PRODEOS ⌄», «TODAS LAS UNIDADES ⌄») con el
 * menú flotante de la plantilla. `opciones` [{ clave, texto }]; el botón dice la elegida en versalitas.
 */
export function desplegable({ id, opciones, actual, alElegir, titulo = '', prefijo = '' }) {
    const dd = el('div', 'rp-dd');
    const elegida = opciones.find(o => o.clave === actual) || opciones[0];
    const b = boton('', 'rp-dd-b', ev => { ev.stopPropagation(); abrirMenu(b, m => { for (const o of opciones) m.appendChild(opcionMenu(o.texto, o.clave === (elegida && elegida.clave), () => alElegir(o.clave), { opcion: String(o.clave) })); }); }, { rp: 'dd:' + (id || '') });
    if (id) b.id = id;
    b.dataset.valor = elegida ? String(elegida.clave) : ''; b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); if (titulo) b.title = titulo;
    b.appendChild(el('span', '', (prefijo + (elegida ? elegida.texto : '')).toUpperCase())); b.appendChild(icono('chev'));
    dd.appendChild(b);
    return dd;
}

const graficas = new WeakMap();   // la caja de la gráfica → con qué se pintó (para volver a pintarla al cambiar el ancho)
let idGrad = 0;
/**
 * La gráfica SVG (maqueta grafica / graficaMulti): `puntos` [{ etiqueta, y, inc? }] o `series` [{ color, nombre, puntos }], LÍNEA o BARRAS,
 * eje con marcas «nice», etiquetas de valor (si `valores`), y un globo con guía al pasar el puntero o tocar. Sin librerías.
 */
export function grafica(caja, o) {
    graficas.set(caja, o);
    caja.textContent = '';
    // v1.0.0 (cubeta 3): una gráfica que no es de dinero (tarjetas, %, expedientes) trae sus formatos; sin ellos, los de moneda de siempre
    const fCorto = o.fmtCorto || (y => fmtCorto(y, o.moneda)), fLargo = o.fmtLargo || (y => fmtMonto(y, o.moneda, o.decimales ?? 2)), fEje = o.fmtEje || (m => fmtEje(m, o.moneda));
    const series = o.series || [{ color: null, puntos: o.puntos || [] }];
    const p0 = series[0].puntos;
    if (!p0.length) { caja.appendChild(el('p', 'rp-vacio', o.vacio || 'Sin datos en este rango.')); return; }
    const W = Math.max(300, Math.round((caja.clientWidth || 640) - 8)), estrecha = W < 560;
    const H = estrecha ? 250 : 318, L = estrecha ? 54 : 64, R = estrecha ? 14 : 34, T = 26, B = 40, n = p0.length, k = series.length;
    const esc = escala(series.flatMap(s => s.puntos.map(p => p.y)));
    const barras = o.tipo === 'bar';
    const xs = i => barras ? L + (i + 0.5) * (W - L - R) / n : L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1));
    const ys = y => T + (H - T - B) * (1 - (y - esc.piso) / ((esc.tope - esc.piso) || 1));
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': o.titulo || 'Gráfica del reporte' }, 'rp-svg');
    svg.dataset.n = String(n); svg.dataset.series = String(k); svg.dataset.tipo = barras ? 'bar' : 'line';
    const gid = 'rpGrad' + (++idGrad);
    const defs = svgEl('defs'); const lg = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.appendChild(svgEl('stop', { offset: 0 }, 'rp-stop1')); lg.appendChild(svgEl('stop', { offset: 1 }, 'rp-stop0')); defs.appendChild(lg); svg.appendChild(defs);
    for (const m of esc.marcas) {
        svg.appendChild(svgEl('line', { x1: L, x2: W - R + 12, y1: ys(m), y2: ys(m) }, m === 0 ? 'rp-cero' : 'rp-reja'));
        const t = svgEl('text', { x: L - 10, y: ys(m) + 4, 'text-anchor': 'end' }, 'rp-eje'); t.textContent = fEje(m); svg.appendChild(t);
    }
    svg.appendChild(svgEl('line', { x1: L, x2: L, y1: T - 6, y2: ys(Math.max(esc.piso, 0)) }, 'rp-cero'));
    const cada = Math.max(1, Math.round(n / (estrecha ? 4 : 6)));
    p0.forEach((p, i) => { if (i % cada === 0 || (barras && n <= 8)) { const t = svgEl('text', { x: xs(i), y: H - 14, 'text-anchor': 'middle' }, 'rp-eje'); t.textContent = p.etiqueta; svg.appendChild(t); } });
    if (o.serieVis !== false) {
        const usados = {};
        series.forEach((s, si) => {
            const pintar = (nodo, prop) => { if (s.color) nodo.style.setProperty(prop, s.color); return nodo; };
            if (barras) {
                const gw = (W - L - R) / n * (k > 1 ? 0.72 : 0.62), bw = k > 1 ? Math.max(2, gw / k) : Math.max(5, Math.min(38, gw));
                s.puntos.forEach((p, i) => {
                    const x = k > 1 ? xs(i) - gw / 2 + si * bw : xs(i) - bw / 2, y0 = ys(Math.max(0, esc.piso)), y1 = ys(p.y);
                    svg.appendChild(pintar(svgEl('rect', { x, y: Math.min(y0, y1), width: Math.max(1, bw - (k > 1 ? 1 : 0)), height: Math.max(0, Math.abs(y0 - y1)) }, 'rp-barra' + (o.neg || p.y < 0 ? ' is-neg' : '')), 'fill'));
                    if (o.valores && k === 1 && p.y && (n <= 16 || i % 2 === 0)) { const t = svgEl('text', { x: xs(i), y: y1 - 7, 'text-anchor': 'middle' }, 'rp-val'); t.textContent = fCorto(p.y); svg.appendChild(t); }
                });
            } else {
                const d = s.puntos.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p.y).toFixed(1)}`).join('');
                if (k === 1) svg.appendChild(svgEl('path', { d: `${d}L${xs(n - 1).toFixed(1)},${ys(Math.max(esc.piso, 0)).toFixed(1)}L${xs(0).toFixed(1)},${ys(Math.max(esc.piso, 0)).toFixed(1)}Z`, fill: `url(#${gid})` }, 'rp-area'));
                svg.appendChild(pintar(svgEl('path', { d }, 'rp-linea'), 'stroke'));
                const cabe = Math.max(2, Math.floor((W - L - R) / 64));   // etiquetas de ~60 px: en celular, menos (antes se encimaban a 390)
                const lbl = Math.max(1, Math.round(n / (k > 1 ? 7 : 9)), Math.ceil(n / cabe)); let prev = null;
                s.puntos.forEach((p, i) => {
                    svg.appendChild(pintar(svgEl('circle', { cx: xs(i), cy: ys(p.y), r: k > 1 ? 2.8 : 3.4 }, 'rp-punto'), 'fill'));
                    const yy = ys(p.y) - 9;
                    if (o.valores && (i % lbl === 0 || i === n - 1) && p.y !== prev && !(usados[i] || []).some(u => Math.abs(u - yy) < 14)) {
                        (usados[i] = usados[i] || []).push(yy);
                        const t = svgEl('text', { x: xs(i), y: yy, 'text-anchor': 'middle' }, 'rp-val' + (k > 1 ? ' is-multi' : '')); t.textContent = fCorto(p.y); svg.appendChild(t); prev = p.y;
                    }
                });
            }
        });
    }
    const guia = svgEl('line', { x1: 0, x2: 0, y1: T, y2: ys(Math.max(esc.piso, 0)) }, 'rp-guia'); svg.appendChild(guia);
    const globo = el('div', 'rp-globo'); globo.setAttribute('aria-hidden', 'true');   // lo mismo está en «Datos del reporte»: el globo no se anuncia en cada movimiento
    const sw = (W - L - R) / Math.max(1, barras ? n : n - 1 || 1);
    const mostrar = i => {
        globo.textContent = '';
        globo.appendChild(el('small', '', p0[i].etiqueta));
        for (const s of series) {
            const p = s.puntos[i]; if (!p) continue;
            const r = el('div', 'rp-g-r');
            if (s.color) { const q = el('i', 'rp-ley'); q.style.background = s.color; r.appendChild(q); }
            r.appendChild(el('b', '', fLargo(p.y)));
            if (o.nombresEnGlobo && s.nombre) r.appendChild(el('small', 'rp-g-n', s.nombre));   // v1.0.0 (cubeta 3): «Hechas» / «Nuevas» junto a su cifra (los segmentos de Dinero no: su nombre es una frase)
            globo.appendChild(r);
            if (k === 1 && p.inc != null && p.inc !== p.y && o.incTexto) globo.appendChild(el('small', '', `${o.incTexto}: ${fLargo(p.inc)}`));
        }
        const escalaX = (svg.getBoundingClientRect().width || W) / W, ymax = Math.max(...series.map(s => (s.puntos[i] || {}).y || 0));
        // el globo se queda dentro de la caja: no más a la izquierda o a la derecha que su mitad
        const izq = Math.min(Math.max(svg.offsetLeft + xs(i) * escalaX, 70), (caja.clientWidth || W) - 70);
        globo.style.left = izq + 'px'; globo.style.top = (svg.offsetTop + ys(ymax) * escalaX) + 'px'; globo.classList.add('is-on');
        guia.setAttribute('x1', xs(i)); guia.setAttribute('x2', xs(i)); guia.classList.add('is-on');
        svg.dataset.punto = String(i);
    };
    const ocultar = () => { globo.classList.remove('is-on'); guia.classList.remove('is-on'); delete svg.dataset.punto; };
    p0.forEach((_, i) => {
        const r = svgEl('rect', { x: xs(i) - sw / 2, y: T, width: sw, height: H - T - B, fill: 'transparent' }, 'rp-hit'); r.dataset.i = String(i);
        r.addEventListener('pointerenter', () => mostrar(i)); r.addEventListener('pointerdown', () => mostrar(i)); r.addEventListener('pointerleave', ocultar);
        svg.appendChild(r);
    });
    caja.appendChild(svg); caja.appendChild(globo);
}
let reajuste = 0;
window.addEventListener('resize', () => { clearTimeout(reajuste); reajuste = setTimeout(() => { for (const c of document.querySelectorAll('.rp-grafica')) { const o = graficas.get(c); if (o && c.offsetParent) grafica(c, o); } }, 150); });

/** La fila de KPIs (maqueta .kpis): [{ valor, texto, pct (número o null), clase }]. */
export function filaKpis(kpis, id = 'rpKpis') {
    const f = el('div', 'rp-kpis'); f.id = id;
    for (const k of kpis) {
        const d = el('div', 'rp-kpi'); if (k.clave) d.dataset.kpi = k.clave; if (k.titulo) d.title = k.titulo;
        d.appendChild(el('b', k.clase || '', k.valor));
        // v1.0.0 (cubeta 3): `malo` = subir es malo (vencidas, abiertas): el color sigue al sentido; `dif` = un cambio ya escrito («+5 pts»)
        if (k.pct !== null && k.pct !== undefined) d.appendChild(el('i', (k.pct >= 0) !== !!k.malo ? 'pos' : 'neg', textoPct(k.pct)));
        else if (k.dif) d.appendChild(el('i', k.difClase || '', k.dif));
        d.appendChild(el('small', '', k.texto));
        f.appendChild(d);
    }
    return f;
}

// ---------------------------------------------------------------- tarjeta 2: «Datos del reporte»

/** Una celda: texto, número, nodo o { t, n (cuántas, en azul), rojo, lk (el nombre que despliega), clase, titulo, colSpan, nodo }. */
function celda(c, primera) {
    const td = el('td');
    if (c === null || c === undefined || c === '') { td.className = 'dim'; td.textContent = '—'; return td; }
    if (c instanceof Node) { td.appendChild(c); return td; }
    if (typeof c !== 'object') { td.textContent = String(c); return td; }
    if (c.clase) td.className = c.clase;
    if (c.colSpan) td.colSpan = c.colSpan;
    if (c.titulo) td.title = c.titulo;
    if (c.nodo) td.appendChild(c.nodo);
    if (c.t !== undefined && c.t !== null) td.appendChild(c.lk && primera ? el('span', 'rp-lk', c.t) : document.createTextNode(String(c.t)));
    if (c.n) td.appendChild(el('span', 'rp-c' + (c.rojo ? ' r' : ''), String(c.n)));
    for (const x of c.despues || []) td.appendChild(x);
    if (c.t === undefined && !c.nodo && !c.n && !(c.despues || []).length) { td.classList.add('dim'); td.textContent = '—'; }
    return td;
}
/**
 * La tabla de «Datos del reporte» (maqueta table): encabezados, renglones con hijos DESPLEGABLES (el primer clic en el nombre o en la ›
 * abre sus hijos debajo) y renglones de total. `filas`: [{ clave, celdas, hijos: [{ celdas, clase, datos }], clase, datos }].
 */
export function tablaDatos(t, v, repintar) {
    const tabla = el('table', 'rp-tabla'); if (t.tablaId) tabla.id = t.tablaId;
    const thead = el('thead'); const trh = el('tr');
    const columnas = typeof t.columnas === 'function' ? t.columnas(v) : t.columnas;
    columnas.forEach((c, i) => { const th = el('th', (c.clase || '') + (i ? '' : ' rp-th0') + (c.total ? ' rp-col-total' : ''), c.texto); th.scope = 'col'; trh.appendChild(th); });
    thead.appendChild(trh); tabla.appendChild(thead);
    // v1.0.0 (vuelta 1, revisión UI/UX «fondo»): la columna del TOTAL (`total: true`) lleva .rp-col-total en cada renglón —contando los colSpan— y
    // el CSS la fija a la derecha bajo 720 px: a 390 el total quedaba tres columnas fuera de la pantalla
    const iTotal = columnas.findIndex(c => c.total);
    const marcarTotal = (tr, celdas) => { if (iTotal < 0) return; let col = 0; [...tr.children].forEach((td, k) => { const ab = Number((celdas[k] && celdas[k].colSpan) || 1); if (col === iTotal && ab === 1) td.classList.add('rp-col-total'); col += ab; }); };
    const tb = el('tbody');
    const renglon = (f, esPie) => {
        const abierto = !!f.abierto || (!!f.clave && v.abiertos.has(f.clave));
        const tr = el('tr', [f.clase, esPie ? 'tot' : '', abierto ? 'abierto' : ''].filter(Boolean).join(' '));
        for (const k in f.datos || {}) tr.dataset[k] = f.datos[k];
        f.celdas.forEach((c, i) => {
            const td = celda(c, i === 0);
            if (i === 0 && !esPie && f.hijos && f.hijos.length && f.clave && !f.abierto) {
                const alternar = () => { if (v.abiertos.has(f.clave)) v.abiertos.delete(f.clave); else v.abiertos.add(f.clave); repintar(); };
                const b = boton('', 'rp-exp', alternar, { rp: 'fila:' + f.clave }); b.setAttribute('aria-expanded', String(abierto)); b.setAttribute('aria-label', (abierto ? 'Plegar ' : 'Ver el detalle de ') + (typeof c === 'object' && c && c.t ? c.t : 'este renglón'));
                b.appendChild(icono('chevr')); td.prepend(b);
                const lk = td.querySelector('.rp-lk'); if (lk) { lk.addEventListener('click', alternar); }
            }
            tr.appendChild(td);
        });
        marcarTotal(tr, f.celdas);
        tb.appendChild(tr);
        if (abierto) for (const h of f.hijos) {
            const th = el('tr', 'hijo' + (h.clase ? ' ' + h.clase : '')); for (const k in h.datos || {}) th.dataset[k] = h.datos[k];
            h.celdas.forEach(c => th.appendChild(celda(c, false))); marcarTotal(th, h.celdas); tb.appendChild(th);
        }
    };
    const filas = t.filas(v);
    for (const f of filas) renglon(f, false);
    if (!filas.length && t.vacio) { const tr = el('tr'); const td = el('td', 'rp-vacio-td', t.vacio); td.colSpan = columnas.length; tr.appendChild(td); tb.appendChild(tr); }
    for (const f of (t.pie ? t.pie(v) : [])) renglon(f, true);
    tabla.appendChild(tb);
    return tabla;
}
/** Baja un texto como archivo (Blob + a[download]); el CSV ya trae su BOM. */
export function descargar(nombre, texto, tipo = 'text/csv;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
    const a = el('a'); a.href = url; a.download = nombre; a.hidden = true; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return nombre;
}
/** Lo último que se exportó (la E2E lee aquí el CSV sin depender de la descarga real). */
export const ultimoCsv = { nombre: '', texto: '' };
const MONEDA_TXT = { USD: 'SALDOS EN DÓLARES', MXN: 'SALDOS EN PESOS' };
const MONEDA_OP = { USD: 'Saldos en dólares', MXN: 'Saldos en pesos' };
function tarjetaDatos(t, v, repintar, def) {
    const card = el('section', 'rp-card rp-datos'); card.id = 'rpDatos';
    const hd = el('div', 'rp-dh');
    hd.appendChild(el('h3', '', t.titulo || 'Datos del reporte'));
    for (const x of t.antesDeMoneda ? t.antesDeMoneda(v) : []) hd.appendChild(x);
    if (t.monedas && t.monedas.length) {
        const dd = el('div', 'rp-dd');
        const b = boton('', 'rp-dd-b', ev => { ev.stopPropagation(); abrirMenu(b, m => { for (const mo of t.monedas) m.appendChild(opcionMenu((t.opcionMoneda || MONEDA_OP)[mo] || mo, v.moneda === mo, () => { fijarMoneda(mo); v.abiertos.clear(); repintar(); }, { moneda: mo })); }); }, { rp: 'moneda' });
        b.id = 'rpMoneda'; b.dataset.moneda = v.moneda || ''; b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.title = 'Las monedas nunca se suman entre sí';
        b.appendChild(el('span', '', (t.textoMoneda || MONEDA_TXT)[v.moneda] || v.moneda || '')); b.appendChild(icono('chev'));
        dd.appendChild(b); hd.appendChild(dd);
    }
    if (t.csv) {
        const x = boton('', 'rp-exb', () => {
            const { columnas, filas } = t.csv(v);
            const nombre = nombreCsv(t.nombreCsv || def.id || 'reporte', diaIso(def.corte || new Date()));
            const texto = csv(columnas, filas); ultimoCsv.nombre = nombre; ultimoCsv.texto = texto;
            descargar(nombre, texto);
        }, { rp: 'exportar' });
        x.id = 'rpExportar'; x.title = 'Exportar a CSV (se abre en Excel)'; x.setAttribute('aria-label', x.title); x.appendChild(icono('exportar'));
        hd.appendChild(x);
    }
    card.appendChild(hd);
    if (t.encima) for (const x of t.encima(v)) card.appendChild(x);
    const tw = el('div', 'rp-tw'); tw.appendChild(tablaDatos(t, v, repintar)); card.appendChild(tw);
    for (const x of t.despues ? t.despues(v) : []) card.appendChild(x);
    const nota = t.nota ? (typeof t.nota === 'function' ? t.nota(v) : t.nota) : null;
    if (nota) { const p = el('p', 'rp-nota'); p.id = t.notaId || 'rpNota'; if (nota instanceof Node) p.appendChild(nota); else p.textContent = nota; card.appendChild(p); }
    for (const x of t.pieDeTarjeta ? t.pieDeTarjeta(v) : []) card.appendChild(x);
    return card;
}

// ---------------------------------------------------------------- la página entera

/** Los id de la plantilla (rpTitulo, rpKpis, rpMoneda…) son de la página A LA VISTA: los que quedaron en otra pantalla (oculta) se sueltan
 *  para que no haya dos iguales en el documento. Lo llaman pintarReporte y quien pinta solo la cabecera (Capital, Gastos). */
export function soltarIdsFuera(cont, ...otros) {
    const dentro = x => cont.contains(x) || otros.some(o => o && o.contains(x));   // v1.0.0 (cubeta 3): «Datos del reporte» puede vivir en otra caja (datosEn)
    for (const x of document.querySelectorAll('[id^="rp"]')) if (x.id !== 'rpPop' && !dentro(x) && !x.closest('#rpPop')) x.removeAttribute('id');
}

/**
 * Pinta un reporte completo en `cont` (lo vacía): cabecera · lo de `antes` (renglones de segmento) · tarjeta 1 (controles + gráfica + KPIs)
 * · tarjeta 2 («Datos del reporte») · lo de `despues`. Ver el ejemplo de arriba. `def.moneda` (si trae) fija la moneda inicial de la vista.
 */
export function pintarReporte(cont, def) {
    const v = vistaDe(def.id);
    if (def.monedaInicial && (!v.moneda || (def.datos && def.datos.monedas && !def.datos.monedas.includes(v.moneda)))) v.moneda = def.monedaInicial;
    const repintar = () => pintarReporte(cont, def);
    // v1.0.0 (cubeta 3): `datosEn` pinta «Datos del reporte» en OTRA caja (Reportes de Trabajo: la tarjeta de detalle de siempre va en medio)
    const otra = def.datosEn || null;
    const pintarDatos = () => { if (!otra) return; otra.textContent = ''; if (def.datos) otra.appendChild(tarjetaDatos(def.datos, v, repintar, def)); };
    if (otra) conservarFoco(otra, ['rp', 'moneda', 'opcion'], () => { cerrarMenu(); soltarIdsFuera(cont, otra); pintarDatos(); });
    conservarFoco(cont, ['rp', 'rango', 'moneda'], () => {
        cerrarMenu();
        soltarIdsFuera(cont, otra);
        cont.textContent = '';
        const pag = el('div', 'rp-pag'); pag.dataset.reporte = def.id;
        pag.appendChild(cabecera(def, v, repintar));
        for (const x of def.antes ? def.antes(v) : []) pag.appendChild(x);
        let pendiente = null;
        if (def.grafica || def.kpis) {
            const card = el('section', 'rp-card rp-graf'); card.id = 'rpTarjetaGrafica';
            if (def.grafica) {
                card.appendChild(controles(def.grafica, v, repintar));
                const caja = el('div', 'rp-grafica'); caja.id = 'rpGrafica'; card.appendChild(caja);
                const d = def.grafica.datos(v);
                const o = { tipo: def.grafica.tipos === false ? 'bar' : v.tipo, moneda: def.grafica.moneda ? def.grafica.moneda(v) : v.moneda, valores: v.valores, serieVis: v.serieVis, neg: def.grafica.neg,
                    vacio: d.vacio || def.grafica.vacio, incTexto: def.grafica.incTexto, titulo: def.titulo, decimales: def.grafica.decimales,
                    fmtCorto: def.grafica.fmtCorto, fmtLargo: def.grafica.fmtLargo, fmtEje: def.grafica.fmtEje, nombresEnGlobo: def.grafica.nombresEnGlobo };   // v1.0.0 (cubeta 3)
                if (d.series) o.series = d.series; else o.puntos = d.puntos || [];
                pendiente = () => grafica(caja, o);   // se pinta ya montada: mide su ancho real
            }
            if (def.kpis) { const ks = def.kpis(v); if (ks && ks.length) card.appendChild(filaKpis(ks, def.kpisId || 'rpKpis')); }   // v1.0.0 (cubeta 3): kpisId (#serviciosKpis…)
            pag.appendChild(card);
        }
        if (def.datos && !otra) pag.appendChild(tarjetaDatos(def.datos, v, repintar, def));
        for (const x of def.despues ? def.despues(v) : []) pag.appendChild(x);
        cont.appendChild(pag);
        if (pendiente) pendiente();
    });
    return v;
}
