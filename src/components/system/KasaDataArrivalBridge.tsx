import { useEffect } from 'react';
import { IS_TAURI, safeInvoke } from '../../utils/env';
import { notifyKasaDataArrived } from '../../services/kasaDataArrivalNotify';

type PendingKasaArrival = {
  synced: number;
  failed: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  at: string;
  events?: number;
  source?: string;
};

type LiveKasaArrival = {
  synced: number;
  failed: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  at: string;
};

/** Tauri: uygulama kapalıyken birikmiş + canlı «Veri alındı» bildirimi */
export function KasaDataArrivalBridge() {
  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const pending = await safeInvoke<PendingKasaArrival | null>('consume_pending_kasa_data_arrival');
        if (pending) {
          const inserted = Number(pending.inserted ?? 0);
          const updated = Number(pending.updated ?? 0);
          const synced = Number(pending.synced ?? 0);
          if (inserted + updated > 0 || synced > 0) {
            const events = Number(pending.events ?? 1);
            notifyKasaDataArrived({
              synced,
              failed: Number(pending.failed ?? 0),
              inserted,
              updated,
              skipped: Number(pending.skipped ?? 0),
              source: 'auto',
              force: true,
              backgroundWhileClosed: true,
            });
            if (events > 1) {
              console.info(
                `[KasaDataArrival] Uygulama kapalıyken ${events} sync turu (toplam ${inserted} yeni, ${Number(pending.skipped ?? 0)} tekrar atlandı).`,
              );
            }
          }
        }
      } catch {
        /* komut eski sürümde yok */
      }

      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<LiveKasaArrival>('kasa-data-arrived', (event) => {
        notifyKasaDataArrived({
          synced: Number(event.payload?.synced ?? 0),
          failed: Number(event.payload?.failed ?? 0),
          inserted: Number(event.payload?.inserted ?? 0),
          updated: Number(event.payload?.updated ?? 0),
          skipped: Number(event.payload?.skipped ?? 0),
          source: 'auto',
        });
      });
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  return null;
}
