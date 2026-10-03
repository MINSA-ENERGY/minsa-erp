// MINSA ERP v1.0.0 — ARCHIVOS, las reglas puras (rediseño 2026-10-02, cubeta 5 «Archivos opción A»; plan
// cerebro/docs/plan-erp-rediseno-2026-10-02.md, «Contenido por módulo › Archivos»). Sin DOM ni red: lo prueba test/archivos.test.js.
//
//   · quickXorHash — el hash que SharePoint/OneDrive dan en `file.hashes.quickXorHash`; con él se sabe si un archivo YA está en la carpeta
//     aunque se llame distinto (la «disciplina» del plan: mismo tamaño + quickXorHash).
//   · cómo se sube cada tamaño — PUT de una pieza hasta 10 MiB; arriba, upload session en fragmentos de 5 MiB (múltiplo de 320 KiB).
//   · «¿ya existe?» — mismo nombre en la carpeta, mismo nombre que una liga archivada del proyecto, o mismo contenido.
//   · nombres que SharePoint acepta, la liga de Office (ms-word:ofe|u|…), la cola, los avisos, las rutas #archivos/<sección>[/…].

export const KIB_320 = 320 * 1024;
export const LIMITE_PUT = 10 * 1024 * 1024;          // ≤ 10 MiB: un PUT a /content
export const FRAGMENTO = 16 * KIB_320;               // 5 MiB = 16 × 320 KiB (Graph exige múltiplos de 320 KiB salvo el último)
export const TOPE_RECIENTES = 20;
export const TOPE_HISTORIAL = 40;

// ---------------------------------------------------------------- quickXorHash

/*
 * El algoritmo de Microsoft (QuickXorHash, C# de referencia en learn.microsoft.com «Code snippets: QuickXorHash»): un registro circular
 * de 160 bits; el byte en la posición k se XOR-ea a partir del bit (11·k) mod 160, y al final se XOR-ea la longitud (64 bits, little
 * endian) sobre los últimos 8 de los 20 bytes. Como la posición del bit solo depende de k mod 160, primero se XOR-ean los bytes de cada
 * clase k mod 160 (un acumulador por clase) y al cerrar se colocan las 160 clases: una pasada por byte, sin BigInt.
 */
export function crearQuickXor() {
    const acc = new Uint8Array(160);
    let largo = 0;
    return {
        /** Suma un trozo (Uint8Array o ArrayBuffer) en el orden en que viene en el archivo. */
        actualizar(trozo) {
            const b = trozo instanceof Uint8Array ? trozo : new Uint8Array(trozo);
            let r = largo % 160;
            for (let i = 0; i < b.length; i++) { acc[r] ^= b[i]; r++; if (r === 160) r = 0; }
            largo += b.length;
            return this;
        },
        /** Los 20 bytes del hash en base64 (como lo da Graph). */
        final() {
            const w = new Uint32Array(5);
            for (let r = 0; r < 160; r++) {
                const v = acc[r]; if (!v) continue;
                const o = (11 * r) % 160, i = o >>> 5, s = o & 31;
                w[i] = (w[i] ^ (v << s)) >>> 0;
                if (s > 24) { const j = (i + 1) % 5; w[j] = (w[j] ^ (v >>> (32 - s))) >>> 0; }
            }
            const out = new Uint8Array(20);
            for (let i = 0; i < 5; i++) for (let k = 0; k < 4; k++) out[4 * i + k] = (w[i] >>> (8 * k)) & 0xff;
            const lo = largo % 4294967296, hi = Math.floor(largo / 4294967296);
            for (let k = 0; k < 4; k++) { out[12 + k] ^= (lo >>> (8 * k)) & 0xff; out[16 + k] ^= (hi >>> (8 * k)) & 0xff; }
            let s = ''; for (const x of out) s += String.fromCharCode(x);
            return btoa(s);
        },
        get largo() { return largo; }
    };
}
/** quickXorHash de un búfer completo. */
export const quickXorHash = bytes => crearQuickXor().actualizar(bytes).final();

// ---------------------------------------------------------------- cómo se sube

/** 'put' (una pieza) hasta 10 MiB; 'sesion' (upload session por fragmentos) arriba. */
export const comoSubir = tamano => (Number(tamano) || 0) <= LIMITE_PUT ? 'put' : 'sesion';
/** Los fragmentos [inicio, fin] (inclusivos) de una upload session; cada uno de `trozo` bytes salvo el último. */
export function fragmentos(tamano, trozo = FRAGMENTO) {
    if (!(trozo > 0) || trozo % KIB_320 !== 0) throw new Error(`el fragmento (${trozo}) debe ser múltiplo de 320 KiB`);
    const n = Math.max(0, Math.floor(Number(tamano) || 0)), r = [];
    for (let a = 0; a < n; a += trozo) r.push([a, Math.min(n, a + trozo) - 1]);
    return r;
}
/** La cabecera Content-Range de un fragmento. */
export const rangoContenido = (a, b, total) => `bytes ${a}-${b}/${total}`;
/** De una respuesta 202 de la sesión ({ nextExpectedRanges: ["5242880-"] }), el siguiente byte que espera Graph; null si no dice. */
export function siguienteByte(j) {
    const r = j && Array.isArray(j.nextExpectedRanges) ? String(j.nextExpectedRanges[0] || '') : '';
    const m = /^(\d+)-/.exec(r);
    return m ? Number(m[1]) : null;
}
/** v1.0.0 (vuelta 2, revisor-entregable F6): el byte con que sigue una upload session tras mandar el tramo que acaba en `b` — el que pide
 *  SharePoint (`siguiente`, de nextExpectedRanges) AUNQUE sea anterior: hay que reenviarlo; antes se saltaba a b + 1 y quedaba un hueco. Sin
 *  dato, el que sigue al tramo. */
export const proximoByte = (b, siguiente) => (Number.isInteger(siguiente) && siguiente >= 0 ? siguiente : b + 1);
/** El estado de un monitor de copia (`status` de Graph): { listo, fallo, pct, id }. */
export function leerMonitor(j) {
    const st = String((j && j.status) || '').toLowerCase();
    return { listo: st === 'completed', fallo: st === 'failed' || st === 'deletefailed' || st === 'cancelled', pct: Number(j && j.percentageComplete) || 0, id: (j && j.resourceId) || null };
}

// ---------------------------------------------------------------- nombres

const INVALIDOS = /["*:<>?/\\|#%\u0000-\u001f]/g;
const RESERVADOS = /^(con|prn|aux|nul|com\d|lpt\d|desktop\.ini|\.lock|_vti_.*)$/i;
/**
 * El nombre con que un archivo entra a la carpeta del proyecto: los caracteres que SharePoint no acepta (" * : < > ? / \ | # % y de control)
 * pasan a «-», sin espacios ni puntos al final, sin «~$» al principio (temporal de Office), sin un nombre reservado y a lo más 200 caracteres
 * conservando la extensión. Nunca vacío: «archivo».
 */
export function nombreSubible(nombre) {
    let s = String(nombre || '').replace(/\r?\n/g, ' ').replace(INVALIDOS, '-').replace(/^~\$/, '').trim().replace(/[. ]+$/, '');
    if (!s || s === '.' || s === '..' || RESERVADOS.test(s)) s = 'archivo' + (s && s !== '.' && s !== '..' ? '-' + s.replace(/^\.+/, '') : '');
    if (s.length > 200) { const ext = extension(s); s = s.slice(0, 200 - (ext ? ext.length + 1 : 0)).replace(/[. ]+$/, '') + (ext ? '.' + ext : ''); }
    return s;
}
export function extension(nombre) { const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(nombre || '')); return m ? m[1].toLowerCase() : ''; }
const FMT_FOTO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
/** El nombre de una foto de la cámara (iPhone las llama todas «image.jpg», y dos iguales serían un «¿duplicado?» falso): AAAA-MM-DD_HHMMSS_foto.jpg, hora de México. */
export function nombreFoto(ahora = new Date(), n = 0) {
    const p = Object.fromEntries(FMT_FOTO.formatToParts(ahora).map(x => [x.type, x.value]));
    const h = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day}_${h}${p.minute}${p.second}_foto${n ? '-' + (n + 1) : ''}.jpg`;
}
/** Bytes legibles: 820 B · 12 KB · 3.4 MB. */
export function tamanoLegible(b) {
    const n = Number(b) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
    return `${(n / 1073741824).toFixed(1)} GB`;
}
/** Lado mayor de una foto ya reducida (2048 como la app de captura): { ancho, alto } enteros, sin agrandar nunca. */
export function escalaFoto(ancho, alto, lado = 2048) {
    const a = Math.max(0, Number(ancho) || 0), h = Math.max(0, Number(alto) || 0);
    const e = Math.min(1, lado / Math.max(a, h, 1));
    return { ancho: Math.round(a * e), alto: Math.round(h * e) };
}

// ---------------------------------------------------------------- «¿ya existe?» (la disciplina del plan)

const base = r => String(r || '').replace(/\\/g, '/').split('/').pop().trim().toLowerCase();
/** ¿Hace falta calcular el hash local? Solo si en la carpeta hay otro archivo del MISMO tamaño que traiga su quickXorHash. */
export const necesitaHash = (tamano, existentes) => (existentes || []).some(e => Number(e.tamano) === Number(tamano) && !!e.hash);
/**
 * ¿Es un posible duplicado? `local` = { nombre, tamano, hash? }; `existentes` = los archivos de la carpeta del proyecto ({ nombre, tamano,
 * hash }); `ligas` = las ligas del proyecto (PROY_Ligas). Devuelve null o { motivo: 'nombre' | 'archivado' | 'contenido', de, texto }.
 * El orden importa: el nombre es lo más directo (y la subida lo reemplaza como versión nueva); luego una liga archivada con ese nombre;
 * luego el contenido idéntico con otro nombre.
 */
export function buscarDuplicado(local, existentes = [], ligas = []) {
    const n = String(local && local.nombre || '').trim().toLowerCase(); if (!n) return null;
    const mismo = (existentes || []).find(e => String(e.nombre || '').trim().toLowerCase() === n);
    if (mismo) return { motivo: 'nombre', de: mismo.nombre, texto: `ya hay un «${mismo.nombre}» en la carpeta del proyecto` };
    const lg = (ligas || []).find(l => l && l.Tipo === 'archivado' && (base(l.Ruta) === n || String(l.Title || '').trim().toLowerCase() === n));
    if (lg) return { motivo: 'archivado', de: lg.Title, texto: `«${lg.Title}» ya está archivado y ligado a este proyecto` };
    if (local.hash) {
        const igual = (existentes || []).find(e => Number(e.tamano) === Number(local.tamano) && e.hash && e.hash === local.hash);
        if (igual) return { motivo: 'contenido', de: igual.nombre, texto: `es el mismo contenido que «${igual.nombre}»` };
    }
    return null;
}

// ---------------------------------------------------------------- un archivo de Graph, en la forma de la app

/**
 * Un driveItem de ERP_Proyectos (children con `$expand=listItem($expand=fields)`) → { id, nombre, tamano, hash, url, urlDirecta, modificado,
 * creadoPor, modificadoPor, tareaId, enviado, lote, mime, clave }. Las carpetas devuelven null. `urlDirecta` es la del listItem (la ruta de
 * la biblioteca, la que entiende ms-word:ofe); `url` el webUrl de Graph.
 */
export function archivoDeGraph(it, clave = '') {
    if (!it || !it.file) return null;
    const f = (it.listItem && it.listItem.fields) || {};
    const quien = u => (u && u.user && (u.user.email || u.user.displayName)) || '';
    const tarea = Number(f.TareaId);
    return {
        id: String(it.id), nombre: String(it.name || ''), tamano: Number(it.size) || 0,
        hash: (it.file.hashes && it.file.hashes.quickXorHash) || null, mime: it.file.mimeType || '',
        url: it.webUrl || '', urlDirecta: (it.listItem && it.listItem.webUrl) || '',
        modificado: it.lastModifiedDateTime || '', creado: it.createdDateTime || '',
        creadoPor: String(quien(it.createdBy)).toLowerCase(), modificadoPor: String((it.lastModifiedBy && it.lastModifiedBy.user && it.lastModifiedBy.user.displayName) || quien(it.lastModifiedBy)),
        tareaId: Number.isFinite(tarea) && tarea > 0 ? tarea : null,
        enviado: f.EnviadoArchivar === true || f.EnviadoArchivar === 'true' || f.EnviadoArchivar === 1,
        lote: f.Lote ? String(f.Lote) : '', clave: String(f.ProyectoClave || clave || '')
    };
}
/** Los que faltan por mandar a archivar. */
export const sinArchivar = archivos => (archivos || []).filter(a => a && !a.enviado);

// ---------------------------------------------------------------- Office

const OFFICE = [['ms-word', ['doc', 'docx', 'docm', 'dot', 'dotx', 'dotm']], ['ms-excel', ['xls', 'xlsx', 'xlsm', 'xlsb', 'xltx', 'xltm']], ['ms-powerpoint', ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'potx']]];
const NOMBRE_APP = { 'ms-word': 'Word', 'ms-excel': 'Excel', 'ms-powerpoint': 'PowerPoint' };
/** 'ms-word' | 'ms-excel' | 'ms-powerpoint' | null, por la extensión. */
export function appOffice(nombre) { const e = extension(nombre); const x = OFFICE.find(([, exts]) => exts.includes(e)); return x ? x[0] : null; }
export const nombreAppOffice = app => NOMBRE_APP[app] || '';
/** La liga que abre el archivo en la app de escritorio (esquema de URI de Office, «ofe|u|»): solo https y solo el host del tenant; si no, null. */
export function uriOffice(nombre, url, host) {
    const app = appOffice(nombre); if (!app) return null;
    let u; try { u = new URL(String(url || '')); } catch (_) { return null; }
    if (u.protocol !== 'https:' || !host || u.hostname.toLowerCase() !== String(host).toLowerCase()) return null;
    return `${app}:ofe|u|${u.href}`;
}
/** La URL de una vista previa (`getUrl` de POST …/preview) se mete a un <iframe> solo si es https y del host del tenant (la CSP frame-src dice lo mismo). */
export function urlVistaPrevia(url, host) {
    let u; try { u = new URL(String(url || '')); } catch (_) { return null; }
    return u.protocol === 'https:' && host && u.hostname.toLowerCase() === String(host).toLowerCase() ? u.href : null;
}

// ---------------------------------------------------------------- la cola

export const ESTADOS_COLA = ['pendiente', 'subiendo', 'retenido', 'error', 'subido'];
/** Cuántas hay en cada estado (lo que sigue vivo: todo menos «subido»). */
export function resumenCola(items) {
    const r = { pendiente: 0, subiendo: 0, retenido: 0, error: 0, subido: 0 };
    for (const x of items || []) if (r[x.estado] !== undefined) r[x.estado]++;
    return { ...r, vivas: r.pendiente + r.subiendo + r.retenido + r.error };
}
/** Las de la cola que «Salir» debe nombrar: las que no han subido (incluidas las retenidas y las con error). */
export const pendientesAlSalir = items => (items || []).filter(x => x && x.estado !== 'subido').length;
/** Lo que la cola le suma a la campana (armazon.js registrarFuenteAvisos): una con error y un «¿duplicado?» retenido. */
export function avisosDeCola(items) {
    const r = [];
    for (const x of items || []) {
        if (x.estado === 'error') r.push({ tipo: 'subida', cuando: x.cambio || x.creado, cls: 'danger', texto: `«${x.nombre}» no se subió`, sub: `${x.motivo || 'falló la subida'} · Mis subidas`, ir: '#archivos/mias' });
        else if (x.estado === 'retenido') r.push({ tipo: 'duplicado', cuando: x.cambio || x.creado, cls: 'warn', texto: `¿«${x.nombre}» duplicado?`, sub: `Se retuvo: ${x.motivo || 'ya existe'} · Mis subidas`, ir: '#archivos/mias' });
    }
    return r;
}
/** Lo que se recuerda por dispositivo (Recientes, Mis subidas): el más nuevo primero, sin repetir la llave y con tope. */
export function agregarAlFrente(lista, item, tope, llave = x => x.llave) {
    const k = llave(item);
    return [item, ...(Array.isArray(lista) ? lista : []).filter(x => x && llave(x) !== k)].slice(0, tope);
}

// ---------------------------------------------------------------- #archivos/<sección>[/…]

/** Lee el sufijo de #archivos (estado.sub): { seccion, clave, unidad, ruta[] }. Sin sufijo, «Por proyecto». Cada segmento va con encodeURIComponent. */
export function leerSeccion(sub) {
    const dec = s => { try { return decodeURIComponent(s); } catch (_) { return s; } };
    const p = String(sub || '').split('/').filter(Boolean);
    const r = { seccion: 'proyectos', clave: null, unidad: null, ruta: [] };
    if (!p.length) return r;
    if (p[0] === 'proyecto') { if (p[1] && /^[a-z0-9-]+$/.test(p[1])) { r.seccion = 'proyecto'; r.clave = p[1]; } return r; }
    if (p[0] === 'bibliotecas') { r.seccion = 'bibliotecas'; if (p[1]) { r.unidad = dec(p[1]); r.ruta = p.slice(2).map(dec).filter(x => x !== '.' && x !== '..'); } return r; }
    if (['recientes', 'fijados', 'mias'].includes(p[0])) r.seccion = p[0];
    return r;
}
/** La ruta de una sección: rutaSeccion('bibliotecas', { unidad: 'CALYTEK', ruta: ['02_Planta', 'Equipos (2026)'] }) → #archivos/bibliotecas/CALYTEK/02_Planta/Equipos%20(2026). */
export function rutaSeccion(seccion, { clave = null, unidad = null, ruta = [] } = {}) {
    if (!seccion || seccion === 'proyectos') return '#archivos';
    if (seccion === 'proyecto') return clave ? `#archivos/proyecto/${clave}` : '#archivos';
    if (seccion === 'bibliotecas') return ['#archivos/bibliotecas', ...(unidad ? [unidad, ...ruta] : []).map(encodeURIComponent)].join('/');
    return '#archivos/' + seccion;
}

// ---------------------------------------------------------------- un «fijado» (ERP_Vistas, Modulo = archivos)

/** La definición de un archivo fijado la puede editar cualquier Miembro: se valida antes de usarla. */
export function validarFijado(d, { host, unidades = [] } = {}) {
    if (!d || typeof d !== 'object' || d.tipo !== 'fijado') return false;
    if (!/^[A-Za-z0-9!_-]{1,200}$/.test(String(d.itemId || ''))) return false;
    if (typeof d.nombre !== 'string' || !d.nombre.trim() || d.nombre.length > 255) return false;
    if (d.origen === 'proyecto') { if (!/^[a-z0-9-]{1,60}$/.test(String(d.clave || ''))) return false; }
    else if (d.origen === 'biblioteca') { if (!unidades.includes(d.unidad)) return false; if (d.carpeta !== undefined && (typeof d.carpeta !== 'string' || d.carpeta.split('/').some(x => x === '..' || x === '.'))) return false; }
    else return false;
    if (d.url !== undefined && d.url !== '' && !urlVistaPrevia(d.url, host)) return false;
    return true;
}
