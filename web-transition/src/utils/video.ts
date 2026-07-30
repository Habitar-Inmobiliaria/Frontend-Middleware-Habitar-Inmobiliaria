// ============================================================
// Utilidades de video
// ------------------------------------------------------------
// Portado de js/vitrina/vitrina.js. Valida URLs y obtiene la URL de
// incrustación (embed) de YouTube a partir de distintos formatos.
// ============================================================

export function isValidHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Devuelve la URL de embed de YouTube, o '' si no aplica. */
export function getYouTubeEmbedUrl(value: string | null | undefined): string {
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
