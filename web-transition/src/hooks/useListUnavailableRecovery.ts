import { useEffect, useRef } from 'react';
import type { VitrinaInmueble } from '../api/types';
import { ENABLE_CLIENT_LIST_RECOVERY } from '../api/config';
import { recoveryApi } from '../api/recoveryApi';
import { hasUsableListingContent, isUnavailablePropertyView } from '../utils/recovery';
import { getDisplayPropertyId } from '../utils/property';
import { normalizeDisplayText, normalizeImageUrl } from '../utils/text';

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Recupera en segundo plano inmuebles vacíos del listado.
 * Desactivado por defecto: el middleware ya hace Wasi → n8n en el GET vitrina.
 */
export function useListUnavailableRecovery(
  inmuebles: VitrinaInmueble[],
  onRecovered: (updated: VitrinaInmueble) => void,
): void {
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    if (!ENABLE_CLIENT_LIST_RECOVERY) return;

    for (const prop of inmuebles) {
      const id = getDisplayPropertyId(prop);
      if (!id || inFlightRef.current.has(id)) continue;

      const fields = {
        location: normalizeDisplayText(prop.ubicacion),
        description: normalizeDisplayText(prop.descripcionCorta),
        image: normalizeImageUrl(prop.imagenUrl),
      };
      if (hasUsableListingContent(prop, fields)) continue;
      if (!isUnavailablePropertyView(prop, fields)) continue;

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
          /* se libera abajo */
        } finally {
          if (!recovered) inFlightRef.current.delete(id);
        }
      })();
    }
  }, [inmuebles]);
}
