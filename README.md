# Frontend Middleware Service

Vitrina inmobiliaria web para clientes de Habitar Inmobiliaria.

Permite visualizar inmuebles, cambiar su estado (me interesa / descartado), ver visitados y consultar el **Histórico de Inmuebles registrados** con carga diferida (lazy load).

## Versión oficial

La vitrina en producción se sirve solo con **React** (`web-transition/`):

| URL | App |
|-----|-----|
| `/vitrina/{token}` | **React (oficial)** |
| `/vitrina-react/{token}` | Alias React |
| `/vitrina-legacy/{token}` | Alias React (compat; ya no es vanilla) |

No existe token por defecto: sin `{token}` en la URL la vitrina no carga datos de un cliente.

El frontend vanilla quedó archivado en el tag/branch `archive/vanilla-vitrina`.

## Características principales

- Visualización de inmuebles por pestañas:
  - `Sin revisar`
  - `Me interesa`
  - `Descartadas`
  - `Visitados`
  - `Histórico de Inmuebles registrados`
- Modal de detalle (galería, mapa, video, lightbox)
- Comentarios (sidebar en Me interesa / Visitados)
- Tutorial de bienvenida, notificación de visita
- Recuperación de inmuebles no disponibles (middleware Wasi + n8n)
- Botón flotante de WhatsApp
- Estética responsive (desktop y mobile)

## Tecnologías

- React + TypeScript + Vite + React Router + CSS Modules

## Estructura del proyecto

```text
/
  web-transition/          # App React (única fuente)
  scripts/vercel-build.mjs # Build para Vercel → .vercel-out/
  vercel.json
  index.html               # Redirect marketing
  docs/cutover-paralelo.md
```

## Requisitos

- Node.js 20+ (para desarrollo/build de React)
- Navegador moderno (Chrome, Edge, Firefox, Safari)

## Ejecución local (React)

```bash
cd web-transition
npm install
npm run dev
```

Abrir `http://localhost:5173/vitrina/{token}`.

Backend local opcional: en `web-transition/.env` definir `VITE_BACKEND_ORIGIN=http://localhost:8080`.

## Build / deploy (Vercel)

```bash
node scripts/vercel-build.mjs
```

Publica React en `.vercel-out/react/` (+ `index.html` marketing). Ver [`docs/cutover-paralelo.md`](docs/cutover-paralelo.md).

## Endpoints utilizados

- `GET /api/v1/vitrina/{token}`
- `GET /api/v1/vitrina/{token}/inmuebles/{wasiId}`
- `GET /api/v1/vitrina/recuperar-por-referencia/{referencia}`
- `PATCH /api/v1/vitrina/{token}/estado/aprobar|descartar|visitar`
- `GET /api/v1/historico-inmuebles/por-cliente/{token}`
- `POST /api/v1/vitrina/notificar-visita`
- `GET /api/v1/vitrina/{token}/comentarios`

## Comportamiento de histórico

- El histórico **no se carga** al iniciar la vitrina.
- Solo se consulta al entrar por primera vez a la pestaña de histórico.
- Se consolida por `codigoNumerico`, conservando el último estado por fecha.
- Se guarda en memoria para evitar refetch inmediato al reingresar a la pestaña.

## UI/Branding

- Fondo con logo de Habitar Inmobiliaria en gran tamaño y baja opacidad.
- Footer: `© HabitarInmobiliaria 2026`
- Favicon Habitar
- Botón flotante de WhatsApp

## Seguridad

- No hay `DEFAULT_TOKEN` de cliente real en el frontend.
- Credenciales Wasi viven solo en el backend (`WASI_TOKEN` / `WASI_ID_COMPANY` en Railway).
- Pendiente operativo: rotar `WASI_TOKEN` si estuvo expuesto en historial Git antiguo.

## Rollback

Si hace falta recuperar el frontend vanilla:

1. Checkout / redeploy del tag `archive/vanilla-vitrina`, o
2. Revert del commit de purge en `main`
