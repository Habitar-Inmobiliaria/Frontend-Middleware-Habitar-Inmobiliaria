import { resolveToken } from '../../src/utils/token';

/** Token en la URL pública (base64 del ID HubSpot). */
export const VITRINA_URL_TOKEN = process.env.VITRINA_TOKEN ?? 'MTk3OTI4MTI3Mzc5';

/** Token resuelto para llamadas API (ID HubSpot plano). */
export const VITRINA_API_TOKEN = resolveToken(VITRINA_URL_TOKEN);

/** @deprecated alias — usar VITRINA_URL_TOKEN */
export const VITRINA_TOKEN = VITRINA_URL_TOKEN;

/** ID de usuario HubSpot (prospecto de prueba). */
export const HUBSPOT_USER_ID = process.env.HUBSPOT_USER_ID ?? '197928127379';

export const BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN ??
  'https://backend-middleware-habitar-inmobiliaria-production.up.railway.app';

export const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? 'https://visualizadorinmuebles.habitarinmobiliaria.co';

export const vitrinaPath = `/vitrina/${VITRINA_URL_TOKEN}`;

export const vitrinaApiPath = `/api/v1/vitrina/${VITRINA_API_TOKEN}`;

export const historicoApiPath = `/api/v1/historico-inmuebles/por-cliente/${VITRINA_API_TOKEN}`;
