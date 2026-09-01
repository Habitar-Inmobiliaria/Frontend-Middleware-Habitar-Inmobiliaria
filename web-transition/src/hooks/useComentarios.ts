import { useCallback, useEffect, useState } from 'react';
import type { ComentarioListing } from '../api/types';
import { vitrinaApi } from '../api/vitrinaApi';
import { usePageVisibilityRefresh } from './usePageVisibilityRefresh';

interface UseComentariosState {
  comments: ComentarioListing[];
  loading: boolean;
  loaded: boolean;
  /** Vuelve a pedir el listado (p. ej. tras publicar un comentario). */
  refresh: () => void;
}

/**
 * Carga los comentarios del asesor/cliente cuando `enabled` es true.
 * Incluye refresh para reconsultar tras altas o al volver a la pestaña.
 */
export function useComentarios(token: string, enabled: boolean): UseComentariosState {
  const [comments, setComments] = useState<ComentarioListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !token) return;

    let cancelled = false;
    setLoading(true);

    vitrinaApi
      .getComentarios(token)
      .then((data) => {
        if (cancelled) return;
        setComments(Array.isArray(data.comentarios) ? data.comentarios : []);
      })
      .catch((err) => {
        console.error('Error cargando comentarios:', err);
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, token, reloadToken]);

  usePageVisibilityRefresh(refresh, enabled && Boolean(token) && loaded);

  return { comments, loading, loaded, refresh };
}
