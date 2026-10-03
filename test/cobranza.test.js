// node test/cobranza.test.js — reglas puras de Finanzas > Cobranza (v0.165.0) y el contrato con exportar_cobranza.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { problemaCobranza, totalesCobranza, renglonesCobranza, insolutoDe, diasDesde, chipEstado, monto, VERSION_COBRANZA, ESTADOS_FACTURA } from '../cobranza-reglas.js';

let n = 0;
const ok = (nombre, cond) => { assert.ok(cond, nombre); n++; };
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const m = (moneda, facturado, pagado, okv, duda_max, sin) => ({ moneda, facturado, pagado, ok: okv, duda_min: duda_max, duda_max, sin, n_facturas: 1 });
const f = (id, moneda, ins, estado = 'SIN', extra = {}) => ({ id, uuid: id, fecha: '2026-01-01', concepto: 'x', moneda, neto: ins, pagado: 0, insoluto_min: ins, insoluto_max: ins, estado, cancelada: false, ...extra });
const DATOS = {
    version: 1, generado: '2026-10-02T07:45:00', fuente: 'prueba',
    clientes: [
        { rfc: 'AAA', nombre: 'Latina', monedas: [m('USD', 1000, 400, 100, 0, 500), m('MXN', 300, 0, 0, 0, 300)], facturas: [f('F1', 'USD', 500), f('F2', 'USD', 100, 'OK'), f('F3', 'MXN', 300)] },
        { rfc: 'BBB', nombre: 'Lardac', monedas: [m('USD', 200, 50, 0, 150, 0)], facturas: [f('L1', 'USD', 150, 'DUDA')] },
        { rfc: 'CCC', nombre: 'Saldado', monedas: [m('MXN', 90, 90, 0, 0, 0)], facturas: [] }
    ]
};

// --- validacion del contrato
ok('JSON valido: sin problema', problemaCobranza(DATOS) === null);
ok('version distinta: lo dice', /versión 2/.test(problemaCobranza({ ...DATOS, version: 2 })));
ok('sin clientes: lo dice', /clientes/.test(problemaCobranza({ version: 1, generado: DATOS.generado })));
ok('sin fecha de corte: lo dice', /generado/.test(problemaCobranza({ ...DATOS, generado: 'ayer' })));
ok('cliente incompleto: lo nombra', /Roto/.test(problemaCobranza({ ...DATOS, clientes: [{ rfc: 'X', nombre: 'Roto', monedas: [] }] })));
ok('no objeto: lo dice', !!problemaCobranza(null));

// --- cuentas
ok('insoluto = sana + verificacion (alto) + sin REP', insolutoDe(m('USD', 0, 0, 1, 2, 3)) === 6);
const t = totalesCobranza(DATOS.clientes);
ok('totales: una tarjeta por moneda, USD primero', t.map(x => x.moneda).join(',') === 'USD,MXN');
const usd = t[0], mxn = t[1];
ok('totales USD: insoluto 750 (600 Latina + 150 Lardac), nunca mezclado con MXN', usd.insoluto === 750 && usd.sin === 500 && usd.duda === 150 && usd.ok === 100);
ok('totales MXN: 300 y el saldado no suma clientes con saldo', mxn.insoluto === 300 && mxn.clientes === 1);
const r = renglonesCobranza(DATOS.clientes);
ok('renglones: sin el saldado, USD antes que MXN y el mayor primero', r.map(x => x.nombre + ':' + x.moneda).join(',') === 'Latina:USD,Lardac:USD,Latina:MXN');
ok('renglones: cada uno trae solo las facturas de SU moneda', r[0].facturas.map(x => x.id).join(',') === 'F1,F2' && r[2].facturas.map(x => x.id).join(',') === 'F3');
ok('renglones con saldo cero si se piden', renglonesCobranza(DATOS.clientes, true).length === 4);

// --- CFDI cancelado (no suma, va aparte) y saldo negativo (nota de credito mayor que la factura)
const C2 = [{ rfc: 'D', nombre: 'Cancelado', monedas: [{ ...m('MXN', 500, 0, 0, 0, 0), cancelado: 500 }], facturas: [f('K1', 'MXN', 500, 'SIN', { cancelada: true })] },
            { rfc: 'E', nombre: 'Negativo', monedas: [m('USD', -80, 0, 0, 0, -80)], facturas: [f('N1', 'USD', -80)] }];
const t2 = totalesCobranza(C2);
ok('cancelado: no suma al insoluto y se acumula aparte', t2.find(x => x.moneda === 'MXN').insoluto === 0 && t2.find(x => x.moneda === 'MXN').cancelado === 500);
ok('renglones: sale el cliente con solo CFDI cancelados y el de saldo NEGATIVO (anomalía a la vista)', renglonesCobranza(C2).map(x => x.rfc).sort().join(',') === 'D,E');

// --- frescura y chips
ok('dias desde el corte', diasDesde('2026-09-25T00:00:00', new Date('2026-10-02T12:00:00')) === 7);
ok('dias desde un corte futuro = 0', diasDesde('2026-10-05T00:00:00', new Date('2026-10-02T00:00:00')) === 0);
ok('chip: cancelado manda sobre el estado', chipEstado('OK', true).clase === 'danger' && /cancelado/.test(chipEstado('OK', true).texto));
ok('chip: los cuatro estados del conciliador', ESTADOS_FACTURA.every(e => chipEstado(e, false).texto));
ok('chip: SIN dice «sin REP», no «no pagado»', chipEstado('SIN', false).texto === 'sin REP');
ok('monto: dos decimales con separador de miles y moneda', monto(2610748.3, 'USD') === '2,610,748.30 USD' && monto(0) === '0.00');

// --- v1.0.0 (rediseño, cubeta 2): Dinero con la plantilla de reporte (revisión 2 del contrato)
{
    const R2 = await import('../cobranza-reglas.js');
    const { ANTIGUEDAD } = await import('../reporte-reglas.js');
    const fr = (id, fecha, ins, extra = {}) => f(id, extra.moneda || 'USD', ins, extra.estado || 'SIN', { fecha, total: ins, reps: 0, cadena: false, producto: 'Cajas de recorte', ...extra });
    const D2 = { version: 1, revision: 2, generado: '2026-10-05T08:00:00', clientes: [
        { rfc: 'CPD010101AAA', nombre: 'CPL Servicios de Perforacion', monedas: [m('USD', 1000, 200, 0, 0, 800)], facturas: [fr('C1', '2026-09-20', 300), fr('C2', '2025-08-01', 500, { reps: 1, estado: 'DUDA', producto: 'Supersacos (RME)' })] },
        { rfc: 'LAT', nombre: 'Constructora Demo', monedas: [m('USD', 400, 0, 0, 0, 400), m('MXN', 90, 0, 0, 0, 90)], facturas: [fr('L1', '2026-03-10', 400, { pagado: 50 }), fr('L2', '2026-01-10', 90, { moneda: 'MXN' }), fr('L3', '2026-02-01', 10, { cancelada: true })] },
        { rfc: 'TOS', nombre: 'TKC Demo', monedas: [m('USD', 70, 0, 0, 0, 70)], facturas: [fr('T1', '2024-01-01', 70)] }
    ], historial: [
        { semana: '2026-W40', fecha: '2026-09-28', cobrar: { USD: { saldo: 1000 } }, rfc: { cobrar: { TOS: { USD: 60 } } } },
        { semana: '2026-W41', fecha: '2026-10-05', cobrar: { USD: { saldo: 1270 }, MXN: { saldo: 90 } }, rfc: { cobrar: { TOS: { USD: 70 } } } }
    ] };
    ok('revisión: 2 la trae; ausente = 1 (archivo de antes) y entonces faltan las facturas ricas', R2.revisionDe(D2) === 2 && R2.conFacturasRicas(D2) && R2.revisionDe(DATOS) === 1 && !R2.conFacturasRicas(DATOS));
    ok('historial: lista si viene; null si no', R2.historialDe(D2).length === 2 && R2.historialDe(DATOS) === null && R2.historialDe({ historial: 'x' }) === null);
    ok('corte: el día del archivo; el texto de «falta re-publicar» nombra el script', R2.corteDe(D2) === '2026-10-05' && /publicar-cobranza\.ps1/.test(R2.FALTA_REPUBLICAR));
    ok('monedas con saldo: USD primero', R2.monedasDe(D2.clientes).join() === 'USD,MXN');
    const aparte = { TOS: 'línea sin explicar' };
    const fs = R2.facturasDe(D2.clientes, 'USD', aparte);
    ok('facturasDe: de UNA moneda, sin canceladas ni lo aparte, con saldo, contraparte, abiertas y % pagado', fs.map(x => x.id).join() === 'C1,C2,L1' && fs[0].saldo === 300 && fs[0].nab === 2 && fs[0].pct === 20 && fs[2].nombre === 'Constructora Demo');
    ok('facturasDe con soloAparte: solo lo que va aparte', R2.facturasDe(D2.clientes, 'USD', aparte, true).map(x => x.id).join() === 'T1');
    const ant = R2.antiguedadPorContraparte(D2.clientes, 'USD', '2026-10-05', aparte);
    ok('antigüedad por contraparte: cubetas e importes al corte, la mayor primero, total que cuadra', ant.filas.map(x => x.rfc).join() === 'CPD010101AAA,LAT'
        && ant.filas[0].cubetas.join() === '300,0,0,500' && ant.filas[0].n.join() === '1,0,0,1' && ant.filas[1].cubetas[2] === 400 && ant.total.saldo === 1200 && ant.total.n.join() === '1,0,1,1' && ant.total.facturado === 1400);
    const se = R2.serieSaldoEmision(fs, '2026-10-05');
    ok('serie por emisión: acumulada desde la factura más vieja hasta el mes del corte', se[0].k === '2025-08' && se[se.length - 1].k === '2026-10' && se[se.length - 1].v === 1200 && se.find(p => p.k === '2026-03').inc === 400);
    const sh = R2.serieHistorial(D2.historial, 'cobrar', 'USD', ['TOS']);
    ok('serie del historial: un punto por corte y lo aparte se RESTA (1000−60, 1270−70)', sh.map(p => `${p.k}:${p.v}`).join() === '2026-09-28:940,2026-10-05:1200');
    ok('serie del historial: una semana sin esa moneda vale 0', R2.serieHistorial(D2.historial, 'cobrar', 'MXN').map(p => p.v).join() === '0,90');
    const em = R2.emitidoPorMes(fs);
    ok('emitido por mes: el más reciente primero, con importe, saldo y cuántas', em[0].k === '2026-09' && em[0].n === 1 && em[0].saldo === 300 && em.length === 3);
    ok('sin REP: con la revisión 2 manda `reps` (C2 tiene un REP); con la de antes, el estado SIN', R2.sinRepDe(fs, true).map(x => x.id).join() === 'C1,L1' && R2.sinRepDe(fs, false).map(x => x.id).join() === 'C1,L1');
    const P = R2.propsDinero('cobrar'), ctx = { corte: '2026-10-05' };
    const val = k => P.find(p => p.k === k).get(fs[1], ctx);
    ok('propiedades: 15, en los 3 niveles, y leen la factura plana', P.length === 15 && ['cont', 'fact', 'prod'].every(n => P.some(p => p.n === n)) && val('cli') === 'CPL Servicios de Perforacion' && val('ant') === ANTIGUEDAD[3]
        && val('est') === 'En verificación' && val('reps') === 1 && val('lin') === 'Supersacos (RME)' && val('anio') === '2025' && P.find(p => p.k === 'parc').get(fs[2], ctx) === 'Sí');
    ok('propiedades de Por pagar: «Proveedor»', R2.propsDinero('pagar')[0].l === 'Proveedor');
    ok('valores de una lista: los de las facturas (años del más nuevo) o los fijos', R2.valoresDe(P.find(p => p.k === 'anio'), fs, ctx).join() === '2026,2025' && R2.valoresDe(P.find(p => p.k === 'ant'), fs, ctx).length === 4);
    // el intérprete de «armar con frase» (sin IA)
    const todas = [...R2.facturasDe(D2.clientes, 'USD'), ...R2.facturasDe(D2.clientes, 'MXN')];
    const i1 = R2.interpretarFrase('facturas de CPL sin REP de más de 180 días', todas);
    ok('frase: «facturas de CPL sin REP de más de 180 días» → cliente, evidencia y antigüedad (y los días NO son dinero)', JSON.stringify(i1.conds) === JSON.stringify([
        { p: 'cli', op: 'es uno de', v: ['CPL Servicios de Perforacion'] }, { p: 'ant', op: 'es uno de', v: [ANTIGUEDAD[2], ANTIGUEDAD[3]] }, { p: 'est', op: 'es uno de', v: ['Sin REP'] }]), JSON.stringify(i1.conds));
    const i2 = R2.interpretarFrase('lo de Demo en dólares de más de 100 mil con pago parcial', todas);
    ok('frase: moneda, monto («100 mil») y pago parcial', i2.moneda === 'USD' && i2.conds.some(c => c.p === 'ins' && c.op === 'es mayor que' && c.v === 100000) && i2.conds.some(c => c.p === 'parc' && c.v[0] === 'Sí') && i2.conds.some(c => c.p === 'cli' && c.v[0] === 'Constructora Demo'));
    const i3 = R2.interpretarFrase('emitidas desde 2025 de cajas en pesos', todas);
    ok('frase: «desde 2025», línea de producto por su palabra y pesos', i3.moneda === 'MXN' && i3.conds.some(c => c.p === 'fe' && c.v === '2025-01-01') && i3.conds.some(c => c.p === 'lin' && c.v.includes('Cajas de recorte')));
    ok('frase: «más de un año» y «en verificación»; «sin pago probado» no es «sin pago»', R2.interpretarFrase('en verificación de más de un año', todas).conds.map(c => c.p).join() === 'ant,est'
        && !R2.interpretarFrase('saldo sin pago probado', todas).conds.some(c => c.p === 'parc'));
    ok('frase que no se entiende: sin condiciones (la app lo dice)', R2.interpretarFrase('hola qué tal', todas).conds.length === 0);
}

// --- contrato con el exportador (Python): la version y los campos que lee la app estan escritos alla
const py = readFileSync(join(raiz, '..', '..', '.claude', 'skills', 'conciliar-finanzas', 'scripts', 'exportar_cobranza.py'), 'utf8');
ok('exportador: misma VERSION', new RegExp(`^VERSION = ${VERSION_COBRANZA}$`, 'm').test(py));
ok('exportador: escribe cada campo que lee la app', ['facturado', 'pagado', 'duda_min', 'duda_max', 'cancelado', 'n_facturas', 'insoluto_min', 'insoluto_max', 'cancelada', 'generado', 'clientes', 'monedas', 'facturas'].every(c => py.includes(`"${c}"`)));
ok('exportador: los estados del conciliador son los de la app', ['OK', 'DUDA', 'SIN', 'PUE'].every(e => readFileSync(join(raiz, '..', '..', '.claude', 'skills', 'conciliar-finanzas', 'scripts', 'conciliar_finanzas.py'), 'utf8').includes(`"${e}"`)));

console.log(`cobranza.test.js: ${n} aserciones OK`);
