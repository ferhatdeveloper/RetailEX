/**
 * RetailEX satış faturaları → Logo Tiger REST (salesInvoices)
 * rex_{firm}_{period}_sales.logo_sync_status = 'pending' kayıtları işler.
 */

import {
  logoCreateResource,
  logoRefreshSession,
  loadLogoRestConfig,
  type LogoRestConfig,
} from './logoRestApi';
import type { LogoSyncLogEntry } from './logoRestSync';
import { DB_SETTINGS, ERP_SETTINGS, postgres } from './postgres';

export type LogoInvoicePushResult = {
  processed: number;
  success: number;
  errors: number;
  messages: string[];
};

function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
}

function periodNrPadded(): string {
  return String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
}

function salesTable(): string {
  return `rex_${firmNrPadded()}_${periodNrPadded()}_sales`;
}

function saleItemsTable(): string {
  return `rex_${firmNrPadded()}_${periodNrPadded()}_sale_items`;
}

function formatLogoDate(raw: unknown): string {
  const d = raw ? new Date(String(raw)) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function fetchPendingSales(limit: number): Promise<Record<string, unknown>[]> {
  const table = salesTable();
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<Record<string, unknown>[]>(
      `/${table}`,
      {
        select: '*',
        logo_sync_status: 'eq.pending',
        is_cancelled: 'eq.false',
        order: 'date.asc',
        limit,
      },
      { schema: 'public' }
    );
    return Array.isArray(rows) ? rows : [];
  }
  const { rows } = await postgres.query<Record<string, unknown>>(
    `SELECT * FROM ${table}
     WHERE logo_sync_status = 'pending' AND COALESCE(is_cancelled, false) = false
     ORDER BY date ASC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function fetchSaleItems(invoiceId: string): Promise<Record<string, unknown>[]> {
  const table = saleItemsTable();
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<Record<string, unknown>[]>(
      `/${table}`,
      {
        select: '*',
        invoice_id: `eq.${invoiceId}`,
        limit: 500,
      },
      { schema: 'public' }
    );
    return Array.isArray(rows) ? rows : [];
  }
  const { rows } = await postgres.query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE invoice_id = $1`,
    [invoiceId]
  );
  return rows;
}

async function markSaleSyncStatus(
  saleId: string,
  status: 'success' | 'error' | 'pending',
  error?: string
): Promise<void> {
  const table = salesTable();
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.patch(
      `/${table}?id=eq.${encodeURIComponent(saleId)}`,
      {
        logo_sync_status: status,
        logo_sync_error: error || null,
        logo_sync_date: new Date().toISOString(),
      },
      { schema: 'public', prefer: 'return=minimal' }
    );
    return;
  }
  await postgres.query(
    `UPDATE ${table}
     SET logo_sync_status = $2,
         logo_sync_error = $3,
         logo_sync_date = NOW()
     WHERE id = $1`,
    [saleId, status, error || null]
  );
}

function buildSalesInvoiceRecord(
  sale: Record<string, unknown>,
  lines: Record<string, unknown>[]
): Record<string, unknown> {
  const ficheNo = String(sale.fiche_no || sale.document_no || '').trim();
  const customerCode = String(sale.customer_code || sale.customer_name || 'PERAKENDE').trim();
  const trLines = lines.map((ln, idx) => ({
    TYPE: 0,
    MASTER_CODE: String(ln.item_code || '').trim(),
    QUANTITY: Number(ln.quantity) || 1,
    PRICE: Number(ln.unit_price) || 0,
    TOTAL: Number(ln.net_amount ?? ln.total_amount) || 0,
    VAT_RATE: Number(ln.vat_rate) || 0,
    UNIT_CODE: String(ln.unit || 'AD').slice(0, 10),
    LINE_NO: idx + 1,
  }));

  return {
    TYPE: 8,
    NUMBER: ficheNo || `REX-${String(sale.id || '').slice(0, 8)}`,
    DATE: formatLogoDate(sale.date),
    ARP_CODE: customerCode.slice(0, 50),
    SOURCE_WH: 0,
    SOURCEINDEX: 9,
    TOTAL_NET: Number(sale.total_net ?? sale.net_amount) || 0,
    TOTAL_GROSS: Number(sale.total_gross) || 0,
    TOTAL_VAT: Number(sale.total_vat) || 0,
    NOTES1: String(sale.notes || 'RetailEX'),
    TRANSACTIONS: { items: trLines },
  };
}

/** Bekleyen satış faturalarını Logo salesInvoices kaynağına gönderir */
export async function pushPendingSalesToLogo(
  cfg?: LogoRestConfig,
  opts: {
    limit?: number;
    onLog?: (entry: LogoSyncLogEntry) => void;
    refreshSession?: boolean;
  } = {}
): Promise<LogoInvoicePushResult> {
  const config = cfg ?? loadLogoRestConfig();
  const limit = opts.limit ?? 20;
  const messages: string[] = [];
  let success = 0;
  let errors = 0;

  const log = (entry: LogoSyncLogEntry) => opts.onLog?.(entry);

  try {
    if (opts.refreshSession !== false) {
      await logoRefreshSession(config);
    }

    const pending = await fetchPendingSales(limit);
    messages.push(`${pending.length} bekleyen fatura bulundu.`);

    for (const sale of pending) {
      const saleId = String(sale.id || '');
      const ficheNo = String(sale.fiche_no || sale.document_no || saleId).trim();

      try {
        const lines = saleId ? await fetchSaleItems(saleId) : [];
        const restRecord = buildSalesInvoiceRecord(sale, lines);
        await logoCreateResource(config, 'salesInvoices', restRecord);
        await markSaleSyncStatus(saleId, 'success');
        success += 1;
        log({
          at: new Date().toISOString(),
          entity: 'invoice',
          action: 'create',
          code: ficheNo,
          name: String(sale.customer_name || ''),
          detail: `${lines.length} satır Logo'ya yazıldı`,
          ok: true,
        });
        messages.push(`Fatura ${ficheNo} → Logo OK`);
      } catch (e: unknown) {
        errors += 1;
        const msg = e instanceof Error ? e.message : String(e);
        if (saleId) await markSaleSyncStatus(saleId, 'error', msg).catch(() => {});
        log({
          at: new Date().toISOString(),
          entity: 'invoice',
          action: 'error',
          code: ficheNo,
          name: String(sale.customer_name || ''),
          detail: msg,
          ok: false,
        });
        messages.push(`Fatura ${ficheNo} hata: ${msg}`);
      }
    }

    return { processed: pending.length, success, errors, messages };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    messages.push(`Fatura aktarımı başarısız: ${msg}`);
    return { processed: 0, success, errors: errors + 1, messages };
  }
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
  onLog?: (entry: LogoSyncLogEntry) => void
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
