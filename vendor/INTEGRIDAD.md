# Integridad de lo vendorizado

Registro para que una sesión futura pueda probar que el archivo del repo es el que publicó su
autor, sin confiar en el nombre (amarillo 7 del auditor-repo, 2026-09-11).

| Archivo | Versión | Origen | sha256 | Verificado |
|---|---|---|---|---|
| `msal-browser.min.js` | @azure/msal-browser 5.23.0 | `https://cdn.jsdelivr.net/npm/@azure/msal-browser@5.23.0/lib/msal-browser.min.js` | `a71f893dc3c9fa3c59219e0535ab6a00a6281860f24315ab8118304baafacc64` | 2026-09-28, dos descargas frescas del origen = mismo hash (S-17, v0.127.0); `integrity` = `sha256-px+JPcPJ+jxZIZ4FNatqAKYoGGDyQxWrgRgwS6r6zGQ=`. **Sustituye** a la fila de abajo |
| `msal-browser.min.js` | @azure/msal-browser 5.22.0 | `https://cdn.jsdelivr.net/npm/@azure/msal-browser@5.22.0/lib/msal-browser.min.js` | `5ce42b98842c06a0d00233253f46684f43dd398b46cb7dd5e1441f1bfd9caa6d` | 2026-09-16, dos descargas frescas del origen = mismo hash (S-06, v0.77.0); `integrity` = `sha256-XOQrmIQsBqDQAjMlP0ZoT0PdOYtGy33V4UQfG/2cqm0=`. **Sustituye** a la fila de abajo |
| `msal-browser.min.js` | @azure/msal-browser 4.29.0 | `https://cdn.jsdelivr.net/npm/@azure/msal-browser@4.29.0/lib/msal-browser.min.js` | `d822083e23e729bd49248c54b68c51b6d5dbcff276a5ab3ab46f57b295de9cb7` | 2026-09-11, descarga fresca del origen = mismo hash; byte-idéntico al de `calytek-planta-app`. **Se corrió hasta v0.76.0**; planta la dejó por 5.22.0 el 2026-09-20 |

Cómo re-verificar (desde la raíz de `proyectos/`):

```
sha256sum minsa-erp-app/app/vendor/msal-browser.min.js
curl -sL https://cdn.jsdelivr.net/npm/@azure/msal-browser@5.23.0/lib/msal-browser.min.js | sha256sum
```

Los dos hashes deben coincidir entre sí y con la tabla. Al subir de versión: nueva fila ARRIBA (la primera es la vigente; `sw.test.js` la coteja), nunca
sobrescribir la anterior (la vieja prueba qué se corrió hasta esa fecha).

**Desde v0.76.0 (S-07) el hash también va en el `<script>`** como `integrity="sha256-<base64>"` en los
tres HTML que cargan el vendor (`app/index.html`, `herramientas-dev/provisionar.html`,
`herramientas-dev/sembrar.html`): el navegador rechaza el archivo si no cuadra, y `test/sw.test.js`
coteja el atributo contra los bytes del archivo en cada `npm test`. Al subir de versión, los tres
atributos se regeneran con:

```
openssl dgst -sha256 -binary minsa-erp-app/app/vendor/msal-browser.min.js | openssl base64 -A
```
