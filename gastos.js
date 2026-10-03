// MINSA ERP v0.162.0 — GASTOS, traido de la ERP v1 (v0.6.0/v0.7.0; plan en docs/rescate-erp-v1/plan.md, decisiones 5, 7, 8 y 10).
// La LOGICA es la de la v1 sin cambios (reglas puras en gastos-reglas.js, test/gastos.test.js); lo que cambia es la PIEL:
// la pantalla vive en #p-gastos de index.html (cabecera fija como las demas), con mn-card, las .tabs de Proyectos y la
// fecha en columna. Lo que pinta y lo que escribe:
//   - Empleado: registrar un gasto (fecha, concepto, monto, moneda, categoria, equipo, proyecto opcional, notas) con
//     comprobante opcional (foto o PDF; sin el, la nota es obligatoria) y ver «Mis gastos» con su estado.
//   - Tesoreria (ERP_Roles): la cola de lo «registrado» de todos, «Marcar reembolsado» (sella ReembolsadoPor/El, que nunca
//     se limpia) o «Rechazar» con motivo, y los totales por mes y moneda. Las funciones de guardar COMPRUEBAN el rol (no
//     solo esconden el boton). Puede capturar por el empleado (decision 5).
//   - Contabilidad (ERP_Roles): #gastos/contabilidad, «CFDI por confirmar» con los candidatos de la tarea semanal
//     (docs/rescate-erp-v1/proponer-cfdi.ps1); «Confirmar este» o «Ninguno es».
//   - Escribe SOLO en ERP_Gastos (sitio Administracion) y en la biblioteca «Gastos» del mismo sitio, carpeta AAAA-MM, sin
//     sobrescribir nunca (conflictBehavior fail -> sufijo _2). No escribe PROY_* ni PROY_Actividad.
//   - Degrada: si ERP_Gastos no existe en el sitio, la pantalla lo dice y el resto de la app sigue igual. Se lee al entrar a
//     #gastos y despues en cada recarga de la app (v0.162.0; en la v1 solo se releia al escribir).
// Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { activosDe, ordenarProyectos, fechaMexico, nombreDe, diaDe, hrefSeguro, plural } from './reglas.js';
import { $, L, estado, el, boton, chip, avisar, abrirDialogo, cerrarDialogo, confirmar, opciones, porId, agregarSinDuplicar,
    aplicarVivo, campoFecha, aIsoDia, diaDeCampo, fechaInput, fechaCorta, equipoDe, fijarHash, hashDe } from './comun.js';
import { esConflicto } from './graph.js';
import { cabecera, vistaDe, soltarIdsFuera } from './reporte.js';   // v1.0.0: la piel de la plantilla de reporte
import { conservarFoco } from './comun.js';
import { rolesErpDe, PUEDE_GASTO, misGastos, porReembolsar, resueltos, yaReembolsadoAntes, totalesPorMes, sumaPorMoneda,
    formatoMonto, etiquetaEstado, etiquetaCfdi, tipoComprobante, extComprobante, comprobanteValido, nombreComprobante,
    rutaComprobante, faltanGasto, largoInvalido, camposGasto, camposReembolso, camposRechazo, CATEGORIAS_GASTO, MONEDAS,
    leerCandidatos, porConfirmarCfdi, uuidCorto, ligadoEnOtro, camposConfirmarCfdi, camposNingunoCfdi, confirmadosDelMes } from './gastos-reglas.js';

/** Estado del modulo. lista: null = no se sabe todavia · true = existe · false = FALTA en el sitio (se deja de preguntar hasta
 *  «Volver a revisar» o recargar). error: la ultima lectura fallo por otra cosa (403, red): se ofrece reintentar. */
const G = { lista: null, rolesLista: null, gastos: [], rolesErp: [], cargando: null, error: null, driveId: null };
export const estadoGastos = () => G;
let alCambiar = () => {};
/** app.js pasa aqui su repintado. */
export function alCambiarGastos(fn) { alCambiar = fn; }
const motivo = e => (e && e.message ? e.message : String(e));
const yo = () => (estado.cuenta && estado.cuenta.username) || '';
const bajo = s => String(s || '').trim().toLowerCase();
/** El nombre de una persona: el de PROY_Roles y, si ahi no esta (tesoreria puede no tener rol de proyectos), el de ERP_Roles. */
const nombre = correo => nombreDe(correo, [...estado.roles, ...G.rolesErp].filter(r => r.Nombre));
/** Mis roles de Gastos (ERP_Roles), como Set. */
export const misRolesErp = () => rolesErpDe(yo(), G.rolesErp);
const esTesoreria = () => PUEDE_GASTO.tesoreria(misRolesErp());
const esContabilidad = () => PUEDE_GASTO.contabilidad(misRolesErp());
const puedeRegistrar = () => PUEDE_GASTO.registrar(estado.rol, misRolesErp());
/** Lista de frases: «a», «a y b», «a, b y c». */
const enLista = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];

// ---------------------------------------------------------------- lectura

/** Lee ERP_Gastos y ERP_Roles. Si ERP_Gastos no existe, G.lista = false y no se lee nada mas. */
export async function cargarGastos() {
    const c = estado.cliente, s = estado.siteId;
    try {
        if (!await c.existeLista(s, L.gastos)) { G.lista = false; G.gastos = []; G.rolesErp = []; G.error = null; return; }
        const hayRoles = await c.existeLista(s, L.rolesErp);
        const [gastos, roles] = await Promise.all([c.renglones(s, L.gastos), hayRoles ? c.renglones(s, L.rolesErp) : Promise.resolve([])]);
        G.gastos = gastos; G.rolesErp = roles; G.rolesLista = hayRoles; G.lista = true; G.error = null;
    } catch (e) { G.error = motivo(e); }
}
/** La recarga de la app (cargarTodo) relee Gastos solo si ya se leyo una vez con exito: quien nunca entra a #gastos no paga la lectura.
 *  Si ESA relectura falla (429, 503, sin red) se queda lo de la lectura anterior y no se pinta la tarjeta de error: un refresco fallido
 *  no puede borrarle la cola a tesoreria (revisor de v0.162.0). El error de la PRIMERA lectura si se ensena (no hay nada que conservar). */
export async function recargarGastosSiLeidos() {
    if (G.lista !== true) return;
    const antes = { gastos: G.gastos, rolesErp: G.rolesErp };
    await cargarGastos();
    if (G.error) { console.warn('ERP_Gastos: no se pudo releer; se queda lo de la lectura anterior.', G.error); G.gastos = antes.gastos; G.rolesErp = antes.rolesErp; G.error = null; }
}
/** La primera vez que se pinta #gastos (o tras «Volver a revisar»): lee y repinta. Con error NO reintenta solo (seria un bucle). */
function asegurarCarga() {
    if (G.lista !== null || G.cargando || G.error) return;
    G.cargando = cargarGastos().finally(() => { G.cargando = null; alCambiar(); });
}
function volverARevisar() { G.lista = null; G.error = null; G.driveId = null; asegurarCarga(); alCambiar(); }

// ---------------------------------------------------------------- pantalla

/** Las sub-vistas validas para quien mira: 'mios' siempre; 'tesoreria' y 'contabilidad' solo con su rol (si no, «Mis gastos»). */
function subActual() {
    const s = estado.gastosSub;
    return s === 'tesoreria' && esTesoreria() ? 'tesoreria' : s === 'contabilidad' && esContabilidad() ? 'contabilidad' : 'mios';
}
/** El boton de la cabecera: vivo solo con la lista y un rol que escribe; si no, dice por que. */
function pintarBotonNuevo() {
    const b = $('btnNuevoGasto');
    const sin = G.lista !== true ? (G.lista === false ? 'falta crear la lista' : '') : !puedeRegistrar() ? 'tu rol es de lectura' : '';
    b.disabled = G.lista !== true || !!sin;
    b.textContent = sin ? 'Registrar gasto: ' + sin : 'Registrar gasto';
    b.classList.toggle('is-primary', !b.disabled);
}

/** v1.0.0 (rediseño, cubeta 2): la cabecera de la plantilla de reporte (título + «?» + «Registrar gasto»); #gastosSub sigue siendo el renglón de abajo. */
const AYUDA_GASTOS = 'Cómo funciona: registras el gasto (con o sin factura, con o sin ticket; sin comprobante, con una nota que diga por qué) y tesorería lo marca reembolsado o rechazado. Contabilidad confirma el CFDI que la tarea semanal propone. Pesos y dólares nunca se suman.';
let btnNuevo = null;
function pintarCabeceraGastos() {
    const cont = $('gastosCab'); btnNuevo = btnNuevo || $('btnNuevoGasto');
    const foco = document.activeElement === btnNuevo;
    conservarFoco(cont, ['rp'], () => { soltarIdsFuera(cont); cont.textContent = ''; cont.appendChild(cabecera({ id: 'gastos', titulo: 'Gastos', ayuda: AYUDA_GASTOS, acciones: [btnNuevo], sub: ' ', subId: 'gastosSub' }, vistaDe('gastos'), () => alCambiar())); });
    if (foco && document.activeElement !== btnNuevo) btnNuevo.focus();
}

/** #gastos · #gastos/tesoreria · #gastos/contabilidad. Pinta en #gastosCuerpo; la cabecera la pone la plantilla (v1.0.0). */
export function pintarGastos() {
    const v = $('gastosCuerpo'); v.textContent = '';
    pintarCabeceraGastos();
    pintarBotonNuevo();
    $('gastosSub').textContent = 'Con o sin factura, con o sin ticket.';
    if (G.lista === null && !G.error) {
        asegurarCarga();
        const c = el('section', 'mn-card'); c.id = 'gastosCargando'; c.appendChild(el('p', 'muted', 'Leyendo gastos…')); v.appendChild(c);
        return;
    }
    if (G.error) {
        const c = el('section', 'mn-card'); c.id = 'gastosError';
        c.appendChild(chip('no se pudo leer', 'danger'));
        c.appendChild(el('p', '', 'No se pudieron leer los gastos: ' + G.error));
        c.appendChild(boton('Volver a intentar', 'mn-btn', volverARevisar));
        v.appendChild(c);
        return;
    }
    if (G.lista === false) { pintarNoHabilitado(v); return; }

    const tes = esTesoreria(), cont = esContabilidad();
    if (tes && cont) $('gastosSub').textContent = 'Tus gastos, la cola de tesorería y los CFDI por confirmar.';
    else if (tes) $('gastosSub').textContent = 'Tus gastos y la cola de tesorería.';
    else if (cont) $('gastosSub').textContent = 'Tus gastos y los CFDI por confirmar.';
    v.appendChild(el('p', 'gastos-nota', 'Tesorería solo reembolsa los gastos registrados en la app. Si el lugar no da factura ni ticket, se registra igual, con una nota que diga por qué.'));   // el aviso de la v1
    if (!G.rolesLista) v.appendChild(el('p', 'muted gastos-nota', `Falta la lista ${L.rolesErp} en el sitio: todavía nadie es tesorería, así que nadie puede marcar un gasto como reembolsado.`));

    // Pestañas: solo quien tiene un rol de Gastos (tesoreria y/o contabilidad); a los demas, «Mis gastos» sin pestañas.
    const actual = subActual();
    // #gastos/tesoreria sin el rol pinta «Mis gastos»: el hash tambien lo dice (revisor de v0.162.0: antes el hash mentia)
    if (estado.gastosSub !== actual) { estado.gastosSub = actual; if (estado.pestana === 'gastos') history.replaceState(null, '', hashDe()); }
    if (tes || cont) {
        const tabs = el('div', 'tabs'); tabs.setAttribute('role', 'tablist'); tabs.id = 'tabsGastos';
        const pestanas = [['mios', 'Mis gastos', 0]];
        if (tes) pestanas.push(['tesoreria', 'Tesorería', porReembolsar(G.gastos).length]);
        if (cont) pestanas.push(['contabilidad', 'Contabilidad', porConfirmarCfdi(G.gastos).length]);
        for (const [k, texto, n] of pestanas) {
            const on = k === actual;
            const b = el('button', 'tab' + (on ? ' is-on' : ''), texto); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = k; b.setAttribute('aria-selected', String(on));
            if (n) { const c = el('span', 'n' + (k === 'tesoreria' ? ' is-nuevo' : ''), String(n)); c.title = k === 'tesoreria' ? `${n} por reembolsar` : `${n} por confirmar`; b.appendChild(c); }
            b.addEventListener('click', () => { estado.gastosSub = k; fijarHash(hashDe()); alCambiar(); });
            tabs.appendChild(b);
        }
        v.appendChild(tabs);
    }
    if (actual === 'tesoreria') pintarTesoreria(v); else if (actual === 'contabilidad') pintarContabilidad(v); else pintarMios(v);
}

function pintarNoHabilitado(v) {
    const c = el('section', 'mn-card'); c.id = 'gastosNoHabilitado';
    c.appendChild(chip('aún no habilitado', 'warn'));
    c.appendChild(el('h2', '', 'Gastos aún no está habilitado — falta crear la lista'));
    c.appendChild(el('p', '', `La lista ${L.gastos} y la biblioteca «${CONFIG.bibliotecaGastos}» no se encuentran en el sitio Administración. Se crean una sola vez con la cuenta de Carlos (docs/rescate-erp-v1/gastos-instrucciones-carlos.md); lo demás de la app funciona igual.`));
    const r = boton('Volver a revisar', 'mn-btn', volverARevisar); r.id = 'btnRevisarGastos'; c.appendChild(r);
    v.appendChild(c);
}

/** «$850.00 MXN · $120.00 USD» de una suma por moneda; '—' si no hay nada. */
const textoSuma = s => MONEDAS.filter(m => s[m]).map(m => formatoMonto(s[m], m)).join(' · ') || '—';
/** La tarjeta con su titulo y su conteo (el patron de las secciones de Inicio). */
function tarjeta(id, titulo, n) {
    const card = el('section', 'mn-card gastos-card'); card.id = id;
    const cab = el('div', 'gastos-cab'); cab.appendChild(el('h2', '', titulo)); if (n != null) cab.appendChild(el('span', 'mn-chip', String(n)));
    card.appendChild(cab);
    return card;
}
/** Los indicadores de arriba: [clave, rotulo, valor, pie]. */
function kpis(id, filas) {
    const k = el('div', 'gastos-kpis'); k.id = id;
    for (const [clave, lbl, valor, pie] of filas) {
        const c = el('div', 'gastos-kpi'); c.dataset.kpi = clave;
        c.appendChild(el('small', '', lbl)); c.appendChild(el('b', '', valor)); c.appendChild(el('span', 'f', pie));
        k.appendChild(c);
    }
    return k;
}

function pintarMios(v) {
    const mios = misGastos(G.gastos, yo());
    const card = tarjeta('misGastos', 'Mis gastos', mios.length);
    const pend = mios.filter(g => g.Estado === 'registrado');
    if (mios.length) { const r = el('p', 'muted gastos-resumen', `Por reembolsarte: ${textoSuma(sumaPorMoneda(pend))} (${pend.length} ${plural(pend.length, 'gasto')})`); r.id = 'misGastosResumen'; card.appendChild(r); }
    const lista = el('div', 'gastos-lista');
    for (const g of mios) lista.appendChild(filaGasto(g, { conQuien: g.CapturadoPor && bajo(g.CapturadoPor) !== bajo(g.Solicitante) }));
    if (!mios.length) card.appendChild(el('p', 'vacio', 'Todavía no registras gastos. Con «Registrar gasto» queda aquí y tesorería lo ve.'));
    card.appendChild(lista);
    v.appendChild(card);
}

function pintarTesoreria(v) {
    const cola = porReembolsar(G.gastos);
    const mesHoy = fechaMexico().slice(0, 7);
    const reembMes = G.gastos.filter(g => g.Estado === 'reembolsado' && (diaDe(g.ReembolsadoEl) || '').slice(0, 7) === mesHoy);
    v.appendChild(kpis('gastosKpis', [
        ['por-reembolsar', 'Por reembolsar', textoSuma(sumaPorMoneda(cola)), `${cola.length} ${plural(cola.length, 'gasto')}`],
        ['reembolsado-mes', 'Reembolsado este mes', textoSuma(sumaPorMoneda(reembMes)), `${reembMes.length} ${plural(reembMes.length, 'gasto')} · por la fecha del reembolso`],
        ['sin-comprobante', 'Sin comprobante', String(cola.filter(g => !g.ComprobanteItemId).length), 'en la cola; se reembolsa igual, con su nota']
    ]));

    const card = tarjeta('colaTesoreria', 'Por reembolsar', cola.length);
    card.appendChild(el('p', 'muted', 'Todo lo registrado por el equipo, lo que lleva más esperando arriba. Revisa el comprobante (o la nota) antes de marcarlo.'));
    const lista = el('div', 'gastos-lista');
    for (const g of cola) lista.appendChild(filaGasto(g, { conQuien: true, tesoreria: true }));
    if (!cola.length) card.appendChild(el('p', 'vacio', 'No hay gastos por reembolsar.'));
    card.appendChild(lista);
    v.appendChild(card);

    const tot = tarjeta('totalesGastos', 'Totales por mes y moneda');
    tot.appendChild(el('p', 'muted', 'Por el mes de la fecha del ticket. Pesos y dólares no se suman entre sí.'));
    const t = el('div', 'tabla-totales'); t.setAttribute('role', 'table'); t.setAttribute('aria-label', 'Totales por mes y moneda');
    const COLS = ['Mes', 'Moneda', 'Por reembolsar', 'Reembolsado', 'Rechazado', 'Gastos'];
    const h = el('div', 'fila-tot cab'); h.setAttribute('role', 'row');
    for (const x of COLS) { const c = el('span', 'mn-label', x); c.setAttribute('role', 'columnheader'); h.appendChild(c); }
    t.appendChild(h);
    for (const r of totalesPorMes(G.gastos)) {
        const f = el('div', 'fila-tot'); f.setAttribute('role', 'row'); f.dataset.mes = r.mes; f.dataset.moneda = r.moneda;
        const celdas = [r.mes, r.moneda, formatoMonto(r.registrado, r.moneda), formatoMonto(r.reembolsado, r.moneda), formatoMonto(r.rechazado, r.moneda), String(r.n)];
        celdas.forEach((x, i) => {
            const c = el('span', i >= 2 && i <= 4 ? 'num' : ''); c.setAttribute('role', 'cell'); c.dataset.col = String(i);
            c.appendChild(el('span', 'lbl-movil', COLS[i] + ': ')); c.appendChild(document.createTextNode(x)); f.appendChild(c);
        });
        t.appendChild(f);
    }
    if (!G.gastos.length) tot.appendChild(el('p', 'vacio', 'Sin gastos todavía.'));
    tot.appendChild(t);
    v.appendChild(tot);

    const hechos = resueltos(G.gastos);
    if (hechos.length) {
        const d = el('details', 'mn-card gastos-card gastos-resueltos'); d.id = 'resueltosGastos';
        d.appendChild(el('summary', '', `Reembolsados y rechazados · ${hechos.length}`));
        const l2 = el('div', 'gastos-lista');
        for (const g of hechos) l2.appendChild(filaGasto(g, { conQuien: true }));
        d.appendChild(l2); v.appendChild(d);
    }
}

/** La fecha del ticket en columna (dia grande, mes corto), como la columna de fecha de Mis tareas. */
function columnaFecha(iso) {
    const c = el('div', 'gasto-fecha'); const d = diaDe(iso);
    if (!d) { c.classList.add('sin'); c.appendChild(el('b', '', '—')); c.appendChild(el('span', '', 'sin fecha')); return c; }
    const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    c.appendChild(el('b', '', String(Number(d.slice(8, 10)))));
    c.appendChild(el('span', '', MESES[Number(d.slice(5, 7)) - 1] || ''));
    return c;
}

/** Un renglon de gasto. opts.conQuien: nombra al solicitante (y a quien lo capturo, si fue otra persona); opts.tesoreria: los botones. */
function filaGasto(g, { conQuien = false, tesoreria = false } = {}) {
    const f = el('div', 'gasto'); f.dataset.gasto = String(g.id); f.dataset.estado = g.Estado || '';
    f.appendChild(columnaFecha(g.Fecha));
    const cuerpo = el('div', 'gasto-cuerpo');
    cuerpo.appendChild(el('div', 'titulo', g.Title || '(sin concepto)'));
    const meta = el('div', 'gasto-meta');
    if (conQuien) {
        const q = el('span', 'quien', nombre(g.Solicitante)); q.title = String(g.Solicitante || ''); meta.appendChild(q);
        if (g.CapturadoPor && bajo(g.CapturadoPor) !== bajo(g.Solicitante)) meta.appendChild(el('span', 'capturo', 'capturó ' + nombre(g.CapturadoPor)));
    }
    const p = Number(g.ProyectoId) > 0 ? porId(estado.proyectos, g.ProyectoId) : null;
    meta.appendChild(el('span', '', [p ? p.Title : null, equipoDe({ Equipo: g.Equipo }).nombre].filter(Boolean).join(' · ')));
    if (g.Categoria) meta.appendChild(el('span', '', g.Categoria));
    cuerpo.appendChild(meta);
    if (g.Notas) cuerpo.appendChild(el('div', 'gasto-nota', g.Notas));
    if (g.Estado === 'rechazado') cuerpo.appendChild(el('div', 'gasto-alerta', `Rechazado${g.RechazadoPor ? ' por ' + nombre(g.RechazadoPor) : ''}${g.RechazadoEl ? ' el ' + fechaCorta(g.RechazadoEl) : ''}: ${g.MotivoRechazo || 'sin motivo'}`));
    if (g.Estado === 'reembolsado' && g.ReembolsadoEl) cuerpo.appendChild(el('div', 'gasto-meta', `Reembolsado el ${fechaCorta(g.ReembolsadoEl)}${g.ReembolsadoPor ? ' por ' + nombre(g.ReembolsadoPor) : ''}`));
    if (yaReembolsadoAntes(g)) { const a = el('div', 'gasto-alerta ya-reembolsado', `Ojo: ya se había marcado reembolsado el ${fechaCorta(g.ReembolsadoEl)}${g.ReembolsadoPor ? ' por ' + nombre(g.ReembolsadoPor) : ''}. Revisa que no se pague dos veces.`); cuerpo.appendChild(a); }
    f.appendChild(cuerpo);
    f.appendChild(el('div', 'monto num', formatoMonto(g.Monto, g.Moneda)));
    const est = el('div', 'gasto-estado');
    const e = etiquetaEstado(g.Estado); est.appendChild(chip(e.texto, e.clase));
    const cf = etiquetaCfdi(g.CfdiEstado); if (cf) { const c = chip(cf.texto, cf.clase || undefined); c.classList.add('cfdi'); est.appendChild(c); }
    if (g.ComprobanteItemId) est.appendChild(boton('Ver comprobante', 'mn-btn is-sm', () => verComprobante(g.id), { verComprobante: g.id }));
    else {
        est.appendChild(chip('sin comprobante'));
        if (puedeAgregarComprobante(g)) est.appendChild(boton('Agregar comprobante', 'mn-btn is-sm', () => elegirYAgregar(g.id), { agregarComprobante: g.id }));
    }
    if (tesoreria && g.Estado === 'registrado') {
        est.appendChild(boton('Marcar reembolsado', 'mn-btn is-sm is-primary', () => marcarReembolsado(g.id), { reembolsar: g.id }));
        est.appendChild(boton('Rechazar', 'mn-btn is-sm', () => rechazarGasto(g.id), { rechazar: g.id }));
    }
    f.appendChild(est);
    return f;
}

// ---------------------------------------------------------------- contabilidad: CFDI por confirmar (decision 8)

/** #gastos/contabilidad: lo que la tarea semanal propuso, cada gasto con sus candidatos y «Confirmar este» / «Ninguno es». */
function pintarContabilidad(v) {
    const cola = porConfirmarCfdi(G.gastos);
    const mes = fechaMexico().slice(0, 7);
    const conf = confirmadosDelMes(G.gastos, mes);
    v.appendChild(kpis('cfdiKpis', [
        ['por-confirmar', 'Por confirmar', String(cola.length), `${plural(cola.length, 'gasto')} con candidatos de la tarea semanal`],
        ['confirmados-mes', 'Confirmados este mes', String(conf.total), `${conf.porTarea} ${conf.porTarea === 1 ? 'lo marcó' : 'los marcó'} la tarea sola (candidato único)`],
        ['sin-cfdi', 'Sin CFDI', String(G.gastos.filter(g => g.CfdiEstado === 'sin-cfdi' && g.Estado !== 'rechazado').length), 'es normal: no todo gasto trae factura']
    ]));

    const card = tarjeta('colaCfdi', 'CFDI por confirmar', cola.length);
    card.appendChild(el('p', 'muted', 'Cada semana la tarea busca en el SAT facturas recibidas con el mismo total, al centavo, y a 30 días o menos de la fecha del gasto. Elige la que corresponde; si ninguna es, ya no se vuelven a proponer para ese gasto.'));
    const lista = el('div', 'gastos-lista');
    for (const g of cola) {
        const bloque = el('div', 'cfdi-gasto'); bloque.dataset.cfdiGasto = String(g.id);
        bloque.appendChild(filaGasto(g, { conQuien: true }));
        const { candidatos } = leerCandidatos(g.CfdiCandidatos);
        const cands = el('div', 'cfdi-candidatos'); cands.setAttribute('role', 'list'); cands.setAttribute('aria-label', `Facturas candidatas para «${g.Title || 'gasto'}»`);
        for (const c of candidatos) {
            const f = el('div', 'cfdi-cand'); f.setAttribute('role', 'listitem'); f.dataset.uuid = c.uuid;
            const d = el('div', 'cfdi-cand-datos');
            d.appendChild(el('div', 'cfdi-emisor', c.emisor || '(emisor sin nombre)'));
            const m = el('div', 'gasto-meta');
            m.appendChild(el('span', '', c.fecha ? 'factura del ' + fechaCorta(c.fecha + 'T18:00:00Z') : 'sin fecha'));
            if (c.rfc) m.appendChild(el('span', '', c.rfc));
            const u = el('span', 'cfdi-uuid', 'UUID ' + uuidCorto(c.uuid)); u.title = c.uuid; m.appendChild(u);
            d.appendChild(m);
            f.appendChild(d);
            f.appendChild(el('div', 'monto num', formatoMonto(c.total, 'MXN')));
            f.appendChild(boton('Confirmar este', 'mn-btn is-sm is-primary', () => confirmarCfdi(g.id, c.uuid), { confirmarCfdi: g.id + '|' + c.uuid }));
            cands.appendChild(f);
        }
        bloque.appendChild(cands);
        const pie = el('div', 'cfdi-pie');
        pie.appendChild(boton('Ninguno es', 'mn-btn is-sm', () => ningunoCfdi(g.id), { ningunoCfdi: g.id }));
        bloque.appendChild(pie);
        lista.appendChild(bloque);
    }
    if (!cola.length) card.appendChild(el('p', 'vacio', 'No hay CFDI por confirmar. La tarea semanal propone aquí lo que encuentre; lo que tenía un solo candidato claro ya se marcó solo.'));
    card.appendChild(lista);
    v.appendChild(card);
}

/** Solo contabilidad. Antes de ligar, relee de SharePoint si ese UUID ya esta en otro gasto (CfdiUuid, indexada): un CFDI no se liga dos veces. */
export async function confirmarCfdi(id, uuid) {
    if (!esContabilidad()) { avisar('Solo contabilidad confirma el CFDI de un gasto.', 'error'); return false; }
    const g = porId(G.gastos, id); if (!g) { avisar('Ese gasto ya no existe.', 'ojo'); return false; }
    const u = String(uuid || '').trim().toUpperCase();
    if (g.CfdiEstado !== 'propuesto' || !leerCandidatos(g.CfdiCandidatos).candidatos.some(c => c.uuid === u)) { avisar('Ese CFDI ya no está propuesto para este gasto.', 'ojo'); return false; }
    let otro = ligadoEnOtro(G.gastos, u, g.id);
    if (!otro) {
        try { otro = ligadoEnOtro(await estado.cliente.renglones(estado.siteId, L.gastos, `fields/CfdiUuid eq '${u.replace(/'/g, "''")}'`), u, g.id); }
        catch (e) { avisar('No se pudo revisar si ese CFDI ya está ligado: ' + motivo(e), 'error'); return false; }
    }
    if (otro) { avisar(`Ese CFDI ya está ligado a «${otro.Title || 'otro gasto'}» de ${nombre(otro.Solicitante)}. No se liga dos veces.`, 'error'); return false; }
    return escribirEstado(g, camposConfirmarCfdi(u, yo()), `CFDI confirmado: «${g.Title}» ↔ ${uuidCorto(u)}.`);
}
/** Solo contabilidad. Vuelve a sin-cfdi y guarda los UUID propuestos como descartados (la tarea no los re-propone). */
export async function ningunoCfdi(id) {
    if (!esContabilidad()) { avisar('Solo contabilidad descarta los CFDI propuestos.', 'error'); return false; }
    const g = porId(G.gastos, id); if (!g) { avisar('Ese gasto ya no existe.', 'ojo'); return false; }
    if (g.CfdiEstado !== 'propuesto') { avisar('Ese gasto ya no tiene CFDI propuestos.', 'ojo'); return false; }
    const n = leerCandidatos(g.CfdiCandidatos).candidatos.length;
    const r = await confirmar({ titulo: 'Ninguno es', texto: `«${g.Title}» (${formatoMonto(g.Monto, g.Moneda)}) queda sin CFDI y ${n === 1 ? 'esa factura ya no se vuelve' : `esas ${n} facturas ya no se vuelven`} a proponer para este gasto. Sin CFDI es un estado normal.`, ok: 'Ninguno es' });
    if (!r.ok) return false;
    return escribirEstado(g, camposNingunoCfdi(g.CfdiCandidatos), `Sin CFDI: «${g.Title}».`);
}

// ---------------------------------------------------------------- comprobante (biblioteca «Gastos»)

/** El drive de la biblioteca «Gastos» (una vez por sesion). Si falta la biblioteca, lo dice con su nombre. */
async function driveGastos() {
    if (G.driveId) return G.driveId;
    if (!await estado.cliente.existeLista(estado.siteId, CONFIG.bibliotecaGastos)) throw new Error(`falta la biblioteca «${CONFIG.bibliotecaGastos}» en el sitio (docs/rescate-erp-v1/gastos-instrucciones-carlos.md)`);
    G.driveId = await estado.cliente.driveDeLista(estado.siteId, CONFIG.bibliotecaGastos);
    return G.driveId;
}
/**
 * Sube el comprobante de `g` (ya tiene ID: va en el nombre) a «Gastos/AAAA-MM/» y lo liga en el renglon. Nunca sobrescribe:
 * si el nombre existe, prueba _2, _3… El PATCH solo lleva ComprobanteItemId/ComprobanteRuta (con If-Match; ante un 412 se
 * repite sin el: esos dos campos solo los escribe este paso, no se pisa nada ajeno).
 */
async function subirComprobante(g, archivo, prog = () => {}) {
    const driveId = await driveGastos();
    const dia = diaDe(g.Fecha); if (!dia) throw new Error('el gasto no tiene fecha');
    const tipo = tipoComprobante(archivo.name, archivo.type), ext = extComprobante(archivo.name, archivo.type);
    prog(`Preparando la carpeta ${dia.slice(0, 7)}…`);
    await estado.cliente.asegurarCarpetaEnDrive(driveId, dia.slice(0, 7), prog);
    const bytes = await archivo.arrayBuffer();
    let subido = null, ruta = null;
    for (let n = 1; n <= 20 && !subido; n++) {
        ruta = rutaComprobante(dia, nombreComprobante({ dia, id: g.id, tipo, concepto: g.Title, ext, n }));
        prog(`Subiendo ${ruta}…`);
        try { subido = await estado.cliente.subirADrive(driveId, ruta, bytes, archivo.type || 'application/octet-stream', prog); }
        catch (e) { if (e.status !== 409) throw e; }
    }
    if (!subido) throw new Error('ya hay 20 archivos con ese nombre en la carpeta');
    const campos = { ComprobanteItemId: subido.id, ComprobanteRuta: ruta };
    let r;
    try { r = await estado.cliente.actualizarRenglon(estado.siteId, L.gastos, g.id, campos, prog, g._etag); }
    catch (e) { if (!esConflicto(e)) throw e; r = await estado.cliente.actualizarRenglon(estado.siteId, L.gastos, g.id, campos, prog); }
    aplicarVivo(G.gastos, g.id, campos, r && r._etag, g);
    return ruta;
}
/** Agregar el comprobante a un gasto propio que quedo sin el (o cuya subida fallo): registrado, sin comprobante, y mio,
 *  capturado por mi, o tesoreria. */
export function puedeAgregarComprobante(g) {
    if (!g || g.Estado !== 'registrado' || g.ComprobanteItemId || !puedeRegistrar()) return false;
    return bajo(g.Solicitante) === bajo(yo()) || bajo(g.CapturadoPor) === bajo(yo()) || esTesoreria();
}
function elegirYAgregar(id) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf';
    inp.addEventListener('change', () => { if (inp.files && inp.files[0]) agregarComprobante(id, inp.files[0]); });
    inp.click();
}
/** Sube y liga el comprobante de un gasto ya registrado. Devuelve true si quedo. */
export async function agregarComprobante(id, archivo) {
    const g = porId(G.gastos, id);
    if (!g) { avisar('Ese gasto ya no existe.', 'ojo'); return false; }
    if (!puedeAgregarComprobante(g)) { avisar(puedeRegistrar() ? 'A ese gasto no se le puede agregar comprobante.' : 'Tu rol es de lectura: no puedes subir comprobantes.', 'error'); return false; }
    const v = comprobanteValido(archivo); if (!v.ok) { avisar(v.motivo, 'error'); return false; }
    try {
        await subirComprobante(g, archivo, m => avisar(m, 'ojo'));
        avisar(`Comprobante de «${g.Title}» guardado en ${CONFIG.bibliotecaGastos}.`, 'ok'); alCambiar(); return true;
    } catch (e) { avisar('No se pudo subir el comprobante: ' + motivo(e), 'error'); return false; }
}
/** Abre el comprobante en SharePoint: la ventana se abre DENTRO del clic (si no, el bloqueador la tapa) y despues se le pone la liga. */
async function verComprobante(id) {
    const g = porId(G.gastos, id); if (!g || !g.ComprobanteItemId) return;
    const w = window.open('', '_blank');
    try {
        const it = await estado.cliente.itemDeDriveId(await driveGastos(), g.ComprobanteItemId);
        const url = hrefSeguro(it.url, { tipo: 'archivado', host: CONFIG.sharepointHost });
        if (!url) throw new Error('la liga no es de SharePoint');
        if (w) { w.opener = null; w.location.href = url; } else window.location.assign(url);
    } catch (e) { if (w) w.close(); avisar('No se pudo abrir el comprobante: ' + motivo(e), 'error'); }
}

// ---------------------------------------------------------------- tesoreria

/** PATCH con If-Match del renglon; ante un 412 relee (la verdad esta en SharePoint) y no pisa nada. */
async function escribirEstado(g, campos, ok) {
    try {
        const r = await estado.cliente.actualizarRenglon(estado.siteId, L.gastos, g.id, campos, m => avisar(m, 'ojo'), g._etag);
        aplicarVivo(G.gastos, g.id, campos, r && r._etag, g);
        avisar(ok, 'ok'); alCambiar(); return true;
    } catch (e) {
        if (esConflicto(e)) { await cargarGastos(); alCambiar(); avisar('Alguien cambió ese gasto hace un momento; ya se releyó. Revísalo y vuelve a intentarlo.', 'ojo'); return false; }
        avisar('No se pudo guardar: ' + motivo(e), 'error'); return false;
    }
}
/** Solo tesoreria (decision 7). Sella ReembolsadoPor/El. Si ya se habia sellado antes, pregunta (guarda contra el doble pago). */
export async function marcarReembolsado(id) {
    if (!esTesoreria()) { avisar('Solo tesorería marca un gasto como reembolsado.', 'error'); return false; }
    const g = porId(G.gastos, id); if (!g) { avisar('Ese gasto ya no existe.', 'ojo'); return false; }
    if (g.Estado !== 'registrado') { avisar(`Ese gasto ya está ${g.Estado}.`, 'ojo'); return false; }
    if (yaReembolsadoAntes(g)) {
        const r = await confirmar({ titulo: 'Este gasto ya se reembolsó una vez', texto: `«${g.Title}» se marcó reembolsado el ${fechaCorta(g.ReembolsadoEl)}${g.ReembolsadoPor ? ' por ' + nombre(g.ReembolsadoPor) : ''} y después volvió a «registrado». Revisa que no se pague dos veces. ¿Marcarlo reembolsado otra vez?`, ok: 'Sí, marcar reembolsado' });
        if (!r.ok) return false;
    }
    return escribirEstado(g, camposReembolso(yo()), `Reembolsado: «${g.Title}» (${formatoMonto(g.Monto, g.Moneda)}).`);
}
/** Solo tesoreria. Pide el motivo (obligatorio); conserva el renglon y el comprobante; no toca el sello del reembolso. */
export async function rechazarGasto(id) {
    if (!esTesoreria()) { avisar('Solo tesorería rechaza un gasto.', 'error'); return false; }
    const g = porId(G.gastos, id); if (!g) { avisar('Ese gasto ya no existe.', 'ojo'); return false; }
    if (g.Estado !== 'registrado') { avisar(`Ese gasto ya está ${g.Estado}.`, 'ojo'); return false; }
    const r = await confirmar({ titulo: 'Rechazar gasto', texto: `«${g.Title}» de ${nombre(g.Solicitante)} (${formatoMonto(g.Monto, g.Moneda)}) no se reembolsará. El renglón y su comprobante se quedan; la persona ve el motivo.`, ok: 'Rechazar', motivo: true, etiquetaMotivo: 'Motivo del rechazo' });
    if (!r.ok) return false;
    return escribirEstado(g, camposRechazo(yo(), r.motivo), `Rechazado: «${g.Title}».`);
}

// ---------------------------------------------------------------- alta (dialogo)

let archivoElegido = null;
/** Abre «Registrar gasto». Tesoreria elige ademas para quien es (captura por el empleado). */
export function abrirNuevoGasto() {
    if (G.lista !== true) { avisar('Gastos aún no está habilitado: falta crear la lista.', 'error'); return; }
    if (!puedeRegistrar()) { avisar('Tu rol es de lectura: no puedes registrar gastos.', 'error'); return; }
    const porOtro = PUEDE_GASTO.porOtro(misRolesErp());
    $('gaParaCampo').classList.toggle('oculto', !porOtro);
    if (porOtro) {
        const personas = estado.roles.filter(r => r.Activo !== false && r.Title).sort((a, b) => String(a.Nombre || a.Title).localeCompare(String(b.Nombre || b.Title), 'es'));
        if (!personas.some(r => bajo(r.Title) === bajo(yo()))) personas.unshift({ Title: yo(), Nombre: nombre(yo()) });
        opciones($('gaPara'), personas, r => r.Title, r => r.Nombre || r.Title, null);
        $('gaPara').value = [...$('gaPara').options].find(o => bajo(o.value) === bajo(yo()))?.value || '';
    }
    $('gaFecha').value = fechaInput(fechaMexico());
    $('gaMonto').value = ''; $('gaMoneda').value = 'MXN'; $('gaConcepto').value = ''; $('gaNotas').value = ''; $('gaProgreso').textContent = '';
    opciones($('gaProyecto'), ordenarProyectos(activosDe(estado.proyectos)), p => p.id, p => p.Title, 'Sin proyecto (gasto del equipo)');
    opciones($('gaEquipo'), CONFIG.equipos, e => e.clave, e => e.nombre, '— elige —');
    opciones($('gaCategoria'), CATEGORIAS_GASTO, c => c, c => c[0].toUpperCase() + c.slice(1), 'Sin categoría');
    ponerArchivo(null);
    abrirDialogo('dlgGasto');
    $('gaMonto').focus();
}
function leerFormulario() {
    const txt = $('gaFecha').value.trim(); const dia = diaDeCampo(txt);
    return { dia, fechaError: !!txt && !dia, monto: $('gaMonto').value, concepto: $('gaConcepto').value, equipo: $('gaEquipo').value, notas: $('gaNotas').value, conComprobante: !!archivoElegido, hoy: fechaMexico() };
}
/** El boton dice QUE FALTA (patron de la maqueta); la etiqueta de Notas dice si es obligatoria. */
function revisarGasto() {
    const f = faltanGasto(leerFormulario());
    const b = $('gaGuardar');
    b.textContent = f.length ? 'Falta ' + enLista(f) : 'Registrar gasto';
    b.disabled = !!f.length; b.classList.toggle('is-primary', !f.length);
    $('gaNotasEtq').textContent = archivoElegido ? 'Notas (opcional)' : 'Sin comprobante: ¿por qué? · obligatoria';
}
function ponerArchivo(f) {
    if (f) { const v = comprobanteValido(f); if (!v.ok) { avisar(v.motivo, 'error'); f = null; } }
    archivoElegido = f || null;
    $('gaFoto').value = ''; $('gaArchivo').value = '';
    $('gaSinArchivo').classList.toggle('oculto', !!archivoElegido); $('gaConArchivo').classList.toggle('oculto', !archivoElegido);
    $('gaArchivoNombre').textContent = archivoElegido ? `${archivoElegido.name} · ${(archivoElegido.size / 1048576).toFixed(1)} MB` : '';
    revisarGasto();
}
async function guardarGasto(ev) {
    ev.preventDefault();
    if (G.lista !== true) { avisar('Gastos aún no está habilitado: falta crear la lista.', 'error'); return; }
    if (!puedeRegistrar()) { avisar('Tu rol es de lectura: no puedes registrar gastos.', 'error'); return; }
    const f = leerFormulario();
    const faltan = faltanGasto(f);
    if (faltan.length) { avisar('Falta ' + enLista(faltan) + '.', 'error'); return; }
    const largo = largoInvalido(f); if (largo) { avisar(largo, 'error'); return; }
    const archivo = archivoElegido;
    if (archivo) { const v = comprobanteValido(archivo); if (!v.ok) { avisar(v.motivo, 'error'); return; } }
    const para = PUEDE_GASTO.porOtro(misRolesErp()) && $('gaPara').value ? $('gaPara').value : yo();
    const campos = camposGasto({ fechaIso: aIsoDia(f.dia), monto: f.monto, moneda: $('gaMoneda').value, concepto: f.concepto, categoria: $('gaCategoria').value,
        equipo: f.equipo, proyectoId: $('gaProyecto').value, solicitante: para, capturadoPor: yo(), notas: f.notas });
    const prog = t => { $('gaProgreso').textContent = t; };
    $('gaGuardar').disabled = true;
    let n;
    try {
        if (archivo) { prog(`Abriendo la biblioteca ${CONFIG.bibliotecaGastos}…`); await driveGastos(); }   // si falla aqui no se escribio nada
        prog('Registrando el gasto…');
        n = agregarSinDuplicar(G.gastos, await estado.cliente.crearRenglon(estado.siteId, L.gastos, campos, prog));
    } catch (e) { prog(''); avisar('No se pudo registrar el gasto: ' + motivo(e), 'error'); revisarGasto(); return; }
    let aviso = para === yo() ? 'Gasto registrado. Tesorería ya lo ve.' : `Gasto registrado para ${nombre(para)}.`, clase = 'ok';
    if (archivo) {
        try { await subirComprobante(n, archivo, prog); }
        catch (e) { aviso = `El gasto quedó registrado, pero el comprobante no se subió (${motivo(e)}). Súbelo con «Agregar comprobante» en el gasto.`; clase = 'error'; }
    }
    archivoElegido = null;
    cerrarDialogo('dlgGasto');
    avisar(aviso, clase);
    alCambiar();
}

// ---------------------------------------------------------------- enganche (una vez)

export function engancharGastos() {
    campoFecha('gaFecha');
    $('btnNuevoGasto').addEventListener('click', () => abrirNuevoGasto());
    $('formGasto').addEventListener('submit', guardarGasto);
    for (const id of ['gaFecha', 'gaMonto', 'gaConcepto', 'gaNotas']) $(id).addEventListener('input', revisarGasto);
    $('gaEquipo').addEventListener('change', revisarGasto);
    $('gaProyecto').addEventListener('change', () => {
        const p = porId(estado.proyectos, $('gaProyecto').value);
        if (p && CONFIG.equipos.some(e => e.clave === p.Equipo)) $('gaEquipo').value = p.Equipo;
        revisarGasto();
    });
    $('gaTomar').addEventListener('click', () => $('gaFoto').click());
    $('gaElegir').addEventListener('click', () => $('gaArchivo').click());
    for (const id of ['gaFoto', 'gaArchivo']) $(id).addEventListener('change', () => { const f = $(id).files && $(id).files[0]; if (f) ponerArchivo(f); });
    $('gaQuitar').addEventListener('click', () => ponerArchivo(null));
    $('gaCancelar').addEventListener('click', () => cerrarDialogo('dlgGasto'));
    $('gaCerrar').addEventListener('click', () => cerrarDialogo('dlgGasto'));
}
