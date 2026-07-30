import { vitrinaApi } from '../api/vitrinaApi';

/** Una vez por pestaña/sesión: evita llamadas duplicadas a POST …/notificar-visita. */
const VITRINA_VISITA_SESSION_PREFIX = 'vitrina_notificar_visita_';

/** Etiqueta de dispositivo para la nota de HubSpot (Mobile / Desktop). */
export function getDeviceLabelForNotificacion(): 'Mobile' | 'Desktop' {
  try {
    const uaData = (
      navigator as Navigator & {
        userAgentData?: { mobile?: boolean };
      }
    ).userAgentData;
    if (uaData && typeof uaData.mobile === 'boolean') {
      return uaData.mobile ? 'Mobile' : 'Desktop';
    }
  } catch {
    /* ignore */
  }
  const ua = navigator.userAgent || '';
  return /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    ? 'Mobile'
    : 'Desktop';
}

/**
 * Fire-and-forget: notifica el ingreso a la vitrina una sola vez por
 * sesión de navegador y contactId (sessionStorage).
 * Portado de tryNotifyVitrinaVisitOnce() en js/vitrina/vitrina.js.
 */
export function tryNotifyVitrinaVisitOnce(
  contactId: string,
  options: { nombreProspecto?: string } = {},
): void {
  const id = String(contactId || '').trim();
  if (!id) return;

  const sessionKey = `${VITRINA_VISITA_SESSION_PREFIX}${id}`;
  try {
    if (sessionStorage.getItem(sessionKey) === '1') return;
  } catch {
    /* ignore */
  }

  const nombreRaw = String(options.nombreProspecto || '').trim();
  const payload = {
    contactId: id,
    dispositivo: getDeviceLabelForNotificacion(),
    ...(nombreRaw ? { nombreProspecto: nombreRaw } : {}),
  };

  void (async () => {
    try {
      await vitrinaApi.notificarVisita(payload);
      try {
        sessionStorage.setItem(sessionKey, '1');
      } catch {
        /* ignore */
      }
    } catch (e) {
      console.warn('[Vitrina] notificar-visita:', e);
    }
  })();
}
