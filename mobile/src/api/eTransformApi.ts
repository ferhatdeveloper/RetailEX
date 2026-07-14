import { pgQuery } from './pgClient';
import { firmNr, newUuid, periodNr } from './erpTables';

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
  gib_uuid: string | null;
  created_at: string | null;
  sent_at: string | null;
};

export type GibQueueStats = {
  pending: number;
  sent: number;
  failed: number;
  drafts: number;
  total: number;
};

export type GibActionResult = {
  ok: boolean;
  status: string;
  message: string;
};

function firmMatchParams(fn: string): [string, string] {
  return [fn, fn.replace(/^0+/, '') || fn];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function gibStatusLabelTr(status: string): string {
  const s = status.trim();
  if (s === 'Beklemede' || s === 'pending') return 'Beklemede';
  if (s === 'Gönderildi' || s === 'sent') return 'Gönderildi';
  if (s === 'Onaylandı') return 'Onaylandı';
  if (s === 'Reddedildi' || s === 'rejected' || s === 'failed') return 'Reddedildi';
  if (s === 'Taslak' || s === 'draft') return 'Taslak';
  if (s === 'İptal') return 'İptal';
  return s || '—';
}

export function canRetryGib(status: string): boolean {
  const s = status.trim();
  return (
    s === 'Taslak' ||
    s === 'draft' ||
    s === 'Reddedildi' ||
    s === 'rejected' ||
    s === 'failed' ||
    s === 'Beklemede' ||
    s === 'pending'
  );
}

export function canCheckGibStatus(status: string): boolean {
  const s = status.trim();
  return (
    s === 'Gönderildi' ||
    s === 'sent' ||
    s === 'Beklemede' ||
    s === 'pending' ||
    s === 'Onaylandı' ||
    Boolean(s && s !== 'Taslak' && s !== 'İptal')
  );
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
      gib_uuid: string | null;
      created_at: string | null;
      sent_at: string | null;
    }>(
      `SELECT id::text, document_no, doc_type, customer_name,
              doc_date::text AS doc_date,
              COALESCE(amount, 0)::numeric AS amount,
              COALESCE(tax_amount, 0)::numeric AS tax_amount,
              status, error_message,
              gib_uuid::text AS gib_uuid,
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
      gib_uuid: r.gib_uuid,
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
      drafts: string | number;
      total: string | number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('Beklemede', 'pending'))::int AS pending,
         COUNT(*) FILTER (WHERE status IN ('Gönderildi', 'sent', 'Onaylandı'))::int AS sent,
         COUNT(*) FILTER (WHERE status IN ('Reddedildi', 'rejected', 'failed'))::int AS failed,
         COUNT(*) FILTER (WHERE status IN ('Taslak', 'draft'))::int AS drafts,
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
      drafts: Number(row?.drafts ?? 0),
      total: Number(row?.total ?? 0),
    };
  } catch {
    return { pending: 0, sent: 0, failed: 0, drafts: 0, total: 0 };
  }
}

/**
 * Web `sendQueueDocument` + MockGIBTransport — mobilde XML yok; kuyruk durumunu mock GİB ile günceller.
 */
export async function retryGibQueueItem(queueRowId: string): Promise<GibActionResult> {
  const id = String(queueRowId || '').trim();
  if (!id) return { ok: false, status: '', message: 'Kuyruk kaydı yok' };

  await pgQuery(
    `UPDATE public.gib_edocument_queue
     SET status = 'Beklemede', error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid`,
    [id],
  );

  await delay(400);
  const gibUuid = newUuid();
  const mockOk = Math.random() > 0.12;
  const status = mockOk ? 'Gönderildi' : 'Reddedildi';
  const errorMessage = mockOk ? null : 'Mock GİB: gönderim reddedildi (mobil yeniden deneme)';
  const response = {
    success: mockOk,
    message: mockOk
      ? 'E-Fatura mock gönderim başarılı (mobile)'
      : errorMessage,
    documentId: gibUuid,
    timestamp: new Date().toISOString(),
    envelope: `MOCK_ENV_${gibUuid.slice(0, 8)}`,
  };

  await pgQuery(
    `UPDATE public.gib_edocument_queue SET
       status = $2::text,
       gib_uuid = COALESCE(gib_uuid, $3::uuid),
       gib_response_json = $4::jsonb,
       error_message = $5,
       sent_at = CASE WHEN $6::boolean THEN CURRENT_TIMESTAMP ELSE sent_at END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid`,
    [id, status, gibUuid, JSON.stringify(response), errorMessage, mockOk],
  );

  return {
    ok: mockOk,
    status,
    message: mockOk
      ? `Yeniden gönderildi (mock): ${status}`
      : errorMessage || 'Gönderim başarısız',
  };
}

/**
 * Web `eTransformService.checkDocumentStatus` — mock durum sorgusu + DB yazma.
 */
export async function checkGibQueueStatus(queueRowId: string): Promise<GibActionResult> {
  const id = String(queueRowId || '').trim();
  if (!id) return { ok: false, status: '', message: 'Kuyruk kaydı yok' };

  const res = await pgQuery<{ gib_uuid: string | null; status: string }>(
    `SELECT gib_uuid::text AS gib_uuid, status FROM public.gib_edocument_queue WHERE id = $1::uuid`,
    [id],
  );
  const row = res.rows[0];
  if (!row) return { ok: false, status: '', message: 'Kayıt bulunamadı' };

  await delay(350);
  const statuses = ['Onaylandı', 'Beklemede', 'Reddedildi'] as const;
  const next = statuses[Math.floor(Math.random() * statuses.length)];
  const ok = next !== 'Reddedildi';
  const gibUuid = row.gib_uuid || newUuid();
  const response = {
    success: ok,
    message: next,
    documentId: gibUuid,
    timestamp: new Date().toISOString(),
  };

  await pgQuery(
    `UPDATE public.gib_edocument_queue SET
       status = $2::text,
       gib_uuid = COALESCE(gib_uuid, $3::uuid),
       gib_response_json = $4::jsonb,
       error_message = CASE WHEN $5::boolean THEN NULL ELSE 'Mock GİB: durum Reddedildi' END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid`,
    [id, next, gibUuid, JSON.stringify(response), ok],
  );

  return {
    ok,
    status: next,
    message: `Durum: ${next}`,
  };
}

/** Web `sendAllDrafts` — taslak / reddedilmiş satırları sırayla yeniden dener. */
export async function sendAllGibDrafts(limit = 20): Promise<{ processed: number; errors: string[] }> {
  const list = await fetchGibQueue(200);
  const targets = list
    .filter((r) => {
      const s = r.status.trim();
      return s === 'Taslak' || s === 'draft' || s === 'Reddedildi' || s === 'rejected' || s === 'failed';
    })
    .slice(0, limit);

  const errors: string[] = [];
  let processed = 0;
  for (const row of targets) {
    const r = await retryGibQueueItem(row.id);
    if (r.ok) processed += 1;
    else errors.push(`${row.document_no || row.id}: ${r.message}`);
    await delay(120);
  }
  return { processed, errors };
}
