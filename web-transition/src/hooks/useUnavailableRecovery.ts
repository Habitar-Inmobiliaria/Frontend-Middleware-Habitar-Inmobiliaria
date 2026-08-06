import { useEffect, useRef, useState } from 'react';
import type { VitrinaInmueble } from '../api/types';
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
import { isZeroPrice, normalizeDisplayText } from '../utils/text';

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

  // No volver al shell vacío solo porque falle la imagen tras recuperar
  // (título/precio/_externalDataSource ya bastan para card usable).
  const unavailableByImageFail =
    imageFailed && !displayLocation && !description && !title && !hasPrice && !alreadyUsable;

  const needsRecovery = Boolean(displayId) && !alreadyUsable && (shellEmpty || unavailableByImageFail);

  // Shell visual solo si aún no hay nada útil que mostrar.
  const unavailable = needsRecovery && !title && !hasPrice;

  const [verifying, setVerifying] = useState(false);
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;
  const inmuebleRef = useRef(inmueble);
  inmuebleRef.current = inmueble;

  useEffect(() => {
    if (!needsRecovery || !displayId) {
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
  }, [needsRecovery, displayId]);

  return {
    unavailable,
    verifying,
    displayId,
    displayLocation,
  };
}
