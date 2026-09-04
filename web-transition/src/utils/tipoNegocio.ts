import type { TipoNegocio, VitrinaInmueble } from '../api/types';

/** Filtros de UI (chips). Ambos desactivados = sin filtro. */
export type TipoNegocioFiltro = 'VENTA' | 'ALQUILER';

export function normalizeTipoNegocio(
  value: string | null | undefined,
): TipoNegocio {
  const t = String(value || '').trim().toUpperCase();
  if (t === 'VENTA') return 'VENTA';
  if (t === 'ALQUILER') return 'ALQUILER';
  if (t === 'VENTA_Y_ALQUILER') return 'VENTA_Y_ALQUILER';
  return 'DESCONOCIDO';
}

/**
 * Un inmueble coincide con un chip si es exactamente ese tipo
 * o es VENTA_Y_ALQUILER (aparece en ambos filtros).
 */
export function matchesTipoNegocio(
  item: VitrinaInmueble,
  filtro: TipoNegocioFiltro,
): boolean {
  const t = normalizeTipoNegocio(item.tipoNegocio);
  return t === filtro || t === 'VENTA_Y_ALQUILER';
}

/**
 * Filtra por chips activos.
 * - Ninguno activo → lista completa (incluye DESCONOCIDO).
 * - Uno o ambos → OR de matchesTipoNegocio (DESCONOCIDO queda fuera).
 */
export function filterInmueblesByTipoNegocio(
  list: VitrinaInmueble[],
  filtros: ReadonlySet<TipoNegocioFiltro> | TipoNegocioFiltro[],
): VitrinaInmueble[] {
  const active = filtros instanceof Set ? filtros : new Set(filtros);
  if (active.size === 0) return list;

  return list.filter((item) => {
    for (const f of active) {
      if (matchesTipoNegocio(item, f)) return true;
    }
    return false;
  });
}
