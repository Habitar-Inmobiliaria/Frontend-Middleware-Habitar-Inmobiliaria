import { useEffect, useState } from 'react';
import { getHighQualityUrl, getLowQualityUrl, preloadImage } from '../../utils/imageQuality';
import styles from './DetailModal.module.css';

interface LightboxProps {
  images: string[];
  startIndex: number;
  onClose: () => void;
}

const PLACEHOLDER = 'https://via.placeholder.com/1600x1000?text=Sin+imagen';

/**
 * Visor a pantalla completa (fiel al lightbox vanilla):
 * - La imagen ocupa casi todo el ancho (92vw / 1700px), como el original.
 * - Muestra preview mientras carga y sustituye por HQ al estar lista.
 * - Spinner breve durante la carga de alta calidad.
 */
export default function Lightbox({ images, startIndex, onClose }: LightboxProps) {
  const total = images.length;
  const [current, setCurrent] = useState(startIndex);
  const [active, setActive] = useState(false);
  const [displaySrc, setDisplaySrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [isHq, setIsHq] = useState(false);

  const nav = (delta: number) => setCurrent((c) => ((c + delta) % total + total) % total);

  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') nav(-1);
      else if (e.key === 'ArrowRight') nav(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, total]);

  // Carga progresiva de la imagen actual (preview → HQ).
  useEffect(() => {
    const original = images[current] ?? '';
    if (!original) {
      setDisplaySrc('');
      setLoading(false);
      setIsHq(false);
      return;
    }

    const low = getLowQualityUrl(original);
    const hq = getHighQualityUrl(original);

    setDisplaySrc(low);
    setIsHq(false);

    if (!hq || hq === low) {
      setDisplaySrc(hq || low);
      setIsHq(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    preloadImage(hq)
      .then((ready) => {
        if (cancelled) return;
        setDisplaySrc(ready);
        setIsHq(true);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: al menos mostrar la preview a tamaño lightbox.
        setDisplaySrc(low);
        // Marcamos "lista" para quitar cualquier filtro visual permanente.
        setIsHq(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [current, images]);

  // Prefetch de vecinos.
  useEffect(() => {
    if (total < 2) return;
    const next = images[(current + 1) % total];
    const prev = images[(current - 1 + total) % total];
    if (next) void preloadImage(getHighQualityUrl(next)).catch(() => undefined);
    if (prev) void preloadImage(getHighQualityUrl(prev)).catch(() => undefined);
  }, [current, images, total]);

  return (
    <div
      className={`${styles.lightbox} ${active ? styles.lightboxActive : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button type="button" className={styles.lightboxClose} aria-label="Cerrar visor" onClick={onClose}>
        ✕
      </button>

      {total > 1 && (
        <button
          type="button"
          className={`${styles.lightboxArrow} ${styles.lightboxPrev}`}
          aria-label="Imagen anterior"
          onClick={() => nav(-1)}
        >
          &#8249;
        </button>
      )}

      <div
        className={styles.lightboxImgContainer}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {loading && (
          <div className={styles.lightboxLoading} aria-live="polite" aria-busy="true">
            <div className={styles.lightboxSpinner} />
            <span>Cargando imagen en alta calidad…</span>
          </div>
        )}

        {displaySrc && (
          <img
            className={`${styles.lightboxImg} ${loading ? styles.lightboxImgLoading : ''} ${
              loading && !isHq ? styles.lightboxImgPreview : styles.lightboxImgReady
            }`}
            src={displaySrc}
            alt={`Imagen ${current + 1} de ${total}`}
            sizes="100vw"
            decoding="async"
            onError={(e) => {
              const img = e.currentTarget;
              const original = images[current] ?? '';
              // 1) URL original; 2) placeholder final.
              if (!img.dataset.fallbackStep) {
                img.dataset.fallbackStep = '1';
                img.src = original || PLACEHOLDER;
                return;
              }
              if (img.dataset.fallbackStep === '1') {
                img.dataset.fallbackStep = '2';
                img.src = PLACEHOLDER;
              }
            }}
          />
        )}
      </div>

      {total > 1 && (
        <button
          type="button"
          className={`${styles.lightboxArrow} ${styles.lightboxNext}`}
          aria-label="Imagen siguiente"
          onClick={() => nav(1)}
        >
          &#8250;
        </button>
      )}

      {total > 1 && (
        <div className={styles.lightboxThumbs}>
          {images.map((src, i) => (
            <img
              key={`lb-${src}-${i}`}
              src={getLowQualityUrl(src)}
              alt={`Miniatura ${i + 1}`}
              className={`${styles.lightboxThumb} ${i === current ? styles.lightboxThumbActive : ''}`}
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.fallbackStep) {
                  img.dataset.fallbackStep = '1';
                  img.src = src;
                  return;
                }
                if (img.dataset.fallbackStep === '1') {
                  img.dataset.fallbackStep = '2';
                  img.src = PLACEHOLDER;
                }
              }}
              onClick={() => setCurrent(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
