// MINSA ERP v1.0.0 — la COLA DE SUBIDAS en el disco del equipo (rediseño 2026-10-02, cubeta 5; plan «Cola sin señal (IndexedDB, llave por
// cuenta)»). Una foto tomada sin señal no se pierde: queda aquí, con sus bytes, hasta que la app la sube (al abrir, al volver la red y en
// cada refresco). archivos.js lleva la cola EN MEMORIA (lo que pinta y procesa) y escribe aquí detrás de cada cambio, sin esperar: el disco
// es el respaldo de la siguiente sesión, no el camino de la subida. Sin IndexedDB (navegador viejo, modo privado que lo bloquea) todo sigue
// en memoria y Mis subidas lo dice.
//
// Cada registro: { llave: '<cuenta>|<id>', cuenta, id, proyectoId, clave, tareaId, nombre, tipo, tamano, archivo (File/Blob), estado, motivo,
// creado, cambio, reemplazar, renombrar, foto }. Una cuenta solo lee lo suyo (rango de llaves por prefijo); los bytes nunca salen a Graph
// por otro camino que la subida.

const NOMBRE_DB = 'minsa-erp', VERSION_DB = 1, ALMACEN = 'subidas';
let abierta = null;

function abrir() {
    if (abierta) return abierta;
    abierta = new Promise(res => {
        try {
            if (typeof indexedDB === 'undefined' || !indexedDB) { res(null); return; }
            const r = indexedDB.open(NOMBRE_DB, VERSION_DB);
            r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: 'llave' }); };
            r.onsuccess = () => res(r.result);
            r.onerror = () => res(null);
            r.onblocked = () => res(null);
        } catch (_) { res(null); }
    });
    return abierta;
}
const prefijo = cuenta => String(cuenta || '').trim().toLowerCase() + '|';
const fin = req => new Promise(res => { req.onsuccess = () => res(req.result); req.onerror = () => res(undefined); });

/** ¿Hay disco? (false: la cola vive solo mientras la app esté abierta). */
export async function hayDisco() { return !!(await abrir()); }

/** Lo que la cuenta dejó en la cola de este equipo (lo de otra cuenta no se lee). */
export async function leerCola(cuenta) {
    const db = await abrir(); if (!db) return [];
    try {
        const p = prefijo(cuenta);
        const tx = db.transaction(ALMACEN, 'readonly');
        const xs = await fin(tx.objectStore(ALMACEN).getAll(IDBKeyRange.bound(p, p + '￿')));
        return Array.isArray(xs) ? xs : [];
    } catch (_) { return []; }
}
/** Guarda (o reemplaza) un registro. Devuelve la promesa por si alguien quiere esperarla; la app no la espera. */
export async function guardarEnCola(reg) {
    const db = await abrir(); if (!db || !reg || !reg.llave) return false;
    try { const tx = db.transaction(ALMACEN, 'readwrite'); tx.objectStore(ALMACEN).put(reg); return await new Promise(res => { tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(false); }); }
    catch (_) { return false; }
}
/** Quita un registro por su llave. */
export async function quitarDeCola(llave) {
    const db = await abrir(); if (!db) return false;
    try { const tx = db.transaction(ALMACEN, 'readwrite'); tx.objectStore(ALMACEN).delete(llave); return await new Promise(res => { tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(false); }); }
    catch (_) { return false; }
}
/** La llave de un registro: cuenta en minúsculas + id. */
export const llaveDe = (cuenta, id) => prefijo(cuenta) + id;
