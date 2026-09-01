import { useEffect, useRef, useState } from 'react';
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

// Sección de mapa. Leaflet se importa al entrar en viewport (IntersectionObserver).
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
  const [shouldLoadMap, setShouldLoadMap] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadMap(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px 0px', threshold: 0.01 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoadMap) return;

    const el = containerRef.current;
    if (!el) return;

    let map: { remove: () => void } | null = null;
    let invalidateTimer: number | null = null;
    let cancelled = false;

    void (async () => {
      await import('leaflet/dist/leaflet.css');
      const leafletModule = await import('leaflet');
      if (cancelled || !containerRef.current) return;

      const L = leafletModule.default;
      const instance = L.map(containerRef.current, { scrollWheelZoom: false, zoomControl: true }).setView(
        [lat, lng],
        publishMode === 2 ? 14 : 16,
      );

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(instance);

      if (publishMode === 2) {
        const area = L.circle([lat, lng], {
          radius: 500,
          color: '#2563EB',
          fillColor: '#60A5FA',
          fillOpacity: 0.22,
        }).addTo(instance);
        instance.fitBounds(area.getBounds(), { padding: [18, 18] });
      } else {
        L.circleMarker([lat, lng], {
          radius: 8,
          color: '#1D4ED8',
          weight: 2,
          fillColor: '#60A5FA',
          fillOpacity: 0.95,
        }).addTo(instance);
      }

      map = instance;
      invalidateTimer = window.setTimeout(() => instance.invalidateSize(), 0);
    })();

    return () => {
      cancelled = true;
      if (invalidateTimer != null) window.clearTimeout(invalidateTimer);
      if (map) map.remove();
    };
  }, [shouldLoadMap, lat, lng, publishMode]);

  return (
    <div
      ref={containerRef}
      className={`${styles.map} ${!shouldLoadMap ? styles.mapPending : ''}`}
    />
  );
}
