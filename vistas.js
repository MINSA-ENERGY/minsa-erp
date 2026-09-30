// v0.10.0 (2026-09-12): las pantallas que Carlos pidio a partir de un tablero de referencia (foto del
// 12-sep, «Product Roadmap»): Roadmap (por frente y global), Calendario, Mensajes, Archivos y Reportes.
// Todo se DERIVA de las cinco listas que ya existen (no hay esquema nuevo): el roadmap usa
// Desde/_creado -> Vence/HechoEl, el calendario Vence, Mensajes los renglones «comentar», Archivos
// PROY_Ligas y Reportes lo que avance() y estadoVence() ya calculan. Nada de innerHTML (lo vigila test/sw.test.js); los
// graficos son SVG por DOM o cajas con ancho en %.

import { CONFIG } from './config.js';
import { tareasDe, avance, avanceGlobal, estadoVence, vencidasEn, claseVence, fraseVence, diasPara, nombreDe, nombreCorto, ordenarProyectos, lapsoTarea, lapsoProyecto, rangoRoadmap, barraEn, mesesDelRango, celdasDelMes, agendaPorDia, hechasPorSemana, cargaPorPersona, actividadPorPersona, ultimoComentarioPorProyecto, filtrarLigas, TIPOS_LIGA, diaDe, diaSemana, mesSumar, sumarDias, diasEntre, columnasDe, claseDeColumna, segmentosDe, segmentosGlobales, tituloSegmentos, hrefSeguro, proyectosVisibles, porVence, hitosDe, acomodarHitos, sinAcentos, lineaSalud, abiertasDePersona, HECHO, plural } from './reglas.js';
import { $, estado, activos, visibles, nombreEquipoFiltrado, el, boton, chip, fechaCorta, diaMes, fechaHora, fechaBandeja, porId, proyectoAbierto, proyectoPorClave, equipoDe, iconoEquipo, iconoArchivo, irAHash, textoConMenciones, comentariosDe, nuevosDe, verboComentario, opciones, columnasDeTarea, avisar, conRetardo, abrirDialogo, cerrarDialogo, conservarFoco, filtroArchivosVacio } from './comun.js';
import { pintarChat, irAlComentario } from './chat.js';   // v0.42.0: Mensajes pinta el hilo del frente elegido en su propia columna
import { tablaDocs, filaRaiz, filasDeExpediente, ordenarDocs } from './docs.js';   // v0.17.0: la misma tabla que Docs del proyecto; v0.18.0: y el mismo orden; v0.36.0: y el mismo arbol

const SVG_NS = 'http://www.w3.org/2000/svg';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const diaCorto = dia => DIAS_CORTOS[diaSemana(dia)];   // C-04 (v0.86.0): «lun 15» sale de un solo sitio
const mesActual = () => estado.mesCal || hoyDia().slice(0, 7);   // C-04 (v0.86.0): el mes por defecto del calendario, una vez
// v0.11.0: ya no hay una lista fija de columnas; los graficos de UN proyecto van por sus cubetas
// (segmentosDe) y los globales por tres categorias (segmentosGlobales), con los mismos colores por clase.
const hoyDia = () => diaDe(new Date());
const nombreMes = mes => `${MESES[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}`;
// `tab`: desde la pestana Roadmap del proyecto se conserva la pestana (sin ella el router vuelve al tablero).
const irTarjeta = (t, tab = '') => { const p = porId(estado.proyectos, t.ProyectoId); if (p) irAHash(`#p/${p.Clave}${tab ? '/' + tab : ''}/t/${t.id}`); };
// C-05 (v0.78.0): los handlers del roadmap resuelven por id al clic (regla v0.4.0) — el objeto capturado en el closure queda viejo tras un repintado.
const irTarjetaId = (id, tab = '') => { const t = porId(estado.tareas, id); if (t) irTarjeta(t, tab); else avisar('Esa tarjeta ya no está: se borró desde que se pintó la pantalla.', 'ojo'); };   // C-18: antes, callado
const irFrenteId = (id, tab = '') => { const p = porId(estado.proyectos, id); if (p) irAHash(`#p/${p.Clave}${tab ? '/' + tab : ''}`); else avisar('Ese frente ya no está: se borró desde que se pintó la pantalla.', 'ojo'); };
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(SVG_NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); return e; };
// C-14 (v0.120.0): el mes corto y el dia de un «aaaa-mm-dd» salen de un solo sitio (antes cinco rebanadas a mano).
const mesCorto = dia => MESES_CORTOS[+dia.slice(5, 7) - 1];
const diaNum = dia => +dia.slice(8, 10);
const mesLargo = dia => MESES[+dia.slice(5, 7) - 1];   // C-11 (v0.154.0): el calendario dice «30 de septiembre», no «sep»
// U-12 (v0.120.0): dentro del eje, la fecha del año en curso va sin año (dd/mm), como ya hacia el roadmap global.
const fechaEje = f => { const d = diaDe(f); return d && d.slice(0, 4) === hoyDia().slice(0, 4) ? diaMes(f) : fechaCorta(f); };

// C-07 (v0.120.0): el lugar del gantt (scroll horizontal y, en celular, vertical) sobrevive a un repintado de la MISMA pantalla
// —el refresco de CONFIG.refrescoMs, visibilitychange, un cambio de datos—, y la hoja de un rombo abierta no se cierra. Al ENTRAR
// (irA o cambiar de pestaña, app.js) se olvida y el scroll vuelve a la raya de hoy, como enfocarCal en el calendario.
// Si la caja cambio de ancho (rotar, plegar el rail, pantalla completa: C-01) el lugar viejo no significa lo mismo y se vuelve a hoy (U-01).
let lugarClave = null, lugarAncho = 0;
export function olvidarLugarRoadmap() { lugarClave = null; }
// R-01 (v0.122.0): la escala de la linea de tiempo del roadmap general, como GitHub Projects / Jira / Linear: cuantos dias caben en el
// ancho VISIBLE de la pista. Sin eleccion guardada manda el CSS (`--escala` de .gantt-caja: trimestre en laptop, meses en celular), asi el
// corte de 720 px sigue viviendo solo en estilo.css (C-09). La eleccion se recuerda por dispositivo (localStorage), como la densidad.
const ESCALAS = [['semanas', 'Semanas', 35], ['meses', 'Meses', 91], ['trimestre', 'Trimestre', 182]];
const CLAVE_ESCALA = 'proy.roadmapEscala';
function escalaRoadmap(caja) {
    let e = estado.roadmapEscala;
    if (!e) { try { e = localStorage.getItem(CLAVE_ESCALA) || ''; } catch (_) { e = ''; } }
    if (!ESCALAS.some(x => x[0] === e)) e = getComputedStyle(caja).getPropertyValue('--escala').trim();
    return ESCALAS.some(x => x[0] === e) ? e : 'trimestre';
}
function pintarEscala(actual) {
    const g = $('roadmapEscala'); g.textContent = '';
    for (const [clave, nombre] of ESCALAS) {
        const b = boton(nombre, clave === actual ? 'is-on' : '', () => { estado.roadmapEscala = clave; try { localStorage.setItem(CLAVE_ESCALA, clave); } catch (_) {} olvidarLugarRoadmap(); pintarRoadmap(); }, { escala: clave });
        b.setAttribute('aria-pressed', String(clave === actual)); g.appendChild(b);
    }
}
function lugarPrevio(clave, caja, medida = caja) {   // `medida`: lo que sobrevive al repintado (la caja del proyecto se rehace; su pestaña no)
    const ancho = medida ? medida.clientWidth : 0;
    const previo = lugarClave === clave && caja && ancho === lugarAncho ? { left: caja.scrollLeft, top: caja.scrollTop } : null;
    lugarClave = clave; lugarAncho = ancho; return previo;
}

// ---------------------------------------------------------------- roadmap (gantt)

/**
 * El eje de tiempo compartido por el roadmap global y el del proyecto: cabecera con los meses, una
 * linea por semana y la raya de HOY. `filas` = [{ etiqueta: Node, lapso, clase, texto, abrir, pct }].
 * v0.22.0 (iteracion 4): los meses alternan fondo (un gradiente por pista, calculado del rango), la raya
 * de hoy lleva etiqueta «hoy · 13 sep» en la cabecera, y una fila puede traer `hitos` (rombos ya acomodados
 * por acomodarHitos, con `abrirHito(a)`) y `fin` ({ left, texto, titulo }: la raya del fin de frente).
 * `opts.umbralTxt` es el % minimo de espacio libre para que un rombo lleve su titulo debajo.
 */
/** El texto de una barra va AFUERA, a su derecha (o a la izquierda si toca el borde): la barra corta (b.width < 14) y, desde U-12, la que no le cabe. */
function textoFuera(barra, b, f, pista, conHitos) {
    barra.classList.add('is-corta');
    const t = el('span', 'g-txt g-fuera' + (f.clase === 'danger' ? ' is-danger' : ''), f.texto || '');   // U-27: el «venció hace 2 d» de afuera se lee en rojo, como su barra
    if (b.left + b.width > 80) { t.classList.add('is-izq'); t.style.right = (100 - b.left) + '%'; } else t.style.left = (b.left + b.width) + '%';
    if (f.abrir) { t.classList.add('is-clic'); t.addEventListener('click', f.abrir); }   // U-03 (v0.78.0): el texto de al lado tambien abre (la barra de 12 px no es objetivo tactil)
    if (!conHitos) pista.appendChild(t);   // v0.22.0: con rombos el texto de afuera chocaria con ellos; la etiqueta y el title ya lo dicen
}
function gantt(cont, filas, rango, opts = {}) {
    cont.textContent = ''; if (!opts.previo) cerrarPopHito();   // C-07 (v0.120.0): un repintado de la misma pantalla deja abierta la hoja del rombo
    const pv = opts.previo && document.getElementById('gPop'); const popAbierto = pv ? pv.dataset.hito : null; let popNuevo = null;   // C-18: y la repinta con los datos nuevos (o la cierra si su grupo ya no existe)
    const conHitos = filas.some(f => f.hitos || f.fin); const medir = [];
    const g = el('div', 'gantt' + (conHitos ? ' is-hitos' : '')); g.style.setProperty('--dias', String(rango.dias));
    if (opts.anchoGantt) g.style.minWidth = opts.anchoGantt + 'px';   // R-01 (v0.122.0): la escala fija el ancho (manda sobre el --gantt-min del CSS)
    // cabecera: meses arriba, semanas abajo
    const cab = el('div', 'g-cab'); cab.appendChild(el('span', 'g-eti', opts.rotulo || ''));
    const eje = el('div', 'g-eje');
    const meses = el('div', 'g-meses'); const bandas = [];
    for (const [i, m] of mesesDelRango(rango).entries()) {
        const largo = nombreMes(m.mes), cabeLargo = opts.anchoPista ? m.width * opts.anchoPista / 100 >= largo.length * 9 + 12 : m.width >= 18;   // U-28: con la pista medida decide el ancho en px (a 390 en Meses salia «SEPT…»), no el % del rango
        const s = el('span'); s.appendChild(el('b', '', cabeLargo ? largo : `${mesCorto(m.mes + '-01')} ${m.mes.slice(2, 4)}`)); s.style.left = m.left + '%'; s.style.width = m.width + '%'; s.title = nombreMes(m.mes); meses.appendChild(s);   // U-18 (v0.120.0): el nombre va en un <b> pegajoso (estilo.css) que no se esconde bajo la columna fija
        bandas.push(`${i % 2 ? 'color-mix(in srgb, var(--text-body) 6%, transparent)' : 'transparent'} ${m.left}% ${m.left + m.width}%`);   // tinte del texto, no surface-sunken: en oscuro no se veia y las filas de grupo ya lo traian
    }
    g.style.setProperty('--bandas', `linear-gradient(90deg, ${bandas.join(', ')})`);
    eje.appendChild(meses);
    const semanas = el('div', 'g-semanas');
    const semanaPx = opts.anchoPista ? opts.anchoPista * 7 / rango.dias : Infinity;   // R-01 (v0.122.0): de lejos (Meses/Trimestre en celular) la semana mide ~15 px y su numero salia «1.»; bajo 24 px la cabecera se queda con los meses
    if (semanaPx >= 24) for (let d = rango.desde; d <= rango.hasta; d = sumarDias(d, 7)) { const s = el('span', '', String(diaNum(d))); s.style.left = (diasEntre(rango.desde, d) * 100 / rango.dias) + '%'; s.style.width = (7 * 100 / rango.dias) + '%'; semanas.appendChild(s); }
    eje.appendChild(semanas);
    const hoy = hoyDia(); const hoyPct = (diasEntre(rango.desde, hoy) + 0.5) * 100 / rango.dias;
    // la etiqueta de hoy va en la cabecera (fija al hacer scroll); cerca del borde derecho se lee hacia la izquierda
    if (hoyPct >= 0 && hoyPct <= 100) { const h = el('i', 'g-hoy' + (hoyPct > 85 ? ' is-der' : '')); h.style.left = hoyPct + '%'; h.appendChild(el('b', '', `hoy · ${diaNum(hoy)} ${mesCorto(hoy)}`)); eje.appendChild(h); }
    cab.appendChild(eje); g.appendChild(cab);
    for (const f of filas) {
        const fila = el('div', 'g-fila' + (f.grupo ? ' is-grupo' : ''));
        const eti = el('div', 'g-eti'); eti.appendChild(f.etiqueta); fila.appendChild(eti);
        const pista = el('div', 'g-pista');   // C-10 (v0.120.0): las rayas de semana son un fondo CSS de la pista (estilo.css), no un nodo por semana y fila
        if (hoyPct >= 0 && hoyPct <= 100) { const h = el('i', 'g-hoy'); h.style.left = hoyPct + '%'; h.title = 'hoy'; pista.appendChild(h); }
        if (!f.grupo) {
            const b = f.lapso ? barraEn(f.lapso, rango) : null;
            if (b) {
                const barra = el(f.abrir ? 'button' : 'span', 'g-barra is-' + (f.clase || 'idle')); if (f.abrir) { barra.type = 'button'; barra.addEventListener('click', f.abrir); }
                barra.style.left = b.left + '%'; barra.style.width = b.width + '%'; barra.title = f.titulo || f.texto || ''; barra.setAttribute('aria-label', f.titulo || f.texto || '');   // U-10 (v0.78.0): el nombre accesible es el titulo, no el «41 %» de adentro
                if (f.pct !== undefined) { const p = el('i', 'g-pct'); p.style.width = f.pct + '%'; barra.appendChild(p); }
                if (f.hito) barra.classList.add('is-hito');
                if (f.dataset) for (const k in f.dataset) barra.dataset[k] = f.dataset[k];
                pista.appendChild(barra);
                // Una barra de pocos dias no tiene donde escribir: el texto va afuera, a su derecha (o a la izquierda si toca el borde).
                let tx = null;
                if (b.width < 14 && !f.hito) textoFuera(barra, b, f, pista, conHitos);
                else { tx = el('span', 'g-txt', f.texto || ''); barra.appendChild(tx); }
                if (!f.hito && tx) medir.push([barra, b, f, pista, tx]);   // C-17: el span se guarda; ya no se busca con querySelector al medir
            } else if (!f.hitos || !f.hitos.length) pista.appendChild(el('span', 'g-sinfecha', f.sinFecha || 'sin fecha'));   // v0.22.0: un frente sin fin pero con hitos pinta solo sus rombos
            // v0.22.0: la raya del fin de frente (se ve aunque la barra vaya en 0 %) y los rombos de las tarjetas con fecha
            if (f.fin) { const r = el('i', 'g-fin'); r.style.left = f.fin.left + '%'; r.title = f.fin.titulo || ''; r.appendChild(el('b', '', f.fin.texto || '')); pista.appendChild(r); }
            for (const a of f.hitos || []) {
                const grupo = a.hitos.length > 1;
                const r = el('button', 'g-rombo' + (a.clase ? ' is-' + a.clase : '') + (grupo ? ' is-grupo' : '')); r.type = 'button'; r.style.left = a.left + '%';
                r.title = a.titulo || ''; r.setAttribute('aria-label', a.titulo || ''); r.dataset.hito = a.hitos.map(h => h.tarea.id).join(',');
                if (f.abrirHito) r.addEventListener('click', e => { e.stopPropagation(); if (tactil()) popHito(a, f, r); else f.abrirHito(a); });
                if (popAbierto === r.dataset.hito) popNuevo = [a, f, r];   // C-18   // U-04 (v0.79.0): en tactil el title no existe: el toque abre la hoja con lo que decia
                pista.appendChild(r);
                // el titulo cabe si hay espacio hasta el siguiente rombo o la raya del fin; un grupo siempre dice «+N»
                // U-19 (v0.120.0): con el ancho de la pista conocido, un titulo que no alcanzaria ~6 letras (46 px) no se pinta: «A…» no dice nada y el title/la hoja ya lo traen
                const libre = opts.anchoPista ? a.espacio * opts.anchoPista / 100 - (a.topado ? 44 : 8) : Infinity;
                if (grupo || (a.espacio >= (opts.umbralTxt ?? 6) && libre >= 46)) {
                    const t = el('span', 'g-rombo-txt' + (grupo ? ' is-grupo' : '') + (grupo && a.topado ? ' is-izq' : ''), grupo ? `+${a.hitos.length}` : a.hitos[0].tarea.Title); t.style.left = a.left + '%'; if (!grupo) t.style.maxWidth = `calc(${a.espacio}% - ${a.topado ? 44 : 8}px)`;   // topado: la fecha del fin (dd/mm, ~36 px) vive a la izquierda de su raya; U-24: un grupo topado lleva su «+N» a la izquierda (se leia «+231/10»)
                    if (f.abrirHito) { t.classList.add('is-clic'); t.addEventListener('click', e => { e.stopPropagation(); r.click(); }); }   // U-11 (v0.120.0): el nombre bajo el rombo abre lo mismo que el rombo
                    pista.appendChild(t);
                }
            }
        }
        fila.appendChild(pista); g.appendChild(fila);
    }
    cont.appendChild(g);
    if (popAbierto !== null) { if (popNuevo) popHito(...popNuevo, true); else cerrarPopHito(); }   // C-18
    // U-12 (v0.120.0): con el gantt ya en pantalla, una barra cuyo texto no cabe adentro («vence 0…») lo saca a su lado, como la barra corta.
    // Oculta mide 0 y no se toca. Con rombos (global) el texto de afuera chocaria con ellos: ahi se queda adentro.
    // C-17: dos pasadas — primero se LEE todo (clientWidth/scrollWidth), luego se mueve; intercalarlas forzaba un reflow por barra
    if (!conHitos) { const fuera = medir.filter(([barra, , , , t]) => barra.clientWidth && t.scrollWidth > barra.clientWidth - 12); for (const [barra, b, f, pista, t] of fuera) { t.remove(); textoFuera(barra, b, f, pista, conHitos); } }
    if (opts.previo) { cont.scrollLeft = opts.previo.left; cont.scrollTop = opts.previo.top; return; }   // C-07 (v0.120.0)
    // U-01 (v0.78.0): si la pista desborda la caja (celular), el scroll arranca con la raya de hoy a un tercio de la pista VISIBLE
    // (lo que queda a la derecha de la etiqueta pegada, U-02), no en el pasado. Medido a 390: con el 35 % de la caja entera la raya caia debajo de la etiqueta.
    if (hoyPct >= 0 && hoyPct <= 100 && cont.scrollWidth > cont.clientWidth + 1) { cont.scrollLeft = 0; const eti = eje.getBoundingClientRect().left - cont.getBoundingClientRect().left; const x = eti + eje.clientWidth * hoyPct / 100; cont.scrollLeft = Math.max(0, Math.round(x - eti - (cont.clientWidth - eti) * 0.35)); }
}

/** Fila-etiqueta de una tarjeta en el roadmap del proyecto: titulo (abre la tarjeta). */
/** C-20: una muestra de la leyenda del roadmap (el icono de color y su texto); `tipo` = 'g-barra-mini' | 'g-rombo-mini'. */
function muestraLeyenda(tipo, cls, texto) { const s = el('span'); s.appendChild(el('i', tipo + (cls ? ' is-' + cls : ''))); s.appendChild(el('span', '', texto)); return s; }
function etiquetaTarea(t) {
    const b = el('button', 'g-tarea'); b.type = 'button'; b.dataset.t = String(t.id); b.title = t.Title;
    b.appendChild(el('span', 't', t.Title));
    b.addEventListener('click', () => irTarjetaId(b.dataset.t, 'roadmap'));
    return b;
}
const CLASE_BARRA = { h: 'ok', r: 'info', c: 'brand', p: 'idle' };
const claseBarraTarea = t => t.Columna === HECHO ? 'ok' : estadoVence(t, CONFIG.vencePronto) === 'danger' ? 'danger' : CLASE_BARRA[claseDeColumna(t.Columna, columnasDeTarea(t))];
/** v0.22.0: lo que dice un rombo: estado con fecha y quien (el title lo junta con el titulo; la hoja tactil lo pinta aparte). */
function partesHito(h) {
    const t = h.tarea;
    const estado_ = h.clase === 'hecha' ? `hecha ${fechaCorta(t.HechoEl || t.Vence)}` : fraseVence(diasPara(t.Vence), 'larga', fechaCorta(t.Vence));
    return { estado: estado_, quien: t.Asignado ? nombreDe(t.Asignado, estado.roles) : '' };
}
function tituloHito(h) { const p = partesHito(h); return `${h.tarea.Title} · ${p.estado}${p.quien ? ' · ' + p.quien : ''}`; }
/**
 * U-04 (v0.79.0): en celular no hay hover, asi que el title de un rombo (nombre completo · estado · quien) y el «+N» de un
 * grupo no se leian sin navegar. En tactil el toque abre una HOJA INFERIOR (#gPop, como #tPop del tablero) con una fila por
 * tarjeta —cada una abre SU tarjeta— y, en un grupo, el boton al roadmap del frente. En escritorio el clic sigue abriendo
 * directo. `estado.tactil` lo fuerza la E2E (headless no cambia de viewport).
 */
const tactil = () => estado.tactil ?? matchMedia('(hover: none)').matches;
function cerrarPopHito(devolver = false) {
    const p = document.getElementById('gPop'); if (p) p.remove(); document.removeEventListener('pointerdown', fueraDelPop, true);
    if (devolver && p && romboDelPop && romboDelPop.isConnected) romboDelPop.focus();   // U-30: Esc o «Cerrar» devuelven el foco al rombo que la abrio
    romboDelPop = null;
}
function fueraDelPop(e) { const p = document.getElementById('gPop'); if (!p || !p.contains(e.target)) cerrarPopHito(); }   // C-15 (v0.120.0): sin hoja, el listener se quita solo
let romboDelPop = null;   // U-30: a donde vuelve el foco al cerrar la hoja
function popHito(a, f, rombo = null, repinta = false) {
    const viejo = document.getElementById('gPop'); const foco = viejo && viejo.contains(document.activeElement) ? document.activeElement : null;
    const clave = foco && (foco.dataset.popT ? `[data-pop-t="${foco.dataset.popT}"]` : foco.dataset.popFrente ? '[data-pop-frente]' : '[data-pop-cerrar]');
    cerrarPopHito(); romboDelPop = rombo;
    const pop = el('div', 'g-pop'); pop.id = 'gPop'; pop.dataset.hito = a.hitos.map(h => h.tarea.id).join(','); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', a.hitos.length > 1 ? `${a.hitos.length} tarjetas` : a.hitos[0].tarea.Title);
    if (a.hitos.length > 1) pop.appendChild(el('p', 'g-pop-cab', `${a.hitos.length} tarjetas del ${fechaCorta(a.dia)} al ${fechaCorta(a.hasta)}`));
    for (const h of a.hitos) {
        const b = el('button', 'g-pop-it'); b.type = 'button'; b.dataset.popT = String(h.tarea.id);
        b.appendChild(el('i', 'g-rombo-mini' + (h.clase ? ' is-' + h.clase : '')));
        const c = el('span', 'cuerpo'); const pr = partesHito(h); c.appendChild(el('b', '', h.tarea.Title)); c.appendChild(el('span', 'm', pr.estado + (pr.quien ? ' · ' + pr.quien : ''))); b.appendChild(c);
        b.addEventListener('click', () => { cerrarPopHito(); irTarjetaId(h.tarea.id); });
        pop.appendChild(b);
    }
    const pie = el('div', 'g-pop-pie');
    if (a.hitos.length > 1) pie.appendChild(boton('Ver el roadmap del frente', 'mn-btn is-primary', () => { cerrarPopHito(); f.abrirHito(a); }, { popFrente: '1' }));
    pie.appendChild(boton('Cerrar', 'mn-btn', () => cerrarPopHito(true), { popCerrar: '1' }));
    pop.appendChild(pie);
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); cerrarPopHito(true); } });   // U-30: Esc cierra la hoja (y no sale ademas de pantalla completa)
    document.body.appendChild(pop);
    document.addEventListener('pointerdown', fueraDelPop, true);   // C-15 (v0.120.0): en el acto — la hoja abre en el `click`, que llega DESPUES del pointerdown que la pidio; el setTimeout 0 sobraba
    // U-30: al abrir, el foco va a su primer renglon; C-18: al repintarla tras un refresco, vuelve a donde estaba (si estaba adentro)
    const enfocar = repinta ? (clave && pop.querySelector(clave)) : pop.querySelector('button');
    if (enfocar) enfocar.focus();
}

/**
 * Roadmap del proyecto (pestana «Roadmap», #p/<clave>/roadmap): un carril por columna con sus
 * tarjetas como barras (Desde/creacion -> Vence; las hechas hasta HechoEl), el fin del frente como
 * hito y la raya de hoy. Sin fecha = sin barra, con su texto. Es la foto de referencia (Carlos, 12-sep).
 */
// C-16 (v0.137.0): «ver hechas» y el refresco rehacian la pestana con el boton o la barra con foco dentro; el foco caia al body
const CLAVES_FOCO_P = ['verHechas', 'roadmap', 't', 'sinFecha'];
export function pintarRoadmapProyecto(p) { conservarFoco($('tab-roadmap'), CLAVES_FOCO_P, () => pintarRoadmapProyectoCuerpo(p)); }
function pintarRoadmapProyectoCuerpo(p) {
    const cont = $('tab-roadmap'); const previo = lugarPrevio('p' + p.id, cont.querySelector('.gantt-caja'), cont); cont.textContent = '';   // C-07 (v0.120.0): la caja se rehace; su scroll se lee antes
    const ts = tareasDe(p, estado.tareas);
    const lapsos = ts.map(lapsoTarea); const lp = lapsoProyecto(p, ts); const lapsoDe = new Map(ts.map((t, i) => [t.id, lapsos[i]]));   // C-06 (v0.78.0): un lapso por tarjeta, no uno por comparacion del sort; C-12 (v0.120.0): lapsoProyecto recibe las ya filtradas
    const rango = rangoRoadmap([...lapsos, lp], new Date());
    const filas = []; const cols = columnasDe(p);
    // U-15 (v0.120.0): el fin del frente va ARRIBA del primer grupo; al final quedaba debajo de todas las hechas (y en celular, fuera de la caja)
    if (p.Vence && lp.fin) {
        const eti = el('span', 'g-grupo'); eti.appendChild(iconoEquipo(equipoDe(p), 'sm')); eti.appendChild(el('b', '', 'Fin del frente'));
        eti.appendChild(el('span', 'g-fin-dia' + (diasPara(p.Vence) < 0 ? ' is-danger' : ''), diaMes(p.Vence)));   // U-26: la fecha va en la etiqueta pegada; en celular el rombo queda fuera de la vista
        filas.push({ etiqueta: eti, lapso: { inicio: lp.fin, fin: lp.fin }, clase: diasPara(p.Vence) < 0 ? 'danger' : 'hito', hito: true, texto: fechaEje(p.Vence), titulo: `Fin del frente: ${fechaCorta(p.Vence)}` });
    }
    // v0.11.0: un carril por cubeta del proyecto (mas las huerfanas), en el orden del tablero.
    const carriles = [...cols]; for (const t of ts) if (!carriles.some(c => c.clave === t.Columna)) carriles.push({ clave: t.Columna, nombre: t.Columna, huerfana: true });
    // R-02 (v0.121.0): las hechas van apagadas por omision (la linea de tiempo se lee para ver lo que falta, como «Hide done items» de Jira);
    // su carril queda en su renglon de titulo con el conteo. R-04 (v0.121.0): las tarjetas sin fecha salen del eje a «Sin fecha · N», abajo.
    const verHechas = !!estado.roadmapHechas; const sinFecha = [];
    for (const { clave: col, nombre, huerfana } of carriles) {
        const de = ts.filter(t => t.Columna === col);
        if (!de.length) continue;
        const oculta = col === HECHO && !verHechas; const conFecha = de.filter(t => lapsoDe.get(t.id).fin);
        if (!oculta) sinFecha.push(...de.filter(t => !lapsoDe.get(t.id).fin));
        if (!oculta && !conFecha.length) continue;   // un carril de puras tarjetas sin fecha no gasta renglon: sus tarjetas estan abajo
        // U-22 (v0.120.0): el color de la cubeta es un filete bajo el nombre (--cub, como el tablero desde v0.64.0), ya no un punto
        const cab = el('span', 'g-grupo'); cab.dataset.cls = huerfana ? 'huerfana' : claseDeColumna(col, cols); cab.appendChild(el('b', '', nombre)); cab.appendChild(el('span', 'n', String(de.length)));
        if (oculta) cab.appendChild(el('span', 'g-oculta', 'ocultas'));
        filas.push({ grupo: true, etiqueta: cab });
        if (oculta) continue;
        for (const t of conFecha.sort((a, b) => String(lapsoDe.get(a.id).fin || '9').localeCompare(String(lapsoDe.get(b.id).fin || '9')) || a.id - b.id)) {
            const l = lapsoDe.get(t.id); const d = t.Vence ? diasPara(t.Vence) : null;
            const texto = l.fin ? (t.Columna === HECHO ? `hecha ${fechaEje(t.HechoEl || t.Vence)}` : fraseVence(d, 'corta', fechaEje(t.Vence))) : '';   // C-04 (v0.79.0); U-12 (v0.120.0): sin año si es el de hoy
            filas.push({ etiqueta: etiquetaTarea(t), lapso: l, clase: claseBarraTarea(t), texto, titulo: `${t.Title} · ${texto}`, abrir: () => irTarjetaId(t.id, 'roadmap'), dataset: { roadmap: String(t.id) } });
        }
    }
    if (!ts.length) { cont.appendChild(el('p', 'vacio', 'Sin tarjetas todavía: el roadmap se dibuja con las fechas de vencimiento.')); return; }
    const res = el('p', 'g-resumen', `${rango.dias} días en el eje · ${lapsos.filter(l => l.fin).length} de ${ts.length} tarjetas con fecha · barra = entrada a la columna (o creación) → vencimiento; hecha → cuando se hizo.`);   // U-08 (v0.78.0): un renglon
    const nHechas = ts.filter(t => t.Columna === HECHO).length;
    const herr = el('div', 'g-herr'); herr.appendChild(res);
    if (nHechas) {   // R-02: el interruptor, suelto sobre el gantt; se resuelve el proyecto por id al clic (regla v0.4.0)
        const b = boton(verHechas ? 'ocultar hechas' : `ver hechas (${nHechas})`, 'mn-btn is-ghost is-sm', () => { estado.roadmapHechas = !verHechas; const q = porId(estado.proyectos, p.id); if (q) pintarRoadmapProyecto(q); }, { verHechas: '1' });
        b.setAttribute('aria-pressed', String(verHechas)); herr.appendChild(b);
    }
    cont.appendChild(herr);
    const caja = el('div', 'gantt-caja'); cont.appendChild(caja);
    gantt(caja, filas, rango, { rotulo: 'Tarjeta', previo });
    if (sinFecha.length) {   // R-04: como el «No date» de Asana — una lista de texto con liga a la ficha, no un renglon vacio de gantt por tarjeta
        const sf = el('div', 'g-sinfecha-lista'); sf.id = 'roadmapSinFecha'; sf.appendChild(el('b', '', `Sin fecha · ${sinFecha.length}`));
        for (const t of sinFecha) { const b = el('button', 'g-sf-it', t.Title); b.type = 'button'; b.title = t.Title; b.dataset.sinFecha = String(t.id); b.addEventListener('click', () => irTarjetaId(b.dataset.sinFecha, 'roadmap')); sf.appendChild(b); }
        cont.appendChild(sf);
    }
    // U-13 (v0.120.0): la leyenda de los colores de barra (claseBarraTarea), como la del global
    const ley = el('div', 'g-leyenda'); ley.id = 'roadmapLeyendaP';
    for (const [cls, texto] of [['idle', 'por hacer'], ['brand', 'en curso'], ['info', 'en revisión'], ['ok', 'hecha'], ['danger', 'vencida']]) ley.appendChild(muestraLeyenda('g-barra-mini', cls, texto));
    if (p.Vence && lp.fin) ley.appendChild(muestraLeyenda('g-rombo-mini', 'fin', 'fin del frente'));
    cont.appendChild(ley);
}

/**
 * C-13 (v0.120.0): la etiqueta de un frente en el roadmap global (icono · titulo · «hechas/total · fin dd/mm»), como etiquetaTarea para
 * una tarjeta. nbsp en «f»: un espacio normal al inicio de un item flex se colapsa. v0.40.0: el subtitulo va sin el % (Carlos, 14-sep)
 * — el avance ya es el relleno de la barra. U-09 (v0.78.0): un renglon; bajo 720 px el CSS esconde « hechas» (C-09, v0.120.0: antes
 * lo decidia window.innerWidth) y si aun no cabe la elipsis se come el conteo, nunca la fecha. U-05 (v0.78.0): abre el roadmap del frente.
 */
function etiquetaFrente(p, a) {
    const eti = el('button', 'g-proy'); eti.type = 'button'; eti.dataset.roadmapP = String(p.id); eti.title = p.Title;
    eti.appendChild(iconoEquipo(equipoDe(p), 'sm'));
    const c = el('span', 'cuerpo'); c.appendChild(el('span', 't', p.Title));
    const m = el('span', 'm'); const k = el('span', 'k', `${a.hechas}/${a.total}`); k.appendChild(el('span', 'solo-ancho', ' hechas')); m.appendChild(k);
    m.appendChild(el('span', 'f', p.Vence ? `\u00a0· fin ${diaMes(p.Vence)}` : '\u00a0· sin fin'));
    c.appendChild(m); eti.appendChild(c);
    eti.addEventListener('click', () => irFrenteId(p.id, 'roadmap'));
    return eti;
}
/** Lo que dice la barra de un frente: su avance (la fecha la dice su raya). U-16 (v0.120.0): sin tarjetas no hay avance que decir. R-03 (v0.121.0): y cuantas ya se le vencieron. */
function textoBarraFrente(p, a, venc = 0) {
    if (!a.total) return 'sin tarjetas';
    const v = venc ? ` · ${venc} ${venc === 1 ? 'vencida' : 'vencidas'}` : '';
    return p.Vence ? `${a.pct}%${v}` : `${a.pct}% · sin fin de frente${v}`;
}
/**
 * R-03 (v0.121.0): la salud de un frente, como la «health» del Timeline de Linear, derivada sin columna nueva: la clase de su fin
 * (rojo si ya paso, ambar si esta a CONFIG.vencePronto dias) y, si trae al menos una tarjeta vencida, ambar aunque su fin este lejos.
 */
function claseFrente(p, venc) {
    const c = p.Vence ? claseVence(diasPara(p.Vence), CONFIG.vencePronto, 'brand') : 'idle';
    return venc && (c === 'brand' || c === 'idle') ? 'warn' : c;
}

/**
 * Roadmap global (pantalla «Roadmap»): un frente por fila, del rail sale el filtro por equipo, la
 * barra va de la creacion del proyecto al fin del frente con su avance adentro; abajo los hitos que
 * vienen (fines de frente a 60 dias). v0.46.0 (Carlos, 15-sep): la fila de KPI (total · en proceso · hechas · vencidas) SALIO.
 */
// C-16 (v0.137.0): la escala, el refresco de 120 s y el resize rehacian los botones de escala, las barras y los rombos con el foco dentro
const CLAVES_FOCO = ['escala', 'roadmapBarra', 'roadmapP', 'hito'];
export function pintarRoadmap() { conservarFoco($('p-roadmap'), CLAVES_FOCO, pintarRoadmapCuerpo); }
function pintarRoadmapCuerpo() {
    // El filtro por equipo del rail aplica PAREJO: filas e hitos (el revisor vio cifras globales con «2 frentes de CALYTEK» arriba).
    const ps = ordenarProyectos(visibles());   // C-03: la regla del rail vive en reglas.js
    const n = ps.length, frentes = n === 1 ? '1 frente' : `${n} frentes`;   // U-08 (v0.78.0): plural real, y lo que es la barra lo dice la leyenda, no dos veces
    $('roadmapSub').textContent = estado.filtroEquipo ? `${frentes} de ${nombreEquipoFiltrado()}; quita el filtro en el rail para ver todos.` : `${frentes} ${plural(n, 'activo')}, del que vence antes al que vence después.`;
    const tsDe = new Map(ps.map(p => [p.id, tareasDe(p, estado.tareas)]));   // C-06 (v0.78.0): las tarjetas de cada frente se filtran UNA vez (antes tres: hitos, fila e hito de fin)
    const caja = $('roadmapCaja'); const previo = lugarPrevio('global', caja); caja.textContent = ''; caja.dataset.anchoPintado = String(caja.clientWidth);   // C-01 (v0.78.0): el umbral de agrupado sale de este ancho; si cambia, se repinta. C-07 (v0.120.0): el scroll se lee antes de vaciar
    const ley = $('roadmapLeyenda'); ley.textContent = ''; ley.classList.toggle('oculto', !ps.length);
    if (!ps.length) { caja.appendChild(el('p', 'vacio', 'Sin proyectos activos.')); }
    else {
        // v0.22.0 (iteracion 4): cada tarjeta con Vence es un HITO (rombo) sobre la barra de su frente. Los rombos que
        // caerian encima se agrupan («+N»); el umbral sale del ancho real de la pista (14 px de rombo + aire), y si la
        // caja aun no mide (pantalla oculta) se toma 2 % del eje. El titulo del rombo se pinta si hay ~56 px libres.
        // C-09 (v0.120.0): la columna del nombre (--eti) y el ancho minimo del gantt (--gantt-min) se LEEN del CSS de la caja; el corte de 720 px vive solo en estilo.css
        const cs = getComputedStyle(caja), eti = parseFloat(cs.getPropertyValue('--eti')) || 0, minimo = parseFloat(cs.getPropertyValue('--gantt-min')) || 0;
        const hitosPs = ps.map(p => hitosDe(tsDe.get(p.id), CONFIG.vencePronto));
        // Un frente sin ninguna fecha (ni fin ni tarjetas con vencimiento) se dibuja de su creacion a hoy, en gris; uno sin
        // fin de frente pero con tarjetas con fecha lleva la barra gris hasta su ultima tarjeta con fecha (lapsoProyecto), con
        // los rombos encima — el mockup los pintaba sin barra, pero la barra es lo que abre el frente y lo que la E2E cuenta.
        const lapsos = ps.map(p => { const l = lapsoProyecto(p, tsDe.get(p.id)); return l.fin ? l : { inicio: l.inicio || hoyDia(), fin: hoyDia() }; });   // C-12 (v0.122.0, correccion): las tarjetas DEL frente; v0.120.0 le paso todas y un frente sin fin se estiraba a la ultima fecha de cualquier proyecto
        const rango = rangoRoadmap([...lapsos, ...hitosPs.flat().map(h => ({ inicio: h.dia, fin: h.dia }))], new Date(), 84);
        // R-01 (v0.122.0): la pista mide lo que pide la escala (dias visibles en el ancho visible), nunca menos que ese ancho; sin la escala
        // (caja oculta, mide 0) queda como antes: el ancho de la caja o el --gantt-min. El umbral de los rombos sale de este ancho real.
        const esc = escalaRoadmap(caja); pintarEscala(esc); caja.dataset.escala = esc;
        const visible = caja.clientWidth ? caja.clientWidth - eti : 0;
        const anchoPista = visible > 0 ? Math.max(visible, Math.round(rango.dias * visible / ESCALAS.find(x => x[0] === esc)[2])) : caja.clientWidth ? Math.max(caja.clientWidth, minimo) - eti : 0;
        const umbral = anchoPista ? 18 * 100 / anchoPista : 2, umbralTxt = anchoPista ? 56 * 100 / anchoPista : 6;
        const filas = ps.map((p, i) => {
            const ts = tsDe.get(p.id); const a = avance(ts, columnasDe(p)); const d = diasPara(p.Vence);
            const eti = etiquetaFrente(p, a);
            const textoFin = !p.Vence ? 'sin fin de frente' : fraseVence(d, 'corta', fechaCorta(p.Vence));   // C-04 (v0.79.0)
            // la fecha del fin ya la dice su raya: adentro de la barra queda solo el avance (el title trae todo)
            const fin = p.Vence && lapsos[i].fin ? { left: (diasEntre(rango.desde, lapsos[i].fin) + 1) * 100 / rango.dias, texto: diaMes(p.Vence), titulo: `Fin del frente: ${fechaCorta(p.Vence)}` } : null;
            const hitos = acomodarHitos(hitosPs[i], rango, umbral, fin ? fin.left : 100);
            for (const h of hitos) h.titulo = h.hitos.length > 1 ? `${h.hitos.length} tarjetas del ${fechaCorta(h.dia)} al ${fechaCorta(h.hasta)}: ${h.hitos.map(x => x.tarea.Title).join(' · ')} — ${tactil() ? 'toca para verlas' : 'abre el roadmap del frente'}` : tituloHito(h.hitos[0]);
            const nHitos = hitos.reduce((n, h) => n + h.hitos.length, 0); const venc = vencidasEn(ts);
            // U-23: si el texto de la barra no cabe a la derecha del ultimo rombo que cae sobre ella, «N vencidas» pasa a la etiqueta pegada (en celular se leia «4◆◇ncidas»)
            let texto = textoBarraFrente(p, a, venc); const bb = venc && anchoPista && hitos.length ? barraEn(lapsos[i], rango) : null;
            if (bb) {
                const ult = Math.max(bb.left, ...hitos.map(h => h.left).filter(l => l >= bb.left && l <= bb.left + bb.width));
                if ((bb.left + bb.width - ult) * anchoPista / 100 - 12 < texto.length * 7 + 12) { texto = textoBarraFrente(p, a); eti.querySelector('.cuerpo').appendChild(el('span', 'v', `${venc} ${venc === 1 ? 'vencida' : 'vencidas'}`)); }   // su propio renglon: el de «7/17 · fin» ya va lleno a 390
            }
            return {
                etiqueta: eti, lapso: lapsos[i], clase: claseFrente(p, venc), pct: a.pct, texto,
                titulo: `${p.Title} · ${textoFin} · ${a.pct}% · ${nHitos} hito(s)${venc ? ` · ${venc} vencida(s)` : ''}`, abrir: () => irFrenteId(p.id, 'roadmap'), dataset: { roadmapBarra: String(p.id) }, sinFecha: 'sin fechas', fin, hitos,
                abrirHito: h => h.hitos.length > 1 ? irFrenteId(p.id, 'roadmap') : irTarjetaId(h.hitos[0].tarea.id)
            };
        });
        gantt(caja, filas, rango, { rotulo: 'Frente', umbralTxt, anchoPista, previo, anchoGantt: visible > 0 ? eti + anchoPista : 0 });
        // leyenda: las cuatro clases del rombo y que es cada cosa (la N de «pronto» sale de CONFIG, como en el tablero)
        const item = (cls, texto) => muestraLeyenda('g-rombo-mini', cls, texto);   // C-20
        ley.appendChild(item('', 'hito pendiente')); ley.appendChild(item('pronto', `vence hoy o en ${CONFIG.vencePronto} días`)); ley.appendChild(item('vencida', 'vencido')); ley.appendChild(item('hecha', 'hecho'));
        for (const [cls, texto] of [['brand', 'frente a tiempo'], ['warn', 'en riesgo: fin cercano o tarjetas vencidas'], ['danger', 'fin del frente vencido']]) ley.appendChild(muestraLeyenda('g-barra-mini', cls, texto));   // R-03 (v0.121.0)
        ley.appendChild(el('span', 'fin', 'rombo = tarjeta con fecha · barra = creación → fin del frente · relleno = avance · raya = fin del frente'));
    }
    // hitos: fines de frente en los proximos 60 dias (y los ya vencidos), como «Upcoming milestones» de la foto
    const h = $('roadmapHitos'); h.textContent = '';
    const hitos = ps.filter(p => p.Vence && diasPara(p.Vence) <= 60).sort((a, b) => String(a.Vence).localeCompare(String(b.Vence)));
    for (const p of hitos) {
        const d = diasPara(p.Vence); const ts = tsDe.get(p.id); const faltan = ts.filter(t => t.Columna !== HECHO).length; const dia = diaDe(p.Vence);   // C-02 (v0.78.0): el dia corta por hora de Mexico, como el resto de la app
        const kv = claseVence(d, CONFIG.vencePronto, ''); const it = el('button', 'hito' + (kv ? ' is-' + kv : '')); it.type = 'button'; it.dataset.hito = String(p.id);   // C-04 (v0.79.0)
        const f = el('span', 'fecha'); f.appendChild(el('small', '', mesCorto(dia))); f.appendChild(el('b', '', String(diaNum(dia)))); it.appendChild(f);
        const c = el('span', 'cuerpo'); c.appendChild(el('span', 't', p.Title)); c.appendChild(el('span', 'm', `${equipoDe(p).nombre} · ${faltan ? `faltan ${faltan}` : 'todo hecho'}`)); it.appendChild(c);
        it.appendChild(chip(fraseVence(d, 'chip'), claseVence(d, CONFIG.vencePronto, 'info')));
        it.addEventListener('click', () => irFrenteId(p.id)); h.appendChild(it);
    }
    if (!hitos.length) h.appendChild(el('p', 'vacio', 'Ningún fin de frente en los próximos 60 días.'));
}

// ---------------------------------------------------------------- calendario

/**
 * Calendario mensual: las tarjetas por su Vence (abiertas y hechas, con su color) y los fines de frente.
 * En escritorio es la rejilla de las semanas que tocan el mes (4-6, U-14); en celular la misma informacion como agenda (CSS decide).
 * El mes que eligen ‹ › vive en estado.mesCal (YYYY-MM); null = el mes de hoy, recalculado en cada pintada (C-06). «Hoy» vuelve al actual.
 */
/**
 * U-02 / U-04 (v0.86.0): tras elegir un dia, «+N más» o «Hoy», llevar a la vista lo que cambio: el detalle del dia en escritorio
 * (antes quedaba bajo el pliegue de una laptop) o, en el celular, el bloque de hoy de la agenda (o el primero por venir; antes «Hoy»
 * no movia nada visible porque su efecto vive en #calDetalle, que el CSS esconde). offsetParent es null en el contenedor escondido.
 */
export function enfocarCal() {
    const det = $('calDetalle');
    if (det.offsetParent) { det.scrollIntoView({ block: 'nearest' }); return; }
    const ag = $('calAgenda'); if (!ag.offsetParent) return;
    const bloque = ag.querySelector('.cal-ag.is-hoy') || ag.querySelector('.cal-ag:not(.is-pasado)');
    if (bloque) bloque.scrollIntoView({ block: 'start' });
}
// U-10 (v0.154.0): lo abierto que vence en los proximos CONFIG.semaforoDias (el mismo corte que el filete de la tarjeta) va en ambar;
// fuera de esa ventana manda la cubeta, como en C-01. Solo el calendario: claseBarraTarea del roadmap no cambia.
const claseCal = t => { const c = claseBarraTarea(t); return c !== 'ok' && c !== 'danger' && estadoVence(t, CONFIG.semaforoDias) === 'warn' ? 'warn' : c; };
const LEYENDA_CAL = [['danger', 'vencida'], ['warn', 'vence pronto'], ['idle', 'por hacer'], ['brand', 'en curso'], ['info', 'en revisión'], ['ok', 'hecha'], ['hito', 'fin de frente']];   // U-11 (v0.154.0)
/** U-04 (v0.86.0) + C-10 (v0.154.0): elegir (o soltar) un dia; lo llaman los delegados de engancharCalendario. */
function elegirDia(dia, soltar = true) { estado.calDia = soltar && estado.calDia === dia ? null : dia; pintarCalendario(); enfocarCal(); }
export function pintarCalendario() {
    const mes = mesActual(); const hoy = hoyDia();   // C-06 (v0.154.0): sin escribir estado.mesCal — solo ‹ › y «Hoy» lo fijan; antes la PWA abierta al cruzar de mes se quedaba en el anterior
    $('calTitulo').textContent = nombreMes(mes);
    const activosF = visibles();   // C-03
    const idsF = new Set(activosF.map(p => p.id));   // v0.13.1
    const agenda = agendaPorDia(estado.tareas.filter(t => idsF.has(Number(t.ProyectoId))), activosF);
    const celdas = celdasDelMes(mes);
    const enMes = celdas.filter(c => c.enMes);
    const nT = enMes.reduce((n, c) => n + ((agenda.get(c.dia) || { tareas: [] }).tareas.length), 0), nF = enMes.reduce((n, c) => n + ((agenda.get(c.dia) || { fines: [] }).fines.length), 0);
    const nV = enMes.reduce((n, c) => n + ((agenda.get(c.dia) || { tareas: [] }).tareas.filter(t => estadoVence(t) === 'danger').length), 0);   // U-15 (v0.154.0): cuantas de esas ya vencieron (abiertas)
    const sub = $('calSub'); sub.textContent = `${nT} ${nT === 1 ? 'tarjeta' : 'tarjetas'} con fecha este mes · ${nF} ${nF === 1 ? 'fin' : 'fines'} de frente`;   // U-05 (v0.86.0): plural real; cuenta lo mismo que pintan la rejilla y la agenda
    if (nV) { sub.appendChild(document.createTextNode(' · ')); sub.appendChild(el('span', 'cal-sub-venc', `${nV} ${nV === 1 ? 'vencida' : 'vencidas'}`)); }
    if (estado.filtroEquipo) sub.appendChild(document.createTextNode(` · solo ${nombreEquipoFiltrado()}`));
    const itemTarea = (t, largo) => {
        const p = porId(estado.proyectos, t.ProyectoId), quien = t.Asignado ? nombreDe(t.Asignado, estado.roles) : '';
        const d = estadoVence(t) === 'danger' ? fraseVence(diasPara(t.Vence), 'dias') : '';   // U-09 (v0.154.0): «venció hace N d» en palabras, no solo en rojo
        const b = el('button', 'cal-it is-' + claseCal(t)); b.type = 'button'; b.dataset.calT = String(t.id); b.title = `${t.Title}${p ? ' · ' + p.Title : ''}${quien ? ' · ' + quien : ''}${d ? ' · ' + d : ''}`;   // C-01 (v0.86.0): hecha→ok, vencida→danger, columna→info/brand/idle; U-10: ambar si vence pronto
        b.appendChild(el('span', 't', t.Title));
        if (largo) { const m = [d, p && p.Title, t.Asignado ? nombreCorto(t.Asignado, estado.roles) : 'sin asignar'].filter(Boolean).join(' · '); b.appendChild(el('span', 'm', m)); }   // U-13 (v0.154.0): a quien le toca, visible (en tactil no hay title); U-09: «venció…» primero, la elipsis del detalle corta por el final
        else if (d) b.appendChild(el('span', 'mn-sr', ' · ' + d));
        return b;   // C-10 (v0.154.0): el clic lo resuelve el delegado de engancharCalendario, por id (C-02)
    };
    const itemFin = p => { const b = el('button', 'cal-it is-hito'); b.type = 'button'; b.dataset.calP = String(p.id); b.title = `Fin del frente · ${p.Title}`; b.appendChild(iconoEquipo(equipoDe(p), 'sm')); b.appendChild(el('span', 't', `Fin: ${p.Title}`)); return b; };   // C-02 (v0.86.0)
    const FOCO_CAL = ['dia', 'calT', 'calP'];   // C-07 (v0.154.0): el refresco de 120 s ya no tira el foco; un contenedor a la vez, porque la misma tarjeta vive en 2-3 de ellos
    const g = $('calRejilla');
    conservarFoco(g, FOCO_CAL, () => {
        g.textContent = '';
        for (const d of DIAS_CORTOS) g.appendChild(el('div', 'cal-dow', d));
        for (const c of celdas) {
            const a = (c.enMes && agenda.get(c.dia)) || { tareas: [], fines: [] };   // U-05 (v0.86.0): los dias de fuera del mes no pintan; la agenda del celular y el subtitulo nunca los contaron. Revertir = quitar `c.enMes &&`
            const celda = el('div', 'cal-dia' + (c.enMes ? '' : ' is-fuera') + (c.dia === hoy ? ' is-hoy' : '') + (a.tareas.length + a.fines.length ? ' con' : '')); celda.dataset.dia = c.dia;
            celda.appendChild(el('span', 'num', String(diaNum(c.dia))));
            const tope = 3;
            for (const p of a.fines) celda.appendChild(itemFin(p));
            for (const t of a.tareas.slice(0, tope)) celda.appendChild(itemTarea(t, false));
            if (a.tareas.length > tope) { const mas = el('button', 'cal-mas', `+${a.tareas.length - tope} más`); mas.type = 'button'; celda.appendChild(mas); }
            celda.tabIndex = 0; celda.setAttribute('role', 'button'); celda.setAttribute('aria-label', `${diaNum(c.dia)} de ${mesLargo(c.dia)}${a.tareas.length ? ` · ${a.tareas.length} ${a.tareas.length === 1 ? 'tarjeta' : 'tarjetas'}` : ''}${a.fines.length ? ' · fin de frente' : ''}`);
            celda.setAttribute('aria-pressed', String(estado.calDia === c.dia)); if (estado.calDia === c.dia) celda.classList.add('is-elegido');   // U-07 (v0.86.0): el lector de pantalla sabe cual dia esta abierto
            g.appendChild(celda);
        }
    });
    // detalle del dia elegido (escritorio) y agenda del mes (celular)
    const det = $('calDetalle');
    conservarFoco(det, FOCO_CAL, () => {
        det.textContent = '';
        if (estado.calDia) {
            const a = agenda.get(estado.calDia) || { tareas: [], fines: [] };
            det.appendChild(el('h2', '', `${diaCorto(estado.calDia)} ${diaNum(estado.calDia)} de ${mesLargo(estado.calDia)}`));
            for (const p of a.fines) det.appendChild(itemFin(p)); for (const t of a.tareas) det.appendChild(itemTarea(t, true));
            if (!a.tareas.length && !a.fines.length) det.appendChild(el('p', 'vacio', 'Nada vence este día.'));
        }
        det.classList.toggle('oculto', !estado.calDia);
    });
    const ag = $('calAgenda');
    conservarFoco(ag, FOCO_CAL, () => {
        ag.textContent = '';
        for (const c of enMes) {
            const a = agenda.get(c.dia); if (!a) continue;
            const abiertas = c.dia < hoy && (a.fines.length || a.tareas.some(t => estadoVence(t) === 'danger'));   // U-08 (v0.154.0): el dia pasado con vencidas NO se atenua
            const bloque = el('section', 'cal-ag' + (c.dia === hoy ? ' is-hoy' : '') + (c.dia < hoy ? ' is-pasado' : '') + (abiertas ? ' con-vencidas' : ''));
            bloque.appendChild(el('h3', '', `${diaCorto(c.dia)} ${diaNum(c.dia)}`));
            for (const p of a.fines) bloque.appendChild(itemFin(p)); for (const t of a.tareas) bloque.appendChild(itemTarea(t, true));
            ag.appendChild(bloque);
        }
        if (!ag.childNodes.length) ag.appendChild(el('p', 'vacio', 'Nada vence este mes.'));
    });
    const ley = $('calLeyenda');
    if (!ley.childNodes.length) for (const [cls, texto] of LEYENDA_CAL) ley.appendChild(muestraLeyenda('g-barra-mini', cls, texto));   // U-11 (v0.154.0): fija, se arma una vez
}
/**
 * v0.26.0: la linea de tiempo del Roadmap a PANTALLA COMPLETA (Carlos, 14-sep). La tarjeta `#roadmapLinea` toma la clase
 * `is-full` (fija, ocupa la ventana entera, por encima del rail y de la barra movil) y el gantt se repinta para que el
 * umbral de los rombos salga del ancho nuevo. Esc o el mismo boton la devuelven; cambiar de pantalla tambien la cierra.
 * No usa la Fullscreen API: la PWA de iOS no la tiene, y una clase CSS se prueba en la E2E sin permisos del navegador.
 */
export function roadmapFull(activar) {
    const sec = $('roadmapLinea'), b = $('btnRoadmapFull');
    const on = activar === undefined ? !sec.classList.contains('is-full') : !!activar;
    if (on === sec.classList.contains('is-full')) return;
    sec.classList.toggle('is-full', on); document.body.classList.toggle('sin-scroll', on);
    b.textContent = on ? 'salir de pantalla completa' : 'pantalla completa'; b.setAttribute('aria-pressed', String(on));
    pintarRoadmap();   // el umbral de los rombos depende del ancho real de la pista
}
export function engancharRoadmap() {
    // C-01 (v0.78.0): el umbral de agrupado de los rombos sale del ancho real de la pista; si la caja cambia de ancho con la
    // pantalla visible (rotar el celular, plegar el rail, pantalla completa, redimensionar), se repinta. Cuando esta oculta mide 0 y no se toca.
    // El ResizeObserver cubre el rail y la pantalla completa (la ventana no cambia); `resize` cubre rotar y redimensionar, y es lo que la E2E dispara:
    // bajo tiempo virtual el observer no entrega en todas las corridas (medido 2026-09-16: 1 de 3).
    const caja = $('roadmapCaja');
    const revisarAncho = conRetardo(() => { const w = caja.clientWidth; if (w && estado.pestana === 'roadmap' && String(w) !== caja.dataset.anchoPintado) pintarRoadmap(); }, 100);   // C-10 (v0.120.0): una rafaga de resize (arrastrar la ventana) repinta una vez, no en cada evento
    if (typeof ResizeObserver === 'function') new ResizeObserver(revisarAncho).observe(caja);
    window.addEventListener('resize', revisarAncho);
    window.addEventListener('hashchange', () => cerrarPopHito());   // U-04 (v0.79.0, revisor): «Atrás» cambia de pantalla sin repintar el gantt y la hoja fija se quedaba encima
    $('btnRoadmapFull').addEventListener('click', () => roadmapFull());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('roadmapLinea').classList.contains('is-full')) roadmapFull(false); });
}

export function engancharCalendario() {
    $('calAnterior').addEventListener('click', () => { estado.mesCal = mesSumar(mesActual(), -1); estado.calDia = null; pintarCalendario(); });
    $('calSiguiente').addEventListener('click', () => { estado.mesCal = mesSumar(mesActual(), 1); estado.calDia = null; pintarCalendario(); });
    $('calHoy').addEventListener('click', () => { estado.mesCal = hoyDia().slice(0, 7); estado.calDia = hoyDia(); pintarCalendario(); enfocarCal(); });   // U-02 (v0.86.0): «Hoy» tambien lleva a la vista
    // C-10 (v0.154.0): un delegado por contenedor en lugar de ~85 listeners por pintada; las tarjetas y los fines se resuelven por id al clic (C-02)
    const abrirItem = e => { const t = e.target.closest('[data-cal-t]'); if (t) { irTarjetaId(t.dataset.calT); return true; } const p = e.target.closest('[data-cal-p]'); if (p) { irFrenteId(p.dataset.calP); return true; } return false; };
    for (const id of ['calDetalle', 'calAgenda']) $(id).addEventListener('click', abrirItem);
    $('calRejilla').addEventListener('click', e => {
        if (abrirItem(e)) return;
        const celda = e.target.closest('.cal-dia'); if (!celda) return;
        if (e.target.closest('.cal-mas')) elegirDia(celda.dataset.dia, false);   // «+N más» elige ese dia, nunca lo suelta
        else if (e.target === celda || e.target.classList.contains('num')) elegirDia(celda.dataset.dia);
    });
    $('calRejilla').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('cal-dia')) { e.preventDefault(); elegirDia(e.target.dataset.dia); } });
    // U-07 (v0.86.0): Esc suelta el dia elegido (antes habia que volver a la celda y repetir Enter); no toca un <dialog> abierto, que ya tiene su Esc
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && estado.pestana === 'calendario' && estado.calDia && !document.querySelector('dialog[open]')) { estado.calDia = null; pintarCalendario(); } });
}

// ---------------------------------------------------------------- mensajes

/**
 * Mensajes (v0.42.0, Carlos 14-sep, artifact 17j5wESZ «bandeja + hilo solamente»): a la izquierda la bandeja en dos
 * secciones —Frentes (los que tienen chat, el mas reciente arriba) y Sin conversacion (plegada)— y a la derecha el hilo
 * del frente elegido, que es el MISMO #tab-chat de la pestana del proyecto alojado aqui (alojarChat).
 * v0.43.0 (Carlos, 15-sep): SOLO chat por frente. La seccion Personas y la ficha con la liga a Teams (v0.42.0) salieron:
 * casi no se usaban, y un chat 1:1 en la app no seria privado (la bitacora PROY_Actividad la lee todo el equipo).
 * El estado vive en estado.mensajesSel = {t:'f', k: clave}; el hash lo refleja (#mensajes/f/<clave>).
 * En celular (≤ 900) se ve una columna a la vez y «←» regresa (v0.138.0: la flecha sola, en el renglón del título).
 */
let casaChat = null;   // donde vive #tab-chat en index.html (la pestana del proyecto), para devolverlo
function alojarChat(host) {
    const c = $('tab-chat'); if (!c) return;
    if (!casaChat) casaChat = { padre: c.parentNode, sig: c.nextSibling };
    if (host) { if (c.parentNode !== host) host.appendChild(c); c.classList.remove('oculto'); }
    else if (c.parentNode !== casaChat.padre) { casaChat.padre.insertBefore(c, casaChat.sig); c.classList.add('oculto'); }
}
/** app.js lo llama al repintar cualquier pantalla que no sea Mensajes: el hilo vuelve a la pestana del proyecto. */
export function devolverChat() { alojarChat(null); }

const coincide = (q, ...textos) => !q || textos.some(t => sinAcentos(String(t || '')).includes(q));

/**
 * C-12/C-13 (v0.138.0): el frente cuyo chat esta en pantalla (la pestana Chat del proyecto, o el hilo abierto en Mensajes) ya se
 * esta leyendo: cuenta 0 nuevos en TODO lugar —renglon, rail plegado, subtitulo e insignia—. Antes solo mensajesNuevos lo
 * descontaba y la bandeja se pintaba antes de que pintarChat subiera la marca: el renglon elegido decia «3» y la insignia 0.
 */
function leyendoAhora() {
    const sel = estado.pestana === 'mensajes' ? proyectoDeMensajes() : null;
    return estado.pestana === 'proyecto' && estado.tab === 'chat' && proyectoAbierto() ? proyectoAbierto().id : sel ? sel.id : null;
}
const nuevosSinLeer = (pid, leyendo) => pid === leyendo ? 0 : nuevosDe(pid);   // C-04: nuevosDe sale del indice

export function pintarMensajes() {
    const sel = estado.mensajesSel || null;
    const leyendo = leyendoAhora();
    const { ult, sinChat } = pintarListaMensajes(sel, leyendo);
    pintarDerechaMensajes(sel, leyendo, ult, sinChat);
}
/**
 * C-14 (v0.138.0): la mitad que el buscador filtra —las dos secciones de la bandeja y el subtitulo—. El input la llama sola (con
 * retardo): antes cada tecla repintaba tambien el rail y el hilo entero, con sus lecturas de layout (ajustarHilo).
 */
function pintarListaMensajes(sel = estado.mensajesSel || null, leyendo = leyendoAhora()) {
    const yo = estado.cuenta.username.toLowerCase();
    const q = sinAcentos(estado.buscaMensajes || '').trim();
    const ult = ultimoComentarioPorProyecto(estado.actividad);
    const lista = $('mensajesLista'); lista.textContent = '';
    const seccion = (titulo, n, abierta, hijos, clave, vacio) => {
        const d = el('details', 'msj-sec'); d.open = abierta; d.dataset.sec = clave;
        const s = el('summary'); s.appendChild(el('span', '', titulo)); s.appendChild(el('span', 'cnt mn-mono', String(n))); d.appendChild(s);
        for (const h of hijos) d.appendChild(h);
        if (!hijos.length) d.appendChild(el('p', 'vacio', q ? 'Nada coincide.' : vacio));   // U-06 (17-sep): un estado vacio que diga que hacer, no «—»
        return d;
    };
    // U-09 (v0.138.0): `hallado` es el mensaje que casó con el buscador cuando no es el ultimo; el preview lo enseña a él.
    const renglon = (p, ultimo, hallado) => {
        const nuevos = nuevosSinLeer(p.id, leyendo);   // C-13: renglon ya no acumula el total
        const on = sel && sel.t === 'f' && sel.k === p.Clave;
        const b = el('button', 'msg-proy' + (nuevos ? ' is-nuevo' : '') + (ultimo ? '' : ' is-vacio') + (on ? ' is-on' : '')); b.type = 'button'; b.dataset.mensajes = String(p.id);
        b.setAttribute('aria-current', on ? 'true' : 'false');
        // v0.49.0 (Carlos, 15-sep; artifact C8meacEE, opcion B): sin la columna del avatar / icono grande — el titulo ya
        // trae el icono chico de la unidad y el preview nombra a quien escribio; la bolita repetia las dos cosas.
        const c = el('span', 'cuerpo');
        const cab = el('span', 'cab'); const t = el('span', 't'); t.appendChild(iconoEquipo(equipoDe(p), 'sm')); t.appendChild(el('span', '', p.Title)); cab.appendChild(t);
        if (ultimo) { const d = el('span', 'd', fechaBandeja(ultimo.Cuando)); d.title = fechaHora(ultimo.Cuando); cab.appendChild(d); }   // U-04: relativa; la completa en el title
        c.appendChild(cab);
        const m = el('span', 'm');
        const vista = hallado || ultimo;
        if (vista) { m.appendChild(el('b', '', (String(vista.Quien || '').toLowerCase() === yo ? 'Tú' : nombreCorto(vista.Quien, estado.roles)) + (vista.TareaId ? ' (nota): ' : ': '))); m.appendChild(textoConMenciones(vista.Title, undefined, false)); if (hallado) m.title = `Coincide · ${fechaHora(hallado.Cuando)}`; }
        else m.textContent = p.Estado === 'activo' ? 'Sin conversación todavía.' : 'Cerrado · sin conversación.';
        c.appendChild(m); b.appendChild(c);
        const lado = el('span', 'lado');
        if (nuevos) { const n = el('b', 'mn-rail-hot', String(nuevos)); n.title = `${nuevos} ${plural(nuevos, 'nuevo')} desde tu última visita`; lado.appendChild(n); }
        if (p.Estado !== 'activo') lado.appendChild(chip('cerrado'));
        b.appendChild(lado);
        // R-04 (v0.139.0): el renglon que casó por un mensaje viejo abre el hilo EN ese mensaje (la busqueda de Google Chat).
        // Si ese frente ya es el hilo abierto, aplicarHash no repinta (la seleccion no cambio): se pinta aqui, o `irA` quedaba
        // pendiente y el refresco de 120 s saltaba al mensaje viejo (revisor v0.139.0).
        b.addEventListener('click', () => {
            const ya = proyectoDeMensajes();
            if (hallado) { irAlComentario(p.id, hallado.id); if (ya && ya.id === p.id) { pintarChat(ya); return; } }
            irAHash(`#mensajes/f/${p.Clave}`);
        });
        return b;
    };
    // U-09 (v0.138.0): el buscador dice «frente o texto» y solo miraba el ULTIMO mensaje; ahora recorre el hilo entero (del mas
    // nuevo al mas viejo) y se queda con el primer mensaje que case.
    const hallar = p => { const cs = comentariosDe(p.id); for (let i = cs.length - 1; i >= 0; i--) if (coincide(q, cs[i].Title, nombreDe(cs[i].Quien, estado.roles))) return cs[i]; return null; };
    const con = [];
    for (const x of ult) {
        const p = porId(estado.proyectos, x.proyectoId); if (!p) continue;
        if (coincide(q, p.Title, p.Clave)) { con.push({ p, ultimo: x.ultimo, hallado: null }); continue; }
        const h = hallar(p); if (h) con.push({ p, ultimo: x.ultimo, hallado: h.id === x.ultimo.id ? null : h });
    }
    const conChatIds = new Set(ult.map(x => x.proyectoId));
    const sinChat = ordenarProyectos(activos().filter(p => !conChatIds.has(p.id)));   // C-07: una vez, para la seccion y el rail
    const sin = sinChat.filter(p => coincide(q, p.Title, p.Clave));
    lista.appendChild(seccion('Frentes', con.length, true, con.map(x => renglon(x.p, x.ultimo, x.hallado)), 'frentes', 'Ningún frente tiene conversación todavía: abre uno en «Sin conversación».'));
    lista.appendChild(seccion('Sin conversación', sin.length, !!q, sin.map(p => renglon(p, null, null)), 'sin', 'Todos los frentes activos ya tienen conversación.'));
    // U-03 (17-sep): solo la cifra, con plural real; la instruccion del @ ya vive en el placeholder del cuadro de texto.
    // C-13 (v0.138.0): el total es el MISMO de la insignia del rail (mensajesNuevos: frentes activos, sin el que se lee).
    const nuevosTotal = mensajesNuevos();
    $('mensajesSub').textContent = `${con.length} ${plural(con.length, 'conversación', 'conversaciones')} · ${nuevosTotal ? `${nuevosTotal} ${plural(nuevosTotal, 'mensaje nuevo', 'mensajes nuevos')} desde tu última visita` : 'nada nuevo desde tu última visita'}.`;
    return { ult, sinChat };
}
/** C-14 (v0.138.0): lo que el buscador NO filtra —el rail plegado y el hilo del frente elegido—. */
function pintarDerechaMensajes(sel, leyendo, ult, sinChat) {
    // v0.56.0 (Carlos, 15-sep; artifact MHCmeJw5, opción C): la bandeja PLEGADA es un botón por frente —icono de la unidad,
    // título en el title, insignia de nuevos— en el MISMO orden de la lista (con conversación primero, luego sin). El buscador
    // no la filtra: plegada no hay buscador a la vista, y esconder un frente ahí sería esconderlo sin avisar.
    const rail = $('mensajesRailFrentes'); rail.textContent = '';
    const frenteRail = (p, conChat) => {
        const nuevos = nuevosSinLeer(p.id, leyendo); const on = sel && sel.t === 'f' && sel.k === p.Clave;
        const b = el('button', 'msj-frente' + (conChat ? '' : ' is-vacio') + (on ? ' is-on' : '')); b.type = 'button'; b.dataset.mensajesRail = String(p.id);
        b.title = p.Title + (nuevos ? ` · ${nuevos} ${plural(nuevos, 'nuevo')}` : conChat ? '' : ' · sin conversación'); b.setAttribute('aria-label', b.title); b.setAttribute('aria-current', on ? 'true' : 'false');
        b.appendChild(iconoEquipo(equipoDe(p)));
        if (nuevos) b.appendChild(el('b', 'msj-hot', String(nuevos)));
        b.addEventListener('click', () => irAHash(`#mensajes/f/${p.Clave}`));
        return b;
    };
    for (const x of ult) { const p = porId(estado.proyectos, x.proyectoId); if (p) rail.appendChild(frenteRail(p, true)); }
    for (const p of sinChat) rail.appendChild(frenteRail(p, false));
    // ---- derecha: hilo del frente (con su cabecera, U-01) o el aviso de elegir
    const p = proyectoDeMensajes(sel);
    $('msj').classList.toggle('is-hilo', !!p);
    $('mensajesVacio').classList.toggle('oculto', !!p);
    $('mensajesHilo').classList.toggle('oculto', !p);
    const cab = $('mensajesTitulo'); cab.textContent = ''; cab.classList.toggle('oculto', !p);
    if (p) {
        // U-01 (17-sep): en celular el hilo arrancaba sin decir de que frente era; la cabecera lo nombra y liga al frente.
        const a = el('a', 'msj-titulo-frente'); a.href = `#p/${p.Clave}`; a.title = 'Abrir el frente';
        a.appendChild(iconoEquipo(equipoDe(p), 'sm')); a.appendChild(el('span', 't', p.Title)); cab.appendChild(a);
        if (p.Estado !== 'activo') cab.appendChild(chip('cerrado'));
        alojarChat($('mensajesHilo')); pintarChat(p);
    } else alojarChat(null);
}
/** C-07 (17-sep): el frente que Mensajes tiene elegido ({t:'f', k: clave}), o null. app.js y mensajesNuevos lo usan tambien. */
export const proyectoDeMensajes = (sel = estado.mensajesSel) => sel && sel.t === 'f' ? proyectoPorClave(sel.k) : null;
export function engancharMensajes() {
    // C-14 (v0.138.0): el buscador repinta solo la lista, con retardo (una rafaga de teclas = una pintada); si en ese lapso se
    // salio de Mensajes, no pinta nada — la proxima entrada ya lee estado.buscaMensajes.
    const buscar = conRetardo(() => { if (estado.pestana === 'mensajes') pintarListaMensajes(); });
    $('mensajesBusca').addEventListener('input', () => { estado.buscaMensajes = $('mensajesBusca').value; buscar(); });
    $('mensajesVolver').addEventListener('click', () => irAHash('#mensajes'));
}
/** Cuantos mensajes nuevos hay en total (insignia del rail): suma de comentariosNuevos por proyecto activo. */
export function mensajesNuevos() {
    // El chat que esta en pantalla ya se esta leyendo: no cuenta (la pestana Chat tampoco lo pinta en ambar, app.js).
    // v0.42.0: tambien el frente cuyo hilo esta abierto en Mensajes. C-12 (v0.138.0): la regla vive en leyendoAhora.
    const leyendo = leyendoAhora();
    return activos().reduce((n, p) => n + nuevosSinLeer(p.id, leyendo), 0);   // C-04
}
// ---------------------------------------------------------------- archivos

/**
 * Archivos: todas las ligas de todos los frentes en una lista, con chips por tipo, un select por
 * proyecto y buscador; agrupadas por proyecto. Cada nombre abre el archivo; el proyecto abre sus
 * Documentos (donde se liga, se quita y se reasigna: aqui solo se encuentra).
 */
// C-09 (mejorar-app archivos, 30-sep): el refresco de 120 s y cada caret, chip u orden recrean el arbol entero; conservarFoco devuelve
// el foco al control con la misma llave, y el menu «⋯» que estaba abierto se reabre en su renglon nuevo.
const FOCO_ARCHIVOS = ['nodo', 'irRaiz', 'tipo', 'sort', 'menu', 'copiar', 'abrirTarjeta', 'irDocs', 'filtro'];
export function pintarArchivos() {
    const abierto = document.querySelector('#archivosLista .fila-menu[open]'); const ligaAbierta = abierto ? abierto.closest('tr').dataset.liga : null;
    conservarFoco($('p-archivos'), FOCO_ARCHIVOS, () => {
        pintarArchivosCuerpo();
        const d = ligaAbierta ? document.querySelector(`#archivosLista tr[data-liga="${CSS.escape(ligaAbierta)}"]:not([hidden]) .fila-menu`) : null; if (d) d.open = true;
    });
}
/** C-12 (30-sep): el boton «Documentos» de la raiz resuelve el proyecto por id AL CLIC, como el del menu «⋯» (C-02). */
function irDocsDe(id) { const q = porId(estado.proyectos, id); if (q) irAHash(`#p/${q.Clave}/docs`); else avisar('Ese proyecto ya no está.', 'ojo'); }
function pintarArchivosCuerpo() {
    const f = estado.filtroArchivos;
    // C-10 (30-sep): una liga cuyo proyecto ya no esta (borrado en serie, o desde SharePoint) ni cuenta ni se filtra: el universo es lo que se pinta.
    const vivos = new Set(estado.proyectos.map(p => p.id)); const todas = estado.ligas.filter(l => vivos.has(Number(l.ProyectoId)));
    // C-06 (mejorar-app archivos, 17-sep): totales por proyecto sobre TODAS las ligas, una vez; alimenta el select, C-01 y cada raiz.
    const totalPorP = new Map(); for (const l of todas) { const k = Number(l.ProyectoId); totalPorP.set(k, (totalPorP.get(k) || 0) + 1); }
    // C-01: el proyecto filtrado perdio su ultima liga (se quito desde Docs): el filtro se suelta ANTES de filtrar — no queda un select
    // en blanco filtrando por un id que ya no aparece en pantalla.
    if (f.proyectoId && !totalPorP.has(Number(f.proyectoId))) f.proyectoId = null;
    const sel = $('archivosProyecto');
    opciones(sel, ordenarProyectos(estado.proyectos.filter(p => totalPorP.has(p.id))), p => p.id, p => p.Title, 'Todos los proyectos');
    sel.value = f.proyectoId ? String(f.proyectoId) : '';
    const chips = $('archivosTipo'); chips.textContent = '';
    for (const [k, texto] of TIPOS_LIGA) {   // C-05: la misma tupla que Docs del proyecto
        const on = f.tipo === k; const b = boton(texto, on ? 'is-on' : '', () => { f.tipo = k; pintarArchivos(); }, { tipo: k || 'todos' }); b.setAttribute('aria-pressed', on ? 'true' : 'false'); chips.appendChild(b);
    }
    const ligas = ordenarDocs(filtrarLigas(todas, f), estado.ordenArchivos);   // v0.18.0: por la columna elegida, dentro de cada proyecto
    const buscando = !!f.texto.trim(), filtrando = buscando || !!f.tipo || !!f.proyectoId;
    // U-05 (17-sep): solo la cifra, con plural real y el proyecto si esta filtrado; la instruccion de ligar/quitar (tres renglones en
    // celular, en cada visita) va al title del subtitulo y al vacio, donde hace falta.
    const n = todas.length, pf = f.proyectoId ? porId(estado.proyectos, f.proyectoId) : null;
    $('archivosSub').textContent = filtrando ? `${ligas.length} de ${n} ${n === 1 ? 'documento' : 'documentos'}${pf ? ' · ' + pf.Title : ''}` : `${n} ${n === 1 ? 'documento ligado' : 'documentos ligados'} en todos los frentes`;
    $('archivosSub').title = 'Para ligar, quitar o cambiar de tarjeta, entra a Documentos del proyecto.';
    // v0.17.0 traia cuatro cifras arriba (total, archivados, en el buzon, enlaces); v0.46.0 (Carlos, 15-sep): SALIERON.
    const cont = $('archivosLista'); cont.textContent = '';
    $('archivosTodo').hidden = true;   // v0.36.0: solo con arbol pintado
    if (!ligas.length) {
        const v = el('p', 'vacio', n ? 'Nada con ese filtro. ' : 'Ningún documento ligado todavía. Para ligar, entra a Documentos del proyecto.');
        // U-03: el mismo «× limpiar» del tablero — suelta los tres filtros (proyecto, tipo, texto) de una vez.
        if (n) v.appendChild(boton('× limpiar', 'mn-btn is-ghost is-sm', () => { estado.filtroArchivos = filtroArchivosVacio(); $('textoArchivos').value = ''; pintarArchivos(); }, { filtro: 'limpiar' }));
        cont.appendChild(v); return;
    }
    // v0.17.0: una sola tabla (la de Docs del proyecto). v0.36.0 (Carlos, 14-sep): y el MISMO ARBOL de expediente que Docs
    // (.is-arbol.is-frentes), con una carpeta raiz mas arriba: proyecto > tarjeta > documento. Cada raiz se pliega; las llaves
    // de estado.abiertasArchivos van prefijadas por proyecto («p7», «p7/0» = Del proyecto, «p7/t12» = tarjeta) porque los ids
    // de tarjeta y de proyecto se cruzan. Sin nodo de «tarjetas sin documentos»: aqui solo se encuentra, no se liga.
    // v0.51.0 (Carlos, 15-sep): el arbol NACE TODO PLEGADO —el Set guarda lo abierto, no lo plegado— y la sesion recuerda lo que abriste.
    const porP = new Map(); for (const l of ligas) { const k = Number(l.ProyectoId); if (!porP.has(k)) porP.set(k, []); porP.get(k).push(l); }
    const tabla = tablaDocs({ orden: estado.ordenArchivos, alOrdenar: o => { estado.ordenArchivos = o; pintarArchivos(); }, sinTarjeta: true }); const tb = tabla.querySelector('tbody');   // v0.45.0: sin columna «Tarjeta», la carpeta ya la nombra
    tabla.classList.add('is-arbol', 'is-frentes');
    // U-01 (17-sep): mientras hay un filtro (texto, tipo o proyecto) TODO se ve — el resultado no queda escondido bajo dos carpetas
    // plegadas—; el Set no se toca, ni por el caret (el revisor cazo que un clic a ciegas lo mutaba): al soltar el filtro el arbol
    // vuelve a como estaba.
    const S = estado.abiertasArchivos; const plegada = k => filtrando ? false : !S.has(k);
    const alPlegar = k => { if (filtrando) return; if (S.has(k)) S.delete(k); else S.add(k); pintarArchivos(); };
    const llaves = [];
    for (const p of ordenarProyectos(estado.proyectos.filter(p => porP.has(p.id)))) {
        const kp = `p${p.id}`; const total = totalPorP.get(p.id); llaves.push(kp);   // C-06
        tb.appendChild(filaRaiz(p.Title, porP.get(p.id).length, total, { icono: iconoEquipo(equipoDe(p), 'sm'), plegada: plegada(kp), alPlegar: () => alPlegar(kp), alAbrir: () => irDocsDe(p.id), llave: kp, sinTarjeta: true }));   // C-12: por id al clic; C-09: la llave del caret
        const r = filasDeExpediente(tb, p, porP.get(p.id), { llave: k => `${kp}/${k ? 't' + k : 0}`, plegada, alPlegar, ocultas: plegada(kp), sinTarjeta: true, doc: () => ({ p, enArchivos: true, alTarjeta: irTarjetaId }) });   // C-02: por id al clic
        for (const k of r.llaves) llaves.push(`${kp}/${k ? 't' + k : 0}`);
    }
    cont.appendChild(tabla);
    // v0.36.0: «Abrir todo» / «Plegar todo», como en Docs (v0.34.0); cada boton se apaga cuando no tiene nada que hacer.
    $('archivosTodo').hidden = false;
    $('archivosAbrirTodo').disabled = filtrando || llaves.every(k => !plegada(k)); $('archivosPlegarTodo').disabled = filtrando || llaves.every(k => plegada(k));   // U-01: filtrando, los dos apagados
    $('archivosAbrirTodo').onclick = () => { estado.abiertasArchivos = new Set(llaves); pintarArchivos(); };
    $('archivosPlegarTodo').onclick = () => { estado.abiertasArchivos = new Set(); pintarArchivos(); };
}
export function engancharArchivos() {
    $('archivosProyecto').addEventListener('change', () => { estado.filtroArchivos.proyectoId = $('archivosProyecto').value ? Number($('archivosProyecto').value) : null; pintarArchivos(); });
    // C-07 (17-sep): con retardo — cada tecla reconstruia el arbol entero; `change` (Enter, salir del campo) pinta al instante.
    const buscar = conRetardo(() => { estado.filtroArchivos.texto = $('textoArchivos').value; if (estado.pestana === 'archivos') pintarArchivos(); });
    $('textoArchivos').addEventListener('input', buscar); $('textoArchivos').addEventListener('change', buscar.ahora);
}

// ---------------------------------------------------------------- reportes

/**
 * Anillo de avance (SVG por DOM) con el % al centro: lo usa Reportes (segmentosGlobales) y la lateral del
 * proyecto (segmentosDe). `segs` = [[{nombre}, n, clase], ...] de Hecho a la primera; el % es el de 'h'.
 */
export function anillo(segs, total, tam = 120) {
    const hechas = segs.filter(s => s[2] === 'h').reduce((n, s) => n + s[1], 0);
    const svg = svgEl('svg', { viewBox: '0 0 42 42', class: 'anillo', width: tam, height: tam, role: 'img' });
    svg.setAttribute('aria-label', `${total ? Math.round(hechas * 100 / total) : 0}% hechas`);
    svg.appendChild(svgEl('circle', { cx: 21, cy: 21, r: 15.9, class: 'fondo' }));
    let acumulado = 0;
    for (const [col, n, cls, tono] of segs) {
        if (!n || !total) continue;
        const pct = n * 100 / total;
        const c = svgEl('circle', { cx: 21, cy: 21, r: 15.9, class: 'seg is-' + cls, ...(tono ? { 'data-tono': tono } : {}), 'stroke-dasharray': `${Math.max(pct - 1.5, 0)} ${100 - Math.max(pct - 1.5, 0)}`, 'stroke-dashoffset': String(25 - acumulado) });
        const tt = svgEl('title'); tt.textContent = `${col.nombre}: ${n}`; c.appendChild(tt);
        svg.appendChild(c); acumulado += pct;
    }
    const tx = svgEl('text', { x: 21, y: 21, class: 'pct', 'text-anchor': 'middle', 'dominant-baseline': 'central' }); tx.textContent = `${total ? Math.round(hechas * 100 / total) : 0}%`; svg.appendChild(tx);
    return svg;
}
function leyenda(segs) {
    const l = el('div', 'leyenda');
    for (const [col, n, cls, tono] of segs) { const s = el('span', 'is-' + cls); if (tono) s.dataset.tono = tono; s.appendChild(el('i')); s.appendChild(el('span', '', `${col.nombre} `)); s.appendChild(el('b', '', String(n))); l.appendChild(s); }
    return l;
}
/** Barra horizontal con segmentos por cubeta del proyecto (la misma leyenda que la lista de proyectos) y su % a la derecha. */
function barraSeg(a, segs = segmentosDe(a)) {
    const w = el('div', 'rep-barra');
    const b = el('div', 'segbar alta'); b.title = tituloSegmentos(segs);
    for (const [col, n, cls, tono] of segs) { const i = el('i', cls); if (tono) i.dataset.tono = tono; i.style.flex = String(n); i.title = `${col.nombre}: ${n}`; if (n) i.appendChild(el('span', '', String(n))); b.appendChild(i); }
    if (!a.total) { const i = el('i', 'p vacia', 'sin tarjetas'); i.style.flex = '1'; b.appendChild(i); }   // U-06 (18-sep): dice que no hay nada que medir
    w.appendChild(b); w.appendChild(el('b', 'mn-mono', a.total ? `${a.pct}%` : '—'));
    return w;
}
/** Etiqueta de una fila de Reportes (U-01/U-04, 18-sep): [icono] + `.tx` (titulo a 2 lineas, integro en title; meta debajo). */
function etiRep(titulo, meta, icono, claseMeta = '') {
    const eti = el('span', 'eti'); if (icono) eti.appendChild(icono);
    const tx = el('span', 'tx'); const t = el('span', 't', titulo); t.title = titulo; tx.appendChild(t); if (meta) tx.appendChild(el('span', 'm' + (claseMeta ? ' ' + claseMeta : ''), meta)); eti.appendChild(tx);   // U-11 (v0.129.0): la meta de un frente vencido va en rojo
    return eti;
}
/** Columnas verticales (hechas por semana): cajas con alto en %, valor encima, rotulo del lunes abajo. */
// R-03 (v0.132.0): junto a la barra de hechas (`n`), una delgada gris con las nuevas (`nuevas`); las dos contra el mismo maximo
function columnas(cont, series, textoDe) {
    const max = Math.max(1, ...series.map(s => Math.max(s.n, s.nuevas)));
    const dice = s => `${textoDe(s)}: ${s.n} ${plural(s.n, 'hecha')} · ${s.nuevas} ${plural(s.nuevas, 'nueva')}`;
    const g = el('div', 'rep-cols'); g.setAttribute('role', 'img'); g.setAttribute('aria-label', series.map(dice).join(' · '));
    for (const s of series) {
        const c = el('div', 'col-s'); c.title = dice(s);
        const par = el('span', 'barras'), h = el('span', 'h'), pct = s.n * 100 / max;   // la cifra de hechas va pegada a SU barra: arriba de la columna se leia como de la gris (revisor v0.132.0)
        const cifra = el('b', '', s.n ? String(s.n) : ''); cifra.style.bottom = `calc(${pct}% + 2px)`; h.appendChild(cifra);
        const barra = el('i'); barra.style.height = pct + '%'; if (!s.n) barra.classList.add('cero'); h.appendChild(barra); par.appendChild(h);
        const nv = el('span', 'nv'), pctN = s.nuevas * 100 / max;   // U-15 (v0.146.0): la gris lleva su cifra, en span y no en b (las pruebas suman los b como hechas)
        const cn = el('span', 'cn', s.nuevas ? String(s.nuevas) : ''); cn.style.bottom = `calc(${pctN}% + 2px)`; nv.appendChild(cn);
        const nueva = el('i', 'nueva'); nueva.style.height = pctN + '%'; if (!s.nuevas) nueva.classList.add('cero'); nv.appendChild(nueva); par.appendChild(nv);
        c.appendChild(par); c.appendChild(el('small', '', textoDe(s))); g.appendChild(c);
    }
    cont.appendChild(g);
    const ley = el('div', 'leyenda-sem rep-ley-sem'); ley.setAttribute('aria-hidden', 'true');   // U-15 (v0.146.0): en celular no hay title que diga que es la gris
    for (const [cls, txt] of [['is-hecha', 'hechas'], ['is-nueva', 'nuevas']]) { const x = el('span', cls); x.appendChild(el('i')); x.appendChild(document.createTextNode(txt)); ley.appendChild(x); }
    cont.appendChild(ley);
}

/**
 * Reportes: lo que un tablero no enseña porque vive repartido en 4 frentes. Avance por proyecto
 * (barra segmentada + anillo global), carga por persona (abiertas con las vencidas marcadas), hechas
 * por semana (8 semanas), actividad por persona (30 dias) y los frentes que van tarde. Todo se
 * calcula del estado ya cargado; «Imprimir» saca la pantalla a PDF.
 */
/** Fila de Reportes con barra horizontal (C-03, 18-sep): etiqueta + `.hbar` con sus tramos [clase, %, texto?] + la cifra a la derecha. */
function filaBarra(eti, tramos, cifra, titulo, abre, dice) {
    const fila = el(abre ? 'button' : 'div', 'rep-fila'); if (abre) { fila.type = 'button'; fila.dataset.abre = abre; }   // U-12 (v0.129.0): con llave, lo abre el delegado data-abre de app.js
    if (dice) { fila.setAttribute('aria-label', dice); if (!abre) fila.setAttribute('role', 'img'); }   // U-16 (v0.146.0): la frase entera, no cifras sueltas
    fila.appendChild(eti);
    const w = el('div', 'rep-barra'); const b = el('div', 'hbar'); if (titulo) b.title = titulo;
    for (const [cls, pct, texto] of tramos) { const i = el('i', cls); i.style.width = pct + '%'; if (texto) i.appendChild(el('span', '', texto)); b.appendChild(i); }
    w.appendChild(b); w.appendChild(el('b', 'mn-mono', cifra)); fila.appendChild(w);
    return fila;
}
/**
 * R-01 (v0.130.0): el estado DECLARADO del frente (R-05) bajo su vence, como Active Projects de las Initiatives de Linear:
 * «En riesgo · nota · hace N d» con el color de estado de la casa; pasados SALUD_VIEJA_DIAS todo en gris tenue; sin declarar, «sin estado».
 */
function saludRep(p, hoy) {
    const s = lineaSalud(p, hoy), sl = el('span', 'sl');
    if (!s) { sl.classList.add('sin'); sl.textContent = 'sin estado'; return sl; }
    if (s.vieja) sl.classList.add('vieja');
    sl.appendChild(el('b', 'is-' + s.clase, s.nombre));
    const resto = [s.nota, s.hace].filter(Boolean).join(' · '); if (resto) sl.appendChild(document.createTextNode(' · ' + resto));
    sl.title = `${s.nombre}${s.nota ? ': ' + s.nota : ''}${s.hace ? ' (' + s.hace + ')' : ''}`;
    return sl;
}
/** Avance: anillo global + una fila por proyecto (barra segmentada; clic → el frente). */
function pintarAvance(a, orden) {
    const segs = segmentosGlobales(a);   // C-04 (18-sep): una vez por pintada, no dos
    const g = $('repGlobal'); g.textContent = ''; g.appendChild(anillo(segs, a.total, 132)); g.appendChild(leyenda(segs));
    const pp = $('repProyectos'); pp.textContent = '';
    const cubetas = new Map();
    const conSalud = !!(estado.columnasProyectos && estado.columnasProyectos.has('Salud')), hoy = new Date();   // R-01: sin la columna (tenant sin provisionar) el renglon queda como antes
    for (const p of orden) {
        const ap = avance(tareasDe(p, estado.tareas), columnasDe(p)); const d = diasPara(p.Vence);
        const fila = el('button', 'rep-fila'); fila.type = 'button'; fila.dataset.repP = String(p.id); fila.title = p.Title; fila.addEventListener('click', () => irFrenteId(Number(fila.dataset.repP)));   // C-01 (18-sep): por id al clic, no el objeto capturado
        const meta = p.Vence ? fraseVence(d, 'corta', fechaCorta(p.Vence)) : 'sin fin de frente';
        const eti = etiRep(p.Title, meta, iconoEquipo(equipoDe(p), 'sm'), p.Vence && d < 0 ? 'is-danger' : '');   // C-04 (v0.79.0): ahora tambien dice «vence hoy»
        const sl = conSalud ? saludRep(p, hoy) : null; if (sl) eti.querySelector('.tx').appendChild(sl);
        const segs = segmentosDe(ap);
        const partes = segs.filter(x => x[1]).map(([col, n]) => `${n} ${col.nombre}`).join(', ');   // U-16 (v0.146.0): el lector de pantalla oye la frase, no «7 2 3 5 41%»
        fila.setAttribute('aria-label', `${p.Title}: ${ap.total ? `${ap.pct} %${partes ? ', ' + partes : ''}` : 'sin tarjetas'}; ${meta}${sl ? '; ' + sl.textContent : ''}`);
        fila.appendChild(eti); fila.appendChild(barraSeg(ap, segs)); pp.appendChild(fila);
        // U-10 (v0.129.0): la leyenda suma las cubetas de todos los frentes por nombre y color; antes el nombre solo vivia en el title (en celular no hay)
        for (const [col, n, cls, tono] of segs) { const k = `${cls}|${tono}|${col.nombre}`; const s = cubetas.get(k); if (s) s[1] += n; else cubetas.set(k, [col, n, cls, tono]); }
    }
    if (!orden.length) pp.appendChild(el('p', 'vacio', 'Sin proyectos activos.'));
    const ley = $('repProyectosLeyenda'); ley.textContent = ''; if (cubetas.size) ley.appendChild(leyenda([...cubetas.values()]));
}
/** Carga por persona: abiertas con las vencidas marcadas; el ancho es relativo a quien mas tiene. */
function pintarCarga(todas, hist) {
    const cp = $('repPersonas'); cp.textContent = '';
    // C-05 (v0.129.0): «N hechas» cuenta tambien los frentes ya cerrados; las abiertas y vencidas siguen siendo las de los activos. C-13 (v0.146.0): lo cuenta cargaPorPersona con la historia
    const carga = cargaPorPersona(todas, CONFIG.vencePronto, new Date(), hist); const maxC = Math.max(1, ...carga.map(c => c.abiertas));
    for (const c of carga) {
        const tramos = [['abiertas', (c.abiertas - c.vencidas) * 100 / maxC]]; if (c.vencidas) tramos.push(['vencidas', c.vencidas * 100 / maxC, String(c.vencidas)]);
        const sinDueno = !c.quien && c.abiertas > 0;   // U-12 (v0.129.0): la fila «Sin dueño» lleva al tablero filtrado sin dueño (irASinDueno)
        const abre = sinDueno ? 'sd' : c.quien && c.abiertas > 0 ? `pe:${c.quien}` : '';   // R-02 (v0.131.0): la de una persona abre sus abiertas (abrirCargaPersona)
        const nombre = c.quien ? nombreDe(c.quien, estado.roles) : 'Sin dueño';
        const dice = `${nombre}: ${c.abiertas} ${plural(c.abiertas, 'abierta')}, ${c.vencidas} ${plural(c.vencidas, 'vencida')}, ${c.hechas} ${plural(c.hechas, 'hecha')}${abre ? (sinDueno ? '. Ver las tarjetas sin dueño' : '. Ver cuáles') : ''}`;
        const fila = filaBarra(etiRep(nombre, `${c.hechas} ${plural(c.hechas, 'hecha')}`), tramos, String(c.abiertas), sinDueno ? 'Ver las tarjetas sin dueño' : `${c.abiertas} abiertas, ${c.vencidas} vencidas${abre ? ': ver cuáles' : ''}`, abre, dice);
        fila.dataset.repQ = c.quien || 'sin-dueno'; cp.appendChild(fila);
    }
    if (!carga.length) cp.appendChild(el('p', 'vacio', 'Sin tarjetas.'));
}
/**
 * R-02 (v0.131.0): tocar a una persona en Carga abre un dialogo de lectura con sus abiertas agrupadas por frente, vencidas
 * primero, como el clic en una barra de Linear Insights. Cada renglon abre su tarjeta por la llave `t:<id>` del delegado de app.js.
 * Se recalcula de los frentes visibles (mismo filtro de equipo que Reportes) al abrir y en cada repintado.
 */
/** C-15 (v0.146.0): el renglon de una tarjeta en Reportes (Vencidas por proyecto y el dialogo de una persona): titulo + chip de vence,
 *  meta opcional debajo. Lo abre el delegado data-abre de app.js por la llave t:<id> (antes Vencidas registraba un listener por boton). */
function renglonTarjeta(t, meta) {
    const b = el('button', 'it clic'); b.type = 'button'; b.dataset.abre = `t:${t.id}`; b.title = 'Abrir la tarjeta';
    const cab = el('div', 'cab'); cab.appendChild(el('span', 'q', t.Title));
    const cls = estadoVence(t, CONFIG.vencePronto); cab.appendChild(el('span', 'd' + (cls ? ' is-' + cls : ''), t.Vence ? fraseVence(diasPara(t.Vence), 'chip') : 'sin fecha'));
    if (meta === undefined) { b.appendChild(cab); return b; }
    const c = el('div'); c.appendChild(cab); c.appendChild(el('div', 'f', meta)); b.appendChild(c); return b;
}
let personaCarga = null;
export function abrirCargaPersona(quien) { personaCarga = String(quien || '').toLowerCase(); pintarCargaPersona(); abrirDialogo('dlgPersona'); }
export function pintarCargaPersona() {
    if (personaCarga === null) return;
    const ps = visibles(), ids = new Set(ps.map(p => p.id));
    const grupos = abiertasDePersona(estado.tareas.filter(t => ids.has(Number(t.ProyectoId))), personaCarga, ordenarProyectos(ps), CONFIG.vencePronto);
    const n = grupos.reduce((s, g) => s + g.tareas.length, 0), nv = grupos.reduce((s, g) => s + g.vencidas, 0);
    $('peTitulo').textContent = personaCarga ? nombreDe(personaCarga, estado.roles) : 'Sin dueño';
    $('peSub').textContent = n ? `${n} ${plural(n, 'abierta')}${nv ? `, ${nv} ${plural(nv, 'vencida')}` : ''}${estado.filtroEquipo ? ` en ${nombreEquipoFiltrado()}` : ''}.` : 'Ya no tiene tarjetas abiertas.';
    const l = $('peLista');
    conservarFoco($('dlgPersona'), ['abre'], () => {   // C-12 (v0.146.0): el refresco de 120 s recrea la lista; el foco vuelve a la misma tarjeta (antes caia al body)
        l.textContent = '';
        for (const g of grupos) { l.appendChild(el('div', 'rep-grupo', `${g.p.Title} · ${g.tareas.length}`)); for (const t of g.tareas) l.appendChild(renglonTarjeta(t)); }
    });
}
/** Hechas por semana: 8 columnas y el subtitulo con el total y el promedio; R-03 (v0.132.0): mas las nuevas y hacia donde va el pendiente. */
function pintarSemanas(todas) {
    const hs = $('repSemanas'); hs.textContent = '';
    const semanas = hechasPorSemana(todas, 8); columnas(hs, semanas, s => `${diaNum(s.desde)} ${mesCorto(s.desde)}`);   // C-17 (v0.146.0)
    const totalSem = semanas.reduce((n, s) => n + s.n, 0), nuevas = semanas.reduce((n, s) => n + s.nuevas, 0), dif = nuevas - totalSem;
    const hechas = totalSem ? `${totalSem} ${plural(totalSem, 'tarjeta')} ${plural(totalSem, 'hecha')} en 8 semanas · ${(totalSem / 8).toFixed(1)} por semana.` : 'Ninguna tarjeta con fecha de hecho en las últimas 8 semanas.';
    const rumbo = !nuevas && !totalSem ? '' : ` ${nuevas} ${plural(nuevas, 'nueva')}: ${dif > 0 ? `el pendiente creció en ${dif}` : dif < 0 ? `el pendiente bajó en ${-dif}` : 'el pendiente se mantuvo'}.`;
    $('repSemanasSub').textContent = hechas + rumbo;
}
/** Actividad por persona (30 dias), del registro de actividad de los frentes visibles. */
function pintarActividad(idsHist) {
    const ap = $('repActividad'); ap.textContent = '';
    // C-05 / C-11 (v0.129.0): los frentes del filtro aunque ya esten cerrados, y nada sin frente (ningun registro lo produce y se saltaba el filtro de equipo)
    const act = actividadPorPersona(estado.actividad.filter(x => idsHist.has(Number(x.ProyectoId))), 30); const maxA = Math.max(1, ...act.map(x => x.n));
    for (const x of act) ap.appendChild(filaBarra(etiRep(nombreDe(x.quien, estado.roles)), [['act', x.n * 100 / maxA]], String(x.n)));
    if (!act.length) ap.appendChild(el('p', 'vacio', 'Sin actividad en 30 días.'));
}
/** Tarde: las tarjetas vencidas agrupadas por proyecto, en el orden de los frentes. */
function pintarTarde(orden, venc) {
    const tv = $('repVencidas'); tv.textContent = '';
    const porP = new Map(); for (const t of venc) { const k = Number(t.ProyectoId); if (!porP.has(k)) porP.set(k, []); porP.get(k).push(t); }   // C-10 (v0.129.0): una pasada, no un filter por frente
    for (const p of orden) {
        const vs = porP.get(p.id); if (!vs) continue;
        const cab = el('div', 'rep-grupo'); cab.textContent = `${p.Title} · ${vs.length}`; tv.appendChild(cab);   // U-02 (18-sep): rotulo propio; `.grupo` es el marco de filtros
        for (const t of vs.sort(porVence)) {   // C-10 (v0.129.0): el orden de reglas.js, con su desempate por id
            // U-09 (v0.129.0): la tarjeta es el renglon principal; quien la tiene, con su nombre completo, va de meta junto a los dias. C-15 (v0.146.0): renglonTarjeta
            tv.appendChild(renglonTarjeta(t, t.Asignado ? nombreDe(t.Asignado, estado.roles) : 'sin dueño'));
        }
    }
    if (!venc.length) tv.appendChild(el('p', 'vacio', 'Nada vencido.'));
}
export function pintarReportes() {
    const ps = visibles();   // C-03
    const idsPs = new Set(ps.map(p => p.id));   // v0.13.1
    const todas = estado.tareas.filter(t => idsPs.has(Number(t.ProyectoId)));
    // C-05 (v0.129.0): la HISTORIA (hechas por semana, hechas por persona, actividad de 30 dias) cuenta tambien los frentes ya cerrados del
    // mismo filtro de equipo; antes cerrar un frente borraba en retroactivo lo que su equipo hizo. Avance, abiertas y vencidas siguen con los activos.
    const idsHist = new Set(proyectosVisibles(estado.proyectos, estado.filtroEquipo, false).map(p => p.id));
    const hist = estado.tareas.filter(t => idsHist.has(Number(t.ProyectoId)));
    const a = avanceGlobal(todas, columnasDeTarea);   // v0.11.0: entre proyectos, por categoria
    const venc = todas.filter(t => estadoVence(t, CONFIG.vencePronto) === 'danger');   // C-10 (v0.129.0): estadoVence ya descarta las hechas
    // U-13 / C-06 (v0.129.0): plural concordado, y la fecha es la de la ultima lectura (estado.cargadoEl), no la del reloj: sin red, lo impreso decia hoy sobre datos viejos
    const nP = ps.length, nT = todas.length;
    $('reportesSub').textContent = `${nP} ${plural(nP, 'frente')} ${plural(nP, 'activo')}${estado.filtroEquipo ? ` de ${nombreEquipoFiltrado()}` : ''} · ${nT} ${plural(nT, 'tarjeta')} · leído de las listas el ${fechaHora(new Date(estado.cargadoEl || Date.now()).toISOString())}.`;
    // v0.46.0 (Carlos, 15-sep): los 5 KPI de arriba (proyectos activos · abiertas · hechas · vencidas · sin dueño) SALIERON.
    // C-07 (v0.129.0): el refresco de 120 s recrea las filas; se anota la fila con foco y se le devuelve al terminar (antes caia al body). Desde C-16 lo hace conservarFoco (comun.js), abajo.
    const orden = ordenarProyectos(ps);   // C-03 (18-sep): cinco bloques, cada uno su funcion; el calculo comun se queda aqui
    conservarFoco($('p-reportes'), ['repP', 'abre'], () => { pintarAvance(a, orden); pintarCarga(todas, hist); pintarSemanas(hist); pintarActividad(idsHist); pintarTarde(orden, venc); });   // C-16 (v0.137.0): la logica de C-07 vive en comun.js
}
export function engancharReportes() {
    $('btnImprimirReportes').addEventListener('click', () => window.print());
    $('peCerrar').addEventListener('click', () => cerrarDialogo('dlgPersona'));   // R-02 (v0.131.0)
}
