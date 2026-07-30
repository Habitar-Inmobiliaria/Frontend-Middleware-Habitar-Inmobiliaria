// ============================================================
// Utilidad de teléfono
// ------------------------------------------------------------
// Portado de parsePhone() en js/vitrina/vitrina.js. Separa el
// número principal de la extensión, tolerando variantes de texto
// ("extensión", con problemas de codificación) o dígitos antepuestos.
// ============================================================

export interface ParsedPhone {
  main: string;
  ext: string;
}

/** Devuelve { main, ext }; `ext` es '' si no hay extensión. */
export function parsePhone(raw: string | null | undefined): ParsedPhone {
  if (!raw) return { main: '', ext: '' };

  // Caso 1: contiene la palabra "extensi" (tolera variantes de codificación).
  const textMatch = raw.match(/^([\d\s()+\-]+?)\s*extensi[^0-9]*(\d+)/i);
  if (textMatch) {
    return { main: textMatch[1].trim(), ext: textMatch[2].trim() };
  }

  // Caso 2: cadena de dígitos con más de 10 -> los primeros extras son la extensión.
  const digits = raw.replace(/\D/g, '');
  if (digits.length > 10) {
    const ext = digits.slice(0, digits.length - 10);
    const main = digits.slice(digits.length - 10);
    return { main, ext };
  }

  return { main: raw.trim(), ext: '' };
}
