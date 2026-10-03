// MINSA ERP v1.0.0 — el ARMAZÓN (rediseño 2026-10-02; plan cerebro/docs/plan-erp-rediseno-2026-10-02.md, cubeta 1; maqueta
// «MINSA ERP Reportes», minsa-erp-app/docs/rediseno/maqueta-reportes.html).
//
// Rail de 64 px (símbolo · «+ Nuevo» · los 5 módulos · las unidades = ámbito · anillo «Mi día» · Buscar · Avisos · Cuenta), panel del
// módulo de 284 px (árbol con buscador y «Guardados» al pie), la cabecera (chip «Ámbito: X ✕»; en celular título, Buscar, Avisos,
// Cuenta y los chips del módulo), la hoja ☰ y el menú «+ Nuevo». Las pantallas de hoy se montan tal cual dentro: este módulo solo
// NAVEGA (por ruta, como una liga pegada) y pinta el cromo. La tabla ruta → módulo y las reglas puras viven en reglas.js.
// Todo DOM con el() / iconoSvg() (test/sw.test.js prohíbe innerHTML y la CSP exige Trusted Types).
//
// Puntos de enganche para las cubetas que siguen (declarados en la bitácora):
//   · arbolDe(m)     → las entradas con página propia (cubetas 2, 3 y 5) y los «Guardados» de ERP_Vistas.
//   · registrarFuenteAvisos(fn) → la cubeta 5 suma a la campana las subidas con error o «¿duplicado?» (mismo formato que avisosDe()).
// v1.0.0 (cubeta 4): el buscador global vive en buscador.js (lupa, `/` y Ctrl+K) y «Preguntar» en preguntar.js (PREGUNTAR de la cabecera de la
// plantilla; #btnPreguntar de la barra del armazón queda como hueco oculto). La campana (avisosDe) cuenta lo no visto con PROY_Roles.Visto.avisos.

import { CONFIG } from './config.js';
import { PUEDE, MODULOS, MODULO_DE, modulosDe, principalDe, leerRuta, rutaActiva, miDia, infoVence, misAbiertas, plural, sinAcentos, ordenarProyectos, nombreDe, nombreCorto, HECHO, diaDe, sumarDias, nuevoParaMi, desdeHaceDias, avisosNoVistos } from './reglas.js';
import { $, estado, el, boton, chip, iconoSvg, TRAZOS, iconoEquipo, activos, visibles, abrirDialogo, cerrarDialogo, proyectoAbierto, porId, equipoDe, nuevosDe, mencionesA, comentariosDe, haceCuanto, avisosVistoHasta, marcarAvisosVisto, conservarFoco, opciones, hashDe, VERSION } from './comun.js';
import { ordenarVigencias } from './vigencias-reglas.js';
import { DIAS_VIGENCIA_ATENCION } from './inicio-reglas.js';
import { datosPublicados } from './inicio.js';   // v1.0.0 (cubeta 4): las vigencias de la campana (gerencia)
import { abrirNuevaTarea } from './tablero.js';
import { abrirSubida, puedeSubirEn } from './archivos.js';   // v1.0.0 (cubeta 5): «Subir archivo / Foto» va a la carpeta del proyecto (o al buzón sin ERP_Proyectos)
import { abrirNuevoGasto, estadoGastos, misRolesErp } from './gastos.js';
import { estadoServicios } from './servicios.js';
import { mensajesNuevos, proyectoDeMensajes } from './vistas.js';
import { guardadosDe, puedeAbrir, abrirGuardado, iconoDe, estadoGuardados, asegurarGuardados } from './guardados.js';   // v1.0.0 (cubeta 2): «Guardados» del panel

// app.js pasa su navegacion: irARuta(hash) escribe el hash y aplica la ruta (sincrono, sin popstate: no cierra dialogos ajenos);
// irA(pantalla) va a una pantalla sin sufijo; abrirProyecto(id) abre el frente en su Tablero.
let nav = { irARuta: () => {}, irA: () => {}, abrirProyecto: () => {}, repintar: () => {} };
export function fijarNavArmazon(fns) { nav = { ...nav, ...fns }; }

const enCelular = window.matchMedia('(max-width: 720px)');
const enTableta = window.matchMedia('(max-width: 1100px)');
const SVG_NS = 'http://www.w3.org/2000/svg';
/** Las pantallas que filtra el ámbito (las del filtro por equipo de siempre: v0.7.0/v0.10.0) más el árbol de proyectos del panel. */
const AMBITO_EN = ['proyectos', 'roadmap', 'calendario', 'reportes'];
const moduloActual = () => MODULO_DE[estado.pestana] || 'inicio';
const NOMBRE_MODULO = { ...Object.fromEntries(MODULOS.map(m => [m.clave, m.nombre])), cuenta: 'Cuenta' };

// ---------------------------------------------------------------- el árbol de cada módulo (tabla «Panel por módulo» del plan)

/** Las entradas del panel de un módulo: [{ titulo, clave, oculto, entradas: [{ texto, ir, p, id, n, icono, eq, oculto, accion, sep }] }]. */
export function arbolDe(m) {
    const rol = estado.rol, g = PUEDE.capital(rol), t = PUEDE.tarea(rol);
    if (m === 'inicio') {
        const nm = mensajesNuevos();
        // la BANDEJA de frentes con no leídos va aquí (plan, «Panel por módulo»: el hilo al centro); v1.0.0 (cubeta 4): + el frente cuyo hilo está abierto
        const abierto = estado.pestana === 'mensajes' ? proyectoDeMensajes() : null;
        const frentes = activos().filter(p => nuevosDe(p.id) > 0 || (abierto && abierto.id === p.id)).map(p => ({ texto: p.Title, ir: `#mensajes/f/${p.Clave}`, eq: equipoDe(p), sub: true, n: nuevosDe(p.id), nCls: 'is-info' }));
        return [{ titulo: 'Mi día', clave: 'midia', entradas: [
            { texto: 'Resumen del día', ir: '#inicio', p: 'inicio' },
            { texto: 'Mis tareas', ir: '#mis', p: 'mis' },
            { texto: 'Mensajes', ir: '#mensajes', p: 'mensajes', nId: 'nMensajes', n: nm, nCls: 'is-info', nTxt: `${nm} ${plural(nm, 'mensaje')} ${plural(nm, 'nuevo')}` },
            ...frentes
        ] }];
    }
    if (m === 'trabajo') {
        const vivos = ordenarProyectos(visibles());   // el ámbito filtra también este árbol
        const orden = CONFIG.equipos.map(e => e.clave);
        vivos.sort((a, b) => (orden.indexOf(a.Equipo) + 1 || 99) - (orden.indexOf(b.Equipo) + 1 || 99));
        const proyectos = vivos.map((p, i) => ({ texto: p.Title, ir: `#p/${p.Clave}`, eq: equipoDe(p), sub: true, sep: i > 0 && vivos[i - 1].Equipo !== p.Equipo }));
        const cerrados = estado.proyectos.filter(p => p.Estado === 'cerrado' && (!estado.filtroEquipo || p.Equipo === estado.filtroEquipo))
            .sort((a, b) => String(b.CerradoEl || '').localeCompare(String(a.CerradoEl || '')))
            .map(p => ({ texto: p.Title, ir: `#p/${p.Clave}`, eq: equipoDe(p), sub: true }));
        const na = activos().length;
        return [
            { titulo: 'Proyectos', clave: 'proyectos', entradas: [
                { texto: 'Todos los proyectos', ir: '#proyectos', p: 'proyectos', nId: 'nProyectos', n: na, nCls: 'is-info', nTxt: `${na} ${plural(na, 'activo')}` },
                ...proyectos,
                ...(PUEDE.proyecto(rol) ? [{ texto: '+ Nuevo proyecto', accion: 'nuevo-proyecto' }] : [])
            ] },
            { titulo: `Cerrados · ${cerrados.length}`, clave: 'cerrados', plegadoDefault: true, oculto: !cerrados.length, entradas: cerrados },
            { titulo: 'Vistas', clave: 'vistas', entradas: [{ texto: 'Roadmap', ir: '#roadmap', p: 'roadmap' }, { texto: 'Calendario', ir: '#calendario', p: 'calendario' }] },
            { titulo: 'Reportes', clave: 'reportes', entradas: [
                { texto: 'Avance', ir: '#reportes/avance', p: 'reportes' }, { texto: 'Carga por persona', ir: '#reportes/carga' },
                { texto: 'Hechas y nuevas', ir: '#reportes/semanas' }, { texto: 'Actividad 30 días', ir: '#reportes/actividad' }, { texto: 'Vencidas', ir: '#reportes/vencidas' }
            ] }
        ];
    }
    // v1.0.0 (cubeta 6): el MISMO orden que los chips del celular — Por proyecto primero, que es la pantalla del módulo (plan: «Archivos→Por proyecto»)
    if (m === 'archivos') return [{ titulo: 'Archivos', clave: 'archivos', entradas: [
        { texto: 'Por proyecto', ir: '#archivos', p: 'archivos' }, { texto: 'Recientes', ir: '#archivos/recientes' }, { texto: 'Fijados', ir: '#archivos/fijados' },
        { texto: 'Bibliotecas', ir: '#archivos/bibliotecas' }, { texto: 'Mis subidas', ir: '#archivos/mias' }
    ] }];
    if (m === 'dinero') {
        const erp = misRolesErp();
        return [
            { titulo: 'Por cobrar', clave: 'cobrar', oculto: !g, entradas: [
                { texto: 'Saldo sin pago probado', ir: '#finanzas/cobrar/saldo', p: 'finanzas', id: 'panelFinanzas' }, { texto: 'Por cliente', ir: '#finanzas/cobrar/cliente' },
                { texto: 'Antigüedad de saldos', ir: '#finanzas/cobrar/antiguedad' }, { texto: 'Emitido por mes', ir: '#finanzas/cobrar/emitido' }, { texto: 'Facturas sin REP', ir: '#finanzas/cobrar/sin-rep' }
            ] },
            { titulo: 'Por pagar', clave: 'pagar', oculto: !g, entradas: [
                { texto: 'Saldo sin pago probado', ir: '#finanzas/pagar/saldo', id: 'panelPorPagar' }, { texto: 'Por proveedor', ir: '#finanzas/pagar/proveedor' }, { texto: 'Antigüedad de saldos', ir: '#finanzas/pagar/antiguedad' }
            ] },
            { titulo: 'Gastos', clave: 'gastos', entradas: [
                { texto: 'Mis gastos', ir: '#gastos', p: 'gastos', id: 'panelGastos' },
                { texto: 'Tesorería', ir: '#gastos/tesoreria', oculto: !erp.has('tesoreria') }, { texto: 'Contabilidad', ir: '#gastos/contabilidad', oculto: !erp.has('contabilidad') }
            ] },
            { titulo: 'Capital', clave: 'capital', oculto: !g, entradas: [{ texto: 'Por proyecto', ir: '#capital', p: 'capital', id: 'panelCapital' }, { texto: 'Por mes', ir: '#capital/mes' }] }
        ];
    }
    if (m === 'operacion') {
        const S = estadoServicios(); const exps = S && S.datos && Array.isArray(S.datos.expedientes) ? S.datos.expedientes : [];
        return [
            { titulo: 'Servicios LATINA', clave: 'servicios', oculto: !t, entradas: [
                { texto: 'Expedientes', ir: '#servicios', p: 'servicios', id: 'panelServicios' },
                ...exps.filter(e => /^E\d+$/.test(String(e.clave || ''))).map(e => ({ texto: `${e.clave} · paso ${e.paso}`, ir: `#servicios/${e.clave}`, sub: true })),
                { texto: 'Ciclo de 12 pasos', ir: '#servicios/ciclo' }
            ] },
            { titulo: 'Compras', clave: 'compras', oculto: !t, entradas: [{ texto: 'Órdenes de compra', ir: '#compras', p: 'compras', id: 'panelCompras' }, { texto: 'Partidas', ir: '#compras/partidas' }] },
            { titulo: 'Vigencias', clave: 'vigencias', oculto: !g, entradas: [{ texto: 'Lo que vence', ir: '#vigencias', p: 'vigencias', id: 'panelVigencias' }] }
        ];
    }
    if (m === 'cuenta') return [{ titulo: 'Cuenta', clave: 'cuenta', entradas: [{ texto: 'Tu cuenta', ir: '#cuenta', p: 'cuenta' }, { texto: 'Equipo y roles', ir: '#cuenta/equipo', id: 'btnEquipo' }] }];
    return [];
}
/** Los chips del celular: las entradas de PRIMER nivel de cada módulo (todo destino de hoy a ≤ 2 toques). `pref` es lo que resalta el chip. */
function chipsDe(m) {
    const rol = estado.rol, g = PUEDE.capital(rol), t = PUEDE.tarea(rol);
    return {
        inicio: [{ texto: 'Resumen', ir: '#inicio' }, { texto: 'Mis tareas', ir: '#mis' }, { texto: 'Mensajes', ir: '#mensajes' }],
        trabajo: [{ texto: 'Proyectos', ir: '#proyectos', pref: ['#proyectos', '#p'] }, { texto: 'Roadmap', ir: '#roadmap' }, { texto: 'Calendario', ir: '#calendario' }, { texto: 'Reportes', ir: '#reportes' }],
        archivos: [{ texto: 'Por proyecto', ir: '#archivos' }, { texto: 'Recientes', ir: '#archivos/recientes' }, { texto: 'Fijados', ir: '#archivos/fijados' }, { texto: 'Bibliotecas', ir: '#archivos/bibliotecas' }, { texto: 'Mis subidas', ir: '#archivos/mias' }],
        dinero: [{ texto: 'Por cobrar', ir: '#finanzas/cobrar/saldo', pref: ['#finanzas/cobrar'], id: 'chipFinanzas', oculto: !g }, { texto: 'Por pagar', ir: '#finanzas/pagar/saldo', pref: ['#finanzas/pagar'], id: 'chipPorPagar', oculto: !g },
            { texto: 'Gastos', ir: '#gastos', id: 'chipGastos' }, { texto: 'Capital', ir: '#capital', id: 'chipCapital', oculto: !g }],
        operacion: [{ texto: 'Servicios', ir: '#servicios', id: 'chipServicios', oculto: !t }, { texto: 'Compras', ir: '#compras', id: 'chipCompras', oculto: !t }, { texto: 'Vigencias', ir: '#vigencias', id: 'chipVigencias', oculto: !g }],
        cuenta: [{ texto: 'Tu cuenta', ir: '#cuenta' }, { texto: 'Equipo y roles', ir: '#cuenta/equipo' }]
    }[m] || [];
}
/** De una lista de rutas, la que corresponde a lo que está en pantalla: la más larga que es prefijo del hash; si ninguna, la primera
 *  que lleva a la misma pantalla (#finanzas a secas cae en la pestaña que esté puesta). */
function activaDe(items, hash) {
    const r = rutaActiva(items.flatMap(x => x.pref || [x.ir]).filter(Boolean), hash);
    if (r) return items.find(x => (x.pref || [x.ir]).includes(r)) || null;
    const misma = items.filter(x => x.ir && !x.oculto && (leerRuta(x.ir) || {}).pantalla === estado.pestana);
    return misma.find(x => x.p) || misma[0] || null;
}

// ---------------------------------------------------------------- pintar

const plegados = new Set();   // grupos del panel que la persona plegó («modulo/clave»); los de plegadoDefault arrancan plegados
const desplegados = new Set();

function contador(id, n, cls, texto) {
    const b = el('b', 'n' + (cls ? ' ' + cls : ''), String(n)); if (id) b.id = id;
    b.hidden = !n; if (texto) { b.setAttribute('aria-label', texto); b.title = texto; }
    return b;
}
function pintarArbol() {
    const caja = $('panelArbol'); const hash = hashDe();   // lo que dice el ESTADO: irA repinta antes de escribir el hash nuevo
    conservarFoco(caja, ['ir', 'grupo', 'accion', 'vista'], () => {
        caja.textContent = '';
        // v1.0.0 (cubeta 6; plan «Celular — a 1 toque»): en el celular la hoja (☰) es el ÍNDICE de la app — el módulo actual primero y debajo los
        // demás módulos del rol con su título —, así TODA ruta (también las páginas nuevas de reporte, Tesorería, Ciclo, Partidas…) queda a dos
        // toques desde cualquier pantalla: ☰ y la entrada. En tableta y escritorio el panel sigue siendo el del módulo, como la maqueta.
        const delRol = new Set(modulosDe(estado.rol).map(x => x.clave)), indice = enCelular.matches;
        for (const m of [...MODULOS.map(x => x.clave), 'cuenta']) {
            const actual = m === moduloActual();
            const div = el('div', 'panel-modulo' + (actual ? ' is-actual' : '')); div.dataset.modulo = m; div.hidden = !actual && !(indice && delRol.has(m));
            if (!actual) div.appendChild(el('h2', 'pm-tit', NOMBRE_MODULO[m]));
            const grupos = arbolDe(m);
            const todas = grupos.filter(g => !g.oculto).flatMap(g => g.entradas.filter(e => e.ir && !e.oculto));
            const activa = activaDe(todas, hash);
            const cab = el('div', 'gh'); cab.appendChild(el('span', '', 'Predeterminados'));
            cab.appendChild(botonIcono('updown', 'Abrir todo', () => { for (const gr of grupos) { plegados.delete(m + '/' + gr.clave); desplegados.add(m + '/' + gr.clave); } pintarArbol(); }, { grupo: m + '/*abrir' }));
            cab.appendChild(botonIcono('x', 'Plegar todo', () => { for (const gr of grupos) { plegados.add(m + '/' + gr.clave); desplegados.delete(m + '/' + gr.clave); } pintarArbol(); }, { grupo: m + '/*plegar' }));
            div.appendChild(cab);
            for (const gr of grupos) {
                const llave = m + '/' + gr.clave;
                const abierto = gr.plegadoDefault ? desplegados.has(llave) : !plegados.has(llave);
                const caja2 = el('div', 'grupo-panel' + (gr.oculto ? ' oculto' : '')); caja2.dataset.grupo = gr.clave;
                const fo = el('button', 'fo'); fo.type = 'button'; fo.dataset.grupo = llave; fo.setAttribute('aria-expanded', String(abierto));
                fo.appendChild(iconoSvg(TRAZOS.folder)); fo.appendChild(el('span', '', gr.titulo));
                fo.addEventListener('click', () => { if (abierto) { plegados.add(llave); desplegados.delete(llave); } else { plegados.delete(llave); desplegados.add(llave); } pintarArbol(); });
                caja2.appendChild(fo);
                const hijos = el('div', 'fo-hijos'); hijos.hidden = !abierto;
                for (const e of gr.entradas) hijos.appendChild(entrada(gr.oculto ? { ...e, oculto: true } : e, e === activa));   // un grupo que el rol no ve oculta también cada entrada (las pruebas miran #panelCapital…)
                caja2.appendChild(hijos);
                div.appendChild(caja2);
            }
            div.appendChild(el('div', 'gsep'));
            const gh = el('div', 'gh'); gh.appendChild(el('span', '', 'Guardados')); div.appendChild(gh);
            div.appendChild(pintarGuardados(m));
            caja.appendChild(div);
        }
        filtrarPanel();
    });
    $('panelTitulo').textContent = NOMBRE_MODULO[moduloActual()];
}
/** v1.0.0 (cubeta 2): «Guardados» al pie del panel — las vistas y segmentos de ERP_Vistas (o de este equipo) del módulo que la persona puede
 *  abrir; tocar una la abre (guardados.js abrirGuardado). Sin nada guardado, el texto de siempre. */
function pintarGuardados(m) {
    const caja = el('div', 'grupo-panel panel-guardados'); caja.dataset.grupo = 'guardados'; caja.dataset.modulo = m;
    const xs = guardadosDe(m).filter(puedeAbrir), g = estadoGuardados();
    if (!xs.length) { caja.appendChild(el('p', 'panel-vacio', 'Aquí quedarán las vistas que guardes.')); return caja; }
    for (const v of xs) {
        const b = el('button', 'sv'); b.type = 'button'; b.dataset.vista = String(v.id); b.title = v.compartida ? `${v.titulo} · la ve el equipo` : v.titulo;
        b.appendChild(iconoSvg(TRAZOS[iconoDe(v)] || [], 'em')); b.appendChild(el('span', 'tx', v.titulo));
        if (v.compartida) b.appendChild(el('span', 'n', 'equipo'));
        b.addEventListener('click', () => { cerrarHoja(); abrirGuardado(v); });
        caja.appendChild(b);
    }
    if (g.modo === 'local') { const p = el('p', 'panel-vacio panel-nota', 'Guardados en este equipo.'); p.title = g.nota; caja.appendChild(p); }
    return caja;
}
function botonIcono(icono, titulo, alClic, datos = {}) {
    const b = boton('', 'gh-btn', alClic, datos); b.title = titulo; b.setAttribute('aria-label', titulo); b.appendChild(iconoSvg(TRAZOS[icono])); return b;
}
function entrada(e, activa) {
    if (e.accion) {
        const b = boton('', 'ch ch-accion', () => { cerrarHoja(); if (e.accion === 'nuevo-proyecto') $('btnNuevoProyecto').click(); }, { accion: e.accion });
        b.appendChild(el('span', 'tx', e.texto)); return b;
    }
    const b = el('button', 'ch' + (e.sub ? ' is-sub' : '') + (activa ? ' on' : '') + (e.oculto ? ' oculto' : '') + (e.sep ? ' is-sep' : '')); b.type = 'button';
    b.dataset.ir = e.ir; if (e.p) b.dataset.p = e.p; if (e.id) b.id = e.id;
    if (activa) b.setAttribute('aria-current', 'page');
    if (e.eq) b.appendChild(iconoEquipo(e.eq, 'sm'));
    b.appendChild(el('span', 'tx', e.texto));
    if (e.nId) b.appendChild(contador(e.nId, e.n, e.nCls, e.nTxt));
    else if (e.n) b.appendChild(contador(null, e.n, e.nCls));
    b.addEventListener('click', () => { cerrarHoja(); nav.irARuta(e.ir); });
    return b;
}
/** El buscador del árbol: deja las entradas cuyo texto casa (sin acentos) y los grupos con alguna; vacío, el árbol como estaba. */
function filtrarPanel() {
    const q = sinAcentos($('panelBusca').value.trim());
    for (const g of document.querySelectorAll('#panelArbol .grupo-panel')) {
        let alguna = false;
        for (const c of g.querySelectorAll('.ch, .sv')) { const si = !q || sinAcentos(c.textContent).includes(q); c.classList.toggle('no-casa', !si); if (si) alguna = true; }
        g.classList.toggle('no-casa', !!q && !alguna && !g.classList.contains('panel-guardados'));
        const hijos = g.querySelector('.fo-hijos'); if (hijos) { if (q) hijos.dataset.busca = '1'; else delete hijos.dataset.busca; }
    }
}

function pintarChips() {
    const nav2 = $('chipsModulo'); const hash = hashDe();
    conservarFoco(nav2, ['ir'], () => {
        nav2.textContent = '';
        for (const m of [...MODULOS.map(x => x.clave), 'cuenta']) {
            const fila = el('div', 'chips-fila'); fila.dataset.modulo = m; fila.hidden = m !== moduloActual(); fila.setAttribute('role', 'group');
            const items = chipsDe(m); const activa = activaDe(items, hash);
            for (const c of items) {
                const b = el('button', 'chip-m' + (c === activa ? ' on' : '') + (c.oculto ? ' oculto' : ''), c.texto); b.type = 'button'; b.dataset.ir = c.ir; b.dataset.chip = (leerRuta(c.ir) || {}).pantalla || '';
                if (c.id) b.id = c.id; if (c === activa) b.setAttribute('aria-current', 'page');
                b.addEventListener('click', () => nav.irARuta(c.ir));
                fila.appendChild(b);
            }
            nav2.appendChild(fila);
        }
    });
    // v1.0.0 (cubeta 6): la fila rueda de lado; el chip encendido se trae a la vista (en Archivos «Mis subidas» quedaba fuera, sin nada encendido a la vista)
    const on = nav2.querySelector('.chips-fila:not([hidden]) .chip-m.on');
    if (on && enCelular.matches) { const a = on.getBoundingClientRect(), c = nav2.getBoundingClientRect(); if (a.right > c.right - 28 || a.left < c.left) nav2.scrollLeft += a.left - c.left - 16; }
}

function pintarModulos() {
    const m = moduloActual(), vis = new Set(modulosDe(estado.rol).map(x => x.clave)), plegado = $('shell').classList.contains('panel-plegado');
    for (const b of document.querySelectorAll('#modulos [data-m]')) {
        const on = b.dataset.m === m;
        b.classList.toggle('is-on', on); b.classList.toggle('oculto', !vis.has(b.dataset.m));
        if (on) { b.setAttribute('aria-current', 'page'); b.setAttribute('aria-expanded', String(!plegado)); b.setAttribute('aria-controls', 'panel'); }
        else { b.removeAttribute('aria-current'); b.removeAttribute('aria-expanded'); b.removeAttribute('aria-controls'); }
    }
    $('btnCuenta').classList.toggle('is-on', m === 'cuenta'); $('btnCuentaMovil').classList.toggle('is-on', m === 'cuenta');
    $('tituloMovil').textContent = NOMBRE_MODULO[m];
    // T4 (de siempre): el contador rojo es VENCIDAS mías y nada si no hay; ahora va en el módulo Inicio.
    const vencidas = misAbiertas(estado.tareas, estado.cuenta && estado.cuenta.username).filter(t => infoVence(t, CONFIG.vencePronto, CONFIG.semaforoDias).e === 'danger').length;
    const nMis = $('nMis'); nMis.textContent = String(vencidas); nMis.hidden = vencidas === 0;
    const tx = `${vencidas} ${plural(vencidas, 'vencida')}`; nMis.setAttribute('aria-label', tx); nMis.title = tx;
}

/** Las unidades del rail (y su copia en la hoja del celular): cuadro de su color con su icono, el nombre en title/aria-label, cuántos
 *  activos lleva y si es el ámbito puesto. Un clic lo pone; el segundo lo quita (v0.7.0). */
function pintarUnidades() {
    const vivos = activos();
    const ramas = [...CONFIG.ramas, ...CONFIG.equipos.map(e => e.rama || 'Otros').filter(r => !CONFIG.ramas.includes(r))];
    const eqs = ramas.flatMap(r => CONFIG.equipos.filter(e => (e.rama || 'Otros') === r));
    for (const [cont, conN] of [[$('railEquipos'), true], [$('hojaAmbito'), false]]) {
        cont.textContent = '';
        if (!conN) cont.appendChild(el('p', 'mn-label', 'Ámbito'));
        for (const e of eqs) {
            const on = estado.filtroEquipo === e.clave;
            const b = boton('', 'uni-rb' + (on ? ' is-on' : ''), () => { cerrarHoja(); fijarAmbito(on ? null : e.clave, true); }, { equipo: e.clave });
            b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = e.nombre; b.setAttribute('aria-label', 'Ámbito: ' + e.nombre);
            const ic = iconoEquipo(e, 'sm'); ic.classList.add('is-solido'); ic.removeAttribute('role'); ic.removeAttribute('aria-label'); ic.removeAttribute('title'); b.appendChild(ic);
            const n = vivos.filter(p => p.Equipo === e.clave).length;
            if (n && conN) b.appendChild(el('span', 'n', String(n)));
            cont.appendChild(b);
        }
    }
    // En Proyectos sigue el <select> de celular de v0.7.0: el mismo filtro en las dos direcciones.
    const sel = $('filtroEquipoMovil');
    opciones(sel, CONFIG.equipos, e => e.clave, e => { const n = vivos.filter(p => p.Equipo === e.clave).length; return n ? `${e.nombre} · ${n}` : e.nombre; }, 'Todos los equipos');
    sel.value = estado.filtroEquipo || '';
}
/** Pone (o quita, con null) el ámbito. Desde una unidad (`navegar`) hace lo del filtro del rail de siempre (v0.10.0): donde aplica se repinta
 *  ahí y en otra pantalla se va a Proyectos; la ✕ del chip solo lo quita, sin moverse. */
export function fijarAmbito(clave, navegar = false) {
    estado.filtroEquipo = clave || null;
    if (!navegar || AMBITO_EN.includes(estado.pestana)) nav.repintar(); else nav.irA('proyectos');
}
function pintarChipAmbito() {
    const c = $('chipAmbito'); c.textContent = '';
    const e = estado.filtroEquipo ? CONFIG.equipos.find(x => x.clave === estado.filtroEquipo) || equipoDe({ Equipo: estado.filtroEquipo }) : null;
    c.hidden = !e; $('barraMovil').classList.toggle('con-ambito', !!e);
    if (!e) return;
    const aplica = AMBITO_EN.includes(estado.pestana);
    c.classList.toggle('no-aplica', !aplica);
    c.title = aplica ? '' : 'Esta pantalla no se filtra por unidad: el ámbito se aplica en Proyectos, Roadmap, Calendario, Reportes y en el panel de Trabajo.';
    c.appendChild(iconoEquipo(e, 'sm'));
    c.appendChild(el('span', 'tx', `Ámbito: ${e.nombre}`));
    const x = boton('', 'quitar', () => fijarAmbito(null)); x.id = 'quitarAmbito'; x.title = 'Quitar el ámbito'; x.setAttribute('aria-label', 'Quitar el ámbito'); x.appendChild(iconoSvg(TRAZOS.x));
    c.appendChild(x);
}

/** El anillo «Mi día»: de lo que me toca hoy, cuántas hice (reglas.js miDia). Lleva a Mis tareas. */
function pintarAnillo() {
    const b = $('anilloDia'); b.textContent = '';
    const { hechas, total } = miDia(estado.tareas, estado.cuenta && estado.cuenta.username);
    const svg = document.createElementNS(SVG_NS, 'svg'); svg.setAttribute('viewBox', '0 0 30 30'); svg.setAttribute('aria-hidden', 'true');
    const circ = (cls, extra = {}) => { const c = document.createElementNS(SVG_NS, 'circle'); c.setAttribute('cx', '15'); c.setAttribute('cy', '15'); c.setAttribute('r', '13'); c.setAttribute('class', cls); for (const k in extra) c.setAttribute(k, extra[k]); return c; };
    const L = 2 * Math.PI * 13;
    svg.appendChild(circ('fondo'));
    if (total && hechas) svg.appendChild(circ('lleno', { 'stroke-dasharray': `${(hechas / total) * L} ${L}`, transform: 'rotate(-90 15 15)' }));
    const anillo = el('span', 'dia-anillo'); anillo.appendChild(svg); anillo.appendChild(el('span', 'dia-anillo-n', total ? `${hechas}/${total}` : '0'));
    b.appendChild(anillo); b.appendChild(el('span', 'rot', 'Mi día'));
    const tx = total ? `Mi día: ${hechas} de ${total} ${plural(total, 'hecha')} (las que vencen hoy, las vencidas y las que hiciste hoy)` : 'Mi día: nada vence hoy';
    b.setAttribute('aria-label', tx); b.title = tx; b.dataset.hechas = String(hechas); b.dataset.total = String(total);
}

// ---------------------------------------------------------------- Avisos (la campana; v1.0.0 cubeta 4, plan «Avisos»)

/** Fuentes de avisos de otros módulos (cubeta 5: subidas con error o «¿duplicado?»). Cada una devuelve [{ tipo, cuando, cls, texto, sub, ir }]. */
const fuentesAvisos = [];
export function registrarFuenteAvisos(fn) { if (typeof fn === 'function') fuentesAvisos.push(fn); }
const corta = (s, n = 90) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
/** El instante en que una tarjeta pasó a vencida: el día siguiente a su Vence, 00:00 de México (06:00 Z). */
const vencioEl = t => { const d = diaDe(t.Vence); return d ? `${sumarDias(d, 1)}T06:00:00.000Z` : ''; };
const diaIsoUtc = d => d ? `${d}T12:00:00.000Z` : '';
/**
 * Lo que la campana enseña, del más nuevo al más viejo: las menciones (14 días), los mensajes nuevos por frente, lo que te asignaron (14 días),
 * mis vencidas (un renglón), las vigencias vencidas o a ≤ 30 días (gerencia), los lotes que la skill ya archivó (14 días) y lo de otros
 * módulos. `cuando` es lo que compara la marca de visto (PROY_Roles.Visto.avisos): lo posterior cuenta en el contador.
 */
export function avisosDe() {
    const yo = estado.cuenta && estado.cuenta.username, items = [];
    const proy = id => porId(estado.proyectos, id);
    for (const a of mencionesA(yo)) {
        const p = proy(a.ProyectoId); if (!p) continue;
        items.push({ tipo: 'mencion', cuando: a.Cuando, cls: 'info', eq: equipoDe(p), texto: `«${corta(a.Title)}»`, sub: `${nombreCorto(a.Quien, estado.roles)} te mencionó · ${p.Title}`, ir: `#mensajes/f/${p.Clave}` });
    }
    for (const p of activos()) {
        const n = nuevosDe(p.id); if (!n) continue;
        const ult = comentariosDe(p.id).reduce((m, c) => (String(c.Cuando || '') > m ? String(c.Cuando) : m), '');
        items.push({ tipo: 'mensajes', n, cuando: ult, cls: 'info', eq: equipoDe(p), texto: `${n} ${plural(n, 'mensaje nuevo', 'mensajes nuevos')}`, sub: p.Title, ir: `#mensajes/f/${p.Clave}` });
    }
    for (const x of nuevoParaMi(estado.actividad, estado.tareas, estado.roles, yo, desdeHaceDias(CONFIG.mencionesDias))) {
        if (x.tipo !== 'asignada' || !x.tarea || x.tarea.Columna === HECHO) continue;
        const p = proy(x.tarea.ProyectoId); if (!p) continue;
        items.push({ tipo: 'asignada', cuando: x.a.Cuando, cls: 'info', eq: equipoDe(p), texto: `«${corta(x.tarea.Title)}»`, sub: `${nombreCorto(x.a.Quien, estado.roles)} te asignó · ${p.Title}`, ir: `#p/${p.Clave}/t/${x.tarea.id}` });
    }
    const venc = misAbiertas(estado.tareas, yo).filter(t => infoVence(t, CONFIG.vencePronto, CONFIG.semaforoDias).e === 'danger');
    if (venc.length) items.push({ tipo: 'vencidas', n: venc.length, cuando: venc.map(vencioEl).sort().pop(), sinHora: true, cls: 'danger', texto: `${venc.length} ${plural(venc.length, 'tarjeta tuya vencida', 'tarjetas tuyas vencidas')}`, sub: 'Mis tareas', ir: '#mis', antes: () => { estado.filtroMisAlLlegar = 'vencidas'; } });
    if (PUEDE.capital(estado.rol)) {
        const v = datosPublicados(false).vigencias.datos;
        for (const x of v ? ordenarVigencias(v.vigencias || [], new Date()) : []) {
            if (x.dias > DIAS_VIGENCIA_ATENCION) continue;
            const n = Math.abs(x.dias);
            items.push({ tipo: 'vigencia', sinHora: true, cuando: x.dias < 0 ? diaIsoUtc(x.vence) : diaIsoUtc(sumarDias(x.vence, -DIAS_VIGENCIA_ATENCION)), cls: x.dias < 0 ? 'danger' : 'warn', texto: String(x.titulo), sub: x.dias < 0 ? `Vigencia vencida hace ${n} ${plural(n, 'día')}` : `Vigencia: faltan ${n} ${plural(n, 'día')}`, ir: '#vigencias' });
        }
    }
    const piso = desdeHaceDias(CONFIG.mencionesDias) || '';
    for (const a of estado.actividad) {
        if (a.Accion !== 'ligar' || !/\(archivado por la skill\)$/.test(String(a.Title || '')) || String(a.Cuando || '') < piso) continue;
        const p = proy(a.ProyectoId); if (!p) continue;
        items.push({ tipo: 'lote', cuando: a.Cuando, cls: 'ok', eq: equipoDe(p), texto: String(a.Title).replace(/^ligó /, 'Archivado: ').replace(/ \(archivado por la skill\)$/, ''), sub: `La skill lo archivó · ${p.Title}`, ir: `#p/${p.Clave}/docs` });
    }
    // S-12 (24-sep) aplicado a la campana: ningún aviso propio es «del futuro» (un Cuando adelantado o la fecha de calendario de una vigencia):
    // se topa en ahora, o se quedaría «nuevo» hasta esa fecha y empujaría la marca de visto por encima de la hora real
    const ahora = new Date().toISOString();
    for (const x of items) if (x.cuando && String(x.cuando) > ahora) x.cuando = ahora;
    for (const f of fuentesAvisos) { try { for (const x of f() || []) if (x && x.ir && x.texto) items.push(x); } catch (e) { console.warn('una fuente de avisos falló:', e && e.message ? e.message : e); } }
    return items.sort((a, b) => String(b.cuando || '').localeCompare(String(a.cuando || '')));
}
function pintarContadorAvisos() {
    const items = avisosDe(), n = avisosNoVistos(items, avisosVistoHasta());
    const tx = n ? `${n} ${plural(n, 'aviso nuevo', 'avisos nuevos')} desde la última vez que abriste Avisos` : items.length ? `Avisos: ${items.length}, ya vistos` : 'Sin avisos';
    for (const id of ['nAvisos', 'nAvisosMovil']) { const b = $(id); b.textContent = String(n); b.hidden = !n; b.setAttribute('aria-label', tx); b.title = tx; }
    $('btnAvisos').title = tx; $('btnAvisosMovil').title = tx;
}
function abrirAvisos() {
    datosPublicados(true);   // gerencia: las vigencias entran en cuanto vigencias.json se lee
    const l = $('avLista'); l.textContent = '';
    const items = avisosDe(), marca = avisosVistoHasta(), nuevos = avisosNoVistos(items, marca);
    $('avSub').textContent = items.length ? (nuevos ? `${nuevos} ${plural(nuevos, 'nuevo')} desde la última vez que abriste Avisos.` : 'Nada nuevo desde la última vez que abriste Avisos.') : '';
    if (!items.length) l.appendChild(el('p', 'vacio', 'Nada pide tu atención ahora.'));
    for (const a of items) {
        const nuevo = !!a.cuando && String(a.cuando) > String(marca || '');
        const b = boton('', 'av-r is-' + a.cls + (nuevo ? ' es-nuevo' : ''), () => { cerrarDialogo('dlgAvisos'); if (a.antes) a.antes(); nav.irARuta(a.ir); }, { aviso: a.tipo, ir: a.ir });
        b.setAttribute('role', 'listitem'); if (a.cuando) b.dataset.cuando = String(a.cuando);
        if (a.eq) b.appendChild(iconoEquipo(a.eq, 'sm')); else b.appendChild(el('span', 'av-ico'));
        // `sinHora`: el instante es de calendario (vencidas, vigencias), no un evento: no se le pone hora
        const t = el('span', 't'); t.appendChild(el('b', '', a.texto)); t.appendChild(el('small', '', a.sub + (a.cuando && !a.sinHora ? ` · ${haceCuanto(a.cuando)}` : ''))); b.appendChild(t);
        if (nuevo) { const p = el('span', 'av-nuevo', 'nuevo'); b.appendChild(p); }
        b.appendChild(iconoSvg(TRAZOS.chevr, 'flecha'));
        l.appendChild(b);
    }
    abrirDialogo('dlgAvisos');
    // abrir la campana es «ya los vi»: la marca sube hasta el aviso más nuevo (compartida en PROY_Roles.Visto, best-effort) y el contador baja
    const hasta = items.map(a => String(a.cuando || '')).filter(Boolean).sort().pop();
    if (hasta) marcarAvisosVisto(hasta);
    pintarContadorAvisos();
}

// ---------------------------------------------------------------- «+ Nuevo»

let menuDe = null;   // el botón que abrió el menú (#btnNuevo o #fabNuevo): ahí vuelve el foco y de ahí se coloca
const OPCIONES_NUEVO = [['tarea', 'Tarea', 'tarea'], ['gasto', 'Gasto', 'recibo'], ['subir', 'Subir archivo', 'subir'], ['foto', 'Foto', 'camara']];
function menuAbierto() { return !$('menuNuevo').hidden; }
function cerrarMenuNuevo(devolverFoco = false) {
    const m = $('menuNuevo'); if (m.hidden) return;
    m.hidden = true; for (const id of ['btnNuevo', 'fabNuevo']) $(id).setAttribute('aria-expanded', 'false');
    if (devolverFoco && menuDe) menuDe.focus();
}
function colocarMenu() {
    const m = $('menuNuevo'), r = menuDe.getBoundingClientRect();
    m.style.left = m.style.top = m.style.right = m.style.bottom = '';
    if (menuDe.id === 'fabNuevo') { m.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; m.style.bottom = (window.innerHeight - r.top + 8) + 'px'; }
    else { m.style.left = (r.right + 8) + 'px'; m.style.top = Math.max(8, r.top) + 'px'; }
}
function opcionNuevo(clave, texto, icono, alClic, deshabilitado) {
    const b = boton('', 'mn-item', alClic, { nuevo: clave }); b.setAttribute('role', 'menuitem');
    b.appendChild(iconoSvg(TRAZOS[icono])); b.appendChild(el('span', '', texto));
    if (deshabilitado) { b.disabled = true; b.title = deshabilitado; }
    return b;
}
function pintarMenuNuevo() {
    const m = $('menuNuevo'); m.textContent = '';
    const lectura = !PUEDE.tarea(estado.rol);
    for (const [k, texto, icono] of OPCIONES_NUEVO) {
        const sinRol = (k === 'tarea' || k === 'subir' || k === 'foto') && lectura ? 'Tu rol es de lectura' : '';
        m.appendChild(opcionNuevo(k, texto, icono, () => elegirNuevo(k), sinRol));
    }
}
function abrirMenuNuevo(desde) {
    menuDe = desde; pintarMenuNuevo();
    $('menuNuevo').hidden = false; desde.setAttribute('aria-expanded', 'true'); colocarMenu();
    const p = $('menuNuevo').querySelector('button:not(:disabled)'); if (p) p.focus();
}
/** El proyecto donde va lo nuevo si se está DENTRO de uno (y admite eso); si no, null y el menú pregunta en cuál. */
function proyectoDeContexto(k) {
    const p = estado.pestana === 'proyecto' ? proyectoAbierto() : null;
    if (!p || p.Estado !== 'activo') return null;
    return k === 'tarea' || puedeSubirEn(p) ? p : null;
}
function prepararArchivo(foto) {
    const i = $('sbArchivos');
    if (foto) { i.setAttribute('accept', 'image/*'); i.setAttribute('capture', 'environment'); } else { i.removeAttribute('accept'); i.removeAttribute('capture'); }
}
function hacerNuevo(k, p) {
    cerrarMenuNuevo();
    if (k === 'tarea') { if (estado.pestana !== 'proyecto' || estado.proyectoAbiertoId !== p.id) nav.abrirProyecto(p.id); abrirNuevaTarea(); return; }
    prepararArchivo(k === 'foto'); abrirSubida({ proyectoId: p.id });
}
function elegirNuevo(k) {
    if (k === 'gasto') {
        cerrarMenuNuevo();
        if (estado.pestana !== 'gastos') nav.irA('gastos');
        const G = estadoGastos();
        if (G.cargando) G.cargando.then(() => { if (estado.pestana === 'gastos') abrirNuevoGasto(); }); else abrirNuevoGasto();
        return;
    }
    const p = proyectoDeContexto(k);
    if (p) { hacerNuevo(k, p); return; }
    // Fuera de un proyecto: ¿en cuál? (tarea: los activos; archivo y foto: los activos donde se puede subir — con ERP_Proyectos todos, sin ella
    // los que tienen biblioteca de unidad habilitada, como «Subir» de la tarjeta)
    const m = $('menuNuevo'); m.textContent = '';
    const lista = ordenarProyectos(visibles()).filter(x => k === 'tarea' || puedeSubirEn(x));
    m.appendChild(opcionNuevo('volver', 'Volver', 'chevr', () => { pintarMenuNuevo(); const b = m.querySelector('button:not(:disabled)'); if (b) b.focus(); }));
    m.lastChild.classList.add('is-volver');
    m.appendChild(el('p', 'mn-label', k === 'tarea' ? '¿En qué proyecto va la tarea?' : '¿En qué proyecto lo subes?'));
    if (!lista.length) m.appendChild(el('p', 'vacio', estado.filtroEquipo ? 'Ningún proyecto activo en este ámbito.' : 'Ningún proyecto activo admite esto.'));
    for (const x of lista) {
        const b = boton('', 'mn-item mn-proy', () => hacerNuevo(k, x), { proyecto: String(x.id) }); b.setAttribute('role', 'menuitem');
        b.appendChild(iconoEquipo(equipoDe(x), 'sm')); b.appendChild(el('span', '', x.Title));
        m.appendChild(b);
    }
    colocarMenu();
    const b = m.querySelector('.mn-proy') || m.querySelector('button'); if (b) b.focus();
}

// ---------------------------------------------------------------- hoja (≤ 1100 px) y panel plegado (escritorio)

export function cerrarHoja() {
    if (!document.body.classList.contains('hoja-abierta')) return;
    document.body.classList.remove('hoja-abierta'); $('hojaFondo').hidden = true; $('btnHoja').setAttribute('aria-expanded', 'false');
}
function abrirHoja() {
    document.body.classList.add('hoja-abierta'); $('hojaFondo').hidden = false; $('btnHoja').setAttribute('aria-expanded', 'true');
    $('btnCerrarHoja').focus();
}
function panelPlegado() { try { return localStorage.getItem('panel') === 'plegado'; } catch (_) { return false; } }
function fijarPanel(plegado) {
    try { if (plegado) localStorage.setItem('panel', 'plegado'); else localStorage.removeItem('panel'); } catch (_) {}
    $('shell').classList.toggle('panel-plegado', plegado); pintarModulos();
}
function alModulo(m) {
    if (m === moduloActual()) {
        if (enCelular.matches) { nav.irARuta(principalDe(m, estado.rol)); return; }
        if (enTableta.matches) { if (document.body.classList.contains('hoja-abierta')) cerrarHoja(); else abrirHoja(); return; }
        fijarPanel(!$('shell').classList.contains('panel-plegado')); return;
    }
    cerrarHoja(); nav.irARuta(principalDe(m, estado.rol));
}

// ---------------------------------------------------------------- Cuenta (#cuenta)

/** La página Cuenta: la versión y «Equipo y roles» (la tabla y las fichas del diálogo de F13, misma lógica; solo lectura). */
export function pintarCuenta() {
    $('cuentaVersion').textContent = `MINSA ERP v${VERSION}`;
    const tb = $('eqLista'); tb.textContent = '';
    const fi = $('eqFichas'); fi.textContent = '';   // A2: en celular la tabla de 5 columnas no cabe; las mismas filas como fichas
    const roles = estado.roles.slice().sort((a, b) => String(a.Nombre || a.Title || '').localeCompare(String(b.Nombre || b.Title || '')));
    for (const r of roles) {
        const correo = String(r.Title || '').toLowerCase();
        const abiertas = estado.tareas.filter(t => String(t.Asignado || '').toLowerCase() === correo && t.Columna !== HECHO).length;
        const fa = el('div', 'eq-ficha' + (r.Activo === false ? ' inactivo' : ''));
        fa.appendChild(el('span', 'n', nombreDe(correo, estado.roles)));
        const ch = el('span', 'ch');
        ch.appendChild(chip(r.Rol || 'lectura', r.Rol === 'gerencia' ? 'info' : null));
        if (r.Activo === false) ch.appendChild(chip('inactiva', 'danger'));
        ch.appendChild(el('span', '', `${abiertas} ${plural(abiertas, 'abierta')}`));
        fa.appendChild(ch); fa.appendChild(el('span', 'c', correo)); fi.appendChild(fa);
        const tr = el('tr', r.Activo === false ? 'inactivo' : '');
        tr.appendChild(el('td', '', nombreDe(correo, estado.roles)));
        tr.appendChild(el('td', 'mn-mono', correo));
        const tdr = el('td'); tdr.appendChild(chip(r.Rol || 'lectura', r.Rol === 'gerencia' ? 'info' : null)); tr.appendChild(tdr);
        const tda = el('td'); tda.appendChild(r.Activo === false ? chip('no', 'danger') : chip('sí', 'ok')); tr.appendChild(tda);
        tr.appendChild(el('td', 'mn-mono', String(abiertas)));
        tb.appendChild(tr);
    }
    if (!roles.length) { const tr = el('tr'); const td = el('td', 'vacio', 'PROY_Roles está vacía.'); td.colSpan = 5; tr.appendChild(td); tb.appendChild(tr); fi.appendChild(el('p', 'vacio', 'PROY_Roles está vacía.')); }
}

// ---------------------------------------------------------------- todo junto

/** Lo llama repintar() de app.js en cada pintada: módulo resaltado, panel, chips, unidades, chip de ámbito, anillo y contadores. */
export function pintarArmazon() {
    if (moduloActual() === 'trabajo' && estado.sesion) asegurarGuardados(() => nav.repintar());   // v1.0.0 (cubeta 3): los «Guardados» de Trabajo se leen al entrar al módulo (una vez por sesión)
    pintarModulos(); pintarUnidades(); pintarArbol(); pintarChips(); pintarChipAmbito(); pintarAnillo(); pintarContadorAvisos();
    document.body.dataset.modulo = moduloActual();
    if (menuAbierto() && menuDe) colocarMenu();
}

export function engancharArmazon() {
    for (const s of document.querySelectorAll('[data-icono]')) s.replaceWith(iconoSvg(TRAZOS[s.dataset.icono] || [], 'ico'));
    for (const b of document.querySelectorAll('#modulos [data-m]')) b.addEventListener('click', () => alModulo(b.dataset.m));
    $('anilloDia').addEventListener('click', () => { cerrarHoja(); nav.irA('mis'); });
    // v1.0.0 (cubeta 4): la lupa la engancha buscador.js (con `/` y Ctrl+K)
    for (const id of ['btnAvisos', 'btnAvisosMovil']) $(id).addEventListener('click', () => { cerrarHoja(); abrirAvisos(); });
    for (const id of ['btnCuenta', 'btnCuentaMovil']) $(id).addEventListener('click', () => { cerrarHoja(); nav.irARuta('#cuenta'); });
    for (const id of ['btnNuevo', 'fabNuevo']) $(id).addEventListener('click', ev => { ev.stopPropagation(); if (menuAbierto() && menuDe === $(id)) cerrarMenuNuevo(true); else { cerrarMenuNuevo(); abrirMenuNuevo($(id)); } });
    $('btnHoja').addEventListener('click', () => { if (document.body.classList.contains('hoja-abierta')) cerrarHoja(); else abrirHoja(); });
    $('btnCerrarHoja').addEventListener('click', () => { cerrarHoja(); $('btnHoja').focus(); });
    $('hojaFondo').addEventListener('click', cerrarHoja);
    $('panelBusca').addEventListener('input', filtrarPanel);
    $('avCerrar').addEventListener('click', () => cerrarDialogo('dlgAvisos'));
    // el menú «+ Nuevo» se cierra al tocar fuera y con Esc (el foco vuelve a su botón); la hoja también se cierra con Esc
    // (un clic DENTRO que repinta el menú —«Tarea» lo vuelve selector de proyecto— deja su botón fuera del DOM: eso no es «tocar fuera»)
    document.addEventListener('click', ev => { if (menuAbierto() && ev.target.isConnected && !$('menuNuevo').contains(ev.target) && !ev.target.closest('#btnNuevo, #fabNuevo')) cerrarMenuNuevo(); });
    document.addEventListener('keydown', ev => {
        if (ev.key !== 'Escape') return;
        if (menuAbierto()) { ev.preventDefault(); cerrarMenuNuevo(true); return; }
        if (document.body.classList.contains('hoja-abierta') && !document.querySelector('dialog[open]')) { cerrarHoja(); $('btnHoja').focus(); }
    });
    // la foto deja el selector de archivos en cámara; al cerrar «Subir» vuelve a ser un selector de archivos cualquiera
    $('dlgSubir').addEventListener('close', () => prepararArchivo(false));
    for (const q of [enCelular, enTableta]) q.addEventListener('change', () => { cerrarHoja(); cerrarMenuNuevo(); });
    enCelular.addEventListener('change', () => { if (estado.sesion) pintarArbol(); });   // v1.0.0 (cubeta 6): la hoja del celular es el índice; el panel de escritorio, el del módulo
    window.addEventListener('resize', () => { if (menuAbierto() && menuDe) colocarMenu(); });
    $('shell').classList.toggle('panel-plegado', panelPlegado());
}
