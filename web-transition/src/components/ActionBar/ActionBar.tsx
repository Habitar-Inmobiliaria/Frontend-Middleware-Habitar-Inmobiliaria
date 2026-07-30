import type { TabId } from '../../utils/estado';
import styles from './ActionBar.module.css';

/** Acciones disponibles desde la tarjeta (visitar se hace desde el detalle). */
export type CardAccion = 'aprobar' | 'descartar';

interface ActionBarProps {
  activeTab: TabId;
  disabled: boolean;
  onAction: (accion: CardAccion) => void;
}

// Botones de acción según la pestaña activa (fiel a buildActionButtons vanilla).
// - Sin revisar: Descartar + Me interesa
// - Me interesa: Descartar
// - Descartadas: Me interesa nuevamente
// - Visitados / Histórico: sin botones
export default function ActionBar({ activeTab, disabled, onAction }: ActionBarProps) {
  const discardBtn = (
    <button
      type="button"
      className={`${styles.btn} ${styles.discard}`}
      disabled={disabled}
      onClick={() => onAction('descartar')}
    >
      ✕ Descartar
    </button>
  );

  const approveBtn = (label: string) => (
    <button
      type="button"
      className={`${styles.btn} ${styles.approve}`}
      disabled={disabled}
      onClick={() => onAction('aprobar')}
    >
      {label}
    </button>
  );

  let buttons: React.ReactNode = null;
  if (activeTab === 'sin-revisar') {
    buttons = (
      <>
        {discardBtn}
        {approveBtn('⭐ Me interesa')}
      </>
    );
  } else if (activeTab === 'aprobadas') {
    buttons = discardBtn;
  } else if (activeTab === 'descartadas') {
    buttons = approveBtn('⭐ Me interesa nuevamente');
  }

  if (!buttons) return null;

  return <div className={styles.bar}>{buttons}</div>;
}
