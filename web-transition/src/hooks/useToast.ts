import { useCallback, useEffect, useRef, useState } from 'react';

const TOAST_DURATION_MS = 2800;

interface UseToastResult {
  message: string;
  visible: boolean;
  showToast: (msg: string) => void;
}

// Maneja el estado de una notificación toast con auto-ocultado.
export function useToast(): UseToastResult {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { message, visible, showToast };
}
