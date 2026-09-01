import { useEffect, useRef } from 'react';

const DEFAULT_MIN_INTERVAL_MS = 2500;

type VisibilityListener = () => void;

const listeners = new Set<VisibilityListener>();
let lastRefreshAt = 0;
let subscribed = false;

function runListeners() {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastRefreshAt < DEFAULT_MIN_INTERVAL_MS) return;
  lastRefreshAt = now;
  for (const listener of listeners) {
    listener();
  }
}

function ensureGlobalListeners() {
  if (subscribed) return;
  document.addEventListener('visibilitychange', runListeners);
  window.addEventListener('focus', runListeners);
  subscribed = true;
}

function removeGlobalListeners() {
  if (!subscribed) return;
  document.removeEventListener('visibilitychange', runListeners);
  window.removeEventListener('focus', runListeners);
  subscribed = false;
}

/** Registra un callback en el listener global de foco/visibilidad (un solo throttle). */
export function subscribePageVisibilityRefresh(listener: VisibilityListener): () => void {
  ensureGlobalListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) removeGlobalListeners();
  };
}

/**
 * Ejecuta `callback` al volver a la pestaña o al enfocar la ventana.
 * Comparte un único listener y throttle entre hooks (vitrina, comentarios, etc.).
 */
export function usePageVisibilityRefresh(callback: () => void, enabled = true): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    return subscribePageVisibilityRefresh(() => callbackRef.current());
  }, [enabled]);
}
