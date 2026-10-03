// MINSA ERP v1.0.0 — reglas PURAS de la plantilla de reporte (rediseño 2026-10-02; plan cerebro/docs/plan-erp-rediseno-2026-10-02.md,
// «Plantilla de página» y cubeta 2; maqueta minsa-erp-app/docs/rediseno/maqueta-reportes.html: serieAcum, recorta, agrupa, nice,
// kpiPct, RANGOS y el bloque de segmentos). Sin DOM: series y acumulados, recorte por rango, agrupación MES/TRIMESTRE/AÑO, escala
// «nice», KPIs contra 30/60/180/365 días, antigüedad 0–90/91–180/181–365/>365, CSV con BOM para Excel, color del corte y el motor de
// segmentos (operadores, Y/O, colores). Lo prueba test/reporte.test.js. Lo pinta reporte.js; lo usan Dinero (cobranza.js, capital.js)
// y la cubeta 3 (Servicios, Compras, Vigencias y los reportes de Trabajo).

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
/** Los rangos del selector de fechas (maqueta RANGOS): contados hacia atrás desde la fecha del CORTE, no desde hoy. */
export const RANGOS = [
    { clave: '1a', texto: 'Último año', anios: 1 },
    { clave: '2a', texto: 'Últimos 2 años', anios: 2 },
    { clave: 'todo', texto: 'Todo el historial', anios: null }
];
/** MES | TRIMESTRE | AÑO; DÍA y SEMANA se pintan deshabilitados (los datos son mensuales). */
export const GRANOS = [
    { clave: 'dia', texto: 'DÍA', apagado: 'Los datos son mensuales' },
    { clave: 'semana', texto: 'SEMANA', apagado: 'Los datos son mensuales' },
    { clave: 'mes', texto: 'MES' },
    { clave: 'trim', texto: 'TRIMESTRE' },
    { clave: 'anio', texto: 'AÑO' }
];
/** La fila de KPIs compara contra estos días (maqueta: «hace 30 días»…). */
export const DIAS_KPI = [30, 60, 180, 365];
export const ANTIGUEDAD = ['0–90 días', '91–180 días', '181–365 días', 'Más de 365 días'];

// ---------------------------------------------------------------- fechas (cadenas ISO, sin zona: el corte lo escribe la laptop en hora local)

/** 'AAAA-MM-DD' de una cadena ISO o de un Date (este, en UTC). null si no hay fecha. */
export function diaIso(x) {
    if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
    const s = String(x || '');
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
export const mesDe = x => { const d = diaIso(x) || (/^\d{4}-\d{2}$/.test(String(x || '')) ? String(x) : null); return d ? d.slice(0, 7) : null; };
const aFecha = dia => new Date(dia + 'T00:00:00Z');
/** Días enteros de `a` a `b` (b − a), las dos 'AAAA-MM-DD'. */
export const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000);
export function restarDias(dia, n) { const f = aFecha(dia); f.setUTCDate(f.getUTCDate() - n); return f.toISOString().slice(0, 10); }
export function sumarMeses(mes, n) {
    let [y, m] = String(mes).split('-').map(Number);
    m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
}
/** 'Oct 2026' (eje y tabla de la maqueta). */
export const etiquetaMes = mes => `${MESES_CORTOS[Number(String(mes).slice(5, 7)) - 1]} ${String(mes).slice(0, 4)}`;
/** '2 oct 2026' (chip del corte, renglones de factura). */
export function fechaCorta(x) { const d = diaIso(x); return d ? `${Number(d.slice(8, 10))} ${MESES_CORTOS[Number(d.slice(5, 7)) - 1].toLowerCase()} ${d.slice(0, 4)}` : '—'; }

// ---------------------------------------------------------------- series

/** Suma `montoDe(x)` por el mes de `fechaDe(x)`: { 'AAAA-MM': suma }. Lo que no trae fecha no entra. */
export function porMes(items, fechaDe, montoDe) {
    const t = {};
    for (const x of items || []) { const k = mesDe(fechaDe(x)); if (!k) continue; t[k] = (t[k] || 0) + (Number(montoDe(x)) || 0); }
    return t;
}
/**
 * Serie mensual ACUMULADA (maqueta serieAcum): un punto por mes desde el primer mes con dato (o `desde`) hasta `hasta` (AAAA-MM),
 * sin huecos — un mes sin nada repite el acumulado. Cada punto: { k: 'AAAA-MM', v: acumulado, inc: lo del mes }.
 */
export function serieAcumulada(montos, hasta, desde = null) {
    const ks = Object.keys(montos || {}).sort();
    const ini = desde || ks[0]; if (!ini || !hasta || ini > hasta) return [];
    const out = []; let acc = 0;
    for (let k = ini; k <= hasta; k = sumarMeses(k, 1)) { const inc = montos[k] || 0; acc += inc; out.push({ k, v: acc, inc }); }
    return out;
}
/** La fecha donde empieza un rango contado desde el corte ('AAAA-MM-DD'; null = todo el historial). */
export function desdeDeRango(rango, corteDia) {
    const r = RANGOS.find(x => x.clave === rango) || RANGOS[1];
    if (!r.anios) return null;
    return `${Number(corteDia.slice(0, 4)) - r.anios}${corteDia.slice(4, 10)}`;
}
/** Recorta una serie (mensual 'AAAA-MM' o por corte 'AAAA-MM-DD') al rango: entra lo del MES donde empieza el rango en adelante. */
export function recortar(serie, rango, corteDia) {
    const d = desdeDeRango(rango, corteDia); if (!d) return (serie || []).slice();
    const mes = d.slice(0, 7);
    return (serie || []).filter(p => String(p.k).slice(0, 7) >= mes);
}
/** «2024-10-02 a 2026-10-02» (el botón del rango); «todo» empieza en el primer punto que haya. */
export function textoRango(rango, corteDia, primera) {
    const d = desdeDeRango(rango, corteDia) || (primera ? (String(primera).length === 7 ? primera + '-01' : String(primera).slice(0, 10)) : corteDia);
    return `${d} a ${corteDia}`;
}
/**
 * Agrupa por MES | TRIMESTRE | AÑO (maqueta agrupa). `v` es un SALDO a la fecha: del periodo se queda el ÚLTIMO; `inc` es un flujo: se
 * suma. Sirve para la serie mensual y para la del historial (un punto por semana). Cada punto: { k, etiqueta, v, inc }.
 */
export function agrupar(serie, grano = 'mes') {
    const g = []; const porLlave = new Map();
    for (const p of serie || []) {
        const k = String(p.k), y = k.slice(0, 4), m = Number(k.slice(5, 7)), q = Math.ceil(m / 3);
        const llave = grano === 'anio' ? y : grano === 'trim' ? `${y}-T${q}` : k.slice(0, 7);
        let o = porLlave.get(llave);
        if (!o) { o = { k: llave, etiqueta: grano === 'anio' ? y : grano === 'trim' ? `T${q} ${y}` : etiquetaMes(k.slice(0, 7)), v: 0, inc: 0 }; porLlave.set(llave, o); g.push(o); }
        o.v = Number(p.v) || 0; o.inc += Number(p.inc) || 0;
    }
    return g;
}

// ---------------------------------------------------------------- escala del eje

/** El paso «redondo» que cubre `r` (maqueta nice): 1, 2, 2.5, 5 o 10 × 10^n. */
export function nice(r) {
    const x = Math.abs(Number(r)) || 1, e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
/** La escala del eje Y: { piso, tope, paso, marcas } con unas `partes` divisiones redondas; acepta valores negativos. */
export function escala(valores, partes = 4) {
    const vs = (valores || []).map(Number).filter(Number.isFinite);
    const max = Math.max(0, ...vs), min = Math.min(0, ...vs);
    const paso = nice(((max - min) || 1) / partes);
    let tope = Math.max(paso, Math.ceil(max / paso - 1e-9) * paso), piso = Math.min(0, Math.floor(min / paso + 1e-9) * paso);
    // v1.0.0 (cubeta 6, fidelidad #13): aire arriba (y abajo): si el valor llega a más del 90 % de la marca extrema, un paso más — como la maqueta
    // (2.59M con tope en 3M); sin él la etiqueta del punto pisaba la del eje y la línea iba pegada al borde («$4.00k» sobre «$4k»)
    if (max > 0 && max > 0.9 * tope) tope += paso;
    if (min < 0 && min < 0.9 * piso) piso -= paso;
    const marcas = []; for (let v = piso; v <= tope + paso / 1e6; v += paso) marcas.push(Number(v.toFixed(6)));
    return { piso, tope, paso, marcas };
}

// ---------------------------------------------------------------- KPIs

/** % de cambio de `antes` a `actual`; null si `antes` es 0 o no existe (no hay contra qué comparar). */
export function cambioPct(actual, antes) {
    if (antes === null || antes === undefined || !Number(antes)) return null;
    return (Number(actual) - Number(antes)) / Math.abs(Number(antes)) * 100;
}
/** «+14.80%» · «−3.10%» (el menos es el signo tipográfico, como la maqueta). */
export const textoPct = p => p === null || p === undefined ? '' : `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(2)}%`;
/**
 * La fila de KPIs: el último valor y cuánto valía hace 30/60/180/365 días. En una serie MENSUAL el punto de hace N días es el mes
 * N/30.4 atrás (maqueta kpis); en una serie por CORTE ('AAAA-MM-DD', el historial) es el último corte en o antes de corte − N días.
 * Devuelve [{ dias, v, pct }] (v null si la serie no llega tan atrás).
 */
export function kpisVsDias(serie, corteDia, dias = DIAS_KPI) {
    const s = serie || []; const ultimo = s.length ? Number(s[s.length - 1].v) : null;
    const diaria = s.length && String(s[0].k).length > 7;
    return dias.map(d => {
        let v = null;
        if (diaria) { const lim = restarDias(corteDia, d); for (const p of s) if (String(p.k) <= lim) v = Number(p.v); }
        else { const i = s.length - 1 - Math.round(d / 30.4); if (i >= 0) v = Number(s[i].v); }
        return { dias: d, v, pct: v === null || ultimo === null ? null : cambioPct(ultimo, v) };
    });
}

// ---------------------------------------------------------------- antigüedad y corte

/** 0 (0–90 días) · 1 (91–180) · 2 (181–365) · 3 (más de 365), contando desde `fecha` hasta el corte. */
export function cubetaAntiguedad(fecha, corteDia) {
    const d = diasEntre(diaIso(fecha) || corteDia, corteDia);
    return d <= 90 ? 0 : d <= 180 ? 1 : d <= 365 ? 2 : 3;
}
/** El color del chip «corte: fecha» (plan): ámbar con más de 8 días, rojo con más de 15. */
export const colorCorte = dias => dias > 15 ? 'danger' : dias > 8 ? 'warn' : 'ok';
/** v1.0.0 (vuelta 1, revisión de código «baja»): días de CALENDARIO del corte (su día tal como viene: hora local sin zona) a hoy (el día local de
 *  `ahora`); nunca negativo, 0 sin corte. UNA cuenta para el chip de la cabecera y el de los KPIs de Inicio — antes la página contaba desde la hora
 *  del corte y Inicio desde su mediodía, y el día del umbral (8 o 15 días) salían de colores distintos. */
export function diasDelCorte(corte, ahora = new Date()) {
    const d = typeof corte === 'string' ? diaIso(corte) : null;
    if (!d) return 0;
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    return Math.max(0, diasEntre(d, hoy));
}

// ---------------------------------------------------------------- montos (maqueta fmt / corto / eje)

const prefijo = moneda => moneda === 'USD' ? 'US$' : moneda === 'MXN' ? '$' : '';
/** «US$2,900.00» · «$1,250.50» · «-US$80.00»; sin moneda, solo el número. */
export function fmtMonto(v, moneda, dec = 2) {
    const n = Number(v) || 0;
    return (n < 0 ? '-' : '') + prefijo(moneda) + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
/** «US$2.59M» · «US$950.25k» · «$80» (KPIs y etiquetas de la gráfica). */
export function fmtCorto(v, moneda) {
    const n = Number(v) || 0, a = Math.abs(n), p = (n < 0 ? '-' : '') + prefijo(moneda);
    return a >= 1e6 ? p + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? p + (a / 1e3).toFixed(2) + 'k' : p + a.toFixed(0);
}
/** «US$3M» · «US$500k» (las marcas del eje). */
export function fmtEje(v, moneda) {
    const n = Number(v) || 0, a = Math.abs(n), p = (n < 0 ? '-' : '') + prefijo(moneda);
    return p + (a >= 1e6 ? +(a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? +(a / 1e3).toFixed(0) + 'k' : String(+a.toFixed(2)));
}

// ---------------------------------------------------------------- CSV (exportar)

/** Una celda de CSV: entre comillas si trae separador, comillas, salto de línea o espacios en las orillas; un texto que Excel leería como
 *  FÓRMULA (empieza con = + - @) lleva un apóstrofo delante — los nombres vienen de terceros (CFDI). Los números van con punto decimal. */
export function celdaCsv(x, sep = ',') {
    if (x === null || x === undefined) return '';
    if (typeof x === 'number') return Number.isFinite(x) ? String(Math.round(x * 100) / 100) : '';
    let s = String(x);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return s.includes(sep) || /["\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}
/** El archivo entero: BOM UTF-8 (para que Excel lea los acentos), un renglón de encabezados y CRLF entre renglones. */
export function csv(columnas, filas, sep = ',') {
    const lineas = [columnas, ...(filas || [])].map(f => f.map(c => celdaCsv(c, sep)).join(sep));
    return '﻿' + lineas.join('\r\n') + '\r\n';
}
/** Un nombre de archivo seguro: «cobrar-saldo_2026-10-02.csv». */
export const nombreCsv = (base, dia) => `${String(base).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'reporte'}_${dia}.csv`;

// ---------------------------------------------------------------- segmentos (maqueta: SEG, OPS, cumple, enSeg, COLORES)

export const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Los operadores por tipo de propiedad (maqueta OPS). */
export const OPERADORES = {
    lista: ['es uno de', 'no es uno de'],
    numero: ['es mayor que', 'es menor que'],
    fecha: ['es igual o posterior a', 'es anterior a'],
    texto: ['contiene', 'no contiene']
};
/** Hasta 7 segmentos a la vez, cada uno con su color (maqueta COLORES; tokens --seg-N de estilo.css: siguen al tema). */
export const COLORES_SEGMENTO = ['var(--seg-1)', 'var(--seg-2)', 'var(--seg-3)', 'var(--seg-4)', 'var(--seg-5)', 'var(--seg-6)', 'var(--seg-7)'];
export const MAX_SEGMENTOS = COLORES_SEGMENTO.length;
/** El primer color que ningún segmento usa. */
export const colorLibre = segs => COLORES_SEGMENTO.find(c => !(segs || []).some(s => s.color === c)) || COLORES_SEGMENTO[(segs || []).length % MAX_SEGMENTOS];
/** ¿El valor `x` cumple la condición? (maqueta cumple). */
export function cumple(cond, x) {
    const v = cond.v;
    switch (cond.op) {
        case 'es uno de': return (v || []).includes(x);
        case 'no es uno de': return !(v || []).includes(x);
        case 'es mayor que': return Number(x) > Number(v);
        case 'es menor que': return Number(x) < Number(v);
        case 'es igual o posterior a': return String(x || '') >= String(v);
        case 'es anterior a': return !!x && String(x) < String(v);
        case 'contiene': return sinAcentos(x).includes(sinAcentos(v));
        case 'no contiene': return !sinAcentos(x).includes(sinAcentos(v));
    }
    return true;
}
/** ¿La fila entra al segmento? Sin condiciones = todo; Y = todas; O = alguna. `valorDe(prop, fila)` lee la propiedad. */
export function enSegmento(seg, fila, valorDe) {
    const cs = (seg && seg.conds) || [];
    if (!cs.length) return true;
    const f = c => cumple(c, valorDe(c.p, fila));
    return seg.join === 'O' ? cs.some(f) : cs.every(f);
}
/** Lo que dice el chip de una condición (maqueta chipTxt): { campo, op, valor } — la lista corta a 2 valores y «+N». */
export function textoCondicion(c, prop, moneda) {
    let v;
    if (!prop) v = String(c.v);
    else if (prop.t === 'lista') { const xs = c.v || []; v = xs.length > 2 ? xs.slice(0, 2).join(' o ') + ` +${xs.length - 2}` : xs.join(' o '); }
    else if (prop.t === 'numero') v = prop.cant ? Number(c.v).toLocaleString('en-US') : fmtMonto(c.v, moneda, 0);
    else if (prop.t === 'fecha') v = fechaCorta(c.v);
    else v = `«${c.v}»`;
    return { campo: prop ? prop.l : c.p, op: c.op, valor: v };
}
/** El nombre de un segmento en una línea: «Cliente • es uno de • X y Saldo • es mayor que • US$100,000». */
export function nombreSegmento(seg, props, moneda) {
    if (!seg || !seg.conds || !seg.conds.length) return 'Todas las facturas';
    return seg.conds.map(c => { const t = textoCondicion(c, (props || []).find(p => p.k === c.p), moneda); return `${t.campo} • ${t.op} • ${t.valor}`; }).join(seg.join === 'O' ? ' o ' : ' y ');
}
/** Valida la definición guardada de un segmento (viene de ERP_Vistas, que cualquier Miembro puede editar): null si sirve. */
export function problemaSegmento(s, props) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.conds)) return 'no es un segmento';
    if (s.join && s.join !== 'Y' && s.join !== 'O') return 'unión desconocida';
    for (const c of s.conds) {
        const p = (props || []).find(x => x.k === c.p);
        if (!p) return `propiedad desconocida: ${c.p}`;
        if (!OPERADORES[p.t].includes(c.op)) return `operador desconocido: ${c.op}`;
        if (p.t === 'lista' && !Array.isArray(c.v)) return 'una lista sin valores';
    }
    return null;
}
