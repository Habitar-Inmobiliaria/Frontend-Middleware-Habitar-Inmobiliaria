import { useEffect, useRef } from 'react';
import type { VitrinaInmueble } from '../api/types';
import { recoveryApi } from '../api/recoveryApi';
import { isUnavailablePropertyView } from '../utils/recovery';
import { getDisplayPropertyId } from '../utils/property';
import { normalizeDisplayText } from '../utils/text';

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Recupera en segundo plano todos los inmuebles "no disponibles" del listado.
 * Vive a nivel de página (no de card), así el resultado se aplica aunque el
 * usuario cambie de pestaña y la card se desmonte a mitad de la petición.
 */
export function useListUnavailableRecovery(
  inmuebles: VitrinaInmueble[],
  onRecovered: (updated: VitrinaInmueble) => void,
): void {
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;
  /** Evita disparar la misma referencia en paralelo; se libera si agota reintentos. */
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    for (const prop of inmuebles) {
      const id = getDisplayPropertyId(prop);
      if (!id || inFlightRef.current.has(id)) continue;

      const unavailable = isUnavailablePropertyView(prop, {
        location: normalizeDisplayText(prop.ubicacion),
        description: normalizeDisplayText(prop.descripcionCorta),
        image: normalizeDisplayText(prop.imagenUrl),
      });
      if (!unavailable) continue;

      inFlightRef.current.add(id);
      const snapshot = prop;

      void (async () => {
        let recovered = false;
        try {
          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const updated = await recoveryApi.tryRecoverUnavailableProperty(snapshot, id);
            if (updated) {
              onRecoveredRef.current(updated);
              recovered = true;
              return;
            }
            if (attempt < MAX_ATTEMPTS - 1) {
              await sleep(RETRY_BASE_MS * (attempt + 1));
            }
          }
        } catch {
          /* se libera abajo para permitir otro ciclo si el listado cambia */
        } finally {
          // Si recuperó, dejamos el id marcado para no re-disparar en este ciclo de página.
          if (!recovered) inFlightRef.current.delete(id);
        }
      })();
    }
  }, [inmuebles]);
}
