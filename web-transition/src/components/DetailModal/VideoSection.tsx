import { useState } from 'react';
import { getYouTubeEmbedUrl, isValidHttpUrl } from '../../utils/video';
import styles from './DetailModal.module.css';

interface VideoSectionProps {
  video: string | undefined;
}

// Sección de video: tarjeta que abre un overlay con el embed de YouTube,
// o abre el enlace externo en una pestaña nueva si no es incrustable.
export default function VideoSection({ video }: VideoSectionProps) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const rawUrl = String(video ?? '').trim();

  if (!isValidHttpUrl(rawUrl)) return null;

  const embedUrl = getYouTubeEmbedUrl(rawUrl);
  const actionLabel = embedUrl ? 'Ver video' : 'Abrir enlace de video';
  const hint = embedUrl ? 'Se abrirá en vista previa' : 'Se abrirá en una nueva pestaña';

  const handleClick = () => {
    if (embedUrl) setOverlayOpen(true);
    else window.open(rawUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className={styles.videoSection}>
      <h3 className={styles.videoSectionTitle}>Video del inmueble</h3>
      <button
        type="button"
        className={styles.videoCardBtn}
        aria-label={actionLabel}
        onClick={handleClick}
      >
        <span className={styles.videoCardIcon}>▶</span>
        <span className={styles.videoCardContent}>
          <strong>{actionLabel}</strong>
          <small>{hint}</small>
        </span>
      </button>

      {overlayOpen && embedUrl && (
        <div
          className={`${styles.videoOverlay} ${styles.videoOverlayActive}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOverlayOpen(false);
          }}
        >
          <div className={styles.videoOverlayDialog} role="dialog" aria-modal="true" aria-label="Video del inmueble">
            <button
              type="button"
              className={styles.videoOverlayClose}
              aria-label="Cerrar video"
              onClick={() => setOverlayOpen(false)}
            >
              ✕
            </button>
            <div className={styles.videoOverlayFrameWrap}>
              <iframe
                className={styles.videoOverlayFrame}
                src={embedUrl}
                title="Video del inmueble"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
