// MINSA ERP v1.0.0 — INICIO, la parte nueva en DOM (rediseño 2026-10-02, cubeta 4; plan «Contenido por módulo › Inicio»; maqueta V.ini):
// la cabecera de la plantilla con el saludo, la fila de KPIs POR ROL (cada uno abre su reporte; lo que sale de un JSON lleva su corte o dice
// «sin datos») y los datos publicados que comparten Inicio, «Requiere atención» y Preguntar. La cola de siempre («Requiere atención») sigue en
// app.js; las cuentas viven en inicio-reglas.js (puras, con prueba). Nada de innerHTML: el() / textContent.

import { CONFIG } from './config.js';
import { PUEDE, plural, diaDe } from './reglas.js';
import { $, estado, el, activos } from './comun.js';
import { estadoServicios, asegurarCarga as asegurarServicios } from './servicios.js';
import { estadoCompras, asegurarCarga as asegurarCompras } from './compras.js';
import { estadoVigencias, asegurarCarga as asegurarVigencias } from './vigencias.js';
import { estadoCobranza, asegurarCarga as asegurarCobranza } from './cobranza.js';
import { kpisInicio, atencionDeOperacion } from './inicio-reglas.js';
import { cabecera, vistaDe, soltarIdsFuera } from './reporte.js';
import { colorCorte, fechaCorta, diasDelCorte } from './reporte-reglas.js';

let irARuta = () => {};
/** app.js pasa su navegación (un KPI lleva a la ruta de su reporte, como una liga pegada). */
export function fijarNavInicio(fn) { irARuta = fn; }

/**
 * Los JSON publicados que la persona puede ver, como { datos, error } (inicio-reglas.js y preguntar-reglas.js los leen así). Con `cargar`,
 * pide la lectura única por sesión de cada módulo (la misma que hace su página). Una biblioteca que el catálogo de listas de la sesión NO trae
 * cuenta como «no hay» sin preguntarle nada a Graph (ni un GET /lists de más: C-01).
 */
export function datosPublicados(cargar = false) {
    const g = PUEDE.capital(estado.rol), t = PUEDE.tarea(estado.rol), c = estado.cliente;
    const hay = nombre => !c || typeof c.urlDeLista !== 'function' || !!c.urlDeLista(nombre);
    const de = (puede, st, bib, asegurar) => {
        if (!puede) return { datos: false, error: null };
        if (st.datos === null && !st.error && !hay(bib)) return { datos: false, error: null };
        if (cargar && estado.sesion && st.datos === null && !st.error) asegurar();
        return { datos: st.datos, error: st.error };
    };
    return {
        cobranza: de(g, estadoCobranza(), CONFIG.bibliotecaDatos, asegurarCobranza),
        vigencias: de(g, estadoVigencias(), CONFIG.bibliotecaDatos, asegurarVigencias),
        servicios: de(t, estadoServicios(), CONFIG.bibliotecaOperacion, asegurarServicios),
        compras: de(t, estadoCompras(), CONFIG.bibliotecaOperacion, asegurarCompras)
    };
}
/** El contexto de las reglas de Inicio y de Preguntar: el rol, las fechas, lo de las listas y los JSON publicados. */
export function contextoDatos(cargar = false) {
    const hoy = new Date();
    return { rol: estado.rol, yo: estado.cuenta && estado.cuenta.username, hoy, hoyDia: diaDe(hoy), tareas: estado.tareas, proyectos: estado.proyectos, roles: estado.roles,
        actividad: estado.actividad, sinMovimientoDias: CONFIG.sinMovimientoDias, aparte: CONFIG.porPagarAparte || {}, ...datosPublicados(cargar) };   // aparte: vuelta 1 (Preguntar como la página)
}

const AYUDA_INICIO = 'Arriba, los indicadores de los módulos que ves (cada uno abre su reporte; los que salen de un archivo publicado traen su corte). «Requiere atención» junta lo que pide algo hoy: tus vencidas y lo de hoy, lo nuevo para ti y las menciones, las tarjetas sin dueño y, según tu rol, servicios detenidos o en cobro, vigencias a 30 días o menos, órdenes de compra que no cuadran y frentes sin movimiento. Lo de esta semana y después vive en Mis tareas.';

/** La cabecera de la plantilla con el SALUDO (#inicioSaludo) y su subtítulo (#inicioSub: fecha · frentes activos · rol). */
export function pintarCabeceraInicio(saludo, sub, rol) {
    const cont = $('inicioCab');
    soltarIdsFuera(cont);
    cont.textContent = '';
    cont.appendChild(cabecera({ id: 'inicio', titulo: saludo, ayuda: AYUDA_INICIO, sub: ' ', subId: 'inicioSub' }, vistaDe('inicio'), () => {}));
    const h = cont.querySelector('.rp-h'); if (h) h.id = 'inicioSaludo';
    const p = $('inicioSub'); p.textContent = sub; p.appendChild(el('span', 'rol-sub', ` · ${rol}`));   // U-08: el rol en su span; en celular la barra ya lo dice y .rol-sub se oculta
}

/** La fila de KPIs por rol (maqueta V.ini): un botón por KPI que lleva a su reporte; el corte (verde / ámbar > 8 días / rojo > 15) o «sin datos». */
export function pintarKpisInicio(abiertas) {
    const ctx = contextoDatos(true);
    const ks = kpisInicio({ ...ctx, abiertas });
    const f = $('inicioKpis'); f.textContent = '';
    for (const k of ks) {
        const b = el('button', 'rp-kpi ini-kpi' + (k.estado !== 'datos' ? ' is-sin' : '')); b.type = 'button'; b.dataset.kpi = k.clave; b.dataset.ir = k.ir;
        b.appendChild(el('b', k.clase || '', k.valor));
        b.appendChild(el('small', '', k.texto));
        let pie = '';
        if (k.corte) {
            const dias = diasDelCorte(k.corte);   // v1.0.0 (vuelta 1): la MISMA cuenta que el chip de la página (antes: desde el mediodía)
            const c = el('span', 'ini-corte is-' + colorCorte(dias), `corte: ${fechaCorta(k.corte)}`); c.title = dias === 0 ? 'Publicado hoy' : `Publicado hace ${dias} ${plural(dias, 'día')}${dias > 8 ? ': hay que re-publicar' : ''}`; b.appendChild(c);
            pie = c.textContent;
        } else if (k.estado !== 'datos') { const s = el('span', 'ini-corte is-sin', k.estado === 'leyendo' ? 'leyendo…' : 'sin datos'); b.appendChild(s); pie = s.textContent; }
        b.title = [k.titulo, `Abre ${k.ir}`].filter(Boolean).join(' · ');
        b.setAttribute('aria-label', [k.valor === '…' || k.valor === '—' ? '' : k.valor, k.texto, pie].filter(Boolean).join(' · '));
        b.addEventListener('click', () => irARuta(k.ir));
        f.appendChild(b);
    }
    $('inicioKpisCard').dataset.n = String(ks.length);
}

/** Los renglones de «Requiere atención» que salen de los JSON publicados y de la bitácora, para el rol (inicio-reglas.js). */
export function atencionDeInicio() {
    const ctx = contextoDatos(false);
    return atencionDeOperacion({ ...ctx, proyectos: activos() });
}
