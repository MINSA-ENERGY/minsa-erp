// MINSA ERP — v0.165.0: reglas puras de Finanzas > Cobranza (Carlos, 2-oct: copiar «Finance & Accounting» de un ERP
// generico, recortado a cobranza; maqueta https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn). El dato NO se captura en la app:
// lo produce `/conciliar-finanzas` en la laptop (scripts/exportar_cobranza.py) y se publica como cobranza.json en la
// biblioteca CONFIG.bibliotecaDatos. Aqui solo se valida y se resume; nunca se suman monedas entre si.

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
