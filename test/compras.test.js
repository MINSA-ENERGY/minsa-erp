// node test/compras.test.js — reglas puras de Compras (v0.169.0) y el contrato con compras.py.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { problemaCompras, ordenarCompras, resumenCompras, conceptoDe } from '../compras-reglas.js';

let n = 0;
const ok = (nombre, cond) => { assert.ok(cond, nombre); n++; };
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const part = (n, descripcion, total) => ({ n, descripcion, cantidad: 1, unidad: 'pza', pu: total, total });
const oc = (folio, fecha, total, extra = {}) => ({ folio, fecha, proveedor: 'PRODEOS', moneda: 'MXN', partidas: [part(1, 'Xileno', total / 1.16)], subtotal: total / 1.16, iva: total - total / 1.16, total, archivo: folio + '.docx', ...extra });
const DATOS = { version: 1, generado: '2026-10-02T08:00:00', fuente: 'prueba', ordenes: [oc('PDH-008', '2026-07-01', 100), oc('PDH-009', '2026-08-12', 200)] };

// --- validacion del contrato
ok('JSON valido: sin problema', problemaCompras(DATOS) === null);
ok('version distinta: lo dice', /versión 2/.test(problemaCompras({ ...DATOS, version: 2 })));
ok('sin ordenes: lo dice', /órdenes/.test(problemaCompras({ ...DATOS, ordenes: undefined })));
ok('sin fecha de corte: lo dice', /generado/.test(problemaCompras({ ...DATOS, generado: 'ayer' })));
ok('orden sin partidas: lo dice', /PDH-1/.test(problemaCompras({ ...DATOS, ordenes: [oc('PDH-1', '2026-01-01', 5, { partidas: [] })] })));
ok('folio mal formado: lo dice', /incompleta/.test(problemaCompras({ ...DATOS, ordenes: [oc('pdh9', '2026-01-01', 5)] })));

// --- orden y resumen
ok('la mas nueva primero; sin fecha al final', ordenarCompras([oc('PDH-003', '2026-01-30', 1), oc('PDH-009', '2026-08-12', 1), oc('X-1', '', 1)]).map(o => o.folio).join() === 'PDH-009,PDH-003,X-1');
const r = resumenCompras([oc('A-1', '2026-01-30', 100), oc('A-2', '2026-08-12', 50), oc('A-3', '2025-12-01', 999), oc('A-4', '2026-02-01', 7, { moneda: 'USD' })], new Date(2026, 9, 2));
ok('resumen: total de órdenes', r.total === 4);
ok('resumen: solo las del año en curso', r.delAnio === 3 && r.anio === '2026');
ok('resumen: por moneda, sin mezclar', r.porMoneda.MXN === 150 && r.porMoneda.USD === 7);
ok('concepto en una linea', conceptoDe({ partidas: [part(1, 'A', 1), part(2, 'B', 1)] }) === 'A + B');

// --- el contrato REAL, si esta maquina tiene el OneDrive (la laptop de Carlos)
const carpeta = join(process.env.MINSA_TENANT_RAIZ || join(homedir(), 'OneDrive - MINSA ENERGY'), 'Quimicos-PITEPEC - Documentos', '03_Proveedor-PRODEOS_HOLDING', 'Orden de Compra');
if (existsSync(carpeta)) {
    const real = JSON.parse(execFileSync('python', [join(raiz, '.claude/skills/_compartido/scripts/compras.py'), '--json'], { encoding: 'utf8' }));
    ok('compras.py: su JSON pasa problemaCompras', problemaCompras(real) === null);
    ok('compras.py: trae órdenes y cada una cuadra (subtotal + IVA = total)', real.ordenes.length > 0 && real.ordenes.every(o => Math.abs(o.subtotal + o.iva - o.total) < 0.01));
} else console.log('  (sin OneDrive en esta máquina: el contrato real con compras.py no se corrió)');

console.log(`compras.test.js: ${n} aserciones OK`);
