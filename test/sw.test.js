// node test/sw.test.js — que la precarga del service worker no se quede corta (heredado de captura).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(raiz, 'sw.js'), 'utf8');
const FUERA = new Set(['sw.js', 'servidor-local.js']);
const modulos = readdirSync(raiz).filter(f => f.endsWith('.js') && !FUERA.has(f));
assert.ok(modulos.length > 0);
for (const m of modulos) assert.ok(sw.includes(`'./${m}'`), `sw.js precarga ${m}`);
assert.ok(sw.includes(`'./esquema.json'`), 'sw.js precarga esquema.json');
assert.ok(/const CACHE = 'minsa-proyectos-v(\d+)'/.test(sw), 'sw.js versiona su caché');
assert.ok(!/\.addAll\s*\(/.test(sw), 'sin addAll: pasa por la caché HTTP');
assert.ok(/cache:\s*'reload'/.test(sw), 'cada petición del armazón lleva cache: reload');
assert.ok(!/graph\.microsoft\.com|login\.microsoftonline\.com/.test(sw), 'el sw no menciona Graph ni login');
// obs. 595 (2026-09-13): el numero de version vive en dos archivos y se desincronizo en v0.15.1; la unica guarda que aguanta es esta.
const version = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).version;
const m = /export const VERSION = '([^']+)'/.exec(readFileSync(join(raiz, 'comun.js'), 'utf8'));
assert.ok(m && m[1] === version, `comun.js VERSION (${m && m[1]}) debe ser igual a package.json version (${version})`);
// S-08 (v0.80.0): el servidor de la E2E solo escucha en la interfaz local; sin host Node abre 0.0.0.0 y un vecino de
// la red podia pisar _salida-dev.json por POST /guardar. Se lee el archivo porque la E2E lo arranca fuera de este proceso.
assert.ok(/servidor\.listen\(PUERTO,\s*'127\.0\.0\.1'/.test(readFileSync(join(raiz, 'servidor-local.js'), 'utf8')),
  "servidor-local.js debe escuchar solo en '127.0.0.1'");
// S-10 (v0.82.1): /guardar solo con Origin del propio servidor, y .git/ y _salida-dev.json responden 403.
{
  const srv = readFileSync(join(raiz, 'servidor-local.js'), 'utf8');
  assert.ok(srv.includes('ORIGENES.has(req.headers.origin)') && srv.includes('|| rutaVedada(destino)'), 'servidor-local.js debe filtrar Origin en /guardar y las rutas vedadas sobre el destino resuelto');
  const { rutaVedada } = await import('../servidor-local.js');   // importarlo NO levanta el servidor (solo escucha como programa principal)
  const { resolve } = await import('node:path');
  // Las mismas URL que el servidor recibe (rel ya decodificado), resueltas como lo hace el: los tres huecos del revisor de v0.82.1 incluidos.
  for (const [rel, esperado] of [['/.git/HEAD', true], ['/.gitignore', true], ['/_salida-dev.json', true], ['/_SALIDA-DEV.JSON', true], ['/x/../.git/HEAD', true], ['/test/../_salida-dev.json', true], ['/\\.git/HEAD', process.platform === 'win32'], ['/index.html', false], ['/test/pruebas.html', false], ['/vendor/x.js', false], ['/README.md', false]])
    assert.equal(rutaVedada(resolve(raiz, '.' + rel), raiz), esperado, `rutaVedada(${rel})`);
  // S-11 (v0.94.0): el flujo alterno de NTFS y los puntos/espacios finales abren el mismo archivo; y el Host se valida contra el puerto real.
  for (const rel of ['/_salida-dev.json::$DATA', '/_salida-dev.json.', '/_salida-dev.json ', '/.git::$INDEX_ALLOCATION/HEAD', '/index.html::$DATA'])
    assert.equal(rutaVedada(resolve(raiz, '.' + rel), raiz), true, `rutaVedada(${rel})`);
  const { hostValido } = await import('../servidor-local.js');
  const hosts = new Set(['localhost:8080', '127.0.0.1:8080']);
  for (const [h, esperado] of [['localhost:8080', true], ['127.0.0.1:8080', true], ['LOCALHOST:8080', true], ['evil.example:8080', false], ['localhost:9999', false], ['', false], [undefined, false]])
    assert.equal(hostValido(h, hosts), esperado, `hostValido(${h})`);
  assert.ok(srv.includes('if (!hostValido(req.headers.host))'), 'servidor-local.js debe rechazar un Host ajeno antes de servir');
}
// S-07 (v0.76.0): el <script> de MSAL lleva integrity; si alguien sube el vendor y no toca el atributo, el navegador
// lo rechaza en silencio y la app no arranca. Aqui se coteja contra los bytes del archivo, en los tres HTML que lo cargan.
import { createHash } from 'node:crypto';
const sri = 'sha256-' + createHash('sha256').update(readFileSync(join(raiz, 'vendor', 'msal-browser.min.js'))).digest('base64');
for (const html of ['index.html', '../herramientas-dev/provisionar.html', '../herramientas-dev/sembrar.html']) {
  const tag = /<script src="\.\/vendor\/msal-browser\.min\.js"([^>]*)>/.exec(readFileSync(join(raiz, html), 'utf8'));
  assert.ok(tag, `${html} carga el vendor de MSAL`);
  assert.ok(tag[1].includes(`integrity="${sri}"`), `${html}: integrity del vendor de MSAL debe ser ${sri}`);
}
// S-06 (v0.77.0): la version que declara la cabecera del vendor y la que registra la primera fila de INTEGRIDAD.md
// son la misma; el cotejo contra npm (por red) vive en `npm run vendor:vigente`, fuera de esta suite.
const cab = /^\/\*! @azure\/msal-browser v(\d+\.\d+\.\d+) /.exec(readFileSync(join(raiz, 'vendor', 'msal-browser.min.js'), 'utf8'));
assert.ok(cab, 'el vendor de MSAL declara su version en la cabecera');
const fila = /\| `msal-browser\.min\.js` \| @azure\/msal-browser (\d+\.\d+\.\d+) \|/.exec(readFileSync(join(raiz, 'vendor', 'INTEGRIDAD.md'), 'utf8'));
assert.ok(fila && fila[1] === cab[1], `INTEGRIDAD.md registra ${fila && fila[1]} y el vendor es ${cab[1]}`);
// S-25 (v0.151.0): el fetch guarda solo el armazon, por ruta sin query, y el respaldo ignora la query.
assert.ok(/RUTAS_ARMAZON\.has\(url\.pathname\)/.test(sw) && sw.includes('ignoreSearch: true') && !sw.includes('c.put(evento.request'), 'sw.js: el fetch cachea solo RUTAS_ARMAZON y el respaldo usa ignoreSearch');
// S-25 (v0.151.0): con el fetch acotado al armazon, todo recurso local que pida el CSS DEBE estar precargado, o sin red se pierde
// (el revisor cazo BaiJamjuree-700.woff2, que solo se guardaba por accidente).
for (const css of ['estilo.css', 'minsa-ui.css']) for (const [, u] of readFileSync(join(raiz, css), 'utf8').matchAll(/url\(\s*["']?\.\/([^"')]+)/g))
  assert.ok(sw.includes(`'./${u}'`), `sw.js precarga ${u} (lo pide ${css})`);
// S-26 (v0.151.0): el decodeURIComponent de la ruta va en try y contesta 400.
{ const srv = readFileSync(join(raiz, 'servidor-local.js'), 'utf8'); assert.ok(/try \{ rel = decodeURIComponent\(/.test(srv) && srv.includes('res.writeHead(400'), 'servidor-local.js: un % mal formado contesta 400, no tumba el proceso'); }
// S-24, mitad segura (v0.152.0, OK de Carlos 30-sep): cero sumideros de HTML o de script en los modulos de la app. Los datos (titulos,
// comentarios, nombres de documento) los escriben diez personas; pintarlos como HTML seria un XSS con su sesion. Hoy todo va por
// textContent y nodos: esta guarda lo vuelve obligatorio. La otra mitad (Trusted Types en la CSP) espera prueba con login real.
// Se barre el archivo ENTERO sin comentarios (no por linea: una asignacion partida en dos lineas tambien cuenta); los comentarios se
// blanquean con espacios del mismo largo para que el numero de linea siga cuadrando, y un // precedido de «:» (https://) no es comentario.
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])(\/\/.*)$/gm, (x, a, c) => a + ' '.repeat(c.length));
const SUMIDEROS = new RegExp([
  String.raw`(?:\.|\[\s*['"\`])(?:inner|outer)HTML(?:['"\`]\s*\])?\s*(?:\+|\|\||&&|\?\?)?=(?!=)`,   // asignacion, tambien por corchetes, += ||= ??=
  String.raw`\b(?:inner|outer)HTML['"\`]?\s*:`,                                                     // Object.assign(el, { innerHTML: x })
  String.raw`\binsertAdjacentHTML\b`, String.raw`\bdocument\s*(?:\.|\[\s*['"\`])write`, String.raw`\bcreateContextualFragment\b`,
  String.raw`\bsetHTML(?:Unsafe)?\b`, String.raw`\.srcdoc\s*=(?!=)`, String.raw`\bsetAttribute\(\s*['"\`](?:srcdoc|on\w+)`,
  String.raw`\bparseFromString\([^)]*text\/html`, String.raw`\beval\s*\(`, String.raw`\bnew\s+Function\s*\(`,
].join('|'), 'g');
const sumiderosEn = t => [...sinComentarios(t).matchAll(SUMIDEROS)].map(m => ({ linea: t.slice(0, m.index).split('\n').length, uso: m[0].trim() }));
for (const m of [...modulos, 'sw.js']) {
  const hay = sumiderosEn(readFileSync(join(raiz, m), 'utf8'));
  assert.equal(hay.length, 0, `${m}: sumidero de HTML/script en ${hay.map(h => `linea ${h.linea} (${h.uso})`).join(', ')} — arma el DOM con el()/textContent`);
}
// S-24 (v0.153.0): la CSP de index.html exige Trusted Types y nombra UNA politica, la misma que crea app.js para registrar el SW;
// si alguien cambia el nombre en un lado, el SW deja de registrarse en silencio.
{ const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(readFileSync(join(raiz, 'index.html'), 'utf8'));
  const app = readFileSync(join(raiz, 'app.js'), 'utf8'); const pol = /trustedTypes\.createPolicy\('([^']+)'/.exec(app);
  assert.ok(csp && /require-trusted-types-for 'script'/.test(csp[1]), "index.html: la CSP exige require-trusted-types-for 'script'");
  assert.ok(pol && new RegExp(`trusted-types ${pol[1]}(;|\\s|$)`).test(csp[1]), `index.html: trusted-types nombra la politica de app.js (${pol && pol[1]})`);
  assert.ok(/register\(politicaSw \? politicaSw\.createScriptURL\('\.\/sw\.js'\)/.test(app), 'app.js registra el SW con la politica'); }
// control: casa el uso (tambien los huecos que cazo el revisor-entregable de v0.152.0) y no el comentario ni la lectura
for (const [txt, n] of [['x.innerHTML = t', 1], ['x.innerHTML += t', 1], ["x['innerHTML'] = t", 1], ['x.outerHTML ||= t', 1], ['Object.assign(x, { innerHTML: t })', 1],
    ['x.innerHTML\n  = t', 1], ['n.insertAdjacentHTML("beforeend", t)', 1], ['document.write(t)', 1], ["document['write'](t)", 1], ['f.srcdoc = t', 1],
    ["x.setAttribute('onclick', t)", 1], ["new DOMParser().parseFromString(t, 'text/html')", 1], ['eval(t)', 1], ['new Function(t)', 1],
    ["const u = 'https://a.example/c'; x.innerHTML = t", 1],
    ['// nada de innerHTML = x (todo textContent)', 0], ['/* x.innerHTML = t */ const a = 1', 0], ['if (x.innerHTML == t) {}', 0], ['x.textContent = t', 0], ["x.setAttribute('aria-label', t)", 0]])
  assert.equal(sumiderosEn(txt).length, n, `sumideros contra ${JSON.stringify(txt)}`);
console.log('sw: ok');
