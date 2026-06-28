import { useEffect } from 'react';
import { IS_TAURI, safeInvoke } from '../../utils/env';
import { notifyKasaDataArrived } from '../../services/kasaDataArrivalNotify';

type PendingKasaArrival = {
  synced: number;
  failed: number;
  at: string;
  events?: number;
  source?: string;
};

/** Tauri: uygulama kapalıyken birikmiş + canlı «Veri alındı» bildirimi */
export function KasaDataArrivalBridge() {
  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const pending = await safeInvoke<PendingKasaArrival | null>('consume_pending_kasa_data_arrival');
        if (pending && Number(pending.synced) > 0) {
          const events = Number(pending.events ?? 1);
          notifyKasaDataArrived({
            synced: Number(pending.synced),
            failed: Number(pending.failed ?? 0),
            source: 'auto',
            force: true,
            backgroundWhileClosed: true,
          });
          if (events > 1) {
            console.info(
              `[KasaDataArrival] Uygulama kapalıyken ${events} kez veri alındı (toplam ${pending.synced} kayıt).`,
            );
          }
        }
      } catch {
        /* komut eski sürümde yok */
      }

      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<{ synced: number; failed: number; at: string }>(
        'kasa-data-arrived',
        (event) => {
          notifyKasaDataArrived({
            synced: Number(event.payload?.synced ?? 0),
            failed: Number(event.payload?.failed ?? 0),
            source: 'auto',
          });
        },
      );
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  return null;
}
