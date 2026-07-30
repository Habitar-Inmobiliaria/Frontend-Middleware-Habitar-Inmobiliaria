import type { Asesor } from '../../api/types';
import { normalizeDisplayText } from '../../utils/text';
import { parsePhone } from '../../utils/phone';
import styles from './AsesorCard.module.css';

interface AsesorCardProps {
  asesor: Asesor;
}

const PLACEHOLDER_PHOTO = 'https://via.placeholder.com/150';

// Tarjeta del asesor encargado. Portada de renderAgent() vanilla, con
// una mejora de UX de bajo riesgo: correo/teléfono como enlaces
// (mailto:/tel:), manteniendo la misma apariencia que el original.
export default function AsesorCard({ asesor }: AsesorCardProps) {
  const nombre = normalizeDisplayText(asesor.nombreCompleto) || 'Asesor Inmobiliario';
  const correo = normalizeDisplayText(asesor.correo);
  const foto = normalizeDisplayText(asesor.fotoUrl) || PLACEHOLDER_PHOTO;

  const { main: phoneMain, ext } = parsePhone(asesor.telefono);
  const telHref = phoneMain ? `tel:${phoneMain.replace(/[^\d+]/g, '')}` : '';

  return (
    <aside className={styles.card}>
      <img className={styles.photo} src={foto} alt={`Foto de ${nombre}`} />
      <div className={styles.infoCol}>
        <h2 className={styles.title}>TU ASESOR ENCARGADO</h2>
        <h3 className={styles.name}>{nombre}</h3>
        <div className={styles.details}>
          {correo && (
            <p>
              <a className={styles.link} href={`mailto:${correo}`}>
                {correo}
              </a>
            </p>
          )}
          {phoneMain && (
            <p className={styles.phone}>
              <strong>Tel:</strong>{' '}
              <a className={styles.link} href={telHref}>
                <span className={styles.phoneNumber}>{phoneMain}</span>
              </a>
              {ext && <span className={styles.phoneExt}>Ext. {ext}</span>}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
