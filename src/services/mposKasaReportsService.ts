/**
 * KLRetail M-POS Pos Kasa Raporları — seçili işyeri/kasa özeti (eğitim 1).
 */

import { resolveSyncPgEndpoint } from './enterpriseSyncService';
import { queryPgRows } from './hybridSyncEngine';
import { ERP_SETTINGS } from './postgres';

export type MposKasaReportSummary = {
  storeId: string;
  terminalName: string;
  salesCountToday: number;
  salesTotalToday: number;
  mealVoucherCountToday: number;
  mealVoucherTotalToday: number;
  pendingSyncCount: number;
  lastSaleAt?: string;
};

function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

function periodSalesTable(): string {
  const f = firmNrPadded();
  const p = String(ERP_SETTINGS.periodNr || '01')
    .replace(/\D/g, '')
    .padStart(2, '0');
  return `rex_${f}_${p}_sales`;
}

/** Seçili işyeri (+ isteğe kasa) için bugünkü POS kasa raporu özeti */
export async function getMposKasaReportSummary(opts: {
  storeId: string;
  terminalName?: string;
}): Promise<MposKasaReportSummary | null> {
  if (!opts.storeId) return null;

  const pg = resolveSyncPgEndpoint();
  const salesTable = periodSalesTable();
  const terminalFilter = opts.terminalName?.trim()
    ? ` AND COALESCE(s.cashier, s.notes, '') ILIKE $2`
    : '';
  const params: unknown[] = [opts.storeId];
  if (opts.terminalName?.trim()) params.push(`%${opts.terminalName.trim()}%`);

  try {
    const rows = await queryPgRows(
      pg,
      `SELECT
         COUNT(*)::text AS cnt,
         COALESCE(SUM(COALESCE(s.net_amount, s.total, 0)), 0)::text AS total,
         COUNT(*) FILTER (
           WHERE LOWER(COALESCE(s.payment_method, '')) LIKE '%yemek%'
              OR LOWER(COALESCE(s.payment_method, '')) LIKE '%meal%'
              OR LOWER(COALESCE(s.notes, '')) LIKE '%yemek%'
         )::text AS meal_cnt,
         COALESCE(SUM(COALESCE(s.net_amount, s.total, 0)) FILTER (
           WHERE LOWER(COALESCE(s.payment_method, '')) LIKE '%yemek%'
              OR LOWER(COALESCE(s.payment_method, '')) LIKE '%meal%'
              OR LOWER(COALESCE(s.notes, '')) LIKE '%yemek%'
         ), 0)::text AS meal_total,
         MAX(s.created_at)::text AS last_sale
       FROM ${salesTable} s
       WHERE s.store_id = $1::uuid
         AND s.created_at >= CURRENT_DATE
         AND COALESCE(s.is_cancelled, false) = false
         ${terminalFilter}`,
      params,
    );

    let pendingSync = 0;
    try {
      const pend = await queryPgRows(
        pg,
        `SELECT COUNT(*)::text AS cnt FROM sync_queue
         WHERE status = 'pending' AND source_store_id = $1::uuid
           AND table_name = $2`,
        [opts.storeId, salesTable],
      );
      pendingSync = Number(pend[0]?.cnt ?? 0);
    } catch {
      /* */
    }

    const r = rows[0] ?? {};
    return {
      storeId: opts.storeId,
      terminalName: opts.terminalName?.trim() || '—',
      salesCountToday: Number(r.cnt ?? 0),
      salesTotalToday: Number(r.total ?? 0),
      mealVoucherCountToday: Number(r.meal_cnt ?? 0),
      mealVoucherTotalToday: Number(r.meal_total ?? 0),
      pendingSyncCount: pendingSync,
      lastSaleAt: r.last_sale ? String(r.last_sale) : undefined,
    };
  } catch {
    return {
      storeId: opts.storeId,
      terminalName: opts.terminalName?.trim() || '—',
      salesCountToday: 0,
      salesTotalToday: 0,
      mealVoucherCountToday: 0,
      mealVoucherTotalToday: 0,
      pendingSyncCount: 0,
    };
  }
}
