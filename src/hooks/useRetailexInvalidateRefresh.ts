import { useEffect, useRef } from 'react';
import {
  subscribeInvalidate,
  type RealtimeInvalidateScope,
} from '../services/retailexDataSync';

/** Gelen scope, dinlenen listede mi? (`all` her zaman eşleşir) */
export function scopesInclude(
  incoming: RealtimeInvalidateScope,
  listened: readonly RealtimeInvalidateScope[],
): boolean {
  if (incoming === 'all') return true;
  if (listened.includes('all')) return true;
  return listened.includes(incoming);
}

/**
 * Açık (keep-alive) tab’larda mutasyon sonrası liste yenileme.
 * `emitInvalidate` / BroadcastChannel / WS sinyallerini dinler.
 */
export function useRetailexInvalidateRefresh(
  scopes: readonly RealtimeInvalidateScope[],
  refresh: () => void | Promise<void>,
  enabled = true,
  debounceMs = 120,
): void {
  const refreshRef = useRef(refresh);
  const scopesRef = useRef(scopes);
  refreshRef.current = refresh;
  scopesRef.current = scopes;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsub = subscribeInvalidate((scope) => {
      if (!scopesInclude(scope, scopesRef.current)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void refreshRef.current();
      }, debounceMs);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [enabled, debounceMs]);
}
