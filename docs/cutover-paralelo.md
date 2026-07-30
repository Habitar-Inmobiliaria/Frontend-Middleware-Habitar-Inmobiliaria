# Cutover vitrina — React oficial

## Rutas en producción (Vercel)

| URL | App |
|-----|-----|
| `/vitrina/{token}` | **React (oficial)** → `/react/index.html` |
| `/vitrina-react/{token}` | Alias React (mismas pruebas / enlaces viejos) |
| `/vitrina-legacy/{token}` | Vanilla (rollback de emergencia) |

Build: `node scripts/vercel-build.mjs` → `.vercel-out/` (vanilla + React bajo `/react/`).

Variable opcional en Vercel: `VITE_BACKEND_ORIGIN` (si no se define, el build de producción usa Railway por defecto).

## Smoke post-deploy

1. `/vitrina/{token}` → React (favicon, footer, WhatsApp, tabs, detalle)
2. `/vitrina-react/{token}` → misma app React
3. `/vitrina-legacy/{token}` → vanilla (solo si hace falta comparar/rollback)
4. `/vitrina` sin token → no debe cargar la vitrina de un cliente real
5. Inmueble “no disponible” → `GET .../recuperar-por-referencia/{id}` (200 o 404; no 500)

## Rollback rápido

1. En [`vercel.json`](../vercel.json), volver a apuntar `/vitrina/:token` a `/pages/vitrina.html`
2. Redeploy, o usar temporalmente `/vitrina-legacy/{token}`

## Backend (Railway) — Wasi

El endpoint `GET /api/v1/vitrina/recuperar-por-referencia/{referencia}` debe estar desplegado.

Comportamiento esperado:

- **200** + JSON de inmueble si Wasi encuentra datos útiles
- **404** si no hay resultado (el front cae a n8n)
- **No 500** por “no encontrado”

Si ves 500:

1. Revisar logs del request en Railway
2. Confirmar `WASI_ID_COMPANY` y `WASI_TOKEN` en el servicio
3. Probar a mano el search de Wasi y ajustar DTO/Feign si hace falta

Health: `GET /api/v1/vitrina/health`

## Pendiente ops

- Rotar `WASI_TOKEN` en Wasi + Railway (estuvo en historial Git del front).
- Más adelante: retirar vanilla del repo cuando el rollback ya no sea necesario.
