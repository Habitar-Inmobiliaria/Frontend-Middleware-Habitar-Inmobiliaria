import type { TabId } from '../../utils/estado';
import styles from './TabNav.module.css';

interface TabDefinition {
  id: TabId;
  label: string;
  /** Clase de color del badge; sin definir = gris por defecto. */
  badgeClass?: string;
  /** Si true, no se muestra el contador (pestaña Histórico). */
  hideBadge?: boolean;
  /** Clase extra del botón (p. ej. histórico con texto multilínea). */
  tabClass?: string;
}

const TABS: readonly TabDefinition[] = [
  { id: 'sin-revisar', label: 'Sin revisar' },
  { id: 'aprobadas', label: 'Me interesa', badgeClass: styles.badgeYellow },
  { id: 'descartadas', label: 'Descartadas', badgeClass: styles.badgeRed },
  { id: 'visitados', label: 'Visitados', badgeClass: styles.badgeGray },
  {
    id: 'historico',
    label: 'Histórico de Inmuebles registrados',
    hideBadge: true,
    tabClass: styles.tabHistorico,
  },
];

interface TabNavProps {
  activeTab: TabId;
  counts: Record<Exclude<TabId, 'historico'>, number>;
  onChange: (tab: TabId) => void;
  /** Clase extra (p. ej. área de grid en el layout de PC). */
  className?: string;
  /** Sin margen/borde propio: el contenedor padre dibuja la línea. */
  embedded?: boolean;
}

// Barra de pestañas que filtran los inmuebles por estado (+ Histórico).
export default function TabNav({
  activeTab,
  counts,
  onChange,
  className,
  embedded = false,
}: TabNavProps) {
  return (
    <nav
      className={`${styles.nav} ${embedded ? styles.embedded : ''} ${className ?? ''}`}
      role="tablist"
      aria-label="Secciones de propiedades"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${styles.tab} ${tab.tabClass ?? ''} ${isActive ? styles.active : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {!tab.hideBadge && tab.id !== 'historico' && (
              <span className={`${styles.badge} ${tab.badgeClass ?? ''}`}>
                {counts[tab.id]}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
