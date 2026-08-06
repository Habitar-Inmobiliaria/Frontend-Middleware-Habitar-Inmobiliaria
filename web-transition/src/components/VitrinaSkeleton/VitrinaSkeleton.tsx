import Skeleton from '../Skeleton/Skeleton';
import styles from './VitrinaSkeleton.module.css';

export interface VitrinaSkeletonProps {
  /** Cuántas tarjetas de inmueble mostrar. Default 6 (3 cols × 2). */
  propertyCount?: number;
  /**
   * true cuando aún no hay payload usable tras varios segundos.
   * (La grilla ya no espera el enrichment completo.)
   */
  slowLoad?: boolean;
}

/**
 * Skeleton del layout real de VitrinaPage:
 * título + tabs | asesor + CTA, luego grilla de property cards.
 */
export default function VitrinaSkeleton({
  propertyCount = 6,
  slowLoad = false,
}: VitrinaSkeletonProps) {
  return (
    <main
      className={styles.layout}
      role="status"
      aria-busy="true"
      aria-label="Cargando vitrina"
    >
      {slowLoad && (
        <div className={styles.slowLoadHint} role="status" aria-live="polite">
          Conectando con tu vitrina. Un momento…
        </div>
      )}

      <header className={styles.topSection}>
        <div className={styles.leftCol}>
          <div className={styles.headerText}>
            <Skeleton width="min(380px, 82%)" height={36} radius="md" tone="strong" />
            <Skeleton width="min(480px, 95%)" height={14} radius="md" />
            <Skeleton width="min(300px, 60%)" height={14} radius="md" />
          </div>

          <div className={styles.tabs}>
            <Skeleton className={styles.tab} height={40} radius="md" />
            <Skeleton className={styles.tab} height={40} radius="md" />
            <Skeleton className={styles.tab} height={40} radius="md" />
            <Skeleton className={styles.tab} height={40} radius="md" />
            <Skeleton className={styles.tabWide} height={40} radius="md" />
          </div>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.asesorCard}>
            <Skeleton width="68%" height={10} radius="md" />
            <Skeleton width={56} height={56} radius="full" />
            <Skeleton width="72%" height={14} radius="md" tone="strong" />
            <Skeleton width="88%" height={11} radius="md" />
            <Skeleton width="58%" height={11} radius="md" />
          </div>
          <Skeleton width="100%" height={44} radius="lg" />
        </aside>
      </header>

      <section className={styles.grid} aria-hidden="true">
        {Array.from({ length: propertyCount }, (_, i) => (
          <article
            key={i}
            className={styles.card}
            style={{ animationDelay: `${80 + i * 70}ms` }}
          >
            <Skeleton className={styles.cardImage} height={200} radius="sm" />
            <div className={styles.cardBody}>
              <Skeleton width="78%" height={17} radius="md" tone="strong" />
              <Skeleton width="100%" height={12} radius="md" />
              <Skeleton width="64%" height={12} radius="md" />
              <div className={styles.cardActions}>
                <Skeleton height={40} radius="full" />
                <Skeleton height={40} radius="full" />
              </div>
            </div>
          </article>
        ))}
      </section>

      <span className={styles.srOnly}>
        {slowLoad
          ? 'Cargando propiedades; la preparación puede tardar un momento.'
          : 'Cargando propiedades…'}
      </span>
    </main>
  );
}
