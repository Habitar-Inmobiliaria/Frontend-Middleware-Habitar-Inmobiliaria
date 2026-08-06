import type { VitrinaInmueble } from '../api/types';
import { extractPropertyIdFromUrl } from './property';

/** Resultado de separar alertas de omitidos vs el resto. */
export interface ParsedVitrinaAlertas {
  /** Inmuebles stub para mostrar como card "no disponible". */
  omitted: VitrinaInmueble[];
  /** Alertas que no son de omitidos (si las hubiera). */
  otherAlerts: string[];
}

/**
 * Detecta mensajes del middleware del estilo:
 * "Inmueble no disponible vía API (omitido): 10071229"
 * "Inmueble no disponible vía API (omitido): https://..."
 */
export function isOmittedPropertyAlert(alerta: string): boolean {
  return /no disponible.*omitido|omitido.*vía\s*api|vía\s*api.*omitido/i.test(alerta);
}

/** Extrae id numérico o código desde el texto de la alerta. */
export function extractOmittedPropertyId(alerta: string): string {
  const afterColon = alerta.split(':').pop()?.trim() || '';
  if (!afterColon) return '';

  const fromUrl = extractPropertyIdFromUrl(afterColon);
  if (fromUrl) return fromUrl;

  const numeric = afterColon.match(/\b(\d{5,})\b/);
  if (numeric) return numeric[1];

  // Último token alfanumérico razonable.
  const token = afterColon.replace(/[^\w-]/g, '').trim();
  return token || '';
}

export function buildOmittedPropertyStub(id: string): VitrinaInmueble {
  return {
    id,
    codigoNumerico: id,
    titulo: '',
    ubicacion: '',
    descripcionCorta: '',
    imagenUrl: '',
    precioFormateado: '',
    estado: 'SIN_REVISAR',
    _omittedFromApi: true,
  };
}

/**
 * Convierte alertas "omitido" en cards stub y filtra esas alertas del banner de texto.
 */
export function parseVitrinaAlertas(
  alertas: string[] | null | undefined,
  existingIds: Set<string> = new Set(),
): ParsedVitrinaAlertas {
  const omitted: VitrinaInmueble[] = [];
  const otherAlerts: string[] = [];
  const seen = new Set<string>(existingIds);

  for (const raw of alertas ?? []) {
    const alerta = String(raw || '').trim();
    if (!alerta) continue;

    if (!isOmittedPropertyAlert(alerta)) {
      otherAlerts.push(alerta);
      continue;
    }

    const id = extractOmittedPropertyId(alerta);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    omitted.push(buildOmittedPropertyStub(id));
  }

  return { omitted, otherAlerts };
}
