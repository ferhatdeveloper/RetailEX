/**
 * Expenses API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import {
  cashRegisterDeltasOnUpdate,
  createKasaIslemi,
  deleteKasaIslemi,
  ensureCashLineActorColumns,
  kasaIslemiPostedCash,
} from './kasa';
import {
  convertExpenseEnteredToRegister,
  loadBookCurrencies,
  resolveExpenseCashPosting,
} from './cashFxResolve';
import { expenseFAmountOnUpdate, normalizeFxCurrency } from '../../utils/cashFxPosting';
import { assertPeriodOpen } from '../periodControl';
import { parseDecimalStringForInput } from '../../utils/numberFormatter';
import { resolveCashLineActorWrite } from '../../utils/cashLineActor';
import { isExpenseFicheConflict, nextExpenseFicheNo } from '../../utils/expenseFicheNo';

/**
 * IQD / TR tutar ayrıştırma: "45.000" → 45000, "450.000" → 450000.
 * Ham Number/parseFloat "45.000" → 45 yapar (B01).
 */
export function parseExpenseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const n = parseDecimalStringForInput(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Gider nakit satırı (sign=-1) tutar değişince kasa bakiyesine uygulanacak delta.
 * balance'a eklenir: eski 450k → yeni 45k ⇒ +405000.
 */
export function expenseCashBalanceDeltaOnUpdate(oldAmount: number, newAmount: number): number {
  const oldAmt = Math.abs(Number(oldAmount) || 0);
  const newAmt = Math.abs(Number(newAmount) || 0);
  return oldAmt - newAmt;
}

/**
 * Silinen nakit gider satırının bakiyeyi geri alma deltası (cash_lines.sign ile).
 * GIDER_PUSULASI sign=-1 ⇒ +amount (çıkışı geri koy).
 */
export function expenseCashBalanceDeltaOnDelete(cashLineAmount: number, sign: number = -1): number {
  const amt = Math.abs(Number(cashLineAmount) || 0);
  const s = Number(sign) || -1;
  return -(amt * s);
}

/**
 * Gider çıkışının kasa bakiyesine etkisi. Aynı kasada delta, kasa değişince
 * eski çıkış geri alınır ve yeni kasa yalnızca kendi tutarı kadar azalır.
 */
export function expenseCashOutDeltas(
  oldRegisterId: string | null | undefined,
  newRegisterId: string | null | undefined,
  oldRegisterAmount: number,
  newRegisterAmount: number,
): Array<{ registerId: string; delta: number }> {
  return cashRegisterDeltasOnUpdate(
    oldRegisterId,
    newRegisterId,
    kasaIslemiPostedCash(oldRegisterAmount, -1),
    kasaIslemiPostedCash(newRegisterAmount, -1),
  );
}

/**
 * Eski gider satırı kasa seçmeden de yüklenir. Eksik kasa kimliği hata fırlatmaz.
 */
export function readExpenseCashSelection(row: {
  amount?: unknown;
  cash_register_id?: string | null;
  currency_code?: string | null;
} | null | undefined): { amount: number; cashRegisterId: string | null; currency: string | null } {
  if (row == null) return { amount: 0, cashRegisterId: null, currency: null };
  const id = String(row.cash_register_id ?? '').trim();
  const currency = normalizeFxCurrency(row.currency_code);
  return {
    amount: parseExpenseAmount(row.amount),
    cashRegisterId: id || null,
    currency: currency || null,
  };
}

function padExpenseFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function padExpensePeriodNr(): string {
  return String(ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
}

function expenseTableName(): string {
  return `rex_${padExpenseFirmNr()}_expenses`;
}

function expenseTablePath(): string {
  return `/${expenseTableName()}`;
}

function costCentersTableName(): string {
  return `rex_${padExpenseFirmNr()}_cost_centers`;
}

function cashLinesPathRest(): string {
  return `/rex_${padExpenseFirmNr()}_${padExpensePeriodNr()}_cash_lines`;
}

function cashRegistersPathRest(): string {
  return `/rex_${padExpenseFirmNr()}_cash_registers`;
}

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  document_number?: string;
  /**
   * Firma gider fiş sırası (000001). Belge no değildir.
   * Kasa tutarı, işaret ve kur bu alandan etkilenmez.
   */
  fiche_no?: string | null;
  /**
   * Bağlı kasa fişi. Ekran fiş no değildir; ciro eşlemesi için.
   * Veritabanı kolonu değildir. Güncelleme gövdesine yazılmaz.
   */
  ledger_fiche_no?: string | null;
  document_url?: string;
  store_id: string;
  cost_center_id?: string;
  cost_center_name?: string;
  expense_date: string;
  notes?: string;
  created_by: string;
  /**
   * Rapor birleştirmesi: kasa satırında yazılı kullanıcı adı.
   * Veritabanı kolonu değildir; güncelleme gövdesine yazılmaz.
   */
  entered_by_name?: string;
  /**
   * Bağlı kasa satırından. Veritabanı kolonu değildir.
   * Güncelleme gövdesine yazılmaz.
   */
  currency_code?: string | null;
  exchange_rate?: number | null;
  firm_nr: string;
  cash_line_id?: string;
  cash_register_id?: string;
  /**
   * Girilen tutarın para birimi. Kolon değildir; kayıt kasa biriminde saklanır.
   */
  amount_currency?: string | null;
  /**
   * Girilen→kasa belge kuru (Hatwan). Kolon değildir; kasa satırına yazılır.
   */
  entered_to_register_rate?: number | null;
  created_at?: string;
}

function emptyUuidToNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

function emptyTextToNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function buildExpenseInsertBody(
  expense: Omit<Expense, 'id' | 'firm_nr' | 'created_at'>,
  firmNr: string
): Record<string, unknown> {
  return {
    category: expense.category,
    description: expense.description,
    amount: expense.amount,
    payment_method: expense.payment_method,
    document_number: emptyTextToNull(expense.document_number),
    fiche_no: emptyTextToNull(expense.fiche_no),
    document_url: emptyTextToNull(expense.document_url),
    store_id: emptyUuidToNull(expense.store_id),
    cost_center_id: emptyUuidToNull(expense.cost_center_id),
    expense_date: expense.expense_date,
    notes: emptyTextToNull(expense.notes),
    created_by: emptyUuidToNull(expense.created_by),
    firm_nr: firmNr,
    cash_register_id: emptyUuidToNull(expense.cash_register_id),
  };
}

export class ExpenseSaveError extends Error {
  constructor(
    message: string,
    readonly expenseSaved = false
  ) {
    super(message);
    this.name = 'ExpenseSaveError';
  }
}

/**
 * PostgREST şema önbelleği `fiche_no` kolonunu henüz görmüyor.
 * Kasa satırı hatası burada değildir; ikinci kasa satırı açılmaz.
 */
export function isExpenseFicheSchemaCacheMiss(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? error ?? '');
  if (!/PGRST204/i.test(msg) || !/fiche_no/i.test(msg)) return false;
  if (/cash_lines/i.test(msg)) return false;
  return /schema cache/i.test(msg) || /could not find the/i.test(msg);
}

/**
 * Kolon hazır olduktan sonra şema yenilenir, sonra aynı gövde yazılır.
 * İlk POST hâlâ PGRST204 dönerse bir kez daha yenilenir ve aynı fiş no ile tekrarlanır.
 * Fiş no gövdeden düşmez. Bu fonksiyon kasa satırı yazmaz.
 */
export async function postExpenseWithFicheSchemaRetry<T>(args: {
  body: Record<string, unknown>;
  post: (body: Record<string, unknown>) => Promise<T>;
  reloadSchema: () => Promise<void>;
  wait?: (ms: number) => Promise<void>;
}): Promise<T> {
  const payload = { ...args.body };
  const wait = args.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  await args.reloadSchema();
  try {
    return await args.post(payload);
  } catch (error) {
    if (!isExpenseFicheSchemaCacheMiss(error)) throw error;
    await args.reloadSchema();
    await wait(350);
    return await args.post(payload);
  }
}

async function reloadExpensePostgrestSchema(): Promise<void> {
  const firmNr = padExpenseFirmNr();
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    try {
      const { postgrest } = await import('./postgrestClient');
      await postgrest.post(
        '/rpc/ensure_firm_expense_tables',
        { p_firm_nr: firmNr },
        { schema: 'public', prefer: 'return=minimal' },
      );
    } catch (err) {
      console.warn('[ExpenseAPI] PostgREST şema yenileme:', err);
    }
    return;
  }
  try {
    await postgres.query(`NOTIFY pgrst, 'reload schema'`);
  } catch (err) {
    console.warn('[ExpenseAPI] PostgREST şema yenileme:', err);
  }
}

type ExpenseCashLineSnap = {
  registerId: string;
  amount: number;
  currency: string;
  exchangeRate: number | null;
};

type ExpenseCashPlan = {
  updates: Partial<Expense>;
  deltas: Array<{ registerId: string; delta: number }>;
  lineId: string | null;
  linePatch: {
    amount: number;
    fAmount: number | null;
    exchangeRate: number | null;
    currencyCode: string | null;
    registerId: string;
    writeFx: boolean;
  } | null;
};

async function readExpenseCashLine(cashLineId: string): Promise<ExpenseCashLineSnap | null> {
  const id = String(cashLineId || '').trim();
  if (!id) return null;
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const rows = await postgrest.get<any[]>(
      cashLinesPathRest(),
      { select: 'register_id,amount,currency_code,exchange_rate', id: `eq.${id}`, limit: 1 },
      { schema: 'public' },
    );
    const line = Array.isArray(rows) ? rows[0] : null;
    if (!line) return null;
    return {
      registerId: String(line.register_id || '').trim(),
      amount: Math.abs(Number(line.amount) || 0),
      currency: normalizeFxCurrency(line.currency_code),
      exchangeRate: line.exchange_rate != null ? Number(line.exchange_rate) : null,
    };
  }
  const { rows } = await postgres.query(
    `SELECT register_id, amount, currency_code, exchange_rate
       FROM cash_lines
      WHERE id = $1::text::uuid
      LIMIT 1`,
    [id],
  );
  const line = rows?.[0];
  if (!line) return null;
  return {
    registerId: String(line.register_id || '').trim(),
    amount: Math.abs(Number(line.amount) || 0),
    currency: normalizeFxCurrency(line.currency_code),
    exchangeRate: line.exchange_rate != null ? Number(line.exchange_rate) : null,
  };
}

async function prepareExpenseCashPlan(
  existing: Expense,
  updates: Partial<Expense>,
): Promise<ExpenseCashPlan> {
  const next: Partial<Expense> = { ...updates };
  delete next.amount_currency;
  const enteredToRegisterRateOverride = Number(updates.entered_to_register_rate);
  delete next.entered_to_register_rate;

  const cashLineId = String(existing.cash_line_id || '').trim();
  if (!cashLineId) {
    return { updates: next, deltas: [], lineId: null, linePatch: null };
  }

  await assertPeriodOpen(
    ERP_SETTINGS.firmNr,
    ERP_SETTINGS.periodNr,
    String(next.expense_date || existing.expense_date || new Date().toISOString()),
  );

  const line = await readExpenseCashLine(cashLineId);
  if (!line) {
    return { updates: next, deltas: [], lineId: null, linePatch: null };
  }

  const enteredAmount = next.amount != null
    ? Math.abs(parseExpenseAmount(next.amount))
    : Math.abs(Number(existing.amount) || 0);
  const enteredCurrency = normalizeFxCurrency(updates.amount_currency);
  const requestedRegister = String(
    (next.cash_register_id ?? existing.cash_register_id) || '',
  ).trim();
  const oldRegisterId = line.registerId || String(existing.cash_register_id || '').trim();
  const newRegisterId = requestedRegister || oldRegisterId;
  const registerChanged = Boolean(newRegisterId) && newRegisterId !== oldRegisterId;
  const asOf = String(next.expense_date || existing.expense_date || '').slice(0, 10);

  let storedAmount = enteredAmount;
  let writeFx = false;
  let exchangeRate: number | null = line.exchangeRate;
  let currencyCode: string | null = line.currency || null;
  let fAmount: number | null = null;
  const books = await loadBookCurrencies();

  const rateOverride =
    Number.isFinite(enteredToRegisterRateOverride) && enteredToRegisterRateOverride > 0
      ? enteredToRegisterRateOverride
      : null;

  if (registerChanged && newRegisterId) {
    const fx = await resolveExpenseCashPosting({
      registerId: newRegisterId,
      enteredAmount,
      enteredCurrency: enteredCurrency || undefined,
      asOfDate: asOf,
      enteredToRegisterRate: rateOverride,
    });
    storedAmount = fx.cashAmount;
    writeFx = true;
    exchangeRate = fx.exchangeRate;
    currencyCode = fx.cashCurrency;
    fAmount = fx.baseAmount;
  } else if (
    enteredCurrency
    && line.currency
    && enteredCurrency !== line.currency
    && newRegisterId
  ) {
    const converted = await convertExpenseEnteredToRegister({
      registerId: newRegisterId,
      enteredAmount,
      enteredCurrency,
      asOfDate: asOf,
      enteredToRegisterRate: rateOverride,
    });
    storedAmount = converted.registerAmount;
    fAmount = expenseFAmountOnUpdate({
      newAmount: storedAmount,
      currency: line.currency,
      exchangeRate: line.exchangeRate,
      baseCurrency: books.baseCurrency,
    });
  } else {
    fAmount = expenseFAmountOnUpdate({
      newAmount: storedAmount,
      currency: line.currency,
      exchangeRate: line.exchangeRate,
      baseCurrency: books.baseCurrency,
    });
  }

  next.amount = storedAmount;
  if (newRegisterId) next.cash_register_id = newRegisterId;

  return {
    updates: next,
    deltas: expenseCashOutDeltas(oldRegisterId, newRegisterId, line.amount, storedAmount),
    lineId: cashLineId,
    linePatch: {
      amount: storedAmount,
      fAmount,
      exchangeRate,
      currencyCode,
      registerId: newRegisterId,
      writeFx,
    },
  };
}

async function applyExpenseRegisterDeltas(
  deltas: Array<{ registerId: string; delta: number }>,
): Promise<void> {
  for (const step of deltas) {
    if (!step.registerId || !Number.isFinite(step.delta) || step.delta === 0) continue;
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const regRows = await postgrest.get<any[]>(
        cashRegistersPathRest(),
        { select: 'balance', id: `eq.${step.registerId}`, limit: 1 },
        { schema: 'public' },
      );
      const row = Array.isArray(regRows) ? regRows[0] : null;
      const balance = Number(row?.balance ?? 0);
      await postgrest.patch(
        `${cashRegistersPathRest()}?id=eq.${encodeURIComponent(step.registerId)}`,
        { balance: balance + step.delta },
        { schema: 'public', prefer: 'return=minimal' },
      );
      continue;
    }
    await postgres.query(
      `UPDATE cash_registers
          SET balance = balance + $1::text::numeric
        WHERE id = $2::text::uuid`,
      [step.delta, step.registerId],
    );
  }
}

async function applyExpenseCashLinePatch(
  plan: ExpenseCashPlan,
  expenseDate: string,
  definition: string,
): Promise<void> {
  if (!plan.lineId || !plan.linePatch) return;
  await applyExpenseRegisterDeltas(plan.deltas);
  const patch = plan.linePatch;
  const text = definition || 'Gider';
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const body: Record<string, unknown> = {
      amount: patch.amount,
      f_amount: patch.fAmount,
      date: expenseDate,
      definition: text,
    };
    if (patch.writeFx) {
      body.exchange_rate = patch.exchangeRate;
      body.currency_code = patch.currencyCode;
      body.register_id = patch.registerId;
    }
    await postgrest.patch(
      `${cashLinesPathRest()}?id=eq.${encodeURIComponent(plan.lineId)}`,
      body,
      { schema: 'public', prefer: 'return=minimal' },
    );
    return;
  }
  if (patch.writeFx) {
    await postgres.query(
      `UPDATE cash_lines
          SET amount = $1::text::numeric,
              f_amount = $2::text::numeric,
              date = $3::text::date,
              definition = $4::text,
              exchange_rate = $5::text::numeric,
              currency_code = $6::text,
              register_id = $7::text::uuid
        WHERE id = $8::text::uuid`,
      [
        patch.amount,
        patch.fAmount,
        expenseDate,
        text,
        patch.exchangeRate,
        patch.currencyCode,
        patch.registerId,
        plan.lineId,
      ],
    );
    return;
  }
  await postgres.query(
    `UPDATE cash_lines
        SET amount = $1::text::numeric,
            f_amount = $2::text::numeric,
            date = $3::text::date,
            definition = $4::text
      WHERE id = $5::text::uuid`,
    [patch.amount, patch.fAmount, expenseDate, text, plan.lineId],
  );
}

async function mergeExpenseCashCurrency(rows: Expense[]): Promise<Expense[]> {
  const ids = [...new Set(rows.map((row) => String(row.cash_line_id || '').trim()).filter(Boolean))];
  if (!ids.length) return rows;
  const byId = new Map<string, { currency_code?: string | null; exchange_rate?: number | null }>();
  try {
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      for (let i = 0; i < ids.length; i += 80) {
        const part = ids.slice(i, i + 80);
        const loaded = await postgrest.get<any[]>(
          cashLinesPathRest(),
          {
            select: 'id,currency_code,exchange_rate',
            id: `in.(${part.join(',')})`,
            limit: String(part.length),
          },
          { schema: 'public' },
        );
        for (const line of Array.isArray(loaded) ? loaded : []) {
          byId.set(String(line.id), line);
        }
      }
    } else {
      const { rows: lines } = await postgres.query(
        `SELECT id::text AS id, currency_code, exchange_rate
           FROM cash_lines
          WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      for (const line of lines || []) {
        byId.set(String(line.id), line);
      }
    }
  } catch (error) {
    console.warn('[ExpenseAPI] kasa para birimi okunamadı; eski gider satırları duruyor:', error);
    return rows;
  }
  if (!byId.size) return rows;
  return rows.map((row) => {
    const line = byId.get(String(row.cash_line_id || ''));
    if (!line) return row;
    return {
      ...row,
      currency_code: line.currency_code ?? row.currency_code ?? null,
      exchange_rate: line.exchange_rate != null ? Number(line.exchange_rate) : row.exchange_rate ?? null,
    };
  });
}

function formatExpenseApiError(error: unknown): Error {
  if (error instanceof ExpenseSaveError) return error;
  const raw = (error as Error)?.message || String(error);
  if (raw.includes('invalid input syntax for type uuid')) {
    return new Error('Kayıt alanlarında geçersiz kimlik (UUID). Sayfayı Ctrl+F5 ile yenileyip tekrar deneyin.');
  }
  if (raw.includes('PGRST205') || raw.includes('Could not find the table')) {
    return new Error('Gider tablosu henüz oluşturulmamış. Lütfen sistem yöneticinize başvurun (migration 078).');
  }
  return error instanceof Error ? error : new Error(raw);
}

export const expenseAPI = {
  /**
   * Ensure table exists
   */
  async ensureTableExists(): Promise<void> {
    const firmNr = padExpenseFirmNr();
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      try {
        const { postgrest } = await import('./postgrestClient');
        await postgrest.post(
          '/rpc/ensure_firm_expense_tables',
          { p_firm_nr: firmNr },
          { schema: 'public', prefer: 'return=minimal' }
        );
      } catch (err) {
        console.warn('[ExpenseAPI] ensure_firm_expense_tables RPC:', err);
      }
      await reloadExpensePostgrestSchema();
      return;
    }
    const tableName = expenseTableName();
    let ensured = false;
    try {
      await postgres.query('SELECT public.ensure_firm_expense_tables($1)', [firmNr]);
      ensured = true;
    } catch {
      /* migration 078 öncesi — legacy CREATE */
    }
    if (!ensured) {
      await postgres.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          category VARCHAR(50) NOT NULL,
          description TEXT NOT NULL,
          amount DECIMAL(18,2) NOT NULL,
          payment_method VARCHAR(50) NOT NULL,
          document_number VARCHAR(100),
          document_url TEXT,
          store_id UUID,
          cost_center_id UUID,
          expense_date DATE NOT NULL,
          notes TEXT,
          created_by UUID,
          firm_nr VARCHAR(10) NOT NULL,
          cash_line_id UUID,
          cash_register_id UUID,
          fiche_no VARCHAR(20),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await postgres.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS cash_line_id UUID`);
      await postgres.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS cash_register_id UUID`);
    }
    await postgres.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS fiche_no VARCHAR(20)`);
    try {
      await postgres.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${tableName}_fiche_no_uidx
         ON ${tableName} (firm_nr, fiche_no)
         WHERE fiche_no IS NOT NULL AND btrim(fiche_no) <> ''`,
      );
    } catch (indexErr) {
      console.warn('[ExpenseAPI] fiş no indeksi:', indexErr);
    }
    await reloadExpensePostgrestSchema();
  },

  /**
   * Bu firmanın sonraki gider fiş no’su. Kayıt yoksa 000001.
   * Numarasız eski satırlar yeniden numaralanmaz.
   */
  async peekNextFicheNo(): Promise<string> {
    try {
      await this.ensureTableExists();
      const firmNr = padExpenseFirmNr();
      const tableName = expenseTableName();
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        let rows: Array<{ fiche_no?: string | null }> = [];
        try {
          const loaded = await postgrest.get<Array<{ fiche_no?: string | null }>>(
            expenseTablePath(),
            { select: 'fiche_no', firm_nr: `eq.${firmNr}`, limit: '20000' },
            { schema: 'public' },
          );
          rows = Array.isArray(loaded) ? loaded : [];
        } catch (err) {
          if (!isExpenseFicheSchemaCacheMiss(err)) {
            rows = [];
          } else {
            await reloadExpensePostgrestSchema();
            const loaded = await postgrest
              .get<Array<{ fiche_no?: string | null }>>(
                expenseTablePath(),
                { select: 'fiche_no', firm_nr: `eq.${firmNr}`, limit: '20000' },
                { schema: 'public' },
              )
              .catch(() => [] as Array<{ fiche_no?: string | null }>);
            rows = Array.isArray(loaded) ? loaded : [];
          }
        }
        return nextExpenseFicheNo(rows);
      }
      const { rows } = await postgres.query(
        `SELECT fiche_no FROM ${tableName} WHERE firm_nr = $1 AND fiche_no IS NOT NULL`,
        [firmNr],
      );
      return nextExpenseFicheNo(rows || []);
    } catch (error) {
      console.warn('[ExpenseAPI] fiş no okunamadı:', error);
      return nextExpenseFicheNo([]);
    }
  },

  /**
   * Get all expenses with joined cost center names
   */
  async getAll(filters?: { startDate?: string; endDate?: string }): Promise<Expense[]> {
    try {
      await this.ensureTableExists();
      const expTable = expenseTableName();
      const ccTable = costCentersTableName();
      const firmNr = padExpenseFirmNr();

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const start = filters?.startDate ? String(filters.startDate).slice(0, 10) : '';
        const end = filters?.endDate ? String(filters.endDate).slice(0, 10) : '';
        const q: Record<string, string> = {
          select: '*',
          firm_nr: `eq.${firmNr}`,
          order: 'expense_date.desc',
          limit: '2000',
        };
        if (start && end) {
          q.and = `(expense_date.gte.${start},expense_date.lte.${end})`;
        } else if (start) {
          q.expense_date = `gte.${start}`;
        } else if (end) {
          q.expense_date = `lte.${end}`;
        }
        const expRows = await postgrest
          .get<any[]>(`/${expTable}`, q, { schema: 'public' })
          .catch(() => [] as any[]);
        const list = Array.isArray(expRows) ? expRows : [];
        const ccRows = await postgrest
          .get<any[]>(`/${ccTable}`, { select: 'id,name', firm_nr: `eq.${firmNr}` }, { schema: 'public' })
          .catch(() => [] as any[]);
        const ccMap = new Map<string, string>();
        (Array.isArray(ccRows) ? ccRows : []).forEach((c) => ccMap.set(String(c.id), String(c.name || '')));
        return mergeExpenseCashCurrency(list.map((e) => ({
          ...e,
          amount: Number(e.amount) || 0,
          cost_center_name: e.cost_center_id ? ccMap.get(String(e.cost_center_id)) : undefined,
        })));
      }

      let sql = `
        SELECT e.*, cc.name as cost_center_name 
        FROM ${expTable} e
        LEFT JOIN ${ccTable} cc ON e.cost_center_id = cc.id
        WHERE e.firm_nr = $1
      `;
      const params: any[] = [firmNr];

      if (filters?.startDate) {
        sql += ` AND e.expense_date >= $${params.length + 1}`;
        params.push(filters.startDate);
      }
      if (filters?.endDate) {
        sql += ` AND e.expense_date <= $${params.length + 1}`;
        params.push(filters.endDate);
      }

      sql += ` ORDER BY e.expense_date DESC`;

      const { rows } = await postgres.query(sql, params);
      return mergeExpenseCashCurrency(rows.map((e: Expense) => ({
        ...e,
        amount: Number(e.amount) || 0,
      })));
    } catch (error) {
      console.error('[ExpenseAPI] getAll failed:', error);
      return [];
    }
  },

  /**
   * Create new expense
   */
  async create(
    expense: Omit<Expense, 'id' | 'firm_nr' | 'created_at'>,
    attempt = 0,
  ): Promise<Expense | null> {
    try {
      await this.ensureTableExists();
      const tableName = expenseTableName();
      const firmNr = padExpenseFirmNr();
      const payMethod = String(expense.payment_method || '').trim().toLowerCase();
      const isCashExpense = payMethod === 'cash' || payMethod === 'nakit';
      const expenseAmount = Math.abs(parseExpenseAmount(expense.amount));
      if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) {
        throw new Error('Geçersiz gider tutarı');
      }
      const actor = resolveCashLineActorWrite({ createdByUserId: expense.created_by });
      const ficheNo = await this.peekNextFicheNo();
      expense = {
        ...expense,
        amount: expenseAmount,
        fiche_no: ficheNo,
        created_by: actor.createdByUserId || String(expense.created_by || '').trim(),
      };

      let preparedFx: Awaited<ReturnType<typeof resolveExpenseCashPosting>> | null = null;
      if (isCashExpense) {
        await assertPeriodOpen(
          ERP_SETTINGS.firmNr,
          ERP_SETTINGS.periodNr,
          expense.expense_date || new Date().toISOString(),
        );
        const preferredRegisterId = String(expense.cash_register_id || '').trim();
        if (preferredRegisterId) {
          preparedFx = await resolveExpenseCashPosting({
            registerId: preferredRegisterId,
            enteredAmount: expense.amount,
            enteredCurrency: expense.amount_currency,
            asOfDate: expense.expense_date,
            enteredToRegisterRate: expense.entered_to_register_rate,
          });
          expense = {
            ...expense,
            amount: preparedFx.cashAmount,
            cash_register_id: preferredRegisterId,
          };
        }
      }

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const fn = padExpenseFirmNr();
        const { postgrest } = await import('./postgrestClient');
        const path = expenseTablePath();
        const body = buildExpenseInsertBody(expense, firmNr);
        const rows = await postExpenseWithFicheSchemaRetry({
          body,
          reloadSchema: reloadExpensePostgrestSchema,
          post: (payload) => postgrest.post<any[]>(path, payload, {
            schema: 'public',
            prefer: 'return=representation',
          }),
        });
        let inserted = (Array.isArray(rows) ? rows[0] : rows) as Expense | undefined;
        if (!inserted?.id) {
          throw new Error('Gider kaydı oluşturulamadı');
        }

        if (isCashExpense) {
          try {
            const preferredRegisterId = String(expense.cash_register_id || '').trim();
            let kasaId = preferredRegisterId;
            let fx = preparedFx;
            if (!fx) {
              if (preferredRegisterId) {
                throw new ExpenseSaveError(
                  'Gider kaydedildi; seçilen kasa hareketi oluşturulamadı.',
                  true,
                );
              }
              const kasaPath = `/rex_${fn}_cash_registers`;
              const regList = await postgrest
                .get<any[]>(
                  kasaPath,
                  {
                    select: 'id,code,currency_code',
                    is_active: 'eq.true',
                    limit: 50,
                    order: 'created_at.asc',
                  },
                  { schema: 'public' }
                )
                .catch(() => [] as any[]);
              const regs = Array.isArray(regList) ? regList : [];
              const kasa =
                regs.find((r) => String(r.code || '').toUpperCase().includes('ANA')) ||
                regs[0];
              if (!kasa?.id) {
                throw new ExpenseSaveError(
                  'Gider kaydedildi; nakit kasa hareketi oluşturulamadı (aktif kasa yok).',
                  true
                );
              }
              kasaId = String(kasa.id);
              fx = await resolveExpenseCashPosting({
                registerId: kasaId,
                enteredAmount: expense.amount,
                enteredCurrency: expense.amount_currency,
                asOfDate: expense.expense_date,
                enteredToRegisterRate: expense.entered_to_register_rate,
              });
            }
            const kasaIslem = await createKasaIslemi({
              firma_id: String(ERP_SETTINGS.firmNr),
              kasa_id: kasaId,
              islem_tarihi: expense.expense_date,
              tutar: fx.cashAmount,
              islem_aciklamasi: expense.description || 'Gider',
              islem_tipi: 'GIDER_PUSULASI',
              doviz_kodu: fx.cashCurrency,
              dovizli_tutar: fx.baseAmount ?? undefined,
              exchange_rate: fx.exchangeRate ?? undefined,
              fx_rate_absent: fx.baseAmount == null,
              ozel_kod: expense.category || '',
              skipExpenseMirror: true,
              ...(actor.cashier ? { cashier: actor.cashier } : {}),
              ...(actor.createdByUserId ? { created_by_user_id: actor.createdByUserId, created_by: actor.createdByUserId } : {}),
            });

            const linked = await postgrest.patch<any[]>(
              `${path}?id=eq.${encodeURIComponent(String(inserted.id))}&firm_nr=eq.${encodeURIComponent(firmNr)}`,
              { cash_line_id: kasaIslem.id, cash_register_id: kasaId, amount: fx.cashAmount },
              { schema: 'public', prefer: 'return=representation' }
            );
            inserted = (Array.isArray(linked) ? linked[0] : linked) as Expense;
          } catch (cashErr) {
            if (cashErr instanceof ExpenseSaveError) throw cashErr;
            console.warn('[ExpenseAPI] Nakit kasa bağlantısı başarısız; gider kaydı korunuyor:', cashErr);
            throw new ExpenseSaveError(
              `Gider kaydedildi; kasa hareketi tamamlanamadı: ${(cashErr as Error)?.message || String(cashErr)}`,
              true
            );
          }
        }
        return inserted ?? null;
      }

      await postgres.query('BEGIN');

      const { rows } = await postgres.query(
        `INSERT INTO ${tableName} (
          category, description, amount, payment_method, 
          document_number, document_url, store_id, cost_center_id, 
          expense_date, notes, created_by, firm_nr, cash_register_id, fiche_no
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::text::uuid, $14) RETURNING *`,
        [
          expense.category,
          expense.description,
          expense.amount,
          expense.payment_method,
          expense.document_number || '',
          expense.document_url || '',
          expense.store_id || null,
          expense.cost_center_id || null,
          expense.expense_date,
          expense.notes || '',
          expense.created_by || null,
          firmNr,
          expense.cash_register_id || null,
          expense.fiche_no || null,
        ]
      );

      const insertedExpense = rows[0];
      if (!insertedExpense) {
        throw new Error('Gider kaydı oluşturulamadı');
      }

      if (isCashExpense) {
        try {
          const preferredRegisterId = String(expense.cash_register_id || '').trim();
          let kasaId = preferredRegisterId;
          let fx = preparedFx;
          if (!fx) {
            if (preferredRegisterId) {
              await postgres.query('COMMIT');
              throw new ExpenseSaveError(
                'Gider kaydedildi; seçilen kasa hareketi oluşturulamadı.',
                true,
              );
            }
            const { rows: kasaRows } = await postgres.query(
              `SELECT id, code, currency_code
                 FROM cash_registers
                WHERE is_active = true
                ORDER BY
                  CASE WHEN UPPER(COALESCE(code, '')) LIKE '%ANA%' THEN 0 ELSE 1 END,
                  created_at ASC
                LIMIT 1`,
            );
            const kasa = kasaRows[0];
            if (!kasa?.id) {
              await postgres.query('COMMIT');
              throw new ExpenseSaveError(
                'Gider kaydedildi; nakit kasa hareketi oluşturulamadı (aktif kasa yok).',
                true
              );
            }
            kasaId = String(kasa.id);
            fx = await resolveExpenseCashPosting({
              registerId: kasaId,
              enteredAmount: expense.amount,
              enteredCurrency: expense.amount_currency,
              asOfDate: expense.expense_date,
              enteredToRegisterRate: expense.entered_to_register_rate,
            });
          }

          const writeActor = await ensureCashLineActorColumns();
          const actor = resolveCashLineActorWrite({ createdByUserId: expense.created_by });
          const ficheNo = `EXP-${ERP_SETTINGS.firmNr}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          const { rows: lineRows } = await postgres.query(
            `INSERT INTO cash_lines (
               firm_nr, period_nr, register_id, fiche_no, date, amount, sign, definition, transaction_type,
               currency_code, exchange_rate, f_amount, transfer_status, special_code, tax_rate, withholding_tax_rate
               ${writeActor ? ', cashier, created_by_user_id' : ''}
             ) VALUES (
               $1::text, $2::text, $3::text::uuid, $4::text, $5::text::date, $6::text::numeric, -1,
               $7::text, 'GIDER_PUSULASI', $8::text, $9::text::numeric, $10::text::numeric, 0, $11::text, 0, 0
               ${writeActor ? ', $12::text, $13::text::uuid' : ''}
             ) RETURNING id`,
            [
              firmNr,
              padExpensePeriodNr(),
              kasaId,
              ficheNo,
              expense.expense_date,
              fx.cashAmount,
              expense.description || 'Gider',
              fx.cashCurrency,
              fx.exchangeRate,
              fx.baseAmount,
              expense.category || '',
              ...(writeActor ? [actor.cashier || null, actor.createdByUserId || null] : []),
            ]
          );
          const cashLineId = lineRows[0]?.id;
          if (!cashLineId) {
            await postgres.query('COMMIT');
            throw new ExpenseSaveError('Gider kaydedildi; kasa gider satırı oluşturulamadı.', true);
          }

          await postgres.query(
            `UPDATE cash_registers
             SET balance = balance + $1::text::numeric
             WHERE id = $2::text::uuid`,
            [fx.balanceDelta, kasaId]
          );

          const { rows: linkedRows } = await postgres.query(
            `UPDATE ${tableName}
             SET cash_line_id = $1::text::uuid,
                 cash_register_id = $2::text::uuid,
                 amount = $4::text::numeric
             WHERE id = $3::text::uuid
             RETURNING *`,
            [cashLineId, kasaId, insertedExpense.id, fx.cashAmount]
          );

          await postgres.query('COMMIT');
          return linkedRows[0] || insertedExpense;
        } catch (cashErr) {
          if (cashErr instanceof ExpenseSaveError) throw cashErr;
          try {
            await postgres.query('COMMIT');
          } catch {
            /* expense may already be committed */
          }
          console.warn('[ExpenseAPI] Nakit kasa bağlantısı başarısız; gider kaydı korunuyor:', cashErr);
          throw new ExpenseSaveError(
            `Gider kaydedildi; kasa hareketi tamamlanamadı: ${(cashErr as Error)?.message || String(cashErr)}`,
            true
          );
        }
      }

      await postgres.query('COMMIT');
      return insertedExpense;
    } catch (error) {
      console.error('[ExpenseAPI] create failed:', error);
      try {
        await postgres.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      if (attempt < 1 && isExpenseFicheConflict(error)) {
        const retrySource = { ...expense };
        delete retrySource.fiche_no;
        return this.create(retrySource, attempt + 1);
      }
      throw formatExpenseApiError(error);
    }
  },

  /**
   * Update expense — bağlı cash_line varsa yerinde güncelle (delta); asla yeni satır üretme.
   */
  async update(id: string, updates: Partial<Expense>): Promise<Expense | null> {
    try {
      await this.ensureTableExists();
      const tableName = expenseTableName();
      const firm = padExpenseFirmNr();

      const uuidFields = new Set(['store_id', 'cost_center_id', 'cash_register_id', 'cash_line_id', 'created_by']);
      const emptyAsNullFields = new Set(['document_number', 'document_url', 'notes']);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      const normalizeUpdateEntry = (key: string, value: unknown): unknown | undefined => {
        if (['id', 'firm_nr', 'created_at', 'cost_center_name', 'entered_by_name', 'currency_code', 'exchange_rate', 'fiche_no', 'ledger_fiche_no', 'amount_currency', 'entered_to_register_rate'].includes(key) || value === undefined) return undefined;
        let normalizedValue = value;
        if (key === 'amount') {
          const n = Math.abs(parseExpenseAmount(value));
          return Number.isFinite(n) ? n : 0;
        }
        if (typeof normalizedValue === 'string') {
          const trimmed = normalizedValue.trim();
          if (uuidFields.has(key)) {
            normalizedValue = trimmed === '' || !uuidPattern.test(trimmed) ? null : trimmed;
          } else if (emptyAsNullFields.has(key)) {
            normalizedValue = trimmed === '' ? null : trimmed;
          } else {
            normalizedValue = trimmed;
          }
        }
        return normalizedValue;
      };

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const ex = await postgrest.get<any[]>(
          expenseTablePath(),
          { select: '*', id: `eq.${id}`, firm_nr: `eq.${firm}`, limit: 1 },
          { schema: 'public' }
        );
        const existing = Array.isArray(ex) ? ex[0] : null;
        if (!existing) return null;

        const plan = await prepareExpenseCashPlan(existing, updates);
        const body: Record<string, unknown> = {};
        Object.entries(plan.updates).forEach(([key, value]) => {
          const nv = normalizeUpdateEntry(key, value);
          if (nv !== undefined) body[key] = nv;
        });
        if (Object.keys(body).length === 0) return null;

        const patched = await postgrest.patch<Expense[]>(
          `${expenseTablePath()}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(firm)}`,
          body,
          { schema: 'public', prefer: 'return=representation' }
        );
        let updated = (Array.isArray(patched) ? patched[0] : patched) as Expense | undefined;
        if (!updated) return null;

        if (plan.linePatch) {
          await applyExpenseCashLinePatch(
            plan,
            String(updated.expense_date || existing.expense_date || ''),
            updated.description || 'Gider',
          );
        }
        return updated;
      }

      const { rows: existingRows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND firm_nr = $2 LIMIT 1`,
        [id, firm]
      );
      const existing = existingRows[0] as Expense | undefined;
      if (!existing) return null;

      const plan = await prepareExpenseCashPlan(existing, updates);
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      Object.entries(plan.updates).forEach(([key, value]) => {
        const nv = normalizeUpdateEntry(key, value);
        if (nv === undefined) return;
        fields.push(`${key} = $${i++}`);
        values.push(nv);
      });

      if (fields.length === 0) return null;

      await postgres.query('BEGIN');

      values.push(id);
      values.push(firm);
      const { rows } = await postgres.query(
        `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = $${i} AND firm_nr = $${i + 1} RETURNING *`,
        values
      );

      const updated = rows[0] as Expense | undefined;
      if (!updated) {
        await postgres.query('ROLLBACK');
        return null;
      }

      if (plan.linePatch) {
        await applyExpenseCashLinePatch(
          plan,
          String(updated.expense_date || existing.expense_date || ''),
          updated.description || 'Gider',
        );
      }

      await postgres.query('COMMIT');
      return updated;
    } catch (error) {
      console.error('[ExpenseAPI] update failed:', error);
      try {
        await postgres.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw error;
    }
  },

  /**
   * Delete expense — cash_line bakiyesini deleteKasaIslemi ile geri al (çift +amount yok).
   */
  async delete(id: string): Promise<boolean> {
    try {
      await this.ensureTableExists();
      const tableName = expenseTableName();
      const firm = padExpenseFirmNr();

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const ex = await postgrest.get<any[]>(
          expenseTablePath(),
          { select: '*', id: `eq.${id}`, firm_nr: `eq.${firm}`, limit: 1 },
          { schema: 'public' }
        );
        const existing = Array.isArray(ex) ? ex[0] : null;
        if (!existing) return false;

        const cashLineId = String(existing.cash_line_id || '').trim();
        if (cashLineId) {
          await assertPeriodOpen(
            ERP_SETTINGS.firmNr,
            ERP_SETTINGS.periodNr,
            existing.expense_date || new Date().toISOString(),
          );
          try {
            // deleteKasaIslemi cash_line tutarı × sign ile bakiyeyi bir kez tersine alır
            // ve bağlı gider aynasını siler. Burada tutar ikinci kez eklenmez.
            await deleteKasaIslemi(cashLineId);
          } catch (cashErr) {
            // Satır yoksa (eski orphan id) yalnızca gider satırını sil — bakiyeye tekrar amount EKLEME.
            console.warn('[ExpenseAPI] delete: cash_line zaten yok veya silinemedi:', cashErr);
          }
        }
        await postgrest.delete(
          `${expenseTablePath()}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(firm)}`,
          { schema: 'public', prefer: 'return=minimal' }
        );
        return true;
      }

      const { rows: existingRows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND firm_nr = $2 LIMIT 1`,
        [id, firm]
      );
      const existing = existingRows[0] as Expense | undefined;
      if (!existing) return false;

      const cashLineId = String(existing.cash_line_id || '').trim();
      let cashCleared = false;
      if (cashLineId) {
        await assertPeriodOpen(
          ERP_SETTINGS.firmNr,
          ERP_SETTINGS.periodNr,
          existing.expense_date || new Date().toISOString(),
        );
        try {
          // Bakiye bir kez geri alınır. Ayna aynı çağrıda silinirse alttaki DELETE 0 satır döner.
          await deleteKasaIslemi(cashLineId);
          cashCleared = true;
        } catch (cashErr) {
          console.warn('[ExpenseAPI] delete: cash_line zaten yok veya silinemedi:', cashErr);
        }
      }

      await postgres.query('BEGIN');
      const { rowCount } = await postgres.query(
        `DELETE FROM ${tableName} WHERE id = $1 AND firm_nr = $2`,
        [id, firm]
      );
      await postgres.query('COMMIT');
      return rowCount > 0 || cashCleared;
    } catch (error) {
      console.error('[ExpenseAPI] delete failed:', error);
      try {
        await postgres.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      const msg = (error as Error)?.message || String(error);
      if (/PERIOD_CLOSED|PERIOD_BEFORE_START|PERIOD_AFTER_END/.test(msg)) throw error;
      return false;
    }
  }
};
