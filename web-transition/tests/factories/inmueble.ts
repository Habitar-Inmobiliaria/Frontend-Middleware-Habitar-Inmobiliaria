import type { PropertyDetail, VitrinaInmueble } from '../../src/api/types';

/** Factory mínima de inmueble para tests unitarios y fixtures. */
export function buildInmueble(overrides: Partial<VitrinaInmueble> = {}): VitrinaInmueble {
  return {
    id: '8116766',
    titulo: 'Casa en venta zona norte',
    codigoNumerico: '8116766',
    precioFormateado: '$500.000.000',
    ubicacion: 'Bogotá',
    imagenUrl: 'https://example.com/img.jpg',
    descripcionCorta: 'Hermosa casa con jardín',
    urlReferencia: 'https://habitarinmobiliaria.co/inmueble/casa-venta/8116766',
    url: 'https://habitarinmobiliaria.co/inmueble/casa-venta/8116766',
    ...overrides,
  };
}

export function buildPropertyDetail(overrides: Partial<PropertyDetail> = {}): PropertyDetail {
  return {
    titulo: 'Casa en venta zona norte',
    precioFormateado: '$500.000.000',
    ubicacion: 'Bogotá',
    descripcion: 'Descripción completa del inmueble',
    galeriasImagenes: ['https://example.com/img.jpg'],
    urlReferencia: 'https://habitarinmobiliaria.co/inmueble/casa-venta/8116766',
    url: 'https://habitarinmobiliaria.co/inmueble/casa-venta/8116766',
    ...overrides,
  };
}
