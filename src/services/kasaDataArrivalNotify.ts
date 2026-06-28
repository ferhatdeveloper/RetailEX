/**
 * Kasa (MPOS) — merkezden veri geldiğinde KLRetail eğitim videosu tarzı bildirim.
 * Otomatik çekim, WS anlık tetik ve manuel «Al» için ortak.
 */

import { CheckCircle2, Download } from 'lucide-react';
import { createElement } from 'react';
import { toast } from 'sonner';

export type KasaDataArrivalSource = 'auto' | 'instant' | 'manual';

export type KasaDataArrivalState = {
  synced: number;
  failed: number;
  inserted: number;
  updated: number;
  skipped: number;
  at: string;
  source: KasaDataArrivalSource;
};

type Listener = (state: KasaDataArrivalState) => void;

const listeners = new Set<Listener>();

let lastArrival: KasaDataArrivalState | null = null;
let lastToastAt = 0;

export function formatSyncBreakdown(opts: {
  inserted?: number;
  updated?: number;
  skipped?: number;
  synced?: number;
}): string {
  const inserted = Math.max(0, Number(opts.inserted) || 0);
  const updated = Math.max(0, Number(opts.updated) || 0);
  const skipped = Math.max(0, Number(opts.skipped) || 0);
  const parts: string[] = [];
  if (inserted > 0) parts.push(`${inserted} yeni`);
  if (updated > 0) parts.push(`${updated} güncelleme`);
  if (skipped > 0) parts.push(`${skipped} tekrar atlandı`);
  if (parts.length === 0) {
    const synced = Math.max(0, Number(opts.synced) || 0);
    if (synced === 1) return '1 kayıt işlendi';
    if (synced > 0) return `${synced} kayıt işlendi`;
    return '';
  }
  return parts.join(' · ');
}

export function getLastKasaDataArrival(): KasaDataArrivalState | null {
  return lastArrival;
}

export function subscribeKasaDataArrival(listener: Listener): () => void {
  listeners.add(listener);
  if (lastArrival) listener(lastArrival);
  return () => listeners.delete(listener);
}

function emitState(state: KasaDataArrivalState): void {
  lastArrival = state;
  listeners.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {
      console.warn('[KasaDataArrival] listener hatası:', e);
    }
  });
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** YouTube snackbar tarzı alt orta bildirim + dinleyicilere durum */
export function notifyKasaDataArrived(opts: {
  synced: number;
  failed?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  source?: KasaDataArrivalSource;
  silent?: boolean;
  /** Uygulama kapalıyken biriken bildirim — debounce atlanır */
  force?: boolean;
  /** Veri, uygulama kapalıyken alındı (Windows servisi arka planda) */
  backgroundWhileClosed?: boolean;
}): void {
  const inserted = Math.max(0, Number(opts.inserted) || 0);
  const updated = Math.max(0, Number(opts.updated) || 0);
  const skipped = Math.max(0, Number(opts.skipped) || 0);
  const synced = Math.max(0, Number(opts.synced) || 0);
  const failed = Math.max(0, Number(opts.failed) || 0);
  const meaningful = inserted + updated;
  if (opts.silent || (meaningful <= 0 && synced <= 0)) return;

  const now = Date.now();
  if (!opts.force && now - lastToastAt < 3500) return;
  lastToastAt = now;

  const at = new Date().toISOString();
  const source = opts.source ?? 'auto';
  const state: KasaDataArrivalState = {
    synced,
    failed,
    inserted,
    updated,
    skipped,
    at,
    source,
  };
  emitState(state);

  const timeLabel = formatTime(at);
  const recordLabel = formatSyncBreakdown({ inserted, updated, skipped, synced });
  const prefix = opts.backgroundWhileClosed ? 'Uygulama kapalıyken · ' : '';
  const detailLabel = `${prefix}${recordLabel}`;

  toast.custom(
    () =>
      createElement(
        'div',
        {
          className:
            'flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-600 px-4 py-3 text-white shadow-2xl shadow-emerald-950/40 min-w-[260px] max-w-[min(92vw,420px)]',
          role: 'status',
          'aria-live': 'polite',
        },
        createElement(CheckCircle2, { className: 'h-5 w-5 shrink-0 text-emerald-100' }),
        createElement(
          'div',
          { className: 'flex flex-col gap-0.5 min-w-0' },
          createElement(
            'span',
            { className: 'text-sm font-bold tracking-tight' },
            'Veri alındı',
          ),
          createElement(
            'span',
            { className: 'text-xs text-emerald-100/95 truncate' },
            `${detailLabel}${timeLabel ? ` · ${timeLabel}` : ''}`,
          ),
        ),
        createElement(Download, { className: 'h-4 w-4 shrink-0 text-emerald-200/80 ml-auto' }),
      ),
    {
      id: 'kasa-data-arrived',
      duration: 5500,
      position: 'bottom-center',
    },
  );
}

export function notifyKasaDataArrivalFailed(message: string): void {
  toast.error(message || 'Kasa veri alımı başarısız.', {
    id: 'kasa-data-arrived-error',
    position: 'bottom-center',
    duration: 4500,
  });
}
