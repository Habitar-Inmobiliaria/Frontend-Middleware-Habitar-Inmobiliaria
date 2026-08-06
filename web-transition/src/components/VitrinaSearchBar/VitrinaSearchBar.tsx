import styles from './VitrinaSearchBar.module.css';

interface VitrinaSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Resultados visibles tras filtrar (opcional, para el contador). */
  resultCount?: number;
  /** true si hay consulta activa (muestra contador / vaciar). */
  active?: boolean;
}

/**
 * Barra de búsqueda local de la vitrina (nombre o código).
 * Filtra en cliente; no llama al backend.
 */
export default function VitrinaSearchBar({
  value,
  onChange,
  resultCount,
  active = false,
}: VitrinaSearchBarProps) {
  return (
    <div className={styles.wrap} role="search">
      <label className={styles.label} htmlFor="vitrina-search-input">
        Buscar inmueble
      </label>
      <div className={styles.field}>
        <span className={styles.icon} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path
              d="M20 20l-3.5-3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <input
          id="vitrina-search-input"
          className={styles.input}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar por nombre o código…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {value.trim() ? (
          <button
            type="button"
            className={styles.clear}
            onClick={() => onChange('')}
            aria-label="Limpiar búsqueda"
          >
            ×
          </button>
        ) : null}
      </div>
      {active && typeof resultCount === 'number' ? (
        <p className={styles.hint} aria-live="polite">
          {resultCount === 0
            ? 'Sin coincidencias'
            : resultCount === 1
              ? '1 resultado'
              : `${resultCount} resultados`}
        </p>
      ) : null}
    </div>
  );
}
