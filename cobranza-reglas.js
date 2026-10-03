// MINSA ERP — v0.165.0: reglas puras de Finanzas > Cobranza (Carlos, 2-oct: copiar «Finance & Accounting» de un ERP
// generico, recortado a cobranza; maqueta https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn). El dato NO se captura en la app:
// lo produce `/conciliar-finanzas` en la laptop (scripts/exportar_cobranza.py) y se publica como cobranza.json en la
// biblioteca CONFIG.bibliotecaDatos. Aqui solo se valida y se resume; nunca se suman monedas entre si.

import { diaIso, mesDe, porMes, serieAcumulada, cubetaAntiguedad, ANTIGUEDAD, sinAcentos } from './reporte-reglas.js';

export const VERSION_COBRANZA = 1;
export const ESTADOS_FACTURA = ['OK', 'DUDA', 'SIN', 'PUE'];
/** A partir de cuantos dias el corte se marca como viejo (el exportador corre semanal). */
export const COBRANZA_VIEJA_DIAS = 8;

const FMT = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const monto = (n, moneda) => `${FMT.format(Number(n) || 0)}${moneda ? ' ' + moneda : ''}`;

/** null si el JSON sirve; si no, el motivo en palabras (se pinta tal cual). */
export function problemaCobranza(d) {
    if (!d || typeof d !== 'object') return 'el archivo no es un objeto JSON';
    if (d.version !== VERSION_COBRANZA) return `versión ${d.version ?? '(sin versión)'}: esta app lee la ${VERSION_COBRANZA}; hay que actualizar la app o el exportador`;
    if (!Array.isArray(d.clientes)) return 'falta la lista de clientes';
    if (!d.generado || Number.isNaN(Date.parse(d.generado))) return 'falta la fecha del corte (generado)';
    for (const c of d.clientes) {
        if (!c || !c.rfc || !Array.isArray(c.monedas) || !Array.isArray(c.facturas)) return `cliente incompleto: ${c && c.nombre || '(sin nombre)'}`;
    }
    // v0.170.0: `proveedores` (Por pagar) es opcional —un archivo de antes no lo trae—, pero si viene tiene la misma forma
    if (d.proveedores !== undefined && !Array.isArray(d.proveedores)) return 'proveedores no es una lista';
    for (const c of d.proveedores || []) {
        if (!c || !c.rfc || !Array.isArray(c.monedas) || !Array.isArray(c.facturas)) return `proveedor incompleto: ${c && c.nombre || '(sin nombre)'}`;
    }
    return null;
}

/** Lo que se debe de un renglon por moneda: lo sano + lo en verificacion (extremo ALTO de su horquilla) + lo sin evidencia.
 *  Lo de un CFDI cancelado ante el SAT NO entra: viene aparte en `cancelado` (un saldo sobre un CFDI muerto no es saldo). */
export const insolutoDe = m => (Number(m.ok) || 0) + (Number(m.duda_max) || 0) + (Number(m.sin) || 0);

/** Totales por moneda de todos los clientes, ordenados (USD antes que MXN solo por nombre). */
export function totalesCobranza(clientes) {
    const t = {};
    for (const c of clientes) for (const m of c.monedas) {
        const x = t[m.moneda] || (t[m.moneda] = { moneda: m.moneda, facturado: 0, pagado: 0, ok: 0, duda: 0, sin: 0, cancelado: 0, insoluto: 0, clientes: 0 });
        x.facturado += Number(m.facturado) || 0; x.pagado += Number(m.pagado) || 0;
        x.ok += Number(m.ok) || 0; x.duda += Number(m.duda_max) || 0; x.sin += Number(m.sin) || 0;
        x.cancelado += Number(m.cancelado) || 0;
        x.insoluto += insolutoDe(m);
        if (insolutoDe(m) > 0.005) x.clientes++;
    }
    return Object.values(t).sort((a, b) => b.moneda.localeCompare(a.moneda));
}

/** Renglones de la tabla: un renglon por cliente y moneda con saldo (o con CFDI cancelados con saldo), el mayor primero DENTRO de su
 *  moneda. Un saldo NEGATIVO (nota de credito mayor que la factura) tambien sale: es una anomalia que hay que ver. */
export function renglonesCobranza(clientes, conSaldoCero = false) {
    const r = [];
    for (const c of clientes) for (const m of c.monedas) {
        const ins = insolutoDe(m);
        if (!conSaldoCero && Math.abs(ins) <= 0.005 && !(Math.abs(Number(m.cancelado) || 0) > 0.005)) continue;
        r.push({ rfc: c.rfc, nombre: c.nombre, ...m, insoluto: ins,
            facturas: c.facturas.filter(f => f.moneda === m.moneda) });
    }
    return r.sort((a, b) => b.moneda.localeCompare(a.moneda) || b.insoluto - a.insoluto);
}

/** Dias enteros entre el corte y `hoy` (Date). */
export function diasDesde(iso, hoy = new Date()) {
    return Math.max(0, Math.floor((hoy.getTime() - Date.parse(iso)) / 86400000));
}

/** El chip del semaforo de una factura: { texto, clase } (clase = la de .mn-chip.is-*). */
export function chipEstado(estado, cancelada) {
    if (cancelada) return { texto: 'CFDI cancelado', clase: 'danger' };
    if (estado === 'OK') return { texto: 'cadena sana', clase: 'ok' };
    if (estado === 'DUDA') return { texto: 'en verificación', clase: 'warn' };
    if (estado === 'PUE') return { texto: 'de contado', clase: null };
    return { texto: 'sin REP', clase: 'danger' };
}

// ---------------------------------------------------------------- v1.0.0 (rediseño, cubeta 2): Dinero con la plantilla de reporte
// Contrato: minsa-erp-app/docs/rediseno/contrato-cobranza.md (revisión 2: `revision`, `historial`, y en cada factura `total`, `serie`,
// `folio`, `reps`, `cadena`, `producto`). Todo es opcional: un archivo de antes sigue pintando lo de hoy y dice «falta re-publicar».

/** Lo que la app dice cuando necesita la revisión 2 y el archivo es de antes (contrato, «Falta re-publicar»). */
export const FALTA_REPUBLICAR = 'falta re-publicar (gerencia: publicar-cobranza.ps1)';
/** 1 si el archivo no la declara (publicado antes de publicar-cobranza.ps1 v1.5.0). */
export const revisionDe = d => Number(d && d.revision) || 1;
/** ¿Trae las facturas enriquecidas (producto, REP, cadena, total)? Sin ellas no hay segmentos. */
export const conFacturasRicas = d => revisionDe(d) >= 2;
/** El historial semanal si viene como lista; null si el archivo es de antes. */
export const historialDe = d => d && Array.isArray(d.historial) ? d.historial : null;
/** 'AAAA-MM-DD' del corte (generado viene en hora local, sin zona). */
export const corteDe = d => String((d && d.generado) || '').slice(0, 10);
/** Las contrapartes de un lado: «cobrar» = clientes (nos deben), «pagar» = proveedores (les debemos). */
export const contrapartesDe = (d, lado) => (lado === 'pagar' ? d.proveedores : d.clientes) || [];
/** El saldo de una factura (contrato): el extremo ALTO, como insolutoDe; una cancelada no suma. */
export const saldoFactura = f => f && !f.cancelada ? Number(f.insoluto_max) || 0 : 0;
/** Las monedas con saldo o con CFDI cancelados, USD primero (nunca se suman entre sí). */
export function monedasDe(contrapartes) {
    const s = new Set();
    for (const c of contrapartes || []) for (const m of c.monedas || []) if (Math.abs(insolutoDe(m)) > 0.005 || Math.abs(Number(m.cancelado) || 0) > 0.005) s.add(m.moneda);
    return [...s].sort((a, b) => b.localeCompare(a));
}

/**
 * Las facturas con saldo de una moneda, planas y con su contraparte: { ...f, saldo, rfc, nombre, nab, pct }. Sin canceladas. `aparte` (RFC →
 * motivo, CONFIG.porPagarAparte) las saca; con `soloAparte` deja SOLO esas. `nab` = facturas abiertas de la contraparte en esa moneda y
 * `pct` = % de lo facturado con pago probado (las dos propiedades de nivel Contraparte de los segmentos).
 */
export function facturasDe(contrapartes, moneda, aparte = {}, soloAparte = false) {
    const out = [];
    for (const c of contrapartes || []) {
        if (!!(aparte && aparte[c.rfc]) !== soloAparte) continue;
        const m = (c.monedas || []).find(x => x.moneda === moneda);
        const fs = (c.facturas || []).filter(f => f.moneda === moneda && !f.cancelada && Math.abs(saldoFactura(f)) > 0.005);
        const pct = m && Number(m.facturado) ? (Number(m.pagado) || 0) / Number(m.facturado) * 100 : 0;
        for (const f of fs) out.push({ ...f, saldo: saldoFactura(f), rfc: c.rfc, nombre: c.nombre, nab: fs.length, pct });
    }
    return out;
}

/**
 * La tabla de la maqueta (saldo y antigüedad): un renglón por contraparte con saldo en la moneda — sus cuatro cubetas de antigüedad
 * (importe y cuántas facturas), el saldo, lo facturado y lo pagado de esa moneda, y sus facturas (la mayor primero) — más el total.
 */
export function antiguedadPorContraparte(contrapartes, moneda, corteDia, aparte = {}, soloAparte = false) {
    const nuevo = () => ({ cubetas: [0, 0, 0, 0], n: [0, 0, 0, 0], saldo: 0, nFact: 0, facturado: 0, pagado: 0 });
    const total = nuevo(), filas = [];
    for (const c of contrapartes || []) {
        if (!!(aparte && aparte[c.rfc]) !== soloAparte) continue;
        const fs = facturasDe([c], moneda);
        const m = (c.monedas || []).find(x => x.moneda === moneda);
        if (!fs.length) continue;
        const r = { rfc: c.rfc, nombre: c.nombre, ...nuevo(), facturas: fs.slice().sort((a, b) => b.saldo - a.saldo) };
        r.facturado = Number(m && m.facturado) || 0; r.pagado = Number(m && m.pagado) || 0;
        for (const f of fs) { const i = cubetaAntiguedad(f.fecha, corteDia); r.cubetas[i] += f.saldo; r.n[i]++; r.saldo += f.saldo; r.nFact++; }
        for (const k of ['saldo', 'nFact', 'facturado', 'pagado']) total[k] += r[k];
        r.cubetas.forEach((x, i) => { total.cubetas[i] += x; total.n[i] += r.n[i]; });
        filas.push(r);
    }
    filas.sort((a, b) => b.saldo - a.saldo);
    return { filas, total };
}

/** El saldo ACUMULADO por mes de EMISIÓN de esas facturas, hasta el mes del corte (NO es el saldo histórico de cada día: la nota lo dice). */
export const serieSaldoEmision = (facturas, corteDia) => serieAcumulada(porMes(facturas, f => f.fecha, f => f.saldo), corteDia.slice(0, 7));

/**
 * La tendencia REAL: un punto por corte del historial semanal ({ k: 'AAAA-MM-DD', v }), de un lado y una moneda. Lo que la app pone
 * APARTE (TKC) se resta con `rfc[lado][RFC][moneda]`; una semana sin esa contraparte en `rfc` vale 0 (contrato).
 */
export function serieHistorial(historial, lado, moneda, aparteRfcs = []) {
    return (historial || []).filter(c => c && diaIso(c.fecha)).map(c => {
        const t = c[lado] && c[lado][moneda];
        let v = t ? Number(t.saldo) || 0 : 0;
        for (const rfc of aparteRfcs) v -= Number(c.rfc && c.rfc[lado] && c.rfc[lado][rfc] && c.rfc[lado][rfc][moneda]) || 0;
        return { k: diaIso(c.fecha), v: Math.round(v * 100) / 100 };
    }).sort((a, b) => a.k.localeCompare(b.k));
}

/** Lo emitido por mes (de las facturas con SALDO: las saldadas no se publican): [{ k: 'AAAA-MM', n, importe, saldo, facturas }], el más reciente primero. */
export function emitidoPorMes(facturas) {
    const m = new Map();
    for (const f of facturas || []) {
        const k = mesDe(f.fecha); if (!k) continue;
        const g = m.get(k) || { k, n: 0, importe: 0, saldo: 0, facturas: [] };
        g.n++; g.importe += Number(f.total ?? f.neto) || 0; g.saldo += f.saldo; g.facturas.push(f); m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.k.localeCompare(a.k));
}

/** Las facturas SIN REP: con la revisión 2, las de `reps === 0` (el dato exacto); con la de antes, las de estado «SIN» del semáforo. */
export const sinRepDe = (facturas, ricas) => (facturas || []).filter(f => ricas ? Number(f.reps) === 0 : f.estado === 'SIN');

// ---------------------------------------------------------------- segmentos de Dinero (maqueta PROPS, NIV y parseIA)

/** Los tres niveles de propiedades (maqueta NIV): color = token de estilo.css. */
export const NIVELES = {
    cont: { l: 'Contraparte', i: 'C', lvl: 'NIVEL CONTRAPARTE', color: 'var(--niv-cont)' },
    fact: { l: 'Factura', i: 'F', lvl: 'NIVEL FACTURA', color: 'var(--niv-fact)' },
    prod: { l: 'Producto o servicio', i: 'P', lvl: 'NIVEL PRODUCTO', color: 'var(--niv-prod)' }
};
/** El semáforo del conciliador en palabras (propiedad «Estado de la evidencia»). */
export const EVIDENCIA = { OK: 'Cadena sana', DUDA: 'En verificación', SIN: 'Sin REP', PUE: 'De contado' };
/**
 * Las propiedades con que se arma un segmento (maqueta PROPS): `k` llave · `n` nivel · `l` rótulo · `t` tipo (OPERADORES) · `get(f, ctx)`
 * lee la factura plana de facturasDe (ctx.corte para la antigüedad) · `vals` los valores fijos de una lista · `cant` = número que no es dinero.
 */
export function propsDinero(lado) {
    return [
        { k: 'cli', n: 'cont', l: lado === 'pagar' ? 'Proveedor' : 'Cliente', t: 'lista', get: f => f.nombre },
        { k: 'rfc', n: 'cont', l: 'RFC', t: 'texto', get: f => f.rfc },
        { k: 'nab', n: 'cont', l: 'Facturas abiertas de la contraparte', t: 'numero', cant: true, get: f => f.nab },
        { k: 'pct', n: 'cont', l: '% del facturado con pago probado', t: 'numero', cant: true, get: f => Math.round(f.pct * 100) / 100 },
        { k: 'fe', n: 'fact', l: 'Fecha de emisión', t: 'fecha', get: f => diaIso(f.fecha) },
        { k: 'anio', n: 'fact', l: 'Año de emisión', t: 'lista', get: f => String(f.fecha || '').slice(0, 4) },
        { k: 'ant', n: 'fact', l: 'Antigüedad', t: 'lista', vals: () => ANTIGUEDAD.slice(), get: (f, ctx) => ANTIGUEDAD[cubetaAntiguedad(f.fecha, ctx.corte)] },
        { k: 'ins', n: 'fact', l: 'Saldo sin pago probado', t: 'numero', get: f => f.saldo },
        { k: 'imp', n: 'fact', l: 'Importe de la factura', t: 'numero', get: f => Number(f.total ?? f.neto) || 0 },
        { k: 'est', n: 'fact', l: 'Estado de la evidencia', t: 'lista', vals: () => Object.values(EVIDENCIA), get: f => EVIDENCIA[f.estado] || String(f.estado || '') },
        { k: 'reps', n: 'fact', l: 'Complementos de pago (REP)', t: 'numero', cant: true, get: f => Number(f.reps) || 0 },
        { k: 'parc', n: 'fact', l: 'Tiene pago parcial', t: 'lista', vals: () => ['Sí', 'No'], get: f => Number(f.pagado) > 0.005 ? 'Sí' : 'No' },
        { k: 'folio', n: 'fact', l: 'Folio', t: 'texto', get: f => f.id },
        { k: 'lin', n: 'prod', l: 'Línea de producto o servicio', t: 'lista', get: f => f.producto || 'Sin línea' },
        { k: 'con', n: 'prod', l: 'Concepto en el CFDI', t: 'texto', get: f => f.concepto || '' }
    ];
}
/** Los valores que ofrece una propiedad de lista: los fijos o los que aparecen en las facturas (ordenados; el año, del más nuevo). */
export function valoresDe(prop, facturas, ctx) {
    if (prop.vals) return prop.vals();
    const vs = [...new Set((facturas || []).map(f => prop.get(f, ctx)).filter(v => v !== '' && v != null))];
    return prop.k === 'anio' ? vs.sort().reverse() : vs.sort((a, b) => String(a).localeCompare(String(b), 'es'));
}

const STOP = new Set(['constructora', 'perforadora', 'servicios', 'servicio', 'comercializadora', 'solutions', 'perforacion', 'holding', 'energy', 'oil', 'gas', 'transporte',
    'proyectos', 'nacionales', 'de', 'del', 'y', 'los', 'las', 'sa', 'cv', 'rl', 'sapi', 'facturas', 'factura', 'con', 'sin', 'mas', 'menos', 'que', 'para', 'por', 'una', 'uno']);
const palabras = s => sinAcentos(s).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 3 && !STOP.has(w));
/** v1.0.0 (cubeta 4, «Preguntar»): el nombre CORTO con que interpretarFrase reconoce a una contraparte — su primera palabra que no es de
 *  relleno («CPL Servicios de Perforación» → «CPL»; «Constructora y Perforadora Latina» → «Latina»). Sin ninguna, el nombre entero. */
export function nombreClave(nombre) {
    const ws = String(nombre || '').split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&]+/).filter(Boolean);
    return ws.find(w => palabras(w).length) || String(nombre || '').trim();
}
/**
 * El intérprete de «armar con frase» (maqueta parseIA; SIN IA: reglas). De «facturas de CPL sin REP de más de 180 días» arma
 * [Cliente es uno de CPL…] + [Estado de la evidencia es uno de Sin REP] + [Antigüedad es uno de 181–365, Más de 365]. Reconoce
 * contrapartes por nombre o RFC, montos («más de 100 mil», «menos de 2 millones»), antigüedad («más de un año», «más de N días»,
 * «menos de 90 días»), años («desde 2025», «antes de 2024», «2025»), evidencia, pago parcial, líneas de producto y la moneda.
 * `facturas` son las de TODAS las monedas (de facturasDe), para poder cambiar de moneda. Devuelve { conds, moneda }.
 */
export function interpretarFrase(q, facturas, lado = 'cobrar') {
    const s = sinAcentos(q), tok = new Set(s.split(/[^a-z0-9ñ]+/).filter(Boolean)), conds = [];
    let moneda = null;
    if (tok.has('dolares') || tok.has('dolar') || tok.has('usd')) moneda = 'USD'; else if (tok.has('pesos') || tok.has('peso') || tok.has('mxn')) moneda = 'MXN';
    const fs = (facturas || []).filter(f => !moneda || f.moneda === moneda);
    const nombres = [...new Set(fs.filter(f => tok.has(sinAcentos(f.rfc)) || palabras(f.nombre).some(w => tok.has(w))).map(f => f.nombre))];
    if (nombres.length) conds.push({ p: 'cli', op: 'es uno de', v: nombres });
    const num = (x, u) => { let n = parseFloat(String(x).replace(/,/g, '')); u = u || ''; if (/^(k|mil)/.test(u)) n *= 1e3; else if (/^(m|mdp|millon)/.test(u)) n *= 1e6; return n; };
    const TIEMPO = String.raw`(?!\s*(?:dias|dia|meses|mes|anos|ano)\b)`;
    const rxM = new RegExp(String.raw`(?:mas|mayor(?:es)?|arriba|encima|superior(?:es)?)\s+(?:de|que|a)\s+\$?\s*([\d.,]+)\s*(k|mil|mdp|millones|millon|m)?\b` + TIEMPO);
    const rxm = new RegExp(String.raw`(?:menos|menor(?:es)?|debajo|inferior(?:es)?)\s+(?:de|que|a)\s+\$?\s*([\d.,]+)\s*(k|mil|mdp|millones|millon|m)?\b` + TIEMPO);
    let m = s.match(rxM); if (m) conds.push({ p: 'ins', op: 'es mayor que', v: num(m[1], m[2]) });
    m = s.match(rxm); if (m) conds.push({ p: 'ins', op: 'es menor que', v: num(m[1], m[2]) });
    const masDias = s.match(/mas de (\d+)\s*dias?\b/), menosDias = s.match(/menos de (\d+)\s*dias?\b/);
    if (/mas de (un|1) ano|mas de 12 meses|viej/.test(s) || (masDias && Number(masDias[1]) >= 365)) conds.push({ p: 'ant', op: 'es uno de', v: [ANTIGUEDAD[3]] });
    else if (masDias && Number(masDias[1]) >= 90) conds.push({ p: 'ant', op: 'es uno de', v: ANTIGUEDAD.slice(Number(masDias[1]) >= 180 ? 2 : 1) });
    else if (/ultimos 3 meses|reciente/.test(s) || (menosDias && Number(menosDias[1]) <= 90)) conds.push({ p: 'ant', op: 'es uno de', v: [ANTIGUEDAD[0]] });
    else if (menosDias && Number(menosDias[1]) <= 365) conds.push({ p: 'ant', op: 'es uno de', v: ANTIGUEDAD.slice(0, Number(menosDias[1]) <= 180 ? 2 : 3) });
    const y = s.match(/(?:desde|a partir de|despues de)\s+(?:el\s+)?(20\d\d)/), y2 = s.match(/antes de(?:l)?\s+(20\d\d)/);
    if (y) conds.push({ p: 'fe', op: 'es igual o posterior a', v: y[1] + '-01-01' });
    if (y2) conds.push({ p: 'fe', op: 'es anterior a', v: y2[1] + '-01-01' });
    if (!y && !y2) { const ys = [...new Set(s.match(/\b20\d\d\b/g) || [])]; if (ys.length) conds.push({ p: 'anio', op: 'es uno de', v: ys }); }
    const est = [];
    if (/sin rep\b|sin complemento/.test(s)) est.push(EVIDENCIA.SIN);
    if (/verificacion|en duda/.test(s)) est.push(EVIDENCIA.DUDA);
    if (/cadena sana|con rep\b/.test(s)) est.push(EVIDENCIA.OK);
    if (est.length) conds.push({ p: 'est', op: 'es uno de', v: est });
    if (/parcial|abono|abonad/.test(s)) conds.push({ p: 'parc', op: 'es uno de', v: ['Sí'] });
    else if (/sin (?:ningun )?(?:pago|abono)(?! probado)/.test(s)) conds.push({ p: 'parc', op: 'es uno de', v: ['No'] });
    const lineas = [...new Set(fs.map(f => f.producto).filter(Boolean))].filter(l => palabras(l).some(w => w.length >= 4 && [...tok].some(t => t.length >= 4 && (t.startsWith(w.slice(0, 5)) || w.startsWith(t.slice(0, 5))))));
    if (lineas.length) conds.push({ p: 'lin', op: 'es uno de', v: lineas });
    return { conds, moneda, lado };
}
