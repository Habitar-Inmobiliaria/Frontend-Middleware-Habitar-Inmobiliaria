// ============================================================
// Normalización del token de la vitrina
// ------------------------------------------------------------
// Portado de la lógica de init() en js/vitrina/vitrina.js.
// El token puede llegar como número plano o codificado en base64url;
// también puede traer caracteres de escape indeseados. Estas funciones
// lo dejan listo para usarse contra la API, sin cambiar qué tokens se aceptan.
// ============================================================

/**
 * Decodifica un token: si parece base64url intenta decodificarlo;
 * si no, lo devuelve tal cual. Nunca lanza (ante error devuelve el original).
 */
export function decodeToken(raw: string | null | undefined): string {
  const input = String(raw ?? '').trim();
  if (!input) return '';

  // Un número largo es un contactId directo, no requiere decodificación.
  if (/^\d{5,}$/.test(input)) return input;

  const looksBase64 = /^[A-Za-z0-9+/=_-]+$/.test(input) && /[A-Za-z+/=_-]/.test(input);
  if (!looksBase64) return input;

  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  try {
    const decoded = atob(padded).trim();
    // Si el resultado está vacío o contiene caracteres de control, no era base64 real.
    if (!decoded || /[\x00-\x08\x0E-\x1F]/.test(decoded)) return input;
    return decoded;
  } catch {
    return input;
  }
}

/** Elimina escapes y guiones bajos sobrantes que pueden colarse en la URL. */
export function sanitizeToken(raw: string | null | undefined): string {
  const input = String(raw ?? '').trim();
  if (!input) return '';
  return input
    .replace(/%5C/gi, '')
    .replace(/\\/g, '')
    .replace(/^_+|_+$/g, '')
    .trim();
}

/**
 * Resuelve el token final a partir del valor crudo de la URL,
 * replicando el orden del código vanilla: sanitizar -> decodificar -> sanitizar.
 */
export function resolveToken(raw: string | null | undefined): string {
  return sanitizeToken(decodeToken(sanitizeToken(raw)));
}
