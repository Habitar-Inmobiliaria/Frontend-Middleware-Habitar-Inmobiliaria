import { describe, expect, it } from 'vitest';
import {
  filterInmueblesByTipoNegocio,
  matchesTipoNegocio,
  normalizeTipoNegocio,
} from './tipoNegocio';
import { buildInmueble } from '../../tests/factories/inmueble';

describe('normalizeTipoNegocio', () => {
  it('normaliza valores conocidos', () => {
    expect(normalizeTipoNegocio('venta')).toBe('VENTA');
    expect(normalizeTipoNegocio('ALQUILER')).toBe('ALQUILER');
    expect(normalizeTipoNegocio('VENTA_Y_ALQUILER')).toBe('VENTA_Y_ALQUILER');
  });

  it('devuelve DESCONOCIDO para ausente o inválido', () => {
    expect(normalizeTipoNegocio(undefined)).toBe('DESCONOCIDO');
    expect(normalizeTipoNegocio('')).toBe('DESCONOCIDO');
    expect(normalizeTipoNegocio('otro')).toBe('DESCONOCIDO');
  });
});

describe('matchesTipoNegocio', () => {
  it('coincide con el tipo exacto', () => {
    expect(matchesTipoNegocio(buildInmueble({ tipoNegocio: 'VENTA' }), 'VENTA')).toBe(true);
    expect(matchesTipoNegocio(buildInmueble({ tipoNegocio: 'ALQUILER' }), 'VENTA')).toBe(false);
  });

  it('VENTA_Y_ALQUILER aparece en ambos filtros', () => {
    const dual = buildInmueble({ tipoNegocio: 'VENTA_Y_ALQUILER' });
    expect(matchesTipoNegocio(dual, 'VENTA')).toBe(true);
    expect(matchesTipoNegocio(dual, 'ALQUILER')).toBe(true);
  });

  it('DESCONOCIDO no coincide con ningún chip', () => {
    const unk = buildInmueble({ tipoNegocio: 'DESCONOCIDO' });
    expect(matchesTipoNegocio(unk, 'VENTA')).toBe(false);
    expect(matchesTipoNegocio(unk, 'ALQUILER')).toBe(false);
  });
});

describe('filterInmueblesByTipoNegocio', () => {
  const list = [
    buildInmueble({ id: '1', tipoNegocio: 'VENTA' }),
    buildInmueble({ id: '2', tipoNegocio: 'ALQUILER' }),
    buildInmueble({ id: '3', tipoNegocio: 'VENTA_Y_ALQUILER' }),
    buildInmueble({ id: '4', tipoNegocio: 'DESCONOCIDO' }),
  ];

  it('sin filtros devuelve la lista completa', () => {
    expect(filterInmueblesByTipoNegocio(list, [])).toHaveLength(4);
  });

  it('filtra solo venta (+ dual)', () => {
    const filtered = filterInmueblesByTipoNegocio(list, ['VENTA']);
    expect(filtered.map((i) => i.id).sort()).toEqual(['1', '3']);
  });

  it('filtra solo alquiler (+ dual)', () => {
    const filtered = filterInmueblesByTipoNegocio(list, ['ALQUILER']);
    expect(filtered.map((i) => i.id).sort()).toEqual(['2', '3']);
  });

  it('ambos chips hacen OR (excluye DESCONOCIDO)', () => {
    const filtered = filterInmueblesByTipoNegocio(list, ['VENTA', 'ALQUILER']);
    expect(filtered.map((i) => i.id).sort()).toEqual(['1', '2', '3']);
  });
});
