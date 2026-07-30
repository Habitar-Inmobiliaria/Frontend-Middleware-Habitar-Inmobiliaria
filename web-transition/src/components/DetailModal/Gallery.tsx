import { useState } from 'react';
import { useProgressiveImage } from '../../hooks/useProgressiveImage';
import { getLowQualityUrl } from '../../utils/imageQuality';
import Lightbox from './Lightbox';
import styles from './DetailModal.module.css';

const PLACEHOLDER = 'https://via.placeholder.com/800x500?text=Sin+imagen';

interface GalleryProps {
  images: string[];
  title: string;
}

// Carrusel con carga progresiva (preview → HQ) y lightbox a pantalla completa.
export default function Gallery({ images, title }: GalleryProps) {
  const imgs = images.length ? images : [PLACEHOLDER];
  const [current, setCurrent] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const total = imgs.length;

  const go = (index: number) => setCurrent(((index % total) + total) % total);

  return (
    <>
      <div className={styles.viewport}>
        <div className={styles.track} style={{ transform: `translateX(-${current * 100}%)` }}>
          {imgs.map((src, i) => (
            <CarouselSlide
              key={`${src}-${i}`}
              src={src}
              alt={`${title} - Foto ${i + 1}`}
              eager={i === 0}
              active={i === current}
              onOpen={() => setLightboxIndex(i)}
            />
          ))}
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              className={`${styles.arrow} ${styles.prev}`}
              aria-label="Anterior"
              onClick={() => go(current - 1)}
            >
              &#8249;
            </button>
            <button
              type="button"
              className={`${styles.arrow} ${styles.next}`}
              aria-label="Siguiente"
              onClick={() => go(current + 1)}
            >
              &#8250;
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <div className={styles.thumbs}>
          {imgs.map((src, i) => (
            <img
              key={`thumb-${src}-${i}`}
              src={getLowQualityUrl(src)}
              alt={`Miniatura ${i + 1}`}
              className={`${styles.thumb} ${i === current ? styles.thumbActive : ''}`}
              onError={(e) => {
                const img = e.currentTarget;
                // 1) intenta URL original; 2) placeholder final.
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
              onClick={() => {
                go(i);
                setLightboxIndex(i);
              }}
            />
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox images={imgs} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </>
  );
}

interface CarouselSlideProps {
  src: string;
  alt: string;
  eager: boolean;
  active: boolean;
  onOpen: () => void;
}

function CarouselSlide({ src, alt, eager, active, onOpen }: CarouselSlideProps) {
  // HQ solo en la slide visible (o la primera); el resto queda en preview.
  const { displaySrc, loading, isHq } = useProgressiveImage(src, {
    preferHq: active || eager,
  });

  return (
    <div className={styles.slide}>
      {active && loading && (
        <div className={styles.slideLoading} aria-hidden="true">
          <div className={styles.lightboxSpinner} />
        </div>
      )}
      <img
        className={`${styles.img} ${loading && !isHq ? styles.imgPreview : ''}`}
        src={displaySrc || getLowQualityUrl(src)}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
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
        onClick={onOpen}
      />
    </div>
  );
}
