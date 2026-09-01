// ============================================================
// Utilidades del histórico de inmuebles
// ------------------------------------------------------------
// Portado de getHistoryPropertyId / getLatestHistoryByProperty /
// formatHistoryDate / normalizeHistoryState en vitrina.js.
// ============================================================

import type { HistoricoInmueble, PropertyDetail, VitrinaInmueble } from '../api/types';

export const HISTORICO_PAGE_SIZE = 10;

/** Registro de histórico enriquecido con el id de propiedad resuelto. */
export interface HistoricoRecord extends HistoricoInmueble {
  _propertyId: string;
}

export function getHistoryPropertyId(item: HistoricoInmueble): string {
  return String(item.codigoNumerico || '').trim();
}

/** Deja solo el registro más reciente por cada propiedad. */
export function getLatestHistoryByProperty(histData: HistoricoInmueble[]): HistoricoRecord[] {
  const latestByCode = new Map<string, HistoricoRecord>();
  for (const item of histData || []) {
    const propertyId = getHistoryPropertyId(item);
    if (!propertyId) continue;

    const prev = latestByCode.get(propertyId);
    if (!prev) {
      latestByCode.set(propertyId, { ...item, _propertyId: propertyId });
      continue;
    }
    const prevTs = Date.parse(prev.fechaCreacion || '') || 0;
    const currTs = Date.parse(item.fechaCreacion || '') || 0;
    if (currTs >= prevTs) {
      latestByCode.set(propertyId, { ...item, _propertyId: propertyId });
    }
  }
  return Array.from(latestByCode.values());
}

export function formatHistoryDate(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(isoString);
  }
}

export type HistoryStateCode =
  | 'APROBADO'
  | 'DESCARTADO'
  | 'VISITADO'
  | 'REVISADO'
  | 'SIN_REVISAR';

export function normalizeHistoryState(estadoCodigo: string | null | undefined): HistoryStateCode {
  const code = String(estadoCodigo || '').toUpperCase();
  if (code === 'APROBADO') return 'APROBADO';
  if (code === 'DESCARTADO') return 'DESCARTADO';
  if (code === 'VISITADO') return 'VISITADO';
  if (code === 'REVISADO') return 'REVISADO';
  return 'SIN_REVISAR';
}

/** Texto y clave de estilo del badge según el estado del histórico. */
export function getHistoryBadge(estadoCodigo: string | null | undefined): {
  text: string;
  classKey: string;
} {
  const stateCode = normalizeHistoryState(estadoCodigo);
  if (stateCode === 'APROBADO') {
    return { text: 'TE INTERESO', classKey: 'teIntereso' };
  }
  return {
    text: stateCode.replace('_', ' '),
    classKey: stateCode.toLowerCase(),
  };
}

/** Mapea detalle API → inmueble de grilla para la pestaña Histórico. */
export function mapHistoricoDetailToInmueble(
  record: HistoricoRecord,
  pDetail: PropertyDetail,
): VitrinaInmueble {
  const propertyId = record._propertyId;
  return {
    id: propertyId,
    titulo: pDetail.titulo || '',
    imagenUrl:
      pDetail.galeriasImagenes && pDetail.galeriasImagenes.length > 0
        ? pDetail.galeriasImagenes[0]
        : '',
    descripcionCorta:
      pDetail.descripcion || pDetail.observaciones || pDetail.descripcionCorta || '',
    precioFormateado:
      pDetail.precioFormateado ||
      (pDetail.precio ? `$${Number(pDetail.precio).toLocaleString('es-CO')}` : ''),
    ubicacion: pDetail.ubicacion,
    urlReferencia: pDetail.urlReferencia || pDetail.url || '',
    url: pDetail.url || pDetail.urlReferencia || '',
    codigoNumerico: record.codigoNumerico,
    _historyMeta: record,
    _fromHistorico: true,
    _locationRestricted: true,
    _externalDataSource: true,
  };
}

/** Shell de histórico antes de cargar el detalle de la página visible. */
export function buildHistoricoShell(
  record: HistoricoRecord,
  cached?: VitrinaInmueble | null,
): VitrinaInmueble {
  if (cached) {
    return {
      ...cached,
      _historyMeta: record,
      _fromHistorico: true,
      _historicoDetailPending: false,
    };
  }
  return {
    id: record._propertyId,
    codigoNumerico: record.codigoNumerico,
    titulo: '',
    imagenUrl: '',
    descripcionCorta: '',
    precioFormateado: '',
    ubicacion: '',
    urlReferencia: '',
    url: '',
    _historyMeta: record,
    _fromHistorico: true,
    _locationRestricted: true,
    _externalDataSource: true,
    _historicoDetailPending: true,
  };
}
