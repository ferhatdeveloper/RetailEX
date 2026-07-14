/**
 * Kasa / banka — hareket listesi + basit giriş/çıkış (FinanceScreen).
 * Web: expenses.ts / kasa.ts desenleri.
 */

import { pgQuery } from './pgClient';
import {
  appendStoreIdFilterAllowNull,
  bankLinesTable,
  bankRegistersTable,
  cashLinesTable,
  cashRegistersTable,
  firmNr,
  newUuid,
  periodNr,
  storeId,
} from './erpTables';
import {
  bankTxForDirection,
  cashTransactionTypeLabel,
  cashTxForDirection,
} from './cashTransactionTypes';

export type CashRegisterRow = {
  id: string;
  code: string | null;
  name: string;
  currency_code: string | null;
  balance: number;
  is_active: boolean;
};

export type BankRegisterRow = {
  id: string;
  code: string | null;
  name: string | null;
  bank_name: string | null;
  currency_code: string | null;
  balance: number;
  is_active: boolean;
};

export type CashMovementRow = {
  id: string;
  fiche_no: string | null;
  date: string | null;
  definition: string | null;
  amount: number;
  sign: number;
  transaction_type: string | null;
  register_name: string | null;
};

export type BankMovementRow = CashMovementRow;

async function tryQueries<T>(queries: { sql: string; params?: unknown[] }[]): Promise<T[]> {
  for (const q of queries) {
    try {
      const res = await pgQuery<T>(q.sql, q.params ?? []);
      return res.rows;
    } catch {
      /* next */
    }
  }
  return [];
}

export async function fetchCashRegisters(limit = 50): Promise<CashRegisterRow[]> {
  const table = cashRegistersTable();
  return tryQueries<CashRegisterRow>([
    {
      sql: `SELECT id::text AS id, code, name, currency_code,
                   COALESCE(balance, 0)::float8 AS balance,
                   COALESCE(is_active, true) AS is_active
            FROM ${table}
            WHERE COALESCE(is_active, true) = true
            ORDER BY code ASC NULLS LAST
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchBankRegisters(limit = 50): Promise<BankRegisterRow[]> {
  const table = bankRegistersTable();
  return tryQueries<BankRegisterRow>([
    {
      sql: `SELECT id::text AS id, code, name, bank_name, currency_code,
                   COALESCE(balance, 0)::float8 AS balance,
                   COALESCE(is_active, true) AS is_active
            FROM ${table}
            WHERE COALESCE(is_active, true) = true
            ORDER BY code ASC NULLS LAST
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchCashMovements(opts?: {
  registerId?: string | null;
  limit?: number;
}): Promise<CashMovementRow[]> {
  const lines = cashLinesTable();
  const regs = cashRegistersTable();
  const limit = opts?.limit ?? 120;
  const regId = opts?.registerId?.trim();

  if (regId) {
    const params: unknown[] = [regId, limit];
    const storeSql = appendStoreIdFilterAllowNull('cl.store_id', params);
    return tryQueries<CashMovementRow>([
      {
        sql: `SELECT cl.id::text AS id, cl.fiche_no, cl.date::text AS date, cl.definition,
                     ABS(COALESCE(cl.amount, 0))::float8 AS amount,
                     COALESCE(cl.sign, CASE WHEN COALESCE(cl.amount, 0) >= 0 THEN 1 ELSE -1 END)::int AS sign,
                     cl.transaction_type,
                     cr.name AS register_name
              FROM ${lines} cl
              LEFT JOIN ${regs} cr ON cr.id = cl.register_id
              WHERE cl.register_id::text = $1
                ${storeSql}
              ORDER BY cl.date DESC NULLS LAST, cl.created_at DESC NULLS LAST
              LIMIT $2`,
        params,
      },
    ]);
  }

  const params: unknown[] = [limit];
  const storeSql = appendStoreIdFilterAllowNull('cl.store_id', params);
  return tryQueries<CashMovementRow>([
    {
      sql: `SELECT cl.id::text AS id, cl.fiche_no, cl.date::text AS date, cl.definition,
                   ABS(COALESCE(cl.amount, 0))::float8 AS amount,
                   COALESCE(cl.sign, CASE WHEN COALESCE(cl.amount, 0) >= 0 THEN 1 ELSE -1 END)::int AS sign,
                   cl.transaction_type,
                   cr.name AS register_name
            FROM ${lines} cl
            LEFT JOIN ${regs} cr ON cr.id = cl.register_id
            WHERE 1=1
              ${storeSql}
            ORDER BY cl.date DESC NULLS LAST, cl.created_at DESC NULLS LAST
            LIMIT $1`,
      params,
    },
  ]);
}

export async function fetchBankMovements(opts?: {
  registerId?: string | null;
  limit?: number;
}): Promise<BankMovementRow[]> {
  const lines = bankLinesTable();
  const regs = bankRegistersTable();
  const limit = opts?.limit ?? 120;
  const regId = opts?.registerId?.trim();

  if (regId) {
    return tryQueries<BankMovementRow>([
      {
        sql: `SELECT bl.id::text AS id, bl.fiche_no, bl.date::text AS date, bl.definition,
                     ABS(COALESCE(bl.amount, 0))::float8 AS amount,
                     COALESCE(bl.sign, CASE WHEN COALESCE(bl.amount, 0) >= 0 THEN 1 ELSE -1 END)::int AS sign,
                     bl.transaction_type,
                     br.name AS register_name
              FROM ${lines} bl
              LEFT JOIN ${regs} br ON br.id = bl.register_id
              WHERE bl.register_id::text = $1
              ORDER BY bl.date DESC NULLS LAST
              LIMIT $2`,
        params: [regId, limit],
      },
    ]);
  }

  return tryQueries<BankMovementRow>([
    {
      sql: `SELECT bl.id::text AS id, bl.fiche_no, bl.date::text AS date, bl.definition,
                   ABS(COALESCE(bl.amount, 0))::float8 AS amount,
                   COALESCE(bl.sign, CASE WHEN COALESCE(bl.amount, 0) >= 0 THEN 1 ELSE -1 END)::int AS sign,
                   bl.transaction_type,
                   br.name AS register_name
            FROM ${lines} bl
            LEFT JOIN ${regs} br ON br.id = bl.register_id
            ORDER BY bl.date DESC NULLS LAST
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

function nextFiche(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export async function createSimpleCashMovement(opts: {
  registerId: string;
  amount: number;
  direction: 'in' | 'out';
  date?: string;
  description?: string;
}): Promise<void> {
  const fn = firmNr();
  const pn = periodNr();
  const lines = cashLinesTable();
  const regs = cashRegistersTable();
  const sign = opts.direction === 'in' ? 1 : -1;
  const amt = Math.abs(opts.amount);
  const ficheNo = nextFiche('KM');
  const txType = cashTxForDirection(opts.direction);
  const desc = opts.description?.trim() || (opts.direction === 'in' ? 'Mobil kasa girişi' : 'Mobil kasa çıkışı');
  const date = opts.date?.trim() || new Date().toISOString().slice(0, 10);

  const sid = storeId();
  const cashId = newUuid();
  try {
    if (sid) {
      await pgQuery(
        `INSERT INTO ${lines} (
           id, firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
           definition, transaction_type, currency_code, exchange_rate, f_amount, store_id
         ) VALUES (
           $1::uuid, $2, $3, $4::uuid, $5, $6::date, $7, $8,
           $9, $10, 'TRY', 1, $7, $11::uuid
         )`,
        [cashId, fn, pn, opts.registerId, ficheNo, date, amt, sign, desc, txType, sid],
      );
    } else {
      await pgQuery(
        `INSERT INTO ${lines} (
           id, firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
           definition, transaction_type, currency_code, exchange_rate, f_amount
         ) VALUES (
           $1::uuid, $2, $3, $4::uuid, $5, $6::date, $7, $8,
           $9, $10, 'TRY', 1, $7
         )`,
        [cashId, fn, pn, opts.registerId, ficheNo, date, amt, sign, desc, txType],
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (sid && /store_id/i.test(msg)) {
      await pgQuery(
        `INSERT INTO ${lines} (
           id, firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
           definition, transaction_type, currency_code, exchange_rate, f_amount
         ) VALUES (
           $1::uuid, $2, $3, $4::uuid, $5, $6::date, $7, $8,
           $9, $10, 'TRY', 1, $7
         )`,
        [cashId, fn, pn, opts.registerId, ficheNo, date, amt, sign, desc, txType],
      );
    } else {
      throw e;
    }
  }

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1, updated_at = NOW()
     WHERE id::text = $2`,
    [sign * amt, opts.registerId],
  );
}

export async function createSimpleBankMovement(opts: {
  registerId: string;
  amount: number;
  direction: 'in' | 'out';
  date?: string;
  description?: string;
}): Promise<void> {
  const fn = firmNr();
  const pn = periodNr();
  const lines = bankLinesTable();
  const regs = bankRegistersTable();
  const sign = opts.direction === 'in' ? 1 : -1;
  const amt = Math.abs(opts.amount);
  const ficheNo = nextFiche('BM');
  const txType = bankTxForDirection(opts.direction);
  const desc = opts.description?.trim() || (opts.direction === 'in' ? 'Mobil banka girişi' : 'Mobil banka çıkışı');
  const date = opts.date?.trim() || new Date().toISOString().slice(0, 10);

  await pgQuery(
    `INSERT INTO ${lines} (
       id, firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
       definition, transaction_type, currency_code, exchange_rate, f_amount
     ) VALUES (
       $1::uuid, $2, $3, $4::uuid, $5, $6::date, $7, $8,
       $9, $10, 'TRY', 1, $7
     )`,
    [newUuid(), fn, pn, opts.registerId, ficheNo, date, amt, sign, desc, txType],
  );

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1, updated_at = NOW()
     WHERE id::text = $2`,
    [sign * amt, opts.registerId],
  );
}

export function movementTypeLabel(type: string | null | undefined, sign: number): string {
  return cashTransactionTypeLabel(type, sign);
}
