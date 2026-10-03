// node test/archivos.test.js — las reglas puras de Archivos (rediseño v1.0.0, cubeta 5): quickXorHash contra vectores conocidos y contra un
// port LITERAL de la referencia en C# de Microsoft (oráculo con BigInt), fragmentos de la upload session, «¿ya existe?», nombres, la liga
// de Office, la cola, los avisos, las rutas #archivos/<sección> y la validación de un fijado.
import assert from 'node:assert/strict';
import { proximoByte, crearQuickXor, quickXorHash, comoSubir, fragmentos, rangoContenido, siguienteByte, leerMonitor, nombreSubible, extension, nombreFoto, tamanoLegible, escalaFoto,
    necesitaHash, buscarDuplicado, archivoDeGraph, sinArchivar, appOffice, uriOffice, urlVistaPrevia, resumenCola, pendientesAlSalir, avisosDeCola, agregarAlFrente,
    leerSeccion, rutaSeccion, validarFijado, LIMITE_PUT, FRAGMENTO, KIB_320 } from '../archivos-reglas.js';

let n = 0;
const ok = (nombre, cond) => { assert.ok(cond, nombre); n++; };
const b64 = s => Uint8Array.from(Buffer.from(s, 'base64'));

// ---------------------------------------------------------------- quickXorHash
// Vectores publicados con la implementación de rclone (backend/onedrive/quickxorhash/quickxorhash_test.go), que OneDrive valida en cada
// subida: la entrada va en base64 y el hash es el que devuelve Graph en file.hashes.quickXorHash.
const VECTORES = [
    ['', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA='],
    ['Sg==', 'SgAAAAAAAAAAAAAAAQAAAAAAAAA='],
    ['tbQ=', 'taAFAAAAAAAAAAAAAgAAAAAAAAA='],
    ['0pZP', '0rDEEwAAAAAAAAAAAwAAAAAAAAA='],
    ['jRRDVA==', 'jaDAEKgAAAAAAAAABAAAAAAAAAA=']
];
for (const [ent, sal] of VECTORES) ok(`quickXorHash(${ent || 'vacío'}) = ${sal}`, quickXorHash(b64(ent)) === sal);

// El oráculo: la referencia de Microsoft línea por línea (ulong[3], celdas de 64/64/32 bits, el corte de una celda a la siguiente y la vuelta
// de la última a la primera), con BigInt para los 64 bits. Lo que se prueba es que la versión rápida (un acumulador por clase k mod 160)
// diga lo mismo en todo largo y en toda partición en trozos — incluidos los que cruzan celdas y dan la vuelta al registro.
function referenciaMS() {
    const W = 160, SHIFT = 11, M64 = (1n << 64n) - 1n;
    const data = [0n, 0n, 0n]; let lengthSoFar = 0n, shiftSoFar = 0;
    return {
        hashCore(arr) {
            const cb = arr.length; let currentShift = shiftSoFar;
            let vectorArrayIndex = Math.floor(currentShift / 64), vectorOffset = currentShift % 64;
            const iterations = Math.min(cb, W);
            for (let i = 0; i < iterations; i++) {
                const isLastCell = vectorArrayIndex === data.length - 1;
                const bitsInVectorCell = isLastCell ? W % 64 : 64;
                if (vectorOffset <= bitsInVectorCell - 8) {
                    for (let j = i; j < cb; j += W) data[vectorArrayIndex] = (data[vectorArrayIndex] ^ ((BigInt(arr[j]) << BigInt(vectorOffset)) & M64)) & M64;
                } else {
                    const index1 = vectorArrayIndex, index2 = isLastCell ? 0 : vectorArrayIndex + 1, low = bitsInVectorCell - vectorOffset;
                    let xored = 0; for (let j = i; j < cb; j += W) xored ^= arr[j];
                    data[index1] = (data[index1] ^ ((BigInt(xored) << BigInt(vectorOffset)) & M64)) & M64;
                    data[index2] = (data[index2] ^ (BigInt(xored) >> BigInt(low))) & M64;
                }
                vectorOffset += SHIFT;
                while (vectorOffset >= bitsInVectorCell) { vectorArrayIndex = isLastCell ? 0 : vectorArrayIndex + 1; vectorOffset -= bitsInVectorCell; }
            }
            shiftSoFar = (shiftSoFar + SHIFT * (cb % W)) % W;
            lengthSoFar += BigInt(cb);
        },
        hashFinal() {
            const rgb = new Uint8Array(20);
            for (let i = 0; i < data.length; i++) for (let k = 0; k < 8 && i * 8 + k < 20; k++) rgb[i * 8 + k] = Number((data[i] >> BigInt(8 * k)) & 0xffn);
            for (let k = 0; k < 8; k++) rgb[12 + k] ^= Number((lengthSoFar >> BigInt(8 * k)) & 0xffn);
            return Buffer.from(rgb).toString('base64');
        }
    };
}
const ref = (bytes, cortes = [bytes.length]) => { const r = referenciaMS(); let a = 0; for (const c of cortes) { r.hashCore(bytes.subarray(a, Math.min(bytes.length, c))); a = c; } if (a < bytes.length) r.hashCore(bytes.subarray(a)); return r.hashFinal(); };
let semilla = 7; const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const aleatorios = largo => Uint8Array.from({ length: largo }, () => Math.floor(azar() * 256));
for (const [ent, sal] of VECTORES) ok(`el oráculo (port de la referencia) también da ${sal}`, ref(b64(ent)) === sal);
{
    let iguales = 0, total = 0;
    for (const largo of [1, 2, 7, 8, 14, 15, 16, 19, 20, 21, 31, 63, 64, 65, 159, 160, 161, 319, 320, 321, 1000, 4096, 65537]) {
        const b = aleatorios(largo); total++;
        if (quickXorHash(b) === ref(b)) iguales++;
    }
    ok(`quickXorHash = la referencia de Microsoft en ${total} largos (1 a 65,537 bytes, con cruces de celda y vuelta del registro)`, iguales === total);
}
{
    const b = aleatorios(50000); const esperado = ref(b);
    let iguales = 0;
    for (let k = 0; k < 12; k++) {
        const cortes = [...new Set(Array.from({ length: 1 + Math.floor(azar() * 6) }, () => Math.floor(azar() * b.length)))].sort((x, y) => x - y);
        const q = crearQuickXor(); let a = 0; for (const c of [...cortes, b.length]) { q.actualizar(b.subarray(a, c)); a = c; }
        if (q.final() === esperado && ref(b, cortes) === esperado) iguales++;
    }
    ok('quickXorHash por trozos (como se lee un archivo grande) = de una vez = la referencia, en 12 particiones al azar', iguales === 12);
}
{ const ceros = new Uint8Array(1 << 20); const h = quickXorHash(ceros); ok('1 MiB de ceros: solo la longitud (1,048,576 LE en los bytes 12-19)', h === ref(ceros) && Buffer.from(h, 'base64').subarray(0, 12).every(x => x === 0) && Buffer.from(h, 'base64').readUInt32LE(12) === 1048576); }
ok('quickXorHash acepta ArrayBuffer igual que Uint8Array', quickXorHash(b64('0pZP').buffer) === '0rDEEwAAAAAAAAAAAwAAAAAAAAA=');

// ---------------------------------------------------------------- cómo se sube
ok('LIMITE_PUT = 10 MiB y FRAGMENTO = 5 MiB = 16 × 320 KiB', LIMITE_PUT === 10485760 && FRAGMENTO === 5242880 && FRAGMENTO % KIB_320 === 0 && FRAGMENTO / KIB_320 === 16);
ok('comoSubir: ≤ 10 MiB es un PUT; 10 MiB + 1 byte es upload session', comoSubir(0) === 'put' && comoSubir(LIMITE_PUT) === 'put' && comoSubir(LIMITE_PUT + 1) === 'sesion');
{ const f = fragmentos(11 * 1048576); ok('fragmentos de 11 MiB: 5 + 5 + 1, inclusivos y contiguos', f.length === 3 && f[0][0] === 0 && f[0][1] === FRAGMENTO - 1 && f[1][0] === FRAGMENTO && f[2][1] === 11 * 1048576 - 1 && f.every(([a, b], i) => i === 0 || a === f[i - 1][1] + 1)); }
ok('fragmentos: todos menos el último son múltiplos de 320 KiB', fragmentos(23 * 1048576 + 17).slice(0, -1).every(([a, b]) => (b - a + 1) % KIB_320 === 0));
ok('fragmentos: exacto en 10 MiB = 2 fragmentos; 0 bytes = ninguno', fragmentos(2 * FRAGMENTO).length === 2 && fragmentos(0).length === 0);
assert.throws(() => fragmentos(100, 1000)); n++;
ok('vuelta 2 (F6): proximoByte manda lo que pide SharePoint aunque sea anterior al tramo, y sin dato el que sigue', proximoByte(10485759, 5242880) === 5242880 && proximoByte(10485759, 10485760) === 10485760 && proximoByte(10485759, null) === 10485760 && proximoByte(10485759, undefined) === 10485760);
ok('Content-Range', rangoContenido(0, 5242879, 11534336) === 'bytes 0-5242879/11534336');
ok('siguienteByte lee nextExpectedRanges', siguienteByte({ nextExpectedRanges: ['5242880-'] }) === 5242880 && siguienteByte({ nextExpectedRanges: ['0-99'] }) === 0 && siguienteByte({}) === null);
ok('leerMonitor', leerMonitor({ status: 'completed', resourceId: 'x' }).listo && leerMonitor({ status: 'inProgress', percentageComplete: 40 }).pct === 40 && !leerMonitor({ status: 'inProgress' }).listo && leerMonitor({ status: 'failed' }).fallo);

// ---------------------------------------------------------------- nombres
ok('nombreSubible: los caracteres que SharePoint no acepta pasan a «-»', nombreSubible('a:b*c?"d<e>f|g#h%i.pdf') === 'a-b-c--d-e-f-g-h-i.pdf');
ok('nombreSubible: sin diagonales (nada sube ni cambia de carpeta)', !/[\\/]/.test(nombreSubible('../x/..\\y.pdf')) && nombreSubible('..') === 'archivo');
ok('nombreSubible: sin espacios ni puntos al final, sin «~$», nunca vacío', nombreSubible('acta.pdf. ') === 'acta.pdf' && nombreSubible('~$borrador.docx') === 'borrador.docx' && nombreSubible('') === 'archivo' && nombreSubible('   ') === 'archivo');
ok('nombreSubible: nombres reservados', nombreSubible('CON') === 'archivo-CON' && nombreSubible('desktop.ini') === 'archivo-desktop.ini');
{ const largo = 'x'.repeat(300) + '.docx'; const s = nombreSubible(largo); ok('nombreSubible: a lo más 200 conservando la extensión', s.length === 200 && s.endsWith('.docx')); }
ok('nombreSubible conserva acentos y espacios de en medio', nombreSubible('Acta de recepción (firmada).pdf') === 'Acta de recepción (firmada).pdf');
ok('extension', extension('A.B.PDF') === 'pdf' && extension('sin') === '');
ok('nombreFoto: AAAA-MM-DD_HHMMSS_foto.jpg en hora de México', nombreFoto(new Date('2026-10-03T18:04:05Z')) === '2026-10-03_120405_foto.jpg' && nombreFoto(new Date('2026-10-03T18:04:05Z'), 1) === '2026-10-03_120405_foto-2.jpg');
ok('tamanoLegible', tamanoLegible(820) === '820 B' && tamanoLegible(12 * 1024) === '12 KB' && tamanoLegible(3.4 * 1048576) === '3.4 MB' && tamanoLegible(25 * 1048576) === '25 MB');
ok('escalaFoto: el lado mayor a 2048 sin agrandar', JSON.stringify(escalaFoto(4032, 3024)) === '{"ancho":2048,"alto":1536}' && JSON.stringify(escalaFoto(3024, 4032)) === '{"ancho":1536,"alto":2048}' && JSON.stringify(escalaFoto(800, 600)) === '{"ancho":800,"alto":600}');

// ---------------------------------------------------------------- «¿ya existe?»
const EX = [{ nombre: 'Acta.pdf', tamano: 100, hash: 'H1' }, { nombre: 'foto.jpg', tamano: 500, hash: 'H2' }];
ok('necesitaHash solo con un archivo del mismo tamaño que trae hash', necesitaHash(500, EX) && !necesitaHash(501, EX) && !necesitaHash(100, [{ nombre: 'x', tamano: 100 }]));
ok('duplicado por NOMBRE (sin importar mayúsculas)', buscarDuplicado({ nombre: 'acta.PDF', tamano: 1 }, EX).motivo === 'nombre');
ok('duplicado por CONTENIDO (mismo tamaño + quickXorHash, otro nombre)', buscarDuplicado({ nombre: 'otra.jpg', tamano: 500, hash: 'H2' }, EX).motivo === 'contenido' && buscarDuplicado({ nombre: 'otra.jpg', tamano: 500, hash: 'H2' }, EX).de === 'foto.jpg');
ok('mismo tamaño y otro hash NO es duplicado', buscarDuplicado({ nombre: 'otra.jpg', tamano: 500, hash: 'H9' }, EX) === null);
ok('duplicado por una LIGA ARCHIVADA del proyecto con ese nombre (por Ruta o por título)', buscarDuplicado({ nombre: 'Plan.pdf', tamano: 3 }, [], [{ Tipo: 'archivado', Title: 'x', Ruta: '04_SGI/Plan.pdf' }]).motivo === 'archivado'
    && buscarDuplicado({ nombre: 'Plan.pdf', tamano: 3 }, [], [{ Tipo: 'enlace', Title: 'Plan.pdf' }]) === null);
ok('el nombre manda sobre el contenido', buscarDuplicado({ nombre: 'Acta.pdf', tamano: 500, hash: 'H2' }, EX).motivo === 'nombre');

// ---------------------------------------------------------------- un archivo de Graph
{
    const it = { id: 'X1', name: 'a.docx', size: 12, webUrl: 'https://t.example/Doc.aspx?x', createdBy: { user: { email: 'Ana@x' } }, lastModifiedBy: { user: { displayName: 'Ana' } }, lastModifiedDateTime: '2026-10-01T10:00:00Z',
        file: { mimeType: 'application/x', hashes: { quickXorHash: 'QQ' } }, listItem: { webUrl: 'https://t.example/ERP_Proyectos/lau/a.docx', fields: { ProyectoClave: 'lau', TareaId: 7, EnviadoArchivar: true, Lote: '99/x' } } };
    const a = archivoDeGraph(it);
    ok('archivoDeGraph: id, nombre, tamaño, hash, urls, quién (minúsculas), tarjeta, enviado y lote', a.id === 'X1' && a.tamano === 12 && a.hash === 'QQ' && a.urlDirecta.endsWith('/lau/a.docx') && a.creadoPor === 'ana@x' && a.tareaId === 7 && a.enviado && a.lote === '99/x' && a.clave === 'lau');
    ok('archivoDeGraph: una carpeta es null; sin campos, sin tarjeta y sin enviar', archivoDeGraph({ id: 'c', name: 'c', folder: {} }) === null && archivoDeGraph({ id: 'y', name: 'y', file: {} }, 'k').tareaId === null && archivoDeGraph({ id: 'y', name: 'y', file: {} }, 'k').enviado === false && archivoDeGraph({ id: 'y', name: 'y', file: {} }, 'k').clave === 'k');
    ok('sinArchivar', sinArchivar([a, { ...a, enviado: false }]).length === 1);
}

// ---------------------------------------------------------------- Office y vista previa
const H = 'minsaenergy.sharepoint.com';
ok('appOffice por extensión, solo Word/Excel/PowerPoint', appOffice('a.DOCX') === 'ms-word' && appOffice('b.xlsx') === 'ms-excel' && appOffice('c.pptx') === 'ms-powerpoint' && appOffice('d.pdf') === null && appOffice('e') === null);
ok('uriOffice: ms-word:ofe|u|<url> con la url del tenant', uriOffice('a.docx', `https://${H}/sites/Administracion/ERP_Proyectos/lau/a b.docx`, H) === `ms-word:ofe|u|https://${H}/sites/Administracion/ERP_Proyectos/lau/a%20b.docx`);
ok('uriOffice: null fuera del tenant, sin https o si no es Office', uriOffice('a.docx', 'https://evil.example/a.docx', H) === null && uriOffice('a.docx', `http://${H}/a.docx`, H) === null && uriOffice('a.pdf', `https://${H}/a.pdf`, H) === null && uriOffice('a.docx', 'javascript:alert(1)', H) === null);
ok('urlVistaPrevia: solo https del tenant', urlVistaPrevia(`https://${H}/_layouts/15/embed.aspx?x=1`, H) === `https://${H}/_layouts/15/embed.aspx?x=1` && urlVistaPrevia('https://otro.example/x', H) === null && urlVistaPrevia('data:text/html,x', H) === null);

// ---------------------------------------------------------------- la cola y los avisos
const C = [{ estado: 'pendiente', nombre: 'a' }, { estado: 'subiendo', nombre: 'b' }, { estado: 'retenido', nombre: 'c', motivo: 'ya hay un «c»', cambio: '2026-10-01T00:00:00Z' }, { estado: 'error', nombre: 'd', motivo: 'sin permiso (403)', cambio: '2026-10-02T00:00:00Z' }, { estado: 'subido', nombre: 'e' }];
ok('resumenCola', JSON.stringify(resumenCola(C)) === '{"pendiente":1,"subiendo":1,"retenido":1,"error":1,"subido":1,"vivas":4}');
ok('pendientesAlSalir: todo lo que no subió', pendientesAlSalir(C) === 4 && pendientesAlSalir([]) === 0);
{ const av = avisosDeCola(C); ok('avisosDeCola: la que falló (danger) y el «¿duplicado?» (warn), los dos a #archivos/mias', av.length === 2 && av.some(x => x.tipo === 'subida' && x.cls === 'danger' && /«d» no se subió/.test(x.texto)) && av.some(x => x.tipo === 'duplicado' && x.cls === 'warn' && /¿«c» duplicado\?/.test(x.texto)) && av.every(x => x.ir === '#archivos/mias' && x.cuando)); }
{ const l = agregarAlFrente([{ llave: 'a' }, { llave: 'b' }], { llave: 'b', n: 2 }, 2); ok('agregarAlFrente: al frente, sin repetir y con tope', l.length === 2 && l[0].n === 2 && l[1].llave === 'a'); }

// ---------------------------------------------------------------- #archivos/<sección>
ok('leerSeccion: sin sufijo = Por proyecto', leerSeccion(null).seccion === 'proyectos' && leerSeccion('').seccion === 'proyectos' && leerSeccion('proyecto').seccion === 'proyectos');
ok('leerSeccion: proyecto/<clave>', leerSeccion('proyecto/lau-demo').seccion === 'proyecto' && leerSeccion('proyecto/lau-demo').clave === 'lau-demo' && leerSeccion('proyecto/MAL').seccion === 'proyectos');
ok('leerSeccion: recientes · fijados · mias', ['recientes', 'fijados', 'mias'].every(s => leerSeccion(s).seccion === s));
{ const r = leerSeccion('bibliotecas/CALYTEK/02_Planta/Equipos%20(2026)/..'); ok('leerSeccion: bibliotecas/<unidad>/<carpetas> decodificadas, sin «..»', r.seccion === 'bibliotecas' && r.unidad === 'CALYTEK' && r.ruta.join('|') === '02_Planta|Equipos (2026)'); }
ok('rutaSeccion es la inversa', rutaSeccion('bibliotecas', { unidad: 'CALYTEK', ruta: ['02_Planta', 'Equipos (2026)'] }) === '#archivos/bibliotecas/CALYTEK/02_Planta/Equipos%20(2026)' && rutaSeccion('proyecto', { clave: 'lau' }) === '#archivos/proyecto/lau' && rutaSeccion('mias') === '#archivos/mias' && rutaSeccion('proyectos') === '#archivos');
{ const { leerRuta } = await import('../reglas.js'); const h = rutaSeccion('bibliotecas', { unidad: 'CALYTEK', ruta: ['03_Predios', "Federal (ASEA) - LAU"] }); const r = leerRuta(h);
  ok('leerRuta acepta la ruta de una carpeta con espacios y paréntesis (codificada) y leerSeccion la devuelve igual', !!r && r.pantalla === 'archivos' && leerSeccion(r.sub).ruta.join('|') === '03_Predios|Federal (ASEA) - LAU'); }

// ---------------------------------------------------------------- un fijado
const OPC = { host: H, unidades: ['CALYTEK', 'PITEPEC'] };
ok('validarFijado: uno de proyecto y uno de biblioteca bien formados', validarFijado({ tipo: 'fijado', origen: 'proyecto', clave: 'lau', itemId: '01ABC!x_y-z', nombre: 'a.pdf', url: `https://${H}/x` }, OPC) && validarFijado({ tipo: 'fijado', origen: 'biblioteca', unidad: 'CALYTEK', carpeta: '02_Planta', itemId: 'abc', nombre: 'b.pdf' }, OPC));
ok('validarFijado rechaza lo editado a mano: id con «/», url ajena, unidad desconocida, carpeta con «..», otro tipo', [
    { tipo: 'fijado', origen: 'proyecto', clave: 'lau', itemId: '../x', nombre: 'a' }, { tipo: 'fijado', origen: 'proyecto', clave: 'lau', itemId: 'a', nombre: 'a', url: 'https://evil.example/' },
    { tipo: 'fijado', origen: 'biblioteca', unidad: 'RRHH', itemId: 'a', nombre: 'a' }, { tipo: 'fijado', origen: 'biblioteca', unidad: 'CALYTEK', carpeta: '../x', itemId: 'a', nombre: 'a' }, { tipo: 'reporte', itemId: 'a', nombre: 'a' }, null
].every(d => !validarFijado(d, OPC)));

console.log(`archivos: ${n} aserciones OK`);
