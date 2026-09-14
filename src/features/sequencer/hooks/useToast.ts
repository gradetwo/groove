import { useCallback, useEffect, useRef, useState } from "react";

export interface UseToastResult {
  /** Message currently shown by the Studio toast banner, or `null` when hidden. */
  toastMessage: string | null;
  /** Shows `msg` for 2.4s, replacing (and cancelling) any toast already on screen. */
  showToast: (msg: string) => void;
}

/**
 * A-02: the local toast state used to live inline in `StudioView.tsx`. It is
 * self-contained (state + timer + cleanup), so it is extracted verbatim here.
 */
export function useToast(): UseToastResult {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  // Clean up the pending toast timer on unmount.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  return { toastMessage, showToast };
}
