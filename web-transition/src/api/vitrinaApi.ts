// ============================================================
// Servicio de comunicación con la API de vitrina
// ------------------------------------------------------------
// Portado de la sección "API Service" de js/vitrina/vitrina.js a
// TypeScript. Conserva fielmente la lógica de robustez:
//   - 304 sin cuerpo -> usar caché de sesión o reintentar.
//   - 502/503 -> respuesta degradada (parcial) -> reintentar con backoff.
//   - 200 con totalInmuebles != inmuebles.length -> reintentar sin caché.
// El subsistema de recuperación de inmuebles no disponibles (Wasi / n8n)
// vive en recoveryApi.ts y se enlaza a la caché de detalle vía bindDetailCache.
// ============================================================

import {
  API_BASE,
  HISTORICO_API,
  PRIVADOS_API,
  TUNNEL_HEADERS,
  VITRINA_304_MAX_DEPTH,
  VITRINA_503_BACKOFF_MS,
  VITRINA_503_MAX_RETRIES,
  VITRINA_FETCH_ATTEMPTS,
  VITRINA_SESSION_PREFIX,
} from './config';
import { handleApiError } from './errors';
import {
  bindDetailCache,
  markExternallyRecoveredReference,
  tryRecoverUnavailableProperty,
  wasExternallyRecoveredByReferencia,
} from './recoveryApi';
import type {
  ComentariosResult,
  ComentarioClienteResponse,
  EstadoAccion,
  HistoricoInmueble,
  ListadoComentariosResponse,
  NotificarVisitaPayload,
  PropertyDetail,
  VitrinaFetchResult,
  VitrinaInmueble,
  VitrinaResponse,
} from './types';
import { isUsefulRecoveredPropertyPayload, mergeDetailWithListProp } from '../utils/recovery';
import { normalizeDisplayText } from '../utils/text';

export { markExternallyRecoveredReference, wasExternallyRecoveredByReferencia };

function isUsefulPropertyDetail(detail: PropertyDetail | null | undefined): boolean {
  if (!detail) return false;
  return isUsefulRecoveredPropertyPayload(detail);
}

// ------------------------------------------------------------
// Caché de sesión del último 200 válido (por token)
// ------------------------------------------------------------
function loadVitrinaSessionCache(token: string): VitrinaResponse | null {
  try {
    const raw = sessionStorage.getItem(VITRINA_SESSION_PREFIX + token);
    if (!raw) return null;
    return JSON.parse(raw) as VitrinaResponse;
  } catch {
    return null;
  }
}

function saveVitrinaSessionCache(token: string, data: VitrinaResponse): void {
  try {
    sessionStorage.setItem(VITRINA_SESSION_PREFIX + token, JSON.stringify(data));
  } catch {
    /* cuota u otro error de almacenamiento: se ignora */
  }
}

/** Lee el cuerpo JSON o devuelve una vitrina vacía si no hay contenido. */
async function readResponseJsonOrEmpty(res: Response): Promise<VitrinaResponse> {
  const text = await res.text();
  if (!text) return { inmuebles: [], asesor: {} };
  try {
    return JSON.parse(text) as VitrinaResponse;
  } catch {
    return { inmuebles: [], asesor: {} };
  }
}

/**
 * Una petición GET a vitrina. Contrato backend:
 * - 200: lista completa (totalInmuebles === inmuebles.length cuando viene).
 * - 502/503: degradación; posible inmuebles.length < totalInmuebles (parcial).
 * - 304: sin cuerpo; usar último 200 válido en sessionStorage o forzar nueva representación.
 */
async function vitrinaFetchOnce(
  token: string,
  { cacheBust = false, allowHttpCache = true }: { cacheBust?: boolean; allowHttpCache?: boolean } = {},
  depth304 = 0,
): Promise<VitrinaFetchResult> {
  const url = cacheBust ? `${API_BASE}/${token}?_ts=${Date.now()}` : `${API_BASE}/${token}`;

  const fetchOpts: RequestInit = { headers: TUNNEL_HEADERS };
  if (!allowHttpCache) fetchOpts.cache = 'no-store';

  const res = await fetch(url, fetchOpts);

  if (res.status === 304) {
    const cached = loadVitrinaSessionCache(token);
    if (cached) return { outcome: 'ok', data: cached };
    if (depth304 >= VITRINA_304_MAX_DEPTH) {
      throw new Error(
        'Vitrina: respuesta 304 sin cuerpo y sin datos en caché local. Recarga la página.',
      );
    }
    return vitrinaFetchOnce(token, { cacheBust: true, allowHttpCache: false }, depth304 + 1);
  }

  if (res.status === 503 || res.status === 502) {
    const data = await readResponseJsonOrEmpty(res);
    return { outcome: 'partial', data };
  }

  if (!res.ok) await handleApiError(res);

  const data = await readResponseJsonOrEmpty(res);
  return { outcome: 'ok', data };
}

// ------------------------------------------------------------
// Helpers de verificación de contrato (totalInmuebles vs length)
// ------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDeclaredPropertyCount(data: VitrinaResponse | undefined): number | null {
  const candidates = [
    data?.totalInmuebles,
    (data as { cantidadInmuebles?: number } | undefined)?.cantidadInmuebles,
    (data as { total?: number } | undefined)?.total,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** true si no hay total declarado (legacy) o si totalInmuebles === inmuebles.length. */
function isVitrinaPayloadComplete(data: VitrinaResponse): boolean {
  const total = getDeclaredPropertyCount(data);
  const len = Array.isArray(data?.inmuebles) ? data.inmuebles.length : 0;
  if (total === null) return true;
  if (len !== total) {
    console.warn('[Vitrina] Contrato: totalInmuebles !== inmuebles.length', {
      totalInmuebles: total,
      length: len,
    });
    return false;
  }
  return true;
}

function logVitrina200OptionalCheck(data: VitrinaResponse): void {
  if (!data || !Array.isArray(data.inmuebles)) return;
  const total = getDeclaredPropertyCount(data);
  if (total === null) return;
  if (data.inmuebles.length !== total) {
    console.warn('[Vitrina] 200 OK pero totalInmuebles no coincide con length (no debería ocurrir).', {
      totalInmuebles: total,
      length: data.inmuebles.length,
    });
  }
}

async function maybeVerifyWhenNoDeclaredTotal(
  token: string,
  data: VitrinaResponse,
): Promise<VitrinaResponse> {
  if (getDeclaredPropertyCount(data) !== null) return data;

  const verify = await vitrinaFetchOnce(token, { cacheBust: true, allowHttpCache: false });
  if (verify.outcome === 'partial') return data;

  const dLen = Array.isArray(data?.inmuebles) ? data.inmuebles.length : 0;
  const vLen = Array.isArray(verify.data?.inmuebles) ? verify.data.inmuebles.length : 0;
  if (vLen > dLen) return verify.data;
  return data;
}

/**
 * Carga la vitrina cumpliendo el contrato del backend:
 * 503 -> reintentar con backoff; 200 incompleto vs totalInmuebles -> reintentar;
 * primer intento híbrido (caché HTTP); sin total declarado -> verificación opcional legacy.
 */
async function fetchMostCompleteVitrinaData(token: string): Promise<VitrinaResponse> {
  let backoff = VITRINA_503_BACKOFF_MS;
  const maxRounds = Math.max(VITRINA_503_MAX_RETRIES, VITRINA_FETCH_ATTEMPTS + 2);

  for (let i = 0; i < maxRounds; i++) {
    const useHttpCache = i === 0;
    const r = await vitrinaFetchOnce(token, {
      cacheBust: !useHttpCache,
      allowHttpCache: useHttpCache,
    });

    if (r.outcome === 'partial') {
      console.warn('[Vitrina] 503 — respuesta degradada, reintentando con backoff…', {
        intento: i + 1,
      });
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 10000);
      continue;
    }

    const data = r.data;
    logVitrina200OptionalCheck(data);

    if (isVitrinaPayloadComplete(data)) {
      saveVitrinaSessionCache(token, data);
      return await maybeVerifyWhenNoDeclaredTotal(token, data);
    }

    console.warn('[Vitrina] Lista incoherente con totalInmuebles, reintentando sin caché…', {
      intento: i + 1,
    });
    await sleep(Math.min(300 * (i + 1), 2000));
  }

  throw new Error(
    'La vitrina no está disponible por completo en este momento (servicio degradado). Intenta de nuevo en unos minutos.',
  );
}

// ------------------------------------------------------------
// Caché de detalle de inmueble (en memoria) + cancelación
// ------------------------------------------------------------
const detailCache = new Map<string, PropertyDetail>();
bindDetailCache(detailCache);
let detailAbortCtrl: AbortController | null = null;

// ------------------------------------------------------------
// Cambio de estado (base compartida para aprobar/descartar/visitar)
// ------------------------------------------------------------
/** PATCH /vitrina/{token}/estado/{accion} — cambia el estado de un inmueble. */
async function cambiarEstado(token: string, accion: EstadoAccion, url: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/${token}/estado/${accion}`, {
    method: 'PATCH',
    headers: { ...TUNNEL_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) await handleApiError(res);
  return res.ok;
}

// ------------------------------------------------------------
// Servicio público
// ------------------------------------------------------------
export const vitrinaApi = {
  /** GET /vitrina/{token} con lógica completa de reintentos y caché. */
  async getVitrina(token: string): Promise<VitrinaResponse> {
    return fetchMostCompleteVitrinaData(token);
  },

  /** GET /historico-inmuebles/por-cliente/{token}. */
  async getHistorico(token: string): Promise<HistoricoInmueble[]> {
    const url = `${HISTORICO_API}/por-cliente/${token}`;
    const res = await fetch(url, { headers: TUNNEL_HEADERS });
    if (!res.ok) await handleApiError(res);
    return (await res.json()) as HistoricoInmueble[];
  },

  /**
   * GET del detalle de un inmueble. IDs numéricos van al backend de vitrina;
   * el resto se trata como inmueble privado (ubicación restringida).
   * Si la API/caché devuelve un detalle vacío, intenta recuperación Wasi/n8n.
   */
  async getPropertyDetail(
    token: string,
    wasiId: string,
    options: { cancelPrevious?: boolean; listProp?: VitrinaInmueble | null } = {},
  ): Promise<PropertyDetail | undefined> {
    const { cancelPrevious = false, listProp = null } = options;
    const cacheKey = String(wasiId || '').trim();
    if (!cacheKey) return undefined;

    const needsScrapeEnrichment = (detail: PropertyDetail | null | undefined): boolean => {
      if (!detail) return true;
      const price = normalizeDisplayText(detail.precioFormateado);
      const area =
        normalizeDisplayText(detail.areaConstruida) ||
        normalizeDisplayText(detail.areaTerreno);
      const galleryLen = Array.isArray(detail.galeriasImagenes)
        ? detail.galeriasImagenes.filter(Boolean).length
        : Array.isArray(detail.imagenes)
          ? detail.imagenes.filter(Boolean).length
          : 0;
      const hasCoords =
        Boolean(normalizeDisplayText(detail.latitude)) &&
        Boolean(normalizeDisplayText(detail.longitude));
      // Flaco = sin precio real, o sin specs/galería/mapa.
      return !price || (!area && galleryLen <= 1 && !hasCoords);
    };

    const readUsefulCache = (): PropertyDetail | undefined => {
      for (const key of [cacheKey, wasiId]) {
        if (!detailCache.has(key)) continue;
        const cached = detailCache.get(key);
        if (!isUsefulPropertyDetail(cached)) {
          detailCache.delete(key);
          continue;
        }
        // Re-fusionar con listado por si la caché guardó placeholders Wasi.
        const refreshed = mergeDetailWithListProp(cached, listProp) ?? cached;
        if (needsScrapeEnrichment(refreshed)) {
          detailCache.delete(key);
          continue;
        }
        detailCache.set(key, refreshed!);
        return refreshed;
      }
      return undefined;
    };

    const usefulCached = readUsefulCache();
    if (usefulCached) return usefulCached;

    // Solo cancelar la petición previa en flujos interactivos (modal),
    // nunca en cargas en paralelo como el historial.
    let signal: AbortSignal | undefined;
    if (cancelPrevious) {
      if (detailAbortCtrl) detailAbortCtrl.abort();
      detailAbortCtrl = new AbortController();
      signal = detailAbortCtrl.signal;
    }

    const isNumeric = /^\d+$/.test(String(wasiId));
    let data: PropertyDetail | undefined;

    try {
      if (isNumeric) {
        const res = await fetch(`${API_BASE}/${token}/inmuebles/${wasiId}`, {
          headers: TUNNEL_HEADERS,
          signal,
        });
        if (!res.ok) await handleApiError(res);
        data = (await res.json()) as PropertyDetail;
      } else {
        const res = await fetch(`${PRIVADOS_API}/${wasiId}`, { signal });
        if (!res.ok) await handleApiError(res);
        data = (await res.json()) as PropertyDetail;

        if (data.imagenes && !data.galeriasImagenes) data.galeriasImagenes = data.imagenes;
        if (data.precio && !data.precioFormateado) {
          data.precioFormateado = `$${Number(data.precio).toLocaleString('es-CO')}`;
        }
        data._externalDataSource = true;
        data._locationRestricted = true;
        markExternallyRecoveredReference(wasiId);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return undefined;
      // Si el detalle directo falla, aún intentamos recuperación abajo.
      data = undefined;
    }

    // Wasi a menudo responde "útil" solo por el título, con placeholders
    // (Consultar precio, N/A). Fusionamos con listado y, si sigue flaco,
    // intentamos scrape n8n para galería/áreas/coords.
    const fromApiOrList = mergeDetailWithListProp(data, listProp) ?? data;

    if (isUsefulPropertyDetail(fromApiOrList) && !needsScrapeEnrichment(fromApiOrList)) {
      detailCache.set(cacheKey, fromApiOrList!);
      detailCache.set(wasiId, fromApiOrList!);
      return fromApiOrList;
    }

    // Detalle vacío / flaco: recuperar por referencia (Wasi → n8n).
    const seed: VitrinaInmueble = listProp
      ? { ...listProp }
      : {
          id: wasiId,
          codigoNumerico: wasiId,
          titulo: '',
          ubicacion: '',
          descripcionCorta: '',
          imagenUrl: '',
        };
    try {
      await tryRecoverUnavailableProperty(seed, cacheKey);
    } catch {
      /* la recuperación es best-effort */
    }

    const recovered = readUsefulCache();
    if (recovered) {
      // El scrape n8n es la fuente rica; listado rellena huecos restantes.
      const enriched = mergeDetailWithListProp(recovered, listProp) ?? recovered;
      detailCache.set(cacheKey, enriched);
      detailCache.set(wasiId, enriched);
      return enriched;
    }

    // Sin scrape: listado/API fusionado si hay algo usable.
    if (fromApiOrList && isUsefulPropertyDetail(fromApiOrList)) {
      detailCache.set(cacheKey, fromApiOrList);
      detailCache.set(wasiId, fromApiOrList);
      return fromApiOrList;
    }

    const fallback = fromApiOrList ?? data;
    if (fallback) {
      detailCache.set(cacheKey, fallback);
      detailCache.set(wasiId, fallback);
      return fallback;
    }
    return undefined;
  },

  /** PATCH /vitrina/{token}/estado/{accion} — cambia el estado de un inmueble. */
  cambiarEstado,

  /** Marca un inmueble como "Me interesa". */
  aprobar(token: string, url: string): Promise<boolean> {
    return cambiarEstado(token, 'aprobar', url);
  },

  /** Marca un inmueble como "Descartado". */
  descartar(token: string, url: string): Promise<boolean> {
    return cambiarEstado(token, 'descartar', url);
  },

  /** Marca un inmueble como "Visitado". */
  visitar(token: string, url: string): Promise<boolean> {
    return cambiarEstado(token, 'visitar', url);
  },

  /** GET /vitrina/{token}/comentarios (normalizado). */
  async getComentarios(token: string): Promise<ComentariosResult> {
    const url = `${API_BASE}/${token}/comentarios`;
    const res = await fetch(url, { headers: TUNNEL_HEADERS });
    if (!res.ok) await handleApiError(res);
    const data = (await res.json()) as Partial<ListadoComentariosResponse>;
    return {
      contactId: String(data?.contactId || token || '').trim(),
      total: Number(data?.total) || 0,
      comentarios: Array.isArray(data?.comentarios) ? data.comentarios : [],
    };
  },

  /** POST /vitrina/comentario-cliente. */
  async enviarComentarioCliente(
    token: string,
    inmuebleId: string,
    comentario: string,
    estado: string = 'DESCARTADO',
  ): Promise<ComentarioClienteResponse> {
    const url = `${API_BASE}/comentario-cliente`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...TUNNEL_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactId: token,
        inmuebleId,
        comentario,
        estado,
      }),
    });
    if (!res.ok) await handleApiError(res);
    return (await res.json()) as ComentarioClienteResponse;
  },

  /**
   * POST /vitrina/notificar-visita — notifica el ingreso a la vitrina.
   * Éxito típico: 204 sin cuerpo.
   */
  async notificarVisita(payload: NotificarVisitaPayload): Promise<void> {
    const contactId = String(payload?.contactId || '').trim();
    if (!contactId) throw new Error('contactId requerido');

    const body: NotificarVisitaPayload = { contactId };
    const nombre = String(payload?.nombreProspecto || '').trim();
    if (nombre) body.nombreProspecto = nombre;
    const disp = String(payload?.dispositivo || '').trim();
    if (disp) body.dispositivo = disp;

    const res = await fetch(`${API_BASE}/notificar-visita`, {
      method: 'POST',
      headers: { ...TUNNEL_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) return;
    await handleApiError(res);
  },
};
