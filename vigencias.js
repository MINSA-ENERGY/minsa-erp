// MINSA ERP v0.166.0 — VIGENCIAS (Carlos, 2-oct; maqueta https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn).
// Documentos que caducan, ordenados por fecha: permisos, fianzas, certificaciones, registros y plazos de contratos. No reemplaza
// a los pendientes del Tablero. Solo gerencia (PUEDE.capital): trae plazos y montos de contratos, y vive en ERP_Datos.
//   - SOLO LEE: vigencias.json de la biblioteca CONFIG.bibliotecaDatos, que publica la laptop (docs/publicar-cobranza.ps1, con
//     .claude/skills/_compartido/scripts/vigencias.py sobre los marcadores `> 📅 **VIGENCIA**` de la KB).
//   - Se lee la PRIMERA vez que se entra a #vigencias en la sesion y con «Volver a leer»; el refresco de 2 min no lo toca.
//     Los dias se cuentan en cada pintada, contra hoy.
//   - Degrada: sin biblioteca o sin archivo lo dice y el resto de la app sigue igual.
// Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { PUEDE } from './reglas.js';
import { $, estado, el, boton, chip } from './comun.js';
import { problemaVigencias, ordenarVigencias, resumenVigencias, chipFaltan, fechaVigencia, VIGENCIAS_VIEJA_DIAS, VIG_ROJO, VIG_AMBAR } from './vigencias-reglas.js';
import { diasDesde } from './cobranza-reglas.js';

/** datos: null = no leido · false = no hay biblioteca/archivo · objeto = el JSON valido. error: la lectura fallo. */
const V = { datos: null, error: null, cargando: null };
export const estadoVigencias = () => V;
let alCambiar = () => {};
export function alCambiarVigencias(fn) { alCambiar = fn; }
export const puedeVerVigencias = () => PUEDE.capital(estado.rol);
const motivo = e => (e && e.message ? e.message : String(e));

export async function cargarVigencias() {
    const c = estado.cliente, s = estado.siteId;
    try {
        if (!await c.existeLista(s, CONFIG.bibliotecaDatos)) { V.datos = false; V.error = null; return; }
        const driveId = await c.driveDeLista(s, CONFIG.bibliotecaDatos);
        const leido = await c.leerJsonDeDrive(driveId, CONFIG.archivoVigencias, undefined, 512 * 1024);
        if (!leido) { V.datos = false; V.error = null; return; }
        const p = problemaVigencias(leido.datos);
        if (p) { V.error = `${CONFIG.archivoVigencias}: ${p}`; return; }
        V.datos = leido.datos; V.error = null;
    } catch (e) { V.error = motivo(e); }
}
function asegurarCarga() {
    if (V.datos !== null || V.cargando || V.error) return;
    V.cargando = cargarVigencias().finally(() => { V.cargando = null; alCambiar(); });
}
function volverALeer() { V.datos = null; V.error = null; asegurarCarga(); alCambiar(); }

function tarjetaAviso(v, id, chipTxt, chipCls, titulo, texto) {
    const c = el('section', 'mn-card'); c.id = id;
    c.appendChild(chip(chipTxt, chipCls));
    if (titulo) c.appendChild(el('h2', '', titulo));
    c.appendChild(el('p', '', texto));
    const r = boton('Volver a leer', 'mn-btn', volverALeer); r.id = 'btnLeerVigencias'; c.appendChild(r);
    v.appendChild(c);
}

/** #vigencias. Pinta en #vigenciasCuerpo; la cabecera es fija (index.html). */
export function pintarVigencias() {
    const v = $('vigenciasCuerpo'); v.textContent = '';
    if (!puedeVerVigencias()) return;
    if (V.datos === null && !V.error) {
        asegurarCarga();
        const c = el('section', 'mn-card'); c.id = 'vigenciasCargando'; c.appendChild(el('p', 'muted', 'Leyendo las vigencias…')); v.appendChild(c);
        return;
    }
    if (V.error) { tarjetaAviso(v, 'vigenciasError', 'no se pudo leer', 'danger', '', 'No se pudieron leer las vigencias: ' + V.error); return; }
    if (V.datos === false) {
        tarjetaAviso(v, 'vigenciasNoHabilitada', 'aún no habilitado', 'warn', 'Todavía no hay vigencias publicadas',
            `Falta la biblioteca «${CONFIG.bibliotecaDatos}» en el sitio Administración o el archivo ${CONFIG.archivoVigencias} dentro de ella. Lo publica la laptop de Carlos junto con la cobranza (README, «Al publicar v0.166.0»).`);
        return;
    }
    const d = V.datos;
    const lista = ordenarVigencias(d.vigencias);
    const r = resumenVigencias(lista);
    const dias = diasDesde(d.generado);
    const corte = new Date(d.generado).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    $('vigenciasSub').textContent = `Documentos que caducan, el más próximo primero. Corte del ${corte}.`;

    // Resumen: lo que ya vencio, lo que entra en rojo y en ambar, y la frescura del corte
    const kpis = el('div', 'cob-kpis'); kpis.id = 'vigenciasKpis';
    const kpi = (k, val, pie) => { const c = el('div', 'mn-card cob-kpi'); c.appendChild(el('span', 'cob-k', k)); c.appendChild(el('b', 'cob-v mn-mono', String(val))); const p = el('div', 'cob-pie'); if (pie) p.appendChild(pie); c.appendChild(p); kpis.appendChild(c); return c; };
    kpi('Vencidas', r.vencidas, r.vencidas ? chip('renovar ya', 'danger') : chip('ninguna', 'ok'));
    kpi(`Vencen en ${VIG_ROJO} días o menos`, r.rojo, r.rojo ? chip('urgente', 'danger') : null);
    kpi(`Vencen en ${VIG_AMBAR} días o menos`, r.ambar, r.ambar ? chip('preparar la renovación', 'warn') : null);
    const f = kpi('Antigüedad del corte', `${dias} ${dias === 1 ? 'día' : 'días'}`, dias >= VIGENCIAS_VIEJA_DIAS ? chip('corte viejo: re-publicar', 'warn') : chip('al día', 'ok'));
    f.id = 'vigenciasCorte';
    v.appendChild(kpis);

    const caja = el('section', 'mn-card cob-caja');
    const tabla = el('table', 'cob-tabla vig-tabla'); tabla.id = 'vigenciasTabla';
    const th = el('tr');
    for (const t of ['Vence', 'Qué', 'Unidad', 'Responsable', 'Faltan']) { const c = el('th', '', t); c.scope = 'col'; th.appendChild(c); }
    const thead = el('thead'); thead.appendChild(th); tabla.appendChild(thead);
    const tbody = el('tbody');
    for (const x of lista) {
        const tr = el('tr', 'vig-fila' + (x.dias < 0 ? ' is-vencida' : ''));
        tr.appendChild(el('td', 'mn-mono vig-vence', fechaVigencia(x.vence)));
        const tdQ = el('td', 'vig-que'); tdQ.appendChild(el('span', 'vig-titulo', x.titulo));
        if (x.nota) tdQ.appendChild(el('span', 'cob-sub', x.nota));
        tr.appendChild(tdQ);
        tr.appendChild(el('td', 'vig-unidad', x.unidad || '—'));
        tr.appendChild(el('td', 'vig-resp' + (x.responsable ? '' : ' is-vacio'), x.responsable || '—'));
        const tdF = el('td', 'vig-faltan'); const cf = chipFaltan(x.dias); tdF.appendChild(chip(cf.texto, cf.clase)); tr.appendChild(tdF);
        tbody.appendChild(tr);
    }
    tabla.appendChild(tbody);
    caja.appendChild(tabla);
    v.appendChild(caja);
    v.appendChild(el('p', 'muted cob-nota', 'Cada renglón sale de un marcador «📅 VIGENCIA» de la base de conocimiento, pegado al documento que describe. Al renovarse se cambia su fecha allá y se vuelve a publicar; aquí no se edita. Los días se cuentan hoy, no al publicar. Las acciones con fecha (agendar la auditoría, ingresar la renovación) siguen en el Tablero de pendientes.'));
    const pie = el('div', 'cob-acciones');
    const b = boton('Volver a leer', 'mn-btn is-sm', volverALeer); b.id = 'btnLeerVigencias'; pie.appendChild(b);
    v.appendChild(pie);
}
