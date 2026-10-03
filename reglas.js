// Reglas de MINSA Proyectos — funciones PURAS, sin red ni DOM, para poder probarlas con node.
//
// Aqui vive lo que la entrevista del 2026-09-11 decidio (cerebro/docs/plan-proyectos-app-2026-09-11.md).
// Cambiar un umbral es cambiar una constante en config.js; cambiar una regla de PUEDE es cambiar
// una decision, y eso se anota en el README.

export const ROLES = ['gerencia', 'colaborador', 'lectura'];

// ---------------------------------------------------------------- cubetas (columnas) por proyecto — v0.11.0
//
// Hasta v0.10.0 eran cuatro fijas. Desde v0.11.0 cada proyecto trae las suyas en PROY_Proyectos.Columnas
// (JSON: [{clave, nombre}, ...]); vacio = estas. La ULTIMA es siempre `hecho` (se puede renombrar, no
// quitar ni mover): es la que sella HechoPor/HechoEl, la que cuenta el avance y la que saca la tarjeta de
// Mis tareas. La PRIMERA es donde nace una tarjeta nueva. Las de en medio son «en proceso».
export const COLUMNAS_DEFAULT = [
    { clave: 'por-hacer', nombre: 'Por hacer' },
    { clave: 'en-curso', nombre: 'En curso' },
    { clave: 'en-revision', nombre: 'En revisión' },
    { clave: 'hecho', nombre: 'Hecho' }
];
/** Las claves del default (lo que la app entendia hasta v0.10.0; lo usan las pruebas y el sembrado). */
export const COLUMNAS = COLUMNAS_DEFAULT.map(c => c.clave);
export const HECHO = 'hecho';
export const MAX_COLUMNAS = 8, MAX_NOMBRE_COLUMNA = 30;

// v0.12.0: colores a elegir para una cubeta o una tarjeta. La CLAVE es lo que se guarda (en Columnas[].color
// y en PROY_Tareas.Color); el tono lo pone el CSS (`--tono-<clave>`), asi que claro y oscuro salen solos.
// '' = sin color (la cubeta toma el suyo por posicion, la tarjeta queda blanca).
export const COLORES = [
    { clave: 'azul', nombre: 'Azul' }, { clave: 'celeste', nombre: 'Celeste' }, { clave: 'verde', nombre: 'Verde' },
    { clave: 'ambar', nombre: 'Ámbar' }, { clave: 'rojo', nombre: 'Rojo' }, { clave: 'morado', nombre: 'Morado' },
    { clave: 'rosa', nombre: 'Rosa' }, { clave: 'gris', nombre: 'Gris' }
];
/** La clave de color si es una de la paleta; si no, '' (nunca lanza: un valor raro en la lista no rompe el tablero). */
export function colorValido(c) { c = String(c || '').trim().toLowerCase(); return COLORES.some(x => x.clave === c) ? c : ''; }

/**
 * Las cubetas de un proyecto: lo que trae en `Columnas` si es valido; si no, el default. Nunca lanza:
 * un JSON roto en la lista no puede dejar el tablero en blanco. Devuelve copias (nadie muta el default).
 */
export function columnasDe(proyecto) {
    let crudo = proyecto && proyecto.Columnas;
    if (typeof crudo === 'string') { try { crudo = JSON.parse(crudo); } catch (_) { crudo = null; } }
    const v = normalizarColumnas(crudo, { estricto: false });
    return (v.ok ? v.columnas : COLUMNAS_DEFAULT).map(c => ({ ...c }));
}

/**
 * Valida y normaliza una lista de cubetas (la del editor o la de la lista): nombres sin espacios sobrantes,
 * claves unicas (una nueva se deriva del nombre con slug(); si choca, se numera), `hecho` presente y al
 * final, minimo 2 y maximo MAX_COLUMNAS. Con `estricto` (el editor) un nombre vacio o repetido es error;
 * sin el (lo leido de la lista) se limpia lo que se pueda y se rechaza solo lo irrecuperable.
 */
export function normalizarColumnas(lista, { estricto = true } = {}) {
    if (!Array.isArray(lista) || !lista.length) return { ok: false, motivo: 'sin cubetas' };
    const salida = []; const claves = new Set();
    for (const c of lista) {
        if (!c || typeof c !== 'object') { if (estricto) return { ok: false, motivo: 'cubeta inválida' }; continue; }
        const nombre = String(c.nombre || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NOMBRE_COLUMNA);
        if (!nombre) { if (estricto) return { ok: false, motivo: 'toda cubeta necesita un nombre' }; continue; }
        if (estricto && salida.some(x => x.nombre.toLowerCase() === nombre.toLowerCase())) return { ok: false, motivo: `dos cubetas se llaman «${nombre}»` };
        let clave = String(c.clave || '').trim().toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clave)) clave = slug(nombre).slice(0, 40) || 'cubeta';
        // Una nueva que se llame «Hecho» chocaria con la clave fija (aunque Hecho este renombrada): se dice con palabras, no con la clave.
        if (estricto && !c.clave && clave === HECHO) return { ok: false, motivo: 'ya hay una cubeta que cierra las tarjetas (la última); renómbrala en vez de agregar otra' };
        if (claves.has(clave)) { if (estricto && c.clave) return { ok: false, motivo: `clave repetida: ${clave}` }; let n = 2; while (claves.has(`${clave}-${n}`)) n++; clave = `${clave}-${n}`; }
        claves.add(clave); const color = colorValido(c.color); salida.push(color ? { clave, nombre, color } : { clave, nombre });   // v0.12.0: color opcional
    }
    const iH = salida.findIndex(c => c.clave === HECHO);
    if (iH < 0) salida.push({ clave: HECHO, nombre: 'Hecho' });
    else if (iH !== salida.length - 1) salida.push(...salida.splice(iH, 1));   // hecho siempre al final
    if (salida.length < 2) return { ok: false, motivo: 'hacen falta al menos una cubeta abierta y «Hecho»' };
    if (salida.length > MAX_COLUMNAS) return { ok: false, motivo: `máximo ${MAX_COLUMNAS} cubetas` };
    return { ok: true, columnas: salida };
}

/** Nombre visible de una clave en unas columnas (la clave misma si ya no existe: una tarjeta huerfana). */
export function nombreColumnaEn(clave, columnas) { const c = (columnas || []).find(x => x.clave === clave); return c ? c.nombre : String(clave || ''); }

/**
 * Clase de color de una cubeta por su POSICION, no por su nombre (los graficos y los puntos de color):
 * 'p' la primera (por hacer, gris) · 'h' hecho (verde) · 'c' la segunda (en curso, marca) · 'r' las demas
 * de en medio (celeste). Una clave que no esta en las columnas cuenta como primera.
 */
export function claseDeColumna(clave, columnas) {
    if (clave === HECHO) return 'h';
    const i = (columnas || []).findIndex(c => c.clave === clave);
    return i <= 0 ? 'p' : i === 1 ? 'c' : 'r';
}
/** Categoria de una tarjeta para sumar ENTRE proyectos con cubetas distintas: 'por-hacer' (primera) · 'en-proceso' (en medio) · 'hecho'. */
export function categoriaDe(tarea, columnas) {
    if (!tarea || tarea.Columna === HECHO) return HECHO;
    const i = (columnas || []).findIndex(c => c.clave === tarea.Columna);
    return i <= 0 ? 'por-hacer' : 'en-proceso';
}
/** Una tarjeta esta «en proceso» (ni en la primera cubeta ni hecha): base de «sin movimiento». */
export function enProceso(tarea, columnas) { return categoriaDe(tarea, columnas) === 'en-proceso'; }

/** Segmentos de la barra/anillo de UN proyecto, de Hecho a la primera (el orden visual de siempre): [cubeta, n, clase]. */
export function segmentosDe(a) { return [...a.columnas].reverse().map(c => [c, a.porColumna[c.clave] || 0, claseDeColumna(c.clave, a.columnas), c.color || '']); }   // v0.12.0: 4.º = color elegido, si hay
/** Segmentos de un avance GLOBAL (avanceGlobal): tres categorias con los mismos colores. */
export function segmentosGlobales(a) { return [[{ nombre: 'Hechas' }, a.porCategoria.hecho, 'h'], [{ nombre: 'En proceso' }, a.porCategoria['en-proceso'], 'c'], [{ nombre: 'Por hacer' }, a.porCategoria['por-hacer'], 'p']]; }
/** «3 hechas · 1 en revisión · 2 en curso · 4 por hacer» (el title de la barra). */
export function tituloSegmentos(segs) { return segs.map(([c, n]) => `${n} ${c.nombre.toLowerCase()}`).join(' · '); }
/** Las cubetas de EN MEDIO con tarjetas, como «3 en curso · 1 en revisión» (renglon de proyecto). */
export function partesEnProceso(a) { return a.columnas.slice(1, -1).filter(c => a.porColumna[c.clave]).map(c => `${a.porColumna[c.clave]} ${c.nombre.toLowerCase()}`); }

/** Rol de un correo segun PROY_Roles. Sin renglon (o inactivo) = lectura. */
export function rolDe(correo, roles) {
    const c = String(correo || '').trim().toLowerCase();
    const r = (roles || []).find(x => String(x.Title || '').trim().toLowerCase() === c && x.Activo !== false);
    return r && ROLES.includes(r.Rol) ? r.Rol : 'lectura';
}

/**
 * Decision 3: todos ven todo y colaboran; solo gerencia crea/cierra proyectos y borra tarjetas.
 * Las funciones de guardar de app.js/tablero.js/docs.js COMPRUEBAN el rol (no solo esconden el
 * boton). Quien escribe de verdad lo decide SharePoint.
 */
export const PUEDE = {
    ver: () => true,
    tarea: rol => ['gerencia', 'colaborador'].includes(rol),     // crear, editar, asignar
    mover: rol => ['gerencia', 'colaborador'].includes(rol),
    ligar: rol => ['gerencia', 'colaborador'].includes(rol),     // ligar y subir al buzon
    borrar: rol => rol === 'gerencia',
    proyecto: rol => rol === 'gerencia',                         // crear, editar, cerrar
    capital: rol => rol === 'gerencia',                          // v0.100.0: ver y editar el capital de trabajo (dato financiero)
    // R-05 (v0.128.0): el estado declarado del frente lo pone gerencia o el Responsable de ESE proyecto si es colaborador
    salud: (rol, p, correo) => rol === 'gerencia' || (rol === 'colaborador' && !!p && !!correo && String(p.Responsable || '').trim().toLowerCase() === String(correo).trim().toLowerCase())
};

/**
 * R-05 (v0.128.0, referente: los project updates de Linear): el estado DECLARADO del frente — lo que el
 * responsable dice, no lo que los conteos deducen. Tres valores con el semaforo de la casa (clase = la de
 * los .is-ok/.is-warn/.is-danger). Vive en PROY_Proyectos.Salud/SaludNota/SaludPor/SaludEl.
 */
export const SALUD = [
    { clave: 'en-tiempo', nombre: 'En tiempo', clase: 'ok' },
    { clave: 'en-riesgo', nombre: 'En riesgo', clase: 'warn' },
    { clave: 'atrasado', nombre: 'Atrasado', clase: 'danger' }
];
export const MAX_NOTA_SALUD = 140;
/** El estado declarado de un proyecto, o null si nadie lo ha puesto (o trae un valor que no es de SALUD). */
export function saludDe(p) {
    const s = p && SALUD.find(x => x.clave === p.Salud);
    return s ? { ...s, nota: String(p.SaludNota || ''), por: p.SaludPor || '', el: p.SaludEl || '' } : null;
}
/** R-01 (v0.130.0): pasados estos dias, el estado declarado se pinta en gris tenue en Reportes (como el health caducado de Linear). */
export const SALUD_VIEJA_DIAS = 14;
/** La linea de estado de un frente en «Avance por proyecto»: null si nadie lo declaro; si no, saludDe + `hace` («hoy» / «hace N d») y `vieja` (> SALUD_VIEJA_DIAS). */
export function lineaSalud(p, hoy = new Date()) {
    const s = saludDe(p); if (!s) return null;
    const t = s.el ? Date.parse(s.el) : NaN;
    const d = Number.isNaN(t) ? null : Math.max(0, Math.floor((hoy.getTime() - t) / 864e5));
    return { ...s, hace: d === null ? '' : d === 0 ? 'hoy' : `hace ${d} d`, vieja: d !== null && d > SALUD_VIEJA_DIAS };
}

/**
 * Dias entre hoy y una fecha ISO (negativo si ya paso). null si no hay fecha o no es fecha.
 * v0.21.0: el dia se corta en HORA DE MEXICO (diaDe), no en UTC. Hasta v0.20.0 comparaba getUTC*: desde las
 * 18:00 de Mexico «hoy» ya era manana, asi que lo que vencia hoy se pintaba vencido seis horas al dia, una
 * tarjeta creada «para hoy» a las 18:30 nacia vencida, y Reportes abria una semana vacia (revisor, 13-sep).
 * `Vence` se guarda a las 18:00Z (mediodia de Mexico) y no cambia de dia con este corte.
 */
export function diasPara(fechaIso, hoy = new Date()) {
    const a = diaDe(fechaIso); if (!a) return null;
    return diasEntre(diaDe(hoy), a);
}

const FORMATO_MX = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });   // en-CA = YYYY-MM-DD
/** YYYY-MM-DD en hora de Mexico (la fecha del lote en el buzon; heredada de captura). */
export function fechaMexico(ahora = new Date()) { return FORMATO_MX.format(ahora); }

/** Texto a slug: minusculas, sin acentos, guiones. Para claves y nombres de carpeta. */
export function slug(texto) {
    return String(texto || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

/**
 * La clave de un proyecto es lo que se pega en el marcador de la KB (`· app: lau-asea-03-001`):
 * minusculas, digitos y guiones, 3 a 60 caracteres, sin empezar ni terminar en guion. Unica.
 */
export function validarClave(clave, existentes = []) {
    const c = String(clave || '').trim();
    if (!c) return { ok: false, motivo: 'la clave es obligatoria' };
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c)) return { ok: false, motivo: 'solo minúsculas, dígitos y guiones (p. ej. lau-asea-03-001)' };
    if (c.length < 3 || c.length > 60) return { ok: false, motivo: 'entre 3 y 60 caracteres' };
    if ((existentes || []).some(p => String(p.Clave || '').trim().toLowerCase() === c)) return { ok: false, motivo: `ya hay un proyecto con la clave ${c}` };
    return { ok: true, clave: c };
}

/** Tareas de un proyecto. */
export function tareasDe(proyecto, tareas) {
    const id = Number(proyecto && proyecto.id !== undefined ? proyecto.id : proyecto);
    return (tareas || []).filter(t => Number(t.ProyectoId) === id);
}

/**
 * {hechas, total, pct, porColumna, porCategoria, columnas} de las tareas de UN proyecto: `columnas` son
 * sus cubetas (default si no se pasan). Una tarjeta cuya cubeta ya no existe cuenta en porCategoria como
 * «por-hacer» y no en porColumna (el tablero la ensena aparte).
 */
export function avance(tareas, columnas = COLUMNAS_DEFAULT) {
    const ts = tareas || [];
    const porColumna = {}; const porCategoria = { 'por-hacer': 0, 'en-proceso': 0, hecho: 0 };
    for (const c of columnas) porColumna[c.clave] = 0;
    for (const t of ts) { if (porColumna[t.Columna] !== undefined) porColumna[t.Columna]++; porCategoria[categoriaDe(t, columnas)]++; }
    const hechas = porCategoria.hecho;
    return { hechas, total: ts.length, pct: ts.length ? Math.round(hechas * 100 / ts.length) : 0, porColumna, porCategoria, columnas };
}
/**
 * Avance de tareas de VARIOS proyectos (Inicio, Roadmap, Reportes), donde cada uno trae sus cubetas:
 * solo suma por categoria. `columnasDeTarea(t)` da las cubetas del proyecto de esa tarjeta.
 */
export function avanceGlobal(tareas, columnasDeTarea) {
    const ts = tareas || [];
    const porCategoria = { 'por-hacer': 0, 'en-proceso': 0, hecho: 0 };
    for (const t of ts) porCategoria[categoriaDe(t, columnasDeTarea(t))]++;
    const hechas = porCategoria.hecho;
    return { hechas, total: ts.length, pct: ts.length ? Math.round(hechas * 100 / ts.length) : 0, porCategoria };
}

/**
 * Las tareas abiertas con fecha, de la mas urgente a la menos, como mucho `n`. Las vencidas
 * van primero por construccion (dias negativos). `hoy` se pasa para poder probar.
 */
export function proximos(tareas, n = 6, hoy = new Date()) {
    return (tareas || [])
        .filter(t => t.Columna !== HECHO && t.Vence && diasPara(t.Vence, hoy) !== null)
        .map(t => ({ tarea: t, dias: diasPara(t.Vence, hoy) }))
        .sort((a, b) => a.dias - b.dias || String(a.tarea.Title).localeCompare(String(b.tarea.Title)))
        .slice(0, n);
}

/**
 * C-04 (v0.79.0): la clase y la frase del reloj de una fecha viven AQUI, una vez. Antes estaban reescritas a mano en
 * vistas.js (x5) y app.js (x4) y ya se habian separado solas (un «vencio» sin acento en un title, un «vence hoy» que
 * faltaba en Reportes). `d` es lo que devuelve diasPara(): null sin fecha.
 * claseVence: 'danger' vencida · 'warn' vence hoy o en `pronto` dias · `lejos` (lo que pinte cada sitio: idle/info/brand)
 * · 'idle' sin fecha.
 */
export function claseVence(d, pronto = 7, lejos = 'idle') {
    if (d === null || d === undefined) return 'idle';
    return d < 0 ? 'danger' : d <= pronto ? 'warn' : lejos;
}
/**
 * fraseVence: la frase segun la `forma` del sitio (`fecha` es la fecha ya formateada, dd/mm/aa, porque fechaCorta vive en comun.js):
 *   'corta' → «venció hace 3 d» · «vence hoy» · «vence 20/09/26»
 *   'larga' → «venció hace 3 d (12/09/26)» · «vence hoy» · «vence 20/09/26 (en 4 d)»   (el title de un rombo)
 *   'dias'  → «venció hace 3 d» · «vence hoy» · «vence en 4 d»                       (el chip del reloj, sin fecha)
 *   'chip'  → «hace 3 d» · «hoy» · «en 4 d»                                          (el chip de «Fines de frente»)
 * Sin fecha devuelve '' — el sitio decide que decir («sin fin de frente»).
 */
export function fraseVence(d, forma = 'corta', fecha = '') {
    if (d === null || d === undefined) return '';
    if (forma === 'chip') return d < 0 ? `hace ${-d} d` : d === 0 ? 'hoy' : `en ${d} d`;
    if (d === 0) return 'vence hoy';
    if (d < 0) return `venció hace ${-d} d` + (forma === 'larga' && fecha ? ` (${fecha})` : '');
    if (forma === 'dias') return `vence en ${d} d`;
    return `vence ${fecha}` + (forma === 'larga' ? ` (en ${d} d)` : '');
}
/** Clase de estado de una fecha de vencimiento: 'danger' vencida · 'warn' vence en `pronto` dias · 'idle' lejos · null sin fecha o hecha. */
export function estadoVence(tarea, pronto = 7, hoy = new Date()) {
    if (!tarea || tarea.Columna === HECHO) return null;
    const d = diasPara(tarea.Vence, hoy);
    return d === null ? null : claseVence(d, pronto);
}

/**
 * v0.20.0 (iteracion 2): el filete izquierdo de la tarjeta es un SEMAFORO de fecha, no de prioridad.
 * 'vencida' · 'pronto' (vence hoy o en `dias` dias) · 'hecha' · '' (en tiempo o sin fecha: filete gris).
 * `dias` es CONFIG.semaforoDias (3), mas corto que el «vence pronto» del chip (7) a proposito: el
 * borde grita solo lo inminente; el chip sigue avisando la semana entera.
 */
export function semaforo(tarea, dias = 3, hoy = new Date()) {
    if (!tarea) return '';
    if (tarea.Columna === HECHO) return 'hecha';
    const e = estadoVence(tarea, dias, hoy);
    return e === 'danger' ? 'vencida' : e === 'warn' ? 'pronto' : '';
}

/**
 * C-05 (v0.90.0) / C-09 (2-oct): una sola lectura de la fecha por tarjeta, para Mis tareas Y el contador del rail (antes era una copia
 * privada de tablero.js que ninguna unitaria tocaba). `e` = estadoVence(t, pronto) · `bloque` de la lista —«Esta semana» = hasta
 * `pronto` dias, hoy incluido— · `sem` = semaforo(t, semDias). Un solo diasPara; las unitarias la cotejan contra las otras dos.
 */
export function infoVence(tarea, pronto = 7, semDias = 3, hoy = new Date()) {
    const hecha = tarea.Columna === HECHO, d = hecha ? null : diasPara(tarea.Vence, hoy);
    const e = d === null ? null : claseVence(d, pronto), s = d === null ? null : claseVence(d, semDias);
    return { e, bloque: e === 'danger' ? 'Vencidas' : e === 'warn' ? 'Esta semana' : tarea.Vence ? 'Después' : 'Sin fecha', sem: hecha ? 'hecha' : s === 'danger' ? 'vencida' : s === 'warn' ? 'pronto' : '' };
}

/** Cuantas de estas tarjetas estan vencidas (para el contador rojo de la cubeta). */
export function vencidasEn(tareas, hoy = new Date()) { return (tareas || []).filter(t => estadoVence(t, 0, hoy) === 'danger').length; }

/**
 * Tarjetas EN PROCESO (ni en la primera cubeta ni hechas; hasta v0.10.0, solo «en-curso») que llevan
 * `dias` o mas sin moverse (columna Desde). Es el aviso contra el muerto de `tareas-delegadas`: una
 * tarjeta que nadie mueve se ve en Inicio. Sin `Desde` no se puede saber y no se senala (hacia el «no»,
 * que aqui es lo seguro). `columnasDeTarea(t)` da las cubetas del proyecto de esa tarjeta.
 */
export function sinMovimiento(tareas, dias, hoy = new Date(), columnasDeTarea = () => COLUMNAS_DEFAULT) {
    return (tareas || []).filter(t => diasQuieta(t, dias, hoy, columnasDeTarea) !== null);
}
/** C-15 (v0.94.0): los dias que lleva quieta UNA tarjeta si pasa el umbral `dias`, o null. La usan la tarjeta del tablero, el
 *  sufijo de la cola y «Sin movimiento» de Inicio, que antes calculaban cada uno `-diasPara(t.Desde)` por su lado. */
export function diasQuieta(t, dias, hoy = new Date(), columnasDeTarea = () => COLUMNAS_DEFAULT) {
    if (!t || !enProceso(t, columnasDeTarea(t)) || !t.Desde) return null;
    const d = diasPara(t.Desde, hoy);
    return d !== null && -d >= dias ? -d : null;
}
/** C-15: el rotulo unico de la quietud («sin movimiento 12 d»); antes la tarjeta decia «días» y la cola «d». */
export const rotuloQuieta = n => `sin movimiento ${n} d`;

/** Orden de una columna del tablero: Orden asc, luego prioridad (alta primero), luego vence, luego id. */
export function ordenar(tareas) {
    const peso = { alta: 0, normal: 1, baja: 2 };
    return [...(tareas || [])].sort((a, b) =>
        (Number(a.Orden ?? 1e9) - Number(b.Orden ?? 1e9))
        || ((peso[a.Prioridad] ?? 1) - (peso[b.Prioridad] ?? 1))
        || String(a.Vence || '9').localeCompare(String(b.Vence || '9'))
        || (Number(a.id) - Number(b.id)));
}

/** Minusculas y sin acentos: lo que compara todo buscador de la app (C3, v0.6.0: tambien Proyectos y Mis tareas). */
export const sinAcentos = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** C-18 (v0.138.0): la palabra en singular o plural segun n \u2014 plural(3, 'nuevo') = 'nuevos'. Solo la palabra: la cifra la pone quien llama. */
export const plural = (n, uno, varios = uno + 's') => n === 1 ? uno : varios;

/**
 * Filtro de tarjetas dentro de un proyecto (F9): por persona, «solo alta», «solo vencidas», «sin
 * dueño» (C7, v0.6.0) y texto (titulo o descripcion, sin distinguir acentos ni mayusculas). Un
 * filtro vacio deja pasar todo.
 */
export function filtrarTareas(tareas, f = {}, hoy = new Date()) {
    // v0.30.0 (F3): «quien» acepta UNA persona (string) o VARIAS (array) — el menu «Quién» permite marcar varias.
    const quienes = [].concat(f.quien || []).map(q => String(q || '').trim().toLowerCase()).filter(Boolean);
    const texto = sinAcentos(f.texto).trim();
    // «Sin dueño» es una casilla mas del mismo menu que las personas, asi que con ellas hace UNION (mis tarjetas
    // + las huerfanas), no interseccion — sola sigue dejando solo las huerfanas abiertas (C7).
    const huerfana = t => t.Columna !== HECHO && !String(t.Asignado || '').trim();
    return (tareas || []).filter(t =>
        ((!quienes.length && !f.sinDueno) || quienes.includes(String(t.Asignado || '').toLowerCase()) || (f.sinDueno && huerfana(t)))
        && (!f.alta || t.Prioridad === 'alta')
        && (!f.vencidas || estadoVence(t, 0, hoy) === 'danger')
        && (!texto || sinAcentos(t.Title).includes(texto) || sinAcentos(t.Descripcion).includes(texto)));
}

/** Tarjetas abiertas sin asignado (C7): no salen en Mis tareas de nadie ni cuentan en ningun KPI si no es este. */
export function sinDueno(tareas) {
    return (tareas || []).filter(t => t.Columna !== HECHO && !String(t.Asignado || '').trim());
}

/**
 * Orden de la lista de proyectos (C10, v0.6.0): el que vence antes va primero, sin fecha al final
 * y, a igual fecha, por nombre. Antes cada pantalla ordenaba por su cuenta y ninguna desempataba.
 */
export function ordenarProyectos(proyectos) {
    // Se compara el DIA (10 caracteres), no el ISO entero: el mismo dia escrito por la app
    // («…T18:00:00.000Z») y por la siembra («…T18:00:00Z») no es un empate si se compara la cadena.
    // C-13 (mejorar-app proyectos, 29-sep): el dia se corta en hora de Mexico (diaDe), como la hoja de calendario de la ficha; antes era UTC.
    const dia = p => p.Vence ? (diaDe(p.Vence) || String(p.Vence).slice(0, 10)) : null;
    return [...(proyectos || [])].sort((a, b) => {
        const x = dia(a), y = dia(b);
        if (x !== y) { if (x === null) return 1; if (y === null) return -1; const c = x.localeCompare(y); if (c) return c; }
        return String(a.Title || '').localeCompare(String(b.Title || ''), 'es') || (Number(a.id) - Number(b.id));
    });
}

// v0.71.0 (C-06, mejorar-app 16-sep): agruparPorEquipo (v0.23.0) salio — ninguna pantalla la llamaba desde v0.25.0.

/** C-03 (mejorar-app, 16-sep): que proyectos se VEN con el filtro de equipo del rail — una regla para Proyectos, Roadmap,
 *  Calendario y Reportes (vivia repetida caracter por caracter en app.js y vistas.js). `soloActivos=false` deja pasar los
 *  cerrados (la lista plegada de Proyectos). Sin filtro devuelve la base intacta. */
export const activosDe = proyectos => (proyectos || []).filter(p => p.Estado === 'activo');
export function proyectosVisibles(proyectos, filtroEquipo, soloActivos = true) {
    const base = soloActivos ? activosDe(proyectos) : (proyectos || []);
    return filtroEquipo ? base.filter(p => p.Equipo === filtroEquipo) : base;
}

/** Busqueda de proyectos por nombre, clave o descripcion (C3), sin acentos ni mayusculas. */
export function filtrarProyectos(proyectos, texto) {
    const q = sinAcentos(texto).trim();
    if (!q) return proyectos || [];
    return (proyectos || []).filter(p => sinAcentos(p.Title).includes(q) || sinAcentos(p.Clave).includes(q) || sinAcentos(p.Descripcion).includes(q));
}

/**
 * Orden de la Lista por columna (F10): `col` = tarea | asignado | columna | vence; `dir` = 1 asc,
 * -1 desc. La columna del tablero ordena por su posicion en las cubetas del proyecto (`columnas`),
 * no alfabeticamente; sin fecha va al final en las dos direcciones. `nombre(correo)` pinta el
 * asignado como se ve. (v0.11.0: «origen» salio de la Lista.)
 */
export function ordenarLista(tareas, col = 'vence', dir = 1, nombre = x => x, columnas = COLUMNAS_DEFAULT) {
    const claves = columnas.map(c => c.clave);
    const llave = {
        tarea: t => String(t.Title || '').toLowerCase(),
        asignado: t => t.Asignado ? String(nombre(t.Asignado)).toLowerCase() : null,
        columna: t => claves.indexOf(t.Columna),
        vence: t => t.Vence ? String(t.Vence) : null
    }[col] || (t => t.id);
    return [...(tareas || [])].sort((a, b) => {
        const x = llave(a), y = llave(b);
        if (x === null && y === null) return a.id - b.id;
        if (x === null) return 1;
        if (y === null) return -1;
        const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
        return (c * dir) || (a.id - b.id);
    });
}

/**
 * Subir / Bajar (F11): los cambios de Orden ({ id, Orden }) que mueven `id` `delta` posiciones dentro
 * de su columna, renumerando 1..n en el orden visual (ordenar()). Devuelve SOLO los que cambian:
 * la primera vez puede ser toda la columna (las sembradas no traen Orden); despues, dos.
 */
export function reordenar(tareasColumna, id, delta) {
    const lista = ordenar(tareasColumna);
    const i = lista.findIndex(t => Number(t.id) === Number(id));
    if (i < 0) return [];
    const j = i + delta;
    if (j < 0 || j >= lista.length) return [];
    const [t] = lista.splice(i, 1); lista.splice(j, 0, t);
    return lista.map((x, k) => ({ id: x.id, Orden: k + 1 })).filter((c, k) => Number(lista[k].Orden) !== c.Orden);
}

/**
 * v0.13.1 (auditoria de seguridad): la URL que se pone en un <a href> al PINTAR una liga, o null. Las ligas
 * «enlace» ya pasan por validarUrl al capturarse, pero PROY_Ligas.Url es una columna de texto que cualquier
 * cuenta con permiso de escritura en el sitio puede editar desde SharePoint: aqui se vuelve a exigir http(s)
 * para que un `javascript:` o `data:` pegado a mano no llegue nunca al DOM (la CSP lo bloquearia; esto lo
 * bloquea antes y sin depender de ella).
 * S-15 (27-sep): con `tipo` distinto de «enlace» (archivado, buzon) y `host`, la liga se pinta como documento de la
 * casa, asi que ademas se exige https y ese host exacto: una Url editada desde SharePoint hacia otro sitio da null.
 */
export function hrefSeguro(url, { tipo = null, host = null } = {}) {
    const s = String(url || '').trim();
    if (!/^https?:\/\//i.test(s)) return null;
    try {
        const u = new URL(s);
        if (!['http:', 'https:'].includes(u.protocol)) return null;
        if (tipo && tipo !== 'enlace' && host && (u.protocol !== 'https:' || u.hostname.toLowerCase() !== String(host).toLowerCase())) return null;
        return u.href;
    } catch (_) { return null; }
}

/** ISO del instante «hace `dias` dias» (v0.13.1: el piso de la ventana de PROY_Actividad). `dias` <= 0 = sin piso (null). */
export function desdeHaceDias(dias, hoy = new Date()) {
    const n = Number(dias);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Date(hoy.getTime() - n * 86400000).toISOString();
}

/** Sin esquema http(s) no es un enlace que la app pinte como liga (F4): evita javascript: y rutas locales. */
export function validarUrl(texto) {
    const s = String(texto || '').trim();
    if (!s) return { ok: false, motivo: 'pega la dirección del enlace' };
    let u;
    try { u = new URL(s); } catch (_) { return { ok: false, motivo: 'no es una dirección válida (empieza con https://)' }; }
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, motivo: 'solo enlaces http(s)' };
    return { ok: true, url: u.href };
}

/**
 * Que campos cambian al mover una tarea a `columna` (una de las cubetas del proyecto, `columnas`).
 * Al entrar a hecho se sella HechoPor/HechoEl; al salir se limpia (null borra la celda en Graph).
 * `Desde` se reescribe siempre.
 */
export function camposDeMovimiento(columna, quien, ahora = new Date(), columnas = COLUMNAS_DEFAULT) {
    if (!columnas.some(c => c.clave === columna)) throw new Error(`columna desconocida: ${columna}`);
    const iso = ahora.toISOString();
    const c = { Columna: columna, Desde: iso };
    if (columna === HECHO) { c.HechoPor = quien; c.HechoEl = iso; }
    else { c.HechoPor = null; c.HechoEl = null; }
    return c;
}

/** Iniciales de un correo o nombre, para el avatar. */
export function iniciales(quien) {
    const s = String(quien || '').split('@')[0].replace(/\d+/g, '');
    const partes = s.split(/[.\s_-]+/).filter(Boolean);
    return (partes.length >= 2 ? partes[0][0] + partes[1][0] : s.slice(0, 2)).toUpperCase() || '?';
}

/** Nombre corto de un correo: 'ana.perez@x' -> 'Ana Perez'. Si PROY_Roles trae Nombre, usa ese. */
export function nombreDe(correo, roles) {
    const c = String(correo || '').trim().toLowerCase();
    if (!c) return '—';
    const r = (roles || []).find(x => String(x.Title || '').trim().toLowerCase() === c);
    if (r && r.Nombre) return r.Nombre;
    return c.split('@')[0].replace(/\d+/g, '').split(/[._-]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(' ') || c;
}
/**
 * C-09 (v0.133.0): el nombre de PILA, salvo que otra persona de `entre` (correos; por omision todo PROY_Roles) comparta
 * ese primer nombre: entonces el completo, para que dos «Ana» no salgan iguales. Antes vivia solo en tablero.js (menu Quién).
 */
export function nombreCorto(correo, roles, entre) {
    const c = String(correo || '').trim().toLowerCase(), completo = nombreDe(c, roles), pila = completo.split(' ')[0];
    if (!c) return completo;
    const otros = entre || (roles || []).map(r => r.Title);
    return otros.some(q => { const o = String(q || '').trim().toLowerCase(); return o && o !== c && nombreDe(o, roles).split(' ')[0] === pila; }) ? completo : pila;
}

// ---------------------------------------------------------------- ligas: el tope de 255 de SharePoint

/** Largo maximo de una columna de texto de una linea en SharePoint; pasarlo es un 400 «Invalid request» sin mas detalle. */
export const TEXTO_MAX = 255;

/** La forma corta de SharePoint para abrir un elemento por su GUID (`sharepointIds.listItemUniqueId`): ~150 caracteres, abre lo mismo que el webUrl. null sin sitio o sin GUID. */
export function urlCortaDeGuid(sitioUrl, guid) {
    if (!sitioUrl || !guid) return null;
    const g = String(guid).replace(/[{}]/g, '').toUpperCase();
    return `${String(sitioUrl).replace(/\/+$/, '')}/_layouts/15/Doc.aspx?sourcedoc=%7B${g}%7D&action=default`;
}

/** Largo de cada campo de texto, para el aviso de un 400 que SharePoint no explica: 'Title 77 · Ruta 88 · Url 250'. */
export function resumenLargos(campos) {
    return Object.entries(campos || {}).filter(([, v]) => typeof v === 'string').map(([k, v]) => `${k} ${v.length}`).join(' · ');
}

/** Campos de texto que no caben en una columna de una linea: ['Url (268)', ...]. Vacio = todo cabe. */
export function textosLargos(campos, max = TEXTO_MAX) {
    return Object.entries(campos || {}).filter(([, v]) => typeof v === 'string' && v.length > max).map(([k, v]) => `${k} (${v.length})`);
}

/**
 * La URL que se guarda en PROY_Ligas.Url (texto de una linea, 255). El `webUrl` que Graph da por un
 * archivo de Office es la forma Doc.aspx?sourcedoc={GUID}&file=<nombre>&action=default&mobileredirect=true
 * (a veces &DefaultItemOpen=1): con un nombre de la convencion de la casa (60-100 caracteres) pasa de
 * 255 y SharePoint contesta 400 «Invalid request» (medido 2026-09-12 con el estudio de mercado de
 * CALYTEK, 77 caracteres de nombre). Orden: el webUrl si cabe; si no, la forma corta con el GUID del
 * elemento (`sharepointIds.listItemUniqueId`), que abre lo mismo; si no hay GUID, el Doc.aspx sin los
 * parametros que sobran; null si nada cabe — quien llama avisa en vez de mandar el 400.
 */
export function urlParaLiga(webUrl, { sitioUrl, guid } = {}, max = TEXTO_MAX) {
    const w = String(webUrl || '').trim();
    if (w && w.length <= max) return w;
    const corta = urlCortaDeGuid(sitioUrl, guid);
    if (corta && corta.length <= max) return corta;
    if (/\/_layouts\/15\/Doc\.aspx\?/i.test(w)) {
        try {
            const u = new URL(w);
            for (const p of ['file', 'mobileredirect', 'DefaultItemOpen']) u.searchParams.delete(p);
            if (u.href.length <= max) return u.href;
        } catch (_) { /* no era una URL; se cae al null */ }
    }
    return null;
}

// ---------------------------------------------------------------- archivos: tipo por extension (v0.8.0)

/** Extension en minusculas de un nombre o ruta ('informe.PDF' -> 'pdf'); '' si no hay. */
export function extensionDe(nombre) {
    const s = String(nombre || '').split(/[\\/]/).pop();
    const i = s.lastIndexOf('.');
    return i > 0 ? s.slice(i + 1).toLowerCase() : '';
}

/**
 * Tipo visual de un documento para su icono: la CLAVE es lo que pinta comun.js (iconoArchivo) y la
 * ETIQUETA lo que dice el title. Cubre lo que circula en la casa (Office, PDF, imagenes, correos,
 * planos); lo demas es «archivo». `tipoLiga` = buzon | enlace manda sobre la extension.
 */
// v0.27.0: la 4.ª columna es la SIGLA que va en la etiqueta de expediente de la tabla (chip «Tipo»); la etiqueta larga
// sigue siendo lo que ordena, busca y va en el title.
const TIPOS_ARCHIVO = [
    ['pdf', 'PDF', ['pdf'], 'PDF'],
    ['word', 'Word', ['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt'], 'DOC'],
    ['excel', 'Excel', ['xls', 'xlsx', 'xlsm', 'xlsb', 'csv', 'ods'], 'XLS'],
    ['ppt', 'PowerPoint', ['ppt', 'pptx', 'pptm', 'potx', 'odp'], 'PPT'],
    ['imagen', 'Imagen', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff', 'svg'], 'IMG'],
    ['correo', 'Correo', ['msg', 'eml'], 'EML'],
    ['plano', 'Plano', ['dwg', 'dxf', 'kmz', 'kml'], 'DWG'],
    ['zip', 'Comprimido', ['zip', 'rar', '7z'], 'ZIP'],
    ['texto', 'Texto', ['txt', 'md', 'json', 'xml'], 'TXT']
];
export function tipoArchivo(nombre, tipoLiga = null) {
    if (tipoLiga === 'buzon') return { clave: 'lote', etiqueta: 'Lote en el buzón', sigla: 'LOTE' };
    if (tipoLiga === 'enlace') return { clave: 'enlace', etiqueta: 'Enlace', sigla: 'URL' };
    const ext = extensionDe(nombre);
    const t = TIPOS_ARCHIVO.find(([, , exts]) => exts.includes(ext));
    // desconocido: la extension real en mayusculas (hasta 4 letras) hace de sigla; sin extension, «ARCH»
    return t ? { clave: t[0], etiqueta: t[1], sigla: t[3] } : { clave: 'archivo', etiqueta: ext ? `Archivo .${ext}` : 'Archivo', sigla: ext ? ext.toUpperCase().slice(0, 4) : 'ARCH' };
}

// ---------------------------------------------------------------- v0.19.0: el nombre humano de un documento

/**
 * Parte un nombre de archivo de la convencion de la casa (`AAAA-MM-DD_Emisor_Tipo_detalle-en-kebab_ID_rev2.ext`,
 * la de los _LEEME de cada biblioteca) en lo que la tabla pinta aparte: { titulo, fecha, emisor, rev, original }.
 * - `fecha`: el prefijo AAAA-MM-DD (seguido de `_` o espacio) o null; no se valida como fecha real, solo la forma. Un
 *   prefijo de solo año o año-mes (`2025_MINSA_Politica…`, `2025-06_…`, 22 reales) se acepta tal cual: se pinta `2025-06`
 *   y ordena antes que cualquier dia de ese mes (comparacion de texto).
 * - `emisor`: el primer segmento tras la fecha SOLO si hay fecha y quedan 2+ segmentos (sin fecha no se adivina).
 * - `rev`: un ultimo segmento `rev2` / `rev02` / `v3` / `v3.0` (tambien `_con-anexos_rev2` deja el rev aparte); null si no hay.
 * - `titulo`: los segmentos restantes unidos con « · »; dentro de cada uno los guiones pasan a espacio SALVO en lo
 *   que parece identificador (lleva digitos y NINGUNA minuscula): `SOLPED-1000080660`, `PDH-009`, `UGI-ABC-1234-2026`
 *   se quedan enteros; `sistema-organico` → «sistema organico» y `desemulsificante-RD-EB-26` → «desemulsificante RD EB 26»
 *   (medido sobre 9,308 nombres reales, revisor 13-sep: exigir mayuscula sin prohibir minuscula dejaba 27 frases con guion).
 *   La primera letra del titulo va en mayuscula (la convencion escribe el detalle en minusculas).
 * Un nombre fuera de la convencion (sin fecha) sale entero como titulo, sin extension: nada se inventa.
 */
export function nombreHumano(nombre) {
    return partirNombre(nombre);
}
/** La lectura de una LIGA: un enlace se pinta, ordena y busca por su titulo tal cual (lo escribio una persona); lo demas por nombreHumano. */
export function nombreDeLiga(l) {
    return l && l.Tipo === 'enlace' ? { titulo: String(l.Title || ''), fecha: null, emisor: null, rev: null, original: String(l.Title || '') } : partirNombre(l && l.Title);
}
function partirNombre(nombre) {
    const original = String(nombre || '').split(/[\\/]/).pop();
    const ext = extensionDe(original);
    let s = ext ? original.slice(0, -(ext.length + 1)) : original;
    let fecha = null;
    const mf = /^(\d{4}(?:-\d{2}){0,2})[_ ](.+)$/.exec(s);
    if (mf) { fecha = mf[1]; s = mf[2]; }
    let rev = null;
    const mr = /^(.+)_((?:rev|v)\d+(?:\.\d+)?)$/i.exec(s);
    if (mr) { s = mr[1]; rev = mr[2].toLowerCase(); }
    let segs = s.split('_').filter(Boolean);
    let emisor = null;
    if (fecha && segs.length >= 2) emisor = segs.shift();
    const esId = x => /\d/.test(x) && !/[a-z]/.test(x);
    let titulo = segs.map(x => esId(x) ? x : x.replace(/-/g, ' ')).join(' · ') || original;
    if (fecha) titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);   // solo lo que viene de la convencion; un nombre libre no se retoca
    return { titulo, fecha, emisor, rev, original };
}

// ---------------------------------------------------------------- menciones @nombre (v0.8.0, chat por proyecto)

/** Los alias por los que se puede mencionar a alguien: primer nombre y parte local del correo, sin acentos. */
export function aliasDe(correo, roles) {
    const c = String(correo || '').trim().toLowerCase();
    if (!c) return [];
    const nombre = sinAcentos(nombreDe(c, roles)).trim();
    const out = new Set();
    // «Ma. de los Angeles»: el punto final del alias se cae (el parser lo lee como fin de frase).
    const limpio = a => String(a || '').replace(/[.\-_]+$/, '');
    if (nombre) { out.add(limpio(nombre.split(/\s+/)[0])); out.add(limpio(nombre.replace(/\s+/g, '.'))); }
    const local = c.split('@')[0]; if (local) out.add(limpio(local));
    return [...out].filter(a => /^[a-z0-9._-]+$/.test(a));
}

/** El alias con que se ESCRIBE una mencion: el primer nombre; si dos personas lo comparten, la parte local del correo. */
export function aliasParaMencion(correo, roles) {
    const mios = aliasDe(correo, roles); if (!mios.length) return '';
    const primero = mios[0];
    const otros = (roles || []).filter(r => String(r.Title || '').toLowerCase() !== String(correo || '').toLowerCase() && r.Activo !== false);
    const choca = otros.some(r => aliasDe(r.Title, roles)[0] === primero);
    return choca ? String(correo).toLowerCase().split('@')[0] : primero;
}

// El alias admite letras con acento (teclado en español: «@José»); se compara sin ellos.
const ALIAS_CHARS = 'a-z0-9._\\-\\u00C0-\\u017F';
const RE_MENCION = new RegExp(`(^|[^${ALIAS_CHARS}@])@([${ALIAS_CHARS}]+)`, 'gi');
/**
 * Parte un texto en trozos { texto } y { mencion: correo, texto: '@alias' } resolviendo cada @alias
 * contra PROY_Roles (sin acentos ni mayusculas; la puntuacion pegada al final no cuenta). Un @ que no
 * es de nadie queda como texto — y tambien un alias AMBIGUO (dos «Carlos» activos): es mejor no avisar
 * a nadie que avisar al Carlos equivocado; el selector escribe siempre el alias inequivoco.
 */
export function trozosConMenciones(texto, roles) {
    const s = String(texto || ''); const out = []; let i = 0;
    const activos = (roles || []).filter(r => r.Activo !== false);
    RE_MENCION.lastIndex = 0; let m;
    while ((m = RE_MENCION.exec(s))) {
        let alias = m[2]; let fin = m.index + m[0].length;
        while (alias.length && /[.\-_]$/.test(alias)) { alias = alias.slice(0, -1); fin--; }   // «@ana.» al final de la frase
        const candidatos = activos.filter(r => aliasDe(r.Title, roles).includes(sinAcentos(alias)));
        const quien = candidatos.length === 1 ? candidatos[0] : null;
        const ini = m.index + m[1].length;
        if (!quien) continue;
        if (ini > i) out.push({ texto: s.slice(i, ini) });
        out.push({ mencion: String(quien.Title).toLowerCase(), texto: s.slice(ini, fin) });
        i = fin;
    }
    if (i < s.length) out.push({ texto: s.slice(i) });
    return out;
}
/** Correos mencionados en un texto (unicos, en orden). */
export function mencionesEn(texto, roles) {
    return [...new Set(trozosConMenciones(texto, roles).filter(t => t.mencion).map(t => t.mencion))];
}
/**
 * El @alias a medio escribir donde esta el cursor («hola @fra» -> 'fra'), o null si el cursor no esta en
 * una mencion. `desde`/`hasta` acotan la palabra ENTERA (lo que hay despues del cursor tambien): elegir
 * en el selector reemplaza «@fra|ncisco» completo, no solo lo que quedaba a la izquierda del cursor.
 */
const RE_EN_CURSO = new RegExp(`(^|[^${ALIAS_CHARS}@])@([${ALIAS_CHARS}]*)$`, 'i');
const RE_RESTO = new RegExp(`^[${ALIAS_CHARS}]*`, 'i');
export function mencionEnCurso(texto, cursor) {
    const s = String(texto || ''); const antes = s.slice(0, cursor);
    const m = RE_EN_CURSO.exec(antes); if (!m) return null;
    const resto = RE_RESTO.exec(s.slice(cursor))[0];
    return { alias: m[2], desde: antes.length - m[2].length - 1, hasta: cursor + resto.length };
}

// ---------------------------------------------------------------- v0.10.0: roadmap, calendario, reportes (reglas puras)

/** Dia de un ISO como YYYY-MM-DD en HORA DE MEXICO (el mismo dia que usa diasPara; hasta v0.20.0 era UTC); null si no es fecha. */
export function diaDe(iso) {
    if (!iso) return null;
    const f = iso instanceof Date ? iso : new Date(iso);
    return Number.isNaN(f.getTime()) ? null : fechaMexico(f);
}
const MESES_FECHA = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** v1.0.0 (cubeta 6, fidelidad #12): la fecha que se le MUESTRA a la persona en reportes, tablas y KPIs — una sola forma. Vuelta 1 (Carlos,
 *  3-oct: «dd/mm/aaaa»): «01/10/2026», la forma de los campos (v0.106.0); supera el «1 oct 2026» de la maqueta. Un ISO con hora se lee en el
 *  día de México (diaDe); un día suelto (YYYY-MM-DD) tal cual, sin pasar por Date. Lo que no es fecha: «—». El CSV y lo que se escribe en
 *  SharePoint NO la usan. */
export function fechaDia(x) {
    const s = x instanceof Date ? '' : String(x || '');
    const d = x instanceof Date ? diaDe(x) : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : /^\d{4}-\d{2}-\d{2}T/.test(s) ? diaDe(s) : null;
    return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
}
/** El día AAAA-MM-DD de una fecha: un día suelto es ESE día (sin pasar por Date: su medianoche UTC es el día anterior en México); un ISO con
 *  hora o un Date, el día de México (diaDe). null si no es fecha. */
const diaSuelto = x => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : diaDe(x));
/** v1.0.0 (vuelta 1, revisión UI/UX «fondo»): la fecha como hoja de calendario —{ mes: 'oct', dia: 31 }—; null sin fecha. Antes (comun.js mesDia)
 *  un AAAA-MM-DD se volvía a leer con diaDe y el tablero y la ficha decían el vencimiento UN DÍA ANTES que la Lista. */
export function mesDiaDe(x) { const d = diaSuelto(x); return d ? { mes: MESES_FECHA[Number(d.slice(5, 7)) - 1], dia: Number(d.slice(8, 10)) } : null; }
/** U-40 (v0.141.0): «26 sep» con espacio duro (la celda Vence de la ficha partía «26 / sep»), y el año solo si no es el de `hoy`; null sin fecha. */
export function fechaVenceDe(x, hoy = new Date()) {
    const d = diaSuelto(x); if (!d) return null;
    const md = mesDiaDe(d);
    return `${md.dia} ${md.mes}` + (Number(d.slice(0, 4)) !== hoy.getFullYear() ? ` ${d.slice(0, 4)}` : '');
}
/** Suma `n` dias a un YYYY-MM-DD. */
export function sumarDias(dia, n) { const f = new Date(dia + 'T00:00:00Z'); f.setUTCDate(f.getUTCDate() + n); return f.toISOString().slice(0, 10); }
/** Dias enteros de `a` a `b` (YYYY-MM-DD); negativo si b es antes. */
export function diasEntre(a, b) { return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000); }
/** Dia de la semana de un YYYY-MM-DD con lunes = 0 … domingo = 6 (C-04 v0.86.0: antes la aritmetica vivia aqui y dos veces en vistas.js). */
export function diaSemana(dia) { return (new Date(dia + 'T00:00:00Z').getUTCDay() + 6) % 7; }
/** El lunes de la semana de `dia`. */
export function lunesDe(dia) { return sumarDias(dia, -diaSemana(dia)); }
/** El mes que sigue (o el anterior con -1) a un YYYY-MM. */
export function mesSumar(mes, n) { const f = new Date(mes + '-01T00:00:00Z'); f.setUTCMonth(f.getUTCMonth() + n); return f.toISOString().slice(0, 7); }

/**
 * Cuando EMPIEZA una tarjeta en el roadmap: `Desde` (en esta columna desde), si no la fecha de
 * creacion que SharePoint sabe (`_creado`), si no nada. Cuando TERMINA: `HechoEl` si esta hecha,
 * si no `Vence`. Una tarjeta sin fin no tiene barra: sale en la lista «sin fecha».
 */
export function lapsoTarea(t) {
    const fin = diaDe(t.Columna === HECHO ? (t.HechoEl || t.Vence) : t.Vence);
    let inicio = diaDe(t.Desde) || diaDe(t._creado);
    if (fin && inicio && inicio > fin) inicio = fin;
    return { inicio: inicio || fin, fin };
}
/** Lapso de un proyecto: desde su creacion (o la tarjeta mas vieja) hasta su fin de frente (o la tarjeta que vence al ultimo). */
export function lapsoProyecto(p, ts) {   // C-12 (v0.120.0): `ts` son las tarjetas DEL proyecto, ya filtradas (quien llama ya las tiene); un lapsoTarea por tarjeta
    const ls = ts.map(lapsoTarea);
    const inicios = ls.map(l => l.inicio).filter(Boolean).sort();
    const fines = ls.map(l => l.fin).filter(Boolean).sort();
    const inicio = diaDe(p._creado) || inicios[0] || null;
    const fin = diaDe(p.Vence) || (fines.length ? fines[fines.length - 1] : null);
    return { inicio: inicio && fin && inicio > fin ? fin : inicio || fin, fin };
}
/**
 * El eje del roadmap: del lunes anterior al lapso mas temprano al domingo posterior al mas tardio,
 * siempre conteniendo `hoy` y con un minimo de `minDias` para que las barras tengan donde vivir.
 */
export function rangoRoadmap(lapsos, hoy, minDias = 56) {
    const h = diaDe(hoy);
    let a = h, b = h;
    for (const l of lapsos) { if (l.inicio && l.inicio < a) a = l.inicio; if (l.fin && l.fin > b) b = l.fin; if (l.fin && l.fin < a) a = l.fin; if (l.inicio && l.inicio > b) b = l.inicio; }
    // C-08 (v0.120.0): tope de 2 años atras y 3 adelante de hoy — una fecha tecleada mal (2226) estiraba el eje a siglos y
    // congelaba la pantalla (un nodo por semana). barraEn y acomodarHitos ya recortan lo que cae fuera.
    const piso = sumarDias(h, -730), techo = sumarDias(h, 1095);
    if (a < piso) a = piso; if (b > techo) b = techo;
    if (diasEntre(a, b) < minDias) b = sumarDias(a, minDias);
    a = lunesDe(a); b = sumarDias(lunesDe(b), 6);
    return { desde: a, hasta: b, dias: diasEntre(a, b) + 1 };
}
/** Posicion y ancho (en %) de una barra dentro del rango; recorta a los bordes. null si no cabe nada. */
export function barraEn(lapso, rango) {
    if (!lapso.fin) return null;   // sin fin no hay barra (una tarjeta sin vencimiento sale como texto)
    const i = lapso.inicio || lapso.fin, f = lapso.fin;
    const a = Math.max(0, diasEntre(rango.desde, i)), b = Math.min(rango.dias, diasEntre(rango.desde, f) + 1);
    if (b <= 0 || a >= rango.dias) return null;
    return { left: a * 100 / rango.dias, width: Math.max(b - a, 1) * 100 / rango.dias };
}
/** Los meses que cruza el rango, con su posicion y ancho en % (para la cabecera del eje). */
export function mesesDelRango(rango) {
    const out = []; let d = rango.desde;
    while (d <= rango.hasta) {
        const fin = sumarDias(mesSumar(d.slice(0, 7), 1) + '-01', -1);
        const hasta = fin < rango.hasta ? fin : rango.hasta;
        out.push({ mes: d.slice(0, 7), desde: d, hasta, width: (diasEntre(d, hasta) + 1) * 100 / rango.dias, left: diasEntre(rango.desde, d) * 100 / rango.dias });
        d = sumarDias(hasta, 1);
    }
    return out;
}

/** Las celdas (lunes a domingo) de las semanas que TOCAN el mes YYYY-MM: { dia, enMes }. U-14 (v0.154.0): 4, 5 o 6 semanas;
 *  antes siempre 42 y la ultima fila salia vacia (los dias de fuera no pintan desde U-05). Revertir = `length: 42`. */
export function celdasDelMes(mes) {
    const inicio = lunesDe(mes + '-01'), fin = sumarDias(mesSumar(mes, 1) + '-01', -1);
    const n = Math.ceil((diasEntre(inicio, fin) + 1) / 7) * 7;
    return Array.from({ length: n }, (_, i) => { const dia = sumarDias(inicio, i); return { dia, enMes: dia.slice(0, 7) === mes }; });
}
/**
 * Lo que cae en cada dia del calendario: tarjetas por su Vence (abiertas y hechas) y fines de frente
 * de proyectos activos. Map YYYY-MM-DD -> { tareas: [], fines: [] }.
 */
export function agendaPorDia(tareas, proyectos) {
    const m = new Map();
    const de = d => { if (!m.has(d)) m.set(d, { tareas: [], fines: [] }); return m.get(d); };
    for (const t of tareas || []) { const d = diaDe(t.Vence); if (d) de(d).tareas.push(t); }
    for (const p of proyectos || []) { const d = diaDe(p.Vence); if (d && p.Estado === 'activo') de(d).fines.push(p); }
    for (const v of m.values()) v.tareas.sort((a, b) => (a.Columna === HECHO) - (b.Columna === HECHO) || String(a.Title).localeCompare(String(b.Title)));
    return m;
}

/**
 * Tarjetas HECHAS por semana (lunes) en las ultimas `n` semanas, la mas vieja primero; sin HechoEl no cuentan.
 * R-03 (v0.132.0): `nuevas` = las CREADAS esa semana (por `_creado`, hechas o no), como el Created vs Resolved de Jira.
 */
export function hechasPorSemana(tareas, n = 8, hoy = new Date()) {
    const fin = lunesDe(diaDe(hoy));
    const semanas = Array.from({ length: n }, (_, i) => ({ desde: sumarDias(fin, -7 * (n - 1 - i)), n: 0, nuevas: 0 }));
    const de = d => d && semanas.find(x => x.desde === lunesDe(d));
    for (const t of tareas || []) {
        const c = de(diaDe(t._creado)); if (c) c.nuevas++;
        if (t.Columna !== HECHO) continue;
        const s = de(diaDe(t.HechoEl)); if (s) s.n++;
    }
    return semanas;
}
/** Carga por persona: abiertas, vencidas y hechas, de mas abiertas a menos; sin dueño ('') al final.
 *  C-13 (v0.146.0): `historia` (los frentes del filtro aunque esten cerrados, C-05) da las HECHAS y la fila de quien solo tiene hechas;
 *  las abiertas y vencidas salen de `tareas` (los activos). Sin `historia`, las hechas son las de `tareas`. */
export function cargaPorPersona(tareas, pronto = 7, hoy = new Date(), historia = tareas) {
    const m = new Map();
    const fila = t => { const q = String(t.Asignado || '').toLowerCase(); if (!m.has(q)) m.set(q, { quien: q, abiertas: 0, vencidas: 0, hechas: 0 }); return m.get(q); };
    for (const t of tareas || []) if (t.Columna !== HECHO) { const r = fila(t); r.abiertas++; if (estadoVence(t, pronto, hoy) === 'danger') r.vencidas++; }
    for (const t of historia || []) if (t.Columna === HECHO) fila(t).hechas++;
    return [...m.values()].sort((a, b) => (a.quien === '') - (b.quien === '') || b.abiertas - a.abiertas || a.quien.localeCompare(b.quien));
}
/**
 * R-02 (v0.131.0): las ABIERTAS de una persona ('' = sin dueño) agrupadas por frente, como el clic en una barra de Linear Insights.
 * Solo frentes de `orden` y en ese orden, salvo que los que traen vencidas suben arriba; dentro de cada uno, vencidas primero y luego porVence.
 */
export function abiertasDePersona(tareas, quien, orden, pronto = 7, hoy = new Date()) {
    const q = String(quien || '').toLowerCase(), porP = new Map();
    for (const t of tareas || []) {
        if (t.Columna === HECHO || String(t.Asignado || '').toLowerCase() !== q) continue;
        const k = Number(t.ProyectoId); if (!porP.has(k)) porP.set(k, []); porP.get(k).push(t);
    }
    const vencida = t => estadoVence(t, pronto, hoy) === 'danger';
    const grupos = [];
    for (const p of orden || []) {
        const ts = porP.get(p.id); if (!ts) continue;
        ts.sort((a, b) => vencida(b) - vencida(a) || porVence(a, b));
        grupos.push({ p, tareas: ts, vencidas: ts.filter(vencida).length });
    }
    return grupos.sort((a, b) => (b.vencidas > 0) - (a.vencidas > 0));   // sort estable: el resto conserva el orden de los frentes
}
/** Renglones de actividad por persona en los ultimos `dias`, de mas a menos. */
export function actividadPorPersona(actividad, dias = 30, hoy = new Date()) {
    const desde = new Date(hoy.getTime() - dias * 86400000).toISOString();
    const m = new Map();
    for (const a of actividad || []) { if (String(a.Cuando || '') < desde) continue; const q = String(a.Quien || '').toLowerCase(); m.set(q, (m.get(q) || 0) + 1); }
    return [...m.entries()].map(([quien, n]) => ({ quien, n })).sort((a, b) => b.n - a.n || a.quien.localeCompare(b.quien));
}
/** El ultimo comentario (chat o nota) de cada proyecto, del mas reciente al mas viejo. */
export function ultimoComentarioPorProyecto(actividad) {
    const m = new Map();
    for (const a of actividad || []) {
        if (a.Accion !== 'comentar' || !a.ProyectoId) continue;
        const k = Number(a.ProyectoId); const v = m.get(k);
        if (!v || String(a.Cuando || '') > String(v.Cuando || '')) m.set(k, a);
    }
    return [...m.entries()].map(([proyectoId, ultimo]) => ({ proyectoId, ultimo })).sort((a, b) => String(b.ultimo.Cuando || '').localeCompare(String(a.ultimo.Cuando || '')));
}
/** C-05 (mejorar-app archivos, 17-sep): los chips por tipo de liga, la misma tupla en Docs del proyecto y en #archivos. */
export const TIPOS_LIGA = [[null, 'Todos'], ['archivado', 'Archivado'], ['buzon', 'En el buzón'], ['enlace', 'Enlace']];   // U-12 (30-sep): el segmentado con mayuscula inicial, como «Todos»; los chips de estado del renglon siguen en minuscula
/** Filtro de Archivos (v0.10.0): por proyecto, tipo de liga y texto (nombre, ruta, url), sin acentos. */
export function filtrarLigas(ligas, f = {}) {
    const q = sinAcentos(f.texto || '').trim();
    return (ligas || []).filter(l => (!f.proyectoId || Number(l.ProyectoId) === Number(f.proyectoId)) && (!f.tipo || l.Tipo === f.tipo)
        && (!q || sinAcentos(`${l.Title} ${nombreDeLiga(l).titulo} ${l.Ruta || ''} ${l.Url || ''}`).includes(q)));   // v0.19.0: tambien el titulo que se ve
}

/**
 * v0.18.0: orden de la tabla de documentos (Docs del proyecto y #archivos) por columna, el mismo patron F10 de la
 * Lista. `nombre(correo)` pinta «Ligado por» como se ve; `tarjeta(id)` da el titulo de la tarjeta. Sin valor
 * (sin tarjeta, sin quien, sin fecha) va al final en las dos direcciones; el empate lo rompe la liga mas nueva.
 */
export function ordenarLigas(ligas, col = 'fecha', dir = -1, { nombre = x => x, tarjeta = () => '' } = {}) {
    const ESTADO = { archivado: 0, buzon: 1, enlace: 2 };
    const llave = {
        nombre: l => { const h = nombreDeLiga(l); return `${h.emisor ? h.emisor + ' ' : ''}${h.titulo}`.toLowerCase(); },   // v0.19.0: por lo que se ve ([emisor] titulo), no por el nombre del archivo
        del: l => nombreDeLiga(l).fecha,                             // v0.19.0: la fecha del documento (del nombre); enlaces y sin fecha, al final
        tipo: l => tipoArchivo(l.Ruta || l.Title, l.Tipo).etiqueta.toLowerCase(),
        estado: l => l.Tipo in ESTADO ? ESTADO[l.Tipo] : 3,
        tarjeta: l => l.TareaId ? String(tarjeta(l.TareaId) || '').toLowerCase() : null,
        quien: l => l.LigadoPor ? String(nombre(l.LigadoPor)).toLowerCase() : null,
        fecha: l => l._creado ? String(l._creado) : null
    }[col] || (l => l.id);
    return [...(ligas || [])].sort((a, b) => {
        const x = llave(a), y = llave(b);
        if (x === null && y === null) return b.id - a.id;
        if (x === null) return 1;
        if (y === null) return -1;
        const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
        return (c * dir) || (b.id - a.id);
    });
}
/** La direccion con que arranca una columna al elegirla: las dos fechas (Ligada y la del documento), la mas nueva arriba; las demas, ascendente. */
export function direccionInicial(col) { return col === 'fecha' || col === 'del' ? -1 : 1; }

// ---------------------------------------------------------------- v0.15.0: el mismo canal (auditoria como usuario, 2026-09-13)

/** El piso de «nuevo» en Inicio: la marca de visto, o sin marca los ultimos `diasSinMarca` dias. C-10 (v0.94.0): lo comparten
 *  «Nuevo para ti» y el punto azul de «Actividad reciente» (antes la actividad, sin marca, daba por nuevo TODO lo ajeno). */
/**
 * S-12 (mejorar-app, 24-sep): la fecha con que se SUBE una marca de visto. `Cuando` la escribe el cliente y SharePoint no la
 * valida: una laptop con el reloj adelantado (o un PATCH a mano) dejaba la marca en el futuro, y como la marca solo sube,
 * «Nuevo para ti» y el punto azul se apagaban para siempre. Tope: la hora actual + `holguraMs` (5 min), que absorbe el desfase
 * normal entre relojes. Se aparta de la propuesta (min con `_creado`): `_creado` es hora del SERVIDOR y queda unos segundos
 * antes del `Cuando` de un cliente adelantado, asi que la marca nunca alcanzaba a ese renglon y se quedaba «nuevo» siempre.
 */
export function marcaFiable(iso, ahora = new Date(), holguraMs = 5 * 60000) {
    const tope = new Date(ahora.getTime() + holguraMs).toISOString(), v = String(iso || '');
    return v && v < tope ? v : tope;
}
export function pisoNuevo(desde, hoy = new Date(), diasSinMarca = 3) { return desde || new Date(hoy.getTime() - diasSinMarca * 86400000).toISOString(); }

/**
 * «Nuevo para ti» (Inicio): lo que OTROS hicieron sobre lo tuyo desde `desde` (ISO) —te asignaron o cambiaron una
 * tarjeta tuya, anotaron en ella, o te mencionaron en el chat—, lo mas nuevo arriba. Sin `desde`, los ultimos
 * `diasSinMarca` dias. Cada renglon trae `tipo` (asignada · cambio · nota · mencion) y el renglon `a` de actividad.
 */
export function nuevoParaMi(actividad, tareas, roles, correo, desde, hoy = new Date(), diasSinMarca = 3) {
    const yo = String(correo || '').toLowerCase();
    const piso = pisoNuevo(desde, hoy, diasSinMarca);
    const mias = new Map((tareas || []).filter(t => String(t.Asignado || '').toLowerCase() === yo).map(t => [Number(t.id), t]));
    const out = [];
    for (const a of actividad || []) {
        if (String(a.Quien || '').toLowerCase() === yo || !(String(a.Cuando || '') > piso)) continue;
        const t = a.TareaId ? mias.get(Number(a.TareaId)) : null;
        if (a.Accion === 'comentar') {
            if (trozosConMenciones(a.Title, roles).some(x => x.mencion === yo)) out.push({ tipo: 'mencion', a, tarea: t || null });
            else if (t) out.push({ tipo: 'nota', a, tarea: t });
        } else if (t && (a.Accion === 'crear-tarea' || a.Accion === 'editar-tarea')) {
            out.push({ tipo: a.Accion === 'crear-tarea' || /^asign/i.test(String(a.Title || '')) ? 'asignada' : 'cambio', a, tarea: t });
        }
    }
    return out.sort((x, y) => String(y.a.Cuando || '').localeCompare(String(x.a.Cuando || '')) || y.a.id - x.a.id);
}

/** Orden de Mis tareas: por fecha de vencimiento (las sin fecha al final) y luego por id. C-03 (v0.90.0): vivia dos veces (aqui y en tablero.js). */
export const porVence = (a, b) => String(a.Vence || '9').localeCompare(String(b.Vence || '9')) || a.id - b.id;
/** «Mis tareas abiertas»: las asignadas a `correo` que no estan en hecho. C-03 (v0.90.0): la insignia del rail (app.js) y la pantalla (tablero.js) cuentan con ESTA funcion, no con dos copias del filtro. */
/**
 * C-02 (v0.91.0): sella `AsignadoPor` en el cuerpo de un PATCH/POST que trae `Asignado`: quien asigna queda escrito en la
 * tarjeta (null al desasignar), y solo si la lista YA tiene la columna (`columnas` = nombres reales; null = no se sabe → no se manda,
 * como Color en v0.12.0: un campo que la lista no conoce es 400 en toda la edicion). Devuelve el mismo objeto.
 */
export function sellarAsignadoPor(campos, columnas, correo) {
    if (campos && 'Asignado' in campos && columnas && columnas.has('AsignadoPor')) campos.AsignadoPor = campos.Asignado ? String(correo || '').toLowerCase() : null;
    return campos;
}
export function misAbiertas(tareas, correo) {
    const yo = String(correo || '').toLowerCase();
    return (tareas || []).filter(t => String(t.Asignado || '').toLowerCase() === yo && t.Columna !== HECHO);
}
/** R-03 (v0.173.0): los atajos de «Posponer» de una vencida en Mis tareas (Todoist: «postpone them to tomorrow or later in the week»). */
export const ATAJOS_POSPONER = [['mañana', 1], ['el lunes', 'lunes'], ['+7 d', 7]];
/** El dia (YYYY-MM-DD, hora de Mexico) al que lleva un atajo: n dias desde hoy, o 'lunes' = el lunes SIGUIENTE (si hoy es lunes, el de la otra semana). */
export function diaPospuesto(atajo, hoy = new Date()) { const d = diaDe(hoy); return atajo === 'lunes' ? sumarDias(lunesDe(d), 7) : sumarDias(d, atajo); }
/** R-04 (v0.172.0): las mias HECHAS hoy (dia de HechoEl en hora de Mexico), la ultima arriba — el plegable al pie de Mis tareas. */
export function misHechasHoy(tareas, correo, hoy = new Date()) {
    const yo = String(correo || '').toLowerCase(), dia = diaDe(hoy);
    return (tareas || []).filter(t => String(t.Asignado || '').toLowerCase() === yo && t.Columna === HECHO && diaDe(t.HechoEl) === dia)
        .sort((a, b) => String(b.HechoEl).localeCompare(String(a.HechoEl)) || a.id - b.id);
}
/**
 * «Las que delegué» (Mis tareas): tarjetas ABIERTAS asignadas a otro que esta persona creo (createdBy de SharePoint o
 * el renglon crear-tarea de la bitacora) o asigno (editar-tarea «asignó …»). Quien reparte no las pierde de vista.
 * U-05 (v0.90.0): una tarjeta SIN asignar no es una delegacion (no se la di a nadie): queda fuera; su aviso es «sin dueño» en Inicio.
 * C-02 (v0.91.0): manda `AsignadoPor` (la tarjeta lo trae desde que existe la columna); createdBy y la bitacora quedan como respaldo
 * de las tarjetas anteriores, que siguen dependiendo de los CONFIG.actividadDias en memoria.
 */
export function delegadas(tareas, actividad, correo) {
    const yo = String(correo || '').toLowerCase();
    const tocadas = new Set((actividad || []).filter(a => a.TareaId && String(a.Quien || '').toLowerCase() === yo
        && (a.Accion === 'crear-tarea' || (a.Accion === 'editar-tarea' && /^asign/i.test(String(a.Title || ''))))).map(a => Number(a.TareaId)));
    return (tareas || []).filter(t => { const q = String(t.Asignado || '').trim().toLowerCase(); return t.Columna !== HECHO && q && q !== yo
        && (String(t.AsignadoPor || '').toLowerCase() === yo || String(t._creadoPor || '').toLowerCase() === yo || tocadas.has(Number(t.id))); })
        .sort(porVence);
}

/**
 * Vistos (✓) de un comentario: los renglones Accion=visto cuyo Title es el id del comentario, uno por persona
 * (se conserva el PRIMERO que aparece; estado.actividad viene Cuando desc, asi que es el mas nuevo). Del mas viejo al mas nuevo.
 */
export function vistosDe(actividad, comentarioId) {
    const k = String(comentarioId); const m = new Map();
    for (const a of actividad || []) if (a.Accion === 'visto' && String(a.Title || '') === k) { const q = String(a.Quien || '').toLowerCase(); if (!m.has(q)) m.set(q, a); }
    return [...m.values()].sort((x, y) => String(x.Cuando || '').localeCompare(String(y.Cuando || '')));
}

/**
 * La marca de lectura compartida (PROY_Roles.Visto, JSON por persona): `{ inicio: iso, chat: { <pid>: iso } }`.
 * Lee tolerante (celda vacia o rota = nada visto) y funde con lo que este dispositivo recuerde: gana la fecha mayor.
 */
export function leerVisto(celda) {
    let v = {}; try { v = JSON.parse(String(celda || '') || '{}'); } catch (_) { v = {}; }
    if (!v || typeof v !== 'object') v = {};
    // v1.0.0 (rediseño, cubeta 4): + `avisos` — hasta dónde vio la persona la campana (el contador cuenta lo posterior). Misma columna, misma regla.
    return { inicio: typeof v.inicio === 'string' ? v.inicio : '', chat: v.chat && typeof v.chat === 'object' ? { ...v.chat } : {}, avisos: typeof v.avisos === 'string' ? v.avisos : '' };
}
export function fundirVisto(a, b) {
    const x = leerVisto(a && typeof a === 'object' ? JSON.stringify(a) : a), y = leerVisto(b && typeof b === 'object' ? JSON.stringify(b) : b);
    const chat = { ...x.chat };
    for (const [k, iso] of Object.entries(y.chat)) if (String(iso) > String(chat[k] || '')) chat[k] = iso;
    const r = { inicio: x.inicio > y.inicio ? x.inicio : y.inicio, chat };
    const avisos = x.avisos > y.avisos ? x.avisos : y.avisos;
    if (avisos) r.avisos = avisos;   // sin marca de avisos la celda sale como antes (no se reescribe un renglón por una llave vacía)
    return r;
}

// ---------------------------------------------------------------- v0.21.0: Inicio «Hoy» (iteracion 3 del artifact del 13-sep)
// v0.71.0 (C-06, mejorar-app 16-sep): kpisEn y serieKpis (los KPI con tendencia de v0.21.0) salieron — sin llamador desde v0.41.0.

/**
 * Los grupos por FECHA de la cola «Hoy»: las tarjetas abiertas con vencimiento repartidas en `vencidas` (d < 0),
 * `hoy` (hoy o manana, d <= 1) y `semana` (2..`semana` dias), cada una en UN solo grupo y ordenadas de la mas urgente
 * a la menos (luego por titulo). Cada renglon es { tarea, dias }. Lo que vence mas alla de `semana` no entra: para eso
 * estan el tablero y el calendario.
 */
export function gruposHoy(tareas, hoy = new Date(), semana = 7) {
    const g = { vencidas: [], hoy: [], semana: [] };
    for (const x of proximos(tareas, Infinity, hoy)) {
        if (x.dias < 0) g.vencidas.push(x); else if (x.dias <= 1) g.hoy.push(x); else if (x.dias <= semana) g.semana.push(x);
    }
    return g;
}

/** «Buenos dias» hasta las 12, «Buenas tardes» hasta las 19, «Buenas noches» despues — por la hora de Mexico. */
export function saludoDe(hoy = new Date()) {
    const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }).format(hoy).replace(/\D/g, '')) % 24;
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

// ---------------------------------------------------------------- v0.22.0 (iteracion 4): hitos del roadmap global

/**
 * Los HITOS de un frente: sus tarjetas con fecha de vencimiento, que el roadmap global pinta como rombos
 * sobre la barra del frente. Un hito es una tarjeta con `Vence` (sin cambio de esquema) y su dia es el
 * Vence —la fecha del PLAN, no la de hecho: el rombo dice donde estaba el hito y el title cuando se hizo—.
 * La clase es la de semaforo() con la ventana del chip (`pronto`, 7): 'hecha' · 'vencida' · 'pronto' ·
 * '' (pendiente, rombo hueco). Ordenados por dia y luego por id.
 */
export function hitosDe(tareas, pronto = 7, hoy = new Date()) {
    return (tareas || []).filter(t => t.Vence && diaDe(t.Vence))
        .map(t => ({ tarea: t, dia: diaDe(t.Vence), clase: semaforo(t, pronto, hoy) }))
        .sort((a, b) => a.dia.localeCompare(b.dia) || Number(a.tarea.id) - Number(b.tarea.id));
}
const PESO_HITO = { vencida: 3, pronto: 2, '': 1, hecha: 0 };
/**
 * Acomoda los hitos sobre el eje: posicion en % (centro del dia) y AGRUPA los que caerian uno encima
 * del otro —un rombo a menos de `umbral` % del ANCLA del anterior (su primer miembro) se funde con el en
 * un grupo «+N» con la clase mas urgente (vencida > pronto > pendiente > hecha)—, para que nunca se
 * encimen. El grupo se DIBUJA en su primer miembro: un dia en que si vence algo, y a `umbral` o mas del
 * siguiente rombo (el revisor cazo que el promedio caia en dias vacios y el encadenado por el ultimo
 * miembro tragaba frentes enteros). El artifact decia «mas de ~8 se agrupan»; la causa real es la DISTANCIA, no la cuenta: ocho
 * hitos repartidos en tres meses caben, dos el mismo dia no. Los que caen fuera del rango no salen.
 * Devuelve [{ left, dia, hasta, clase, hitos: [...], espacio }] ordenados; `hitos.length > 1` es un grupo
 * y `espacio` es el % libre hasta el siguiente (o hasta `tope`, la raya del fin de frente o el 100;
 * `topado` dice que fue la raya la que recorto, para descontar ademas su fecha).
 */
export function acomodarHitos(hitos, rango, umbral = 2, tope = 100) {
    const pos = dia => (diasEntre(rango.desde, dia) + 0.5) * 100 / rango.dias;
    const out = [];
    for (const h of hitos) {
        const left = pos(h.dia);
        if (left < 0 || left > 100) continue;
        const ult = out[out.length - 1];
        if (ult && left - ult.left < umbral) {
            ult.hitos.push(h); ult.hasta = h.dia;
            if (PESO_HITO[h.clase] > PESO_HITO[ult.clase]) ult.clase = h.clase;
        } else out.push({ left, dia: h.dia, hasta: h.dia, clase: h.clase, hitos: [h] });
    }
    for (let i = 0; i < out.length; i++) {
        const sig = i + 1 < out.length ? out[i + 1].left : 100;
        const t = tope > out[i].left ? Math.min(tope, sig) : sig;
        out[i].espacio = Math.max(0, t - out[i].left); out[i].topado = t === tope && tope < sig;   // topado: lo que recorta es la raya del fin, no otro rombo
    }
    return out;
}

// ---------------------------------------------------------------- v0.100.0: capital de trabajo (PROY_Capital)
// Carlos, 25-sep: «cuánto capital de trabajo falta / es necesario», con partidas ESTIMADAS ligadas a un proyecto.
// Por proyecto: Necesario = Σ necesidades (todas, pagadas incluidas: es lo que cuesta el frente) · Cubierto = Σ fondeos ·
// Falta = max(0, Necesario − Cubierto) · Ya pagado = Σ necesidades en estado «pagado». Solo MXN (un solo total).
// El sobrante de un proyecto NO cubre a otro: el Falta global es la SUMA de los Falta por proyecto, no Necesario − Cubierto.
export const CAPITAL_TIPOS = [['necesidad', 'Necesidad'], ['fondeo', 'Fondeo']];
export const CAPITAL_CATEGORIAS = ['operación', 'mantenimiento', 'equipo', 'permisos', 'personal', 'logística', 'otros'];   // v0.103.0: «otros» (Carlos, 25-sep)
export const CAPITAL_ESTADOS = ['estimado', 'comprometido', 'pagado'];
export const MONTO_MAX = 1e12;
/** El monto de una partida (o un numero suelto) como numero; lo que no es numero cuenta 0. */
export function montoDe(x) { const n = Number(x !== null && typeof x === 'object' ? x.Monto : x); return Number.isFinite(n) ? n : 0; }
const centavos = n => Math.round(n * 100) / 100;
const FMT_MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «$10,000.00» (es-MX). */
export const formatoMXN = n => FMT_MXN.format(centavos(montoDe(n)));
/** Lo que se escribe en el campo Monto: acepta «10000», «10,000.50» y «$ 10,000»; null si no es un monto positivo con 2 decimales a lo mas. */
export function leerMonto(texto) {
    const s = String(texto ?? '').replace(/[$\s]/g, '').replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const n = Number(s);
    return n > 0 && n <= MONTO_MAX ? n : null;
}
/** Valida los campos de una partida antes de escribirla. Devuelve { ok, motivo }. */
export function validarPartida(c) {
    if (!String(c.Title || '').trim()) return { ok: false, motivo: 'La partida necesita un concepto.' };
    if (String(c.Title).length > TEXTO_MAX) return { ok: false, motivo: `El concepto pasa de ${TEXTO_MAX} caracteres.` };
    if (!(Number(c.ProyectoId) > 0)) return { ok: false, motivo: 'Elige el proyecto al que se liga la partida.' };
    if (!CAPITAL_TIPOS.some(([k]) => k === c.Tipo)) return { ok: false, motivo: 'Elige si es necesidad o fondeo.' };
    if (!(typeof c.Monto === 'number' && c.Monto > 0 && c.Monto <= MONTO_MAX)) return { ok: false, motivo: 'El monto debe ser un número mayor que cero, en pesos (hasta 2 decimales).' };
    if (!CAPITAL_ESTADOS.includes(c.Estado)) return { ok: false, motivo: 'Elige el estado de la partida.' };
    return { ok: true, motivo: '' };
}
/** Necesario · Cubierto · Falta · Sobra · Ya pagado · Comprometido · n de un conjunto de partidas (un proyecto). Un Tipo fuera del catalogo no suma. */
export function resumenCapital(partidas) {
    let necesario = 0, cubierto = 0, pagado = 0, comprometido = 0;   // R-04 (26-sep): comprometido = necesidades en estado «comprometido», como pagado
    for (const x of partidas || []) {
        if (x.Tipo === 'fondeo') cubierto += montoDe(x);
        else if (x.Tipo === 'necesidad') { necesario += montoDe(x); if (x.Estado === 'pagado') pagado += montoDe(x); else if (x.Estado === 'comprometido') comprometido += montoDe(x); }
    }
    necesario = centavos(necesario); cubierto = centavos(cubierto); pagado = centavos(pagado); comprometido = centavos(comprometido);
    return { necesario, cubierto, pagado, comprometido, falta: Math.max(0, centavos(necesario - cubierto)), sobra: Math.max(0, centavos(cubierto - necesario)), n: (partidas || []).length };
}
/** R-03 (26-sep): la partida cuya fecha ya paso (dia de Mexico) y sigue «estimado» o «comprometido»; las pagadas no. */
export function partidaVencida(x, hoy = new Date()) {
    const d = diaDe(x && x.Fecha);
    return !!d && (x.Estado === 'estimado' || x.Estado === 'comprometido') && d < diaDe(hoy);
}
/** Las partidas agrupadas por proyecto, cada grupo con su resumen; primero el que mas falta, luego por nombre. `proyecto` es null si ya no existe. */
export function capitalPorProyecto(partidas, proyectos) {
    const grupos = new Map();
    for (const x of partidas || []) { const id = Number(x.ProyectoId) || 0; if (!grupos.has(id)) grupos.set(id, []); grupos.get(id).push(x); }
    const nombre = g => g.proyecto ? String(g.proyecto.Title || '') : '￿';
    return [...grupos].map(([id, ps]) => ({ proyectoId: id, proyecto: (proyectos || []).find(p => Number(p.id) === id) || null, partidas: ps, ...resumenCapital(ps) }))
        .sort((a, b) => b.falta - a.falta || nombre(a).localeCompare(nombre(b), 'es') || a.proyectoId - b.proyectoId);
}
/** Totales de la vista: sumas de los grupos de capitalPorProyecto (el Falta global = Σ Falta por proyecto). */
export function totalCapital(grupos) {
    const t = { necesario: 0, cubierto: 0, pagado: 0, comprometido: 0, falta: 0, n: 0 };
    for (const g of grupos || []) for (const k in t) t[k] += g[k];
    for (const k of ['necesario', 'cubierto', 'pagado', 'comprometido', 'falta']) t[k] = centavos(t[k]);
    return t;
}
/**
 * Corte por mes segun Fecha (dia de Mexico): [{ mes: 'YYYY-MM' | '' (sin fecha, al final), necesidad, fondeo, n, faltaAcumulada }]
 * en orden de mes. R-01 (26-sep): faltaAcumulada = corrido de necesidad − fondeo hasta ese mes, llevado POR PROYECTO y sumando
 * solo lo que falta (la misma regla que totalCapital: la sobra de un frente no cubre a otro). Asi el ultimo renglon cuadra
 * siempre con la Falta del resumen, tambien cuando un frente tiene fondeo de sobra.
 */
export function capitalPorMes(partidas) {
    const m = new Map();
    for (const x of partidas || []) {
        if (x.Tipo !== 'necesidad' && x.Tipo !== 'fondeo') continue;
        const d = diaDe(x.Fecha), k = d ? d.slice(0, 7) : '';
        const g = m.get(k) || { mes: k, necesidad: 0, fondeo: 0, n: 0, porProyecto: new Map() };
        const pid = Number(x.ProyectoId) || 0, signo = x.Tipo === 'fondeo' ? -1 : 1;
        if (x.Tipo === 'fondeo') g.fondeo += montoDe(x); else g.necesidad += montoDe(x);
        g.porProyecto.set(pid, (g.porProyecto.get(pid) || 0) + signo * montoDe(x));
        g.n++; m.set(k, g);
    }
    const corrido = new Map();
    return [...m.values()].sort((a, b) => (a.mes || '9999-99').localeCompare(b.mes || '9999-99')).map(({ porProyecto, ...g }) => {
        for (const [pid, v] of porProyecto) corrido.set(pid, (corrido.get(pid) || 0) + v);
        let falta = 0; for (const v of corrido.values()) falta += Math.max(0, centavos(v));
        return { ...g, necesidad: centavos(g.necesidad), fondeo: centavos(g.fondeo), faltaAcumulada: centavos(falta) };
    });
}
/** Orden de la tabla de partidas (dentro de cada proyecto). `dir` 1 asc, -1 desc; la partida sin fecha va al final en los dos sentidos. */
export const COLUMNAS_CAPITAL = ['concepto', 'tipo', 'categoria', 'fecha', 'estado', 'monto'];
export function ordenarPartidas(partidas, col = 'fecha', dir = 1) {
    const llaves = { concepto: x => sinAcentos(x.Title), tipo: x => String(x.Tipo || ''), categoria: x => sinAcentos(x.Categoria), fecha: x => diaDe(x.Fecha) || '', estado: x => CAPITAL_ESTADOS.indexOf(x.Estado), monto: x => montoDe(x) };
    const llave = llaves[col] || llaves.fecha;
    return [...(partidas || [])].sort((a, b) => {
        const va = llave(a), vb = llave(b);
        if ((col === 'fecha' || !llaves[col]) && !va !== !vb) return va ? -1 : 1;
        const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
        return c * dir || Number(a.id) - Number(b.id);
    });
}

// ---------------------------------------------------------------- armazón (v1.0.0, rediseño 2026-10-02)
// Plan cerebro/docs/plan-erp-rediseno-2026-10-02.md, cubeta 1: 5 módulos en el rail, panel por módulo y la tabla ruta → módulo.
// Las rutas de hoy siguen siendo canónicas; se agregan sufijos que, mientras su página no exista, caen a la pantalla de hoy.

/** Los 5 módulos del rail, en su orden (decisión 1 del plan). */
export const MODULOS = [
    { clave: 'inicio', nombre: 'Inicio' },
    { clave: 'trabajo', nombre: 'Trabajo' },
    { clave: 'archivos', nombre: 'Archivos' },
    { clave: 'dinero', nombre: 'Dinero' },
    { clave: 'operacion', nombre: 'Operación' }
];
/** La tabla ruta → módulo: cada pantalla dice qué módulo se resalta. `cuenta` no es módulo: la resalta el botón de persona del rail. */
export const MODULO_DE = { inicio: 'inicio', mis: 'inicio', mensajes: 'inicio', proyectos: 'trabajo', proyecto: 'trabajo', roadmap: 'trabajo', calendario: 'trabajo', reportes: 'trabajo', archivos: 'archivos', finanzas: 'dinero', gastos: 'dinero', capital: 'dinero', servicios: 'operacion', compras: 'operacion', vigencias: 'operacion', cuenta: 'cuenta' };
/** Quién entra a cada pantalla (la regla que irA aplicaba a mano desde v0.100.0/v0.168.0): Capital, Finanzas y Vigencias solo gerencia; Servicios y Compras gerencia y colaborador. */
export function puedeVerPantalla(pantalla, rol) {
    if (pantalla === 'capital' || pantalla === 'finanzas' || pantalla === 'vigencias') return PUEDE.capital(rol);
    if (pantalla === 'servicios' || pantalla === 'compras') return PUEDE.tarea(rol);
    return Object.prototype.hasOwnProperty.call(MODULO_DE, pantalla);
}
/** Los módulos que pinta el rail: 5 a gerencia y a colaborador, 4 a lectura (Operación no le trae nada). */
export function modulosDe(rol) { return MODULOS.filter(m => m.clave !== 'operacion' || PUEDE.tarea(rol)); }
/** La pantalla principal de un módulo (lo que abre tocarlo en el celular): Dinero es Por cobrar para gerencia y Mis gastos para los demás. */
export function principalDe(modulo, rol) {
    const r = { inicio: '#inicio', trabajo: '#proyectos', archivos: '#archivos', dinero: PUEDE.capital(rol) ? '#finanzas/cobrar/saldo' : '#gastos', operacion: '#servicios', cuenta: '#cuenta' }[modulo];
    return r || '#inicio';
}
const PANTALLAS_HASH = ['inicio', 'proyectos', 'mis', 'roadmap', 'calendario', 'mensajes', 'archivos', 'reportes', 'capital', 'gastos', 'finanzas', 'vigencias', 'servicios', 'compras', 'cuenta'];
const TABS_PROYECTO = ['lista', 'docs', 'chat', 'tablero', 'resumen', 'roadmap', 'capital'];
/** Los sufijos NUEVOS por pantalla (plan, «Rutas»). Lo que no casa aquí no es ruta de la app y cae a Inicio, como antes. */
const SUFIJOS = {
    finanzas: s => /^(cobrar|pagar)(\/[a-z0-9-]+)?$/.test(s),
    capital: s => s === 'mes',
    reportes: s => /^[a-z0-9-]+$/.test(s),
    servicios: s => s === 'ciclo' || /^e\d+$/i.test(s),
    compras: s => s === 'partidas',
    archivos: s => /^(recientes|fijados|proyecto|bibliotecas|mias)(\/[A-Za-z0-9._~%!'()*-]+)*$/.test(s),   // v1.0.0 (cubeta 5): las carpetas de una biblioteca van con encodeURIComponent (espacios, paréntesis, acentos)
    cuenta: s => s === 'equipo'
};
/**
 * Lee un hash de la app. Devuelve null si no es ruta de la app; si lo es: { pantalla, modulo, clave, tab, sub, msj, subGastos, tareaId }.
 * Conserva la gramatica de RE_HASH (v0.162.0) —#p/<clave>[/<pestaña>], /f|d/<x> y /tesoreria|contabilidad en cualquier pantalla, /t/<id>
 * al final de todo— y suma los sufijos de SUFIJOS en `sub` (el de servicios va en mayusculas: «E3»).
 */
export function leerRuta(hash) {
    const h = String(hash || '');
    if (!/^#[^#]/.test(h)) return null;
    const segs = h.slice(1).split('/');
    let tareaId = null;
    if (segs.length >= 3 && segs[segs.length - 2] === 't' && /^\d+$/.test(segs[segs.length - 1])) { tareaId = Number(segs.pop()); segs.pop(); }
    const base = { clave: null, tab: null, sub: null, msj: null, subGastos: null, tareaId };
    if (segs[0] === 'p') {
        if (segs.length < 2 || segs.length > 3 || !/^[a-z0-9-]+$/.test(segs[1])) return null;
        if (segs.length === 3 && !TABS_PROYECTO.includes(segs[2])) return null;
        return { ...base, pantalla: 'proyecto', modulo: 'trabajo', clave: segs[1], tab: segs[2] || null };
    }
    const [pantalla, ...resto] = segs;
    if (!PANTALLAS_HASH.includes(pantalla)) return null;
    const r = { ...base, pantalla, modulo: MODULO_DE[pantalla] };
    if (!resto.length) return r;
    if (resto.length === 2 && (resto[0] === 'f' || resto[0] === 'd') && /^[a-z0-9._-]+$/.test(resto[1])) { r.msj = { tipo: resto[0], clave: resto[1] }; return r; }
    if (resto.length === 1 && (resto[0] === 'tesoreria' || resto[0] === 'contabilidad')) { r.subGastos = resto[0]; return r; }
    const s = resto.join('/');
    if (!SUFIJOS[pantalla] || !SUFIJOS[pantalla](s)) return null;
    r.sub = pantalla === 'servicios' && s !== 'ciclo' ? s.toUpperCase() : s;
    return r;
}
/** La entrada del panel que corresponde al hash: la ruta mas larga que es prefijo (por segmentos) del hash sin /t/<id>; null si ninguna. */
export function rutaActiva(rutas, hash) {
    const h = String(hash || '').replace(/\/t\/\d+$/, '');
    let mejor = null;
    for (const r of rutas || []) if (r && (h === r || h.startsWith(r + '/')) && (!mejor || r.length > mejor.length)) mejor = r;
    return mejor;
}
/** Anillo «Mi día» del rail: de lo que me toca HOY (mis abiertas que vencen hoy o ya vencieron, más las que hice hoy), cuántas hice. */
export function miDia(tareas, correo, hoy = new Date()) {
    const hechas = misHechasHoy(tareas, correo, hoy).length;
    const deHoy = misAbiertas(tareas, correo).filter(t => { const d = diasPara(t.Vence, hoy); return d !== null && d <= 0; }).length;
    return { hechas, total: hechas + deHoy };
}

// ---------------------------------------------------------------- v1.0.0 (rediseño, cubeta 4): buscador global, frentes quietos, avisos
// Plan, «Buscador global»: índice LOCAL normalizado sin acentos (sin dependencia nueva) + la búsqueda por nombre en cada biblioteca con permiso.

/** Los grupos del buscador global, en su orden (plan). */
export const GRUPOS_BUSQUEDA = ['Pantallas y reportes', 'Proyectos', 'Tareas', 'Archivos', 'Personas', 'Órdenes', 'Expedientes', 'Vigencias'];
/** Para comparar: minúsculas, sin acentos, los signos sueltos como espacio y un solo espacio. Conserva lo que arma un folio, una clave o un
 *  correo (`PDH-008`, `lau-demo`, `ana@x.com`): «Órdenes  de compra» → «ordenes de compra». */
export const normalizarBusqueda = s => sinAcentos(s).replace(/[^a-z0-9@._#/-]+/g, ' ').replace(/\s+/g, ' ').trim();
/** El índice: cada entrada { grupo, texto, sub, ir | url, extra, orden } con `pajar` (texto + sub + extra) y `cabeza` (el texto) ya normalizados.
 *  Una entrada sin texto o de un grupo que no existe no entra. */
export function indiceBusqueda(entradas) {
    return (entradas || []).filter(e => e && e.texto && GRUPOS_BUSQUEDA.includes(e.grupo))
        .map(e => ({ ...e, pajar: normalizarBusqueda([e.texto, e.sub, ...[].concat(e.extra || [])].join(' ')), cabeza: normalizarBusqueda(e.texto) }));
}
/**
 * Busca `q` en el índice: TODAS sus palabras deben aparecer en el pajar, en cualquier orden. Dentro de cada grupo: primero el título que
 * EMPIEZA con q, luego el que tiene una palabra que empieza con la primera de q, luego el resto; a igualdad, `orden` (menor primero: lo
 * abierto antes que lo hecho), el título más corto y el alfabético. Devuelve [{ grupo, items, mas }] en el orden de GRUPOS_BUSQUEDA.
 */
export function buscarEnIndice(indice, q, tope = 6) {
    const s = normalizarBusqueda(q); if (!s) return [];
    const pal = s.split(' ');
    const puntos = e => e.cabeza.startsWith(s) ? 0 : e.cabeza.split(' ').some(w => w.startsWith(pal[0])) ? 1 : 2;
    const hay = (indice || []).filter(e => pal.every(w => e.pajar.includes(w)));
    return GRUPOS_BUSQUEDA.map(grupo => {
        const xs = hay.filter(e => e.grupo === grupo).map(e => ({ e, p: puntos(e) }))
            .sort((a, b) => a.p - b.p || (a.e.orden || 0) - (b.e.orden || 0) || a.e.cabeza.length - b.e.cabeza.length || a.e.cabeza.localeCompare(b.e.cabeza)).map(x => x.e);
        return { grupo, items: xs.slice(0, tope), mas: Math.max(0, xs.length - tope) };
    }).filter(g => g.items.length);
}
/**
 * Frentes sin movimiento (Inicio «Requiere atención» y Preguntar): los ACTIVOS cuyo último movimiento —lo más reciente de su bitácora
 * PROY_Actividad sin los ✓ «visto», o su alta si no hay nada— tiene `dias` días o más. [{ proyecto, dias }] del más quieto al menos;
 * `dias` null = ni bitácora en la ventana leída ni fecha de alta (también es «no se mueve»).
 */
export function frentesQuietos(proyectos, actividad, dias = 10, ahora = new Date()) {
    const ult = new Map();
    for (const a of actividad || []) {
        if (a.Accion === 'visto') continue;
        const k = Number(a.ProyectoId), c = String(a.Cuando || '');
        if (k && c > (ult.get(k) || '')) ult.set(k, c);
    }
    const out = [];
    for (const p of proyectos || []) {
        if (p.Estado !== 'activo') continue;
        const ref = ult.get(Number(p.id)) || String(p._creado || ''), t = ref ? Date.parse(ref) : NaN;
        const d = Number.isNaN(t) ? null : Math.max(0, Math.floor((ahora.getTime() - t) / 86400000));
        if (d === null || d >= dias) out.push({ proyecto: p, dias: d });
    }
    return out.sort((a, b) => (b.dias ?? 1e9) - (a.dias ?? 1e9) || String(a.proyecto.Title || '').localeCompare(String(b.proyecto.Title || ''), 'es'));
}
/** Avisos (la campana): cuántos son POSTERIORES a la marca de visto (PROY_Roles.Visto.avisos). Uno sin `cuando` no cuenta como nuevo. */
export const avisosNoVistos = (items, marca) => (items || []).filter(x => x && x.cuando && String(x.cuando) > String(marca || '')).length;
