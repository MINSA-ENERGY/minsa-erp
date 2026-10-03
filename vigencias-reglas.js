// MINSA ERP — v0.166.0: reglas puras de Vigencias (Carlos, 2-oct: siguiente modulo de la barra; maqueta
// https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn). Documentos que caducan —permisos, fianzas, certificaciones, registros,
// plazos de contratos—, NO los pendientes del Tablero. El dato no se captura en la app: lo cosecha
// .claude/skills/_compartido/scripts/vigencias.py de los marcadores `> 📅 **VIGENCIA**` de la KB y se publica como
// vigencias.json en CONFIG.bibliotecaDatos. Aqui solo se valida y se cuentan los dias.

export const VERSION_VIGENCIAS = 1;
/** Umbrales del semaforo, en dias que faltan: hasta ROJO es rojo, hasta AMBAR es ambar. Una renovacion pide tiempo. */
export const VIG_ROJO = 15;
export const VIG_AMBAR = 60;
/** A partir de cuantos dias el corte se marca como viejo (se publica semanal, con la cobranza). */
export const VIGENCIAS_VIEJA_DIAS = 8;

/** null si el JSON sirve; si no, el motivo en palabras. */
export function problemaVigencias(d) {
    if (!d || typeof d !== 'object') return 'el archivo no es un objeto JSON';
    if (d.version !== VERSION_VIGENCIAS) return `versión ${d.version ?? '(sin versión)'}: esta app lee la ${VERSION_VIGENCIAS}; hay que actualizar la app o el exportador`;
    if (!Array.isArray(d.vigencias)) return 'falta la lista de vigencias';
    if (!d.generado || Number.isNaN(Date.parse(d.generado))) return 'falta la fecha del corte (generado)';
    for (const v of d.vigencias) {
        if (!v || !v.titulo || !/^\d{4}-\d{2}-\d{2}$/.test(v.vence || '')) return `vigencia incompleta: ${v && v.titulo || '(sin título)'}`;
    }
    return null;
}

/** Dias que faltan de `hoy` (dia local) a `vence` (AAAA-MM-DD). Negativo = ya vencio. */
export function diasPara(vence, hoy = new Date()) {
    const [a, m, d] = vence.split('-').map(Number);
    const h = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    return Math.round((Date.UTC(a, m - 1, d) - h) / 86400000);
}

/** El chip de lo que falta: { texto, clase } (clase = la de .mn-chip.is-*). */
export function chipFaltan(dias) {
    const n = Math.abs(dias), u = n === 1 ? 'día' : 'días';
    if (dias < 0) return { texto: `vencida hace ${n} ${u}`, clase: 'danger' };
    if (dias === 0) return { texto: 'vence hoy', clase: 'danger' };
    return { texto: `${n} ${u}`, clase: dias <= VIG_ROJO ? 'danger' : dias <= VIG_AMBAR ? 'warn' : 'ok' };
}

/** Las vigencias con sus dias, la mas proxima primero (las vencidas arriba de todo). */
export function ordenarVigencias(lista, hoy = new Date()) {
    return lista.map(v => ({ ...v, dias: diasPara(v.vence, hoy) }))
        .sort((a, b) => a.dias - b.dias || String(a.titulo).localeCompare(String(b.titulo)));
}

/** Conteos para el resumen: vencidas, en rojo (sin vencer) y en ambar. */
export function resumenVigencias(ordenadas) {
    const r = { vencidas: 0, rojo: 0, ambar: 0, total: ordenadas.length };
    for (const v of ordenadas) {
        if (v.dias < 0) r.vencidas++;
        else if (v.dias <= VIG_ROJO) r.rojo++;
        else if (v.dias <= VIG_AMBAR) r.ambar++;
    }
    return r;
}

// ---------------------------------------------------------------- v1.0.0 (rediseño 2026-10-02, cubeta 3): la plantilla de reporte

/** Las unidades que hay, en orden (el desplegable «TODAS LAS UNIDADES» de la maqueta); sin unidad, «—». */
export const unidadesDe = lista => [...new Set(lista.map(v => String(v.unidad || '—')))].sort((a, b) => a.localeCompare(b, 'es'));
/** Las de una unidad (o todas con null). */
export const filtrarVigencias = (lista, unidad) => unidad ? lista.filter(v => String(v.unidad || '—') === unidad) : lista.slice();
/** La más próxima que NO ha vencido (para el KPI «la siguiente»); null si no hay. Recibe la lista ya ordenada (con `dias`). */
export const siguienteVigencia = ordenadas => ordenadas.find(v => v.dias >= 0) || null;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** 2027-01-17 -> «17-ene-2027» (sin pasar por Date: la fecha es de calendario, no un instante). */
export const fechaVigencia = iso => { const [a, m, d] = iso.split('-'); return `${Number(d)}-${MESES[Number(m) - 1]}-${a}`; };
