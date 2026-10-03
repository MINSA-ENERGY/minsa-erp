// node test/preguntar.test.js — «Preguntar» sin IA (v1.0.0, rediseño cubeta 4): las sugeridas por rol armadas con los datos y el intérprete de frases.
import assert from 'node:assert/strict';
import { sugeridasPara, interpretarPregunta, ventanaDias, PIE_PREGUNTAR } from '../preguntar-reglas.js';
import { nombreClave } from '../cobranza-reglas.js';

let n = 0;
const ok = (nombre, cond) => { assert.ok(cond, nombre); n++; };

const HOY = new Date(2026, 9, 2, 12, 0), YO = 'yo@x.com';
const fac = (id, moneda, saldo, extra = {}) => ({ id, uuid: id, fecha: '2026-03-01', concepto: 'Servicio', moneda, insoluto_min: saldo, insoluto_max: saldo, estado: 'SIN', cancelada: false, reps: 0, pagado: 0, ...extra });
const COB = { datos: { version: 1, revision: 2, generado: '2026-10-02T07:00:00', clientes: [
    { rfc: 'CPL', nombre: 'CPL Servicios de Perforación', monedas: [{ moneda: 'USD', facturado: 400, pagado: 0, ok: 0, duda_max: 0, sin: 300 }], facturas: [fac('F1', 'USD', 200), fac('F2', 'USD', 100, { fecha: '2025-12-01' })] },
    { rfc: 'LAT', nombre: 'Constructora y Perforadora Latina', monedas: [{ moneda: 'USD', facturado: 100, pagado: 0, ok: 50, duda_max: 0, sin: 0 }, { moneda: 'MXN', facturado: 900, pagado: 0, ok: 900, duda_max: 0, sin: 0 }],
      facturas: [fac('L1', 'USD', 50, { estado: 'OK', reps: 1 }), fac('L2', 'MXN', 900, { estado: 'OK', reps: 1 })] }],
    proveedores: [{ rfc: 'PRO', nombre: 'Productos PRODEOS', monedas: [{ moneda: 'MXN', facturado: 500, pagado: 0, ok: 0, duda_max: 0, sin: 500 }], facturas: [fac('P1', 'MXN', 500)] }] }, error: null };
const SERV = { datos: { version: 1, generado: '2026-10-01T08:00:00', pasos: Array.from({ length: 12 }, (_, i) => ({ paso: `Paso ${i}` })), expedientes: [
    { clave: 'E2', tipo: 'O.C.', id: '45', paso: 11, espera_a: 'Tesorería LATINA', desde: '2026-07-08' },
    { clave: 'E4', tipo: 'SOLPED', id: '10', paso: 3, bloqueado: true, espera_a: 'LATINA', desde: '2026-09-23' }] }, error: null };
const COMP = { datos: { version: 1, generado: '2026-09-20T08:00:00', ordenes: [
    { folio: 'PDH-009', fecha: '2026-08-12', proveedor: 'PRODEOS', moneda: 'MXN', total: 1307076.4, partidas: [{}] },
    { folio: 'PDH-003', fecha: '2026-01-10', proveedor: 'PRODEOS', moneda: 'MXN', total: 1000, partidas: [{}] },
    { folio: 'PDH-001', fecha: '2025-05-10', proveedor: 'PRODEOS', moneda: 'MXN', total: 5, partidas: [{}] }] }, error: null };
const VIG = { datos: { version: 1, generado: '2026-10-01T08:00:00', vigencias: [
    { titulo: 'Achilles Silver', vence: '2026-09-18' }, { titulo: 'Cuestionario Achilles', vence: '2027-01-16' }, { titulo: 'Fianza', vence: '2027-09-09' }] }, error: null };
const PROY = [{ id: 1, Title: 'Licencia ambiental', Clave: 'lau', Estado: 'activo' }, { id: 2, Title: 'Frente quieto', Clave: 'q', Estado: 'activo' }];
const TAREAS = [
    { id: 10, Title: 'Mía vencida', Asignado: YO, Columna: 'por-hacer', ProyectoId: 1, Vence: '2026-09-25T18:00:00Z' },
    { id: 11, Title: 'Mía al día', Asignado: YO, Columna: 'por-hacer', ProyectoId: 1, Vence: '2026-10-20T18:00:00Z' },
    { id: 12, Title: 'De Ana 1', Asignado: 'ana@x.com', Columna: 'por-hacer', ProyectoId: 1 }, { id: 13, Title: 'De Ana 2', Asignado: 'ana@x.com', Columna: 'en-curso', ProyectoId: 2, Vence: '2026-09-01T18:00:00Z' },
    { id: 14, Title: 'Sin dueño', Asignado: '', Columna: 'por-hacer', ProyectoId: 1 }, { id: 15, Title: 'Hecha', Asignado: 'ana@x.com', Columna: 'hecho', ProyectoId: 1 }];
const ACT = [{ ProyectoId: 1, Accion: 'comentar', Cuando: '2026-10-01T10:00:00Z' }, { ProyectoId: 2, Accion: 'comentar', Cuando: '2026-09-01T10:00:00Z' }];
const ROLES = [{ Title: 'ana@x.com', Nombre: 'Ana Demo' }, { Title: YO, Nombre: 'Yo Mismo' }];
const ctx = (rol, extra = {}) => ({ rol, yo: YO, hoy: HOY, hoyDia: '2026-10-02', tareas: TAREAS, proyectos: PROY, roles: ROLES, actividad: ACT, sinMovimientoDias: 10, cobranza: COB, servicios: SERV, compras: COMP, vigencias: VIG, ...extra });
const P = (q, rol = 'gerencia', extra) => interpretarPregunta(q, ctx(rol, extra));

ok('el pie dice que no es IA (plan, literal)', PIE_PREGUNTAR === 'Respuestas calculadas con los datos de la app (no es IA)');
ok('nombreClave: la primera palabra que no es de relleno', nombreClave('CPL Servicios de Perforación') === 'CPL' && nombreClave('Constructora y Perforadora Latina') === 'Latina' && nombreClave('') === '');
// --- sugeridas por rol, con los datos reales
{
    const g = sugeridasPara(ctx('gerencia'));
    ok('gerencia: las 8 del plan, con X y los números de los datos (quién debe más en USD, el de más saldo sin REP, los meses, PRODEOS y el año)', g.length === 8 && g[0] === '¿Cuánto nos debe CPL?' && g[1] === '¿Qué facturas de CPL no tienen REP?' && g[2] === '¿En qué paso va cada servicio?' && g[3] === '¿Qué vence en los próximos 6 meses?' && g[4] === '¿Cuánto le compramos a PRODEOS en 2026?' && g.slice(5).join('|') === '¿Qué tengo vencido?|¿Qué frentes no se mueven?|¿Quién tiene más carga?', g.join(' | '));
    const c = sugeridasPara(ctx('colaborador')), l = sugeridasPara(ctx('lectura'));
    ok('colaborador: sin Dinero ni vigencias (servicios, compras y lo de Trabajo)', c.length === 5 && !c.some(x => /debe|REP|vence/.test(x)) && c.includes('¿En qué paso va cada servicio?'));
    ok('lectura: solo lo de Trabajo', l.join('|') === '¿Qué tengo vencido?|¿Qué frentes no se mueven?|¿Quién tiene más carga?');
    ok('sin datos todavía no se sugiere lo que no se puede contestar', sugeridasPara(ctx('gerencia', { cobranza: { datos: null }, servicios: { datos: false }, compras: { datos: null }, vigencias: { datos: null } })).length === 3);
}
// --- Dinero (reusa interpretarFrase)
{
    const r = P('¿Cuánto nos debe CPL?');
    ok('¿cuánto nos debe X?: el saldo sin pago probado de esa contraparte, cuántas facturas y cuántas sin REP, con su corte', r.entendida && r.intento === 'debe' && /^CPL Servicios de Perforación nos debe US\$300\.00 sin pago probado \(corte del 2-oct\): 2 facturas, 2 sin REP\.$/.test(r.texto), r.texto);
    ok('… las facturas como filas (la mayor primero) y la liga abre un SEGMENTO de esa contraparte (revisión 2)', r.filas.length === 2 && r.filas[0].b === 'US$200.00' && r.liga.segmento && r.liga.segmento.lado === 'cobrar' && r.liga.segmento.conds[0].p === 'cli' && r.liga.segmento.conds[0].v[0] === 'CPL Servicios de Perforación' && r.liga.segmento.moneda === 'USD');
    const t = P('¿Cuánto nos deben?');
    ok('sin contraparte: el total por cobrar por moneda (las monedas no se suman)', /^Por cobrar sin pago probado: US\$350\.00 y \$900\.00 \(corte del 2-oct\)\. Las monedas no se suman\.$/.test(t.texto) && t.liga.ir === '#finanzas/cobrar/saldo', t.texto);
    const p = P('¿cuánto le debemos a PRODEOS?');
    ok('¿cuánto le debemos a X?: el lado de Por pagar', p.intento === 'debe' && /^A Productos PRODEOS le debemos \$500\.00/.test(p.texto) && p.liga.segmento.lado === 'pagar', p.texto);
    const s = P('¿Qué facturas de CPL no tienen REP?');
    ok('¿qué facturas de X no tienen REP?: las sin complemento, de la más vieja a la más nueva, y el segmento lleva «Sin REP»', s.intento === 'sin-rep' && /^De CPL Servicios de Perforación, 2 facturas no tienen complemento de pago \(REP\): US\$300\.00\.$/.test(s.texto) && s.filas[0].a.startsWith('F2') && s.liga.segmento.conds.some(c => c.p === 'est'), s.texto);
    const rev1 = P('¿Cuánto nos debe CPL?', 'gerencia', { cobranza: { datos: { ...COB.datos, revision: 1 } } });
    ok('con el archivo de antes (revisión 1) la liga va a la página, no a un segmento', rev1.liga.ir === '#finanzas/cobrar/cliente' && !rev1.liga.segmento);
    ok('colaborador y lectura: Dinero lo dice en vez de contestar', /solo ve gerencia/.test(P('¿Cuánto nos debe CPL?', 'colaborador').texto) && /solo ve gerencia/.test(P('¿Qué facturas de CPL no tienen REP?', 'lectura').texto));
    ok('sin cobranza.json todavía: lo dice (leyendo / no publicado)', /leyendo cobranza\.json/.test(P('¿cuánto nos debe CPL?', 'gerencia', { cobranza: { datos: null } }).texto) && /no hay cobranza\.json publicado/.test(P('¿cuánto nos debe CPL?', 'gerencia', { cobranza: { datos: false } }).texto));
}
// --- Operación
{
    const s = P('¿En qué paso va cada servicio?');
    ok('¿en qué paso va cada servicio?: uno por expediente (el más nuevo arriba) con su paso y su estado; liga al ciclo', s.intento === 'servicios' && /^2 expedientes abiertos: 1 en cobro y 1 detenido\.$/.test(s.texto) && s.filas.map(f => f.a).join() === 'E4,E2' && /paso 3 · Paso 3 \(detenido\)/.test(s.filas[0].b) && s.liga.ir === '#servicios/ciclo', s.texto);
    const e = P('¿cómo va el E2?');
    ok('un expediente por su clave: paso, estado y a quién espera; liga a su página', /^E2 \(O\.C\. 45\) va en el paso 11 de 11: Paso 11 — en cobro; espera a Tesorería LATINA desde el 8-jul\.$/.test(e.texto) && e.liga.ir === '#servicios/E2', e.texto);
    const c = P('¿Cuánto le compramos a PRODEOS en 2026?');
    ok('¿cuánto le compramos a X en <año>?: órdenes y total con IVA (por moneda) y la más reciente', c.intento === 'compras' && /^A PRODEOS en 2026 le compramos 2 órdenes por \$1,308,076\.40 con IVA\. La más reciente, PDH-009 del 12-ago, por \$1,307,076\.40\.$/.test(c.texto) && c.liga.ir === '#compras', c.texto);
    ok('lectura: Operación lo dice en vez de contestar', /gerencia y colaboradores/.test(P('¿En qué paso va cada servicio?', 'lectura').texto) && /gerencia y colaboradores/.test(P('¿cuánto le compramos a PRODEOS?', 'lectura').texto));
    const v = P('¿Qué vence en los próximos 6 meses?');
    ok('¿qué vence en N meses?: lo que vence en la ventana y lo ya vencido aparte; liga a Vigencias', v.intento === 'vence' && /^En los próximos 6 meses vence 1: Cuestionario Achilles \(16-ene-2027\)\. Ya venció: Achilles Silver \(18-sep-2026\)\.$/.test(v.texto) && v.liga.ir === '#vigencias', v.texto);
    ok('ventanaDias: meses, semanas, días, un año; sin número, 6 meses', ventanaDias('que vence en 3 meses').dias === 92 && ventanaDias('en dos semanas').dias === 14 && ventanaDias('en 30 dias').dias === 30 && ventanaDias('en un ano').dias === 365 && ventanaDias('que vence').texto === 'los próximos 6 meses');
    ok('colaborador: las vigencias son de gerencia', /solo las ve gerencia/.test(P('¿Qué vence en 3 meses?', 'colaborador').texto));
}
// --- Trabajo (todos los roles)
{
    const m = P('¿Qué tengo vencido?', 'lectura');
    ok('¿qué tengo vencido?: mis abiertas vencidas con hace cuánto y su frente; liga a Mis tareas con el filtro de vencidas', m.intento === 'mis-vencidas' && /^Tienes 1 tarjeta vencida:$/.test(m.texto) && m.filas[0].a === 'Mía vencida' && m.filas[0].b === 'venció hace 7 días · Licencia ambiental' && m.liga.ir === '#mis' && m.liga.filtroMis === 'vencidas', m.texto);
    const f = P('¿Qué frentes no se mueven?', 'colaborador');
    ok('¿qué frentes no se mueven?: los activos sin movimiento en 10 días o más; liga a Actividad', f.intento === 'frentes' && /^1 frente activo lleva 10 días o más sin movimiento/.test(f.texto) && f.filas[0].a === 'Frente quieto' && f.filas[0].b === '31 días' && f.liga.ir === '#reportes/actividad', f.texto);
    const c = P('¿Quién tiene más carga?');
    ok('¿quién tiene más carga?: la persona con más abiertas (nombre, vencidas) y cuántas no tienen dueño; liga a Carga por persona', c.intento === 'carga' && /^Ana Demo tiene más carga: 2 abiertas, 1 vencida\. Además hay 1 sin dueño\.$/.test(c.texto) && c.filas[0].a === 'Ana Demo' && c.liga.ir === '#reportes/carga', c.texto);
}
// --- lo que no entiende
{
    const r = P('¿cuál es el sentido de la vida?');
    ok('no entiende: lo dice (el panel ofrece las sugeridas) y no inventa', !r.entendida && r.intento === null && /No entendí/.test(r.texto) && !r.liga);
    ok('vacío: pide una pregunta', !P('   ').entendida && /Escribe una pregunta/.test(P('   ').texto));
}

console.log(`preguntar: ok (${n} comprobaciones)`);
