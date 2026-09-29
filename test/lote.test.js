// node test/lote.test.js — el manifiesto que la app deja en el buzon (contrato 1, firma minsa-proyectos).
import assert from 'node:assert/strict';
import { construirManifiesto, validarManifiesto, bytesDelManifiesto, nombreCarpetaLote, APP, CONTRATO, NOMBRE_MANIFIESTO, rutaRecibo, validarRecibo, CARPETA_RECIBOS, CONTRATO_RECIBO } from '../lote.js';
import { rutaUrl } from '../graph.js';

let n = 0;
const ok = (nombre, cond) => { assert.ok(cond, nombre); n++; };

const base = { appVersion: '0.1.0', unidad: 'CALYTEK', etiqueta: 'Proyecto', destino: '03_Predios/Arrocera/Federal (ASEA) - LAU', fecha: '2026-09-11', concepto: 'Filosofía de operación', archivos: ['a.pdf', 'b.pdf'], proyecto: 'lau-asea-03-001', tarea: 17 };
const m = construirManifiesto(base);
ok('firma y contrato', m.app === APP && m.app === 'minsa-proyectos' && m.contrato === CONTRATO && CONTRATO === 1);
ok('tipo documento y paginas = archivos', m.tipo === 'documento' && m.paginas === 2);
ok('proyecto y tarea viajan', m.proyecto === 'lau-asea-03-001' && m.tarea === 17);
ok('sin tarea = null', construirManifiesto({ ...base, tarea: undefined }).tarea === null);
ok('manifiesto valido', validarManifiesto(m).ok === true);
ok('otra app se rechaza', validarManifiesto({ ...m, app: 'minsa-captura' }).ok === false);
ok('sin proyecto se rechaza', validarManifiesto({ ...m, proyecto: '' }).motivo === 'sin proyecto');
ok('sin archivos se rechaza', validarManifiesto({ ...m, archivos: [] }).ok === false);
ok('destino al buzon se rechaza', validarManifiesto({ ...m, destino: '99_Pendiente-Archivar/x' }).motivo === 'el destino apunta al propio buzon');
ok('destino con .. se rechaza', validarManifiesto({ ...m, destino: '../fuera' }).ok === false);
ok('fecha mal se rechaza', validarManifiesto({ ...m, fecha: '11/09/2026' }).ok === false);
ok('no se lista a si mismo', validarManifiesto({ ...m, archivos: ['a.pdf', NOMBRE_MANIFIESTO] }).ok === false);
const bytes = bytesDelManifiesto(m);
ok('bytes UTF-8 con salto final', bytes[bytes.length - 1] === 10 && JSON.parse(new TextDecoder().decode(bytes)).concepto === 'Filosofía de operación');
ok('nombre de carpeta', nombreCarpetaLote('2026-09-11', 'Proyecto', 'lau-asea-03-001', 'filosofia-de-operacion') === '2026-09-11_Proyecto_lau-asea-03-001_filosofia-de-operacion');
// El recibo (v0.108.0): lo que la skill deja en `_resueltos/` al archivar el lote.
const L1 = '2026-09-25_Proyecto_lau_oficio';
ok('ruta del recibo desde la Ruta de la liga', rutaRecibo(`99_Pendiente-Archivar/${L1}`) === `99_Pendiente-Archivar/${CARPETA_RECIBOS}/${L1}.json`);
ok('ruta del recibo sin lote = null', rutaRecibo('') === null);
const rec = { recibo: CONTRATO_RECIBO, app: APP, lote: L1, proyecto: 'lau', tarea: 17, piezas: [
    { archivo: 'a.pdf', ruta: '02_Planta/Otros/2026-09-25_CALYTEK_Oficio.pdf', como: 'movido' },
    { archivo: 'b.pdf', ruta: '02_Planta/Otros/2026-09-01_CALYTEK_Ya.pdf', como: 'duplicado' },
    { archivo: 'd.pdf', ruta: '02_Planta/Otros/2026-09-01_CALYTEK_Ya.pdf', como: 'duplicado' }] };
const vr = validarRecibo(rec, { lote: L1, proyecto: 'lau' });
ok('recibo valido: movida + duplicada, sin repetir ruta', vr.ok && vr.rutas.length === 2 && vr.rutas[1].como === 'duplicado');
ok('recibo de otro lote se rechaza', validarRecibo(rec, { lote: 'otro', proyecto: 'lau' }).ok === false);
ok('recibo de otro proyecto se rechaza', validarRecibo(rec, { lote: L1, proyecto: 'otro' }).ok === false);
ok('recibo de otra app se rechaza', validarRecibo({ ...rec, app: 'calytek-planta' }).ok === false);
ok('recibo con ruta al buzon se rechaza', validarRecibo({ ...rec, piezas: [{ archivo: 'a', ruta: '99_Pendiente-Archivar/x.pdf', como: 'movido' }] }).ok === false);
ok('recibo con .. se rechaza', validarRecibo({ ...rec, piezas: [{ archivo: 'a', ruta: '../x.pdf', como: 'movido' }] }).ok === false);
ok('recibo de contrato nuevo se rechaza', validarRecibo({ ...rec, recibo: 2 }).ok === false);
ok('recibo PARCIAL (una pieza sin archivar) se rechaza entero', validarRecibo({ ...rec, piezas: [...rec.piezas, { archivo: 'c', ruta: null, como: 'no-archivado' }] }).ok === false);
// S-20 (v0.139.0): rutaUrl, por donde pasan existeRuta, itemPorRuta, leerJson y las dos escrituras, no deja salir de drive/root.
const lanza = r => { try { rutaUrl(r); return false; } catch { return true; } };
ok('rutaUrl conserva las diagonales y codifica cada segmento', rutaUrl('03_Predios/Arrocera/Federal (ASEA) - LAU') === '03_Predios/Arrocera/Federal%20(ASEA)%20-%20LAU');
ok('rutaUrl rechaza .. y . en cualquier segmento', lanza('99_Pendiente-Archivar/../../me/drive') && lanza('./x') && lanza('a/./b') && lanza('..'));
ok('rutaUrl deja pasar puntos dentro de un nombre', rutaUrl('a/..x/b..pdf') === 'a/..x/b..pdf');
console.log(`lote: ok (${n} comprobaciones)`);
