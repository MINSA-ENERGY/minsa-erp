// MINSA ERP v1.0.0 — PREGUNTAR, reglas puras (rediseño 2026-10-02, cubeta 4; plan «Preguntar (sin IA)»; maqueta maqueta-reportes.html,
// chatInicio / responde / parseIA). NO es IA: un intérprete de frases por reglas que contesta con los datos que la app YA tiene cargados
// (tarjetas, bitácora y los JSON publicados) y con una liga «Abrir» a la página o al segmento que lo enseña. Lo de Dinero reusa
// interpretarFrase (el «armar con frase» de los segmentos); lo de Trabajo y Operación se agrega aquí.
//   · sugeridasPara(ctx): las preguntas sugeridas POR ROL, armadas con los datos reales (la contraparte que más debe, el proveedor al que
//     más se le compra, los meses en que algo vence).
//   · interpretarPregunta(q, ctx): { entendida, intento, texto, filas: [{ a, b, c? }], liga: { texto, ir, filtroMis? } | { texto, segmento } }.
// Respeta los roles: lectura no ve Operación; colaborador no ve cobrar, pagar ni vigencias (lo dice en vez de contestar).
// `ctx` = { rol, yo, hoy (Date), hoyDia, tareas, proyectos, roles, actividad, sinMovimientoDias, cobranza, servicios, compras, vigencias }
// (cada JSON como { datos, error }: null = aún no leído · false = no hay). Sin DOM: lo prueba test/preguntar.test.js.

import { PUEDE, sinAcentos, misAbiertas, infoVence, frentesQuietos, cargaPorPersona, nombreDe, plural, HECHO, diasPara } from './reglas.js';
import { facturasDe, monedasDe, contrapartesDe, interpretarFrase, sinRepDe, conFacturasRicas, corteDe, nombreClave } from './cobranza-reglas.js';
import { fmtMonto } from './reporte-reglas.js';
import { ordenarVigencias, fechaVigencia } from './vigencias-reglas.js';
import { ordenarServicios, detenido, N_PASOS, fechaCorta as fechaServicio } from './servicios-reglas.js';

/** Lo que el panel dice al pie (plan, literal). */
export const PIE_PREGUNTAR = 'Respuestas calculadas con los datos de la app (no es IA)';
const TOPE_FILAS = 6;
const norm = s => sinAcentos(s).replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
const SIN_PERMISO = {
    dinero: 'Lo que nos deben y lo que debemos vive en Dinero › Por cobrar y Por pagar, que solo ve gerencia.',
    vigencias: 'Las vigencias (permisos, fianzas, certificaciones) solo las ve gerencia.',
    operacion: 'Servicios y Compras son de Operación, que ven gerencia y colaboradores.'
};
/** El estado de un JSON para contestar: el mensaje si no se puede (aún leyendo / no publicado / falló); null si hay datos. */
function faltaJson(j, nombre) {
    if (j && j.datos) return null;
    if (j && j.error) return `No se pudo leer ${nombre}: ${j.error}.`;
    if (j && j.datos === false) return `Todavía no hay ${nombre} publicado en SharePoint: no tengo con qué contestar eso.`;
    return `Todavía estoy leyendo ${nombre}; vuelve a preguntar en un momento.`;
}
const NUMEROS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, treinta: 30 };
/** La ventana de «¿qué vence en …?» en días: «6 meses», «tres semanas», «30 días», «un año»; sin número, 6 meses. */
export function ventanaDias(s) {
    const m = s.match(/(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|treinta)\s+(dias?|semanas?|mes(?:es)?|anos?)\b/);
    if (!m) return { dias: 183, texto: 'los próximos 6 meses' };
    const n = Number(m[1]) || NUMEROS[m[1]] || 1, u = m[2];
    if (u.startsWith('dia')) return { dias: n, texto: `los próximos ${n} ${plural(n, 'día')}` };
    if (u.startsWith('semana')) return { dias: n * 7, texto: `las próximas ${n} ${plural(n, 'semana')}` };
    if (u.startsWith('ano')) return { dias: n * 365, texto: n === 1 ? 'el próximo año' : `los próximos ${n} años` };
    return { dias: Math.round(n * 30.5), texto: `los próximos ${n} ${plural(n, 'mes', 'meses')}` };
}
/** Las facturas con saldo de un lado, en TODAS sus monedas (planas, de facturasDe; nunca se suman entre monedas). */
function facturasLado(d, lado) {
    const cs = contrapartesDe(d, lado);
    return monedasDe(cs).flatMap(m => facturasDe(cs, m));
}
/** «US$1.00 y $2.00» — un total por moneda, USD primero. */
function porMoneda(fs, campo = 'saldo') {
    const t = {}; for (const f of fs) t[f.moneda] = (t[f.moneda] || 0) + (Number(f[campo]) || 0);
    return Object.entries(t).sort((a, b) => b[0].localeCompare(a[0])).map(([m, v]) => fmtMonto(v, m));
}
const unir = xs => xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];

// ---------------------------------------------------------------- preguntas sugeridas (en vivo, por rol)

/** Las preguntas sugeridas para el rol, con X y los números de los datos cargados. Lo que no tiene datos todavía no se sugiere. */
export function sugeridasPara(ctx) {
    const g = PUEDE.capital(ctx.rol), t = PUEDE.tarea(ctx.rol), out = [];
    const cob = ctx.cobranza && ctx.cobranza.datos;
    if (g && cob && Array.isArray(cob.clientes)) {
        const fs = facturasLado(cob, 'cobrar');
        const top = (campo, lista) => { const m = new Map(); for (const f of lista) m.set(f.nombre, (m.get(f.nombre) || 0) + (f.moneda === 'USD' ? 1e6 : 1) * f[campo]); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]; };
        const deuda = top('saldo', fs); if (deuda) out.push(`¿Cuánto nos debe ${nombreClave(deuda[0])}?`);
        const sin = top('saldo', sinRepDe(fs, conFacturasRicas(cob))); if (sin) out.push(`¿Qué facturas de ${nombreClave(sin[0])} no tienen REP?`);
    }
    if (t && ctx.servicios && ctx.servicios.datos && (ctx.servicios.datos.expedientes || []).length) out.push('¿En qué paso va cada servicio?');
    if (g && ctx.vigencias && ctx.vigencias.datos) {
        const vs = ordenarVigencias(ctx.vigencias.datos.vigencias || [], ctx.hoy).filter(v => v.dias >= 0);
        const n = [3, 6, 12].find(m => vs.some(v => v.dias <= m * 30.5)) || 6;
        out.push(`¿Qué vence en los próximos ${n} meses?`);
    }
    if (t && ctx.compras && ctx.compras.datos) {
        const os = ctx.compras.datos.ordenes || [];
        const anio = String(ctx.hoyDia || '').slice(0, 4), anios = [...new Set(os.map(o => String(o.fecha || '').slice(0, 4)).filter(Boolean))].sort();
        const a = anios.includes(anio) ? anio : anios[anios.length - 1];
        const cuenta = new Map(); for (const o of os) if (String(o.fecha || '').startsWith(a)) cuenta.set(o.proveedor || '', (cuenta.get(o.proveedor || '') || 0) + 1);
        const prov = [...cuenta.entries()].filter(([p]) => p).sort((x, y) => y[1] - x[1])[0];
        if (prov && a) out.push(`¿Cuánto le compramos a ${prov[0]} en ${a}?`);
    }
    out.push('¿Qué tengo vencido?', '¿Qué frentes no se mueven?', '¿Quién tiene más carga?');
    return out;
}

// ---------------------------------------------------------------- el intérprete

/** Contesta `q` con los datos de `ctx`. Si no entiende, `entendida: false` y el panel ofrece las sugeridas. */
export function interpretarPregunta(q, ctx) {
    const s = norm(q);
    if (!s) return { entendida: false, intento: null, texto: 'Escribe una pregunta o toca una de las sugeridas.', filas: [] };
    for (const [intento, casa, contestar] of INTENTOS) if (casa(s)) return { entendida: true, intento, filas: [], ...contestar(q, s, ctx) };
    return { entendida: false, intento: null, texto: 'No entendí la pregunta. Estas sí las sé contestar:', filas: [] };
}

const INTENTOS = [
    ['mis-vencidas', s => /\b(tengo|mis|me toca|tenemos)\b.*\b(vencid|atrasad|pendient)|\bmis tareas vencidas\b|\bque se me paso\b/.test(s), misVencidas],
    ['sin-rep', s => /\bsin (rep|complemento)|\bno tienen? (rep|complemento)|\bsin pago probado\b.*\bfacturas?\b|\bfacturas?\b.*\bsin pago probado\b/.test(s), sinRep],
    ['debe', s => /\b(nos )?debe(n)?\b|\bdebemos\b|\badeud|\bpor cobrar\b|\bpor pagar\b|\bsaldo de\b|\bnos tiene que pagar\b/.test(s), debe],
    ['compras', s => /\bcompr|\bordenes? de compra\b|\bo ?c\b|\bpdh\b/.test(s), compras],
    ['servicios', s => /\bservicios?\b|\bexpedientes?\b|\be\d+\b|\bsolped\b|\ben que paso\b/.test(s), servicios],
    ['vence', s => /\bvence|\bvencen\b|\bcaduc|\bvigencias?\b|\bexpira/.test(s), vence],
    ['frentes', s => /\bfrentes?\b.*\b(mueve|muev|quiet|parad|movimiento|atorad)|\bsin movimiento\b|\bno se mueven?\b/.test(s), frentes],
    ['carga', s => /\bcarga\b|\bmas (trabajo|tareas|tarjetas|pendientes)\b|\bquien tiene mas\b|\bcuantas (tareas|tarjetas) tiene\b/.test(s), carga]
];

function misVencidas(q, s, ctx) {
    const ts = misAbiertas(ctx.tareas, ctx.yo).filter(t => infoVence(t, 7, 3, ctx.hoy).e === 'danger').sort((a, b) => String(a.Vence).localeCompare(String(b.Vence)));
    const liga = { texto: 'Abrir Mis tareas (vencidas)', ir: '#mis', filtroMis: 'vencidas' };
    if (!ts.length) return { texto: 'No tienes tarjetas vencidas.', liga };
    const p = id => (ctx.proyectos || []).find(x => Number(x.id) === Number(id));
    return { texto: `Tienes ${ts.length} ${plural(ts.length, 'tarjeta vencida', 'tarjetas vencidas')}${ts.length > TOPE_FILAS ? `; van las ${TOPE_FILAS} más viejas` : ''}:`,
        filas: ts.slice(0, TOPE_FILAS).map(t => { const d = -diasPara(t.Vence, ctx.hoy); const pr = p(t.ProyectoId); return { a: String(t.Title || ''), b: `venció hace ${d} ${plural(d, 'día')}${pr ? ' · ' + pr.Title : ''}` }; }), liga };
}

/** La contraparte (y la moneda) que nombra la pregunta, con interpretarFrase sobre las facturas del lado. */
function contraparteDe(q, d, lado) {
    const fs = facturasLado(d, lado), r = interpretarFrase(q, fs, lado), c = r.conds.find(x => x.p === 'cli');
    return { fs, r, nombres: c ? c.v : [], moneda: r.moneda };
}
function ladoDe(s) { return /\bdebemos\b|\bpor pagar\b|\bproveedor|\ble pagamos\b/.test(s) ? 'pagar' : 'cobrar'; }
function ligaDinero(d, lado, conds, moneda, pagina) {
    if (conFacturasRicas(d) && conds.length) return { texto: 'Abrir como segmento', segmento: { lado, join: 'Y', conds, moneda: moneda || null } };
    return { texto: 'Abrir', ir: `#finanzas/${lado}/${pagina}` };
}
function debe(q, s, ctx) {
    if (!PUEDE.capital(ctx.rol)) return { texto: SIN_PERMISO.dinero };
    const f = faltaJson(ctx.cobranza, 'cobranza.json'); if (f) return { texto: f };
    const d = ctx.cobranza.datos, lado = ladoDe(s);
    const { fs, nombres, moneda } = contraparteDe(q, d, lado);
    const corte = corteDe(d) ? ` (corte del ${fechaServicio(corteDe(d))})` : '';
    if (!nombres.length) {
        const sumas = porMoneda(fs.filter(x => !moneda || x.moneda === moneda));
        return { texto: lado === 'pagar' ? `Por pagar sin pago probado: ${unir(sumas) || '$0.00'}${corte}. Las monedas no se suman.` : `Por cobrar sin pago probado: ${unir(sumas) || 'US$0.00'}${corte}. Las monedas no se suman.`,
            liga: { texto: 'Abrir', ir: `#finanzas/${lado}/saldo` } };
    }
    const de = fs.filter(x => nombres.includes(x.nombre) && (!moneda || x.moneda === moneda));
    const ricas = conFacturasRicas(d), sinRep = sinRepDe(de, ricas).length;
    const nom = unir(nombres);
    if (!de.length) return { texto: `${nom} no tiene saldo sin pago probado${moneda ? ' en ' + moneda : ''}${corte}.`, liga: ligaDinero(d, lado, [{ p: 'cli', op: 'es uno de', v: nombres }], moneda, lado === 'pagar' ? 'proveedor' : 'cliente') };
    return { texto: `${lado === 'pagar' ? `A ${nom} le debemos` : `${nom} nos debe`} ${unir(porMoneda(de))} sin pago probado${corte}: ${de.length} ${plural(de.length, 'factura')}, ${sinRep} sin REP.`,
        filas: de.slice().sort((a, b) => b.saldo - a.saldo).slice(0, TOPE_FILAS).map(x => ({ a: `${x.id} · ${fechaServicio(String(x.fecha).slice(0, 10))}`, b: fmtMonto(x.saldo, x.moneda) })),
        liga: ligaDinero(d, lado, [{ p: 'cli', op: 'es uno de', v: nombres }], moneda || (de[0] && de[0].moneda), lado === 'pagar' ? 'proveedor' : 'cliente') };
}
function sinRep(q, s, ctx) {
    if (!PUEDE.capital(ctx.rol)) return { texto: SIN_PERMISO.dinero };
    const f = faltaJson(ctx.cobranza, 'cobranza.json'); if (f) return { texto: f };
    const d = ctx.cobranza.datos, lado = ladoDe(s), ricas = conFacturasRicas(d);
    const { fs, nombres, moneda } = contraparteDe(q, d, lado);
    const sin = sinRepDe(fs, ricas).filter(x => (!nombres.length || nombres.includes(x.nombre)) && (!moneda || x.moneda === moneda)).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const de = nombres.length ? `De ${unir(nombres)}, ` : '';
    const conds = [...(nombres.length ? [{ p: 'cli', op: 'es uno de', v: nombres }] : []), { p: 'est', op: 'es uno de', v: ['Sin REP'] }];
    const liga = ricas ? ligaDinero(d, lado, conds, moneda || (sin[0] && sin[0].moneda), 'sin-rep') : { texto: 'Abrir', ir: lado === 'cobrar' ? '#finanzas/cobrar/sin-rep' : '#finanzas/pagar/saldo' };
    if (!sin.length) return { texto: `${de ? de : ''}${de ? 'ninguna' : 'Ninguna'} factura con saldo está sin REP.`, liga };
    return { texto: `${de}${sin.length} ${plural(sin.length, 'factura no tiene', 'facturas no tienen')} complemento de pago (REP): ${unir(porMoneda(sin))}.${ricas ? '' : ' (Por el semáforo del conciliador: falta re-publicar para contar los REP de cada una.)'}`,
        filas: sin.slice(0, TOPE_FILAS).map(x => ({ a: `${x.id} · ${x.nombre}`, b: `${fmtMonto(x.saldo, x.moneda)} · ${fechaServicio(String(x.fecha).slice(0, 10))}` })), liga };
}
function compras(q, s, ctx) {
    if (!PUEDE.tarea(ctx.rol)) return { texto: SIN_PERMISO.operacion };
    const f = faltaJson(ctx.compras, 'compras.json'); if (f) return { texto: f };
    const os = ctx.compras.datos.ordenes || [];
    const provs = [...new Set(os.map(o => String(o.proveedor || '')).filter(Boolean))];
    const prov = provs.filter(p => norm(p).split(' ').some(w => { const k = w.replace(/[^a-z0-9]/g, ''); return k.length >= 3 && new RegExp('\\b' + k).test(s); }));
    const anio = (s.match(/\b20\d\d\b/) || [])[0] || null;
    const sel = os.filter(o => (!prov.length || prov.includes(String(o.proveedor || ''))) && (!anio || String(o.fecha || '').startsWith(anio))).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const quien = prov.length ? `A ${unir(prov)}` : 'En total', cuando = anio ? ` en ${anio}` : '';
    if (!sel.length) return { texto: `${quien}${cuando} no hay órdenes de compra.`, liga: { texto: 'Abrir Compras', ir: '#compras' } };
    const ult = sel[0];
    return { texto: `${quien}${cuando} ${prov.length ? 'le compramos' : 'se emitieron'} ${sel.length} ${plural(sel.length, 'orden', 'órdenes')} por ${unir(porMoneda(sel, 'total'))} con IVA. La más reciente, ${ult.folio} del ${fechaServicio(String(ult.fecha))}, por ${fmtMonto(ult.total, ult.moneda || 'MXN')}.`,
        filas: sel.slice(0, TOPE_FILAS).map(o => ({ a: `${o.folio} · ${fechaServicio(String(o.fecha))}`, b: fmtMonto(o.total, o.moneda || 'MXN') })), liga: { texto: 'Abrir Compras', ir: '#compras' } };
}
function servicios(q, s, ctx) {
    if (!PUEDE.tarea(ctx.rol)) return { texto: SIN_PERMISO.operacion };
    const f = faltaJson(ctx.servicios, 'servicios.json'); if (f) return { texto: f };
    const d = ctx.servicios.datos, pasos = d.pasos || [], lista = ordenarServicios(d.expedientes || []);
    const nombrePaso = n => pasos[n] && pasos[n].paso ? pasos[n].paso : `paso ${n}`;
    const estado = e => detenido(e) ? (e.bloqueado ? 'detenido' : 'un paso a medias') : e.paso === N_PASOS - 1 ? 'en cobro' : 'en curso';
    const uno = (s.match(/\be(\d+)\b/) || [])[1];
    if (uno) {
        const e = lista.find(x => x.clave === 'E' + uno);
        if (!e) return { texto: `No hay un expediente E${uno} en servicios.json.`, liga: { texto: 'Abrir Servicios', ir: '#servicios' } };
        return { texto: `${e.clave} (${e.tipo || ''} ${e.id || ''}) va en el paso ${e.paso} de ${N_PASOS - 1}: ${nombrePaso(e.paso)} — ${estado(e)}${e.espera_a ? `; espera a ${e.espera_a}` : ''}${e.desde ? ` desde el ${fechaServicio(e.desde)}` : ''}.`.replace(/\(\s+/, '(').replace(/\s+\)/, ')'),
            liga: { texto: `Abrir ${e.clave}`, ir: '#servicios/' + e.clave } };
    }
    if (!lista.length) return { texto: 'No hay expedientes abiertos en servicios.json.', liga: { texto: 'Abrir Servicios', ir: '#servicios' } };
    const det = lista.filter(detenido).length, cobro = lista.filter(e => e.paso === N_PASOS - 1).length;
    return { texto: `${lista.length} ${plural(lista.length, 'expediente abierto', 'expedientes abiertos')}: ${cobro} en cobro y ${det} ${plural(det, 'detenido')}.`,
        filas: lista.slice(0, TOPE_FILAS).map(e => ({ a: e.clave, b: `paso ${e.paso} · ${nombrePaso(e.paso)} (${estado(e)})` })), liga: { texto: 'Abrir el ciclo de 12 pasos', ir: '#servicios/ciclo' } };
}
function vence(q, s, ctx) {
    if (!PUEDE.capital(ctx.rol)) return { texto: SIN_PERMISO.vigencias };
    const f = faltaJson(ctx.vigencias, 'vigencias.json'); if (f) return { texto: f };
    const w = ventanaDias(s), vs = ordenarVigencias(ctx.vigencias.datos.vigencias || [], ctx.hoy);
    const prox = vs.filter(v => v.dias >= 0 && v.dias <= w.dias), venc = vs.filter(v => v.dias < 0);
    const lista = x => unir(x.slice(0, TOPE_FILAS).map(v => `${v.titulo} (${fechaVigencia(v.vence)})`));
    const texto = (prox.length ? `En ${w.texto} ${plural(prox.length, 'vence', 'vencen')} ${prox.length}: ${lista(prox)}.` : `Nada vence en ${w.texto}.`) + (venc.length ? ` Ya ${plural(venc.length, 'venció', 'vencieron')}: ${lista(venc)}.` : '');
    return { texto, filas: [...venc, ...prox].slice(0, TOPE_FILAS).map(v => ({ a: String(v.titulo), b: v.dias < 0 ? `venció el ${fechaVigencia(v.vence)}` : `${fechaVigencia(v.vence)} · faltan ${v.dias} ${plural(v.dias, 'día')}` })), liga: { texto: 'Abrir Vigencias', ir: '#vigencias' } };
}
function frentes(q, s, ctx) {
    const dias = ctx.sinMovimientoDias || 10, fq = frentesQuietos(ctx.proyectos, ctx.actividad, dias, ctx.hoy);
    const liga = { texto: 'Abrir Actividad 30 días', ir: '#reportes/actividad' };
    if (!fq.length) return { texto: `Todos los frentes activos tuvieron movimiento en los últimos ${dias} días.`, liga };
    return { texto: `${fq.length} ${plural(fq.length, 'frente activo lleva', 'frentes activos llevan')} ${dias} días o más sin movimiento en su bitácora:`,
        filas: fq.slice(0, TOPE_FILAS).map(x => ({ a: String(x.proyecto.Title || ''), b: x.dias === null ? 'sin movimiento en la bitácora leída' : `${x.dias} ${plural(x.dias, 'día')}` })), liga };
}
function carga(q, s, ctx) {
    const activos = new Set((ctx.proyectos || []).filter(p => p.Estado === 'activo').map(p => Number(p.id)));
    const ab = (ctx.tareas || []).filter(t => t.Columna !== HECHO && activos.has(Number(t.ProyectoId)));
    const filas = cargaPorPersona(ab, 7, ctx.hoy), conDueno = filas.filter(r => r.quien), sinDueno = filas.find(r => !r.quien);
    const liga = { texto: 'Abrir Carga por persona', ir: '#reportes/carga' };
    if (!conDueno.length) return { texto: 'Nadie tiene tarjetas abiertas en los frentes activos.', liga };
    const top = conDueno[0];
    return { texto: `${nombreDe(top.quien, ctx.roles)} tiene más carga: ${top.abiertas} ${plural(top.abiertas, 'abierta')}${top.vencidas ? `, ${top.vencidas} ${plural(top.vencidas, 'vencida')}` : ''}.${sinDueno ? ` Además hay ${sinDueno.abiertas} sin dueño.` : ''}`,
        filas: conDueno.slice(0, TOPE_FILAS).map(r => ({ a: nombreDe(r.quien, ctx.roles), b: `${r.abiertas} ${plural(r.abiertas, 'abierta')}${r.vencidas ? ` · ${r.vencidas} ${plural(r.vencidas, 'vencida')}` : ''}` })), liga };
}
