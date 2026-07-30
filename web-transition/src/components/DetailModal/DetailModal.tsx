import { useEffect, useState, type ReactNode } from 'react';
import type { PropertyDetail, VitrinaInmueble } from '../../api/types';
import type { TabId } from '../../utils/estado';
import type { CardAccion } from '../ActionBar/ActionBar';
import { wasExternallyRecoveredByReferencia } from '../../api/recoveryApi';
import { usePropertyDetail } from '../../hooks/usePropertyDetail';
import { extractPropertyIdFromUrl, getDisplayPropertyId } from '../../utils/property';
import { looksLikeHtml, sanitizeDescriptionHtml } from '../../utils/html';
import { prepareDetailForDisplay } from '../../utils/recovery';
import Gallery from './Gallery';
import VideoSection from './VideoSection';
import MapSection from './MapSection';
import styles from './DetailModal.module.css';

interface DetailModalProps {
  token: string;
  inmueble: VitrinaInmueble;
  activeTab: TabId;
  onClose: () => void;
  /** Ejecuta la acción; devuelve true si tuvo éxito (para cerrar el modal). */
  onAction: (inmueble: VitrinaInmueble, accion: CardAccion) => Promise<boolean>;
}

const ESTADO_FISICO: Record<string, string> = { Used: 'Usado', New: 'Nuevo' };

// Descarta valores vacíos o sin contenido útil ("0", "m²", espacios).
function isMeaningful(value: unknown): boolean {
  return Boolean(value) && !/^\s*(m²|m2|0)?\s*$/i.test(String(value));
}

export default function DetailModal({
  token,
  inmueble,
  activeTab,
  onClose,
  onAction,
}: DetailModalProps) {
  const { data, loading, error } = usePropertyDetail(token, inmueble);
  const [processing, setProcessing] = useState(false);

  // Bloquea el scroll de fondo mientras el modal está abierto.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Cierre con tecla Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function runAction(accion: CardAccion) {
    if (processing) return;
    setProcessing(true);
    const ok = await onAction(inmueble, accion);
    if (ok) onClose();
    else setProcessing(false);
  }

  let content: ReactNode;
  if (loading) {
    content = (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Cargando detalles…</p>
      </div>
    );
  } else if (error || !data) {
    content = <div className={styles.error}>{error || 'Error cargando el detalle del inmueble.'}</div>;
  } else {
    const prepared = prepareDetailForDisplay(data, inmueble, wasExternallyRecoveredByReferencia) ?? data;
    content = (
      <DetailContent
        detail={prepared}
        inmueble={inmueble}
        activeTab={activeTab}
        processing={processing}
        onAction={runAction}
      />
    );
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.content} role="dialog" aria-modal="true">
        <button type="button" className={styles.close} aria-label="Cerrar detalle" onClick={onClose}>
          ✕
        </button>
        <div className={styles.body}>{content}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Contenido del detalle (cuando ya hay datos)
// ------------------------------------------------------------
interface DetailContentProps {
  detail: PropertyDetail;
  inmueble: VitrinaInmueble;
  activeTab: TabId;
  processing: boolean;
  onAction: (accion: CardAccion) => void;
}

function DetailContent({ detail: d, inmueble, activeTab, processing, onAction }: DetailContentProps) {
  const images = Array.isArray(d.galeriasImagenes) ? d.galeriasImagenes : [];
  const isLocationRestricted = Boolean(
    d._locationRestricted ||
      inmueble._locationRestricted ||
      wasExternallyRecoveredByReferencia(getDisplayPropertyId(inmueble)),
  );

  const detailPropertyId = String(
    extractPropertyIdFromUrl(d.url || d.urlReferencia || '') ||
      d.codigoIdentificador ||
      d.id ||
      getDisplayPropertyId(inmueble) ||
      '',
  ).trim();

  const allSpecRows: Array<[string, string | undefined]> = [
    ['ID inmueble', detailPropertyId],
    ['Tipo de negocio', d.tipoNegocio],
    ['Tipo de inmueble', d.tipoInmueble],
    ...(!isLocationRestricted
      ? ([
          ['Ubicación', d.ubicacion],
          ['Zona', d.zona],
          ['Dirección', d.direccion],
        ] as Array<[string, string | undefined]>)
      : []),
    ['Estrato', d.estrato],
    ['Piso', d.piso],
    ['Habitaciones', d.habitaciones],
    ['Baños', d.banos],
    ['Estacionamiento', d.estacionamiento],
    ['Área Construida', d.areaConstruida],
    ['Área Terreno', d.areaTerreno],
    ['Área Privada', d.areaPrivada],
    ['Estado físico', d.estadoFisico ? ESTADO_FISICO[d.estadoFisico] ?? d.estadoFisico : undefined],
    ['Año construcción', d.anioConstruccion],
    ['Valor administración', d.valorAdministracion],
  ];
  const specRows = allSpecRows.filter(([, v]) => isMeaningful(v));

  const descripcion = d.descripcion || d.observaciones || d.descripcionCorta;

  return (
    <>
      <div className={styles.twoCol}>
        <div className={styles.galleryCol}>
          <Gallery images={images} title={d.titulo ?? ''} />
          <VideoSection video={d.video} />
        </div>

        <div className={styles.specsCol}>
          <h2 className={styles.title}>{d.titulo ?? ''}</h2>
          <PriceBlock detail={d} />
          <div className={styles.specList}>
            {specRows.map(([label, value]) => (
              <div className={styles.specRow} key={label}>
                <span className={styles.specLabel}>{label}:</span>
                <span className={styles.specValue}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.charsRow}>
        {descripcion && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Descripción Adicional</h3>
            {looksLikeHtml(descripcion) ? (
              <div
                className={styles.description}
                dangerouslySetInnerHTML={{ __html: sanitizeDescriptionHtml(descripcion) }}
              />
            ) : (
              <div className={styles.description}>{descripcion}</div>
            )}
          </section>
        )}

        {d.caracteristicasInternas?.length ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Características internas</h3>
            <CheckList items={d.caracteristicasInternas} />
          </section>
        ) : null}

        {d.caracteristicasExternas?.length ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Características externas</h3>
            <CheckList items={d.caracteristicasExternas} />
          </section>
        ) : null}

        <MapSection detail={d} />
      </div>

      <DetailFooter activeTab={activeTab} processing={processing} onAction={onAction} />
    </>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <div className={styles.charGrid}>
      {items.map((item, i) => (
        <div className={styles.charItem} key={`${item}-${i}`}>
          <span className={styles.charCheck}>✓</span>
          {item}
        </div>
      ))}
    </div>
  );
}

// Bloque de precio; soporta precio dual "Venta: ... | Alquiler: ...".
function PriceBlock({ detail: d }: { detail: PropertyDetail }) {
  const raw = d.precioFormateado || '';

  if (raw.includes('|')) {
    const cards = raw.split('|').map((part) => {
      const match = part.trim().match(/^(.+?):\s*(.+)$/);
      const label = match ? match[1].trim() : '';
      const amount = match ? match[2].trim() : part.trim();
      const isRent = /alquiler|arriendo|renta/i.test(label);
      return { label, amount, isRent };
    });
    return (
      <div className={styles.dualPrice}>
        {cards.map((c, i) => (
          <div className={styles.priceCard} key={`${c.label}-${i}`}>
            <small>Precio de {c.label.toLowerCase()}</small>
            <div className={styles.price}>
              {c.amount}
              {c.isRent && <span className={styles.pricePeriod}>Mensual</span>}
            </div>
            <small>Pesos Colombianos</small>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.priceBlock}>
      <small>Precio de {(d.tipoNegocio || '').toLowerCase()}</small>
      <div className={styles.price}>{raw}</div>
      <small>Pesos Colombianos</small>
    </div>
  );
}

// Pie con acciones según pestaña; oculto en Visitados/Histórico.
function DetailFooter({
  activeTab,
  processing,
  onAction,
}: {
  activeTab: TabId;
  processing: boolean;
  onAction: (accion: CardAccion) => void;
}) {
  const discardBtn = (
    <button
      type="button"
      className={`${styles.btn} ${styles.discard}`}
      disabled={processing}
      onClick={() => onAction('descartar')}
    >
      ✕ Descartar
    </button>
  );
  const approveBtn = (label: string) => (
    <button
      type="button"
      className={`${styles.btn} ${styles.approve}`}
      disabled={processing}
      onClick={() => onAction('aprobar')}
    >
      {label}
    </button>
  );

  let buttons: ReactNode = null;
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
  return <footer className={styles.footer} aria-label="Acciones sobre el inmueble">{buttons}</footer>;
}
