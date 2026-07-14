import { pgQuery } from './pgClient';
import { firmNr, periodNr } from './erpTables';

export type GibQueueRow = {
  id: string;
  document_no: string | null;
  doc_type: string;
  customer_name: string | null;
  doc_date: string | null;
  amount: number;
  tax_amount: number;
  status: string;
  error_message: string | null;
  created_at: string | null;
  sent_at: string | null;
};

export type GibQueueStats = {
  pending: number;
  sent: number;
  failed: number;
  total: number;
};

function firmMatchParams(fn: string): [string, string] {
  return [fn, fn.replace(/^0+/, '') || fn];
}

export function gibStatusLabelTr(status: string): string {
  const s = status.trim();
  if (s === 'Beklemede' || s === 'pending') return 'Beklemede';
  if (s === 'Gönderildi' || s === 'sent') return 'Gönderildi';
  if (s === 'Reddedildi' || s === 'rejected' || s === 'failed') return 'Reddedildi';
  return s || '—';
}

export async function fetchGibQueue(limit = 80): Promise<GibQueueRow[]> {
  const fn = firmNr();
  const pn = periodNr();
  const [rawFn, paddedFn] = firmMatchParams(fn);
  try {
    const res = await pgQuery<{
      id: string;
      document_no: string | null;
      doc_type: string;
      customer_name: string | null;
      doc_date: string | null;
      amount: string | number;
      tax_amount: string | number;
      status: string;
      error_message: string | null;
      created_at: string | null;
      sent_at: string | null;
    }>(
      `SELECT id::text, document_no, doc_type, customer_name,
              doc_date::text AS doc_date,
              COALESCE(amount, 0)::numeric AS amount,
              COALESCE(tax_amount, 0)::numeric AS tax_amount,
              status, error_message,
              created_at::text AS created_at,
              sent_at::text AS sent_at
       FROM public.gib_edocument_queue
       WHERE (
         TRIM(COALESCE(firm_nr::text, '')) = TRIM($1::text)
         OR LPAD(TRIM(COALESCE(firm_nr::text, '')), 3, '0') = $2
       )
         AND LPAD(TRIM(COALESCE(period_nr::text, '')), 2, '0') = $3
       ORDER BY created_at DESC NULLS LAST
       LIMIT $4`,
      [rawFn, paddedFn, pn, limit],
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      document_no: r.document_no,
      doc_type: String(r.doc_type ?? 'E-Fatura'),
      customer_name: r.customer_name,
      doc_date: r.doc_date,
      amount: Number(r.amount),
      tax_amount: Number(r.tax_amount),
      status: String(r.status ?? ''),
      error_message: r.error_message,
      created_at: r.created_at,
      sent_at: r.sent_at,
    }));
  } catch {
    return [];
  }
}

export async function fetchGibQueueStats(): Promise<GibQueueStats> {
  const fn = firmNr();
  const pn = periodNr();
  const [rawFn, paddedFn] = firmMatchParams(fn);
  try {
    const res = await pgQuery<{
      pending: string | number;
      sent: string | number;
      failed: string | number;
      total: string | number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('Beklemede', 'pending'))::int AS pending,
         COUNT(*) FILTER (WHERE status IN ('Gönderildi', 'sent'))::int AS sent,
         COUNT(*) FILTER (WHERE status IN ('Reddedildi', 'rejected', 'failed'))::int AS failed,
         COUNT(*)::int AS total
       FROM public.gib_edocument_queue
       WHERE (
         TRIM(COALESCE(firm_nr::text, '')) = TRIM($1::text)
         OR LPAD(TRIM(COALESCE(firm_nr::text, '')), 3, '0') = $2
       )
         AND LPAD(TRIM(COALESCE(period_nr::text, '')), 2, '0') = $3`,
      [rawFn, paddedFn, pn],
    );
    const row = res.rows[0];
    return {
      pending: Number(row?.pending ?? 0),
      sent: Number(row?.sent ?? 0),
      failed: Number(row?.failed ?? 0),
      total: Number(row?.total ?? 0),
    };
  } catch {
    return { pending: 0, sent: 0, failed: 0, total: 0 };
  }
}
