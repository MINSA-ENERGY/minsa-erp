// Cliente de Microsoft Graph para listas y documentos — copia literal de calytek-planta-app/app/graph.js
// (2026-09-11) mas los metodos de Docs: `buscarEnDrive`, `itemDeDrive`, `existeRuta` y `sitioOpcional`,
// y desde v0.108.0 `itemPorRuta` y `leerJson` (el recibo que deja la skill de archivar).
//
// Todo pasa por conReintento: en un celular, un fallo de red o un 429 es el caso normal. Lo que
// NO se reintenta es un 403 o un 404: esos no mejoran repitiendo.

const REINTENTOS = 4;
const dormir = ms => new Promise(res => setTimeout(res, ms));

function valeReintentar(estado) {
    return estado === 429 || estado === 503 || estado === 504 || estado === 0;
}

export async function conReintento(hacer, alAvisar) {
    let espera = 800;
    for (let intento = 1; intento <= REINTENTOS; intento++) {
        let r;
        try {
            r = await hacer();
        } catch (e) {
            // v1.0.0 (vuelta 1): un fetch que no llegó tras los reintentos (TypeError: «Failed to fetch» / «Load failed») se MARCA sin red; quien
            // llama clasifica por esSinRed, no por cualquier TypeError (un error de pintado no es la red)
            if (intento === REINTENTOS) { if (e instanceof TypeError && e.status === undefined) e.sinRed = true; throw e; }
            if (alAvisar) alAvisar(`sin conexión, reintentando (${intento}/${REINTENTOS - 1})`);
            await dormir(espera); espera *= 2;
            continue;
        }
        if (r.ok) return r;
        if (!valeReintentar(r.status) || intento === REINTENTOS) return r;
        const dice = Number(r.headers.get('Retry-After'));
        const cuanto = Number.isFinite(dice) && dice > 0 ? dice * 1000 : espera;
        if (alAvisar) alAvisar(`el servidor pidió esperar, reintentando (${intento}/${REINTENTOS - 1})`);
        await dormir(cuanto);
        espera *= 2;
    }
    throw new Error('se agotaron los reintentos');
}

/** Mensaje util a partir de una respuesta fallida. No nombra la operacion: la pone quien llama. */
export async function motivo(r) {
    let detalle = '';
    try {
        const j = await r.json();
        detalle = j?.error?.message || j?.error?.code || '';
    } catch (_) { /* no era JSON */ }
    if (r.status === 403) return `sin permiso (403). ${detalle}`;
    if (r.status === 404) return `no existe (404). ${detalle}`;
    if (r.status === 401) return 'la sesión caducó (401). Vuelve a entrar.';
    return `HTTP ${r.status}. ${detalle}`;
}

/** Carpeta de un driveItem, relativa a la raiz: `parentReference.path` viene como '/drive/root:/01_Empresa/Sub'. '' si Graph no la mando. */
function carpetaDe(it) {
    const p = String((it && it.parentReference && it.parentReference.path) || '');
    const i = p.indexOf('root:');
    return i >= 0 ? decodeURIComponent(p.slice(i + 5)).replace(/^\//, '') : '';
}

/**
 * Codifica una ruta para Graph SIN destruir las diagonales. S-20 (v0.139.0): un segmento «.» o «..» revienta
 * (la regla de validarRecibo, lote.js): encodeURIComponent los deja literales y Graph los resuelve, asi que una Ruta
 * editada en PROY_Ligas sacaba la consulta de drive/root hacia cualquier endpoint, con el token de quien abre Docs.
 */
/** S-35 (2-oct): el id de un driveItem que viene de un renglon (ComprobanteItemId, escribible por cualquier Miembro) se valida antes de
 *  armar la URL: solo alfanumericos, «!», «_» y «-». Un «..» o una «/» sacarian la peticion de /items/ (la clase de S-20 en rutaUrl). */
export function idItemUrl(id) {
    const s = String(id ?? '');
    if (!/^[A-Za-z0-9!_-]+$/.test(s)) throw new Error(`id de archivo invalido: ${s}`);
    return encodeURIComponent(s);
}

export function rutaUrl(ruta) {
    const partes = String(ruta).split('/').filter(s => s !== '');
    if (partes.some(s => s === '.' || s === '..')) throw new Error(`ruta invalida: ${ruta}`);
    return partes.map(encodeURIComponent).join('/');
}

/**
 * Convierte un item de Graph (con .fields) en un objeto plano con `id` numerico.
 * Las columnas se leen por su nombre INTERNO (esquema.json).
 */
export function aplanar(item) {
    const f = item && item.fields ? item.fields : (item || {});
    const etag = item && (item.eTag || item['@odata.etag']);
    // `_etag` (v0.3.0, T1): la version del renglon al leerlo; actualizarRenglon lo manda como If-Match.
    // `_creado*` / `_modificado` (v0.4.0, U12/T3): lo que SharePoint sabe y la app no pedia.
    const quien = u => (u && u.user && (u.user.email || u.user.displayName)) || undefined;
    return {
        ...f, id: Number(item.id ?? f.id), ...(etag ? { _etag: String(etag) } : {}),
        _creado: item && item.createdDateTime || undefined, _creadoPor: quien(item && item.createdBy),
        _modificado: item && item.lastModifiedDateTime || undefined
    };
}

/** Error con `status` (412 = alguien cambio el renglon; 0 = sin red) para que quien llama distinga. */
function errorHttp(mensaje, status) { const e = new Error(mensaje); e.status = status; return e; }
export const esConflicto = e => !!e && e.status === 412;
export const esSinRed = e => !!e && e.sinRed === true;

/**
 * `token` es una cadena o una FUNCION async que devuelve la cadena vigente (v0.13.1, auditoria de seguridad):
 * con la funcion, cada peticion lleva el token que MSAL tiene en ese momento —renovado en silencio— en
 * vez del que se leyo al crear el cliente, que a la hora ya caduco y solo se renovaba con «Actualizar».
 */
export function crearCliente(graph, token) {
    const tokenActual = typeof token === 'function' ? token : async () => token;
    const json = { 'Content-Type': 'application/json' };
    const listasPorNombre = new Map();
    const urlPorNombre = new Map();   // webUrl de cada lista (F13: «Ver en SharePoint»)
    let cargandoListas = null;   // C-01 (v0.87.0): la promesa de listas() en vuelo; 5 renglones() en paralelo hacian 5 GET /lists
    let listasLeidas = false;    // v1.0.0 (cubeta 5): ya hubo un GET /lists completo (listaConocida)
    // Si Graph rechazara la cabecera If-Match con 400 (no se pudo medir contra el tenant desde el
    // harness), se reintenta sin ella y se deja de mandar en esta sesion: la app sigue escribiendo.
    let ifMatchSirve = true;

    async function pedir(url, opciones = {}, avisar) {
        // T2 (v0.3.0): sin red, una escritura falla YA con un mensaje claro, sin 4 reintentos a ciegas.
        if (typeof navigator !== 'undefined' && navigator.onLine === false && (opciones.method || 'GET') !== 'GET') {
            const e = errorHttp('sin conexión: puedes ver, no guardar. Vuelve a intentarlo cuando regrese la red.', 0); e.sinRed = true; throw e;
        }
        return conReintento(async () => fetch(url, {
            ...opciones,
            headers: { Authorization: 'Bearer ' + await tokenActual(), ...(opciones.headers || {}) }
        }), avisar);
    }

    return {
        async sitio(host, ruta) {
            const r = await pedir(`${graph}/sites/${host}:${ruta}`);
            if (!r.ok) throw new Error(`no se pudo abrir el sitio ${ruta}: ` + await motivo(r));
            return (await r.json()).id;
        },

        /** Lista los nombres de listas del sitio (para provisionar y para resolver ids). */
        async listas(siteId) {
            const r = await pedir(`${graph}/sites/${siteId}/lists?$select=id,name,displayName,webUrl&$top=200`);
            if (!r.ok) throw new Error('no se pudieron ver las listas del sitio: ' + await motivo(r));
            const v = (await r.json()).value;
            // v1.0.0 (cubeta 5): la lista de listas se REARMA en cada lectura (antes solo sumaba): una biblioteca que ya no está deja de «existir»
            // para listaConocida/existeLista en vez de quedarse conocida toda la sesión. Lo de antes de este GET no se mezcla con lo de ahora.
            listasPorNombre.clear(); urlPorNombre.clear();
            for (const l of v) { listasPorNombre.set(l.displayName, l.id); listasPorNombre.set(l.name, l.id); if (l.webUrl) { urlPorNombre.set(l.displayName, l.webUrl); urlPorNombre.set(l.name, l.webUrl); } }
            listasLeidas = true;
            return v;
        },

        /** La URL web de una lista ya vista por `listas()` (o null): es lo que abre Microsoft Lists, con su vista Tablero. */
        urlDeLista(nombre) { return urlPorNombre.get(nombre) || null; },

        /** v1.0.0 (cubeta 5): ¿la lista (o biblioteca) está en lo que YA se leyó de GET /lists? Sin pedir nada: null si aún no se ha leído.
         *  existeLista vuelve a pedir la lista de listas cada vez que el nombre no está; para una biblioteca que FALTA, eso era un GET /lists
         *  por consulta (lo cazó la prueba C-01). */
        listaConocida(nombre) { return listasLeidas ? listasPorNombre.has(nombre) : null; },

        async idDeLista(siteId, nombre) {
            if (!listasPorNombre.has(nombre)) {
                if (!cargandoListas) cargandoListas = this.listas(siteId).finally(() => { cargandoListas = null; });
                await cargandoListas;
            }
            const id = listasPorNombre.get(nombre);
            if (!id) throw new Error(`no existe la lista ${nombre} en el sitio: hay que provisionarla (herramientas-dev/provisionar.html)`);
            return id;
        },

        /** Columnas reales de una lista (nombre interno + tipo), para cotejar contra esquema.json. */
        async columnas(siteId, listaId) {
            const r = await pedir(`${graph}/sites/${siteId}/lists/${listaId}/columns?$top=200`);
            if (!r.ok) throw new Error('no se pudieron leer las columnas: ' + await motivo(r));
            return (await r.json()).value;
        },

        async crearLista(siteId, cuerpo) {
            const r = await pedir(`${graph}/sites/${siteId}/lists`, {
                method: 'POST', headers: json, body: JSON.stringify(cuerpo)
            });
            if (!r.ok) throw new Error(`no se pudo crear la lista ${cuerpo.displayName}: ` + await motivo(r));
            return await r.json();
        },

        async agregarColumna(siteId, listaId, columna) {
            const r = await pedir(`${graph}/sites/${siteId}/lists/${listaId}/columns`, {
                method: 'POST', headers: json, body: JSON.stringify(columna)
            });
            if (!r.ok) throw new Error(`no se pudo crear la columna ${columna.name}: ` + await motivo(r));
            return await r.json();
        },

        /**
         * Todos los renglones de una lista, aplanados. $top=500 y sigue @odata.nextLink: a
         * 8 gondolas/dia son ~2,000 embarques/ano, asi que hay que paginar de verdad.
         * @param {string} [filtro]  OData, p. ej. "fields/Estado eq 'firmada'" (necesita columna indexada o la
         *                            cabecera Prefer: HonorNonIndexedQueriesWarningMayFailRandomly)
         */
        async renglones(siteId, nombreLista, filtro, avisar) {
            const listaId = await this.idDeLista(siteId, nombreLista);
            let url = `${graph}/sites/${siteId}/lists/${listaId}/items?expand=fields&$top=500`
                + (filtro ? `&$filter=${encodeURIComponent(filtro)}` : '');
            const todos = [];
            while (url) {
                const r = await pedir(url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } }, avisar);
                if (!r.ok) throw new Error(`no se pudieron leer los renglones de ${nombreLista}: ` + await motivo(r));
                const j = await r.json();
                for (const it of j.value) todos.push(aplanar(it));
                url = j['@odata.nextLink'] || null;
            }
            return todos;
        },

        async crearRenglon(siteId, nombreLista, campos, avisar) {
            const listaId = await this.idDeLista(siteId, nombreLista);
            const r = await pedir(`${graph}/sites/${siteId}/lists/${listaId}/items`, {
                method: 'POST', headers: json, body: JSON.stringify({ fields: campos })
            }, avisar);
            if (!r.ok) throw errorHttp(`no se pudo escribir en ${nombreLista}: ` + await motivo(r), r.status);
            return aplanar(await r.json());
        },

        /**
         * PATCH de campos. Con `etag` (el `_etag` leido, T1) va como If-Match: si alguien cambio el
         * renglon en medio, Graph contesta 412 y aqui se lanza un error con status 412 — quien llama
         * relee y avisa, en vez de pisar el cambio ajeno sin enterarse. Sin etag es incondicional.
         */
        async actualizarRenglon(siteId, nombreLista, id, campos, avisar, etag) {
            const listaId = await this.idDeLista(siteId, nombreLista);
            const url = `${graph}/sites/${siteId}/lists/${listaId}/items/${id}/fields`;
            const hacer = conEtag => pedir(url, { method: 'PATCH', headers: conEtag ? { ...json, 'If-Match': etag } : json, body: JSON.stringify(campos) }, avisar);
            let r = await hacer(ifMatchSirve && !!etag);
            if (r.status === 400 && ifMatchSirve && etag) {
                // ¿El 400 fue por la cabecera? Se repite sin ella: si tambien falla, era el cuerpo.
                ifMatchSirve = false; r = await hacer(false);
                if (r.status === 400) ifMatchSirve = true; else console.warn('Graph rechazó If-Match en esta lista; se deja de mandar en esta sesión.');
            }
            if (r.status === 412) throw errorHttp(`alguien cambió el renglón ${id} de ${nombreLista} hace un momento (412)`, 412);
            if (!r.ok) throw errorHttp(`no se pudo actualizar el renglón ${id} de ${nombreLista}: ` + await motivo(r), r.status);
            const campos2 = await r.json();
            // v0.53.1: el PATCH de /fields no devuelve el eTag del ITEM, y sin el la SIGUIENTE escritura sobre el mismo renglon
            // iba sin If-Match (la ficha ya no se cierra entre ediciones desde v0.53.0, y mover dos veces seguidas lo hacia desde
            // v0.3.0). Un GET chico lo recupera; si falla, se devuelve sin `_etag` y quien llama queda como antes (incondicional).
            try {
                const g = await pedir(`${graph}/sites/${siteId}/lists/${listaId}/items/${id}?$select=id,eTag`, {}, undefined);
                if (g.ok) { const it = await g.json(); const etag = it && (it.eTag || it['@odata.etag']); if (etag) campos2._etag = String(etag); }
            } catch (_) { /* sin candado hasta la siguiente lectura, como antes */ }
            return campos2;
        },

        /** Borra un renglon. Solo para lo que NUNCA tuvo folio ni firma (app.js decide); lo demas se ANULA, no se borra. */
        async borrarRenglon(siteId, nombreLista, id, avisar) {
            const listaId = await this.idDeLista(siteId, nombreLista);
            const r = await pedir(`${graph}/sites/${siteId}/lists/${listaId}/items/${id}`, { method: 'DELETE' }, avisar);
            if (!r.ok && r.status !== 404) throw new Error(`no se pudo borrar el renglón ${id} de ${nombreLista}: ` + await motivo(r));
        },

        /** Cambia las opciones (u otro atributo) de una columna existente: PATCH sobre la definicion. */
        async actualizarColumna(siteId, listaId, columnaId, cuerpo, avisar) {
            const r = await pedir(`${graph}/sites/${siteId}/lists/${listaId}/columns/${columnaId}`, {
                method: 'PATCH', headers: json, body: JSON.stringify(cuerpo)
            }, avisar);
            if (!r.ok) throw new Error(`no se pudo actualizar la columna ${columnaId}: ` + await motivo(r));
            return await r.json();
        },

        /** Borra una carpeta o archivo de la biblioteca por id. Solo se usa para deshacer un lote que quedo a medias. */
        async borrarItemDrive(siteId, itemId, avisar) {
            const r = await pedir(`${graph}/sites/${siteId}/drive/items/${itemId}`, { method: 'DELETE' }, avisar);
            if (!r.ok && r.status !== 404) throw new Error(`no se pudo borrar el elemento ${itemId}: ` + await motivo(r));
        },

        /** Carpeta en la biblioteca (para la evidencia). conflictBehavior rename: dos lotes iguales no se mezclan. */
        async crearCarpeta(siteId, rutaPadre, nombre, avisar) {
            const r = await pedir(`${graph}/sites/${siteId}/drive/root:/${rutaUrl(rutaPadre)}:/children`, {
                method: 'POST', headers: json,
                body: JSON.stringify({ name: nombre, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
            }, avisar);
            if (!r.ok) throw new Error(`no se pudo crear la carpeta ${nombre}: ` + await motivo(r));
            const j = await r.json();
            return { nombreReal: j.name, id: j.id };
        },

        async subirPieza(siteId, rutaCarpeta, nombreArchivo, bytes, tipoMime, avisar) {
            const url = `${graph}/sites/${siteId}/drive/root:/${rutaUrl(rutaCarpeta)}/${rutaUrl(nombreArchivo)}:/content`;
            const r = await pedir(url, { method: 'PUT', headers: { 'Content-Type': tipoMime }, body: bytes }, avisar);
            if (!r.ok) throw new Error(`no se pudo subir ${nombreArchivo}: ` + await motivo(r));
            return await r.json();
        },

        // ------------------------------------------------------------ v0.162.0: Gastos (traido de la ERP v1 v0.6.0) (otra biblioteca, por su drive)

        /** ¿Existe la lista (o biblioteca) en el sitio? false si no; otro error (403, red) revienta. Gastos degrada con esto. */
        async existeLista(siteId, nombre) {
            if (listasPorNombre.has(nombre)) return true;
            if (!cargandoListas) cargandoListas = this.listas(siteId).finally(() => { cargandoListas = null; });
            await cargandoListas;
            return listasPorNombre.has(nombre);
        },

        /**
         * El drive de una biblioteca del sitio por su nombre. `/sites/{id}/drive` es la biblioteca Documentos; «Gastos» es
         * otra (docs/gastos-instrucciones-carlos.md), y todo lo suyo va por `/drives/{driveId}/…`.
         */
        async driveDeLista(siteId, nombre) {
            const listaId = await this.idDeLista(siteId, nombre);
            const r = await pedir(`${graph}/sites/${siteId}/lists/${listaId}/drive?$select=id`);
            if (!r.ok) throw errorHttp(`no se pudo abrir la biblioteca ${nombre}: ` + await motivo(r), r.status);
            return (await r.json()).id;
        },

        /** Carpeta en la raiz de un drive; si ya existe (409, conflictBehavior fail) no se toca y no es error. */
        async asegurarCarpetaEnDrive(driveId, nombre, avisar) {
            const r = await pedir(`${graph}/drives/${driveId}/root/children`, {
                method: 'POST', headers: json, body: JSON.stringify({ name: nombre, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
            }, avisar);
            if (r.ok || r.status === 409) return;
            throw errorHttp(`no se pudo crear la carpeta ${nombre}: ` + await motivo(r), r.status);
        },

        /** Sube un archivo a una ruta del drive SIN sobrescribir: si ya existe, error con status 409 (quien llama cambia el nombre). */
        async subirADrive(driveId, ruta, bytes, tipoMime, avisar) {
            const r = await pedir(`${graph}/drives/${driveId}/root:/${rutaUrl(ruta)}:/content?@microsoft.graph.conflictBehavior=fail`, {
                method: 'PUT', headers: { 'Content-Type': tipoMime }, body: bytes
            }, avisar);
            if (r.status === 409) throw errorHttp(`ya existe ${ruta}`, 409);
            if (!r.ok) throw errorHttp(`no se pudo subir ${ruta}: ` + await motivo(r), r.status);
            return await r.json();
        },

        /** Un elemento de un drive por id: { id, nombre, url }. */
        async itemDeDriveId(driveId, itemId, avisar) {
            const r = await pedir(`${graph}/drives/${driveId}/items/${idItemUrl(itemId)}?$select=id,name,webUrl`, {}, avisar);
            if (!r.ok) throw errorHttp('no se pudo leer el comprobante: ' + await motivo(r), r.status);
            const it = await r.json();
            return { id: it.id, nombre: it.name, url: it.webUrl };
        },

        // ------------------------------------------------------------ Docs (MINSA Proyectos)

        /**
         * Como `sitio`, pero un 403/404 NO revienta: devuelve `{ id: null, motivo }` para que Docs
         * diga «sin permiso sobre Quimicos-PITEPEC» en vez de tirar la pantalla. Solo estan autorizados
         * los sitios con `piloto: true` en config.js `bibliotecas` (CALYTEK, PITEPEC, RABASA desde 2026-09-15).
         */
        async sitioOpcional(host, ruta) {
            const r = await pedir(`${graph}/sites/${host}:${ruta}`);
            if (r.ok) return { id: (await r.json()).id, motivo: null };
            return { id: null, motivo: await motivo(r) };
        },

        /**
         * Busca archivos por nombre en la biblioteca del sitio (solo lectura). Excluye el buzon y
         * las carpetas: una liga apunta a un documento ya acomodado por la skill de archivar.
         * Devuelve [{ id, nombre, ruta, url, modificado, tamano }] con `ruta` relativa a la raiz.
         */
        async buscarEnDrive(siteId, texto, buzon, avisar) {
            // La comilla simple cierra el literal OData (`search(q='…')`): se duplica, como en todo $filter (v0.13.1).
            const q = encodeURIComponent(String(texto || '').trim().replace(/'/g, "''"));
            if (!q) return [];
            const r = await pedir(`${graph}/sites/${siteId}/drive/root/search(q='${q}')?$select=id,name,file,folder,webUrl,parentReference,lastModifiedDateTime,size&$top=50`, {}, avisar);
            if (!r.ok) throw new Error('no se pudo buscar en la biblioteca: ' + await motivo(r));
            const v = (await r.json()).value || [];
            const salida = [];
            for (const it of v) {
                if (!it.file) continue;
                // En los resultados de search() `parentReference.path` puede venir VACIO (medido
                // 2026-09-12: un archivo de 98_Archivo salio con la ruta = su nombre); el buzon solo
                // se excluye si la ruta se conoce, y quien liga vuelve a pedir el elemento por id.
                const carpeta = carpetaDe(it);
                if (buzon && carpeta && (carpeta === buzon || carpeta.startsWith(buzon + '/'))) continue;
                salida.push({
                    id: it.id, nombre: it.name, ruta: carpeta ? `${carpeta}/${it.name}` : it.name, rutaConocida: !!carpeta,
                    url: it.webUrl, modificado: it.lastModifiedDateTime, tamano: it.size
                });
            }
            return salida;
        },

        /**
         * Un elemento de la biblioteca por su id, con lo que la busqueda no garantiza: la carpeta real
         * (`parentReference.path`) y el GUID de SharePoint (`sharepointIds.listItemUniqueId`) con el que
         * se arma una URL corta cuando el `webUrl` de Graph no cabe en los 255 de PROY_Ligas.Url.
         * Devuelve { id, nombre, ruta, url, guid }.
         */
        async itemDeDrive(siteId, itemId, avisar) {
            const r = await pedir(`${graph}/sites/${siteId}/drive/items/${encodeURIComponent(itemId)}?$select=id,name,webUrl,parentReference,sharepointIds`, {}, avisar);
            if (!r.ok) throw errorHttp('no se pudo leer el archivo en la biblioteca: ' + await motivo(r), r.status);
            const it = await r.json();
            const carpeta = carpetaDe(it);
            return { id: it.id, nombre: it.name, ruta: carpeta ? `${carpeta}/${it.name}` : it.name, url: it.webUrl, guid: it.sharepointIds && it.sharepointIds.listItemUniqueId || null };
        },

        /**
         * ¿Sigue existiendo esta ruta en la biblioteca? Es como Docs deriva «en el buzon»: la
         * carpeta del lote desaparece cuando la skill de archivar lo acomoda (404), y nadie tiene
         * que actualizar la liga a mano. Devuelve true | false; otro error revienta.
         */
        async existeRuta(siteId, ruta, avisar) {
            const r = await pedir(`${graph}/sites/${siteId}/drive/root:/${rutaUrl(ruta)}?$select=id`, {}, avisar);
            if (r.ok) return true;
            if (r.status === 404) return false;
            throw new Error(`no se pudo consultar ${ruta}: ` + await motivo(r));
        },

        /** v0.108.0: como `itemDeDrive`, pero por RUTA relativa a la raiz (la que trae el recibo). null si 404. */
        async itemPorRuta(siteId, ruta, avisar) {
            const r = await pedir(`${graph}/sites/${siteId}/drive/root:/${rutaUrl(ruta)}?$select=id,name,webUrl,parentReference,sharepointIds,file`, {}, avisar);
            if (r.status === 404) return null;
            if (!r.ok) throw errorHttp(`no se pudo leer ${ruta}: ` + await motivo(r), r.status);
            const it = await r.json();
            const carpeta = carpetaDe(it);
            return { id: it.id, nombre: it.name, ruta: carpeta ? `${carpeta}/${it.name}` : it.name, url: it.webUrl, guid: it.sharepointIds && it.sharepointIds.listItemUniqueId || null, esArchivo: !!it.file };
        },

        /**
         * v0.108.0: lee un JSON chico de la biblioteca (el recibo de `_resueltos/`). `{ id, datos }`, o null si 404.
         * Se baja por `@microsoft.graph.downloadUrl` (pre-autenticada, SIN la cabecera Authorization): `/content`
         * responde 302 a ese mismo host y el token no debe viajar fuera de Graph. El host va en la CSP (connect-src).
         */
        async leerJson(siteId, ruta, avisar) { return bajarJson(`${graph}/sites/${siteId}/drive/root:/${rutaUrl(ruta)}`, ruta, avisar, 256 * 1024); },
        /** v0.165.0: lo mismo en OTRA biblioteca del sitio (por su drive, como «Gastos»); `maxBytes` porque cobranza.json pesa ~100 KB y crece. */
        async leerJsonDeDrive(driveId, ruta, avisar, maxBytes = 256 * 1024) { return bajarJson(`${graph}/drives/${driveId}/root:/${rutaUrl(ruta)}`, ruta, avisar, maxBytes); },

        // ------------------------------------------------------------ v1.0.0 (rediseño, cubeta 5): Archivos — ERP_Proyectos y las bibliotecas de unidad
        // `base` es el drive al que se habla: baseDrive(driveId) = /drives/{id} (ERP_Proyectos, del sitio Administración) o baseSitio(siteId) =
        // /sites/{id}/drive (la biblioteca Documentos de una unidad). Lo que no es Graph —el uploadUrl de una upload session y el monitor de una
        // copia— va por subirFragmento / leerMonitorCopia (abajo), SIN la cabecera Authorization: el token no sale de graph.microsoft.com.

        /** El drive (biblioteca Documentos) de un sitio de unidad: { id, url }. Es el destino de «Mandar a archivar» (parentReference.driveId). */
        async driveDeSitio(siteId, avisar) {
            const r = await pedir(`${graph}/sites/${siteId}/drive?$select=id,webUrl`, {}, avisar);
            if (!r.ok) throw errorHttp('no se pudo abrir la biblioteca de la unidad: ' + await motivo(r), r.status);
            const j = await r.json(); return { id: j.id, url: j.webUrl || '' };
        },

        /** Los hijos de una carpeta por su ruta ('' = la raíz). Con `conCampos` trae las columnas del listItem (ERP_Proyectos: ProyectoClave,
         *  TareaId, EnviadoArchivar, Lote) y su webUrl directo. Sigue @odata.nextLink. 404 (la carpeta aún no existe) = null. */
        async hijos(base, ruta, { conCampos = false } = {}, avisar) {
            let url = `${graph}${base}/${ruta ? `root:/${rutaUrl(ruta)}:/children` : 'root/children'}?$top=200${conCampos ? '&$expand=listItem($expand=fields)' : ''}`;
            const todos = [];
            while (url) {
                const r = await pedir(url, {}, avisar);
                if (r.status === 404) return null;
                if (!r.ok) throw errorHttp(`no se pudo leer la carpeta ${ruta || '(raíz)'}: ` + await motivo(r), r.status);
                const j = await r.json(); todos.push(...(j.value || []));
                url = j['@odata.nextLink'] || null;
            }
            return todos;
        },

        /** Sube hasta 10 MiB por ruta. `conflicto`: fail (409 = ya existe) · replace (versión nueva) · rename. Devuelve el driveItem. */
        async subirEnDrive(base, ruta, bytes, tipoMime, conflicto = 'fail', avisar) {
            const r = await pedir(`${graph}${base}/root:/${rutaUrl(ruta)}:/content?@microsoft.graph.conflictBehavior=${encodeURIComponent(conflicto)}`, {
                method: 'PUT', headers: { 'Content-Type': tipoMime || 'application/octet-stream' }, body: bytes
            }, avisar);
            if (r.status === 409) throw errorHttp(`ya existe ${ruta}`, 409);
            if (!r.ok) throw errorHttp(`no se pudo subir ${ruta}: ` + await motivo(r), r.status);
            return await r.json();
        },

        /** Abre una upload session (más de 10 MiB): { uploadUrl, expira }. */
        async crearSesionSubida(base, ruta, conflicto = 'fail', avisar) {
            const r = await pedir(`${graph}${base}/root:/${rutaUrl(ruta)}:/createUploadSession`, {
                method: 'POST', headers: json, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': conflicto } })
            }, avisar);
            if (r.status === 409) throw errorHttp(`ya existe ${ruta}`, 409);
            if (!r.ok) throw errorHttp(`no se pudo abrir la subida de ${ruta}: ` + await motivo(r), r.status);
            const j = await r.json(); return { uploadUrl: j.uploadUrl, expira: j.expirationDateTime || null };
        },

        /** Escribe columnas del listItem de un archivo (ERP_Proyectos: ProyectoClave, TareaId, EnviadoArchivar, Lote). */
        async camposDeArchivo(base, itemId, campos, avisar) {
            const r = await pedir(`${graph}${base}/items/${idItemUrl(itemId)}/listItem/fields`, { method: 'PATCH', headers: json, body: JSON.stringify(campos) }, avisar);
            if (!r.ok) throw errorHttp('no se pudieron marcar las columnas del archivo: ' + await motivo(r), r.status);
            return await r.json();
        },

        /** Vista previa embebible (POST …/preview): { getUrl }. */
        async vistaPrevia(base, itemId, avisar) {
            const r = await pedir(`${graph}${base}/items/${idItemUrl(itemId)}/preview`, { method: 'POST', headers: json, body: '{}' }, avisar);
            if (!r.ok) throw errorHttp('no se pudo abrir la vista previa: ' + await motivo(r), r.status);
            const j = await r.json(); return { getUrl: j.getUrl || null };
        },

        /** Las versiones de un archivo, de la actual a la más vieja: [{ id, cuando, quien, tamano }]. */
        async versiones(base, itemId, avisar) {
            const r = await pedir(`${graph}${base}/items/${idItemUrl(itemId)}/versions`, {}, avisar);
            if (!r.ok) throw errorHttp('no se pudieron leer las versiones: ' + await motivo(r), r.status);
            return ((await r.json()).value || []).map(v => ({ id: String(v.id), cuando: v.lastModifiedDateTime || '', quien: (v.lastModifiedBy && v.lastModifiedBy.user && (v.lastModifiedBy.user.displayName || v.lastModifiedBy.user.email)) || '', tamano: Number(v.size) || 0 }));
        },

        /** Restaura una versión vieja (queda como la versión nueva; la actual no se pierde). */
        async restaurarVersion(base, itemId, versionId, avisar) {
            if (!/^[0-9.]{1,20}$/.test(String(versionId))) throw new Error(`versión inválida: ${versionId}`);
            const r = await pedir(`${graph}${base}/items/${idItemUrl(itemId)}/versions/${encodeURIComponent(versionId)}/restoreVersion`, { method: 'POST' }, avisar);
            if (!r.ok) throw errorHttp('no se pudo restaurar la versión: ' + await motivo(r), r.status);
        },

        /** Copia un archivo a otra carpeta (otro drive, otro sitio). Es asíncrona: devuelve la URL del MONITOR (cabecera Location) o null. */
        async copiarA(base, itemId, destino, nombre, avisar) {
            const r = await pedir(`${graph}${base}/items/${idItemUrl(itemId)}/copy`, {
                method: 'POST', headers: json, body: JSON.stringify({ parentReference: { driveId: destino.driveId, id: destino.id }, name: nombre })
            }, avisar);
            if (!r.ok && r.status !== 202) throw errorHttp(`no se pudo copiar ${nombre}: ` + await motivo(r), r.status);
            return r.headers.get('Location') || null;
        },

        /** Borra un archivo de un drive (404 = ya no estaba). */
        async borrarDeDrive(base, itemId, avisar) {
            const r = await pedir(`${graph}${base}/items/${idItemUrl(itemId)}`, { method: 'DELETE' }, avisar);
            if (!r.ok && r.status !== 404) throw errorHttp('no se pudo borrar el archivo: ' + await motivo(r), r.status);
        }
    };

    async function bajarJson(urlItem, ruta, avisar, maxBytes) {
        const r = await pedir(urlItem, {}, avisar);
        if (r.status === 404) return null;
        if (!r.ok) throw errorHttp(`no se pudo leer ${ruta}: ` + await motivo(r), r.status);
        const it = await r.json();
        const url = it['@microsoft.graph.downloadUrl'];
        if (!url || (it.size || 0) > maxBytes) throw new Error(`${ruta}: sin liga de descarga o demasiado grande`);
        const b = await conReintento(() => fetch(url, { credentials: 'omit' }), avisar);
        if (!b.ok) throw errorHttp(`no se pudo bajar ${ruta}: HTTP ${b.status}`, b.status);
        return { id: it.id, datos: JSON.parse(await b.text()) };
    }
}

/** v1.0.0 (cubeta 5): la `base` de un drive para los métodos de Archivos. */
export const baseDrive = driveId => `/drives/${idItemUrl(driveId)}`;
export const baseSitio = siteId => `/sites/${siteId}/drive`;   // el siteId lo dio Graph («host,guid,guid»), como en el resto de este cliente

/** Una URL que Graph dio y que NO es Graph (uploadUrl, monitor): solo https y del host del tenant; si no, revienta antes de mandar bytes. */
function urlDelTenant(url, host) {
    let u; try { u = new URL(String(url || '')); } catch (_) { throw new Error('dirección de subida inválida'); }
    if (u.protocol !== 'https:' || (host && u.hostname.toLowerCase() !== String(host).toLowerCase())) throw new Error(`dirección fuera del tenant: ${u.hostname}`);
    return u.href;
}
/**
 * v1.0.0 (cubeta 5): un fragmento de una upload session. PUT al uploadUrl con Content-Range y SIN Authorization (la URL ya va autorizada; el
 * token no sale de Graph). Reintenta red y 429/503/504 como todo lo demás. Devuelve { listo, item, siguiente }: `listo` con el driveItem al
 * terminar (200/201), `siguiente` el próximo byte que espera (202). 409 = ya existe; 404 = la sesión venció.
 */
export async function subirFragmento(uploadUrl, trozo, a, b, total, host, avisar) {
    const url = urlDelTenant(uploadUrl, host);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { const e = errorHttp('sin conexión: la subida sigue en la cola', 0); e.sinRed = true; throw e; }
    const r = await conReintento(() => fetch(url, { method: 'PUT', credentials: 'omit', headers: { 'Content-Range': `bytes ${a}-${b}/${total}` }, body: trozo }), avisar);
    if (r.status === 200 || r.status === 201) return { listo: true, item: await r.json() };
    if (r.status === 202) { let j = {}; try { j = await r.json(); } catch (_) { /* sin cuerpo */ } const m = /^(\d+)-/.exec(String((j.nextExpectedRanges || [])[0] || '')); return { listo: false, siguiente: m ? Number(m[1]) : null }; }   // vuelta 2: sin dato, null (proximoByte decide)
    if (r.status === 409) throw errorHttp('ya existe un archivo con ese nombre', 409);
    throw errorHttp(`la subida se cortó (HTTP ${r.status})`, r.status);
}
/** v1.0.0 (cubeta 5): el monitor de una copia (Location de POST …/copy). Sin Authorization: está pre-autorizado. Devuelve su JSON. */
export async function leerMonitorCopia(monitorUrl, host) {
    const url = urlDelTenant(monitorUrl, host);
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok && r.status !== 202 && r.status !== 303) throw errorHttp(`monitor de la copia: HTTP ${r.status}`, r.status);
    try { return await r.json(); } catch (_) { return {}; }
}

/**
 * Traduce una columna de esquema.json al cuerpo que Graph espera en POST /columns.
 * Tipos: text | note | number | dateTime | boolean | choice.
 */
export function columnaGraph(c) {
    const base = { name: c.name || c.nombre, displayName: c.titulo || c.displayName, required: !!c.obligatorio, indexed: !!c.indexada };
    switch (c.tipo) {
        case 'text': return { ...base, text: { allowMultipleLines: false, maxLength: 255 } };
        case 'note': return { ...base, text: { allowMultipleLines: true, textType: 'plain' } };
        case 'number': return { ...base, number: { decimalPlaces: 'automatic' } };
        case 'dateTime': return { ...base, dateTime: { format: 'dateTime' } };
        case 'boolean': return { ...base, boolean: {} };
        case 'choice': return { ...base, choice: { allowTextEntry: !!c.libre, choices: c.opciones || [], displayAs: 'dropDownMenu' } };   // `libre`: acepta valores fuera de la lista (v0.11.0: cubetas por proyecto)
        default: throw new Error(`tipo de columna desconocido: ${c.tipo}`);
    }
}
