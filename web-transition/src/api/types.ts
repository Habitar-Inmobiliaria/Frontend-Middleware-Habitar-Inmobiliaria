// ============================================================
// Tipos del dominio y contratos de la API
// ------------------------------------------------------------
// Las interfaces reflejan los DTOs reales del backend (Spring Boot).
// Muchos campos son opcionales porque, según el origen del dato
// (HubSpot / Wasi / Airtable / inmueble privado), pueden llegar
// ausentes o nulos.
// ============================================================

/** Cuerpo de error estándar del backend (GlobalExceptionHandler). */
export interface ErrorResponseDTO {
  traceId: string;
  timestamp: string;
  status: number;
  error: string;
  mensaje: string;
  path: string;
}

/** Formato de error de validación @Valid (Spring). */
export interface ValidationFieldError {
  field?: string;
  defaultMessage?: string;
  message?: string;
}

/** Datos del asesor asignado a la vitrina. */
export interface Asesor {
  nombreCompleto?: string;
  correo?: string | null;
  telefono?: string | null;
  fotoUrl?: string | null;
  linkMeeting?: string | null;
}

/** Inmueble tal como llega en el listado de la vitrina. */
export interface VitrinaInmueble {
  id: string;
  titulo?: string;
  precioFormateado?: string;
  ubicacion?: string;
  imagenUrl?: string;
  descripcionCorta?: string;
  esDestacado?: boolean;
  estado?: string;
  urlReferencia?: string;
  habitaciones?: string;
  banos?: string;
  area?: string;
  imagenPrincipal?: string;
  estadoActualCliente?: string;
  url?: string;
  urlInmueble?: string;
  codigoNumerico?: string;
  // Campos internos del frontend (no provienen del backend):
  _fromHistorico?: boolean;
  _externalDataSource?: boolean;
  _locationRestricted?: boolean;
  /** Omitido por el middleware (alerta); se muestra como card no disponible. */
  _omittedFromApi?: boolean;
  /** Meta del registro de histórico (solo pestaña Histórico). */
  _historyMeta?: HistoricoInmueble;
}

/** Respuesta del GET /vitrina/{token}. */
export interface VitrinaResponse {
  asesor?: Asesor;
  inmuebles: VitrinaInmueble[];
  totalInmuebles?: number;
  alertas?: string[] | null;
  /** Opcionales: el vanilla los lee si vienen; el DTO actual del backend no los declara. */
  nombreProspecto?: string;
  nombreContacto?: string;
}

/** Detalle completo de un inmueble (GET .../inmuebles/{id}). */
export interface InmuebleDetalle {
  titulo?: string;
  tipoNegocio?: string;
  precioFormateado?: string;
  valorAdministracion?: string;
  estadoActualCliente?: string;
  video?: string;
  ubicacion?: string;
  zona?: string;
  direccion?: string;
  estrato?: string;
  latitude?: string;
  longitude?: string;
  map?: string;
  id_publish_on_map?: number | null;
  tipoInmueble?: string;
  areaConstruida?: string;
  areaTerreno?: string;
  areaPrivada?: string;
  habitaciones?: string;
  banos?: string;
  estacionamiento?: string;
  piso?: string;
  estadoFisico?: string;
  anioConstruccion?: string;
  caracteristicasInternas?: string[];
  caracteristicasExternas?: string[];
  galeriasImagenes?: string[];
  descripcion?: string;
  // Campos que pueden venir del origen "privado" o calcularse en el cliente:
  imagenes?: string[];
  precio?: number;
  precioFormateadoRaw?: string;
  codigoIdentificador?: string;
  id?: string;
  url?: string;
  urlReferencia?: string;
  observaciones?: string;
  descripcionCorta?: string;
  // Marcadores internos del frontend:
  _externalDataSource?: boolean;
  _locationRestricted?: boolean;
  _fromHistorico?: boolean;
}

/** Tipo de dato de detalle usado por el cliente (backend + privado). */
export type PropertyDetail = InmuebleDetalle;

/** Comentario individual del listado de comentarios del cliente. */
export interface ComentarioListing {
  id: string | null;
  comentario: string | null;
  creadoEn: string | null;
  estado: string | null;
}

/** Respuesta cruda del GET .../comentarios. */
export interface ListadoComentariosResponse {
  contactId: string;
  total: number;
  comentarios: ComentarioListing[];
}

/** Resultado normalizado que expone el cliente para comentarios. */
export interface ComentariosResult {
  contactId: string;
  total: number;
  comentarios: ComentarioListing[];
}

/** Respuesta del POST /comentario-cliente. */
export interface ComentarioClienteResponse {
  status: string;
  message: string;
}

/** Payload para notificar el ingreso a la vitrina. */
export interface NotificarVisitaPayload {
  contactId: string;
  nombreProspecto?: string;
  dispositivo?: string;
}

/** Registro del histórico de inmuebles por cliente. */
export interface HistoricoInmueble {
  id: number;
  codigoNumerico: string;
  fechaCreacion: string;
  clienteAsociado: number;
  estadoCodigo: string;
}

/** Acciones válidas para el cambio de estado de un inmueble. */
export type EstadoAccion = 'aprobar' | 'descartar' | 'visitar';

/** Resultado interno de una petición de vitrina (para la lógica de reintentos). */
export interface VitrinaFetchResult {
  outcome: 'ok' | 'partial';
  data: VitrinaResponse;
}
