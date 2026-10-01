// node test/datos.test.js — guardia contra datos personales en el repo PUBLICO (auditoria 2026-09-08).
//
// Dos capas. La fija, que viaja con el repo: ningun archivo rastreado trae un correo del tenant
// (@minsaenergy) ni una sesion de MSAL pegada (eyJ...). La privada: si junto al repo existe
// ../../herramientas-dev/datos-prohibidos.txt (vive FUERA del repo, en la maquina de desarrollo),
// se buscan tambien esas cadenas. Listarlas aqui seria publicarlas; por eso el archivo es externo.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESTE = 'test/datos.test.js';
const rastreados = execSync('git ls-files', { cwd: raiz, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean)
    .filter(f => !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip)$/i.test(f) && f !== ESTE && !f.startsWith('vendor/'));   // S-30 (v0.160.0): todo lo rastreado salvo binarios — antes una lista cerrada de extensiones dejaba fuera test/e2e.ps1 y cualquier .ps1/.py/.mjs nuevo
assert.ok(rastreados.length > 10, 'git ls-files no devolvio archivos');

const fijas = [
    [/[a-z0-9._-]+@minsaenergy\.[a-z]+/i, 'correo del tenant'],
    [/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/, 'token JWT'],
    [/client_secret|clientSecret/i, 'client secret']
];
const escapar = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const privado = resolve(raiz, '..', 'herramientas-dev', 'datos-prohibidos.txt');
const privadas = existsSync(privado)
    ? readFileSync(privado, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
        .map(s => [new RegExp(escapar(s), 'i'), 'dato de la lista privada'])
    : [];

const fallas = [];
for (const f of rastreados) {
    const texto = readFileSync(join(raiz, f), 'utf8');
    for (const [re, que] of [...fijas, ...privadas]) {
        const m = texto.match(re);
        if (m) fallas.push(`${f}: ${que} (${m[0].slice(0, 40)})`);
    }
}
assert.deepEqual(fallas, [], 'datos que no deben estar en el repo publico:\n  ' + fallas.join('\n  '));

// El HISTORIAL (auditoria del repo 2026-09-30; copia de calytek-planta-app 642db51). Borrar un dato de HEAD no lo saca
// del repo publico: el commit viejo sigue en origin. Se barren solo las lineas AGREGADAS (+) de `git log -p --all`.
// Barrido a mano el 2026-09-30 sobre 204 commits: 0 aciertos, asi que la deuda arranca vacia; un acierto es un dato NUEVO.
const DEUDA_HISTORICA = new Set([]);
const log = execSync('git log -p --all --no-color --format=@@C%h -- . ":(exclude)vendor" ":(exclude)' + ESTE + '"',
    { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 30 });
const enHistoria = new Set();
let commit = '', archivo = '', commits = 0;
for (const ln of log.split('\n')) {
    if (ln.startsWith('@@C')) { commit = ln.slice(3, 10); commits++; continue; }
    if (ln.startsWith('+++ b/')) { archivo = ln.slice(6); continue; }
    if (!ln.startsWith('+') || ln.startsWith('+++') || DEUDA_HISTORICA.has(commit)) continue;
    // Sin el valor: el mensaje de la prueba no debe republicar lo que encontro.
    for (const [re, que] of [...fijas, ...privadas]) if (re.test(ln)) enHistoria.add(`${commit} ${archivo}: ${que}`);
}
assert.ok(commits > 10, 'git log no devolvio commits');
assert.deepEqual([...enHistoria], [], 'datos en el HISTORIAL del repo publico (borrarlos de HEAD no basta):\n  '
    + [...enHistoria].join('\n  '));

// S-19 (v0.129.0): lo unico que deja el arnes (test/pruebas.html: sin CSP y con un MSAL falso) y el servidor local FUERA de Pages
// es el `exclude` de _config.yml; un .nojekyll apagaria Jekyll y los publicaria en el mismo origen que guarda la sesion de MSAL.
{
    const cfg = readFileSync(join(raiz, '_config.yml'), 'utf8');
    const excluidos = [...cfg.matchAll(/^\s*-\s*(\S+)\s*$/gm)].map(m => m[1]);
    for (const x of ['test', 'servidor-local.js']) assert.ok(excluidos.includes(x), `_config.yml ya no excluye ${x}: se publicaria en Pages`);
    assert.ok(!existsSync(join(raiz, '.nojekyll')), '.nojekyll apaga Jekyll y publica test/ y servidor-local.js');
}
console.log(`datos: ok (${rastreados.length} archivos y ${commits} commits, ${fijas.length} reglas fijas, ${privadas.length} privadas${privadas.length ? '' : ' — lista privada no encontrada'})`);
