/**
 * Cari bakiye — sales + cash_lines (customer_id veya ünvan eşleşmesi).
 * Müşteri: yalnızca veresiye/açık hesap satışları + iade/devir + CH_*.
 * Tedarikçi: peşin alış hariç alış/iade + CH_*.
 */
import { ERP_SETTINGS } from '../postgres';
import {
  paymentMethodImpliesCustomerDebt,
  paymentMethodImpliesSupplierDebt,
  sqlPaymentMethodImpliesCustomerDebtExpr,
  sqlPaymentMethodImpliesSupplierDebtExpr,
} from '../../utils/paymentMethodUtils';

export function normalizeFirmTableNr(firmNr?: string | number | null): string {
  const d = String(firmNr ?? ERP_SETTINGS.firmNr ?? '001').replace(/\D/g, '');
  if (!d) return '001';
  return d.length <= 3 ? d.padStart(3, '0') : d.slice(0, 10);
}

export function firmCustomersTable(firmNr?: string | number | null): string {
  return `rex_${normalizeFirmTableNr(firmNr)}_customers`;
}

export function firmSuppliersTable(firmNr?: string | number | null): string {
  return `rex_${normalizeFirmTableNr(firmNr)}_suppliers`;
}

const customerDebtPmSql = sqlPaymentMethodImpliesCustomerDebtExpr();
const customerDebtPmSqlS = sqlPaymentMethodImpliesCustomerDebtExpr('s');
const supplierDebtPmSql = sqlPaymentMethodImpliesSupplierDebtExpr();
const supplierDebtPmSqlSl = sqlPaymentMethodImpliesSupplierDebtExpr('sl');

/** Liste/ekstre ile uyumlu müşteri bakiye CTE (postgres.query içinde sales/cash_lines otomatik prefixlenir) */
export function sqlCustomerAccountBalancesCte(custTable: string, firmNrBind: string): string {
  return `
    account_balances AS (
      SELECT id, SUM(line_contrib) AS calculated_balance, COUNT(*)::int AS txn_count
      FROM (
        SELECT customer_id AS id,
          CASE WHEN fiche_type = 'return_invoice' THEN -net_amount ELSE net_amount END AS line_contrib
        FROM sales
        WHERE customer_id IS NOT NULL AND COALESCE(is_cancelled, false) = false
          AND (
            fiche_type IN ('return_invoice', 'opening_balance')
            OR ${customerDebtPmSql}
          )
        UNION ALL
        SELECT c.id,
          CASE WHEN s.fiche_type = 'return_invoice' THEN -s.net_amount ELSE s.net_amount END
        FROM sales s
        INNER JOIN ${custTable} c ON c.firm_nr = ${firmNrBind}
          AND TRIM(LOWER(COALESCE(s.customer_name, ''))) = TRIM(LOWER(c.name))
        WHERE (s.customer_id IS NULL OR s.customer_id::text <> c.id::text)
          AND COALESCE(s.is_cancelled, false) = false
          AND TRIM(COALESCE(s.customer_name, '')) <> ''
          AND (
            s.fiche_type IN ('return_invoice', 'opening_balance')
            OR ${customerDebtPmSqlS}
          )
        UNION ALL
        SELECT customer_id AS id,
          (CASE WHEN UPPER(TRIM(transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT') THEN -ABS(amount) ELSE 0 END) AS line_contrib
        FROM cash_lines
        WHERE customer_id IS NOT NULL
          AND UPPER(TRIM(transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT')
      ) customer_tx
      GROUP BY id
    )`;
}

/** Tedarikçi bakiye CTE — peşin alış hariç alış / alış iade + cari ödeme/tahsilat */
export function sqlSupplierAccountBalancesCte(suppTable: string): string {
  return `
    supplier_balances AS (
      SELECT id, SUM(line_contrib) AS calculated_balance, COUNT(*)::int AS txn_count
      FROM (
        SELECT customer_id AS id,
          CASE
            WHEN fiche_type = 'purchase_invoice' THEN net_amount
            WHEN fiche_type = 'return_invoice' THEN -net_amount
            WHEN fiche_type = 'opening_balance' THEN net_amount
            ELSE 0
          END AS line_contrib
        FROM sales
        WHERE customer_id IS NOT NULL
          AND COALESCE(is_cancelled, false) = false
          AND fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance')
          AND (
            fiche_type IN ('return_invoice', 'opening_balance')
            OR ${supplierDebtPmSql}
          )
        UNION ALL
        SELECT s.id,
          CASE
            WHEN sl.fiche_type = 'purchase_invoice' THEN sl.net_amount
            WHEN sl.fiche_type = 'return_invoice' THEN -sl.net_amount
            WHEN sl.fiche_type = 'opening_balance' THEN sl.net_amount
            ELSE 0
          END AS line_contrib
        FROM sales sl
        INNER JOIN ${suppTable} s ON TRIM(LOWER(COALESCE(sl.customer_name, ''))) = TRIM(LOWER(s.name))
        WHERE (sl.customer_id IS NULL OR sl.customer_id::text <> s.id::text)
          AND COALESCE(sl.is_cancelled, false) = false
          AND TRIM(COALESCE(sl.customer_name, '')) <> ''
          AND sl.fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance')
          AND (
            sl.fiche_type IN ('return_invoice', 'opening_balance')
            OR ${supplierDebtPmSqlSl}
          )
        UNION ALL
        SELECT customer_id AS id,
          (CASE WHEN UPPER(TRIM(transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT') THEN -ABS(amount) ELSE 0 END) AS line_contrib
        FROM cash_lines
        WHERE customer_id IS NOT NULL
          AND UPPER(TRIM(transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT')
      ) supplier_tx
      GROUP BY id
    )`;
}

/** Tedarikçi: bakiye yalnızca defterden; manuel kart bakiyesi kullanılmaz */
export function sqlResolvedSupplierBalanceExpr(_cardAlias = 's'): string {
  return `COALESCE(b.calculated_balance, 0)`;
}

/** Hareket varsa ledger; yoksa 0 (manuel bakiye yalnızca açılış fişi / fatura ile) */
export function sqlResolvedCustomerBalanceExpr(cardAlias = 'c'): string {
  return `CASE
    WHEN b.txn_count > 0 THEN COALESCE(b.calculated_balance, 0)
    ELSE 0
  END`;
}

export type LedgerSaleRow = {
  customer_id?: string | null;
  customer_name?: string | null;
  net_amount?: number | string | null;
  fiche_type?: string | null;
  is_cancelled?: boolean | null;
  payment_method?: string | null;
};

export type LedgerCashRow = {
  customer_id?: string | null;
  amount?: number | string | null;
  transaction_type?: string | null;
};

/**
 * Kasa CH_TAHSILAT / CH_ODEME satırının cari bakiyeye katkısı.
 * Pozitif bakiye: müşteri bize borçlu / tedarikçiye biz borçluyuz.
 * Tahsilat (müşteri alacak) ve ödeme (tedarikçi borç kapanışı) açık bakiyeyi düşürür.
 * Not: Kasa `sign` (+1 tahsilat / -1 ödeme) cari yönü değildir — asla amount*sign kullanma.
 */
export function cariCashLineLedgerContrib(
  amount: number | string | null | undefined,
  transactionType: string | null | undefined,
): number {
  const tt = String(transactionType || '').trim().toUpperCase();
  if (tt !== 'CH_ODEME' && tt !== 'CH_TAHSILAT') return 0;
  const amt = Math.abs(parseFloat(String(amount ?? 0)) || 0);
  if (!amt) return 0;
  return -amt;
}

/** createKasaIslemi / silme — saklanan balance alanına uygulanacak delta */
export function cariCashStoredBalanceDelta(
  amount: number | string | null | undefined,
  transactionType: string | null | undefined,
): number {
  return cariCashLineLedgerContrib(amount, transactionType);
}

export function normalizeAccountName(name: string | null | undefined): string {
  return String(name || '').trim().toLocaleLowerCase('tr-TR');
}

/** Ekstre / bakiye: ünvan eşleşmesi (Türkçe locale) */
export function accountLedgerNameMatch(
  stored: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const a = normalizeAccountName(stored);
  const b = normalizeAccountName(expected);
  return a.length > 0 && b.length > 0 && a === b;
}

function saleCountsTowardCustomerDebt(s: LedgerSaleRow): boolean {
  const ft = String(s.fiche_type || '').toLowerCase();
  if (ft === 'return_invoice' || ft === 'opening_balance') return true;
  return paymentMethodImpliesCustomerDebt(s.payment_method);
}

function saleCountsTowardSupplierDebt(s: LedgerSaleRow): boolean {
  const ft = String(s.fiche_type || '').toLowerCase();
  if (ft === 'return_invoice' || ft === 'opening_balance') return true;
  if (ft !== 'purchase_invoice') return false;
  return paymentMethodImpliesSupplierDebt(s.payment_method);
}

function sumCustomerSalesLedger(
  accountId: string,
  accountName: string,
  sales: LedgerSaleRow[],
): { txnCount: number; sum: number } {
  const idStr = String(accountId || '');
  const nameKey = normalizeAccountName(accountName);
  let txnCount = 0;
  let sum = 0;
  for (const s of sales) {
    if (s.is_cancelled === true || String(s.fiche_type || '').toLowerCase() === 'cancelled') continue;
    if (!saleCountsTowardCustomerDebt(s)) continue;
    const amt = parseFloat(String(s.net_amount ?? 0)) || 0;
    if (!amt) continue;
    const contrib = s.fiche_type === 'return_invoice' ? -amt : amt;
    const cid = s.customer_id ? String(s.customer_id) : '';
    const matchesId = cid && cid === idStr;
    // SQL CTE / ekstre ile aynı: başka (pasif/çift) karta yazılmış aynı ünvan satışları da say
    const matchesName =
      nameKey &&
      normalizeAccountName(s.customer_name) === nameKey &&
      (!cid || cid !== idStr);
    if (!matchesId && !matchesName) continue;
    txnCount += 1;
    sum += contrib;
  }
  return { txnCount, sum };
}

function sumSupplierSalesLedger(
  accountId: string,
  accountName: string,
  sales: LedgerSaleRow[],
): number {
  const idStr = String(accountId || '');
  const nameKey = normalizeAccountName(accountName);
  let sum = 0;
  for (const s of sales) {
    const ft = String(s.fiche_type || '').toLowerCase();
    if (ft !== 'purchase_invoice' && ft !== 'return_invoice' && ft !== 'opening_balance') continue;
    if (s.is_cancelled === true) continue;
    if (!saleCountsTowardSupplierDebt(s)) continue;
    const rawAmt = parseFloat(String(s.net_amount ?? 0)) || 0;
    if (!rawAmt) continue;
    const amt = Math.abs(rawAmt);
    let contrib = 0;
    if (ft === 'opening_balance') {
      contrib = rawAmt;
    } else if (ft === 'purchase_invoice') {
      contrib = amt;
    } else {
      contrib = -amt;
    }
    const cid = s.customer_id ? String(s.customer_id) : '';
    const matchesId = cid && cid === idStr;
    const matchesName =
      nameKey &&
      normalizeAccountName(s.customer_name) === nameKey &&
      (!cid || cid !== idStr);
    if (!matchesId && !matchesName) continue;
    sum += contrib;
  }
  return sum;
}

/** PostgREST: sales + kasa (CH_TAHSILAT/CH_ODEME) defter bakiyesi */
export function computeCustomerBalanceFromLedger(
  accountId: string,
  accountName: string,
  sales: LedgerSaleRow[],
  cashLines: LedgerCashRow[],
  _storedBalance = 0,
): number {
  const idStr = String(accountId || '');
  const { txnCount: salesTxn, sum: salesSum } = sumCustomerSalesLedger(accountId, accountName, sales);
  let cashTxn = 0;
  let cashSum = 0;
  for (const cl of cashLines) {
    const tt = String(cl.transaction_type || '').trim().toUpperCase();
    if (tt !== 'CH_ODEME' && tt !== 'CH_TAHSILAT') continue;
    const cid = cl.customer_id ? String(cl.customer_id) : '';
    if (!cid || cid !== idStr) continue;
    const contrib = cariCashLineLedgerContrib(cl.amount, tt);
    if (!contrib) continue;
    cashTxn += 1;
    cashSum += contrib;
  }
  const txnCount = salesTxn + cashTxn;
  if (txnCount > 0) return salesSum + cashSum;
  return 0;
}

/** PostgREST: tedarikçi defter bakiyesi — alış/iade + kasa hareketleri */
export function computeSupplierBalanceFromLedger(
  accountId: string,
  accountName: string,
  sales: LedgerSaleRow[],
  cashLines: LedgerCashRow[],
  _storedBalance = 0,
): number {
  const idStr = String(accountId || '');
  let sum = sumSupplierSalesLedger(accountId, accountName, sales);
  for (const cl of cashLines) {
    const tt = String(cl.transaction_type || '').trim().toUpperCase();
    if (tt !== 'CH_ODEME' && tt !== 'CH_TAHSILAT') continue;
    const cid = cl.customer_id ? String(cl.customer_id) : '';
    if (!cid || cid !== idStr) continue;
    const contrib = cariCashLineLedgerContrib(cl.amount, tt);
    if (!contrib) continue;
    sum += contrib;
  }
  return sum;
}

/** @deprecated PostgREST için computeCustomerBalanceFromLedger kullanın */
export function computeCustomerBalanceFromSales(
  accountId: string,
  accountName: string,
  sales: LedgerSaleRow[],
  storedBalance = 0,
): number {
  return computeCustomerBalanceFromLedger(accountId, accountName, sales, [], storedBalance);
}

/** @deprecated PostgREST için computeSupplierBalanceFromLedger kullanın */
export function computeSupplierBalanceFromSales(
  accountId: string,
  accountName: string,
  sales: LedgerSaleRow[],
  _storedBalance = 0,
): number {
  return computeSupplierBalanceFromLedger(accountId, accountName, sales, []);
}
