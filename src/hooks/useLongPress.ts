import { useRef, useCallback } from 'react';

const MOVE_THRESHOLD_PX = 12;
const DEFAULT_DELAY_MS = 500;

/** Kısa tık vs uzun basmayı ayırır; uzun basınca onLongPress, kısa tıkta onClick. */
export function useLongPressHandlers(
  onClick: () => void,
  onLongPress: () => void,
  delayMs = DEFAULT_DELAY_MS
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const start = useCallback(
    (clientX: number, clientY: number) => {
      cancel();
      longPressTriggeredRef.current = false;
      startRef.current = { x: clientX, y: clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        longPressTriggeredRef.current = true;
        onLongPress();
      }, delayMs);
    },
    [cancel, delayMs, onLongPress]
  );

  const end = useCallback(
    (clientX: number, clientY: number) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        startRef.current = null;
        return;
      }
      const origin = startRef.current;
      startRef.current = null;
      if (origin) {
        const dx = clientX - origin.x;
        const dy = clientY - origin.y;
        if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) return;
      }
      onClick();
    },
    [onClick]
  );

  return {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      start(e.clientX, e.clientY);
    },
    onMouseUp: (e: React.MouseEvent) => end(e.clientX, e.clientY),
    onMouseLeave: cancel,
    onTouchStart: (e: React.TouchEvent) => start(e.touches[0].clientX, e.touches[0].clientY),
    onTouchEnd: (e: React.TouchEvent) => {
      const t = e.changedTouches[0];
      end(t.clientX, t.clientY);
    },
    onTouchCancel: cancel,
    cancel,
  };
}
