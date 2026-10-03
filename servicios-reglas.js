// MINSA ERP — v0.168.0: reglas puras de Servicios (Carlos, 2-oct: «lo ven Lorena y José»; maqueta
// https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn). Un renglón por expediente de LATINA y en cuál de los 12 pasos va.
// El dato no se captura en la app: lo cosecha .claude/skills/_compartido/scripts/servicios.py de
// minsa-energy/quimicos/pitepec/servicios-en-curso.md (que escribe solo /servicio-pitepec) y se publica como
// servicios.json en CONFIG.bibliotecaOperacion. Aqui solo se valida y se arma la barra de pasos.

export const VERSION_SERVICIOS = 1;
export const N_PASOS = 12;
/** A partir de cuantos dias el corte se marca como viejo (se publica semanal, con la cobranza). */
export const SERVICIOS_VIEJA_DIAS = 8;

/** null si el JSON sirve; si no, el motivo en palabras. */
export function problemaServicios(d) {
    if (!d || typeof d !== 'object') return 'el archivo no es un objeto JSON';
    if (d.version !== VERSION_SERVICIOS) return `versión ${d.version ?? '(sin versión)'}: esta app lee la ${VERSION_SERVICIOS}; hay que actualizar la app o el exportador`;
    if (!Array.isArray(d.expedientes)) return 'falta la lista de expedientes';
    if (!Array.isArray(d.pasos) || d.pasos.length !== N_PASOS) return `faltan los ${N_PASOS} pasos`;
    if (!d.generado || Number.isNaN(Date.parse(d.generado))) return 'falta la fecha del corte (generado)';
    for (const e of d.expedientes) {
        if (!e || !/^E\d+$/.test(e.clave || '') || !Number.isInteger(e.paso) || e.paso < 0 || e.paso >= N_PASOS) return `expediente incompleto: ${e && e.clave || '(sin clave)'}`;
    }
    return null;
}

/**
 * El estado de cada uno de los 12 pasos de un expediente: 'hecho' antes del actual, 'actual' el suyo
 * ('bloqueado' si el .md lo marca así), 'pendiente' después, y 'rebotado' el paso ya pasado que quedó a medias
 * (los `rotos` del parser: «El paso 4 quedó a medias…»).
 */
export function estadosPasos(e) {
    const rotos = new Set((e.rotos || []).map(r => r.paso));
    return Array.from({ length: N_PASOS }, (_, i) =>
        i === e.paso ? (e.bloqueado ? 'bloqueado' : 'actual')
            : i < e.paso ? (rotos.has(i) ? 'rebotado' : 'hecho') : 'pendiente');
}

/** Clave E# en número, para ordenar: el más nuevo arriba. */
const num = c => Number(String(c).slice(1)) || 0;
export const ordenarServicios = lista => [...lista].sort((a, b) => num(b.clave) - num(a.clave));

/** Conteos para el resumen: abiertos, en cobro (paso 11), detenidos (bloqueado o con un paso a medias). */
export function resumenServicios(lista) {
    const r = { total: lista.length, cobro: 0, detenidos: 0 };
    for (const e of lista) {
        if (e.paso === N_PASOS - 1) r.cobro++;
        if (e.bloqueado || (e.rotos || []).length) r.detenidos++;
    }
    return r;
}

// ---------------------------------------------------------------- v1.0.0 (rediseño 2026-10-02, cubeta 3): la plantilla de reporte

/** ¿Está detenido? (bloqueado o con un paso pasado a medias: lo mismo que cuenta resumenServicios). */
export const detenido = e => !!(e.bloqueado || (e.rotos || []).length);
/** El filtro de «Datos del reporte» (maqueta: el desplegable sobre la tabla). */
export const FILTROS_SERVICIOS = [{ clave: 'todos', texto: 'Todos los expedientes' }, { clave: 'curso', texto: 'En curso' }, { clave: 'detenidos', texto: 'Detenidos' }, { clave: 'cobro', texto: 'En cobro (paso 11)' }];
export function filtrarServicios(lista, filtro) {
    if (filtro === 'detenidos') return lista.filter(detenido);
    if (filtro === 'cobro') return lista.filter(e => e.paso === N_PASOS - 1);
    if (filtro === 'curso') return lista.filter(e => !detenido(e) && e.paso !== N_PASOS - 1);
    return lista.slice();
}
/** Días de calendario de `desde` (AAAA-MM-DD) a `hoy` (AAAA-MM-DD); null sin fecha. */
export function diasDesdeFecha(desde, hoy) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hoy || '')) return null;
    const f = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    return Math.round((f(hoy) - f(desde)) / 86400000);
}
/** El que más lleva esperando (por `desde`): { clave, dias } o null si ninguno trae fecha. */
export function esperaMasLarga(lista, hoy) {
    let m = null;
    for (const e of lista) { const d = diasDesdeFecha(e.desde, hoy); if (d !== null && (!m || d > m.dias)) m = { clave: e.clave, dias: d }; }
    return m;
}
/** «Ciclo»: los 12 pasos con sus expedientes (el más nuevo arriba) y cuántos de ellos están detenidos: [{ n, paso, quien, exps, detenidos }]. */
export function expedientesPorPaso(lista, pasos) {
    const orden = ordenarServicios(lista);
    return pasos.map((p, i) => { const exps = orden.filter(e => e.paso === i); return { n: i, paso: p.paso, quien: p.quien, exps, detenidos: exps.filter(detenido).length }; });
}
/** El texto del estado de UN paso de un expediente (la tabla del detalle). */
export const TEXTO_PASO = { hecho: 'hecho', actual: 'en curso', bloqueado: 'esperando', rebotado: 'quedó a medias', pendiente: 'pendiente' };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** 2026-09-23 -> «23-sep» (sin pasar por Date: es fecha de calendario). Vacío -> «—». */
export const fechaCorta = iso => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '—'; const [, m, d] = iso.split('-'); return `${Number(d)}-${MESES[Number(m) - 1]}`; };
