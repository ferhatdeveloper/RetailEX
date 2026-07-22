/**
 * Bildirim merkezi — kritik stok + vadesi geçmiş açık cari hatırlatmaları.
 * Web `erpReports.getCollectionDue` / `fetchCriticalStock` ile uyumlu basit sorgular.
 */

import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import {
  appendStoreIdFilter,
  customersTable,
  formatMoney,
  matchesSessionStoreAllowNull,
  salesTable,
} from './erpTables';
import { fetchCriticalStock, type CriticalStockRow } from './reportsApi';

const SQL_COUNTABLE_SALE = `COALESCE(s.status, 'approved') IN ('completed', 'approved')`;

const OPEN_ACCOUNT_SQL = `(
  LOWER(TRIM(COALESCE(s.payment_method, ''))) IN (
    'veresiye', 'open_account', 'cari', 'açık hesap', 'acik hesap',
    'açık cari', 'acik cari', 'acik_cari', 'açık_cari'
  )
  OR LOWER(TRIM(COALESCE(s.payment_method, ''))) LIKE '%veresiye%'
)`;

function parseTermsDays(raw: unknown, fallback = 30): number {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 3650);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function localTodayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ymdDiff(from: string, to: string): number {
  const da = new Date(`${from}T12:00:00`);
  const db = new Date(`${to}T12:00:00`);
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

export type OverdueDueRow = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  ficheNo: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  daysOverdue: number;
};

export type NotificationAlertRow =
  | {
      kind: 'critical_stock';
      id: string;
      title: string;
      subtitle: string;
      detail: string;
      severity: 'warning';
      productId: string;
    }
  | {
      kind: 'overdue_due';
      id: string;
      title: string;
      subtitle: string;
      detail: string;
      severity: 'error';
      invoiceId: string;
      accountId: string;
    };

export async function fetchOverdueCollectionDues(limit = 50): Promise<OverdueDueRow[]> {
  return runDataTransport({
    label: 'fetchOverdueCollectionDues',
    viaRest: () => fetchOverdueCollectionDuesViaRest(limit),
    viaBridge: () => fetchOverdueCollectionDuesViaBridge(limit),
  });
}

async function fetchOverdueCollectionDuesViaRest(limit: number): Promise<OverdueDueRow[]> {
  const sales = salesTable();
  const cust = customersTable();
  const today = localTodayYmd();

  const [saleRows, custRows] = await Promise.all([
    postgrestGet<Record<string, unknown>[]>(
      `/${sales}`,
      {
        select:
          'id,fiche_no,date,created_at,fiche_type,net_amount,total_net,payment_method,customer_id,customer_name,is_cancelled,status,store_id',
        is_cancelled: 'eq.false',
        order: 'date.desc',
        limit: Math.min(limit * 4, 400),
      },
      { schema: 'public' },
    ),
    postgrestGet<Record<string, unknown>[]>(
      `/${cust}`,
      { select: 'id,code,name,payment_terms', limit: 3000 },
      { schema: 'public' },
    ),
  ]);

  const custById = new Map(
    (Array.isArray(custRows) ? custRows : []).map((c) => [String(c.id), c]),
  );
  const rows: OverdueDueRow[] = [];

  for (const s of Array.isArray(saleRows) ? saleRows : []) {
    const st = String(s.status ?? 'approved').trim().toLowerCase();
    if (st && st !== 'completed' && st !== 'approved') continue;
    if (!matchesSessionStoreAllowNull(s.store_id)) continue;
    const ft = String(s.fiche_type || '').trim().toLowerCase();
    if (!['sales_invoice', 'service', 'hizmet', 'return_invoice'].includes(ft)) continue;
    const pm = s.payment_method;
    const open = ft === 'return_invoice' || OPEN_ACCOUNT_RE.test(String(pm ?? ''));
    if (!open) continue;
    let amount = Math.abs(Number(s.net_amount ?? s.total_net ?? 0) || 0);
    if (ft === 'return_invoice') amount = -amount;
    if (amount <= 0.009) continue;
    const c = custById.get(String(s.customer_id ?? ''));
    const invoiceDate = String(s.date || s.created_at || '').slice(0, 10);
    if (!invoiceDate) continue;
    const termsDays = parseTermsDays(c?.payment_terms, 30);
    const dueDate = addDaysYmd(invoiceDate, termsDays);
    const daysOverdue = ymdDiff(today, dueDate);
    if (daysOverdue <= 0) continue;
    rows.push({
      id: String(s.id ?? ''),
      accountId: String(c?.id ?? s.customer_id ?? ''),
      accountCode: String(c?.code ?? ''),
      accountName: String(c?.name ?? s.customer_name ?? '—'),
      ficheNo: String(s.fiche_no ?? ''),
      invoiceDate,
      dueDate,
      amount,
      daysOverdue,
    });
  }

  return rows
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount)
    .slice(0, limit);
}

const OPEN_ACCOUNT_RE = /veresiye|open_account|cari|açık hesap|acik hesap|açık cari|acik cari|acik_cari|açık_cari/i;

async function fetchOverdueCollectionDuesViaBridge(limit: number): Promise<OverdueDueRow[]> {
  const sales = salesTable();
  const cust = customersTable();
  const today = localTodayYmd();

  try {
    const params: unknown[] = [Math.min(limit * 3, 300)];
    const storeSql = appendStoreIdFilter('s.store_id', params);
    const res = await pgQuery<{
      id: string;
      account_id: string;
      account_code: string;
      account_name: string;
      fiche_no: string;
      invoice_date: string;
      amount: number;
      payment_terms: unknown;
    }>(
      `SELECT
         s.id::text AS id,
         c.id::text AS account_id,
         COALESCE(c.code, '') AS account_code,
         COALESCE(c.name, s.customer_name, '') AS account_name,
         COALESCE(s.fiche_no, '') AS fiche_no,
         COALESCE(s.date::date, (s.date AT TIME ZONE 'UTC')::date)::text AS invoice_date,
         CASE
           WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
             THEN -ABS(COALESCE(s.net_amount, s.total_net, 0))
           ELSE ABS(COALESCE(s.net_amount, s.total_net, 0))
         END AS amount,
         c.payment_terms
       FROM ${sales} s
       LEFT JOIN ${cust} c ON c.id = s.customer_id
       WHERE COALESCE(s.is_cancelled, false) = false
         AND ${SQL_COUNTABLE_SALE}
         AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('sales_invoice', 'service', 'hizmet', 'return_invoice')
         AND (
           LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
           OR ${OPEN_ACCOUNT_SQL}
         )
         ${storeSql}
       ORDER BY s.date DESC
       LIMIT $1`,
      params,
    );

    const rows: OverdueDueRow[] = [];
    for (const r of res.rows || []) {
      const amount = Number(r.amount ?? 0);
      if (amount <= 0.009) continue;
      const invoiceDate = String(r.invoice_date ?? '').slice(0, 10);
      if (!invoiceDate) continue;
      const termsDays = parseTermsDays(r.payment_terms, 30);
      const dueDate = addDaysYmd(invoiceDate, termsDays);
      const daysOverdue = ymdDiff(today, dueDate);
      if (daysOverdue <= 0) continue;
      rows.push({
        id: String(r.id),
        accountId: String(r.account_id ?? ''),
        accountCode: String(r.account_code ?? ''),
        accountName: String(r.account_name ?? '—'),
        ficheNo: String(r.fiche_no ?? ''),
        invoiceDate,
        dueDate,
        amount,
        daysOverdue,
      });
    }

    return rows
      .sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount)
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function mapCriticalStockToAlert(row: CriticalStockRow): NotificationAlertRow {
  const deficit = Math.max(0, row.min_stock - row.stock);
  return {
    kind: 'critical_stock',
    id: `stock-${row.id}`,
    title: row.name,
    subtitle: row.code || '—',
    detail: `Stok ${row.stock} / Min ${row.min_stock} ${row.unit || ''} · Eksik ${deficit}`,
    severity: 'warning',
    productId: String(row.id),
  };
}

export function mapOverdueToAlert(row: OverdueDueRow): NotificationAlertRow {
  return {
    kind: 'overdue_due',
    id: `due-${row.id}`,
    title: row.accountName,
    subtitle: row.ficheNo || row.accountCode || '—',
    detail: `${row.daysOverdue} gün gecikme · Vade ${row.dueDate} · ${formatMoney(row.amount)}`,
    severity: 'error',
    invoiceId: row.id,
    accountId: row.accountId,
  };
}

export async function fetchNotificationAlerts(opts?: {
  stockLimit?: number;
  overdueLimit?: number;
}): Promise<{
  stock: CriticalStockRow[];
  overdue: OverdueDueRow[];
  alerts: NotificationAlertRow[];
}> {
  const [stock, overdue] = await Promise.all([
    fetchCriticalStock(opts?.stockLimit ?? 30),
    fetchOverdueCollectionDues(opts?.overdueLimit ?? 30),
  ]);
  const alerts = [...overdue.map(mapOverdueToAlert), ...stock.map(mapCriticalStockToAlert)];
  return { stock, overdue, alerts };
}
