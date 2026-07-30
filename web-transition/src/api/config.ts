// ============================================================
// Configuración de la API
// ------------------------------------------------------------
// Centraliza URLs base, cabeceras y constantes de reintento.
// Única fuente de verdad (DRY) para toda la capa de datos.
// ============================================================

// URLs por defecto del backend (middleware). En producción apunta a Railway;
// en desarrollo local, al backend en localhost:8080.
const DEFAULT_PROD_ORIGIN =
  'https://backend-middleware-habitar-inmobiliaria-production.up.railway.app';
const DEFAULT_DEV_ORIGIN = 'http://localhost:8080';

/**
 * Origen del backend. Se puede sobreescribir con la variable de entorno
 * VITE_BACKEND_ORIGIN (recomendado para despliegues); si no está definida,
 * se elige según el modo de Vite (dev vs producción).
 * Nota: sustituye al antiguo cálculo por hostname del código vanilla.
 */
export const BACKEND_ORIGIN: string =
  import.meta.env.VITE_BACKEND_ORIGIN ??
  (import.meta.env.DEV ? DEFAULT_DEV_ORIGIN : DEFAULT_PROD_ORIGIN);

export const API_BASE = `${BACKEND_ORIGIN}/api/v1/vitrina`;
export const PRIVADOS_API = `${BACKEND_ORIGIN}/api/v1/inmuebles-privados`;
export const HISTORICO_API = `${BACKEND_ORIGIN}/api/v1/historico-inmuebles`;

// Cabecera necesaria para saltar la página de verificación de localtunnel.
export const TUNNEL_HEADERS: Record<string, string> = {
  'bypass-tunnel-reminder': 'true',
};

// Constantes de robustez de la carga de vitrina (portadas del código vanilla).
export const VITRINA_FETCH_ATTEMPTS = 3;
export const VITRINA_503_MAX_RETRIES = 5;
export const VITRINA_503_BACKOFF_MS = 500;
export const VITRINA_304_MAX_DEPTH = 3;

// Prefijo de la caché de sesión del último 200 válido por token.
export const VITRINA_SESSION_PREFIX = 'vitrina_last_ok_';

/**
 * Webhook n8n de scrape de inmueble (fallback si el middleware/Wasi no recupera datos).
 * No contiene secretos; la URL es pública del webhook de automatización.
 */
export const N8N_SCRAPE_INMUEBLE_URL =
  'https://n8n-automatizations.habitarinmobiliaria.co/webhook/scrape-inmueble';
