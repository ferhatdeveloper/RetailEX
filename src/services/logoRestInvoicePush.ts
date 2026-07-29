/**
 * RetailEX satış faturaları → Logo Tiger REST (salesInvoices)
 * Genel belge gönderimi: logoRestDocumentPush.ts
 */

import {
  pushPendingDocumentsToLogo,
  type LogoDocumentPushResult,
} from './logoRestDocumentPush';
import type { LogoRestConfig } from './logoRestApi';
import type { LogoSyncLogEntry } from './logoRestSync';

export type LogoInvoicePushResult = LogoDocumentPushResult;

/** Bekleyen satış faturalarını Logo salesInvoices kaynağına gönderir */
export async function pushPendingSalesToLogo(
  cfg?: LogoRestConfig,
  opts: {
    limit?: number;
    onLog?: (entry: LogoSyncLogEntry) => void;
    refreshSession?: boolean;
  } = {},
): Promise<LogoInvoicePushResult> {
  return pushPendingDocumentsToLogo('salesInvoices', cfg, opts);
}

const AUTO_PUSH_KEY = 'retailex_logo_invoice_auto_push';
const AUTO_PUSH_INTERVAL_KEY = 'retailex_logo_invoice_push_interval_sec';

export function isLogoInvoiceAutoPushEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(AUTO_PUSH_KEY) === '1';
}

export function setLogoInvoiceAutoPushEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTO_PUSH_KEY, enabled ? '1' : '0');
}

export function getLogoInvoicePushIntervalSec(): number {
  if (typeof window === 'undefined') return 120;
  const n = parseInt(localStorage.getItem(AUTO_PUSH_INTERVAL_KEY) || '120', 10);
  return Number.isFinite(n) && n >= 30 ? n : 120;
}

export function setLogoInvoicePushIntervalSec(sec: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTO_PUSH_INTERVAL_KEY, String(Math.max(30, Math.min(3600, sec))));
}

let autoPushTimer: ReturnType<typeof setInterval> | null = null;

export function startLogoInvoiceAutoPush(
  cfg: LogoRestConfig,
  onLog?: (entry: LogoSyncLogEntry) => void,
): void {
  stopLogoInvoiceAutoPush();
  if (!isLogoInvoiceAutoPushEnabled()) return;

  const tick = () => {
    void pushPendingSalesToLogo(cfg, { limit: 15, onLog, refreshSession: true });
  };
  const sec = getLogoInvoicePushIntervalSec();
  autoPushTimer = setInterval(tick, sec * 1000);
  void tick();
}

export function stopLogoInvoiceAutoPush(): void {
  if (autoPushTimer) {
    clearInterval(autoPushTimer);
    autoPushTimer = null;
  }
}
