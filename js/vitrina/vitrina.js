// ============================================================
// Constants & Config
// ============================================================
const IS_LOCAL_DEV = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1';
const BACKEND_ORIGIN = IS_LOCAL_DEV
    ? 'http://localhost:8080'
    : 'https://backend-middleware-habitar-inmobiliaria-production.up.railway.app';

const API_BASE = `${BACKEND_ORIGIN}/api/v1/vitrina`;
const DEFAULT_TOKEN = '197928127379';

// Header needed to bypass localtunnel's HTML verification page
const TUNNEL_HEADERS = { 'bypass-tunnel-reminder': 'true' };

// Estado values from backend
const ESTADO = {
    SIN_REVISAR: null,          // no estado field or empty
    APROBADO:    'APROBADO',
    DESCARTADO:  'DESCARTADO'
};

// ============================================================
// State
// ============================================================
const state = {
    properties: [],
    agent:      null,
    token:      null,
    activeTab:  'sin-revisar',
    historicoFetched: false,
    historicoData: [],
    historicoPage: 1,
    importantInfo: {
        open: false,
        embedMode: false,
        /** Solo móvil (≤900px): dock inferior colapsado = solo barra. */
        mobileDockCollapsed: false,
        loading: false,
        loaded: false,
        comments: [],
        error: ''
    }
};
let detailMapInstance = null;
let detailVideoOverlay = null;
const unavailableProbeCache = new Map();
const unavailableProbeInFlight = new Map();
const n8nScrapeCache = new Map();
const n8nScrapeInFlight = new Map();
const HISTORICO_PAGE_SIZE = 10;
const VITRINA_FETCH_ATTEMPTS = 3;
const VITRINA_503_MAX_RETRIES = 5;
const VITRINA_503_BACKOFF_MS = 500;
const VITRINA_SESSION_PREFIX = 'vitrina_last_ok_';
/** Una vez por pestaña/sesión: evita llamadas duplicadas a POST …/notificar-visita. */
const VITRINA_VISITA_SESSION_PREFIX = 'vitrina_notificar_visita_';
const VITRINA_304_MAX_DEPTH = 3;
const N8N_SCRAPE_INMUEBLE_URL = 'https://n8n-automatizations.habitarinmobiliaria.co/webhook/scrape-inmueble';
const PRIVADOS_API = `${BACKEND_ORIGIN}/api/v1/inmuebles-privados`;

/** IDs enriquecidos vía Wasi/n8n (fuera del GET vitrina/{token}). */
const externallyRecoveredIds = new Set();

/** Campos de texto de dirección/ubicación (el mapa usa latitude/longitude). */
const LOCATION_TEXT_DETAIL_KEYS = [
    'ubicacion', 'zona', 'direccion', 'ciudad', 'location', 'address',
    'barrio', 'barrio_nombre', 'neighborhood'
];

function markExternallyRecoveredReference(ref) {
    const id = String(ref || '').trim();
    if (id) externallyRecoveredIds.add(id);
}

function wasExternallyRecoveredByReferencia(ref) {
    const id = String(ref || '').trim();
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

function getPropertyReferenceId(prop) {
    if (!prop) return '';
    return String(
        extractPropertyIdFromUrl(prop.url || prop.urlReferencia || prop.urlInmueble || '')
        || prop.codigoNumerico
        || prop.id
        || ''
    ).trim();
}

function shouldRestrictPropertyLocation(prop) {
    if (!prop || typeof prop !== 'object') return false;
    if (prop._locationRestricted || prop._externalDataSource || prop._fromHistorico) return true;
    return wasExternallyRecoveredByReferencia(getPropertyReferenceId(prop));
}

function shouldRestrictDetailLocation(detail, listProp = null) {
    if (detail?._locationRestricted || detail?._externalDataSource || detail?._fromHistorico) return true;
    if (listProp && shouldRestrictPropertyLocation(listProp)) return true;
    if (detail && wasExternallyRecoveredByReferencia(getPropertyReferenceId(detail))) return true;
    return false;
}

/** Oculta campos de dirección; conserva coordenadas para el mapa. */
function sanitizeDetailLocationFields(detail) {
    if (!detail || typeof detail !== 'object') return detail;
    const out = { ...detail };
    LOCATION_TEXT_DETAIL_KEYS.forEach((key) => {
        if (key in out) out[key] = '';
    });
    out._locationRestricted = true;
    return out;
}

function prepareDetailForDisplay(detail, listProp = null) {
    if (!detail) return detail;
    if (!shouldRestrictDetailLocation(detail, listProp)) return detail;
    return sanitizeDetailLocationFields(detail);
}

/**
 * Extract the numeric wasi ID from urlReferencia.
 * e.g. ".../apartamento-venta-centenario-armenia/9798229-APROBADO" → "9798229"
 */
function extractWasiId(prop) {
    const url = prop.urlReferencia || '';
    const segment = url.split('/').pop();          // "9798229-APROBADO"
    return segment.replace(/-[A-Z_]+$/, '');       // "9798229"
}

/**
 * Extract a property identifier from URL.
 * Supports:
 * - SEO Wasi URLs: /casa-venta-zona/8116766
 * - Private URLs:  /venta/6e0e775d
 * - State suffixes: /8116766-APROBADO, /venta/6e0e775d-DESCARTADO
 */
function extractPropertyIdFromUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';

    try {
        const parsed = new URL(raw);
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length >= 2 && parts[parts.length - 2].toLowerCase() === 'venta') {
            return parts[parts.length - 1].replace(/-(APROBADO|DESCARTADO|VISITADO|REVISADO)$/i, '');
        }
        const lastPart = parts[parts.length - 1] || '';
        return lastPart.replace(/-(APROBADO|DESCARTADO|VISITADO|REVISADO)$/i, '');
    } catch {
        const clean = raw.replace(/\/+$/, '');
        const idxVenta = clean.toLowerCase().lastIndexOf('/venta/');
        if (idxVenta >= 0) {
            return clean.slice(idxVenta + '/venta/'.length).replace(/-(APROBADO|DESCARTADO|VISITADO|REVISADO)$/i, '');
        }
        return clean.split('/').pop().replace(/-(APROBADO|DESCARTADO|VISITADO|REVISADO)$/i, '');
    }
}

function getHistoryPropertyId(item) {
    if (!item) return '';
    const directCode = String(item.codigoNumerico || '').trim();
    if (directCode) return directCode;
    const fromUrl = extractPropertyIdFromUrl(item.url || item.urlReferencia || item.urlInmueble || '');
    return String(fromUrl || '').trim();
}

function normalizeDisplayText(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (/^(null|undefined|nan)$/i.test(text)) return '';
    if (/^null\s*-\s*null$/i.test(text)) return '';
    if (/^sin descripci[oó]n disponible\.?$/i.test(text)) return '';
    if (/^inmueble sin informaci[oó]n completa\.?$/i.test(text)) return '';
    return text;
}

function isUnavailablePropertyView(prop, normalized = {}) {
    const location = normalizeDisplayText(normalized.location ?? prop?.ubicacion);
    const description = normalizeDisplayText(normalized.description ?? prop?.descripcionCorta);
    const image = normalizeDisplayText(prop?.imagenUrl);
    // Caso operativo: sin imagen + sin ubicación + sin descripción útil.
    return !image && !location && !description;
}

function normalizeWasiProbePayload(payload) {
    if (!payload) return null;

    const fromArray = Array.isArray(payload)
        ? payload[0]
        : null;
    if (fromArray && typeof fromArray === 'object') return fromArray;

    if (Array.isArray(payload?.data) && payload.data.length > 0) return payload.data[0];
    if (Array.isArray(payload?.results) && payload.results.length > 0) return payload.results[0];
    if (payload?.property && typeof payload.property === 'object') return payload.property;
    if (payload?.inmueble && typeof payload.inmueble === 'object') return payload.inmueble;

    // Si ya viene objeto plano de inmueble
    if (typeof payload === 'object' && !Array.isArray(payload)) return payload;
    return null;
}

/** Tras recuperación: al menos título, descripción, imagen o precio útil (evita DTO lleno de null). */
function isUsefulRecoveredPropertyPayload(data) {
    if (!data || typeof data !== 'object') return false;
    const title = normalizeDisplayText(data.titulo || data.title || data.nombre);
    const description = normalizeDisplayText(
        data.descripcionCorta || data.observaciones || data.descripcion || data.description
    );
    const image = normalizeDisplayText(
        data.imagenUrl
        || data.imagen_principal
        || data.imagen
        || data.foto
        || (Array.isArray(data.galeriasImagenes) ? data.galeriasImagenes[0] : '')
        || (Array.isArray(data.imagenes) ? data.imagenes[0] : '')
    );
    const price = normalizeDisplayText(data.precioFormateado || data.precio_formateado || data.precio);
    return Boolean(title || description || image || price);
}

/**
 * Contrato webhook scrape-inmueble (n8n):
 * - HTTP 200: { valido: true, datos: { ... } }
 * - HTTP 422: { valido: false, motivo, mensaje, idInmueble, ... }
 * Legacy: objeto plano en raíz (solo si tiene campos útiles).
 */
function parseN8nScrapeResponseBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { data: null, rejection: null };
    }

    if ('valido' in body) {
        if (body.valido !== true) {
            return {
                data: null,
                rejection: {
                    motivo: String(body.motivo || 'INMUEBLE_NO_ENCONTRADO').trim(),
                    mensaje: String(body.mensaje || '').trim()
                }
            };
        }

        const datos = body.datos;
        if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
            return {
                data: null,
                rejection: {
                    motivo: String(body.motivo || 'DATOS_INSUFICIENTES').trim(),
                    mensaje: String(body.mensaje || '').trim()
                }
            };
        }

        const normalized = normalizeWasiProbePayload(datos);
        if (!isUsefulRecoveredPropertyPayload(normalized)) {
            return {
                data: null,
                rejection: {
                    motivo: 'DATOS_INSUFICIENTES',
                    mensaje: String(body.mensaje || '').trim()
                }
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

/** Valor en n8nScrapeCache: null | datos normalizados | { data, rejection } */
function unwrapN8nScrapeCacheEntry(entry) {
    if (!entry) return { data: null, rejection: null };
    if (typeof entry === 'object' && entry !== null && 'data' in entry) {
        return {
            data: entry.data || null,
            rejection: entry.rejection || null
        };
    }
    if (isUsefulRecoveredPropertyPayload(entry)) {
        return { data: entry, rejection: null };
    }
    return { data: null, rejection: null };
}

function applyWasiProbeDataToProperty(prop, data) {
    if (!prop || !data) return;
    const nextTitle = normalizeDisplayText(data.titulo || data.title || data.nombre);
    const nextLocation = normalizeDisplayText(data.ubicacion || data.location || data.ciudad);
    const nextDescription = normalizeDisplayText(data.descripcionCorta || data.observaciones || data.descripcion || data.description);
    const nextImage = normalizeDisplayText(
        data.imagenUrl
        || data.imagen_principal
        || data.imagen
        || data.foto
        || (Array.isArray(data.galeriasImagenes) ? data.galeriasImagenes[0] : '')
        || (Array.isArray(data.imagenes) ? data.imagenes[0] : '')
    );
    const nextPrice = normalizeDisplayText(
        data.precioFormateado
        || data.precio_formateado
        || data.precio
    );
    const nextUrl = normalizeDisplayText(
        data.urlReferencia
        || data.url
        || data.link
    );

    if (nextTitle) prop.titulo = nextTitle;
    if (!prop._locationRestricted && nextLocation) prop.ubicacion = nextLocation;
    if (nextDescription) prop.descripcionCorta = nextDescription;
    if (nextImage) prop.imagenUrl = nextImage;
    if (nextPrice) prop.precioFormateado = nextPrice;
    if (nextUrl) prop.urlReferencia = nextUrl;
}

function applyLocationRestrictionToProperty(prop) {
    if (!prop) return;
    prop._locationRestricted = true;
    prop._externalDataSource = true;
    prop.ubicacion = '';
    prop.zona = '';
    prop.direccion = '';
    markExternallyRecoveredReference(getPropertyReferenceId(prop));
}

function cacheRecoveredDetail(prop, data, referenciaId = '', { locationRestricted = false } = {}) {
    const normalizedData = normalizeWasiProbePayload(data);
    if (!normalizedData || !prop) return;
    const isLocationRestricted = Boolean(locationRestricted || prop._locationRestricted);

    const mergedDetail = {
        ...normalizedData,
        titulo: normalizeDisplayText(normalizedData.titulo || normalizedData.title || normalizedData.nombre || prop.titulo),
        ubicacion: isLocationRestricted
            ? ''
            : normalizeDisplayText(normalizedData.ubicacion || normalizedData.location || normalizedData.ciudad || prop.ubicacion),
        descripcionCorta: normalizeDisplayText(
            normalizedData.descripcionCorta
            || normalizedData.observaciones
            || normalizedData.descripcion
            || normalizedData.description
            || prop.descripcionCorta
        ),
        zona: isLocationRestricted ? '' : normalizeDisplayText(normalizedData.zona || prop.zona),
        direccion: isLocationRestricted ? '' : normalizeDisplayText(normalizedData.direccion || prop.direccion),
        latitude: normalizedData.latitude ?? prop.latitude ?? '',
        longitude: normalizedData.longitude ?? prop.longitude ?? '',
        map: normalizedData.map ?? prop.map ?? '',
        id_publish_on_map: normalizedData.id_publish_on_map ?? prop.id_publish_on_map,
        _locationRestricted: isLocationRestricted,
        precioFormateado: normalizeDisplayText(normalizedData.precioFormateado || normalizedData.precio_formateado || prop.precioFormateado),
        urlReferencia: normalizeDisplayText(normalizedData.urlReferencia || normalizedData.url || normalizedData.link || prop.urlReferencia || prop.url),
        galeriasImagenes: Array.isArray(normalizedData.galeriasImagenes)
            ? normalizedData.galeriasImagenes
            : (Array.isArray(normalizedData.imagenes) ? normalizedData.imagenes : []),
        imagenes: Array.isArray(normalizedData.imagenes)
            ? normalizedData.imagenes
            : (Array.isArray(normalizedData.galeriasImagenes) ? normalizedData.galeriasImagenes : [])
    };

    if (mergedDetail.precio && !mergedDetail.precioFormateado) {
        mergedDetail.precioFormateado = `$${Number(mergedDetail.precio).toLocaleString('es-CO')}`;
    }

    const keys = new Set();
    const directId = String(prop.id || '').trim();
    const propRef = String(referenciaId || '').trim();
    const byUrl = extractPropertyIdFromUrl(prop.url || prop.urlReferencia || prop.urlInmueble || '');
    const detailUrl = extractPropertyIdFromUrl(mergedDetail.urlReferencia || mergedDetail.url || mergedDetail.link || '');
    const detailId = String(mergedDetail.id || '').trim();

    if (directId) keys.add(directId);
    if (propRef) keys.add(propRef);
    if (byUrl) keys.add(byUrl);
    if (detailUrl) keys.add(detailUrl);
    if (detailId) keys.add(detailId);

    const toCache = isLocationRestricted ? sanitizeDetailLocationFields(mergedDetail) : mergedDetail;
    keys.forEach((k) => detailCache.set(String(k), toCache));
}

function setUnavailableVerifyingIndicator(card, show) {
    if (!card) return;
    const details = card.querySelector('.property-details');
    if (!details) return;
    const existing = details.querySelector('.property-unavailable-verifying');
    if (!show) {
        existing?.remove();
        return;
    }
    if (existing) return;

    const el = document.createElement('div');
    el.className = 'property-unavailable-verifying';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    const spin = document.createElement('span');
    spin.className = 'verifying-mini-spinner';
    spin.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'verifying-mini-text';
    text.textContent = 'Verificando disponibilidad…';

    el.appendChild(spin);
    el.appendChild(text);

    const ribbon = details.querySelector('.property-unavailable-ribbon');
    if (ribbon) ribbon.after(el);
    else details.prepend(el);
}

async function tryRecoverUnavailableProperty(prop, displayPropertyId, cardEl) {
    const ref = String(displayPropertyId || '').trim();
    if (!ref || !prop) return;

    setUnavailableVerifyingIndicator(cardEl, true);
    try {
        const refreshIfNeeded = () => {
            const stillUnavailable = isUnavailablePropertyView(prop, {
                title: normalizeDisplayText(prop.titulo),
                location: normalizeDisplayText(prop.ubicacion),
                description: normalizeDisplayText(prop.descripcionCorta)
            });
            if (!stillUnavailable) renderCurrentTab();
        };

        const probeData = await api.getWasiPropertyByReferencia(ref);
        if (probeData) {
            markExternallyRecoveredReference(ref);
            applyLocationRestrictionToProperty(prop);
            applyWasiProbeDataToProperty(prop, probeData);
            cacheRecoveredDetail(prop, probeData, ref, { locationRestricted: true });
            refreshIfNeeded();
            if (!isUnavailablePropertyView(prop, {
                title: normalizeDisplayText(prop.titulo),
                location: normalizeDisplayText(prop.ubicacion),
                description: normalizeDisplayText(prop.descripcionCorta)
            })) return;
        }

        const scrapeResult = await api.scrapeInmuebleByReferencia(ref);
        const scrapeData = scrapeResult?.data || null;
        if (!scrapeData) return;
        markExternallyRecoveredReference(ref);
        applyLocationRestrictionToProperty(prop);
        applyWasiProbeDataToProperty(prop, scrapeData);
        cacheRecoveredDetail(prop, scrapeData, ref, { locationRestricted: true });
        refreshIfNeeded();
    } finally {
        if (cardEl?.isConnected) setUnavailableVerifyingIndicator(cardEl, false);
    }
}

// ============================================================
// API Service
// ============================================================
const detailCache = new Map();
let detailAbortCtrl = null;

function loadVitrinaSessionCache(token) {
    try {
        const raw = sessionStorage.getItem(VITRINA_SESSION_PREFIX + token);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function saveVitrinaSessionCache(token, data) {
    try {
        sessionStorage.setItem(VITRINA_SESSION_PREFIX + token, JSON.stringify(data));
    } catch {
        /* quota u otro */
    }
}

async function readResponseJsonOrEmpty(res) {
    const text = await res.text();
    if (!text) return { inmuebles: [], asesor: {} };
    try {
        return JSON.parse(text);
    } catch {
        return { inmuebles: [], asesor: {} };
    }
}

/**
 * Una petición GET a vitrina. Contrato backend:
 * - 200: lista completa (totalInmuebles === inmuebles.length cuando viene totalInmuebles).
 * - 503: degradación; mismo JSON posible con inmuebles.length < totalInmuebles (no tratar como completa).
 * - 304: sin cuerpo; usar último 200 válido en sessionStorage o forzar nueva representación.
 */
async function vitrinaFetchOnce(token, { cacheBust = false, allowHttpCache = true } = {}, depth304 = 0) {
    const url = cacheBust
        ? `${API_BASE}/${token}?_ts=${Date.now()}`
        : `${API_BASE}/${token}`;

    const fetchOpts = { headers: TUNNEL_HEADERS };
    if (!allowHttpCache) fetchOpts.cache = 'no-store';

    const res = await fetch(url, fetchOpts);

    if (res.status === 304) {
        const cached = loadVitrinaSessionCache(token);
        if (cached) return { outcome: 'ok', data: cached };
        if (depth304 >= VITRINA_304_MAX_DEPTH) {
            throw new Error('Vitrina: respuesta 304 sin cuerpo y sin datos en caché local. Recarga la página.');
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

const api = {
    async getVitrina(token, options = {}) {
        const r = await vitrinaFetchOnce(token, options);
        if (r.outcome === 'partial') {
            const err = new Error('VITRINA_503');
            err.code = 'VITRINA_503';
            err.partialData = r.data;
            throw err;
        }
        return r.data;
    },

    async getHistorico(token) {
        const url = `${BACKEND_ORIGIN}/api/v1/historico-inmuebles/por-cliente/${token}`;
        const res = await fetch(url, { headers: TUNNEL_HEADERS });
        if (!res.ok) await handleApiError(res);
        return res.json();
    },

    async getWasiPropertyByReferencia(referencia) {
        const ref = String(referencia || '').trim();
        if (!ref) return null;

        const cacheKey = `wasi-ref-${ref}`;
        if (unavailableProbeCache.has(cacheKey)) {
            return unavailableProbeCache.get(cacheKey);
        }
        if (unavailableProbeInFlight.has(cacheKey)) {
            return unavailableProbeInFlight.get(cacheKey);
        }

        const url = `https://api.wasi.co/v1/property/search?id_company=4175603&wasi_token=jzgY_bsS4_fR9F_G1t1&scope=3&referencia=${encodeURIComponent(ref)}`;
        const probePromise = (async () => {
            try {
                const res = await fetch(url);
                if (!res.ok) return null;
                const raw = await res.json();
                const normalized = normalizeWasiProbePayload(raw);
                unavailableProbeCache.set(cacheKey, normalized || null);
                return normalized || null;
            } catch {
                unavailableProbeCache.set(cacheKey, null);
                return null;
            } finally {
                unavailableProbeInFlight.delete(cacheKey);
            }
        })();

        unavailableProbeInFlight.set(cacheKey, probePromise);
        return probePromise;
    },

    async scrapeInmuebleByReferencia(referencia) {
        const ref = String(referencia || '').trim();
        if (!ref) return null;

        const cacheKey = `n8n-scrape-${ref}`;
        if (n8nScrapeCache.has(cacheKey)) {
            return unwrapN8nScrapeCacheEntry(n8nScrapeCache.get(cacheKey));
        }
        if (n8nScrapeInFlight.has(cacheKey)) {
            return n8nScrapeInFlight.get(cacheKey);
        }

        const scrapePromise = (async () => {
            try {
                const res = await fetch(N8N_SCRAPE_INMUEBLE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: ref })
                });

                let body = {};
                try {
                    const text = await res.text();
                    if (text) body = JSON.parse(text);
                } catch {
                    body = {};
                }

                // 200 y 422 son respuestas de negocio esperadas; solo parsear JSON.
                if (res.status === 200 || res.status === 422) {
                    const parsed = parseN8nScrapeResponseBody(body);
                    const entry = parsed.data
                        ? parsed.data
                        : { data: null, rejection: parsed.rejection };
                    n8nScrapeCache.set(cacheKey, entry);
                    return parsed;
                }

                n8nScrapeCache.set(cacheKey, { data: null, rejection: null });
                return { data: null, rejection: null };
            } catch {
                n8nScrapeCache.set(cacheKey, { data: null, rejection: null });
                return { data: null, rejection: null };
            } finally {
                n8nScrapeInFlight.delete(cacheKey);
            }
        })();

        n8nScrapeInFlight.set(cacheKey, scrapePromise);
        return scrapePromise;
    },

    async getComentarios(token) {
        const url = `${API_BASE}/${token}/comentarios`;
        const res = await fetch(url, { headers: TUNNEL_HEADERS });
        if (!res.ok) await handleApiError(res);
        const data = await res.json();
        return {
            contactId: String(data?.contactId || token || '').trim(),
            total: Number(data?.total) || 0,
            comentarios: Array.isArray(data?.comentarios) ? data.comentarios : []
        };
    },

    async getPropertyDetail(token, wasiId, options = {}) {
        const { cancelPrevious = false } = options;
        const cacheKey = String(wasiId || '').trim();
        // Cache hit — devolver inmediatamente sin red
        if (detailCache.has(cacheKey)) return detailCache.get(cacheKey);
        if (detailCache.has(wasiId)) return detailCache.get(wasiId);

        // Solo cancelar petición previa en flujos interactivos (modal),
        // nunca en cargas en paralelo como el historial.
        let signal;
        if (cancelPrevious) {
            if (detailAbortCtrl) detailAbortCtrl.abort();
            detailAbortCtrl = new AbortController();
            signal = detailAbortCtrl.signal;
        }

        const isNumeric = /^\d+$/.test(String(wasiId));
        let data;

        try {
            if (isNumeric) {
                const res = await fetch(`${API_BASE}/${token}/inmuebles/${wasiId}`, {
                    headers: TUNNEL_HEADERS,
                    signal
                });
                if (!res.ok) await handleApiError(res);
                data = await res.json();
            } else {
                const res = await fetch(`${PRIVADOS_API}/${wasiId}`, { signal });
                if (!res.ok) await handleApiError(res);
                data = await res.json();

                if (data.imagenes && !data.galeriasImagenes) data.galeriasImagenes = data.imagenes;
                if (data.precio && !data.precioFormateado) {
                    data.precioFormateado = `$${Number(data.precio).toLocaleString('es-CO')}`;
                }
                data._externalDataSource = true;
                data._locationRestricted = true;
                markExternallyRecoveredReference(wasiId);
            }

            detailCache.set(cacheKey, data);
            detailCache.set(wasiId, data);
            return data;
        } catch (err) {
            if (err.name === 'AbortError') return; // ignorar cancelaciones voluntarias
            throw err;
        }
    },

    async aprobar(token, url) {
        const res = await fetch(`${API_BASE}/${token}/estado/aprobar`, {
            method:  'PATCH',
            headers: { ...TUNNEL_HEADERS, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ url })
        });
        if (!res.ok) await handleApiError(res);
        return res.ok;
    },

    async descartar(token, url) {
        const res = await fetch(`${API_BASE}/${token}/estado/descartar`, {
            method:  'PATCH',
            headers: { ...TUNNEL_HEADERS, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ url })
        });
        if (!res.ok) await handleApiError(res);
        return res.ok;
    },

    async visitar(token, url) {
        const res = await fetch(`${API_BASE}/${token}/estado/visitar`, {
            method:  'PATCH',
            headers: { ...TUNNEL_HEADERS, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ url })
        });
        if (!res.ok) await handleApiError(res);
        return res.ok;
    },

    /**
     * Notifica ingreso a la vitrina (HubSpot vía middleware). Éxito típico: 204 sin cuerpo.
     */
    async notificarVisita(payload) {
        const contactId = String(payload?.contactId || '').trim();
        if (!contactId) throw new Error('contactId requerido');

        const body = { contactId };
        const nombre = String(payload?.nombreProspecto || '').trim();
        if (nombre) body.nombreProspecto = nombre;
        const disp = String(payload?.dispositivo || '').trim();
        if (disp) body.dispositivo = disp;

        const res = await fetch(`${API_BASE}/notificar-visita`, {
            method:  'POST',
            headers: { ...TUNNEL_HEADERS, 'Content-Type': 'application/json' },
            body:    JSON.stringify(body)
        });

        if (res.ok) return;
        await handleApiError(res);
    }
};

function getDeviceLabelForNotificacion() {
    try {
        if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
            return navigator.userAgentData.mobile ? 'Mobile' : 'Desktop';
        }
    } catch { /* ignore */ }
    const ua = navigator.userAgent || '';
    return /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) ? 'Mobile' : 'Desktop';
}

/**
 * Fire-and-forget: una sola vez por sesión de navegador y contactId (sessionStorage).
 */
function tryNotifyVitrinaVisitOnce(contactId, options = {}) {
    const id = String(contactId || '').trim();
    if (!id) return;

    const sessionKey = `${VITRINA_VISITA_SESSION_PREFIX}${id}`;
    try {
        if (sessionStorage.getItem(sessionKey) === '1') return;
    } catch { /* ignore */ }

    const nombreRaw = String(options.nombreProspecto || '').trim();
    const payload = {
        contactId: id,
        dispositivo: getDeviceLabelForNotificacion()
    };
    if (nombreRaw) payload.nombreProspecto = nombreRaw;

    void (async () => {
        try {
            await api.notificarVisita(payload);
            try {
                sessionStorage.setItem(sessionKey, '1');
            } catch { /* ignore */ }
        } catch (e) {
            console.warn('[Vitrina] notificar-visita:', e);
        }
    })();
}


// ============================================================
// Helpers
// ============================================================
function getEstado(prop) {
    const e = (prop.estado || '').toUpperCase();
    if (e === 'APROBADO')   return 'aprobado';
    if (e === 'DESCARTADO') return 'descartado';
    if (e === 'VISITADO')   return 'visitado';

    // Prevención bilingüe: Airtable usa prop.url, Wasi usa prop.urlReferencia
    const url = (prop.url || prop.urlReferencia || '').toUpperCase();
    if (url.endsWith('-APROBADO'))   return 'aprobado';
    if (url.endsWith('-DESCARTADO')) return 'descartado';
    if (url.endsWith('-VISITADO'))   return 'visitado';

    return 'sin-revisar';
}

function buildUrlWasi(prop) {
    return prop.urlReferencia || '';
}

function formatHistoryDate(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('es-CO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return isoString;
    }
}

function normalizeHistoryState(estadoCodigo) {
    const code = String(estadoCodigo || '').toUpperCase();
    if (code === 'APROBADO') return 'APROBADO';
    if (code === 'DESCARTADO') return 'DESCARTADO';
    if (code === 'VISITADO') return 'VISITADO';
    if (code === 'REVISADO') return 'REVISADO';
    return 'SIN_REVISAR';
}

function getLatestHistoryByProperty(histData) {
    const latestByCode = new Map();
    (histData || []).forEach(item => {
        const propertyId = getHistoryPropertyId(item);
        if (!propertyId) return;

        const prev = latestByCode.get(propertyId);
        if (!prev) {
            latestByCode.set(propertyId, { ...item, _propertyId: propertyId });
            return;
        }
        const prevTs = Date.parse(prev.fechaCreacion || 0) || 0;
        const currTs = Date.parse(item.fechaCreacion || 0) || 0;
        if (currTs >= prevTs) latestByCode.set(propertyId, { ...item, _propertyId: propertyId });
    });
    return Array.from(latestByCode.values());
}

function normalizePropertyItem(item, index) {
    if (!item || typeof item !== 'object') {
        return {
            id: `unknown-${index}`,
            titulo: 'Inmueble sin información completa',
            ubicacion: '',
            descripcionCorta: '',
            imagenUrl: '',
            urlReferencia: '',
            estado: ''
        };
    }
    return item;
}

function normalizePropertiesList(inmuebles) {
    if (!Array.isArray(inmuebles)) return [];
    return inmuebles.map((item, index) => normalizePropertyItem(item, index));
}

function getDeclaredPropertyCount(data) {
    const candidates = [data?.totalInmuebles, data?.cantidadInmuebles, data?.total];
    for (const v of candidates) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) return n;
    }
    return null;
}

/** true si no hay total declarado (legacy) o si cumple totalInmuebles === inmuebles.length */
function isVitrinaPayloadComplete(data) {
    const total = getDeclaredPropertyCount(data);
    const len = Array.isArray(data?.inmuebles) ? data.inmuebles.length : 0;
    if (total === null) return true;
    if (len !== total) {
        console.warn('[Vitrina] Contrato: totalInmuebles !== inmuebles.length', { totalInmuebles: total, length: len });
        return false;
    }
    return true;
}

function logVitrina200OptionalCheck(data) {
    if (!data || !Array.isArray(data.inmuebles)) return;
    const total = getDeclaredPropertyCount(data);
    if (total === null) return;
    if (data.inmuebles.length !== total) {
        console.warn('[Vitrina] 200 OK pero totalInmuebles no coincide con length (no debería ocurrir).', {
            totalInmuebles: total,
            length: data.inmuebles.length
        });
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function maybeVerifyWhenNoDeclaredTotal(token, data) {
    if (getDeclaredPropertyCount(data) !== null) return data;

    const verify = await vitrinaFetchOnce(token, { cacheBust: true, allowHttpCache: false });
    if (verify.outcome === 'partial') return data;

    const dLen = Array.isArray(data?.inmuebles) ? data.inmuebles.length : 0;
    const vLen = Array.isArray(verify.data?.inmuebles) ? verify.data.inmuebles.length : 0;
    if (vLen > dLen) return verify.data;
    return data;
}

/**
 * Carga vitrina cumpliendo contrato backend: 503 → reintentar con backoff; 200 incompleto vs totalInmuebles → reintentar;
 * primer intento híbrido (caché HTTP); sin total declarado → verificación opcional legacy.
 */
async function fetchMostCompleteVitrinaData(token) {
    let backoff = VITRINA_503_BACKOFF_MS;
    const maxRounds = Math.max(VITRINA_503_MAX_RETRIES, VITRINA_FETCH_ATTEMPTS + 2);

    for (let i = 0; i < maxRounds; i++) {
        const useHttpCache = i === 0;
        const r = await vitrinaFetchOnce(token, {
            cacheBust: !useHttpCache,
            allowHttpCache: useHttpCache
        });

        if (r.outcome === 'partial') {
            console.warn('[Vitrina] 503 — respuesta degradada, reintentando con backoff…', { intento: i + 1 });
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

        // 200 (u ok) pero totalInmuebles no coincide con length: reintentar sin caché
        console.warn('[Vitrina] Lista incoherente con totalInmuebles, reintentando sin caché…', { intento: i + 1 });
        await sleep(Math.min(300 * (i + 1), 2000));
    }

    throw new Error(
        'La vitrina no está disponible por completo en este momento (servicio degradado). Intenta de nuevo en unos minutos.'
    );
}

// ============================================================
// UI: DOM references
// ============================================================
const elPropertyList  = document.getElementById('property-list');
const elLoadingState  = document.getElementById('loading-state');
const elEmptyState    = document.getElementById('empty-state');
const elEmptyIcon     = document.getElementById('empty-icon');
const elEmptyTitle    = document.getElementById('empty-title');
const elEmptyDesc     = document.getElementById('empty-desc');
const elAgentProfile  = document.getElementById('agent-profile');
const elModal         = document.getElementById('detail-modal');
const elModalBody     = document.getElementById('modal-body');
const elModalClose    = document.querySelector('.modal-close');
const elTemplate      = document.getElementById('property-card-template');
const elTabBtns       = document.querySelectorAll('.tab-btn');
const elBadgeSin      = document.getElementById('badge-sin-revisar');
const elBadgeApr      = document.getElementById('badge-aprobadas');
const elBadgeDes      = document.getElementById('badge-descartadas');
const elBadgeVis      = document.getElementById('badge-visitados');
const elHistoricoPagination = document.getElementById('historico-pagination');
const elHistoricoPrev = document.getElementById('historico-prev');
const elHistoricoNext = document.getElementById('historico-next');
const elHistoricoPageInfo = document.getElementById('historico-page-info');
const elHistoricoLoading = document.getElementById('historico-loading');
const elPropertyMainWrap = document.getElementById('property-main-wrap');
const elImportantInfoSection = document.getElementById('important-info-section');
const elImportantInfoToggle = document.getElementById('important-info-toggle');
const elImportantInfoChevron = elImportantInfoToggle?.querySelector('.important-info-chevron');
const elImportantInfoPanel = document.getElementById('important-info-panel');
const elImportantInfoContent = document.getElementById('important-info-content');

// ============================================================
// Helpers: Phone Parsing
// ============================================================
/**
 * Parses a phone string that may contain an extension.
 * Handles:
 *   - "3209929718 extensión 101"  (text with accent variants / encoding issues)
 *   - "1013209929718"             (extension prepended as digits)
 * Returns { main, ext } — ext is empty string if none found.
 */
function parsePhone(raw) {
    if (!raw) return { main: '', ext: '' };

    // Case 1: contains text keyword "extensi" (handles encoding variants: extensión / extensiÃ³n / extension)
    const textMatch = raw.match(/^([\d\s\(\)\+\-]+?)\s*extensi[^0-9]*(\d+)/i);
    if (textMatch) {
        return { main: textMatch[1].trim(), ext: textMatch[2].trim() };
    }

    // Case 2: pure digit string longer than 10 digits — first N extras are the extension
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 10) {
        const ext  = digits.slice(0, digits.length - 10);
        const main = digits.slice(digits.length - 10);
        return { main, ext };
    }

    return { main: raw.trim(), ext: '' };
}


function renderAgent(agent) {
    if (!agent) return;

    const { main: phoneMain, ext } = parsePhone(agent.telefono);
    const phoneHTML = phoneMain
        ? `<span class="phone-number">${phoneMain}</span>${ext
            ? ` &nbsp;<span class="phone-ext">Ext. ${ext}</span>`
            : ''}`
        : '';

    elAgentProfile.innerHTML = `
        <img src="${agent.fotoUrl || 'https://via.placeholder.com/150'}"
             alt="Foto de ${agent.nombreCompleto || 'Asesor'}"
             class="agent-photo">
        <div class="agent-info-col">
            <h2 class="agent-card-title">TU ASESOR ENCARGADO</h2>
            <h3 class="agent-name">${agent.nombreCompleto || 'Asesor Inmobiliario'}</h3>
            <div class="agent-details">
                <p>${agent.correo || ''}</p>
                <p class="agent-phone"><strong>Tel:</strong> ${phoneHTML}</p>
            </div>
        </div>
        <a href="${agent.linkMeeting || '#'}" target="_blank" class="agent-action-btn">
            Agendar Reunión
        </a>
    `;
}

function isImportantInfoMobileDockViewport() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 900px)').matches;
}

function syncImportantInfoMobileDockPadding() {
    if (!elPropertyMainWrap || !elImportantInfoSection) return;
    const dockActive = state.activeTab === 'aprobadas'
        && shouldShowImportantInfoSidebar()
        && state.importantInfo.embedMode
        && isImportantInfoMobileDockViewport();

    if (!dockActive) {
        document.documentElement.style.removeProperty('--vitrina-important-dock-pad');
        return;
    }

    requestAnimationFrame(() => {
        const h = elImportantInfoSection.offsetHeight || 0;
        const extra = 16;
        document.documentElement.style.setProperty(
            '--vitrina-important-dock-pad',
            `${Math.ceil(h + extra)}px`
        );
    });
}

let importantInfoDockResizeTimer;
function scheduleImportantInfoDockPaddingSync() {
    window.clearTimeout(importantInfoDockResizeTimer);
    importantInfoDockResizeTimer = window.setTimeout(syncImportantInfoMobileDockPadding, 120);
}

function formatCommentDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('es-CO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return String(iso);
    }
}

function escapeAttrSelector(value) {
    const s = String(value ?? '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(s);
    }
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Localiza la tarjeta de inmueble por código (data-property-code).
 * Intenta coincidencia exacta y, si hace falta, compara con los códigos del DOM.
 */
function findPropertyCardByCode(propertyCode) {
    const raw = String(propertyCode || '').trim();
    if (!raw) return null;

    const esc = escapeAttrSelector(raw);
    let card = elPropertyList.querySelector(`.property-card[data-property-code="${esc}"]`);
    if (card) return card;

    const cards = elPropertyList.querySelectorAll('.property-card[data-property-code]');
    const norm = (x) => String(x || '').trim();
    const rawLower = raw.toLowerCase();
    for (const c of cards) {
        const pc = norm(c.dataset.propertyCode);
        if (pc === raw) return c;
        if (pc.toLowerCase() === rawLower) return c;
    }
    if (/^\d+$/.test(raw)) {
        for (const c of cards) {
            const pc = norm(c.dataset.propertyCode);
            if (pc === raw) return c;
            const digits = pc.replace(/\D/g, '');
            if (digits === raw || pc.endsWith(raw) || raw.endsWith(pc)) return c;
        }
    }
    return null;
}

const PROPERTY_CARD_HIGHLIGHT_MS = 2800;

function scrollToPropertyCardByCode(propertyCode) {
    const code = String(propertyCode || '').trim();
    if (!code) return;

    const card = findPropertyCardByCode(code);
    if (!card) {
        showToast(`No se encontró el inmueble ${code} en esta lista.`);
        return;
    }

    card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    card.classList.remove('property-card-highlight');
    // Reflow para reiniciar la animación si ya estaba resaltada
    void card.offsetWidth;
    card.classList.add('property-card-highlight');

    let fallbackTimer = null;
    const onAnimEnd = (e) => {
        if (e.animationName !== 'property-card-spotlight') return;
        if (fallbackTimer != null) {
            window.clearTimeout(fallbackTimer);
            fallbackTimer = null;
        }
        card.classList.remove('property-card-highlight');
        card.removeEventListener('animationend', onAnimEnd);
    };
    card.addEventListener('animationend', onAnimEnd);
    fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null;
        card.classList.remove('property-card-highlight');
        card.removeEventListener('animationend', onAnimEnd);
    }, PROPERTY_CARD_HIGHLIGHT_MS);
}

function renderImportantInfoPanel() {
    if (!elImportantInfoPanel || !elImportantInfoContent || !elImportantInfoToggle) return;

    const infoState = state.importantInfo;
    const mobileDock = isImportantInfoMobileDockViewport();
    const embedPanelOpen = infoState.embedMode
        && (!mobileDock || !infoState.mobileDockCollapsed);
    const panelOpen = infoState.open || embedPanelOpen;
    elImportantInfoPanel.classList.toggle('hidden', !panelOpen);
    elImportantInfoToggle.setAttribute('aria-expanded', panelOpen ? 'true' : 'false');
    if (elImportantInfoChevron) {
        if (infoState.embedMode && mobileDock) {
            elImportantInfoChevron.textContent = infoState.mobileDockCollapsed ? '▲' : '▼';
        } else if (infoState.embedMode) {
            elImportantInfoChevron.textContent = '';
        } else {
            elImportantInfoChevron.textContent = panelOpen ? '▴' : '▾';
        }
    }
    if (!panelOpen) {
        scheduleImportantInfoDockPaddingSync();
        return;
    }

    if (!infoState.comments.length) {
        elImportantInfoContent.innerHTML = '';
        scheduleImportantInfoDockPaddingSync();
        return;
    }

    elImportantInfoContent.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'important-info-comments-list';

    infoState.comments.forEach((item) => {
        const row = document.createElement('article');
        row.className = 'important-info-comment-item';

        const bubble = document.createElement('div');
        bubble.className = 'important-info-bubble';

        const text = document.createElement('p');
        text.className = 'important-info-comment-text';
        text.textContent = normalizeDisplayText(item?.comentario) || 'Comentario sin contenido';

        const meta = document.createElement('div');
        meta.className = 'important-info-comment-meta';
        const commentId = String(item?.id || '').trim();
        const dateText = formatCommentDate(item?.creadoEn);

        const goToInmueble = () => scrollToPropertyCardByCode(commentId);

        const inmuebleLink = document.createElement('span');
        inmuebleLink.className = 'important-info-comment-link';
        inmuebleLink.textContent = `Inmueble: ${commentId || 'N/D'}`;
        if (commentId) {
            row.classList.add('important-info-comment-item--clickable');
            row.setAttribute('role', 'button');
            row.setAttribute('tabindex', '0');
            row.setAttribute(
                'aria-label',
                `Ir al inmueble ${commentId} en la lista`
            );
            row.addEventListener('click', goToInmueble);
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToInmueble();
                }
            });
        } else {
            inmuebleLink.classList.add('important-info-comment-link--muted');
        }

        meta.appendChild(inmuebleLink);
        if (dateText) {
            const dateNode = document.createElement('span');
            dateNode.textContent = ` · ${dateText}`;
            meta.appendChild(dateNode);
        }

        bubble.appendChild(text);
        bubble.appendChild(meta);
        row.appendChild(bubble);
        list.appendChild(row);
    });

    elImportantInfoContent.appendChild(list);
    scheduleImportantInfoDockPaddingSync();
}

/** Panel lateral solo cuando ya hay datos y existe al menos un comentario (sin estado de carga visible). */
function shouldShowImportantInfoSidebar() {
    const info = state.importantInfo;
    if (!info.loaded) return false;
    return Array.isArray(info.comments) && info.comments.length > 0;
}

function renderImportantInfoVisibility() {
    const isAprobadas = state.activeTab === 'aprobadas';

    if (!isAprobadas) {
        if (elPropertyMainWrap) {
            elPropertyMainWrap.classList.remove('property-main-wrap--aprobadas-split');
        }
        if (elImportantInfoSection) {
            elImportantInfoSection.classList.add('hidden');
            elImportantInfoSection.classList.remove('important-info--embed');
            elImportantInfoSection.classList.remove('important-info--mobile-dock-collapsed');
        }
        state.importantInfo.embedMode = false;
        state.importantInfo.open = false;
        state.importantInfo.mobileDockCollapsed = false;
        if (elImportantInfoPanel && elImportantInfoToggle) {
            elImportantInfoPanel.classList.add('hidden');
            elImportantInfoToggle.setAttribute('aria-expanded', 'false');
            if (elImportantInfoChevron) elImportantInfoChevron.textContent = '▾';
        }
        syncImportantInfoMobileDockPadding();
        return;
    }

    if (!state.importantInfo.loaded && !state.importantInfo.loading) {
        void fetchImportantInfoComments();
    }

    const showSidebar = shouldShowImportantInfoSidebar();

    if (elPropertyMainWrap) {
        elPropertyMainWrap.classList.toggle('property-main-wrap--aprobadas-split', showSidebar);
    }

    if (!elImportantInfoSection) return;

    if (!showSidebar) {
        elImportantInfoSection.classList.add('hidden');
        elImportantInfoSection.classList.remove('important-info--embed');
        elImportantInfoSection.classList.remove('important-info--mobile-dock-collapsed');
        state.importantInfo.embedMode = false;
        state.importantInfo.open = false;
        state.importantInfo.mobileDockCollapsed = false;
        if (elImportantInfoPanel && elImportantInfoToggle) {
            elImportantInfoPanel.classList.add('hidden');
            elImportantInfoToggle.setAttribute('aria-expanded', 'false');
            if (elImportantInfoChevron) elImportantInfoChevron.textContent = '▾';
        }
        syncImportantInfoMobileDockPadding();
        return;
    }

    elImportantInfoSection.classList.remove('hidden');
    elImportantInfoSection.classList.add('important-info--embed');
    state.importantInfo.embedMode = true;
    state.importantInfo.open = true;
    renderImportantInfoPanel();
    elImportantInfoSection.classList.toggle(
        'important-info--mobile-dock-collapsed',
        isImportantInfoMobileDockViewport() && state.importantInfo.mobileDockCollapsed
    );
    scheduleImportantInfoDockPaddingSync();
}

async function fetchImportantInfoComments() {
    if (state.importantInfo.loading) return;
    state.importantInfo.loading = true;
    state.importantInfo.error = '';

    try {
        const data = await api.getComentarios(state.token);
        const comments = Array.isArray(data.comentarios) ? data.comentarios : [];
        state.importantInfo.comments = comments;
        state.importantInfo.error = '';
    } catch (err) {
        console.error('Error loading comentarios:', err);
        state.importantInfo.comments = [];
        state.importantInfo.error = '';
    } finally {
        state.importantInfo.loading = false;
        state.importantInfo.loaded = true;
        renderImportantInfoVisibility();
    }
}


// ============================================================
// UI: Tab Badges
// ============================================================
function updateBadges() {
    const counts = { 'sin-revisar': 0, aprobado: 0, descartado: 0, visitado: 0 };
    state.properties.forEach(p => { counts[getEstado(p)]++; });
    elBadgeSin.textContent = counts['sin-revisar'];
    elBadgeApr.textContent = counts.aprobado;
    elBadgeDes.textContent = counts.descartado;
    if (elBadgeVis) elBadgeVis.textContent = counts.visitado;
}

// ============================================================
// UI: Render Properties
// ============================================================
function renderCurrentTab() {
    // Remove previous cards
    elPropertyList.querySelectorAll('.property-card').forEach(c => c.remove());
    elEmptyState.classList.add('hidden');
    elHistoricoPagination.classList.add('hidden');
    elHistoricoLoading.classList.add('hidden');

    const tab = state.activeTab;
    let filtered = tab === 'historico'
        ? state.historicoData
        : state.properties.filter(p => {
            const e = getEstado(p);
            if (tab === 'sin-revisar')  return e === 'sin-revisar';
            if (tab === 'aprobadas')    return e === 'aprobado';
            if (tab === 'descartadas')  return e === 'descartado';
            if (tab === 'visitados')    return e === 'visitado';
            return false;
        });

    if (tab === 'historico') {
        const totalPages = Math.max(1, Math.ceil(state.historicoData.length / HISTORICO_PAGE_SIZE));
        if (state.historicoPage > totalPages) state.historicoPage = totalPages;
        if (state.historicoPage < 1) state.historicoPage = 1;

        const start = (state.historicoPage - 1) * HISTORICO_PAGE_SIZE;
        filtered = state.historicoData.slice(start, start + HISTORICO_PAGE_SIZE);

        if (state.historicoData.length > HISTORICO_PAGE_SIZE) {
            elHistoricoPagination.classList.remove('hidden');
            elHistoricoPageInfo.textContent = `Página ${state.historicoPage} de ${totalPages}`;
            elHistoricoPrev.disabled = state.historicoPage === 1;
            elHistoricoNext.disabled = state.historicoPage === totalPages;
        }
    }
    if (tab !== 'historico') filtered = [...filtered].reverse();

    renderImportantInfoVisibility();

    if (filtered.length === 0) {
        showEmptyState(tab);
        return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach(prop => {
        const clone = elTemplate.content.cloneNode(true);
        const card  = clone.querySelector('.property-card');
        const imageWrapper = card.querySelector('.property-image-wrapper');
        const detailsEl = card.querySelector('.property-details');
        const titleEl = card.querySelector('.property-title');
        const locationEl = card.querySelector('.property-location');
        const descriptionEl = card.querySelector('.property-description');
        const actionBar = card.querySelector('.action-bar');
        const cleanTitle = normalizeDisplayText(prop.titulo);
        const cleanLocation = shouldRestrictPropertyLocation(prop) ? '' : normalizeDisplayText(prop.ubicacion);
        const cleanDescription = normalizeDisplayText(prop.descripcionCorta);

        card.dataset.id = prop.id;
        const imgEl = card.querySelector('.property-image');
        imgEl.src     = prop.imagenUrl || '';
        imgEl.alt     = prop.titulo || 'Propiedad';
        imgEl.loading = 'lazy';

        const priceBadge = card.querySelector('.price-badge');
        const rawPrice = prop.precioFormateado || '';
        const isZeroPrice = !rawPrice || /^\$?\s*0+([.,]0+)?$/.test(rawPrice.trim());
        if (isZeroPrice) {
            priceBadge.style.display = 'none';
        } else {
            priceBadge.textContent = rawPrice;
        }

        const propertyIdFromUrl = extractPropertyIdFromUrl(prop.url || prop.urlReferencia || prop.urlInmueble || '');
        const displayPropertyId = String(propertyIdFromUrl || prop.codigoNumerico || prop.id || '').trim();
        card.dataset.propertyCode = displayPropertyId;
        const idTab = card.querySelector('.property-id-tab');
        if (idTab && displayPropertyId) {
            idTab.textContent = `ID: ${displayPropertyId}`;
            idTab.classList.remove('hidden');
        }

        const applyUnavailableCardState = () => {
            card.classList.add('property-card-unavailable');
            titleEl.textContent = 'Inmueble no disponible';
            locationEl.classList.add('hidden');
            descriptionEl.classList.add('hidden');
            priceBadge.style.display = 'none';
            imageWrapper.classList.add('property-image-wrapper-unavailable');
            imageWrapper.innerHTML = '<div class="property-unavailable-media">Previsualización de inmueble</div>';
            actionBar.classList.add('hidden');
            actionBar.innerHTML = '';

            const existingRibbon = detailsEl.querySelector('.property-unavailable-ribbon');
            if (!existingRibbon) {
                const ribbon = document.createElement('div');
                ribbon.className = 'property-unavailable-ribbon';
                ribbon.textContent = `El inmueble con id ${displayPropertyId || 'N/D'} ya no se encuentra disponible`;
                detailsEl.prepend(ribbon);
            }
        };

        let unavailableView = isUnavailablePropertyView(prop, {
            title: cleanTitle,
            location: cleanLocation,
            description: cleanDescription
        });

        if (unavailableView) {
            applyUnavailableCardState();

            // Regla especial: Wasi por referencia; si falla o sigue vacío → webhook n8n scrape.
            if (displayPropertyId) void tryRecoverUnavailableProperty(prop, displayPropertyId, card);
        } else {
            titleEl.textContent = cleanTitle;
            if (!shouldRestrictPropertyLocation(prop) && cleanLocation) {
                locationEl.textContent = `📍 ${cleanLocation}`;
                locationEl.classList.remove('hidden');
            } else {
                locationEl.classList.add('hidden');
            }
            if (cleanDescription) {
                descriptionEl.textContent = cleanDescription;
                descriptionEl.classList.remove('hidden');
            } else {
                descriptionEl.classList.add('hidden');
            }
        }

        imgEl.onerror = () => {
            if (card.classList.contains('property-card-unavailable')) return;

            // Si la imagen falla y no hay contenido útil, tratar como no disponible.
            const shouldBecomeUnavailable = !cleanLocation && !cleanDescription;
            if (shouldBecomeUnavailable) {
                unavailableView = true;
                applyUnavailableCardState();
                imageWrapper.style.cursor = 'default';
                titleEl.style.cursor = 'default';
                if (displayPropertyId) void tryRecoverUnavailableProperty(prop, displayPropertyId, card);
                return;
            }

            imageWrapper.classList.add('property-image-wrapper-unavailable');
            imageWrapper.innerHTML = '<div class="property-unavailable-media">Vista previa no disponible</div>';
        };

        const openDetail = () => {
            if (card.classList.contains('property-card-unavailable')) return;
            openPropertyDetail(prop);
        };

        if (!unavailableView) {
            imageWrapper.addEventListener('click', openDetail);
            imageWrapper.style.cursor = 'pointer';
            titleEl.addEventListener('click', openDetail);
            titleEl.style.cursor = 'pointer';
        } else {
            imageWrapper.style.cursor = 'default';
            titleEl.style.cursor = 'default';
        }

        if (tab === 'historico' && prop._historyMeta) {
            const metaDiv = card.querySelector('.property-history-meta');
            const badgeSpan = metaDiv.querySelector('.history-state-badge');
            const dateSpan = metaDiv.querySelector('.history-date');
            const stateCode = normalizeHistoryState(prop._historyMeta.estadoCodigo);
            const badgeText = stateCode === 'APROBADO' ? 'TE INTERESO' : stateCode.replace('_', ' ');
            const badgeClass = stateCode === 'APROBADO' ? 'state-te-intereso' : `state-${stateCode.toLowerCase()}`;

            metaDiv.classList.remove('hidden');
            badgeSpan.textContent = badgeText;
            badgeSpan.className = `history-state-badge ${badgeClass}`;
            dateSpan.textContent = formatHistoryDate(prop._historyMeta.fechaCreacion);
        }

        if (unavailableView) {
            actionBar.classList.add('hidden');
            actionBar.innerHTML = '';
        } else {
            buildActionButtons(actionBar, prop, card, tab);
        }

        fragment.appendChild(card);
    });

    elPropertyList.appendChild(fragment);
}

// ============================================================
// UI: Action Buttons (per tab)
// ============================================================
function buildActionButtons(actionBar, prop, card, tab) {
    actionBar.innerHTML = '';

    // Soporte híbrido: Airtable entrega prop.url, Wasi entrega prop.urlReferencia
    const url = prop.url || prop.urlReferencia || '';

    if (tab === 'sin-revisar') {
        actionBar.appendChild(makeBtn('discard', '✕ Descartar', async () => {
            await handleAction(prop, card, 'descartar', url);
        }));
        actionBar.appendChild(makeBtn('approve', '⭐ Me interesa', async () => {
            await handleAction(prop, card, 'aprobar', url);
        }));

    } else if (tab === 'aprobadas') {
        actionBar.appendChild(makeBtn('discard', '✕ Descartar', async () => {
            await handleAction(prop, card, 'descartar', url);
        }));

    } else if (tab === 'descartadas') {
        actionBar.appendChild(makeBtn('approve', '⭐ Me interesa nuevamente', async () => {
            await handleAction(prop, card, 'aprobar', url);
        }));

    }
    // 'visitados' and 'historico' → no buttons (read-only)
}

function makeBtn(type, label, onClick) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = type === 'approve'
        ? 'btn btn-approve'
        : 'btn btn-discard-tab';
    btn.innerHTML = label;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
}

// ============================================================
// UI: Empty State
// ============================================================
const EMPTY_COPY = {
    'sin-revisar': {
        icon:  '',
        title: '¡Todo revisado!',
        desc:  'No hay propiedades pendientes por revisar.'
    },
    'aprobadas': {
        icon:  '',
        title: 'Sin aprobadas aún',
        desc:  'Aprueba propiedades de la sección "Sin revisar" para verlas aquí.'
    },
    'descartadas': {
        icon:  '',
        title: 'Sin descartadas',
        desc:  'No has descartado ninguna propiedad todavía.'
    },
    'visitados': {
        icon:  '',
        title: 'Sin visitados aún',
        desc:  'Las propiedades que hayas visitado aparecerán aquí.'
    },
    'historico': {
        icon:  '',
        title: 'Sin historial',
        desc:  'Aún no hay inmuebles registrados en tu historial.'
    }
};

function showEmptyState(tab) {
    const copy = EMPTY_COPY[tab] || EMPTY_COPY['sin-revisar'];
    elEmptyIcon.textContent  = copy.icon;
    elEmptyTitle.textContent = copy.title;
    elEmptyDesc.textContent  = copy.desc;
    elEmptyState.classList.remove('hidden');
}

async function loadHistoricoTab() {
    elPropertyList.querySelectorAll('.property-card').forEach(c => c.remove());
    elEmptyState.classList.add('hidden');
    elHistoricoPagination.classList.add('hidden');
    elHistoricoLoading.classList.remove('hidden');
    elLoadingState.classList.remove('hidden');

    try {
        const histData = await api.getHistorico(state.token);
        const latestRecords = getLatestHistoryByProperty(histData);

        const details = await Promise.all(latestRecords.map(async item => {
            try {
                const propertyId = item._propertyId || getHistoryPropertyId(item);
                if (!propertyId) return null;

                const pDetail = await api.getPropertyDetail(state.token, propertyId);
                if (!pDetail) return null;
                return {
                    ...pDetail,
                    id: propertyId,
                    imagenUrl: (pDetail.galeriasImagenes && pDetail.galeriasImagenes.length > 0) ? pDetail.galeriasImagenes[0] : '',
                    descripcionCorta: pDetail.observaciones || pDetail.descripcionCorta || '',
                    precioFormateado: pDetail.precioFormateado || (pDetail.precio ? `$${Number(pDetail.precio).toLocaleString('es-CO')}` : ''),
                    urlReferencia: pDetail.urlReferencia || pDetail.url || '',
                    titulo: pDetail.titulo || '',
                    _historyMeta: item,
                    _fromHistorico: true,
                    _locationRestricted: true,
                    _externalDataSource: true
                };
            } catch (err) {
                console.warn('Could not fetch detail for historico item', item._propertyId || item.codigoNumerico, err);
                return null;
            }
        }));

        state.historicoData = details.filter(Boolean);
        state.historicoFetched = true;
        state.historicoPage = 1;
    } catch (e) {
        console.error('Error loading historico', e);
        state.historicoData = [];
        state.historicoFetched = true;
        state.historicoPage = 1;
    } finally {
        elLoadingState.classList.add('hidden');
        elHistoricoLoading.classList.add('hidden');
        renderCurrentTab();
    }
}

// ============================================================
// Action Handler (Aprobar / Descartar)
// ============================================================
function findPropertyInStateById(id) {
    const sid = String(id);
    return state.properties.find(p => String(p.id) === sid)
        || state.historicoData.find(p => String(p.id) === sid)
        || null;
}

async function applyEstadoChange(propRef, action, url) {
    if (action === 'aprobar') {
        await api.aprobar(state.token, url);
        if (propRef) propRef.estado = 'APROBADO';
    } else {
        await api.descartar(state.token, url);
        if (propRef) propRef.estado = 'DESCARTADO';
    }
}

async function handleAction(prop, card, action, url) {
    if (card.classList.contains('processing')) return;
    card.classList.add('processing');

    // Disable all buttons in card
    card.querySelectorAll('button').forEach(b => b.disabled = true);

    try {
        await applyEstadoChange(prop, action, url);

        // Animate removal from current tab
        await animateRemoval(card, action === 'aprobar' ? 'right' : 'left');

        updateBadges();
        renderCurrentTab();  // re-render after state change

    } catch (err) {
        console.error('Action failed:', err);
        showToast('⚠ Hubo un problema, intenta de nuevo.');
        card.classList.remove('processing');
        card.querySelectorAll('button').forEach(b => b.disabled = false);
    }
}

// ============================================================
// Animations & Toast
// ============================================================
function animateRemoval(card, direction) {
    return new Promise(resolve => {
        card.classList.add(direction === 'right' ? 'slide-out-right' : 'slide-out-left');
        setTimeout(() => { card.remove(); resolve(); }, 300);
    });
}

let toastTimer;
function showToast(msg) {
    let toast = document.getElementById('vitrina-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id        = 'vitrina-toast';
        toast.className = 'vitrina-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================================
// Modal: Property Detail
// ============================================================
function getCandidateDetailCacheKeys(listProp, propOrId) {
    const keys = new Set();
    const direct = String(propOrId ?? '').trim();
    const listId = String(listProp?.id ?? '').trim();
    const code = String(listProp?.codigoNumerico ?? '').trim();
    const fromListUrl = extractPropertyIdFromUrl(listProp?.url || listProp?.urlReferencia || listProp?.urlInmueble || '');
    const fromListPropId = String(listProp?.id_inmueble || '').trim();

    if (direct) keys.add(direct);
    if (listId) keys.add(listId);
    if (code) keys.add(code);
    if (fromListUrl) keys.add(fromListUrl);
    if (fromListPropId) keys.add(fromListPropId);
    return Array.from(keys);
}

function findCachedDetailForProperty(listProp, propOrId) {
    const keys = getCandidateDetailCacheKeys(listProp, propOrId);
    for (const key of keys) {
        if (detailCache.has(key)) return detailCache.get(key);
    }
    return null;
}

function openPropertyDetail(propOrId) {
    const listProp = typeof propOrId === 'object' && propOrId !== null
        ? propOrId
        : findPropertyInStateById(propOrId);
    const propertyId = listProp?.id ?? propOrId;

    elModalBody.innerHTML = '<div class="modal-loading"><div class="spinner"></div><p>Cargando detalles...</p></div>';
    elModal.classList.remove('hidden');
    elModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';   // freeze background scroll

    const cachedDetail = findCachedDetailForProperty(listProp, propOrId);
    if (cachedDetail) {
        const prepared = prepareDetailForDisplay(cachedDetail, listProp);
        elModalBody.innerHTML = buildDetailHTML(prepared, listProp);
        initGallery();
        initDetailVideoSection();
        initModalDetailFooter(prepared, listProp);
        initDetailMapSection();
        return;
    }

    api.getPropertyDetail(state.token, propertyId, { cancelPrevious: true })
        .then(d => {
            const prepared = prepareDetailForDisplay(d, listProp);
            elModalBody.innerHTML = buildDetailHTML(prepared, listProp);
            initGallery();
            initDetailVideoSection();
            initModalDetailFooter(prepared, listProp);
            initDetailMapSection();
        })
        .catch(() => {
            const lateCacheDetail = findCachedDetailForProperty(listProp, propOrId);
            if (lateCacheDetail) {
                const prepared = prepareDetailForDisplay(lateCacheDetail, listProp);
                elModalBody.innerHTML = buildDetailHTML(prepared, listProp);
                initGallery();
                initDetailVideoSection();
                initModalDetailFooter(prepared, listProp);
                initDetailMapSection();
                return;
            }
            elModalBody.innerHTML = '<p class="modal-error">Error cargando el detalle del inmueble.</p>';
        });
}

/**
 * Pie del modal: mismas acciones que en la tarjeta según pestaña (no en histórico ni visitados).
 */
function initModalDetailFooter(detail, listProp) {
    const footer = document.getElementById('modal-detail-footer');
    if (!footer) return;

    const tab = state.activeTab;
    if (tab === 'historico' || tab === 'visitados') {
        footer.classList.add('hidden');
        footer.innerHTML = '';
        footer.classList.remove('processing');
        return;
    }

    const url = (detail.urlReferencia || detail.url || listProp?.urlReferencia || listProp?.url || '').trim();
    if (!url) {
        footer.classList.add('hidden');
        footer.innerHTML = '';
        footer.classList.remove('processing');
        return;
    }

    const id = String(listProp?.id ?? detail?.id ?? '').trim();
    const stateTarget = id ? state.properties.find(p => String(p.id) === id) : null;

    footer.classList.remove('hidden', 'processing');
    footer.innerHTML = '';

    const run = async action => {
        if (footer.classList.contains('processing')) return;
        footer.classList.add('processing');
        footer.querySelectorAll('button').forEach(b => { b.disabled = true; });
        try {
            await applyEstadoChange(stateTarget, action, url);
            closeModal();
            updateBadges();
            renderCurrentTab();
        } catch (err) {
            console.error('Modal action failed:', err);
            showToast('⚠ Hubo un problema, intenta de nuevo.');
            footer.classList.remove('processing');
            footer.querySelectorAll('button').forEach(b => { b.disabled = false; });
        }
    };

    if (tab === 'sin-revisar') {
        footer.appendChild(makeBtn('discard', '✕ Descartar', () => run('descartar')));
        footer.appendChild(makeBtn('approve', '⭐ Me interesa', () => run('aprobar')));
    } else if (tab === 'aprobadas') {
        footer.appendChild(makeBtn('discard', '✕ Descartar', () => run('descartar')));
    } else if (tab === 'descartadas') {
        footer.appendChild(makeBtn('approve', '⭐ Me interesa nuevamente', () => run('aprobar')));
    } else {
        footer.classList.add('hidden');
    }
}

function buildPriceBlock(d) {
    const raw = d.precioFormateado || '';

    // Dual price: "Venta: $970.000.000 | Alquiler: $6.500.000"
    if (raw.includes('|')) {
        const parts = raw.split('|').map(s => s.trim());
        const cards = parts.map(part => {
            // Extract label and amount, e.g. "Venta: $970.000.000"
            const match = part.match(/^(.+?):\s*(.+)$/);
            const label = match ? match[1].trim() : '';
            const amount = match ? match[2].trim() : part;
            const isRent = /alquiler|arriendo|renta/i.test(label);
            return `
              <div class="price-card">
                <small>Precio de ${label.toLowerCase()}</small>
                <div class="modal-price">${amount}${isRent ? '<span class="price-period">Mensual</span>' : ''}</div>
                <small>Pesos Colombianos</small>
              </div>`;
        }).join('');
        return `<div class="modal-price-block dual-price">${cards}</div>`;
    }

    // Single price (default)
    return `
      <div class="modal-price-block">
        <small>Precio de ${(d.tipoNegocio || '').toLowerCase()}</small>
        <div class="modal-price">${raw}</div>
        <small>Pesos Colombianos</small>
      </div>`;
}

function isValidHttpUrl(value) {
    if (!value) return false;
    try {
        const parsed = new URL(String(value).trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function getYouTubeEmbedUrl(value) {
    if (!isValidHttpUrl(value)) return '';
    try {
        const parsed = new URL(String(value).trim());
        const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

        if (host === 'youtube.com' || host === 'm.youtube.com') {
            if (parsed.pathname.startsWith('/shorts/')) {
                const id = parsed.pathname.split('/').filter(Boolean)[1];
                return id ? `https://www.youtube.com/embed/${id}` : '';
            }
            if (parsed.pathname === '/watch') {
                const id = parsed.searchParams.get('v');
                return id ? `https://www.youtube.com/embed/${id}` : '';
            }
            if (parsed.pathname.startsWith('/embed/')) {
                const id = parsed.pathname.split('/').filter(Boolean)[1];
                return id ? `https://www.youtube.com/embed/${id}` : '';
            }
        }

        if (host === 'youtu.be') {
            const id = parsed.pathname.split('/').filter(Boolean)[0];
            return id ? `https://www.youtube.com/embed/${id}` : '';
        }
    } catch {
        return '';
    }
    return '';
}

function buildVideoSectionHTML(detail) {
    const rawUrl = String(detail?.video || '').trim();
    if (!rawUrl) return '';

    if (!isValidHttpUrl(rawUrl)) return '';

    const embedUrl = getYouTubeEmbedUrl(rawUrl);
    const actionLabel = embedUrl ? 'Ver video' : 'Abrir enlace de video';

    return `
    <section class="detail-video-section">
      <h3 class="detail-section-title">Video del inmueble</h3>
      <button
        type="button"
        class="video-card-btn"
        data-video-url="${rawUrl}"
        data-video-embed-url="${embedUrl}"
        aria-label="${actionLabel}">
        <span class="video-card-icon">▶</span>
        <span class="video-card-content">
          <strong>${actionLabel}</strong>
          <small>${embedUrl ? 'Se abrirá en vista previa' : 'Se abrirá en una nueva pestaña'}</small>
        </span>
      </button>
    </section>`;
}

function createDetailVideoOverlay() {
    if (detailVideoOverlay) return detailVideoOverlay;
    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';
    overlay.id = 'detail-video-overlay';
    overlay.innerHTML = `
      <div class="video-overlay-dialog" role="dialog" aria-modal="true" aria-label="Video del inmueble">
        <button type="button" class="video-overlay-close" aria-label="Cerrar video">✕</button>
        <div class="video-overlay-frame-wrap">
          <iframe
            id="detail-video-frame"
            class="video-overlay-frame"
            src=""
            title="Video del inmueble"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen>
          </iframe>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDetailVideoOverlay();
    });
    overlay.querySelector('.video-overlay-close')?.addEventListener('click', closeDetailVideoOverlay);

    detailVideoOverlay = overlay;
    return overlay;
}

function openDetailVideoOverlay(embedUrl) {
    if (!embedUrl) return;
    const overlay = createDetailVideoOverlay();
    const frame = overlay.querySelector('#detail-video-frame');
    if (!frame) return;
    frame.src = embedUrl;
    overlay.classList.add('active');
}

function closeDetailVideoOverlay() {
    if (!detailVideoOverlay) return;
    detailVideoOverlay.classList.remove('active');
    const frame = detailVideoOverlay.querySelector('#detail-video-frame');
    if (frame) frame.src = '';
}

function initDetailVideoSection() {
    const btn = document.querySelector('.video-card-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const embedUrl = String(btn.dataset.videoEmbedUrl || '').trim();
        const directUrl = String(btn.dataset.videoUrl || '').trim();

        if (embedUrl) {
            openDetailVideoOverlay(embedUrl);
            return;
        }

        if (isValidHttpUrl(directUrl)) {
            window.open(directUrl, '_blank', 'noopener,noreferrer');
        }
    });
}

function parseCoordinate(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = parseFloat(String(value).trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function getGeoMeta(detail) {
    const publishMode = Number(detail?.id_publish_on_map);
    const latitude = parseCoordinate(detail?.latitude);
    const longitude = parseCoordinate(detail?.longitude);
    const hasCoordinates = latitude !== null && longitude !== null;
    return { publishMode, latitude, longitude, hasCoordinates };
}

function buildMapSectionHTML(detail) {
    const geo = getGeoMeta(detail);
    const isSupportedMode = geo.publishMode === 1 || geo.publishMode === 2 || geo.publishMode === 3;

    if (!isSupportedMode) {
        return `
        <section class="detail-section detail-map-section">
          <h3 class="detail-section-title">Visualizar en Maps</h3>
          <p class="map-status">Ubicación no disponible.</p>
        </section>`;
    }

    if (geo.publishMode === 1) {
        return `
        <section class="detail-section detail-map-section">
          <h3 class="detail-section-title">Visualizar en Maps</h3>
          <p class="map-status map-status-muted">Ubicación no disponible por configuración de privacidad.</p>
        </section>`;
    }

    if (!geo.hasCoordinates) {
        return `
        <section class="detail-section detail-map-section">
          <h3 class="detail-section-title">Visualizar en Maps</h3>
          <p class="map-status">Ubicación no disponible.</p>
        </section>`;
    }

    const locationHint = geo.publishMode === 2
        ? 'Ubicación aproximada'
        : 'Ubicación exacta';

    return `
    <section class="detail-section detail-map-section">
      <h3 class="detail-section-title">Visualizar en Maps</h3>
      <p class="map-status">${locationHint}</p>
      <div
        id="detail-property-map"
        class="property-map"
        data-lat="${geo.latitude}"
        data-lng="${geo.longitude}"
        data-publish-mode="${geo.publishMode}">
      </div>
    </section>`;
}

function destroyDetailMap() {
    if (!detailMapInstance) return;
    detailMapInstance.remove();
    detailMapInstance = null;
}

function initDetailMapSection() {
    destroyDetailMap();

    const mapEl = document.getElementById('detail-property-map');
    if (!mapEl) return;

    if (!window.L) {
        mapEl.outerHTML = '<p class="map-status">No fue posible cargar el mapa.</p>';
        return;
    }

    const lat = parseFloat(mapEl.dataset.lat || '');
    const lng = parseFloat(mapEl.dataset.lng || '');
    const publishMode = Number(mapEl.dataset.publishMode || 3);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (publishMode !== 2 && publishMode !== 3)) {
        mapEl.outerHTML = '<p class="map-status">Ubicación no disponible.</p>';
        return;
    }

    detailMapInstance = window.L.map(mapEl, {
        scrollWheelZoom: false,
        zoomControl: true
    }).setView([lat, lng], publishMode === 2 ? 14 : 16);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(detailMapInstance);

    if (publishMode === 2) {
        const area = window.L.circle([lat, lng], {
            radius: 500,
            color: '#2563EB',
            fillColor: '#60A5FA',
            fillOpacity: 0.22
        }).addTo(detailMapInstance);
        detailMapInstance.fitBounds(area.getBounds(), { padding: [18, 18] });
    } else {
        window.L.marker([lat, lng]).addTo(detailMapInstance);
    }

    setTimeout(() => detailMapInstance?.invalidateSize(), 0);
}

/**
 * Get highest quality image URL by stripping Wasi CDN size suffixes.
 * e.g. "https://static-cf.wasi.co/…/image_340x…" → "https://static-cf.wasi.co/…/image…"
 * This lets the browser request the original full-resolution file.
 */
function transformWasiImageUrl(src, { minWidth, minHeight, maxWidth, maxHeight } = {}) {
    try {
        const url = new URL(src, window.location.origin);
        if (url.hostname !== 'image.wasi.co') return src;

        const encodedPayload = url.pathname.replace(/^\/+/, '');
        if (!encodedPayload) return src;

        const decodeBase64Url = (value) => {
            const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
            const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
            return atob(normalized + padding);
        };

        const encodeBase64Url = (value) =>
            btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

        const payload = JSON.parse(decodeBase64Url(encodedPayload));
        payload.edits = payload.edits || {};
        payload.edits.resize = payload.edits.resize || {};

        const currentWidth = Number(payload.edits.resize.width) || 0;
        const currentHeight = Number(payload.edits.resize.height) || 0;
        let nextWidth = currentWidth;
        let nextHeight = currentHeight;

        if (typeof minWidth === 'number') nextWidth = Math.max(nextWidth || 0, minWidth);
        if (typeof minHeight === 'number') nextHeight = Math.max(nextHeight || 0, minHeight);
        if (typeof maxWidth === 'number') nextWidth = nextWidth ? Math.min(nextWidth, maxWidth) : maxWidth;
        if (typeof maxHeight === 'number') nextHeight = nextHeight ? Math.min(nextHeight, maxHeight) : maxHeight;

        payload.edits.resize.width = nextWidth || currentWidth || 900;
        payload.edits.resize.height = nextHeight || currentHeight || 675;
        payload.edits.resize.fit = payload.edits.resize.fit || 'contain';

        url.pathname = '/' + encodeBase64Url(JSON.stringify(payload));
        return url.toString();
    } catch {
        return src;
    }
}

function getHighQualityUrl(src) {
    if (!src) return src;

    const transformed = transformWasiImageUrl(src, { minWidth: 2400, minHeight: 1800 });
    if (transformed !== src) return transformed;

    // Fallback for old static-cf.wasi.co style suffixes (_340x, _640x, etc.)
    return src.replace(/_\d+x(?=\.|$)/g, '');
}

function getLowQualityUrl(src) {
    if (!src) return src;

    // Small, fast preview while HQ is fetched in background.
    const transformed = transformWasiImageUrl(src, { maxWidth: 700, maxHeight: 520 });
    if (transformed !== src) return transformed;
    return src;
}

const imageLoadCache = new Map();

function preloadImage(src) {
    if (!src) return Promise.reject(new Error('src vacío'));
    if (imageLoadCache.has(src)) return imageLoadCache.get(src);

    const p = new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(src);
        img.onerror = reject;
        img.src = src;
    });
    imageLoadCache.set(src, p);
    return p;
}

function progressiveRenderImage(imgEl, originalSrc, { renderToken, useContainSizes = false } = {}) {
    if (!imgEl || !originalSrc) return;
    const lowSrc = getLowQualityUrl(originalSrc);
    const hqSrc = getHighQualityUrl(originalSrc);

    const token = renderToken || `${Date.now()}-${Math.random()}`;
    imgEl.dataset.renderToken = token;
    imgEl.src = lowSrc;
    imgEl.removeAttribute('srcset');
    imgEl.style.filter = 'blur(2px)';
    imgEl.style.transition = 'filter 220ms ease, opacity 220ms ease, transform 220ms ease';
    if (useContainSizes) imgEl.sizes = '100vw';

    if (!hqSrc || hqSrc === lowSrc) {
        imgEl.style.filter = 'none';
        return;
    }

    preloadImage(hqSrc).then(() => {
        if (imgEl.dataset.renderToken !== token) return;
        imgEl.src = hqSrc;
        imgEl.style.filter = 'none';
    }).catch(() => {
        if (imgEl.dataset.renderToken !== token) return;
        imgEl.style.filter = 'none';
    });
}

/**
 * Frontend-only quality helper:
 * - Keeps current URL as baseline
 * - Adds HQ candidate (if different) through srcset
 * - Lets browser pick best file for DPR/screen size
 */
function applyBestEffortImageQuality(imgEl, src, { sizes = '100vw' } = {}) {
    if (!imgEl || !src) return;
    const hq = getHighQualityUrl(src);
    imgEl.src = src;
    imgEl.sizes = sizes;

    if (hq && hq !== src) {
        imgEl.srcset = `${src} 1x, ${hq} 2x`;
    } else {
        imgEl.removeAttribute('srcset');
    }
}

function preloadGalleryImages(images) {
    (images || []).forEach((src) => {
        if (!src) return;
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
        const hq = getHighQualityUrl(src);
        if (hq && hq !== src) preloadImage(hq).catch(() => {});
    });
}

function buildDetailHTML(d, listProp = null) {
    d = prepareDetailForDisplay(d, listProp);

    const imgs = (d.galeriasImagenes && d.galeriasImagenes.length)
        ? d.galeriasImagenes
        : ['https://via.placeholder.com/800x500?text=Sin+imagen'];

    const thumbs = imgs.map((src, i) =>
        `<img src="${src}" class="gallery-thumb${i === 0 ? ' active' : ''}" data-index="${i}" alt="Foto ${i+1}">`
    ).join('');

    const detailPropertyId = String(
        extractPropertyIdFromUrl(d.url || d.urlReferencia || d.urlInmueble || '')
        || d.codigoNumerico
        || d.id
        || extractPropertyIdFromUrl(listProp?.url || listProp?.urlReferencia || listProp?.urlInmueble || '')
        || listProp?.codigoNumerico
        || listProp?.id
        || ''
    ).trim();
    const isLocationRestricted = Boolean(d?._locationRestricted || listProp?._locationRestricted);

    const specRows = [
        ['ID inmueble',          detailPropertyId],
        ['Tipo de negocio',      d.tipoNegocio],
        ['Tipo de inmueble',     d.tipoInmueble],
        ...(!isLocationRestricted ? [
            ['Ubicación',            d.ubicacion],
            ['Zona',                 d.zona],
            ['Dirección',            d.direccion],
        ] : []),
        ['Estrato',              d.estrato],
        ['Piso',                 d.piso],
        ['Habitaciones',         d.habitaciones],
        ['Baños',                d.banos],
        ['Estacionamiento',      d.estacionamiento],
        ['Área Construida',      d.areaConstruida],
        ['Área Terreno',         d.areaTerreno],
        ['Área Privada',         d.areaPrivada],
        ['Estado físico',        ({'Used':'Usado','New':'Nuevo'}[d.estadoFisico] || d.estadoFisico)],
        ['Año construcción',     d.anioConstruccion],
        ['Valor administración', d.valorAdministracion],
        ['Encargado',            d.encargado],
    ].filter(([, v]) => v && !/^\s*(m²|m2|0)?\s*$/i.test(String(v)));

    const specRows2Col = specRows.map(([k, v]) =>
        `<div class="spec-row"><span class="spec-label">${k}:</span><span class="spec-value">${v}</span></div>`
    ).join('');

    const checkList = (arr) => (arr || []).map(item =>
        `<div class="char-item"><span class="char-check">✓</span>${item}</div>`
    ).join('');

    // Encode image URLs as a data attribute for the lightbox
    const imgsDataAttr = encodeURIComponent(JSON.stringify(imgs));

    return `
      <div class="modal-two-col" data-gallery-images="${imgsDataAttr}">

        <!-- LEFT: Gallery Carousel -->
        <div class="modal-gallery-col">
          <div class="carousel-viewport">
            <div class="carousel-track" id="carousel-track">
              ${imgs.map((src, i) =>
                `<div class="carousel-slide" data-img-index="${i}"><img src="${src}" alt="${d.titulo || ''} - Foto ${i+1}" class="carousel-img" loading="eager"></div>`
              ).join('')}
            </div>
            <button class="gallery-arrow gallery-prev" aria-label="Anterior">&#8249;</button>
            <button class="gallery-arrow gallery-next" aria-label="Siguiente">&#8250;</button>
          </div>
          <div class="gallery-thumbs">${thumbs}</div>
          ${buildVideoSectionHTML(d)}
        </div>

        <!-- RIGHT: Title + Price + Specs -->
        <div class="modal-specs-col">
          <h2 class="modal-title">${d.titulo || ''}</h2>

          ${buildPriceBlock(d)}

          <!-- Inyectamos descripcionCorta, si existe. El backend sanitiza y provee el fallback -->
          ${d.descripcionCorta ? `<p class="modal-description">${d.descripcionCorta}</p>` : ''}

          <div class="spec-list">${specRows2Col}</div>
        </div>
      </div>

      <!-- BOTTOM: Characteristics full-width -->
      <div class="modal-chars-row">
        ${(d.caracteristicasInternas && d.caracteristicasInternas.length) ? `
        <section class="detail-section">
          <h3 class="detail-section-title">Características internas</h3>
          <div class="char-grid">${checkList(d.caracteristicasInternas)}</div>
        </section>` : ''}

        ${(d.caracteristicasExternas && d.caracteristicasExternas.length) ? `
        <section class="detail-section">
          <h3 class="detail-section-title">Características externas</h3>
          <div class="char-grid">${checkList(d.caracteristicasExternas)}</div>
        </section>` : ''}

        ${buildMapSectionHTML(d)}
      </div>

      <footer class="modal-detail-footer hidden" id="modal-detail-footer" aria-label="Acciones sobre el inmueble"></footer>
    `;
}


function initGallery() {
    const track   = document.getElementById('carousel-track');
    const slides  = track.querySelectorAll('.carousel-slide');
    const thumbs  = document.querySelectorAll('.gallery-thumb');
    const total   = slides.length;
    let current   = 0;

    // Extract gallery images from data attribute
    const twoColEl = document.querySelector('.modal-two-col[data-gallery-images]');
    let galleryImages = [];
    if (twoColEl) {
        try {
            galleryImages = JSON.parse(decodeURIComponent(twoColEl.dataset.galleryImages));
        } catch (e) { /* ignore */ }
    }

    // Prioridad en modal: render inmediato sin bloquear por variante HQ.
    slides.forEach((slide) => {
        const idx = parseInt(slide.dataset.imgIndex || '0', 10);
        const slideImg = slide.querySelector('.carousel-img');
        const src = galleryImages[idx] || slideImg?.getAttribute('src');
        if (!slideImg || !src) return;
        progressiveRenderImage(slideImg, src, { renderToken: `carousel-${idx}` });
    });
    preloadGalleryImages(galleryImages);

    function show(i) {
        current = ((i % total) + total) % total;
        track.style.transform = `translateX(-${current * 100}%)`;
        thumbs.forEach((t, idx) => t.classList.toggle('active', idx === current));
    }

    thumbs.forEach((t, i) => t.addEventListener('click', () => show(i)));
    document.querySelector('.gallery-prev').addEventListener('click', () => show(current - 1));
    document.querySelector('.gallery-next').addEventListener('click', () => show(current + 1));

    // Click on carousel image → open lightbox at that index
    slides.forEach((slide) => {
        slide.addEventListener('click', () => {
            const idx = parseInt(slide.dataset.imgIndex || '0', 10);
            if (galleryImages.length > 0) {
                openLightbox(galleryImages, idx);
            }
        });
    });

    // Click on thumbnails also opens lightbox
    thumbs.forEach((t, i) => {
        t.addEventListener('dblclick', () => {
            if (galleryImages.length > 0) {
                openLightbox(galleryImages, i);
            }
        });
    });

    // Touch/swipe support for mobile
    let startX = 0;
    const viewport = track.parentElement;
    viewport.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    viewport.addEventListener('touchend', e => {
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) show(current + (diff > 0 ? 1 : -1));
    }, { passive: true });
}

// ============================================================
// Lightbox: Fullscreen Image Viewer
// ============================================================
let lightboxEl = null;
let lightboxState = { images: [], current: 0, active: false };

function createLightboxDOM() {
    if (lightboxEl) return;

    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.id = 'lightbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Visor de imágenes en pantalla completa');

    overlay.innerHTML = `
        <button class="lightbox-close" aria-label="Cerrar visor">✕</button>
        <button class="lightbox-arrow lightbox-prev" aria-label="Imagen anterior">&#8249;</button>
        <div class="lightbox-img-container">
            <img class="lightbox-img" src="" alt="Imagen en detalle">
        </div>
        <button class="lightbox-arrow lightbox-next" aria-label="Imagen siguiente">&#8250;</button>
        <div class="lightbox-thumbs" id="lightbox-thumbs"></div>
        <div class="lightbox-counter" id="lightbox-counter">1 / 1</div>
    `;

    document.body.appendChild(overlay);
    lightboxEl = overlay;

    // Events
    overlay.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    overlay.querySelector('.lightbox-prev').addEventListener('click', () => lightboxNav(-1));
    overlay.querySelector('.lightbox-next').addEventListener('click', () => lightboxNav(1));

    // Click on backdrop closes
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('lightbox-img-container')) {
            closeLightbox();
        }
    });

    // Block touchmove to prevent background scroll bleed-through on mobile
    overlay.addEventListener('touchmove', e => { e.preventDefault(); }, { passive: false });

    // Touch/swipe support (uses touchstart/touchend, not touchmove)
    let lbStartX = 0;
    overlay.addEventListener('touchstart', e => { lbStartX = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener('touchend', e => {
        const diff = lbStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 60) lightboxNav(diff > 0 ? 1 : -1);
    }, { passive: true });
}

function openLightbox(images, startIndex) {
    createLightboxDOM();

    lightboxState.images = images;
    lightboxState.current = startIndex || 0;
    lightboxState.active = true;

    // Lock body scroll — save position to prevent jump
    lightboxState.scrollY = window.scrollY;
    document.body.classList.add('lightbox-open');
    document.body.style.top = `-${lightboxState.scrollY}px`;

    // Build thumbnail strip
    const thumbsContainer = lightboxEl.querySelector('#lightbox-thumbs');
    thumbsContainer.innerHTML = images.map((src, i) =>
        `<img src="${src}" class="lightbox-thumb${i === lightboxState.current ? ' active' : ''}" data-index="${i}" alt="Miniatura ${i + 1}">`
    ).join('');

    // Thumb click handlers
    thumbsContainer.querySelectorAll('.lightbox-thumb').forEach(t => {
        t.addEventListener('click', () => {
            lightboxShowImage(parseInt(t.dataset.index, 10));
        });
    });

    lightboxShowImage(lightboxState.current);

    // Show overlay with small delay for CSS transition
    requestAnimationFrame(() => {
        lightboxEl.classList.add('active');
    });
}

function lightboxShowImage(index) {
    const total = lightboxState.images.length;
    lightboxState.current = ((index % total) + total) % total;

    const img = lightboxEl.querySelector('.lightbox-img');
    const src = lightboxState.images[lightboxState.current];
    const currentIndexSnapshot = lightboxState.current;

    // Use highest quality URL
    const hqSrc = getHighQualityUrl(src);

    // Carga progresiva: preview rápida y reemplazo a HQ en cuanto esté disponible.
    img.style.opacity = '0';
    img.style.transform = 'scale(0.92)';
    img.alt = `Imagen ${lightboxState.current + 1} de ${total}`;
    progressiveRenderImage(img, src, { renderToken: `lightbox-${currentIndexSnapshot}`, useContainSizes: true });
    requestAnimationFrame(() => {
        img.style.opacity = '1';
        img.style.transform = 'scale(1)';
    });

    // Update counter
    const counter = lightboxEl.querySelector('#lightbox-counter');
    counter.textContent = `${lightboxState.current + 1} / ${total}`;

    // Update thumb active state
    lightboxEl.querySelectorAll('.lightbox-thumb').forEach((t, i) => {
        t.classList.toggle('active', i === lightboxState.current);
        if (i === lightboxState.current) {
            t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    });
}

function lightboxNav(direction) {
    lightboxShowImage(lightboxState.current + direction);
}

function closeLightbox() {
    if (!lightboxEl) return;
    lightboxState.active = false;
    lightboxEl.classList.remove('active');

    // Unlock body scroll — restore position
    document.body.classList.remove('lightbox-open');
    document.body.style.top = '';
    window.scrollTo(0, lightboxState.scrollY || 0);
}

// ============================================================
// Modal Close
// ============================================================
function closeModal() {
    closeDetailVideoOverlay();
    destroyDetailMap();
    elModal.classList.add('hidden');
    elModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';   // restore background scroll
}


elModalClose.addEventListener('click', closeModal);
elModal.addEventListener('click', e => { if (e.target === elModal) closeModal(); });

// Keyboard navigation: Escape, Left/Right arrows
document.addEventListener('keydown', e => {
    // Lightbox takes priority over modal
    if (lightboxState.active) {
        if (e.key === 'Escape') { closeLightbox(); e.stopPropagation(); return; }
        if (e.key === 'ArrowLeft')  { lightboxNav(-1); return; }
        if (e.key === 'ArrowRight') { lightboxNav(1); return; }
        return;
    }
    if (e.key === 'Escape' && detailVideoOverlay?.classList.contains('active')) {
        closeDetailVideoOverlay();
        return;
    }
    if (e.key === 'Escape' && !elModal.classList.contains('hidden')) closeModal();
});

elHistoricoPrev.addEventListener('click', () => {
    if (state.activeTab !== 'historico') return;
    if (state.historicoPage <= 1) return;
    state.historicoPage -= 1;
    renderCurrentTab();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

elHistoricoNext.addEventListener('click', () => {
    if (state.activeTab !== 'historico') return;
    const totalPages = Math.max(1, Math.ceil(state.historicoData.length / HISTORICO_PAGE_SIZE));
    if (state.historicoPage >= totalPages) return;
    state.historicoPage += 1;
    renderCurrentTab();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

if (elImportantInfoToggle) {
    elImportantInfoToggle.addEventListener('click', async () => {
        if (state.activeTab !== 'aprobadas') return;
        if (state.importantInfo.embedMode && isImportantInfoMobileDockViewport()) {
            state.importantInfo.mobileDockCollapsed = !state.importantInfo.mobileDockCollapsed;
            renderImportantInfoVisibility();
            return;
        }
        if (state.importantInfo.embedMode) return;
        state.importantInfo.open = !state.importantInfo.open;
        renderImportantInfoPanel();

        if (state.importantInfo.open && !state.importantInfo.loaded && !state.importantInfo.loading) {
            await fetchImportantInfoComments();
        }
    });
}

// ============================================================
// Tabs
// ============================================================
elTabBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        elTabBtns.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        state.activeTab = btn.dataset.tab;

        if (state.activeTab === 'historico' && !state.historicoFetched) {
            await loadHistoricoTab();
        } else {
            renderCurrentTab();
        }
    });
});

// ============================================================
// Init
// ============================================================
async function init() {
    // Normaliza URLs tipo /vitrina/{token}/ -> /vitrina/{token}
    // para evitar problemas de enrutamiento en algunos hosts.
    const trailingSlashMatch = window.location.pathname.match(/^\/vitrina\/([^/]+)\/+$/);
    if (trailingSlashMatch) {
        const normalizedPath = `/vitrina/${trailingSlashMatch[1]}`;
        const normalizedUrl = `${window.location.origin}${normalizedPath}${window.location.search}${window.location.hash}`;
        window.location.replace(normalizedUrl);
        return;
    }

    function decodeToken(raw) {
        const input = String(raw || '').trim();
        if (!input) return '';

        if (/^\d{5,}$/.test(input)) return input;

        const looksBase64 = /^[A-Za-z0-9+/=_-]+$/.test(input) && /[A-Za-z+/=_-]/.test(input);
        if (!looksBase64) return input;

        const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

        try {
            const decoded = atob(padded).trim();
            if (!decoded || /[\x00-\x08\x0E-\x1F]/.test(decoded)) return input;
            return decoded;
        } catch {
            return input;
        }
    }

    function sanitizeToken(raw) {
        const input = String(raw || '').trim();
        if (!input) return '';
        return input
            .replace(/%5C/gi, '')
            .replace(/\\/g, '')
            .replace(/^_+|_+$/g, '')
            .trim();
    }

    // 1. Intentar leer desde el path: /vitrina/{token}
    const pathMatch = window.location.pathname.match(/\/vitrina\/([^/]+)/);
    const pathTokenRaw = pathMatch ? decodeURIComponent(pathMatch[1]) : '';

    // 2. Fallback a query params para compatibilidad con enlaces anteriores
    const params = new URLSearchParams(window.location.search);
    const rawParam = params.get('t') || params.get('token') || '';

    const cleanPathTokenRaw = sanitizeToken(pathTokenRaw);
    const cleanQueryTokenRaw = sanitizeToken(rawParam);

    const pathTokenDecoded = sanitizeToken(decodeToken(cleanPathTokenRaw));
    const queryTokenDecoded = sanitizeToken(decodeToken(cleanQueryTokenRaw));
    state.token = pathTokenDecoded || queryTokenDecoded || DEFAULT_TOKEN;

    if (IS_LOCAL_DEV) {
        console.log(`[Vitrina local] API: ${API_BASE} | token: ${state.token}`);
    } else {
        console.log(`Vitrina token: ${state.token}`);
    }

    try {
        const data       = await fetchMostCompleteVitrinaData(state.token);
        state.agent      = data.asesor || {};
        state.properties = normalizePropertiesList(data.inmuebles);

        elLoadingState.classList.add('hidden');

        renderAgent(state.agent);
        updateBadges();
        renderCurrentTab();

        const nombreProspecto =
            normalizeDisplayText(data?.nombreProspecto)
            || normalizeDisplayText(data?.nombreContacto)
            || '';
        tryNotifyVitrinaVisitOnce(state.token, {
            nombreProspecto: nombreProspecto || undefined
        });

    } catch (err) {
        console.error(err);
        elLoadingState.classList.add('hidden');
        elEmptyState.classList.remove('hidden');
        elEmptyIcon.textContent  = '⚠️';
        elEmptyTitle.textContent = 'Error al cargar';
        const degraded = err && err.message && String(err.message).includes('no está disponible por completo');
        elEmptyDesc.textContent = degraded
            ? err.message
            : 'No pudimos cargar la vitrina. Verifica tu conexión o el enlace.';
    }
}

document.addEventListener('DOMContentLoaded', init);
