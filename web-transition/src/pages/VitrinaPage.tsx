import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import type { VitrinaInmueble } from '../api/types';
import { vitrinaApi } from '../api/vitrinaApi';
import { useVitrina } from '../hooks/useVitrina';
import { useToast } from '../hooks/useToast';
import { useComentarios } from '../hooks/useComentarios';
import { useListUnavailableRecovery } from '../hooks/useListUnavailableRecovery';
import { resolveToken } from '../utils/token';
import { VITRINA_SLOW_LOAD_MS } from '../api/config';
import {
  getActionUrl,
  getDisplayPropertyId,
  getInmuebleKey,
  getStableId,
} from '../utils/property';
import { getEstado, matchesTab, type TabId } from '../utils/estado';
import {
  buildHistoricoShell,
  getLatestHistoryByProperty,
  HISTORICO_PAGE_SIZE,
  mapHistoricoDetailToInmueble,
  type HistoricoRecord,
} from '../utils/historico';
import { mergeInmuebleLists } from '../utils/recovery';
import { parseVitrinaAlertas } from '../utils/alertas';
import { filterInmueblesBySearch, matchesInmuebleSearch, normalizeSearchQuery } from '../utils/search';
import PropertyCard from '../components/PropertyCard/PropertyCard';
import type { CardAccion } from '../components/ActionBar/ActionBar';
import AsesorCard from '../components/AsesorCard/AsesorCard';
import BuscadorCTA from '../components/BuscadorCTA/BuscadorCTA';
import TabNav from '../components/TabNav/TabNav';
import VitrinaSearchBar from '../components/VitrinaSearchBar/VitrinaSearchBar';
import Toast from '../components/Toast/Toast';
import FeedbackModal from '../components/modals/FeedbackModal';
import LoadingModal from '../components/modals/LoadingModal';
import SuccessModal from '../components/modals/SuccessModal';
const DetailModal = lazy(() => import('../components/DetailModal/DetailModal'));
import ImportantInfoSidebar from '../components/ImportantInfoSidebar/ImportantInfoSidebar';
import TutorialModal from '../components/TutorialModal/TutorialModal';
import WhatsAppFloat from '../components/WhatsAppFloat/WhatsAppFloat';
import VitrinaSkeleton from '../components/VitrinaSkeleton/VitrinaSkeleton';
import { hasSeenTutorial, markTutorialSeen } from '../utils/tutorial';
import { hasSeenEntrance, markEntranceSeen } from '../utils/entrance';
import { tryNotifyVitrinaVisitOnce } from '../utils/visita';
import { normalizeDisplayText } from '../utils/text';
import { hasVisibleComments } from '../utils/comment';
import {
  DELAY_CHILDREN_MS,
  entranceTotalMs,
  MIN_SKELETON_MS,
  SKELETON_EXIT_MS,
  staggerDelayMs,
} from '../utils/animations';
import styles from './VitrinaPage.module.css';

const ERROR_GENERICO = '⚠ Hubo un problema, intenta de nuevo.';

type ListTabId = Exclude<TabId, 'historico'>;

function matchesRecovered(a: VitrinaInmueble, b: VitrinaInmueble): boolean {
  const aStable = getStableId(a);
  const bStable = getStableId(b);
  if (aStable && bStable && aStable === bStable) return true;
  const aDisp = getDisplayPropertyId(a);
  const bDisp = getDisplayPropertyId(b);
  return Boolean(aDisp && bDisp && aDisp === bDisp);
}

// Mensajes de estado vacío por pestaña (portado de EMPTY_COPY vanilla).
const EMPTY_COPY: Record<TabId, { title: string; desc: string }> = {
  'sin-revisar': {
    title: '¡Todo revisado!',
    desc: 'No hay propiedades pendientes por revisar.',
  },
  aprobadas: {
    title: 'Sin aprobadas aún',
    desc: 'Aprueba propiedades de la sección "Sin revisar" para verlas aquí.',
  },
  descartadas: {
    title: 'Sin descartadas',
    desc: 'No has descartado ninguna propiedad todavía.',
  },
  visitados: {
    title: 'Sin visitados aún',
    desc: 'Las propiedades que hayas visitado aparecerán aquí.',
  },
  historico: {
    title: 'Sin historial',
    desc: 'Aún no hay inmuebles registrados en tu historial.',
  },
};

// Página de la vitrina: cabecera, pestañas (incl. Histórico), grilla y detalle.
export default function VitrinaPage() {
  const { token: rawToken } = useParams<{ token: string }>();
  const token = resolveToken(rawToken);
  /** Cache local: si ya vio la entrada de este token, no repetir animación. */
  const skipEntrance = Boolean(token && hasSeenEntrance(token));
  const { data, loading, error } = useVitrina(token);
  const { message: toastMsg, visible: toastVisible, showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('sin-revisar');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const searchActive = Boolean(normalizeSearchQuery(deferredSearch));

  const [inmuebles, setInmuebles] = useState<VitrinaInmueble[]>([]);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const processingRef = useRef(processing);
  processingRef.current = processing;

  const [feedbackTarget, setFeedbackTarget] = useState<VitrinaInmueble | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [detailTarget, setDetailTarget] = useState<VitrinaInmueble | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  /**
   * Transición skeleton → contenido.
   * skipEntrance: sin stagger; solo skeleton breve mientras llega la API.
   */
  const [bootView, setBootView] = useState<'skeleton' | 'exiting' | 'ready'>(() =>
    skipEntrance ? 'ready' : 'skeleton',
  );
  const [entrancePhase, setEntrancePhase] = useState<'off' | 'playing' | 'done'>(() =>
    skipEntrance ? 'done' : 'off',
  );
  const [slowLoad, setSlowLoad] = useState(false);
  const skeletonStartedAt = useRef(performance.now());

  // Histórico: metadatos al abrir la pestaña; detalles solo de la página visible.
  const [historicoRecords, setHistoricoRecords] = useState<HistoricoRecord[]>([]);
  const [historicoListFetched, setHistoricoListFetched] = useState(false);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoPageLoading, setHistoricoPageLoading] = useState(false);
  const [historicoDetailsById, setHistoricoDetailsById] = useState<Record<string, VitrinaInmueble>>({});
  const [historicoPage, setHistoricoPage] = useState(1);

  // Comentarios del asesor: se cargan con el token y se muestran en cada pestaña de listado.
  const {
    comments,
    loaded: commentsLoaded,
    refresh: refreshComments,
  } = useComentarios(token ?? '', Boolean(token));
  const showCommentsSidebar =
    Boolean(token) &&
    activeTab !== 'historico' &&
    commentsLoaded &&
    hasVisibleComments(comments, activeTab);

  useEffect(() => {
    if (!data) {
      setInmuebles([]);
      return;
    }
    // Alertas "omitido" → cards "Inmueble no disponible" (no banner de texto).
    const existingIds = new Set(
      (data.inmuebles || [])
        .map((i) => getDisplayPropertyId(i))
        .filter(Boolean) as string[],
    );
    const { omitted } = parseVitrinaAlertas(data.alertas, existingIds);
    const withOmitted =
      omitted.length > 0 ? [...(data.inmuebles || []), ...omitted] : data.inmuebles || [];

    // No pisar cards ya recuperadas en cliente con shells vacíos del refresh.
    // Si el backend quitó inmuebles, merge autoritativo (sin reinyectar).
    setInmuebles((prev) =>
      prev.length
        ? mergeInmuebleLists(prev, withOmitted, { authoritative: true })
        : withOmitted,
    );
  }, [data]);

  /** Fusiona datos recuperados (Wasi/n8n) en listado e histórico. */
  const handleRecovered = useCallback((updated: VitrinaInmueble) => {
    setInmuebles((prev) => {
      let changed = false;
      const next = prev.map((i) => {
        if (!matchesRecovered(i, updated)) return i;
        changed = true;
        return { ...i, ...updated };
      });
      return changed ? next : prev;
    });
    setHistoricoDetailsById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, item] of Object.entries(prev)) {
        if (!matchesRecovered(item, updated)) continue;
        next[key] = { ...item, ...updated };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const { recoveringIds } = useListUnavailableRecovery(inmuebles, handleRecovered);

  // Aviso de paciencia si el GET vitrina tarda (scrapes en backend).
  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return;
    }
    const t = window.setTimeout(() => setSlowLoad(true), VITRINA_SLOW_LOAD_MS);
    return () => window.clearTimeout(t);
  }, [loading]);

  // Primera visita: skeleton mínimo → exit → stagger.
  // Recargas (cache): skeleton solo mientras loading; sin animación de entrada.
  useEffect(() => {
    if (loading) {
      skeletonStartedAt.current = performance.now();
      if (skipEntrance) {
        setBootView('ready');
        setEntrancePhase('done');
      } else {
        setBootView('skeleton');
        setEntrancePhase('off');
      }
      return;
    }
    if (error) {
      setBootView('ready');
      setEntrancePhase(skipEntrance ? 'done' : 'off');
      return;
    }
    if (!data) return;

    if (skipEntrance) {
      setBootView('ready');
      setEntrancePhase('done');
      return;
    }

    const elapsed = performance.now() - skeletonStartedAt.current;
    const waitMs = Math.max(0, MIN_SKELETON_MS - elapsed);
    const t = setTimeout(() => {
      setBootView((prev) => (prev === 'skeleton' ? 'exiting' : prev));
    }, waitMs);
    return () => clearTimeout(t);
  }, [loading, error, data, skipEntrance]);

  // mode=wait: tras exit del skeleton, monta contenido y dispara stagger una vez.
  useEffect(() => {
    if (bootView !== 'exiting' || skipEntrance) return;
    const t = setTimeout(() => {
      setBootView('ready');
      setEntrancePhase('playing');
    }, SKELETON_EXIT_MS);
    return () => clearTimeout(t);
  }, [bootView, skipEntrance]);

  useEffect(() => {
    if (entrancePhase !== 'playing') return;
    const t = setTimeout(() => setEntrancePhase('done'), entranceTotalMs(10));
    return () => clearTimeout(t);
  }, [entrancePhase]);

  // Persistir en cache: no volver a animar en próximas recargas de este token.
  useEffect(() => {
    if (entrancePhase !== 'done' || !token) return;
    markEntranceSeen(token);
  }, [entrancePhase, token]);

  // Tutorial: tras la entrada staggered, para no tapar la animación.
  useEffect(() => {
    if (entrancePhase !== 'done' || loading || error || !data || !token) return;
    if (!hasSeenTutorial(token)) setTutorialOpen(true);
  }, [entrancePhase, loading, error, data, token]);

  // Notificar visita: fire-and-forget una vez por sesión de navegador.
  useEffect(() => {
    if (loading || error || !data || !token) return;
    const nombreProspecto =
      normalizeDisplayText(data.nombreProspecto) ||
      normalizeDisplayText(data.nombreContacto) ||
      '';
    tryNotifyVitrinaVisitOnce(token, {
      nombreProspecto: nombreProspecto || undefined,
    });
  }, [loading, error, data, token]);

  useEffect(() => {
    if (activeTab !== 'historico' || historicoListFetched || !token) return;

    let cancelled = false;
    setHistoricoLoading(true);

    (async () => {
      try {
        const histData = await vitrinaApi.getHistorico(token);
        if (cancelled) return;
        setHistoricoRecords(getLatestHistoryByProperty(histData));
        setHistoricoPage(1);
      } catch (e) {
        console.error('Error cargando histórico', e);
        if (!cancelled) {
          setHistoricoRecords([]);
          setHistoricoPage(1);
          showToast(ERROR_GENERICO);
        }
      } finally {
        if (!cancelled) {
          setHistoricoListFetched(true);
          setHistoricoLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, historicoListFetched, token, showToast]);

  const historicoList = useMemo(
    () =>
      historicoRecords.map((record) =>
        buildHistoricoShell(record, historicoDetailsById[record._propertyId]),
      ),
    [historicoRecords, historicoDetailsById],
  );

  const historicoSearchFiltered = useMemo(() => {
    const query = normalizeSearchQuery(deferredSearch);
    if (!query) return historicoList;
    return historicoList.filter((item) => matchesInmuebleSearch(item, query));
  }, [historicoList, deferredSearch]);

  const historicoTotalPages = Math.max(
    1,
    Math.ceil(historicoSearchFiltered.length / HISTORICO_PAGE_SIZE),
  );

  // Detalles del histórico: solo la página visible (máx. HISTORICO_PAGE_SIZE peticiones).
  useEffect(() => {
    if (activeTab !== 'historico' || !historicoListFetched || !token) return;

    const page = Math.min(Math.max(historicoPage, 1), historicoTotalPages);
    const start = (page - 1) * HISTORICO_PAGE_SIZE;
    const pageItems = historicoSearchFiltered.slice(start, start + HISTORICO_PAGE_SIZE);
    const missingRecords = pageItems
      .filter((item) => item._historicoDetailPending && item._historyMeta)
      .map((item) => item._historyMeta as HistoricoRecord);

    if (missingRecords.length === 0) return;

    let cancelled = false;
    setHistoricoPageLoading(true);

    (async () => {
      try {
        const details = await Promise.all(
          missingRecords.map(async (record) => {
            try {
              const propertyId = record._propertyId;
              if (!propertyId) return null;
              const pDetail = await vitrinaApi.getPropertyDetail(token, propertyId);
              if (!pDetail) return null;
              return mapHistoricoDetailToInmueble(record, pDetail);
            } catch (err) {
              console.warn(
                'No se pudo cargar el detalle del histórico',
                record._propertyId || record.codigoNumerico,
                err,
              );
              return null;
            }
          }),
        );

        if (cancelled) return;

        setHistoricoDetailsById((prev) => {
          const next = { ...prev };
          for (const mapped of details) {
            if (mapped) next[mapped.id] = mapped;
          }
          return next;
        });
      } finally {
        if (!cancelled) setHistoricoPageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    historicoListFetched,
    historicoPage,
    historicoSearchFiltered,
    historicoTotalPages,
    token,
  ]);

  function markProcessing(stableId: string, active: boolean) {
    if (!stableId) return;
    setProcessing((prev) => {
      const next = new Set(prev);
      if (active) next.add(stableId);
      else next.delete(stableId);
      return next;
    });
  }

  const setEstadoLocal = useCallback((inmueble: VitrinaInmueble, nuevoEstado: string) => {
    setInmuebles((prev) => prev.map((i) => (i === inmueble ? { ...i, estado: nuevoEstado } : i)));
  }, []);

  const handleAction = useCallback(
    (inmueble: VitrinaInmueble, accion: CardAccion) => {
      const url = getActionUrl(inmueble);
      if (!url) {
        showToast('⚠ Este inmueble no permite esta acción.');
        return;
      }
      if (accion === 'aprobar') {
        const stableId = getStableId(inmueble);
        if (stableId && processingRef.current.has(stableId)) return;
        markProcessing(stableId, true);
        void vitrinaApi
          .aprobar(tokenRef.current, url)
          .then(() => setEstadoLocal(inmueble, 'APROBADO'))
          .catch((err) => {
            console.error('Aprobar falló:', err);
            showToast(ERROR_GENERICO);
          })
          .finally(() => markProcessing(stableId, false));
      } else {
        setFeedbackTarget(inmueble);
      }
    },
    [showToast, setEstadoLocal],
  );

  const handleDetailAction = useCallback(
    async (inmueble: VitrinaInmueble, accion: CardAccion): Promise<boolean> => {
      const url = getActionUrl(inmueble);
      if (!url) {
        showToast('⚠ Este inmueble no permite esta acción.');
        return false;
      }
      try {
        if (accion === 'aprobar') await vitrinaApi.aprobar(tokenRef.current, url);
        else await vitrinaApi.descartar(tokenRef.current, url);
        setEstadoLocal(inmueble, accion === 'aprobar' ? 'APROBADO' : 'DESCARTADO');
        return true;
      } catch (err) {
        console.error('Acción del detalle falló:', err);
        showToast(ERROR_GENERICO);
        return false;
      }
    },
    [showToast, setEstadoLocal],
  );

  const handleFeedbackCancel = useCallback(() => {
    setFeedbackTarget(null);
  }, []);

  const handleOpenDetail = useCallback((inmueble: VitrinaInmueble) => {
    setDetailTarget(inmueble);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailTarget(null);
  }, []);

  async function handleFeedbackSubmit(comment: string) {
    const inmueble = feedbackTarget;
    setFeedbackTarget(null);
    if (!inmueble) return;

    const url = getActionUrl(inmueble);
    const stableId = getStableId(inmueble);
    const trimmed = comment.trim();

    markProcessing(stableId, true);
    if (trimmed) setLoadingModal(true);

    try {
      await vitrinaApi.descartar(token, url);
      setEstadoLocal(inmueble, 'DESCARTADO');

      if (trimmed) {
        try {
          await vitrinaApi.enviarComentarioCliente(
            token,
            getDisplayPropertyId(inmueble),
            trimmed,
          );
          refreshComments();
          setLoadingModal(false);
          setSuccessModal(true);
        } catch (err) {
          console.error('Envío de comentario falló:', err);
          setLoadingModal(false);
        }
      }
    } catch (err) {
      console.error('Descartar falló:', err);
      setLoadingModal(false);
      showToast(ERROR_GENERICO);
    } finally {
      markProcessing(stableId, false);
    }
  }

  const counts = useMemo<Record<ListTabId, number>>(() => {
    const acc: Record<ListTabId, number> = {
      'sin-revisar': 0,
      aprobadas: 0,
      descartadas: 0,
      visitados: 0,
    };
    for (const inmueble of inmuebles) {
      const estado = getEstado(inmueble);
      if (estado === 'aprobado') acc.aprobadas++;
      else if (estado === 'descartado') acc.descartadas++;
      else if (estado === 'visitado') acc.visitados++;
      else acc['sin-revisar']++;
    }
    return acc;
  }, [inmuebles]);

  const tabFiltered = useMemo(() => {
    if (activeTab === 'historico') return historicoList;
    return inmuebles.filter((i) => matchesTab(i, activeTab)).reverse();
  }, [activeTab, inmuebles, historicoList]);

  const searchFiltered = useMemo(() => {
    if (activeTab === 'historico') return historicoSearchFiltered;
    return filterInmueblesBySearch(tabFiltered, deferredSearch);
  }, [activeTab, tabFiltered, historicoSearchFiltered, deferredSearch]);

  // Al cambiar la búsqueda, volver a la primera página del histórico.
  useEffect(() => {
    setHistoricoPage(1);
  }, [deferredSearch, activeTab]);

  const visibles = useMemo(() => {
    if (activeTab === 'historico') {
      const page = Math.min(Math.max(historicoPage, 1), historicoTotalPages);
      const start = (page - 1) * HISTORICO_PAGE_SIZE;
      return searchFiltered.slice(start, start + HISTORICO_PAGE_SIZE);
    }
    return searchFiltered;
  }, [activeTab, searchFiltered, historicoPage, historicoTotalPages]);

  /** Remonta la grilla al filtrar/paginar: evita artefactos de content-visibility. */
  const gridRenderKey = useMemo(() => {
    const q = normalizeSearchQuery(deferredSearch);
    if (activeTab === 'historico') return `${activeTab}:${q}:${historicoPage}`;
    return `${activeTab}:${q}`;
  }, [activeTab, deferredSearch, historicoPage]);

  const alertas = useMemo(
    () => parseVitrinaAlertas(data?.alertas).otherAlerts,
    [data?.alertas],
  );

  // Mientras llega la API (o animación de salida del skeleton).
  if (loading || bootView === 'skeleton' || bootView === 'exiting') {
    return (
      <div className={bootView === 'exiting' ? styles.skeletonExit : undefined}>
        <VitrinaSkeleton slowLoad={slowLoad && loading} />
      </div>
    );
  }

  if (error) {
    return (
      <main className={styles.layout}>
        <div className={styles.state}>
          <div className={styles.stateTitle}>No se pudo cargar la vitrina</div>
          <p>{error}</p>
        </div>
        <footer className={styles.footer}>
          <p>&copy; HabitarInmobiliaria 2026</p>
        </footer>
        <WhatsAppFloat />
      </main>
    );
  }

  const asesor = data?.asesor;
  const emptyCopy = searchActive
    ? {
        title: 'Sin resultados',
        desc: `No hay inmuebles que coincidan con “${normalizeSearchQuery(deferredSearch)}”.`,
      }
    : EMPTY_COPY[activeTab];
  const showHistoricoPagination =
    activeTab === 'historico' &&
    !historicoLoading &&
    !historicoPageLoading &&
    searchFiltered.length > HISTORICO_PAGE_SIZE;

  // Orden: título → tabs → sidebar → cards, uno tras otro con rebote.
  const playing = entrancePhase === 'playing';
  const settled = entrancePhase === 'done';

  const enterClass = (kind: 'item' | 'card') => {
    if (playing) return kind === 'card' ? styles.entranceCard : styles.entranceItem;
    if (settled) return styles.entranceSettled;
    return undefined;
  };

  const enterStyle = (index: number): CSSProperties | undefined =>
    playing
      ? { animationDelay: `${DELAY_CHILDREN_MS + staggerDelayMs(index)}ms` }
      : undefined;

  return (
    <main className={styles.layout}>
      <header className={styles.topSection}>
        <div className={styles.leftCol}>
          <div className={`${styles.headerText} ${enterClass('item') ?? ''}`} style={enterStyle(0)}>
            <h1 className={styles.title}>Vitrina Inmobiliaria</h1>
            <p className={styles.subtitle}>
              Revisa las propiedades seleccionadas para ti y gestiona tu interés.
            </p>
          </div>
          {/* tabsSlot: order mobile se aplica aquí (no dentro de TabNav). */}
          <div
            className={`${styles.tabsSlot} ${enterClass('item') ?? ''}`}
            style={enterStyle(1)}
          >
            <TabNav
              className={styles.tabs}
              embedded
              activeTab={activeTab}
              counts={counts}
              onChange={setActiveTab}
            />
          </div>
          <div
            className={`${styles.searchSlot} ${enterClass('item') ?? ''}`}
            style={enterStyle(2)}
          >
            <VitrinaSearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              active={searchActive}
              resultCount={searchFiltered.length}
            />
          </div>
        </div>
        <aside className={`${styles.sidebar} ${enterClass('item') ?? ''}`} style={enterStyle(3)}>
          {asesor && <AsesorCard asesor={asesor} />}
          <BuscadorCTA />
        </aside>
      </header>

      {alertas.length > 0 && (
        <div className={styles.alerts} role="status">
          {alertas.map((alerta) => (
            <p key={alerta} className={styles.alertItem}>
              {alerta}
            </p>
          ))}
        </div>
      )}

      <div
        className={`${styles.mainWrap} ${showCommentsSidebar ? styles.mainWrapSplit : ''}`}
      >
        {activeTab === 'historico' && historicoLoading ? (
          <div className={styles.historicoLoading}>
            <div className={styles.historicoSpinner} />
            <p>Cargando histórico…</p>
          </div>
        ) : activeTab === 'historico' && historicoPageLoading && visibles.length === 0 ? (
          <div className={styles.historicoLoading}>
            <div className={styles.historicoSpinner} />
            <p>Cargando inmuebles…</p>
          </div>
        ) : visibles.length === 0 ? (
          <div className={`${styles.state} ${enterClass('item') ?? ''}`} style={enterStyle(4)}>
            <div className={styles.stateTitle}>{emptyCopy.title}</div>
            <p>{emptyCopy.desc}</p>
            {searchActive ? (
              <button
                type="button"
                className={styles.clearSearchBtn}
                onClick={() => setSearchQuery('')}
              >
                Limpiar búsqueda
              </button>
            ) : null}
          </div>
        ) : (
          <section
            key={gridRenderKey}
            className={`${styles.grid} ${searchActive ? styles.gridFiltered : ''}`}
          >
            {visibles.map((inmueble, index) => (
              <div
                key={getInmuebleKey(inmueble, index)}
                className={enterClass('card')}
                style={enterStyle(4 + index)}
              >
                <PropertyCard
                  inmueble={inmueble}
                  activeTab={activeTab}
                  processing={processing.has(getStableId(inmueble))}
                  recovering={recoveringIds.has(getStableId(inmueble))}
                  onAction={handleAction}
                  onOpenDetail={handleOpenDetail}
                />
              </div>
            ))}
          </section>
        )}

        {showCommentsSidebar ? (
          <ImportantInfoSidebar
            comments={comments}
            activeTab={activeTab as Exclude<TabId, 'historico'>}
            onNotFound={(code) =>
              showToast(`No se encontró el inmueble ${code} en esta lista.`)
            }
          />
        ) : null}
      </div>

      {showHistoricoPagination && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={historicoPage <= 1}
            onClick={() => setHistoricoPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className={styles.pageInfo}>
            Página {historicoPage} de {historicoTotalPages}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={historicoPage >= historicoTotalPages}
            onClick={() => setHistoricoPage((p) => Math.min(historicoTotalPages, p + 1))}
          >
            Siguiente
          </button>
        </div>
      )}

      <Toast message={toastMsg} visible={toastVisible} />

      {feedbackTarget && (
        <FeedbackModal onSubmit={handleFeedbackSubmit} onCancel={handleFeedbackCancel} />
      )}
      {loadingModal && <LoadingModal />}
      {successModal && <SuccessModal onClose={() => setSuccessModal(false)} />}

      {detailTarget && (
        <Suspense fallback={null}>
          <DetailModal
            token={token}
            inmueble={detailTarget}
            activeTab={activeTab}
            onClose={handleCloseDetail}
            onAction={handleDetailAction}
          />
        </Suspense>
      )}

      {tutorialOpen && (
        <TutorialModal
          onClose={() => {
            markTutorialSeen(token);
            setTutorialOpen(false);
          }}
        />
      )}

      <footer className={styles.footer}>
        <p>&copy; HabitarInmobiliaria 2026</p>
      </footer>

      <WhatsAppFloat />
    </main>
  );
}
