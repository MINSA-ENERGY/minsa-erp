// node test/servicios.test.js — reglas puras de Servicios (v0.168.0) y el contrato con servicios.py.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { problemaServicios, estadosPasos, ordenarServicios, resumenServicios, fechaCorta, N_PASOS } from '../servicios-reglas.js';

let n = 0;
const ok = (nombre, cond) => { assert.ok(cond, nombre); n++; };
const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const raiz = join(app, '..', '..');

const PASOS = Array.from({ length: 12 }, (_, i) => ({ n: i, paso: `Paso ${i}`, quien: 'X' }));
const ex = (clave, paso, extra = {}) => ({ clave, tipo: 'OC', id: '1', titulo: 't', paso, paso_texto: 'p', bloqueado: false, rotos: [], espera_a: '', desde: '', ...extra });
const DATOS = { version: 1, generado: '2026-10-02T08:00:00', fuente: 'prueba', pasos: PASOS, expedientes: [ex('E2', 11), ex('E5', 1)] };

// --- validacion del contrato
ok('JSON valido: sin problema', problemaServicios(DATOS) === null);
ok('version distinta: lo dice', /versión 2/.test(problemaServicios({ ...DATOS, version: 2 })));
ok('sin expedientes: lo dice', /expedientes/.test(problemaServicios({ ...DATOS, expedientes: undefined })));
ok('pasos incompletos: lo dice', /12 pasos/.test(problemaServicios({ ...DATOS, pasos: PASOS.slice(1) })));
ok('sin fecha de corte: lo dice', /generado/.test(problemaServicios({ ...DATOS, generado: 'ayer' })));
ok('paso fuera de rango: lo dice', /E9/.test(problemaServicios({ ...DATOS, expedientes: [ex('E9', 12)] })));
ok('clave mal formada: lo dice', /incompleto/.test(problemaServicios({ ...DATOS, expedientes: [ex('X1', 3)] })));

// --- la barra de pasos
const b = estadosPasos(ex('E3', 3));
ok('12 segmentos', b.length === N_PASOS);
ok('antes del actual: hecho', b.slice(0, 3).every(x => x === 'hecho'));
ok('el actual', b[3] === 'actual');
ok('despues: pendiente', b.slice(4).every(x => x === 'pendiente'));
ok('bloqueado se dice en el paso actual', estadosPasos(ex('E4', 3, { bloqueado: true }))[3] === 'bloqueado');
ok('un paso pasado a medias es rebotado', estadosPasos(ex('E3', 6, { rotos: [{ paso: 4, txt: 'PDH-009 nunca se envió' }] }))[4] === 'rebotado');
ok('paso 0 actual: nada hecho', estadosPasos(ex('E6', 0)).filter(x => x === 'hecho').length === 0);

// --- orden y resumen
ok('el expediente mas nuevo arriba (E10 antes que E9)', ordenarServicios([ex('E9', 1), ex('E10', 1), ex('E2', 1)]).map(e => e.clave).join() === 'E10,E9,E2');
const r = resumenServicios([ex('E2', 11), ex('E3', 11, { rotos: [{ paso: 4 }] }), ex('E4', 3, { bloqueado: true }), ex('E5', 1)]);
ok('resumen: total', r.total === 4);
ok('resumen: en cobro', r.cobro === 2);
ok('resumen: detenidos (bloqueado o a medias)', r.detenidos === 2);
ok('fecha corta', fechaCorta('2026-09-23') === '23-sep' && fechaCorta('') === '—' && fechaCorta('ayer') === '—');

// --- el contrato REAL: lo que produce servicios.py hoy pasa la validacion de la app
const salida = execFileSync('python', [join(raiz, '.claude/skills/_compartido/scripts/servicios.py'), '--json'], { encoding: 'utf8' });
const real = JSON.parse(salida);
ok('servicios.py: su JSON pasa problemaServicios', problemaServicios(real) === null);
ok('servicios.py: trae al menos un expediente', real.expedientes.length > 0);
// Lo lee el equipo (ERP_Operacion), no solo gerencia: el JSON NO debe traer montos.
ok('servicios.py: sin montos (USD/MXN/$) en lo que publica', !/\bUSD\b|\bMXN\b|\$\s?\d/.test(salida));
ok('servicios.py: solo publica lo que se pinta (sin alcance ni último movimiento: traen asuntos de correo)', real.expedientes.every(e => !('alcance' in e) && !('ultimo_movimiento' in e)));
ok('servicios.py: «⏸ en pausa» sale como detenido aunque el paso no diga «bloqueado»', real.expedientes.filter(e => /^en pausa/i.test(e.espera_a)).every(e => e.bloqueado));

console.log(`servicios.test.js: ${n} aserciones OK`);
