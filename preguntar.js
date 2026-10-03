// MINSA ERP v1.0.0 — PREGUNTAR, el panel (rediseño 2026-10-02, cubeta 4; plan «Preguntar (sin IA)»; maqueta #chat, chatInicio y responde).
// Panel derecho de 440 px (hoja completa en celular), CERRADO por defecto; lo abren y cierran los botones PREGUNTAR de la cabecera de la plantilla
// ([data-preguntar], reporte.js) y #btnPreguntar (hueco del armazón). Arriba «Pregunta lo que sea», el input, las preguntas sugeridas POR ROL
// calculadas en vivo y las recientes (este equipo, por cuenta); al preguntar, la conversación: la pregunta, la respuesta con sus filas y una liga
// «Abrir» a la página o al segmento. Pie literal: «Respuestas calculadas con los datos de la app (no es IA)».
//
// EL PUNTO DE ENCHUFE es responder(pregunta): hoy contesta con reglas locales (preguntar-reglas.js) sobre los datos ya cargados; un agente de
// Copilot Studio (fase 2, fuera de esta versión) entraría ahí con la misma firma — una promesa de { entendida, texto, filas, liga }. Nada más
// del panel cambia. Nada de innerHTML: el() / textContent.

import { $, estado, el, boton, iconoSvg, TRAZOS } from './comun.js';
import { sugeridasPara, interpretarPregunta, PIE_PREGUNTAR } from './preguntar-reglas.js';
import { contextoDatos } from './inicio.js';
import { abrirGuardado } from './guardados.js';

let nav = { irARuta: () => {}, irA: () => {} };
export function fijarNavPreguntar(fns) { nav = { ...nav, ...fns }; }
const enCelular = window.matchMedia('(max-width: 720px)');

/** Contesta una pregunta. Hoy: reglas sobre los datos de la app (no es IA). Aislada a propósito: aquí se enchufaría un agente después. */
export async function responder(pregunta) {
    return interpretarPregunta(pregunta, contextoDatos(true));
}

// ---------------------------------------------------------------- recientes (este equipo, por cuenta; si el navegador no guarda, no pasa nada)

const llaveRecientes = () => `erp.preguntas.${String(estado.cuenta && estado.cuenta.username || '').toLowerCase()}`;
function recientes() { try { const v = JSON.parse(localStorage.getItem(llaveRecientes()) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 5) : []; } catch (_) { return []; } }
function guardarReciente(q) { try { localStorage.setItem(llaveRecientes(), JSON.stringify([q, ...recientes().filter(x => x !== q)].slice(0, 5))); } catch (_) { /* sin almacenamiento: no se recuerda */ } }

// ---------------------------------------------------------------- abrir y cerrar

const conv = [];   // la conversación a la vista: [{ q, r }] (r null = esperando la respuesta)
export const preguntarAbierto = () => !$('preguntar').hidden;
function marcarBotones(abierto) {
    for (const b of document.querySelectorAll('[data-preguntar], #btnPreguntar')) b.setAttribute('aria-expanded', String(abierto));
}
export function abrirPreguntar() {
    if (!estado.sesion) return;
    contextoDatos(true);   // pide la lectura única de los JSON que el rol ve: las sugeridas se completan al llegar (refrescarPreguntar)
    $('preguntar').hidden = false; document.body.classList.add('con-preguntar'); marcarBotones(true);
    pintar();
    const i = $('pqTexto'); if (i) i.focus();
}
export function cerrarPreguntar(devolverA = null) {
    if (!preguntarAbierto()) return;
    $('preguntar').hidden = true; document.body.classList.remove('con-preguntar'); marcarBotones(false);
    if (devolverA && devolverA.isConnected) devolverA.focus();
}
/** app.js lo llama al repintar: con el panel en su portada, las sugeridas se recalculan (los JSON pudieron llegar). */
export function refrescarPreguntar() { if (preguntarAbierto() && !conv.length && document.activeElement !== $('pqTexto')) pintar(); }

// ---------------------------------------------------------------- pintar

function formulario(placeholder) {
    const f = el('form', 'pq-inp'); f.id = 'pqForma'; f.setAttribute('role', 'search');
    const i = el('input'); i.id = 'pqTexto'; i.type = 'text'; i.placeholder = placeholder; i.autocomplete = 'off'; i.setAttribute('aria-label', 'Tu pregunta'); i.maxLength = 200;
    const b = el('button', 'pq-enviar'); b.type = 'submit'; b.id = 'pqEnviar'; b.setAttribute('aria-label', 'Preguntar'); b.title = 'Preguntar'; b.appendChild(iconoSvg(TRAZOS.flecha));
    f.appendChild(i); f.appendChild(b);
    f.addEventListener('submit', ev => { ev.preventDefault(); const q = i.value.trim(); if (q) preguntar(q); });
    return f;
}
function listaPreguntas(clase, titulo, preguntas, dato) {
    const c = el('div', clase); c.appendChild(el('small', '', titulo));
    for (const q of preguntas) c.appendChild(boton(q, 'pq-q', () => preguntar(q), { [dato]: q }));
    return c;
}
function pintar() {
    const c = $('pqCuerpo'); c.textContent = '';
    $('pqTitulo').textContent = conv.length ? 'Conversación' : 'Conversación nueva';
    if (!conv.length) {
        c.appendChild(el('h3', 'pq-h', 'Pregunta lo que sea'));
        c.appendChild(el('p', 'pq-sub', 'Sobre tus tareas, los frentes, los servicios, las compras, las vigencias o lo que nos deben, con los datos que la app ya tiene.'));
        c.appendChild(formulario('Pregunta lo que sea'));
        const sug = sugeridasPara(contextoDatos(false));
        c.appendChild(listaPreguntas('pq-sug', 'Preguntas sugeridas', sug, 'sugerida'));
        const rec = recientes();
        if (rec.length) c.appendChild(listaPreguntas('pq-rec', 'Preguntas recientes (este equipo)', rec, 'reciente'));
        return;
    }
    const msgs = el('div', 'pq-msgs'); msgs.setAttribute('role', 'log'); msgs.setAttribute('aria-live', 'polite');
    for (const m of conv) {
        msgs.appendChild(el('div', 'pq-msg is-yo', m.q));
        const r = el('div', 'pq-msg is-resp');
        if (!m.r) { r.classList.add('is-esperando'); const t = el('div', 'pq-typing'); t.setAttribute('aria-label', 'Calculando'); for (let i = 0; i < 3; i++) t.appendChild(el('i')); r.appendChild(t); }
        else pintarRespuesta(r, m.r);
        msgs.appendChild(r);
    }
    c.appendChild(msgs);
    c.appendChild(formulario('Haz otra pregunta'));
    msgs.lastChild.scrollIntoView && msgs.lastChild.scrollIntoView({ block: 'nearest' });
}
function pintarRespuesta(caja, r) {
    caja.dataset.intento = r.intento || 'ninguno';
    if (!r.entendida) caja.classList.add('is-no');
    caja.appendChild(el('p', 'pq-texto', r.texto));
    if (r.filas && r.filas.length) {
        const t = el('table', 'pq-tabla'); const tb = el('tbody');
        for (const f of r.filas) { const tr = el('tr'); tr.appendChild(el('td', '', f.a)); tr.appendChild(el('td', 'pq-v', f.b)); tb.appendChild(tr); }
        t.appendChild(tb); caja.appendChild(t);
    }
    if (r.liga) caja.appendChild(boton(r.liga.texto, 'mn-btn is-sm pq-liga', () => seguirLiga(r.liga), { liga: r.liga.ir || 'segmento' }));
    if (!r.entendida) {
        const sug = sugeridasPara(contextoDatos(false));
        caja.appendChild(listaPreguntas('pq-sug is-dentro', 'Prueba con', sug, 'sugerida'));
    }
}
function seguirLiga(l) {
    if (enCelular.matches) cerrarPreguntar();   // en celular el panel es la hoja entera: se cierra para ver la página
    if (l.segmento) { abrirGuardado({ id: 'pregunta', titulo: 'Segmento armado con Preguntar', compartida: false, definicion: { tipo: 'segmento', ...l.segmento } }); return; }
    if (l.filtroMis) estado.filtroMisAlLlegar = l.filtroMis;
    if (l.ir) nav.irARuta(l.ir);
}
async function preguntar(q) {
    const m = { q, r: null }; conv.push(m); pintar();
    try { m.r = await responder(q); }
    catch (e) { m.r = { entendida: false, intento: null, texto: 'No se pudo calcular la respuesta: ' + (e && e.message ? e.message : e), filas: [] }; }
    if (m.r.entendida) guardarReciente(q);   // a «recientes» solo va lo que sí se pudo contestar
    pintar();
    const i = $('pqTexto'); if (i && !enCelular.matches) i.focus();
}

export function engancharPreguntar() {
    $('pqPie').textContent = PIE_PREGUNTAR;
    // los PREGUNTAR de las cabeceras se repintan con cada pantalla: un solo listener delegado
    document.addEventListener('click', ev => {
        const b = ev.target.closest && ev.target.closest('[data-preguntar], #btnPreguntar'); if (!b) return;
        if (preguntarAbierto()) cerrarPreguntar(); else abrirPreguntar();
    });
    $('pqCerrar').addEventListener('click', () => cerrarPreguntar(document.querySelector('.pantalla:not(.oculto) [data-preguntar]')));
    $('pqNueva').addEventListener('click', () => { conv.length = 0; pintar(); const i = $('pqTexto'); if (i) i.focus(); });
    $('preguntar').addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cerrarPreguntar(document.querySelector('.pantalla:not(.oculto) [data-preguntar]')); } });
}
/** Para las pruebas: la conversación a la vista. */
export const conversacionPreguntar = () => conv.map(m => ({ q: m.q, r: m.r }));
