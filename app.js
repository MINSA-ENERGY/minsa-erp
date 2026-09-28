// MINSA Proyectos — proyectos multiusuario del holding. v0.1.0: piloto (Inicio · Proyectos ·
// Proyecto [Tablero / Lista / Documentos] · Mis tareas). v0.3.0: tanda 2 de la auditoria (reabrir,
// carpeta destino, filtros y orden, subir/bajar, mover de proyecto, KPI y rail vivos, «→ siguiente»
// con Deshacer, tablero por pestanas en celular, If-Match, sin red, enlaces).
//
// Estructura heredada de calytek-planta-app: MSAL por REDIRECCION (el popup se rompe en celulares),
// token en sessionStorage, nada de innerHTML (todo textContent), y la app es DUEÑA del estado
// (decision 1 del plan 2026-09-11): asignado, columna y vence viven en listas PROY_* del sitio
// Administracion; la KB liga por la Clave del proyecto.
//
// Lo que la app NO protege: quien decide que puede escribir cada persona es SharePoint. Los roles
// de PROY_Roles eligen la pantalla y las funciones de guardar los comprueban (cinturon), pero la
// traza real de quien hizo que la deja SharePoint en Creado por / Modificado por y en PROY_Actividad.

import { CONFIG } from './config.js';
import { crearCliente, esConflicto } from './graph.js';
import { rolDe, PUEDE, slug, validarClave, tareasDe, avance, proximos, diasQuieta, rotuloQuieta, pisoNuevo, sinDueno, nombreDe, diasPara, estadoVence, claseVence, fraseVence, ordenarProyectos, filtrarProyectos, proyectosVisibles, columnasDe, segmentosDe, vencidasEn, desdeHaceDias, nuevoParaMi, gruposHoy, saludoDe, diaDe, sumarDias, misAbiertas as misAbiertasDe } from './reglas.js';
import { mayusculasEnVivo, $, L, VERSION, estado, limpiarFiltroTareas, PESTANAS_CON_FILTRO, activos, visibles, nombreEquipoFiltrado, el, boton, ondaAlPulsar, chip, avisar, limpiarAvisos, abrirDialogo, cerrarDialogo, confirmar, fechaCorta, fechaHora, aIsoDia, diaInput, fechaInput, campoFecha, mesDia, chipVence, opciones, limpiar, porId, proyectoAbierto, proyectoPorClave, nuevosDe, registrarActividad, haceCuanto, fechaLegible, equipoDe, iconoEquipo, hashDe, fijarHash, irAHash, aplicar, fijarReleer, pedirRelectura, fijarAlCerrar, fijarGuarda, verboComentario, mencionesA, notasDe, comentariosDe, comentariosNuevos, textoConMenciones, actividadVisible, columnasDeTarea, fusionarActividad, asegurarActividadDe, inicioVistoHasta, marcarInicioVisto, guardarVisto, personasActivas } from './comun.js';
import { pintarTablero, pintarLista, pintarMisTareas, engancharTablero, alCambiarTareas, abrirTarjeta, tarjetaAbiertaId, repintarFicha, pintarFiltroTareas, pintarBotonFiltros, abrirNuevaTarea } from './tablero.js';
import { pintarDocs, engancharDocs, alCambiarDocs, abrirLigar, abrirEnlace, puedeLigarEn } from './docs.js';
import { pintarChat, engancharChat, alCambiarChat, fijarAbrirTarjeta, salirDelChat } from './chat.js';
import { pintarCapital, pintarCapitalProyecto, pintarCapitalTab, puedeVerCapital, engancharCapital, alCambiarCapital, fijarIrAProyecto } from './capital.js';
import { pintarRoadmap, pintarRoadmapProyecto, roadmapFull, engancharRoadmap, olvidarLugarRoadmap, pintarCalendario, engancharCalendario, enfocarCal, pintarMensajes, engancharMensajes, devolverChat, mensajesNuevos, proyectoDeMensajes, pintarArchivos, engancharArchivos, pintarReportes, engancharReportes, anillo } from './vistas.js';

// NO llamar `msal` a esta variable: taparia el global del bundle UMD.
const pca = new msal.PublicClientApplication({
    auth: {
        clientId: CONFIG.clientId,
        authority: `https://login.microsoftonline.com/${CONFIG.tenantId}`,
        redirectUri: new URL('./', window.location.href).href
    },
    cache: { cacheLocation: 'sessionStorage' }
});

$('pie').textContent = `MINSA Proyectos v${VERSION}`;

// ---------------------------------------------------------------- sesion

async function token() {
    const r = await pca.acquireTokenSilent({ scopes: CONFIG.scopes, account: estado.cuenta || pca.getAllAccounts()[0] });   // C-07 (v0.87.0): la cuenta viva es estado.cuenta
    return r.accessToken;
}
// C-02 (v0.87.0): se guarda la PROMESA, no una bandera puesta despues del await — entrar() y arrancar() la
// esperan juntos y initialize()/handleRedirectPromise() corren una sola vez. #btnEntrar nace deshabilitado
// (index.html) y arrancar() lo enciende solo cuando no hay cuenta.
let msalListo = null;
function prepararMsal() {
    return msalListo ??= (async () => { await pca.initialize(); return pca.handleRedirectPromise(); })().catch(e => { msalListo = null; throw e; });   // si falla, el siguiente clic lo reintenta
}
const PISTA_MARCA = 'MINSA · Proyectos';
function pistaEntrada(texto) { const p = $('textoEntrar'); p.textContent = texto; p.classList.toggle('estado', texto !== PISTA_MARCA); }   // U-05: un ESTADO se pinta legible; la marca, chica
// U-04 / C-03 (v0.87.0): los dos catch (entrar, arrancar) dejaban la entrada en estados distintos — el de arrancar
// no tocaba la pista («Abriendo el sitio…» se quedaba) — y ninguno deshacia siteId. Una sola salida: boton vivo,
// pista con el error y el mensaje como llega (README v0.77.0: los mensajes de MSAL no se traducen, el codigo va en el link).
function fallaEntrada(e, prefijo) {
    estado.siteId = null; estado.sesion = false;
    const motivo = e && e.message ? e.message : String(e);
    avisar(prefijo + ': ' + motivo, 'error');
    $('btnEntrar').disabled = false;
    pistaEntrada(navigator.onLine === false ? 'Sin conexión: hace falta red para entrar.' : 'No se pudo entrar. Vuelve a intentarlo.');
}
async function entrar() {
    $('btnEntrar').disabled = true;
    pistaEntrada('Entrando…');
    try {
        if (CONFIG.clientId.startsWith('PENDIENTE')) throw new Error('la app todavía no está registrada en Entra (docs/setup-carlos.md, tarea 1).');
        await prepararMsal();
        if (pca.getAllAccounts().length === 0) {
            guardarDestino();
            await pca.loginRedirect({ scopes: CONFIG.scopes }); return;
        }
        await sesionIniciada();
    } catch (e) { fallaEntrada(e, 'No se pudo entrar'); }
}
// La ida y vuelta por login.microsoftonline.com pierde el hash: se guarda para aterrizar ahi (entrar y, desde
// U-03 v0.87.0, tambien el acquireTokenRedirect de la sesion caducada: antes aterrizaba en Inicio).
function guardarDestino() { try { if (esHashDeLaApp(location.hash)) sessionStorage.setItem('proy.destino', location.hash); } catch (_) {} }
async function arrancar() {
    if (window.self !== window.top) return;
    ondaAlPulsar();   // v0.30.0 (B5): la onda de todo .mn-btn, antes de la entrada (el boton de entrar tambien la lleva)
    try {
        const respuesta = await prepararMsal();
        if (respuesta || pca.getAllAccounts().length > 0) {
            pistaEntrada('Entrando…');
            await sesionIniciada();
        } else {
            $('btnEntrar').disabled = false; $('btnEntrar').focus();   // U-06: el foco cae en el unico boton de la pantalla
            pintarRed();   // U-01: si ya se arranco sin red, la pista lo dice
        }
    } catch (e) { fallaEntrada(e, 'No se pudo terminar el inicio de sesión'); }
}
async function salir() {
    const { ok } = await confirmar({ titulo: 'Salir de la app', ok: 'Salir', texto: 'Se cierra la sesión de MINSA en este dispositivo. Lo guardado ya está en las listas.' });
    if (!ok) return;
    try { await pca.logoutRedirect({ account: estado.cuenta }); }
    catch (_) { sessionStorage.clear(); window.location.reload(); }
}
// S-06 (v0.77.0, MSAL 5.x): sin pagina de «redirect bridge» el silencioso ya no puede renovar por iframe oculto
// cuando el refresh token vencio (24 h) con la pestaña viva: espera `iframeBridgeTimeout` (10 s) y falla con
// redirect_bridge_timeout en vez de interaction_required. Se tratan igual y se va por redirect, que si completa
// sin puente (redirect-bridge.md de msal-browser: «Redirect flows can work without the redirect bridge only if
// your redirectUri points to a page that directly processes the authentication response»). Una pestaña nueva
// nunca pasa por aqui: sessionStorage vacio → loginRedirect.
function pideInteraccion(e) {
    return (typeof msal !== 'undefined' && msal.InteractionRequiredAuthError && e instanceof msal.InteractionRequiredAuthError)
        || (e && ['interaction_required', 'redirect_bridge_timeout'].includes(e.errorCode));
}
// C-04 (v0.87.0): un solo redirect por sesion caducada. cargarTodo lanza 5-6 peticiones en paralelo y cada una
// pide el token: sin candado eran N avisos y N acquireTokenRedirect. La primera crea la promesa, las demas la esperan.
let reentrando = null;
async function tokenOReentrar() {
    try { return await token(); }
    catch (e) {
        if (pideInteraccion(e)) {
            if (!reentrando) {
                avisar('La sesión caducó: volviendo a entrar…', 'ojo');
                guardarDestino();   // U-03
                reentrando = pca.acquireTokenRedirect({ scopes: CONFIG.scopes, account: estado.cuenta }).finally(() => { reentrando = null; });
            }
            await reentrando;
        }
        throw e;
    }
}
// v0.13.1 (auditoria de seguridad): el cliente pide el token VIGENTE en cada peticion (MSAL lo renueva en
// silencio y lo cachea, asi que es barato); si la renovacion falla se usa el ultimo leido y el 401 lo dice.
// S-06: salvo cuando lo que falla es la sesion — ahi se va por redirect (revisor de v0.77.0: antes cada
// peticion esperaba los 10 s del iframe, se tragaba el error y salia con el token viejo a un 401).
// C-01 (v0.87.0): el cliente se crea UNA vez — recrearlo en cada recargar tiraba su cache de listas y volvia a
// pedir GET /lists. C-06: el «ultimo leido» es una variable de este closure, no un campo de estado.
async function refrescarCliente() {
    let ultimo = await tokenOReentrar();
    if (estado.cliente) return;
    estado.cliente = crearCliente(CONFIG.graph, async () => { try { ultimo = await tokenOReentrar(); } catch (_) { /* se queda el ultimo */ } return ultimo; });
}
/* A5 (2026-09-12): el correo + rol en un solo span se partia a media palabra («gerenci / a»).
   Ahora: nombre en negrita, correo en el title. v0.48.0: el rol es un ROTULO DE DATOS (`.rol`, mono y
   versalitas como «EQUIPOS»), ya no un chip celeste — es un dato de la sesion, no un estado. */
function ponerQuien(texto) {
    const rol = texto.includes(' · ') ? texto.split(' · ').pop() : '';
    const correo = texto.split(' · ')[0];
    for (const q of document.querySelectorAll('.quien')) {
        q.textContent = ''; q.title = correo;
        q.appendChild(el('b', '', nombreDe(correo, estado.roles)));
        if (rol) q.appendChild(el('span', 'rol', rol));
    }
    $('rolMovil').textContent = rol;
}
function pintarSync(leyendo = false) {
    const t = Date.now() - estado.cargadoEl;
    const hace = !estado.cargadoEl ? '' : t < 60000 ? `hace ${Math.max(1, Math.round(t / 1000))} s` : t < 3600000 ? `hace ${Math.round(t / 60000)} min` : `hace ${Math.round(t / 3600000)} h`;
    for (const x of document.querySelectorAll('.sync')) {
        x.textContent = 'corto' in x.dataset ? (leyendo ? 'leyendo…' : hace) : leyendo ? 'Leyendo las listas…' : estado.cargadoEl ? `Al día · leído ${hace}` : '';   // v0.48.0: dentro del menu «···» solo cabe «hace N min»
        x.classList.toggle('viejo', !leyendo && t > 300000);
    }
}
let recargando = false;   // C-07 (v0.87.0): declarada antes de su primer uso (el timer de abajo); vivia 30 lineas despues
setInterval(() => { if (estado.sesion) pintarSync(recargando); }, 15000);

// C-03 (v0.87.0): si cargarTodo falla, siteId se deshace y `sesion` nunca se enciende — antes quedaba puesto
// y los timers releian y repintaban detras de la pantalla de entrada.
async function sesionIniciada() {
    estado.cuenta = pca.getAllAccounts()[0];
    await refrescarCliente();
    ponerQuien(estado.cuenta.username);
    pistaEntrada('Abriendo el sitio Administración…');
    estado.siteId = await estado.cliente.sitio(CONFIG.sharepointHost, CONFIG.sitio);
    try { await cargarTodo(); }
    catch (e) { estado.siteId = null; throw e; }
    estado.sesion = true;
    estado.rol = rolDe(estado.cuenta.username, estado.roles);
    ponerQuien(`${estado.cuenta.username} · ${estado.rol}`);
    $('pantallaEntrar').classList.add('oculto');
    $('shell').classList.remove('sin-sesion');
    $('rail').classList.remove('oculto');
    $('barraMovil').classList.remove('oculto');
    $('syncMovil').classList.remove('oculto'); pintarSync();
    pintarRailEquipos();
    // F13: la misma lista en Microsoft Lists (su vista Tablero es el plan B gratis del plan).
    const urlLista = estado.cliente.urlDeLista(L.tareas);
    for (const id of ['lnkSharePoint', 'lnkSharePointMovil']) { $(id).classList.toggle('oculto', !urlLista); if (urlLista) $(id).href = urlLista; }
    // Aterriza donde diga el hash (deep link, F5, o el destino guardado antes del login); si no, Inicio.
    let destino = null;
    try { destino = sessionStorage.getItem('proy.destino'); sessionStorage.removeItem('proy.destino'); } catch (_) {}
    if (!esHashDeLaApp(location.hash) && destino) fijarHash(destino);
    estado.pestana = null;
    aplicarHash();
}

// ---------------------------------------------------------------- carga

async function cargarTodo() {
    recargando = true; pintarSync(true);
    const c = estado.cliente, s = estado.siteId;
    try {
        // v0.13.1 (auditoria de rendimiento): PROY_Actividad se lee ACOTADA a CONFIG.actividadDias (Cuando esta
        // indexada) y el proyecto abierto se completa con todo su historial en la misma tanda. Si el tenant
        // rechazara el filtro de fecha (400), se cae a la lectura entera de antes y se avisa en consola.
        const piso = desdeHaceDias(CONFIG.actividadDias);
        const abierto = proyectoAbierto() ? Number(estado.proyectoAbiertoId) : 0;
        const actividadAcotada = async () => {
            if (!piso) return c.renglones(s, L.actividad);
            try { return await c.renglones(s, L.actividad, `fields/Cuando ge '${piso}'`); }
            catch (e) { if (!/HTTP 400/.test(String(e && e.message))) throw e; console.warn('PROY_Actividad: el filtro por fecha dio 400; se lee entera.', e.message); return c.renglones(s, L.actividad); }
        };
        // C-02 (v0.91.0): los nombres reales de PROY_Tareas, UNA vez por sesion (AsignadoPor solo se escribe si la lista ya lo tiene);
        // si la lectura falla se queda en null y la app no manda el campo, nunca deja de cargar.
        const columnasTareas = async () => estado.columnasTareas || c.columnas(s, await c.idDeLista(s, L.tareas)).then(cs => new Set(cs.map(x => x.name))).catch(e => { console.warn('PROY_Tareas: no se pudieron leer las columnas; AsignadoPor no se escribe.', e && e.message); return null; });
        const [proyectos, tareas, ligas, roles, actividad, delAbierto, colsTareas] = await Promise.all([
            c.renglones(s, L.proyectos), c.renglones(s, L.tareas), c.renglones(s, L.ligas), c.renglones(s, L.roles), actividadAcotada(),
            abierto && piso ? c.renglones(s, L.actividad, `fields/ProyectoId eq ${abierto}`).catch(() => null) : Promise.resolve(null),
            columnasTareas()
        ]);
        estado.columnasTareas = colsTareas;
        estado.proyectos = proyectos; estado.tareas = tareas; estado.ligas = ligas; estado.roles = roles;
        estado.actividad = actividad.sort((a, b) => String(b.Cuando || '').localeCompare(String(a.Cuando || '')));
        estado.actividadCompleta = new Set(piso ? [] : proyectos.map(p => p.id));
        if (delAbierto) { estado.actividadCompleta.add(abierto); fusionarActividad(delAbierto); }
        estado.buzonExiste = {}; estado.buzonAvisado = false;   // C-03: el aviso «no se pudo consultar el buzon» va una vez por carga
        estado.cargadoEl = Date.now();
        await cargarCapital(roles);
    } finally { recargando = false; pintarSync(); }
}
/**
 * v0.100.0: PROY_Capital se lee DESPUES de saber el rol y solo para gerencia (dato financiero: a colaborador y lectura ni se les
 * baja). Copia la guarda de estado.columnasTareas: la lista puede no existir todavia — `idDeLista` lo dice sin pedir nada mas
 * a Graph (ningun 404 en consola) y se recuerda en estado.capitalLista = false el resto de la sesion; cualquier otra falla
 * queda en estado.capitalError y la seccion la muestra. Nunca tira la carga del resto de la app.
 */
async function cargarCapital(roles) {
    if (!PUEDE.capital(rolDe(estado.cuenta.username, roles))) { estado.capital = []; return; }
    if (estado.capitalLista === false) return;
    try {
        estado.capital = await estado.cliente.renglones(estado.siteId, L.capital);
        estado.capitalLista = true; estado.capitalError = null;
    } catch (e) {
        const m = String(e && e.message || e);
        if (/no existe la lista/.test(m)) { estado.capitalLista = false; estado.capital = []; estado.capitalError = null; }
        else { estado.capitalError = m; console.warn('PROY_Capital: no se pudo leer; se queda lo de la lectura anterior.', m); }
    }
}
async function recargar() {
    // La guarda va ANTES de refrescar el token: dos cierres seguidos (cerrarDialogo + el evento close,
    // E4) o dos clics llegaban los dos a cargarTodo si el primero seguia esperando la red (revisor, 2026-09-12).
    if (recargando) return;
    recargando = true; $('btnActualizar').disabled = true;
    try {
        await refrescarCliente();
        await cargarTodo();
        estado.rol = rolDe(estado.cuenta.username, estado.roles);
        ponerQuien(`${estado.cuenta.username} · ${estado.rol}`);
        // T3: se repinta SIEMPRE (los chips «venció»/«vence hoy» dependen del reloj, y el DOM viejo
        // engancha objetos viejos), pero sin mover la posicion de lectura. «Solo si cambio» se
        // intento y se retiro en la revision de v0.4.0 por esas dos razones.
        const y = window.scrollY; repintar(); window.scrollTo({ top: y });
        repintarFicha();   // C-02 (17-sep): la ficha abierta se re-pinta con el objeto VIVO (cargarTodo reemplazo estado.tareas)
    } catch (e) { avisar('No se pudieron releer las listas: ' + (e && e.message ? e.message : e), 'error'); }
    finally { recargando = false; $('btnActualizar').disabled = false; pintarSync(); }
}
// Refresco automatico mientras la app esta a la vista; nunca borra un dialogo de EDICION abierto.
// E4 (v0.6.0): Equipo y Toda la actividad son de lectura y alguien los deja abiertos minutos; con
// ellos abiertos se sigue releyendo, y al cerrarlos se relee si ya pasaron 60 s (la regla de visibilitychange).
const DLG_EDICION = ['dlgTarea', 'dlgNuevaTarea', 'dlgProyecto', 'dlgCubetas', 'dlgLigar', 'dlgSubir', 'dlgEnlace', 'dlgPartida', 'dlg'];
const editando = () => DLG_EDICION.some(id => $(id).open);
const rancio = () => estado.sesion && Date.now() - estado.cargadoEl > 60000;
if (CONFIG.refrescoMs > 0 && new URLSearchParams(location.search).get('refresco') !== '0') {
    setInterval(() => { if (estado.sesion && document.visibilityState === 'visible' && !editando()) recargar(); }, CONFIG.refrescoMs);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && rancio() && !editando()) recargar(); });
// v0.15.0: la marca de lectura compartida se manda agrupada (1.5 s); al ocultarse la pagina se empuja lo que quede.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarVisto(); });
window.addEventListener('pagehide', () => { guardarVisto(); });
const DLG_LECTURA = ['dlgEquipo', 'dlgActividad'];
fijarAlCerrar(id => { if (DLG_LECTURA.includes(id) && rancio() && !editando()) recargar(); });
for (const id of DLG_LECTURA) $(id).addEventListener('close', () => { if (rancio() && !editando()) recargar(); });   // Esc no pasa por cerrarDialogo
fijarReleer(recargar);   // un 412 (alguien cambio el renglon) se resuelve releyendo: la verdad esta en SharePoint

// T2: sin red se ve, no se guarda. La banda lo dice; graph.js falla YA en cualquier escritura; al
// volver la red se releen las listas (no se reintenta el ultimo cambio: un cambio viejo sorprende).
// U-01 / U-02 (v0.87.0): en la pantalla de entrada la banda no se pinta (ahi «puedes ver, no guardar» es falso y
// empujaba la pista fuera de un cuerpo sin scroll): lo dice la pista, y el boton sigue vivo (estilo.css, .entrada).
function pintarRed() {
    const sin = navigator.onLine === false;
    $('sinRed').classList.toggle('oculto', !sin || !estado.sesion);
    document.body.classList.toggle('sin-red', sin);
    if (!estado.sesion && !$('btnEntrar').disabled) pistaEntrada(sin ? 'Sin conexión: hace falta red para entrar.' : PISTA_MARCA);
}
window.addEventListener('offline', pintarRed);
window.addEventListener('online', () => { pintarRed(); if (estado.sesion && !editando()) recargar(); });   // C-02: la misma guarda que el timer y visibilitychange
pintarRed();

// ---------------------------------------------------------------- navegacion

function irA(p) {
    const negado = p === 'capital' && !PUEDE.capital(estado.rol);   // v0.100.0: Capital es solo de gerencia (una liga pegada tampoco entra)
    if (negado) p = 'inicio';
    estado.pestana = p;
    // U-03 (v0.90.0): el filtro que fija Inicio («ver en Mis tareas» de las vencidas) dura UNA visita: al entrar a #mis por la pestaña
    // o por un hash sin origen se vuelve a «abiertas». Lo que se elige con los contadores dentro de la pantalla no pasa por aqui.
    if (p === 'mis') { estado.filtroMis = estado.filtroMisAlLlegar || null; estado.filtroMisAlLlegar = null; }
    if (p !== 'roadmap') roadmapFull(false);   // v0.26.0: salir de pantalla completa al cambiar de pantalla
    for (const s of document.querySelectorAll('.pantalla')) s.classList.add('oculto');
    $('p-' + (p === 'proyecto' ? 'proyecto' : p)).classList.remove('oculto');
    for (const b of document.querySelectorAll('#pestanas button')) {
        const on = b.dataset.p === p || (p === 'proyecto' && b.dataset.p === 'proyectos');
        b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    limpiarAvisos();
    olvidarLugarRoadmap();   // C-07 (v0.120.0): al ENTRAR a una pantalla el gantt arranca en la raya de hoy; el refresco (repintar) conserva el lugar
    repintar();
    fijarHash(hashDe(tarjetaAbiertaId()));
    window.scrollTo({ top: 0 });
    if (negado) avisar('Capital es solo para gerencia.', 'ojo');
    if (p === 'calendario') enfocarCal();   // U-02 (v0.86.0): al ENTRAR, la agenda del celular aterriza en hoy (no en repintar(): ese corre en cada refresco y moveria la pantalla)
}
// Router por hash (v0.2.0, F8): LEE location.hash y deja la pantalla como dice; es idempotente, asi
// que las escrituras propias (fijarHash desde irA / abrirTarjeta) no repintan dos veces. Con Atras
// del navegador se cierra la tarjeta o se vuelve a la pantalla anterior, que es lo que la gente espera.
// v0.10.0: cinco pantallas mas (roadmap · calendario · mensajes · archivos · reportes) y la pestana roadmap del proyecto.
// v0.42.0: Mensajes lleva lo elegido en el hash (#mensajes/f/<clave> el hilo del frente), para que Atras regrese a la
// bandeja y una liga pegada abra justo ese hilo. v0.43.0: #mensajes/d/<alias> (la ficha de la persona) ya no existe;
// una liga vieja con /d/ cae a la bandeja de Mensajes con aviso.
const RE_HASH = /^#(?:(inicio|proyectos|mis|roadmap|calendario|mensajes|archivos|reportes|capital)(?:\/(f|d)\/([a-z0-9._-]+))?|p\/([a-z0-9-]+)(?:\/(lista|docs|chat|tablero|resumen|roadmap|capital))?)(?:\/t\/(\d+))?$/;
function esHashDeLaApp(h) { return RE_HASH.test(String(h || '')); }
function aplicarHash() {
    if (!estado.sesion) return;
    const m = RE_HASH.exec(location.hash || '');
    if (!m) { irA('inicio'); return; }
    const [, pantalla, msjTipo, msjClave, clave, tabHash, tareaId] = m;
    if (clave) {
        const p = proyectoPorClave(clave);   // C-07 (mensajes, 17-sep)
        if (!p) { irA('inicio'); avisar(`No hay un proyecto con la clave «${clave}».`, 'ojo'); return; }
        const tab = tabHash || 'tablero';
        if (estado.pestana !== 'proyecto' || estado.proyectoAbiertoId !== p.id || estado.tab !== tab) {
            fijarProyectoAbierto(p); estado.tab = tab; irA('proyecto');
        }
    } else if (pantalla === 'mensajes') {
        // /f/<clave> solo vale aqui; un sufijo en otra pantalla se ignora (el regex lo admite para no partir la ruta)
        let sel = null;
        if (msjTipo === 'f') { const p = proyectoPorClave(msjClave); if (p) { sel = { t: 'f', k: p.Clave }; if (p.Estado === 'activo' || comentariosDe(p.id).length) asegurarActividadDe(p.id).then(hubo => { if (hubo && estado.pestana === 'mensajes') repintar(); }); } else avisar(`No hay un frente con la clave «${msjClave}».`, 'ojo'); }
        else if (msjTipo === 'd') avisar('El chat por persona ya no está en la app (v0.43.0): escríbele por Teams.', 'ojo');
        const cambio = JSON.stringify(sel) !== JSON.stringify(estado.mensajesSel || null);
        estado.mensajesSel = sel;
        if (estado.pestana !== 'mensajes') irA('mensajes'); else if (cambio) repintar();
    } else if (pantalla === 'capital') {
        // v0.100.0: #capital/f/<clave> = la seccion filtrada por ese proyecto (lo que abre la tarjeta del Resumen); sin sufijo, todos
        let f = null;
        if (msjTipo === 'f') { const p = proyectoPorClave(msjClave); if (p) f = p.id; else avisar(`No hay un proyecto con la clave «${msjClave}».`, 'ojo'); }
        const cambio = f !== estado.filtroCapital; estado.filtroCapital = f;
        if (estado.pestana !== 'capital') irA('capital'); else if (cambio) repintar();
    } else if (estado.pestana !== pantalla) irA(pantalla);
    const id = tareaId ? Number(tareaId) : null;
    if (id) { if (tarjetaAbiertaId() !== id) { if (porId(estado.tareas, id)) abrirTarjeta(id); else avisar(`No hay una tarjeta #${id}.`, 'ojo'); } }
    else if ($('dlgTarea').open) cerrarDialogo('dlgTarea');
}
window.addEventListener('popstate', aplicarHash);     // Atras / Adelante (fijarHash escribe con pushState)
window.addEventListener('hashchange', aplicarHash);   // una URL pegada o editada a mano
/** Deja `p` como proyecto abierto; si es OTRO proyecto, el filtro de tarjetas y la columna del celular vuelven al default. */
function fijarProyectoAbierto(p) {
    if (estado.proyectoAbiertoId !== p.id) {
        limpiarFiltroTareas();   // C-13 (v0.95.0)
        estado.colMovil = null; estado.ordenLista = { col: 'vence', dir: 1 };   // v0.11.0: null = la primera cubeta del proyecto
        estado.hechoTodas = false; estado.filtroDocs = null; estado.buscaDocs = '';   // v0.17.0: el buscador de Docs tampoco viaja entre proyectos
        estado.ordenDocs = { col: 'del', dir: -1 };   // v0.18.0: ni su orden (una columna oculta en este panel no puede quedar mandando); v0.19.0: la del documento, que si se ve
        estado.abiertasDocs = new Set();   // v0.52.0: ni que carpetas del arbol abriste (nace todo plegado)
    }
    estado.proyectoAbiertoId = p.id;   // C-11 (v0.115.0): el id, no el objeto
    // v0.13.1: la actividad de este proyecto se completa fuera de la ventana (chat y notas viejas); si trae algo
    // nuevo y el proyecto sigue abierto, se repinta. Best-effort: sin red se queda lo que hay.
    asegurarActividadDe(p.id).then(hubo => { if (hubo && estado.proyectoAbiertoId === p.id) repintar(); });
}
function repintar() {
    // v0.42.0: el hilo tambien vive en Mensajes (#mensajes/f/<clave>); ahi el chat esta «en pantalla» y no se sale de el.
    const chatEnMensajes = estado.pestana === 'mensajes' && !!proyectoDeMensajes();   // C-07 (17-sep)
    if (!(estado.pestana === 'proyecto' && estado.tab === 'chat') && !chatEnMensajes) salirDelChat();   // v0.9.0: la proxima vez que se vea el chat cuenta como «entrar»
    if (estado.pestana !== 'mensajes') devolverChat();   // v0.42.0: #tab-chat vuelve a la pestana del proyecto
    if (estado.pestana !== 'inicio') estado.nuevosInicio = null;   // v0.15.0: la proxima visita a Inicio fija otro conjunto de «Nuevo para ti»
    document.body.classList.toggle('is-chat', (estado.pestana === 'proyecto' && estado.tab === 'chat') || chatEnMensajes);   // v0.15.0: en celular el FAB se esconde en el chat
    pintarInsignias();
    pintarRailEquipos();
    if (estado.pestana === 'inicio') pintarInicio();
    else if (estado.pestana === 'proyectos') pintarProyectos();
    else if (estado.pestana === 'proyecto') pintarProyecto();
    else if (estado.pestana === 'mis') pintarMisTareas();
    else if (estado.pestana === 'roadmap') pintarRoadmap();
    else if (estado.pestana === 'calendario') pintarCalendario();
    else if (estado.pestana === 'mensajes') pintarMensajes();
    else if (estado.pestana === 'archivos') pintarArchivos();
    else if (estado.pestana === 'reportes') pintarReportes();
    else if (estado.pestana === 'capital') pintarCapital();   // v0.100.0
    if ($('dlgActividad').open) pintarActividad();   // C-12 (v0.94.0): el refresco sigue con «Toda la actividad» abierta (E4); acCtx conserva filtro y pagina
}
alCambiarTareas(repintar);
alCambiarDocs(repintar);
alCambiarChat(repintar);
fijarAbrirTarjeta(abrirTarjeta);

const misAbiertas = () => misAbiertasDe(estado.tareas, estado.cuenta.username);   // C-03 (v0.90.0): la misma regla que pinta la pantalla (reglas.js)

function pintarInsignias() {
    // v0.100.0: el acceso a Capital (rail en escritorio, menu «···» en celular) solo existe para gerencia
    for (const id of ['railCapital', 'irCapitalMovil']) $(id).classList.toggle('oculto', !PUEDE.capital(estado.rol));
    const mias = misAbiertas();
    // T4: el contador del rail siempre es VENCIDAS (rojo) y nada si no hay; el total abierto vive en el KPI de Inicio.
    const vencidas = mias.filter(t => estadoVence(t, CONFIG.vencePronto) === 'danger').length;
    $('nMis').textContent = String(vencidas); $('nMis').hidden = vencidas === 0;
    const n = activos().length; $('nProyectos').textContent = String(n); $('nProyectos').hidden = n === 0;
    // D5: el lector de pantalla leia «Mis tareas 1» sin decir que el 1 son vencidas.
    const nombrar = (id, texto) => { $(id).setAttribute('aria-label', texto); $(id).title = texto; };
    nombrar('nMis', `${vencidas} vencida${vencidas === 1 ? '' : 's'}`);
    nombrar('nProyectos', `${n} activo${n === 1 ? '' : 's'}`);
    // v0.10.0: mensajes nuevos desde tu ultima visita (v0.9.0, por dispositivo), sumados sobre los frentes activos.
    const nm = mensajesNuevos(); $('nMensajes').textContent = String(nm); $('nMensajes').hidden = nm === 0;
    nombrar('nMensajes', `${nm} mensaje${nm === 1 ? '' : 's'} nuevo${nm === 1 ? '' : 's'}`);
}
/** Rail de equipos (U2, v0.7.0): agrupados por RAMA como el rail del Tablero de escritorio (opcion A del
 *  artifact c52cb229, Carlos 2026-09-12), cada uno con su icono en su color y cuantos proyectos activos lleva.
 *  El filtro puesto se ve (is-on) y el segundo clic lo quita. Un equipo fuera de CONFIG.ramas cae en «Otros». */
function pintarRailEquipos() {
    const c = $('railEquipos'); c.textContent = '';
    const vivos = activos();   // C-07 (mejorar-app, 16-sep): una vez, no por equipo
    const ramas = [...CONFIG.ramas, ...CONFIG.equipos.map(e => e.rama || 'Otros').filter(r => !CONFIG.ramas.includes(r))];
    for (const r of ramas) {
        const eqs = CONFIG.equipos.filter(e => (e.rama || 'Otros') === r); if (!eqs.length) continue;
        c.appendChild(el('div', 'mn-label rama', r));
        for (const e of eqs) {
            const on = estado.filtroEquipo === e.clave;
            const b = boton('', on ? 'is-on' : '', () => { estado.filtroEquipo = on ? null : e.clave; if (['proyectos', 'roadmap', 'calendario', 'reportes'].includes(estado.pestana)) repintar(); else irA('proyectos'); }, { equipo: e.clave });   // v0.10.0: el filtro vive donde se puso
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.appendChild(iconoEquipo(e, 'sm')); b.appendChild(el('span', '', e.nombre));
            const n = vivos.filter(p => p.Equipo === e.clave).length;
            if (n) b.appendChild(el('span', 'n', String(n)));
            c.appendChild(b);
        }
    }
    // En celular el rail es barra de pestanas y los equipos no caben: el mismo filtro es un <select> en Proyectos.
    const sel = $('filtroEquipoMovil');
    opciones(sel, CONFIG.equipos, e => e.clave, e => { const n = vivos.filter(p => p.Equipo === e.clave).length; return n ? `${e.nombre} · ${n}` : e.nombre; }, 'Todos los equipos');
    sel.value = estado.filtroEquipo || '';
}

// ---------------------------------------------------------------- Inicio

/**
 * C8 (v0.6.0): el reloj del frente CRUZADO con lo que falta — «vence en 6 d · faltan 10» (ámbar a
 * `vencePronto` días, rojo vencido). Sin fecha, o lejos, devuelve null y la lista pinta «fin dd/mm».
 */
function chipReloj(p, ts) {
    if (p.Estado !== 'activo' || !p.Vence) return null;
    const d = diasPara(p.Vence); if (d === null || d > CONFIG.vencePronto) return null;
    const faltan = ts.filter(t => t.Columna !== 'hecho').length;
    const c = chip(`${fraseVence(d, 'dias')} · faltan ${faltan}`, claseVence(d, CONFIG.vencePronto)); c.dataset.reloj = String(p.id);   // C-04 (v0.79.0)
    return c;
}
/**
 * v0.25.0 — «calendario de mes» (opcion B5 del artifact 5276f348, elegida por Carlos el 2026-09-14; sustituye a las fichas
 * por unidad de v0.23.0): un RENGLON por frente, plano —sin encabezado por equipo— y ordenado por lo que vence antes. A la
 * izquierda la hoja de calendario del fin del frente (el mes arriba con el color del semaforo —rojo vencido · ambar <=
 * vencePronto · marca lejos · gris sin fecha · verde cerrado— y el dia grande), en medio el icono del equipo, el titulo y
 * «Rama · Unidad» en versalitas, y a la derecha tres cifras: abiertas · vencidas · hechas. Carlos pidio que NO lleve nada
 * mas: ni anillo de %, ni barra por cubeta, ni «sigue:», ni chips, ni avatares. Un frente cerrado ensena la fecha de
 * cierre en la hoja. `.pficha`, `.t`, `.cal`, `.stats`, `is-warn` y `[data-open]` los usan la E2E y el driver de capturas.
 */
function fichaProyecto(p, ts) {
    const a = avance(ts, columnasDe(p)); const eq = equipoDe(p);
    const d = p.Estado === 'activo' ? diasPara(p.Vence) : null;
    const k = p.Estado !== 'activo' ? 'cerrado' : claseVence(d, CONFIG.vencePronto, 'info');   // C-04 (v0.79.0)
    const r = el('button', 'pficha is-' + k); r.type = 'button'; r.dataset.open = String(p.id); r.style.setProperty('--c', eq.color);
    // la hoja de calendario: el fin del frente (o el cierre, si ya cerro); sin fecha, «— ?» en gris
    const md = mesDia(p.Estado === 'activo' ? p.Vence : p.CerradoEl);
    // U-07 (mejorar-app, 16-sep): sin fecha la hoja dice «SIN / fecha» en gris — antes «— ?» y el significado solo vivia en el title, que en celular no existe
    const cal = el('span', 'cal' + (md ? '' : ' sin')); cal.appendChild(el('span', 'mes', md ? md.mes : 'sin')); cal.appendChild(el('span', 'dia', md ? String(md.dia) : 'fecha'));
    cal.title = p.Estado !== 'activo' ? `Cerrado el ${fechaCorta(p.CerradoEl)}` : d === null ? 'Sin fin del frente' : `Fin del frente: ${fechaCorta(p.Vence)} · ${fraseVence(d, 'dias')}`;   // C-04 (v0.79.0): antes decia «vencio» sin acento y «en N d» sin verbo
    r.appendChild(cal);
    // icono del equipo, y en un solo bloque de texto el titulo con su etiqueta «Rama · Unidad» en linea: la etiqueta sigue al
    // titulo y envuelve con el (en columnas propias, a 820 px la etiqueta nowrap estrangulaba el titulo a 75 px — revisor 14-sep)
    const cab = el('span', 'cab'); cab.appendChild(iconoEquipo(eq, 'sm')); const tt = el('span', 'tt'); tt.appendChild(el('span', 't', p.Title));
    tt.appendChild(el('span', 'uni', eq.rama && eq.rama !== eq.nombre ? `${eq.rama} · ${eq.nombre}` : eq.nombre)); cab.appendChild(tt); r.appendChild(cab);   // U-03 (16-sep): la rama Administración se llama como su unidad; no se repite
    // las tres cifras; «abiertas» = todo lo que no esta en la cubeta que cierra (avance: categoria hecho)
    const st = el('span', 'stats'); const venc = vencidasEn(ts);
    const cifra = (n, rot, cls) => { const s = el('span'); s.appendChild(el('b', cls || '', String(n))); s.appendChild(el('small', '', rot)); st.appendChild(s); };
    if (ts.length) { cifra(a.total - a.hechas, 'abiertas'); cifra(venc, 'vencidas', venc ? 'bad' : ''); cifra(a.hechas, 'hechas'); }
    else st.appendChild(el('small', 'sin', 'sin tarjetas'));   // U-07 (16-sep): «0 · 0 · 0» parecia tres cifras con significado
    r.appendChild(st);
    // U-10 (mejorar-app proyectos, 24-sep): el lector de pantalla leia los spans pegados («sep18…1abiertas0vencidas») y no decia si ya vencio
    const pl = (k, s) => `${k} ${s}${k === 1 ? '' : 's'}`; const cifras = ts.length ? `${pl(a.total - a.hechas, 'abierta')}, ${pl(venc, 'vencida')}, ${pl(a.hechas, 'hecha')}` : 'sin tarjetas';
    r.setAttribute('aria-label', `${p.Title}, ${tt.lastChild.textContent}. ${cal.title}. ${cifras}.`);
    return r;   // el clic lo atiende UN listener delegado (C-05, abajo); antes cada ficha registraba el suyo capturando `p`
}
// C-05 (mejorar-app, 16-sep): las fichas se rehacen en cada repintado y en cada tecla del buscador; el id ya viaja en data-open.
document.addEventListener('click', ev => { const f = ev.target.closest('.pficha[data-open]'); if (f) abrirProyecto(f.dataset.open); });
/** Pinta `proyectos` (ya ordenados, C10) en `cont` como renglones. Deja `cont` vacio si no hay proyectos.
 *  C-07 (mejorar-app, 16-sep): las tareas se reparten por proyecto UNA vez aqui; antes cada ficha recorria todas (O(P·T)). */
function pintarFichas(cont, proyectos) {
    cont.textContent = '';
    if (!proyectos.length) return;
    const porP = new Map(); for (const t of estado.tareas) { const k = Number(t.ProyectoId); if (!porP.has(k)) porP.set(k, []); porP.get(k).push(t); }
    const g = el('div', 'fichas'); for (const p of proyectos) g.appendChild(fichaProyecto(p, porP.get(Number(p.id)) || [])); cont.appendChild(g);
}
/** Un renglon de mini lista (2026-09-12): cabecera = quien + cuando; debajo la frase a todo el ancho;
 *  debajo el proyecto en una linea. `texto` NO trae el nombre (lo pone la cabecera); si `texto` ES el
 *  nombre completo (lista Equipo), la cabecera lo lleva entero y no hay frase. */
/** U-18 (v0.114.0): la misma frase que el chip de la tarjeta («venció dd/mm/aaaa» · «vence hoy» · «vence dd/mm/aaaa»). */
function fraseVenceTarjeta(t) { const c = chipVence(t); return c ? c.textContent : fechaCorta(t.Vence); }
function itemMini(quien, texto, sub, derecha, claseDerecha, abre) {
    // C9 (v0.6.0): con `abre` el renglon es un boton que lleva a la tarjeta (antes era texto que habia que buscar).
    // C-11 (v0.95.0): `abre` es una LLAVE (llaveTarea / llaveEvento) que resuelve el delegado de abajo al clic; antes un closure por renglon.
    const it = el(abre ? 'button' : 'div', 'it' + (abre ? ' clic' : ''));
    if (abre) { it.type = 'button'; it.dataset.abre = abre; it.title = 'Abrir la tarjeta'; }
    const c = el('div');
    const nombre = nombreDe(quien, estado.roles), esNombre = texto === nombre;
    const cab = el('div', 'cab'); cab.appendChild(el('span', 'q', esNombre ? nombre : nombre.split(' ')[0]));
    cab.appendChild(el('span', 'd' + (claseDerecha ? ' is-' + claseDerecha : ''), derecha || '')); c.appendChild(cab);
    if (!esNombre) c.appendChild(fraseMarcada(texto));
    if (sub) { const w = el('div', 'w', sub); w.title = sub; c.appendChild(w); }
    it.appendChild(c);
    return it;
}
/** La frase de actividad SIN el nombre (la cabecera de itemMini ya lo lleva); el resto igual que fraseActividad. */
function queHizo(a) { return a.Accion === 'comentar' ? `${verboComentario(a)}: «${a.Title}»` : String(a.Title || ''); }
/** C9: la tarjeta `id` se abre en su proyecto (#p/<clave>/t/<id>); sin tarjeta o sin proyecto, null. C-03 (16-sep): una sola vez. */
function hashTarea(id) { const t = porId(estado.tareas, id); const p = t && porId(estado.proyectos, t.ProyectoId); return p ? `#p/${p.Clave}/t/${t.id}` : null; }
/** C9: un evento de la bitacora con TareaId viva abre su tarjeta; si no, con `pid` (la cola «Hoy») el chat de ese frente; si no, null. */
function hashEvento(a, pid) {
    const h = a && a.TareaId ? hashTarea(a.TareaId) : null; if (h) return h;
    const p = pid ? porId(estado.proyectos, pid) : null; return p ? `#p/${p.Clave}/chat` : null;
}
/**
 * C-11 (v0.95.0): las llaves `data-abre` de los renglones que abren algo —la cola «Hoy», «Sin movimiento», las mini listas del
 * Resumen y la actividad (Inicio, lateral, Toda la actividad)—. Al pintar solo se decide SI el renglon es boton; QUE abre lo
 * resuelve el delegado de abajo contra el estado vivo al clic (regla v0.4.0). Antes abrirTarea/abridorDe/abrirEvento devolvian un
 * closure con el `p` y la `t` del pintado, y cada renglon registraba su listener. «t:<id>» tarjeta · «a:<id>[:<pid>]» evento.
 */
const llaveTarea = t => hashTarea(t.id) ? `t:${t.id}` : null;
const llaveEvento = (a, pid) => hashEvento(a, pid) ? `a:${a.id}${pid ? ':' + pid : ''}` : null;
document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-abre]'); if (!b) return;
    const [tipo, id, pid] = b.dataset.abre.split(':');
    if (tipo === 'q') { const p = proyectoAbierto(); if (!p) return; limpiarFiltroTareas(id ? { quien: [id] } : { sinDueno: true }); estado.tab = 'tablero'; pintarPestanasAbierto(); fijarHash(hashDe()); return; }   // U-27 (v0.123.0): Quiénes del Resumen
    const h = tipo === 't' ? hashTarea(id) : hashEvento(porId(estado.actividad, id), pid);
    if (!h) { avisar('Eso ya no está: se borró o se movió desde que se pintó la pantalla.', 'ojo'); return; }
    if ($('dlgActividad').open) cerrarDialogo('dlgActividad');   // desde Toda la actividad (antes lo hacia abridorDe)
    irAHash(h);
});
/** C-07: un solo formateador de hora de Mexico para la cola (antes uno nuevo por renglon). */
const HORA_MX = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
/**
 * v0.63.0 (Carlos, 15-sep; artifact BL8t8H9H, cortes B + G): cada renglon de actividad lleva a la izquierda un icono redondo
 * cuyo color dice QUE paso sin leer la frase — verde crear · azul nota · ambar asignar/reabrir · marca ligar/subir · rojo borrar ·
 * gris editar/cerrar/desligar. La clase sale de la Accion (y del verbo «asignó», que es editar-tarea en la bitacora).
 */
const ICONO_ACCION = {
    crear: 'M12 5v14M5 12h14',
    nota: 'M21 12a8 8 0 0 1-8 8H8l-4 3v-5a8 8 0 1 1 17-6z',
    asignar: 'M5 12h14M13 6l6 6-6 6',
    editar: 'M4 20h4l10-10-4-4L4 16zM13 7l4 4',
    liga: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    subir: 'M12 16V4M6 10l6-6 6 6M4 20h16',
    cerrar: 'M5 12l5 5L20 7',
    reabrir: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
    borrar: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'
};
function claseAccion(a) {
    const k = String(a.Accion || '');
    if (k.startsWith('crear')) return 'crear';
    if (k === 'comentar') return 'nota';
    if (k === 'editar-tarea' && /^asign/i.test(String(a.Title || ''))) return 'asignar';
    if (k.startsWith('borrar')) return 'borrar';
    if (k === 'ligar') return 'liga';
    if (k === 'subir') return 'subir';
    if (k === 'cerrar-proyecto') return 'cerrar';
    if (k === 'reabrir-proyecto') return 'reabrir';
    return 'editar';
}
function iconoAccion(a) {
    const k = claseAccion(a);
    const s = el('span', 'ico is-' + k); s.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', ICONO_ACCION[k]); svg.appendChild(path); s.appendChild(svg);
    return s;
}
/** Un renglon de actividad para las listas (Inicio, lateral, Toda la actividad). Con icono de accion desde v0.63.0; la hora
 *  es relativa dentro de las 24 h («hace 12 min»). `extra` (Inicio): { nuevo, tuya } — ver pintarActividadInicio. */
function itemActividad(a, conProyecto, extra) {
    const p = porId(estado.proyectos, a.ProyectoId);
    const it = itemMini(a.Quien, queHizo(a), conProyecto && p ? p.Title : '', haceCuanto(a.Cuando), null, llaveEvento(a));
    it.classList.add('con-ico'); it.prepend(iconoAccion(a));
    if (extra) {
        if (extra.nuevo) it.classList.add('es-nuevo'); else if (extra.visto) it.classList.add('es-visto');
        if (extra.tuya) { const q = it.querySelector('.q'); const s = el('span', 'tuya', 'tuya'); s.title = 'Sobre una tarjeta asignada a ti'; q.after(s); }
    }
    return it;
}
/**
 * v0.63.0: la tarjeta «Actividad reciente» de Inicio (artifact BL8t8H9H, B + G). Los renglones van cortados por DIA («Hoy · 6»,
 * «Ayer · 4», «lun 14 sep · 3»), y lo que OTROS hicieron desde tu ultima visita va con punto azul y texto fuerte (es-nuevo);
 * lo de otros ya visto, atenuado (es-visto); lo propio, normal. Sin separador «ya visto»: lo propio se intercala con lo nuevo y
 * el corte quedaba con puntos azules debajo (captura 15-sep). El piso es el mismo de «Nuevo para ti» en la cola
 * (estado.nuevosInicio.desde, que pintarInicio congela al entrar — C-05). «tuya» marca la accion sobre una tarjeta asignada a ti.
 * U-06 (mejorar-app, 16-sep): el contador del corte por dia se calcula sobre `todas` (la actividad visible entera), no sobre los
 * renglones que se pintan: en celular decia «Hoy · 3» con 8 movimientos porque `lista` ya venia recortada al tope.
 */
function pintarActividadInicio(cont, lista, todas = lista) {
    const yo = String(estado.cuenta && estado.cuenta.username || '').toLowerCase();
    const desde = pisoNuevo(estado.nuevosInicio.desde);   // C-10 (v0.94.0): sin marca, los ultimos 3 dias — el mismo piso de «Nuevo para ti»
    let ajenoMasNuevo = '';   // C-10: lo ajeno mas reciente que SE PINTO; pintarInicio sube la marca con el
    for (const a of lista) if (String(a.Quien || '').toLowerCase() !== yo && String(a.Cuando || '') > ajenoMasNuevo) ajenoMasNuevo = String(a.Cuando);
    const hoy = diaDe(new Date()), ayer = sumarDias(hoy, -1);
    const rotulo = d => d === hoy ? 'Hoy' : d === ayer ? 'Ayer' : fechaLegible(d);
    const porDia = new Map(); for (const a of todas) { const d = diaDe(a.Cuando) || '?'; porDia.set(d, (porDia.get(d) || 0) + 1); }
    const deOtro = a => String(a.Quien || '').toLowerCase() !== yo;
    const esNuevo = a => deOtro(a) && String(a.Cuando || '') > desde;
    const hayNuevos = lista.some(esNuevo);   // sin nada nuevo la tarjeta no se atenua entera (la pega del corte G para quien entra a cada rato)
    let diaPintado = null;
    for (const a of lista) {
        const d = diaDe(a.Cuando) || '?';
        if (d !== diaPintado) { const h = el('div', 'dia'); h.appendChild(el('span', '', rotulo(d))); h.appendChild(el('b', '', String(porDia.get(d)))); cont.appendChild(h); diaPintado = d; }
        const nuevo = esNuevo(a), visto = hayNuevos && deOtro(a) && !nuevo;
        const t = a.TareaId ? porId(estado.tareas, a.TareaId) : null;
        const tuya = !!t && String(t.Asignado || '').toLowerCase() === yo && String(a.Quien || '').toLowerCase() !== yo;
        cont.appendChild(itemActividad(a, true, { nuevo, visto, tuya }));
    }
    return ajenoMasNuevo;
}
/** Parte «verbo «titulo» resto» en tres: el titulo en <b> (2 lineas, integro en title) y el resto en linea
 *  propia; «de X a Y» sale como «X → Y». Sin «…» (un titulo de tarjeta), texto plano. Nunca innerHTML. */
function fraseMarcada(texto) {
    const f = el('div', 'f'); const m = /^(.*?)(«[^»]*»)(.*)$/s.exec(texto);
    if (!m) { f.textContent = texto; return f; }
    f.appendChild(document.createTextNode(m[1])); const b = el('b'); b.appendChild(textoConMenciones(m[2], undefined, false)); b.title = m[2]; f.appendChild(b);   // v0.8.0: las @menciones como chip tambien aqui
    const resto = m[3].trim();
    if (resto) f.appendChild(el('span', 'sino', resto.replace(/^de (.+) a (.+)$/, '$1 → $2')));
    return f;
}
/**
 * v0.21.0 — Inicio «Hoy» (iteracion 3 del artifact «Seis iteraciones para ver mas facil», 13-sep). Antes Inicio media
 * 1,959 px a 1366 y repartia lo urgente en cuatro tarjetas con cuatro formatos (KPI · Nuevo para ti · Te mencionaron ·
 * Proximos vencimientos). Ahora: el titulo es el SALUDO con nombre (y la fecha, los frentes activos y el rol debajo);
 * los 5 KPI bajan a 3 de lo MIO —abiertas · vencen en 7 d · vencidas— con TENDENCIA contra ayer (reglas.js: serieKpis — borrada en v0.71.0, C-06,
 * reconstruida por _creado/HechoEl) y un sparkline de 8 dias; y UNA COLA por urgencia (reglas.js: gruposHoy) con el mismo
 * esqueleto por renglon —punto de estado · titulo · frente y dato · avatar · Abrir/Ver—: vencidas · hoy y manana · nuevo
 * para ti · te mencionaron · esta semana · sin dueño. «Proyectos activos» ya lo dice el saludo y «sin dueño» es un grupo
 * de la cola (solo si hay). v0.39.0 («Una sola columna»): sin lateral — bandas a lo ancho, 5 KPI (+ sin dueño y sin
 * movimiento, planos), la cola en dos mitades, fichas a 2 columnas, Actividad | Sin movimiento; Fines de frente salio
 * (las Acciones rapidas de v0.18.0 salieron en v0.38.0). v0.41.0: la fila de KPI salio entera (Carlos, 14-sep).
 */
function pintarInicio() {
    const ahora = new Date();
    const yo = nombreDe(estado.cuenta.username, estado.roles);
    const vivos = activos(), nAct = vivos.length;   // C-07 (mejorar-app, 16-sep): activos() se filtraba cuatro veces por pintado
    $('inicioSaludo').textContent = `${saludoDe(ahora)}, ${yo.split(' ')[0]}`;
    // U-08: el rol va en su propio span; en celular la barra de arriba ya lo dice junto al logo y .rol-sub se oculta (estilo.css)
    const sub = $('inicioSub'); sub.textContent = `${fechaLarga(ahora)} · ${nAct} frente${nAct === 1 ? '' : 's'} activo${nAct === 1 ? '' : 's'}`; sub.appendChild(el('span', 'rol-sub', ` · ${estado.rol}`));
    const abiertas = abiertasInicio(vivos);   // C-11 (v0.95.0): la misma cuenta que el conmutador y «Sin dueño» repiten al clic
    // v0.41.0 (Carlos, 14-sep): la fila de KPI (mías abiertas · vencen en 7 d · vencidas · sin dueño · sin movimiento) SALIO
    // de Inicio. Lo mio vive en Mis tareas (y el rojo del rail), lo global en la cola y en Reportes; «sin movimiento» en su tarjeta.
    // C-05 (mejorar-app, 16-sep): el piso de «Nuevo para ti» se congela AQUI, al entrar, y la marca de visto sube AQUI — antes eran
    // efectos colaterales de pintarCola (que se repinta con cada clic de «solo mías») y pintarActividadInicio dependia de ese orden.
    if (!estado.nuevosInicio) estado.nuevosInicio = { desde: inicioVistoHasta() };
    const nuevos = pintarCola(abiertas);
    pintarSinMovimiento(abiertas, ahora);   // C-09 · U-12 (v0.94.0): despues de la cola, porque excluye lo que ella ya pinto
    const lp = $('inicioProyectos');
    pintarFichas(lp, ordenarProyectos(vivos));   // C10 · v0.25.0: los mismos renglones «calendario de mes» que en Proyectos
    if (!vivos.length) lp.appendChild(el('p', 'vacio', PUEDE.proyecto(estado.rol) ? 'Sin proyectos activos: crea el primero en Proyectos.' : 'Sin proyectos activos todavía.'));
    // C9: tambien estos renglones abren su tarjeta (el revisor vio la inconsistencia con la actividad).
    // v0.39.0: «Fines de frente» (v0.21.0) salio con la lateral — la hoja de calendario de cada ficha ya trae fecha y semaforo.
    const act = $('inicioActividad'); act.textContent = '';
    // B3: en celular Inicio media 2,400 px; la actividad baja a 3 renglones. v0.14.0: en escritorio son 8 (la tarjeta
    // paso a la columna ancha, bajo Proyectos activos, donde antes sobraba media pantalla).
    const tope = enCelular.matches ? 3 : 8;
    const visible = actividadVisible();   // v0.11.0: sin movimientos entre cubetas
    const ajenoVisto = pintarActividadInicio(act, visible.slice(0, tope), visible);   // C9 · v0.63.0: por dia, con icono y nuevo/visto; U-06: el corte cuenta sobre `visible`
    if (!visible.length) act.appendChild(el('p', 'vacio', 'Sin actividad todavía.'));
    $('btnActividadInicio').hidden = visible.length <= tope;
    // C-10 (v0.94.0): la marca de visto sube con lo ajeno mas reciente que se vio (Nuevo para ti O la actividad); antes solo con
    // «Nuevo para ti», y un comentario ajeno en otro frente seguia con punto azul visita tras visita.
    const hasta = [nuevos.length ? String(nuevos[0].a.Cuando || '') : '', ajenoVisto].sort().pop();
    if (hasta) marcarInicioVisto(hasta);
}
/**
 * C-09 · U-12 (v0.94.0): «Sin movimiento» lista las quietas que la cola NO pinto (ahi ya las marca el sufijo «sin movimiento N d»;
 * antes la misma tarjeta salia dos veces), la mas quieta primero (antes en orden de id: una de 14 d desplazaba a una de 20 d),
 * hasta TOPE_COLA, y el total en el h2. La llaman pintarInicio y el conmutador «solo mías», que cambia lo que la cola pinta.
 */
function pintarSinMovimiento(abiertas, ahora = new Date()) {
    const enCola = new Set([...document.querySelectorAll('#inicioHoy .hoy-r[data-t]')].map(r => Number(r.dataset.t)));
    const quietas = abiertas.map(t => ({ t, n: diasQuieta(t, CONFIG.sinMovimientoDias, ahora, columnasDeTarea) }))
        .filter(x => x.n !== null && !enCola.has(Number(x.t.id))).sort((a, b) => b.n - a.n || a.t.id - b.t.id);
    const sm = $('inicioSinMov'); sm.textContent = '';
    for (const { t, n } of quietas.slice(0, TOPE_COLA)) { const it = itemMini(t.Asignado, t.Title, tituloFrenteDe(t), `${n} d`, 'warn', llaveTarea(t)); it.dataset.t = String(t.id); sm.appendChild(it); }
    $('nSinMov').textContent = quietas.length ? String(quietas.length) : '';
    $('cardSinMov').classList.toggle('oculto', quietas.length === 0);
}

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «domingo 13 de septiembre», por el dia de Mexico (diaDe). */
function fechaLarga(ahora) { const d = diaDe(ahora); const x = new Date(d + 'T12:00:00Z'); return `${DIAS_LARGOS[x.getUTCDay()]} ${x.getUTCDate()} de ${MESES_LARGOS[x.getUTCMonth()]}`; }

// ---------------------------------------------------------------- la cola «Hoy» de Inicio: sus piezas (C-02, mejorar-app 16-sep)
// v0.72.0 (C-02): pintarCola media 87 lineas con nueve constructores como flechas locales y dos punteros mutables (`lista`, `total`).
// Las piezas viven aqui a nivel de modulo —cada una probable sola— y pintarCola queda como orquestador: calcula los seis grupos y
// pinta cada mitad diciendo EN QUE contenedor va cada grupo; el total es la suma de los grupos, no un acumulador.
const VERBO_NUEVO = { asignada: 'te asignó', cambio: 'cambió tu tarjeta', nota: 'anotó en tu tarjeta', mencion: 'te mencionó' };
/** Titulo del frente de una tarjeta ('' si el proyecto no esta cargado). C-03: porId una vez, no dos. */
const tituloFrenteDe = t => { const p = porId(estado.proyectos, t.ProyectoId); return p ? p.Title : ''; };
/** La columna `.k` de una tarjeta: dia en fuerte + mes en tenue del Vence; «—» sin fecha (v0.65.0). */
const kFecha = iso => { const m = mesDia(iso); return m ? { a: String(m.dia), b: m.mes } : { a: '—', b: '' }; };
/** La columna `.k` de un evento de la bitacora: hora de Mexico en fuerte + «hoy» / «ayer» / «dia mes» en tenue. */
const kHora = iso => { const d = diasPara(iso), m = mesDia(iso); return { a: HORA_MX.format(new Date(iso)), b: d === 0 ? 'hoy' : d === -1 ? 'ayer' : m ? `${m.dia} ${m.mes}` : '' }; };
/**
 * Un renglon de la cola: FECHA en columna · titulo (+ subtitulo); sin avatar desde v0.61.0. Es un boton entero (C9), como los .it
 * de las mini listas; el verbo «Abrir»/«Ver» a la derecha se quito en v0.25.1 (Carlos, 14-sep): el renglon entero ya lleva al pendiente.
 * v0.65.0 (Carlos, 15-sep; artifact D1P9k1su, corte C «la fecha en columna»): el punto de 8 px se fue; la marca es el dato —dia y mes
 * de Vence en las tarjetas, hora + dia relativo en lo que viene de la bitacora, «—» sin fecha— y el color del estado lo lleva el
 * numero (`.k b`), no un circulo. `k` = { a: linea fuerte, b: linea tenue }; `datos` van a data-*.
 */
function renglonCola(estadoCls, titulo, sub, k, abre, datos) {
    const r = el(abre ? 'button' : 'div', 'hoy-r' + (estadoCls ? ' is-' + estadoCls : '')); if (abre) { r.type = 'button'; r.dataset.abre = abre; }   // C-11 (v0.95.0): llave, no closure
    // U-11 (v0.94.0): la columna .k es aria-hidden; el nombre accesible del renglon trae la fecha u hora que ella enseña
    if (abre) r.setAttribute('aria-label', [titulo, sub, k.a === '—' ? 'sin fecha' : `${k.a} ${k.b}`.trim()].filter(Boolean).join(' · '));
    const f = el('span', 'k'); f.setAttribute('aria-hidden', 'true'); f.appendChild(el('b', '', k.a)); f.appendChild(el('small', '', k.b)); r.appendChild(f);
    const c = el('span', 'cuerpo'); c.appendChild(el('span', 't', titulo)); c.appendChild(el('span', 'p', sub)); c.querySelector('.t').title = titulo; r.appendChild(c);
    for (const [kk, v] of Object.entries(datos || {})) r.dataset[kk] = v;
    return r;
}
/** El encabezado de un grupo («Vencidas · 3»); con `alClic` es boton. Devuelve el elemento ya colgado de `lista`. */
function grupoCola(lista, clave, texto, n, cls, alClic) {
    const h = el(alClic ? 'button' : 'div', 'hoy-g' + (cls ? ' is-' + cls : '')); if (alClic) { h.type = 'button'; h.addEventListener('click', alClic); }
    h.dataset.grupo = clave; h.appendChild(el('span', '', texto)); h.appendChild(el('b', 'n', String(n))); lista.appendChild(h);
    return h;
}
/** Datos del subtitulo de una tarjeta: «sin movimiento N d» (CONFIG.sinMovimientoDias) y «💬 N» con sus notas.
 *  C-01 (mejorar-app, 16-sep): las notas de la TARJETA son notasDe(tareaId); comentariosDe(id) filtra por PROYECTO. */
function extraCola(t, ahora = new Date()) {
    const q = diasQuieta(t, CONFIG.sinMovimientoDias, ahora, columnasDeTarea), n = notasDe(t.id).length;   // C-15 (v0.94.0)
    return [q !== null ? rotuloQuieta(q) : '', n ? `💬 ${n}` : ''].filter(Boolean);
}
/** El renglon de una tarjeta. U-04: el subtitulo ya NO repite la fecha —la columna `.k` la trae y el grupo dice vencida/hoy/semana—
 *  y asi el nombre del frente cabe a 390 px. U-10 (v0.94.0): los datos van ANTES del frente, que se repite renglon tras renglon:
 *  a 390 px el «…» se come el nombre repetido y no el dato que distingue. `datos` extra (p. ej. sinDueno) se suman al data-t. */
const renglonTarea = (t, cls, datos) => renglonCola(cls, t.Title, [...extraCola(t), tituloFrenteDe(t)].filter(Boolean).join(' · '), kFecha(t.Vence), llaveTarea(t), { t: String(t.id), ...datos });
/** El renglon de un evento de la bitacora (nuevo para ti / te mencionaron): quien (nombre de pila) y el frente en el subtitulo. */
const renglonEvento = (a, titulo, datos, pid = a.ProyectoId) => { const p = porId(estado.proyectos, pid); return renglonCola('info', titulo, `${nombreDe(a.Quien, estado.roles).split(' ')[0]}${p ? ' · ' + p.Title : ''}`, kHora(a.Cuando), llaveEvento(a, pid), datos); };
/** Los grupos por fecha se recortan a TOPE_COLA renglones con un «+N más» que lleva a donde estan todas (Mis tareas, Reportes o Calendario). */
const TOPE_COLA = 6, TOPE_NUEVOS = 8;
function masCola(lista, n, texto, ir) { const b = el('button', 'hoy-mas'); b.type = 'button'; b.textContent = `+${n} más · ${texto} →`; b.addEventListener('click', ir); lista.appendChild(b); return b; }
/** Un grupo por fecha entero: encabezado, hasta TOPE_COLA tarjetas y el «+N más». `arr` viene de gruposHoy ({ tarea, dias }). */
function pintarGrupoCola(lista, clave, texto, arr, cls, textoMas, ir) {
    grupoCola(lista, clave, texto, arr.length, cls);
    for (const { tarea: t } of arr.slice(0, TOPE_COLA)) lista.appendChild(renglonTarea(t, cls));
    if (arr.length > TOPE_COLA) masCola(lista, arr.length - TOPE_COLA, textoMas, ir);
}
/** Las tarjetas abiertas de los frentes activos: lo que miran la cola «Hoy», «Sin movimiento» y el salto de «Sin dueño».
 *  C-11 (v0.95.0): el conmutador y el salto la recalculan al clic; antes capturaban el arreglo del ultimo pintado. */
function abiertasInicio(vivos = activos()) {
    const ids = new Set(vivos.map(p => p.id));   // v0.13.1: una vez, no por cada tarjeta
    return estado.tareas.filter(t => t.Columna !== 'hecho' && ids.has(Number(t.ProyectoId)));
}
/** Los dos botones «todo el frente / solo mías» (estado.hoySoloMias, la sesion); cambiar repinta la cola y «Sin movimiento». */
function pintarFiltroCola() {
    const fil = $('hoyFiltro'); fil.textContent = '';
    for (const [texto, mias] of [['todo el frente', false], ['solo mías', true]]) {
        // U-12: lo que la cola deja de pintar vuelve a «Sin movimiento». C-11 (v0.95.0): con las abiertas de AHORA, no las del pintado
        const b = boton(texto, !!estado.hoySoloMias === mias ? 'is-on' : '', () => { estado.hoySoloMias = mias; const ab = abiertasInicio(); pintarCola(ab); pintarSinMovimiento(ab); }, { hoy: mias ? 'mias' : 'todo' });
        b.setAttribute('aria-pressed', String(!!estado.hoySoloMias === mias)); fil.appendChild(b);
    }
}
/**
 * v0.21.0: la cola «Hoy». Seis grupos en orden de urgencia; cada tarjeta con fecha entra UNA vez (en el mas urgente).
 * «Nuevo para ti» (lo que OTROS hicieron sobre lo tuyo desde tu ultima visita; marca compartida en PROY_Roles.Visto,
 * v0.15.0) y «Te mencionaron» (14 d) siguen siendo eventos, no tarjetas: una mencion que ya salio como nueva NO se repite
 * abajo (antes eran dos tarjetas y salia en las dos, a proposito; en una sola cola seria un renglon duplicado). El piso de
 * «Nuevo para ti» se congela al ENTRAR (la marca sube al pintar sin vaciar la lista) y sale al cambiar de pantalla.
 * Los grupos por fecha obedecen al conmutador «todo el frente / solo mías» (estado.hoySoloMias, la sesion); «sin dueño»
 * es de nadie y sale siempre; «nuevo para ti» y «te mencionaron» son mios por definicion. Devuelve `nuevos` (C-05): quien
 * llama decide si sube la marca de visto — pintarInicio si, el conmutador «solo mías» no.
 * v0.39.0: la cola va en DOS mitades (#inicioUrgente | #inicioResto) dentro de #inicioHoy. Izquierda: vencidas · hoy y mañana ·
 * sin dueño. Derecha: nuevo para ti · te mencionaron · esta semana. C-02: las piezas viven arriba; aqui solo el orden.
 */
function pintarCola(abiertas) {
    const urgente = $('inicioUrgente'), resto = $('inicioResto'); urgente.textContent = ''; resto.textContent = '';
    const yoCorreo = estado.cuenta.username.toLowerCase();
    pintarFiltroCola();
    // Las sin dueño NO entran a los grupos por fecha (tienen el suyo): cada tarjeta sale UNA vez y el total la cuenta una vez (revisor, 13-sep).
    const conDueno = abiertas.filter(t => String(t.Asignado || '').trim());
    const base = estado.hoySoloMias ? conDueno.filter(t => String(t.Asignado || '').toLowerCase() === yoCorreo) : conDueno;
    const g = gruposHoy(base, new Date(), CONFIG.vencePronto);
    const nuevos = nuevoParaMi(estado.actividad, estado.tareas, estado.roles, estado.cuenta.username, estado.nuevosInicio.desde);
    const yaNuevos = new Set(nuevos.map(x => Number(x.a.id)));
    const menciones = mencionesA(estado.cuenta.username).filter(a => !yaNuevos.has(Number(a.id)));
    const huerfanas = sinDueno(abiertas);
    // Izquierda: vencidas · hoy y mañana · sin dueño.
    if (g.vencidas.length) pintarGrupoCola(urgente, 'vencidas', 'Vencidas', g.vencidas, 'danger', estado.hoySoloMias ? 'ver en Mis tareas' : 'ver en Reportes', () => { if (estado.hoySoloMias) { estado.filtroMisAlLlegar = 'vencidas'; irA('mis'); } else irA('reportes'); });
    if (g.hoy.length) pintarGrupoCola(urgente, 'hoy', 'Hoy y mañana', g.hoy, 'warn', 'ver en el Calendario', () => irA('calendario'));
    // C7 (v0.6.0): las tarjetas sin dueño no salen en Mis tareas de NADIE. El grupo solo existe si hay alguna; su encabezado
    // aterriza en el proyecto que mas tiene con el filtro «sin dueño» puesto (el mismo salto que tenia el KPI).
    if (huerfanas.length) {
        grupoCola(urgente, 'sin-dueno', 'Sin dueño', huerfanas.length, 'warn', irASinDueno).dataset.kpi = 'sin-dueno';
        for (const t of huerfanas.slice(0, TOPE_COLA)) urgente.appendChild(renglonTarea(t, 'warn', { sinDueno: '1' }));   // U-04: ni «sin dueño ·» (lo dice el grupo) ni la fecha (la columna)
    }
    // Derecha: nuevo para ti · te mencionaron · esta semana.
    if (nuevos.length) {
        grupoCola(resto, 'nuevo', 'Nuevo para ti', nuevos.length, 'info');
        for (const x of nuevos.slice(0, TOPE_NUEVOS)) {
            const que = x.tipo === 'mencion' || x.tipo === 'nota' ? x.a.Title : x.tarea ? x.tarea.Title : x.a.Title;
            resto.appendChild(renglonEvento(x.a, `${VERBO_NUEVO[x.tipo]}: «${que}»`, { nuevo: x.tipo }, x.a.ProyectoId || (x.tarea && x.tarea.ProyectoId)));
        }
        // U-09 (v0.94.0): la visita sube la marca hasta el aviso mas reciente, asi que lo que no cabe necesita salida — antes el noveno desaparecia sin leerse
        if (nuevos.length > TOPE_NUEVOS) masCola(resto, nuevos.length - TOPE_NUEVOS, 'ver en Toda la actividad', () => abrirActividad(null));
    }
    if (menciones.length) {
        grupoCola(resto, 'mencion', 'Te mencionaron', menciones.length, 'info');
        for (const a of menciones.slice(0, TOPE_COLA)) resto.appendChild(renglonEvento(a, `«${a.Title}»`, { mencion: String(a.id) }));
        if (menciones.length > TOPE_COLA) masCola(resto, menciones.length - TOPE_COLA, 'ver en Toda la actividad', () => abrirActividad(null));   // U-09
    }
    if (g.semana.length) pintarGrupoCola(resto, 'semana', 'Esta semana', g.semana, null, 'ver en el Calendario', () => irA('calendario'));
    const total = g.vencidas.length + g.hoy.length + huerfanas.length + nuevos.length + menciones.length + g.semana.length;
    $('nHoy').textContent = total ? String(total) : '';
    // Cada mitad vacia lo dice en su lugar; el «solo mías» sigue mandando en el texto de la izquierda.
    if (!urgente.children.length) urgente.appendChild(el('p', 'vacio', estado.hoySoloMias ? 'Nada urgente de lo tuyo: ni vencidas ni para hoy.' : 'Nada urgente: ni vencidas ni para hoy, y todo tiene dueño.'));
    if (!resto.children.length) resto.appendChild(el('p', 'vacio', estado.hoySoloMias ? 'Nada nuevo para ti ni tuyo por vencer esta semana.' : 'Nada nuevo para ti ni por vencer esta semana.'));
    return nuevos;
}
/** El salto de «sin dueño» (C7): al proyecto que mas tiene, con el filtro «sin dueño» puesto ENTERO — si ese proyecto ya
 *  estaba abierto, fijarProyectoAbierto no lo limpia y un «quien» previo se combinaria dejando el tablero vacio (revisor, 12-sep).
 *  C-11 (v0.95.0): las huerfanas se calculan AL CLIC (antes el encabezado capturaba las del pintado). C-13: el filtro se fija
 *  despues de fijarProyectoAbierto (que lo vacia si cambia de proyecto) y antes de irA, que pinta UNA vez — antes abrirProyecto
 *  ya pintaba y pintarProyecto() volvia a pintar. */
function irASinDueno() {
    const huerfanas = sinDueno(abiertasInicio()); if (!huerfanas.length) return;
    const porProyecto = new Map(); for (const t of huerfanas) porProyecto.set(t.ProyectoId, (porProyecto.get(t.ProyectoId) || 0) + 1);
    const [pid] = [...porProyecto.entries()].sort((a, b) => b[1] - a[1])[0];
    const p = porId(estado.proyectos, pid); if (!p) return;
    fijarProyectoAbierto(p); limpiarFiltroTareas({ sinDueno: true }); estado.tab = 'tablero'; irA('proyecto');
}

// ---------------------------------------------------------------- toda la actividad (F12) y el equipo (F13)

let acCtx = { proyectoId: null, quien: null, tipo: null, n: 50 };
/** Toda la actividad, global (proyectoId null) o de un proyecto, filtrable por persona y por tipo (C9), de 50 en 50. */
function abrirActividad(proyectoId) {
    acCtx = { proyectoId: proyectoId || null, quien: null, tipo: null, n: 50 };
    const p = proyectoId ? porId(estado.proyectos, proyectoId) : null;
    $('acTitulo').textContent = p ? `Actividad · ${p.Title}` : 'Toda la actividad';
    pintarActividad();
    abrirDialogo('dlgActividad');
}
// C9: la bitacora del sistema («creó el proyecto», «reabrió», «borró») pesa igual que las notas, que es
// lo que la gente busca: un chip las separa; «Todos» sigue siendo el default. v0.11.0: los movimientos
// entre cubetas ya no se listan (Carlos, 12-sep), asi que el chip «solo movimientos» se fue con ellos.
const TIPOS_ACTIVIDAD = [['notas', 'solo comentarios', a => a.Accion === 'comentar']];
function pintarActividad() {
    const todas = actividadVisible().filter(a => !acCtx.proyectoId || Number(a.ProyectoId) === acCtx.proyectoId);
    const quienes = [...new Set(todas.map(a => String(a.Quien || '').toLowerCase()).filter(Boolean))].sort();
    const f = $('acFiltro'); f.textContent = '';
    const chipQ = (texto, q) => { const b = boton(texto, acCtx.quien === q ? 'is-on' : '', () => { acCtx.quien = q; acCtx.n = 50; pintarActividad(); }, { quien: q || 'todos' }); b.setAttribute('aria-pressed', acCtx.quien === q ? 'true' : 'false'); f.appendChild(b); };
    chipQ('Todos', null);
    for (const q of quienes) chipQ(nombreDe(q, estado.roles), q);
    const ft = $('acTipo'); ft.textContent = '';
    for (const [k, texto] of TIPOS_ACTIVIDAD) {
        const on = acCtx.tipo === k;
        const b = boton(texto, on ? 'is-on' : '', () => { acCtx.tipo = on ? null : k; acCtx.n = 50; pintarActividad(); }, { tipo: k });
        b.setAttribute('aria-pressed', on ? 'true' : 'false'); ft.appendChild(b);
    }
    const pasaTipo = acCtx.tipo ? TIPOS_ACTIVIDAD.find(x => x[0] === acCtx.tipo)[2] : () => true;
    const filtradas = todas.filter(a => (!acCtx.quien || String(a.Quien || '').toLowerCase() === acCtx.quien) && pasaTipo(a));
    const l = $('acLista'); l.textContent = '';
    for (const a of filtradas.slice(0, acCtx.n)) l.appendChild(itemActividad(a, !acCtx.proyectoId));
    if (!filtradas.length) l.appendChild(el('p', 'vacio', 'Sin actividad.'));
    $('acMas').hidden = filtradas.length <= acCtx.n;
    $('acMas').textContent = `ver 50 más (${filtradas.length - Math.min(acCtx.n, filtradas.length)} restantes)`;
}
/** Quien tiene que rol (PROY_Roles), solo lectura, con sus tarjetas abiertas. Cambiar roles sigue en SharePoint. */
function abrirEquipo() {
    const tb = $('eqLista'); tb.textContent = '';
    // A2: en celular la tabla de 5 columnas no cabe (354 px) y se corta despues de «Rol»; las mismas
    // filas se pintan ademas como fichas, y el CSS elige cual se ve.
    const fi = $('eqFichas'); fi.textContent = '';
    const roles = estado.roles.slice().sort((a, b) => String(a.Nombre || a.Title || '').localeCompare(String(b.Nombre || b.Title || '')));
    for (const r of roles) {
        const correo = String(r.Title || '').toLowerCase();
        const abiertas = estado.tareas.filter(t => String(t.Asignado || '').toLowerCase() === correo && t.Columna !== 'hecho').length;
        const fa = el('div', 'eq-ficha' + (r.Activo === false ? ' inactivo' : ''));
        fa.appendChild(el('span', 'n', nombreDe(correo, estado.roles)));
        const ch = el('span', 'ch');
        ch.appendChild(chip(r.Rol || 'lectura', r.Rol === 'gerencia' ? 'info' : null));
        if (r.Activo === false) ch.appendChild(chip('inactiva', 'danger'));
        ch.appendChild(el('span', '', `${abiertas} abierta${abiertas === 1 ? '' : 's'}`));
        fa.appendChild(ch);
        fa.appendChild(el('span', 'c', correo));
        fi.appendChild(fa);
        const tr = el('tr', r.Activo === false ? 'inactivo' : '');
        tr.appendChild(el('td', '', nombreDe(correo, estado.roles)));
        tr.appendChild(el('td', 'mn-mono', correo));
        const tdr = el('td'); tdr.appendChild(chip(r.Rol || 'lectura', r.Rol === 'gerencia' ? 'info' : null)); tr.appendChild(tdr);
        const tda = el('td'); tda.appendChild(r.Activo === false ? chip('no', 'danger') : chip('sí', 'ok')); tr.appendChild(tda);
        tr.appendChild(el('td', 'mn-mono', String(estado.tareas.filter(t => String(t.Asignado || '').toLowerCase() === correo && t.Columna !== 'hecho').length)));
        tb.appendChild(tr);
    }
    if (!roles.length) { const tr = el('tr'); const td = el('td', 'vacio', 'PROY_Roles está vacía.'); td.colSpan = 5; tr.appendChild(td); tb.appendChild(tr); fi.appendChild(el('p', 'vacio', 'PROY_Roles está vacía.')); }
    abrirDialogo('dlgEquipo');
}

// ---------------------------------------------------------------- Proyectos

function pintarProyectos() {
    $('btnNuevoProyecto').disabled = !PUEDE.proyecto(estado.rol);
    $('btnNuevoProyecto').title = PUEDE.proyecto(estado.rol) ? '' : 'Solo gerencia crea proyectos';
    $('btnNuevoProyecto').hidden = !PUEDE.proyecto(estado.rol);   // U-05 (16-sep): en celular el title no existe y el boton gris no explicaba nada; quien no puede crear no lo ve
    // v0.7.0: el filtro por equipo se pone desde el rail (por rama) o, en celular, desde el select; aqui solo se aplica.
    $('filtroEquipoMovil').value = estado.filtroEquipo || '';
    // C3 (v0.6.0): el mismo buscador sin acentos del tablero, sobre nombre, clave y descripcion.
    const filtro = ps => filtrarProyectos(proyectosVisibles(ps, estado.filtroEquipo, false), estado.textoProyectos);   // C-03: la regla del rail vive en reglas.js
    const l = $('listaProyectos');
    const act = ordenarProyectos(filtrarProyectos(visibles(), estado.textoProyectos));   // C10: vence antes primero, sin fecha al final, empate por nombre
    pintarFichas(l, act);   // v0.25.0: renglones planos por fin del frente; el filtro de equipo viene del rail
    // U-09 / U-11 (mejorar-app proyectos, 24-sep): el subtitulo dice si la lista esta filtrada (como Roadmap y Calendario) y cabe en un renglon
    const sub = $('proyectosSub');
    if (estado.filtroEquipo) {
        sub.textContent = `Solo ${nombreEquipoFiltrado()} · ${act.length} de ${filtrarProyectos(activos(), estado.textoProyectos).length} activos`;
        sub.appendChild(boton('Ver todos', 'mn-btn is-ghost is-sm', () => { estado.filtroEquipo = null; repintar(); }, { todos: '1' }));
    } else sub.textContent = 'Frentes activos, del que vence antes al que vence después.';
    const c = $('listaCerrados');
    const cer = filtro(estado.proyectos.filter(p => p.Estado === 'cerrado')).sort((a, b) => String(b.CerradoEl || '').localeCompare(String(a.CerradoEl || '')));
    if (!act.length) {
        // U-02 (16-sep): si el texto solo casa con cerrados, el vacio lo dice y el plegable se abre solo.
        const soloCerrados = estado.textoProyectos && cer.length;
        const v = el('p', 'vacio', soloCerrados ? `Ningún proyecto activo con ese texto; ${cer.length === 1 ? 'hay 1 cerrado' : `hay ${cer.length} cerrados`} abajo.` : estado.textoProyectos ? 'Ningún proyecto con ese texto.' : estado.filtroEquipo ? `Sin proyectos activos de ${nombreEquipoFiltrado()}. ` : 'Sin proyectos activos.');
        // U-06 (16-sep): con el filtro de equipo puesto, el vacio ofrece volver a todos (antes solo re-pulsando el mismo equipo en el rail).
        if (estado.filtroEquipo && !estado.textoProyectos) v.appendChild(boton('Ver todos los equipos', 'mn-btn is-ghost is-sm', () => { estado.filtroEquipo = null; repintar(); }, { todos: '1' }));
        l.appendChild(v);
        if (soloCerrados) c.parentElement.open = true;
    }
    $('sumCerrados').textContent = cer.length ? `Proyectos cerrados · ${cer.length}` : 'Proyectos cerrados';   // U-02: el conteo siempre que haya cerrados (con texto, los que casan)
    pintarFichas(c, cer);   // van por fecha de cierre; la hoja de calendario ensena el dia del cierre
    if (!cer.length) c.appendChild(el('p', 'vacio', 'Ninguno cerrado.'));
}

function abrirProyecto(id) {
    const p = porId(estado.proyectos, id); if (!p) return;
    fijarProyectoAbierto(p); estado.tab = 'tablero';
    irA('proyecto');
}
/** C-12 (v0.115.0): el proyecto se pinta en tres partes; el clic de pestaña solo repinta pintarPestanas y «Filtrar» solo pintarFiltrosProyecto. */
function pintarProyecto() {
    const p = proyectoAbierto(); if (!p) { irA('proyectos'); return; }
    // B2 (v0.5.0) caia de «resumen» a «tablero» en escritorio porque la pestaña solo existia en celular;
    // desde v0.30.0 (L6) «Resumen» es una pestaña en todo ancho y el hash #p/<clave>/resumen vale en la laptop.
    const ts = tareasDe(p, estado.tareas); const a = avance(ts, columnasDe(p));
    pintarCabeceraProyecto(p, ts, a);
    pintarPestanas(p);
    pintarLateralProyecto(p, ts, a);
}
/** Lo que cambia con la pestaña (y nada mas): botones de pestaña, contadores, filtros y el contenido de la pestaña. */
function pintarPestanasAbierto() { const p = proyectoAbierto(); if (!p) { irA('proyectos'); return; } pintarPestanas(p); }
function pintarCabeceraProyecto(p, ts, a) {
    const eq = equipoDe(p);
    $('pEquipo').textContent = ''; $('pEquipo').appendChild(iconoEquipo(eq, 'lg'));   // v0.7.0: icono, no nombre
    $('pTitulo').textContent = p.Title; $('pDesc').textContent = p.Descripcion || '';
    if ($('selProyecto').open) pintarSelectorProyecto(p);   // v0.29.0 (M5): los demas frentes activos, bajo el titulo; C-23 (v0.123.0): solo con la lista abierta (se pinta al abrirla)
    $('proyectoCab').classList.toggle('contraida', cabeceraContraida());
    $('pEstado').textContent = p.Estado === 'cerrado' ? 'Cerrado' : '';   // v0.12.0: el «N/M hechas · %» salio del titulo (Carlos, 12-sep); vive en Avance
    $('btnEditarProyecto').disabled = !PUEDE.proyecto(estado.rol) || p.Estado !== 'activo';
    $('btnCubetas').disabled = !PUEDE.proyecto(estado.rol) || p.Estado !== 'activo';   // v0.11.0
    $('btnCerrarProyecto').disabled = !PUEDE.proyecto(estado.rol) || p.Estado !== 'activo';
    const faltan = ts.filter(t => t.Columna !== 'hecho').length;
    // v0.12.0: el boton ya no cuenta («· faltan N» salio del titulo); la cuenta va en su title y en la confirmacion.
    $('btnCerrarProyecto').textContent = p.Estado !== 'activo' ? 'Cerrado' : 'Cerrar proyecto';
    $('btnCerrarProyecto').title = p.Estado !== 'activo' ? '' : faltan ? `Falta${faltan === 1 ? '' : 'n'} ${faltan} tarjeta${faltan === 1 ? '' : 's'} por terminar` : 'Todas las tarjetas están hechas';
    // F6: un cerrado se reabre (solo gerencia); el boton solo existe en ese estado.
    $('btnReabrirProyecto').classList.toggle('oculto', !(PUEDE.proyecto(estado.rol) && p.Estado === 'cerrado'));
    $('btnEliminarProyecto').classList.toggle('oculto', !PUEDE.borrar(estado.rol));   // v0.13.0: solo gerencia, en cualquier estado
    // B2: la linea que resume el frente arriba, donde se lee sin bajar a la lateral.
    const dias = diasPara(p.Vence);
    // C8: el chip «vence en N d · faltan M» de la lista, junto al %, en escritorio y celular. Cuando
    // existe (≤ 7 d o vencido), la linea-resumen de celular NO repite el reloj.
    const caja = $('pReloj'); caja.textContent = '';
    const reloj = chipReloj(p, ts); if (reloj) caja.appendChild(reloj);
    // v0.11.0: una parte por cubeta de en medio (con o sin tarjetas: la linea dice que cubetas hay).
    const resumen = a.columnas.slice(1, -1).map(c => `${a.porColumna[c.clave]} ${c.nombre.toLowerCase()}`);
    if (dias !== null && p.Estado === 'activo' && !reloj) resumen.push(`vence en ${dias} d`);
    $('pResumen').textContent = resumen.join(' · ');
    $('pResumen').classList.remove('is-danger');
    // B1: la descripcion va a una linea en celular; el clic la abre.
    $('pDesc').title = p.Descripcion || '';
    $('pDesc').classList.remove('abierta');
}
function pintarPestanas(p) {
    // v0.102.0: la pestaña Capital solo existe para gerencia con PROY_Capital creada; si no, una liga #…/capital cae al tablero.
    const verCap = puedeVerCapital() && estado.capitalLista === true;
    $('tabCapital').classList.toggle('oculto', !verCap);
    if (estado.tab === 'capital' && !verCap) estado.tab = 'tablero';
    // C-13 (v0.114.0): el boton sigue a la pestaña — en Capital abre una partida (abrirPartida exige puedeVerCapital), en las demas una tarea.
    $('btnNuevaTarea').disabled = estado.tab === 'capital' ? !verCap : (!PUEDE.tarea(estado.rol) || p.Estado !== 'activo');
    $('btnNuevaTarea').textContent = estado.tab === 'capital' ? 'Nueva partida' : 'Nueva tarea';   // v0.103.0
    for (const b of document.querySelectorAll('.tab')) { const on = b.dataset.tab === estado.tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if ($('tab-' + b.dataset.tab)) b.setAttribute('aria-controls', 'tab-' + b.dataset.tab); }   // U-35 (v0.123.0): tabindex rotativo y el panel que controla
    { const on = document.querySelector('.tabs .tab.is-on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }   // U-02 (17-sep): a 390 la fila rueda y «Resumen» quedaba fuera aun activa
    for (const t of ['tablero', 'lista', 'roadmap', 'docs', 'chat', 'capital']) $('tab-' + t).classList.toggle('oculto', estado.tab !== t);
    if (estado.tab !== 'chat') salirDelChat();   // v0.9.0: cambiar de pestana dentro del proyecto tambien es salir
    document.body.classList.toggle('is-chat', estado.tab === 'chat');   // v0.15.0: pintarProyecto no pasa por repintar() al cambiar de pestana
    // v0.8.0: las pestanas dicen cuanto hay adentro (Trello): documentos ligados y comentarios del chat.
    const nDocs = estado.ligas.filter(l => Number(l.ProyectoId) === p.id).length, nChat = comentariosDe(p.id).length;
    $('nDocsTab').textContent = String(nDocs); $('nDocsTab').hidden = !nDocs;
    $('nChatTab').textContent = String(nChat); $('nChatTab').hidden = !nChat;
    // v0.9.0: el contador se pinta en ambar si hay comentarios ajenos que esta persona no ha tenido en pantalla.
    const nNuevos = estado.tab === 'chat' ? 0 : nuevosDe(p.id);   // C-04
    $('nChatTab').classList.toggle('is-nuevo', nNuevos > 0);
    $('nChatTab').title = nNuevos ? `${nNuevos} nuevo${nNuevos === 1 ? '' : 's'} desde tu última visita` : '';
    // B2: «Resumen» es una pestana mas; v0.30.0 (L6): en todo ancho, ya no solo en celular.
    $('p-proyecto').classList.toggle('ver-resumen', estado.tab === 'resumen');
    pintarFiltrosProyecto(p);
    if (estado.tab === 'tablero') pintarTablero(p);
    else if (estado.tab === 'lista') pintarLista(p);
    else if (estado.tab === 'roadmap') pintarRoadmapProyecto(p);   // v0.10.0
    else if (estado.tab === 'docs') pintarDocs(p);
    else if (estado.tab === 'chat') pintarChat(p);
    else if (estado.tab === 'capital') pintarCapitalTab(p);   // v0.102.0
}
/** La barra de chips/buscador de tarjetas: depende de la pestaña y de estado.filtrosAbiertos. */
function pintarFiltrosProyecto(p) {
    const sinFiltros = !PESTANAS_CON_FILTRO.includes(estado.tab);   // C-18 (v0.123.0)
    $('filtroTareas').classList.toggle('oculto', sinFiltros);
    $('filtroTareas').classList.toggle('plegado', !estado.filtrosAbiertos);
    if (!sinFiltros) pintarFiltroTareas(p);
    pintarBotonFiltros();
}
function pintarLateralProyecto(p, ts, a) {
    const segs = segmentosDe(a);   // C-23 (v0.123.0): una vez por pintada (antes una mas por cubeta); U-34: la barra pBarra salio, el anillo ya dice el %
    $('pAnillo').textContent = ''; $('pAnillo').appendChild(anillo(segs, a.total, 96));   // v0.10.0: el anillo de la foto; v0.11.0: por cubeta del proyecto
    const kv = $('pAvance'); kv.textContent = '';
    // U-23 (v0.114.0): Hechas y las cubetas de en medio llevan la muestra del color de su segmento del anillo (mismas clases que .leyenda).
    const par = (k, v, seg) => { const b = el('b', seg ? 'muestra is-' + seg[2] : '', k); if (seg) { if (seg[3]) b.dataset.tono = seg[3]; b.prepend(el('i')); } kv.appendChild(b); kv.appendChild(el('span', '', v)); };
    const segDe = clave => segs.find(s => s[0].clave === clave);
    par('Hechas', `${a.hechas} de ${a.total}`, segDe(a.columnas[a.columnas.length - 1].clave)); for (const c of a.columnas.slice(1, -1)) par(c.nombre, String(a.porColumna[c.clave]), segDe(c.clave));
    par('Fin del frente', fechaCorta(p.Vence)); par('Responsable', p.Responsable ? nombreDe(p.Responsable, estado.roles) : '—'); par('Clave', p.Clave);
    if (p.Carpeta) par('Carpeta', p.Carpeta);
    if (p.Estado === 'cerrado') par('Cerrado', `${nombreDe(p.CerradoPor, estado.roles)} · ${fechaCorta(p.CerradoEl)}`);
    const q = $('pQuienes'); q.textContent = '';
    // C-16 (v0.114.0): abiertas por persona en UNA pasada (antes un filter por persona dentro del for).
    const abiertasDe = new Map();
    let sinDuenoAbiertas = 0;
    for (const x of ts) { const k = String(x.Asignado || '').toLowerCase(); const abierta = x.Columna !== 'hecho' ? 1 : 0; if (!k) { sinDuenoAbiertas += abierta; continue; } abiertasDe.set(k, (abiertasDe.get(k) || 0) + abierta); }
    const quienes = [...abiertasDe.keys()];
    // U-27 / U-28 (v0.123.0): cada renglon abre el Tablero filtrado por esa persona (llave «q:<correo>», la resuelve el delegado de
    // data-abre); las abiertas sin dueño van en su renglon «Sin asignar», asi Quiénes suma lo mismo que el tablero; y el singular concuerda.
    const abiertas = n => `${n} abierta${n === 1 ? '' : 's'}`;
    for (const k of quienes) { const it = itemMini(k, nombreDe(k, estado.roles), abiertas(abiertasDe.get(k)), '', '', `q:${k}`); it.title = 'Ver sus tarjetas en el tablero'; q.appendChild(it); }
    if (sinDuenoAbiertas) { const it = itemMini('', '—', abiertas(sinDuenoAbiertas), '', '', 'q:'); it.querySelector('.q').textContent = 'Sin asignar'; it.title = 'Ver las tarjetas sin dueño en el tablero'; q.appendChild(it); }
    if (!quienes.length && !sinDuenoAbiertas) q.appendChild(el('p', 'vacio', 'Nadie asignado todavía.'));
    const v = $('pVence'); v.textContent = '';
    for (const { tarea: t, dias } of proximos(ts, 5)) v.appendChild(itemMini(t.Asignado, t.Title, '', fraseVenceTarjeta(t), claseVence(dias, CONFIG.vencePronto, null), llaveTarea(t)));   // C9
    if (!v.childNodes.length) v.appendChild(el('p', 'vacio', 'Nada por vencer.'));
    const act = $('pActividad'); act.textContent = '';
    const deP = actividadVisible().filter(x => Number(x.ProyectoId) === p.id);   // v0.11.0: sin movimientos
    // U-22 (v0.114.0): ediciones SEGUIDAS de la misma persona sobre la misma tarjeta van en un renglon (el mas reciente) con su conteo.
    const grupos = [];
    for (const x of deP) {
        const g = grupos[grupos.length - 1];
        const mismo = g && x.Accion === 'editar-tarea' && g.a.Accion === 'editar-tarea' && x.TareaId && Number(x.TareaId) === Number(g.a.TareaId) && String(x.Quien || '').toLowerCase() === String(g.a.Quien || '').toLowerCase();
        if (mismo) g.n++; else grupos.push({ a: x, n: 1 });
    }
    for (const { a: x, n } of grupos.slice(0, 6)) {
        const it = itemActividad(x, false);   // C9
        if (n > 1) { const q = it.querySelector('.cab .q'); if (q) q.after(el('span', 'fusion', `· ${n} ediciones`)); }
        act.appendChild(it);
    }
    if (!act.childNodes.length) act.appendChild(el('p', 'vacio', 'Sin actividad todavía.'));
    $('btnActividadProyecto').hidden = deP.length <= 6;
    pintarCapitalProyecto(p);   // v0.100.0: «Capital de trabajo · falta $X» (solo gerencia)
}

// ---------------------------------------------------------------- nuevo / editar / cerrar proyecto

// C-06 (mejorar-app proyectos, 24-sep): se guarda el ID, no el objeto. Una relectura en vuelo (cargarTodo) reemplaza
// estado.proyectos; el objeto capturado quedaba huerfano y el guardado se aplicaba sobre una copia que nadie pinta.
let proyectoEnEdicionId = null, enEdicion = null;
const proyectoVivo = id => porId(estado.proyectos, id);
const ROTULO_CAMPO = { Title: 'nombre', Equipo: 'equipo', Vence: 'fin del frente', Responsable: 'responsable', Descripcion: 'descripción', Carpeta: 'carpeta' };
/** C-07 / C-08 (24-sep): los campos de `nuevo` (o de `claves`) cuyo valor difiere del de `base`; vacio y null cuentan igual, fechas por dia. */
function camposCambiados(base, nuevo, claves = Object.keys(nuevo)) {
    const norm = (k, v) => { const s = v === null || v === undefined ? '' : String(v); return k === 'Vence' ? s.slice(0, 10) : k === 'Responsable' ? s.toLowerCase() : s; };
    const r = {}; for (const k of claves) if (norm(k, base[k]) !== norm(k, nuevo[k])) r[k] = nuevo[k]; return r;
}
/** C-07 (24-sep): el valor actual entra al select aunque ya no este en el catalogo (persona inactiva, equipo retirado);
 *  sin esto el select caia a «sin responsable» y el PATCH lo borraba en silencio. */
function conValorActual(sel, valor, texto) {
    if (!valor || [...sel.options].some(o => o.value === valor)) return;
    const o = el('option', '', texto); o.value = valor; sel.appendChild(o);
}
function abrirFormaProyecto(p) {
    if (!PUEDE.proyecto(estado.rol)) { avisar('Solo gerencia crea o edita proyectos.', 'error'); return; }
    proyectoEnEdicionId = p ? p.id : null;
    $('npTituloDlg').textContent = p ? 'Editar proyecto' : 'Nuevo proyecto';
    $('npGuardar').textContent = p ? 'Guardar cambios' : 'Crear proyecto';
    opciones($('npEquipo'), CONFIG.equipos, e => e.clave, e => e.nombre, null);
    opciones($('npResponsable'), personasActivas(), x => x, x => nombreDe(x, estado.roles), 'sin responsable');   // C-06: comun.js
    if (p) {
        const resp = String(p.Responsable || '').toLowerCase();
        conValorActual($('npResponsable'), resp, `${nombreDe(resp, estado.roles)} (inactivo)`);
        conValorActual($('npEquipo'), p.Equipo, `${p.Equipo} (fuera del catálogo)`);
    }
    $('npTitulo').value = p ? p.Title : ''; $('npClave').value = p ? p.Clave : ''; $('npClave').disabled = !!p;
    $('npClave').dataset.tocada = '';   // C-01 (mejorar-app, 16-sep): se limpia al ABRIR; antes solo tras crear, y un Cancelar con la clave tocada apagaba la propuesta el resto de la sesion
    $('npEquipo').value = p ? p.Equipo : (estado.filtroEquipo || CONFIG.equipos[0].clave); $('npVence').value = fechaInput(p && p.Vence);   // U-03 (16-sep): con el rail filtrado se propone ESE equipo
    $('npResponsable').value = p ? String(p.Responsable || '').toLowerCase() : ''; $('npDesc').value = p ? (p.Descripcion || '') : '';
    $('npCarpeta').value = p ? (p.Carpeta || '') : '';
    $('npNotaClave').hidden = !!p;   // U-04 (16-sep): la nota de la clave vive bajo su campo y solo al crear; la de la carpeta, bajo Carpeta, siempre (antes una sola nota al pie, cuatro campos abajo)
    npAlAbrir = npValores();   // U-08 (24-sep): lo que se compara para saber si hay algo a medio escribir
    abrirDialogo('dlgProyecto');
    $('npTitulo').focus();
}
// U-08 (mejorar-app proyectos, 24-sep): Cancelar, Esc y Atras ya no tiran lo escrito sin preguntar; sin cambios cierran directo.
const NP_CAMPOS = ['npTitulo', 'npClave', 'npEquipo', 'npVence', 'npResponsable', 'npDesc', 'npCarpeta'];
let npAlAbrir = '', npPreguntando = false;
const npValores = () => JSON.stringify(NP_CAMPOS.map(id => $(id).value));
const npSucio = () => $('dlgProyecto').open && npValores() !== npAlAbrir;
async function cancelarFormaProyecto() {
    if (!npSucio()) { cerrarDialogo('dlgProyecto'); return; }
    if (npPreguntando) return;
    npPreguntando = true;
    const editar = !!proyectoEnEdicionId;
    const { ok } = await confirmar({ titulo: editar ? '¿Descartar los cambios?' : '¿Descartar el proyecto a medio escribir?', ok: 'Descartar', texto: editar ? 'Lo que cambiaste en este proyecto no se ha guardado.' : 'Lo que escribiste no se ha guardado.' });
    npPreguntando = false;
    if (ok) cerrarDialogo('dlgProyecto'); else if ($('dlgProyecto').open) $('npTitulo').focus();
}
fijarGuarda('dlgProyecto', { sucio: npSucio, intentar: cancelarFormaProyecto });
$('dlgProyecto').addEventListener('cancel', ev => { if (npSucio()) { ev.preventDefault(); cancelarFormaProyecto(); } });   // Esc
$('npTitulo').addEventListener('input', () => { mayusculasEnVivo($('npTitulo')); if (!proyectoEnEdicionId && !$('npClave').dataset.tocada) $('npClave').value = slug($('npTitulo').value); });   // C-10 (24-sep): el slug() de reglas.js; la copia en linea cortaba a 40 y validarClave admite 60
$('npClave').addEventListener('input', () => { $('npClave').dataset.tocada = '1'; });

async function guardarProyecto(ev) {
    ev.preventDefault();
    if (!PUEDE.proyecto(estado.rol)) { avisar('Solo gerencia crea o edita proyectos.', 'error'); return; }
    const titulo = $('npTitulo').value.trim().toLocaleUpperCase('es-MX');   // v0.105.0 (Carlos, 25-sep): el nombre del proyecto siempre en MAYUSCULAS
    if (!titulo) { avisar('El proyecto necesita un nombre.', 'error'); $('npTitulo').focus(); return; }
    let vence;
    try { vence = aIsoDia($('npVence').value); } catch (e) { avisar(e.message, 'error'); return; }
    // F7: la carpeta destino se escribe como ruta relativa, sin diagonales sobrantes ni barras invertidas.
    const carpeta = $('npCarpeta').value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    $('npGuardar').disabled = true;
    // C-02 (mejorar-app, 16-sep): el try cubre SOLO la escritura en la lista. Lo que sigue (cerrar, avisar, bitacora, repintar,
    // abrir) queda fuera: antes un tropiezo ahi convertia un guardado bueno en «No se pudo guardar» y, al crear, no abria el proyecto.
    let creado = null, editado = null, clave = '';
    try {
        if (proyectoEnEdicionId) {
            const p = proyectoVivo(proyectoEnEdicionId);
            if (!p) { cerrarDialogo('dlgProyecto'); avisar('Este proyecto ya no existe: alguien lo eliminó.', 'error'); return; }
            const todos = { Title: titulo, Equipo: $('npEquipo').value, Vence: vence, Responsable: $('npResponsable').value || null, Descripcion: $('npDesc').value.trim() || null, Carpeta: carpeta || null };
            const campos = camposCambiados(p, todos);   // C-07 (24-sep): solo lo que cambio; un campo que el dialogo no pudo mostrar ya no se pisa
            if (!Object.keys(campos).length) { cerrarDialogo('dlgProyecto'); avisar('Sin cambios que guardar.', 'ojo'); return; }
            enEdicion = { id: p.id, antes: { ...p } };
            const res = await estado.cliente.actualizarRenglon(estado.siteId, L.proyectos, p.id, campos, m => avisar(m, 'ojo'), p._etag);
            editado = proyectoVivo(p.id) || p;   // C-06: tras el await se re-resuelve; una relectura pudo cambiar el objeto
            aplicar(editado, campos, res && res._etag);
        } else {
            // Clave: valida contra lo que hay en memoria Y contra la lista en vivo (dos gerentes a la vez).
            const v = validarClave($('npClave').value, estado.proyectos);
            if (!v.ok) { avisar('Clave: ' + v.motivo, 'error'); $('npClave').focus(); return; }
            const enVivo = await estado.cliente.renglones(estado.siteId, L.proyectos, `fields/Clave eq '${v.clave.replace(/'/g, "''")}'`);
            if (enVivo.length) { avisar(`Clave: ya hay un proyecto con la clave ${v.clave} (lo creó alguien más hace un momento).`, 'error'); return; }
            const campos = limpiar({ Title: titulo, Clave: v.clave, Equipo: $('npEquipo').value, Estado: 'activo', Vence: vence || undefined, Responsable: $('npResponsable').value || undefined, Descripcion: $('npDesc').value.trim() || undefined, Carpeta: carpeta || undefined });
            creado = await estado.cliente.crearRenglon(estado.siteId, L.proyectos, campos, m => avisar(m, 'ojo'));
            estado.proyectos.push(creado); clave = v.clave;
        }
    } catch (e) {
        // C-08 (24-sep): el dialogo se queda abierto con lo escrito; la relectura trae el _etag nuevo y el siguiente Guardar lo usa (C-06)
        if (esConflicto(e)) {
            await pedirRelectura();
            const vivo = enEdicion && proyectoVivo(enEdicion.id), cambio = vivo ? Object.keys(camposCambiados(enEdicion.antes, vivo, Object.keys(ROTULO_CAMPO))).map(k => ROTULO_CAMPO[k]) : [];
            avisar(`Alguien cambió este proyecto hace un momento${cambio.length ? ` (${cambio.join(', ')})` : ''}: se releyó. Lo que escribiste sigue aquí; revisa y vuelve a guardar.`, 'ojo'); return;
        }
        avisar('No se pudo guardar el proyecto: ' + (e && e.message ? e.message : e), 'error'); return;
    } finally { $('npGuardar').disabled = false; }
    cerrarDialogo('dlgProyecto');
    if (editado) {
        avisar('Proyecto actualizado.', 'ok'); repintar();
        await registrarActividad('editar-proyecto', `editó el proyecto «${titulo.slice(0, 80)}»`, editado.id, null); repintar();
        return;
    }
    avisar(`Proyecto «${titulo}» creado. Clave: ${clave}.`, 'ok');
    await registrarActividad('crear-proyecto', `creó el proyecto «${titulo.slice(0, 80)}»`, creado.id, null);
    abrirProyecto(creado.id);
}

async function cerrarProyecto() {
    const p = proyectoAbierto(); if (!p) return;
    if (!PUEDE.proyecto(estado.rol)) { avisar('Solo gerencia cierra proyectos.', 'error'); return; }
    const faltan = tareasDe(p, estado.tareas).filter(t => t.Columna !== 'hecho').length;
    const { ok } = await confirmar({ titulo: 'Cerrar el proyecto', ok: 'Cerrar', texto: `«${p.Title}» pasa a cerrado con tu sello. Sale de Inicio; sus tarjetas quedan como registro y nada se borra.${faltan ? ` Ojo: queda${faltan === 1 ? '' : 'n'} ${faltan} tarjeta${faltan === 1 ? '' : 's'} sin terminar.` : ''}` });
    if (!ok) return;
    const campos = { Estado: 'cerrado', CerradoPor: estado.cuenta.username, CerradoEl: new Date().toISOString() };
    try {
        // C-06 (24-sep): el objeto se re-resuelve por id despues de cada await (confirmar y el PATCH); una relectura en medio lo reemplaza
        const antes = proyectoVivo(p.id); if (!antes) { avisar('Este proyecto ya no existe: alguien lo eliminó.', 'error'); return; }
        const res = await estado.cliente.actualizarRenglon(estado.siteId, L.proyectos, p.id, campos, m => avisar(m, 'ojo'), antes._etag);
        aplicar(proyectoVivo(p.id) || antes, campos, res && res._etag);
        avisar(`Proyecto «${p.Title}» cerrado.`, 'ok'); repintar();
        await registrarActividad('cerrar-proyecto', `cerró el proyecto «${p.Title.slice(0, 80)}»${faltan ? ` con ${faltan} tarjeta${faltan === 1 ? ' abierta' : 's abiertas'}` : ''}`, p.id, null); repintar();
    } catch (e) {
        if (esConflicto(e)) { avisar('Alguien cambió este proyecto hace un momento: se releyó.', 'ojo'); await pedirRelectura(); return; }
        avisar('No se pudo cerrar: ' + (e && e.message ? e.message : e), 'error');
    }
}

/** F6: un cierre por error se deshace aqui, no en SharePoint. Solo gerencia; limpia el sello y deja «reabrió». */
async function reabrirProyecto() {
    const p = proyectoAbierto(); if (!p) return;
    if (!PUEDE.proyecto(estado.rol)) { avisar('Solo gerencia reabre proyectos.', 'error'); return; }
    if (p.Estado !== 'cerrado') return;
    const { ok } = await confirmar({ titulo: 'Reabrir el proyecto', ok: 'Reabrir', texto: `«${p.Title}» vuelve a activo y a Inicio; se borra el sello de cierre (${nombreDe(p.CerradoPor, estado.roles)} · ${fechaCorta(p.CerradoEl)}). Sus tarjetas quedan como están.` });
    if (!ok) return;
    const campos = { Estado: 'activo', CerradoPor: null, CerradoEl: null };
    try {
        const antes = proyectoVivo(p.id); if (!antes) { avisar('Este proyecto ya no existe: alguien lo eliminó.', 'error'); return; }   // C-06 (24-sep)
        const res = await estado.cliente.actualizarRenglon(estado.siteId, L.proyectos, p.id, campos, m => avisar(m, 'ojo'), antes._etag);
        aplicar(proyectoVivo(p.id) || antes, campos, res && res._etag);
        avisar(`Proyecto «${p.Title}» reabierto.`, 'ok'); repintar();
        await registrarActividad('reabrir-proyecto', `reabrió el proyecto «${p.Title.slice(0, 80)}»`, p.id, null); repintar();
    } catch (e) {
        if (esConflicto(e)) { avisar('Alguien cambió este proyecto hace un momento: se releyó.', 'ojo'); await pedirRelectura(); return; }
        avisar('No se pudo reabrir: ' + (e && e.message ? e.message : e), 'error');
    }
}

/** v0.13.0 (Carlos, 12-sep): eliminar un proyecto — solo gerencia, en cualquier estado. Borra sus tarjetas, sus ligas
 *  y al final el proyecto (en ese orden: si algo falla a medias queda un proyecto vaciado, nunca tarjetas huerfanas).
 *  Los archivos de la biblioteca no se tocan; la actividad se queda como registro y se anota «borrar-proyecto». */
async function eliminarProyecto() {
    const p = proyectoAbierto(); if (!p) return;
    if (!PUEDE.borrar(estado.rol)) { avisar('Solo gerencia elimina proyectos.', 'error'); return; }
    const tareas = tareasDe(p, estado.tareas); const ligas = estado.ligas.filter(l => Number(l.ProyectoId) === p.id);
    const { ok } = await confirmar({ titulo: 'Eliminar el proyecto', ok: 'Eliminar', texto: `«${p.Title}» se borra con sus ${tareas.length} tarjeta${tareas.length === 1 ? '' : 's'} y ${ligas.length} liga${ligas.length === 1 ? '' : 's'} a documentos. Los archivos de la biblioteca no se tocan y la actividad queda como registro. No se puede deshacer desde la app: los renglones van a la papelera del sitio.` });
    if (!ok) return;
    const titulo = p.Title;
    try {
        for (const t of tareas) { await estado.cliente.borrarRenglon(estado.siteId, L.tareas, t.id, m => avisar(m, 'ojo')); estado.tareas = estado.tareas.filter(x => x.id !== t.id); }
        for (const l of ligas) { await estado.cliente.borrarRenglon(estado.siteId, L.ligas, l.id, m => avisar(m, 'ojo')); estado.ligas = estado.ligas.filter(x => x.id !== l.id); }
        await estado.cliente.borrarRenglon(estado.siteId, L.proyectos, p.id, m => avisar(m, 'ojo'));
        estado.proyectos = estado.proyectos.filter(x => x.id !== p.id);
        estado.proyectoAbiertoId = null; $('accMenu').open = false;
        irA('proyectos'); avisar(`Proyecto «${titulo}» eliminado.`, 'ok'); repintar();
        await registrarActividad('borrar-proyecto', `eliminó el proyecto «${titulo.slice(0, 80)}»${tareas.length ? ` con ${tareas.length} tarjeta${tareas.length === 1 ? '' : 's'}` : ''}`, p.id, null); repintar();
    } catch (e) { avisar('No se pudo eliminar: ' + (e && e.message ? e.message : e), 'error'); repintar(); }
}

// ---------------------------------------------------------------- tema

function aplicarTema(t) {
    if (t === 'claro' || t === 'oscuro') document.documentElement.dataset.theme = t === 'oscuro' ? 'dark' : 'light';
    else delete document.documentElement.dataset.theme;
    const oscuro = t === 'oscuro' || (t !== 'claro' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    // v0.13.0 (Carlos, 12-sep): el boton marcado es el tema EFECTIVO —sin eleccion guardada, el del sistema—, asi siempre hay uno.
    for (const b of document.querySelectorAll('.tema button')) b.setAttribute('aria-pressed', b.dataset.tema === (oscuro ? 'oscuro' : 'claro') ? 'true' : 'false');
    const mt = $('metaTema'); if (mt) mt.content = oscuro ? '#131313' : '#f7f7f7';   // --page del Tablero (v0.7.0)   // el arnés E2E no monta el <head>
}
try { aplicarTema(localStorage.getItem('tema') || ''); } catch (_) { aplicarTema(''); }
// v0.13.0: un clic ELIGE ese tema y ya (antes el segundo clic lo apagaba y volvia al del sistema, que en una maquina oscura
// parecia «claro → oscuro sin seleccion»). Volver a «sistema» no tiene boton: se borra la llave `tema` del localStorage.
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!localStorage.getItem('tema')) aplicarTema(''); }); } catch (_) {}
for (const b of document.querySelectorAll('.tema button')) b.addEventListener('click', () => {
    const t = b.dataset.tema;
    try { if (t) localStorage.setItem('tema', t); else localStorage.removeItem('tema'); } catch (_) {}
    aplicarTema(t);
});

// ---------------------------------------------------------------- rail plegable (v0.28.0)
// En escritorio el rail se pliega a 64 px de iconos; la eleccion se guarda en localStorage `rail` = 'plegado'
// v0.28.1 (Carlos): la MARCA pliega y el chevron —visible solo plegado— despliega; los dos declaran aria-expanded.
// (sin llave = desplegado). Cada pestana lleva su rotulo en el title para que plegada siga diciendo que es.
function aplicarRail(plegado) {
    $('shell').classList.toggle('rail-plegado', plegado);
    for (const id of ['btnMarca', 'btnPlegar']) $(id).setAttribute('aria-expanded', plegado ? 'false' : 'true');
}
for (const b of document.querySelectorAll('#pestanas button')) { const s = b.querySelector('span'); if (s) b.title = s.textContent; }
try { aplicarRail(localStorage.getItem('rail') === 'plegado'); } catch (_) { aplicarRail(false); }
function fijarRail(plegado) {
    try { if (plegado) localStorage.setItem('rail', 'plegado'); else localStorage.removeItem('rail'); } catch (_) {}
    aplicarRail(plegado);
}
$('btnMarca').addEventListener('click', () => fijarRail(true));
$('btnPlegar').addEventListener('click', () => fijarRail(false));

// ---------------------------------------------------------------- bandeja de Mensajes plegable (v0.56.0)
// Carlos, 15-sep (artifact MHCmeJw5, opción C): la bandeja se pliega a 52 px de iconos por frente (#mensajesRail) y el
// hilo crece; «‹» pliega, «›» despliega. localStorage `bandeja` = 'plegada' (sin llave = abierta). El CSS solo la aplica
// por encima de 900 px: en tableta y celular sigue «bandeja O hilo» con «← Bandeja».
function aplicarBandeja(plegada) {
    $('msj').classList.toggle('is-plegada', plegada);
    $('mensajesPlegar').setAttribute('aria-expanded', plegada ? 'false' : 'true');
    $('mensajesDesplegar').setAttribute('aria-expanded', plegada ? 'false' : 'true');
}
try { aplicarBandeja(localStorage.getItem('bandeja') === 'plegada'); } catch (_) { aplicarBandeja(false); }
function fijarBandeja(plegada) {
    // U-02 (17-sep): en ≤ 900 px el pliegue no aplica (el CSS ignora la clase) y la preferencia NO se guarda: el «‹» ahi ni se ve.
    if (!matchMedia('(max-width: 900px)').matches) { try { if (plegada) localStorage.setItem('bandeja', 'plegada'); else localStorage.removeItem('bandeja'); } catch (_) {} }
    aplicarBandeja(plegada);
}
$('mensajesPlegar').addEventListener('click', () => fijarBandeja(true));
$('mensajesDesplegar').addEventListener('click', () => fijarBandeja(false));

// ---- v0.29.0 (Carlos, 14-sep; artifact c43ad139, opcion M5): el titulo del proyecto es un SELECTOR y la cabecera se contrae.
// El selector lista los frentes ACTIVOS en el orden de la lista (vence antes primero) —el abierto siempre, aunque este
// cerrado— con icono del equipo y «N abiertas · M vencidas»; elegir uno cambia de proyecto en la MISMA pestaña (tablero,
// docs, chat…), sin pasar por la lista. La contraccion oculta descripcion y resumen; se recuerda en localStorage `cabecera`.
function pintarSelectorProyecto(p) {
    const caja = $('selLista'); caja.textContent = '';
    const lista = ordenarProyectos(activos()); if (!lista.some(x => x.id === p.id)) lista.unshift(p);
    if (lista.length < 2) { caja.appendChild(el('p', 'vacio', 'No hay otro proyecto activo.')); }
    for (const q of lista) {
        const ts = tareasDe(q, estado.tareas); const abiertas = ts.filter(t => t.Columna !== 'hecho').length, vencidas = vencidasEn(ts);
        const b = el('button', q.id === p.id ? 'is-on' : ''); b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', q.id === p.id ? 'true' : 'false'); b.dataset.proyecto = String(q.id);
        b.appendChild(iconoEquipo(equipoDe(q), 'sm')); b.appendChild(el('span', 't', q.Title));
        const n = el('span', 'n' + (vencidas ? ' is-danger' : ''), q.Estado !== 'activo' ? 'cerrado' : `${abiertas} abierta${abiertas === 1 ? '' : 's'}${vencidas ? ` · ${vencidas} vencida${vencidas === 1 ? '' : 's'}` : ''}`); b.appendChild(n);
        // C-10 (v0.114.0): se resuelve por id AL CLIC (regla v0.4.0); una relectura en medio reemplaza estado.proyectos.
        b.addEventListener('click', () => {
            $('selProyecto').open = false;
            const vivo = porId(estado.proyectos, b.dataset.proyecto);
            if (!vivo) { avisar('Ese proyecto ya no existe.', 'ojo'); return; }
            if (estado.proyectoAbiertoId === vivo.id) return;
            fijarProyectoAbierto(vivo); irA('proyecto');
        });
        caja.appendChild(b);
    }
}
document.addEventListener('click', e => { const m = $('selProyecto'); if (m.open && !m.contains(e.target)) m.open = false; });
// C-23 (v0.123.0): la lista del selector se pinta al ABRIRLA (antes en cada pintada del proyecto y en cada refresco de 120 s, cerrada).
// El clic del summary corre antes de que el details se abra (sin un cuadro con la lista vieja); `toggle` cubre el open puesto por codigo.
$('selProyecto').querySelector('summary').addEventListener('click', () => { const p = proyectoAbierto(); if (!$('selProyecto').open && p) pintarSelectorProyecto(p); });
$('selProyecto').addEventListener('toggle', () => { const p = proyectoAbierto(); if ($('selProyecto').open && p) pintarSelectorProyecto(p); });
$('selProyecto').addEventListener('keydown', e => { if (e.key === 'Escape') { $('selProyecto').open = false; $('selProyecto').querySelector('summary').focus(); } });
function cabeceraContraida() { try { return localStorage.getItem('cabecera') === 'contraida'; } catch (_) { return false; } }
function fijarCabecera(contraida) {
    try { if (contraida) localStorage.setItem('cabecera', 'contraida'); else localStorage.removeItem('cabecera'); } catch (_) {}
    $('proyectoCab').classList.toggle('contraida', contraida);
    $('btnCabecera').setAttribute('aria-expanded', contraida ? 'false' : 'true'); $('btnCabecera').title = contraida ? 'Desplegar la cabecera' : 'Contraer la cabecera';
}
$('btnCabecera').addEventListener('click', () => fijarCabecera(!cabeceraContraida()));
fijarCabecera(cabeceraContraida());

// ---------------------------------------------------------------- enganche

$('btnEntrar').addEventListener('click', entrar);
$('btnSalir').addEventListener('click', salir);
$('btnSalirMovil').addEventListener('click', salir);
$('btnActualizar').addEventListener('click', recargar);
$('btnActualizarMovil').addEventListener('click', () => { $('menuMovil').open = false; recargar(); });
for (const b of document.querySelectorAll('#pestanas button')) b.addEventListener('click', () => irA(b.dataset.p));
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => { estado.tab = b.dataset.tab; olvidarLugarRoadmap(); pintarPestanasAbierto(); fijarHash(hashDe()); });   // C-12 (v0.115.0): solo lo que cambia con la pestaña
// U-35 (v0.123.0): las pestañas del proyecto como tablist de verdad — una sola parada de Tab (tabindex rotativo, lo pone pintarPestanas)
// y flechas izquierda/derecha entre las visibles (Capital se salta cuando esta oculta).
for (const b of document.querySelectorAll('.tabs .tab')) b.addEventListener('keydown', ev => {
    const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
    ev.preventDefault(); const ts = [...document.querySelectorAll('.tabs .tab')].filter(x => !x.classList.contains('oculto'));
    const n = ts[(ts.indexOf(b) + d + ts.length) % ts.length]; n.click(); n.focus();
});
// B1: filtros plegados en celular; el boton los abre y dice cuantos hay puestos.
$('btnFiltros').addEventListener('click', () => { estado.filtrosAbiertos = !estado.filtrosAbiertos; const p = proyectoAbierto(); if (p) pintarFiltrosProyecto(p); });   // C-12 (v0.115.0)
$('pDesc').addEventListener('click', () => $('pDesc').classList.toggle('abierta'));
// B1: el menu «···» del proyecto se cierra al elegir una accion y al tocar fuera.
// v0.5.0 lo abria arriba de 720 px (el details era display:contents y cerrado no pintaba a sus hijos); desde v0.13.0 es un menu
// real en todo ancho, asi que al cruzar los 720 px solo se CIERRA (v0.81.0: abierto quedaba desplegado sobre el tablero).
const enCelular = window.matchMedia('(max-width: 720px)');
function acomodarAccMenu() { $('accMenu').open = false; }   // v0.81.0: desde v0.13.0 el «⋮» es menu en TODO ancho — abrirlo arriba de 720 lo dejaba desplegado al cruzar el ancho (lo delataban las capturas -full a 1366 desde v0.80.0 o antes)
// Al cruzar los 720 px (girar el telefono, redimensionar la ventana) se cierra el menu «⋮», la leyenda del tablero se pliega o se
// abre (U-24) y se repinta, porque Inicio cambia cuantos renglones enseña (B3). C-25 (v0.123.0): «Resumen» ya no depende del ancho (v0.30.0).
function acomodarLeyenda() { $('leyendaDet').open = !enCelular.matches; }   // U-24 (v0.123.0): en celular la leyenda del tablero nace plegada
// B3: Inicio tambien depende del ancho (3 renglones de actividad en celular, 5 en escritorio).
enCelular.addEventListener('change', () => { acomodarAccMenu(); acomodarLeyenda(); if (estado.sesion) repintar(); });
acomodarAccMenu(); acomodarLeyenda();
// v0.13.0: el menu «⋮» existe en todos los anchos. Se cierra al tocar fuera y al elegir un BOTON (abrir el submenu «Editar»
// no lo cierra); al cerrarse, el submenu vuelve plegado para que la proxima vez abra limpio.
document.addEventListener('click', e => { const m = $('accMenu'); if (m.open && !m.contains(e.target)) m.open = false; });
$('accMenu').querySelector('.acciones').addEventListener('click', e => { if (e.target.closest('button')) $('accMenu').open = false; });
// U-12 (17-sep): el submenu «Editar ›» (#accEditar) se aplano; ya no hay nada que plegar al cerrar el «⋮».
// D6: el pie del rail apilaba seis controles en 60 px; Equipo, Ver en SharePoint y Salir viven en un
// menu «···» hacia arriba (Actualizar y el tema se quedan a la vista). Se cierra al elegir y al tocar fuera.
document.addEventListener('click', e => { const m = $('menuRail'); if (m.open && !m.contains(e.target)) m.open = false; });
$('menuRail').querySelector('.menu-caja').addEventListener('click', () => { $('menuRail').open = false; });
// C3: buscador en Proyectos y en Mis tareas (misma normalizacion que el del tablero).
$('filtroEquipoMovil').addEventListener('change', () => { estado.filtroEquipo = $('filtroEquipoMovil').value || null; repintar(); });
$('textoProyectos').addEventListener('input', () => { estado.textoProyectos = $('textoProyectos').value; if (estado.pestana === 'proyectos') pintarProyectos(); });
$('textoMis').addEventListener('input', () => { estado.textoMis = $('textoMis').value; if (estado.pestana === 'mis') pintarMisTareas(); });
$('btnNuevoProyecto').addEventListener('click', () => abrirFormaProyecto(null));
$('btnEditarProyecto').addEventListener('click', () => abrirFormaProyecto(proyectoAbierto()));
$('btnCerrarProyecto').addEventListener('click', cerrarProyecto);
$('btnReabrirProyecto').addEventListener('click', reabrirProyecto);
$('btnEliminarProyecto').addEventListener('click', eliminarProyecto);   // v0.13.0
$('formProyecto').addEventListener('submit', guardarProyecto);
$('npCancelar').addEventListener('click', cancelarFormaProyecto);   // U-08 (24-sep)
engancharTablero();
engancharDocs();
engancharChat();
engancharMensajes();   // v0.42.0
engancharCapital(); alCambiarCapital(repintar); fijarIrAProyecto(id => abrirProyecto(id));   // v0.100.0; C-04 (26-sep): recibe el id
$('pCapitalIr').addEventListener('click', () => { const p = proyectoAbierto(); if (!p) return; estado.filtroCapital = p.id; irA('capital'); });
engancharRoadmap(); engancharCalendario(); engancharArchivos(); engancharReportes();   // v0.10.0 · v0.26.0 roadmap a pantalla completa
for (const b of document.querySelectorAll('.ir-movil')) b.addEventListener('click', () => { $('menuMovil').open = false; irA(b.dataset.ir); });   // v0.10.0: Roadmap · Archivos · Reportes no caben en la barra del celular
$('btnActividadInicio').addEventListener('click', () => abrirActividad(null));
$('btnActividadProyecto').addEventListener('click', () => abrirActividad(proyectoAbierto() ? estado.proyectoAbiertoId : null));
$('acCerrar').addEventListener('click', () => cerrarDialogo('dlgActividad'));
$('acMas').addEventListener('click', () => { acCtx.n += 50; pintarActividad(); });
$('btnEquipo').addEventListener('click', abrirEquipo);
$('btnEquipoMovil').addEventListener('click', () => { $('menuMovil').open = false; abrirEquipo(); });
$('eqCerrar').addEventListener('click', () => cerrarDialogo('dlgEquipo'));
$('btnImprimir').addEventListener('click', () => window.print());
$('shell').classList.add('sin-sesion');

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => reg.update && reg.update()).catch(() => {});
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (recargado || !navigator.serviceWorker.controller) return; recargado = true; if (!estado.sesion) window.location.reload(); });
}

for (const id of ['ftVence', 'ntVence', 'npVence', 'cpFecha']) campoFecha(id);   // v0.106.0: fechas dd/mm/aaaa en todo dispositivo
arrancar();
