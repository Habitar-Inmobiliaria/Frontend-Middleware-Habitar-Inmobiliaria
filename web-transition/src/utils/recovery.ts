// ============================================================
// Recuperación de inmuebles no disponibles (helpers puros)
// ------------------------------------------------------------
// Portado de js/vitrina/vitrina.js. Sin dependencias de la capa API
// para evitar ciclos (los clientes de red viven en recoveryApi).
// ============================================================

import type { PropertyDetail, VitrinaInmueble } from '../api/types';
import { extractPropertyIdFromUrl, getDisplayPropertyId } from './property';
import { normalizeDisplayText, normalizeImageUrl } from './text';

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
  const image = normalizeImageUrl(normalized.image ?? prop?.imagenUrl);
  return !image && !location && !description;
}

/**
 * Contenido suficiente para mostrar una tarjeta usable (no el shell
 * "Inmueble no disponible"). Requiere datos reales: imagen/ubicación/
 * descripción, o título/precio. Un flag _externalDataSource vacío NO cuenta.
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
  return false;
}

/**
 * Arma un detalle usable a partir del ítem de listado (p. ej. enriquecido
 * por n8n en el GET vitrina). El modal suele pedir /inmuebles/{id} a Wasi
 * y recibe vacío; sin esto se pierde título/precio/imagen de la card.
 */
export function hydrateDetailFromListProp(
  listProp: VitrinaInmueble | null | undefined,
): PropertyDetail | null {
  if (!listProp) return null;
  const titulo = normalizeDisplayText(listProp.titulo);
  const precio = normalizeDisplayText(listProp.precioFormateado);
  const img = normalizeImageUrl(listProp.imagenUrl || listProp.imagenPrincipal);
  const desc = normalizeDisplayText(listProp.descripcionCorta);
  const area = normalizeDisplayText(listProp.area);
  const banos = normalizeDisplayText(listProp.banos);
  const habitaciones = normalizeDisplayText(listProp.habitaciones);
  const ubicacion = normalizeDisplayText(listProp.ubicacion);
  const id = getDisplayPropertyId(listProp) || normalizeDisplayText(listProp.id);

  if (!titulo && !precio && !img && !desc) return null;

  const images = img ? [img] : [];
  const looksExternal = !ubicacion || Boolean(listProp._externalDataSource);

  return {
    id: id || undefined,
    codigoIdentificador: id || undefined,
    titulo: titulo || undefined,
    precioFormateado: precio || undefined,
    ubicacion: ubicacion || undefined,
    descripcionCorta: desc || undefined,
    descripcion: desc || undefined,
    habitaciones: habitaciones || undefined,
    banos: banos || undefined,
    areaConstruida: area || undefined,
    galeriasImagenes: images,
    imagenes: images,
    url: listProp.url || listProp.urlReferencia || undefined,
    urlReferencia: listProp.urlReferencia || listProp.url || undefined,
    tipoNegocio: /mensual|alquiler|arriendo|renta/i.test(precio) ? 'Alquiler' : undefined,
    _externalDataSource: looksExternal || undefined,
    _locationRestricted: looksExternal || listProp._locationRestricted || undefined,
  };
}

/**
 * Combina detalle de API con datos del listado: rellena huecos sin pisar
 * campos útiles del GET detalle.
 */
export function mergeDetailWithListProp(
  detail: PropertyDetail | null | undefined,
  listProp: VitrinaInmueble | null | undefined,
): PropertyDetail | null {
  const fromList = hydrateDetailFromListProp(listProp);
  if (!detail && !fromList) return null;
  if (!detail) return fromList;
  if (!fromList) return detail;

  const pick = (a: string | undefined, b: string | undefined) =>
    normalizeDisplayText(a) || normalizeDisplayText(b) || undefined;

  const apiImages = Array.isArray(detail.galeriasImagenes)
    ? detail.galeriasImagenes.map((u) => normalizeImageUrl(u)).filter(Boolean)
    : Array.isArray(detail.imagenes)
      ? detail.imagenes.map((u) => normalizeImageUrl(u)).filter(Boolean)
      : [];
  const listImages = fromList.galeriasImagenes || [];
  const images = apiImages.length > 0 ? apiImages : listImages;

  return {
    ...fromList,
    ...detail,
    titulo: pick(detail.titulo, fromList.titulo),
    precioFormateado: pick(detail.precioFormateado, fromList.precioFormateado),
    ubicacion: pick(detail.ubicacion, fromList.ubicacion),
    descripcionCorta: pick(detail.descripcionCorta, fromList.descripcionCorta),
    descripcion: pick(detail.descripcion, fromList.descripcion),
    habitaciones: pick(detail.habitaciones, fromList.habitaciones),
    banos: pick(detail.banos, fromList.banos),
    areaConstruida: pick(detail.areaConstruida, fromList.areaConstruida),
    tipoNegocio: pick(detail.tipoNegocio, fromList.tipoNegocio),
    tipoInmueble: pick(detail.tipoInmueble, fromList.tipoInmueble),
    url: pick(detail.url, fromList.url),
    urlReferencia: pick(detail.urlReferencia, fromList.urlReferencia),
    galeriasImagenes: images,
    imagenes: images,
    _externalDataSource: detail._externalDataSource || fromList._externalDataSource,
    _locationRestricted: detail._locationRestricted || fromList._locationRestricted,
  };
}

export function normalizeWasiProbePayload(payload: unknown): RecoveredPropertyPayload | null {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    const first = payload[0];
    if (first && typeof first === 'object') {
      const normalized = first as RecoveredPropertyPayload;
      return isUsefulRecoveredPropertyPayload(normalized) ? normalized : null;
    }
    return null;
  }

  if (typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;

  if (Array.isArray(obj.data) && obj.data.length > 0) {
    const normalized = obj.data[0] as RecoveredPropertyPayload;
    return isUsefulRecoveredPropertyPayload(normalized) ? normalized : null;
  }
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const normalized = obj.data as RecoveredPropertyPayload;
    return isUsefulRecoveredPropertyPayload(normalized) ? normalized : null;
  }
  if (Array.isArray(obj.results) && obj.results.length > 0) {
    const normalized = obj.results[0] as RecoveredPropertyPayload;
    return isUsefulRecoveredPropertyPayload(normalized) ? normalized : null;
  }
  if (obj.property && typeof obj.property === 'object') {
    const normalized = obj.property as RecoveredPropertyPayload;
    return isUsefulRecoveredPropertyPayload(normalized) ? normalized : null;
  }
  if (obj.inmueble && typeof obj.inmueble === 'object') {
    const normalized = obj.inmueble as RecoveredPropertyPayload;
    return isUsefulRecoveredPropertyPayload(normalized) ? normalized : null;
  }
  if (isUsefulRecoveredPropertyPayload(obj)) return obj as RecoveredPropertyPayload;
  return null;
}

/** Extrae URL de imagen desde string u objeto típico de Wasi/galerías. */
function coerceImageUrl(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return normalizeDisplayText(value);
  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>;
    return normalizeDisplayText(
      String(o.url ?? o.src ?? o.archivo ?? o.imagen ?? o.image ?? o.ruta ?? ''),
    );
  }
  return '';
}

function collectGalleryUrls(data: RecoveredPropertyPayload): string[] {
  const buckets = [
    data.galeriasImagenes,
    data.imagenes,
    data.galleries,
    data.gallery,
    data.photos,
    data.fotos,
  ];
  const urls: string[] = [];
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const item of bucket) {
      const url = coerceImageUrl(item);
      if (url) urls.push(url);
    }
  }
  return urls;
}

/** Tras recuperación: al menos título, descripción, imagen o precio útil. */
export function isUsefulRecoveredPropertyPayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as RecoveredPropertyPayload;
  const title = normalizeDisplayText(
    String(d.titulo ?? d.title ?? d.nombre ?? d.name ?? d.id_property_title ?? ''),
  );
  const description = normalizeDisplayText(
    String(
      d.descripcionCorta ??
        d.observaciones ??
        d.descripcion ??
        d.description ??
        d.obs ??
        d.comment ??
        '',
    ),
  );
  const gallery = collectGalleryUrls(d);
  const image = normalizeDisplayText(
    String(
      d.imagenUrl ??
        d.imagen_principal ??
        d.main_image ??
        d.mainImage ??
        d.imagen ??
        d.foto ??
        d.image ??
        d.photo ??
        gallery[0] ??
        '',
    ),
  );
  const price = normalizeDisplayText(
    String(
      d.precioFormateado ??
        d.precio_formateado ??
        d.precio ??
        d.price ??
        d.iso_price ??
        d.rent_price ??
        d.sale_price ??
        d.price_total ??
        '',
    ),
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
  const gallery = collectGalleryUrls(data);
  return (
    coerceImageUrl(data.imagenUrl) ||
    coerceImageUrl(data.imagen_principal) ||
    coerceImageUrl(data.main_image) ||
    coerceImageUrl(data.mainImage) ||
    coerceImageUrl(data.imagen) ||
    coerceImageUrl(data.foto) ||
    coerceImageUrl(data.image) ||
    gallery[0] ||
    ''
  );
}

/** Aplica datos recuperados al inmueble de listado (inmutable). */
export function applyWasiProbeDataToProperty(
  prop: VitrinaInmueble,
  data: RecoveredPropertyPayload,
): VitrinaInmueble {
  const nextTitle = normalizeDisplayText(
    String(data.titulo ?? data.title ?? data.nombre ?? data.name ?? data.id_property_title ?? ''),
  );
  const nextLocation = normalizeDisplayText(
    String(
      data.ubicacion ??
        data.location ??
        data.ciudad ??
        data.city ??
        data.city_label ??
        data.city_name ??
        '',
    ),
  );
  const nextDescription = normalizeDisplayText(
    String(
      data.descripcionCorta ??
        data.observaciones ??
        data.descripcion ??
        data.description ??
        data.obs ??
        data.comment ??
        '',
    ),
  );
  const nextImage = pickImage(data);
  const rawPrice =
    data.precioFormateado ??
    data.precio_formateado ??
    data.precio ??
    data.price ??
    data.iso_price ??
    data.rent_price ??
    data.sale_price ??
    data.price_total ??
    '';
  let nextPrice = normalizeDisplayText(String(rawPrice));
  if (nextPrice && !/^\$/.test(nextPrice) && /^\d/.test(nextPrice)) {
    const n = Number(String(rawPrice).replace(/[^\d.]/g, ''));
    if (Number.isFinite(n) && n > 0) nextPrice = `$${n.toLocaleString('es-CO')}`;
  }
  const nextUrl = normalizeDisplayText(String(data.urlReferencia ?? data.url ?? data.link ?? ''));

  const next: VitrinaInmueble = { ...prop };
  if (nextTitle) next.titulo = nextTitle;
  // Si ya venía restringida la ubicación, no reponer texto de dirección.
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
  if (!normalizedData || !prop || !isUsefulRecoveredPropertyPayload(normalizedData)) return null;

  const isLocationRestricted = Boolean(locationRestricted || prop._locationRestricted);
  const galleryUrls = collectGalleryUrls(normalizedData);
  const mainImage = pickImage(normalizedData);
  const galerias = galleryUrls.length > 0 ? galleryUrls : mainImage ? [mainImage] : [];
  const imagenes = galerias;

  const titulo = normalizeDisplayText(
    String(
      normalizedData.titulo ??
        normalizedData.title ??
        normalizedData.nombre ??
        normalizedData.name ??
        prop.titulo ??
        '',
    ),
  );
  const descripcionCorta = normalizeDisplayText(
    String(
      normalizedData.descripcionCorta ??
        normalizedData.observaciones ??
        normalizedData.descripcion ??
        normalizedData.description ??
        prop.descripcionCorta ??
        '',
    ),
  );
  let precioFormateado = normalizeDisplayText(
    String(
      normalizedData.precioFormateado ??
        normalizedData.precio_formateado ??
        normalizedData.precio ??
        normalizedData.price ??
        prop.precioFormateado ??
        '',
    ),
  );
  if (precioFormateado && !/^\$/.test(precioFormateado) && /^\d/.test(precioFormateado)) {
    const n = Number(String(precioFormateado).replace(/[^\d.]/g, ''));
    if (Number.isFinite(n) && n > 0) precioFormateado = `$${n.toLocaleString('es-CO')}`;
  }

  let mergedDetail: PropertyDetail = {
    ...(normalizedData as PropertyDetail),
    titulo,
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
    descripcionCorta,
    zona: isLocationRestricted ? '' : normalizeDisplayText(String(normalizedData.zona ?? '')),
    direccion: isLocationRestricted
      ? ''
      : normalizeDisplayText(String(normalizedData.direccion ?? '')),
    latitude: String(normalizedData.latitude ?? ''),
    longitude: String(normalizedData.longitude ?? ''),
    map: String(normalizedData.map ?? ''),
    id_publish_on_map: (normalizedData.id_publish_on_map as number | null | undefined) ?? null,
    _locationRestricted: isLocationRestricted,
    _externalDataSource: true,
    precioFormateado,
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
