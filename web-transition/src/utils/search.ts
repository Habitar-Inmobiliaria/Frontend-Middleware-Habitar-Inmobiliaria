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
 * Coincide por título (nombre) o código/id del inmueble.
 * Búsqueda parcial, sin distinguir mayúsculas/acentos.
 */
export function matchesInmuebleSearch(
  inmueble: VitrinaInmueble,
  rawQuery: string,
): boolean {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return true;

  const title = normalizeSearchQuery(normalizeDisplayText(inmueble.titulo));
  const id = normalizeSearchQuery(getDisplayPropertyId(inmueble));
  const codigo = normalizeSearchQuery(String(inmueble.codigoNumerico || inmueble.id || ''));

  return title.includes(query) || id.includes(query) || codigo.includes(query);
}

export function filterInmueblesBySearch(
  list: VitrinaInmueble[],
  rawQuery: string,
): VitrinaInmueble[] {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return list;
  return list.filter((item) => matchesInmuebleSearch(item, query));
}
