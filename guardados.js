// MINSA ERP v1.0.0 — «GUARDADOS» (rediseño 2026-10-02; plan, «Defaults del implementador»: guardados, segmentos y fijados en la lista
// ERP_Vistas — Title, Dueno, Compartida, Modulo, Definicion JSON — con respaldo en localStorage mientras la lista no exista).
//
//   - Lee ERP_Vistas (sitio Administración) UNA vez por sesión, la primera vez que alguien la necesita (una pantalla de Dinero, el panel).
//     Sin la lista (todavía no se aprovisiona: cubeta 5) o si la lectura falla, todo se guarda en ESTE equipo (localStorage, una llave por
//     cuenta) y la app lo dice en una nota discreta; ningún error a la vista.
//   - Cada vista es { id, titulo, dueno, compartida, modulo, definicion }. «Solo yo» la ve su dueño; «Equipo», todos (decisión de la
//     maqueta). La definición la escribe la app, pero la lista la puede editar cualquier Miembro: se valida al leer y al abrir (el módulo que
//     la abre la vuelve a validar) y se pinta solo como texto.
//   - Quién sabe ABRIR cada tipo de vista lo registra su módulo (registrarAbridor): Dinero abre segmentos y reportes; la cubeta 5 fijados.
// Nada de innerHTML: este módulo no pinta.

import { L, estado } from './comun.js';
import { leerRuta, puedeVerPantalla, PUEDE } from './reglas.js';
import { vistaDe } from './reporte.js';

const G = { modo: null, items: [], nota: '', cargando: null, error: null };
export const estadoGuardados = () => G;
const yo = () => String((estado.cuenta && estado.cuenta.username) || '').trim().toLowerCase();
const llaveLocal = () => `erp.vistas.${yo() || 'sin-cuenta'}`;
const MODULOS = ['inicio', 'trabajo', 'archivos', 'dinero', 'operacion'];
const motivo = e => (e && e.message ? e.message : String(e));

function leerLocal() { try { const x = JSON.parse(localStorage.getItem(llaveLocal()) || '[]'); return Array.isArray(x) ? x : []; } catch (_) { return []; } }
function escribirLocal(xs) { try { localStorage.setItem(llaveLocal(), JSON.stringify(xs)); return true; } catch (_) { return false; } }

/** Una vista leída (de la lista o de localStorage) en la forma de la app; null si no sirve. */
export function normalizarVista(r) {
    if (!r) return null;
    let def = r.Definicion ?? r.definicion;
    if (typeof def === 'string') { try { def = JSON.parse(def); } catch (_) { return null; } }
    const modulo = String(r.Modulo ?? r.modulo ?? '');
    if (!def || typeof def !== 'object' || Array.isArray(def) || !MODULOS.includes(modulo)) return null;
    const titulo = String(r.Title ?? r.titulo ?? '').trim().slice(0, 120);
    if (!titulo) return null;
    return { id: r.id, titulo, dueno: String(r.Dueno ?? r.dueno ?? '').trim().toLowerCase(), compartida: (r.Compartida ?? r.compartida) === true, modulo, definicion: def };
}

/** Lee ERP_Vistas (o el respaldo local). Nunca lanza: un error deja el modo local con su nota. */
export async function cargarGuardados() {
    const c = estado.cliente, s = estado.siteId;
    const local = () => leerLocal().map(normalizarVista).filter(Boolean);
    try {
        if (!c || !await c.existeLista(s, L.vistas)) {
            G.modo = 'local'; G.items = local();
            G.nota = `Se guardan en este equipo: todavía no existe la lista ${L.vistas} en el sitio (cuando se cree, se guardarán para todos tus equipos).`;
            return;
        }
        const rs = await c.renglones(s, L.vistas);
        G.items = rs.map(normalizarVista).filter(Boolean); G.modo = 'lista'; G.nota = ''; G.error = null;
    } catch (e) {
        G.modo = 'local'; G.items = local(); G.error = motivo(e);
        G.nota = `Se guardan en este equipo: no se pudo leer ${L.vistas} (${G.error}).`;
    }
}
/** La primera vez que se necesita, lee y avisa (repintar); después no hace nada. */
export function asegurarGuardados(alListo) {
    if (G.modo !== null || G.cargando) return G.cargando;
    G.cargando = cargarGuardados().finally(() => { G.cargando = null; if (alListo) alListo(); });
    return G.cargando;
}
/** Vuelve a leer (botón «Volver a leer» de una pantalla que los usa). */
export function releerGuardados(alListo) { G.modo = null; G.items = []; return asegurarGuardados(alListo); }

/** Las vistas que esta persona ve de un módulo: las suyas y las compartidas; `filtro(definicion)` acota (p. ej. solo segmentos). */
export function guardadosDe(modulo, filtro = null) {
    const y = yo();
    return G.items.filter(x => x.modulo === modulo && (x.compartida || !x.dueno || x.dueno === y || G.modo === 'local') && (!filtro || filtro(x.definicion)))
        .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
}
export const esMia = x => !!x && (G.modo === 'local' || x.dueno === yo());

/** Guarda una vista. En la lista, un renglón nuevo de ERP_Vistas; sin ella, en este equipo. Devuelve la vista (o lanza con el motivo). */
export async function guardarVista({ titulo, compartida = false, modulo, definicion }) {
    const t = String(titulo || '').trim().slice(0, 120);
    if (!t) throw new Error('ponle un nombre');
    if (!MODULOS.includes(modulo)) throw new Error('módulo desconocido: ' + modulo);
    if (G.modo === null) await cargarGuardados();
    if (G.modo === 'lista') {
        const r = await estado.cliente.crearRenglon(estado.siteId, L.vistas, { Title: t, Dueno: yo(), Compartida: !!compartida, Modulo: modulo, Definicion: JSON.stringify(definicion) });
        const v = normalizarVista({ ...r, Title: t, Dueno: yo(), Compartida: !!compartida, Modulo: modulo, Definicion: definicion });
        if (v && !G.items.some(x => x.id === v.id)) G.items.push(v);
        return v;
    }
    const v = { id: 'l' + Date.now() + Math.floor(Math.random() * 1000), titulo: t, dueno: yo(), compartida: false, modulo, definicion };
    const xs = leerLocal(); xs.push(v);
    if (!escribirLocal(xs)) throw new Error('este navegador no deja guardar (almacenamiento bloqueado)');
    G.items.push(v);
    return v;
}
/** Borra una vista PROPIA (en la lista, su renglón; en local, de este equipo). */
export async function borrarVista(v) {
    if (!esMia(v)) throw new Error('solo quien la guardó la puede quitar');
    if (G.modo === 'lista' && typeof v.id === 'number') await estado.cliente.borrarRenglon(estado.siteId, L.vistas, v.id);
    else escribirLocal(leerLocal().filter(x => x.id !== v.id));
    G.items = G.items.filter(x => x.id !== v.id);
}

// ---------------------------------------------------------------- quién abre cada tipo de vista

const abridores = {};
const extras = {};
let irA = () => {};
/** app.js pasa su navegación: irA(pantalla, sufijo). */
export function fijarNavGuardados(fn) { irA = fn; }
/** Un módulo declara cómo se abre su tipo de vista (definicion.tipo): Dinero registra 'segmento'; 'reporte' es de aquí (abajo). */
export function registrarAbridor(tipo, fn) { abridores[tipo] = fn; }
/** Lo que una pantalla restaura de una vista 'reporte' además de ruta y estado (Dinero: sus segmentos). */
export function registrarExtra(pantalla, fn) { extras[pantalla] = fn; }
/** ¿Esta persona puede abrir la vista? Un segmento es de Dinero (gerencia); un reporte, de la pantalla de su ruta. */
export function puedeAbrir(v) {
    const d = v && v.definicion; if (!d) return false;
    if (d.tipo === 'segmento') return PUEDE.capital(estado.rol);
    if (d.tipo === 'reporte') { const r = leerRuta(String(d.ruta || '')); return !!r && puedeVerPantalla(r.pantalla, estado.rol); }
    return !!abridores[d.tipo];
}
/** Abre una vista guardada (el panel «Guardados», el popover de segmentos). false si nadie sabe abrirla o la persona no puede. */
export function abrirGuardado(v) { const f = v && v.definicion && abridores[v.definicion.tipo]; if (!f || !puedeAbrir(v)) return false; f(v); return true; }
const GRANOS_OK = ['mes', 'trim', 'anio'], RANGOS_OK = ['1a', '2a', 'todo'];
/** Una vista de REPORTE: la ruta (solo rutas de la app: leerRuta), el estado de la vista (moneda, rango, periodo, tipo) y lo propio de la pantalla. */
registrarAbridor('reporte', v => {
    const d = v.definicion, r = leerRuta(String(d.ruta || ''));
    if (!r) return;
    if (typeof d.vistaId === 'string' && d.vista && typeof d.vista === 'object') {
        const w = vistaDe(d.vistaId), s = d.vista;
        if (s.moneda === 'USD' || s.moneda === 'MXN') w.moneda = s.moneda;
        if (RANGOS_OK.includes(s.rango)) w.rango = s.rango;
        if (GRANOS_OK.includes(s.grano)) w.grano = s.grano;
        if (s.tipo === 'line' || s.tipo === 'bar') w.tipo = s.tipo;
    }
    if (extras[r.pantalla]) extras[r.pantalla](d);
    irA(r.pantalla, r.sub);
});
/** El icono con que el panel pinta una vista (por su tipo). */
export const iconoDe = v => { const t = v && v.definicion && v.definicion.tipo; return t === 'segmento' ? 'filtro' : t === 'fijado' ? 'clip' : 'rep'; };   // v1.0.0 (cubeta 5): un archivo fijado lleva el clip
