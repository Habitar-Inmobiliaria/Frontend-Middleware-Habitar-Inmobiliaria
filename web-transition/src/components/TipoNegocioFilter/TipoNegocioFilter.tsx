import type { TipoNegocioFiltro } from '../../utils/tipoNegocio';
import styles from './TipoNegocioFilter.module.css';

const CHIPS: { id: TipoNegocioFiltro; label: string }[] = [
  { id: 'ALQUILER', label: 'Arriendo/Alquiler' },
  { id: 'VENTA', label: 'Venta' },
];

interface TipoNegocioFilterProps {
  active: ReadonlySet<TipoNegocioFiltro>;
  onChange: (next: Set<TipoNegocioFiltro>) => void;
}

/** Chips de filtrado por tipo de negocio (listado). */
export default function TipoNegocioFilter({ active, onChange }: TipoNegocioFilterProps) {
  const toggle = (id: TipoNegocioFiltro) => {
    const next = new Set(active);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div className={styles.wrap} role="group" aria-label="Filtrar por tipo de negocio">
      {CHIPS.map((chip) => {
        const isOn = active.has(chip.id);
        return (
          <button
            key={chip.id}
            type="button"
            className={`${styles.chip} ${isOn ? styles.chipActive : ''}`}
            aria-pressed={isOn}
            onClick={() => toggle(chip.id)}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
