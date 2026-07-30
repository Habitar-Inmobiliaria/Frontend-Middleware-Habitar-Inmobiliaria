// ============================================================
// Hook de carga de la vitrina
// ------------------------------------------------------------
// Encapsula la obtención de datos (vitrinaApi.getVitrina) y expone
// los tres estados de la petición. Ignora el resultado si el
// componente se desmonta o si cambia el token (evita actualizar
// estado sobre un componente ya desmontado).
// ============================================================

import { useEffect, useState } from 'react';
import { vitrinaApi } from '../api/vitrinaApi';
import type { VitrinaResponse } from '../api/types';

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
      .getVitrina(token)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'No se pudo cargar la vitrina.';
        setState({ data: null, loading: false, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
