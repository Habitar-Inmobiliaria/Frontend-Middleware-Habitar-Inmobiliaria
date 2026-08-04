/**
 * Timing del stagger reveal post-skeleton (CSS, sin Framer Motion).
 *
 * Valores deliberadamente notorios para percibir secuencia + rebote.
 * MIN_SKELETON_MS alarga el placeholder aunque la API responda al instante.
 */

/** Tiempo mínimo mostrando skeleton (simula carga / da tiempo a ver el efecto). */
export const MIN_SKELETON_MS = 2200;

/** Espacio entre entradas: alto a propósito para ver uno → siguiente. */
export const STAGGER_STEP_MS = 260;
/** Tope de delay acumulado (primeras ~4–5 cards bien escalonadas). */
export const STAGGER_CAP_MS = 1100;
/** Duración del bounce de cada ítem. */
export const ITEM_DURATION_MS = 700;
/** Fade-out del skeleton antes del contenido. */
export const SKELETON_EXIT_MS = 280;
/** Pausa antes del primer elemento. */
export const DELAY_CHILDREN_MS = 160;

export function staggerDelayMs(
  index: number,
  stepMs = STAGGER_STEP_MS,
  capMs = STAGGER_CAP_MS,
): number {
  return Math.min(Math.max(0, index) * stepMs, capMs);
}

export function entranceTotalMs(itemCount: number): number {
  return DELAY_CHILDREN_MS + staggerDelayMs(Math.max(0, itemCount - 1)) + ITEM_DURATION_MS + 200;
}
