// MINSA ERP v1.0.0 — la COLA DE SUBIDAS en el disco del equipo (rediseño 2026-10-02, cubeta 5; plan «Cola sin señal (IndexedDB, llave por
// cuenta)»). Una foto tomada sin señal no se pierde: queda aquí, con sus bytes, hasta que la app la sube (al abrir, al volver la red y en
// cada refresco). archivos.js lleva la cola EN MEMORIA (lo que pinta y procesa) y escribe aquí detrás de cada cambio: el disco es el respaldo
// de la siguiente sesión, no el camino de la subida. Sin IndexedDB (navegador viejo, modo privado que lo bloquea) todo sigue en memoria y
// Mis subidas lo dice.
//
// v1.0.0 (vuelta 1 de correcciones, revisión de código «fondo»): dos almacenes. `subidas` guarda los DATOS de cada registro { llave: '<cuenta>|<id>',
// cuenta, id, proyectoId, clave, tareaId, nombre, tipo, tamano, estado, motivo, creado, cambio, reemplazar, renombrar, foto } y `bytes` guarda el
// archivo UNA vez ({ llave, archivo }): antes cada cambio de estado volvía a escribir el registro ENTERO con su Blob (un video, tres veces por
// subida). Cada escritura devuelve si guardó: quien encola mira ese true/false (antes se tiraba y la app prometía «queda en el equipo»).
// Una cuenta solo lee lo suyo (rango de llaves por prefijo); los bytes nunca salen a Graph por otro camino que la subida.

const NOMBRE_DB = 'minsa-erp', VERSION_DB = 2, ALMACEN = 'subidas', BYTES = 'bytes';
let abierta = null;

function abrir() {
    if (abierta) return abierta;
    abierta = new Promise(res => {
        try {
            if (typeof indexedDB === 'undefined' || !indexedDB) { res(null); return; }
            const r = indexedDB.open(NOMBRE_DB, VERSION_DB);
            r.onupgradeneeded = () => { const db = r.result; for (const a of [ALMACEN, BYTES]) if (!db.objectStoreNames.contains(a)) db.createObjectStore(a, { keyPath: 'llave' }); };
            r.onsuccess = () => res(r.result);
            r.onerror = () => res(null);
            r.onblocked = () => res(null);
        } catch (_) { res(null); }
    });
    return abierta;
}
const prefijo = cuenta => String(cuenta || '').trim().toLowerCase() + '|';
const fin = req => new Promise(res => { req.onsuccess = () => res(req.result); req.onerror = () => res(undefined); });
const rango = p => IDBKeyRange.bound(p, p + '￿');
async function escribir(almacen, hacer) {
    const db = await abrir(); if (!db) return false;
    try { const tx = db.transaction(almacen, 'readwrite'); hacer(tx.objectStore(almacen)); return await new Promise(res => { tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(false); }); }
    catch (_) { return false; }
}

/** ¿Hay disco? (false: la cola vive solo mientras la app esté abierta). */
export async function hayDisco() { return !!(await abrir()); }

/** Lo que la cuenta dejó en la cola de este equipo (lo de otra cuenta no se lee), con su archivo. Un registro de antes de la vuelta 1 traía el
 *  archivo adentro: se respeta. */
export async function leerCola(cuenta) {
    const db = await abrir(); if (!db) return [];
    try {
        const p = prefijo(cuenta);
        const xs = await fin(db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).getAll(rango(p)));
        let bs = []; try { bs = await fin(db.transaction(BYTES, 'readonly').objectStore(BYTES).getAll(rango(p))) || []; } catch (_) { bs = []; }
        const porLlave = new Map(bs.map(b => [b.llave, b.archivo]));
        return (Array.isArray(xs) ? xs : []).map(x => (porLlave.has(x.llave) ? { ...x, archivo: porLlave.get(x.llave) } : x));
    } catch (_) { return []; }
}
/** Guarda (o reemplaza) los DATOS de un registro, sin sus bytes. true si quedó en el disco. */
export function guardarEnCola(reg) {
    if (!reg || !reg.llave) return Promise.resolve(false);
    const { archivo, ...datos } = reg;
    return escribir(ALMACEN, s => s.put(datos));
}
/** Guarda los bytes de un registro (una sola vez, al encolar). true si quedaron en el disco. */
export function guardarBytes(llave, archivo) { return llave && archivo ? escribir(BYTES, s => s.put({ llave, archivo })) : Promise.resolve(false); }
/** ¿Sigue este registro en el disco? (otra pestaña pudo subirlo o descartarlo: se resuelve por llave al empezar cada subida). null sin disco. */
export async function existeEnCola(llave) {
    const db = await abrir(); if (!db) return null;
    try { return !!(await fin(db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(llave))); } catch (_) { return null; }
}
/** Quita un registro (datos y bytes) por su llave. */
export async function quitarDeCola(llave) {
    const a = await escribir(ALMACEN, s => s.delete(llave));
    await escribir(BYTES, s => s.delete(llave)).catch(() => false);
    return a;
}
/** La llave de un registro: cuenta en minúsculas + id. */
export const llaveDe = (cuenta, id) => prefijo(cuenta) + id;
