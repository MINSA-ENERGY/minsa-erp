// MINSA ERP v0.168.0 — SERVICIOS (Carlos, 2-oct: «lo ven Lorena y José»; maqueta https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn).
// Un renglón por expediente de LATINA (PITEPEC) y en cuál de los 12 pasos va, de la SOLPED al cobro.
//   - SOLO LEE: servicios.json de la biblioteca CONFIG.bibliotecaOperacion (sitio Administracion), que publica la laptop
//     (docs/publicar-cobranza.ps1 v1.2.0+, con .claude/skills/_compartido/scripts/servicios.py sobre servicios-en-curso.md).
//   - La ven gerencia y colaborador (PUEDE.tarea). Quien lee de verdad lo decide SharePoint: ERP_Operacion va sin herencia,
//     con lectura para Lorena, José y gerencia. A quien no la ve, SharePoint le esconde la biblioteca entera, asi que «no hay
//     biblioteca» se dice distinto a gerencia (falta publicar) y a colaborador (falta permiso).
//   - Sin montos: el JSON no los trae a proposito (test/servicios.test.js lo vigila); el dinero vive en Finanzas.
//   - Se lee la PRIMERA vez que se entra a #servicios en la sesion y con «Volver a leer»; el refresco de 2 min no lo toca.
// v1.0.0 (rediseño 2026-10-02, cubeta 3; plan «Operación»; maqueta maqueta-reportes.html, servicios()): tres páginas con la plantilla de
// reporte (reporte.js) — #servicios (Expedientes: KPIs + «Datos del reporte» con la barra de 12 pasos), #servicios/<E#> (el detalle de UN
// expediente: su barra grande y la tabla de sus 12 pasos) y #servicios/ciclo (expedientes por paso: barras + la tabla de los 12 pasos con sus
// expedientes desplegables). El corte del JSON va en el chip «corte: fecha» de la cabecera (ámbar > 8 días, rojo > 15).
// Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { PUEDE, plural } from './reglas.js';
import { $, estado, el, boton, chip } from './comun.js';
import { problemaServicios, estadosPasos, ordenarServicios, resumenServicios, fechaCorta, N_PASOS, detenido, filtrarServicios, FILTROS_SERVICIOS,
    esperaMasLarga, expedientesPorPaso, TEXTO_PASO, diasDesdeFecha } from './servicios-reglas.js';
import { diaIso } from './reporte-reglas.js';
import { pintarReporte, cabecera, vistaDe, soltarIdsFuera, desplegable, filaKpis } from './reporte.js';

/** datos: null = no leido · false = no hay biblioteca/archivo · objeto = el JSON valido. error: la lectura fallo. */
const S = { datos: null, error: null, cargando: null };
export const estadoServicios = () => S;
let alCambiar = () => {};
export function alCambiarServicios(fn) { alCambiar = fn; }
export const puedeVerServicios = () => PUEDE.tarea(estado.rol);
const motivo = e => (e && e.message ? e.message : String(e));

export async function cargarServicios() {
    const c = estado.cliente, s = estado.siteId;
    try {
        if (!await c.existeLista(s, CONFIG.bibliotecaOperacion)) { S.datos = false; S.error = null; return; }
        const driveId = await c.driveDeLista(s, CONFIG.bibliotecaOperacion);
        const leido = await c.leerJsonDeDrive(driveId, CONFIG.archivoServicios, undefined, 512 * 1024);
        if (!leido) { S.datos = false; S.error = null; return; }
        const p = problemaServicios(leido.datos);
        if (p) { S.error = `${CONFIG.archivoServicios}: ${p}`; return; }
        S.datos = leido.datos; S.error = null;
    } catch (e) { S.error = motivo(e); }
}
/** v1.0.0 (cubeta 4): exportada — Inicio la llama para su KPI y «Requiere atención» (la misma lectura única por sesión). */
export function asegurarCarga() {
    if (S.datos !== null || S.cargando || S.error) return;
    S.cargando = cargarServicios().finally(() => { S.cargando = null; alCambiar(); });
}
function volverALeer() { S.datos = null; S.error = null; asegurarCarga(); alCambiar(); }
const BTN_LEER = () => { const r = boton('Volver a leer', 'mn-btn is-sm', volverALeer); r.id = 'btnLeerServicios'; return r; };

const TITULO = { lista: 'Servicios LATINA', ciclo: 'Ciclo de 12 pasos' };
const AYUDA = 'Cada renglón es un expediente de LATINA (PITEPEC) y la barra dice en cuál de los 12 pasos va, de la SOLPED al cobro: azul marino lo hecho, azul el paso actual, rojo si está detenido esperando a alguien y ámbar el paso pasado que quedó a medias. Sale de servicios-en-curso.md (lo lleva /servicio-pitepec) y lo publica la laptop de Carlos; aquí no se edita.';

/** Las tarjetas de estado (leyendo · error · sin archivo · sin acceso) bajo la cabecera de la plantilla. */
function tarjetaEstado(v, id, chipTxt, chipCls, titulo, texto, conBoton = true) {
    soltarIdsFuera(v);
    v.appendChild(cabecera({ id: 'servicios', titulo: TITULO.lista }, vistaDe('servicios'), () => alCambiar()));
    const c = el('section', 'rp-card rp-aviso'); c.id = id;
    if (chipTxt) c.appendChild(chip(chipTxt, chipCls));
    if (titulo) c.appendChild(el('h2', '', titulo));
    c.appendChild(el('p', '', texto));
    if (conBoton) c.appendChild(BTN_LEER());
    v.appendChild(c);
}

/** La barra de 12 segmentos; cada uno dice su paso en el title y en texto para lector de pantalla. */
function barraPasos(e, pasos) {
    const est = estadosPasos(e);
    const b = el('div', 'srv-pasos'); b.setAttribute('role', 'img');
    b.setAttribute('aria-label', `Paso ${e.paso} de ${pasos.length - 1}: ${pasos[e.paso].paso}${e.bloqueado ? ' (detenido)' : ''}`);
    est.forEach((x, i) => { const s = el('i', 'srv-p is-' + x); s.title = `${i} · ${pasos[i].paso} — ${TEXTO_PASO[x]}`; b.appendChild(s); });
    return b;
}
/** La barra de la maqueta (.track); la GRANDE (el detalle) lleva debajo el nombre de cada paso (.trl), el actual en negrita. En la tabla no:
 *  ahí la columna «Paso actual» ya lo dice y a 300 px los rótulos de 12 columnas se cortaban en dos letras. */
function trackPasos(e, pasos, grande = false) {
    const t = el('div', 'srv-track' + (grande ? ' is-grande' : ''));
    t.appendChild(barraPasos(e, pasos));
    if (!grande) return t;
    const r = el('div', 'srv-trl'); r.setAttribute('aria-hidden', 'true');
    pasos.forEach((p, i) => r.appendChild(el('span', i === e.paso ? 'is-actual' : '', `${i}. ${p.paso}`)));
    t.appendChild(r);
    return t;
}
/** La liga a un expediente (#servicios/<E#>): el nombre del renglón, como las ligas punteadas de la maqueta. */
function ligaExpediente(e, texto = `${e.clave} · ${e.tipo} ${e.id}`) {
    const a = el('a', 'rp-lk srv-clave', texto); a.href = '#servicios/' + e.clave; a.dataset.expediente = e.clave; a.title = 'Ver el expediente ' + e.clave;
    return a;
}
const estadoTxt = e => detenido(e) ? chip(e.bloqueado ? 'detenido' : 'un paso a medias', 'danger') : e.paso === N_PASOS - 1 ? chip('en cobro', 'info') : chip('en curso', 'ok');
const hoyDia = () => diaIso(new Date(Date.now() - new Date().getTimezoneOffset() * 60000));

/** #servicios[/<E#>|ciclo]. Pinta en #serviciosCuerpo (cabecera incluida). */
export function pintarServicios() {
    const v = $('serviciosCuerpo'); v.textContent = '';
    if (!puedeVerServicios()) return;
    if (S.datos === null && !S.error) { asegurarCarga(); tarjetaEstado(v, 'serviciosCargando', null, null, '', 'Leyendo los servicios…', false); return; }
    if (S.error) { tarjetaEstado(v, 'serviciosError', 'no se pudo leer', 'danger', '', 'No se pudieron leer los servicios: ' + S.error); return; }
    if (S.datos === false) {
        if (PUEDE.capital(estado.rol)) {
            tarjetaEstado(v, 'serviciosNoHabilitada', 'aún no habilitado', 'warn', 'Todavía no hay servicios publicados',
                `Falta la biblioteca «${CONFIG.bibliotecaOperacion}» en el sitio Administración o el archivo ${CONFIG.archivoServicios} dentro de ella. Lo publica la laptop de Carlos junto con la cobranza (README, «Al publicar v0.168.0»).`);
        } else {
            tarjetaEstado(v, 'serviciosSinAcceso', 'sin acceso', 'warn', 'No tienes acceso a los servicios',
                `Los servicios se leen de la biblioteca «${CONFIG.bibliotecaOperacion}», y tu cuenta no la ve (o todavía no se publican). Pídele a Carlos que te dé lectura.`);
        }
        return;
    }
    const d = S.datos, lista = ordenarServicios(d.expedientes), sub = String(estado.sub || '');
    if (sub === 'ciclo') { pintarCiclo(v, d, lista); return; }
    const e = /^E\d+$/.test(sub) ? lista.find(x => x.clave === sub) : null;
    if (e) { pintarDetalle(v, d, e); return; }
    pintarLista(v, d, lista, /^E\d+$/.test(sub) ? sub : null);
}

/** #servicios: los expedientes (maqueta servicios()): KPIs y la tabla con la barra de 12 pasos. */
function pintarLista(v, d, lista, noEsta) {
    const r = resumenServicios(lista), m = esperaMasLarga(lista, hoyDia());
    pintarReporte(v, {
        id: 'servicios', titulo: TITULO.lista, ayuda: AYUDA, corte: d.generado, subId: 'serviciosSub',
        sub: noEsta ? `No hay un expediente ${noEsta} en el corte publicado: estos son los que hay.` : 'Expedientes de LATINA y en cuál de los 12 pasos va cada uno.',
        kpisId: 'serviciosKpis',
        kpis: () => [
            { clave: 'abiertos', valor: String(r.total), texto: 'Expedientes abiertos' },
            { clave: 'cobro', valor: String(r.cobro), texto: 'En cobro (paso 11)' },
            { clave: 'detenidos', valor: String(r.detenidos), texto: 'Detenidos', clase: r.detenidos ? 'neg' : '', titulo: 'Esperando a alguien o con un paso pasado a medias' },
            { clave: 'espera', valor: m ? `${m.dias} ${plural(m.dias, 'día')}` : '—', texto: m ? `Lo que más espera: ${m.clave}` : 'Sin fecha de espera' },
            { clave: 'pasos', valor: String(N_PASOS), texto: 'Pasos del ciclo' }
        ],
        datos: {
            tablaId: 'serviciosTabla', nombreCsv: 'servicios',
            antesDeMoneda: w => [desplegable({ id: 'serviciosFiltro', opciones: FILTROS_SERVICIOS, actual: w.filtro || 'todos', alElegir: k => { w.filtro = k; alCambiar(); }, titulo: 'Qué expedientes enseña la tabla' })],
            columnas: [{ texto: 'Expediente' }, { texto: 'Avance (12 pasos)', clase: 'rp-izq' }, { texto: 'Paso actual', clase: 'rp-izq' }, { texto: 'Espera a', clase: 'rp-izq' }, { texto: 'Desde' }],
            encima: () => [leyendaPasos()],
            filas: w => filtrarServicios(lista, w.filtro).map(e => {
                const paso = el('span', 'srv-actual-c'); paso.appendChild(el('span', 'srv-paso', `${e.paso} · ${d.pasos[e.paso].paso}`));
                if (e.paso_texto) paso.appendChild(el('span', 'rp-sub', e.paso_texto));
                for (const x of e.rotos || []) paso.appendChild(chip(`paso ${x.paso}: ${x.txt}`, 'danger'));
                const nom = el('span', 'srv-exp'); nom.appendChild(ligaExpediente(e)); nom.appendChild(el('span', 'rp-sub', e.titulo));
                return { clase: 'srv-fila' + (e.bloqueado ? ' is-bloqueado' : ''), datos: { clave: e.clave },
                    celdas: [{ nodo: nom }, { nodo: trackPasos(e, d.pasos), clase: 'srv-avance' }, { nodo: paso, clase: 'srv-actual rp-izq' }, { t: e.espera_a || '—', clase: 'srv-espera rp-izq' }, { t: fechaCorta(e.desde), clase: 'srv-desde' }] };
            }),
            vacio: 'Ningún expediente con ese filtro.',
            despues: () => [guiaPasos(d.pasos)],
            csv: w => ({ columnas: ['Expediente', 'Tipo', 'Folio', 'Título', 'Paso', 'Nombre del paso', 'Detenido', 'Espera a', 'Desde'],
                filas: filtrarServicios(lista, w.filtro).map(e => [e.clave, e.tipo, e.id, e.titulo, e.paso, d.pasos[e.paso].paso, detenido(e) ? 'sí' : 'no', e.espera_a || '', e.desde || '']) }),
            nota: 'Cada renglón sale del expediente en la base de conocimiento (servicios-en-curso.md), que lleva /servicio-pitepec. Aquí no se edita: al avanzar un paso se actualiza allá y se vuelve a publicar. Los importes no se muestran aquí; viven en Finanzas. Toca un expediente para ver sus 12 pasos.',
            pieDeTarjeta: () => [pie()]
        }
    });
}

/** #servicios/<E#>: UN expediente — su barra grande con los nombres de los pasos, sus KPIs y la tabla de sus 12 pasos. */
function pintarDetalle(v, d, e) {
    const est = estadosPasos(e), dias = diasDesdeFecha(e.desde, hoyDia());
    const volver = el('a', 'mn-btn is-sm', '← Todos los expedientes'); volver.href = '#servicios'; volver.id = 'servicioVolver';
    pintarReporte(v, {
        id: 'servicio-detalle', titulo: `Expediente ${e.clave} · ${e.tipo} ${e.id}`, ayuda: AYUDA, corte: d.generado, sub: e.titulo, subId: 'serviciosSub', acciones: [volver],
        antes: () => {
            const card = el('section', 'rp-card rp-graf srv-detalle'); card.id = 'servicioDetalle'; card.dataset.clave = e.clave;
            card.appendChild(trackPasos(e, d.pasos, true));
            card.appendChild(filaKpis([
                { clave: 'paso', valor: `${e.paso} de ${N_PASOS - 1}`, texto: d.pasos[e.paso].paso },
                { clave: 'estado', valor: e.bloqueado ? 'Detenido' : detenido(e) ? 'Un paso a medias' : e.paso === N_PASOS - 1 ? 'En cobro' : 'En curso', texto: 'Estado', clase: detenido(e) ? 'neg' : '' },
                { clave: 'espera', valor: e.espera_a || '—', texto: 'Espera a' },
                { clave: 'desde', valor: e.desde ? fechaCorta(e.desde) : '—', texto: dias === null ? 'Desde' : `Desde · hace ${dias} ${plural(dias, 'día')}` },
                { clave: 'hechos', valor: String(est.filter(x => x === 'hecho' || x === 'rebotado').length), texto: 'Pasos ya hechos' }
            ], 'servicioKpis'));
            return [card];
        },
        datos: {
            tablaId: 'servicioPasosTabla', nombreCsv: 'servicio-' + e.clave.toLowerCase(),
            columnas: [{ texto: 'Paso' }, { texto: 'De quién depende', clase: 'rp-izq' }, { texto: 'Estado' }, { texto: 'Nota', clase: 'rp-izq' }],
            filas: () => d.pasos.map((p, i) => {
                const roto = (e.rotos || []).find(x => x.paso === i), x = est[i];
                const cls = x === 'hecho' ? 'ok' : x === 'actual' ? 'info' : x === 'pendiente' ? null : 'danger';
                return { clase: 'srv-paso-fila is-' + x + (i === e.paso ? ' is-actual' : ''), datos: { paso: String(i) },
                    celdas: [{ t: `${i} · ${p.paso}` }, { t: p.quien || '—', clase: 'rp-izq' }, { nodo: chip(TEXTO_PASO[x], cls) }, { t: roto ? roto.txt : i === e.paso ? (e.paso_texto || '') : '', clase: 'rp-izq' }] };
            }),
            csv: () => ({ columnas: ['Paso', 'Nombre', 'De quién depende', 'Estado', 'Nota'], filas: d.pasos.map((p, i) => { const roto = (e.rotos || []).find(x => x.paso === i); return [i, p.paso, p.quien || '', TEXTO_PASO[est[i]], roto ? roto.txt : i === e.paso ? (e.paso_texto || '') : '']; }) }),
            nota: `Del expediente ${e.clave} en servicios-en-curso.md (lo lleva /servicio-pitepec). Un paso «a medias» es uno ya pasado que se dio por bueno con algo pendiente.`,
            pieDeTarjeta: () => [pie()]
        }
    });
}

/** #servicios/ciclo: cuántos expedientes hay en cada uno de los 12 pasos (barras) y la tabla de los pasos con sus expedientes desplegables. */
function pintarCiclo(v, d, lista) {
    const ciclo = expedientesPorPaso(lista, d.pasos), r = resumenServicios(lista);
    const lleno = ciclo.reduce((a, p) => (p.exps.length > (a ? a.exps.length : 0) ? p : a), null);
    pintarReporte(v, {
        id: 'servicios-ciclo', titulo: TITULO.ciclo, ayuda: 'Los 12 pasos del servicio de PITEPEC a LATINA, de la SOLPED al cobro, y cuántos expedientes hay hoy en cada uno. Un expediente está en UN paso: el que sigue sin hacerse.', corte: d.generado,
        sub: 'Expedientes por paso: dónde se junta el trabajo y de quién depende.', subId: 'serviciosSub',
        grafica: { tipos: false, grano: false, moneda: () => '', decimales: 0, fmtCorto: y => String(y), fmtLargo: y => `${y} ${plural(y, 'expediente')}`, fmtEje: m => (Number.isInteger(m) ? String(m) : ''),
            vacio: 'Sin expedientes en el corte.', datos: () => ({ puntos: ciclo.map(p => ({ etiqueta: String(p.n), y: p.exps.length })) }) },
        kpisId: 'serviciosKpis',
        kpis: () => [
            { clave: 'abiertos', valor: String(r.total), texto: 'Expedientes abiertos' },
            { clave: 'lleno', valor: lleno ? String(lleno.n) : '—', texto: lleno ? `El paso con más: ${lleno.paso}` : 'Ningún paso con expedientes' },
            { clave: 'detenidos', valor: String(r.detenidos), texto: 'Detenidos', clase: r.detenidos ? 'neg' : '' },
            { clave: 'cobro', valor: String(r.cobro), texto: 'En cobro (paso 11)' },
            { clave: 'pasos', valor: String(N_PASOS), texto: 'Pasos del ciclo' }
        ],
        datos: {
            tablaId: 'serviciosCicloTabla', nombreCsv: 'servicios-ciclo',
            columnas: [{ texto: 'Paso' }, { texto: 'De quién depende', clase: 'rp-izq' }, { texto: 'Expedientes' }, { texto: 'Detenidos' }],
            filas: () => ciclo.map(p => ({ clave: 'paso' + p.n, clase: 'srv-ciclo-fila', datos: { paso: String(p.n) },
                celdas: [{ t: `${p.n} · ${p.paso}`, lk: p.exps.length > 0 }, { t: p.quien || '—', clase: 'rp-izq' }, p.exps.length ? { t: '', n: p.exps.length } : null, p.detenidos ? { t: '', n: p.detenidos, rojo: true } : null],
                hijos: p.exps.map(e => ({ celdas: [{ nodo: ligaExpediente(e, `${e.clave} · ${e.titulo}`) }, { t: e.espera_a ? 'Espera a ' + e.espera_a : '—', clase: 'rp-izq' }, { nodo: estadoTxt(e) }, { t: fechaCorta(e.desde) }] })) })),
            pie: () => [{ celdas: [{ t: 'Total', lk: true }, '', { t: '', n: r.total }, r.detenidos ? { t: '', n: r.detenidos, rojo: true } : null] }],
            csv: () => ({ columnas: ['Paso', 'Nombre', 'De quién depende', 'Expedientes', 'Detenidos', 'Claves'], filas: ciclo.map(p => [p.n, p.paso, p.quien || '', p.exps.length, p.detenidos, p.exps.map(e => e.clave).join(' ')]) }),
            nota: 'El número azul es cuántos expedientes están en ese paso; el rojo, cuántos de ellos están detenidos. Toca un paso para ver sus expedientes.',
            pieDeTarjeta: () => [pie()]
        }
    });
}

function leyendaPasos() {
    const ley = el('div', 'srv-leyenda'); ley.setAttribute('aria-hidden', 'true');
    for (const x of ['hecho', 'actual', 'bloqueado', 'rebotado', 'pendiente']) { const s = el('span', 'srv-ley'); s.appendChild(el('i', 'srv-p is-' + x)); s.appendChild(document.createTextNode(TEXTO_PASO[x])); ley.appendChild(s); }
    return ley;
}
/** Los 12 pasos con quién depende: la referencia que en el celular no da el title de cada segmento. */
function guiaPasos(pasos) {
    const det = el('details', 'srv-guia'); det.id = 'serviciosPasos';
    det.appendChild(el('summary', '', 'Los 12 pasos y de quién depende cada uno'));
    const ol = el('ol', 'srv-guia-lista'); ol.start = 0;
    for (const p of pasos) { const li = el('li'); li.appendChild(el('span', '', p.paso)); li.appendChild(el('span', 'rp-sub', p.quien)); ol.appendChild(li); }
    det.appendChild(ol);
    return det;
}
function pie() {
    const p = el('div', 'rp-pie-card');
    const a = el('a', 'mn-btn is-sm is-ghost', 'Ciclo de 12 pasos'); a.href = '#servicios/ciclo';
    if (estado.sub !== 'ciclo') p.appendChild(a);
    p.appendChild(BTN_LEER());
    return p;
}
