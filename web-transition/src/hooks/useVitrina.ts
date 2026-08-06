// ============================================================
// Hook de carga de la vitrina
// ------------------------------------------------------------
// Pinta en cuanto hay un payload usable; actualizaciones posteriores
// (lista más completa tras 503/enrichment) llegan vía onUpdate.
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

    vitrinaApi
      .getVitrina(token, {
        onUpdate: (fresh) => {
          if (cancelled) return;
          setState((prev) => ({
            data: prev.data
              ? {
                  ...fresh,
                  inmuebles: mergeInmuebleLists(prev.data.inmuebles || [], fresh.inmuebles || []),
                  asesor: fresh.asesor ?? prev.data.asesor,
                }
              : fresh,
            loading: false,
            error: null,
          }));
        },
      })
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

  return state;
}
