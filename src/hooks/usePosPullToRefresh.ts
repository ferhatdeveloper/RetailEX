import { useCallback, useEffect, useRef, useState } from 'react';
import { pwaRefreshConfirmMessage } from '../utils/pwaRefreshConfirm';

type Options = {
  enabled?: boolean;
  onRefresh: () => void | Promise<void>;
  thresholdPx?: number;
};

/** Üstten aşağı çekince yenileme onayı (MarketPOS) */
export function usePosPullToRefresh({ enabled = true, onRefresh, thresholdPx = 72 }: Options) {
  const [pullPx, setPullPx] = useState(0);
  const [armed, setArmed] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  const reset = useCallback(() => {
    pullingRef.current = false;
    setPullPx(0);
    setArmed(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (scrollTop > 4) return;
      startYRef.current = e.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startYRef.current;
      if (dy <= 0) {
        reset();
        return;
      }
      setPullPx(Math.min(dy, 120));
      setArmed(dy >= thresholdPx);
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current) return;
      const shouldRefresh = armed;
      reset();
      if (!shouldRefresh) return;
      const ok = window.confirm(pwaRefreshConfirmMessage());
      if (ok) await onRefresh();
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [armed, enabled, onRefresh, reset, thresholdPx]);

  return { pullPx, armed };
}
