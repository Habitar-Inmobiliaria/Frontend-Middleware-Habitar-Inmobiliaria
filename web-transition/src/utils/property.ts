// ============================================================
// Utilidades de identificación de inmuebles
// ------------------------------------------------------------
// Portado de js/vitrina/vitrina.js. Extrae un identificador legible
// del inmueble a partir de su URL o de sus códigos, para mostrarlo
// y para generar claves de lista estables.
// ============================================================

import type { VitrinaInmueble } from '../api/types';

/**
 * Extrae el identificador del inmueble desde una URL.
 * Soporta:
 * - URLs SEO de Wasi: /casa-venta-zona/8116766
 * - URLs privadas:    /venta/6e0e775d
 * - Sufijos de estado: /8116766-APROBADO, /venta/6e0e775d-DESCARTADO
 */
export function extractPropertyIdFromUrl(url: string | null | undefined): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';

  const stateSuffix = /-(APROBADO|DESCARTADO|VISITADO|REVISADO)$/i;

  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 2].toLowerCase() === 'venta') {
      return parts[parts.length - 1].replace(stateSuffix, '');
    }
    const lastPart = parts[parts.length - 1] || '';
    return lastPart.replace(stateSuffix, '');
  } catch {
    const clean = raw.replace(/\/+$/, '');
    const idxVenta = clean.toLowerCase().lastIndexOf('/venta/');
    if (idxVenta >= 0) {
      return clean.slice(idxVenta + '/venta/'.length).replace(stateSuffix, '');
    }
    return (clean.split('/').pop() ?? '').replace(stateSuffix, '');
  }
}

/** Identificador a mostrar para un inmueble (URL > códigos > id). */
export function getDisplayPropertyId(inmueble: VitrinaInmueble): string {
  const fromUrl = extractPropertyIdFromUrl(
    inmueble.url || inmueble.urlReferencia || inmueble.urlInmueble || '',
  );
  return String(fromUrl || inmueble.codigoNumerico || inmueble.id || '').trim();
}

/** Clave estable y única para renderizar un inmueble en una lista. */
export function getInmuebleKey(inmueble: VitrinaInmueble, index: number): string {
  // Preferir displayId: no cambia cuando la recuperación añade urlReferencia.
  return getDisplayPropertyId(inmueble) || getStableId(inmueble) || `inmueble-${index}`;
}

/** Identificador estable (sin recurrir al índice); '' si no hay ninguno. */
export function getStableId(inmueble: VitrinaInmueble): string {
  const displayId = getDisplayPropertyId(inmueble);
  if (displayId) return displayId;
  const candidate =
    inmueble.id || inmueble.urlReferencia || inmueble.url || inmueble.codigoNumerico;
  return candidate ? String(candidate) : '';
}

/**
 * URL que identifica al inmueble para el cambio de estado.
 * Soporte híbrido: Airtable entrega `url`, Wasi entrega `urlReferencia`.
 */
export function getActionUrl(inmueble: VitrinaInmueble): string {
  return inmueble.url || inmueble.urlReferencia || '';
}
