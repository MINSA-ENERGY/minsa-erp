// node test/reporte.test.js — reglas puras de la plantilla de reporte (v1.0.0, rediseño 2026-10-02, cubeta 2).
import assert from 'node:assert/strict';
import { diaIso, mesDe, diasEntre, restarDias, sumarMeses, etiquetaMes, fechaCorta, porMes, serieAcumulada, desdeDeRango, recortar, textoRango, agrupar,
    nice, escala, cambioPct, textoPct, kpisVsDias, cubetaAntiguedad, colorCorte, fmtMonto, fmtCorto, fmtEje, celdaCsv, csv, nombreCsv,
    OPERADORES, COLORES_SEGMENTO, MAX_SEGMENTOS, colorLibre, cumple, enSegmento, problemaSegmento, RANGOS, GRANOS, DIAS_KPI, ANTIGUEDAD } from '../reporte-reglas.js';

let n = 0;
const ok = (nombre, cond) => { assert.ok(cond, nombre); n++; };

// --- fechas
ok('diaIso: de una cadena con hora local y de un Date', diaIso('2026-10-05T08:03:11') === '2026-10-05' && diaIso(new Date('2026-10-02T12:00:00Z')) === '2026-10-02' && diaIso('ayer') === null);
ok('mesDe: de un día y de un mes', mesDe('2026-10-05') === '2026-10' && mesDe('2026-03') === '2026-03' && mesDe('') === null);
ok('diasEntre y restarDias (cruzan año)', diasEntre('2025-12-30', '2026-01-02') === 3 && restarDias('2026-01-02', 3) === '2025-12-30');
ok('sumarMeses hacia adelante y hacia atrás, cruzando año', sumarMeses('2026-11', 3) === '2027-02' && sumarMeses('2026-01', -1) === '2025-12' && sumarMeses('2026-10', -24) === '2024-10');
ok('etiquetas: «Oct 2026» y «2 oct 2026»', etiquetaMes('2026-10') === 'Oct 2026' && fechaCorta('2026-10-02T07:00:00') === '2 oct 2026' && fechaCorta(null) === '—');

// --- series y acumulados
const montos = porMes([{ f: '2026-01-15', m: 100 }, { f: '2026-01-20', m: 50 }, { f: '2026-03-01', m: 25 }, { f: null, m: 999 }], x => x.f, x => x.m);
ok('porMes: suma por mes y descarta lo que no trae fecha', montos['2026-01'] === 150 && montos['2026-03'] === 25 && Object.keys(montos).length === 2);
const s = serieAcumulada(montos, '2026-04');
ok('serieAcumulada: sin huecos (febrero repite) hasta el mes del corte', s.map(p => p.k).join() === '2026-01,2026-02,2026-03,2026-04' && s.map(p => p.v).join() === '150,150,175,175' && s[1].inc === 0 && s[2].inc === 25);
ok('serieAcumulada: vacía sin datos o con el corte antes del primer mes', serieAcumulada({}, '2026-04').length === 0 && serieAcumulada(montos, '2025-12').length === 0);

// --- rango (desde el CORTE)
ok('desdeDeRango: 1 y 2 años atrás del corte; «todo» = null', desdeDeRango('1a', '2026-10-02') === '2025-10-02' && desdeDeRango('2a', '2026-10-02') === '2024-10-02' && desdeDeRango('todo', '2026-10-02') === null);
const larga = serieAcumulada({ '2023-07': 1, '2026-10': 1 }, '2026-10');
ok('recortar: el último año = 13 meses (del mes de hace un año al del corte), como la maqueta', recortar(larga, '1a', '2026-10-02').length === 13 && recortar(larga, '1a', '2026-10-02')[0].k === '2025-10');
ok('recortar: todo el historial deja la serie entera; también recorta una serie por corte (días)', recortar(larga, 'todo', '2026-10-02').length === larga.length && recortar([{ k: '2024-09-30', v: 1 }, { k: '2025-10-06', v: 2 }], '1a', '2026-10-02').length === 1);
ok('textoRango: «2024-10-02 a 2026-10-02» y «todo» desde el primer punto', textoRango('2a', '2026-10-02') === '2024-10-02 a 2026-10-02' && textoRango('todo', '2026-10-02', '2023-07') === '2023-07-01 a 2026-10-02');

// --- agrupar
const anual = serieAcumulada({ '2025-11': 10, '2026-02': 5, '2026-05': 1 }, '2026-06');
const q = agrupar(anual, 'trim');
ok('agrupar trimestre: el saldo es el ÚLTIMO del periodo y lo emitido se SUMA', q.map(p => p.etiqueta).join() === 'T4 2025,T1 2026,T2 2026' && q.map(p => p.v).join() === '10,15,16' && q.map(p => p.inc).join() === '10,5,1');
const a = agrupar(anual, 'anio');
ok('agrupar año: «2025» · «2026»', a.map(p => p.etiqueta).join() === '2025,2026' && a[1].v === 16 && a[1].inc === 6);
ok('agrupar mes: una etiqueta por mes', agrupar(anual, 'mes').length === 8 && agrupar(anual, 'mes')[0].etiqueta === 'Nov 2025');
ok('agrupar una serie POR CORTE (historial semanal) por mes: el último corte del mes', agrupar([{ k: '2026-09-07', v: 1 }, { k: '2026-09-28', v: 3 }, { k: '2026-10-05', v: 4 }], 'mes').map(p => `${p.k}:${p.v}`).join() === '2026-09:3,2026-10:4');

// --- escala «nice»
ok('nice: 1, 2, 2.5, 5, 10 × 10^n', nice(0.7) === 1 && nice(1.5) === 2 && nice(2.2) === 2.5 && nice(4) === 5 && nice(7) === 10 && nice(650000) === 1000000 && nice(0) === 1);
const e = escala([0, 2590000]);
ok('escala: tope redondo que cubre el máximo y marcas parejas desde 0', e.paso === 1000000 && e.tope === 3000000 && e.piso === 0 && e.marcas.join() === '0,1000000,2000000,3000000');
// v1.0.0 (cubeta 6, fidelidad #13): un máximo pegado a la marca deja un paso de aire arriba; uno que llega al 90 % no
const ea = escala([0, 4000]);
ok('escala: un máximo justo en la marca (4,000 con paso 1,000) sube el tope un paso (5,000): la etiqueta no pisa el eje', ea.paso === 1000 && ea.tope === 5000 && ea.marcas.join() === '0,1000,2000,3000,4000,5000');
const eb = escala([0, 3500]);
ok('escala: con aire de sobra (3,500 de 4,000) el tope no cambia', eb.tope === 4000);
const ec = escala([-1000, 200]);
ok('escala: un mínimo negativo pegado a su marca baja el piso un paso', ec.piso < -1000 && ec.piso % ec.paso === 0);
const en = escala([-80, 300]);
ok('escala: con negativos baja el piso a una marca redonda', en.piso < 0 && en.piso % en.paso === 0 && en.tope >= 300 && en.marcas.includes(0));

// --- KPIs contra 30/60/180/365 días
ok('cambioPct y su texto (signo tipográfico)', cambioPct(110, 100) === 10 && cambioPct(1, 0) === null && textoPct(10) === '+10.00%' && textoPct(-3.1) === '−3.10%' && textoPct(null) === '');
const mensual = Array.from({ length: 14 }, (_, i) => ({ k: sumarMeses('2025-09', i), v: (i + 1) * 100 }));
const k = kpisVsDias(mensual, '2026-10-02');
ok('kpisVsDias mensual: hace 30 días = un mes atrás; hace 365 = doce meses atrás', k.map(x => x.dias).join() === DIAS_KPI.join() && k[0].v === 1300 && k[3].v === 200 && Math.abs(k[0].pct - (1400 - 1300) / 1300 * 100) < 1e-9);
ok('kpisVsDias: si la serie no llega tan atrás, null (no inventa)', kpisVsDias(mensual.slice(-3), '2026-10-02')[3].v === null && kpisVsDias([], '2026-10-02')[0].v === null);
const semanal = [{ k: '2026-08-31', v: 10 }, { k: '2026-09-07', v: 12 }, { k: '2026-09-28', v: 15 }, { k: '2026-10-05', v: 20 }];
const ks = kpisVsDias(semanal, '2026-10-05');
ok('kpisVsDias por corte: el último corte EN o ANTES de corte − N días (30 días antes del 5-oct = 5-sep: el del 31-ago)', ks[0].v === 10 && ks[1].v === null && ks[0].pct === 100);

// --- antigüedad y corte
ok('antigüedad: 0–90 · 91–180 · 181–365 · más de 365 días', cubetaAntiguedad('2026-07-04', '2026-10-02') === 0 && cubetaAntiguedad('2026-07-03', '2026-10-02') === 1 && cubetaAntiguedad('2025-10-02', '2026-10-02') === 2 && cubetaAntiguedad('2025-10-01', '2026-10-02') === 3);
ok('antigüedad: cuatro rótulos', ANTIGUEDAD.length === 4 && ANTIGUEDAD[3] === 'Más de 365 días');
ok('color del corte: al día hasta 8, ámbar con más de 8, rojo con más de 15', colorCorte(8) === 'ok' && colorCorte(9) === 'warn' && colorCorte(15) === 'warn' && colorCorte(16) === 'danger');

// --- montos
ok('fmtMonto: US$ y $, miles y negativos', fmtMonto(2900, 'USD') === 'US$2,900.00' && fmtMonto(-80, 'MXN') === '-$80.00' && fmtMonto(91960, 'USD', 0) === 'US$91,960' && fmtMonto(3) === '3.00');
ok('fmtCorto: M, k y unidades', fmtCorto(2590000, 'USD') === 'US$2.59M' && fmtCorto(950250, 'MXN') === '$950.25k' && fmtCorto(80, 'USD') === 'US$80');
ok('fmtEje: marcas cortas', fmtEje(3000000, 'USD') === 'US$3M' && fmtEje(500000, 'MXN') === '$500k' && fmtEje(0, 'USD') === 'US$0');

// --- CSV
ok('csv: comillas, separador y saltos se escapan; números con punto', celdaCsv('a,b') === '"a,b"' && celdaCsv('dijo "hola"') === '"dijo ""hola"""' && celdaCsv('x\ny') === '"x\ny"' && celdaCsv(1234.5) === '1234.5' && celdaCsv(null) === '');
ok('csv: un texto que Excel leería como fórmula lleva apóstrofo', celdaCsv('=HYPERLINK("x")') === `"'=HYPERLINK(""x"")"` && celdaCsv('@SUM(A1)') === "'@SUM(A1)" &&celdaCsv('-5 días').startsWith("'") && celdaCsv(-5) === '-5');
const archivo = csv(['Cliente', 'Saldo'], [['Constructora, S.A.', 10.5], ['Ñandú', 0]]);
ok('csv: BOM UTF-8 al inicio, CRLF entre renglones, acentos intactos', archivo.charCodeAt(0) === 0xFEFF && archivo === '﻿Cliente,Saldo\r\n"Constructora, S.A.",10.5\r\nÑandú,0\r\n');
ok('csv con punto y coma como separador', csv(['a'], [['x;y']], ';').includes('"x;y"'));
ok('nombreCsv: sin espacios ni acentos raros', nombreCsv('Cobrar · saldo', '2026-10-02') === 'cobrar-saldo_2026-10-02.csv');

// --- segmentos
ok('operadores por tipo (maqueta OPS)', OPERADORES.lista.length === 2 && OPERADORES.fecha[0] === 'es igual o posterior a');
ok('7 colores, el primero libre se reusa', MAX_SEGMENTOS === 7 && COLORES_SEGMENTO.length === 7 && colorLibre([{ color: COLORES_SEGMENTO[0] }, { color: COLORES_SEGMENTO[2] }]) === COLORES_SEGMENTO[1]);
ok('cumple: lista, número, fecha y texto sin acentos', cumple({ op: 'es uno de', v: ['A'] }, 'A') && !cumple({ op: 'no es uno de', v: ['A'] }, 'A') && cumple({ op: 'es mayor que', v: 100 }, 101)
    && !cumple({ op: 'es menor que', v: 100 }, 100) && cumple({ op: 'es igual o posterior a', v: '2025-01-01' }, '2025-01-01') && !cumple({ op: 'es anterior a', v: '2025-01-01' }, '')
    && cumple({ op: 'contiene', v: 'perforacion' }, 'Perforación') && cumple({ op: 'no contiene', v: 'x' }, 'abc'));
const fila = { a: 'CPL', b: 500 };
const val = (p, f) => f[p];
ok('enSegmento: Y = todas, O = alguna, sin condiciones = todo', enSegmento({ join: 'Y', conds: [{ p: 'a', op: 'es uno de', v: ['CPL'] }, { p: 'b', op: 'es mayor que', v: 100 }] }, fila, val)
    && !enSegmento({ join: 'Y', conds: [{ p: 'a', op: 'es uno de', v: ['CPL'] }, { p: 'b', op: 'es mayor que', v: 1000 }] }, fila, val)
    && enSegmento({ join: 'O', conds: [{ p: 'a', op: 'es uno de', v: ['X'] }, { p: 'b', op: 'es mayor que', v: 100 }] }, fila, val) && enSegmento({ conds: [] }, fila, val));
const PROPS = [{ k: 'a', t: 'lista' }, { k: 'b', t: 'numero' }];
ok('problemaSegmento: valida lo que llega de ERP_Vistas', problemaSegmento({ join: 'Y', conds: [{ p: 'a', op: 'es uno de', v: ['x'] }] }, PROPS) === null
    && /propiedad/.test(problemaSegmento({ conds: [{ p: 'zz', op: 'es uno de', v: [] }] }, PROPS)) && /operador/.test(problemaSegmento({ conds: [{ p: 'b', op: 'contiene', v: 'x' }] }, PROPS))
    && !!problemaSegmento(null, PROPS) && !!problemaSegmento({ join: 'X', conds: [] }, PROPS));
ok('catálogos: 3 rangos y DÍA/SEMANA apagados', RANGOS.length === 3 && GRANOS.filter(g => g.apagado).map(g => g.clave).join() === 'dia,semana');
// v1.0.0 (vuelta 1, revisión de código «baja»): UN solo diasDelCorte para el chip de Inicio y el de la página — Inicio contaba desde el
// mediodía del día del corte y la página desde su hora: el 10-oct a las 08:00, un corte del 1-oct a las 06:00 daba 8 (verde) y 9 (ámbar).
{
    const { diasDelCorte } = await import('../reporte-reglas.js');
    const a = new Date(2026, 9, 10, 8, 0);
    ok('diasDelCorte: días de CALENDARIO del corte a hoy (hora local), igual con hora o sin ella', typeof diasDelCorte === 'function' && diasDelCorte('2026-10-01T06:00:00', a) === 9 && diasDelCorte('2026-10-01T23:30:00', a) === 9 && diasDelCorte('2026-10-01', a) === 9);
    ok('diasDelCorte: el mismo día es 0, la medianoche cuenta un día, nunca negativo y sin corte 0', typeof diasDelCorte === 'function' && diasDelCorte('2026-10-03T07:00:00', new Date(2026, 9, 3, 6, 0)) === 0 && diasDelCorte('2026-10-01T23:30:00', new Date(2026, 9, 2, 0, 10)) === 1 && diasDelCorte('2026-10-09', new Date(2026, 9, 3)) === 0 && diasDelCorte('', a) === 0);
}

console.log(`reporte.test.js: ${n} aserciones OK`);
