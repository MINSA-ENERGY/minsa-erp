// Chat por proyecto (v0.8.0, Carlos 2026-09-12): UNA conversacion por frente, para que todos lean lo
// mismo — «no sé si el archivo que adjunté es el correcto, favor de checar @francisco». Es la misma
// lista PROY_Actividad con Accion=comentar: el comentario del proyecto va SIN TareaId, y las notas
// de las tarjetas (F5) salen en el mismo hilo con su chip, asi que nada se escribe dos veces ni hay
// esquema nuevo. El tope sigue siendo el de un renglon de bitacora (Title, 250 caracteres).
//
// Menciones: `@francisco` se resuelve contra PROY_Roles (reglas.js: primer nombre, nombre.apellido o
// la parte local del correo, sin acentos). Se pintan como chip, la propia lleva `is-yo`, e Inicio
// junta «Te mencionaron». El selector aparece al teclear @ (tambien en la nota de la tarjeta).

import { PUEDE, mencionEnCurso, aliasDe, aliasParaMencion, nombreDe, nombreCorto, sinAcentos, diaDe, plural } from './reglas.js';
import { $, L, estado, el, boton, tonoDe, avisar, porId, proyectoAbierto, fechaHora, textoConMenciones, comentariosDe, iconoSvg, TRAZOS, puedeBorrarComentario, borrarComentario, chatVistoHasta, marcarChatVisto, comentariosNuevos, vistosDeComentario, miVistoDe, puedeMarcarVisto, alternarVisto, personasActivas, contadorTexto, fusionarActividad, rotuloDia } from './comun.js';

let alCambiar = () => {};
export function alCambiarChat(fn) { alCambiar = fn; }
let abrirTarjeta = () => {};
export function fijarAbrirTarjeta(fn) { abrirTarjeta = fn; }

const COMENTARIO_MAX = 250, COMENTARIO_AVISO = 200;
// v0.42.0: el hilo sabe de que proyecto es. Antes `enviar` leia proyectoAbierto(), que era siempre el mismo
// porque el chat solo vivia en la pestana del proyecto; en Mensajes el #tab-chat se aloja junto a la bandeja y pinta
// el frente elegido AHI, que no es el abierto. La ultima pintada fija el destino; salirDelChat lo suelta.
// C-41 (v0.141.0): solo el ID (como C-11): un objeto guardado se queda viejo tras un refresco; `proyectoDelChat` no tenia llamadores.
let proyectoChatId = null;
// C-09 (mensajes, 17-sep): el estado de «entre al chat» (que proyecto pinta el hilo, si ya se pinto, la raya de nuevos) vive
// aqui y no como expandos/dataset del #chatHilo, que alojarChat mueve entre padres. El selector de @ igual: un WeakMap por textarea.
const hiloEstado = { proyecto: null, pintado: false, nuevos: null, ultimo: null, irA: null };   // ultimo: el Cuando del comentario mas nuevo pintado
/** R-04 (v0.139.0): la bandeja pide que la proxima pintada del hilo de `pid` aterrice en el comentario `cid` (el que casó con el buscador). */
export function irAlComentario(pid, cid) { hiloEstado.irA = { pid, cid }; }
const selectores = new WeakMap();
const personas = personasActivas;   // C-06 (17-sep): la copia vive en comun.js
export const puedeComentarEn = p => PUEDE.tarea(estado.rol) && !!p && p.Estado === 'activo';

// ---------------------------------------------------------------- pintar

// El separador de dia del hilo (rotuloDia) vive en comun.js desde el 17-sep (C-06/U-04): la bandeja lo usa tambien.

export function pintarChat(p) {
    const hilo = $('chatHilo');
    proyectoChatId = p.id;
    const yo = estado.cuenta.username.toLowerCase();
    const cs = comentariosDe(p.id);
    // El refresco automatico (120 s) repinta el hilo: si la persona estaba leyendo arriba, se queda donde
    // estaba; solo si estaba al fondo (o es la primera pintada) se aterriza en lo ultimo (revisor, 12-sep).
    const estabaAlFondo = !hiloEstado.pintado || alFondoDe(hilo);
    const scrollAntes = hilo.scrollTop;
    // v0.9.0: la raya «nuevos» se fija al ENTRAR al chat de este proyecto (no en cada repintado: el refresco de
    // 120 s la movería sola). La marca de visto sube al final de la pintada que aterriza al fondo (C-01).
    if (hiloEstado.proyecto !== p.id) { hiloEstado.proyecto = p.id; hiloEstado.pintado = false; hiloEstado.nuevos = new Set(comentariosNuevos(p.id, chatVistoHasta(p.id)).map(c => c.id)); }
    const nuevos = hiloEstado.nuevos || new Set();   // fijado al entrar: lo que llegue durante el refresco no se suma a «tu ultima visita»
    hilo.textContent = '';
    if (!cs.length) hilo.appendChild(el('p', 'vacio', puedeComentarEn(p) ? 'Nadie ha escrito todavía. Aquí va lo que el equipo necesita leer del frente; con @nombre avisas a alguien.' : 'Nadie ha escrito todavía.'));
    // U-10 (v0.140.0): primero se decide el acomodo (rayas y «seguido») y despues se pinta, porque el «¿visto?» va solo en el
    // ULTIMO mensaje de cada rafaga y eso depende del mensaje de despues.
    const filas = []; let dia = null; let anterior = null; let rayaPuesta = false;
    for (const c of cs) {
        const d = c.Cuando ? diaDe(c.Cuando) : '';
        const nuevoDia = d !== dia; if (nuevoDia) { dia = d; anterior = null; }
        const raya = !rayaPuesta && nuevos.has(c.id); if (raya) { rayaPuesta = true; anterior = null; }
        filas.push({ c, nuevoDia, raya, seguido: esSeguido(c, anterior) });
        anterior = c;
    }
    let rafaga = [];
    for (const [i, f] of filas.entries()) {
        const { c } = f;
        if (f.nuevoDia) hilo.appendChild(el('div', 'dia', c.Cuando ? rotuloDia(c.Cuando) : '—'));
        if (f.raya) hilo.appendChild(el('div', 'nuevos', `${nuevos.size} ${plural(nuevos.size, 'nuevo')} desde tu última visita`));
        rafaga = f.seguido ? [...rafaga, c.id] : [c.id];
        const ultimaDeRafaga = !(filas[i + 1] && filas[i + 1].seguido);
        hilo.appendChild(mensajeDelHilo(c, f.seguido, p, yo, ultimaDeRafaga ? rafaga : null));
    }
    // R-04: si la bandeja pidio un comentario de ESTE frente, no se aterriza al fondo (ni se marca visto lo que queda abajo:
    // lo sube el scroll al llegar, C-01) y el hilo se abre en ese mensaje, resaltado un momento.
    const irA = hiloEstado.irA && hiloEstado.irA.pid === p.id ? hiloEstado.irA.cid : null; hiloEstado.irA = null;
    cerrarPintadaHilo(p, cs, estabaAlFondo && !irA, scrollAntes);
    if (irA) llevarA(irA);
    pintarBajar(true);
}
function llevarA(cid) {
    const hilo = $('chatHilo'), m = hilo.querySelector(`.msg[data-comentario="${cid}"]`); if (!m) return;
    hilo.scrollTop += m.getBoundingClientRect().top - hilo.getBoundingClientRect().top - hilo.clientHeight / 3;
    m.classList.add('is-hallado');   // la animacion es de una vez; el siguiente repintado ya no lo trae
}
/**
 * R-03 (v0.139.0, Zulip): leyendo arriba, una pildora abajo a la derecha del hilo baja a lo ultimo y dice cuantos mensajes
 * ajenos no se han visto (desde C-01 el refresco ya no los marca si no estas al fondo, pero nada avisaba que llegaron).
 * `contar`: recalcular el texto (cada pintada); el scroll solo muestra/esconde.
 */
function pintarBajar(contar) {
    const h = $('chatHilo'), b = $('chatBajar'); if (!b) return;
    const esconder = proyectoChatId === null || alFondoDe(h);
    if (!contar && esconder === b.classList.contains('oculto')) return;
    b.classList.toggle('oculto', esconder);
    if (esconder) return;
    const n = proyectoChatId !== null ? comentariosNuevos(proyectoChatId).length : 0;
    b.textContent = n ? `↓ ${n} ${plural(n, 'nuevo')}` : '↓';
    b.title = n ? `Bajar a lo último · ${n} ${plural(n, 'mensaje nuevo', 'mensajes nuevos')}` : 'Bajar a lo último'; b.setAttribute('aria-label', b.title);
}
/** Mensajes seguidos de la misma persona (en el mismo dia, sin raya ni tarjeta de por medio) se agrupan: sin nombre. */
const esSeguido = (c, anterior) => !!anterior && String(anterior.Quien || '').toLowerCase() === String(c.Quien || '').toLowerCase() && !c.TareaId && !anterior.TareaId;
/**
 * C-22 (v0.123.0): un mensaje del hilo —burbuja, liga a la tarjeta, texto, vistos y borrar—; pintarChat solo recorre y pone las rayas.
 * U-10 (v0.140.0): `rafaga` = los ids de la rafaga que este mensaje CIERRA (el mismo solo, si no hay rafaga), o null si no la cierra:
 * entonces no lleva «¿visto?» (sigue diciendo quien ya lo vio).
 */
function mensajeDelHilo(c, seguido, p, yo, rafaga) {
    const quien = String(c.Quien || '').toLowerCase();
    const m = el('div', 'msg' + (quien === yo ? ' is-mio' : '') + (seguido ? ' is-seguido' : '')); m.dataset.comentario = String(c.id);
    if (quien) m.dataset.tono = String(tonoDe(quien));   // v0.14.0: burbuja del color de la persona
    // v0.49.0 (Carlos, 15-sep; artifact C8meacEE, opcion B): sin avatar en el hilo — el nombre ya va en la cabecera
    // de la burbuja y el tono de la persona lo da su fondo; la bolita repetia lo que el renglon ya dice.
    const cuerpo = el('div', 'cuerpo');
    if (!seguido) { const cab = el('div', 'cab'); cab.appendChild(el('span', 'q', nombreDe(quien, estado.roles))); cab.appendChild(el('span', 'h mn-mono', fechaHora(c.Cuando))); cuerpo.appendChild(cab); }
    if (c.TareaId) {
        // La nota de una tarjeta: el chip la nombra y la abre (la nota vive en la tarjeta; aqui se lee en contexto).
        const t = porId(estado.tareas, c.TareaId);
        // U-21 (v0.114.0): la tarjeta borrada ya no es una caja deshabilitada: texto tenue en la linea del autor.
        // C-17 (v0.138.0): un renglon con TareaId nunca es «seguido» (arriba), asi que la .cab siempre esta; el clic resuelve la
        // tarjeta por id al momento (regla v0.4.0: el hilo se repinta cada 120 s y el objeto capturado seria el de otra pintada).
        if (!t) { const s = el('span', 'ref-borrada', '· tarjeta borrada'); s.title = 'La tarjeta ya no existe'; cuerpo.querySelector('.cab').appendChild(s); }
        else {
            const ref = boton('', 'ref', () => { const ahora = porId(estado.tareas, c.TareaId); if (ahora) abrirTarjeta(ahora.id); }, { tarjeta: String(c.TareaId) });
            ref.appendChild(iconoSvg(TRAZOS.tarjeta)); ref.appendChild(el('span', '', t.Title)); ref.title = 'Abrir la tarjeta';
            cuerpo.appendChild(ref);
        }
    }
    const texto = el('p', 't'); texto.appendChild(textoConMenciones(c.Title, yo));
    if (seguido) texto.title = fechaHora(c.Cuando);
    cuerpo.appendChild(texto);
    // v0.15.0: ✓ visto — quienes ya lo vieron y, en lo ajeno, el boton para marcarlo (contesta «¿ya viste?» sin escribir).
    // C-02 (17-sep): los handlers resuelven comentario y proyecto POR ID al clic (el hilo se repinta cada 120 s: el objeto
    // capturado seria el de una pintada vieja). U-05: la lista de quien lo vio nombra a los DEMAS; el propio ya lo dice el chip.
    const vs = vistosDeComentario(c); const mio = miVistoDe(c);
    const otros = mio ? vs.filter(a => a.id !== mio.id) : vs;
    const conBoton = !!rafaga && puedeMarcarVisto(c, p);
    if (vs.length || conBoton) {
        const fila = el('div', 'vistos');
        if (conBoton) {
            // U-10: la rafaga esta vista si su ULTIMO mensaje (este) lleva mi visto —la viste hasta ahi—; el boton marca o quita la rafaga entera.
            const todos = !!mio;
            const b = boton(todos ? '✓ visto' : '¿visto?', 'visto-btn' + (todos ? ' is-on' : ''), () => alClicRafaga(rafaga, p.id), { visto: String(c.id) });   // U-07 (17-sep): el no pulsado lleva palabra (en tactil no hay title)
            b.title = todos ? 'Quitar tu visto' : rafaga.length > 1 ? `Marcar como vistos (${rafaga.length} mensajes)` : 'Marcar como visto'; b.setAttribute('aria-pressed', todos ? 'true' : 'false'); fila.appendChild(b);
        }
        if (otros.length) { const q = el('span', 'q', '✓ ' + otros.map(a => nombreCorto(a.Quien, estado.roles)).join(', ')); q.title = otros.map(a => `${nombreDe(a.Quien, estado.roles)} · ${fechaHora(a.Cuando)}`).join(' · '); fila.appendChild(q); }
        cuerpo.appendChild(fila);
    }
    m.appendChild(cuerpo);
    // v0.9.0: borrar — lo propio, o cualquiera si gerencia; el boton vive en el mensaje y se ve al pasar el raton (siempre en tactil).
    if (puedeBorrarComentario(c, p)) {
        const b = boton('', 'borrar-msg', () => alClic(c.id, p.id, borrarComentario), { borrar: String(c.id) });
        b.title = c.TareaId ? 'Borrar esta nota' : 'Borrar este comentario'; b.setAttribute('aria-label', b.title);
        b.appendChild(iconoSvg(TRAZOS.basura));
        m.classList.add('has-borrar'); m.appendChild(b);
    }
    return m;
}
/** C-22 (v0.123.0): el cierre de una pintada del hilo — la marca de visto, el formulario segun permisos y el scroll. */
function cerrarPintadaHilo(p, cs, estabaAlFondo, scrollAntes) {
    const hilo = $('chatHilo');
    // v0.9.0: lo que ya estuvo en pantalla deja de ser nuevo (la raya se queda hasta salir del chat). C-01 (17-sep): solo si la
    // pintada aterriza al fondo; leyendo arriba, el refresco no marca visto lo que no se vio (lo marca el scroll al llegar abajo).
    hiloEstado.ultimo = cs.length ? cs[cs.length - 1].Cuando : null;
    if (hiloEstado.ultimo && estabaAlFondo) marcarChatVisto(p.id, hiloEstado.ultimo);
    const puede = puedeComentarEn(p);
    $('formChat').classList.toggle('oculto', !puede);
    $('chatSoloLectura').classList.toggle('oculto', puede);
    $('chatSoloLectura').textContent = !p || p.Estado !== 'activo' ? 'El proyecto está cerrado: la conversación queda como registro.' : 'Solo lectura · tu rol no escribe en el chat.';
    contar();
    ajustarHilo();   // U-06: antes de aterrizar al fondo, que el alto del hilo ya sea el definitivo
    // El hilo se lee como chat: lo ultimo abajo, y al entrar se aterriza ahi.
    hiloEstado.pintado = true;
    hilo.scrollTop = estabaAlFondo ? hilo.scrollHeight : scrollAntes;
}
const alFondoDe = h => h.scrollTop + h.clientHeight >= h.scrollHeight - 40;
/** C-02: el clic resuelve comentario y proyecto por id contra el estado de AHORA; si alguno ya no existe, no hace nada. */
async function alClic(cid, pid, accion) {
    const c = porId(estado.actividad, cid), p = porId(estado.proyectos, pid);
    // C-11 (v0.138.0): alCambiar (repintar) pinta el frente de AHORA; el repintado previo con el p del clic pintaba el de antes del await.
    if (c && p && await accion(c, p)) alCambiar();
}
/** U-10 (v0.140.0): el «¿visto?» de una rafaga — por id, como alClic; si el ultimo lleva mi visto se quitan todos, si no se marcan los que falten. Un repintado al final. */
async function alClicRafaga(ids, pid) {
    const p = porId(estado.proyectos, pid); if (!p) return;
    const cs = ids.map(id => porId(estado.actividad, id)).filter(Boolean); if (!cs.length) return;
    const todos = !!miVistoDe(cs[cs.length - 1]);
    let hubo = false;
    for (const c of cs) if (!!miVistoDe(c) === todos) { if (!await alternarVisto(c, p)) break; hubo = true; }   // el primer fallo ya avisó: no se insiste
    if (hubo) alCambiar();
}
/** C-01: llegar al fondo por scroll (leyendo lo que el refresco trajo) es verlo: sube la marca y avisa para que la bandeja lo refleje. */
function alDesplazarHilo() {
    pintarBajar(false);   // R-03
    const u = hiloEstado.ultimo; if (proyectoChatId === null || !u || !alFondoDe($('chatHilo'))) return;
    if (!(u > chatVistoHasta(proyectoChatId))) return;   // ya visto: nada que subir (y nada que ordenar por cada evento de scroll)
    marcarChatVisto(proyectoChatId, u); alCambiar();
}
// U-06 (mejorar-app proyecto, 17-sep): en celular el hilo media 40vh fijos y quedaban ~100 px vacios bajo «Enviar» (el hueco
// que .chat reserva al FAB, que en el chat no existe, mas lo que sobraba del viewport). Ahora el hilo toma lo que queda del
// viewport descontando lo que tiene ARRIBA (cabecera + pestañas, que varian con el largo del titulo: por eso se mide y no se
// fija en CSS) y ABAJO (la forma o la linea «solo lectura», y el hueco de la barra fija): «Enviar» queda pegado al hueco de la
// barra (los ~49 px que la pagina sigue desplazando bajo la barra son de fuera de la pestaña, y estaban antes). Arriba
// de 720 px manda el CSS (min(62vh, 640px)); el valor va en --hilo-alto y el CSS lo lee con un 40vh de respaldo.
const enCelular = window.matchMedia('(max-width: 720px)');
function ajustarHilo() {
    const hilo = $('chatHilo'); if (!hilo) return;
    if (!enCelular.matches) { hilo.style.removeProperty('--hilo-alto'); return; }
    if (hilo.offsetParent === null) return;   // pestaña oculta: sin medida que valga; la proxima pintada vuelve a pasar por aqui
    const arriba = hilo.getBoundingClientRect().top + window.scrollY;
    const forma = $('formChat').classList.contains('oculto') ? $('chatSoloLectura').offsetHeight : $('formChat').offsetHeight;
    const contenido = hilo.closest('.contenido');
    const abajo = contenido ? parseFloat(getComputedStyle(contenido).paddingBottom) || 0 : 0;
    const hueco = parseFloat(getComputedStyle(hilo.parentElement).rowGap) || 8;   // el gap de .chat entre hilo y forma
    hilo.style.setProperty('--hilo-alto', Math.max(160, Math.floor(window.innerHeight - arriba - hueco - forma - abajo)) + 'px');
}
window.addEventListener('resize', ajustarHilo);

/** v0.9.0: app.js lo llama cuando el chat deja de estar en pantalla; la proxima pintada cuenta como «entrar». */
export function salirDelChat() { proyectoChatId = null; hiloEstado.proyecto = null; hiloEstado.pintado = false; hiloEstado.nuevos = null; }
/** Tras enviar, siempre al fondo (es mi mensaje). */
function alFondo() { const h = $('chatHilo'); h.scrollTop = h.scrollHeight; }

const contar = () => contadorTexto('chatTexto', 'chatCont', COMENTARIO_MAX, COMENTARIO_AVISO);   // C-06: comun.js

// ---------------------------------------------------------------- enviar

async function enviar(ev) {
    ev.preventDefault();
    // v0.42.0: el frente que el hilo pinta, no el abierto; C-02: resuelto por id. C-15 (v0.138.0): si ese frente ya no existe no se
    // cae a proyectoAbierto(), que es el ultimo abierto y no el que se ve: el comentario iria a OTRO frente.
    const p = proyectoChatId !== null ? porId(estado.proyectos, proyectoChatId) : proyectoAbierto();
    if (!p) { if (proyectoChatId !== null) avisar('Ese frente ya no está: el comentario no se envió.', 'error'); return; }
    if (!PUEDE.tarea(estado.rol)) { avisar('Tu rol es de lectura: no puedes comentar.', 'error'); return; }
    if (p.Estado !== 'activo') { avisar('El proyecto está cerrado.', 'error'); return; }
    if (navigator.onLine === false) { avisar('Sin conexión: el comentario se manda cuando regrese la red (vuelve a intentarlo).', 'ojo'); return; }   // T2: Ctrl+Enter no pasa por pointer-events
    if ($('chatEnviar').disabled) return;   // Ctrl+Enter no respeta `disabled` como el clic (C4)
    const crudo = $('chatTexto').value; const texto = crudo.trim();
    if (!texto) { $('chatTexto').focus(); return; }
    if (texto.length > COMENTARIO_MAX) { avisar(`El comentario no cabe: máximo ${COMENTARIO_MAX} caracteres (es un renglón de la bitácora).`, 'error'); return; }
    $('chatEnviar').disabled = true;
    try {
        const r = { Title: texto, Accion: 'comentar', Quien: estado.cuenta.username, Cuando: new Date().toISOString(), ProyectoId: Number(p.id) };
        const n = await estado.cliente.crearRenglon(estado.siteId, L.actividad, r, m => avisar(m, 'ojo'));
        fusionarActividad([n]);   // C-03: un refresco a medio POST ya lo pudo traer; unshift lo duplicaba en el hilo
        // C-11 (v0.138.0): el cuadro no se bloquea durante el POST; si se siguio tecleando, solo sale lo enviado y lo nuevo se queda.
        const ta = $('chatTexto'); ta.value = ta.value.startsWith(crudo) ? ta.value.slice(crudo.length).replace(/^\s+/, '') : ta.value; cerrarSelector(ta);
        // C-11: alCambiar (repintar de app.js) ya pinta el frente que esta en pantalla; el pintarChat(p) previo repintaba el de antes
        // del await, y si se cambio de frente en medio perdia la raya «nuevos» del que se llego.
        alCambiar();
        if (proyectoChatId === p.id) alFondo();
        ta.focus();
    } catch (e) { avisar('No se pudo enviar: ' + (e && e.message ? e.message : e), 'error'); }
    finally { $('chatEnviar').disabled = false; }
}

// ---------------------------------------------------------------- selector de @menciones

/**
 * Bajo un textarea, la lista de personas cuando el cursor esta en un «@ali» a medio escribir; elegir
 * una reemplaza lo tecleado por «@alias » (el alias que aliasParaMencion garantiza inequivoco).
 * Teclado: ↑/↓ recorre, Enter/Tab elige, Esc cierra; Ctrl/Cmd+Enter sigue enviando el formulario.
 * `idArroba`: el boton «@» de esa forma, si lo hay — su clic no roba el foco (mousedown cancelado) y, si el foco pasa por el
 * (foco programatico), el selector no se cierra.
 */
export function engancharSelectorMenciones(idTexto, idCaja, enviarForma, idArroba) {
    const ta = $(idTexto), caja = $(idCaja), arroba = idArroba ? $(idArroba) : null;
    selectores.set(ta, { caja, i: 0, opciones: [] });
    // ARIA del combo: el textarea es el «combobox» y la caja su listbox; la opcion marcada va en aria-activedescendant.
    ta.setAttribute('aria-autocomplete', 'list'); ta.setAttribute('aria-controls', idCaja); ta.setAttribute('aria-expanded', 'false');
    ta.addEventListener('input', () => pintarSelector(ta));
    ta.addEventListener('click', () => pintarSelector(ta));
    // Mover el cursor con flechas/Inicio/Fin cambia donde esta la mencion en curso (o si la hay).
    ta.addEventListener('keyup', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) pintarSelector(ta); });
    // C-08 (17-sep): el selector se cierra al salir el foco hacia fuera de la caja y del boton «@» — focusout trae a donde va
    // (relatedTarget), asi que no hace falta el setTimeout(120) que adivinaba. El boton «@» ademas no roba el foco (mousedown).
    if (arroba) arroba.addEventListener('mousedown', e => e.preventDefault());
    ta.addEventListener('focusout', e => { const a = e.relatedTarget; if (a !== ta && !caja.contains(a) && a !== arroba) cerrarSelector(ta); });
    ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cerrarSelector(ta); enviarForma(); return; }
        const s = selectores.get(ta); if (caja.classList.contains('oculto') || !s.opciones.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); s.i = (s.i + 1) % s.opciones.length; marcar(ta); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); s.i = (s.i - 1 + s.opciones.length) % s.opciones.length; marcar(ta); }
        else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); elegir(ta, s.opciones[s.i]); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarSelector(ta); }
    });
}
function pintarSelector(ta) {
    const s = selectores.get(ta); const caja = s.caja;
    const m = mencionEnCurso(ta.value, ta.selectionStart);
    if (!m) { cerrarSelector(ta); return; }
    const q = sinAcentos(m.alias);
    const yo = estado.cuenta.username.toLowerCase();
    s.opciones = personas().filter(c => c !== yo && (!q || aliasDe(c, estado.roles).some(a => a.startsWith(q)) || sinAcentos(nombreDe(c, estado.roles)).includes(q))).slice(0, 8);
    s.i = 0; s.desde = m.desde; s.hasta = m.hasta;   // la palabra entera: «@fra|ncisco» se reemplaza completa
    caja.textContent = '';
    if (!s.opciones.length) { cerrarSelector(ta); return; }
    for (const [k, c] of s.opciones.entries()) {
        const b = boton('', '', () => elegir(ta, c), { mencionar: c }); b.setAttribute('role', 'option'); b.id = `${caja.id}-op-${k}`;
        b.appendChild(el('span', 'n', nombreDe(c, estado.roles))); b.appendChild(el('span', 'a mn-mono', '@' + aliasParaMencion(c, estado.roles)));
        b.addEventListener('mousedown', e => e.preventDefault());   // que el textarea no pierda el foco antes del clic
        caja.appendChild(b);
    }
    caja.classList.remove('oculto'); ta.setAttribute('aria-expanded', 'true'); marcar(ta);
}
function marcar(ta) {
    const s = selectores.get(ta);
    for (const [k, b] of [...s.caja.querySelectorAll('button')].entries()) { b.classList.toggle('is-on', k === s.i); b.setAttribute('aria-selected', k === s.i ? 'true' : 'false'); }
    ta.setAttribute('aria-activedescendant', `${s.caja.id}-op-${s.i}`);
}
function elegir(ta, correo) {
    const s = selectores.get(ta); if (!correo) return;
    const alias = '@' + aliasParaMencion(correo, estado.roles) + ' ';
    ta.value = ta.value.slice(0, s.desde) + alias + ta.value.slice(s.hasta);
    const pos = s.desde + alias.length; ta.setSelectionRange(pos, pos);
    cerrarSelector(ta); ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));   // el contador y quien escuche
}
export function cerrarSelector(ta) {
    const s = ta && selectores.get(ta); if (!s) return;
    s.caja.classList.add('oculto'); s.caja.textContent = ''; s.opciones = [];
    ta.setAttribute('aria-expanded', 'false'); ta.removeAttribute('aria-activedescendant');
}

// ---------------------------------------------------------------- enganche

export function engancharChat() {
    $('formChat').addEventListener('submit', enviar);
    $('chatTexto').addEventListener('input', contar);
    $('chatHilo').addEventListener('scroll', alDesplazarHilo, { passive: true });   // C-01
    // R-03: bajar es llegar al fondo por scroll (sube la marca, C-01); el foco pasa al cuadro, porque la pildora se esconde.
    $('chatBajar').addEventListener('click', () => { alFondo(); alDesplazarHilo(); if (!$('formChat').classList.contains('oculto')) $('chatTexto').focus(); });
    engancharSelectorMenciones('chatTexto', 'chatSelector', () => $('formChat').requestSubmit(), 'chatArroba');
    // El boton «@» mete una arroba donde esta el cursor y abre el selector (en celular no hay tecla a la mano).
    $('chatArroba').addEventListener('click', () => {
        const ta = $('chatTexto'); const i = ta.selectionStart || ta.value.length;
        const antes = ta.value.slice(0, i); const sep = antes && !/\s$/.test(antes) ? ' ' : '';
        ta.value = antes + sep + '@' + ta.value.slice(i); const pos = i + sep.length + 1; ta.focus(); ta.setSelectionRange(pos, pos);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
