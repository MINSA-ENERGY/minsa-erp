// MINSA ERP v1.0.0 — reglas PURAS de los 5 reportes de TRABAJO (rediseño 2026-10-02, cubeta 3; plan cerebro/docs/plan-erp-rediseno-2026-10-02.md,
// «Trabajo»: Avance, Carga por persona, Hechas y nuevas, Actividad 30 d, Vencidas — con la plantilla de reporte). Lo que ya calculaba
// Reportes (avance, cargaPorPersona, hechasPorSemana, actividadPorPersona, abiertasDePersona) sigue en reglas.js y se reusa tal cual; aquí
// vive solo lo NUEVO: la TENDENCIA (el nivel de cada cosa al cierre de cada mes, reconstruido con la fecha de creación y la de hecho de cada
// tarjeta), los KPIs contra 30/60/180/365 días, los flujos por mes y la actividad por día. Sin DOM. Lo prueba test/trabajo.test.js.
//
// Lo que NO se puede reconstruir (y la nota de cada reporte lo dice): una tarjeta REABIERTA cuenta como abierta desde que nació, una fecha
// de vencimiento que se movió cuenta con la de hoy, y una tarjeta borrada no cuenta nunca. Las listas no guardan su historia.

import { HECHO, diaDe, sumarDias } from './reglas.js';
import { sumarMeses } from './reporte-reglas.js';

/** Los días contra los que se compara cada KPI (los de la plantilla). */
export const DIAS_KPI_TRABAJO = [30, 60, 180, 365];
/** Tope hacia atrás de una tendencia: 5 años (una fecha tecleada mal no estira el eje a siglos, como C-08 del roadmap). */
export const MESES_TOPE = 60;

/**
 * Los días de vida de una tarjeta (nació · se hizo · vence), en hora de México, calculados UNA vez por tarjeta: diaDe pasa por Intl y una tendencia
 * de 5 años los pide ~60 veces por tarjeta (medido: 3,000 tarjetas, 1.4 s sin esto). La tarjeta se edita EN SU LUGAR (aplicarVivo), así que la
 * memoria guarda de qué campos salió y se recalcula si cambiaron.
 */
const VIDAS = new WeakMap();
function vida(t) {
    const llave = `${t._creado}|${t.Desde}|${t.Columna}|${t.HechoEl}|${t.Vence}`;
    let v = VIDAS.get(t);
    if (!v || v.llave !== llave) {
        const c = diaDe(t._creado) || diaDe(t.Desde) || null, hecha = t.Columna === HECHO, hEl = hecha ? diaDe(t.HechoEl) : null;
        v = { llave, c, hecha, hEl, h: hecha ? (hEl || c) : null, ve: diaDe(t.Vence) };
        VIDAS.set(t, v);
    }
    return v;
}
/** El día en que nació la tarjeta: la fecha de creación que sabe SharePoint (`_creado`) o, sin ella, `Desde`. null si no hay ninguna. */
export const creadaEl = t => (t ? vida(t).c : null);
/** ¿La tarjeta ya existía ese día? Sin fecha de creación se toma como que siempre existió. */
export const existiaEl = (t, dia) => { const c = creadaEl(t); return !c || c <= dia; };
/** ¿La tarjeta ya estaba HECHA ese día? Solo las que hoy están en Hecho; su día es `HechoEl` y, sin él, el de su creación. */
export function hechaEl(t, dia) {
    if (!t) return false;
    const v = vida(t);
    return v.hecha && (!v.h || v.h <= dia);
}

/** El avance de un conjunto de tarjetas tal como estaba el día `dia` (AAAA-MM-DD): { total, hechas, abiertas, pct } (pct con un decimal). */
export function avanceAl(tareas, dia) {
    let total = 0, hechas = 0;
    for (const t of tareas || []) { if (!existiaEl(t, dia)) continue; total++; if (hechaEl(t, dia)) hechas++; }
    return { total, hechas, abiertas: total - hechas, pct: total ? Math.round(hechas * 1000 / total) / 10 : 0 };
}
/** Cuántas estaban ABIERTAS ese día (existían y no estaban hechas). */
export const abiertasAl = (tareas, dia) => avanceAl(tareas, dia).abiertas;
/** Cuántas estaban VENCIDAS ese día: abiertas con un Vence anterior a ese día (el mismo corte que estadoVence: vencer HOY no es vencida). */
export function vencidasAl(tareas, dia) {
    let n = 0;
    for (const t of tareas || []) { const v = vida(t).ve; if (v && v < dia && existiaEl(t, dia) && !hechaEl(t, dia)) n++; }
    return n;
}

/** El primer mes con dato (la tarjeta más vieja) y nunca más de MESES_TOPE atrás de `hoyDia`; sin tarjetas, el mes de hoy. */
export function primerMes(tareas, hoyDia) {
    let m = hoyDia.slice(0, 7);
    for (const t of tareas || []) { const c = creadaEl(t); if (c && c.slice(0, 7) < m) m = c.slice(0, 7); }
    const piso = sumarMeses(hoyDia.slice(0, 7), -MESES_TOPE);
    return m < piso ? piso : m;
}
/** Último día de un mes 'AAAA-MM'. */
export const finDeMes = mes => sumarDias(sumarMeses(mes, 1) + '-01', -1);
/** Un corte por mes de `desdeMes` a hoy: el último día de cada mes y, para el mes de hoy, hoy. [{ k: 'AAAA-MM', dia }] */
export function cortesMensuales(desdeMes, hoyDia) {
    const out = [], hasta = hoyDia.slice(0, 7);
    for (let k = desdeMes; k <= hasta; k = sumarMeses(k, 1)) out.push({ k, dia: k === hasta ? hoyDia : finDeMes(k) });
    return out;
}
/** La serie mensual de un NIVEL (lo que había al cierre de cada mes): [{ k, v }] — la forma que recortan y agrupan las reglas de la plantilla. */
export function serieNivel(tareas, hoyDia, nivel) {
    return cortesMensuales(primerMes(tareas, hoyDia), hoyDia).map(c => ({ k: c.k, v: nivel(tareas, c.dia) }));
}
/** Los KPIs de un nivel: el de hoy y el de hace 30/60/180/365 días, con el % de cambio del de entonces al de hoy ({ dias, v, pct }). */
export function kpisNivel(tareas, hoyDia, nivel, dias = DIAS_KPI_TRABAJO) {
    const hoy = nivel(tareas, hoyDia);
    return { hoy, antes: dias.map(d => { const v = nivel(tareas, sumarDias(hoyDia, -d)); return { dias: d, v, pct: v ? (hoy - v) / Math.abs(v) * 100 : null }; }) };
}
/** El porcentaje de avance como nivel (para serieNivel y kpisNivel), SIN redondear: quien lo pinta redondea una vez (Math.round), igual que
 *  avanceGlobal de reglas.js; redondear dos veces (a un decimal y luego a entero) daba 13% donde el anillo dice 12%. */
export const pctAvanceAl = (tareas, dia) => { const a = avanceAl(tareas, dia); return a.total ? a.hechas * 100 / a.total : 0; };
/** La diferencia en PUNTOS de un porcentaje: «+5 pts», «−2.5 pts», «sin cambio». */
export function textoPuntos(dif) {
    const d = Math.round(Number(dif) * 10) / 10;
    if (!d) return 'sin cambio';
    return `${d > 0 ? '+' : '−'}${Math.abs(d)} ${Math.abs(d) === 1 ? 'pt' : 'pts'}`;
}

/**
 * Hechas y nuevas POR MES (flujos, no niveles): `hechas` por el mes de HechoEl (las que hoy están en Hecho y lo traen), `nuevas` por el
 * mes de creación. Un punto por mes de `desdeMes` al de hoy, sin huecos: [{ k, hechas, nuevas }].
 */
export function flujoMensual(tareas, hoyDia, desdeMes = primerMes(tareas, hoyDia)) {
    const m = new Map(cortesMensuales(desdeMes, hoyDia).map(c => [c.k, { k: c.k, hechas: 0, nuevas: 0 }]));
    for (const t of tareas || []) {
        const c = creadaEl(t); if (c && m.has(c.slice(0, 7))) m.get(c.slice(0, 7)).nuevas++;
        const h = vida(t).hEl; if (h && m.has(h.slice(0, 7))) m.get(h.slice(0, 7)).hechas++;
    }
    return [...m.values()];
}
/** Lo hecho y lo nuevo en los últimos `dias` (hoy incluido): { hechas, nuevas }. */
export function flujoEnDias(tareas, hoyDia, dias) {
    const desde = sumarDias(hoyDia, -(dias - 1));
    let hechas = 0, nuevas = 0;
    for (const t of tareas || []) {
        const c = creadaEl(t); if (c && c >= desde && c <= hoyDia) nuevas++;
        const h = vida(t).hEl; if (h && h >= desde && h <= hoyDia) hechas++;
    }
    return { hechas, nuevas };
}

/** Las acciones del registro agrupadas para la tabla de Actividad: comentar · mover · crear · lo demás. */
export const TIPO_ACCION = { comentar: 'comentarios', 'mover-tarea': 'movimientos', 'crear-tarea': 'creadas' };
/** El instante desde el que cuenta «los últimos `dias`» (el mismo corte que actividadPorPersona de reglas.js). */
const desdeIso = (dias, ahora) => new Date(ahora.getTime() - dias * 86400000).toISOString();
/**
 * Actividad por DÍA en los últimos `dias` (hoy incluido, hora de México): [{ dia, n }] del más viejo a hoy. Cuenta los mismos renglones
 * que «Actividad por persona» (la ventana es de 90 días: CONFIG.actividadDias).
 */
export function actividadPorDia(actividad, dias = 30, ahora = new Date()) {
    const hoy = diaDe(ahora), m = new Map();
    for (let i = dias - 1; i >= 0; i--) m.set(sumarDias(hoy, -i), 0);
    const desde = desdeIso(dias, ahora);
    for (const a of actividad || []) { if (String(a.Cuando || '') < desde) continue; const d = diaDe(a.Cuando); if (m.has(d)) m.set(d, m.get(d) + 1); }
    return [...m.entries()].map(([dia, n]) => ({ dia, n }));
}
/** Cuántas acciones hubo en la ventana de `dias` que termina `finDias` días atrás (0 = la de ahora; 30 = los 30 anteriores). */
export function accionesEnVentana(actividad, dias = 30, finDias = 0, ahora = new Date()) {
    const hasta = desdeIso(finDias, ahora), desde = desdeIso(finDias + dias, ahora);
    return (actividad || []).filter(a => { const c = String(a.Cuando || ''); return c >= desde && (finDias === 0 || c < hasta); }).length;
}
/** El desglose por persona de los últimos `dias`: [{ quien, n, comentarios, movimientos, creadas, otras }], de más a menos (como actividadPorPersona). */
export function actividadDesglose(actividad, dias = 30, ahora = new Date()) {
    const desde = desdeIso(dias, ahora), m = new Map();
    for (const a of actividad || []) {
        if (String(a.Cuando || '') < desde) continue;
        const q = String(a.Quien || '').toLowerCase();
        if (!m.has(q)) m.set(q, { quien: q, n: 0, comentarios: 0, movimientos: 0, creadas: 0, otras: 0 });
        const r = m.get(q); r.n++; r[TIPO_ACCION[a.Accion] || 'otras']++;
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.quien.localeCompare(b.quien));
}

/** Los días que lleva vencida una tarjeta (0 si no lo está). */
export function diasVencida(t, hoyDia) {
    const v = t ? vida(t).ve : null; if (!v || v >= hoyDia || t.Columna === HECHO) return 0;
    return Math.round((Date.UTC(+hoyDia.slice(0, 4), +hoyDia.slice(5, 7) - 1, +hoyDia.slice(8, 10)) - Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10))) / 86400000);
}

/** Las 5 páginas de Reportes (sufijo de #reportes/<r> → título); #reportes a secas (o un sufijo que no existe) es Avance. */
export const REPORTES_TRABAJO = { avance: 'Avance', carga: 'Carga por persona', semanas: 'Hechas y nuevas', actividad: 'Actividad 30 días', vencidas: 'Vencidas' };
export const paginaReporte = sub => Object.prototype.hasOwnProperty.call(REPORTES_TRABAJO, String(sub || '')) ? String(sub) : 'avance';
