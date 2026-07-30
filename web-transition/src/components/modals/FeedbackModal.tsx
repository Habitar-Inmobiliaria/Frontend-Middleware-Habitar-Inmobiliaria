import { useState } from 'react';
import Modal from './Modal';
import styles from './modals.module.css';

interface FeedbackModalProps {
  onSubmit: (comment: string) => void;
  onCancel: () => void;
}

// Modal que pide el motivo del descarte. "Terminar" envía el comentario
// (puede ir vacío); el botón de cierre cancela sin descartar.
export default function FeedbackModal({ onSubmit, onCancel }: FeedbackModalProps) {
  const [text, setText] = useState('');

  return (
    <Modal onClose={onCancel} showClose labelledBy="feedback-title">
      <h2 id="feedback-title" className={styles.title}>
        Cuéntanos ¿Qué no te interesó de este inmueble?
      </h2>
      <textarea
        className={styles.textarea}
        placeholder="Escribe tu comentario aquí..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <p className={styles.disclaimer}>
        Para Habitar Inmobiliaria tu opinión es importante y nos ayuda a conocerte mejor
      </p>
      <div className={styles.footer}>
        <button type="button" className={styles.btnNext} onClick={() => onSubmit(text)}>
          Terminar
        </button>
      </div>
    </Modal>
  );
}
