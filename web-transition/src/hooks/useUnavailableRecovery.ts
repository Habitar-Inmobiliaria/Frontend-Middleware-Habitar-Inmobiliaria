import type { VitrinaInmueble } from '../api/types';
import { ENABLE_CLIENT_LIST_RECOVERY } from '../api/config';
import { wasExternallyRecoveredByReferencia } from '../api/recoveryApi';
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
  /** Recuperación en curso (orquestada por useListUnavailableRecovery en el padre). */
  recovering?: boolean;
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
 * Deriva el estado visual de cards vacías / no disponibles.
 * La recuperación Wasi/n8n la orquesta useListUnavailableRecovery (un solo punto).
 */
export function useUnavailableRecovery({
  inmueble,
  imageFailed,
  recovering = false,
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

  if (inmueble._historicoDetailPending) {
    return {
      unavailable: false,
      verifying: true,
      displayId,
      displayLocation: '',
    };
  }

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

  const unavailable = looksUnavailable && !title && !hasPrice;
  const skipRecovery = Boolean(inmueble._omittedFromApi);

  const verifying =
    recovering ||
    (unavailable &&
      Boolean(displayId) &&
      !skipRecovery &&
      ENABLE_CLIENT_LIST_RECOVERY);

  return {
    unavailable,
    verifying,
    displayId,
    displayLocation,
  };
}
