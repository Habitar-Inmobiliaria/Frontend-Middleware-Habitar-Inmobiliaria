import { useState } from 'react';
import Modal from '../modals/Modal';
import modalStyles from '../modals/modals.module.css';
import styles from './TutorialModal.module.css';

interface TutorialModalProps {
  onClose: () => void;
}

const TOTAL_STEPS = 6;

/**
 * Tutorial de bienvenida (6 pasos). Se muestra una vez por token
 * (el padre decide si montarlo según localStorage).
 */
export default function TutorialModal({ onClose }: TutorialModalProps) {
  const [step, setStep] = useState(1);

  const next = () => {
    if (step >= TOTAL_STEPS) {
      onClose();
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <Modal onClose={onClose} showClose labelledBy="tutorial-title">
      {step === 1 && (
        <div className={styles.step}>
          <h2 id="tutorial-title" className={modalStyles.title}>
            Bienvenido a tu visualizador de inmuebles personalizado
          </h2>
          <p className={styles.description}>
            Aquí podrás encontrar los inmuebles que hemos escogido para ti en base a tus
            preferencias dadas.
          </p>
          <div className={styles.step1Actions}>
            <button type="button" className={`${styles.btnAction} ${styles.btnGreen}`} onClick={next}>
              Ver tutorial
            </button>
            <button
              type="button"
              className={`${styles.btnAction} ${styles.btnBlue}`}
              onClick={onClose}
            >
              Ingresar a vitrina
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={styles.step}>
          <p className={styles.description}>
            Aquí podrás encontrar 5 opciones de visualización prestablecidas:
          </p>
          <div className={styles.fakeTab}>Sin revisar</div>
          <p className={styles.description}>
            Analiza los últimos inmuebles escogidos para ti y que aún no les hayas echado un
            vistazo y danos tu aprobación o desinterés sobre este con los botones:
          </p>
          <div className={styles.fakeActions}>
            <div className={`${styles.fakeBtn} ${styles.fakeBtnRed}`}>✕ Descartar</div>
            <span className={styles.fakeSeparator}>o</span>
            <div className={`${styles.fakeBtn} ${styles.fakeBtnYellow}`}>⭐ Me interesa</div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={styles.step}>
          <p className={styles.description}>
            Aquí podrás encontrar 5 opciones de visualización prestablecidas:
          </p>
          <div className={`${styles.fakeTab} ${styles.fakeTabYellow}`}>Me interesa</div>
          <p className={styles.description}>
            Observa el histórico de inmuebles que te han llamado la atención y descarta lo que
            ya no te interese con el botón:
          </p>
          <div className={styles.fakeActions}>
            <div className={`${styles.fakeBtn} ${styles.fakeBtnRed}`}>✕ Descartar</div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className={styles.step}>
          <p className={styles.description}>
            Aquí podrás encontrar 5 opciones de visualización prestablecidas:
          </p>
          <div className={`${styles.fakeTab} ${styles.fakeTabRed}`}>Descartadas</div>
          <p className={styles.description}>
            Observa el histórico de inmuebles que has descartado y si algún inmueble te interesa
            de nuevo puedes presionar el botón:
          </p>
          <div className={styles.fakeActions}>
            <div className={`${styles.fakeBtn} ${styles.fakeBtnYellow}`}>
              ⭐ Me interesa nuevamente
            </div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className={styles.step}>
          <p className={styles.description}>
            Aquí podrás encontrar 5 opciones de visualización prestablecidas:
          </p>
          <div className={`${styles.fakeTab} ${styles.fakeTabBlue}`}>Visitados</div>
          <p className={styles.description}>
            Observa el histórico de inmuebles que has visitado recientemente
          </p>
        </div>
      )}

      {step === 6 && (
        <div className={styles.step}>
          <p className={styles.description}>
            Aquí podrás encontrar 5 opciones de visualización prestablecidas:
          </p>
          <div className={`${styles.fakeTab} ${styles.fakeTabWhite}`}>
            Histórico de inmuebles registrados
          </div>
          <p className={styles.description}>
            Obtén un consenso general de todos los inmuebles que han sido registrados en tu
            vitrina y qué decisión tomaste con ellos
          </p>
        </div>
      )}

      {step > 1 && (
        <div className={modalStyles.footer}>
          <button type="button" className={modalStyles.btnNext} onClick={next}>
            {step >= TOTAL_STEPS ? 'FINALIZAR' : 'SIGUIENTE →'}
          </button>
        </div>
      )}
    </Modal>
  );
}
