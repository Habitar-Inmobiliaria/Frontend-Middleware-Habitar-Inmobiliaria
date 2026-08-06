// ============================================================
// Recuperación de inmuebles no disponibles (helpers puros)
// ------------------------------------------------------------
// Portado de js/vitrina/vitrina.js. Sin dependencias de la capa API
// para evitar ciclos (los clientes de red viven en recoveryApi).
// ============================================================

import type { PropertyDetail, VitrinaInmueble } from '../api/types';
import { extractPropertyIdFromUrl, getDisplayPropertyId } from './property';
import { normalizeDisplayText } from './text';

/** Payload crudo/normalizado que puede venir de Wasi o n8n. */
export type RecoveredPropertyPayload = Record<string, unknown>;

export interface N8nScrapeRejection {
  motivo: string;
  mensaje: string;
}

export interface N8nScrapeResult {
  data: RecoveredPropertyPayload | null;
  rejection: N8nScrapeRejection | null;
}

/** Campos de texto de dirección/ubicación (el mapa usa latitude/longitude). */
const LOCATION_TEXT_DETAIL_KEYS = [
  'ubicacion',
  'zona',
  'direccion',
  'ciudad',
  'location',
  'address',
  'barrio',
  'barrio_nombre',
  'neighborhood',
] as const;

export function getPropertyReferenceId(
  prop: VitrinaInmueble | PropertyDetail | null | undefined,
): string {
  if (!prop) return '';
  return String(
    extractPropertyIdFromUrl(
      ('url' in prop ? prop.url : undefined) ||
        prop.urlReferencia ||
        ('urlInmueble' in prop ? prop.urlInmueble : undefined) ||
        '',
    ) ||
      ('codigoNumerico' in prop ? prop.codigoNumerico : undefined) ||
      prop.id ||
      '',
  ).trim();
}

export function shouldRestrictPropertyLocation(
  prop: VitrinaInmueble | null | undefined,
  wasExternallyRecovered: (ref: string) => boolean,
): boolean {
  if (!prop || typeof prop !== 'object') return false;
  if (prop._locationRestricted || prop._externalDataSource || prop._fromHistorico) return true;
  return wasExternallyRecovered(getPropertyReferenceId(prop));
}

export function shouldRestrictDetailLocation(
  detail: PropertyDetail | null | undefined,
  listProp: VitrinaInmueble | null,
  wasExternallyRecovered: (ref: string) => boolean,
): boolean {
  if (detail?._locationRestricted || detail?._externalDataSource || detail?._fromHistorico) {
    return true;
  }
  if (listProp && shouldRestrictPropertyLocation(listProp, wasExternallyRecovered)) return true;
  if (detail && wasExternallyRecovered(getPropertyReferenceId(detail))) return true;
  return false;
}

/** Oculta campos de dirección; conserva coordenadas para el mapa. */
export function sanitizeDetailLocationFields(detail: PropertyDetail): PropertyDetail {
  const out: PropertyDetail = { ...detail };
  for (const key of LOCATION_TEXT_DETAIL_KEYS) {
    if (key in out) (out as Record<string, unknown>)[key] = '';
  }
  out._locationRestricted = true;
  return out;
}

export function prepareDetailForDisplay(
  detail: PropertyDetail | null | undefined,
  listProp: VitrinaInmueble | null,
  wasExternallyRecovered: (ref: string) => boolean,
): PropertyDetail | null | undefined {
  if (!detail) return detail;
  if (!shouldRestrictDetailLocation(detail, listProp, wasExternallyRecovered)) return detail;
  return sanitizeDetailLocationFields(detail);
}

/** Caso operativo: sin imagen + sin ubicación + sin descripción útil. */
export function isUnavailablePropertyView(
  prop: VitrinaInmueble | null | undefined,
  normalized: {
    location?: string;
    description?: string;
    image?: string;
  } = {},
): boolean {
  const location = normalizeDisplayText(normalized.location ?? prop?.ubicacion);
  const description = normalizeDisplayText(normalized.description ?? prop?.descripcionCorta);
  const image = normalizeDisplayText(normalized.image ?? prop?.imagenUrl);
  return !image && !location && !description;
}

/**
 * Contenido suficiente para mostrar una tarjeta usable (no el shell
 * "Inmueble no disponible"). Incluye título/precio tras recuperación Wasi/n8n.
 */
export function hasUsableListingContent(
  prop: VitrinaInmueble | null | undefined,
  normalized: {
    location?: string;
    description?: string;
    image?: string;
  } = {},
): boolean {
  if (!prop) return false;
  if (!isUnavailablePropertyView(prop, normalized)) return true;
  const title = normalizeDisplayText(prop.titulo);
  const price = normalizeDisplayText(prop.precioFormateado);
  if (title) return true;
  if (price && !/^\$?\s*0+([.,]0+)?$/.test(price)) return true;
  if (prop._externalDataSource || prop._fromHistorico) return true;
  return false;
}

export function normalizeWasiProbePayload(payload: unknown): RecoveredPropertyPayload | null {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    const first = payload[0];
    if (first && typeof first === 'object') return first as RecoveredPropertyPayload;
  }

  if (typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;

  if (Array.isArray(obj.data) && obj.data.length > 0) {
    return obj.data[0] as RecoveredPropertyPayload;
  }
  if (Array.isArray(obj.results) && obj.results.length > 0) {
    return obj.results[0] as RecoveredPropertyPayload;
  }
  if (obj.property && typeof obj.property === 'object') {
    return obj.property as RecoveredPropertyPayload;
  }
  if (obj.inmueble && typeof obj.inmueble === 'object') {
    return obj.inmueble as RecoveredPropertyPayload;
  }
  if (!Array.isArray(payload)) return obj as RecoveredPropertyPayload;
  return null;
}

/** Tras recuperación: al menos título, descripción, imagen o precio útil. */
export function isUsefulRecoveredPropertyPayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as RecoveredPropertyPayload;
  const title = normalizeDisplayText(String(d.titulo ?? d.title ?? d.nombre ?? ''));
  const description = normalizeDisplayText(
    String(d.descripcionCorta ?? d.observaciones ?? d.descripcion ?? d.description ?? ''),
  );
  const galerias = Array.isArray(d.galeriasImagenes) ? d.galeriasImagenes : [];
  const imagenes = Array.isArray(d.imagenes) ? d.imagenes : [];
  const image = normalizeDisplayText(
    String(d.imagenUrl ?? d.imagen_principal ?? d.imagen ?? d.foto ?? galerias[0] ?? imagenes[0] ?? ''),
  );
  const price = normalizeDisplayText(
    String(d.precioFormateado ?? d.precio_formateado ?? d.precio ?? ''),
  );
  return Boolean(title || description || image || price);
}

/**
 * Contrato webhook scrape-inmueble (n8n):
 * - HTTP 200: { valido: true, datos: { ... } }
 * - HTTP 422: { valido: false, motivo, mensaje, ... }
 * Legacy: objeto plano en raíz (solo si tiene campos útiles).
 */
export function parseN8nScrapeResponseBody(body: unknown): N8nScrapeResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { data: null, rejection: null };
  }

  const obj = body as Record<string, unknown>;

  if ('valido' in obj) {
    if (obj.valido !== true) {
      return {
        data: null,
        rejection: {
          motivo: String(obj.motivo || 'INMUEBLE_NO_ENCONTRADO').trim(),
          mensaje: String(obj.mensaje || '').trim(),
        },
      };
    }

    const datos = obj.datos;
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      return {
        data: null,
        rejection: {
          motivo: String(obj.motivo || 'DATOS_INSUFICIENTES').trim(),
          mensaje: String(obj.mensaje || '').trim(),
        },
      };
    }

    const normalized = normalizeWasiProbePayload(datos);
    if (!isUsefulRecoveredPropertyPayload(normalized)) {
      return {
        data: null,
        rejection: {
          motivo: 'DATOS_INSUFICIENTES',
          mensaje: String(obj.mensaje || '').trim(),
        },
      };
    }
    return { data: normalized, rejection: null };
  }

  const legacy = normalizeWasiProbePayload(body);
  if (isUsefulRecoveredPropertyPayload(legacy)) {
    return { data: legacy, rejection: null };
  }
  return { data: null, rejection: null };
}

export function unwrapN8nScrapeCacheEntry(entry: unknown): N8nScrapeResult {
  if (!entry) return { data: null, rejection: null };
  if (typeof entry === 'object' && entry !== null && 'data' in entry) {
    const e = entry as N8nScrapeResult;
    return {
      data: e.data || null,
      rejection: e.rejection || null,
    };
  }
  if (isUsefulRecoveredPropertyPayload(entry)) {
    return { data: entry as RecoveredPropertyPayload, rejection: null };
  }
  return { data: null, rejection: null };
}

function pickImage(data: RecoveredPropertyPayload): string {
  const galerias = Array.isArray(data.galeriasImagenes) ? data.galeriasImagenes : [];
  const imagenes = Array.isArray(data.imagenes) ? data.imagenes : [];
  return normalizeDisplayText(
    String(data.imagenUrl ?? data.imagen_principal ?? data.imagen ?? data.foto ?? galerias[0] ?? imagenes[0] ?? ''),
  );
}

/** Aplica datos recuperados al inmueble de listado (inmutable). */
export function applyWasiProbeDataToProperty(
  prop: VitrinaInmueble,
  data: RecoveredPropertyPayload,
): VitrinaInmueble {
  const nextTitle = normalizeDisplayText(String(data.titulo ?? data.title ?? data.nombre ?? ''));
  const nextLocation = normalizeDisplayText(
    String(data.ubicacion ?? data.location ?? data.ciudad ?? ''),
  );
  const nextDescription = normalizeDisplayText(
    String(data.descripcionCorta ?? data.observaciones ?? data.descripcion ?? data.description ?? ''),
  );
  const nextImage = pickImage(data);
  const nextPrice = normalizeDisplayText(
    String(data.precioFormateado ?? data.precio_formateado ?? data.precio ?? ''),
  );
  const nextUrl = normalizeDisplayText(String(data.urlReferencia ?? data.url ?? data.link ?? ''));

  const next: VitrinaInmueble = { ...prop };
  if (nextTitle) next.titulo = nextTitle;
  if (!prop._locationRestricted && nextLocation) next.ubicacion = nextLocation;
  if (nextDescription) next.descripcionCorta = nextDescription;
  if (nextImage) next.imagenUrl = nextImage;
  if (nextPrice) next.precioFormateado = nextPrice;
  if (nextUrl) next.urlReferencia = nextUrl;
  return next;
}

export function applyLocationRestrictionToProperty(
  prop: VitrinaInmueble,
  markRecovered: (ref: string) => void,
): VitrinaInmueble {
  const next: VitrinaInmueble = {
    ...prop,
    _locationRestricted: true,
    _externalDataSource: true,
    ubicacion: '',
  };
  markRecovered(getPropertyReferenceId(next));
  return next;
}

export function buildRecoveredDetailForCache(
  prop: VitrinaInmueble,
  data: RecoveredPropertyPayload,
  { locationRestricted = false }: { locationRestricted?: boolean } = {},
): { detail: PropertyDetail; keys: string[] } | null {
  const normalizedData = normalizeWasiProbePayload(data);
  if (!normalizedData || !prop) return null;

  const isLocationRestricted = Boolean(locationRestricted || prop._locationRestricted);
  const galerias = Array.isArray(normalizedData.galeriasImagenes)
    ? (normalizedData.galeriasImagenes as string[])
    : Array.isArray(normalizedData.imagenes)
      ? (normalizedData.imagenes as string[])
      : [];
  const imagenes = Array.isArray(normalizedData.imagenes)
    ? (normalizedData.imagenes as string[])
    : galerias;

  let mergedDetail: PropertyDetail = {
    ...(normalizedData as PropertyDetail),
    titulo: normalizeDisplayText(
      String(normalizedData.titulo ?? normalizedData.title ?? normalizedData.nombre ?? prop.titulo ?? ''),
    ),
    ubicacion: isLocationRestricted
      ? ''
      : normalizeDisplayText(
          String(
            normalizedData.ubicacion ??
              normalizedData.location ??
              normalizedData.ciudad ??
              prop.ubicacion ??
              '',
          ),
        ),
    descripcionCorta: normalizeDisplayText(
      String(
        normalizedData.descripcionCorta ??
          normalizedData.observaciones ??
          normalizedData.descripcion ??
          normalizedData.description ??
          prop.descripcionCorta ??
          '',
      ),
    ),
    zona: isLocationRestricted ? '' : normalizeDisplayText(String(normalizedData.zona ?? '')),
    direccion: isLocationRestricted
      ? ''
      : normalizeDisplayText(String(normalizedData.direccion ?? '')),
    latitude: String(normalizedData.latitude ?? ''),
    longitude: String(normalizedData.longitude ?? ''),
    map: String(normalizedData.map ?? ''),
    id_publish_on_map: (normalizedData.id_publish_on_map as number | null | undefined) ?? null,
    _locationRestricted: isLocationRestricted,
    precioFormateado: normalizeDisplayText(
      String(
        normalizedData.precioFormateado ??
          normalizedData.precio_formateado ??
          prop.precioFormateado ??
          '',
      ),
    ),
    urlReferencia: normalizeDisplayText(
      String(
        normalizedData.urlReferencia ??
          normalizedData.url ??
          normalizedData.link ??
          prop.urlReferencia ??
          prop.url ??
          '',
      ),
    ),
    galeriasImagenes: galerias,
    imagenes,
  };

  if (normalizedData.precio && !mergedDetail.precioFormateado) {
    mergedDetail.precioFormateado = `$${Number(normalizedData.precio).toLocaleString('es-CO')}`;
  }

  if (isLocationRestricted) {
    mergedDetail = sanitizeDetailLocationFields(mergedDetail);
  }

  const keys = new Set<string>();
  const directId = String(prop.id || '').trim();
  const byUrl = extractPropertyIdFromUrl(prop.url || prop.urlReferencia || prop.urlInmueble || '');
  const detailUrl = extractPropertyIdFromUrl(mergedDetail.urlReferencia || mergedDetail.url || '');
  const detailId = String(mergedDetail.id || '').trim();
  const displayId = getDisplayPropertyId(prop);

  if (directId) keys.add(directId);
  if (displayId) keys.add(displayId);
  if (byUrl) keys.add(byUrl);
  if (detailUrl) keys.add(detailUrl);
  if (detailId) keys.add(detailId);

  return { detail: mergedDetail, keys: [...keys] };
}
