import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Manages a transient toast message with automatic dismissal.
 * Clears any pending timer on unmount or when a new message is shown,
 * preventing setState calls on unmounted components.
 */
export function useToast(defaultDurationMs = 2500) {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const showToast = useCallback(
    (message: string, durationMs?: number) => {
      clearTimer();
      setToast(message);
      timerRef.current = window.setTimeout(() => {
        setToast(null);
        timerRef.current = undefined;
      }, durationMs ?? defaultDurationMs);
    },
    [clearTimer, defaultDurationMs]
  );

  const dismissToast = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  return { toast, showToast, dismissToast };
}
