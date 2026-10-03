// MINSA ERP v0.166.0 — VIGENCIAS (Carlos, 2-oct; maqueta https://claude.ai/artifact/HV1C5pzxGUKE7LBoDTnbTn).
// Documentos que caducan, ordenados por fecha: permisos, fianzas, certificaciones, registros y plazos de contratos. No reemplaza
// a los pendientes del Tablero. Solo gerencia (PUEDE.capital): trae plazos y montos de contratos, y vive en ERP_Datos.
//   - SOLO LEE: vigencias.json de la biblioteca CONFIG.bibliotecaDatos, que publica la laptop (docs/publicar-cobranza.ps1, con
//     .claude/skills/_compartido/scripts/vigencias.py sobre los marcadores `> 📅 **VIGENCIA**` de la KB).
//   - Se lee la PRIMERA vez que se entra a #vigencias en la sesion y con «Volver a leer»; el refresco de 2 min no lo toca.
//     Los dias se cuentan en cada pintada, contra hoy.
//   - Degrada: sin biblioteca o sin archivo lo dice y el resto de la app sigue igual.
// v1.0.0 (rediseño 2026-10-02, cubeta 3; plan «Operación»; maqueta maqueta-reportes.html, V.vig): «Lo que vence» con la plantilla de reporte —
// KPIs, «Datos del reporte» con el desplegable de unidad y la etiqueta de días de cada documento, CSV; el corte del JSON en el chip de la
// cabecera (ámbar > 8 días, rojo > 15).
// Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { PUEDE, plural } from './reglas.js';
import { $, estado, el, boton, chip } from './comun.js';
import { problemaVigencias, ordenarVigencias, resumenVigencias, chipFaltan, fechaVigencia, VIG_ROJO, VIG_AMBAR, VIG_ATENCION, unidadesDe, filtrarVigencias, siguienteVigencia } from './vigencias-reglas.js';
import { pintarReporte, cabecera, vistaDe, soltarIdsFuera, desplegable } from './reporte.js';

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
/** v1.0.0 (cubeta 4): exportada — Inicio la llama para su KPI y «Requiere atención» (la misma lectura única por sesión). */
export function asegurarCarga() {
    if (V.datos !== null || V.cargando || V.error) return;
    V.cargando = cargarVigencias().finally(() => { V.cargando = null; alCambiar(); });
}
function volverALeer() { V.datos = null; V.error = null; asegurarCarga(); alCambiar(); }
const BTN_LEER = () => { const r = boton('Volver a leer', 'mn-btn is-sm', volverALeer); r.id = 'btnLeerVigencias'; return r; };

const TITULO = 'Lo que vence';
const AYUDA = `Documentos que caducan —permisos, fianzas, certificaciones, registros y plazos de contratos—, el más próximo primero. Cada renglón sale de un marcador «📅 VIGENCIA» de la base de conocimiento. Los días se cuentan hoy, no al publicar: en rojo lo vencido o lo que vence en ${VIG_ROJO} días o menos, en ámbar en ${VIG_AMBAR} o menos.`;

function tarjetaEstado(v, id, chipTxt, chipCls, titulo, texto, conBoton = true) {
    soltarIdsFuera(v);
    v.appendChild(cabecera({ id: 'vigencias', titulo: TITULO }, vistaDe('vigencias'), () => alCambiar()));
    const c = el('section', 'rp-card rp-aviso'); c.id = id;
    if (chipTxt) c.appendChild(chip(chipTxt, chipCls));
    if (titulo) c.appendChild(el('h2', '', titulo));
    c.appendChild(el('p', '', texto));
    if (conBoton) c.appendChild(BTN_LEER());
    v.appendChild(c);
}

/** #vigencias. Pinta en #vigenciasCuerpo (cabecera incluida). */
export function pintarVigencias() {
    const v = $('vigenciasCuerpo'); v.textContent = '';
    if (!puedeVerVigencias()) return;
    if (V.datos === null && !V.error) { asegurarCarga(); tarjetaEstado(v, 'vigenciasCargando', null, null, '', 'Leyendo las vigencias…', false); return; }
    if (V.error) { tarjetaEstado(v, 'vigenciasError', 'no se pudo leer', 'danger', '', 'No se pudieron leer las vigencias: ' + V.error); return; }
    if (V.datos === false) {
        tarjetaEstado(v, 'vigenciasNoHabilitada', 'aún no habilitado', 'warn', 'Todavía no hay vigencias publicadas',
            `Falta la biblioteca «${CONFIG.bibliotecaDatos}» en el sitio Administración o el archivo ${CONFIG.archivoVigencias} dentro de ella. Lo publica la laptop de Carlos junto con la cobranza (README, «Al publicar v0.166.0»).`);
        return;
    }
    const d = V.datos, todas = ordenarVigencias(d.vigencias), unidades = unidadesDe(todas), w = vistaDe('vigencias');
    if (w.unidad && !unidades.includes(w.unidad)) w.unidad = null;
    const de = x => filtrarVigencias(todas, x.unidad || null);
    pintarReporte(v, {
        id: 'vigencias', titulo: TITULO, ayuda: AYUDA, corte: d.generado, sub: `${todas.length} ${plural(todas.length, 'documento que caduca', 'documentos que caducan')}, el más próximo primero.`, subId: 'vigenciasSub',
        kpisId: 'vigenciasKpis',
        kpis: x => {
            const ls = de(x), r = resumenVigencias(ls), sig = siguienteVigencia(ls);
            return [
                { clave: 'vencidas', valor: String(r.vencidas), texto: plural(r.vencidas, 'Vencida', 'Vencidas'), clase: r.vencidas ? 'neg' : '' },
                { clave: 'rojo', valor: String(r.rojo), texto: `Vencen en ${VIG_ROJO} días o menos`, clase: r.rojo ? 'neg' : '' },
                { clave: 'ambar', valor: String(r.ambar), texto: `Vencen en ${VIG_AMBAR} días o menos` },
                { clave: 'siguiente', valor: sig ? fechaVigencia(sig.vence) : '—', texto: sig ? `La siguiente: ${sig.titulo}` : 'Nada por vencer', titulo: sig ? sig.titulo : '' },
                // v1.0.0 (vuelta 1, revisión UI/UX «media»): la cifra del KPI de Inicio («vencidas o a ≤ 30 días») está aquí; el total pasó al subtítulo
                { clave: 'atencion', valor: String(r.atencion), texto: `Vencidas o a ≤ ${VIG_ATENCION} días`, clase: r.vencidas ? 'neg' : '' }
            ];
        },
        datos: {
            tablaId: 'vigenciasTabla', nombreCsv: 'vigencias',
            antesDeMoneda: x => [desplegable({ id: 'vigenciasUnidad', titulo: 'De qué unidad',
                opciones: [{ clave: '', texto: 'Todas las unidades' }, ...unidades.map(u => ({ clave: u, texto: u }))], actual: x.unidad || '', alElegir: k => { x.unidad = k || null; alCambiar(); } })],
            columnas: [{ texto: 'Qué' }, { texto: 'Vence' }, { texto: 'Unidad' }, { texto: 'Responsable' }, { texto: 'Faltan' }],
            filas: x => de(x).map(g => {
                const que = el('span', 'vig-que'); que.appendChild(el('span', 'vig-titulo', g.titulo));
                if (g.nota) que.appendChild(el('span', 'rp-sub', g.nota));
                const cf = chipFaltan(g.dias);
                return { clase: 'vig-fila' + (g.dias < 0 ? ' is-vencida' : ''), datos: { dias: String(g.dias) },
                    celdas: [{ nodo: que }, { t: fechaVigencia(g.vence), clase: 'vig-vence' }, { t: g.unidad || '—', clase: 'vig-unidad' }, { t: g.responsable || '—', clase: 'vig-resp' + (g.responsable ? '' : ' is-vacio') }, { nodo: chip(cf.texto, cf.clase), clase: 'vig-faltan' }] };
            }),
            vacio: 'Ninguna vigencia de esa unidad.',
            csv: x => ({ columnas: ['Qué', 'Vence', 'Días', 'Unidad', 'Responsable', 'Nota', 'Archivo'], filas: de(x).map(g => [g.titulo, g.vence, g.dias, g.unidad || '', g.responsable || '', g.nota || '', g.archivo || '']) }),
            nota: 'Cada renglón sale de un marcador «📅 VIGENCIA» de la base de conocimiento, pegado al documento que describe. Al renovarse se cambia su fecha allá y se vuelve a publicar; aquí no se edita. Los días se cuentan hoy, no al publicar. Las acciones con fecha (agendar la auditoría, ingresar la renovación) siguen en el Tablero de pendientes.',
            pieDeTarjeta: () => { const p = el('div', 'rp-pie-card'); p.appendChild(BTN_LEER()); return [p]; }
        }
    });
}
