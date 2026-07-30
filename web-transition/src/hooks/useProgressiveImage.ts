import { useEffect, useState } from 'react';
import {
  getHighQualityUrl,
  getLowQualityUrl,
  preloadImage,
} from '../utils/imageQuality';

export interface ProgressiveImageState {
  /** URL que debe mostrarse ahora (preview o HQ). */
  displaySrc: string;
  /** true mientras se espera la versión de alta calidad. */
  loading: boolean;
  /** true cuando la URL mostrada ya es la HQ (o no había alternativa). */
  isHq: boolean;
}

interface UseProgressiveImageOptions {
  /**
   * Si es false, solo se usa la preview (sin pedir HQ).
   * Útil en slides del carrusel que no están visibles.
   */
  preferHq?: boolean;
}

/**
 * Carga progresiva: muestra preview rápida y, en cuanto esté lista,
 * sustituye por la versión de máxima calidad del CDN Wasi.
 */
export function useProgressiveImage(
  originalSrc: string | undefined | null,
  { preferHq = true }: UseProgressiveImageOptions = {},
): ProgressiveImageState {
  const src = String(originalSrc ?? '').trim();
  const lowSrc = src ? getLowQualityUrl(src) : '';

  const [displaySrc, setDisplaySrc] = useState(lowSrc);
  const [loading, setLoading] = useState(Boolean(src && preferHq));
  const [isHq, setIsHq] = useState(false);

  useEffect(() => {
    if (!src) {
      setDisplaySrc('');
      setLoading(false);
      setIsHq(false);
      return;
    }

    const low = getLowQualityUrl(src);
    setDisplaySrc(low);

    if (!preferHq) {
      setLoading(false);
      setIsHq(false);
      return;
    }

    const hq = getHighQualityUrl(src);

    if (!hq || hq === low) {
      setDisplaySrc(hq || low);
      setLoading(false);
      setIsHq(true);
      return;
    }

    let cancelled = false;
    setIsHq(false);
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
        setDisplaySrc(low);
        setIsHq(false);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [src, preferHq]);

  return { displaySrc, loading, isHq };
}
