// ============================================================
// API de recuperación externa (middleware Wasi + n8n)
// ------------------------------------------------------------
// El probe Wasi ya no llama a api.wasi.co desde el navegador:
// usa GET /api/v1/vitrina/recuperar-por-referencia/{ref} (credenciales
// solo en el backend). Fallback: webhook n8n scrape-inmueble.
// ============================================================

import { API_BASE, N8N_SCRAPE_INMUEBLE_URL, TUNNEL_HEADERS } from './config';
import type { PropertyDetail, VitrinaInmueble } from './types';
import {
  applyLocationRestrictionToProperty,
  applyWasiProbeDataToProperty,
  buildRecoveredDetailForCache,
  isUnavailablePropertyView,
  normalizeWasiProbePayload,
  parseN8nScrapeResponseBody,
  unwrapN8nScrapeCacheEntry,
  type N8nScrapeResult,
  type RecoveredPropertyPayload,
} from '../utils/recovery';
import { normalizeDisplayText } from '../utils/text';

// ------------------------------------------------------------
// Cachés en memoria (paridad con el vanilla)
// ------------------------------------------------------------
const unavailableProbeCache = new Map<string, RecoveredPropertyPayload | null>();
const unavailableProbeInFlight = new Map<string, Promise<RecoveredPropertyPayload | null>>();
const n8nScrapeCache = new Map<string, unknown>();
const n8nScrapeInFlight = new Map<string, Promise<N8nScrapeResult>>();

/** IDs enriquecidos vía Wasi/n8n (fuera del GET vitrina/{token}). */
const externallyRecoveredIds = new Set<string>();

/** Caché de detalle compartida con getPropertyDetail (inyectada desde vitrinaApi). */
let detailCacheRef: Map<string, PropertyDetail> | null = null;

export function bindDetailCache(cache: Map<string, PropertyDetail>): void {
  detailCacheRef = cache;
}

export function markExternallyRecoveredReference(ref: string | number | null | undefined): void {
  const id = String(ref ?? '').trim();
  if (id) externallyRecoveredIds.add(id);
}

export function wasExternallyRecoveredByReferencia(
  ref: string | number | null | undefined,
): boolean {
  const id = String(ref ?? '').trim();
  if (!id) return false;
  if (externallyRecoveredIds.has(id)) return true;

  const wasiKey = `wasi-ref-${id}`;
  const n8nKey = `n8n-scrape-${id}`;
  if (unavailableProbeCache.has(wasiKey) && unavailableProbeCache.get(wasiKey)) return true;
  if (n8nScrapeCache.has(n8nKey)) {
    const { data } = unwrapN8nScrapeCacheEntry(n8nScrapeCache.get(n8nKey));
    if (data) return true;
  }
  return false;
}

export function putDetailInCache(keys: string[], detail: PropertyDetail): void {
  if (!detailCacheRef) return;
  for (const k of keys) {
    const key = String(k || '').trim();
    if (key) detailCacheRef.set(key, detail);
  }
}

export function cacheRecoveredDetail(
  prop: VitrinaInmueble,
  data: RecoveredPropertyPayload,
  referenciaId = '',
  options: { locationRestricted?: boolean } = {},
): void {
  const built = buildRecoveredDetailForCache(prop, data, options);
  if (!built) return;
  const keys = [...built.keys];
  const ref = String(referenciaId || '').trim();
  if (ref) keys.push(ref);
  putDetailInCache(keys, built.detail);
}

/**
 * Probe vía middleware (Wasi server-side). 404 / error → null (fallback n8n).
 */
async function getWasiPropertyByReferencia(
  referencia: string,
): Promise<RecoveredPropertyPayload | null> {
  const ref = String(referencia || '').trim();
  if (!ref) return null;

  const cacheKey = `wasi-ref-${ref}`;
  if (unavailableProbeCache.has(cacheKey)) {
    return unavailableProbeCache.get(cacheKey) ?? null;
  }
  if (unavailableProbeInFlight.has(cacheKey)) {
    return unavailableProbeInFlight.get(cacheKey)!;
  }

  const url = `${API_BASE}/recuperar-por-referencia/${encodeURIComponent(ref)}`;

  const probePromise = (async () => {
    try {
      const res = await fetch(url, { headers: TUNNEL_HEADERS });
      // Solo cachear 404 (definitivo). 5xx/429/red no se cachean para permitir reintento.
      if (!res.ok) {
        if (res.status === 404) unavailableProbeCache.set(cacheKey, null);
        return null;
      }
      const raw = await res.json();
      const normalized = normalizeWasiProbePayload(raw);
      unavailableProbeCache.set(cacheKey, normalized || null);
      return normalized || null;
    } catch {
      // Error de red / abort: no cachear como fallo definitivo.
      return null;
    } finally {
      unavailableProbeInFlight.delete(cacheKey);
    }
  })();

  unavailableProbeInFlight.set(cacheKey, probePromise);
  return probePromise;
}

async function scrapeInmuebleByReferencia(referencia: string): Promise<N8nScrapeResult> {
  const ref = String(referencia || '').trim();
  if (!ref) return { data: null, rejection: null };

  const cacheKey = `n8n-scrape-${ref}`;
  if (n8nScrapeCache.has(cacheKey)) {
    return unwrapN8nScrapeCacheEntry(n8nScrapeCache.get(cacheKey));
  }
  if (n8nScrapeInFlight.has(cacheKey)) {
    return n8nScrapeInFlight.get(cacheKey)!;
  }

  const scrapePromise = (async (): Promise<N8nScrapeResult> => {
    try {
      const res = await fetch(N8N_SCRAPE_INMUEBLE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ref }),
      });

      let body: unknown = {};
      try {
        const text = await res.text();
        if (text) body = JSON.parse(text);
      } catch {
        body = {};
      }

      if (res.status === 200 || res.status === 422) {
        const parsed = parseN8nScrapeResponseBody(body);
        const entry = parsed.data
          ? parsed.data
          : { data: null, rejection: parsed.rejection };
        n8nScrapeCache.set(cacheKey, entry);
        return parsed;
      }

      // 5xx/otros: no cachear para poder reintentar al volver a la pestaña.
      return { data: null, rejection: null };
    } catch {
      return { data: null, rejection: null };
    } finally {
      n8nScrapeInFlight.delete(cacheKey);
    }
  })();

  n8nScrapeInFlight.set(cacheKey, scrapePromise);
  return scrapePromise;
}

/**
 * Intenta recuperar un inmueble no disponible: primero middleware/Wasi, luego n8n.
 * Devuelve el inmueble actualizado si dejó de verse como no disponible.
 */
export async function tryRecoverUnavailableProperty(
  prop: VitrinaInmueble,
  displayPropertyId: string,
): Promise<VitrinaInmueble | null> {
  const ref = String(displayPropertyId || '').trim();
  if (!ref || !prop) return null;

  const stillUnavailable = (p: VitrinaInmueble) =>
    isUnavailablePropertyView(p, {
      location: normalizeDisplayText(p.ubicacion),
      description: normalizeDisplayText(p.descripcionCorta),
    });

  const probeData = await getWasiPropertyByReferencia(ref);
  if (probeData) {
    markExternallyRecoveredReference(ref);
    let next = applyLocationRestrictionToProperty(prop, markExternallyRecoveredReference);
    next = applyWasiProbeDataToProperty(next, probeData);
    cacheRecoveredDetail(next, probeData, ref, { locationRestricted: true });
    if (!stillUnavailable(next)) return next;
  }

  const scrapeResult = await scrapeInmuebleByReferencia(ref);
  const scrapeData = scrapeResult?.data || null;
  if (!scrapeData) return null;

  markExternallyRecoveredReference(ref);
  let next = applyLocationRestrictionToProperty(prop, markExternallyRecoveredReference);
  next = applyWasiProbeDataToProperty(next, scrapeData);
  cacheRecoveredDetail(next, scrapeData, ref, { locationRestricted: true });
  if (!stillUnavailable(next)) return next;
  return null;
}

export const recoveryApi = {
  getWasiPropertyByReferencia,
  scrapeInmuebleByReferencia,
  tryRecoverUnavailableProperty,
};
