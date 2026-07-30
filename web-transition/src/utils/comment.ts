// ============================================================
// Formato de fecha de comentarios
// ------------------------------------------------------------
// Portado de formatCommentDate() en js/vitrina/vitrina.js.
// ============================================================

export function formatCommentDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

/** Extrae el estado del comentario de forma tolerante a mayúsculas. */
export function getCommentEstado(item: { estado?: string | null }): string | null {
  const val =
    item.estado ??
    (item as { Estado?: string }).Estado ??
    (item as { ESTADO?: string }).ESTADO;
  return val ? String(val).toUpperCase().trim() : null;
}
