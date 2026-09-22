import { useEffect, useRef } from 'react';
import { registerDatagridRefresh } from '../utils/datagridRefreshBus';

/**
 * Sayfa/modül veri yükleyicisini tablo «Yenile» bus’ına kaydeder.
 * Keep-alive gizli panellerde çalışmaması için isteğe bağlı kök ref verin.
 */
export function useRegisterDatagridRefresh(
  refresh: (() => void | Promise<void>) | undefined | null,
  rootRef?: React.RefObject<HTMLElement | null>,
): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!refresh) return;
    return registerDatagridRefresh(
      () => refreshRef.current?.(),
      rootRef ? () => rootRef.current : undefined,
    );
  }, [refresh, rootRef]);
}
