// ============================================================
// Sanitización ligera de HTML de descripción
// ------------------------------------------------------------
// El backend envía descripciones con markup (<p>, <span>, <strong>).
// Se permite ese formato y se eliminan vectores peligrosos (script,
// handlers on*, javascript:, iframes, etc.).
// ============================================================

const DANGEROUS_TAGS = /<\/?(?:script|iframe|object|embed|link|meta|form|input|button|textarea|select|style|base)\b[^>]*>/gi;
const EVENT_HANDLERS = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_PROTOCOL = /(?:href|src|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]*)/gi;

/** Devuelve HTML seguro para inyectar en la descripción del detalle. */
export function sanitizeDescriptionHtml(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(DANGEROUS_TAGS, '')
    .replace(EVENT_HANDLERS, '')
    .replace(JS_PROTOCOL, '');
}

/** true si el texto parece contener markup HTML. */
export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}
