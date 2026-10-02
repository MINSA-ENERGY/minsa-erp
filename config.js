// Configuracion de MINSA ERP (antes MINSA Proyectos; proyectos multiusuario del holding).
//
// TODO ESTO ES PUBLICO POR DISENO (misma regla que calytek-planta-app): en una app de pagina
// unica el client id y el tenant id no son secretos; lo que impide que alguien monte una
// pagina falsa con este client id es la lista de URL de redireccion registradas en Entra.
// NUNCA agregar aqui un client secret: esta app no lleva ninguno.

export const CONFIG = {
    // App registration "MINSA Proyectos" — la crea Carlos (docs/setup-carlos.md, tarea 1) y
    // pega aqui el Application (client) ID. Mientras diga PENDIENTE la app no puede entrar.
    clientId: '6bc9c04a-9908-4195-a35e-40c06518edf3',
    tenantId: 'c28754af-c62e-44db-a72a-3eeab634074b',

    // Sites.Selected: el token NO alcanza nada por si mismo. El acceso lo da la autorizacion
    // de la app sobre cada sitio (docs/otorgar-permiso-sitio.ps1), y encima aplican los
    // permisos de la persona en ese sitio.
    scopes: ['https://graph.microsoft.com/Sites.Selected'],

    graph: 'https://graph.microsoft.com/v1.0',
    sharepointHost: 'minsaenergy.sharepoint.com',

    // Donde viven las listas PROY_*: el sitio transversal del holding. Ruta VERIFICADA contra
    // el tenant el 2026-08-16 (ahi vivio CAT_Evidencia_MINSA de la app de captura). Nunca
    // deducirla del nombre de la biblioteca.
    sitio: '/sites/Administracion',

    // Prefijo comun de las listas (esquema.json). Cambiarlo obliga a re-provisionar.
    listas: {
        proyectos: 'PROY_Proyectos',
        tareas: 'PROY_Tareas',
        ligas: 'PROY_Ligas',
        roles: 'PROY_Roles',
        actividad: 'PROY_Actividad',
        capital: 'PROY_Capital',   // v0.100.0: capital de trabajo (solo gerencia); puede no existir todavia — la app lo tolera
        // v0.162.0: Gastos (traido de la ERP v1). Ya existen en /sites/Administracion (las creo Carlos el 1-oct, con datos reales);
        // si faltaran, #gastos lo dice y lo demas sigue igual.
        gastos: 'ERP_Gastos',
        rolesErp: 'ERP_Roles'
    },
    // v0.162.0: biblioteca de los comprobantes de gastos, en el MISMO sitio (Administracion), una carpeta por AAAA-MM.
    bibliotecaGastos: 'Gastos',

    // Las cubetas (columnas) del tablero YA NO viven aqui: desde v0.11.0 (Carlos, 12-sep) cada proyecto
    // trae las suyas en PROY_Proyectos.Columnas y el default es COLUMNAS_DEFAULT de reglas.js.

    // Equipos = unidades del holding (etiqueta y filtro, nunca permiso). `unidad` es la clave de
    // la biblioteca donde Docs busca y sube; sin `unidad`, Docs solo muestra ligas ya guardadas.
    // Las rutas de sitio estan VERIFICADAS contra el tenant (minsa-captura-app/app/config.js,
    // 2026-08-16); Finanzas es 'Administracion-Documentos' en la URL aunque OneDrive la
    // muestre como 'Administracion-Finanzas' — no es un error de dedo.
    // PILOTO (2026-09-11): Sites.Selected write sobre Administracion y Ambiental-CALYTEK; el
    // 2026-09-15 (OK de Carlos) se suman Quimicos-PITEPEC y Quimicos-RABASA. Las demas quedan
    // declaradas pero contestan 403 hasta que se autoricen (docs/otorgar-permiso-sitio-dispositivo.ps1);
    // la app lo dice en pantalla nombrando el sitio. `piloto` aqui debe ir de la mano del script.
    // v0.7.0 (2026-09-12): el equipo se reconoce por ICONO + COLOR, nunca por su nombre escrito (Carlos,
    // 12-sep). `icono` son los trazos del SVG del rail del Tablero de escritorio (minsa-tablero-app/index.html:
    // hoja CALYTEK, matraz PITEPEC, gota RABASA); los tres que el tablero no tiene son propuesta aceptada en
    // el artifact c52cb229: etiqueta de precio (Ventas Quimicos), paquete (Ventas Ambiental), edificio
    // (Administracion). `color` es una variable de la paleta (estilo.css) para que siga al tema; `rama`
    // agrupa el rail (organizacion.md: Ambiental · Quimicos · Administracion).
    equipos: [
        { clave: 'CALYTEK', nombre: 'CALYTEK', unidad: 'CALYTEK', rama: 'Ambiental', color: 'var(--eq-calytek)',
          icono: ['M20 4c-8 0-14 5-14 12 0 1.5.3 2.8.8 4', 'M4 21c4-8 8-11 15-14', 'M6 16c5 1 9-1 12-5'] },
        { clave: 'Ventas Ambiental', nombre: 'Ventas Ambiental', unidad: null, rama: 'Ambiental', color: 'var(--eq-ventas-ambiental)',
          icono: ['M21 8l-9-5-9 5v8l9 5 9-5z', 'M3 8l9 5 9-5', 'M12 13v8'] },
        { clave: 'PITEPEC', nombre: 'PITEPEC', unidad: 'PITEPEC', rama: 'Químicos', color: 'var(--eq-pitepec)',
          icono: ['M9 3h6', 'M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3', 'M7.5 15h9'] },
        { clave: 'RABASA', nombre: 'RABASA', unidad: 'RABASA', rama: 'Químicos', color: 'var(--eq-rabasa)',
          icono: ['M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z'] },
        { clave: 'Ventas Quimicos', nombre: 'Ventas Químicos', unidad: null, rama: 'Químicos', color: 'var(--eq-ventas-quimicos)',
          icono: ['M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z', 'M7.5 7.5h.01'] },
        { clave: 'Administracion', nombre: 'Administración', unidad: 'LEGAL', rama: 'Administración', color: 'var(--eq-administracion)',
          icono: ['M4 3h16v18H4z', 'M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2', 'M10 21v-3h4v3'] }
    ],
    ramas: ['Ambiental', 'Químicos', 'Administración'],
    bibliotecas: {
        // `destinoLotes`: a donde PROPONE el _lote.json que vaya lo subido si el proyecto no declara
        // su Carpeta. Zonas que existen hoy en cada biblioteca (archivar-*/taxonomia); la skill valida.
        CALYTEK: { nombre: 'Ambiental-CALYTEK', sitio: '/sites/Ambiental-CALYTEK', piloto: true, destinoLotes: '08_Otros-Varios' },
        PITEPEC: { nombre: 'Quimicos-PITEPEC', sitio: '/sites/Quimicos-PITEPEC', piloto: true, destinoLotes: '01_Servicios' },
        RABASA: { nombre: 'Quimicos-RABASA', sitio: '/sites/Quimicos-RABASA', piloto: true, destinoLotes: '10_Interno' },
        LEGAL: { nombre: 'Administracion-Legal', sitio: '/sites/Administracion-Legal', piloto: false, destinoLotes: '05_Contratos' },
        FINANZAS: { nombre: 'Administracion-Finanzas', sitio: '/sites/Administracion-Documentos', piloto: false, destinoLotes: '06_Soporte-Fiscal' }
    },

    // Donde deja lo que se sube desde Docs: el buzon de la biblioteca de la unidad, en una
    // carpeta por lote con `_lote.json` al final (contrato 1, lote.js). La skill de archivar de
    // esa unidad lo acomoda despues. Nada se escribe fuera del buzon.
    buzon: '99_Pendiente-Archivar',
    etiquetaLote: 'Proyecto',

    // Una tarjeta en «en-curso» sin movimiento estos dias se senala en Inicio. Solo informa.
    sinMovimientoDias: 10,
    // Ventana de «vence pronto» en Inicio y en Mis tareas.
    vencePronto: 7,
    // v0.20.0: el filete izquierdo de la tarjeta se pone ambar si vence hoy o en estos dias (rojo si ya vencio).
    semaforoDias: 3,
    // R-01 (v0.158.0): en el mes en curso la agenda del celular corre de hoy a hoy + estos dias, de corrido aunque cambie el mes.
    // 31 y no 30: desde el dia 1 de un mes de 31 dias, el 1 del mes siguiente siempre entra.
    calAgendaDias: 31,
    // «Te mencionaron» en Inicio: comentarios del chat que nombran a la persona en estos ultimos dias (v0.8.0). No hay
    // «leido»: la lista se vacia sola con el tiempo.
    mencionesDias: 14,
    // Cada cuanto se releen las listas mientras la app esta a la vista (ms). 0 = solo con Actualizar.
    refrescoMs: 120000,
    // v0.13.1 (auditoria de rendimiento): PROY_Actividad crece un renglon por cada accion y nunca se poda; se lee
    // ENTERA solo lo de estos ultimos dias (columna Cuando, indexada). El proyecto abierto se completa aparte
    // (todo su historial, por ProyectoId) para que el chat y las notas no pierdan nada. 0 = leer toda la lista.
    actividadDias: 90,
    // Cuanto dura el toast de un aviso ok/info (ms); el error se queda hasta cerrarlo.
    avisoMs: 4000
};
