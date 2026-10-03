// MINSA ERP — DINERO › POR COBRAR y POR PAGAR. v0.165.0 (Cobranza) y v0.170.0 (Por pagar) eran las dos pestañas de #finanzas; v1.0.0
// (rediseño 2026-10-02, cubeta 2; plan «Dinero» y «Plantilla de página»; maqueta maqueta-reportes.html, saldos/saldosSeg) los parte en
// OCHO páginas con la plantilla de reporte (reporte.js):
//   #finanzas/cobrar/saldo · cliente · antiguedad · emitido · sin-rep      #finanzas/pagar/saldo · proveedor · antiguedad
// (#finanzas a secas = Por cobrar · Saldo). El semáforo de `/conciliar-finanzas` no cambia: ✅ cadena sana · ⚠️ en verificación · 🔴 sin REP.
// Solo gerencia (PUEDE.capital: el mismo dato financiero que Capital).
//   - SOLO LEE: cobranza.json de la biblioteca CONFIG.bibliotecaDatos (sitio Administración), que publica la laptop con
//     .claude/skills/conciliar-finanzas/scripts/exportar_cobranza.py (contrato: docs/rediseno/contrato-cobranza.md). La app no escribe ahí.
//   - Se lee la PRIMERA vez que se entra a una página de Dinero en la sesión y con «Volver a leer»; el refresco de 2 min no lo toca.
//   - Degrada: sin biblioteca o sin archivo lo dice; un archivo de antes de la revisión 2 pinta todo lo de hoy y en los SEGMENTOS (y en la
//     tendencia real) dice «falta re-publicar (gerencia: publicar-cobranza.ps1)».
//   - Lo que CONFIG.porPagarAparte pone aparte (TKC) no suma al KPI ni a la tendencia: va en su bloque bajo la tabla (v0.171.0).
//   - Segmentos (maqueta): en las dos páginas de Saldo; se guardan en ERP_Vistas (guardados.js) y se arman con frase (interpretarFrase).
// Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { PUEDE } from './reglas.js';
import { $, estado, el, boton, chip, avisar } from './comun.js';
import { problemaCobranza, totalesCobranza, renglonesCobranza, chipEstado, FALTA_REPUBLICAR, conFacturasRicas, historialDe, corteDe,
    contrapartesDe, monedasDe, facturasDe, antiguedadPorContraparte, serieSaldoEmision, serieHistorial, emitidoPorMes, sinRepDe,
    NIVELES, propsDinero, valoresDe, interpretarFrase } from './cobranza-reglas.js';
import { ANTIGUEDAD, recortar, agrupar, kpisVsDias, cambioPct, fmtMonto, fmtCorto, fechaCorta, mesDe, enSegmento, problemaSegmento,
    cubetaAntiguedad, diasEntre, porMes, serieAcumulada } from './reporte-reglas.js';
import { pintarReporte, vistaDe, fijarMoneda, cabecera, soltarIdsFuera } from './reporte.js';
import { renglonesSegmento, abrirFiltros, abrirGuardar, agregarSegmento } from './segmentos.js';
import { asegurarGuardados, releerGuardados, guardadosDe, guardarVista, borrarVista, esMia, registrarAbridor, registrarExtra, estadoGuardados } from './guardados.js';

/** datos: null = no leído · false = no hay biblioteca/archivo · objeto = el JSON válido. error: la lectura falló. `seg`: los segmentos de
 *  cada lado (la sesión). `tab` sigue diciendo qué lado está a la vista (lo leen app.js y el driver de capturas). */
const C = { datos: null, error: null, cargando: null, tab: 'cobranza', seg: { cobrar: [], pagar: [] }, desglose: { cobrar: false, pagar: false } };
export const estadoCobranza = () => C;
let alCambiar = () => {};
export function alCambiarCobranza(fn) { alCambiar = fn; }
let irA = () => {};
/** app.js le pasa su navegación (abrir una vista guardada lleva a su página). */
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
/** v1.0.0 (cubeta 4): exportada — Inicio la llama para su KPI y «Requiere atención» (la misma lectura única por sesión; solo gerencia). */
export function asegurarCarga() {
    if (C.datos !== null || C.cargando || C.error) return;
    C.cargando = cargarCobranza().finally(() => { C.cargando = null; alCambiar(); });
}
function volverALeer() { C.datos = null; C.error = null; asegurarCarga(); releerGuardados(alCambiar); alCambiar(); }

// ---------------------------------------------------------------- las páginas

/** sufijo de la ruta → título de la página (el panel de Dinero las lista en este orden). */
export const PAGINAS = {
    'cobrar/saldo': 'Saldo sin pago probado', 'cobrar/cliente': 'Saldo por cliente', 'cobrar/antiguedad': 'Antigüedad de saldos',
    'cobrar/emitido': 'Emitido por mes', 'cobrar/sin-rep': 'Facturas sin REP',
    'pagar/saldo': 'Por pagar sin pago probado', 'pagar/proveedor': 'Saldo por proveedor', 'pagar/antiguedad': 'Antigüedad de lo que debemos'
};
/** La página a la vista: el sufijo de la ruta; #finanzas a secas (o un sufijo que no existe) es el Saldo de su lado. */
export function paginaDe(sub) {
    const s = String(sub || '');
    if (PAGINAS[s]) return s;
    return s.startsWith('pagar') ? 'pagar/saldo' : 'cobrar/saldo';
}

const BTN_LEER = () => { const r = boton('Volver a leer', 'mn-btn is-sm', volverALeer); r.id = 'btnLeerCobranza'; return r; };
/** Las tarjetas de estado (leyendo · error · sin archivo · falta re-publicar) bajo la cabecera de la página. */
function tarjetaEstado(v, pag, id, chipTxt, chipCls, titulo, texto, conBoton = true) {
    soltarIdsFuera(v);
    v.appendChild(cabecera({ id: 'finanzas-' + pag.replace('/', '-'), titulo: PAGINAS[pag] }, vistaDe('finanzas-' + pag.replace('/', '-')), () => alCambiar()));
    const c = el('section', 'rp-card rp-aviso'); c.id = id;
    if (chipTxt) c.appendChild(chip(chipTxt, chipCls));
    if (titulo) c.appendChild(el('h2', '', titulo));
    c.appendChild(el('p', '', texto));
    if (conBoton) c.appendChild(BTN_LEER());
    v.appendChild(c);
}

/** #finanzas[/cobrar|pagar/<página>]. Pinta en #finanzasCuerpo. */
export function pintarFinanzas() {
    const v = $('finanzasCuerpo'); v.textContent = '';
    if (!puedeVerFinanzas()) return;
    const pag = paginaDe(estado.sub), lado = pag.startsWith('pagar') ? 'pagar' : 'cobrar';
    C.tab = lado === 'pagar' ? 'porpagar' : 'cobranza';
    asegurarGuardados(alCambiar);
    if (C.datos === null && !C.error) { asegurarCarga(); tarjetaEstado(v, pag, 'cobranzaCargando', null, null, '', 'Leyendo Finanzas…', false); return; }
    if (C.error) { tarjetaEstado(v, pag, 'cobranzaError', 'no se pudo leer', 'danger', '', 'No se pudo leer cobranza.json: ' + C.error); return; }
    if (C.datos === false) {
        tarjetaEstado(v, pag, 'cobranzaNoHabilitada', 'aún no habilitado', 'warn', 'Todavía no hay datos de cobranza',
            `Falta la biblioteca «${CONFIG.bibliotecaDatos}» en el sitio Administración o el archivo ${CONFIG.archivoCobranza} dentro de ella. Lo publica la laptop de Carlos (README, «Al publicar v0.165.0»).`);
        return;
    }
    const d = C.datos;
    if (!Array.isArray(lado === 'pagar' ? d.proveedores : d.clientes)) {   // un cobranza.json de antes de v0.170.0: trae clientes y no proveedores
        tarjetaEstado(v, pag, 'porPagarSinDatos', 'falta re-publicar', 'warn', 'El archivo publicado todavía no trae lo por pagar',
            `${CONFIG.archivoCobranza} se publicó con un exportador anterior. Se corrige con la siguiente corrida de publicar-cobranza.ps1 (README, «Al publicar v0.170.0»).`);
        return;
    }
    const x = contexto(d, lado);
    PINTORES[pag](v, x, pag);
}

/** Lo que comparten las páginas de un lado. */
function contexto(d, lado) {
    const aparte = lado === 'pagar' ? (CONFIG.porPagarAparte || {}) : {};
    const lista = contrapartesDe(d, lado);
    const normales = lista.filter(c => !aparte[c.rfc]), apartados = lista.filter(c => aparte[c.rfc]);
    let monedas = monedasDe(normales); if (!monedas.length) monedas = monedasDe(lista); if (!monedas.length) monedas = ['USD'];
    return {
        d, lado, aparte, lista, normales, apartados, monedas, corte: corteDe(d), ricas: conFacturasRicas(d), hist: historialDe(d),
        parte: lado === 'pagar' ? 'Proveedor' : 'Cliente', partes: lado === 'pagar' ? 'proveedores' : 'clientes', kpi: lado === 'pagar' ? 'Por pagar' : 'Por cobrar',
        idTabla: lado === 'pagar' ? 'porPagarTabla' : 'cobranzaTabla', idNota: lado === 'pagar' ? 'porPagarNota' : 'cobranzaNota'
    };
}
const facts = (x, m) => facturasDe(x.lista, m, x.aparte);
/** La primera fecha de emisión con saldo (para el rango «todo el historial»). */
const primeraDe = fs => fs.reduce((a, f) => (!a || String(f.fecha) < a ? String(f.fecha).slice(0, 10) : a), null);

/** La definición común: cabecera (corte, rango, guardar) y la tarjeta 2 con moneda, exportar, nota y «Volver a leer». */
function base(x, pag, extra) {
    const id = 'finanzas-' + pag.replace('/', '-');
    return {
        id, titulo: PAGINAS[pag], corte: x.d.generado, ojo: true, rango: true, monedaInicial: x.monedas[0],
        guardar: btn => guardarReporte(btn, x, pag, id),
        ...extra,
        datos: extra.datos ? { monedas: x.monedas, tablaId: x.idTabla, notaId: x.idNota, nombreCsv: pag.replace('/', '-'), pieDeTarjeta: () => [pieTarjeta(x)], ...extra.datos } : null
    };
}
function pieTarjeta(x) {
    const p = el('div', 'rp-pie-card');
    const g = estadoGuardados();
    if (g.modo === 'local' && g.nota) { const n = el('span', 'rp-pie-nota', g.nota); n.id = 'guardadosNota'; p.appendChild(n); }
    p.appendChild(BTN_LEER());
    return p;
}
/** La nota de fuente y definiciones (maqueta .nota), con lo que dice la gráfica de tendencia. */
function nota(x, v, que) {
    const def = x.lado === 'pagar'
        ? 'Las facturas que nos emitieron y no tienen pago comprobado. «Sin REP» quiere decir que el proveedor no ha timbrado el complemento de pago, no que no le hayamos pagado: un pago sin REP sigue saliendo aquí.'
        : '«Sin pago probado» = saldo de facturas sin complemento de pago (REP) que lo respalde; no es lo mismo que «no pagado».';
    let t = `${def} «En verificación» cuenta por el extremo alto de su rango. Una factura cancelada ante el SAT no suma. ${que || ''} Las monedas nunca se suman. Fuente: conciliación de /conciliar-finanzas sobre 04_CFDI, corte del ${fechaCorta(x.d.generado)}.`;
    if (Object.keys(x.aparte).length && x.apartados.length) t += ` Lo que va aparte (${x.apartados.map(c => c.nombre).join(', ')}) no suma a «${x.kpi}» ni a la gráfica.`;
    if (x.lado === 'pagar' && !x.d.vigencia_proveedores) t += ' No se consultó al SAT si estas facturas siguen vigentes: una que el proveedor haya cancelado sigue sumando hasta que se publique con publicar-cobranza.ps1 -VigenciaProveedores (lento).';
    return t;
}
/** Qué es la línea de tendencia (plan: el saldo acumulado por emisión NO es el saldo histórico; con ≥ 2 cortes manda el historial). */
function textoTendencia(x, v = null) {
    if (usaHistorial(x, v)) return `La gráfica es la tendencia real: un punto por corte semanal publicado (${x.hist.length} cortes desde el ${fechaCorta(x.hist[0].fecha)}).`;
    const ojo = 'La gráfica es el saldo ACUMULADO por mes de EMISIÓN de las facturas que hoy tienen saldo: NO es el saldo histórico de ese día.';
    if (x.hist && x.hist.length >= 2) return `${ojo} El historial semanal (${x.hist.length} cortes desde el ${fechaCorta(x.hist[0].fecha)}) aún cabe en un solo periodo de la gráfica; la tendencia real aparece cuando cubra dos.`;
    if (x.hist && x.hist.length === 1) return `${ojo} El historial empieza el ${fechaCorta(x.hist[0].fecha)}; la tendencia aparece desde la segunda semana.`;
    return `${ojo} Para la tendencia real ${FALTA_REPUBLICAR}.`;
}
const serieDelHistorial = (x, m) => serieHistorial(x.hist, x.lado, m, Object.keys(x.aparte)).map(p => ({ ...p, inc: undefined }));
/** ¿Manda el historial? Con ≥ 2 cortes Y ≥ 2 puntos al agrupar con la vista (v): dos cortes del mismo mes, vistos por MES,
 *  serían UN punto y borrarían la curva por emisión (orquestación, 2-oct). Sin vista (texto de ayuda): basta con ≥ 2 cortes. */
function usaHistorial(x, v) {
    if (!x.hist || x.hist.length < 2) return false;
    return !v || aPuntos(serieDelHistorial(x, v.moneda || x.monedas[0]), v, x).length >= 2;
}
/** La serie de tendencia de una moneda: el historial si manda (usaHistorial); si no, el saldo acumulado por emisión. */
function serieTendencia(x, m, v = null) {
    if (usaHistorial(x, v && { ...v, moneda: m })) return serieDelHistorial(x, m);
    return serieSaldoEmision(facts(x, m), x.corte);
}
const aPuntos = (serie, v, x) => agrupar(recortar(serie, v.rango, x.corte), v.grano).map(p => ({ etiqueta: p.etiqueta, y: p.v, inc: p.inc }));

// ---- la tabla de saldo y antigüedad (maqueta saldos): contraparte × 4 cubetas + sin pago probado, desplegable a sus facturas
function etiquetaFactura(f) {
    if (f.estado === 'DUDA') return chip('en verificación', 'warn');
    const c = chipEstado(f.estado, f.cancelada); return chip(c.texto, c.clase);
}
function tablaAntiguedad(x) {
    return {
        columnas: [{ texto: '' }, ...ANTIGUEDAD.map(a => ({ texto: a })), { texto: 'Sin pago probado' }],
        filas: v => antiguedadPorContraparte(x.lista, v.moneda, x.corte, x.aparte).filas.map(r => ({
            clave: r.rfc, clase: 'rp-cp', datos: { clave: `${r.rfc}|${v.moneda}`, rfc: r.rfc },
            celdas: [{ t: r.nombre, lk: true, titulo: r.rfc }, ...r.cubetas.map((a, i) => a ? { t: fmtMonto(a, v.moneda, 0), n: r.n[i], rojo: i === 3 } : null), fmtMonto(r.saldo, v.moneda, 0)],
            hijos: r.facturas.map(f => ({ datos: { factura: f.id }, celdas: [`${f.id} · ${fechaCorta(f.fecha)} · ${f.concepto || '—'}`, { colSpan: 3, clase: 'rp-izq', nodo: etiquetaFactura(f) }, 'neto ' + fmtMonto(f.neto, v.moneda), fmtMonto(f.saldo, v.moneda)] }))
        })),
        pie: v => {
            const t = antiguedadPorContraparte(x.lista, v.moneda, x.corte, x.aparte).total;
            return [
                { celdas: [{ t: `Total ${x.partes} ${v.moneda}`, lk: true }, ...t.cubetas.map((a, i) => a ? { t: fmtMonto(a, v.moneda, 0), n: t.n[i], rojo: i === 3 } : null), fmtMonto(t.saldo, v.moneda, 0)], datos: { total: 'saldo' } },
                { celdas: [{ t: `Facturado histórico ${v.moneda}`, lk: true }, { t: `${fmtMonto(t.facturado, v.moneda, 0)} facturado · ${fmtMonto(t.pagado, v.moneda, 0)} con pago probado`, colSpan: 4, clase: 'dim' }, t.facturado ? (t.saldo / t.facturado * 100).toFixed(1) + '%' : ''], datos: { total: 'facturado' } }
            ];
        },
        vacio: `Sin saldo en esta moneda.`,
        csv: v => {
            const filas = antiguedadPorContraparte(x.lista, v.moneda, x.corte, x.aparte).filas.map(r => [r.nombre, r.rfc, v.moneda, ...r.cubetas, r.saldo, r.nFact, '']);
            for (const r of antiguedadPorContraparte(x.lista, v.moneda, x.corte, x.aparte, true).filas) filas.push([r.nombre, r.rfc, v.moneda, ...r.cubetas, r.saldo, r.nFact, 'aparte: ' + x.aparte[r.rfc]]);
            return { columnas: [x.parte, 'RFC', 'Moneda', ...ANTIGUEDAD, 'Sin pago probado', 'Facturas', 'Nota'], filas };
        }
    };
}
/** El bloque de lo que va APARTE (v0.171.0: TKC): su saldo por moneda y el motivo; no suma a nada de arriba. */
function bloqueAparte(x) {
    if (!x.apartados.length) return [];
    const b = el('div', 'rp-aparte'); b.id = 'rpAparte';
    b.appendChild(el('h4', '', `Aparte — no suma a «${x.kpi}»`));
    for (const c of x.apartados) {
        const r = el('div', 'rp-aparte-r cob-aparte'); r.dataset.rfc = c.rfc;
        const t = el('div', 'tx'); t.appendChild(el('b', '', c.nombre)); t.appendChild(el('small', '', x.aparte[c.rfc])); r.appendChild(t);
        r.appendChild(el('span', 'mn-mono rp-aparte-v', totalesCobranza([c]).map(z => fmtMonto(z.insoluto, z.moneda)).join(' · ') || '0'));
        b.appendChild(r);
    }
    return [b];
}

// ---- segmentos (páginas de Saldo)
function cfgSegmentos(x, v) {
    const props = propsDinero(x.lado), ctx = { corte: x.corte };
    const g = estadoGuardados();
    return {
        segs: C.seg[x.lado], props, niveles: NIVELES, ctx, moneda: v.moneda,
        facturas: () => facts(x, v.moneda), valores: (p, fs) => valoresDe(p, fs, ctx),
        alCambiar: () => alCambiar(),
        interpretar: q => interpretarFrase(q, x.monedas.flatMap(m => facts(x, m)), x.lado),
        alCambiarMoneda: m => fijarMoneda(m),
        guardados: () => guardadosDe('dinero', d => d.tipo === 'segmento' && d.lado === x.lado),
        aplicarGuardado: abrirSegmentoGuardado, borrarGuardado: gv => borrarVista(gv).then(() => alCambiar()), esMia,
        guardar: ({ titulo, compartida, segmento }) => guardarVista({ titulo, compartida, modulo: 'dinero', definicion: { tipo: 'segmento', lado: x.lado, moneda: v.moneda, join: segmento.join, conds: segmento.conds } }).then(() => alCambiar()),
        notaGuardar: g.modo === 'local' ? g.nota : '',
        republicar: x.ricas ? '' : FALTA_REPUBLICAR
    };
}
function serieSegmento(x, v, s, desde, props, ctx) {
    const fs = facts(x, v.moneda).filter(f => enSegmento(s, f, (p, ff) => { const pr = props.find(y => y.k === p); return pr ? pr.get(ff, ctx) : undefined; }));
    return { fs, serie: serieAcumulada(porMes(fs, f => f.fecha, f => f.saldo), x.corte.slice(0, 7), desde) };
}

// ---------------------------------------------------------------- 1 · Saldo sin pago probado (los dos lados)
function pintarSaldo(cont, x, pag) {
    const segs = C.seg[x.lado], conSeg = x.ricas && segs.length > 0;
    const props = propsDinero(x.lado), ctx = { corte: x.corte };
    let cfg = null;
    const def = base(x, pag, {
        ayuda: `Cómo se calcula: por cada factura con saldo se toma su saldo sin pago probado (el extremo alto si está en verificación) y se suma por ${x.parte.toLowerCase()} y por antigüedad desde su fecha de emisión hasta el corte. ${textoTendencia(x)} Los KPIs comparan el saldo actual contra el de hace 30, 60, 180 y 365 días de esa misma serie.`,
        primera: null,
        filtro: { activo: conSeg, alClic: btn => abrirFiltros(btn, cfg || (cfg = cfgSegmentos(x, vistaDe(def.id)))) },
        antes: v => { cfg = cfgSegmentos(x, v); return conSeg ? [renglonesSegmento(cfg)] : []; },
        grafica: {
            tipos: true, grano: true, incTexto: 'emitido en el periodo',   // la serie del historial no trae `inc`: el globo no lo pinta
            datos: v => {
                if (!conSeg) return { puntos: aPuntos(serieTendencia(x, v.moneda, v), v, x) };
                const desde = mesDe(primeraDe(facts(x, v.moneda)) || x.corte);
                return { series: segs.map(s => ({ color: s.color, puntos: aPuntos(serieSegmento(x, v, s, desde, props, ctx).serie, v, x) })) };
            }
        },
        kpis: v => {
            if (conSeg) return [];
            const s = serieTendencia(x, v.moneda, v), ahora = s.length ? s[s.length - 1].v : 0;
            return [{ clave: 'actual', valor: fmtCorto(ahora, v.moneda), texto: 'Saldo actual' },
                ...kpisVsDias(s, x.corte).map(k => ({ clave: 'hace' + k.dias, valor: k.v === null ? '—' : fmtCorto(k.v, v.moneda), pct: k.v === null ? null : cambioPct(ahora, k.v), texto: `hace ${k.dias} días` }))];
        },
        datos: conSeg ? tablaSegmentos(x, segs, props, ctx) : { ...tablaAntiguedad(x), nota: v => nota(x, v, textoTendencia(x, v) + ' El número azul es cuántas facturas forman cada importe; rojo, las de más de un año.'), despues: () => bloqueAparte(x) }
    });
    def.primera = primeraDe(facts(x, vistaDe(def.id).moneda || x.monedas[0]));
    pintarReporte(cont, def);
}
/** «Datos del reporte» con segmentos (maqueta saldosSeg): un renglón por segmento × los últimos 5 periodos + cuántas facturas; con el
 *  desglose, sus contrapartes debajo. */
function tablaSegmentos(x, segs, props, ctx) {
    const calcular = v => {
        const desde = mesDe(primeraDe(facts(x, v.moneda)) || x.corte);
        const ss = segs.map(s => ({ s, ...serieSegmento(x, v, s, desde, props, ctx) }));
        const ref = ss.length ? agrupar(recortar(ss[0].serie, v.rango, x.corte), v.grano) : [];
        const idx = ref.map((_, i) => i).slice(-5);
        return { ss, ref, idx };
    };
    return {
        filas: v => {
            const { ss, ref, idx } = calcular(v);
            return ss.map(({ s, fs, serie }) => {
                const pts = agrupar(recortar(serie, v.rango, x.corte), v.grano);
                const ley = el('span', 'rp-leyenda'); const q = el('i'); q.style.background = s.color; ley.appendChild(q);
                const nombre = el('span', 'rp-lk'); nombre.textContent = textoSegmento(s, props, v.moneda); ley.appendChild(nombre);
                const hijos = [];
                if (C.desglose[x.lado]) {
                    const porCp = new Map(); for (const f of fs) { const a = porCp.get(f.rfc) || []; a.push(f); porCp.set(f.rfc, a); }
                    [...porCp.values()].sort((a, b) => b.reduce((t, f) => t + f.saldo, 0) - a.reduce((t, f) => t + f.saldo, 0)).forEach(gr => {
                        const p2 = agrupar(recortar(serieAcumulada(porMes(gr, f => f.fecha, f => f.saldo), x.corte.slice(0, 7), mesDe(primeraDe(facts(x, v.moneda)) || x.corte)), v.rango, x.corte), v.grano);
                        hijos.push({ datos: { rfc: gr[0].rfc }, celdas: [gr[0].nombre, ...idx.map(i => p2[i] && p2[i].v ? fmtMonto(p2[i].v, v.moneda, 0) : null), String(gr.length)] });
                    });
                }
                return { abierto: C.desglose[x.lado], hijos, clase: 'rp-segfila', datos: { segmento: String(segs.indexOf(s)) }, celdas: [{ nodo: ley }, ...idx.map(i => pts[i] ? fmtMonto(pts[i].v, v.moneda, 0) : null), String(fs.length)] };
            });
        },
        columnas: v => { const { ref, idx } = calcular(v); return [{ texto: 'Saldo sin pago probado de' }, ...idx.map(i => ({ texto: ref[i].etiqueta })), { texto: 'Facturas' }]; },
        despues: () => {
            const lb = el('label', 'rp-chk'); const ck = el('input'); ck.type = 'checkbox'; ck.id = 'rpDesglose'; ck.checked = C.desglose[x.lado];
            ck.addEventListener('change', () => { C.desglose[x.lado] = ck.checked; alCambiar(); });
            lb.appendChild(ck); lb.appendChild(document.createTextNode(` Mostrar el desglose por ${x.parte.toLowerCase()} de cada segmento`));
            return [lb, ...bloqueAparte(x)];
        },
        nota: v => `Cada segmento filtra las facturas abiertas en ${v.moneda} (${facts(x, v.moneda).length} en total) y acumula su saldo por mes de emisión: NO es el saldo histórico de ese día. Las condiciones de un segmento se combinan con Y u O; toca la Y para cambiarla. Hasta 7 segmentos a la vez. Las monedas nunca se suman.`,
        csv: v => {
            const { ss, ref, idx } = calcular(v);
            return { columnas: ['Segmento', ...idx.map(i => ref[i].etiqueta), 'Facturas'], filas: ss.map(({ s, fs, serie }) => { const pts = agrupar(recortar(serie, v.rango, x.corte), v.grano); return [textoSegmento(s, props, v.moneda), ...idx.map(i => pts[i] ? pts[i].v : 0), fs.length]; }) };
        }
    };
}
const textoSegmento = (s, props, moneda) => {
    if (!s.conds.length) return 'Todas las facturas';
    return s.conds.map(c => { const p = props.find(y => y.k === c.p); const v = p && p.t === 'lista' ? (c.v || []).join(' o ') : p && p.t === 'numero' && !p.cant ? fmtMonto(c.v, moneda, 0) : String(c.v); return `${p ? p.l : c.p} ${c.op} ${v}`; }).join(s.join === 'O' ? ' o ' : ' y ');
};

// ---------------------------------------------------------------- 2 · Por cliente / Por proveedor (la tabla de siempre, por moneda)
function pintarPorParte(cont, x, pag) {
    const filasDe = v => renglonesCobranza(x.normales).filter(r => r.moneda === v.moneda);
    const def = base(x, pag, {
        rango: false,
        ayuda: `Cómo se calcula: lo facturado, lo pagado con complemento de pago (REP) y el saldo de cada ${x.parte.toLowerCase()} en la moneda elegida, con el saldo partido por evidencia: cadena sana, en verificación (por su extremo alto) y sin REP. Las barras son el saldo de los ${x.partes} con más saldo.`,
        grafica: {
            tipos: false, grano: false,
            datos: v => ({ puntos: filasDe(v).filter(r => r.insoluto > 0.005).slice(0, 12).map(r => ({ etiqueta: String(r.nombre).replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/, '').split(/\s+/)[0].slice(0, 11), y: r.insoluto })) }),
            vacio: 'Sin saldo en esta moneda.'
        },
        kpis: v => {
            const t = totalesCobranza(x.normales).find(z => z.moneda === v.moneda) || { insoluto: 0, sin: 0, duda: 0, ok: 0, cancelado: 0, clientes: 0 };
            const ks = [{ clave: 'saldo', valor: fmtCorto(t.insoluto, v.moneda), texto: `${x.kpi} · ${v.moneda} · ${t.clientes} ${t.clientes === 1 ? x.parte.toLowerCase() : x.partes}` },
                { clave: 'sin', valor: fmtCorto(t.sin, v.moneda), texto: 'sin REP', clase: t.sin > 0.005 ? 'neg' : '' },
                { clave: 'duda', valor: fmtCorto(t.duda, v.moneda), texto: 'en verificación' },
                { clave: 'ok', valor: fmtCorto(t.ok, v.moneda), texto: 'cadena sana' }];
            if (Math.abs(t.cancelado) > 0.005) ks.push({ clave: 'cancelado', valor: fmtCorto(t.cancelado, v.moneda), texto: 'en CFDI cancelados, no suma' });
            return ks;
        },
        datos: {
            columnas: [{ texto: x.parte }, { texto: 'Facturado' }, { texto: 'Pagado' }, { texto: 'Sin pago probado' }, { texto: 'Evidencia del saldo' }],
            filas: v => filasDe(v).map(r => {
                const ev = el('span', 'cob-ev');
                if (r.ok > 0.005) ev.appendChild(chip(`${fmtMonto(r.ok, v.moneda)} sana`, 'ok'));
                if (r.duda_max > 0.005) ev.appendChild(chip(`${fmtMonto(r.duda_max, v.moneda)} en verificación`, 'warn'));
                if (r.sin > 0.005) ev.appendChild(chip(`${fmtMonto(r.sin, v.moneda)} sin REP`, 'danger'));
                if (Math.abs(Number(r.cancelado) || 0) > 0.005) ev.appendChild(chip(`${fmtMonto(r.cancelado, v.moneda)} cancelado, no suma`, null));
                return {
                    clave: `${r.rfc}|${r.moneda}`, clase: 'cob-cliente', datos: { clave: `${r.rfc}|${r.moneda}` },
                    celdas: [{ t: r.nombre, lk: true, despues: [el('span', 'rp-sub', `${r.facturas.length} ${r.facturas.length === 1 ? 'factura' : 'facturas'} con saldo · ${r.rfc}`)] }, fmtMonto(r.facturado, v.moneda), fmtMonto(r.pagado, v.moneda), { t: fmtMonto(r.insoluto, v.moneda), clase: 'cob-ins' }, { nodo: ev, clase: 'rp-izq' }],
                    hijos: r.facturas.slice().sort((a, b) => b.insoluto_max - a.insoluto_max).map(f => {
                        const ce = chipEstado(f.estado, f.cancelada);
                        const rango = Math.abs(f.insoluto_max - f.insoluto_min) > 0.005 ? `${fmtMonto(f.insoluto_min, v.moneda)} – ${fmtMonto(f.insoluto_max, v.moneda)}` : fmtMonto(f.insoluto_max, v.moneda);
                        return { clase: f.cancelada ? 'is-cancelada' : '', datos: { factura: f.id }, celdas: [`${f.id} · ${fechaCorta(f.fecha)}`, { t: f.concepto || '—', colSpan: 2, clase: 'rp-izq' }, { t: rango, clase: 'cob-monto' }, { nodo: chip(ce.texto, ce.clase), clase: 'rp-izq' }] };
                    })
                };
            }),
            pie: v => {
                const t = totalesCobranza(x.normales).find(z => z.moneda === v.moneda);
                return t ? [{ celdas: [{ t: `Total ${x.partes} ${v.moneda}`, lk: true }, fmtMonto(t.facturado, v.moneda), fmtMonto(t.pagado, v.moneda), fmtMonto(t.insoluto, v.moneda), ''], datos: { total: 'parte' } }] : [];
            },
            vacio: 'Sin saldo en esta moneda.',
            nota: v => nota(x, v, `El detalle y la estrategia de cada ${x.parte.toLowerCase()} viven en su expediente de /conciliar-finanzas.`),
            despues: () => bloqueAparte(x),
            csv: v => ({ columnas: [x.parte, 'RFC', 'Moneda', 'Facturado', 'Pagado', 'Sin pago probado', 'Sin REP', 'En verificación', 'Cadena sana', 'Cancelado (no suma)'],
                filas: [...filasDe(v), ...renglonesCobranza(x.apartados).filter(r => r.moneda === v.moneda)].map(r => [r.nombre, r.rfc, r.moneda, r.facturado, r.pagado, r.insoluto, r.sin, r.duda_max, r.ok, Number(r.cancelado) || 0]) })
        }
    });
    pintarReporte(cont, def);
}

// ---------------------------------------------------------------- 3 · Antigüedad de saldos (los dos lados)
function pintarAntiguedad(cont, x, pag) {
    const def = base(x, pag, {
        rango: false,
        ayuda: 'Cómo se calcula: cada factura con saldo cae en una cubeta por los días que van de su fecha de emisión al corte: 0–90, 91–180, 181–365 o más de 365. Las barras son el saldo de cada cubeta.',
        grafica: { tipos: false, grano: false, neg: true, datos: v => { const t = antiguedadPorContraparte(x.lista, v.moneda, x.corte, x.aparte).total; return { puntos: ['0–90 días', '91–180', '181–365', '> 365'].map((l, i) => ({ etiqueta: l, y: t.cubetas[i] })) }; } },
        kpis: v => { const t = antiguedadPorContraparte(x.lista, v.moneda, x.corte, x.aparte).total; return [{ clave: 'total', valor: fmtCorto(t.saldo, v.moneda), texto: 'Total sin pago probado' }, ...ANTIGUEDAD.map((a, i) => ({ clave: 'ant' + i, valor: fmtCorto(t.cubetas[i], v.moneda), texto: `${a.toLowerCase()} · ${t.n[i]} fact.`, clase: i === 3 && t.cubetas[i] > 0.005 ? 'neg' : '' }))]; },
        datos: { ...tablaAntiguedad(x), nota: v => nota(x, v, 'El número azul es cuántas facturas forman cada importe; rojo, las de más de un año.'), despues: () => bloqueAparte(x) }
    });
    pintarReporte(cont, def);
}

// ---------------------------------------------------------------- 4 · Emitido por mes (Por cobrar)
function pintarEmitido(cont, x, pag) {
    const periodos = v => {
        const fs = facts(x, v.moneda), mes = new Map(emitidoPorMes(fs).map(g => [g.k, g]));
        const serie = recortar(serieSaldoEmision(fs, x.corte), v.rango, x.corte);
        return agrupar(serie, v.grano).map(p => {
            const meses = serie.filter(s => agrupar([s], v.grano)[0].k === p.k).map(s => s.k);
            const gs = meses.map(k => mes.get(k)).filter(Boolean);
            return { ...p, n: gs.reduce((a, g) => a + g.n, 0), importe: gs.reduce((a, g) => a + g.importe, 0), facturas: gs.flatMap(g => g.facturas) };
        });
    };
    const def = base(x, pag, {
        primera: null,
        ayuda: 'Cómo se calcula: el saldo de las facturas que HOY siguen abiertas, sumado por el mes en que se emitieron. Las facturas ya saldadas no se publican (cobranza.json solo trae las que tienen saldo), así que esto no es todo lo facturado: es de cuándo viene lo que se debe.',
        grafica: { tipos: false, grano: true, datos: v => ({ puntos: periodos(v).map(p => ({ etiqueta: p.etiqueta, y: p.inc })) }) },
        kpis: v => {
            const ps = periodos(v), con = ps.filter(p => p.inc > 0.005), max = con.reduce((a, p) => (!a || p.inc > a.inc ? p : a), null), ult = ps[ps.length - 1];
            return [{ clave: 'ultimo', valor: fmtCorto(ult ? ult.inc : 0, v.moneda), texto: `emitido en ${ult ? ult.etiqueta : '—'}` },
                { clave: 'promedio', valor: fmtCorto(con.length ? con.reduce((a, p) => a + p.inc, 0) / con.length : 0, v.moneda), texto: 'promedio por periodo con saldo' },
                { clave: 'maximo', valor: max ? max.etiqueta : '—', texto: max ? `el de más saldo · ${fmtCorto(max.inc, v.moneda)}` : 'el de más saldo' },
                { clave: 'facturas', valor: String(ps.reduce((a, p) => a + p.n, 0)), texto: 'facturas con saldo en el rango' }];
        },
        datos: {
            columnas: [{ texto: 'Periodo de emisión' }, { texto: 'Facturas' }, { texto: 'Importe' }, { texto: 'Sin pago probado' }],
            filas: v => periodos(v).filter(p => p.n).reverse().map(p => ({
                clave: 'p' + p.k, datos: { periodo: p.k },
                celdas: [{ t: p.etiqueta, lk: true }, String(p.n), fmtMonto(p.importe, v.moneda, 0), fmtMonto(p.inc, v.moneda, 0)],
                hijos: p.facturas.slice().sort((a, b) => b.saldo - a.saldo).map(f => ({ datos: { factura: f.id }, celdas: [`${f.id} · ${fechaCorta(f.fecha)} · ${f.nombre}`, { t: f.concepto || '—', clase: 'rp-izq' }, fmtMonto(f.total ?? f.neto, v.moneda), fmtMonto(f.saldo, v.moneda)] }))
            })),
            vacio: 'Sin facturas con saldo en este rango.',
            nota: v => nota(x, v, 'Solo cuentan las facturas que hoy tienen saldo; «Importe» es lo timbrado (antes de notas de crédito) cuando el archivo lo trae.'),
            csv: v => ({ columnas: ['Periodo', 'Facturas', 'Importe', 'Sin pago probado'], filas: periodos(v).filter(p => p.n).map(p => [p.etiqueta, p.n, p.importe, p.inc]) })
        }
    });
    def.primera = primeraDe(facts(x, vistaDe(def.id).moneda || x.monedas[0]));
    pintarReporte(cont, def);
}

// ---------------------------------------------------------------- 5 · Facturas sin REP (Por cobrar)
function pintarSinRep(cont, x, pag) {
    const id = 'finanzas-' + pag.replace('/', '-'), v0 = vistaDe(id);
    const sin = v => sinRepDe(facts(x, v.moneda), x.ricas);
    const grupos = v => { const m = new Map(); for (const f of sin(v)) { const g = m.get(f.rfc) || { rfc: f.rfc, nombre: f.nombre, facturas: [], saldo: 0 }; g.facturas.push(f); g.saldo += f.saldo; m.set(f.rfc, g); } return [...m.values()].sort((a, b) => b.saldo - a.saldo); };
    if (!v0.vistoSinRep) { v0.vistoSinRep = true; const m = v0.moneda && x.monedas.includes(v0.moneda) ? v0.moneda : x.monedas[0]; for (const g of grupos({ moneda: m })) v0.abiertos.add(g.rfc); }   // como la maqueta: la primera vez, todo desplegado
    const def = base(x, pag, {
        rango: false,
        ayuda: x.ricas ? 'Cómo se calcula: las facturas con saldo que no tienen NINGÚN complemento de pago (REP) timbrado en su cadena, con los días que llevan desde su emisión. Un pago sin REP sigue saliendo aquí: el REP es la prueba.'
            : `Cómo se calcula: las facturas con saldo cuyo semáforo es «sin REP». Con el archivo nuevo se cuentan por el número exacto de REP de cada una (${FALTA_REPUBLICAR}).`,
        grafica: { tipos: false, grano: false, neg: true, datos: v => { const b = [0, 0, 0, 0]; for (const f of sin(v)) b[cubetaAntiguedad(f.fecha, x.corte)] += f.saldo; return { puntos: ['0–90 días', '91–180', '181–365', '> 365'].map((l, i) => ({ etiqueta: l, y: b[i] })) }; } },
        kpis: v => {
            const fs = sin(v), vieja = fs.reduce((a, f) => (!a || String(f.fecha) < String(a.fecha) ? f : a), null);
            return [{ clave: 'n', valor: String(fs.length), texto: 'facturas sin REP' }, { clave: 'saldo', valor: fmtCorto(fs.reduce((a, f) => a + f.saldo, 0), v.moneda), texto: 'saldo sin REP', clase: fs.length ? 'neg' : '' },
                { clave: 'partes', valor: String(new Set(fs.map(f => f.rfc)).size), texto: x.partes }, { clave: 'vieja', valor: vieja ? fechaCorta(vieja.fecha) : '—', texto: vieja ? `la más antigua · ${diasEntre(String(vieja.fecha).slice(0, 10), x.corte)} días` : 'la más antigua' }];
        },
        datos: {
            columnas: [{ texto: '' }, { texto: 'Facturas sin REP' }, { texto: 'Más antigua' }, { texto: 'Saldo sin REP' }],
            filas: v => grupos(v).map(g => {
                const vieja = g.facturas.reduce((a, f) => (!a || String(f.fecha) < String(a.fecha) ? f : a), null);
                return { clave: g.rfc, datos: { rfc: g.rfc }, celdas: [{ t: g.nombre, lk: true }, { t: String(g.facturas.length), n: null }, fechaCorta(vieja.fecha), fmtMonto(g.saldo, v.moneda)],
                    hijos: g.facturas.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).map(f => ({ datos: { factura: f.id }, celdas: [`${f.id} · ${f.concepto || '—'}`, x.ricas ? `${Number(f.reps) || 0} REP` : 'sin REP', `${fechaCorta(f.fecha)} · ${diasEntre(String(f.fecha).slice(0, 10), x.corte)} días`, fmtMonto(f.saldo, v.moneda)] })) };
            }),
            pie: v => { const fs = sin(v); return [{ celdas: [{ t: `Total ${x.partes} ${v.moneda}`, lk: true }, String(fs.length), '', fmtMonto(fs.reduce((a, f) => a + f.saldo, 0), v.moneda)], datos: { total: 'sinrep' } }]; },
            vacio: 'Ninguna factura sin REP en esta moneda.',
            nota: v => nota(x, v, x.ricas ? 'Sin REP = cero complementos de pago en la cadena de la factura (dato del exportador).' : `Sin REP = el semáforo del conciliador; para contar los REP de cada factura ${FALTA_REPUBLICAR}.`),
            csv: v => ({ columnas: [x.parte, 'RFC', 'Folio', 'Fecha', 'Días', 'Concepto', 'REP', 'Saldo sin REP'], filas: sin(v).map(f => [f.nombre, f.rfc, f.id, String(f.fecha).slice(0, 10), diasEntre(String(f.fecha).slice(0, 10), x.corte), f.concepto || '', x.ricas ? Number(f.reps) || 0 : '', f.saldo]) })
        }
    });
    pintarReporte(cont, def);
}

const PINTORES = {
    'cobrar/saldo': pintarSaldo, 'pagar/saldo': pintarSaldo,
    'cobrar/cliente': pintarPorParte, 'pagar/proveedor': pintarPorParte,
    'cobrar/antiguedad': pintarAntiguedad, 'pagar/antiguedad': pintarAntiguedad,
    'cobrar/emitido': pintarEmitido, 'cobrar/sin-rep': pintarSinRep
};

// ---------------------------------------------------------------- guardar y abrir vistas (ERP_Vistas, guardados.js)

/** El disquete de la cabecera: guarda la página con su moneda, rango, periodo y tipo de gráfica (y los segmentos, en Saldo). */
function guardarReporte(btn, x, pag, id) {
    const v = vistaDe(id), segs = pag.endsWith('/saldo') ? C.seg[x.lado] : [];
    const g = estadoGuardados();
    abrirGuardar(btn, { notaGuardar: g.modo === 'local' ? g.nota : '' }, {
        sugerido: `${PAGINAS[pag]} · ${v.moneda || ''}`.trim(),
        alGuardar: (titulo, compartida) => guardarVista({ titulo, compartida, modulo: 'dinero', definicion: { tipo: 'reporte', ruta: '#finanzas/' + pag, vistaId: id,
            vista: { moneda: v.moneda, rango: v.rango, grano: v.grano, tipo: v.tipo }, segmentos: segs.map(s => ({ join: s.join, conds: s.conds })) } }).then(() => alCambiar())
    });
}
/** Abre un segmento guardado: lo agrega a los de su lado (con su moneda) y lleva a la página de Saldo. */
function abrirSegmentoGuardado(gv) {
    const d = gv.definicion || {}, lado = d.lado === 'pagar' ? 'pagar' : 'cobrar';
    const p = problemaSegmento(d, propsDinero(lado));
    if (p) { avisar(`No se pudo abrir «${gv.titulo}»: ${p}.`, 'error'); return; }
    if (C.datos && !conFacturasRicas(C.datos)) { avisar(`«${gv.titulo}» necesita el archivo nuevo: ${FALTA_REPUBLICAR}.`, 'ojo'); irA('finanzas', lado + '/saldo'); return; }
    if (d.moneda === 'USD' || d.moneda === 'MXN') fijarMoneda(d.moneda);
    if (agregarSegmento(C.seg[lado], JSON.parse(JSON.stringify(d.conds)), d.join)) avisar('Segmento aplicado: ' + gv.titulo, 'ok');
    if (estado.pestana === 'finanzas' && paginaDe(estado.sub) === lado + '/saldo') alCambiar(); else irA('finanzas', lado + '/saldo');
}
registrarAbridor('segmento', abrirSegmentoGuardado);
// una vista de reporte de Dinero vuelve con sus segmentos (los de Saldo); el resto (ruta, moneda, rango) lo pone guardados.js
registrarExtra('finanzas', d => {
    const pag = paginaDe(String(d.ruta || '').replace(/^#finanzas\/?/, '')), lado = pag.startsWith('pagar') ? 'pagar' : 'cobrar';
    if (!pag.endsWith('/saldo') || !Array.isArray(d.segmentos)) return;
    const props = propsDinero(lado);
    C.seg[lado].length = 0;
    for (const s of d.segmentos) if (!problemaSegmento(s, props)) agregarSegmento(C.seg[lado], JSON.parse(JSON.stringify(s.conds)), s.join);
});
/** El total de una moneda para Inicio (cubeta 4): lo por cobrar sin pago probado. null si no hay datos leídos. */
export function totalPorCobrar(moneda = 'USD') {
    if (!C.datos || !Array.isArray(C.datos.clientes)) return null;
    const t = totalesCobranza(C.datos.clientes).find(z => z.moneda === moneda);
    return t ? t.insoluto : 0;
}
