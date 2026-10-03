// node test/servicios.test.js — reglas puras de Servicios (v0.168.0) y el contrato con servicios.py.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { problemaServicios, estadosPasos, ordenarServicios, resumenServicios, fechaCorta, N_PASOS, detenido, filtrarServicios, FILTROS_SERVICIOS,
    diasDesdeFecha, esperaMasLarga, expedientesPorPaso, TEXTO_PASO } from '../servicios-reglas.js';

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
// v1.0.0 (cubeta 6, fidelidad #12): la forma única de la app, «23 sep 2026» (antes «23-sep»)
ok('fecha corta', fechaCorta('2026-09-23') === '23 sep 2026' && fechaCorta('') === '—' && fechaCorta('ayer') === '—');

// --- v1.0.0 (cubeta 3): la plantilla de reporte — filtro, espera más larga y «Ciclo»
const L4 = [ex('E2', 11), ex('E3', 6, { rotos: [{ paso: 4, txt: 'x' }], desde: '2026-09-23' }), ex('E4', 3, { bloqueado: true, desde: '2026-09-01' }), ex('E5', 1, { desde: '2026-09-30' })];
ok('detenido: bloqueado o con un paso a medias', detenido(L4[1]) && detenido(L4[2]) && !detenido(L4[0]) && !detenido(L4[3]));
ok('filtrarServicios: detenidos · en cobro · en curso · todos', filtrarServicios(L4, 'detenidos').map(e => e.clave).join() === 'E3,E4' && filtrarServicios(L4, 'cobro').map(e => e.clave).join() === 'E2'
    && filtrarServicios(L4, 'curso').map(e => e.clave).join() === 'E5' && filtrarServicios(L4, 'todos').length === 4 && FILTROS_SERVICIOS.length === 4);
ok('diasDesdeFecha: de calendario, null sin fecha', diasDesdeFecha('2026-09-23', '2026-10-02') === 9 && diasDesdeFecha('', '2026-10-02') === null);
ok('esperaMasLarga: el de la fecha más vieja; null si ninguno trae fecha', JSON.stringify(esperaMasLarga(L4, '2026-10-02')) === JSON.stringify({ clave: 'E4', dias: 31 }) && esperaMasLarga([ex('E2', 1)], '2026-10-02') === null);
const ciclo = expedientesPorPaso(L4, PASOS);
ok('expedientesPorPaso: los 12 pasos, cada expediente en el suyo, con sus detenidos', ciclo.length === 12 && ciclo[11].exps.map(e => e.clave).join() === 'E2' && ciclo[3].detenidos === 1 && ciclo[0].exps.length === 0 && ciclo.reduce((s, p) => s + p.exps.length, 0) === 4);
ok('TEXTO_PASO: un texto por estado de la barra', ['hecho', 'actual', 'bloqueado', 'rebotado', 'pendiente'].every(k => TEXTO_PASO[k]));

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
