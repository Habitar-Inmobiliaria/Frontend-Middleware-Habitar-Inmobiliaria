import { useEffect, useState } from 'react';
import type { ComentarioListing } from '../api/types';
import { vitrinaApi } from '../api/vitrinaApi';

interface UseComentariosState {
  comments: ComentarioListing[];
  loading: boolean;
  loaded: boolean;
}

/**
 * Carga los comentarios del cliente la primera vez que `enabled` es true
 * (pestañas Me interesa / Visitados). Si falla, deja lista vacía (como el vanilla).
 */
export function useComentarios(token: string, enabled: boolean): UseComentariosState {
  const [comments, setComments] = useState<ComentarioListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || !token || loaded) return;

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
  }, [enabled, token, loaded]);

  return { comments, loading, loaded };
}
