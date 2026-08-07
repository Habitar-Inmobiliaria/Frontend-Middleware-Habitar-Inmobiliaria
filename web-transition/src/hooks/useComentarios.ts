import { useCallback, useEffect, useState } from 'react';
import type { ComentarioListing } from '../api/types';
import { vitrinaApi } from '../api/vitrinaApi';

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

  // Si el asesor agregó comentarios en HubSpot, refrescar al volver a la vitrina.
  useEffect(() => {
    if (!enabled || !token || !loaded) return;

    let lastAt = 0;
    const softRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastAt < 2500) return;
      lastAt = now;
      refresh();
    };

    document.addEventListener('visibilitychange', softRefresh);
    window.addEventListener('focus', softRefresh);
    return () => {
      document.removeEventListener('visibilitychange', softRefresh);
      window.removeEventListener('focus', softRefresh);
    };
  }, [enabled, token, loaded, refresh]);

  return { comments, loading, loaded, refresh };
}
