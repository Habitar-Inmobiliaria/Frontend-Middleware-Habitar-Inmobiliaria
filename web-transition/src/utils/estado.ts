// ============================================================
// Normalización del estado de un inmueble
// ------------------------------------------------------------
// Portado de getEstado() en js/vitrina/vitrina.js. El estado puede
// venir en el campo `estado` o, como respaldo, en el sufijo de la
// URL (Airtable usa `url`, Wasi usa `urlReferencia`).
// ============================================================

import type { VitrinaInmueble } from '../api/types';

/** Estado interno normalizado de un inmueble. */
export type EstadoInmueble = 'sin-revisar' | 'aprobado' | 'descartado' | 'visitado';

/** Identificadores de las pestañas de estado. */
export type TabId = 'sin-revisar' | 'aprobadas' | 'descartadas' | 'visitados' | 'historico';

export function getEstado(inmueble: VitrinaInmueble): EstadoInmueble {
  const e = (inmueble.estado || '').toUpperCase();
  if (e === 'APROBADO') return 'aprobado';
  if (e === 'DESCARTADO') return 'descartado';
  if (e === 'VISITADO') return 'visitado';

  // Respaldo bilingüe: Airtable usa `url`, Wasi usa `urlReferencia`.
  const url = (inmueble.url || inmueble.urlReferencia || '').toUpperCase();
  if (url.endsWith('-APROBADO')) return 'aprobado';
  if (url.endsWith('-DESCARTADO')) return 'descartado';
  if (url.endsWith('-VISITADO')) return 'visitado';

  return 'sin-revisar';
}

/** Relación pestaña de listado -> estado (no incluye histórico). */
const TAB_TO_ESTADO: Record<Exclude<TabId, 'historico'>, EstadoInmueble> = {
  'sin-revisar': 'sin-revisar',
  aprobadas: 'aprobado',
  descartadas: 'descartado',
  visitados: 'visitado',
};

/** true si el inmueble pertenece a la pestaña indicada (no aplica a histórico). */
export function matchesTab(inmueble: VitrinaInmueble, tab: TabId): boolean {
  if (tab === 'historico') return false;
  return getEstado(inmueble) === TAB_TO_ESTADO[tab];
}
