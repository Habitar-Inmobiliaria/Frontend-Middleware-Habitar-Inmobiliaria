// ============================================================
// Manejo centralizado de errores de la API
// ------------------------------------------------------------
// Portado de js/shared/api-error-handler.js a TypeScript.
// Interpreta las respuestas de error del backend y lanza errores
// con mensajes orientados al usuario final.
// ============================================================

import type { ValidationFieldError } from './types';

/** Cuerpo de error genérico que puede devolver el backend. */
interface BackendErrorBody {
  mensaje?: string;
  message?: string;
  errors?: ValidationFieldError[];
}

/** Lee el cuerpo JSON de la respuesta de forma segura (nunca lanza). */
async function parseErrorBody(res: Response): Promise<BackendErrorBody> {
  try {
    const text = await res.text();
    if (!text) return {};
    return JSON.parse(text) as BackendErrorBody;
  } catch {
    return {};
  }
}

/**
 * Extrae un mensaje legible del cuerpo de error.
 * - Formato estándar: { mensaje: "..." }
 * - Formato @Valid:    { errors: [{ field, defaultMessage }] }
 * - Fallback a { message } o cadena vacía.
 */
function extractMessage(body: BackendErrorBody): string {
  if (body.mensaje) return body.mensaje;

  if (Array.isArray(body.errors)) {
    return body.errors.map((e) => e.defaultMessage || e.message).join('. ');
  }

  if (body.message) return body.message;

  return '';
}

/**
 * Manejador principal — invocar tras una respuesta fetch fallida.
 * Lanza un Error con el mensaje adecuado para el usuario.
 * Para 429 emite además el evento 'rate-limited' en window.
 */
export async function handleApiError(res: Response): Promise<never> {
  const status = res.status;
  const body = await parseErrorBody(res);
  const backendMsg = extractMessage(body);

  switch (status) {
    case 400:
      throw new Error(backendMsg || 'Datos de entrada inválidos.');

    case 401:
      throw new Error(
        backendMsg ||
          'No autorizado. Verifica que el enlace de la vitrina sea válido.',
      );

    case 403:
      throw new Error('No tienes permisos para esta acción.');

    case 404:
      throw new Error(backendMsg || 'Recurso no encontrado.');

    case 429:
      window.dispatchEvent(
        new CustomEvent('rate-limited', {
          detail: { mensaje: backendMsg || 'Demasiados intentos. Espere 1 minuto.' },
        }),
      );
      throw new Error(backendMsg || 'Demasiados intentos. Espere 1 minuto.');

    case 500:
      throw new Error(
        backendMsg || 'Ocurrió un error interno. Por favor, intenta de nuevo.',
      );

    case 502:
      throw new Error('Servicio temporalmente no disponible, intente más tarde.');

    case 503:
      throw new Error(
        backendMsg ||
          'Servicio temporalmente no disponible. Intenta de nuevo en unos momentos.',
      );

    default:
      throw new Error(backendMsg || `Error inesperado (${status}).`);
  }
}
