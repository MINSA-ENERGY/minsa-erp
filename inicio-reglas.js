// MINSA ERP v1.0.0 — INICIO, reglas puras (rediseño 2026-10-02, cubeta 4; plan cerebro/docs/plan-erp-rediseno-2026-10-02.md, «Contenido por
// módulo › Inicio»; maqueta maqueta-reportes.html, V.ini: la fila de KPIs y «Requiere atención» con etiqueta + ABRIR).
//   · kpisInicio: la fila de KPIs POR ROL — gerencia: por cobrar sin pago probado (USD) · tareas abiertas · servicios en curso · vigencias
//     vencidas o a ≤ 30 días · O.C. del mes; colaborador: los de los módulos que ve (tareas, servicios, O.C.); lectura: tareas. Cada KPI
//     lleva la ruta de su reporte y, si sale de un JSON publicado, su corte; sin el JSON dice «sin datos» y no rompe Inicio.
//   · atencionDeOperacion: los renglones de «Requiere atención» que salen de los JSON y de la bitácora (lo de las tarjetas —vencidas, hoy,
//     sin dueño, nuevo para ti, menciones— lo arma la cola de siempre en app.js): vigencias ≤ 30 días (gerencia), servicios detenidos y en
//     cobro (gerencia y colaborador; sin montos), O.C. con una partida que no cuadra (gerencia y colaborador), la cobranza sin REP de mayor
//     saldo (gerencia) y los frentes sin movimiento (gerencia).
// Sin DOM: lo prueba test/inicio.test.js. Los JSON llegan tal cual los dejan servicios.js / compras.js / vigencias.js / cobranza.js en su
// estado: null = aún no leído · false = no hay biblioteca o archivo · objeto = el JSON válido (con `error` aparte: la lectura falló).

import { PUEDE, frentesQuietos, plural } from './reglas.js';
import { fmtCorto, fmtMonto, diaIso, diasEntre } from './reporte-reglas.js';
import { resumenServicios, detenido, N_PASOS } from './servicios-reglas.js';
import { ordenarVigencias, resumenVigencias, VIG_ATENCION } from './vigencias-reglas.js';
import { facturasDe, sinRepDe, conFacturasRicas, totalesCobranza } from './cobranza-reglas.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** La columna `.k` de la cola (día fuerte + mes tenue) de una fecha AAAA-MM-DD; sin fecha, «—». */
export const kDeFecha = iso => { const d = diaIso(iso); return d ? { a: String(Number(d.slice(8, 10))), b: MESES[Number(d.slice(5, 7)) - 1] } : { a: '—', b: '' }; };
/** El estado de un JSON para un KPI: 'datos' · 'leyendo' (null sin error) · 'sin datos' (false o error). */
const estadoDe = j => j && j.datos ? 'datos' : j && (j.error || j.datos === false) ? 'sin datos' : 'leyendo';
/** Días de vigencia que «requieren atención» (plan: «vigencias vencidas/≤ 30 d»). */
export const DIAS_VIGENCIA_ATENCION = VIG_ATENCION;   // v1.0.0 (vuelta 1): la define vigencias-reglas.js, la misma que corta la página de Vigencias

/**
 * La fila de KPIs de Inicio para `ctx.rol`. `ctx` = { rol, hoy (Date), hoyDia ('AAAA-MM-DD'), abiertas (n), cobranza, servicios, compras,
 * vigencias } — cada JSON como { datos, error }. Devuelve [{ clave, valor, texto, ir, corte, estado, clase, titulo }] en el orden del plan.
 */
export function kpisInicio(ctx) {
    const rol = ctx.rol, g = PUEDE.capital(rol), t = PUEDE.tarea(rol), hoyDia = ctx.hoyDia;
    const out = [];
    const base = (clave, texto, ir, j) => { const e = estadoDe(j); return { clave, texto, ir, estado: e, corte: e === 'datos' ? diaIso(j.datos.generado) : null, valor: e === 'datos' ? null : e === 'leyendo' ? '…' : '—', clase: '' }; };
    if (g) {
        const k = base('cobrar', 'Por cobrar sin pago probado (USD)', '#finanzas/cobrar/saldo', ctx.cobranza);
        if (k.estado === 'datos') {
            const cl = Array.isArray(ctx.cobranza.datos.clientes) ? ctx.cobranza.datos.clientes : [];
            const u = totalesCobranza(cl).find(z => z.moneda === 'USD');
            k.valor = fmtCorto(u ? u.insoluto : 0, 'USD'); k.titulo = fmtMonto(u ? u.insoluto : 0, 'USD') + ' sin complemento de pago que lo respalde';
        }
        out.push(k);
    }
    out.push({ clave: 'abiertas', texto: 'Tareas abiertas', ir: '#reportes/avance', estado: 'datos', corte: null, valor: String(ctx.abiertas || 0), clase: '' });
    if (t) {
        const k = base('servicios', 'Servicios en curso', '#servicios', ctx.servicios);
        if (k.estado === 'datos') {
            const r = resumenServicios(ctx.servicios.datos.expedientes || []);
            k.valor = String(r.total); k.titulo = `${r.total} ${plural(r.total, 'expediente')} de LATINA: ${r.cobro} en cobro, ${r.detenidos} ${plural(r.detenidos, 'detenido')}`;
            if (r.detenidos) { k.texto = `Servicios en curso · ${r.detenidos} ${plural(r.detenidos, 'detenido')}`; }
        }
        out.push(k);
    }
    if (g) {
        const k = base('vigencias', `Vigencias vencidas o a ≤ ${DIAS_VIGENCIA_ATENCION} días`, '#vigencias', ctx.vigencias);
        if (k.estado === 'datos') {
            const vs = ordenarVigencias(ctx.vigencias.datos.vigencias || [], ctx.hoy);
            const r = resumenVigencias(vs), venc = r.vencidas, prox = r.atencion - r.vencidas;   // v1.0.0 (vuelta 1): la cifra de la página de Vigencias
            k.valor = String(r.atencion); k.clase = venc ? 'neg' : '';
            k.titulo = `${venc} ${plural(venc, 'vencida')} y ${prox} que ${plural(prox, 'vence', 'vencen')} en ${DIAS_VIGENCIA_ATENCION} días o menos`;
        }
        out.push(k);
    }
    if (t) {
        const k = base('oc', 'O.C. del mes', '#compras', ctx.compras);
        if (k.estado === 'datos') {
            const mes = String(hoyDia || '').slice(0, 7);
            const del = (ctx.compras.datos.ordenes || []).filter(o => String(o.fecha || '').startsWith(mes));
            const porM = {}; for (const o of del) porM[o.moneda || 'MXN'] = (porM[o.moneda || 'MXN'] || 0) + (Number(o.total) || 0);
            k.valor = String(del.length);
            k.titulo = del.length ? `${del.length} ${plural(del.length, 'orden', 'órdenes')} este mes: ${Object.entries(porM).map(([m, v]) => fmtMonto(v, m)).join(' · ')} (las monedas no se suman)` : 'Ninguna orden de compra emitida este mes';
        }
        out.push(k);
    }
    return out;
}

/**
 * Los renglones de «Requiere atención» que no son tarjetas, por grupo, según el rol. `ctx` = { rol, hoy, hoyDia, proyectos (todos),
 * actividad, sinMovimientoDias, cobranza, servicios, compras, vigencias }. Cada renglón: { grupo, etiqueta, cls, titulo, sub, ir, k }.
 * Devuelve { vigencias, detenidos, cobro, noCuadra, frentes } (listas; vacías si el rol no lo ve o no hay datos).
 */
export function atencionDeOperacion(ctx) {
    const rol = ctx.rol, g = PUEDE.capital(rol), t = PUEDE.tarea(rol);
    const r = { vigencias: [], detenidos: [], cobro: [], noCuadra: [], frentes: [] };
    if (g && ctx.vigencias && ctx.vigencias.datos) {
        for (const v of ordenarVigencias(ctx.vigencias.datos.vigencias || [], ctx.hoy)) {
            if (v.dias > DIAS_VIGENCIA_ATENCION) continue;
            const n = Math.abs(v.dias), u = plural(n, 'día');
            r.vigencias.push({ grupo: 'vigencias', etiqueta: v.dias < 0 ? 'vencida' : 'vence', cls: v.dias < 0 || v.dias <= 15 ? 'danger' : 'warn', titulo: String(v.titulo),
                sub: [v.dias < 0 ? `venció hace ${n} ${u}` : v.dias === 0 ? 'vence hoy' : `faltan ${n} ${u}`, v.unidad].filter(Boolean).join(' · '), ir: '#vigencias', k: kDeFecha(v.vence) });
        }
    }
    if (t && ctx.servicios && ctx.servicios.datos) {
        const lista = (ctx.servicios.datos.expedientes || []).slice().sort((a, b) => (Number(String(b.clave).slice(1)) || 0) - (Number(String(a.clave).slice(1)) || 0));
        const pasos = ctx.servicios.datos.pasos || [];
        for (const e of lista) {
            const nombre = `${e.clave} · ${e.tipo || ''} ${e.id || ''}`.replace(/\s+/g, ' ').trim();
            const paso = pasos[e.paso] && pasos[e.paso].paso ? `paso ${e.paso}: ${pasos[e.paso].paso}` : `paso ${e.paso}`;
            if (detenido(e)) {
                const roto = (e.rotos || [])[0];
                r.detenidos.push({ grupo: 'detenidos', etiqueta: e.bloqueado ? 'bloqueado' : 'a medias', cls: e.bloqueado ? 'danger' : 'warn', titulo: nombre,   /* v1.0.0 (cubeta 6, fidelidad #6): a medias = ámbar, como su segmento */
                    sub: e.bloqueado ? [paso, e.espera_a ? `espera a ${e.espera_a}` : ''].filter(Boolean).join(' · ') : `${roto && roto.txt ? roto.txt : 'un paso pasado quedó a medias'} · ${paso}`,
                    ir: '#servicios/' + e.clave, k: kDeFecha(e.desde) });
            } else if (e.paso === N_PASOS - 1) {
                r.cobro.push({ grupo: 'cobro', etiqueta: 'cobro', cls: 'info', titulo: nombre, sub: [paso, e.espera_a ? `espera a ${e.espera_a}` : ''].filter(Boolean).join(' · '),
                    ir: '#servicios/' + e.clave, k: kDeFecha(e.desde) });
            }
        }
    }
    if (g && ctx.cobranza && ctx.cobranza.datos && Array.isArray(ctx.cobranza.datos.clientes)) {
        // la contraparte con más saldo SIN REP (maqueta: «CPL Servicios: US$335,949.92 sin complemento de pago»), en dólares primero
        const d = ctx.cobranza.datos, corte = diaIso(d.generado) || ctx.hoyDia, ricas = conFacturasRicas(d);
        for (const m of ['USD', 'MXN']) {
            const sin = sinRepDe(facturasDe(d.clientes, m), ricas);
            if (!sin.length) continue;
            const por = new Map(); for (const f of sin) { const x = por.get(f.rfc) || { nombre: f.nombre, saldo: 0, n: 0, vieja: null }; x.saldo += f.saldo; x.n++; if (!x.vieja || String(f.fecha) < x.vieja) x.vieja = String(f.fecha).slice(0, 10); por.set(f.rfc, x); }
            const top = [...por.values()].sort((a, b) => b.saldo - a.saldo)[0];
            if (top.saldo <= 0.005) continue;
            const dias = top.vieja ? diasEntre(top.vieja, corte) : null;
            r.cobro.push({ grupo: 'cobro', etiqueta: 'cobranza', cls: 'info', titulo: `${top.nombre}: ${fmtMonto(top.saldo, m)} sin complemento de pago`,
                sub: `${top.n} ${plural(top.n, 'factura')} sin REP${dias !== null ? ` · la más antigua de ${dias} ${plural(dias, 'día')}` : ''}`, ir: '#finanzas/cobrar/sin-rep', k: kDeFecha(top.vieja) });
            break;
        }
    }
    if (t && ctx.compras && ctx.compras.datos) {
        for (const o of (ctx.compras.datos.ordenes || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))) {
            const n = (o.partidas || []).filter(p => p.cuadra === false).length; if (!n) continue;
            r.noCuadra.push({ grupo: 'no-cuadra', etiqueta: 'revisar', cls: 'warn', titulo: `${o.folio}${o.proveedor ? ' · ' + o.proveedor : ''}: ${n === 1 ? 'una partida no cuadra' : `${n} partidas no cuadran`}`,
                sub: 'cantidad × precio unitario ≠ importe en el .docx de la orden', ir: '#compras', k: kDeFecha(o.fecha) });
        }
    }
    if (g) {
        for (const x of frentesQuietos(ctx.proyectos, ctx.actividad, ctx.sinMovimientoDias || 10, ctx.hoy)) {
            r.frentes.push({ grupo: 'frentes', etiqueta: 'sin movimiento', cls: 'warn', titulo: String(x.proyecto.Title || ''), sub: x.dias === null ? 'sin movimiento en la bitácora leída' : `${x.dias} ${plural(x.dias, 'día')} sin movimiento en su bitácora`,
                ir: '#p/' + x.proyecto.Clave, k: { a: x.dias === null ? '—' : String(x.dias), b: x.dias === null ? '' : 'días' } });
        }
    }
    return r;
}
