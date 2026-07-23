/**
 * Cari devir / açılış bakiyesi — web `cariOpeningBalance.ts` ile aynı mantık.
 * `sales` tablosuna fiche_type=opening_balance (trcode 99) satırı yazar.
 */

import { pgQuery } from './pgClient';
import {
  customersTable,
  firmNr,
  newUuid,
  periodNr,
  salesTable,
  suppliersTable,
} from './erpTables';
import { shouldUseLiveData, getNetworkPolicy } from '../offline/policy';

export const CARI_OPENING_FICHE_TYPE = 'opening_balance';
export const CARI_OPENING_TRCODE = 99;

export type CariDevirDirection = 'borc' | 'alacak';
export type CariCardType = 'customer' | 'supplier';

export type CariAccountRow = {
  id: string;
  code: string | null;
  name: string;
  balance: number;
  cardType: CariCardType;
  is_active: boolean;
};

export type CariDevirLineInput = {
  accountId: string;
  cardType: CariCardType;
  accountCode?: string | null;
  accountName?: string;
  amount: number;
  direction: CariDevirDirection;
  lineNotes?: string;
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

function signedNetAmount(amount: number, direction: CariDevirDirection): number {
  const abs = Math.abs(Number(amount) || 0);
  if (!abs) return 0;
  return direction === 'borc' ? abs : -abs;
}

function mapDevirRow(r: {
  id: string;
  fiche_no?: string | null;
  date?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  net_amount?: string | number | null;
  notes?: string | null;
}): CariDevirRecord {
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

async function queryAccounts(
  table: string,
  cardType: CariCardType,
  fn: string,
  limit: number,
): Promise<CariAccountRow[]> {
  const res = await pgQuery<{
    id: string;
    code: string | null;
    name: string;
    balance: number;
    is_active: boolean;
  }>(
    `SELECT id, code, name,
            COALESCE(balance, 0)::float8 AS balance,
            COALESCE(is_active, true) AS is_active
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
     ORDER BY name ASC
     LIMIT $3`,
    [fn, fn.replace(/^0+/, '') || fn, limit],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    code: r.code,
    name: r.name || '',
    balance: Number(r.balance) || 0,
    cardType,
    is_active: Boolean(r.is_active),
  }));
}

/** Müşteri + tedarikçi cari kartları (web supplierAPI.getAll) */
export async function fetchCariAccounts(limit = 2000): Promise<CariAccountRow[]> {
  if (!shouldUseLiveData()) return [];
  try {
    const fn = firmNr();
    const [customers, suppliers] = await Promise.all([
      queryAccounts(customersTable(), 'customer', fn, limit),
      queryAccounts(suppliersTable(), 'supplier', fn, limit),
    ]);
    return [...customers, ...suppliers].sort((a, b) =>
      a.name.localeCompare(b.name, 'tr'),
    );
  } catch (e) {
    if (getNetworkPolicy() === 'online') throw e;
    return [];
  }
}

export async function listCariDevirRecords(): Promise<CariDevirRecord[]> {
  if (!shouldUseLiveData()) return [];
  try {
    const table = salesTable();
    const res = await pgQuery<{
      id: string;
      fiche_no: string | null;
      date: string | null;
      customer_id: string | null;
      customer_name: string | null;
      net_amount: string | number | null;
      notes: string | null;
    }>(
      `SELECT id, fiche_no, date, customer_id, customer_name, net_amount, notes
       FROM ${table}
       WHERE fiche_type = $1
         AND COALESCE(is_cancelled, false) = false
       ORDER BY date DESC
       LIMIT 5000`,
      [CARI_OPENING_FICHE_TYPE],
    );
    return res.rows.map(mapDevirRow);
  } catch (e) {
    if (getNetworkPolicy() === 'online') throw e;
    return [];
  }
}

export async function getCariDevirMapByAccount(): Promise<Map<string, CariDevirRecord>> {
  const list = await listCariDevirRecords();
  const map = new Map<string, CariDevirRecord>();
  for (const row of list) {
    if (!row.customer_id) continue;
    if (!map.has(row.customer_id)) map.set(row.customer_id, row);
  }
  return map;
}

async function generateDevirFicheNo(accountCode?: string | null): Promise<string> {
  const table = salesTable();
  const prefix = `DEV-${String(accountCode || 'CARI').replace(/\s+/g, '').slice(0, 12)}`;
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const like = `${prefix}-${datePart}-%`;
  const res = await pgQuery<{ fiche_no: string }>(
    `SELECT fiche_no FROM ${table}
     WHERE fiche_type = $1 AND fiche_no LIKE $2
     ORDER BY fiche_no DESC LIMIT 1`,
    [CARI_OPENING_FICHE_TYPE, like],
  );
  const last = res.rows[0]?.fiche_no ? String(res.rows[0].fiche_no) : '';
  const tail = last.match(/-(\d+)$/)?.[1];
  const next = (tail ? parseInt(tail, 10) : 0) + 1;
  return `${prefix}-${datePart}-${String(next).padStart(3, '0')}`;
}

async function cancelExistingOpeningRows(accountId: string): Promise<number> {
  const table = salesTable();
  const res = await pgQuery(
    `UPDATE ${table}
     SET is_cancelled = true, updated_at = NOW()
     WHERE customer_id::text = $1::text
       AND fiche_type = $2
       AND COALESCE(is_cancelled, false) = false`,
    [accountId, CARI_OPENING_FICHE_TYPE],
  );
  return res.rowCount ?? 0;
}

async function insertOpeningRow(
  line: CariDevirLineInput,
  ficheNo: string,
  dateIso: string,
  batchNotes?: string,
): Promise<string> {
  const table = salesTable();
  const fn = firmNr();
  const pn = periodNr();
  const net = signedNetAmount(line.amount, line.direction);
  const abs = Math.abs(net);
  const notes = [batchNotes, line.lineNotes, 'Cari devir fişi — eski program açılış bakiyesi']
    .filter(Boolean)
    .join(' | ');
  const id = newUuid();

  await pgQuery(
    `INSERT INTO ${table} (
      id, firm_nr, period_nr, fiche_no, document_no, date, fiche_type, trcode,
      customer_id, customer_name, total_net, total_vat, total_gross, total_discount,
      net_amount, total_cost, gross_profit, profit_margin, currency, currency_rate,
      status, payment_method, is_cancelled, credit_amount, notes
    ) VALUES (
      $1::uuid, $2, $3, $4, $4, $5::timestamptz, $6, $7,
      $8::uuid, $9, $10, 0, $10, 0,
      $11, 0, 0, 0, 'IQD', 1,
      'completed', 'devir', false, 0, $12
    )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      dateIso,
      CARI_OPENING_FICHE_TYPE,
      CARI_OPENING_TRCODE,
      line.accountId,
      line.accountName || '',
      abs,
      net,
      notes,
    ],
  );
  return id;
}

export async function updateCariDevirRecord(
  id: string,
  input: {
    amount: number;
    direction: CariDevirDirection;
    date?: string;
    notes?: string;
  },
): Promise<void> {
  const table = salesTable();
  const net = signedNetAmount(input.amount, input.direction);
  const abs = Math.abs(net);
  const dateIso = input.date
    ? input.date.includes('T')
      ? input.date
      : `${input.date}T12:00:00.000Z`
    : null;

  await pgQuery(
    `UPDATE ${table} SET
      net_amount = $1::numeric,
      total_net = $2::numeric,
      total_gross = $2::numeric,
      date = COALESCE($3::timestamptz, date),
      notes = COALESCE($4, notes),
      updated_at = NOW()
     WHERE id = $5::uuid`,
    [net, abs, dateIso, input.notes ?? null, id],
  );
}

export async function cancelCariDevirRecord(id: string): Promise<void> {
  const table = salesTable();
  await pgQuery(
    `UPDATE ${table} SET is_cancelled = true, updated_at = NOW() WHERE id = $1::uuid`,
    [id],
  );
}

export async function createCariDevirBatch(
  input: CariDevirBatchInput,
): Promise<CariDevirBatchResult> {
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
        result.replaced += await cancelExistingOpeningRows(line.accountId);
      }
      const ficheNo = await generateDevirFicheNo(line.accountCode);
      await insertOpeningRow({ ...line, amount }, ficheNo, dateIso, input.batchNotes);
      result.created += 1;
    } catch (err: unknown) {
      result.errors.push({
        accountId: line.accountId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
