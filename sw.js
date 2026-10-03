// Service worker — solo para que la app abra rapido y sobreviva a una senal mala.
//
// REGLA QUE NO SE TOCA (heredada de minsa-captura-app, hallazgo A7): aqui se cachea UNICAMENTE
// el armazon estatico. Nada de Graph, nada del login de Microsoft. Cachear una
// respuesta de Graph dejaria proyectos y tareas en el disco del telefono.
//
// Cada peticion del armazon lleva `cache: 'reload'`: GitHub Pages sirve con max-age=600 y sin
// eso el service worker nuevo se llena con los archivos VIEJOS (medido en captura, 2026-08-17).

const CACHE = 'minsa-erp-v198';

function traerDeLaRed(recurso) {
    return fetch(new Request(recurso, { cache: 'reload', credentials: 'same-origin' }));
}

const ARMAZON = [
    './',
    './index.html',
    './estilo.css',
    './minsa-ui.css',
    './app.js',
    './armazon.js',         // v1.0.0: rail, panel, cabecera, Cuenta (rediseño 2026-10-02)
    './config.js',
    './comun.js',
    './graph.js',
    './reglas.js',
    './tablero.js',
    './docs.js',
    './chat.js',
    './vistas.js',
    './capital.js',
    './gastos.js',          // v0.162.0
    './gastos-reglas.js',
    './cobranza.js',        // v0.165.0
    './cobranza-reglas.js',
    './reporte.js',         // v1.0.0 (cubeta 2): la plantilla de reporte (DOM) y sus reglas puras
    './reporte-reglas.js',
    './segmentos.js',       // v1.0.0: filtros y segmentos
    './guardados.js',       // v1.0.0: «Guardados» (ERP_Vistas o este equipo)
    './trabajo-reglas.js',  // v1.0.0 (cubeta 3): la tendencia de los 5 reportes de Trabajo
    './inicio.js',          // v1.0.0 (cubeta 4): Inicio (cabecera, KPIs por rol) y sus reglas puras
    './inicio-reglas.js',
    './buscador.js',        // v1.0.0 (cubeta 4): el buscador global
    './preguntar.js',       // v1.0.0 (cubeta 4): «Preguntar» (sin IA) y su intérprete de frases
    './preguntar-reglas.js',
    './vigencias.js',       // v0.166.0
    './vigencias-reglas.js',
    './servicios.js',       // v0.168.0
    './servicios-reglas.js',
    './compras.js',         // v0.169.0
    './compras-reglas.js',
    './archivos.js',        // v1.0.0 (cubeta 5): Archivos — ERP_Proyectos, la cola de subidas, mandar a archivar, bibliotecas
    './archivos-reglas.js',
    './cola.js',            // la cola en IndexedDB (las subidas sin señal)
    './imagen.js',          // la foto de la cámara a 2048 px (copia de la app de captura)
    './lote.js',
    './esquema.json',
    './manifest.json',
    './vendor/msal-browser.min.js',
    './vendor/fuentes/SourceSans3-latin-var.woff2',   // v1.0.0: la letra de la maqueta (sustituye a Saira, Barlow y Bai Jamjuree)
    './vendor/fuentes/IBMPlexMono-400.woff2',
    './vendor/fuentes/IBMPlexMono-500.woff2',
    './iconos/icono-192.png',
    './iconos/icono-512.png',
    './iconos/icono-512-recortable.png',
    './marca/lockup.svg',
    './marca/lockup-oscuro.svg',
    './marca/simbolo-oscuro.svg'   // v1.0.0: la cabeza del rail
];
// S-25 (v0.151.0): las rutas del armazon, resueltas contra el scope; el fetch guarda SOLO estas y por su ruta sin query —
// antes toda GET del origen con respuesta ok entraba a la cache, y cada variante `?x=` quedaba como entrada propia.
const RUTAS_ARMAZON = new Set(ARMAZON.map(r => new URL(r, self.location).pathname));

self.addEventListener('install', evento => {
    evento.waitUntil(
        caches.open(CACHE)
            .then(c => Promise.all(ARMAZON.map(recurso =>
                traerDeLaRed(recurso).then(respuesta => {
                    if (!respuesta || !respuesta.ok) throw new Error(`no se pudo precargar ${recurso}`);
                    return c.put(recurso, respuesta);
                })
            )))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', evento => {
    evento.waitUntil(
        caches.keys()
            .then(llaves => Promise.all(llaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', evento => {
    const url = new URL(evento.request.url);
    if (url.origin !== self.location.origin) return;
    if (evento.request.method !== 'GET') return;
    evento.respondWith(
        traerDeLaRed(evento.request.url)
            .then(respuesta => {
                if (respuesta && respuesta.ok && RUTAS_ARMAZON.has(url.pathname)) {   // S-25
                    const copia = respuesta.clone();
                    caches.open(CACHE).then(c => c.put(url.origin + url.pathname, copia));
                }
                return respuesta;
            })
            .catch(() => caches.match(evento.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))   // S-25: `?refresco=0` y cia. caen al mismo archivo
    );
});
