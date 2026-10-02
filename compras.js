// MINSA ERP v0.169.0 — COMPRAS (Carlos, 2-oct: «lo ven Lorena y José»; «no importa que vean los montos»;
// maqueta https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn). Las órdenes de compra que emite MINSA, con sus partidas.
//   - SOLO LEE: compras.json de CONFIG.bibliotecaOperacion (ERP_Operacion, la misma de Servicios), que publica la laptop
//     (docs/publicar-cobranza.ps1 v1.3.0+, con .claude/skills/_compartido/scripts/compras.py sobre los .docx de cada O.C.).
//   - La ven gerencia y colaborador (PUEDE.tarea); quien LEE de verdad lo decide SharePoint (ERP_Operacion sin herencia).
//   - Hoy solo PRODEOS (PDH-###). El estado (surtida, facturada, nunca surtida) NO viaja: no hay dónde se capture todavía.
//   - Se lee la PRIMERA vez que se entra a #compras en la sesion y con «Volver a leer»; el refresco de 2 min no lo toca.
// Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { PUEDE } from './reglas.js';
import { $, estado, el, boton, chip } from './comun.js';
import { problemaCompras, ordenarCompras, resumenCompras, conceptoDe, COMPRAS_VIEJA_DIAS } from './compras-reglas.js';
import { diasDesde, monto } from './cobranza-reglas.js';
import { fechaCorta } from './servicios-reglas.js';

/** datos: null = no leido · false = no hay biblioteca/archivo · objeto = el JSON valido. error: la lectura fallo. */
const K = { datos: null, error: null, cargando: null };
export const estadoCompras = () => K;
let alCambiar = () => {};
export function alCambiarCompras(fn) { alCambiar = fn; }
export const puedeVerCompras = () => PUEDE.tarea(estado.rol);
const motivo = e => (e && e.message ? e.message : String(e));
/** Que partidas estan abiertas (folio): sobrevive a los repintados del refresco. */
const abiertas = new Set();

export async function cargarCompras() {
    const c = estado.cliente, s = estado.siteId;
    try {
        if (!await c.existeLista(s, CONFIG.bibliotecaOperacion)) { K.datos = false; K.error = null; return; }
        const driveId = await c.driveDeLista(s, CONFIG.bibliotecaOperacion);
        const leido = await c.leerJsonDeDrive(driveId, CONFIG.archivoCompras, undefined, 512 * 1024);
        if (!leido) { K.datos = false; K.error = null; return; }
        const p = problemaCompras(leido.datos);
        if (p) { K.error = `${CONFIG.archivoCompras}: ${p}`; return; }
        K.datos = leido.datos; K.error = null;
    } catch (e) { K.error = motivo(e); }
}
function asegurarCarga() {
    if (K.datos !== null || K.cargando || K.error) return;
    K.cargando = cargarCompras().finally(() => { K.cargando = null; alCambiar(); });
}
function volverALeer() { K.datos = null; K.error = null; asegurarCarga(); alCambiar(); }

function tarjetaAviso(v, id, chipTxt, chipCls, titulo, texto) {
    const c = el('section', 'mn-card'); c.id = id;
    c.appendChild(chip(chipTxt, chipCls));
    if (titulo) c.appendChild(el('h2', '', titulo));
    c.appendChild(el('p', '', texto));
    const r = boton('Volver a leer', 'mn-btn', volverALeer); r.id = 'btnLeerCompras'; c.appendChild(r);
    v.appendChild(c);
}

/** El renglón de detalle: las partidas con cantidad, unidad, P.U. y total, y el desglose subtotal / IVA. */
function filaDetalle(o) {
    const tr = el('tr', 'cmp-detalle'); const td = el('td'); td.colSpan = 5;
    const ul = el('ul', 'cmp-partidas');
    for (const p of o.partidas) {
        const li = el('li');
        li.appendChild(el('span', 'cmp-desc', `${p.n}. ${p.descripcion}`));
        li.appendChild(el('span', 'mn-mono cmp-cant', `${p.cantidad.toLocaleString('es-MX')} ${p.unidad} × ${monto(p.pu)}`));
        li.appendChild(el('b', 'mn-mono cmp-imp', monto(p.total)));
        if (p.cuadra === false) { li.classList.add('is-no-cuadra'); li.appendChild(chip(`cantidad × P.U. da ${monto(p.cantidad * p.pu)}, no ${monto(p.total)}: así quedó en la orden`, 'danger')); }
        ul.appendChild(li);
    }
    td.appendChild(ul);
    td.appendChild(el('p', 'mn-mono cob-sub cmp-totales', `Subtotal ${monto(o.subtotal)} · IVA ${monto(o.iva)} · Total ${monto(o.total, o.moneda)}`));
    td.appendChild(el('p', 'cob-sub', `Archivo: ${o.archivo}`));
    tr.appendChild(td);
    return tr;
}

/** #compras. Pinta en #comprasCuerpo; la cabecera es fija (index.html). */
export function pintarCompras() {
    const v = $('comprasCuerpo'); v.textContent = '';
    if (!puedeVerCompras()) return;
    if (K.datos === null && !K.error) {
        asegurarCarga();
        const c = el('section', 'mn-card'); c.id = 'comprasCargando'; c.appendChild(el('p', 'muted', 'Leyendo las órdenes de compra…')); v.appendChild(c);
        return;
    }
    if (K.error) { tarjetaAviso(v, 'comprasError', 'no se pudo leer', 'danger', '', 'No se pudieron leer las órdenes de compra: ' + K.error); return; }
    if (K.datos === false) {
        if (PUEDE.capital(estado.rol)) {
            tarjetaAviso(v, 'comprasNoHabilitada', 'aún no habilitado', 'warn', 'Todavía no hay órdenes publicadas',
                `Falta la biblioteca «${CONFIG.bibliotecaOperacion}» en el sitio Administración o el archivo ${CONFIG.archivoCompras} dentro de ella. Lo publica la laptop de Carlos junto con la cobranza (README, «Al publicar v0.169.0»).`);
        } else {
            tarjetaAviso(v, 'comprasSinAcceso', 'sin acceso', 'warn', 'No tienes acceso a las compras',
                `Las órdenes de compra se leen de la biblioteca «${CONFIG.bibliotecaOperacion}», y tu cuenta no la ve (o todavía no se publican). Pídele a Carlos que te dé lectura.`);
        }
        return;
    }
    const d = K.datos;
    const lista = ordenarCompras(d.ordenes);
    const r = resumenCompras(lista);
    const dias = diasDesde(d.generado);
    const corte = new Date(d.generado).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    $('comprasSub').textContent = `Las órdenes de compra que emite MINSA, la más nueva primero. Corte del ${corte}.`;

    const kpis = el('div', 'cob-kpis'); kpis.id = 'comprasKpis';
    const kpi = (k, val, pie) => { const c = el('div', 'mn-card cob-kpi'); c.appendChild(el('span', 'cob-k', k)); c.appendChild(el('b', 'cob-v mn-mono', String(val))); const p = el('div', 'cob-pie'); if (pie) p.appendChild(pie); c.appendChild(p); kpis.appendChild(c); return c; };
    kpi('Órdenes emitidas', r.total, null);
    const monedas = Object.keys(r.porMoneda);
    // «Emitido», no «comprado»: sin estado no se sabe cuáles se surtieron (la PDH-008 nunca se surtió, según la KB)
    kpi(`Emitido en ${r.anio}`, monedas.length ? monedas.map(m => monto(r.porMoneda[m], m)).join(' · ') : '0', el('span', 'cob-sub', `${r.delAnio} ${r.delAnio === 1 ? 'orden' : 'órdenes'}, con IVA; surtidas o no`));
    const f = kpi('Antigüedad del corte', `${dias} ${dias === 1 ? 'día' : 'días'}`, dias >= COMPRAS_VIEJA_DIAS ? chip('corte viejo: re-publicar', 'warn') : chip('al día', 'ok'));
    f.id = 'comprasCorte';
    v.appendChild(kpis);

    const caja = el('section', 'mn-card cob-caja');
    const tabla = el('table', 'cob-tabla cmp-tabla'); tabla.id = 'comprasTabla';
    const th = el('tr');
    for (const [t, cls] of [['Folio', ''], ['Fecha', ''], ['Proveedor', ''], ['Concepto', ''], ['Total', 'n']]) { const c = el('th', cls, t); c.scope = 'col'; th.appendChild(c); }
    const thead = el('thead'); thead.appendChild(th); tabla.appendChild(thead);
    const tbody = el('tbody');
    for (const o of lista) {
        const tr = el('tr', 'cmp-fila'); tr.dataset.folio = o.folio;
        const tdF = el('td', 'cmp-folio');
        const b = boton(o.folio, 'mn-btn is-sm is-ghost cmp-abrir', () => { if (abiertas.has(o.folio)) abiertas.delete(o.folio); else abiertas.add(o.folio); pintarCompras(); });
        b.setAttribute('aria-expanded', String(abiertas.has(o.folio)));
        tdF.appendChild(b); tr.appendChild(tdF);
        tr.appendChild(el('td', 'mn-mono cmp-fecha', fechaCorta(o.fecha)));
        tr.appendChild(el('td', 'cmp-prov', o.proveedor));
        const tdC = el('td', 'cmp-concepto', conceptoDe(o));
        if (o.partidas.some(p => p.cuadra === false)) tdC.appendChild(chip('una partida no cuadra', 'danger'));
        tr.appendChild(tdC);
        tr.appendChild(el('td', 'n mn-mono cmp-total', monto(o.total, o.moneda)));
        tbody.appendChild(tr);
        if (abiertas.has(o.folio)) tbody.appendChild(filaDetalle(o));
    }
    tabla.appendChild(tbody);
    caja.appendChild(tabla);
    v.appendChild(caja);
    v.appendChild(el('p', 'muted cob-nota', 'Cada renglón sale del .docx de la orden (hoy, las de PRODEOS que genera /orden-compra-prodeos). Toca el folio para ver sus partidas. Los totales llevan IVA. Si una orden se surtió, se facturó o nunca se surtió no se registra todavía: eso vive en el expediente del servicio.'));
    const pie = el('div', 'cob-acciones');
    const rb = boton('Volver a leer', 'mn-btn is-sm', volverALeer); rb.id = 'btnLeerCompras'; pie.appendChild(rb);
    v.appendChild(pie);
}
