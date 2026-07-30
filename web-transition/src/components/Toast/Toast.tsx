import styles from './Toast.module.css';

interface ToastProps {
  message: string;
  visible: boolean;
}

// Notificación transitoria. Se mantiene montada para permitir la
// transición de entrada/salida; la visibilidad la controla `visible`.
export default function Toast({ message, visible }: ToastProps) {
  return (
    <div
      className={`${styles.toast} ${visible ? styles.show : ''}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
