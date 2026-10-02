// ERP v0.6.0 — reglas PURAS de Gastos (fase 5 del plan, docs/plan.md decisiones 5, 7, 8 y 10). Sin DOM ni red: las prueba
// test/gastos.test.js en Node y las usa gastos.js. Los nombres de columna son los de ERP_Gastos / ERP_Roles en esquema.json
// (fundidos desde docs/gastos-esquema.json); test/gastos.test.js coteja los catalogos de aqui contra ese archivo.

import { slug, diaDe, leerMonto, TEXTO_MAX } from './reglas.js';

export const ESTADOS_GASTO = ['registrado', 'reembolsado', 'rechazado'];   // decision 7: sin «aprobado»
export const MONEDAS = ['MXN', 'USD'];
export const CATEGORIAS_GASTO = ['combustible', 'casetas', 'alimentos', 'hospedaje', 'transporte', 'papelería', 'herramienta y material', 'mensajería', 'otro'];
export const CFDI_ESTADOS = ['sin-cfdi', 'propuesto', 'confirmado'];
export const NOTAS_MAX = 2000;
export const COMPROBANTE_MAX_MB = 25;

const bajo = s => String(s || '').trim().toLowerCase();

/** Roles de Gastos de un correo segun ERP_Roles (Activo !== false): Set con 'tesoreria' y/o 'contabilidad'. */
export function rolesErpDe(correo, rolesErp) {
    const c = bajo(correo); const s = new Set();
    for (const r of rolesErp || []) if (bajo(r.Title) === c && r.Activo !== false && (r.Rol === 'tesoreria' || r.Rol === 'contabilidad')) s.add(r.Rol);
    return s;
}

/**
 * Quien puede que. `rol` es el de PROY_Roles (gerencia · colaborador · lectura); `erp` el Set de rolesErpDe.
 * - registrar: quien escribe en la app (gerencia, colaborador) y tesoreria. Lectura no escribe en ninguna parte de la app.
 * - porOtro / tesoreria: solo tesoreria (decision 5: captura por el empleado; decision 7: SOLO ella marca reembolsado o rechazado).
 */
export const PUEDE_GASTO = {
    registrar: (rol, erp) => rol === 'gerencia' || rol === 'colaborador' || !!(erp && erp.has('tesoreria')),
    porOtro: erp => !!(erp && erp.has('tesoreria')),
    tesoreria: erp => !!(erp && erp.has('tesoreria')),
    // v0.7.0 (fase 6, decision 8): solo contabilidad confirma o descarta el CFDI que propuso la tarea semanal.
    contabilidad: erp => !!(erp && erp.has('contabilidad'))
};

/** «Mis gastos» filtra por Solicitante (a quien se le reembolsa), del mas reciente al mas viejo. */
export function misGastos(gastos, correo) {
    const c = bajo(correo);
    return (gastos || []).filter(g => bajo(g.Solicitante) === c).sort(porFechaDesc);
}
const porFechaDesc = (a, b) => String(b.Fecha || '').localeCompare(String(a.Fecha || '')) || b.id - a.id;
/** La cola de tesoreria: todo lo «registrado», del mas viejo al mas nuevo (lo que lleva mas esperando, arriba). */
export function porReembolsar(gastos) {
    return (gastos || []).filter(g => g.Estado === 'registrado').sort((a, b) => String(a.Fecha || '').localeCompare(String(b.Fecha || '')) || a.id - b.id);
}
/** Lo resuelto (reembolsado o rechazado), lo mas reciente primero. */
export function resueltos(gastos) { return (gastos || []).filter(g => g.Estado === 'reembolsado' || g.Estado === 'rechazado').sort(porFechaDesc); }
/** Guarda contra el doble pago (gastos-esquema.json, ReembolsadoEl): ya se sello un reembolso y el estado ya no lo dice. */
export function yaReembolsadoAntes(g) { return !!(g && g.ReembolsadoEl) && g.Estado !== 'reembolsado'; }

/** El mes del gasto (AAAA-MM), por la fecha del TICKET en hora de Mexico: es la carpeta del comprobante. */
export function mesDe(g) { return (diaDe(g && g.Fecha) || '').slice(0, 7); }
const centavos = n => Math.round(n * 100) / 100;
const montoDe = g => { const n = Number(g && g.Monto); return Number.isFinite(n) ? n : 0; };

/** Totales por mes y moneda (nunca se suman pesos con dolares): [{ mes, moneda, registrado, reembolsado, rechazado, n }], el mes mas reciente primero. */
export function totalesPorMes(gastos) {
    const m = new Map();
    for (const g of gastos || []) {
        const mes = mesDe(g) || 'sin fecha'; const moneda = MONEDAS.includes(g.Moneda) ? g.Moneda : 'MXN';
        const k = mes + '|' + moneda;
        const t = m.get(k) || { mes, moneda, registrado: 0, reembolsado: 0, rechazado: 0, n: 0 };
        if (ESTADOS_GASTO.includes(g.Estado)) t[g.Estado] = centavos(t[g.Estado] + montoDe(g));
        t.n++; m.set(k, t);
    }
    return [...m.values()].sort((a, b) => b.mes.localeCompare(a.mes) || MONEDAS.indexOf(a.moneda) - MONEDAS.indexOf(b.moneda));
}
/** Suma por moneda de un conjunto: { MXN: n, USD: n } (solo las monedas presentes). */
export function sumaPorMoneda(gastos) {
    const s = {};
    for (const g of gastos || []) { const mo = MONEDAS.includes(g.Moneda) ? g.Moneda : 'MXN'; s[mo] = centavos((s[mo] || 0) + montoDe(g)); }
    return s;
}

const FMT = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «$1,234.50 MXN» / «$120.00 USD». */
export function formatoMonto(n, moneda = 'MXN') { return `$${FMT.format(centavos(Number(n) || 0))} ${MONEDAS.includes(moneda) ? moneda : 'MXN'}`; }

/** El chip del estado: { texto, clase } (clase = la de .mn-chip.is-*). */
export function etiquetaEstado(estado) {
    if (estado === 'reembolsado') return { texto: 'Reembolsado', clase: 'ok' };
    if (estado === 'rechazado') return { texto: 'Rechazado', clase: 'danger' };
    return { texto: 'Registrado', clase: 'warn' };
}
/** El chip de CFDI SOLO si la columna trae valor: { texto, clase } o null. */
export function etiquetaCfdi(estado) {
    if (estado === 'confirmado') return { texto: 'CFDI ✓', clase: 'ok' };
    if (estado === 'propuesto') return { texto: 'CFDI por confirmar', clase: 'info' };
    if (estado === 'sin-cfdi') return { texto: 'Sin CFDI', clase: '' };
    return null;
}

// ---------------------------------------------------------------- comprobante

const EXT_IMAGEN = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif'];
const EXT_DE_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
/** Extension del comprobante en minusculas (de su nombre o, si no trae, de su tipo MIME); '' si no se sabe. */
export function extComprobante(nombre, mime) {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(nombre || ''));
    if (m) return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    return EXT_DE_MIME[String(mime || '').toLowerCase()] || '';
}
/** Tipo de la convencion del _LEEME de «Gastos»: Ticket (foto) · Factura (PDF) · CFDI (XML) · Otro. */
export function tipoComprobante(nombre, mime) {
    const e = extComprobante(nombre, mime);
    if (EXT_IMAGEN.includes(e) || /^image\//i.test(String(mime || ''))) return 'Ticket';
    if (e === 'pdf') return 'Factura';
    if (e === 'xml') return 'CFDI';
    return 'Otro';
}
/** El comprobante que se acepta: una foto o un PDF, de hasta COMPROBANTE_MAX_MB. { ok, motivo }. */
export function comprobanteValido(f) {
    if (!f) return { ok: false, motivo: 'Elige una foto o un PDF.' };
    const t = tipoComprobante(f.name, f.type);
    if (t !== 'Ticket' && t !== 'Factura') return { ok: false, motivo: `«${f.name}» no es una foto ni un PDF.` };
    if (!(f.size > 0)) return { ok: false, motivo: `«${f.name}» está vacío.` };
    if (f.size > COMPROBANTE_MAX_MB * 1024 * 1024) return { ok: false, motivo: `«${f.name}» pasa de ${COMPROBANTE_MAX_MB} MB.` };
    return { ok: true, motivo: '' };
}
/**
 * AAAA-MM-DD_GASTO-<ID>_<Tipo>_<descripcion-corta>.<ext> (el _LEEME de la biblioteca «Gastos»): sin acentos ni espacios, la
 * descripcion en minusculas con guiones (40 max). `n` >= 2 pone el sufijo _n de «un segundo archivo»: nunca se sobrescribe.
 */
export function nombreComprobante({ dia, id, tipo, concepto, ext, n = 1 }) {
    let desc = slug(concepto);
    if (desc.length > 40) { const c = desc.slice(0, 41); desc = c.lastIndexOf('-') > 0 ? c.slice(0, c.lastIndexOf('-')) : c.slice(0, 40); }   // corta en palabra entera
    desc = desc.replace(/-+$/, '') || 'gasto';
    return `${dia}_GASTO-${id}_${tipo}_${desc}${n >= 2 ? '_' + n : ''}${ext ? '.' + ext : ''}`;
}
/** Ruta relativa a la raiz de «Gastos»: la carpeta del MES del gasto y el nombre. */
export function rutaComprobante(dia, nombre) { return `${String(dia).slice(0, 7)}/${nombre}`; }

// ---------------------------------------------------------------- alta y cambios de estado

/**
 * Lo que le falta a un gasto para registrarse (el boton lo dice, patron de la maqueta). `c` trae lo escrito:
 * { dia (AAAA-MM-DD o ''), fechaError, monto (texto), concepto, equipo, notas, conComprobante, hoy (AAAA-MM-DD) }.
 */
export function faltanGasto(c) {
    const f = [];
    if (!c.dia) f.push(c.fechaError ? 'una fecha válida' : 'la fecha');
    else if (c.hoy && c.dia > c.hoy) f.push('una fecha que no sea futura');
    if (leerMonto(c.monto) === null) f.push('el monto');
    if (!String(c.concepto || '').trim()) f.push('el concepto');
    if (!c.equipo) f.push('el equipo');
    if (!c.conComprobante && !String(c.notas || '').trim()) f.push('foto o nota');
    return f;
}
/** Valida lo que no cabe en «falta»: largos de SharePoint (texto de una linea = 255). '' si todo bien. */
export function largoInvalido(c) {
    if (String(c.concepto || '').trim().length > TEXTO_MAX) return `El concepto pasa de ${TEXTO_MAX} caracteres.`;
    if (String(c.notas || '').length > NOTAS_MAX) return `Las notas pasan de ${NOTAS_MAX} caracteres.`;
    return '';
}
/** Los campos del POST a ERP_Gastos. `fechaIso` ya convertida (aIsoDia). El comprobante va DESPUES (necesita el ID). */
export function camposGasto({ fechaIso, monto, moneda, concepto, categoria, equipo, proyectoId, solicitante, capturadoPor, notas }) {
    const c = {
        Title: String(concepto).trim(), Fecha: fechaIso, Monto: leerMonto(monto), Moneda: MONEDAS.includes(moneda) ? moneda : 'MXN',
        Equipo: equipo, Solicitante: solicitante, CapturadoPor: capturadoPor, Estado: 'registrado', CfdiEstado: 'sin-cfdi'
    };
    if (categoria) c.Categoria = categoria;
    if (Number(proyectoId) > 0) c.ProyectoId = Number(proyectoId);
    if (String(notas || '').trim()) c.Notas = String(notas).trim();
    return c;
}
/** El sello del reembolso (decision 7). ReembolsadoEl no se limpia nunca: ningun otro PATCH de la app lo toca. */
export function camposReembolso(quien, ahora = new Date()) { return { Estado: 'reembolsado', ReembolsadoPor: quien, ReembolsadoEl: ahora.toISOString() }; }
/** El rechazo de tesoreria: conserva renglon y comprobante; no toca los campos del reembolso. */
export function camposRechazo(quien, motivo, ahora = new Date()) { return { Estado: 'rechazado', RechazadoPor: quien, RechazadoEl: ahora.toISOString(), MotivoRechazo: String(motivo || '').trim().slice(0, TEXTO_MAX) }; }

// ---------------------------------------------------------------- CFDI (v0.7.0, fase 6, decision 8)
// La tarea semanal de la laptop de Carlos (docs/proponer-cfdi.ps1 + herramientas-cfdi/cruce_cfdi.py) escribe CfdiCandidatos:
// [{ uuid, total, fecha, emisor, rfc, folio }] y, para lo que contabilidad ya descarto en ESE gasto, { uuid, descartado: true }.

const uuidNorm = u => String(u || '').trim().toUpperCase();
/** CfdiCandidatos -> { candidatos (los vivos), descartados (UUID) }. Tolera vacio y JSON roto (nunca truena la pantalla). */
export function leerCandidatos(texto) {
    let v = [];
    try { v = typeof texto === 'string' && texto.trim() ? JSON.parse(texto) : (Array.isArray(texto) ? texto : []); } catch (_) { v = []; }
    const candidatos = [], descartados = [];
    for (const x of Array.isArray(v) ? v : []) {
        if (!x || typeof x !== 'object' || !x.uuid) continue;
        const u = uuidNorm(x.uuid);
        if (x.descartado) { if (!descartados.includes(u)) descartados.push(u); }
        else if (!candidatos.some(c => c.uuid === u)) candidatos.push({ ...x, uuid: u, total: Number(x.total), emisor: String(x.emisor || ''), fecha: String(x.fecha || '') });
    }
    return { candidatos, descartados };
}
/** La cola de contabilidad: lo «propuesto» con al menos un candidato vivo (no lo rechazado), lo mas viejo arriba. */
export function porConfirmarCfdi(gastos) {
    return (gastos || []).filter(g => g.CfdiEstado === 'propuesto' && g.Estado !== 'rechazado' && leerCandidatos(g.CfdiCandidatos).candidatos.length)
        .sort((a, b) => String(a.Fecha || '').localeCompare(String(b.Fecha || '')) || a.id - b.id);
}
/** «A1B2C3D4…»: los 8 primeros del UUID, para leerlo en pantalla (el completo va en el title). */
export function uuidCorto(u) { const s = uuidNorm(u); return s.length > 8 ? s.slice(0, 8) + '…' : s; }
/** El otro gasto que ya tiene ligado ese UUID (CfdiUuid), o null. Un CFDI no se liga a dos gastos. */
export function ligadoEnOtro(gastos, uuid, id) {
    const u = uuidNorm(uuid);
    return (gastos || []).find(g => g.id !== id && uuidNorm(g.CfdiUuid) === u) || null;
}
/** «Confirmar este»: liga el UUID, sella quien y cuando, y vacia los candidatos. */
export function camposConfirmarCfdi(uuid, quien, ahora = new Date()) {
    return { CfdiEstado: 'confirmado', CfdiUuid: uuidNorm(uuid), CfdiConfirmadoPor: quien, CfdiConfirmadoEl: ahora.toISOString(), CfdiCandidatos: null };
}
/** «Ninguno es»: vuelve a sin-cfdi y guarda TODOS los UUID (los de antes y los propuestos) como descartados, para que la tarea no los re-proponga. */
export function camposNingunoCfdi(textoCandidatos) {
    const { candidatos, descartados } = leerCandidatos(textoCandidatos);
    const todos = [...descartados, ...candidatos.map(c => c.uuid).filter(u => !descartados.includes(u))];
    return { CfdiEstado: 'sin-cfdi', CfdiCandidatos: todos.length ? JSON.stringify(todos.map(uuid => ({ uuid, descartado: true }))) : null };
}
/** Tasa del mes (decision 8: «se mide la tasa de confirmacion al mes»): confirmados en el mes de `mes` (AAAA-MM, por CfdiConfirmadoEl), a mano o por la tarea. */
export function confirmadosDelMes(gastos, mes) {
    const del = (gastos || []).filter(g => g.CfdiEstado === 'confirmado' && (diaDe(g.CfdiConfirmadoEl) || '').slice(0, 7) === mes);
    return { total: del.length, porTarea: del.filter(g => g.CfdiConfirmadoPor === 'tarea-semanal').length };
}
