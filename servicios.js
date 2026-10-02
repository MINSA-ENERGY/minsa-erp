// MINSA ERP v0.168.0 — SERVICIOS (Carlos, 2-oct: «lo ven Lorena y José»; maqueta https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn).
// Un renglón por expediente de LATINA (PITEPEC) y en cuál de los 12 pasos va, de la SOLPED al cobro.
//   - SOLO LEE: servicios.json de la biblioteca CONFIG.bibliotecaOperacion (sitio Administracion), que publica la laptop
//     (docs/publicar-cobranza.ps1 v1.2.0+, con .claude/skills/_compartido/scripts/servicios.py sobre servicios-en-curso.md).
//   - La ven gerencia y colaborador (PUEDE.tarea). Quien lee de verdad lo decide SharePoint: ERP_Operacion va sin herencia,
//     con lectura para Lorena, José y gerencia. A quien no la ve, SharePoint le esconde la biblioteca entera, asi que «no hay
//     biblioteca» se dice distinto a gerencia (falta publicar) y a colaborador (falta permiso).
//   - Sin montos: el JSON no los trae a proposito (test/servicios.test.js lo vigila); el dinero vive en Finanzas.
//   - Se lee la PRIMERA vez que se entra a #servicios en la sesion y con «Volver a leer»; el refresco de 2 min no lo toca.
// Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { PUEDE } from './reglas.js';
import { $, estado, el, boton, chip } from './comun.js';
import { problemaServicios, estadosPasos, ordenarServicios, resumenServicios, fechaCorta, SERVICIOS_VIEJA_DIAS } from './servicios-reglas.js';
import { diasDesde } from './cobranza-reglas.js';

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
function asegurarCarga() {
    if (S.datos !== null || S.cargando || S.error) return;
    S.cargando = cargarServicios().finally(() => { S.cargando = null; alCambiar(); });
}
function volverALeer() { S.datos = null; S.error = null; asegurarCarga(); alCambiar(); }

function tarjetaAviso(v, id, chipTxt, chipCls, titulo, texto) {
    const c = el('section', 'mn-card'); c.id = id;
    c.appendChild(chip(chipTxt, chipCls));
    if (titulo) c.appendChild(el('h2', '', titulo));
    c.appendChild(el('p', '', texto));
    const r = boton('Volver a leer', 'mn-btn', volverALeer); r.id = 'btnLeerServicios'; c.appendChild(r);
    v.appendChild(c);
}

const TXT_ESTADO = { hecho: 'hecho', actual: 'en curso', bloqueado: 'esperando', rebotado: 'quedó a medias', pendiente: 'pendiente' };

/** La barra de 12 segmentos; cada uno dice su paso en el title y en texto para lector de pantalla. */
function barraPasos(e, pasos) {
    const est = estadosPasos(e);
    const b = el('div', 'srv-pasos'); b.setAttribute('role', 'img');
    b.setAttribute('aria-label', `Paso ${e.paso} de ${pasos.length - 1}: ${pasos[e.paso].paso}`);
    est.forEach((x, i) => { const s = el('i', 'srv-p is-' + x); s.title = `${i} · ${pasos[i].paso} — ${TXT_ESTADO[x]}`; b.appendChild(s); });
    return b;
}

/** #servicios. Pinta en #serviciosCuerpo; la cabecera es fija (index.html). */
export function pintarServicios() {
    const v = $('serviciosCuerpo'); v.textContent = '';
    if (!puedeVerServicios()) return;
    if (S.datos === null && !S.error) {
        asegurarCarga();
        const c = el('section', 'mn-card'); c.id = 'serviciosCargando'; c.appendChild(el('p', 'muted', 'Leyendo los servicios…')); v.appendChild(c);
        return;
    }
    if (S.error) { tarjetaAviso(v, 'serviciosError', 'no se pudo leer', 'danger', '', 'No se pudieron leer los servicios: ' + S.error); return; }
    if (S.datos === false) {
        if (PUEDE.capital(estado.rol)) {
            tarjetaAviso(v, 'serviciosNoHabilitada', 'aún no habilitado', 'warn', 'Todavía no hay servicios publicados',
                `Falta la biblioteca «${CONFIG.bibliotecaOperacion}» en el sitio Administración o el archivo ${CONFIG.archivoServicios} dentro de ella. Lo publica la laptop de Carlos junto con la cobranza (README, «Al publicar v0.168.0»).`);
        } else {
            tarjetaAviso(v, 'serviciosSinAcceso', 'sin acceso', 'warn', 'No tienes acceso a los servicios',
                `Los servicios se leen de la biblioteca «${CONFIG.bibliotecaOperacion}», y tu cuenta no la ve (o todavía no se publican). Pídele a Carlos que te dé lectura.`);
        }
        return;
    }
    const d = S.datos;
    const lista = ordenarServicios(d.expedientes);
    const r = resumenServicios(lista);
    const dias = diasDesde(d.generado);
    const corte = new Date(d.generado).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    $('serviciosSub').textContent = `Expedientes de LATINA y en cuál de los 12 pasos va cada uno. Corte del ${corte}.`;

    const kpis = el('div', 'cob-kpis'); kpis.id = 'serviciosKpis';
    const kpi = (k, val, pie) => { const c = el('div', 'mn-card cob-kpi'); c.appendChild(el('span', 'cob-k', k)); c.appendChild(el('b', 'cob-v mn-mono', String(val))); const p = el('div', 'cob-pie'); if (pie) p.appendChild(pie); c.appendChild(p); kpis.appendChild(c); return c; };
    kpi('Expedientes abiertos', r.total, null);
    kpi('En cobro (paso 11)', r.cobro, null);
    kpi('Detenidos', r.detenidos, r.detenidos ? chip('esperan a alguien', 'warn') : chip('ninguno', 'ok'));
    const f = kpi('Antigüedad del corte', `${dias} ${dias === 1 ? 'día' : 'días'}`, dias >= SERVICIOS_VIEJA_DIAS ? chip('corte viejo: re-publicar', 'warn') : chip('al día', 'ok'));
    f.id = 'serviciosCorte';
    v.appendChild(kpis);

    const ley = el('div', 'srv-leyenda'); ley.setAttribute('aria-hidden', 'true');
    for (const x of ['hecho', 'actual', 'bloqueado', 'rebotado', 'pendiente']) { const s = el('span', 'srv-ley'); s.appendChild(el('i', 'srv-p is-' + x)); s.appendChild(document.createTextNode(TXT_ESTADO[x])); ley.appendChild(s); }
    v.appendChild(ley);

    const caja = el('section', 'mn-card cob-caja');
    const tabla = el('table', 'cob-tabla srv-tabla'); tabla.id = 'serviciosTabla';
    const th = el('tr');
    for (const t of ['Expediente', 'Avance', 'Paso actual', 'Espera a', 'Último mov.']) { const c = el('th', '', t); c.scope = 'col'; th.appendChild(c); }
    const thead = el('thead'); thead.appendChild(th); tabla.appendChild(thead);
    const tbody = el('tbody');
    for (const e of lista) {
        const tr = el('tr', 'srv-fila' + (e.bloqueado ? ' is-bloqueado' : '')); tr.dataset.clave = e.clave;
        const tdE = el('td', 'srv-exp'); tdE.appendChild(el('span', 'srv-clave', `${e.clave} · ${e.tipo} ${e.id}`)); tdE.appendChild(el('span', 'cob-sub', e.titulo)); tr.appendChild(tdE);
        const tdA = el('td', 'srv-avance'); tdA.appendChild(barraPasos(e, d.pasos)); tr.appendChild(tdA);
        const tdP = el('td', 'srv-actual'); tdP.appendChild(el('span', 'srv-paso', `${e.paso} · ${d.pasos[e.paso].paso}`));
        if (e.paso_texto) tdP.appendChild(el('span', 'cob-sub', e.paso_texto));
        for (const x of e.rotos || []) tdP.appendChild(chip(`paso ${x.paso}: ${x.txt}`, 'danger'));
        tr.appendChild(tdP);
        tr.appendChild(el('td', 'srv-espera', e.espera_a || '—'));
        tr.appendChild(el('td', 'mn-mono srv-desde', fechaCorta(e.desde)));
        tbody.appendChild(tr);
    }
    tabla.appendChild(tbody);
    caja.appendChild(tabla);
    v.appendChild(caja);

    // Los 12 pasos con quién depende: la referencia que en el celular no da el title de cada segmento.
    const det = el('details', 'mn-card srv-guia'); det.id = 'serviciosPasos';
    det.appendChild(el('summary', '', 'Los 12 pasos y de quién depende cada uno'));
    const ol = el('ol', 'srv-guia-lista'); ol.start = 0;
    for (const p of d.pasos) { const li = el('li'); li.appendChild(el('span', '', p.paso)); li.appendChild(el('span', 'cob-sub', p.quien)); ol.appendChild(li); }
    det.appendChild(ol);
    v.appendChild(det);

    v.appendChild(el('p', 'muted cob-nota', 'Cada renglón sale del expediente en la base de conocimiento (servicios-en-curso.md), que lleva /servicio-pitepec. Aquí no se edita: al avanzar un paso se actualiza allá y se vuelve a publicar. Los importes no se muestran aquí; viven en Finanzas.'));
    const pie = el('div', 'cob-acciones');
    const b = boton('Volver a leer', 'mn-btn is-sm', volverALeer); b.id = 'btnLeerServicios'; pie.appendChild(b);
    v.appendChild(pie);
}
