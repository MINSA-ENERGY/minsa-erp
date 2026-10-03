// node test/vigencias.test.js — reglas puras de Vigencias (v0.166.0) y el contrato con vigencias.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { problemaVigencias, diasPara, chipFaltan, ordenarVigencias, resumenVigencias, fechaVigencia, VERSION_VIGENCIAS, VIG_ROJO, VIG_AMBAR, unidadesDe, filtrarVigencias, siguienteVigencia } from '../vigencias-reglas.js';

let n = 0;
const ok = (nombre, cond) => { assert.ok(cond, nombre); n++; };
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const vg = (vence, titulo, extra = {}) => ({ unidad: 'Grupo', vence, titulo, responsable: '', nota: '', archivo: 'x.md', linea: 1, ...extra });
const DATOS = { version: 1, generado: '2026-10-02T08:00:00', fuente: 'prueba', vigencias: [vg('2027-01-17', 'ISO'), vg('2026-09-18', 'Achilles')] };
const HOY = new Date(2026, 9, 2, 15, 30);   // 2-oct-2026, hora local cualquiera

// --- validacion del contrato
ok('JSON valido: sin problema', problemaVigencias(DATOS) === null);
ok('version distinta: lo dice', /versión 2/.test(problemaVigencias({ ...DATOS, version: 2 })));
ok('sin lista: lo dice', /vigencias/.test(problemaVigencias({ version: 1, generado: DATOS.generado })));
ok('sin fecha de corte: lo dice', /generado/.test(problemaVigencias({ ...DATOS, generado: 'ayer' })));
ok('vigencia sin fecha valida: la nombra', /Rota/.test(problemaVigencias({ ...DATOS, vigencias: [vg('ene-2027', 'Rota')] })));
ok('vigencia sin titulo: lo dice', !!problemaVigencias({ ...DATOS, vigencias: [vg('2027-01-01', '')] }));
ok('no objeto: lo dice', !!problemaVigencias(null));

// --- dias (de calendario, no de instante: la hora de hoy no mueve la cuenta)
ok('dias: 17-ene-2027 desde 2-oct-2026 = 107 (la maqueta)', diasPara('2027-01-17', HOY) === 107);
ok('dias: mismo dia = 0 aunque sean las 23:59', diasPara('2026-10-02', new Date(2026, 9, 2, 23, 59)) === 0);
ok('dias: vencida = negativo', diasPara('2026-09-18', HOY) === -14);
ok('dias: cruza el cambio de horario sin perder un dia', diasPara('2026-11-05', new Date(2026, 9, 20)) === 16);

// --- semaforo
ok('chip: vencida es rojo y dice hace cuanto', chipFaltan(-14).clase === 'danger' && chipFaltan(-14).texto === 'vencida hace 14 días');
ok('chip: hoy', chipFaltan(0).texto === 'vence hoy' && chipFaltan(0).clase === 'danger');
ok('chip: singular', chipFaltan(1).texto === '1 día' && chipFaltan(-1).texto === 'vencida hace 1 día');
ok(`chip: hasta ${VIG_ROJO} rojo, hasta ${VIG_AMBAR} ambar, despues verde`, chipFaltan(VIG_ROJO).clase === 'danger' && chipFaltan(VIG_ROJO + 1).clase === 'warn' && chipFaltan(VIG_AMBAR).clase === 'warn' && chipFaltan(VIG_AMBAR + 1).clase === 'ok');

// --- orden y resumen
const o = ordenarVigencias([vg('2027-01-17', 'ISO'), vg('2026-10-10', 'Fianza'), vg('2026-09-18', 'Achilles'), vg('2026-11-20', 'Registro')], HOY);
ok('orden: la vencida arriba, luego la mas proxima', o.map(x => x.titulo).join(',') === 'Achilles,Fianza,Registro,ISO');
ok('orden: trae los dias calculados', o[0].dias === -14 && o[1].dias === 8);
const r = resumenVigencias(o);
ok('resumen: 1 vencida, 1 en rojo (8 d), 1 en ambar (49 d), 4 en total', r.vencidas === 1 && r.rojo === 1 && r.ambar === 1 && r.total === 4);
// v1.0.0 (cubeta 6, fidelidad #12): la forma única de la app, «17 ene 2027» (antes «17-ene-2027»)
ok('fecha legible sin zona horaria', fechaVigencia('2027-01-17') === '17 ene 2027' && fechaVigencia('2026-12-01') === '1 dic 2026');
// --- v1.0.0 (cubeta 3): el desplegable de unidad y «la siguiente»
const u = [vg('2027-01-17', 'ISO'), vg('2026-10-10', 'Fianza', { unidad: 'CALYTEK' }), vg('2026-09-18', 'Sin unidad', { unidad: '' })];
ok('unidadesDe: sin repetir, en orden, «—» la que no trae', unidadesDe(u).join() === 'CALYTEK,Grupo,—' || unidadesDe(u).join() === '—,CALYTEK,Grupo');
ok('filtrarVigencias: por unidad, o todas', filtrarVigencias(u, 'CALYTEK').map(x => x.titulo).join() === 'Fianza' && filtrarVigencias(u, '—').length === 1 && filtrarVigencias(u, null).length === 3);
ok('siguienteVigencia: la más próxima que no ha vencido', siguienteVigencia(ordenarVigencias(u, HOY)).titulo === 'Fianza' && siguienteVigencia(ordenarVigencias([vg('2026-09-18', 'X')], HOY)) === null);

// --- contrato con el cosechador (Python): misma version y los campos que lee la app
const py = readFileSync(join(raiz, '..', '..', '.claude', 'skills', '_compartido', 'scripts', 'vigencias.py'), 'utf8');
ok('cosechador: misma VERSION', new RegExp(`^VERSION = ${VERSION_VIGENCIAS}$`, 'm').test(py));
ok('cosechador: escribe cada campo que lee la app', ['version', 'generado', 'vigencias', 'unidad', 'vence', 'titulo', 'responsable', 'nota'].every(c => py.includes(`"${c}"`)));
// --- la gramatica documentada en la plantilla es la que casa el cosechador
const plantilla = readFileSync(join(raiz, '..', '..', 'minsa-energy', '_plantilla-unidad.md'), 'utf8');
ok('plantilla: documenta el marcador 📅 VIGENCIA', /^> 📅 \*\*VIGENCIA\*\* · \w+ · vence: \d{4}-\d{2}-\d{2} · título: /m.test(plantilla));

// v1.0.0 (vuelta 1, revisión UI/UX «media»): el KPI de Inicio «vencidas o a ≤ 30 días» tiene SU cifra en la página de Vigencias (antes la
// página solo cortaba a 15 y a 60 días: el 2 de Inicio no estaba en ningún lado al llegar)
{
    const { VIG_ATENCION } = await import('../vigencias-reglas.js');
    const { kpisInicio } = await import('../inicio-reglas.js');
    const vs = [vg('2026-09-18', 'vencida'), vg('2026-10-20', 'en 18 días'), vg('2026-10-31', 'en 29 días'), vg('2026-11-20', 'en 49 días'), vg('2027-03-01', 'lejos')];
    const r = resumenVigencias(ordenarVigencias(vs, HOY));
    const k = kpisInicio({ rol: 'gerencia', hoy: HOY, hoyDia: '2026-10-02', abiertas: 0, cobranza: { datos: null }, servicios: { datos: null }, compras: { datos: null }, vigencias: { datos: { ...DATOS, vigencias: vs }, error: null } }).find(x => x.clave === 'vigencias');
    ok('resumenVigencias.atencion = vencidas + las que vencen en VIG_ATENCION (30) días o menos, la MISMA cifra que el KPI de Inicio', VIG_ATENCION === 30 && r.atencion === 3 && !!k && k.valor === String(r.atencion));
}
console.log(`vigencias.test.js: ${n} aserciones OK`);
