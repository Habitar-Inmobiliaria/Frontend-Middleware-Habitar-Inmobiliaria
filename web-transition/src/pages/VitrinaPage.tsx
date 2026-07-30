import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { VitrinaInmueble } from '../api/types';
import { vitrinaApi } from '../api/vitrinaApi';
import { useVitrina } from '../hooks/useVitrina';
import { useToast } from '../hooks/useToast';
import { useComentarios } from '../hooks/useComentarios';
import { resolveToken } from '../utils/token';
import {
  getActionUrl,
  getDisplayPropertyId,
  getInmuebleKey,
  getStableId,
} from '../utils/property';
import { getEstado, matchesTab, type TabId } from '../utils/estado';
import {
  getLatestHistoryByProperty,
  HISTORICO_PAGE_SIZE,
} from '../utils/historico';
import PropertyCard from '../components/PropertyCard/PropertyCard';
import type { CardAccion } from '../components/ActionBar/ActionBar';
import AsesorCard from '../components/AsesorCard/AsesorCard';
import BuscadorCTA from '../components/BuscadorCTA/BuscadorCTA';
import TabNav from '../components/TabNav/TabNav';
import Toast from '../components/Toast/Toast';
import FeedbackModal from '../components/modals/FeedbackModal';
import LoadingModal from '../components/modals/LoadingModal';
import SuccessModal from '../components/modals/SuccessModal';
import DetailModal from '../components/DetailModal/DetailModal';
import ImportantInfoSidebar, {
  hasVisibleComments,
} from '../components/ImportantInfoSidebar/ImportantInfoSidebar';
import TutorialModal from '../components/TutorialModal/TutorialModal';
import WhatsAppFloat from '../components/WhatsAppFloat/WhatsAppFloat';
import { hasSeenTutorial, markTutorialSeen } from '../utils/tutorial';
import { tryNotifyVitrinaVisitOnce } from '../utils/visita';
import { normalizeDisplayText } from '../utils/text';
import styles from './VitrinaPage.module.css';

const ERROR_GENERICO = '⚠ Hubo un problema, intenta de nuevo.';

type ListTabId = Exclude<TabId, 'historico'>;

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
  const { data, loading, error } = useVitrina(token);
  const { message: toastMsg, visible: toastVisible, showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('sin-revisar');

  const [inmuebles, setInmuebles] = useState<VitrinaInmueble[]>([]);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const [feedbackTarget, setFeedbackTarget] = useState<VitrinaInmueble | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [detailTarget, setDetailTarget] = useState<VitrinaInmueble | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  // Histórico: carga diferida la primera vez que se abre la pestaña.
  const [historicoData, setHistoricoData] = useState<VitrinaInmueble[]>([]);
  const [historicoFetched, setHistoricoFetched] = useState(false);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoPage, setHistoricoPage] = useState(1);

  // Comentarios: carga diferida al entrar en Me interesa / Visitados.
  const commentsTab = activeTab === 'aprobadas' || activeTab === 'visitados';
  const { comments, loaded: commentsLoaded } = useComentarios(token, commentsTab);
  const showCommentsSidebar =
    commentsTab && commentsLoaded && hasVisibleComments(comments, activeTab);

  useEffect(() => {
    setInmuebles(data?.inmuebles ?? []);
  }, [data]);

  // Tutorial: se muestra una vez por token tras cargar la vitrina con éxito.
  useEffect(() => {
    if (loading || error || !data || !token) return;
    if (!hasSeenTutorial(token)) setTutorialOpen(true);
  }, [loading, error, data, token]);

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
    // IMPORTANTE:
    // Este efecto no depende de `historicoLoading` para evitar auto-cancelarse
    // cuando el propio efecto hace setHistoricoLoading(true). Ese ciclo causaba
    // el spinner infinito en escenarios de error 500.
    if (activeTab !== 'historico' || historicoFetched || !token) return;

    let cancelled = false;
    setHistoricoLoading(true);

    (async () => {
      try {
        const histData = await vitrinaApi.getHistorico(token);
        const latestRecords = getLatestHistoryByProperty(histData);

        const details = await Promise.all(
          latestRecords.map(async (item) => {
            try {
              const propertyId = item._propertyId;
              if (!propertyId) return null;

              const pDetail = await vitrinaApi.getPropertyDetail(token, propertyId);
              if (!pDetail) return null;

              const mapped: VitrinaInmueble = {
                id: propertyId,
                titulo: pDetail.titulo || '',
                imagenUrl:
                  pDetail.galeriasImagenes && pDetail.galeriasImagenes.length > 0
                    ? pDetail.galeriasImagenes[0]
                    : '',
                descripcionCorta:
                  pDetail.descripcion || pDetail.observaciones || pDetail.descripcionCorta || '',
                precioFormateado:
                  pDetail.precioFormateado ||
                  (pDetail.precio
                    ? `$${Number(pDetail.precio).toLocaleString('es-CO')}`
                    : ''),
                ubicacion: pDetail.ubicacion,
                urlReferencia: pDetail.urlReferencia || pDetail.url || '',
                url: pDetail.url || pDetail.urlReferencia || '',
                codigoNumerico: item.codigoNumerico,
                _historyMeta: item,
                _fromHistorico: true,
                _locationRestricted: true,
                _externalDataSource: true,
              };
              return mapped;
            } catch (err) {
              console.warn(
                'No se pudo cargar el detalle del histórico',
                item._propertyId || item.codigoNumerico,
                err,
              );
              return null;
            }
          }),
        );

        if (cancelled) return;
        setHistoricoData(details.filter((d): d is VitrinaInmueble => Boolean(d)));
        setHistoricoPage(1);
      } catch (e) {
        console.error('Error cargando histórico', e);
        if (!cancelled) {
          setHistoricoData([]);
          setHistoricoPage(1);
          showToast(ERROR_GENERICO);
        }
      } finally {
        if (!cancelled) {
          setHistoricoFetched(true);
          setHistoricoLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, historicoFetched, token, showToast]);

  function setEstadoLocal(inmueble: VitrinaInmueble, nuevoEstado: string) {
    setInmuebles((prev) => prev.map((i) => (i === inmueble ? { ...i, estado: nuevoEstado } : i)));
  }

  function matchesRecovered(a: VitrinaInmueble, b: VitrinaInmueble): boolean {
    const aStable = getStableId(a);
    const bStable = getStableId(b);
    if (aStable && bStable && aStable === bStable) return true;
    const aDisp = getDisplayPropertyId(a);
    const bDisp = getDisplayPropertyId(b);
    return Boolean(aDisp && bDisp && aDisp === bDisp);
  }

  /** Fusiona datos recuperados (Wasi/n8n) en listado e histórico. */
  function handleRecovered(updated: VitrinaInmueble) {
    setInmuebles((prev) =>
      prev.map((i) => (matchesRecovered(i, updated) ? { ...i, ...updated } : i)),
    );
    setHistoricoData((prev) =>
      prev.map((i) => (matchesRecovered(i, updated) ? { ...i, ...updated } : i)),
    );
  }

  function markProcessing(stableId: string, active: boolean) {
    if (!stableId) return;
    setProcessing((prev) => {
      const next = new Set(prev);
      if (active) next.add(stableId);
      else next.delete(stableId);
      return next;
    });
  }

  function handleAction(inmueble: VitrinaInmueble, accion: CardAccion) {
    const url = getActionUrl(inmueble);
    if (!url) {
      showToast('⚠ Este inmueble no permite esta acción.');
      return;
    }
    if (accion === 'aprobar') {
      void aprobarInmueble(inmueble, url);
    } else {
      setFeedbackTarget(inmueble);
    }
  }

  async function aprobarInmueble(inmueble: VitrinaInmueble, url: string) {
    const stableId = getStableId(inmueble);
    if (stableId && processing.has(stableId)) return;
    markProcessing(stableId, true);
    try {
      await vitrinaApi.aprobar(token, url);
      setEstadoLocal(inmueble, 'APROBADO');
    } catch (err) {
      console.error('Aprobar falló:', err);
      showToast(ERROR_GENERICO);
    } finally {
      markProcessing(stableId, false);
    }
  }

  async function handleDetailAction(
    inmueble: VitrinaInmueble,
    accion: CardAccion,
  ): Promise<boolean> {
    const url = getActionUrl(inmueble);
    if (!url) {
      showToast('⚠ Este inmueble no permite esta acción.');
      return false;
    }
    try {
      if (accion === 'aprobar') await vitrinaApi.aprobar(token, url);
      else await vitrinaApi.descartar(token, url);
      setEstadoLocal(inmueble, accion === 'aprobar' ? 'APROBADO' : 'DESCARTADO');
      return true;
    } catch (err) {
      console.error('Acción del detalle falló:', err);
      showToast(ERROR_GENERICO);
      return false;
    }
  }

  function handleFeedbackCancel() {
    setFeedbackTarget(null);
  }

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

  const historicoTotalPages = Math.max(1, Math.ceil(historicoData.length / HISTORICO_PAGE_SIZE));

  const visibles = useMemo(() => {
    if (activeTab === 'historico') {
      const page = Math.min(Math.max(historicoPage, 1), historicoTotalPages);
      const start = (page - 1) * HISTORICO_PAGE_SIZE;
      return historicoData.slice(start, start + HISTORICO_PAGE_SIZE);
    }
    return inmuebles.filter((i) => matchesTab(i, activeTab)).reverse();
  }, [activeTab, inmuebles, historicoData, historicoPage, historicoTotalPages]);

  if (loading) {
    return (
      <main className={styles.layout}>
        <div className={styles.state}>Cargando vitrina…</div>
        <footer className={styles.footer}>
          <p>&copy; HabitarInmobiliaria 2026</p>
        </footer>
        <WhatsAppFloat />
      </main>
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
  const emptyCopy = EMPTY_COPY[activeTab];
  const showHistoricoPagination =
    activeTab === 'historico' &&
    !historicoLoading &&
    historicoData.length > HISTORICO_PAGE_SIZE;

  return (
    <main className={styles.layout}>
      {/* PC: columna izq (título+tabs juntos) | sidebar anclado a la línea. */}
      <header className={styles.topSection}>
        <div className={styles.leftCol}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>Vitrina Inmobiliaria</h1>
            <p className={styles.subtitle}>
              Revisa las propiedades seleccionadas para ti y gestiona tu interés.
            </p>
          </div>
          <TabNav
            className={styles.tabs}
            embedded
            activeTab={activeTab}
            counts={counts}
            onChange={setActiveTab}
          />
        </div>
        <aside className={styles.sidebar}>
          {asesor && <AsesorCard asesor={asesor} />}
          <BuscadorCTA />
        </aside>
      </header>

      <div
        className={`${styles.mainWrap} ${showCommentsSidebar ? styles.mainWrapSplit : ''}`}
      >
        {activeTab === 'historico' && historicoLoading ? (
          <div className={styles.historicoLoading}>
            <div className={styles.historicoSpinner} />
            <p>Cargando histórico…</p>
          </div>
        ) : visibles.length === 0 ? (
          <div className={styles.state}>
            <div className={styles.stateTitle}>{emptyCopy.title}</div>
            <p>{emptyCopy.desc}</p>
          </div>
        ) : (
          <section className={styles.grid}>
            {visibles.map((inmueble, index) => (
              <PropertyCard
                key={getInmuebleKey(inmueble, index)}
                inmueble={inmueble}
                activeTab={activeTab}
                processing={processing.has(getStableId(inmueble))}
                onAction={handleAction}
                onOpenDetail={setDetailTarget}
                onRecovered={handleRecovered}
              />
            ))}
          </section>
        )}

        {showCommentsSidebar && (activeTab === 'aprobadas' || activeTab === 'visitados') && (
          <ImportantInfoSidebar
            comments={comments}
            activeTab={activeTab}
            onNotFound={(code) =>
              showToast(`No se encontró el inmueble ${code} en esta lista.`)
            }
          />
        )}
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
        <DetailModal
          token={token}
          inmueble={detailTarget}
          activeTab={activeTab}
          onClose={() => setDetailTarget(null)}
          onAction={handleDetailAction}
        />
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
