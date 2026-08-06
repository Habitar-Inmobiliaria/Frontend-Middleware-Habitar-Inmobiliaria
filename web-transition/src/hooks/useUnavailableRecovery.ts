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
  /** Mostrar el shell "Inmueble no disponible". */
  unavailable: boolean;
  verifying: boolean;
  displayId: string;
  /** Ubicación a mostrar (vacía si está restringida). */
  displayLocation: string;
}

/**
 * Detecta inmuebles sin datos útiles en tarjeta.
 * Tras el enrichment Wasi→n8n en middleware, la recuperación cliente del
 * listado queda desactivada (ENABLE_CLIENT_LIST_RECOVERY) para no duplicar scrapes.
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

  // Shell visual solo si aún no hay nada útil que mostrar.
  const unavailable = looksUnavailable && !title && !hasPrice;

  const [verifying, setVerifying] = useState(false);
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
