import type { HistoricoInmueble } from '../../src/api/types';

export function buildHistoricoRecord(
  overrides: Partial<HistoricoInmueble> = {},
): HistoricoInmueble {
  return {
    id: 1,
    codigoNumerico: '8116766',
    fechaCreacion: '2026-01-15T10:00:00.000Z',
    clienteAsociado: 197928127379,
    estadoCodigo: 'REVISADO',
    ...overrides,
  };
}
