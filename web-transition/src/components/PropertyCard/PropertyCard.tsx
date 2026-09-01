import { memo, useEffect, useState } from 'react';
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
  /** Recuperación Wasi/n8n en curso (orquestada en el listado). */
  recovering?: boolean;
  onAction: (inmueble: VitrinaInmueble, accion: CardAccion) => void;
  onOpenDetail: (inmueble: VitrinaInmueble) => void;
}

// Tarjeta de un inmueble. Presenta imagen, precio, ID, título, ubicación,
// descripción y las acciones según la pestaña activa.
function PropertyCard({
  inmueble,
  activeTab,
  processing,
  recovering = false,
  onAction,
  onOpenDetail,
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
    recovering,
  });

  const title = normalizeDisplayText(inmueble.titulo);
  const description = normalizeDisplayText(inmueble.descripcionCorta);
  const image = imageUrl;

  const rawPrice = inmueble.precioFormateado || '';
  const showPrice = !isZeroPrice(rawPrice);

  if (unavailable) {
    // Mientras verifica: solo el estado de recuperación (sin mensaje definitivo).
    if (verifying) {
      return (
        <article
          className={`${styles.card} ${styles.cardUnavailable}`}
          data-property-code={displayId || undefined}
        >
          <div className={`${styles.imageWrapper} ${styles.imageWrapperUnavailable}`}>
            <div className={styles.unavailableMedia}>Previsualización de inmueble</div>
          </div>
          <div className={styles.details}>
            <div className={styles.verifying} role="status" aria-live="polite">
              <span className={styles.verifyingSpinner} aria-hidden="true" />
              <span>Verificando disponibilidad…</span>
            </div>
            {displayId ? <p className={styles.verifyingId}>ID: {displayId}</p> : null}
            <h2 className={styles.title}>Completando información…</h2>
          </div>
        </article>
      );
    }

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

function propertyCardPropsEqual(prev: PropertyCardProps, next: PropertyCardProps): boolean {
  return (
    prev.activeTab === next.activeTab &&
    prev.processing === next.processing &&
    prev.recovering === next.recovering &&
    prev.onAction === next.onAction &&
    prev.onOpenDetail === next.onOpenDetail &&
    prev.inmueble === next.inmueble
  );
}

export default memo(PropertyCard, propertyCardPropsEqual);
