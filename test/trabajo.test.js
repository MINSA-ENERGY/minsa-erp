// node test/trabajo.test.js — reglas puras de los 5 reportes de Trabajo (v1.0.0, rediseño 2026-10-02, cubeta 3).
import assert from 'node:assert/strict';
import { creadaEl, existiaEl, hechaEl, avanceAl, abiertasAl, vencidasAl, primerMes, finDeMes, cortesMensuales, serieNivel, kpisNivel, pctAvanceAl,
    textoPuntos, flujoMensual, flujoEnDias, actividadPorDia, accionesEnVentana, actividadDesglose, diasVencida, REPORTES_TRABAJO, paginaReporte,
    MESES_TOPE, DIAS_KPI_TRABAJO } from '../trabajo-reglas.js';
import { recortar, agrupar } from '../reporte-reglas.js';
import { actividadPorPersona, cargaPorPersona, vencidasEn } from '../reglas.js';

let n = 0;
const ok = (nombre, cond) => { assert.ok(cond, nombre); n++; };
// Las fechas van a mediodía UTC (06:00 en México): el día de México es el mismo que el de la cadena.
const iso = d => d + 'T18:00:00Z';
const T = (id, creado, extra = {}) => ({ id, Title: 't' + id, ProyectoId: 1, Columna: 'por-hacer', _creado: creado ? iso(creado) : undefined, ...extra });
const tareas = [
    T(1, '2026-01-10'),
    T(2, '2026-01-20', { Columna: 'hecho', HechoEl: iso('2026-03-05') }),
    T(3, '2026-02-15', { Columna: 'en-curso', Vence: iso('2026-04-01') }),
    T(4, '2026-04-02', { Columna: 'hecho', HechoEl: iso('2026-09-30'), Vence: iso('2026-05-01') }),
    T(5, null, { Desde: iso('2026-06-10'), Vence: iso('2026-10-30') }),
    T(6, '2026-09-01', { Columna: 'hecho' })   // hecha sin HechoEl: cuenta hecha desde que nació
];
const HOY = '2026-10-02';

// --- fechas de vida de una tarjeta
ok('creadaEl: _creado; sin él, Desde; sin ninguna, null', creadaEl(tareas[0]) === '2026-01-10' && creadaEl(tareas[4]) === '2026-06-10' && creadaEl({}) === null);
ok('existiaEl: desde el día de creación (inclusive); sin fecha, siempre', existiaEl(tareas[0], '2026-01-10') && !existiaEl(tareas[0], '2026-01-09') && existiaEl({}, '2000-01-01'));
ok('hechaEl: solo las que HOY están en Hecho, desde su HechoEl', hechaEl(tareas[1], '2026-03-05') && !hechaEl(tareas[1], '2026-03-04') && !hechaEl(tareas[0], HOY));
ok('hechaEl: una hecha sin HechoEl cuenta hecha desde que nació', hechaEl(tareas[5], '2026-09-01') && !hechaEl(tareas[5], '2026-08-31'));

// --- la memoria de días por tarjeta (vida): una tarjeta editada EN SU LUGAR (aplicarVivo) no se queda con sus días viejos
{ const t = T(50, '2026-01-01'); const L = [t]; const antes = avanceAl(L, HOY).hechas; t.Columna = 'hecho'; t.HechoEl = iso('2026-02-01');
  ok('vida: si la tarjeta cambia en su lugar (se hizo), se recalcula', antes === 0 && avanceAl(L, HOY).hechas === 1 && !hechaEl(t, '2026-01-31') && hechaEl(t, '2026-02-01')); }
// --- niveles a una fecha
const a0 = avanceAl(tareas, HOY);
ok('avanceAl hoy: 6 tarjetas, 3 hechas, 3 abiertas, 50%', a0.total === 6 && a0.hechas === 3 && a0.abiertas === 3 && a0.pct === 50);
const a1 = avanceAl(tareas, '2026-03-31');
ok('avanceAl al 31-mar: 3 existían, 1 hecha → 33.3%', a1.total === 3 && a1.hechas === 1 && a1.pct === 33.3);
ok('avanceAl sin tarjetas: 0 y 0%', avanceAl([], HOY).total === 0 && avanceAl([], HOY).pct === 0);
ok('abiertasAl: la del 30-sep cuenta la 4 abierta (se hizo ese día: ya no) y la del 29-sep sí', abiertasAl(tareas, '2026-09-30') === 3 && abiertasAl(tareas, '2026-09-29') === 4);
ok('vencidasAl hoy: la 3 (venció 1-abr) y nada más (la 4 ya está hecha, la 5 vence después)', vencidasAl(tareas, HOY) === 1);
ok('vencidasAl el 15-may: la 3 y la 4 (aún abierta con Vence 1-may)', vencidasAl(tareas, '2026-05-15') === 2);
ok('vencidasAl: vencer HOY no es estar vencida (el corte de estadoVence)', vencidasAl([T(9, '2026-01-01', { Vence: iso(HOY) })], HOY) === 0);
ok('vencidasAl de hoy = vencidasEn de reglas.js (el contador de siempre)', vencidasAl(tareas, HOY) === vencidasEn(tareas.map(t => ({ ...t })), new Date(HOY + 'T18:00:00Z')));

// --- meses
ok('primerMes: el de la tarjeta más vieja', primerMes(tareas, HOY) === '2026-01');
ok('primerMes: nunca más de MESES_TOPE atrás (una fecha tecleada mal)', primerMes([T(1, '1999-01-01')], HOY) === '2021-10' && MESES_TOPE === 60);
ok('primerMes: sin tarjetas, el de hoy', primerMes([], HOY) === '2026-10');
ok('finDeMes: febrero bisiesto y diciembre', finDeMes('2028-02') === '2028-02-29' && finDeMes('2026-12') === '2026-12-31');
const cortes = cortesMensuales('2026-08', HOY);
ok('cortesMensuales: fin de cada mes y HOY para el mes en curso', cortes.map(c => c.dia).join() === '2026-08-31,2026-09-30,2026-10-02');

// --- series y KPIs
const sp = serieNivel(tareas, HOY, pctAvanceAl);
ok('serieNivel: un punto por mes de enero a octubre, el último = hoy', sp.length === 10 && sp[0].k === '2026-01' && sp[9].k === '2026-10' && sp[9].v === 50);
ok('serieNivel: marzo ya trae la hecha del 5-mar (1 de 3), sin redondear (lo redondea quien pinta, una vez)', sp[2].v === 100 / 3 && sp[1].v === 0);
ok('serieNivel se recorta y se agrupa con las reglas de la plantilla (el nivel del trimestre = su último mes)', recortar(sp, '1a', HOY).length === 10 && agrupar(sp, 'trim').map(p => Math.round(p.v)).join() === '33,20,50,50');
ok('pctAvanceAl redondeado = el % de avanceGlobal (Math.round una sola vez: 1 de 8 = 12.5 → 13, como el anillo)', Math.round(pctAvanceAl([T(1, '2026-01-01', { Columna: 'hecho' }), ...[2, 3, 4, 5, 6, 7, 8].map(i => T(i, '2026-01-01'))], HOY)) === Math.round(100 / 8));
const k = kpisNivel(tareas, HOY, abiertasAl);
ok('kpisNivel: hoy y hace 30/60/180/365 días con su % de cambio', k.hoy === 3 && k.antes.length === 4 && k.antes.map(x => x.dias).join() === DIAS_KPI_TRABAJO.join() && k.antes[0].v === 4 && Math.round(k.antes[0].pct) === -25);
ok('kpisNivel: sin nada antes, el % es null (no hay contra qué)', kpisNivel(tareas, HOY, abiertasAl).antes[3].v === 0 && kpisNivel(tareas, HOY, abiertasAl).antes[3].pct === null);
ok('textoPuntos: «+5 pts», «−2.5 pts», «+1 pt», «sin cambio»', textoPuntos(5) === '+5 pts' && textoPuntos(-2.5) === '−2.5 pts' && textoPuntos(1) === '+1 pt' && textoPuntos(0) === 'sin cambio');

// --- flujos
const fm = flujoMensual(tareas, HOY);
const mes = k2 => fm.find(x => x.k === k2);
ok('flujoMensual: un punto por mes sin huecos', fm.length === 10 && fm[0].k === '2026-01');
ok('flujoMensual: nuevas por mes de creación y hechas por mes de HechoEl (la hecha sin HechoEl no cuenta como hecha de ningún mes)', mes('2026-01').nuevas === 2 && mes('2026-03').hechas === 1 && mes('2026-09').hechas === 1 && mes('2026-09').nuevas === 1 && fm.reduce((s, x) => s + x.hechas, 0) === 2);
ok('flujoMensual: los meses se agrupan sumando (agrupar suma inc)', agrupar(fm.map(x => ({ k: x.k, v: x.nuevas, inc: x.nuevas })), 'anio')[0].inc === 6);
ok('flujoEnDias: lo hecho y lo nuevo en los últimos 30 días', JSON.stringify(flujoEnDias(tareas, HOY, 30)) === JSON.stringify({ hechas: 1, nuevas: 0 }) && flujoEnDias(tareas, HOY, 40).nuevas === 1);

// --- actividad
const ahora = new Date('2026-10-02T18:00:00Z');
const A = (Quien, Accion, diasAtras) => ({ Quien, Accion, Cuando: new Date(ahora.getTime() - diasAtras * 86400000).toISOString() });
const act = [A('ana@x', 'comentar', 0.1), A('Ana@x', 'mover-tarea', 1), A('beto@x', 'crear-tarea', 5), A('ana@x', 'editar-tarea', 29), A('beto@x', 'comentar', 31), A('ana@x', 'comentar', 45)];
const pd = actividadPorDia(act, 30, ahora);
ok('actividadPorDia: 30 días que terminan hoy, del más viejo a hoy', pd.length === 30 && pd[29].dia === '2026-10-02' && pd[0].dia === '2026-09-03');
ok('actividadPorDia: cuenta lo de cada día y deja fuera lo de hace más de 30', pd[29].n === 1 && pd[28].n === 1 && pd.reduce((s, x) => s + x.n, 0) === 4);
ok('accionesEnVentana: 4 en los últimos 30 días y 2 en los 30 anteriores', accionesEnVentana(act, 30, 0, ahora) === 4 && accionesEnVentana(act, 30, 30, ahora) === 2);
const dg = actividadDesglose(act, 30, ahora);
ok('actividadDesglose: por persona (sin distinguir mayúsculas), de más a menos, con su desglose', dg.length === 2 && dg[0].quien === 'ana@x' && dg[0].n === 3 && dg[0].comentarios === 1 && dg[0].movimientos === 1 && dg[0].otras === 1 && dg[1].creadas === 1);
ok('actividadDesglose cuadra con actividadPorPersona de siempre (mismas personas y cifras)', JSON.stringify(dg.map(x => [x.quien, x.n])) === JSON.stringify(actividadPorPersona(act, 30, ahora).map(x => [x.quien, x.n])));

// --- vencidas
ok('diasVencida: 184 días la 3; 0 si no venció, si vence hoy o si está hecha', diasVencida(tareas[2], HOY) === 184 && diasVencida(tareas[4], HOY) === 0 && diasVencida(tareas[3], HOY) === 0 && diasVencida(T(9, null, { Vence: iso(HOY) }), HOY) === 0);
ok('la carga de siempre sigue disponible para la tabla (abiertas por persona)', cargaPorPersona([T(1, null, { Asignado: 'A@x' })], 7, ahora)[0].quien === 'a@x');

// --- las páginas
ok('las 5 páginas de Reportes y #reportes a secas = Avance', Object.keys(REPORTES_TRABAJO).join() === 'avance,carga,semanas,actividad,vencidas' && paginaReporte(null) === 'avance' && paginaReporte('carga') === 'carga' && paginaReporte('zzz') === 'avance' && paginaReporte('constructor') === 'avance');

console.log(`trabajo.test.js: ${n} aserciones OK`);
