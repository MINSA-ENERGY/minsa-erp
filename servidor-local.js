// Servidor estatico minimo para probar la app en http://localhost:8080/
//
//   node servidor-local.js                                    -> sirve index.html en la raiz
//   node servidor-local.js ../herramientas-dev/paso0.html     -> sirve esa pagina en la raiz
//   node servidor-local.js test/pruebas.html --puerto 0       -> puerto EFIMERO (C-01 v0.90.0): dos corridas de la E2E
//                                                                conviven; el puerto real sale en la primera linea (PUERTO n)
//
// Sirve el archivo indicado EN LA RAIZ a proposito: la URL de redireccion registrada en
// Entra es exactamente 'http://localhost:8080/'. Si la pagina se abriera como
// '/paso0.html', MSAL mandaria esa como redirectUri y Entra la rechazaria por no estar
// registrada. Este es el tipo de detalle que cuesta media hora de depuracion.
//
// Las herramientas de desarrollo (paso0, explorar, revisar-catalogo) viven FUERA de esta
// carpeta —en ../herramientas-dev/— porque hacen login real y no tienen CSP: no deben
// publicarse con la app. Solo el archivo indicado por argumento puede venir de fuera; todo
// lo demas (config.js, vendor/) se sigue sirviendo unicamente desde esta carpeta.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// En modulos ES no existe __dirname. import.meta.dirname llega en Node 20.11+;
// el fallback cubre versiones anteriores.
const RAIZ = import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));
// C-01 (v0.90.0): `--puerto N` (0 = el que de el sistema); sin el, 8080, que es la URL de redireccion registrada en Entra.
const ARGS = process.argv.slice(2), iPuerto = ARGS.indexOf('--puerto');
const PUERTO = iPuerto >= 0 ? Number(ARGS[iPuerto + 1]) : 8080;
const INDICE = ARGS.find((a, i) => !a.startsWith('--') && !(iPuerto >= 0 && i === iPuerto + 1)) || 'index.html';   // sin --puerto, iPuerto+1 es 0 y tumbaba el indice (lo cazaron las capturas)

// El unico archivo que puede vivir fuera de RAIZ: el que se pidio por argumento.
const ARCHIVO_INDICE = path.resolve(RAIZ, INDICE);

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon'
};

// S-10 (v0.82.1): S-08 cerro la Wi-Fi, pero una pestaña AJENA abierta en el mismo navegador seguia pudiendo hacer
// POST /guardar (pisar la salida de la E2E) y leer .git/ o _salida-dev.json bajo la raiz. Ahora /guardar exige un
// Origin de este mismo servidor —el navegador lo manda en todo POST y una pagina no lo puede falsear— y toda
// ruta cuyo primer segmento empiece por «.» (.git, .gitignore) o sea _salida-dev.json responde 403.
// Se juzga sobre el DESTINO YA RESUELTO relativo a RAIZ, no sobre la URL: el revisor de v0.82.1 sirvio .git/HEAD por
// `/x/../.git/HEAD`, `/%5C.git/HEAD` (path.resolve toma `\` como separador en Windows) y `/_SALIDA-DEV.JSON` (el FS
// no distingue mayusculas) con la version que miraba el primer segmento de la URL.
const ORIGENES = new Set();   // se llena al escuchar, con el puerto REAL (C-01: con --puerto 0 no se sabe antes)
const RESERVADOS = ['_salida-dev.json'];
// S-11 (v0.94.0): NTFS abre el mismo archivo por `nombre::$DATA` (flujo alterno) y por `nombre.` / `nombre ` (quita puntos y
// espacios finales), y la lista comparaba el texto literal: `/_salida-dev.json::$DATA` se servia. Ahora cualquier `:` en la ruta
// relativa es 403 (ningun archivo de la app lo lleva) y cada segmento se compara sin sus puntos y espacios finales.
export function rutaVedada(destino, raiz = RAIZ) {
    const rel = path.relative(raiz, destino);
    if (rel.includes(':')) return true;
    const primero = (rel.split(path.sep)[0] || '').toLowerCase().replace(/[. ]+$/, '');
    return primero.startsWith('.') || RESERVADOS.includes(primero);
}
// S-11: y sin validar Host, un DNS rebinding (un dominio ajeno que resuelve a 127.0.0.1) volvia legible el servidor desde
// otra pestaña: el navegador lo trata como mismo origen del dominio ajeno. Solo se atiende Host localhost/127.0.0.1 con el puerto REAL.
const HOSTS = new Set();   // se llena al escuchar, como ORIGENES
export function hostValido(host, hosts = HOSTS) { return hosts.has(String(host || '').toLowerCase()); }

const servidor = http.createServer((req, res) => {
    if (!hostValido(req.headers.host)) {   // S-11
        console.log(`  403  Host ${req.headers.host || '(sin Host)'}`);
        res.writeHead(403, { 'Content-Type': 'text/plain' }).end('403');
        return;
    }
    // Buzon de ida y vuelta para las herramientas de desarrollo: la pagina manda lo que
    // encontro y aterriza en un archivo local, para no tener que copiar y pegar a mano.
    // Solo existe en este servidor de pruebas; no es parte de la app.
    if (req.method === 'POST' && req.url === '/guardar') {
        if (!ORIGENES.has(req.headers.origin)) {
            console.log(`  403  POST /guardar desde origen ${req.headers.origin || '(sin Origin)'}`);
            res.writeHead(403, { 'Content-Type': 'text/plain' }).end('403');
            return;
        }
        let cuerpo = '';
        req.on('data', d => { cuerpo += d; if (cuerpo.length > 5e6) req.destroy(); });
        req.on('end', () => {
            const destino = path.join(RAIZ, '_salida-dev.json');
            fs.writeFileSync(destino, cuerpo, 'utf8');
            console.log(`  GUARDADO  ${cuerpo.length} bytes -> ${destino}`);
            res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
        });
        return;
    }

    // S-26 (v0.151.0): un % mal formado (/%E0%A4%A) lanzaba URIError sin atrapar y tumbaba el proceso: ahora es un 400.
    let rel;
    try { rel = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400, { 'Content-Type': 'text/plain' }).end('ruta mal formada'); return; }

    let destino;
    if (rel === '/') {
        destino = ARCHIVO_INDICE;
    } else {
        // Sin salto de ruta: se resuelve y se exige que quede dentro de RAIZ. El separador
        // al final importa: sin el, un directorio HERMANO cuyo nombre empiece igual
        // ('app-x' junto a 'app') pasaria la comprobacion por puro prefijo.
        destino = path.resolve(RAIZ, '.' + rel);
        if (!destino.startsWith(RAIZ + path.sep) || rutaVedada(destino)) {
            console.log(`  403  ${rel}`);
            res.writeHead(403).end('403');
            return;
        }
    }

    fs.readFile(destino, (err, datos) => {
        if (err) {
            console.log(`  404  ${rel}`);
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — no existe ' + rel);
            return;
        }
        const tipo = TIPOS[path.extname(destino).toLowerCase()] || 'application/octet-stream';
        console.log(`  200  ${rel}`);
        res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' }).end(datos);
    });
});

// S-08 (v0.80.0): solo la interfaz local. Sin host, Node abre 0.0.0.0/:: y cualquier equipo de la misma
// Wi-Fi leia la app servida y podia hacer POST /guardar y pisar _salida-dev.json mientras corria la E2E.
// S-10: solo escucha como programa principal; importado (sw.test.js prueba rutaVedada) no abre el puerto.
const esPrincipal = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) servidor.listen(PUERTO, '127.0.0.1', () => {
    const puerto = servidor.address().port;
    for (const h of ['localhost', '127.0.0.1']) { ORIGENES.add(`http://${h}:${puerto}`); HOSTS.add(`${h}:${puerto}`); }
    console.log(`PUERTO ${puerto}`);   // primera linea, fija: e2e.ps1 la lee para saber a donde apuntar Edge
    console.log('');
    console.log(`Sirviendo ${RAIZ}`);
    console.log(`Indice: ${INDICE}`);
    console.log('');
    console.log(`  ABRE:  http://localhost:${puerto}/`);
    console.log('');
    console.log('(Ctrl+C para detener)');
    console.log('');
});
