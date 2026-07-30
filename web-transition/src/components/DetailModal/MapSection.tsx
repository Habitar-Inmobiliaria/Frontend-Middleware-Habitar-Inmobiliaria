import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PropertyDetail } from '../../api/types';
import styles from './DetailModal.module.css';

function parseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

interface GeoMeta {
  publishMode: number;
  latitude: number | null;
  longitude: number | null;
  hasCoordinates: boolean;
}

function getGeoMeta(detail: PropertyDetail): GeoMeta {
  const publishMode = Number(detail?.id_publish_on_map);
  const latitude = parseCoordinate(detail?.latitude);
  const longitude = parseCoordinate(detail?.longitude);
  return { publishMode, latitude, longitude, hasCoordinates: latitude !== null && longitude !== null };
}

// Sección de mapa. Decide entre un mensaje de estado o el mapa Leaflet
// según el modo de publicación y la disponibilidad de coordenadas.
export default function MapSection({ detail }: { detail: PropertyDetail }) {
  const geo = getGeoMeta(detail);
  const isSupportedMode = geo.publishMode === 1 || geo.publishMode === 2 || geo.publishMode === 3;

  let statusText = '';
  let statusMuted = false;
  let showMap = false;
  let hint = '';

  if (!isSupportedMode) {
    statusText = 'Ubicación no disponible.';
  } else if (geo.publishMode === 1) {
    statusText = 'Ubicación no disponible por configuración de privacidad.';
    statusMuted = true;
  } else if (!geo.hasCoordinates) {
    statusText = 'Ubicación no disponible.';
  } else {
    showMap = true;
    hint = geo.publishMode === 2 ? 'Ubicación aproximada' : 'Ubicación exacta';
  }

  return (
    <section className={`${styles.section} ${styles.mapSection}`}>
      <h3 className={styles.sectionTitle}>Visualizar en Maps</h3>
      {showMap ? (
        <>
          <p className={styles.mapStatus}>{hint}</p>
          <PropertyMap
            lat={geo.latitude as number}
            lng={geo.longitude as number}
            publishMode={geo.publishMode}
          />
        </>
      ) : (
        <p className={`${styles.mapStatus} ${statusMuted ? styles.mapStatusMuted : ''}`}>{statusText}</p>
      )}
    </section>
  );
}

interface PropertyMapProps {
  lat: number;
  lng: number;
  publishMode: number;
}

function PropertyMap({ lat, lng, publishMode }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView(
      [lat, lng],
      publishMode === 2 ? 14 : 16,
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    if (publishMode === 2) {
      const area = L.circle([lat, lng], {
        radius: 500,
        color: '#2563EB',
        fillColor: '#60A5FA',
        fillOpacity: 0.22,
      }).addTo(map);
      map.fitBounds(area.getBounds(), { padding: [18, 18] });
    } else {
      // Marcador vectorial para evitar dependencia del PNG marker-icon.
      L.circleMarker([lat, lng], {
        radius: 8,
        color: '#1D4ED8',
        weight: 2,
        fillColor: '#60A5FA',
        fillOpacity: 0.95,
      }).addTo(map);
    }

    const t = setTimeout(() => map.invalidateSize(), 0);

    return () => {
      clearTimeout(t);
      map.remove();
    };
  }, [lat, lng, publishMode]);

  return <div ref={containerRef} className={styles.map} />;
}
