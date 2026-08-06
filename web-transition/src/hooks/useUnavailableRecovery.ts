import { useEffect, useRef, useState } from 'react';
import type { VitrinaInmueble } from '../api/types';
import { ENABLE_CLIENT_LIST_RECOVERY } from '../api/config';
import {
  recoveryApi,
  wasExternallyRecoveredByReferencia,
} from '../api/recoveryApi';
import {
  hasUsableListingContent,
  isUnavailablePropertyView,
  shouldRestrictPropertyLocation,
} from '../utils/recovery';
import { getDisplayPropertyId } from '../utils/property';
import { isZeroPrice, normalizeDisplayText, normalizeImageUrl } from '../utils/text';

interface UseUnavailableRecoveryOptions {
  inmueble: VitrinaInmueble;
  /** true si la imagen falló al cargar (equivalente a onerror del vanilla). */
  imageFailed: boolean;
  onRecovered: (updated: VitrinaInmueble) => void;
}

interface UseUnavailableRecoveryResult {
  /** Mostrar el shell "Inmueble no disponible" / verificando. */
  unavailable: boolean;
  verifying: boolean;
  displayId: string;
  /** Ubicación a mostrar (vacía si está restringida). */
  displayLocation: string;
}

/**
 * Detecta inmuebles sin datos útiles y, si la recuperación de listado está
 * habilitada, intenta Wasi → n8n en segundo plano mientras el resto de cards
 * ya están visibles (flujo original de “Verificando disponibilidad…”).
 */
export function useUnavailableRecovery({
  inmueble,
  imageFailed,
  onRecovered,
}: UseUnavailableRecoveryOptions): UseUnavailableRecoveryResult {
  const displayId = getDisplayPropertyId(inmueble);
  const locationRaw = normalizeDisplayText(inmueble.ubicacion);
  const description = normalizeDisplayText(inmueble.descripcionCorta);
  const image = normalizeImageUrl(inmueble.imagenUrl);
  const title = normalizeDisplayText(inmueble.titulo);
  const price = normalizeDisplayText(inmueble.precioFormateado);
  const hasPrice = Boolean(price && !isZeroPrice(price));

  const locationRestricted = shouldRestrictPropertyLocation(
    inmueble,
    wasExternallyRecoveredByReferencia,
  );
  const displayLocation = locationRestricted ? '' : locationRaw;

  const fields = {
    location: displayLocation,
    description,
    image,
  };

  const shellEmpty = isUnavailablePropertyView(inmueble, fields);
  const alreadyUsable = hasUsableListingContent(inmueble, fields);

  const unavailableByImageFail =
    imageFailed && !displayLocation && !description && !title && !hasPrice && !alreadyUsable;

  const looksUnavailable =
    Boolean(displayId) && !alreadyUsable && (shellEmpty || unavailableByImageFail);

  // Shell vacío (con o sin spinner): sin título/precio útil todavía.
  const unavailable = looksUnavailable && !title && !hasPrice;

  const [verifying, setVerifying] = useState(
    () => ENABLE_CLIENT_LIST_RECOVERY && unavailable && Boolean(displayId),
  );
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;
  const inmuebleRef = useRef(inmueble);
  inmuebleRef.current = inmueble;

  useEffect(() => {
    if (!ENABLE_CLIENT_LIST_RECOVERY || !looksUnavailable || !displayId) {
      setVerifying(false);
      return;
    }

    let active = true;
    setVerifying(true);

    recoveryApi
      .tryRecoverUnavailableProperty(inmuebleRef.current, displayId)
      .then((updated) => {
        // Aplicar aunque el efecto se limpie (cambio de pestaña): el listado sigue vivo.
        if (updated) onRecoveredRef.current(updated);
      })
      .finally(() => {
        if (active) setVerifying(false);
      });

    return () => {
      active = false;
    };
  }, [looksUnavailable, displayId]);

  return {
    unavailable,
    verifying,
    displayId,
    displayLocation,
  };
}
