// node test/inicio.test.js — reglas puras de Inicio (v1.0.0, rediseño cubeta 4): la fila de KPIs por rol y los renglones de
// «Requiere atención» que salen de los JSON publicados y de la bitácora.
import assert from 'node:assert/strict';
import { kpisInicio, atencionDeOperacion, kDeFecha, DIAS_VIGENCIA_ATENCION } from '../inicio-reglas.js';

let n = 0;
const ok = (nombre, cond) => { assert.ok(cond, nombre); n++; };

const HOY = new Date(2026, 9, 2, 12, 0), HOY_DIA = '2026-10-02';
const SERV = { datos: { version: 1, generado: '2026-10-01T08:00:00', pasos: Array.from({ length: 12 }, (_, i) => ({ paso: `Paso ${i}` })), expedientes: [
    { clave: 'E2', tipo: 'O.C.', id: '45', paso: 11, espera_a: 'Tesorería LATINA · reloj de 90 días', desde: '2026-07-08' },
    { clave: 'E4', tipo: 'SOLPED', id: '10', paso: 3, bloqueado: true, espera_a: 'LATINA, la O.C.', desde: '2026-09-23' },
    { clave: 'E3', tipo: 'O.C.', id: '46', paso: 6, rotos: [{ paso: 4, txt: 'PDH-009 nunca se envió' }] },
    { clave: 'E5', tipo: 'SOLPED', id: '11', paso: 1 }] }, error: null };
const COMP = { datos: { version: 1, generado: '2026-09-20T08:00:00', ordenes: [
    { folio: 'PDH-009', fecha: '2026-10-01', proveedor: 'PRODEOS', moneda: 'MXN', total: 1000, partidas: [{ cuadra: true }] },
    { folio: 'PDH-008', fecha: '2026-08-12', proveedor: 'PRODEOS', moneda: 'MXN', total: 500, partidas: [{ cuadra: true }, { cuadra: false }] },
    { folio: 'ABC-001', fecha: '2026-10-02', proveedor: 'Otro', moneda: 'USD', total: 70, partidas: [{ cuadra: true }] }] }, error: null };
const VIG = { datos: { version: 1, generado: '2026-10-01T08:00:00', vigencias: [
    { titulo: 'Achilles', vence: '2026-09-18', unidad: 'Grupo' }, { titulo: 'ISO', vence: '2026-10-20', unidad: 'Grupo' },
    { titulo: 'MANC', vence: '2027-02-12', unidad: 'Legal' }] }, error: null };
const fac = (id, moneda, saldo, extra = {}) => ({ id, uuid: id, fecha: '2026-03-01', moneda, insoluto_min: saldo, insoluto_max: saldo, estado: 'SIN', cancelada: false, reps: 0, ...extra });
const COB = { datos: { version: 1, revision: 2, generado: '2026-10-02T07:00:00', clientes: [
    { rfc: 'CPL', nombre: 'CPL Servicios', monedas: [{ moneda: 'USD', facturado: 400, pagado: 0, ok: 0, duda_max: 0, sin: 300 }], facturas: [fac('F1', 'USD', 200), fac('F2', 'USD', 100, { fecha: '2025-12-01' })] },
    { rfc: 'LAT', nombre: 'Latina', monedas: [{ moneda: 'USD', facturado: 100, pagado: 0, ok: 50, duda_max: 0, sin: 0 }], facturas: [fac('L1', 'USD', 50, { estado: 'OK', reps: 1 })] }] }, error: null };
const base = rol => ({ rol, hoy: HOY, hoyDia: HOY_DIA, abiertas: 7, cobranza: COB, servicios: SERV, compras: COMP, vigencias: VIG });

// --- la fila de KPIs por rol (plan: gerencia 5; colaborador y lectura, solo los de los módulos que ven)
{
    const g = kpisInicio(base('gerencia'));
    ok('gerencia: 5 KPIs en el orden del plan (cobrar · abiertas · servicios · vigencias · O.C. del mes)', g.map(k => k.clave).join() === 'cobrar,abiertas,servicios,vigencias,oc');
    ok('gerencia: por cobrar sin pago probado en USD (ok + duda + sin, sin sumar pesos) y su corte', g[0].valor === 'US$350' && g[0].corte === '2026-10-02' && g[0].ir === '#finanzas/cobrar/saldo');
    ok('tareas abiertas: el número que da Inicio, sin corte (no sale de un JSON), abre Avance', g[1].valor === '7' && g[1].corte === null && g[1].ir === '#reportes/avance');
    ok('servicios en curso: cuenta los expedientes y dice cuántos están detenidos', g[2].valor === '4' && /2 detenidos/.test(g[2].texto) && g[2].ir === '#servicios' && g[2].corte === '2026-10-01');
    ok(`vigencias: vencidas + las que vencen en ≤ ${DIAS_VIGENCIA_ATENCION} días, en rojo si hay vencidas`, g[3].valor === '2' && g[3].clase === 'neg' && /1 vencida y 1 que vence/.test(g[3].titulo));
    ok('O.C. del mes: las de este mes (2), con el total POR moneda en el title (nunca se suman)', g[4].valor === '2' && /\$1,000\.00 · US\$70\.00/.test(g[4].titulo) && g[4].ir === '#compras');
    const c = kpisInicio(base('colaborador')), l = kpisInicio(base('lectura'));
    ok('colaborador: solo tareas, servicios y O.C. (ni por cobrar ni vigencias)', c.map(k => k.clave).join() === 'abiertas,servicios,oc');
    ok('lectura: solo las tareas (Operación y Dinero no le traen nada)', l.map(k => k.clave).join() === 'abiertas');
}
// --- sin JSON: «sin datos» o «leyendo», sin romper
{
    const x = kpisInicio({ ...base('gerencia'), cobranza: { datos: false, error: null }, servicios: { datos: null, error: null }, compras: { datos: null, error: 'HTTP 500' }, vigencias: { datos: false, error: null } });
    ok('sin JSON: el KPI dice «sin datos» (falta o falló) o «leyendo» (aún no llega), con «—» / «…» y sin corte', x[0].estado === 'sin datos' && x[0].valor === '—' && x[2].estado === 'leyendo' && x[2].valor === '…' && x[4].estado === 'sin datos' && x.every(k => k.estado !== 'datos' || k.clave === 'abiertas') && x[0].corte === null);
}
// --- «Requiere atención» por rol
{
    const proyectos = [{ id: 1, Title: 'Frente quieto', Clave: 'quieto', Estado: 'activo' }, { id: 2, Title: 'Frente vivo', Clave: 'vivo', Estado: 'activo' }];
    const actividad = [{ ProyectoId: 1, Accion: 'comentar', Cuando: '2026-09-01T10:00:00Z' }, { ProyectoId: 2, Accion: 'comentar', Cuando: '2026-10-01T10:00:00Z' }];
    const ctx = rol => ({ ...base(rol), proyectos, actividad, sinMovimientoDias: 10 });
    const g = atencionDeOperacion(ctx('gerencia'));
    ok('vigencias: la vencida y la de ≤ 30 días (no la de febrero), con su etiqueta y su fecha en la columna', g.vigencias.map(v => v.titulo).join() === 'Achilles,ISO' && g.vigencias[0].etiqueta === 'vencida' && g.vigencias[0].cls === 'danger' && g.vigencias[0].k.a === '18' && g.vigencias[0].k.b === 'sep' && g.vigencias[1].etiqueta === 'vence' && /faltan 18 días/.test(g.vigencias[1].sub));
    ok('servicios detenidos: el bloqueado («bloqueado», espera a…) y el del paso a medias («a medias», su motivo), con liga a su expediente', g.detenidos.map(d => d.etiqueta).join() === 'bloqueado,a medias' && g.detenidos[0].ir === '#servicios/E4' && /espera a LATINA/.test(g.detenidos[0].sub) && /PDH-009 nunca se envió/.test(g.detenidos[1].sub));
    ok('v1.0.0 (cubeta 6, fidelidad #6): el bloqueado va en rojo y el de «a medias» en ámbar, como su segmento de la barra de 12 pasos', g.detenidos[0].cls === 'danger' && g.detenidos[1].cls === 'warn');
    ok('cobro: el expediente en cobro (paso 11) con su espera (el reloj) y, para gerencia, la contraparte con más saldo sin REP', g.cobro.length === 2 && g.cobro[0].ir === '#servicios/E2' && /reloj de 90 días/.test(g.cobro[0].sub) && g.cobro[1].etiqueta === 'cobranza' && /^CPL Servicios: US\$300\.00 sin complemento de pago$/.test(g.cobro[1].titulo) && /2 facturas sin REP · la más antigua de 305 días/.test(g.cobro[1].sub) && g.cobro[1].ir === '#finanzas/cobrar/sin-rep');
    ok('O.C. que no cuadra: solo la orden con una partida marcada, a Compras', g.noCuadra.length === 1 && /^PDH-008 · PRODEOS: una partida no cuadra$/.test(g.noCuadra[0].titulo) && g.noCuadra[0].ir === '#compras');
    ok('frentes sin movimiento (gerencia): el quieto con sus días, liga a su tablero; el vivo no', g.frentes.length === 1 && g.frentes[0].ir === '#p/quieto' && g.frentes[0].k.a === '31');
    const c = atencionDeOperacion(ctx('colaborador')), l = atencionDeOperacion(ctx('lectura'));
    ok('colaborador: servicios (detenidos y en cobro, sin montos) y O.C.; ni vigencias, ni cobranza, ni frentes', !c.vigencias.length && c.detenidos.length === 2 && c.cobro.length === 1 && c.cobro.every(x => x.etiqueta === 'cobro' && !/\$/.test(x.titulo + x.sub)) && c.noCuadra.length === 1 && !c.frentes.length);
    ok('lectura: nada de Operación ni de Dinero', Object.values(l).every(x => !x.length));
    const vacio = atencionDeOperacion({ ...ctx('gerencia'), cobranza: { datos: false }, servicios: { datos: null }, compras: { datos: false }, vigencias: { datos: null } });
    ok('sin JSON no hay renglones de Operación ni de Dinero (y no truena)', !vacio.vigencias.length && !vacio.detenidos.length && !vacio.cobro.length && !vacio.noCuadra.length && vacio.frentes.length === 1);
}
ok('kDeFecha: día y mes de una fecha; sin fecha, «—»', kDeFecha('2026-12-22').a === '22' && kDeFecha('2026-12-22').b === 'dic' && kDeFecha('').a === '—');

console.log(`inicio: ok (${n} comprobaciones)`);
