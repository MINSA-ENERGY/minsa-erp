// MINSA ERP v1.0.0 — el módulo ARCHIVOS (rediseño 2026-10-02, cubeta 5; plan cerebro/docs/plan-erp-rediseno-2026-10-02.md, decisión 2
// «Archivos opción A» y «Contenido por módulo › Archivos»).
//
//   · ERP_Proyectos (sitio Administración): una carpeta <clave>/ por proyecto, la de TRABAJO del equipo. Se sube directo (PUT ≤ 10 MiB;
//     upload session en fragmentos de 5 MiB arriba), con zona de arrastrar y soltar, botón y cámara (foto comprimida a 2048 px).
//   · Todo pasa por la COLA (cola.js, IndexedDB por cuenta): sin señal la subida espera en el equipo y sale sola al abrir la app, al volver la
//     red y en cada refresco. Antes de subir se revisa si ya existe (mismo nombre, mismo nombre que una liga archivada, o mismo tamaño +
//     quickXorHash): un posible duplicado se RETIENE y la persona decide; nunca se sube solo.
//   · Lo formal se MANDA A ARCHIVAR: copia al buzón 99_Pendiente-Archivar de la unidad como lote (`_lote.json` al final, contrato 1 de
//     lote.js) + liga de tipo buzón (la de siempre: «en el buzón» y el recibo de la skill la reemplazan) y la columna EnviadoArchivar.
//   · Por archivo: vista previa (POST …/preview en un <iframe> del tenant), abrir en Word/Excel/PowerPoint (ms-*:ofe|u|), versiones y
//     restaurar, copiar liga, ligar a tarjeta (TareaId), fijar (ERP_Vistas), mandar a archivar y borrar (autor o gerencia).
//   · Las secciones de #archivos/<sección>: Por proyecto · la carpeta de un proyecto (el MISMO componente que la pestaña Documentos) ·
//     Recientes (este equipo) · Fijados · Bibliotecas (las de unidad con permiso: leer + ligar; las de 403 no se pintan) · Mis subidas.
//   · Sin ERP_Proyectos aprovisionada: «Falta preparar ERP_Proyectos» (gerencia: la ruta de las instrucciones) y todo lo demás como antes.
// Las reglas puras viven en archivos-reglas.js (con prueba). Nada de innerHTML (test/sw.test.js): DOM con el() / iconoSvg().
// docs.js NO importa este módulo (recibe el gancho de la subida con fijarSubidaProyecto); armazon.js y tablero.js sí.

import { CONFIG } from './config.js';
import { PUEDE, tareasDe, fechaMexico, slug, ordenarProyectos, plural, nombreDe, tipoArchivo, textosLargos, TEXTO_MAX, hrefSeguro, fechaDia } from './reglas.js';
import { $, L, VERSION, estado, el, boton, chip, iconoSvg, TRAZOS, iconoArchivo, iconoEquipo, avisar, abrirDialogo, cerrarDialogo, confirmar, opciones, porId, proyectoPorClave, registrarActividad, equipoDe, fechaCorta, fechaHora, haceCuanto, agregarSinDuplicar, activos, irAHash, limpiar, conservarFoco } from './comun.js';
import { baseDrive, baseSitio, subirFragmento, leerMonitorCopia, esSinRed } from './graph.js';
import { construirManifiesto, validarManifiesto, bytesDelManifiesto, nombreCarpetaLote, NOMBRE_MANIFIESTO } from './lote.js';
import { proximoByte, crearQuickXor, comoSubir, FRAGMENTO, leerMonitor, nombreSubible, nombreFoto, tamanoLegible, necesitaHash, buscarDuplicado, archivoDeGraph, sinArchivar,
    appOffice, nombreAppOffice, uriOffice, urlVistaPrevia, pendientesAlSalir, avisosDeCola, agregarAlFrente, leerSeccion, rutaSeccion, validarFijado, TOPE_RECIENTES, TOPE_HISTORIAL } from './archivos-reglas.js';
import { leerCola, guardarEnCola, guardarBytes, existeEnCola, quitarDeCola, llaveDe, hayDisco } from './cola.js';
import { comprimir } from './imagen.js';
import { bibliotecaDe, puedeLigarEn, sitioDe, abrirSubir, fijarSubidaProyecto, ligarArchivadoA, tablaDocs, filaRaiz, filasDeExpediente, ordenarDocs } from './docs.js';
import { cabecera, vistaDe, soltarIdsFuera } from './reporte.js';
import { guardadosDe, guardarVista, borrarVista, registrarAbridor, asegurarGuardados, estadoGuardados, esMia } from './guardados.js';

let alCambiar = () => {};
/** app.js: qué repintar cuando algo de Archivos cambia (la pantalla y, si está abierta, la ficha de la tarjeta). Devuelve el anterior (la E2E lo
 *  envuelve para fingir un repintado que truena y luego lo regresa). */
export function alCambiarArchivos(fn) { const antes = alCambiar; alCambiar = fn; return antes; }
/** v1.0.0 (vuelta 1, revisión de código «media»): el repintado y la bitácora van FUERA del try de una operación con efectos — un error de pintado
 *  no es una falla de la subida ni del archivado (antes regresaba a «pendiente» un archivo ya subido, o borraba el lote ya en el buzón). */
function repintarSeguro() { try { alCambiar(); } catch (e) { console.warn('Archivos: el repintado falló; la operación ya quedó.', motivoDe(e)); } }
const motivoDe = e => (e && e.message ? e.message : String(e));
const yo = () => String((estado.cuenta && estado.cuenta.username) || '').trim().toLowerCase();
const enLinea = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const host = () => CONFIG.sharepointHost;
const LECTOR = 4 * 1024 * 1024;   // trozo con que se lee un archivo grande para su quickXorHash (sin cargarlo entero en memoria)

// ---------------------------------------------------------------- la biblioteca ERP_Proyectos

const B = { estado: null, driveId: null, motivo: '', promesa: null };   // estado: null · 'buscando' · 'lista' · 'falta' · 'error'
export const estadoBiblioteca = () => B;
export const bibliotecaLista = () => B.estado === 'lista';
/**
 * ¿Existe ERP_Proyectos y cuál es su drive? Una vez por sesión (la lista de listas ya la leyó el arranque: sin GET /lists de más); `forzar`
 * («Volver a revisar») relee la lista de listas porque la biblioteca pudo crearse con la app abierta. Sin ella: 'falta' y nada más pregunta.
 */
export function asegurarBiblioteca(forzar = false) {
    if (B.promesa && !forzar) return B.promesa;
    if (!estado.cliente || !estado.siteId) return Promise.resolve();
    B.estado = 'buscando';
    B.promesa = (async () => {
        try {
            if (forzar) await estado.cliente.listas(estado.siteId);
            const conocida = estado.cliente.listaConocida(CONFIG.bibliotecaProyectos);   // lo que ya leyó el arranque: sin GET /lists de más
            if (!(conocida === null ? await estado.cliente.existeLista(estado.siteId, CONFIG.bibliotecaProyectos) : conocida)) { B.estado = 'falta'; B.driveId = null; return; }
            B.driveId = await estado.cliente.driveDeLista(estado.siteId, CONFIG.bibliotecaProyectos);
            B.estado = 'lista'; B.motivo = '';
        } catch (e) { B.estado = 'error'; B.driveId = null; B.motivo = motivoDe(e); console.warn(`${CONFIG.bibliotecaProyectos}: no se pudo abrir.`, B.motivo); }
    })();
    return B.promesa;
}
/** Olvida lo sabido de la biblioteca y de las carpetas (la prueba lo usa para simular la biblioteca ausente; «Volver a revisar» relee). */
export function olvidarBiblioteca() { B.estado = null; B.driveId = null; B.motivo = ''; B.promesa = null; carpetas.clear(); carpetasCreadas.clear(); }
const base = () => baseDrive(B.driveId);

// ---------------------------------------------------------------- las carpetas de los proyectos

const carpetas = new Map();          // clave -> { items, existe, error, cargadoEl, promesa }
const carpetasCreadas = new Set();
const porFecha = (a, b) => String(b.modificado || '').localeCompare(String(a.modificado || '')) || a.nombre.localeCompare(b.nombre);
/**
 * Lee la carpeta <clave>/ con las columnas de cada archivo. Una vez por CARGA (estado.cargadoEl: el refresco de 120 s o «Actualizar» la
 * vuelven a leer); sin red no pregunta (se queda lo que hubiera). Devuelve los archivos tras una lectura real, o null si no leyó.
 */
export function cargarCarpeta(clave, { forzar = false } = {}) {
    if (!bibliotecaLista() || !clave || !estado.cliente) return Promise.resolve(null);
    const c = carpetas.get(clave);
    // con una lectura EN VUELO, `forzar` espera a que termine y lee OTRA vez: la que iba en camino salió antes de la escritura que pide releer
    // y, si se devolviera, pisaría el cambio recién hecho (pasó en tiempo real: «Ligar a tarjeta» durante el refresco de un diálogo de lectura)
    if (c && c.promesa) return forzar ? c.promesa.then(() => cargarCarpeta(clave, { forzar: true })) : c.promesa;
    if (c && !forzar && c.cargadoEl === estado.cargadoEl) return Promise.resolve(null);
    if (!enLinea()) return Promise.resolve(null);
    const reg = c || { items: [], existe: null, error: null, cargadoEl: 0, promesa: null }; carpetas.set(clave, reg);
    const carga = estado.cargadoEl;
    reg.promesa = estado.cliente.hijos(base(), clave, { conCampos: true })
        .then(xs => { reg.existe = xs !== null; reg.items = (xs || []).map(it => archivoDeGraph(it, clave)).filter(Boolean).sort(porFecha); reg.error = null; return reg.items; })
        .catch(e => { reg.error = motivoDe(e); return reg.items; })
        .finally(() => { reg.cargadoEl = carga; reg.promesa = null; });
    return reg.promesa;
}
export const archivosDe = clave => (carpetas.get(clave) || {}).items || [];
const carpetaLeida = clave => { const c = carpetas.get(clave); return !!c && c.cargadoEl > 0; };
const leyendo = clave => { const c = carpetas.get(clave); return !!c && !!c.promesa; };
/** Pide la carpeta si hace falta y repinta UNA vez cuando llega (nunca en bucle: sin red o ya leída en esta carga, no hace nada). */
function pedirCarpeta(clave) {
    const c = carpetas.get(clave);
    if (!bibliotecaLista() || !enLinea() || (c && (c.promesa || c.cargadoEl === estado.cargadoEl))) return;
    cargarCarpeta(clave).then(r => { if (r) alCambiar(); });
}
async function asegurarCarpetaProyecto(clave) {
    if (carpetasCreadas.has(clave)) return;
    const c = carpetas.get(clave);
    if (!(c && c.existe)) await estado.cliente.asegurarCarpetaEnDrive(B.driveId, clave);   // 409 = ya estaba (no es error)
    carpetasCreadas.add(clave);
}
/** Al crear un proyecto (app.js): su carpeta nace de una vez. Best-effort: si falla, nace con la primera subida. */
export async function alCrearProyecto(p) {
    try { await asegurarBiblioteca(); if (bibliotecaLista() && p && p.Clave && PUEDE.ligar(estado.rol)) await asegurarCarpetaProyecto(p.Clave); }
    catch (e) { console.warn(`${CONFIG.bibliotecaProyectos}: la carpeta del proyecto se crea con la primera subida.`, motivoDe(e)); }
}
/** Para quien sube: ¿puede subir a ESTE proyecto? (rol, proyecto activo y la biblioteca, o el buzón de su unidad como antes). */
export function puedeSubirEn(p) { return PUEDE.ligar(estado.rol) && !!p && p.Estado === 'activo' && (bibliotecaLista() || puedeLigarEn(p)); }
/** v1.0.0 (cubeta 6): cuántos archivos de la carpeta del proyecto se conocen (la pestaña «Documentos · N» suma ligas + carpeta, como el contador de la
 *  tarjeta). NO pide la carpeta: la leen Documentos, la ficha y Archivos (y repintan al llegar, que es cuando la cifra se corrige). Pedirla aquí —en
 *  cada pintado del proyecto— movía el reloj de las lecturas y repintados de siempre: en la matriz de capturas (tiempo real) una marca de visto de
 *  lectura caía antes de «CERO escrituras» y, en la versión que no repintaba, «editar tras la relectura» (C-02) de colaborador fallaba. */
export function nArchivosDe(p) { return p && bibliotecaLista() ? archivosDe(p.Clave).length : 0; }
/** Los archivos de la carpeta del proyecto ligados a una tarjeta (la ficha de la tarjeta los lista; pide la carpeta si no se ha leído). */
export function archivosDeTarjeta(p, tareaId) {
    if (!p || !bibliotecaLista()) return [];
    pedirCarpeta(p.Clave);
    return archivosDe(p.Clave).filter(a => a.tareaId === Number(tareaId));
}

// ---------------------------------------------------------------- recientes y Mis subidas (por dispositivo)

const llaveRecientes = () => `erp.recientes.${yo() || 'sin-cuenta'}`;
const llaveHistorial = () => `erp.subidas.${yo() || 'sin-cuenta'}`;
function leerLS(k) { try { const x = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(x) ? x.filter(y => y && typeof y === 'object') : []; } catch (_) { return []; } }
function escribirLS(k, xs) { try { localStorage.setItem(k, JSON.stringify(xs)); } catch (_) { /* sin almacenamiento: vive la sesión */ } }
/** Recientes: lo que esta persona abrió, previsualizó o subió en este equipo (plan: «por dispositivo»). */
export function anotarReciente(x) { escribirLS(llaveRecientes(), agregarAlFrente(leerLS(llaveRecientes()), { ...x, cuando: new Date().toISOString() }, TOPE_RECIENTES)); }
export const recientes = () => leerLS(llaveRecientes()).filter(x => typeof x.nombre === 'string' && typeof x.llave === 'string');
function anotarHistorial(x) { escribirLS(llaveHistorial(), agregarAlFrente(leerLS(llaveHistorial()), { ...x, cuando: new Date().toISOString() }, TOPE_HISTORIAL)); }
export const historial = () => leerLS(llaveHistorial());

// ---------------------------------------------------------------- la cola de subidas

let cola = [];            // los registros vivos de esta cuenta (con su archivo); `progreso` es de la sesión, no se guarda
let disco = null;         // ¿hay IndexedDB? (null = no se ha preguntado)
let procesando = null, otraVuelta = false;
let compresor = f => comprimir(f);
/** Para la prueba E2E: fingir la compresión del navegador (canvas), como el Graph falso finge SharePoint. */
export function fijarCompresor(fn) { compresor = fn; }
export const colaActual = () => cola;
/** «Salir» (app.js) avisa si hay subidas que no han salido de este equipo. */
export const pendientesCola = () => pendientesAlSalir(cola);
/** La fuente de la campana (armazon.js registrarFuenteAvisos): subidas con error y «¿duplicado?». */
export const fuenteAvisosArchivos = () => avisosDeCola(cola);
/** Los DATOS del registro al disco (sin bytes: van una vez, al encolar). Un registro que ya salió de la cola (subido, descartado) no se
 *  re-persiste: antes un cambio tardío lo revivía en IndexedDB y reaparecía al abrir la app. */
function persistir(r) { if (disco === false || !cola.includes(r)) return Promise.resolve(false); const { progreso, enDisco, ...guardable } = r; return guardarEnCola(guardable).catch(() => false); }
function cambiar(r, cambios) { Object.assign(r, cambios, { cambio: new Date().toISOString() }); persistir(r); }
function sacarDeCola(r) { cola = cola.filter(x => x !== r); quitarDeCola(r.llave).catch(() => {}); }
const SIN_DISCO = 'no se guardó en este equipo: no cierres la app hasta que suba';
/** v1.0.0 (vuelta 1, revisión de código «media»): UNA cola para todas las pestañas o ventanas de la app — sin el candado, dos pestañas subían el
 *  mismo registro (un 409 «¿duplicado?» falso que volvía en cada arranque, o dos copias). Sin navigator.locks (navegador viejo) corre directo. */
const conCandado = fn => (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request ? navigator.locks.request('minsa-erp-cola', fn) : fn());

/** Al entrar (app.js, tras cargar las listas): lo que esta cuenta dejó en la cola de este equipo vuelve y se procesa. */
export async function iniciarCola() {
    disco = await hayDisco();
    const leidos = await leerCola(yo());
    let n = 0;
    for (const r of leidos) {
        if (!r || !r.llave || cola.some(x => x.llave === r.llave)) continue;
        if (r.estado === 'subido') { quitarDeCola(r.llave).catch(() => {}); continue; }
        if (r.estado === 'subiendo') r.estado = 'pendiente';   // la sesión anterior se cerró a media subida: se empieza de nuevo
        if (!r.archivo) { quitarDeCola(r.llave).catch(() => {}); continue; }   // sin bytes no hay qué subir (la escritura de los bytes falló)
        r.progreso = 0; r.enDisco = true; cola.push(r); n++;
    }
    if (n) alCambiar();
    asegurarBiblioteca().then(() => procesarCola());
}

/**
 * Mete archivos a la cola de la carpeta del proyecto y arranca la subida. `foto`: viene de la cámara — se comprime a 2048 px (JPEG, sin el
 * EXIF de ubicación, como la app de captura) y se nombra por fecha y hora (iPhone las llama todas «image.jpg»). Devuelve cuántos encoló.
 */
export async function encolar(p, archivos, { tareaId = null, foto = false } = {}) {
    if (!PUEDE.ligar(estado.rol)) { avisar('Tu rol es de lectura: no puedes subir archivos.', 'error'); return 0; }
    if (!p || p.Estado !== 'activo') { avisar('El proyecto está cerrado: ya no recibe archivos.', 'error'); return 0; }
    await asegurarBiblioteca();
    if (!bibliotecaLista()) { avisar(`Falta preparar ${CONFIG.bibliotecaProyectos}: la carpeta del proyecto todavía no existe.`, 'error'); return 0; }
    const ahora = new Date(); let n = 0, sinDisco = 0;
    for (const [i, f] of [...archivos].entries()) {
        let archivo = f, nombre = nombreSubible(f.name), tipo = f.type || 'application/octet-stream';
        if (foto && (!f.type || /^image\//.test(f.type))) {
            try { const c = await compresor(f); if (c && c.bytes && c.bytes.length) { archivo = new Blob([c.bytes], { type: 'image/jpeg' }); tipo = 'image/jpeg'; } }
            catch (e) { console.warn('La foto no se pudo comprimir; sube como viene.', motivoDe(e)); }
            nombre = nombreFoto(ahora, i);
        }
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${i}`;
        const iso = new Date().toISOString();
        const r = { llave: llaveDe(yo(), id), cuenta: yo(), id, proyectoId: p.id, clave: p.Clave, titulo: p.Title, tareaId: tareaId ? Number(tareaId) : null, nombre, tipo,
            tamano: archivo.size, archivo, estado: 'pendiente', motivo: enLinea() ? '' : 'sin señal: sube sola al volver la red', creado: iso, cambio: iso, confirmado: false, reemplazar: false, renombrar: false, foto: !!foto, progreso: 0, enDisco: false };
        cola.push(r); n++;
        // v1.0.0 (vuelta 1, revisión de código «fondo»): la cola existe para que lo de sin señal NO se pierda — se MIRA si IndexedDB guardó (datos y
        // bytes; los bytes UNA vez). Si no (cuota llena, modo privado, un File que el navegador no clona), el renglón y el aviso lo dicen.
        r.enDisco = disco === false ? false : (await Promise.all([persistir(r), guardarBytes(r.llave, archivo)])).every(Boolean);
        if (!r.enDisco) { sinDisco++; if (cola.includes(r) && r.estado === 'pendiente') r.motivo = enLinea() ? SIN_DISCO : `sin señal y ${SIN_DISCO}`; }
    }
    if (n) avisar(sinDisco ? `${n === 1 ? 'El archivo' : `${n} archivos`} ${enLinea() ? 'en camino' : 'esperan la red'}, pero este navegador no ${n === 1 ? 'lo' : 'los'} guardó en el equipo: no cierres la app hasta que suba${n === 1 ? '' : 'n'}.`
        : enLinea() ? `${n} ${plural(n, 'archivo')} en camino a la carpeta del proyecto.` : `Sin señal: ${n === 1 ? 'el archivo queda' : `los ${n} archivos quedan`} en la cola de este equipo y ${n === 1 ? 'sube' : 'suben'} al volver la red.`, sinDisco ? 'error' : enLinea() ? 'ok' : 'ojo');
    alCambiar();
    procesarCola();
    return n;
}
/** El gancho del diálogo «Subir» en modo carpeta (docs.js). */
async function encolarDesdeDialogo({ proyectoId, tareaId, archivos, foto }) { return encolar(porId(estado.proyectos, proyectoId), archivos, { tareaId, foto }); }

/** Procesa lo pendiente, uno por uno; una sola corrida a la vez (la que llega mientras tanto pide otra vuelta). El candado se suelta con
 *  .finally DESPUÉS de asignarlo: un `finally { procesando = null }` dentro de la función async corre antes de la asignación cuando la
 *  vuelta termina sin ningún await (nada pendiente) y dejaba el candado puesto para siempre — la cola ya no subía nada (lo cazó la E2E). */
export function procesarCola() {
    if (procesando) { otraVuelta = true; return procesando; }
    const vuelta = Promise.resolve(conCandado(() => vueltasDeCola()));
    procesando = vuelta;
    vuelta.finally(() => { if (procesando === vuelta) procesando = null; }).catch(() => {});
    return vuelta;
}
async function vueltasDeCola() {
    do {
        otraVuelta = false;
        if (!estado.sesion || !enLinea() || !cola.some(x => x.estado === 'pendiente')) return;
        await asegurarBiblioteca();
        if (!bibliotecaLista()) {
            for (const r of cola.filter(x => x.estado === 'pendiente')) cambiar(r, { estado: 'error', motivo: `falta preparar ${CONFIG.bibliotecaProyectos}` });
            alCambiar(); return;
        }
        // la lista es una COPIA: subirRegistro resuelve cada uno por su llave al empezar (lo descartado a media tanda ya no sube)
        for (const r of cola.filter(x => x.estado === 'pendiente')) {
            if (!enLinea() || !estado.sesion) break;
            if (await subirRegistro(r) === 'parar') break;
        }
    } while (otraVuelta);
}
/** v1.0.0 (vuelta 1, revisión de código «fondo»): ¿este registro sigue por subir? — en la cola de esta pestaña, pendiente, y (si se guardó en el
 *  disco) todavía en el disco: otra pestaña pudo subirlo o descartarlo. Lo que ya no está se suelta sin subir. */
async function sigueVivo(r) {
    if (!cola.includes(r) || r.estado !== 'pendiente') return false;
    if (r.enDisco && disco !== false && (await existeEnCola(r.llave)) === false) { cola = cola.filter(x => x !== r); repintarSeguro(); return false; }
    return cola.includes(r) && r.estado === 'pendiente';
}
/** quickXorHash de un archivo local, leído en trozos (un video de 200 MB no se carga entero). */
async function hashDe(archivo) {
    const q = crearQuickXor();
    for (let a = 0; a < archivo.size; a += LECTOR) q.actualizar(new Uint8Array(await archivo.slice(a, Math.min(archivo.size, a + LECTOR)).arrayBuffer()));
    return q.final();
}
function pintarProgreso(r) {
    for (const n of document.querySelectorAll(`[data-cola="${CSS.escape(r.llave)}"]`)) {
        const pr = n.querySelector('progress'); if (pr) pr.value = r.progreso || 0;
        const t = n.querySelector('.estado-txt'); if (t) t.textContent = textoEstado(r);
    }
}
/** Sube UN registro de la cola. 'ok' · 'retenido' · 'error' · 'parar' (sin red: lo demás espera). */
async function subirRegistro(r) {
    if (!await sigueVivo(r)) return 'ok';
    const p = porId(estado.proyectos, r.proyectoId) || proyectoPorClave(r.clave);
    if (!p) { cambiar(r, { estado: 'error', motivo: 'el proyecto ya no existe' }); repintarSeguro(); return 'error'; }
    cambiar(r, { estado: 'subiendo', motivo: '' }); r.progreso = 0; repintarSeguro();
    let subido = null;   // { nombre } cuando el archivo YA quedó en SharePoint: lo de después (repintar, bitácora) va fuera del try
    try {
        // la disciplina: antes de subir, ¿ya existe? (la carpeta de ESTE momento, no la de la última pintada)
        if (!r.confirmado) {
            await cargarCarpeta(r.clave, { forzar: true });
            const ex = archivosDe(r.clave);
            const hash = necesitaHash(r.tamano, ex) ? await hashDe(r.archivo) : null;
            const dup = buscarDuplicado({ nombre: r.nombre, tamano: r.tamano, hash }, ex, estado.ligas.filter(l => Number(l.ProyectoId) === p.id));
            if (dup) {
                cambiar(r, { estado: 'retenido', motivo: dup.texto, dup: dup.motivo });
                avisar(`¿«${r.nombre}» duplicado? Se retuvo: ${dup.texto}. Decide en la carpeta del proyecto o en Mis subidas.`, 'ojo');
                repintarSeguro(); return 'retenido';
            }
        }
        await asegurarCarpetaProyecto(r.clave);
        const ruta = `${r.clave}/${r.nombre}`, conflicto = r.reemplazar ? 'replace' : r.renombrar ? 'rename' : 'fail';
        let item = null;
        if (comoSubir(r.tamano) === 'put') {
            item = await estado.cliente.subirEnDrive(base(), ruta, await r.archivo.arrayBuffer(), r.tipo, conflicto);
        } else {
            const s = await estado.cliente.crearSesionSubida(base(), ruta, conflicto);
            let atascos = 0;   // vuelta 2: tramos seguidos en que SharePoint no avanzó; más de 3 = la subida se corta con su motivo
            for (let a = 0; a < r.tamano;) {
                const b = Math.min(r.tamano, a + FRAGMENTO) - 1;
                const trozo = await r.archivo.slice(a, b + 1).arrayBuffer();
                const x = await subirFragmento(s.uploadUrl, trozo, a, b, r.tamano, host());
                r.progreso = (b + 1) / r.tamano; pintarProgreso(r);
                if (x.listo) { item = x.item; break; }
                const sig = proximoByte(b, x.siguiente);
                atascos = sig <= a ? atascos + 1 : 0;
                if (atascos > 3) throw new Error('SharePoint no avanza la subida (pide una y otra vez el mismo tramo): vuelve a intentarlo');
                a = sig;
            }
            if (!item) throw new Error('la subida terminó sin que SharePoint confirmara el archivo');
        }
        r.progreso = 1; pintarProgreso(r);
        // las columnas: de qué proyecto y de qué tarjeta. Si fallan, el archivo YA está en su carpeta (la carpeta dice el proyecto).
        try { await estado.cliente.camposDeArchivo(base(), item.id, limpiar({ ProyectoClave: r.clave, TareaId: r.tareaId || undefined })); }
        catch (e) { console.warn('ERP_Proyectos: el archivo subió pero sus columnas no se marcaron.', motivoDe(e)); }
        const nombre = item.name || r.nombre;
        r.estado = 'subido'; sacarDeCola(r);
        anotarHistorial({ llave: 's:' + item.id, tipo: 'subida', nombre, clave: r.clave, titulo: p.Title, itemId: item.id, url: item.webUrl || '' });
        anotarReciente({ llave: 'p:' + item.id, origen: 'proyecto', nombre, clave: r.clave, itemId: item.id, url: item.webUrl || '' });
        subido = { nombre };
    } catch (e) {
        if (e && e.status === 409 && !r.reemplazar && !r.renombrar) {
            cambiar(r, { estado: 'retenido', motivo: `ya hay un «${r.nombre}» en la carpeta del proyecto`, dup: 'nombre' });
            avisar(`¿«${r.nombre}» duplicado? Se retuvo: ya hay uno con ese nombre.`, 'ojo'); repintarSeguro(); return 'retenido';
        }
        // «sin red» es lo que graph.js MARCA (esSinRed: navigator.onLine o un fetch que no llegó tras los reintentos), no cualquier TypeError
        if (esSinRed(e) || !enLinea()) {
            cambiar(r, { estado: 'pendiente', motivo: 'sin señal: sube sola al volver la red' }); r.progreso = 0; repintarSeguro(); return 'parar';
        }
        cambiar(r, { estado: 'error', motivo: motivoDe(e) });
        avisar(`«${r.nombre}» no se subió: ${motivoDe(e)}`, 'error'); repintarSeguro(); return 'error';
    }
    // ya en SharePoint: lo que sigue no puede regresarlo a la cola (vuelta 1, revisión de código «media»)
    await cargarCarpeta(r.clave, { forzar: true });
    repintarSeguro();
    await registrarActividad('subir', `subió «${subido.nombre.slice(0, 80)}» a la carpeta del proyecto${r.reemplazar ? ' (versión nueva)' : ''}`, p.id, r.tareaId || undefined);
    repintarSeguro();
    return 'ok';
}
/** Lo que la persona decide sobre un renglón de la cola: 'subir' (de todos modos), 'renombrar' (con otro nombre), 'reintentar' o 'descartar'. */
export function decidir(llave, accion) {
    const r = cola.find(x => x.llave === llave); if (!r) return;
    // v1.0.0 (vuelta 1): descartar MARCA el registro antes de sacarlo — si una tanda en curso lo iba a subir, sigueVivo lo salta
    if (accion === 'descartar') { r.estado = 'descartado'; sacarDeCola(r); avisar(`«${r.nombre}» salió de la cola (no se subió).`, 'ok'); alCambiar(); return; }
    if (accion === 'subir') cambiar(r, { estado: 'pendiente', motivo: '', confirmado: true, reemplazar: r.dup === 'nombre', renombrar: r.dup !== 'nombre' });
    else if (accion === 'renombrar') cambiar(r, { estado: 'pendiente', motivo: '', confirmado: true, reemplazar: false, renombrar: true });   // v1.0.0 (vuelta 1, UI): «Subir con otro nombre»
    else if (accion === 'reintentar') cambiar(r, { estado: 'pendiente', motivo: '' });
    alCambiar(); procesarCola();
}
const textoEstado = r => ({
    pendiente: r.motivo || (!r.enDisco && disco !== null ? SIN_DISCO : enLinea() ? 'en la cola…' : 'en la cola: sin señal, sube sola al volver la red'),
    subiendo: `subiendo… ${Math.round((r.progreso || 0) * 100)}%`,
    retenido: `¿duplicado? ${r.motivo || ''}`.trim(),
    error: `no se subió: ${r.motivo || ''}`.trim(),
    subido: 'subido'
})[r.estado] || r.estado;

// ---------------------------------------------------------------- mandar a archivar

const drivesUnidad = new Map();   // clave de unidad -> promesa { id, url } del drive Documentos de su sitio
function driveUnidad(bib, siteId) {
    if (!drivesUnidad.has(bib.clave)) drivesUnidad.set(bib.clave, estado.cliente.driveDeSitio(siteId).catch(e => { drivesUnidad.delete(bib.clave); throw e; }));
    return drivesUnidad.get(bib.clave);
}
/** Espera a que una copia termine: el monitor de Graph (sin token); si el monitor no contesta (CORS, red), mira el destino por Graph. */
async function esperarCopia(monitor, siteId, rutaDestino) {
    let mon = monitor;
    for (let i = 0; i < 40; i++) {
        if (mon) {
            let m = null;
            try { m = leerMonitor(await leerMonitorCopia(mon, host())); } catch (e) { console.warn('monitor de la copia sin respuesta; se mira el destino.', motivoDe(e)); mon = null; }
            if (m && m.listo) return;
            if (m && m.fallo) throw new Error('SharePoint no pudo copiar el archivo');
        }
        if (!mon && await estado.cliente.existeRuta(siteId, rutaDestino)) return;
        await dormir(Math.min(4000, 400 * (i + 1)));
    }
    throw new Error('la copia tardó demasiado; vuelve a intentarlo');
}
/**
 * «Mandar a archivar»: COPIA los archivos al buzón 99_Pendiente-Archivar de la unidad como UN lote (carpeta con fecha, las piezas y
 * `_lote.json` AL FINAL, contrato 1 firmado minsa-proyectos), deja la liga de tipo buzón de siempre (con su tarjeta) y marca
 * EnviadoArchivar + Lote en cada archivo. Visible solo si la biblioteca de la unidad tiene permiso (puedeLigarEn, como hoy). Si algo falla
 * a medias se borra la carpeta del lote. true si quedó.
 * v1.0.0 (vuelta 1, revisión de código «fondo»): resuelve el proyecto y los archivos POR ID al clic (el menú y la ficha capturan los objetos del
 * pintado), con un CANDADO por itemId —un doble toque mandaba dos lotes y dos ligas— y un aviso al empezar (la copia tarda: sin él la persona
 * volvía a tocar); si la marca EnviadoArchivar falla, se dice en pantalla (antes solo en la consola, y al cerrar el proyecto se mandaba otra vez).
 */
const enviando = new Set();   // itemId camino al buzón
export const mandandoArchivo = id => enviando.has(id);
export async function mandarArchivar(pIn, archivos, { concepto = '' } = {}) {
    if (!PUEDE.ligar(estado.rol)) { avisar('Tu rol es de lectura: no puedes mandar a archivar.', 'error'); return false; }
    const p = (pIn && porId(estado.proyectos, pIn.id)) || pIn;
    const bib = p && bibliotecaDe(p);
    if (!bib || !puedeLigarEn(p)) { avisar('La biblioteca de esta unidad todavía no tiene el permiso de la app: no se puede mandar a archivar desde aquí.', 'error'); return false; }
    const ids = [...new Set((archivos || []).filter(Boolean).map(a => a.id))];
    if (ids.some(id => enviando.has(id))) { avisar('Ya se está mandando al buzón: espera a que termine.', 'ojo'); return false; }
    const xs = ids.map(id => archivosDe(p.Clave).find(x => x.id === id) || archivos.find(x => x && x.id === id)).filter(a => a && !a.enviado);
    if (!xs.length) { avisar('Nada que mandar: ya se mandó a archivar.', 'ojo'); return true; }
    const c = String(concepto || (xs.length === 1 ? xs[0].nombre.replace(/\.[^.]+$/, '') : `Archivos de ${p.Clave}`)).trim().slice(0, 120);
    const fecha = fechaMexico();
    const tareas = [...new Set(xs.map(a => a.tareaId || null))], tareaId = tareas.length === 1 && tareas[0] ? tareas[0] : undefined;
    const nombreCarpeta = nombreCarpetaLote(fecha, CONFIG.etiquetaLote, p.Clave, slug(c));
    const destino = String(p.Carpeta || bib.destinoLotes || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const man = construirManifiesto({ appVersion: VERSION, unidad: bib.clave, etiqueta: CONFIG.etiquetaLote, destino, fecha, concepto: c, archivos: xs.map(a => a.nombre), proyecto: p.Clave, tarea: tareaId });
    const v = validarManifiesto(man); if (!v.ok) { avisar('El lote no es válido: ' + v.motivo, 'error'); return false; }
    const largos0 = textosLargos({ Title: c, Ruta: `${CONFIG.buzon}/${nombreCarpeta}` });
    if (largos0.length) { avisar(`No se pudo mandar: ${largos0.join(', ')} pasa(n) de los ${TEXTO_MAX} caracteres que admite la lista.`, 'error'); return false; }
    let carpeta = null, s = null, ruta = '';
    for (const a of xs) enviando.add(a.id);
    try {
        avisar(`Mandando «${c}» al buzón de ${bib.nombre}… (la copia puede tardar)`, 'ok'); repintarSeguro();
        try {
            s = await sitioDe(bib);
            if (!s.id) throw new Error(`sin acceso a ${bib.nombre}: ${s.motivo}`);
            const d = await driveUnidad(bib, s.id);
            carpeta = await estado.cliente.crearCarpeta(s.id, CONFIG.buzon, nombreCarpeta);
            ruta = `${CONFIG.buzon}/${carpeta.nombreReal}`;
            for (const a of xs) {
                const mon = await estado.cliente.copiarA(base(), a.id, { driveId: d.id, id: carpeta.id }, a.nombre);
                await esperarCopia(mon, s.id, `${ruta}/${a.nombre}`);
            }
            await estado.cliente.subirPieza(s.id, ruta, NOMBRE_MANIFIESTO, bytesDelManifiesto(man), 'application/json');   // AL FINAL: prueba de lote completo
            const campos = limpiar({ Title: c, ProyectoId: p.id, TareaId: tareaId, Tipo: 'buzon', Unidad: bib.clave, Ruta: ruta, DriveItemId: carpeta.id, LigadoPor: estado.cuenta.username });
            agregarSinDuplicar(estado.ligas, await estado.cliente.crearRenglon(estado.siteId, L.ligas, campos)); estado.buzonExiste[ruta] = true;
        } catch (e) {
            if (carpeta && s && s.id) { try { await estado.cliente.borrarItemDrive(s.id, carpeta.id); } catch (_) { console.warn('quedó una carpeta a medias en el buzón; la skill la trata como lote incompleto'); } }
            avisar('No se pudo mandar a archivar: ' + motivoDe(e), 'error');
            return false;
        }
        // el lote YA está en el buzón con su liga: nada de aquí abajo lo deshace (vuelta 1, revisión de código «media»)
        const sinMarca = [];
        for (const a of xs) {
            try { await estado.cliente.camposDeArchivo(base(), a.id, { EnviadoArchivar: true, Lote: ruta }); a.enviado = true; a.lote = ruta; }
            catch (e) { sinMarca.push(a.nombre); console.warn('ERP_Proyectos: el lote quedó pero la marca EnviadoArchivar no.', motivoDe(e)); }
        }
        await cargarCarpeta(p.Clave, { forzar: true });
        anotarHistorial({ llave: 'a:' + ruta, tipo: 'archivar', nombre: c, n: xs.length, clave: p.Clave, titulo: p.Title, lote: ruta, unidad: bib.nombre });
        avisar(`«${c}» va al buzón de ${bib.nombre} (${xs.length} ${plural(xs.length, 'archivo')}). La skill de archivar lo acomoda.`, 'ok');
        if (sinMarca.length) avisar(`El lote ya está en el buzón, pero ${sinMarca.length === 1 ? `«${sinMarca[0]}» no quedó marcado` : `${sinMarca.length} archivos no quedaron marcados`} como enviado: ${sinMarca.length === 1 ? 'sigue' : 'siguen'} saliendo «sin archivar». No lo mandes otra vez; avísale a quien archiva.`, 'error');
    } finally { for (const a of xs) enviando.delete(a.id); }
    repintarSeguro();
    await registrarActividad('archivar', `mandó a archivar «${c.slice(0, 80)}» (${xs.length} ${plural(xs.length, 'archivo')}) al buzón de ${bib.nombre}`, p.id, tareaId);
    repintarSeguro();
    return true;
}

/**
 * Antes de CERRAR un proyecto (app.js cerrarProyecto, solo gerencia): si su carpeta tiene archivos sin archivar, la lista y «Mandar a
 * archivar todo» (si la unidad tiene permiso), «Cerrar sin archivar» o Cancelar. true = seguir con el cierre.
 */
let finSinArchivar = null;
/** app.js (fijarAlCerrar): «Archivos sin archivar» se cerró por Atrás o por código — el cierre del proyecto se resuelve en «no». */
export function alCerrarSinArchivar() { if (finSinArchivar) finSinArchivar(); }
export async function revisarAntesDeCerrar(p) {
    await asegurarBiblioteca();
    if (!bibliotecaLista() || !p) return true;
    await cargarCarpeta(p.Clave, { forzar: true });
    const xs = sinArchivar(archivosDe(p.Clave));
    if (!xs.length) return true;
    $('saTexto').textContent = `La carpeta de «${p.Title}» tiene ${xs.length} ${plural(xs.length, 'archivo')} sin mandar a archivar. Al cerrar el proyecto se quedan en ${CONFIG.bibliotecaProyectos}/${p.Clave}/; lo formal debería ir al buzón de la unidad.`;
    const ul = $('saLista'); ul.textContent = '';
    for (const a of xs) { const li = el('li'); li.appendChild(iconoArchivo(a.nombre, null, 'sm')); li.appendChild(el('span', '', a.nombre)); li.appendChild(el('small', '', tamanoLegible(a.tamano))); ul.appendChild(li); }
    $('saProgreso').textContent = '';
    const puede = puedeLigarEn(p);
    $('saTodo').hidden = !puede; $('saTodo').disabled = false;
    if (!puede) $('saProgreso').textContent = 'La biblioteca de la unidad no tiene el permiso de la app: no se puede mandar desde aquí.';
    abrirDialogo('dlgSinArchivar');
    // v1.0.0 (vuelta 1, revisión de código «media»): Esc o Atrás (el `close` del diálogo) resuelven en «no» — antes la promesa quedaba colgada con
    // sus botones vivos, y un «Mandar a archivar todo» en curso, al terminar, sacaba la confirmación de cierre sin que nadie la pidiera
    return new Promise(res => {
        const dlg = $('dlgSinArchivar'); let resuelto = false;
        const alCerrar = () => fin(false);
        const fin = v => { if (resuelto) return; resuelto = true; finSinArchivar = null; dlg.removeEventListener('close', alCerrar); $('saTodo').onclick = $('saSeguir').onclick = $('saCancelar').onclick = null; if (dlg.open) cerrarDialogo('dlgSinArchivar'); res(v); };
        dlg.addEventListener('close', alCerrar);   // Esc
        finSinArchivar = alCerrar;                 // Atrás (popstate) y cerrarDialogo avisan SINCRONO por fijarAlCerrar (app.js): el `close` llega tarde bajo tiempo virtual
        $('saCancelar').onclick = () => fin(false);
        $('saSeguir').onclick = () => fin(true);
        $('saTodo').onclick = async () => {
            $('saTodo').disabled = true; $('saProgreso').textContent = 'Mandando al buzón…';
            const ok = await mandarArchivar(p, xs, { concepto: `Cierre del proyecto ${p.Clave}` });
            if (resuelto) return;   // se cerró a medio envío: el lote sigue su camino, el cierre no
            if (ok) fin(true); else { $('saTodo').disabled = false; $('saProgreso').textContent = 'No se pudo: revisa el aviso y vuelve a intentarlo, o cierra sin archivar.'; }
        };
    });
}

// ---------------------------------------------------------------- acciones por archivo

async function copiarLiga(url) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); avisar('Liga copiada.', 'ok'); return; } } catch (_) { /* cae al aviso */ }
    avisar(url, 'ojo');
}
/** La vista previa de un archivo: { base, itemId, nombre, url, reciente }. El <iframe> solo recibe https del tenant. */
// v1.0.0 (vuelta 1, revisión de código «media»): una FICHA por apertura — la respuesta de un archivo viejo que llega tarde (abrir A, cerrar,
// abrir B en el segundo que tarda POST /preview) ya no se pinta en el diálogo de B; en Versiones, sus «Restaurar» restaurarían el equivocado
let fichaVista = 0, fichaVersiones = 0;
export async function abrirVistaPrevia(x) {
    const ficha = ++fichaVista;
    $('vpTitulo').textContent = x.nombre;
    const href = hrefSeguro(x.url, { tipo: 'archivado', host: host() });
    $('vpAbrir').hidden = !href; if (href) $('vpAbrir').href = href;
    const marco = $('vpMarco'); marco.hidden = true; marco.removeAttribute('src');
    $('vpEstado').textContent = 'Preparando la vista previa…';
    abrirDialogo('dlgVistaPrevia');
    if (x.reciente) anotarReciente(x.reciente);
    try {
        const r = await estado.cliente.vistaPrevia(x.base, x.itemId);
        const u = urlVistaPrevia(r.getUrl, host());
        if (ficha !== fichaVista || !$('dlgVistaPrevia').open) return;
        if (!u) { $('vpEstado').textContent = 'Este archivo no tiene vista previa dentro de la app. Ábrelo en una pestaña nueva.'; return; }
        marco.src = u; marco.hidden = false; $('vpEstado').textContent = '';
    } catch (e) { if (ficha === fichaVista) $('vpEstado').textContent = `No se pudo preparar la vista previa (${motivoDe(e)}). Ábrelo en una pestaña nueva.`; }
}
async function abrirVersiones(p, a) {
    const ficha = ++fichaVersiones;
    $('vrTitulo').textContent = `Versiones de «${a.nombre}»`; $('vrSub').textContent = 'Leyendo…'; $('vrLista').textContent = '';
    abrirDialogo('dlgVersiones');
    const puede = PUEDE.ligar(estado.rol) && p.Estado === 'activo';
    try {
        const vs = await estado.cliente.versiones(base(), a.id);
        if (ficha !== fichaVersiones || !$('dlgVersiones').open) return;
        $('vrSub').textContent = vs.length > 1 ? `${vs.length} versiones; la de arriba es la actual. Restaurar una vieja la vuelve la actual y la de hoy no se pierde.` : 'Solo existe la versión actual.';
        const l = $('vrLista'); l.textContent = '';
        for (const [i, v] of vs.entries()) {
            const f = el('div', 'vr-r'); f.setAttribute('role', 'listitem'); f.dataset.version = v.id;
            f.appendChild(el('b', '', `v${v.id}`));
            f.appendChild(el('span', 'tx', `${fechaHora(v.cuando)}${v.quien ? ' · ' + v.quien : ''} · ${tamanoLegible(v.tamano)}`));
            if (i === 0) f.appendChild(chip('actual', 'ok'));
            else if (puede) f.appendChild(boton('Restaurar', 'mn-btn is-sm', () => restaurar(p, a, v), { restaurar: v.id }));
            l.appendChild(f);
        }
    } catch (e) { if (ficha === fichaVersiones) $('vrSub').textContent = 'No se pudieron leer las versiones: ' + motivoDe(e); }
}
async function restaurar(p, a, v) {
    const { ok } = await confirmar({ titulo: 'Restaurar la versión', ok: 'Restaurar', texto: `«${a.nombre}» vuelve a la versión ${v.id} (${fechaHora(v.cuando)}). La versión de hoy se conserva en el historial.` });
    if (!ok) return;
    try {
        await estado.cliente.restaurarVersion(base(), a.id, v.id);
        avisar(`«${a.nombre}» volvió a la versión ${v.id}.`, 'ok');
        await registrarActividad('restaurar-version', `restauró la versión ${v.id} de «${a.nombre.slice(0, 80)}»`, p.id, a.tareaId || undefined);
        await cargarCarpeta(p.Clave, { forzar: true }); alCambiar();
        if ($('dlgVersiones').open) abrirVersiones(p, archivosDe(p.Clave).find(x => x.id === a.id) || a);
    } catch (e) { avisar('No se pudo restaurar: ' + motivoDe(e), 'error'); }
}
async function ligarATarjeta(p, a, valor, sel) {
    const nuevo = valor ? Number(valor) : null, actual = a.tareaId || null;
    if (nuevo === actual) return;
    const t = nuevo ? porId(estado.tareas, nuevo) : null;
    const { ok } = await confirmar({ titulo: 'Ligar a tarjeta', ok: 'Ligar', texto: t ? `«${a.nombre}» queda ligado a la tarjeta «${t.Title}».` : `«${a.nombre}» queda del proyecto entero (sin tarjeta).` });
    if (!ok) { if (sel) sel.value = actual ? String(actual) : ''; return; }
    try {
        await estado.cliente.camposDeArchivo(base(), a.id, { TareaId: nuevo });
        a.tareaId = nuevo; avisar(t ? `«${a.nombre}» ahora es de la tarjeta «${t.Title}».` : `«${a.nombre}» ahora es del proyecto entero.`, 'ok'); alCambiar();
        await cargarCarpeta(p.Clave, { forzar: true }); alCambiar();   // la verdad es SharePoint: una lectura en vuelo no deja el cambio a medias
        await registrarActividad('ligar', t ? `ligó «${a.nombre.slice(0, 60)}» a «${t.Title.slice(0, 60)}»` : `dejó «${a.nombre.slice(0, 60)}» para el proyecto entero`, p.id, nuevo || undefined);
        alCambiar();
    } catch (e) { avisar('No se pudo ligar a la tarjeta: ' + motivoDe(e), 'error'); if (sel) sel.value = actual ? String(actual) : ''; }
}
async function borrarArchivo(p, a) {
    const { ok } = await confirmar({ titulo: 'Borrar el archivo', ok: 'Borrar', texto: `«${a.nombre}» se borra de la carpeta del proyecto (va a la papelera del sitio).${a.enviado ? ' La copia que se mandó a archivar no se toca.' : ' No se ha mandado a archivar.'}` });
    if (!ok) return;
    try {
        await estado.cliente.borrarDeDrive(base(), a.id);
        const c = carpetas.get(p.Clave); if (c) c.items = c.items.filter(x => x.id !== a.id);
        avisar(`«${a.nombre}» borrado.`, 'ok'); alCambiar();
        await cargarCarpeta(p.Clave, { forzar: true }); alCambiar();
        await registrarActividad('borrar-archivo', `borró «${a.nombre.slice(0, 80)}» de la carpeta del proyecto`, p.id, a.tareaId || undefined);
        alCambiar();
    } catch (e) { avisar('No se pudo borrar: ' + motivoDe(e), 'error'); }
}

// ---------------------------------------------------------------- fijados (ERP_Vistas, o este equipo sin la lista)

const unidadesConocidas = () => Object.keys(CONFIG.bibliotecas);
export const fijados = () => guardadosDe('archivos', d => validarFijado(d, { host: host(), unidades: unidadesConocidas() }));
const fijadoDe = itemId => fijados().find(v => v.definicion.itemId === itemId) || null;
async function alternarFijado(def) {
    const ya = fijadoDe(def.itemId);
    try {
        if (ya) { await borrarVista(ya); avisar(`«${def.nombre}» ya no está en Fijados.`, 'ok'); }
        else { await guardarVista({ titulo: def.nombre, compartida: false, modulo: 'archivos', definicion: def }); avisar(`«${def.nombre}» quedó en Fijados${estadoGuardados().modo === 'local' ? ' (en este equipo)' : ''}.`, 'ok'); }
    } catch (e) { avisar('No se pudo fijar: ' + motivoDe(e), 'error'); }
    alCambiar();
}
registrarAbridor('fijado', v => { const d = v.definicion; irAHash(d.origen === 'proyecto' ? rutaSeccion('proyecto', { clave: d.clave }) : rutaSeccion('bibliotecas', { unidad: d.unidad, ruta: String(d.carpeta || '').split('/').filter(Boolean) })); });

// ---------------------------------------------------------------- piezas de DOM

const puedeEscribirEn = p => PUEDE.ligar(estado.rol) && !!p && p.Estado === 'activo';
function menuDe(id, acciones) {
    const d = el('details', 'fila-menu arch-menu'); const s = el('summary', 'mn-btn is-ghost is-sm is-icono', '⋯'); s.setAttribute('aria-label', 'Acciones del archivo'); s.title = 'Acciones'; s.dataset.archivoMenu = id; d.appendChild(s);
    const m = el('div', 'menu'); for (const a of acciones) m.appendChild(a); d.appendChild(m);
    d.addEventListener('toggle', () => { if (d.open) for (const o of document.querySelectorAll('.fila-menu[open]')) if (o !== d) o.open = false; });
    return d;
}
const accionBoton = (texto, accion, alClic, peligro = false) => boton(texto, 'mn-btn is-ghost is-sm' + (peligro ? ' is-peligro' : ''), ev => { const d = ev.currentTarget.closest('details'); if (d) d.open = false; alClic(); }, { accionArchivo: accion });
/** v1.0.1 (Carlos, 3-oct, tras la prueba real: el visor de Office sale EN BLANCO dentro de la app): el NOMBRE de un archivo abre Word, Excel y
 *  PowerPoint en SU programa (`office`: ms-word:ofe|u|…, o `alOffice` cuando la liga se arma aparte) y lo demás en la vista previa de la app
 *  (`alVista`). Ctrl/Mayús/clic de en medio abren la web en otra pestaña, como cualquier liga. Sin nada que abrir, el nombre va en texto. */
function ligaNombre(nombre, { href, office, alOffice, alVista, reciente }) {
    if (!href && !office && !alOffice) return el('span', '', nombre);
    const l = el('a', '', nombre);
    if (office) { l.href = office; l.dataset.abre = 'office'; l.addEventListener('click', () => { if (reciente) anotarReciente(reciente); }); return l; }
    l.href = href || '#'; l.target = '_blank'; l.rel = 'noopener noreferrer'; l.dataset.abre = alOffice ? 'office' : alVista ? 'vista' : 'web';
    l.addEventListener('click', ev => {
        if (ev.ctrlKey || ev.metaKey || ev.shiftKey) { if (reciente) anotarReciente(reciente); return; }
        if (alOffice || alVista) { ev.preventDefault(); (alOffice || alVista)(); return; }
        if (reciente) anotarReciente(reciente);
    });
    return l;
}
function accionLiga(texto, accion, href, alClic) { const a = el('a', 'mn-btn is-ghost is-sm', texto); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.dataset.accionArchivo = accion; if (alClic) a.addEventListener('click', alClic); return a; }

/** El aviso «Falta preparar ERP_Proyectos» (gerencia: la ruta de las instrucciones y «Volver a revisar»; los demás: qué sí funciona). */
function tarjetaFalta() {
    const c = el('section', 'rp-card arch-falta'); c.dataset.falta = CONFIG.bibliotecaProyectos;
    c.appendChild(chip('aún no habilitado', 'warn'));
    c.appendChild(el('h3', '', `Falta preparar ${CONFIG.bibliotecaProyectos}`));
    const gerencia = PUEDE.proyecto(estado.rol);
    c.appendChild(el('p', '', B.estado === 'error'
        ? `No se pudo abrir la biblioteca ${CONFIG.bibliotecaProyectos} (${B.motivo}). Mientras tanto, ligar, pegar un enlace y subir al buzón desde la tarjeta funcionan como siempre.`
        : `La carpeta de trabajo de los proyectos vive en la biblioteca ${CONFIG.bibliotecaProyectos} del sitio Administración, que todavía no existe. Mientras tanto, ligar, pegar un enlace y subir al buzón desde la tarjeta funcionan como siempre.`));
    if (gerencia) {
        const p = el('p', 'arch-instr'); p.appendChild(document.createTextNode('Se crea una sola vez con la cuenta de Carlos: ')); p.appendChild(el('code', '', CONFIG.instruccionesRediseno)); c.appendChild(p);
        const acc = el('div', 'arch-acc');
        acc.appendChild(boton('Copiar la ruta', 'mn-btn is-sm', () => copiarLiga(CONFIG.instruccionesRediseno), { falta: 'copiar' }));
        acc.appendChild(boton('Volver a revisar', 'mn-btn is-sm', () => { olvidarBiblioteca(); asegurarBiblioteca(true).then(() => alCambiar()); alCambiar(); }, { falta: 'revisar' }));
        c.appendChild(acc);
    } else c.appendChild(el('p', 'mn-help', 'La prepara gerencia.'));
    return c;
}
/** La zona de arrastrar y soltar con «Elegir archivos» y «Foto» (cámara). Solo ARCHIVOS: arrastrar una tarjeta no sube nada. */
function zonaSubir(p) {
    const z = el('div', 'zona-subir'); z.dataset.zona = p.Clave;
    const vivo = () => porId(estado.proyectos, p.id);
    const inp = el('input'); inp.type = 'file'; inp.multiple = true; inp.hidden = true; inp.dataset.zonaInput = 'archivos'; inp.setAttribute('aria-label', 'Elegir archivos para subir');
    const cam = el('input'); cam.type = 'file'; cam.accept = 'image/*'; cam.setAttribute('capture', 'environment'); cam.hidden = true; cam.dataset.zonaInput = 'foto'; cam.setAttribute('aria-label', 'Tomar una foto');
    inp.addEventListener('change', () => { const fs = [...inp.files]; inp.value = ''; if (fs.length) encolar(vivo(), fs); });
    cam.addEventListener('change', () => { const fs = [...cam.files]; cam.value = ''; if (fs.length) encolar(vivo(), fs, { foto: true }); });
    z.appendChild(iconoSvg(TRAZOS.subir, 'zs-ico'));
    const t = el('div', 'zs-t'); t.appendChild(el('b', '', 'Arrastra archivos aquí')); t.appendChild(el('small', '', 'o usa los botones; antes de subir se revisa si ya existe')); z.appendChild(t);
    const acc = el('div', 'zs-acc');
    acc.appendChild(boton('Elegir archivos', 'mn-btn is-sm', () => inp.click(), { zona: 'elegir' }));
    const f = boton('', 'mn-btn is-sm', () => cam.click(), { zona: 'foto' }); f.appendChild(iconoSvg(TRAZOS.camara)); f.appendChild(el('span', '', 'Foto')); f.title = 'Tomar una foto con la cámara (se reduce a 2048 px)'; acc.appendChild(f);
    z.appendChild(acc); z.appendChild(inp); z.appendChild(cam);
    const conArchivos = e => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    z.addEventListener('dragover', e => { if (!conArchivos(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; z.classList.add('is-sobre'); });
    z.addEventListener('dragleave', e => { if (!z.contains(e.relatedTarget)) z.classList.remove('is-sobre'); });
    z.addEventListener('drop', e => { if (!conArchivos(e)) return; e.preventDefault(); z.classList.remove('is-sobre'); const fs = [...(e.dataTransfer.files || [])]; if (fs.length) encolar(vivo(), fs); });
    return z;
}
/** Un renglón de la cola: nombre, estado, progreso y lo que se puede decidir. */
function filaCola(r, { conProyecto = false } = {}) {
    const d = el('div', 'arch-cola-r is-' + r.estado); d.dataset.cola = r.llave; d.setAttribute('role', 'listitem');
    d.appendChild(iconoArchivo(r.nombre, null, 'sm'));
    const t = el('div', 'tx'); t.appendChild(el('b', '', r.nombre));
    t.appendChild(el('small', 'estado-txt', textoEstado(r)));
    if (conProyecto) t.appendChild(el('small', 'de', `${r.titulo || r.clave} · ${tamanoLegible(r.tamano)}`));
    d.appendChild(t);
    if (r.estado === 'subiendo' || r.estado === 'pendiente') { const pr = el('progress'); pr.max = 1; if (r.estado === 'subiendo') pr.value = r.progreso || 0; pr.setAttribute('aria-label', `Avance de ${r.nombre}`); d.appendChild(pr); }
    const acc = el('div', 'acc');
    if (r.estado === 'retenido') acc.appendChild(boton(r.dup === 'nombre' ? 'Subir como versión nueva' : 'Subir de todos modos', 'mn-btn is-sm', () => decidir(r.llave, 'subir'), { colaAccion: 'subir' }));
    // v1.0.0 (vuelta 1, revisión UI/UX «media»): el mismo NOMBRE no quiere decir el mismo archivo — «Subir con otro nombre» (rename: «x 1.pdf»)
    if (r.estado === 'retenido' && r.dup === 'nombre') acc.appendChild(boton('Subir con otro nombre', 'mn-btn is-sm', () => decidir(r.llave, 'renombrar'), { colaAccion: 'renombrar' }));
    if (r.estado === 'error') acc.appendChild(boton('Reintentar', 'mn-btn is-sm', () => decidir(r.llave, 'reintentar'), { colaAccion: 'reintentar' }));
    if (r.estado !== 'subiendo') acc.appendChild(boton('Descartar', 'mn-btn is-ghost is-sm', () => decidir(r.llave, 'descartar'), { colaAccion: 'descartar' }));
    d.appendChild(acc);
    return d;
}
/** Las acciones del menu «⋯» de un archivo de la carpeta del proyecto. */
function accionesDe(p, a) {
    const xs = [], puede = puedeEscribirEn(p);
    const quien = a.creadoPor ? nombreDe(a.creadoPor, estado.roles) : '';
    const nota = el('span', 'menu-nota quien'); nota.appendChild(el('span', '', `Subido por ${quien || '—'}`)); if (a.modificado) { const f = el('span', 'fecha', fechaCorta(a.modificado)); f.title = fechaHora(a.modificado); nota.appendChild(f); } xs.push(nota);
    const reciente = { llave: 'p:' + a.id, origen: 'proyecto', nombre: a.nombre, clave: p.Clave, itemId: a.id, url: a.url };
    const href = hrefSeguro(a.url, { tipo: 'archivado', host: host() });
    const office = uriOffice(a.nombre, a.urlDirecta || a.url, host());
    // v1.0.1: Office abre en su programa y en el navegador; la «Vista previa» de Office salía en blanco con el tenant real (prueba de Carlos, 3-oct)
    if (office) xs.push(accionLiga(`Abrir en ${nombreAppOffice(appOffice(a.nombre))}`, 'office', office, () => anotarReciente(reciente)));
    else xs.push(accionBoton('Vista previa', 'vista', () => abrirVistaPrevia({ base: base(), itemId: a.id, nombre: a.nombre, url: a.url, reciente })));
    if (href) xs.push(accionLiga(office ? 'Abrir en el navegador' : 'Abrir', 'abrir', href, () => anotarReciente(reciente)));
    xs.push(accionBoton('Versiones', 'versiones', () => abrirVersiones(p, a)));
    if (href) xs.push(accionBoton('Copiar liga', 'copiar', () => copiarLiga(href)));
    if (puede) {
        const lab = el('label', 'menu-mover'); lab.appendChild(el('span', '', 'Ligar a tarjeta'));
        const sel = el('select'); sel.dataset.tarjetaArchivo = a.id; sel.setAttribute('aria-label', 'Ligar el archivo a una tarjeta');
        opciones(sel, tareasDe(p, estado.tareas), t => t.id, t => t.Title.slice(0, 70), 'el proyecto entero');
        // ligado a una tarjeta que ya no está entre las abiertas (hecha, o de otra lectura): sin su opción el select salía EN BLANCO (captura 390)
        if (a.tareaId && ![...sel.options].some(o => o.value === String(a.tareaId))) { const t = porId(estado.tareas, a.tareaId); const o = el('option', '', t ? t.Title.slice(0, 70) : `tarjeta #${a.tareaId}`); o.value = String(a.tareaId); sel.appendChild(o); }
        sel.value = a.tareaId ? String(a.tareaId) : '';
        sel.addEventListener('change', () => ligarATarjeta(p, archivosDe(p.Clave).find(x => x.id === a.id) || a, sel.value, sel));
        lab.appendChild(sel); xs.push(lab);
    }
    if (PUEDE.tarea(estado.rol)) xs.push(accionBoton(fijadoDe(a.id) ? 'Quitar de Fijados' : 'Fijar', 'fijar', () => alternarFijado({ tipo: 'fijado', origen: 'proyecto', clave: p.Clave, itemId: a.id, nombre: a.nombre, url: href || '' })));
    if (puede && !a.enviado && puedeLigarEn(p)) { const b = accionBoton(enviando.has(a.id) ? 'Mandando al buzón…' : 'Mandar a archivar', 'archivar', () => mandarArchivar(p, [a])); b.disabled = enviando.has(a.id); xs.push(b); }
    if (puede && (PUEDE.proyecto(estado.rol) || (a.creadoPor && a.creadoPor === yo()))) xs.push(accionBoton('Borrar', 'borrar', () => borrarArchivo(p, a), true));
    return xs;
}
/** La tabla de la carpeta (la piel .dtabla de Documentos): Nombre · Fecha · Tipo · Estado · Tarjeta · «⋯». */
function tablaArchivos(p, items) {
    const w = el('div', 'docs arch-docs'); const lista = el('div', 'lista'); w.appendChild(lista);
    const caja = el('div', 'dtabla arch-tabla'); const t = el('table'); const th = el('thead'); const trh = el('tr');
    for (const [cls, texto] of [['c-nombre', 'Nombre'], ['c-del', 'Fecha'], ['c-tipo', 'Tipo'], ['c-estado', 'Estado'], ['c-tarjeta', 'Tarjeta'], ['c-acc', '']]) { const h = el('th', cls, texto); h.scope = 'col'; if (!texto) h.setAttribute('aria-label', 'Acciones'); trh.appendChild(h); }
    th.appendChild(trh); t.appendChild(th);
    const tb = el('tbody');
    for (const a of items) {
        const tr = el('tr', 'doc'); tr.dataset.archivoId = a.id;
        const tdN = el('td', 'c-nombre'); const caja2 = el('div', 'nombre'); caja2.appendChild(iconoArchivo(a.nombre));
        const tt = el('div', 't'); const href = hrefSeguro(a.url, { tipo: 'archivado', host: host() });
        const reciente = { llave: 'p:' + a.id, origen: 'proyecto', nombre: a.nombre, clave: p.Clave, itemId: a.id, url: a.url };
        tt.appendChild(ligaNombre(a.nombre, { href, office: uriOffice(a.nombre, a.urlDirecta || a.url, host()), reciente,
            alVista: () => abrirVistaPrevia({ base: base(), itemId: a.id, nombre: a.nombre, url: a.url, reciente }) }));
        tt.title = `${a.nombre} · ${tamanoLegible(a.tamano)}${a.creadoPor ? ' · subido por ' + nombreDe(a.creadoPor, estado.roles) : ''}`;
        caja2.appendChild(tt); tdN.appendChild(caja2); tr.appendChild(tdN);
        tr.appendChild(el('td', 'c-del', a.modificado ? fechaDia(a.modificado) : '—'));   // v1.0.0 (cubeta 6): la fecha de la app —«03/10/2026» (dd/mm/aaaa desde la vuelta 1, Carlos 3-oct)—
        const ta = tipoArchivo(a.nombre); const tdT = el('td', 'c-tipo'); const bt = el('span', 'mn-chip tipo is-' + ta.clave, ta.sigla); bt.title = ta.etiqueta; tdT.appendChild(bt); tr.appendChild(tdT);
        const tdE = el('td', 'c-estado'); const est = el('span', 'estado'); est.appendChild(a.enviado ? chip('enviado a archivar', 'ok') : chip('sin archivar', 'warn')); if (a.enviado && a.lote) est.title = a.lote; tdE.appendChild(est); tr.appendChild(tdE);
        const tarea = a.tareaId ? porId(estado.tareas, a.tareaId) : null;
        const tdC = el('td', 'c-tarjeta'); const pil = el('span', 'tarjeta-liga' + (a.tareaId ? '' : ' sin'), tarea ? tarea.Title : a.tareaId ? `tarjeta #${a.tareaId}` : 'el proyecto entero'); if (tarea) pil.title = tarea.Title; tdC.appendChild(pil); tr.appendChild(tdC);
        const tdA = el('td', 'c-acc'); tdA.appendChild(menuDe(a.id, accionesDe(p, a))); tr.appendChild(tdA);
        tb.appendChild(tr);
    }
    t.appendChild(tb); caja.appendChild(t); lista.appendChild(caja);
    return w;
}

/**
 * LA CARPETA DEL PROYECTO — el componente que comparten la pestaña Documentos (#docsCarpeta) y #archivos/proyecto/<clave>: cabecera con
 * «N archivos · M sin archivar», la zona de subir (quien escribe, proyecto activo), la cola de ESTE proyecto y la tabla con su menú «⋯».
 */
export function pintarCarpetaProyecto(cont, p) {
    cont.textContent = '';
    if (!p) return;
    if (B.estado === null || B.estado === 'buscando') { cont.appendChild(el('p', 'vacio arch-buscando', 'Revisando la carpeta del proyecto…')); asegurarBiblioteca().then(() => alCambiar()); return; }
    if (!bibliotecaLista()) { cont.appendChild(tarjetaFalta()); return; }
    pedirCarpeta(p.Clave);
    const c = carpetas.get(p.Clave), items = archivosDe(p.Clave), sin = sinArchivar(items), leida = carpetaLeida(p.Clave);
    const card = el('section', 'rp-card arch-carpeta'); card.dataset.carpeta = p.Clave;
    const cab = el('div', 'rp-dh'); cab.appendChild(el('h3', '', 'Carpeta del proyecto'));
    const n = el('span', 'arch-n'); n.dataset.sinArchivar = String(sin.length);
    n.textContent = !leida && leyendo(p.Clave) ? 'Leyendo…' : `${items.length} ${plural(items.length, 'archivo')} · ${sin.length} sin archivar`;
    if (sin.length) n.classList.add('is-pend');
    cab.appendChild(n);
    const ruta = el('span', 'arch-ruta mn-mono', `${CONFIG.bibliotecaProyectos}/${p.Clave}/`); ruta.title = 'Biblioteca de trabajo del sitio Administración; lo formal se manda a archivar al buzón de la unidad'; cab.appendChild(ruta);
    card.appendChild(cab);
    if (puedeEscribirEn(p)) card.appendChild(zonaSubir(p));
    const deEste = cola.filter(r => r.clave === p.Clave && r.estado !== 'subido');
    if (deEste.length) { const l = el('div', 'arch-cola'); l.setAttribute('role', 'list'); l.setAttribute('aria-label', 'Subidas en curso'); for (const r of deEste) l.appendChild(filaCola(r)); card.appendChild(l); }
    if (c && c.error) { const e = el('p', 'arch-error', `No se pudo leer la carpeta: ${c.error}`); e.appendChild(boton('Volver a leer', 'mn-btn is-ghost is-sm', () => cargarCarpeta(p.Clave, { forzar: true }).then(() => alCambiar()))); card.appendChild(e); }
    if (items.length) card.appendChild(tablaArchivos(p, items));
    else if (leida || !enLinea()) card.appendChild(el('p', 'vacio arch-vacio', puedeEscribirEn(p) ? 'La carpeta está vacía: arrastra archivos aquí o usa «Elegir archivos» o «Foto».' : 'La carpeta está vacía.'));
    cont.appendChild(card);
}

// ---------------------------------------------------------------- #archivos/<sección>

const TITULOS = { proyectos: 'Archivos por proyecto', proyecto: 'Carpeta del proyecto', recientes: 'Recientes', fijados: 'Fijados', bibliotecas: 'Bibliotecas', mias: 'Mis subidas' };
const AYUDA = 'Archivos: cada proyecto tiene su carpeta de trabajo en ERP_Proyectos (sitio Administración), visible para todo el equipo. Se sube directo —arrastrando, con «Elegir archivos» o con «Foto»— y antes de subir se revisa si ya existe (mismo nombre, mismo contenido o una liga archivada con ese nombre): lo dudoso se retiene para que decidas. Sin señal, la subida espera en este equipo y sale sola al volver la red. Lo formal se manda a archivar al buzón de la unidad y la skill de archivar lo acomoda. «Bibliotecas» muestra las de unidad con permiso de la app, solo para leer y ligar.';
const FOCO = ['zona', 'colaAccion', 'archivoMenu', 'ir', 'falta', 'biblioteca', 'fijado', 'reciente'];
/** Pinta la sección de #archivos que dice estado.sub. Devuelve { conLigas }: «Por proyecto» además lleva el árbol de ligas de siempre (vistas.js). */
export function pintarSeccionArchivos() {
    const s = leerSeccion(estado.sub);
    const cabCont = $('archivosCab'), cont = $('archivosSeccion');
    const p = s.seccion === 'proyecto' ? proyectoPorClave(s.clave) : null;
    asegurarGuardados(() => alCambiar());
    conservarFoco(cabCont, ['rp'], () => {
        soltarIdsFuera(cabCont); cabCont.textContent = '';
        const titulo = s.seccion === 'proyecto' && p ? p.Title : s.seccion === 'bibliotecas' && s.unidad ? (CONFIG.bibliotecas[s.unidad] || {}).nombre || s.unidad : TITULOS[s.seccion];
        cabCont.appendChild(cabecera({ id: 'archivos', titulo, ayuda: AYUDA, sub: subtitulo(s, p), subId: 'archivosCabSub' }, vistaDe('archivos'), () => alCambiar()));
    });
    conservarFoco(cont, FOCO, () => {
        cont.textContent = '';
        if (s.seccion === 'proyectos') pintarPorProyecto(cont);
        else if (s.seccion === 'proyecto') { if (p) { pintarCarpetaProyecto(cont, p); cont.appendChild(ligasDelProyecto(p)); } else cont.appendChild(el('p', 'vacio', `No hay un proyecto con la clave «${s.clave}».`)); }
        else if (s.seccion === 'recientes') pintarRecientes(cont);
        else if (s.seccion === 'fijados') pintarFijados(cont);
        else if (s.seccion === 'bibliotecas') pintarBibliotecas(cont, s);
        else if (s.seccion === 'mias') pintarMias(cont);
    });
    const conLigas = s.seccion === 'proyectos';
    $('archivosLigasCard').hidden = !conLigas;
    return { conLigas };
}
function subtitulo(s, p) {
    if (s.seccion === 'proyecto') return !p ? '' : bibliotecaLista() ? `${CONFIG.bibliotecaProyectos}/${p.Clave}/ y sus ligas a documentos` : 'Sus ligas a documentos (la carpeta de trabajo espera a que se prepare ERP_Proyectos).';
    if (s.seccion === 'recientes') return 'Lo que abriste o subiste en este equipo.';
    if (s.seccion === 'fijados') return estadoGuardados().modo === 'local' ? 'Fijados en este equipo (todavía no existe ERP_Vistas).' : 'Lo que fijaste; viaja entre tus equipos.';
    if (s.seccion === 'bibliotecas') return s.unidad ? 'Solo lectura: abrir, ver y ligar a un proyecto.' : 'Las bibliotecas de unidad con permiso de la app (solo lectura).';
    if (s.seccion === 'mias') return 'La cola de este equipo, lo que subiste y lo que mandaste a archivar.';
    return 'La carpeta de trabajo de cada proyecto y, abajo, las ligas a documentos de todos los frentes.';
}
const irA = h => irAHash(h);

/** «Por proyecto»: una fila por proyecto activo con «N archivos · M sin archivar» que abre su carpeta. */
function pintarPorProyecto(cont) {
    if (B.estado === null || B.estado === 'buscando') { cont.appendChild(el('p', 'vacio', 'Revisando las carpetas…')); asegurarBiblioteca().then(() => alCambiar()); return; }
    if (!bibliotecaLista()) { cont.appendChild(tarjetaFalta()); return; }
    const card = el('section', 'rp-card arch-proyectos'); const cab = el('div', 'rp-dh'); cab.appendChild(el('h3', '', 'Carpetas de los proyectos')); card.appendChild(cab);
    const ps = ordenarProyectos(activos());
    if (!ps.length) card.appendChild(el('p', 'vacio', 'Ningún proyecto activo.'));
    const l = el('div', 'arch-filas'); l.setAttribute('role', 'list');
    let faltan = [];
    for (const p of ps) {
        const c = carpetas.get(p.Clave);   // se relee si no es de ESTA carga (el refresco o «Actualizar»): antes se quedaba con la de la primera visita
        if (!(c && c.cargadoEl === estado.cargadoEl) && !leyendo(p.Clave) && enLinea() && bibliotecaLista()) faltan.push(p.Clave);
        const items = archivosDe(p.Clave), sin = sinArchivar(items).length, nCola = cola.filter(r => r.clave === p.Clave && r.estado !== 'subido').length;
        const b = el('button', 'arch-fila'); b.type = 'button'; b.dataset.ir = rutaSeccion('proyecto', { clave: p.Clave }); b.setAttribute('role', 'listitem');
        b.appendChild(iconoEquipo(equipoDe(p), 'sm')); b.appendChild(iconoSvg(TRAZOS.folder, 'carp'));
        const t = el('span', 'tx'); t.appendChild(el('b', '', p.Title)); t.appendChild(el('small', '', carpetaLeida(p.Clave) ? `${items.length} ${plural(items.length, 'archivo')}${nCola ? ` · ${nCola} en la cola` : ''}` : 'leyendo…')); b.appendChild(t);
        const s = el('span', 'arch-sin' + (sin ? ' is-pend' : ''), carpetaLeida(p.Clave) ? `${sin} sin archivar` : ''); s.dataset.sinArchivar = String(sin); b.appendChild(s);
        b.appendChild(iconoSvg(TRAZOS.chevr, 'flecha'));
        b.addEventListener('click', () => irA(b.dataset.ir));
        l.appendChild(b);
    }
    card.appendChild(l); cont.appendChild(card);
    if (faltan.length) Promise.all(faltan.map(k => cargarCarpeta(k))).then(rs => { if (rs.some(Boolean)) alCambiar(); });
}
/** Las ligas del proyecto (archivado · en el buzón · enlace) bajo su carpeta, en #archivos/proyecto/<clave>: el árbol de Documentos, abierto. */
function ligasDelProyecto(p) {
    const card = el('section', 'rp-card arch-ligas'); const cab = el('div', 'rp-dh'); cab.appendChild(el('h3', '', 'Ligas a documentos'));
    const ir = boton('Documentos del proyecto', 'mn-btn is-ghost is-sm', () => irA(`#p/${p.Clave}/docs`), { ir: `#p/${p.Clave}/docs` }); cab.appendChild(ir); card.appendChild(cab);
    const ligas = ordenarDocs(estado.ligas.filter(l => Number(l.ProyectoId) === p.id), estado.ordenArchivos);
    if (!ligas.length) { card.appendChild(el('p', 'vacio', 'Sin ligas: se ligan desde una tarjeta (Ligar o Enlace).')); return card; }
    const w = el('div', 'docs'); const lista = el('div', 'lista'); w.appendChild(lista);
    const tabla = tablaDocs({ sinTarjeta: true }); tabla.classList.add('is-arbol'); const tb = tabla.querySelector('tbody');
    tb.appendChild(filaRaiz(p.Title, ligas.length, ligas.length, { sinTarjeta: true }));
    filasDeExpediente(tb, p, ligas, { plegada: () => false, alPlegar: () => {}, sinTarjeta: true, doc: () => ({ p, enArchivos: true, alTarjeta: id => irA(`#p/${p.Clave}/t/${id}`) }) });
    lista.appendChild(tabla); card.appendChild(w);
    return card;
}

/** Una tabla sencilla de entradas (Recientes, Fijados): icono · nombre (abre) · dónde · cuándo · acciones. */
function tablaEntradas(filas, vacio) {
    if (!filas.length) return el('p', 'vacio', vacio);
    const l = el('div', 'arch-filas'); l.setAttribute('role', 'list');
    for (const f of filas) {
        const d = el('div', 'arch-fila is-estatica'); d.setAttribute('role', 'listitem'); if (f.llave) d.dataset.entrada = f.llave;
        d.appendChild(iconoArchivo(f.nombre, null, 'sm'));
        const t = el('span', 'tx'); const href = hrefSeguro(f.url, { tipo: 'archivado', host: host() });
        if (href) { const a = el('a', '', f.nombre); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; if (f.alAbrir) a.addEventListener('click', f.alAbrir); t.appendChild(a); } else t.appendChild(el('b', '', f.nombre));
        t.appendChild(el('small', '', f.donde)); d.appendChild(t);
        const acc = el('span', 'acc'); for (const b of f.acciones || []) acc.appendChild(b); d.appendChild(acc);
        l.appendChild(d);
    }
    return l;
}
const dondeDe = x => x.origen === 'proyecto' ? (proyectoPorClave(x.clave) || {}).Title || x.clave : `${(CONFIG.bibliotecas[x.unidad] || {}).nombre || x.unidad}${x.carpeta ? ' › ' + x.carpeta : ''}`;
const rutaDe = x => x.origen === 'proyecto' ? rutaSeccion('proyecto', { clave: x.clave }) : rutaSeccion('bibliotecas', { unidad: x.unidad, ruta: String(x.carpeta || '').split('/').filter(Boolean) });
function pintarRecientes(cont) {
    const card = el('section', 'rp-card arch-recientes'); const cab = el('div', 'rp-dh'); cab.appendChild(el('h3', '', 'Recientes en este equipo')); card.appendChild(cab);
    const xs = recientes().filter(x => x.origen === 'proyecto' || x.origen === 'biblioteca');
    card.appendChild(tablaEntradas(xs.map(x => ({ llave: x.llave, nombre: x.nombre, url: x.url, donde: `${dondeDe(x)} · ${haceCuanto(x.cuando)}`,
        alAbrir: () => anotarReciente({ ...x }), acciones: [boton('Ir a la carpeta', 'mn-btn is-ghost is-sm', () => irA(rutaDe(x)), { reciente: x.llave })] })), 'Aquí aparecen los archivos que abras, previsualices o subas en este equipo.'));
    cont.appendChild(card);
}
function pintarFijados(cont) {
    const card = el('section', 'rp-card arch-fijados'); const cab = el('div', 'rp-dh'); cab.appendChild(el('h3', '', 'Fijados')); card.appendChild(cab);
    const g = estadoGuardados();
    if (g.modo === null) { card.appendChild(el('p', 'vacio', 'Leyendo…')); cont.appendChild(card); return; }
    const xs = fijados();
    card.appendChild(tablaEntradas(xs.map(v => { const d = v.definicion; return { llave: String(v.id), nombre: d.nombre, url: d.url, donde: dondeDe(d),
        acciones: [boton('Ir a la carpeta', 'mn-btn is-ghost is-sm', () => irA(rutaDe(d)), { fijado: 'ir' }), ...(esMia(v) ? [boton('Quitar', 'mn-btn is-ghost is-sm', () => alternarFijado(d), { fijado: 'quitar' })] : [])] }; }),
        'Fija un archivo desde su menú «⋯» para tenerlo a la mano aquí.'));
    if (g.modo === 'local') { const n = el('p', 'mn-help arch-nota', 'Fijados en este equipo.'); n.title = g.nota; card.appendChild(n); }
    cont.appendChild(card);
}

// ---------------------------------------------------------------- Bibliotecas (solo leer + ligar)

const permisos = { promesa: null, lista: null };   // las bibliotecas de unidad que contestan 200
function bibliotecasConPermiso() {
    if (!permisos.promesa) permisos.promesa = Promise.all(Object.entries(CONFIG.bibliotecas).map(async ([clave, b]) => {
        try { const s = await sitioDe({ clave, ...b }); return s.id ? { clave, ...b, siteId: s.id } : null; } catch (_) { return null; }
    })).then(xs => { permisos.lista = xs.filter(Boolean); return permisos.lista; });
    return permisos.promesa;
}
const listados = new Map();   // `${unidad}|${ruta}` -> { promesa, items, error, cargadoEl }
function listarUnidad(b, ruta) {
    const k = `${b.clave}|${ruta.join('/')}`; let r = listados.get(k);
    if (r && (r.promesa || r.cargadoEl === estado.cargadoEl)) return r;
    if (!enLinea() && r) return r;
    r = r || { items: [], error: null, cargadoEl: 0, promesa: null, existe: true }; listados.set(k, r);
    const carga = estado.cargadoEl;
    r.promesa = estado.cliente.hijos(baseSitio(b.siteId), ruta.join('/'), {})
        .then(xs => { r.existe = xs !== null; r.items = (xs || []).filter(it => !(ruta.length === 0 && it.name === CONFIG.buzon)).map(it => ({ id: String(it.id), nombre: String(it.name || ''), carpeta: !!it.folder, n: it.folder ? Number(it.folder.childCount) || 0 : 0, tamano: Number(it.size) || 0, url: it.webUrl || '', modificado: it.lastModifiedDateTime || '' }))
            .sort((a, c) => (c.carpeta - a.carpeta) || a.nombre.localeCompare(c.nombre, 'es')); r.error = null; })
        .catch(e => { r.error = motivoDe(e); })
        .finally(() => { r.cargadoEl = carga; r.promesa = null; alCambiar(); });
    return r;
}
function pintarBibliotecas(cont, s) {
    const card = el('section', 'rp-card arch-bibliotecas');
    if (!permisos.lista) { card.appendChild(el('p', 'vacio', 'Revisando qué bibliotecas tienen permiso…')); cont.appendChild(card); bibliotecasConPermiso().then(() => alCambiar()); return; }
    if (!s.unidad) {
        const cab = el('div', 'rp-dh'); cab.appendChild(el('h3', '', 'Bibliotecas de unidad')); card.appendChild(cab);
        if (!permisos.lista.length) card.appendChild(el('p', 'vacio', 'Ninguna biblioteca de unidad tiene todavía el permiso de la app.'));
        const l = el('div', 'arch-filas'); l.setAttribute('role', 'list');
        for (const b of permisos.lista) {
            const eq = CONFIG.equipos.find(e => e.unidad === b.clave);
            const x = el('button', 'arch-fila'); x.type = 'button'; x.dataset.biblioteca = b.clave; x.dataset.ir = rutaSeccion('bibliotecas', { unidad: b.clave }); x.setAttribute('role', 'listitem');
            if (eq) x.appendChild(iconoEquipo(eq, 'sm')); x.appendChild(iconoSvg(TRAZOS.folder, 'carp'));
            const t = el('span', 'tx'); t.appendChild(el('b', '', b.nombre)); t.appendChild(el('small', '', 'solo lectura · ligar a un proyecto')); x.appendChild(t);
            x.appendChild(iconoSvg(TRAZOS.chevr, 'flecha')); x.addEventListener('click', () => irA(x.dataset.ir));
            l.appendChild(x);
        }
        card.appendChild(l); cont.appendChild(card); return;
    }
    const b = permisos.lista.find(x => x.clave === s.unidad);
    if (!b) { card.appendChild(el('p', 'vacio', 'Esa biblioteca no tiene el permiso de la app (o no existe).')); cont.appendChild(card); return; }
    const migas = el('nav', 'arch-migas'); migas.setAttribute('aria-label', 'Carpeta');
    const miga = (texto, ruta) => { const m = boton(texto, 'miga', () => irA(ruta), { ir: ruta }); migas.appendChild(m); };
    miga('Bibliotecas', rutaSeccion('bibliotecas')); migas.appendChild(el('span', 'sep', '›'));
    miga(b.nombre, rutaSeccion('bibliotecas', { unidad: b.clave }));
    s.ruta.forEach((seg, i) => { migas.appendChild(el('span', 'sep', '›')); miga(seg, rutaSeccion('bibliotecas', { unidad: b.clave, ruta: s.ruta.slice(0, i + 1) })); });
    card.appendChild(migas);
    const r = listarUnidad(b, s.ruta);
    if (r.promesa && !r.cargadoEl) { card.appendChild(el('p', 'vacio', 'Leyendo la carpeta…')); cont.appendChild(card); return; }
    if (r.error) card.appendChild(el('p', 'arch-error', `No se pudo leer la carpeta: ${r.error}`));
    else if (!r.existe) card.appendChild(el('p', 'vacio', 'Esa carpeta ya no existe.'));
    else if (!r.items.length) card.appendChild(el('p', 'vacio', 'Carpeta vacía.'));
    const l = el('div', 'arch-filas'); l.setAttribute('role', 'list');
    for (const it of r.items) {
        if (it.carpeta) {
            const x = el('button', 'arch-fila'); x.type = 'button'; x.dataset.ir = rutaSeccion('bibliotecas', { unidad: b.clave, ruta: [...s.ruta, it.nombre] }); x.setAttribute('role', 'listitem');
            x.appendChild(iconoSvg(TRAZOS.folder, 'carp')); const t = el('span', 'tx'); t.appendChild(el('b', '', it.nombre)); t.appendChild(el('small', '', `${it.n} ${plural(it.n, 'elemento')}`)); x.appendChild(t);
            x.appendChild(iconoSvg(TRAZOS.chevr, 'flecha')); x.addEventListener('click', () => irA(x.dataset.ir)); l.appendChild(x); continue;
        }
        const d = el('div', 'arch-fila is-estatica'); d.dataset.itemBiblioteca = it.id; d.setAttribute('role', 'listitem');
        d.appendChild(iconoArchivo(it.nombre, null, 'sm'));
        const carpeta = s.ruta.join('/'), reciente = { llave: `b:${b.clave}:${it.id}`, origen: 'biblioteca', unidad: b.clave, carpeta, nombre: it.nombre, itemId: it.id, url: it.url };
        const t = el('span', 'tx'); const href = hrefSeguro(it.url, { tipo: 'archivado', host: host() });
        const deOffice = !!appOffice(it.nombre), vista = () => abrirVistaPrevia({ base: baseSitio(b.siteId), itemId: it.id, nombre: it.nombre, url: it.url, reciente });
        if (href) t.appendChild(ligaNombre(it.nombre, { href, reciente, alVista: vista, alOffice: deOffice ? () => abrirOfficeDeUnidad(b, [...s.ruta, it.nombre], it.nombre, reciente) : null }));
        else t.appendChild(el('b', '', it.nombre));
        t.appendChild(el('small', '', `${it.modificado ? fechaDia(it.modificado) + ' · ' : ''}${tamanoLegible(it.tamano)}`)); d.appendChild(t);
        // la liga de escritorio se arma con la ruta del drive (su webUrl no es la del archivo para Office: Doc.aspx). v1.0.1: Office sin «Vista previa»
        const acc = deOffice ? [accionBoton(`Abrir en ${nombreAppOffice(appOffice(it.nombre))}`, 'office', () => abrirOfficeDeUnidad(b, [...s.ruta, it.nombre], it.nombre, reciente))] : [accionBoton('Vista previa', 'vista', vista)];
        if (href) acc.push(accionLiga(deOffice ? 'Abrir en el navegador' : 'Abrir', 'abrir', href, () => anotarReciente(reciente)));
        if (href) acc.push(accionBoton('Copiar liga', 'copiar', () => copiarLiga(href)));
        if (PUEDE.tarea(estado.rol)) acc.push(accionBoton(fijadoDe(it.id) ? 'Quitar de Fijados' : 'Fijar', 'fijar', () => alternarFijado({ tipo: 'fijado', origen: 'biblioteca', unidad: b.clave, carpeta, itemId: it.id, nombre: it.nombre, url: href || '' })));
        if (PUEDE.ligar(estado.rol)) acc.push(accionBoton('Ligar a un proyecto…', 'ligar', () => abrirLigarA(b, { id: it.id, nombre: it.nombre, ruta: [...s.ruta, it.nombre].join('/'), url: it.url })));
        const m = el('span', 'acc'); m.appendChild(menuDe(it.id, acc)); d.appendChild(m);
        l.appendChild(d);
    }
    card.appendChild(l); cont.appendChild(card);
}
/** «Abrir en Word» de un archivo de una biblioteca de unidad: la ruta directa sale del webUrl de su drive + la carpeta + el nombre. */
async function abrirOfficeDeUnidad(b, partes, nombre, reciente) {
    try {
        const d = await driveUnidad(b, b.siteId);
        const u = uriOffice(nombre, `${String(d.url).replace(/\/+$/, '')}/${partes.map(encodeURIComponent).join('/')}`, host());
        if (!u) { avisar('No se pudo armar la liga de escritorio de ese archivo.', 'error'); return; }
        anotarReciente(reciente); window.location.href = u;
    } catch (e) { avisar('No se pudo abrir en la app de escritorio: ' + motivoDe(e), 'error'); }
}
let ligarA = null;   // { b, item }
function abrirLigarA(b, item) {
    const ps = ordenarProyectos(activos()).filter(p => { const bb = bibliotecaDe(p); return bb && bb.clave === b.clave && puedeLigarEn(p); });
    if (!ps.length) { avisar(`Ningún proyecto activo de ${b.nombre} admite ligas.`, 'ojo'); return; }
    ligarA = { b, item };
    $('laArchivo').textContent = `«${item.nombre}» de ${b.nombre}.`;
    opciones($('laProyecto'), ps, p => p.id, p => p.Title, null);
    const tarjetas = () => { const p = porId(estado.proyectos, $('laProyecto').value); opciones($('laTarea'), p ? tareasDe(p, estado.tareas) : [], t => t.id, t => t.Title.slice(0, 70), 'el proyecto entero'); };
    $('laProyecto').onchange = tarjetas; tarjetas();
    abrirDialogo('dlgLigarA');
}
async function guardarLigarA(ev) {
    ev.preventDefault();
    const x = ligarA; const p = porId(estado.proyectos, $('laProyecto').value); if (!x || !p) return;
    $('laGuardar').disabled = true;
    try { const it = await ligarArchivadoA(p, x.item, $('laTarea').value ? Number($('laTarea').value) : null); cerrarDialogo('dlgLigarA'); avisar(`«${it.nombre}» ligado a «${p.Title}».`, 'ok'); }
    catch (e) { avisar('No se pudo ligar: ' + motivoDe(e), 'error'); }
    finally { $('laGuardar').disabled = false; }
}

// ---------------------------------------------------------------- Mis subidas

function pintarMias(cont) {
    const card = el('section', 'rp-card arch-mias'); const cab = el('div', 'rp-dh'); cab.appendChild(el('h3', '', 'En la cola de este equipo')); card.appendChild(cab);
    // v1.0.0 (cubeta 6): la nota de iPhone es para quien SUBE; lectura no sube y no la ve (su cola siempre está vacía)
    if (PUEDE.ligar(estado.rol)) { const nota = el('p', 'mn-help arch-nota', 'En iPhone la cola solo avanza con la app abierta: si la cierras, lo pendiente sube cuando la vuelvas a abrir.'); nota.dataset.nota = 'iphone'; card.appendChild(nota); }
    if (disco === false) card.appendChild(el('p', 'arch-error', 'Este navegador no guarda la cola en el equipo: no cierres la app hasta que termine de subir.'));
    const vivas = cola.filter(r => r.estado !== 'subido');
    if (!vivas.length) card.appendChild(el('p', 'vacio', 'Nada en la cola.'));
    else { const l = el('div', 'arch-cola'); l.setAttribute('role', 'list'); for (const r of vivas) l.appendChild(filaCola(r, { conProyecto: true })); card.appendChild(l); }
    cont.appendChild(card);
    const h = historial();
    const sub = h.filter(x => x.tipo === 'subida'), arch = h.filter(x => x.tipo === 'archivar');
    const c2 = el('section', 'rp-card arch-subidas'); const cab2 = el('div', 'rp-dh'); cab2.appendChild(el('h3', '', 'Subidas recientes')); c2.appendChild(cab2);
    c2.appendChild(tablaEntradas(sub.map(x => ({ llave: x.llave, nombre: x.nombre, url: x.url, donde: `${x.titulo || x.clave} · ${haceCuanto(x.cuando)}`, acciones: [boton('Ir a la carpeta', 'mn-btn is-ghost is-sm', () => irA(rutaSeccion('proyecto', { clave: x.clave })), { reciente: x.llave })] })), 'Todavía no subes nada desde este equipo.'));
    cont.appendChild(c2);
    const c3 = el('section', 'rp-card arch-enviados'); const cab3 = el('div', 'rp-dh'); cab3.appendChild(el('h3', '', 'Enviados a archivar')); c3.appendChild(cab3);
    if (!arch.length) c3.appendChild(el('p', 'vacio', 'Nada mandado a archivar desde este equipo.'));
    else {
        const l = el('div', 'arch-filas'); l.setAttribute('role', 'list');
        for (const x of arch) {
            const d = el('div', 'arch-fila is-estatica'); d.dataset.entrada = x.llave; d.setAttribute('role', 'listitem');
            d.appendChild(iconoArchivo(x.nombre, 'buzon', 'sm'));
            const t = el('span', 'tx'); t.appendChild(el('b', '', x.nombre)); t.appendChild(el('small', '', `${x.n || 1} ${plural(x.n || 1, 'archivo')} · ${x.titulo || x.clave} · ${x.unidad || ''} · ${haceCuanto(x.cuando)}`)); d.appendChild(t);
            const ya = estado.buzonExiste[x.lote] === false;
            const e = el('span', 'acc'); e.appendChild(chip(ya ? 'ya lo acomodó la skill' : 'en el buzón', ya ? 'ok' : 'info')); d.appendChild(e);
            l.appendChild(d);
        }
        c3.appendChild(l);
    }
    cont.appendChild(c3);
}

// ---------------------------------------------------------------- «Subir» desde la tarjeta, «+ Nuevo» y la pestaña Documentos

/**
 * «Subir» (la tarjeta, «+ Nuevo › Subir archivo / Foto»): con ERP_Proyectos va a la carpeta del proyecto y liga a la tarjeta (TareaId); sin
 * ella, el «Subir al buzón» de siempre (docs.js). El diálogo es el mismo.
 */
export async function abrirSubida(opts = {}) {
    if (B.estado === null || B.estado === 'buscando') await asegurarBiblioteca();   // ya sabida (lo normal), el diálogo abre en el MISMO clic
    abrirSubir({ ...opts, modo: bibliotecaLista() ? 'proyecto' : 'buzon' });
}

// ---------------------------------------------------------------- enganche

export function engancharModuloArchivos() {
    fijarSubidaProyecto(encolarDesdeDialogo);
    $('vpCerrar').addEventListener('click', () => cerrarDialogo('dlgVistaPrevia'));
    $('dlgVistaPrevia').addEventListener('close', () => { $('vpMarco').removeAttribute('src'); $('vpMarco').hidden = true; });
    $('vrCerrar').addEventListener('click', () => cerrarDialogo('dlgVersiones'));
    $('laCancelar').addEventListener('click', () => cerrarDialogo('dlgLigarA'));
    $('formLigarA').addEventListener('submit', guardarLigarA);
    // la cola avanza al volver la red (app.js además relee las listas)
    window.addEventListener('online', () => { if (estado.sesion) procesarCola(); });
}
/** En cada refresco (app.js, tras cargar las listas): la cola vuelve a intentar lo pendiente. */
export function alRefrescar() { if (estado.sesion) procesarCola(); }
