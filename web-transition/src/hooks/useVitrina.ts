// ============================================================
// Hook de carga de la vitrina
// ------------------------------------------------------------
// Pinta en cuanto hay un payload usable; actualizaciones posteriores
// (lista autoritativa tras invalidate/HubSpot) llegan vía onUpdate.
// Al volver a la pestaña hace softRefresh para no quedar con session stale.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { vitrinaApi } from '../api/vitrinaApi';
import type { VitrinaResponse } from '../api/types';
import { mergeInmuebleLists } from '../utils/recovery';
import { usePageVisibilityRefresh } from './usePageVisibilityRefresh';

export interface UseVitrinaState {
  data: VitrinaResponse | null;
  loading: boolean;
  error: string | null;
}

function applyFresh(
  prev: VitrinaResponse | null,
  fresh: VitrinaResponse,
  authoritative: boolean,
): VitrinaResponse {
  if (!prev) return fresh;
  return {
    ...fresh,
    inmuebles: mergeInmuebleLists(prev.inmuebles || [], fresh.inmuebles || [], {
      authoritative,
    }),
    asesor: fresh.asesor ?? prev.asesor,
  };
}

export function useVitrina(token: string | undefined): UseVitrinaState {
  const [state, setState] = useState<UseVitrinaState>({
    data: null,
    loading: true,
    error: null,
  });

  const onUpdateRef = useRef<
    (fresh: VitrinaResponse, meta?: { authoritative?: boolean }) => void
  >(() => undefined);

  useEffect(() => {
    if (!token) {
      setState({ data: null, loading: false, error: 'Token no proporcionado.' });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const onUpdate = (fresh: VitrinaResponse, meta?: { authoritative?: boolean }) => {
      if (cancelled) return;
      const authoritative = Boolean(meta?.authoritative);
      setState((prev) => ({
        data: applyFresh(prev.data, fresh, authoritative),
        loading: false,
        error: null,
      }));
    };
    onUpdateRef.current = onUpdate;

    vitrinaApi
      .getVitrina(token, { onUpdate })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'No se pudo cargar la vitrina.';
        setState((prev) =>
          prev.data
            ? { ...prev, loading: false, error: null }
            : { data: null, loading: false, error: message },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  usePageVisibilityRefresh(() => {
    if (!token) return;
    void vitrinaApi.softRefreshVitrina(token, onUpdateRef.current);
  }, Boolean(token));

  return state;
}
