import { useEffect, useMemo, useState } from 'react';
import type { ComentarioListing } from '../../api/types';
import type { TabId } from '../../utils/estado';
import { formatCommentDate, getCommentEstado } from '../../utils/comment';
import { normalizeDisplayText } from '../../utils/text';
import styles from './ImportantInfoSidebar.module.css';

const MOBILE_DOCK_MQ = '(max-width: 900px)';
const HIGHLIGHT_MS = 2800;

interface ImportantInfoSidebarProps {
  comments: ComentarioListing[];
  activeTab: Extract<TabId, 'aprobadas' | 'visitados'>;
  onNotFound?: (code: string) => void;
}

function filterComments(
  comments: ComentarioListing[],
  activeTab: 'aprobadas' | 'visitados',
): ComentarioListing[] {
  return comments.filter((item) => {
    const estado = getCommentEstado(item);
    if (!estado) return true;
    if (activeTab === 'aprobadas') return estado === 'APROBADO';
    if (activeTab === 'visitados') return estado === 'VISITADO';
    return false;
  });
}

function findPropertyCard(code: string): HTMLElement | null {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(code)
      : code.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const exact = document.querySelector<HTMLElement>(
    `[data-property-code="${escaped}"]`,
  );
  if (exact) return exact;

  const cards = document.querySelectorAll<HTMLElement>('[data-property-code]');
  for (const card of cards) {
    const attr = (card.getAttribute('data-property-code') || '').trim();
    if (attr === code || attr.endsWith(code) || code.endsWith(attr)) {
      return card;
    }
  }
  return null;
}

function scrollToPropertyCard(code: string, onNotFound?: (code: string) => void) {
  const card = findPropertyCard(code);
  if (!card) {
    onNotFound?.(code);
    return;
  }

  card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  card.classList.remove(styles.cardHighlight);
  void card.offsetWidth;
  card.classList.add(styles.cardHighlight);

  let fallbackTimer: number | null = null;
  const onAnimEnd = () => {
    if (fallbackTimer != null) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    card.classList.remove(styles.cardHighlight);
    card.removeEventListener('animationend', onAnimEnd);
  };
  card.addEventListener('animationend', onAnimEnd);
  fallbackTimer = window.setTimeout(() => {
    fallbackTimer = null;
    card.classList.remove(styles.cardHighlight);
    card.removeEventListener('animationend', onAnimEnd);
  }, HIGHLIGHT_MS);
}

/**
 * Sidebar «Información Importante» embebido en Me interesa / Visitados.
 * Solo se monta cuando hay comentarios; en desktop queda sticky al lado del grid,
 * en móvil actúa como dock inferior colapsable.
 */
export default function ImportantInfoSidebar({
  comments,
  activeTab,
  onNotFound,
}: ImportantInfoSidebarProps) {
  const [mobileDock, setMobileDock] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_DOCK_MQ).matches,
  );
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_DOCK_MQ);
    const onChange = () => {
      setMobileDock(mq.matches);
      if (!mq.matches) setCollapsed(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!mobileDock) return;
    const pad = collapsed ? '72px' : 'min(52vh, 440px)';
    document.documentElement.style.setProperty('--vitrina-important-dock-pad', pad);
    return () => {
      document.documentElement.style.removeProperty('--vitrina-important-dock-pad');
    };
  }, [mobileDock, collapsed]);

  const filtered = useMemo(
    () => filterComments(comments, activeTab),
    [comments, activeTab],
  );

  if (!filtered.length) return null;

  const panelOpen = !mobileDock || !collapsed;
  const chevron = mobileDock ? (collapsed ? '▲' : '▼') : '';

  return (
    <section
      className={`${styles.section} ${styles.embed} ${
        collapsed && mobileDock ? styles.dockCollapsed : ''
      }`}
      aria-live="polite"
    >
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={panelOpen}
        aria-controls="important-info-panel"
        onClick={() => {
          if (mobileDock) setCollapsed((c) => !c);
        }}
      >
        Información Importante
        {chevron ? (
          <span className={styles.chevron} aria-hidden="true">
            {chevron}
          </span>
        ) : null}
      </button>

      <div id="important-info-panel" className={styles.panel} hidden={!panelOpen && !mobileDock}>
        <div className={styles.content}>
          <div className={styles.list}>
            {filtered.map((item, index) => {
              const commentId = String(item.id || '').trim();
              const text =
                normalizeDisplayText(item.comentario) || 'Comentario sin contenido';
              const dateText = formatCommentDate(item.creadoEn);
              const clickable = Boolean(commentId);

              return (
                <article
                  key={`${commentId}-${index}`}
                  className={`${styles.item} ${clickable ? styles.itemClickable : ''}`}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={
                    clickable ? `Ir al inmueble ${commentId} en la lista` : undefined
                  }
                  onClick={
                    clickable
                      ? () => scrollToPropertyCard(commentId, onNotFound)
                      : undefined
                  }
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            scrollToPropertyCard(commentId, onNotFound);
                          }
                        }
                      : undefined
                  }
                >
                  <div className={styles.bubble}>
                    <p className={styles.text}>{text}</p>
                    <div className={styles.meta}>
                      <span
                        className={
                          clickable ? styles.link : `${styles.link} ${styles.linkMuted}`
                        }
                      >
                        Inmueble: {commentId || 'N/D'}
                      </span>
                      {dateText ? <span> · {dateText}</span> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Indica si el sidebar debe ocupar el layout split (hay comentarios filtrados). */
export function hasVisibleComments(
  comments: ComentarioListing[],
  activeTab: 'aprobadas' | 'visitados',
): boolean {
  return filterComments(comments, activeTab).length > 0;
}
