import { describe, expect, it } from 'vitest';
import {
  filterInmueblesBySearch,
  matchesInmuebleSearch,
  normalizeSearchQuery,
} from './search';
import { buildInmueble } from '../../tests/factories/inmueble';

describe('normalizeSearchQuery', () => {
  it('normaliza acentos y espacios', () => {
    expect(normalizeSearchQuery('  Córdoba   Norte  ')).toBe('cordoba norte');
  });

  it('devuelve cadena vacía para input vacío', () => {
    expect(normalizeSearchQuery('')).toBe('');
  });
});

describe('matchesInmuebleSearch', () => {
  const inmueble = buildInmueble();

  it('coincide por título', () => {
    expect(matchesInmuebleSearch(inmueble, 'zona norte')).toBe(true);
  });

  it('coincide por código numérico', () => {
    expect(matchesInmuebleSearch(inmueble, '8116766')).toBe(true);
  });

  it('coincide por título sin acentos', () => {
    expect(matchesInmuebleSearch(buildInmueble({ titulo: 'Apartamento en Bogotá' }), 'bogota')).toBe(
      true,
    );
  });

  it('no coincide con consulta irrelevante', () => {
    expect(matchesInmuebleSearch(inmueble, 'xyz-no-existe')).toBe(false);
  });

  it('consulta vacía siempre coincide', () => {
    expect(matchesInmuebleSearch(inmueble, '')).toBe(true);
  });
});

describe('filterInmueblesBySearch', () => {
  const list = [
    buildInmueble({ id: '1', codigoNumerico: '100', titulo: 'Casa A' }),
    buildInmueble({ id: '2', codigoNumerico: '200', titulo: 'Apartamento B' }),
  ];

  it('devuelve la lista completa sin consulta', () => {
    expect(filterInmueblesBySearch(list, '')).toEqual(list);
  });

  it('filtra a un solo resultado', () => {
    const filtered = filterInmueblesBySearch(list, '200');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].codigoNumerico).toBe('200');
  });

  it('devuelve lista vacía si no hay coincidencias', () => {
    expect(filterInmueblesBySearch(list, 'sin-match')).toHaveLength(0);
  });
});
