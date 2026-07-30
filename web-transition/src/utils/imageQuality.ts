// ============================================================
// Calidad de imágenes (CDN Wasi)
// ------------------------------------------------------------
// Portado de transformWasiImageUrl / getHighQualityUrl /
// getLowQualityUrl / preloadImage en js/vitrina/vitrina.js.
// ============================================================

interface ResizeOpts {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(normalized + padding);
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Ajusta el resize del payload de image.wasi.co.
 * Si la URL no es de ese host o no se puede decodificar, devuelve `src`.
 */
export function transformWasiImageUrl(src: string, opts: ResizeOpts = {}): string {
  try {
    const url = new URL(src, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
    if (url.hostname !== 'image.wasi.co') return src;

    const encodedPayload = url.pathname.replace(/^\/+/, '');
    if (!encodedPayload) return src;

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as {
      edits?: { resize?: { width?: number; height?: number; fit?: string } };
    };
    payload.edits = payload.edits || {};
    payload.edits.resize = payload.edits.resize || {};

    const currentWidth = Number(payload.edits.resize.width) || 0;
    const currentHeight = Number(payload.edits.resize.height) || 0;
    let nextWidth = currentWidth;
    let nextHeight = currentHeight;

    if (typeof opts.minWidth === 'number') nextWidth = Math.max(nextWidth || 0, opts.minWidth);
    if (typeof opts.minHeight === 'number') nextHeight = Math.max(nextHeight || 0, opts.minHeight);
    if (typeof opts.maxWidth === 'number') {
      nextWidth = nextWidth ? Math.min(nextWidth, opts.maxWidth) : opts.maxWidth;
    }
    if (typeof opts.maxHeight === 'number') {
      nextHeight = nextHeight ? Math.min(nextHeight, opts.maxHeight) : opts.maxHeight;
    }

    payload.edits.resize.width = nextWidth || currentWidth || 900;
    payload.edits.resize.height = nextHeight || currentHeight || 675;
    payload.edits.resize.fit = payload.edits.resize.fit || 'contain';

    url.pathname = '/' + encodeBase64Url(JSON.stringify(payload));
    return url.toString();
  } catch {
    return src;
  }
}

/** Quita sufijos de tamaño típicos del CDN antiguo (_340x, _640x, -800x600, etc.). */
function stripLegacySizeSuffix(src: string): string {
  return src
    .replace(/_\d+x(?=\.|$|\?)/g, '')
    .replace(/_\d+x\d+(?=\.|$|\?)/g, '')
    .replace(/-\d{2,4}x\d{2,4}(?=\.|$|\?)/g, '');
}

/**
 * URL de máxima calidad para el lightbox / carrusel.
 * Prioriza el payload de image.wasi.co a ~2400×1800; si no aplica,
 * elimina sufijos de tamaño del CDN legado.
 */
export function getHighQualityUrl(src: string): string {
  if (!src) return src;

  const transformed = transformWasiImageUrl(src, { minWidth: 2400, minHeight: 1800 });
  if (transformed !== src) return transformed;

  const stripped = stripLegacySizeSuffix(src);
  return stripped || src;
}

/** Preview rápida mientras se carga la HQ. */
export function getLowQualityUrl(src: string): string {
  if (!src) return src;
  const transformed = transformWasiImageUrl(src, { maxWidth: 700, maxHeight: 520 });
  if (transformed !== src) return transformed;
  return src;
}

const imageLoadCache = new Map<string, Promise<string>>();

/** Precarga una imagen y cachea la promesa. */
export function preloadImage(src: string): Promise<string> {
  if (!src) return Promise.reject(new Error('src vacío'));
  const cached = imageLoadCache.get(src);
  if (cached) return cached;

  const p = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(src);
    img.onerror = () => reject(new Error(`No se pudo cargar: ${src}`));
    img.src = src;
  });
  imageLoadCache.set(src, p);
  return p;
}
