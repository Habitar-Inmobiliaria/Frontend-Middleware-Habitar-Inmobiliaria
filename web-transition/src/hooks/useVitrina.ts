// ============================================================
// Hook de carga de la vitrina
// ------------------------------------------------------------
// Pinta en cuanto hay un payload usable; actualizaciones posteriores
// (lista autoritativa tras invalidate/HubSpot) llegan vía onUpdate.
// Al volver a la pestaña hace softRefresh para no quedar con session stale.
// ============================================================

import { useEffect, useState } from 'react';
import { vitrinaApi } from '../api/vitrinaApi';
import type { VitrinaResponse } from '../api/types';
import { mergeInmuebleLists } from '../utils/recovery';

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

    // Tras cambios en HubSpot + invalidate, el usuario vuelve a esta pestaña:
    // forzar GET fresco sin dejar sessionStorage como fuente de verdad.
    let lastSoftRefreshAt = 0;
    const softRefresh = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastSoftRefreshAt < 2500) return;
      lastSoftRefreshAt = now;
      void vitrinaApi.softRefreshVitrina(token, onUpdate);
    };
    document.addEventListener('visibilitychange', softRefresh);
    window.addEventListener('focus', softRefresh);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', softRefresh);
      window.removeEventListener('focus', softRefresh);
    };
  }, [token]);

  return state;
}
