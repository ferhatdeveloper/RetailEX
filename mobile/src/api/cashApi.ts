/**
 * Kasa / banka hareketleri + cari tahsilat/ödeme (CH_TAHSILAT / CH_ODEME).
 * Web: src/services/api/kasa.ts — createKasaIslemi
 */

import { pgQuery } from './pgClient';
import {
  appendStoreIdFilterAllowNull,
  bankLinesTable,
  bankRegistersTable,
  cashLinesTable,
  cashRegistersTable,
  customersTable,
  firmNr,
  newUuid,
  periodNr,
  storeId,
  suppliersTable,
} from './erpTables';
import {
  CASH_TX,
  cashTransactionTypeLabel,
  cashTxForDirection,
} from './cashTransactionTypes';


type CashLineInsert = {
  id: string;
  registerId: string;
  ficheNo: string;
  date: string;
  amount: number;
  sign: number;
  definition: string;
  transactionType: string;
  customerId?: string | null;
  bankId?: string | null;
  targetRegisterId?: string | null;
  currencyCode?: string;
  exchangeRate?: number;
  transferStatus?: number;
};

/** cash_lines INSERT — oturum storeId yazar; kolon yoksa fallback */
async function insertCashLine(row: CashLineInsert): Promise<void> {
  const fn = firmNr();
  const pn = periodNr();
  const table = cashLinesTable();
  const sid = storeId();
  const currency = row.currencyCode ?? 'YEREL';
  const rate = row.exchangeRate ?? 1;
  const transfer = row.transferStatus ?? 0;

  const cols = [
    'id',
    'firm_nr',
    'period_nr',
    'register_id',
    'fiche_no',
    'date',
    'amount',
    'sign',
    'definition',
    'transaction_type',
    'currency_code',
    'exchange_rate',
    'f_amount',
    'transfer_status',
  ];
  const params: unknown[] = [
    row.id,
    fn,
    pn,
    row.registerId,
    row.ficheNo,
    row.date,
    row.amount,
    row.sign,
    row.definition,
    row.transactionType,
    currency,
    rate,
    row.amount,
    transfer,
  ];

  if (row.customerId) {
    cols.push('customer_id');
    params.push(row.customerId);
  }
  if (row.bankId) {
    cols.push('bank_id');
    params.push(row.bankId);
  }
  if (row.targetRegisterId) {
    cols.push('target_register_id');
    params.push(row.targetRegisterId);
  }

  const build = (withStore: boolean) => {
    const c = withStore && sid ? [...cols, 'store_id'] : cols;
    const p = withStore && sid ? [...params, sid] : [...params];
    const ph = c.map((col, i) => {
      if (
        ['id', 'register_id', 'customer_id', 'bank_id', 'target_register_id', 'store_id'].includes(
          col,
        )
      ) {
        return `$${i + 1}::uuid`;
      }
      if (col === 'date') return `$${i + 1}::date`;
      return `$${i + 1}`;
    });
    return {
      sql: `INSERT INTO ${table} (${c.join(', ')}) VALUES (${ph.join(', ')})`,
      params: p,
    };
  };

  try {
    const q = build(true);
    await pgQuery(q.sql, q.params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (sid && /store_id/i.test(msg)) {
      const q = build(false);
      await pgQuery(q.sql, q.params);
      return;
    }
    throw e;
  }
}


export type CashRegisterRow = {
  id: string;
  code: string | null;
  name: string;
  balance: number;
  currency_code: string | null;
  is_active: boolean;
};

export type BankRegisterRow = {
  id: string;
  code: string | null;
  bank_name: string | null;
  name: string | null;
  iban: string | null;
  balance: number;
  currency_code: string | null;
  is_active: boolean;
};

export type CashMovementRow = {
  id: string;
  register_id: string | null;
  register_name: string | null;
  register_code: string | null;
  fiche_no: string | null;
  date: string | null;
  amount: number;
  sign: number;
  transaction_type: string | null;
  definition: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_code: string | null;
};

export type BankMovementRow = {
  id: string;
  register_id: string | null;
  register_name: string | null;
  register_code: string | null;
  fiche_no: string | null;
  date: string | null;
  amount: number;
  sign: number;
  transaction_type: string | null;
  definition: string | null;
};

export type CariCashSlipType = 'CH_TAHSILAT' | 'CH_ODEME';

export type CariCashSlipInput = {
  registerId: string;
  customerId: string;
  amount: number;
  type: CariCashSlipType;
  date?: string;
  description?: string;
};

export type SimpleCashMovementInput = {
  registerId: string;
  amount: number;
  direction: 'in' | 'out';
  date?: string;
  description?: string;
};

export type SimpleBankMovementInput = {
  registerId: string;
  amount: number;
  direction: 'in' | 'out';
  date?: string;
  description?: string;
  /** Varsayılan BANKA_GIRIS/CIKIS; dış havale için HAVALE / EFT */
  transactionType?: 'BANKA_GIRIS' | 'BANKA_CIKIS' | 'HAVALE' | 'EFT';
  /** Fatura/POS fiş no — kasa satırı gibi satış fişiyle eşlemek için */
  ficheNo?: string;
};

export type CashVirmanInput = {
  sourceRegisterId: string;
  targetRegisterId: string;
  amount: number;
  date?: string;
  description?: string;
};

/** Banka ↔ banka virman — çift satır (bank_lines’ta target kolonu yok; fiche_no eşlemesi) */
export type BankVirmanInput = {
  sourceRegisterId: string;
  targetRegisterId: string;
  amount: number;
  date?: string;
  description?: string;
};

export type CashBankBridgeType = 'BANKA_YATIRILAN' | 'BANKADAN_CEKILEN';

export type CashBankBridgeInput = {
  type: CashBankBridgeType;
  cashRegisterId: string;
  bankRegisterId: string;
  amount: number;
  date?: string;
  description?: string;
};

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nextFicheNo(prefix: 'KL' | 'BNK'): string {
  return `${prefix}-${firmNr()}-${Date.now()}`;
}

/** Web cariCashStoredBalanceDelta — tahsilat/ödeme açık bakiyeyi düşürür */
function cariBalanceDelta(amount: number, type: CariCashSlipType): number {
  const amt = Math.abs(Number(amount) || 0);
  if (!amt) return 0;
  if (type === 'CH_TAHSILAT' || type === 'CH_ODEME') return -amt;
  return 0;
}

export async function fetchCashRegisters(limit = 80): Promise<CashRegisterRow[]> {
  const table = cashRegistersTable();
  const fn = firmNr();
  const res = await pgQuery<CashRegisterRow>(
    `SELECT id::text AS id, code, name,
            COALESCE(balance, 0)::float8 AS balance,
            currency_code,
            COALESCE(is_active, true) AS is_active
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
     ORDER BY code ASC NULLS LAST, name ASC
     LIMIT $3`,
    [fn, fn.replace(/^0+/, '') || fn, limit],
  );
  return res.rows;
}

export async function fetchBankRegisters(limit = 80): Promise<BankRegisterRow[]> {
  const table = bankRegistersTable();
  const fn = firmNr();
  const res = await pgQuery<BankRegisterRow>(
    `SELECT id::text AS id, code, bank_name, name, iban,
            COALESCE(balance, 0)::float8 AS balance,
            currency_code,
            COALESCE(is_active, true) AS is_active
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
     ORDER BY code ASC NULLS LAST, COALESCE(bank_name, name) ASC
     LIMIT $3`,
    [fn, fn.replace(/^0+/, '') || fn, limit],
  );
  return res.rows;
}

export async function fetchCashMovements(opts?: {
  registerId?: string | null;
  cariOnly?: boolean;
  limit?: number;
}): Promise<CashMovementRow[]> {
  const lines = cashLinesTable();
  const regs = cashRegistersTable();
  const cust = customersTable();
  const supp = suppliersTable();
  const fn = firmNr();
  const pn = periodNr();
  const limit = opts?.limit ?? 120;
  const params: unknown[] = [fn, fn.replace(/^0+/, '') || fn, pn, limit];
  let filter = '';
  if (opts?.registerId) {
    filter += ' AND cl.register_id::text = $5';
    params.push(opts.registerId);
  }
  if (opts?.cariOnly) {
    filter += ` AND UPPER(TRIM(COALESCE(cl.transaction_type, ''))) IN ('CH_TAHSILAT', 'CH_ODEME')`;
  }
  filter += appendStoreIdFilterAllowNull('cl.store_id', params);

  const res = await pgQuery<CashMovementRow>(
    `SELECT cl.id::text AS id,
            cl.register_id::text AS register_id,
            cr.name AS register_name,
            cr.code AS register_code,
            cl.fiche_no,
            cl.date::text AS date,
            COALESCE(cl.amount, 0)::float8 AS amount,
            COALESCE(cl.sign, 0)::int AS sign,
            cl.transaction_type,
            cl.definition,
            cl.customer_id::text AS customer_id,
            COALESCE(c.name, s.name) AS customer_name,
            COALESCE(c.code, s.code) AS customer_code
     FROM ${lines} cl
     LEFT JOIN ${regs} cr ON cr.id = cl.register_id
     LEFT JOIN ${cust} c ON c.id = cl.customer_id
     LEFT JOIN ${supp} s ON s.id = cl.customer_id
     WHERE (
       LPAD(TRIM(COALESCE(cl.firm_nr, '')), 3, '0') = $1
       OR TRIM(COALESCE(cl.firm_nr, '')) = $2
       OR cl.firm_nr IS NULL
     )
       AND (
         LPAD(TRIM(COALESCE(cl.period_nr, '')), 2, '0') = $3
         OR TRIM(COALESCE(cl.period_nr, '')) = $3
         OR cl.period_nr IS NULL
       )
       ${filter}
     ORDER BY cl.date DESC NULLS LAST, cl.created_at DESC NULLS LAST
     LIMIT $4`,
    params,
  );
  return res.rows;
}

export async function fetchBankMovements(opts?: {
  registerId?: string | null;
  limit?: number;
}): Promise<BankMovementRow[]> {
  const lines = bankLinesTable();
  const regs = bankRegistersTable();
  const fn = firmNr();
  const pn = periodNr();
  const limit = opts?.limit ?? 120;
  const params: unknown[] = [fn, fn.replace(/^0+/, '') || fn, pn, limit];
  let filter = '';
  if (opts?.registerId) {
    filter = ' AND bl.register_id::text = $5';
    params.push(opts.registerId);
  }

  const res = await pgQuery<BankMovementRow>(
    `SELECT bl.id::text AS id,
            bl.register_id::text AS register_id,
            br.bank_name AS register_name,
            br.code AS register_code,
            bl.fiche_no,
            bl.date::text AS date,
            COALESCE(bl.amount, 0)::float8 AS amount,
            COALESCE(bl.sign, 0)::int AS sign,
            bl.transaction_type,
            bl.definition
     FROM ${lines} bl
     LEFT JOIN ${regs} br ON br.id = bl.register_id
     WHERE (
       LPAD(TRIM(COALESCE(bl.firm_nr, '')), 3, '0') = $1
       OR TRIM(COALESCE(bl.firm_nr, '')) = $2
       OR bl.firm_nr IS NULL
     )
       AND (
         LPAD(TRIM(COALESCE(bl.period_nr, '')), 2, '0') = $3
         OR TRIM(COALESCE(bl.period_nr, '')) = $3
         OR bl.period_nr IS NULL
       )
       ${filter}
     ORDER BY bl.date DESC NULLS LAST, bl.created_at DESC NULLS LAST
     LIMIT $4`,
    params,
  );
  return res.rows;
}

export async function createSimpleCashMovement(
  input: SimpleCashMovementInput,
): Promise<{ id: string; ficheNo: string }> {
  const amount = Math.abs(Number(input.amount) || 0);
  if (!input.registerId) throw new Error('Kasa seçin');
  if (amount <= 0) throw new Error('Tutar 0’dan büyük olmalı');

  const regs = cashRegistersTable();
  const txType = cashTxForDirection(input.direction);
  const sign = input.direction === 'in' ? 1 : -1;
  const ficheNo = nextFicheNo('KL');
  const id = newUuid();
  const date = (input.date || todayYmd()).slice(0, 10);
  const desc = (input.description || '').trim() || (sign > 0 ? 'Kasa giriş' : 'Kasa çıkış');

  await insertCashLine({
    id,
    registerId: input.registerId,
    ficheNo,
    date,
    amount,
    sign,
    definition: desc,
    transactionType: txType,
  });

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount * sign, input.registerId],
  );

  return { id, ficheNo };
}

export async function createCariCashSlip(
  input: CariCashSlipInput,
): Promise<{ id: string; ficheNo: string }> {
  const amount = Math.abs(Number(input.amount) || 0);
  if (!input.registerId) throw new Error('Kasa seçin');
  if (!input.customerId) throw new Error('Cari hesap seçin');
  if (amount <= 0) throw new Error('Tutar 0’dan büyük olmalı');

  const regs = cashRegistersTable();
  const cust = customersTable();
  const supp = suppliersTable();
  const txType = input.type;
  const sign = txType === 'CH_TAHSILAT' ? 1 : -1;
  const ficheNo = nextFicheNo('KL');
  const id = newUuid();
  const date = (input.date || todayYmd()).slice(0, 10);
  const desc =
    (input.description || '').trim() ||
    (txType === 'CH_TAHSILAT' ? 'Cari tahsilat' : 'Cari ödeme');

  await insertCashLine({
    id,
    registerId: input.registerId,
    ficheNo,
    date,
    amount,
    sign,
    definition: desc,
    transactionType: txType,
    customerId: input.customerId,
  });

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount * sign, input.registerId],
  );

  const delta = cariBalanceDelta(amount, txType);
  if (delta !== 0) {
    const custRes = await pgQuery(
      `UPDATE ${cust}
       SET balance = COALESCE(balance, 0) + $1::numeric
       WHERE id = $2::uuid`,
      [delta, input.customerId],
    );
    if (!custRes.rowCount) {
      await pgQuery(
        `UPDATE ${supp}
         SET balance = COALESCE(balance, 0) + $1::numeric
         WHERE id = $2::uuid`,
        [delta, input.customerId],
      );
    }
  }

  return { id, ficheNo };
}

/** Kasa → kasa virman — web kasa.ts VIRMAN karşı satır */
export async function createCashVirman(
  input: CashVirmanInput,
): Promise<{ id: string; ficheNo: string }> {
  const amount = Math.abs(Number(input.amount) || 0);
  if (!input.sourceRegisterId) throw new Error('Kaynak kasa seçin');
  if (!input.targetRegisterId) throw new Error('Hedef kasa seçin');
  if (input.sourceRegisterId === input.targetRegisterId) {
    throw new Error('Kaynak ve hedef kasa aynı olamaz');
  }
  if (amount <= 0) throw new Error('Tutar 0’dan büyük olmalı');

  const regs = cashRegistersTable();
  const ficheNo = nextFicheNo('KL');
  const id = newUuid();
  const date = (input.date || todayYmd()).slice(0, 10);
  const desc = (input.description || '').trim() || 'Kasa virman';

  await insertCashLine({
    id,
    registerId: input.sourceRegisterId,
    ficheNo,
    date,
    amount,
    sign: -1,
    definition: desc,
    transactionType: 'VIRMAN',
    targetRegisterId: input.targetRegisterId,
  });

  const counterId = newUuid();
  const counterDesc = `${desc} (Virman alındı)`;
  await insertCashLine({
    id: counterId,
    registerId: input.targetRegisterId,
    ficheNo: `${ficheNo}-VRM`,
    date,
    amount,
    sign: 1,
    definition: counterDesc,
    transactionType: 'VIRMAN',
    targetRegisterId: input.sourceRegisterId,
  });

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [-amount, input.sourceRegisterId],
  );
  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount, input.targetRegisterId],
  );

  return { id, ficheNo };
}

/** Kasa ↔ banka — web BANKA_YATIRILAN / BANKADAN_CEKILEN */
export async function createCashBankBridge(
  input: CashBankBridgeInput,
): Promise<{ id: string; ficheNo: string }> {
  const amount = Math.abs(Number(input.amount) || 0);
  if (!input.cashRegisterId) throw new Error('Kasa seçin');
  if (!input.bankRegisterId) throw new Error('Banka hesabı seçin');
  if (amount <= 0) throw new Error('Tutar 0’dan büyük olmalı');

  const fn = firmNr();
  const pn = periodNr();
  const cashLines = cashLinesTable();
  const bankLines = bankLinesTable();
  const cashRegs = cashRegistersTable();
  const bankRegs = bankRegistersTable();
  const ficheNo = nextFicheNo('KL');
  const id = newUuid();
  const date = (input.date || todayYmd()).slice(0, 10);
  const txType = input.type;
  const cashSign = txType === 'BANKA_YATIRILAN' ? -1 : 1;
  const bankSign = txType === 'BANKA_YATIRILAN' ? 1 : -1;
  const bankTxType = txType === 'BANKA_YATIRILAN' ? 'BANKA_GIRIS' : 'BANKA_CIKIS';
  const desc =
    (input.description || '').trim() ||
    (txType === 'BANKA_YATIRILAN' ? 'Bankaya yatırılan' : 'Bankadan çekilen');
  const bankDesc = `${desc} (Kasa entegrasyon)`;

  await insertCashLine({
    id,
    registerId: input.cashRegisterId,
    ficheNo,
    date,
    amount,
    sign: cashSign,
    definition: desc,
    transactionType: txType,
    bankId: input.bankRegisterId,
  });

  const bankId = newUuid();
  await pgQuery(
    `INSERT INTO ${bankLines} (
       id, firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
       definition, transaction_type, currency_code, exchange_rate, f_amount
     ) VALUES (
       $1::uuid, $2, $3, $4::uuid, $5, $6::date, $7, $8,
       $9, $10, 'YEREL', 1, $7
     )`,
    [
      bankId,
      fn,
      pn,
      input.bankRegisterId,
      ficheNo,
      date,
      amount,
      bankSign,
      bankDesc,
      bankTxType,
    ],
  );

  await pgQuery(
    `UPDATE ${cashRegs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount * cashSign, input.cashRegisterId],
  );
  await pgQuery(
    `UPDATE ${bankRegs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount * bankSign, input.bankRegisterId],
  );

  return { id, ficheNo };
}

export async function createSimpleBankMovement(
  input: SimpleBankMovementInput,
): Promise<{ id: string; ficheNo: string }> {
  const amount = Math.abs(Number(input.amount) || 0);
  if (!input.registerId) throw new Error('Banka hesabı seçin');
  if (amount <= 0) throw new Error('Tutar 0’dan büyük olmalı');

  const fn = firmNr();
  const pn = periodNr();
  const lines = bankLinesTable();
  const regs = bankRegistersTable();
  const explicit = input.transactionType
    ? String(input.transactionType).toUpperCase().trim()
    : '';
  const isOutboundType = explicit === 'HAVALE' || explicit === 'EFT' || explicit === 'BANKA_CIKIS';
  const isInboundType = explicit === 'BANKA_GIRIS';
  const direction: 'in' | 'out' = isOutboundType
    ? 'out'
    : isInboundType
      ? 'in'
      : input.direction;
  const txType =
    explicit === 'HAVALE' || explicit === 'EFT' || explicit === 'BANKA_GIRIS' || explicit === 'BANKA_CIKIS'
      ? explicit
      : direction === 'in'
        ? 'BANKA_GIRIS'
        : 'BANKA_CIKIS';
  const sign = direction === 'in' ? 1 : -1;
  const ficheNo =
    String(input.ficheNo || '').trim() || nextFicheNo('BNK');
  const id = newUuid();
  const date = (input.date || todayYmd()).slice(0, 10);
  const defaultDesc =
    txType === 'HAVALE'
      ? 'Havale'
      : txType === 'EFT'
        ? 'EFT'
        : sign > 0
          ? 'Banka giriş'
          : 'Banka çıkış';
  const desc = (input.description || '').trim() || defaultDesc;

  await pgQuery(
    `INSERT INTO ${lines} (
       id, firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
       definition, transaction_type, currency_code, exchange_rate, f_amount
     ) VALUES (
       $1::uuid, $2, $3, $4::uuid, $5, $6::date, $7, $8, $9, $10, 'YEREL', 1, $7
     )`,
    [id, fn, pn, input.registerId, ficheNo, date, amount, sign, desc, txType],
  );

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount * sign, input.registerId],
  );

  return { id, ficheNo };
}

/**
 * Banka → banka virman — web HAVALE/VIRMAN çift kayıt mantığı.
 * Kaynak −1 / hedef +1; bakiyeler simetrik güncellenir.
 */
export async function createBankVirman(
  input: BankVirmanInput,
): Promise<{ id: string; ficheNo: string }> {
  const amount = Math.abs(Number(input.amount) || 0);
  if (!input.sourceRegisterId) throw new Error('Kaynak banka seçin');
  if (!input.targetRegisterId) throw new Error('Hedef banka seçin');
  if (input.sourceRegisterId === input.targetRegisterId) {
    throw new Error('Kaynak ve hedef banka aynı olamaz');
  }
  if (amount <= 0) throw new Error('Tutar 0’dan büyük olmalı');

  const fn = firmNr();
  const pn = periodNr();
  const lines = bankLinesTable();
  const regs = bankRegistersTable();
  const ficheNo = nextFicheNo('BNK');
  const id = newUuid();
  const date = (input.date || todayYmd()).slice(0, 10);
  const desc = (input.description || '').trim() || 'Banka virman';

  await pgQuery(
    `INSERT INTO ${lines} (
       id, firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
       definition, transaction_type, currency_code, exchange_rate, f_amount
     ) VALUES (
       $1::uuid, $2, $3, $4::uuid, $5, $6::date, $7, -1,
       $8, 'VIRMAN', 'YEREL', 1, $7
     )`,
    [id, fn, pn, input.sourceRegisterId, ficheNo, date, amount, desc],
  );

  const counterId = newUuid();
  const counterDesc = `${desc} (Virman alındı)`;
  await pgQuery(
    `INSERT INTO ${lines} (
       id, firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
       definition, transaction_type, currency_code, exchange_rate, f_amount
     ) VALUES (
       $1::uuid, $2, $3, $4::uuid, $5, $6::date, $7, 1,
       $8, 'VIRMAN', 'YEREL', 1, $7
     )`,
    [
      counterId,
      fn,
      pn,
      input.targetRegisterId,
      `${ficheNo}-VRM`,
      date,
      amount,
      counterDesc,
    ],
  );

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [-amount, input.sourceRegisterId],
  );
  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount, input.targetRegisterId],
  );

  return { id, ficheNo };
}

export function movementTypeLabel(type: string | null, sign: number): string {
  return cashTransactionTypeLabel(type, sign);
}

/** Aktif ilk kasa — web MarketPOS selected_cash_registers fallback */
export async function resolveDefaultCashRegisterId(): Promise<string | null> {
  try {
    const regs = await fetchCashRegisters(1);
    return regs[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Aktif ilk banka hesabı — peşin havale alış iade fallback */
export async function resolveDefaultBankRegisterId(): Promise<string | null> {
  try {
    const regs = await fetchBankRegisters(1);
    return regs[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Satış / POS sonrası KASA_GIRIS — web createKasaIslemi pattern.
 * Kasa yoksa sessizce atlar (satış yine kaydedilmiş olur).
 */
export async function recordKasaGirisForSale(opts: {
  amount: number;
  ficheNo: string;
  description?: string;
  customerId?: string | null;
  registerId?: string | null;
}): Promise<{ id: string; registerId: string } | null> {
  const amount = Math.abs(Number(opts.amount) || 0);
  if (amount <= 0) return null;

  const registerId = opts.registerId || (await resolveDefaultCashRegisterId());
  if (!registerId) return null;

  const regs = cashRegistersTable();
  const id = newUuid();
  const date = todayYmd();
  const desc =
    (opts.description || '').trim() || `Satış — ${opts.ficheNo}`;
  const ficheNo = String(opts.ficheNo || '').trim() || nextFicheNo('KL');
  const customerId = opts.customerId || null;

  await insertCashLine({
    id,
    registerId,
    ficheNo,
    date,
    amount,
    sign: 1,
    definition: desc,
    transactionType: CASH_TX.KASA_GIRIS,
    customerId,
  });

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount, registerId],
  );

  return { id, registerId };
}

/**
 * Peşin alış sonrası KASA_CIKIS — stok + ödeme nakit/kart ise kasa düşer.
 * Kasa yoksa sessizce atlar (alış yine kaydedilmiş olur).
 */
export async function recordKasaCikisForPurchase(opts: {
  amount: number;
  ficheNo: string;
  description?: string;
  supplierId?: string | null;
  registerId?: string | null;
}): Promise<{ id: string; registerId: string } | null> {
  const amount = Math.abs(Number(opts.amount) || 0);
  if (amount <= 0) return null;

  const registerId = opts.registerId || (await resolveDefaultCashRegisterId());
  if (!registerId) return null;

  const regs = cashRegistersTable();
  const id = newUuid();
  const date = todayYmd();
  const desc =
    (opts.description || '').trim() || `Alış — ${opts.ficheNo}`;
  const ficheNo = String(opts.ficheNo || '').trim() || nextFicheNo('KL');
  const supplierId = opts.supplierId || null;

  await insertCashLine({
    id,
    registerId,
    ficheNo,
    date,
    amount,
    sign: -1,
    definition: desc,
    transactionType: CASH_TX.KASA_CIKIS,
    customerId: supplierId,
  });

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) - $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount, registerId],
  );

  return { id, registerId };
}

/**
 * Peşin alış iadesi (trcode 6) sonrası KASA_GIRIS — tedarikçiden dönen nakit/kart kasaya girer.
 * Simetri: recordKasaCikisForPurchase. Kasa yoksa sessizce atlar.
 */
export async function recordKasaGirisForPurchaseReturn(opts: {
  amount: number;
  ficheNo: string;
  description?: string;
  supplierId?: string | null;
  registerId?: string | null;
}): Promise<{ id: string; registerId: string } | null> {
  const amount = Math.abs(Number(opts.amount) || 0);
  if (amount <= 0) return null;

  const registerId = opts.registerId || (await resolveDefaultCashRegisterId());
  if (!registerId) return null;

  const regs = cashRegistersTable();
  const id = newUuid();
  const date = todayYmd();
  const desc =
    (opts.description || '').trim() || `Alış iadesi — ${opts.ficheNo}`;
  const ficheNo = String(opts.ficheNo || '').trim() || nextFicheNo('KL');
  const supplierId = opts.supplierId || null;

  await insertCashLine({
    id,
    registerId,
    ficheNo,
    date,
    amount,
    sign: 1,
    definition: desc,
    transactionType: CASH_TX.KASA_GIRIS,
    customerId: supplierId,
  });

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) + $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount, registerId],
  );

  return { id, registerId };
}

/**
 * Peşin satış / POS (havale/EFT) → BANKA_GIRIS.
 * Simetri: recordKasaGirisForSale. Varsayılan banka yoksa sessizce atlar.
 */
export async function recordBankaGirisForSale(opts: {
  amount: number;
  ficheNo: string;
  description?: string;
  registerId?: string | null;
}): Promise<{ id: string; ficheNo: string } | null> {
  const amount = Math.abs(Number(opts.amount) || 0);
  if (amount <= 0) return null;

  const registerId = opts.registerId || (await resolveDefaultBankRegisterId());
  if (!registerId) return null;

  const ficheNo = String(opts.ficheNo || '').trim() || nextFicheNo('BNK');
  const desc =
    (opts.description || '').trim() || `Satış (havale) — ${ficheNo}`;

  try {
    return await createSimpleBankMovement({
      registerId,
      amount,
      direction: 'in',
      description: desc,
      transactionType: CASH_TX.BANKA_GIRIS,
      ficheNo,
    });
  } catch {
    return null;
  }
}

/**
 * Peşin alış (havale/EFT) → BANKA_CIKIS.
 * Simetri: recordKasaCikisForPurchase. Varsayılan banka yoksa sessizce atlar.
 */
export async function recordBankaCikisForPurchase(opts: {
  amount: number;
  ficheNo: string;
  description?: string;
  registerId?: string | null;
}): Promise<{ id: string; ficheNo: string } | null> {
  const amount = Math.abs(Number(opts.amount) || 0);
  if (amount <= 0) return null;

  const registerId = opts.registerId || (await resolveDefaultBankRegisterId());
  if (!registerId) return null;

  const ficheNo = String(opts.ficheNo || '').trim() || nextFicheNo('BNK');
  const desc =
    (opts.description || '').trim() || `Alış (havale) — ${ficheNo}`;

  try {
    return await createSimpleBankMovement({
      registerId,
      amount,
      direction: 'out',
      description: desc,
      transactionType: CASH_TX.BANKA_CIKIS,
      ficheNo,
    });
  } catch {
    return null;
  }
}

/**
 * Peşin satış iadesi (havale/EFT) → BANKA_CIKIS.
 * Simetri: recordKasaCikisForReturn. Varsayılan banka yoksa sessizce atlar.
 */
export async function recordBankaCikisForReturn(opts: {
  amount: number;
  ficheNo: string;
  description?: string;
  registerId?: string | null;
}): Promise<{ id: string; ficheNo: string } | null> {
  const amount = Math.abs(Number(opts.amount) || 0);
  if (amount <= 0) return null;

  const registerId = opts.registerId || (await resolveDefaultBankRegisterId());
  if (!registerId) return null;

  const ficheNo = String(opts.ficheNo || '').trim() || nextFicheNo('BNK');
  const desc =
    (opts.description || '').trim() || `Satış iadesi (havale) — ${ficheNo}`;

  try {
    return await createSimpleBankMovement({
      registerId,
      amount,
      direction: 'out',
      description: desc,
      transactionType: CASH_TX.BANKA_CIKIS,
      ficheNo,
    });
  } catch {
    return null;
  }
}

/**
 * Peşin alış iadesi (havale/EFT) → BANKA_GIRIS.
 * Varsayılan banka yoksa sessizce atlar.
 */
export async function recordBankaGirisForPurchaseReturn(opts: {
  amount: number;
  ficheNo: string;
  description?: string;
  registerId?: string | null;
}): Promise<{ id: string; ficheNo: string } | null> {
  const amount = Math.abs(Number(opts.amount) || 0);
  if (amount <= 0) return null;

  const registerId = opts.registerId || (await resolveDefaultBankRegisterId());
  if (!registerId) return null;

  const ficheNo = String(opts.ficheNo || '').trim() || nextFicheNo('BNK');
  const desc =
    (opts.description || '').trim() || `Alış iadesi (havale) — ${ficheNo}`;

  try {
    return await createSimpleBankMovement({
      registerId,
      amount,
      direction: 'in',
      description: desc,
      transactionType: CASH_TX.BANKA_GIRIS,
      ficheNo,
    });
  } catch {
    return null;
  }
}

/**
 * Satış iadesi (peşin) sonrası KASA_CIKIS — nakit/kart iade kasadan çıkar.
 * Kasa yoksa sessizce atlar.
 */
export async function recordKasaCikisForReturn(opts: {
  amount: number;
  ficheNo: string;
  description?: string;
  customerId?: string | null;
  registerId?: string | null;
}): Promise<{ id: string; registerId: string } | null> {
  const amount = Math.abs(Number(opts.amount) || 0);
  if (amount <= 0) return null;

  const registerId = opts.registerId || (await resolveDefaultCashRegisterId());
  if (!registerId) return null;

  const regs = cashRegistersTable();
  const id = newUuid();
  const date = todayYmd();
  const desc =
    (opts.description || '').trim() || `Satış iadesi — ${opts.ficheNo}`;
  const ficheNo = String(opts.ficheNo || '').trim() || nextFicheNo('KL');
  const customerId = opts.customerId || null;

  await insertCashLine({
    id,
    registerId,
    ficheNo,
    date,
    amount,
    sign: -1,
    definition: desc,
    transactionType: CASH_TX.KASA_CIKIS,
    customerId,
  });

  await pgQuery(
    `UPDATE ${regs}
     SET balance = COALESCE(balance, 0) - $1::numeric,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount, registerId],
  );

  return { id, registerId };
}

/** Kart balance += delta (müşteri) */
export async function adjustCustomerBalance(
  customerId: string,
  delta: number,
): Promise<void> {
  if (!customerId || !delta) return;
  await pgQuery(
    `UPDATE ${customersTable()}
     SET balance = COALESCE(balance, 0) + $1::numeric
     WHERE id = $2::uuid`,
    [delta, customerId],
  );
}

/** Kart balance += delta (tedarikçi) */
export async function adjustSupplierBalance(
  supplierId: string,
  delta: number,
): Promise<void> {
  if (!supplierId || !delta) return;
  await pgQuery(
    `UPDATE ${suppliersTable()}
     SET balance = COALESCE(balance, 0) + $1::numeric
     WHERE id = $2::uuid`,
    [delta, supplierId],
  );
}
