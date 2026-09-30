// Service worker — solo para que la app abra rapido y sobreviva a una senal mala.
//
// REGLA QUE NO SE TOCA (heredada de minsa-captura-app, hallazgo A7): aqui se cachea UNICAMENTE
// el armazon estatico. Nada de Graph, nada del login de Microsoft. Cachear una
// respuesta de Graph dejaria proyectos y tareas en el disco del telefono.
//
// Cada peticion del armazon lleva `cache: 'reload'`: GitHub Pages sirve con max-age=600 y sin
// eso el service worker nuevo se llena con los archivos VIEJOS (medido en captura, 2026-08-17).

const CACHE = 'minsa-proyectos-v180';

function traerDeLaRed(recurso) {
    return fetch(new Request(recurso, { cache: 'reload', credentials: 'same-origin' }));
}

const ARMAZON = [
    './',
    './index.html',
    './estilo.css',
    './minsa-ui.css',
    './app.js',
    './config.js',
    './comun.js',
    './graph.js',
    './reglas.js',
    './tablero.js',
    './docs.js',
    './chat.js',
    './vistas.js',
    './capital.js',
    './lote.js',
    './esquema.json',
    './manifest.json',
    './vendor/msal-browser.min.js',
    './vendor/fuentes/Barlow-400.woff2',
    './vendor/fuentes/Barlow-500.woff2',
    './vendor/fuentes/Barlow-600.woff2',
    './vendor/fuentes/Saira-500.woff2',
    './vendor/fuentes/Saira-600.woff2',
    './vendor/fuentes/IBMPlexMono-400.woff2',
    './vendor/fuentes/IBMPlexMono-500.woff2',
    './vendor/fuentes/BaiJamjuree-700.woff2',   // v0.151.0: faltaba; se cacheaba por accidente hasta S-25
    './iconos/icono-192.png',
    './iconos/icono-512.png',
    './iconos/icono-512-recortable.png',
    './marca/lockup.svg',
    './marca/lockup-oscuro.svg'
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
