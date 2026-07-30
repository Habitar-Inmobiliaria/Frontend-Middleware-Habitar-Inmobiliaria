# Cutover paralelo — Front + endpoint Wasi

## Front (Vercel)

Tras desplegar este repo:

| URL | App |
|-----|-----|
| `/vitrina/{token}` | Vanilla (sin cambio) |
| `/vitrina-react/{token}` | React (`web-transition`) |

Build: `node scripts/vercel-build.mjs` → salida `.vercel-out/` (vanilla + React en `/react/`).

Variable opcional en Vercel: `VITE_BACKEND_ORIGIN` (si no se define, el build de producción usa Railway por defecto).

Validar:

1. Vanilla sigue funcionando en `/vitrina/...`
2. React carga en `/vitrina-react/...` (tabs, detalle, tutorial)
3. Un inmueble “no disponible” intenta `GET .../recuperar-por-referencia/{id}`

## Backend (Railway) — checklist

El endpoint `GET /api/v1/vitrina/recuperar-por-referencia/{referencia}` debe estar desplegado.

Comportamiento esperado:

- **200** + JSON de inmueble si Wasi encuentra datos útiles
- **404** si no hay resultado (el front cae a n8n)
- **No 500** por “no encontrado” o error de mapeo no controlado

Si ves 500:

1. Revisar logs del request en Railway
2. Confirmar `WASI_ID_COMPANY` y `WASI_TOKEN` en el servicio
3. Probar a mano `GET https://api.wasi.co/v1/property/search?...&referencia={id}`
4. Ajustar DTO/cliente Feign si la forma del JSON no coincide y redeploy

Health: `GET /api/v1/vitrina/health`

## Cutover final (paso futuro)

Cuando React esté validado en paralelo: cambiar el rewrite de `/vitrina/:token` a `/react/index.html` (o unificar rutas) y retirar vanilla.
