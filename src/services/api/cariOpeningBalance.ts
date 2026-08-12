/**
 * Cari devir / açılış bakiyesi — eski programdan geçişte borç-alacak devri.
 * Deftere `sales` tablosuna fiche_type=opening_balance satırı yazar (kasa hareketi değil).
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import type { Supplier } from './suppliers';

export const CARI_OPENING_FICHE_TYPE = 'opening_balance';
export const CARI_OPENING_TRCODE = 99;

export type CariDevirDirection = 'borc' | 'alacak';

export type CariDevirLineInput = {
  accountId: string;
  cardType: 'customer' | 'supplier';
  accountCode?: string;
  accountName?: string;
  /** Mutlak devir tutarı (0'dan büyük) */
  amount: number;
  direction: CariDevirDirection;
  lineNotes?: string;
  /** Var olan devir fişi — güncelleme modu */
  existingDevirId?: string;
};

export type CariDevirBatchInput = {
  date: string;
  batchNotes?: string;
  replaceExisting?: boolean;
  lines: CariDevirLineInput[];
};

export type CariDevirBatchResult = {
  created: number;
  updated: number;
  replaced: number;
  skipped: number;
  errors: { accountId: string; message: string }[];
};

export type CariDevirRecord = {
  id: string;
  fiche_no: string;
  date: string;
  customer_id: string;
  customer_name: string;
  net_amount: number;
  notes?: string;
};

export function devirDirectionFromNet(net: number): CariDevirDirection {
  return net < 0 ? 'alacak' : 'borc';
}

export function devirAmountFromNet(net: number): number {
  return Math.abs(Number(net) || 0);
}

function salesTablePath(firmNr: string, periodNr: string): string {
  const fn = normalizeFirmTableNr(firmNr);
  const pn = String(periodNr ?? '01').padStart(2, '0');
  return `/rex_${fn}_${pn}_sales`;
}

function signedNetAmount(amount: number, direction: CariDevirDirection, cardType: 'customer' | 'supplier'): number {
  const abs = Math.abs(Number(amount) || 0);
  if (!abs) return 0;
  /**
   * Müşteri borç (bize borçlu): +net_amount
   * Müşteri alacak: -net_amount
   * Tedarikçi borç (biz borçluyuz): +net_amount (purchase yönü)
   * Tedarikçi alacak: -net_amount
   */
  if (direction === 'borc') return abs;
  return -abs;
}

async function generateDevirFicheNo(
  firmNr: string,
  periodNr: string,
  accountCode?: string,
): Promise<string> {
  const prefix = `DEV-${String(accountCode || 'CARI').replace(/\s+/g, '').slice(0, 12)}`;
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const path = salesTablePath(firmNr, periodNr);
    const like = `${prefix}-${datePart}-*`;
    const rows = await postgrest.get<any[]>(
      path,
      {
        select: 'fiche_no',
        fiche_no: `like.${like}`,
        order: 'fiche_no.desc',
        limit: '1',
      },
      { schema: 'public' },
    ).catch(() => [] as any[]);
    const last = Array.isArray(rows) && rows[0]?.fiche_no ? String(rows[0].fiche_no) : '';
    const tail = last.match(/-(\d+)$/)?.[1];
    const next = (tail ? parseInt(tail, 10) : 0) + 1;
    return `${prefix}-${datePart}-${String(next).padStart(3, '0')}`;
  }

  const { rows } = await postgres.query(
    `SELECT fiche_no FROM sales
     WHERE fiche_type = $1 AND fiche_no LIKE $2
     ORDER BY fiche_no DESC LIMIT 1`,
    [CARI_OPENING_FICHE_TYPE, `${prefix}-${datePart}-%`],
    { firmNr, periodNr },
  );
  const last = rows[0]?.fiche_no ? String(rows[0].fiche_no) : '';
  const tail = last.match(/-(\d+)$/)?.[1];
  const next = (tail ? parseInt(tail, 10) : 0) + 1;
  return `${prefix}-${datePart}-${String(next).padStart(3, '0')}`;
}

async function cancelExistingOpeningRows(
  firmNr: string,
  periodNr: string,
  accountId: string,
): Promise<number> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const path = salesTablePath(firmNr, periodNr);
    const filter = `${path}?customer_id=eq.${encodeURIComponent(accountId)}&fiche_type=eq.${CARI_OPENING_FICHE_TYPE}&is_cancelled=eq.false`;
    const existing = await postgrest.get<any[]>(
      path,
      {
        select: 'id',
        customer_id: `eq.${accountId}`,
        fiche_type: `eq.${CARI_OPENING_FICHE_TYPE}`,
        is_cancelled: 'eq.false',
      },
      { schema: 'public' },
    ).catch(() => [] as any[]);
    if (!Array.isArray(existing) || existing.length === 0) return 0;
    await postgrest.patch(filter, { is_cancelled: true }, { schema: 'public', prefer: 'return=minimal' });
    return existing.length;
  }

  const { rowCount } = await postgres.query(
    `UPDATE sales SET is_cancelled = true, updated_at = NOW()
     WHERE customer_id::text = $1::text
       AND fiche_type = $2
       AND COALESCE(is_cancelled, false) = false`,
    [accountId, CARI_OPENING_FICHE_TYPE],
    { firmNr, periodNr },
  );
  return rowCount ?? 0;
}

async function insertOpeningRow(
  firmNr: string,
  periodNr: string,
  line: CariDevirLineInput,
  ficheNo: string,
  dateIso: string,
  batchNotes?: string,
): Promise<string> {
  const net = signedNetAmount(line.amount, line.direction, line.cardType);
  const notes = [batchNotes, line.lineNotes, 'Cari devir fişi — eski program açılış bakiyesi']
    .filter(Boolean)
    .join(' | ');

  const payload = {
    firm_nr: String(firmNr),
    period_nr: String(periodNr),
    fiche_no: ficheNo,
    document_no: ficheNo,
    date: dateIso,
    fiche_type: CARI_OPENING_FICHE_TYPE,
    trcode: CARI_OPENING_TRCODE,
    customer_id: line.accountId,
    customer_name: line.accountName || '',
    total_net: Math.abs(net),
    total_vat: 0,
    total_gross: Math.abs(net),
    total_discount: 0,
    net_amount: net,
    total_cost: 0,
    gross_profit: 0,
    profit_margin: 0,
    currency: 'IQD',
    currency_rate: 1,
    status: 'completed',
    payment_method: 'devir',
    is_cancelled: false,
    credit_amount: 0,
    notes,
  };

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const rows = await postgrest.post<any[]>(salesTablePath(firmNr, periodNr), payload, {
      schema: 'public',
      prefer: 'return=representation',
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return String(row?.id || '');
  }

  const { rows } = await postgres.query(
    `INSERT INTO sales (
      firm_nr, period_nr, fiche_no, document_no, date, fiche_type, trcode,
      customer_id, customer_name, total_net, total_vat, total_gross, total_discount,
      net_amount, total_cost, gross_profit, profit_margin, currency, currency_rate,
      status, payment_method, is_cancelled, credit_amount, notes
    ) VALUES (
      $1, $2, $3, $4, $5::timestamptz, $6, $7,
      $8::uuid, $9, $10, 0, $10, 0,
      $11, 0, 0, 0, 'IQD', 1,
      'completed', 'devir', false, 0, $12
    ) RETURNING id`,
    [
      String(firmNr),
      String(periodNr),
      ficheNo,
      ficheNo,
      dateIso,
      CARI_OPENING_FICHE_TYPE,
      CARI_OPENING_TRCODE,
      line.accountId,
      line.accountName || '',
      Math.abs(net),
      net,
      notes,
    ],
    { firmNr, periodNr },
  );
  return String(rows[0]?.id || '');
}

/** Aktif cari devir fişlerini listele */
export async function listCariDevirRecords(): Promise<CariDevirRecord[]> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const rows = await postgrest.get<any[]>(
      salesTablePath(firmNr, periodNr),
      {
        select: 'id,fiche_no,date,customer_id,customer_name,net_amount,notes',
        fiche_type: `eq.${CARI_OPENING_FICHE_TYPE}`,
        is_cancelled: 'eq.false',
        order: 'date.desc',
        limit: '5000',
      },
      { schema: 'public' },
    );
    return (Array.isArray(rows) ? rows : []).map(mapDevirRow);
  }

  const { rows } = await postgres.query(
    `SELECT id, fiche_no, date, customer_id, customer_name, net_amount, notes
     FROM sales
     WHERE fiche_type = $1 AND COALESCE(is_cancelled, false) = false
     ORDER BY date DESC`,
    [CARI_OPENING_FICHE_TYPE],
    { firmNr, periodNr },
  );
  return rows.map(mapDevirRow);
}

function mapDevirRow(r: any): CariDevirRecord {
  return {
    id: String(r.id),
    fiche_no: String(r.fiche_no || ''),
    date: String(r.date || ''),
    customer_id: String(r.customer_id || ''),
    customer_name: String(r.customer_name || ''),
    net_amount: parseFloat(String(r.net_amount ?? 0)) || 0,
    notes: r.notes ? String(r.notes) : undefined,
  };
}

/** Cari başına en güncel devir kaydı */
export async function getCariDevirMapByAccount(): Promise<Map<string, CariDevirRecord>> {
  const list = await listCariDevirRecords();
  const map = new Map<string, CariDevirRecord>();
  for (const row of list) {
    if (!row.customer_id) continue;
    if (!map.has(row.customer_id)) {
      map.set(row.customer_id, row);
    }
  }
  return map;
}

/** Tek devir fişi güncelle */
export async function updateCariDevirRecord(
  id: string,
  input: {
    amount: number;
    direction: CariDevirDirection;
    date?: string;
    notes?: string;
  },
): Promise<void> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const net = signedNetAmount(input.amount, input.direction, 'customer');
  const dateIso = input.date
    ? (input.date.includes('T') ? input.date : `${input.date}T12:00:00.000Z`)
    : undefined;
  const patch: Record<string, unknown> = {
    net_amount: net,
    total_net: Math.abs(net),
    total_gross: Math.abs(net),
    updated_at: new Date().toISOString(),
  };
  if (dateIso) patch.date = dateIso;
  if (input.notes !== undefined) patch.notes = input.notes;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    await postgrest.patch(
      `${salesTablePath(firmNr, periodNr)}?id=eq.${encodeURIComponent(id)}`,
      patch,
      { schema: 'public', prefer: 'return=minimal' },
    );
    return;
  }

  await postgres.query(
    `UPDATE sales SET
      net_amount = $1::numeric,
      total_net = $2::numeric,
      total_gross = $2::numeric,
      date = COALESCE($3::timestamptz, date),
      notes = COALESCE($4, notes),
      updated_at = NOW()
     WHERE id = $5::uuid`,
    [net, Math.abs(net), dateIso || null, input.notes ?? null, id],
    { firmNr, periodNr },
  );
}

/** Devir fişini iptal et */
export async function cancelCariDevirRecord(id: string): Promise<void> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    await postgrest.patch(
      `${salesTablePath(firmNr, periodNr)}?id=eq.${encodeURIComponent(id)}`,
      { is_cancelled: true, updated_at: new Date().toISOString() },
      { schema: 'public', prefer: 'return=minimal' },
    );
    return;
  }

  await postgres.query(
    `UPDATE sales SET is_cancelled = true, updated_at = NOW() WHERE id = $1::uuid`,
    [id],
    { firmNr, periodNr },
  );
}

/** Toplu cari devir fişi oluştur */
export async function createCariDevirBatch(input: CariDevirBatchInput): Promise<CariDevirBatchResult> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const dateIso = input.date.includes('T') ? input.date : `${input.date}T12:00:00.000Z`;
  const replaceExisting = input.replaceExisting !== false;

  const result: CariDevirBatchResult = {
    created: 0,
    updated: 0,
    replaced: 0,
    skipped: 0,
    errors: [],
  };

  for (const line of input.lines) {
    const amount = Math.abs(Number(line.amount) || 0);
    if (!amount || !line.accountId) {
      result.skipped += 1;
      continue;
    }
    try {
      if (line.existingDevirId && !replaceExisting) {
        await updateCariDevirRecord(line.existingDevirId, {
          amount,
          direction: line.direction,
          date: input.date,
          notes: [input.batchNotes, line.lineNotes].filter(Boolean).join(' | ') || undefined,
        });
        result.updated += 1;
        continue;
      }
      if (replaceExisting) {
        result.replaced += await cancelExistingOpeningRows(firmNr, periodNr, line.accountId);
      }
      const ficheNo = await generateDevirFicheNo(firmNr, periodNr, line.accountCode);
      await insertOpeningRow(firmNr, periodNr, { ...line, amount }, ficheNo, dateIso, input.batchNotes);
      result.created += 1;
    } catch (err: any) {
      result.errors.push({
        accountId: line.accountId,
        message: err?.message || String(err),
      });
    }
  }

  return result;
}

/** Cari kartından tek satır devir */
export async function createSingleCariDevir(
  account: Pick<Supplier, 'id' | 'code' | 'name' | 'cardType'>,
  amount: number,
  direction: CariDevirDirection,
  options?: { date?: string; notes?: string },
): Promise<void> {
  const cardType = account.cardType === 'supplier' ? 'supplier' : 'customer';
  const batch = await createCariDevirBatch({
    date: options?.date || new Date().toISOString().slice(0, 10),
    batchNotes: options?.notes,
    replaceExisting: true,
    lines: [
      {
        accountId: account.id,
        cardType,
        accountCode: account.code,
        accountName: account.name,
        amount,
        direction,
      },
    ],
  });
  if (batch.errors.length > 0) {
    throw new Error(batch.errors[0].message);
  }
  if (batch.created === 0) {
    throw new Error('Devir fişi oluşturulamadı');
  }
}
