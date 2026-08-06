import { useEffect, useState } from 'react';
import type { PropertyDetail, VitrinaInmueble } from '../api/types';
import { vitrinaApi } from '../api/vitrinaApi';
import { getDisplayPropertyId } from '../utils/property';

interface UsePropertyDetailState {
  data: PropertyDetail | null;
  loading: boolean;
  error: string;
}

// Carga el detalle de un inmueble cuando `inmueble` deja de ser null.
// Prefiere el id visible (referencia Wasi) y pasa el listProp para recuperación.
export function usePropertyDetail(
  token: string,
  inmueble: VitrinaInmueble | null,
): UsePropertyDetailState {
  const [data, setData] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!inmueble) {
      setData(null);
      setError('');
      setLoading(false);
      return;
    }

    const detailId = getDisplayPropertyId(inmueble) || String(inmueble.id || '').trim();
    let cancelled = false;

    setLoading(true);
    setError('');
    setData(null);

    vitrinaApi
      .getPropertyDetail(token, detailId, { cancelPrevious: true, listProp: inmueble })
      .then((d) => {
        if (cancelled) return;
        if (d) setData(d);
        else setError('Error cargando el detalle del inmueble.');
      })
      .catch(() => {
        if (!cancelled) setError('Error cargando el detalle del inmueble.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, inmueble]);

  return { data, loading, error };
}
