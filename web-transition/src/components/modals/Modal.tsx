import type { ReactNode } from 'react';
import styles from './modals.module.css';

interface ModalProps {
  children: ReactNode;
  onClose?: () => void;
  showClose?: boolean;
  labelledBy?: string;
}

// Contenedor base de los modales: overlay + caja centrada, con botón de
// cierre opcional. Se monta/desmonta desde el componente padre.
export default function Modal({ children, onClose, showClose = false, labelledBy }: ModalProps) {
  return (
    <div className={styles.overlay}>
      <div className={styles.content} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {showClose && onClose && (
          <button
            type="button"
            className={styles.close}
            aria-label="Cerrar modal"
            onClick={onClose}
          >
            ✕
          </button>
        )}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
