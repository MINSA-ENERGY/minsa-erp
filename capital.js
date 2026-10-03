// MINSA Proyectos — v0.100.0: Capital de trabajo (Carlos, 25-sep: «una nueva pestaña para calcular cuánto capital de trabajo
// falta / es necesario … y que se ligue a algún proyecto»). Partidas ESTIMADAS en PROY_Capital (necesidad | fondeo, MXN),
// cada una con su ProyectoId. Solo gerencia la ve y la edita. Las cuentas son puras (reglas.js: resumenCapital,
// capitalPorProyecto, totalCapital, capitalPorMes, ordenarPartidas); aqui solo se pinta y se escribe.
// Sin bitacora en PROY_Actividad: su choice `Accion` no tiene opcion para esto y la actividad la lee todo el equipo.

import { esConflicto } from './graph.js';
import { PUEDE, CAPITAL_CATEGORIAS, CAPITAL_TIPOS, formatoMXN, leerMonto, validarPartida, resumenCapital, capitalPorProyecto, totalCapital, capitalPorMes, ordenarPartidas, ordenarProyectos, activosDe, diaDe, partidaVencida, plural } from './reglas.js';
import { $, L, estado, el, avisar, abrirDialogo, cerrarDialogo, confirmar, fijarGuarda, opciones, porId, aplicarVivo, agregarSinDuplicar, pedirRelectura, fechaCorta, aIsoDia, diaInput, fechaInput, limpiar, equipoDe, iconoEquipo, iconoSvg, fijarHash, hashDe, mayusculasEnVivo, conservarFoco } from './comun.js';
// v1.0.0 (rediseño, cubeta 2): la piel de la plantilla de reporte — cabecera, tarjetas y, en «Por mes» (#capital/mes), la gráfica con sus KPIs
import { cabecera, pintarReporte, vistaDe, descargar, ultimoCsv, soltarIdsFuera } from './reporte.js';
import { agrupar, fmtCorto, csv, nombreCsv, diaIso } from './reporte-reglas.js';
import { asegurarGuardados, guardarVista, estadoGuardados } from './guardados.js';
import { abrirGuardar } from './segmentos.js';

let repintar = () => {};
export function alCambiarCapital(fn) { repintar = fn; }
let irAProyecto = () => {};
/** app.js le pasa como abrir un proyecto (la cabecera de cada grupo lleva a su frente). */
export function fijarIrAProyecto(fn) { irAProyecto = fn; }

const MES_LARGO = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const MES_CORTO = new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const rotuloMes = mes => mes ? MES_LARGO.format(new Date(mes + '-01T12:00:00Z')) : 'Sin fecha';
const rotuloMesCorto = mes => mes ? MES_CORTO.format(new Date(mes + '-01T12:00:00Z')).replace('.', '') : 'Sin fecha';
const TIPO = Object.fromEntries(CAPITAL_TIPOS);
const COLUMNAS = [['c-concepto', 'Concepto', 'concepto'], ['c-tipo', 'Tipo', 'tipo'], ['c-cat', 'Categoría', 'categoria'], ['c-fecha', 'Fecha', 'fecha'], ['c-estado', 'Estado', 'estado'], ['c-monto', 'Monto', 'monto']];
const CICLO_MOVIL = ['fecha', 'monto', 'concepto'];   // U-09: lo que cicla el encabezado Concepto en celular

/** ¿Esta persona ve Capital? (rol + la lista leida). La lista ausente SI se ve: es donde se avisa que falta. */
export const puedeVerCapital = () => PUEDE.capital(estado.rol);

// C-05 (mejorar-app capital, 26-sep): lo que estaba escrito tres veces, una sola vez
const SOLO_GERENCIA = 'Solo gerencia ve y edita el capital de trabajo.';
// C-11 (mejorar-app capital, 30-sep): los dos literales que tambien estaban escritos dos veces
const FALTA_LISTA = 'Falta crear la lista PROY_Capital (ver README, «Al publicar v0.100.0»).';
const SIN_PARTIDAS_FRENTE = 'Este proyecto no tiene partidas todavía. «Nueva partida» agrega la primera.';
// C-09 (30-sep): con que data-* reconoce conservarFoco, tras repintar la hoja, el control que tenia el foco
const FOCO_HOJA = ['sort', 'partida', 'mas'];
const partidasDe = proyectoId => estado.capital.filter(x => Number(x.ProyectoId) === Number(proyectoId));
const nombreProyecto = p => p.Estado === 'activo' ? p.Title : `${p.Title} (cerrado)`;

/** Las partidas de un proyecto y su resumen (para la tarjeta del Resumen del proyecto). */
export function capitalDe(proyectoId) { return resumenCapital(partidasDe(proyectoId)); }

/** Proyectos que ofrece el select: los activos + los que ya tienen partidas (un cerrado con partidas se sigue viendo) + el elegido. */
function proyectosDelFiltro() {
    const ids = new Set(estado.capital.map(x => Number(x.ProyectoId)));
    if (estado.filtroCapital) ids.add(estado.filtroCapital);
    return ordenarProyectos(estado.proyectos.filter(p => p.Estado === 'activo' || ids.has(p.id)));
}

// v1.0.0: el botón «Nueva partida» y el filtro de proyecto viajan a la cabecera de la plantilla (se guardan sus nodos: la cabecera se repinta)
let refs = null;
const REF = () => refs || (refs = { btn: $('btnNuevaPartida'), filtro: $('capitalProyecto').closest('label') });
const SUB_TODOS = 'Capital de trabajo estimado por proyecto: lo necesario, lo cubierto y lo que falta. En pesos (MXN).';
const AYUDA_PROYECTO = 'Cómo se calcula: por proyecto, Necesario = la suma de sus necesidades (estimadas, comprometidas o pagadas); Cubierto = sus fondeos comprometidos o recibidos; Falta = Necesario − Cubierto (si sobra, se dice). La falta total suma lo que falta por frente: la sobra de uno no cubre a otro. Todo en pesos (MXN).';
const AYUDA_MES = 'Cómo se calcula: cada partida cae en el mes de su fecha estimada. «Falta acumulada» es lo que falta al cierre de cada mes, frente por frente, con lo necesitado y fondeado hasta ese mes; las partidas sin fecha van al final. La línea es esa falta acumulada; el globo dice además la necesidad del periodo. En pesos (MXN).';

export function pintarCapital() {
    const ver = puedeVerCapital(), porMes = estado.sub === 'mes';
    const { btn, filtro } = REF();
    btn.classList.toggle('oculto', !ver || estado.capitalLista !== true);
    filtro.classList.toggle('oculto', !ver || estado.capitalLista !== true);
    const aviso = $('capitalFalta');
    const falta = estado.capitalLista === false;
    aviso.classList.toggle('oculto', !falta && !estado.capitalError);
    aviso.classList.toggle('is-error', !falta && !!estado.capitalError);
    aviso.textContent = falta ? FALTA_LISTA + ' Mientras tanto no hay partidas que mostrar; el resto de la app funciona igual.'
        : estado.capitalError ? 'No se pudo leer PROY_Capital: ' + estado.capitalError : '';
    $('capitalCuerpo').classList.toggle('oculto', !ver || estado.capitalLista !== true);
    $('capitalPorProyecto').classList.toggle('oculto', porMes);
    $('capitalPorMes').classList.toggle('oculto', !porMes);
    if (!ver || estado.capitalLista !== true) { pintarCabecera(porMes, [], SUB_TODOS); return; }
    if (porMes) asegurarGuardados();
    // el filtro: un proyecto que ya no existe cae a «Todos»
    if (estado.filtroCapital && !porId(estado.proyectos, estado.filtroCapital)) estado.filtroCapital = null;
    const sel = $('capitalProyecto');
    opciones(sel, proyectosDelFiltro(), p => p.id, nombreProyecto, 'Todos los proyectos');
    sel.value = estado.filtroCapital ? String(estado.filtroCapital) : '';
    const partidas = estado.filtroCapital ? partidasDe(estado.filtroCapital) : estado.capital;
    const grupos = capitalPorProyecto(partidas, estado.proyectos);
    const t = totalCapital(grupos);
    const fp = estado.filtroCapital ? porId(estado.proyectos, estado.filtroCapital) : null;
    pintarCabecera(porMes, partidas, fp ? `Capital de trabajo estimado de «${fp.Title}». En pesos (MXN).` : SUB_TODOS);
    // U-04 (revisor-entregable, 26-sep): filtrado a UN frente, el resumen es el de ese frente (trae `sobra`); totalCapital no
    // la suma a proposito — con varios frentes la sobra de uno no cubre a otro
    pintarKpis(estado.filtroCapital && grupos.length === 1 ? grupos[0] : t);
    conservarFoco($('capitalTabla'), FOCO_HOJA, () => pintarTabla(grupos, partidas.length));   // C-09
    pintarMeses(partidas);
}

/** La cabecera de la plantilla; en «Por mes» (#capital/mes), además la tarjeta 1 de la maqueta: la falta acumulada por mes y sus KPIs. */
function pintarCabecera(porMes, partidas, sub) {
    const cont = $('capitalCab'), { btn, filtro } = REF();
    const acciones = [filtro, btn];
    const foco = [btn, filtro.querySelector('select')].find(x => x === document.activeElement);   // moverlos a la cabecera nueva les quita el foco
    if (!porMes) conservarFoco(cont, ['rp'], () => { soltarIdsFuera(cont); cont.textContent = ''; cont.appendChild(cabecera({ id: 'capital-proyecto', titulo: 'Capital por proyecto', ayuda: AYUDA_PROYECTO, acciones, sub, subId: 'capitalSub' }, vistaDe('capital-proyecto'), () => repintar())); });
    else pintarMes(cont, acciones, partidas, sub);
    if (foco && document.activeElement !== foco) foco.focus();
}
function pintarMes(cont, acciones, partidas, sub) {
    const meses = capitalPorMes(partidas), conFecha = meses.filter(m => m.mes), sinFecha = meses.find(m => !m.mes);
    const guardar = b => {
        const g = estadoGuardados(), w = vistaDe('capital-mes');
        abrirGuardar(b, { notaGuardar: g.modo === 'local' ? g.nota : '' }, { sugerido: 'Capital por mes', alGuardar: (titulo, compartida) => guardarVista({ titulo, compartida, modulo: 'dinero', definicion: { tipo: 'reporte', ruta: '#capital/mes', vistaId: 'capital-mes', vista: { grano: w.grano, tipo: w.tipo } } }).then(() => repintar()) });
    };
    pintarReporte(cont, {
        id: 'capital-mes', titulo: 'Capital por mes', ayuda: AYUDA_MES, acciones, sub, subId: 'capitalSub', ojo: true, guardar,
        grafica: { tipos: true, grano: true, moneda: () => 'MXN', incTexto: 'necesidad del periodo', vacio: 'Sin partidas con fecha que repartir por mes.',
            datos: v => ({ puntos: agrupar(conFecha.map(m => ({ k: m.mes, v: m.faltaAcumulada, inc: m.necesidad })), v.grano).map(p => ({ etiqueta: p.etiqueta, y: p.v, inc: p.inc })) }) },
        kpis: () => {
            const fin = meses.length ? meses[meses.length - 1].faltaAcumulada : 0, ult = conFecha[conFecha.length - 1], sum = k => meses.reduce((s, m) => s + (m[k] || 0), 0);
            return [{ clave: 'falta', valor: fmtCorto(fin, 'MXN'), texto: 'falta al final', clase: fin > 0 ? 'neg' : '' },
                { clave: 'necesidad', valor: fmtCorto(sum('necesidad'), 'MXN'), texto: 'necesidad total' },
                { clave: 'fondeo', valor: fmtCorto(sum('fondeo'), 'MXN'), texto: 'fondeo total' },
                { clave: 'ultimo', valor: ult ? rotuloMesCorto(ult.mes) : '—', texto: 'último mes con partidas' },
                { clave: 'sinfecha', valor: String(sinFecha ? sinFecha.n : 0), texto: 'partidas sin fecha' }];
        }
    });
}
/** «Exportar» de la tabla por mes (CSV con BOM para Excel). */
function exportarMeses() {
    const partidas = estado.filtroCapital ? partidasDe(estado.filtroCapital) : estado.capital;
    const filas = capitalPorMes(partidas).map(m => [m.mes || 'Sin fecha', m.necesidad, m.fondeo, m.faltaAcumulada, m.n]);
    const nombre = nombreCsv('capital-por-mes', diaIso(new Date())), texto = csv(['Mes', 'Necesidad', 'Fondeo', 'Falta acumulada', 'Partidas'], filas);
    ultimoCsv.nombre = nombre; ultimoCsv.texto = texto; descargar(nombre, texto);
}

// v0.101.0 (Carlos, 25-sep; artifact QSAqBmdn ronda 3): los 4 KPI salen. El total es UN renglon con la misma forma que la
// cabecera de cada proyecto (nombre a la izquierda; Necesario · Cubierto · Falta a la derecha): arriba y abajo se leen igual.
const PARTIDAS = n => `${n} ${plural(n, 'partida')}`;   // C-11 (30-sep): con plural(), no a mano

// v0.110.0 (Carlos, 25-sep: «que el encabezado así como la sección de abajo sea similar» a la hoja): el total ya no es
// tarjeta; es una hoja de UN renglon con la misma rejilla que las partidas (Resumen · Partidas · Necesario · Cubierto · Falta).
/** La hoja-resumen: `titulo` en la primera celda; data-kpi en cada celda (las pruebas leen su <b>). */
function hojaResumen(titulo, r) {
    const w = el('div', 'dtabla ctabla choja cresumen'); const t = el('table');
    const th = el('thead'); const h = el('tr');
    // U-11 (30-sep): la columna trae el conteo Y lo pagado/comprometido/sobra: «Detalle», no «Partidas»
    for (const [cls, texto] of [['c-concepto', 'Resumen'], ['c-n', 'Detalle'], ['c-monto', 'Necesario'], ['c-monto', 'Cubierto'], ['c-monto', 'Falta']]) { const c = el('th', cls, texto); c.scope = 'col'; h.appendChild(c); }
    th.appendChild(h); t.appendChild(th);
    const tb = el('tbody'); const tr = el('tr');
    const conteo = PARTIDAS(r.n) + (r.pagado ? ` · ${formatoMXN(r.pagado)} ya pagado` : '') + (r.comprometido ? ` · ${formatoMXN(r.comprometido)} comprometido` : '') + (r.sobra > 0 ? ` · ${formatoMXN(r.sobra)} de sobra` : '');   // R-02 (26-sep); R-04: comprometido
    // U-03 (26-sep): a 720 px la columna Detalle se esconde; U-08 (30-sep): el conteo baja al renglon .cres-fila (abajo)
    tr.appendChild(el('td', 'c-concepto cres-t', titulo));
    const n = el('td', 'c-n', conteo); n.dataset.kpi = 'n'; tr.appendChild(n);
    const celda = (clave, valor, cls = '') => { const td = el('td', 'c-monto'); td.dataset.kpi = clave; td.appendChild(el('b', cls, valor)); tr.appendChild(td); };
    celda('necesario', formatoMXN(r.necesario));
    celda('cubierto', formatoMXN(r.cubierto), 'is-ok');
    celda('falta', textoFalta(r), r.falta > 0 ? 'is-danger' : 'is-ok');
    tb.appendChild(tr);
    // U-08 (30-sep): en celular el conteo va en un renglon propio que cruza las 4 columnas visibles (antes se apilaba en ~110 px
    // bajo el titulo); en escritorio este renglon se esconde y el conteo vive en su columna
    const sub = el('tr', 'cres-fila'); const sc = el('td', 'cres-sub2', conteo); sc.colSpan = 4; sub.appendChild(sc); tb.appendChild(sub);
    t.appendChild(tb); w.appendChild(t);
    return w;
}

function pintarKpis(t) {
    const c = $('capitalKpis'); c.textContent = '';
    c.appendChild(hojaResumen(estado.filtroCapital ? 'Este proyecto' : 'Todos los proyectos', t));
}

// v0.109.0 (Carlos, 25-sep; artifact 7QYCC9Ly, opcion C «Excel literal»): el acordeon sale. Las partidas son UNA hoja:
// letras de columna y numero de fila, cada proyecto un renglon gris (nombre + su Falta) y al pie la falta total. Nada se pliega.
// v0.112.0 (Carlos, 25-sep): sale el renglon de letras A–F.

/** La hoja vacia: encabezado ordenable (con la columna de numero de fila) + tbody. */
function encabezado() {
    const w = el('div', 'dtabla ctabla choja'); const t = el('table'); const th = el('thead');
    const tr = el('tr'); tr.appendChild(el('th', 'rn'));
    const o = estado.ordenCapital;
    for (const [cls, texto, clave] of COLUMNAS) {
        const h = el('th', cls, texto); h.scope = 'col';
        const activo = o.col === clave;
        h.dataset.sort = clave; h.tabIndex = 0;
        h.title = activo ? `Ordenar por ${texto.toLowerCase()} ${o.dir === 1 ? 'descendente' : 'ascendente'}` : `Ordenar por ${texto.toLowerCase()}`;
        if (activo) h.setAttribute('aria-sort', o.dir === 1 ? 'ascending' : 'descending');
        // U-09 (30-sep): en celular solo se ven Concepto y Monto; el encabezado Concepto dice el orden vigente («por fecha ↑») y
        // tocarlo cicla fecha → monto → concepto (el de Monto sigue invirtiendo). En escritorio, igual que antes.
        const celular = () => window.matchMedia('(max-width: 720px)').matches;
        if (clave === 'concepto') {
            const col = COLUMNAS.find(c => c[2] === o.col);
            h.appendChild(el('span', 'c-orden', `por ${col ? col[1].toLowerCase() : o.col} ${o.dir === 1 ? '↑' : '↓'}`));
        }
        const elegir = () => {
            if (clave === 'concepto' && celular()) { const sig = CICLO_MOVIL[(CICLO_MOVIL.indexOf(o.col) + 1) % CICLO_MOVIL.length]; estado.ordenCapital = { col: sig, dir: sig === 'monto' ? -1 : 1 }; }
            else estado.ordenCapital = activo ? { col: clave, dir: -o.dir } : { col: clave, dir: clave === 'monto' ? -1 : 1 };
            repintar();   // v0.102.0: repintar() cubre la seccion y la pestaña del proyecto
        };
        h.addEventListener('click', elegir);
        h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } });
        tr.appendChild(h);
    }
    th.appendChild(tr); t.appendChild(th); t.appendChild(el('tbody')); w.appendChild(t);
    return w;
}

// U-04 (26-sep): la sobra de un frente sobre-fondeado se dice («sobra $X» en verde); antes salia «—», igual que un frente
// cuadrado al centavo. Los totales de varios frentes no traen `sobra` (totalCapital suma faltas): ahi sigue «—».
const textoFalta = r => r.falta > 0 ? formatoMXN(r.falta) : r.sobra > 0 ? 'sobra ' + formatoMXN(r.sobra) : '—';
const celdaFalta = (r, conRotulo) => {
    const td = el('td', 'c-monto ' + (r.falta > 0 ? 'is-danger' : 'is-ok'));
    if (conRotulo && !(r.falta <= 0 && r.sobra > 0)) td.appendChild(el('span', 'rot', 'falta'));
    td.appendChild(document.createTextNode(textoFalta(r)));
    return td;
};

// v0.110.0: el renglon de grupo y el pie ya no usan colSpan=5 — en celular las 4 columnas chicas se esconden y el colSpan
// dejaba una columna fantasma a la derecha; ahora llevan sus 4 celdas vacias (se esconden con las demas).
const vacias = tr => { for (const c of ['c-tipo', 'c-cat', 'c-fecha', 'c-estado']) tr.appendChild(el('td', c)); };

/** Pie de la hoja: la falta total (C-15, v0.114.0: sin el parametro de numero de fila, que ya no se leia desde v0.111.0). */
function pie(t, r, rotulo = 'FALTA TOTAL (necesario − fondeo)') {
    const tf = el('tfoot'); const tr = el('tr');
    tr.appendChild(el('td', 'rn'));   // v0.111.0: solo los frentes llevan numero
    tr.appendChild(el('td', 'c-concepto', rotulo)); vacias(tr);
    tr.appendChild(celdaFalta(r, false)); tf.appendChild(tr); t.appendChild(tf);
}

function pintarTabla(grupos, n) {
    const cont = $('capitalTabla'); cont.textContent = '';
    if (!n) {
        cont.appendChild(el('p', 'vacio', estado.filtroCapital ? SIN_PARTIDAS_FRENTE : 'Sin partidas todavía. «Nueva partida» agrega la primera: un concepto, el proyecto y el monto estimado.'));
        return;
    }
    const w = encabezado(); const tb = w.querySelector('tbody'); let fila = 1;
    for (const g of grupos) {
        const tr = el('tr', 'cgrupo'); tr.dataset.capitalProyecto = String(g.proyectoId);
        const num = (fila++) + '.'; tr.appendChild(el('td', 'rn', num));   // v0.111.0 (Carlos): «1. OTROS, 2. …» — numero solo en el frente
        const td = el('td', 'c-concepto');
        if (g.proyecto) {
            const b = el('button', 'cgrupo-nombre', nombreProyecto(g.proyecto));
            b.type = 'button'; b.title = 'Abrir el proyecto';
            const pid = g.proyectoId;   // C-04 (26-sep): el id, no el objeto (regla v0.4.0)
            b.addEventListener('click', () => irAProyecto(pid));
            td.appendChild(b);
        } else td.appendChild(el('span', 'cgrupo-nombre', `Proyecto eliminado (#${g.proyectoId})`));
        // v0.113.0 (Carlos): en celular la columna .rn se esconde; el numero va DENTRO del nombre (un <button> no parte renglon con lo de fuera)
        td.firstChild.prepend(el('span', 'cnum', num));
        // R-05 (26-sep): «+ partida» en el renglon del frente abre el dialogo con ese proyecto ya puesto (fijo, como en su
        // pestaña). Capital solo la ve gerencia, que es quien escribe: no hace falta otra guarda. Sin boton en un eliminado.
        if (g.proyecto) {
            const mas = el('button', 'cgrupo-mas', '+ partida'); mas.type = 'button'; mas.title = 'Agregar una partida a este proyecto'; mas.dataset.mas = String(g.proyectoId);   // C-09: llave de conservarFoco
            const pid = g.proyectoId; mas.addEventListener('click', () => abrirPartida(null, pid));
            td.appendChild(mas);
        }
        tr.appendChild(td); vacias(tr); tr.appendChild(celdaFalta(g, true)); tb.appendChild(tr);
        for (const x of ordenarPartidas(g.partidas, estado.ordenCapital.col, estado.ordenCapital.dir)) tb.appendChild(filaPartida(x));
    }
    // U-04: con varios frentes la falta total es la SUMA de faltas (la sobra de uno no cubre a otro), no necesario − fondeo
    pie(w.querySelector('table'), totalCapital(grupos), 'FALTA TOTAL (suma de lo que falta por frente)');
    cont.appendChild(w);
}

/** La hoja de UN proyecto (su pestaña): sin renglon de grupo, con su falta al pie. */
function tablaPartidas(partidas) {
    const w = encabezado(); const tb = w.querySelector('tbody');
    for (const x of ordenarPartidas(partidas, estado.ordenCapital.col, estado.ordenCapital.dir)) tb.appendChild(filaPartida(x));
    pie(w.querySelector('table'), resumenCapital(partidas));
    return w;
}

/** v0.102.0 (Carlos, 25-sep): la pestaña «Capital» DENTRO del proyecto — su total (misma forma que la seccion) y sus partidas. */
export function pintarCapitalTab(p) {
    const tot = $('pcapTotal'); tot.textContent = '';
    const mias = partidasDe(p.id);
    tot.appendChild(hojaResumen('Capital de trabajo', resumenCapital(mias)));
    const cont = $('pcapTabla');
    conservarFoco(cont, FOCO_HOJA, () => {   // C-09
        cont.textContent = '';
        cont.appendChild(mias.length ? tablaPartidas(mias) : el('p', 'vacio', SIN_PARTIDAS_FRENTE));
    });
}

const mayuscula = s => s ? s.charAt(0).toLocaleUpperCase('es-MX') + s.slice(1) : s;

function filaPartida(x) {
    const tr = el('tr', 'partida' + (x.Tipo === 'fondeo' ? ' is-fondeo' : '')); tr.dataset.partida = String(x.id);
    tr.appendChild(el('td', 'rn'));
    const tdc = el('td', 'c-concepto');
    const b = el('button', 'partida-t'); b.type = 'button'; b.title = 'Editar la partida'; b.dataset.partida = String(x.id);   // C-09: llave de conservarFoco
    b.appendChild(el('span', 'pt', x.Title || '(sin concepto)'));
    b.addEventListener('click', () => abrirPartida(x.id));
    tdc.appendChild(b);
    // en celular las columnas chicas se esconden y este renglon las dice (estilo.css .ctabla .p). U-01 (26-sep): va DENTRO
    // del boton, que ocupa la celda entera: el objetivo de toque deja de ser el texto de 17 px. U-06: con mayuscula inicial,
    // como las columnas de escritorio. U-05: «con nota» — el title no existe en el celular.
    // R-03 (26-sep): la fecha ya pasada de una partida que sigue estimada o comprometida va en rojo (columna y renglon .p)
    const vencida = partidaVencida(x), AVISO_VENCIDA = 'La fecha ya pasó y la partida sigue «' + x.Estado + '»';
    // C-11 (30-sep): fecha, tipo, categoria y estado se calculan una vez por renglon (antes, dos: el .p y las columnas)
    const fecha = x.Fecha ? fechaCorta(x.Fecha) : '', tipo = TIPO[x.Tipo] || x.Tipo, cat = mayuscula(x.Categoria), est = mayuscula(x.Estado);
    const p = el('span', 'p');
    const fechaP = fecha || 'sin fecha';
    [tipo, cat, fechaP, est, x.Notas ? 'con nota' : ''].filter(Boolean).forEach((s, i) => {
        if (i) p.appendChild(document.createTextNode(' · '));
        // U-10 (30-sep): el porque del rojo, visible — el title no existe en el celular
        if (vencida && s === fechaP) { const f = el('span', 'is-danger', s); f.title = AVISO_VENCIDA; p.appendChild(f); p.appendChild(el('span', 'is-danger venc', ', vencida')); } else p.appendChild(document.createTextNode(s));
    });
    b.appendChild(p);
    if (x.Notas) { tdc.title = x.Notas; tdc.appendChild(el('span', 'cnota', 'nota')); }
    tr.appendChild(tdc);
    tr.appendChild(el('td', 'c-tipo tipo-' + (x.Tipo || 'otro'), tipo || '—'));
    tr.appendChild(el('td', 'c-cat', cat || '—'));
    const tdf = el('td', 'c-fecha' + (vencida ? ' is-danger' : ''), fecha || '—');
    if (vencida) tdf.title = AVISO_VENCIDA;
    tr.appendChild(tdf);
    tr.appendChild(el('td', 'c-estado estado-' + (x.Estado || ''), est || '—'));
    tr.appendChild(el('td', 'c-monto', (x.Tipo === 'fondeo' ? '− ' : '') + formatoMXN(x)));   // v0.109.0: el fondeo RESTA en la hoja
    return tr;
}

function pintarMeses(partidas) {
    const cont = $('capitalMeses'); cont.textContent = '';
    const meses = capitalPorMes(partidas);
    if (!meses.length) { cont.appendChild(el('p', 'vacio', 'Sin partidas que repartir por mes.')); return; }
    // v0.110.0: la tabla por mes es la misma hoja (rejilla, cifras tabulares) con su renglon TOTAL al pie
    const w = el('div', 'dtabla ctabla choja cmeses'); const t = el('table'); const th = el('thead'); const tr = el('tr');
    for (const [cls, texto] of [['c-mes', 'Mes'], ['c-monto', 'Necesidad'], ['c-monto', 'Fondeo'], ['c-monto c-acum', 'Falta acumulada'], ['c-n', 'Partidas']]) { const h = el('th', cls, texto); h.scope = 'col'; tr.appendChild(h); }
    th.appendChild(tr); t.appendChild(th); const tb = el('tbody'); t.appendChild(tb);
    // R-01 (26-sep): lo que falta al cierre de cada mes (reglas.js capitalPorMes); rojo si falta, «—» si ya esta cubierto
    const acum = v => el('td', 'c-monto c-acum ' + (v > 0 ? 'is-danger' : 'is-ok'), v > 0 ? formatoMXN(v) : '—');
    for (const m of meses) {
        const f = el('tr', 'mes'); f.dataset.mes = m.mes || 'sin-fecha';
        // U-13 (30-sep): en celular el mes va corto («sep 2026», una linea); el largo queda en el title y en escritorio
        const tm = el('td', 'c-mes'); tm.title = rotuloMes(m.mes);
        tm.appendChild(el('span', 'mes-l', rotuloMes(m.mes))); tm.appendChild(el('span', 'mes-c', rotuloMesCorto(m.mes))); f.appendChild(tm);
        f.appendChild(el('td', 'c-monto', formatoMXN(m.necesidad)));
        f.appendChild(el('td', 'c-monto', m.fondeo ? '− ' + formatoMXN(m.fondeo) : '—'));   // U-02 (26-sep): el mismo signo que la hoja (el fondeo RESTA)
        f.appendChild(acum(m.faltaAcumulada));
        f.appendChild(el('td', 'c-n', String(m.n)));
        tb.appendChild(f);
    }
    const sum = k => meses.reduce((s, m) => s + (m[k] || 0), 0);
    const tf = el('tfoot'); const ft = el('tr');
    ft.appendChild(el('td', 'c-mes', 'TOTAL'));
    ft.appendChild(el('td', 'c-monto', formatoMXN(sum('necesidad'))));
    ft.appendChild(el('td', 'c-monto', sum('fondeo') ? '− ' + formatoMXN(sum('fondeo')) : '—'));
    ft.appendChild(acum(meses[meses.length - 1].faltaAcumulada));
    ft.appendChild(el('td', 'c-n', String(sum('n'))));
    tf.appendChild(ft); t.appendChild(tf);
    w.appendChild(t); cont.appendChild(w);
}

/** La tarjeta «Capital de trabajo» del Resumen del proyecto (solo gerencia, y solo con la lista existente). */
export function pintarCapitalProyecto(p) {
    const card = $('pCapital');
    const ver = puedeVerCapital() && estado.capitalLista === true && !!p;
    card.classList.toggle('oculto', !ver);
    if (!ver) return;
    const r = capitalDe(p.id);
    const kv = $('pCapitalKv'); kv.textContent = '';
    const par = (k, v, cls) => { kv.appendChild(el('b', '', k)); kv.appendChild(el('span', cls || '', v)); };
    if (!r.n) { par('Partidas', 'ninguna todavía'); }
    else {
        if (r.falta <= 0 && r.sobra > 0) par('Sobra', formatoMXN(r.sobra), 'is-ok');   // U-04 (26-sep): antes decia «Falta $0.00»
        else par('Falta', formatoMXN(r.falta), r.falta > 0 ? 'is-danger' : 'is-ok');
        par('Necesario', formatoMXN(r.necesario)); par('Cubierto', formatoMXN(r.cubierto));
        if (r.pagado) par('Ya pagado', formatoMXN(r.pagado));
    }
    $('pCapitalIr').textContent = r.n ? `Ver las ${r.n} ${plural(r.n, 'partida')}` : 'Agregar una partida';   // C-11 (30-sep): sin data-clave, que nadie leia
}

// ---------------------------------------------------------------- nueva / editar / borrar partida

let enEdicionId = null, alAbrir = '', preguntando = false;
// C-07 (30-sep): la foto de la partida al abrir el dialogo. El PATCH lleva solo lo que el formulario cambio CONTRA ESTA FOTO, no
// contra el renglon vivo: tras un 412 la relectura trae lo que cambio otra persona, y comparar contra el vivo lo devolvia a lo viejo.
let antes = null;
// C-08 (30-sep): una escritura (PATCH/POST/DELETE) en vuelo bloquea Guardar, Borrar y Cancelar hasta que vuelve
let enVuelo = false;
const BOTONES_DLG = ['cpGuardar', 'cpBorrar', 'cpCancelar'];
const bloquear = si => { enVuelo = si; for (const id of BOTONES_DLG) $(id).disabled = si; };
const ROTULO_PARTIDA = { Title: 'concepto', ProyectoId: 'proyecto', Tipo: 'tipo', Monto: 'monto', Categoria: 'categoría', Fecha: 'fecha', Estado: 'estado', Notas: 'notas' };
const CAMPOS = ['cpConcepto', 'cpProyecto', 'cpTipo', 'cpMonto', 'cpFecha', 'cpCategoria', 'cpEstado', 'cpNotas'];
const valores = () => JSON.stringify(CAMPOS.map(id => $(id).value));
const sucio = () => $('dlgPartida').open && valores() !== alAbrir;
// U-12 (30-sep): un fondeo no lleva categoria (en la hoja siempre salia «—»): el campo se esconde y leerForma lo manda vacio
const conCategoria = () => $('cpCategoria').closest('.mn-field').classList.toggle('oculto', $('cpTipo').value === 'fondeo');

/** v0.103.0: con `proyectoId` (pestaña Capital del proyecto) el select Proyecto nace fijo en ese frente y no se mueve. */
export function abrirPartida(id, proyectoId = null) {
    if (!puedeVerCapital()) { avisar(SOLO_GERENCIA, 'error'); return; }
    if (estado.capitalLista !== true) { avisar(FALTA_LISTA, 'error'); return; }
    const x = id ? porId(estado.capital, id) : null;
    if (id && !x) { avisar('Esa partida ya no existe: alguien la borró.', 'error'); return; }
    enEdicionId = x ? x.id : null;
    $('cpTituloDlg').textContent = x ? 'Editar partida' : 'Nueva partida';
    $('cpGuardar').textContent = x ? 'Guardar cambios' : 'Guardar partida';
    $('cpBorrar').classList.toggle('oculto', !x);
    const lista = ordenarProyectos(activosDe(estado.proyectos));
    // C-02 (26-sep): sin partida ni proyecto fijo, el frente del filtro de la seccion tambien cuenta — un cerrado filtrado
    // dejaba el select vacio porque no estaba entre las opciones (solo activos)
    const pidInicial = x ? x.ProyectoId : proyectoId || estado.filtroCapital;
    const actual = pidInicial ? porId(estado.proyectos, pidInicial) : null;
    if (actual && !lista.includes(actual)) lista.unshift(actual);
    opciones($('cpProyecto'), lista, p => p.id, nombreProyecto, '— elige el proyecto —');
    if (x && !actual) { const o = el('option', '', `Proyecto eliminado (#${x.ProyectoId})`); o.value = String(x.ProyectoId); $('cpProyecto').appendChild(o); }
    // v0.103.0 (Carlos, 25-sep): Categoría es un plegable; una categoria vieja escrita a mano se conserva como opcion extra.
    const cats = [...CAPITAL_CATEGORIAS]; if (x && x.Categoria && !cats.includes(x.Categoria)) cats.push(x.Categoria);
    opciones($('cpCategoria'), cats, c => c, mayuscula, '— elige la categoría —');   // U-06: se ve con mayuscula; el value no cambia
    $('cpConcepto').value = x ? x.Title || '' : '';
    $('cpProyecto').value = x ? String(x.ProyectoId) : proyectoId ? String(proyectoId) : estado.filtroCapital ? String(estado.filtroCapital) : '';
    $('cpProyecto').disabled = !!proyectoId;
    $('cpTipo').value = x && x.Tipo === 'fondeo' ? 'fondeo' : 'necesidad';
    $('cpMonto').value = x ? String(x.Monto ?? '') : '';
    $('cpFecha').value = fechaInput(x && x.Fecha);
    $('cpCategoria').value = x ? x.Categoria || '' : '';
    $('cpEstado').value = x && x.Estado ? x.Estado : 'estimado';
    $('cpNotas').value = x ? x.Notas || '' : '';
    antes = x ? { ...x } : null;   // C-07
    conCategoria();   // U-12
    alAbrir = valores();
    abrirDialogo('dlgPartida');
    $('cpConcepto').focus();
}

async function cancelar() {
    if (enVuelo) return;   // C-08: Esc o Atras con una escritura en vuelo no cierra a media operacion
    if (!sucio()) { cerrarDialogo('dlgPartida'); return; }
    if (preguntando) return;
    preguntando = true;
    const { ok } = await confirmar({ titulo: enEdicionId ? '¿Descartar los cambios?' : '¿Descartar la partida a medio escribir?', ok: 'Descartar', texto: 'Lo que escribiste no se ha guardado.' });
    preguntando = false;
    if (ok) cerrarDialogo('dlgPartida'); else if ($('dlgPartida').open) $('cpConcepto').focus();
}

/** Lo que el formulario dice, en los nombres de la lista; null en un campo vacio (para que el PATCH lo borre). */
function leerForma() {
    const monto = leerMonto($('cpMonto').value);
    const fecha = aIsoDia($('cpFecha').value);   // lanza con mensaje si la fecha no existe
    return {
        Title: $('cpConcepto').value.trim().toLocaleUpperCase('es-MX'),   /* v0.107.0 (Carlos, 25-sep): MAYUSCULAS */ ProyectoId: Number($('cpProyecto').value) || null, Tipo: $('cpTipo').value,
        Monto: monto, Categoria: $('cpTipo').value === 'fondeo' ? null : $('cpCategoria').value.trim() || null, /* U-12 */ Fecha: fecha, Estado: $('cpEstado').value, Notas: $('cpNotas').value.trim() || null
    };
}
const igual = (k, a, b) => { const n = v => v === null || v === undefined ? '' : k === 'Fecha' ? String(diaDe(v) || '') : String(v); return n(a) === n(b); };

async function guardar(ev) {
    ev.preventDefault();
    if (enVuelo) return;   // C-08: Enter en un campo durante el PATCH no manda un segundo
    if (!puedeVerCapital()) { avisar(SOLO_GERENCIA, 'error'); return; }
    let c;
    try { c = leerForma(); } catch (e) { avisar(e.message, 'error'); $('cpFecha').focus(); return; }
    if (c.Monto === null && $('cpMonto').value.trim()) { avisar('Monto: escríbelo en pesos, mayor que cero y con 2 decimales a lo más (p. ej. 10000 o 10,000.50).', 'error'); $('cpMonto').focus(); return; }
    const v = validarPartida(c);
    if (!v.ok) { avisar(v.motivo, 'error'); return; }
    bloquear(true);
    let hecho = '', id = null;
    try {
        if (enEdicionId) {
            const x = porId(estado.capital, enEdicionId);
            if (!x) { cerrarDialogo('dlgPartida'); avisar('Esa partida ya no existe: alguien la borró.', 'error'); repintar(); return; }
            // U-12 (revisor-entregable, 30-sep): sin tocar nada no se escribe, aunque un fondeo viejo traiga categoria (leerForma la vacia)
            if (!sucio()) { cerrarDialogo('dlgPartida'); avisar('Sin cambios que guardar.', 'ojo'); return; }
            const base = antes || x;   // C-07: contra la foto de la apertura
            const campos = {}; for (const k in c) if (!igual(k, base[k], c[k])) campos[k] = c[k];
            if (!Object.keys(campos).length) { cerrarDialogo('dlgPartida'); avisar('Sin cambios que guardar.', 'ojo'); return; }
            const res = await estado.cliente.actualizarRenglon(estado.siteId, L.capital, x.id, campos, m => avisar(m, 'ojo'), x._etag);
            aplicarVivo(estado.capital, x.id, campos, res && res._etag, x);   // tras el await se re-resuelve: una relectura pudo cambiar el objeto (C-19: comun.js)
            hecho = `Partida «${c.Title}» actualizada.`; id = x.id;
        } else {
            const nuevo = await estado.cliente.crearRenglon(estado.siteId, L.capital, limpiar({ ...c, Categoria: c.Categoria || undefined, Fecha: c.Fecha || undefined, Notas: c.Notas || undefined }), m => avisar(m, 'ojo'));
            // C-01 (26-sep): si el refresco de 120 s entro durante el POST, la relectura ya trae el renglon: no duplicar
            agregarSinDuplicar(estado.capital, nuevo);
            hecho = `Partida «${c.Title}» agregada: ${formatoMXN(c.Monto)}.`; id = nuevo && nuevo.id;
        }
    } catch (e) {
        if (esConflicto(e)) {
            await pedirRelectura();
            // C-07: se nombra lo que cambio la otra persona (foto de la apertura contra el vivo releido), como en el proyecto (app.js C-08)
            const vivo = enEdicionId && porId(estado.capital, enEdicionId);
            const cambio = vivo && antes ? Object.keys(ROTULO_PARTIDA).filter(k => !igual(k, antes[k], vivo[k])).map(k => ROTULO_PARTIDA[k]) : [];
            avisar(`Alguien cambió esta partida hace un momento${cambio.length ? ` (${cambio.join(', ')})` : ''}: se releyó. Lo que escribiste sigue aquí; al volver a guardar solo viaja lo que tú cambiaste.`, 'ojo'); return;
        }
        avisar('No se pudo guardar la partida: ' + (e && e.message ? e.message : e), 'error'); return;
    } finally { bloquear(false); }
    cerrarDialogo('dlgPartida');
    avisar(hecho, 'ok'); repintar(); enfocarPartida(id);
}

/** C-09 (30-sep): al cerrar el dialogo el foco vuelve al renglon de la partida (el que se ve: seccion o pestaña del proyecto). */
function enfocarPartida(id) {
    if (!id) return;
    const b = [...document.querySelectorAll(`.partida-t[data-partida="${id}"]`)].find(n => n.offsetParent !== null);
    if (b) b.focus();
}

async function borrar() {
    if (enVuelo) return;   // C-08
    if (!puedeVerCapital()) { avisar(SOLO_GERENCIA, 'error'); return; }
    const x = enEdicionId && porId(estado.capital, enEdicionId); if (!x) return;
    const { ok } = await confirmar({ titulo: 'Borrar la partida', ok: 'Borrar', texto: `«${x.Title}» (${formatoMXN(x)}) sale del capital de trabajo. El renglón va a la papelera del sitio.` });
    if (!ok || enVuelo) return;
    bloquear(true);
    try {
        await estado.cliente.borrarRenglon(estado.siteId, L.capital, x.id, m => avisar(m, 'ojo'));
        estado.capital = estado.capital.filter(y => y.id !== x.id);
    } catch (e) { avisar('No se pudo borrar la partida: ' + (e && e.message ? e.message : e), 'error'); return; }
    finally { bloquear(false); }
    alAbrir = valores();   // ya no hay nada «a medio escribir»: el renglon se fue
    cerrarDialogo('dlgPartida');
    avisar(`Partida «${x.Title}» borrada.`, 'ok'); repintar();
}

export function engancharCapital() {
    $('cpConcepto').addEventListener('input', () => mayusculasEnVivo($('cpConcepto')));   // v0.107.0; C-06 (26-sep): aqui, no al importar
    $('btnNuevaPartida').addEventListener('click', () => abrirPartida(null));
    REF();   // v1.0.0: el botón y el filtro se mueven a la cabecera de la plantilla: se guardan sus nodos antes del primer pintado
    $('capitalCsv').addEventListener('click', exportarMeses);
    $('formPartida').addEventListener('submit', guardar);
    $('cpCancelar').addEventListener('click', cancelar);
    $('cpBorrar').addEventListener('click', borrar);
    $('cpTipo').addEventListener('change', conCategoria);   // U-12
    // C-08 (revisor-entregable, 30-sep): con una escritura en vuelo, Atras y Esc tampoco cierran aunque el formulario este limpio
    // (el caso tipico: Borrar sin editar). La guarda cuenta el candado como «sucio» y cancelar() sale sin hacer nada.
    fijarGuarda('dlgPartida', { sucio: () => enVuelo || sucio(), intentar: cancelar });
    $('dlgPartida').addEventListener('cancel', ev => { if (enVuelo || sucio()) { ev.preventDefault(); cancelar(); } });   // Esc
    $('capitalProyecto').addEventListener('change', () => { estado.filtroCapital = Number($('capitalProyecto').value) || null; pintarCapital(); fijarHash(hashDe()); });
}
