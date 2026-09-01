import { useEffect, useRef, useState } from 'react';
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

export interface UseListUnavailableRecoveryResult {
  /** IDs con recuperación Wasi/n8n en curso (para UI "Verificando…"). */
  recoveringIds: ReadonlySet<string>;
}

/**
 * Recupera en segundo plano inmuebles “no disponibles” del listado.
 * Punto único de orquestación: las cards solo reflejan estado vía recoveringIds.
 */
export function useListUnavailableRecovery(
  inmuebles: VitrinaInmueble[],
  onRecovered: (updated: VitrinaInmueble) => void,
): UseListUnavailableRecoveryResult {
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;
  const inFlightRef = useRef(new Set<string>());
  const [recoveringIds, setRecoveringIds] = useState<ReadonlySet<string>>(() => new Set());

  const markRecovering = (id: string, active: boolean) => {
    setRecoveringIds((prev) => {
      const has = prev.has(id);
      if (active && has) return prev;
      if (!active && !has) return prev;
      const next = new Set(prev);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  useEffect(() => {
    if (!ENABLE_CLIENT_LIST_RECOVERY) return;

    for (const prop of inmuebles) {
      const id = getDisplayPropertyId(prop);
      if (!id || inFlightRef.current.has(id)) continue;
      if (prop._omittedFromApi || prop._fromHistorico) continue;

      const fields = {
        location: normalizeDisplayText(prop.ubicacion),
        description: normalizeDisplayText(prop.descripcionCorta),
        image: normalizeImageUrl(prop.imagenUrl),
      };
      if (hasUsableListingContent(prop, fields)) continue;
      if (!isUnavailablePropertyView(prop, fields)) continue;

      inFlightRef.current.add(id);
      markRecovering(id, true);
      const snapshot = prop;

      void (async () => {
        try {
          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const updated = await recoveryApi.tryRecoverUnavailableProperty(snapshot, id);
            if (updated) {
              onRecoveredRef.current(updated);
              return;
            }
            if (attempt < MAX_ATTEMPTS - 1) {
              await sleep(RETRY_BASE_MS * (attempt + 1));
            }
          }
        } catch {
          /* se libera abajo */
        } finally {
          inFlightRef.current.delete(id);
          markRecovering(id, false);
        }
      })();
    }
  }, [inmuebles]);

  return { recoveringIds };
}
