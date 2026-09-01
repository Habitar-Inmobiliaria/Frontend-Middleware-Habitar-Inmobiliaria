import type { VitrinaInmueble } from '../api/types';
import { getDisplayPropertyId } from './property';
import { normalizeDisplayText } from './text';

/** Normaliza texto de búsqueda: minúsculas, sin acentos, espacios colapsados. */
export function normalizeSearchQuery(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/**
 * Coincide por título, código o id. `normalizedQuery` debe venir de normalizeSearchQuery.
 */
export function matchesInmuebleSearch(
  inmueble: VitrinaInmueble,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;

  const title = normalizeSearchQuery(normalizeDisplayText(inmueble.titulo));
  const id = normalizeSearchQuery(getDisplayPropertyId(inmueble));
  const codigo = normalizeSearchQuery(String(inmueble.codigoNumerico || inmueble.id || ''));

  return (
    title.includes(normalizedQuery) ||
    id.includes(normalizedQuery) ||
    codigo.includes(normalizedQuery)
  );
}

export function filterInmueblesBySearch(
  list: VitrinaInmueble[],
  rawQuery: string,
): VitrinaInmueble[] {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return list;
  return list.filter((item) => matchesInmuebleSearch(item, query));
}
