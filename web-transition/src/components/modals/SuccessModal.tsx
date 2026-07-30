import { useEffect, useRef } from 'react';
import Modal from './Modal';
import styles from './modals.module.css';

interface SuccessModalProps {
  onClose: () => void;
}

const AUTO_CLOSE_MS = 2500;

// Modal de éxito tras enviar el comentario. Se cierra solo a los 2.5s
// o manualmente con el botón de cierre.
export default function SuccessModal({ onClose }: SuccessModalProps) {
  // Ref para evitar reiniciar el temporizador si `onClose` cambia de identidad.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Modal onClose={onClose} showClose>
      <div className={styles.checkmarkCircle}>
        <svg viewBox="0 0 24 24" className={styles.checkmarkSvg}>
          <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      </div>
      <h2 className={styles.title}>Se ha enviado tu comentario correctamente</h2>
    </Modal>
  );
}
