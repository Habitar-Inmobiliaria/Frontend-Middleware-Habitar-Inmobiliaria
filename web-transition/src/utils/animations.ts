/**
 * Timing del stagger reveal post-skeleton (CSS, sin Framer Motion).
 * Primera visita: skeleton breve + entrada escalonada.
 * Recargas: se omite vía localStorage (ver utils/entrance.ts).
 */

/** Tiempo mínimo de skeleton en la primera visita. */
export const MIN_SKELETON_MS = 1100;

/** Espacio entre entradas consecutivas. */
export const STAGGER_STEP_MS = 180;
/** Tope de delay acumulado en listas largas. */
export const STAGGER_CAP_MS = 800;
/** Duración del bounce de cada ítem. */
export const ITEM_DURATION_MS = 580;
/** Fade-out del skeleton antes del contenido. */
export const SKELETON_EXIT_MS = 180;
/** Pausa antes del primer elemento. */
export const DELAY_CHILDREN_MS = 80;

export function staggerDelayMs(
  index: number,
  stepMs = STAGGER_STEP_MS,
  capMs = STAGGER_CAP_MS,
): number {
  return Math.min(Math.max(0, index) * stepMs, capMs);
}

export function entranceTotalMs(itemCount: number): number {
  return DELAY_CHILDREN_MS + staggerDelayMs(Math.max(0, itemCount - 1)) + ITEM_DURATION_MS + 120;
}
