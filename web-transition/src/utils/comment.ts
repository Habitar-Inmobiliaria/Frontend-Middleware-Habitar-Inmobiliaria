// ============================================================
// Utilidades de comentarios del cliente
// ------------------------------------------------------------
// Formato de fecha y filtrado por pestaña/estado.
// ============================================================

import type { ComentarioListing } from '../api/types';
import type { TabId } from './estado';

export type CommentsTabId = Exclude<TabId, 'historico'>;

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
  const text = val ? String(val).toUpperCase().trim() : '';
  return text || null;
}

/** Normaliza variantes: "SIN REVISAR" / "SIN-REVISAR" → "SIN_REVISAR". */
function normalizeEstadoKey(estado: string): string {
  return estado.toUpperCase().trim().replace(/[\s-]+/g, '_');
}

/** Estados de comentario que pertenecen a cada pestaña de listado. */
const TAB_COMMENT_ESTADOS: Record<CommentsTabId, readonly string[]> = {
  'sin-revisar': ['SIN_REVISAR', 'PENDIENTE', 'REVISADO'],
  aprobadas: ['APROBADO'],
  descartadas: ['DESCARTADO'],
  visitados: ['VISITADO'],
};

/**
 * Filtra comentarios de la pestaña activa.
 * Sin estado: se muestran en Me interesa y Visitados (compatibilidad legacy).
 */
export function filterCommentsForTab(
  comments: ComentarioListing[],
  activeTab: TabId,
): ComentarioListing[] {
  if (activeTab === 'historico') return [];
  const allowed = new Set(
    TAB_COMMENT_ESTADOS[activeTab].map((e) => normalizeEstadoKey(e)),
  );

  return comments.filter((item) => {
    const estado = getCommentEstado(item);
    if (!estado) {
      return activeTab === 'aprobadas' || activeTab === 'visitados';
    }
    return allowed.has(normalizeEstadoKey(estado));
  });
}

export function hasVisibleComments(
  comments: ComentarioListing[],
  activeTab: TabId,
): boolean {
  return filterCommentsForTab(comments, activeTab).length > 0;
}
