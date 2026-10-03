// MINSA ERP v1.0.0 — FILTROS Y SEGMENTOS de la plantilla de reporte (rediseño 2026-10-02; plan, «Dinero»: niveles Contraparte / Factura /
// Producto, operador y valores, Y/O, hasta 7 comparados, guardar solo yo / equipo y armar con frase; maqueta: segRenglones, abrePop…
// renderPop, popEditor, agregaSeg, aplicaEditor, armaIA). Lo que se cuenta vive en reporte-reglas.js (cumple, enSegmento, colores) y en las
// reglas del módulo (propsDinero, interpretarFrase); aquí solo el DOM: los renglones de segmento y la ventana flotante (#rpPop) con sus
// cuatro caras — elegir un filtro, segmentos guardados, el editor de UNA condición y «guardar».
//
// Quien la usa pasa un `cfg`:
//   { segs (arreglo VIVO, lo muta esta ventana), props, niveles, facturas() (las de la moneda en pantalla), ctx (para leer la propiedad),
//     moneda, alCambiar() (repintar), interpretar(q) → { conds, moneda }, alCambiarMoneda(m), guardados() → vistas, aplicarGuardado(v),
//     borrarGuardado(v), esMia(v), guardar({ titulo, compartida }) → promesa, notaGuardar, republicar (texto: sin datos para segmentos) }
// Nada de innerHTML: el() / textContent; el color de cada segmento es un dato (style.background con su token).

import { el, boton, iconoSvg, TRAZOS, avisar } from './comun.js';
import { OPERADORES, MAX_SEGMENTOS, colorLibre, textoCondicion, nombreSegmento, sinAcentos } from './reporte-reglas.js';

const icono = k => iconoSvg(TRAZOS[k] || []);
let pop = null;   // { ancla, cfg, modo: 'filtro'|'guardados'|'editor'|'guardar'|'republicar', q, grupo, cerrados, msg, target, ed, guardar }

// ---------------------------------------------------------------- renglones de segmento (encima de la gráfica)

/** Agrega un segmento con sus condiciones; false (y lo dice) si ya hay 7. */
export function agregarSegmento(segs, conds, join = 'Y') {
    if (segs.length >= MAX_SEGMENTOS) { avisar(`Máximo ${MAX_SEGMENTOS} segmentos a la vez.`, 'ojo'); return false; }
    segs.push({ color: colorLibre(segs), conds, join: join === 'O' ? 'O' : 'Y' });
    return true;
}
/** Los renglones de la maqueta (.segs): color · condiciones (clic = editar) con su Y/O · «+» · guardar · duplicar · quitar. */
export function renglonesSegmento(cfg) {
    const caja = el('div', 'rp-segs'); caja.id = 'rpSegmentos';
    cfg.segs.forEach((s, i) => {
        const r = el('div', 'rp-seg-r'); r.dataset.segmento = String(i);
        const sq = el('span', 'rp-sq'); sq.style.background = s.color; r.appendChild(sq);
        const cs = el('div', 'rp-cs');
        if (!s.conds.length) cs.appendChild(el('span', 'rp-todo', 'Todas las facturas · agrega una condición'));
        s.conds.forEach((c, j) => {
            if (j) {
                const jn = boton(s.join === 'O' ? 'O' : 'Y', 'rp-jn', () => { s.join = s.join === 'Y' ? 'O' : 'Y'; cfg.alCambiar(); }, { rp: `join:${i}` });
                jn.title = `Cambiar a ${s.join === 'Y' ? 'O' : 'Y'}`; cs.appendChild(jn);
            }
            const t = textoCondicion(c, cfg.props.find(p => p.k === c.p), cfg.moneda);
            const fc = boton('', 'rp-fc', ev => { ev.stopPropagation(); abrirEditor(fc, cfg, i, j); }, { rp: `cond:${i}:${j}` });
            fc.title = 'Editar el filtro'; fc.appendChild(el('b', '', t.campo)); fc.appendChild(document.createTextNode(` • ${t.op} • ${t.valor}`));
            cs.appendChild(fc);
        });
        const mas = boton('+', 'rp-addc', ev => { ev.stopPropagation(); abrirFiltros(mas, cfg, { target: i }); }, { rp: `mas:${i}` });
        mas.title = 'Agregar una condición a este segmento'; mas.setAttribute('aria-label', mas.title); cs.appendChild(mas);
        r.appendChild(cs);
        const ac = el('div', 'rp-ac');
        const accion = (k, ic, titulo, fn) => { const b = boton('', 'rp-ac-b', fn, { rp: `${k}:${i}` }); b.title = titulo; b.setAttribute('aria-label', titulo); b.appendChild(icono(ic)); ac.appendChild(b); return b; };
        const g = accion('segguardar', 'disco', 'Guardar segmento', ev => {
            ev.stopPropagation();
            if (!s.conds.length) { avisar('El segmento no tiene condiciones.', 'ojo'); return; }
            abrirGuardar(g, cfg, { sugerido: nombreSegmento(s, cfg.props, cfg.moneda).slice(0, 80), alGuardar: (titulo, compartida) => cfg.guardar({ titulo, compartida, segmento: s }) });
        });
        accion('segdup', 'dup', 'Duplicar segmento', () => { if (agregarSegmento(cfg.segs, JSON.parse(JSON.stringify(s.conds)), s.join)) cfg.alCambiar(); });
        accion('segquitar', 'x', 'Quitar segmento', () => { cfg.segs.splice(i, 1); cfg.alCambiar(); });
        r.appendChild(ac);
        caja.appendChild(r);
    });
    return caja;
}

// ---------------------------------------------------------------- la ventana flotante

function cajaPop() {
    let c = document.getElementById('rpPop');
    if (!c) {
        c = el('div', 'rp-pop'); c.id = 'rpPop'; c.hidden = true; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', 'Filtros y segmentos');
        document.body.appendChild(c);
        document.addEventListener('click', ev => { if (pop && !c.contains(ev.target) && !(pop.ancla && pop.ancla.contains(ev.target)) && ev.target.isConnected) cerrarPop(); });
        document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && pop) { ev.preventDefault(); ev.stopPropagation(); const a = pop.ancla; cerrarPop(); if (a && a.isConnected) a.focus(); } }, true);
        window.addEventListener('resize', () => { if (pop) colocar(); });
    }
    return c;
}
export function cerrarPop() { const c = document.getElementById('rpPop'); if (c) { c.hidden = true; c.textContent = ''; } pop = null; }
export const popAbierto = () => pop ? pop.modo : null;
function colocar() {
    const c = cajaPop(), a = pop.ancla && pop.ancla.isConnected ? pop.ancla.getBoundingClientRect() : { left: 12, right: 12, bottom: 60 };
    const w = c.offsetWidth, h = c.offsetHeight;
    let x = pop.modo === 'editor' || pop.target != null || pop.modo === 'guardar' ? a.left - 8 : a.right - w;
    x = Math.max(12, Math.min(x, window.innerWidth - w - 12));
    let y = a.bottom + 6; if (y + h > window.innerHeight - 12) y = Math.max(12, window.innerHeight - h - 12);
    c.style.left = x + 'px'; c.style.top = y + 'px';
}
function abrir(ancla, cfg, modo, extra = {}) {
    pop = { ancla, cfg, modo, q: '', grupo: 'todos', cerrados: {}, msg: '', target: null, ed: null, ...extra };
    pintarPop();
    const f = document.querySelector(pop.modo === 'editor' ? '#rpEdBusca, #rpEdVal' : pop.modo === 'guardar' ? '#rpGuNombre' : '#rpPopQ, #rpPop button');
    if (f) f.focus();
}
/** «Elegir un filtro» (y la pestaña de guardados); con `{ target: i }` la condición se agrega al segmento i. Sin datos: el aviso de re-publicar. */
export function abrirFiltros(ancla, cfg, extra = {}) {
    if (pop && pop.ancla === ancla && !pop.ed) { cerrarPop(); return; }
    abrir(ancla, cfg, cfg.republicar ? 'republicar' : (extra.tab || 'filtro'), extra);
}
/** El editor de la condición j del segmento i. */
export function abrirEditor(ancla, cfg, i, j) {
    const c = cfg.segs[i].conds[j];
    abrir(ancla, cfg, 'editor', { target: i, ed: { p: c.p, op: c.op, v: Array.isArray(c.v) ? [...c.v] : c.v, cond: [i, j], qv: '' } });
}
/** «Guardar»: nombre + Solo yo | Equipo. `alGuardar(titulo, compartida)` es una promesa. */
export function abrirGuardar(ancla, cfg, { sugerido = '', alGuardar }) {
    abrir(ancla, cfg || {}, 'guardar', { guardar: { titulo: sugerido, compartida: false, alGuardar, enVuelo: false } });
}

function mini(texto, clase, alClic, datos) { const b = boton(texto, 'rp-mini' + (clase ? ' ' + clase : ''), alClic, datos); return b; }
function pintarPop() {
    const c = cajaPop(); c.textContent = ''; c.hidden = false;
    c.classList.toggle('is-ed', pop.modo === 'editor' || pop.modo === 'guardar');
    if (pop.modo === 'editor') pintarEditor(c);
    else if (pop.modo === 'guardar') pintarGuardar(c);
    else if (pop.modo === 'republicar') {
        const v = el('div', 'rp-pop-msg');
        v.appendChild(el('b', '', 'Los segmentos necesitan el archivo nuevo'));
        v.appendChild(el('p', '', `${pop.cfg.republicar}: el cobranza.json publicado no trae todavía las facturas con producto, REP y cadena. Lo demás del reporte funciona igual.`));
        c.appendChild(v);
    } else pintarElegir(c);
    colocar();
}

function pintarElegir(c) {
    const cfg = pop.cfg;
    const h = el('div', 'rp-pop-h');
    for (const [k, t] of [['filtro', 'Elegir un filtro'], ['guardados', 'Segmentos guardados']]) {
        const b = boton(t, 'rp-pop-tab' + (pop.modo === k ? ' on' : ''), () => { pop.modo = k; pintarPop(); }, { rp: 'tab:' + k }); b.setAttribute('aria-pressed', String(pop.modo === k)); h.appendChild(b);
    }
    h.appendChild(el('span', 'rp-esp'));
    if (pop.target == null) h.appendChild(mini('AGREGAR SEGMENTO EN BLANCO', '', () => { if (agregarSegmento(cfg.segs, [], 'Y')) { pop.target = cfg.segs.length - 1; cfg.alCambiar(); pintarPop(); } }, { rp: 'blanco' }));
    c.appendChild(h);
    if (pop.modo === 'guardados') { pintarGuardados(c); return; }
    const s = el('div', 'rp-pop-s');
    const q = el('input'); q.id = 'rpPopQ'; q.type = 'text'; q.autocomplete = 'off'; q.placeholder = 'Busca filtros o describe lo que quieres…'; q.value = pop.q; q.setAttribute('aria-label', 'Buscar filtros o describir el segmento');
    const armar = mini('↵ ARMAR CON FRASE', 'rp-arma', () => armarConFrase(), { rp: 'armar' }); armar.hidden = !pop.q.trim();
    q.addEventListener('input', () => { pop.q = q.value; pop.msg = ''; armar.hidden = !pop.q.trim(); pintarCuerpo(cuerpo); });
    q.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); armarConFrase(); } });
    s.appendChild(q); s.appendChild(armar); s.appendChild(icono('lupa'));
    c.appendChild(s);
    const cuerpo = el('div', 'rp-pop-b'); cuerpo.id = 'rpPopB'; c.appendChild(cuerpo);
    pintarCuerpo(cuerpo);
}
function pintarCuerpo(b) {
    const cfg = pop.cfg; b.textContent = '';
    const q = sinAcentos(pop.q), niveles = cfg.niveles;
    const todas = cfg.props.filter(p => !q || sinAcentos(p.l).includes(q) || sinAcentos(niveles[p.n].l).includes(q));
    const cuenta = n => todas.filter(p => p.n === n).length;
    const izq = el('div', 'rp-pop-l');
    const grupo = (k, texto, n, nv) => {
        const g = boton('', pop.grupo === k ? 'on' : '', () => { pop.grupo = k; pintarCuerpo(b); }, { rp: 'grupo:' + k });
        if (nv) { const lv = el('span', 'rp-lv', nv.i); lv.style.background = nv.color; g.appendChild(lv); }
        g.appendChild(el('span', 'tx', texto)); g.appendChild(el('span', 'n', String(n))); izq.appendChild(g);
    };
    grupo('todos', 'Todos los filtros', todas.length);
    izq.appendChild(el('small', '', 'Filtrar por propiedades de'));
    for (const [k, nv] of Object.entries(niveles)) if (!q || cuenta(k)) grupo(k, nv.l, cuenta(k), nv);
    b.appendChild(izq);
    const der = el('div', 'rp-pop-r');
    if (pop.msg) der.appendChild(el('div', 'rp-pop-vacio', pop.msg));
    else if (!todas.length) der.appendChild(el('div', 'rp-pop-vacio', 'No hay filtros que coincidan. Pulsa Enter para armar el segmento con esa frase.'));
    else for (const [k, nv] of Object.entries(niveles)) {
        if (!(pop.grupo === 'todos' || pop.grupo === k) || !cuenta(k)) continue;
        const ps = todas.filter(p => p.n === k), ab = !pop.cerrados[k];
        const h6 = el('h6'); const lv = el('span', 'rp-lv', nv.i); lv.style.background = nv.color; h6.appendChild(lv); h6.appendChild(document.createTextNode(nv.l)); der.appendChild(h6);
        const std = boton('', 'rp-std', () => { pop.cerrados[k] = !pop.cerrados[k]; pintarCuerpo(b); }, { rp: 'std:' + k }); std.setAttribute('aria-expanded', String(ab));
        std.appendChild(icono('chev')); std.appendChild(el('span', 'tx', 'Estándar')); std.appendChild(el('span', 'n', String(ps.length))); der.appendChild(std);
        if (ab) for (const p of ps) der.appendChild(boton(p.l, 'rp-prop', () => { pop.modo = 'editor'; pop.ed = { p: p.k, op: OPERADORES[p.t][0], v: p.t === 'lista' ? [] : '', cond: null, qv: '' }; pintarPop(); const f = document.querySelector('#rpEdBusca, #rpEdVal'); if (f) f.focus(); }, { prop: p.k }));
    }
    b.appendChild(der);
}
function armarConFrase() {
    const cfg = pop.cfg, q = pop.q.trim(); if (!q) return;
    const r = cfg.interpretar(q);
    if (!r.conds.length) { pop.msg = 'No pude armar un segmento con eso. Prueba «facturas de CPL sin REP de más de 180 días», «en dólares de más de 100 mil» o «emitidas desde 2025 con pago parcial».'; pintarPop(); document.getElementById('rpPopQ')?.focus(); return; }
    if (r.moneda && r.moneda !== cfg.moneda && cfg.alCambiarMoneda) cfg.alCambiarMoneda(r.moneda);
    let ok = true;
    if (pop.target != null && cfg.segs[pop.target]) cfg.segs[pop.target].conds.push(...r.conds); else ok = agregarSegmento(cfg.segs, r.conds, 'Y');
    const props = cfg.props, moneda = r.moneda || cfg.moneda;
    cerrarPop();
    if (ok) { cfg.alCambiar(); avisar('Segmento armado con la frase: ' + nombreSegmento({ conds: r.conds, join: 'Y' }, props, moneda), 'ok'); }
}
function pintarGuardados(c) {
    const cfg = pop.cfg, xs = cfg.guardados ? cfg.guardados() : [];
    const l = el('div', 'rp-sg-l'); l.id = 'rpGuardadosLista';
    if (cfg.notaGuardar) l.appendChild(el('p', 'rp-pop-nota', cfg.notaGuardar));
    if (!xs.length) l.appendChild(el('div', 'rp-pop-vacio', 'Todavía no hay segmentos guardados. Arma uno y guárdalo con el disquete de su renglón.'));
    xs.forEach((v, i) => {
        const r = el('div', 'rp-sg-i'); r.dataset.vista = String(v.id);
        const lv = el('span', 'rp-lv'); lv.style.background = `var(--seg-${(i % 7) + 1})`; r.appendChild(lv);
        const tx = el('div', 'tx'); tx.appendChild(el('span', '', v.titulo));
        const d = v.definicion || {};
        tx.appendChild(el('small', '', nombreSegmento(d, cfg.props, d.moneda || cfg.moneda) + (d.moneda ? ' · en ' + d.moneda : '') + (v.compartida ? ' · equipo' : ' · solo yo')));
        r.appendChild(tx);
        r.appendChild(mini('APLICAR', '', () => { cerrarPop(); cfg.aplicarGuardado(v); }, { aplicar: String(v.id) }));
        if (cfg.esMia && cfg.esMia(v)) r.appendChild(mini('QUITAR', 'rojo', async () => { try { await cfg.borrarGuardado(v); avisar(`«${v.titulo}» ya no está en Guardados.`, 'ok'); if (pop) pintarPop(); } catch (e) { avisar('No se pudo quitar: ' + (e && e.message ? e.message : e), 'error'); } }, { quitar: String(v.id) }));
        l.appendChild(r);
    });
    c.appendChild(l);
}

function pintarEditor(c) {
    const cfg = pop.cfg, e = pop.ed, pr = cfg.props.find(p => p.k === e.p), nv = cfg.niveles[pr.n];
    const h = el('div', 'rp-ed-h');
    h.appendChild(mini('← CAMBIAR FILTRO', '', () => { pop.modo = 'filtro'; pop.ed = null; pintarPop(); }, { rp: 'edvolver' }));
    const lvl = el('span', 'rp-lvl'); const lv = el('span', 'rp-lv', nv.i); lv.style.background = nv.color; lvl.appendChild(lv); lvl.appendChild(document.createTextNode(nv.lvl)); h.appendChild(lvl);
    c.appendChild(h);
    c.appendChild(el('div', 'rp-ed-f', pr.l));
    const op = el('select'); op.id = 'rpEdOp'; op.setAttribute('aria-label', 'Operador');
    for (const o of OPERADORES[pr.t]) { const x = el('option', '', o); x.value = o; op.appendChild(x); }
    op.value = e.op; op.addEventListener('change', () => { e.op = op.value; });
    c.appendChild(op);
    if (pr.t === 'lista') {
        const fs = cfg.facturas(), vals = cfg.valores(pr, fs), cnt = v => fs.filter(f => pr.get(f, cfg.ctx) === v).length;
        const chips = el('div', 'rp-chips');
        for (const x of e.v) { const ch = el('span', 'rp-chip', x); const q = boton('×', '', () => { e.v = e.v.filter(y => y !== x); pintarPop(); }, { edquita: x }); q.setAttribute('aria-label', 'Quitar ' + x); ch.appendChild(q); chips.appendChild(ch); }
        const bus = el('input'); bus.id = 'rpEdBusca'; bus.type = 'text'; bus.autocomplete = 'off'; bus.placeholder = e.v.length ? '' : 'Buscar valores'; bus.value = e.qv || ''; bus.setAttribute('aria-label', 'Buscar valores');
        chips.appendChild(bus); c.appendChild(chips);
        const ops = el('div', 'rp-opts'); ops.id = 'rpEdOpts';
        const pintarOps = () => {
            ops.textContent = ''; const qv = sinAcentos(e.qv || '');
            const vs = vals.filter(v => !qv || sinAcentos(v).includes(qv));
            if (!vs.length) ops.appendChild(el('div', 'rp-pop-vacio', 'Sin valores'));
            for (const v of vs) {
                const lb = el('label', e.v.includes(v) ? 'sel' : '');
                const ck = el('input'); ck.type = 'checkbox'; ck.checked = e.v.includes(v); ck.dataset.edopt = v;
                ck.addEventListener('change', () => { e.v = e.v.includes(v) ? e.v.filter(y => y !== v) : [...e.v, v]; const foco = document.activeElement === bus; pintarPop(); if (foco) document.getElementById('rpEdBusca')?.focus(); });
                lb.appendChild(ck); lb.appendChild(el('span', 'tx', v)); lb.appendChild(el('small', '', String(cnt(v)))); ops.appendChild(lb);
            }
        };
        bus.addEventListener('input', () => { e.qv = bus.value; pintarOps(); });
        pintarOps(); c.appendChild(ops);
        const a = el('div', 'rp-ed-a');
        a.appendChild(mini('SELECCIONAR TODO', '', () => { e.v = [...vals]; pintarPop(); }, { rp: 'edtodo' }));
        a.appendChild(mini('LIMPIAR', '', () => { e.v = []; pintarPop(); }, { rp: 'edlimpiar' }));
        c.appendChild(a);
    } else {
        const i = el('input'); i.id = 'rpEdVal'; i.autocomplete = 'off';
        if (pr.t === 'numero') { i.type = 'number'; i.step = 'any'; i.placeholder = pr.cant ? 'Cantidad' : 'Monto en ' + (cfg.moneda || ''); }
        else if (pr.t === 'fecha') { i.type = 'date'; i.min = '2018-01-01'; }
        else { i.type = 'text'; i.placeholder = 'Texto a buscar'; }
        i.value = e.v ?? ''; i.setAttribute('aria-label', pr.l);
        i.addEventListener('input', () => { e.v = i.value; });
        i.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); aplicarEditor(); } });
        c.appendChild(i);
    }
    const z = el('div', 'rp-ed-z');
    if (e.cond) z.appendChild(mini('QUITAR FILTRO', 'rojo', () => { const [i, j] = e.cond; const s = cfg.segs[i]; s.conds.splice(j, 1); if (!s.conds.length) cfg.segs.splice(i, 1); cerrarPop(); cfg.alCambiar(); }, { rp: 'edquitar' }));
    z.appendChild(el('span', 'rp-esp'));
    z.appendChild(mini('CANCELAR', '', () => cerrarPop(), { rp: 'edcancelar' }));
    z.appendChild(mini(e.cond ? 'ACTUALIZAR' : 'APLICAR', 'azul', () => aplicarEditor(), { rp: 'edaplicar' }));
    c.appendChild(z);
}
function aplicarEditor() {
    const cfg = pop.cfg, e = pop.ed, pr = cfg.props.find(p => p.k === e.p);
    let v = e.v;
    if (pr.t === 'lista') { if (!v.length) { avisar('Elige al menos un valor.', 'ojo'); return; } }
    else {
        v = String(document.getElementById('rpEdVal')?.value ?? v ?? '').trim();
        if (v === '') { avisar(pr.t === 'numero' ? 'Escribe una cantidad.' : pr.t === 'fecha' ? 'Elige una fecha.' : 'Escribe un texto.', 'ojo'); return; }
        if (pr.t === 'numero') { v = Number(v); if (!Number.isFinite(v)) { avisar('Escribe una cantidad.', 'ojo'); return; } }
    }
    const c = { p: e.p, op: document.getElementById('rpEdOp')?.value || e.op, v };
    if (e.cond) { const [i, j] = e.cond; cfg.segs[i].conds[j] = c; }
    else if (pop.target != null && cfg.segs[pop.target]) cfg.segs[pop.target].conds.push(c);
    else if (!agregarSegmento(cfg.segs, [c])) return;
    cerrarPop(); cfg.alCambiar();
}

function pintarGuardar(c) {
    const g = pop.guardar;
    c.appendChild(el('div', 'rp-ed-f', 'Guardar en «Guardados»'));
    const i = el('input'); i.id = 'rpGuNombre'; i.type = 'text'; i.maxLength = 120; i.autocomplete = 'off'; i.placeholder = 'Nombre'; i.value = g.titulo; i.setAttribute('aria-label', 'Nombre');
    i.addEventListener('input', () => { g.titulo = i.value; });
    i.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); hacerGuardar(); } });
    c.appendChild(i);
    const quien = el('div', 'rp-seg rp-quien'); quien.setAttribute('role', 'group'); quien.setAttribute('aria-label', 'Quién la ve');
    for (const [k, t] of [[false, 'SOLO YO'], [true, 'EQUIPO']]) { const b = boton(t, g.compartida === k ? 'on' : '', () => { g.compartida = k; pintarPop(); }, { compartida: String(k) }); b.setAttribute('aria-pressed', String(g.compartida === k)); quien.appendChild(b); }
    c.appendChild(quien);
    if (pop.cfg.notaGuardar) c.appendChild(el('p', 'rp-pop-nota', pop.cfg.notaGuardar));
    const z = el('div', 'rp-ed-z'); z.appendChild(el('span', 'rp-esp'));
    z.appendChild(mini('CANCELAR', '', () => cerrarPop(), { rp: 'gucancelar' }));
    const ok = mini('GUARDAR', 'azul', () => hacerGuardar(), { rp: 'guguardar' }); ok.id = 'rpGuGuardar'; ok.disabled = g.enVuelo; z.appendChild(ok);
    c.appendChild(z);
}
async function hacerGuardar() {
    const g = pop.guardar; if (g.enVuelo) return;
    const t = String(g.titulo || '').trim(); if (!t) { avisar('Ponle un nombre.', 'ojo'); return; }
    g.enVuelo = true; pintarPop();
    try { await g.alGuardar(t, g.compartida); cerrarPop(); avisar(`Guardado en «Guardados»: ${t}${g.compartida ? ' (lo ve el equipo)' : ''}.`, 'ok'); }
    catch (e) { g.enVuelo = false; if (pop) pintarPop(); avisar('No se pudo guardar: ' + (e && e.message ? e.message : e), 'error'); }
}
