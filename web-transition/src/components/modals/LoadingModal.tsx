import Modal from './Modal';
import styles from './modals.module.css';

// Modal de carga mientras se envía el comentario. Sin botón de cierre.
export default function LoadingModal() {
  return (
    <Modal>
      <div className={styles.spinner} />
      <h2 className={styles.title}>Enviando tu comentario…</h2>
    </Modal>
  );
}
