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

// --- contrato con el exportador (Python): la version y los campos que lee la app estan escritos alla
const py = readFileSync(join(raiz, '..', '..', '.claude', 'skills', 'conciliar-finanzas', 'scripts', 'exportar_cobranza.py'), 'utf8');
ok('exportador: misma VERSION', new RegExp(`^VERSION = ${VERSION_COBRANZA}$`, 'm').test(py));
ok('exportador: escribe cada campo que lee la app', ['facturado', 'pagado', 'duda_min', 'duda_max', 'cancelado', 'n_facturas', 'insoluto_min', 'insoluto_max', 'cancelada', 'generado', 'clientes', 'monedas', 'facturas'].every(c => py.includes(`"${c}"`)));
ok('exportador: los estados del conciliador son los de la app', ['OK', 'DUDA', 'SIN', 'PUE'].every(e => readFileSync(join(raiz, '..', '..', '.claude', 'skills', 'conciliar-finanzas', 'scripts', 'conciliar_finanzas.py'), 'utf8').includes(`"${e}"`)));

console.log(`cobranza.test.js: ${n} aserciones OK`);
