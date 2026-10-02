// MINSA ERP — v0.169.0: reglas puras de Compras (Carlos, 2-oct: «lo ven Lorena y José»; «no importa que vean los montos»;
// maqueta https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn). Las órdenes de compra que emite MINSA, con sus partidas.
// El dato no se captura en la app: lo cosecha .claude/skills/_compartido/scripts/compras.py de los .docx de cada O.C.
// (hoy solo PRODEOS, PDH-###) y se publica como compras.json en CONFIG.bibliotecaOperacion. Aqui solo se valida y se resume.

export const VERSION_COMPRAS = 1;
/** A partir de cuantos dias el corte se marca como viejo (se publica semanal, con la cobranza). */
export const COMPRAS_VIEJA_DIAS = 8;

/** null si el JSON sirve; si no, el motivo en palabras. */
export function problemaCompras(d) {
    if (!d || typeof d !== 'object') return 'el archivo no es un objeto JSON';
    if (d.version !== VERSION_COMPRAS) return `versión ${d.version ?? '(sin versión)'}: esta app lee la ${VERSION_COMPRAS}; hay que actualizar la app o el exportador`;
    if (!Array.isArray(d.ordenes)) return 'falta la lista de órdenes';
    if (!d.generado || Number.isNaN(Date.parse(d.generado))) return 'falta la fecha del corte (generado)';
    for (const o of d.ordenes) {
        if (!o || !/^[A-Z]+-\d+$/.test(o.folio || '') || !Array.isArray(o.partidas) || !o.partidas.length || !Number.isFinite(o.total)) return `orden incompleta: ${o && o.folio || '(sin folio)'}`;
    }
    return null;
}

/** La más nueva primero: por fecha y, sin fecha, por folio. */
export const ordenarCompras = lista => [...lista].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.folio).localeCompare(String(a.folio)));

/** Total por moneda (nunca se suman monedas entre si) y cuantas órdenes hay en el año en curso. */
export function resumenCompras(lista, hoy = new Date()) {
    const anio = String(hoy.getFullYear());
    const porMoneda = {};
    let delAnio = 0;
    for (const o of lista) {
        if (String(o.fecha).startsWith(anio)) { delAnio++; porMoneda[o.moneda || 'MXN'] = (porMoneda[o.moneda || 'MXN'] || 0) + o.total; }
    }
    return { total: lista.length, delAnio, porMoneda, anio };
}

/** «28,000 Litros + 1 Servicio…»: el concepto en una línea, partida por partida. */
export const conceptoDe = o => o.partidas.map(p => p.descripcion).join(' + ');
