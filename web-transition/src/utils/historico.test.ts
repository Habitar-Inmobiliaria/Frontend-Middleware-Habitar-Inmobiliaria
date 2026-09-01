import { describe, expect, it } from 'vitest';
import {
  buildHistoricoShell,
  getHistoryBadge,
  getHistoryPropertyId,
  getLatestHistoryByProperty,
  mapHistoricoDetailToInmueble,
  normalizeHistoryState,
} from './historico';
import { buildHistoricoRecord } from '../../tests/factories/historico';
import { buildInmueble, buildPropertyDetail } from '../../tests/factories/inmueble';

describe('getHistoryPropertyId', () => {
  it('usa codigoNumerico como id de propiedad', () => {
    expect(getHistoryPropertyId(buildHistoricoRecord({ codigoNumerico: '999' }))).toBe('999');
  });
});

describe('getLatestHistoryByProperty', () => {
  it('conserva solo el registro más reciente por código', () => {
    const older = buildHistoricoRecord({
      id: 1,
      codigoNumerico: '100',
      fechaCreacion: '2026-01-01T00:00:00.000Z',
      estadoCodigo: 'REVISADO',
    });
    const newer = buildHistoricoRecord({
      id: 2,
      codigoNumerico: '100',
      fechaCreacion: '2026-02-01T00:00:00.000Z',
      estadoCodigo: 'APROBADO',
    });
    const other = buildHistoricoRecord({
      id: 3,
      codigoNumerico: '200',
      fechaCreacion: '2026-01-15T00:00:00.000Z',
    });

    const result = getLatestHistoryByProperty([older, newer, other]);
    expect(result).toHaveLength(2);

    const code100 = result.find((r) => r.codigoNumerico === '100');
    expect(code100?.estadoCodigo).toBe('APROBADO');
    expect(code100?._propertyId).toBe('100');
  });

  it('omite registros sin codigoNumerico', () => {
    const invalid = buildHistoricoRecord({ codigoNumerico: '' });
    expect(getLatestHistoryByProperty([invalid])).toHaveLength(0);
  });
});

describe('normalizeHistoryState', () => {
  it('mapea estados conocidos', () => {
    expect(normalizeHistoryState('APROBADO')).toBe('APROBADO');
    expect(normalizeHistoryState('descartado')).toBe('DESCARTADO');
  });

  it('devuelve SIN_REVISAR para estados desconocidos', () => {
    expect(normalizeHistoryState('OTRO')).toBe('SIN_REVISAR');
  });
});

describe('getHistoryBadge', () => {
  it('muestra TE INTERESO para APROBADO', () => {
    expect(getHistoryBadge('APROBADO')).toEqual({
      text: 'TE INTERESO',
      classKey: 'teIntereso',
    });
  });
});

describe('mapHistoricoDetailToInmueble', () => {
  it('combina registro histórico con detalle API', () => {
    const record = {
      ...buildHistoricoRecord({ codigoNumerico: '8116766' }),
      _propertyId: '8116766',
    };
    const detail = buildPropertyDetail({ titulo: 'Casa histórica' });

    const mapped = mapHistoricoDetailToInmueble(record, detail);
    expect(mapped.id).toBe('8116766');
    expect(mapped.titulo).toBe('Casa histórica');
    expect(mapped._fromHistorico).toBe(true);
    expect(mapped._locationRestricted).toBe(true);
    expect(mapped._historyMeta).toBe(record);
  });
});

describe('buildHistoricoShell', () => {
  it('marca detalle pendiente sin caché', () => {
    const record = {
      ...buildHistoricoRecord({ codigoNumerico: '500' }),
      _propertyId: '500',
    };
    const shell = buildHistoricoShell(record);
    expect(shell._historicoDetailPending).toBe(true);
    expect(shell.titulo).toBe('');
  });

  it('reutiliza caché y no marca pendiente', () => {
    const record = {
      ...buildHistoricoRecord({ codigoNumerico: '500' }),
      _propertyId: '500',
    };
    const cached = buildInmueble({ id: '500', titulo: 'Desde caché' });
    const shell = buildHistoricoShell(record, cached);
    expect(shell.titulo).toBe('Desde caché');
    expect(shell._historicoDetailPending).toBe(false);
  });
});
