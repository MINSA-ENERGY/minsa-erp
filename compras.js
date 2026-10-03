// MINSA ERP v0.169.0 — COMPRAS (Carlos, 2-oct: «lo ven Lorena y José»; «no importa que vean los montos»;
// maqueta https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn). Las órdenes de compra que emite MINSA, con sus partidas.
//   - SOLO LEE: compras.json de CONFIG.bibliotecaOperacion (ERP_Operacion, la misma de Servicios), que publica la laptop
//     (docs/publicar-cobranza.ps1 v1.3.0+, con .claude/skills/_compartido/scripts/compras.py sobre los .docx de cada O.C.).
//   - La ven gerencia y colaborador (PUEDE.tarea); quien LEE de verdad lo decide SharePoint (ERP_Operacion sin herencia).
//   - Hoy solo PRODEOS (PDH-###). El estado (surtida, facturada, nunca surtida) NO viaja: no hay dónde se capture todavía.
//   - Se lee la PRIMERA vez que se entra a #compras en la sesion y con «Volver a leer»; el refresco de 2 min no lo toca.
// v1.0.0 (rediseño 2026-10-02, cubeta 3; plan «Operación»; maqueta maqueta-reportes.html, com-ordenes / com-partidas): dos páginas con la
// plantilla de reporte (reporte.js) — #compras (Órdenes de compra: barras por orden, KPIs y la tabla con las partidas desplegables y la marca
// «no cuadra») y #compras/partidas (la misma tabla con TODAS las órdenes abiertas; el CSV es por partida). Desplegable PROVEEDOR; las monedas
// nunca se suman (si un día hay órdenes en dólares, el desplegable de moneda aparece solo).
// Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { PUEDE, plural } from './reglas.js';
import { $, estado, el, boton, chip } from './comun.js';
import { problemaCompras, ordenarCompras, conceptoDe, proveedoresDe, monedasDe, filtrarCompras, kpisCompras } from './compras-reglas.js';
import { fmtMonto, fmtCorto, fechaCorta } from './reporte-reglas.js';
import { pintarReporte, cabecera, vistaDe, soltarIdsFuera, desplegable } from './reporte.js';

/** datos: null = no leido · false = no hay biblioteca/archivo · objeto = el JSON valido. error: la lectura fallo. */
const K = { datos: null, error: null, cargando: null };
export const estadoCompras = () => K;
let alCambiar = () => {};
export function alCambiarCompras(fn) { alCambiar = fn; }
export const puedeVerCompras = () => PUEDE.tarea(estado.rol);
const motivo = e => (e && e.message ? e.message : String(e));

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
/** v1.0.0 (cubeta 4): exportada — Inicio la llama para su KPI y «Requiere atención» (la misma lectura única por sesión). */
export function asegurarCarga() {
    if (K.datos !== null || K.cargando || K.error) return;
    K.cargando = cargarCompras().finally(() => { K.cargando = null; alCambiar(); });
}
function volverALeer() { K.datos = null; K.error = null; asegurarCarga(); alCambiar(); }
const BTN_LEER = () => { const r = boton('Volver a leer', 'mn-btn is-sm', volverALeer); r.id = 'btnLeerCompras'; return r; };

const TITULO = { ordenes: 'Órdenes de compra', partidas: 'Partidas por orden' };
const AYUDA = 'Cada renglón es una orden de compra que emitió MINSA, leída del .docx de la orden (hoy, las de PRODEOS que genera /orden-compra-prodeos). Los totales llevan IVA. «No cuadra» marca una partida cuya cantidad × P.U. no da su importe: así quedó escrita en la orden. Si una orden se surtió, se facturó o nunca se surtió no se registra todavía.';
const MONEDA_TXT = { MXN: 'EN PESOS', USD: 'EN DÓLARES' }, MONEDA_OP = { MXN: 'En pesos (MXN)', USD: 'En dólares (USD)' };

function tarjetaEstado(v, id, chipTxt, chipCls, titulo, texto, conBoton = true) {
    soltarIdsFuera(v);
    v.appendChild(cabecera({ id: 'compras', titulo: TITULO.ordenes }, vistaDe('compras'), () => alCambiar()));
    const c = el('section', 'rp-card rp-aviso'); c.id = id;
    if (chipTxt) c.appendChild(chip(chipTxt, chipCls));
    if (titulo) c.appendChild(el('h2', '', titulo));
    c.appendChild(el('p', '', texto));
    if (conBoton) c.appendChild(BTN_LEER());
    v.appendChild(c);
}

/** #compras[/partidas]. Pinta en #comprasCuerpo (cabecera incluida). */
export function pintarCompras() {
    const v = $('comprasCuerpo'); v.textContent = '';
    if (!puedeVerCompras()) return;
    if (K.datos === null && !K.error) { asegurarCarga(); tarjetaEstado(v, 'comprasCargando', null, null, '', 'Leyendo las órdenes de compra…', false); return; }
    if (K.error) { tarjetaEstado(v, 'comprasError', 'no se pudo leer', 'danger', '', 'No se pudieron leer las órdenes de compra: ' + K.error); return; }
    if (K.datos === false) {
        if (PUEDE.capital(estado.rol)) {
            tarjetaEstado(v, 'comprasNoHabilitada', 'aún no habilitado', 'warn', 'Todavía no hay órdenes publicadas',
                `Falta la biblioteca «${CONFIG.bibliotecaOperacion}» en el sitio Administración o el archivo ${CONFIG.archivoCompras} dentro de ella. Lo publica la laptop de Carlos junto con la cobranza (README, «Al publicar v0.169.0»).`);
        } else {
            tarjetaEstado(v, 'comprasSinAcceso', 'sin acceso', 'warn', 'No tienes acceso a las compras',
                `Las órdenes de compra se leen de la biblioteca «${CONFIG.bibliotecaOperacion}», y tu cuenta no la ve (o todavía no se publican). Pídele a Carlos que te dé lectura.`);
        }
        return;
    }
    const pag = estado.sub === 'partidas' ? 'partidas' : 'ordenes';
    pintarPagina(v, K.datos, pag);
}

function pintarPagina(v, d, pag) {
    const id = pag === 'partidas' ? 'compras-partidas' : 'compras', w = vistaDe(id);
    const lista = ordenarCompras(d.ordenes), monedas = monedasDe(lista), provs = proveedoresDe(lista);
    if (!monedas.includes(w.moneda)) w.moneda = monedas[0] || 'MXN';   // la moneda de las demás vistas (Dinero) no aplica aquí si no hay órdenes en ella
    if (w.proveedor && !provs.includes(w.proveedor)) w.proveedor = null;
    const de = x => filtrarCompras(lista, x.proveedor || null, x.moneda);   // la más nueva primero
    const todas = pag === 'partidas';
    pintarReporte(v, {
        id, titulo: TITULO[pag], ayuda: AYUDA, corte: d.generado, subId: 'comprasSub',
        sub: todas ? 'Cada orden con sus partidas a la vista; el CSV sale por partida.' : 'Las órdenes de compra que emite MINSA, la más nueva primero.',
        grafica: { tipos: false, grano: false, moneda: x => x.moneda, decimales: 2, vacio: 'Sin órdenes con ese filtro.',
            datos: x => ({ puntos: de(x).slice().reverse().map(o => ({ etiqueta: o.folio, y: o.total })) }) },
        kpisId: 'comprasKpis',
        kpis: x => {
            const k = kpisCompras(filtrarCompras(lista, x.proveedor || null, null), x.moneda);
            return [
                { clave: 'ordenes', valor: String(k.ordenes), texto: 'Órdenes emitidas' },
                { clave: 'anio', valor: fmtMonto(k.emitidoAnio, x.moneda, 2), texto: `Emitido en ${k.anio} · ${k.nAnio} ${plural(k.nAnio, 'orden', 'órdenes')}`, titulo: 'Con IVA; surtidas o no (el estado de la orden todavía no se registra)' },
                { clave: 'promedio', valor: fmtCorto(k.promedio, x.moneda), texto: 'Promedio por orden' },
                { clave: 'ultima', valor: k.ultima ? fechaCorta(k.ultima.fecha) : '—', texto: k.ultima ? `Última orden · ${k.ultima.folio}` : 'Última orden' },
                { clave: 'nocuadra', valor: String(k.noCuadran), texto: `${plural(k.noCuadran, 'Partida que no cuadra', 'Partidas que no cuadran')}`, clase: k.noCuadran ? 'neg' : '' }
            ];
        },
        datos: {
            tablaId: 'comprasTabla', nombreCsv: todas ? 'compras-partidas' : 'compras-ordenes',
            monedas: monedas.length > 1 ? monedas : null, textoMoneda: MONEDA_TXT, opcionMoneda: MONEDA_OP,
            antesDeMoneda: x => [desplegable({ id: 'comprasProveedor', prefijo: 'Proveedor: ', titulo: 'De qué proveedor',
                opciones: [{ clave: '', texto: 'Todos' }, ...provs.map(p => ({ clave: p, texto: p }))], actual: x.proveedor || '', alElegir: k => { x.proveedor = k || null; x.abiertos.clear(); alCambiar(); } })],
            columnas: x => [{ texto: 'Orden' }, { texto: 'Fecha' }, { texto: 'Partidas' }, { texto: 'Subtotal' }, { texto: 'IVA 16%' }, { texto: `Total ${x.moneda}`, total: true }],
            filas: x => de(x).map(o => {
                const mal = o.partidas.filter(p => p.cuadra === false).length;
                const extra = [];
                if (mal) extra.push(chip(mal === 1 ? 'no cuadra' : `${mal} no cuadran`, 'danger'));
                extra.push(el('span', 'rp-sub cmp-concepto', conceptoDe(o)));
                return { clave: o.folio, abierto: todas, clase: 'cmp-fila' + (mal ? ' is-no-cuadra' : ''), datos: { folio: o.folio },
                    celdas: [{ t: o.folio, lk: !todas, clase: 'cmp-folio', despues: extra }, { t: fechaCorta(o.fecha), clase: 'cmp-fecha' }, String(o.partidas.length),
                        fmtMonto(o.subtotal, o.moneda), fmtMonto(o.iva, o.moneda), { t: fmtMonto(o.total, o.moneda), clase: 'cmp-total' }],
                    hijos: o.partidas.map(p => ({ clase: 'cmp-partida' + (p.cuadra === false ? ' is-no-cuadra' : ''),
                        celdas: [`${p.n}. ${p.descripcion}`, `${Number(p.cantidad).toLocaleString('en-US')} ${p.unidad}`, `× ${fmtMonto(p.pu, o.moneda)}`,
                            p.cuadra === false ? { nodo: chip(`P.U. × cantidad = ${fmtMonto(p.cantidad * p.pu, o.moneda)}, no ${fmtMonto(p.total, o.moneda)}`, 'danger'), colSpan: 2 } : { t: '', colSpan: 2, clase: 'rp-vacia' },
                            fmtMonto(p.total, o.moneda)] })) };
            }),
            vacio: 'Sin órdenes con ese filtro.',
            pie: x => { const os = de(x); if (!os.length) return []; const s = k => os.reduce((a, o) => a + o[k], 0);
                return [{ celdas: [{ t: 'Total emitido', lk: true }, '', { t: String(os.reduce((a, o) => a + o.partidas.length, 0)) }, fmtMonto(s('subtotal'), x.moneda), fmtMonto(s('iva'), x.moneda), fmtMonto(s('total'), x.moneda)] }]; },
            csv: x => todas
                ? { columnas: ['Orden', 'Fecha', 'Proveedor', 'Partida', 'Descripción', 'Cantidad', 'Unidad', 'P.U.', 'Importe', 'Cuadra', 'Moneda'],
                    filas: de(x).flatMap(o => o.partidas.map(p => [o.folio, o.fecha, o.proveedor, p.n, p.descripcion, p.cantidad, p.unidad, p.pu, p.total, p.cuadra === false ? 'no' : 'sí', o.moneda])) }
                : { columnas: ['Orden', 'Fecha', 'Proveedor', 'Concepto', 'Partidas', 'Subtotal', 'IVA', 'Total', 'Moneda', 'Archivo'],
                    filas: de(x).map(o => [o.folio, o.fecha, o.proveedor, conceptoDe(o), o.partidas.length, o.subtotal, o.iva, o.total, o.moneda, o.archivo || '']) },
            nota: 'Leído del .docx de cada orden (hoy, las de PRODEOS que genera /orden-compra-prodeos). Toca el folio para ver sus partidas. Los totales llevan IVA. Si una orden se surtió, se facturó o nunca se surtió no se registra todavía: eso vive en el expediente del servicio. Las monedas nunca se suman.',
            pieDeTarjeta: () => [pie(todas)]
        }
    });
}
function pie(todas) {
    const p = el('div', 'rp-pie-card');
    const a = el('a', 'mn-btn is-sm is-ghost', todas ? 'Solo las órdenes' : 'Ver todas las partidas'); a.href = todas ? '#compras' : '#compras/partidas';
    p.appendChild(a); p.appendChild(BTN_LEER());
    return p;
}
