import { useEffect } from 'react';
import { IS_TAURI } from '../../utils/env';
import { notifyKasaDataArrived } from '../../services/kasaDataArrivalNotify';

/** Tauri arka plan senkronundan gelen `kasa-data-arrived` olayını UI bildirimine bağlar */
export function KasaDataArrivalBridge() {
  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;

    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen<{ synced: number; failed: number; at: string }>(
        'kasa-data-arrived',
        (event) => {
          notifyKasaDataArrived({
            synced: Number(event.payload?.synced ?? 0),
            failed: Number(event.payload?.failed ?? 0),
            source: 'auto',
          });
        },
      ).then((fn) => {
        unlisten = fn;
      });
    });

    return () => {
      unlisten?.();
    };
  }, []);

  return null;
}
