// ============================================================
// Utilidades de texto para presentación
// ------------------------------------------------------------
// Portado de js/vitrina/vitrina.js. Limpia valores que el backend
// puede enviar como "null", placeholders o cadenas vacías, para no
// mostrarlos crudos en la UI.
// ============================================================

/** Devuelve un texto listo para mostrar, o '' si no es útil. */
export function normalizeDisplayText(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^(null|undefined|nan)$/i.test(text)) return '';
  if (/^null\s*-\s*null$/i.test(text)) return '';
  if (/^sin descripci[oó]n disponible\.?$/i.test(text)) return '';
  if (/^inmueble sin informaci[oó]n completa\.?$/i.test(text)) return '';
  // Placeholders típicos del detalle Wasi vacío / mapper degradado.
  if (/^consultar precio\.?$/i.test(text)) return '';
  if (/^no especificado\.?$/i.test(text)) return '';
  if (/^no especificad[ao]\.?$/i.test(text)) return '';
  if (/^n\/?a\.?$/i.test(text)) return '';
  if (/^inmueble$/i.test(text)) return '';
  if (/^precio de\s*$/i.test(text)) return '';
  return text;
}

/**
 * URL de imagen usable para la UI.
 * Los placeholders genéricos del middleware (via.placeholder.com, etc.)
 * se tratan como “sin imagen”.
 */
export function normalizeImageUrl(value: unknown): string {
  const url = normalizeDisplayText(value);
  if (!url) return '';
  if (/via\.placeholder\.com/i.test(url)) return '';
  if (/placehold\.co/i.test(url)) return '';
  if (/placeholder\.com/i.test(url)) return '';
  if (/text=Sin[+ ]?Imagen/i.test(url)) return '';
  return url;
}

/** true si el precio formateado representa un valor nulo o cero (no mostrar). */
export function isZeroPrice(rawPrice: string): boolean {
  return !rawPrice || /^\$?\s*0+([.,]0+)?$/.test(rawPrice.trim());
}
