import { useEffect, useState } from 'react';
import type { VitrinaInmueble } from '../../api/types';
import type { TabId } from '../../utils/estado';
import { isZeroPrice, normalizeDisplayText, normalizeImageUrl } from '../../utils/text';
import { useUnavailableRecovery } from '../../hooks/useUnavailableRecovery';
import ActionBar, { type CardAccion } from '../ActionBar/ActionBar';
import styles from './PropertyCard.module.css';

interface PropertyCardProps {
  inmueble: VitrinaInmueble;
  activeTab: TabId;
  processing: boolean;
  onAction: (inmueble: VitrinaInmueble, accion: CardAccion) => void;
  onOpenDetail: (inmueble: VitrinaInmueble) => void;
  /** Actualiza el inmueble en el estado padre tras recuperación Wasi/n8n. */
  onRecovered?: (updated: VitrinaInmueble) => void;
}

// Tarjeta de un inmueble. Presenta imagen, precio, ID, título, ubicación,
// descripción y las acciones según la pestaña activa.
// El enrichment Wasi→n8n del listado vive en el middleware; la card solo
// muestra shell vacío si el ítem llega sin datos útiles.
export default function PropertyCard({
  inmueble,
  activeTab,
  processing,
  onAction,
  onOpenDetail,
  onRecovered,
}: PropertyCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageUrl = normalizeImageUrl(inmueble.imagenUrl);

  // Si la recuperación cambia la URL, permitir reintentar la carga.
  useEffect(() => {
    setImageFailed(false);
    setImageLoaded(false);
  }, [imageUrl]);

  const { unavailable, verifying, displayId, displayLocation } = useUnavailableRecovery({
    inmueble,
    imageFailed,
    onRecovered: onRecovered ?? (() => undefined),
  });

  const title = normalizeDisplayText(inmueble.titulo);
  const description = normalizeDisplayText(inmueble.descripcionCorta);
  const image = imageUrl;

  const rawPrice = inmueble.precioFormateado || '';
  const showPrice = !isZeroPrice(rawPrice);

  if (unavailable) {
    return (
      <article
        className={`${styles.card} ${styles.cardUnavailable}`}
        data-property-code={displayId || undefined}
      >
        <div className={`${styles.imageWrapper} ${styles.imageWrapperUnavailable}`}>
          <div className={styles.unavailableMedia}>Previsualización de inmueble</div>
        </div>
        <div className={styles.details}>
          <div className={styles.unavailableRibbon}>
            El inmueble con id {displayId || 'N/D'} ya no se encuentra disponible
          </div>
          {verifying && (
            <div className={styles.verifying} role="status" aria-live="polite">
              <span className={styles.verifyingSpinner} aria-hidden="true" />
              <span>Verificando disponibilidad…</span>
            </div>
          )}
          <h2 className={styles.title}>Inmueble no disponible</h2>
        </div>
      </article>
    );
  }

  return (
    <article className={styles.card} data-property-code={displayId || undefined}>
      <div
        className={`${styles.imageWrapper} ${styles.clickable}`}
        onClick={() => onOpenDetail(inmueble)}
      >
        {image && !imageFailed ? (
          <img
            className={`${styles.image} ${imageLoaded ? styles.imageReady : styles.imageLoading}`}
            src={image}
            alt={title || 'Propiedad'}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className={styles.unavailableMedia}>Vista previa no disponible</div>
        )}

        {showPrice && <span className={styles.priceBadge}>{rawPrice}</span>}
        {displayId && <div className={styles.idTab}>ID: {displayId}</div>}
      </div>

      <div className={styles.details}>
        <div className={styles.header}>
          <h2
            className={`${styles.title} ${styles.clickable}`}
            onClick={() => onOpenDetail(inmueble)}
          >
            {title || '(sin título)'}
          </h2>
          {displayLocation && <p className={styles.location}>📍 {displayLocation}</p>}
        </div>
        {description && <p className={styles.description}>{description}</p>}

        <ActionBar
          activeTab={activeTab}
          disabled={processing}
          onAction={(accion) => onAction(inmueble, accion)}
        />
      </div>
    </article>
  );
}
