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
  return text;
}

/** true si el precio formateado representa un valor nulo o cero (no mostrar). */
export function isZeroPrice(rawPrice: string): boolean {
  return !rawPrice || /^\$?\s*0+([.,]0+)?$/.test(rawPrice.trim());
}
