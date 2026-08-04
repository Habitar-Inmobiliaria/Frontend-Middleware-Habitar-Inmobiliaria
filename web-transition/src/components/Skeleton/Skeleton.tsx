import type { CSSProperties, HTMLAttributes } from 'react';
import styles from './Skeleton.module.css';

export type SkeletonRadius = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  /** Ancho CSS (px, %, etc.). Default 100%. */
  width?: string | number;
  /** Alto CSS. Default 1rem. */
  height?: string | number;
  radius?: SkeletonRadius;
  /** Variante un poco más oscura (títulos / valores). */
  tone?: 'default' | 'strong';
}

/**
 * Bloque base con shimmer (barrido ::after).
 * Presentacional: sin fetch; solo forma + animación.
 */
export default function Skeleton({
  width = '100%',
  height = '1rem',
  radius = 'md',
  tone = 'default',
  className = '',
  style,
  ...rest
}: SkeletonProps) {
  const merged: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  return (
    <span
      className={[
        styles.skeleton,
        styles[`r_${radius}`],
        tone === 'strong' ? styles.strong : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={merged}
      aria-hidden="true"
      {...rest}
    />
  );
}
