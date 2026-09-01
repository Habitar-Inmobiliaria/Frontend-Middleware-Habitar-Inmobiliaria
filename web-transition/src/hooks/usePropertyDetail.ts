import { useEffect, useRef, useState } from 'react';
import type { PropertyDetail, VitrinaInmueble } from '../api/types';
import { vitrinaApi } from '../api/vitrinaApi';
import { getDisplayPropertyId } from '../utils/property';

interface UsePropertyDetailState {
  data: PropertyDetail | null;
  loading: boolean;
  error: string;
}

// Carga el detalle por ID estable; listProp se lee al pedir (ref) para no re-fetch al merge del listado.
export function usePropertyDetail(
  token: string,
  inmueble: VitrinaInmueble | null,
): UsePropertyDetailState {
  const [data, setData] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const detailId = inmueble
    ? getDisplayPropertyId(inmueble) || String(inmueble.id || '').trim()
    : '';

  const listPropRef = useRef(inmueble);
  listPropRef.current = inmueble;

  useEffect(() => {
    if (!detailId) {
      setData(null);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError('');
    setData(null);

    vitrinaApi
      .getPropertyDetail(token, detailId, {
        cancelPrevious: true,
        listProp: listPropRef.current,
      })
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
  }, [token, detailId]);

  return { data, loading, error };
}
