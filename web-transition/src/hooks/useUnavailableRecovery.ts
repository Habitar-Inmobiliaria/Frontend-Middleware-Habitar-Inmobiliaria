import { useEffect, useRef, useState } from 'react';
import type { VitrinaInmueble } from '../api/types';
import {
  recoveryApi,
  wasExternallyRecoveredByReferencia,
} from '../api/recoveryApi';
import {
  isUnavailablePropertyView,
  shouldRestrictPropertyLocation,
} from '../utils/recovery';
import { getDisplayPropertyId } from '../utils/property';
import { normalizeDisplayText } from '../utils/text';

interface UseUnavailableRecoveryOptions {
  inmueble: VitrinaInmueble;
  /** true si la imagen falló al cargar (equivalente a onerror del vanilla). */
  imageFailed: boolean;
  onRecovered: (updated: VitrinaInmueble) => void;
}

interface UseUnavailableRecoveryResult {
  unavailable: boolean;
  verifying: boolean;
  displayId: string;
  /** Ubicación a mostrar (vacía si está restringida). */
  displayLocation: string;
}

/**
 * Detecta inmuebles "no disponibles" e intenta recuperarlos vía Wasi → n8n.
 * Si la recuperación aporta datos útiles, notifica al padre con `onRecovered`
 * aunque el efecto se limpie (cambio de pestaña): el listado sigue montado.
 */
export function useUnavailableRecovery({
  inmueble,
  imageFailed,
  onRecovered,
}: UseUnavailableRecoveryOptions): UseUnavailableRecoveryResult {
  const displayId = getDisplayPropertyId(inmueble);
  const locationRaw = normalizeDisplayText(inmueble.ubicacion);
  const description = normalizeDisplayText(inmueble.descripcionCorta);
  const image = normalizeDisplayText(inmueble.imagenUrl);

  const locationRestricted = shouldRestrictPropertyLocation(
    inmueble,
    wasExternallyRecoveredByReferencia,
  );
  const displayLocation = locationRestricted ? '' : locationRaw;

  const unavailableByData = isUnavailablePropertyView(inmueble, {
    location: displayLocation,
    description,
    image,
  });
  // Si la imagen falla y no hay contenido útil, tratar como no disponible.
  const unavailableByImageFail = imageFailed && !displayLocation && !description;
  const unavailable = unavailableByData || unavailableByImageFail;

  const [verifying, setVerifying] = useState(false);
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;
  const inmuebleRef = useRef(inmueble);
  inmuebleRef.current = inmueble;

  useEffect(() => {
    if (!unavailable || !displayId) {
      setVerifying(false);
      return;
    }

    let active = true;
    setVerifying(true);

    recoveryApi
      .tryRecoverUnavailableProperty(inmuebleRef.current, displayId)
      .then((updated) => {
        // Siempre fusionar en el padre: sobrevive desmontaje de la card
        // (p. ej. cambio de pestaña) y evita quedar en "no disponible" con
        // datos ya recuperados en caché.
        if (updated) onRecoveredRef.current(updated);
      })
      .finally(() => {
        if (active) setVerifying(false);
      });

    return () => {
      active = false;
    };
  }, [unavailable, displayId]);

  return {
    unavailable,
    verifying,
    displayId,
    displayLocation,
  };
}
