import Modal from './Modal';
import { HABITAR_LOGO_URL } from '../../utils/brand';
import styles from './modals.module.css';

// Modal de carga mientras se envía el comentario. Sin botón de cierre.
export default function LoadingModal() {
  return (
    <Modal>
      <img src={HABITAR_LOGO_URL} alt="Habitar Inmobiliaria" className={styles.logo} />
      <div className={styles.spinner} />
      <h2 className={styles.title}>Enviando tu comentario…</h2>
    </Modal>
  );
}
