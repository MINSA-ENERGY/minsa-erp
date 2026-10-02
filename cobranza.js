// MINSA ERP v0.165.0 — FINANZAS > COBRANZA (Carlos, 2-oct; maqueta https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn).
// Cuanto le deben a MINSA sus clientes y que tan probado esta cada saldo, con el semaforo de `/conciliar-finanzas`:
// ✅ cadena sana · ⚠️ en verificacion · 🔴 sin REP. Solo gerencia (PUEDE.capital: el mismo dato financiero que Capital).
//   - SOLO LEE: cobranza.json de la biblioteca CONFIG.bibliotecaDatos (sitio Administracion), que publica la laptop con
//     .claude/skills/conciliar-finanzas/scripts/exportar_cobranza.py. La app no escribe nada aqui.
//   - Se lee la PRIMERA vez que se entra a #finanzas en la sesión y con «Volver a leer»; el refresco de 2 min no lo toca (el archivo cambia por semana).
//   - Degrada: sin biblioteca o sin archivo lo dice y el resto de la app sigue igual.
//   - v0.170.0: pestaña «Por pagar» (Carlos, 2-oct; maqueta): el MISMO dictamen sobre las facturas RECIBIDAS, que el exportador
//     publica en el mismo cobranza.json como `proveedores`. Cobranza y Por pagar se pintan con pintarSaldos(); C.tab dice cuál.
// Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { PUEDE } from './reglas.js';
import { $, estado, el, boton, chip } from './comun.js';
import { problemaCobranza, totalesCobranza, renglonesCobranza, diasDesde, chipEstado, monto, COBRANZA_VIEJA_DIAS } from './cobranza-reglas.js';

/** datos: null = no leido · false = no hay biblioteca/archivo · objeto = el JSON valido. error: la lectura fallo. */
const C = { datos: null, error: null, cargando: null, abiertos: new Set(), abiertosPP: new Set(), tab: 'cobranza' };
export const estadoCobranza = () => C;
let alCambiar = () => {};
export function alCambiarCobranza(fn) { alCambiar = fn; }
let irA = () => {};
/** app.js le pasa su navegacion (las pestañas Gastos y Capital llevan a sus pantallas). */
export function fijarIrDesdeFinanzas(fn) { irA = fn; }
export const puedeVerFinanzas = () => PUEDE.capital(estado.rol);
const motivo = e => (e && e.message ? e.message : String(e));

export async function cargarCobranza() {
    const c = estado.cliente, s = estado.siteId;
    try {
        if (!await c.existeLista(s, CONFIG.bibliotecaDatos)) { C.datos = false; C.error = null; return; }
        const driveId = await c.driveDeLista(s, CONFIG.bibliotecaDatos);
        const leido = await c.leerJsonDeDrive(driveId, CONFIG.archivoCobranza, undefined, 2 * 1024 * 1024);
        if (!leido) { C.datos = false; C.error = null; return; }
        const p = problemaCobranza(leido.datos);
        if (p) { C.error = `${CONFIG.archivoCobranza}: ${p}`; return; }
        C.datos = leido.datos; C.error = null;
    } catch (e) { C.error = motivo(e); }
}
function asegurarCarga() {
    if (C.datos !== null || C.cargando || C.error) return;
    C.cargando = cargarCobranza().finally(() => { C.cargando = null; alCambiar(); });
}
function volverALeer() { C.datos = null; C.error = null; asegurarCarga(); alCambiar(); }

// ---------------------------------------------------------------- pantalla

/** Las pestañas de Finanzas: Cobranza y Por pagar se pintan aquí (estado C.tab); Gastos y Capital llevan a sus pantallas. */
function pintarTabs(v) {
    const tabs = el('div', 'tabs'); tabs.setAttribute('role', 'tablist'); tabs.id = 'tabsFinanzas';
    for (const [k, texto] of [['cobranza', 'Cobranza'], ['porpagar', 'Por pagar'], ['gastos', 'Gastos'], ['capital', 'Capital']]) {
        const on = k === C.tab;
        const b = el('button', 'tab' + (on ? ' is-on' : ''), texto); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = k; b.setAttribute('aria-selected', String(on));
        if (!on) b.addEventListener('click', () => { if (k === 'cobranza' || k === 'porpagar') { C.tab = k; alCambiar(); } else irA(k); });
        tabs.appendChild(b);
    }
    v.appendChild(tabs);
}

function tarjetaAviso(v, id, chipTxt, chipCls, titulo, texto) {
    const c = el('section', 'mn-card'); c.id = id;
    c.appendChild(chip(chipTxt, chipCls));
    if (titulo) c.appendChild(el('h2', '', titulo));
    c.appendChild(el('p', '', texto));
    const r = boton('Volver a leer', 'mn-btn', volverALeer); r.id = 'btnLeerCobranza'; c.appendChild(r);
    v.appendChild(c);
}

/** Lo que cambia entre Cobranza (clientes, nos deben) y Por pagar (proveedores, les debemos): textos, ids y qué renglones están abiertos. */
const VISTAS = {
    cobranza: { lista: d => d.clientes, aparte: {}, kpi: 'Por cobrar', parte: 'Cliente', ids: ['cobranzaKpis', 'cobranzaCorte', 'cobranzaTabla'], abiertos: C.abiertos,
        sub: 'Lo que nos deben y qué tan probado está cada saldo.',
        nota: '«Sin REP» quiere decir que no hay complemento de pago timbrado, no que no hayan pagado: por eso el saldo se parte por evidencia y no se presenta como cifra firme. «En verificación» cuenta por el extremo alto de su rango. Una factura que el SAT reporta cancelada no suma (sale tachada en el detalle). Las monedas no se suman entre sí. El detalle y la estrategia de cada cliente viven en su expediente de /conciliar-finanzas.' },
    porpagar: { lista: d => d.proveedores, aparte: CONFIG.porPagarAparte || {}, kpi: 'Por pagar', parte: 'Proveedor', ids: ['porPagarKpis', 'porPagarCorte', 'porPagarTabla'], abiertos: C.abiertosPP,
        sub: 'Lo que les debemos a los proveedores y qué tan probado está cada saldo.',
        nota: 'Las facturas que nos emitieron y no tienen pago comprobado. «Sin REP» quiere decir que el proveedor no ha timbrado el complemento de pago, no que no le hayamos pagado: un pago sin REP sigue saliendo aquí, así que el saldo se parte por evidencia y no es cifra firme. «En verificación» cuenta por el extremo alto de su rango. Las monedas no se suman entre sí. El detalle de una contraparte vive en su expediente de /conciliar-finanzas.' }
};

/** #finanzas. Pinta en #finanzasCuerpo; la cabecera es fija (index.html). */
export function pintarFinanzas() {
    const v = $('finanzasCuerpo'); v.textContent = '';
    if (!puedeVerFinanzas()) return;
    pintarTabs(v);
    if (C.datos === null && !C.error) {
        asegurarCarga();
        const c = el('section', 'mn-card'); c.id = 'cobranzaCargando'; c.appendChild(el('p', 'muted', 'Leyendo Finanzas…')); v.appendChild(c);
        return;
    }
    if (C.error) { tarjetaAviso(v, 'cobranzaError', 'no se pudo leer', 'danger', '', 'No se pudo leer cobranza.json: ' + C.error); return; }
    if (C.datos === false) {
        tarjetaAviso(v, 'cobranzaNoHabilitada', 'aún no habilitado', 'warn', 'Todavía no hay datos de cobranza',
            `Falta la biblioteca «${CONFIG.bibliotecaDatos}» en el sitio Administración o el archivo ${CONFIG.archivoCobranza} dentro de ella. Lo publica la laptop de Carlos (README, «Al publicar v0.165.0»).`);
        return;
    }
    const d = C.datos, vista = VISTAS[C.tab];
    const corte = new Date(d.generado).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    $('finanzasSub').textContent = `${vista.sub} Corte del ${corte}.`;
    if (!Array.isArray(vista.lista(d))) {   // un cobranza.json de antes de v0.170.0: trae clientes y no proveedores
        tarjetaAviso(v, 'porPagarSinDatos', 'falta re-publicar', 'warn', 'El archivo publicado todavía no trae lo por pagar',
            `${CONFIG.archivoCobranza} se publicó con un exportador anterior. Se corrige con la siguiente corrida de publicar-cobranza.ps1 (README, «Al publicar v0.170.0»).`);
        return;
    }
    pintarSaldos(v, d, vista);
}

/** KPI por moneda + frescura del corte + tabla por contraparte y moneda, con sus facturas al abrirla. Lo mismo para las dos vistas. */
function pintarSaldos(v, d, vista) {
    const [idKpis, idCorte, idTabla] = vista.ids;
    const dias = diasDesde(d.generado);
    // v0.171.0: las contrapartes marcadas aparte (CONFIG.porPagarAparte) no entran al KPI y van al final de la tabla
    const motivoAparte = c => vista.aparte[c.rfc] || '';
    const normales = vista.lista(d).filter(c => !motivoAparte(c)), apartados = vista.lista(d).filter(c => motivoAparte(c));
    const kpis = el('div', 'cob-kpis'); kpis.id = idKpis;
    for (const t of totalesCobranza(normales)) {
        const k = el('div', 'mn-card cob-kpi');
        k.appendChild(el('span', 'cob-k', `${vista.kpi} · ${t.moneda}`));
        k.appendChild(el('b', 'cob-v mn-mono', monto(t.insoluto)));
        const pie = el('div', 'cob-pie');
        if (t.sin > 0.005) pie.appendChild(chip(`${monto(t.sin)} sin REP`, 'danger'));
        if (t.duda > 0.005) pie.appendChild(chip(`${monto(t.duda)} en verificación`, 'warn'));
        if (t.ok > 0.005) pie.appendChild(chip(`${monto(t.ok)} cadena sana`, 'ok'));
        if (Math.abs(t.cancelado) > 0.005) pie.appendChild(chip(`${monto(t.cancelado)} en CFDI cancelados, no suma`, null));
        k.appendChild(pie);
        kpis.appendChild(k);
    }
    const f = el('div', 'mn-card cob-kpi'); f.id = idCorte;
    f.appendChild(el('span', 'cob-k', 'Antigüedad del corte'));
    f.appendChild(el('b', 'cob-v mn-mono', `${dias} ${dias === 1 ? 'día' : 'días'}`));
    const pf = el('div', 'cob-pie'); pf.appendChild(dias >= COBRANZA_VIEJA_DIAS ? chip('corte viejo: re-correr el exportador', 'warn') : chip('al día', 'ok'));
    f.appendChild(pf); kpis.appendChild(f);
    for (const c of apartados) {   // una tarjeta por contraparte aparte: su saldo por moneda y el motivo
        const k = el('div', 'mn-card cob-kpi cob-aparte'); k.dataset.rfc = c.rfc;
        k.appendChild(el('span', 'cob-k', `Aparte · ${c.nombre}`));
        k.appendChild(el('b', 'cob-v mn-mono', totalesCobranza([c]).map(t => monto(t.insoluto, t.moneda)).join(' · ') || '0'));
        const p = el('div', 'cob-pie'); p.appendChild(chip('no suma a «' + vista.kpi + '»', null)); p.appendChild(el('span', 'cob-sub', motivoAparte(c))); k.appendChild(p);
        kpis.appendChild(k);
    }
    v.appendChild(kpis);

    // Tabla: un renglon por contraparte y moneda; al abrirlo, sus facturas con saldo
    const caja = el('section', 'mn-card cob-caja');
    const tabla = el('table', 'cob-tabla'); tabla.id = idTabla;
    const th = el('tr');
    for (const [t, cls] of [[vista.parte, ''], ['Facturado', 'n'], ['Pagado', 'n'], ['Insoluto', 'n'], ['Evidencia del saldo', '']]) th.appendChild(el('th', cls, t));
    const thead = el('thead'); thead.appendChild(th); tabla.appendChild(thead);
    const tbody = el('tbody');
    const renglon = r => {
        const clave = r.rfc + '|' + r.moneda;
        const abierto = vista.abiertos.has(clave);
        const tr = el('tr', 'cob-cliente' + (abierto ? ' is-abierto' : '')); tr.dataset.clave = clave;
        const tdN = el('td');
        const b = el('button', 'cob-abrir', r.nombre); b.type = 'button'; b.setAttribute('aria-expanded', String(abierto));
        b.addEventListener('click', () => { if (abierto) vista.abiertos.delete(clave); else vista.abiertos.add(clave); alCambiar(); });
        tdN.appendChild(b);
        tdN.appendChild(el('span', 'cob-sub', `${r.moneda} · ${r.facturas.length} ${r.facturas.length === 1 ? 'factura' : 'facturas'} con saldo · ${r.rfc}`));
        if (vista.aparte[r.rfc]) { tr.classList.add('is-aparte'); tdN.appendChild(el('span', 'cob-sub', vista.aparte[r.rfc])); }
        tr.appendChild(tdN);
        tr.appendChild(el('td', 'n mn-mono', monto(r.facturado)));
        tr.appendChild(el('td', 'n mn-mono', monto(r.pagado)));
        tr.appendChild(el('td', 'n mn-mono cob-ins', monto(r.insoluto)));
        const tdE = el('td', 'cob-ev');
        if (r.ok > 0.005) tdE.appendChild(chip(`${monto(r.ok)} sana`, 'ok'));
        if (r.duda_max > 0.005) tdE.appendChild(chip(`${monto(r.duda_max)} en verificación`, 'warn'));
        if (r.sin > 0.005) tdE.appendChild(chip(`${monto(r.sin)} sin REP`, 'danger'));
        if (Math.abs(Number(r.cancelado) || 0) > 0.005) tdE.appendChild(chip(`${monto(r.cancelado)} cancelado, no suma`, null));
        tr.appendChild(tdE);
        tbody.appendChild(tr);
        if (abierto) {
            const trD = el('tr', 'cob-detalle'); const td = el('td'); td.colSpan = 5;
            const lista = el('ul', 'cob-facturas');
            for (const x of r.facturas.slice().sort((a, b2) => b2.insoluto_max - a.insoluto_max)) {
                const li = el('li', x.cancelada ? 'is-cancelada' : null);
                li.appendChild(el('b', 'mn-mono', x.id));
                li.appendChild(el('span', 'cob-fecha', x.fecha));
                li.appendChild(el('span', 'cob-concepto', x.concepto || '—'));
                const rango = Math.abs(x.insoluto_max - x.insoluto_min) > 0.005 ? `${monto(x.insoluto_min)} – ${monto(x.insoluto_max)}` : monto(x.insoluto_max);
                li.appendChild(el('span', 'mn-mono cob-monto', rango));
                const ce = chipEstado(x.estado, x.cancelada); li.appendChild(chip(ce.texto, ce.clase));
                lista.appendChild(li);
            }
            td.appendChild(lista); trD.appendChild(td); tbody.appendChild(trD);
        }
    };
    for (const r of renglonesCobranza(normales)) renglon(r);
    if (apartados.length) {
        const trT = el('tr', 'cob-aparte-tit'); const td = el('td', '', `Aparte — no suma a «${vista.kpi}»`); td.colSpan = 5; trT.appendChild(td); tbody.appendChild(trT);
        for (const r of renglonesCobranza(apartados)) renglon(r);
    }
    tabla.appendChild(tbody);
    caja.appendChild(tabla);
    v.appendChild(caja);
    let nota = vista.nota;
    if (vista === VISTAS.porpagar && !d.vigencia_proveedores) nota += ' No se consultó al SAT si estas facturas siguen vigentes: una que el proveedor haya cancelado sigue sumando hasta que se publique con publicar-cobranza.ps1 -VigenciaProveedores (lento).';
    const pn = el('p', 'muted cob-nota', nota); if (vista === VISTAS.porpagar) pn.id = 'porPagarNota';
    v.appendChild(pn);
    const pie = el('div', 'cob-acciones');
    const r = boton('Volver a leer', 'mn-btn is-sm', volverALeer); r.id = 'btnLeerCobranza'; pie.appendChild(r);
    v.appendChild(pie);
}
