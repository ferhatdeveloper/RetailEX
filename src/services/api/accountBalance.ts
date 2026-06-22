/**
 * Cari bakiye — sales + cash_lines (customer_id veya ünvan eşleşmesi).
 * Müşteri: hareket yoksa saklanan balance yedeği. Tedarikçi: yalnızca alış/iade defteri.
 */
import { ERP_SETTINGS } from '../postgres';

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
        UNION ALL
        SELECT c.id,
          CASE WHEN s.fiche_type = 'return_invoice' THEN -s.net_amount ELSE s.net_amount END
        FROM sales s
        INNER JOIN ${custTable} c ON c.firm_nr = ${firmNrBind}
          AND TRIM(LOWER(COALESCE(s.customer_name, ''))) = TRIM(LOWER(c.name))
        WHERE (s.customer_id IS NULL OR s.customer_id::text <> c.id::text)
          AND COALESCE(s.is_cancelled, false) = false
          AND TRIM(COALESCE(s.customer_name, '')) <> ''
        UNION ALL
        SELECT customer_id AS id, -amount AS line_contrib
        FROM cash_lines
        WHERE customer_id IS NOT NULL
          AND transaction_type IN ('CH_ODEME', 'CH_TAHSILAT')
      ) customer_tx
      GROUP BY id
    )`;
}

/** Tedarikçi bakiye CTE — yalnızca alış / alış iade faturaları + cari ödeme/tahsilat */
export function sqlSupplierAccountBalancesCte(suppTable: string): string {
  return `
    supplier_balances AS (
      SELECT id, SUM(line_contrib) AS calculated_balance, COUNT(*)::int AS txn_count
      FROM (
        SELECT customer_id AS id,
          CASE
            WHEN fiche_type = 'purchase_invoice' THEN net_amount
            WHEN fiche_type = 'return_invoice' THEN -net_amount
            ELSE 0
          END AS line_contrib
        FROM sales
        WHERE customer_id IS NOT NULL
          AND COALESCE(is_cancelled, false) = false
          AND fiche_type IN ('purchase_invoice', 'return_invoice')
        UNION ALL
        SELECT s.id,
          CASE
            WHEN sl.fiche_type = 'purchase_invoice' THEN sl.net_amount
            WHEN sl.fiche_type = 'return_invoice' THEN -sl.net_amount
            ELSE 0
          END AS line_contrib
        FROM sales sl
        INNER JOIN ${suppTable} s ON TRIM(LOWER(COALESCE(sl.customer_name, ''))) = TRIM(LOWER(s.name))
        WHERE (sl.customer_id IS NULL OR sl.customer_id::text <> s.id::text)
          AND COALESCE(sl.is_cancelled, false) = false
          AND TRIM(COALESCE(sl.customer_name, '')) <> ''
          AND sl.fiche_type IN ('purchase_invoice', 'return_invoice')
        UNION ALL
        SELECT customer_id AS id, amount AS line_contrib
        FROM cash_lines
        WHERE customer_id IS NOT NULL
          AND transaction_type IN ('CH_ODEME', 'CH_TAHSILAT')
      ) supplier_tx
      GROUP BY id
    )`;
}

/** Tedarikçi: bakiye yalnızca defterden; manuel kart bakiyesi kullanılmaz */
export function sqlResolvedSupplierBalanceExpr(_cardAlias = 's'): string {
  return `COALESCE(b.calculated_balance, 0)`;
}

/** Hareket varsa ledger; yoksa veresiye/manuel saklanan balance (müşteri) */
export function sqlResolvedCustomerBalanceExpr(cardAlias = 'c'): string {
  return `CASE
    WHEN b.txn_count > 0 THEN COALESCE(b.calculated_balance, 0)
    ELSE COALESCE(${cardAlias}.balance, 0)
  END`;
}

export type LedgerSaleRow = {
  customer_id?: string | null;
  customer_name?: string | null;
  net_amount?: number | string | null;
  fiche_type?: string | null;
};

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

/** PostgREST: sales satırlarından müşteri bakiyesi (id + ünvan) */
export function computeCustomerBalanceFromSales(
  accountId: string,
  accountName: string,
  sales: LedgerSaleRow[],
  storedBalance = 0,
): number {
  const idStr = String(accountId || '');
  const nameKey = normalizeAccountName(accountName);
  let txnCount = 0;
  let sum = 0;
  for (const s of sales) {
    if (s.fiche_type && String(s.fiche_type).toLowerCase() === 'cancelled') continue;
    const amt = parseFloat(String(s.net_amount ?? 0)) || 0;
    if (!amt) continue;
    const contrib = s.fiche_type === 'return_invoice' ? -amt : amt;
    const cid = s.customer_id ? String(s.customer_id) : '';
    const matchesId = cid && cid === idStr;
    const matchesName =
      !cid &&
      nameKey &&
      normalizeAccountName(s.customer_name) === nameKey;
    if (!matchesId && !matchesName) continue;
    txnCount += 1;
    sum += contrib;
  }
  if (txnCount > 0) return sum;
  return Number(storedBalance) || 0;
}

/** PostgREST: tedarikçi bakiyesi — yalnızca alış / alış iade; manuel kart bakiyesi yok */
export function computeSupplierBalanceFromSales(
  accountId: string,
  accountName: string,
  sales: LedgerSaleRow[],
  _storedBalance = 0,
): number {
  const idStr = String(accountId || '');
  const nameKey = normalizeAccountName(accountName);
  let sum = 0;
  for (const s of sales) {
    const ft = String(s.fiche_type || '').toLowerCase();
    if (ft !== 'purchase_invoice' && ft !== 'return_invoice') continue;
    const amt = parseFloat(String(s.net_amount ?? 0)) || 0;
    const contrib = ft === 'purchase_invoice' ? amt : -amt;
    const cid = s.customer_id ? String(s.customer_id) : '';
    const matchesId = cid && cid === idStr;
    const matchesName =
      !cid &&
      nameKey &&
      normalizeAccountName(s.customer_name) === nameKey;
    if (!matchesId && !matchesName) continue;
    sum += contrib;
  }
  return sum;
}
