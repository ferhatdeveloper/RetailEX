/**
 * Web `src/services/api/accountBalance.ts` ledger CTE — mobil bridge açık tablo adları kullanır
 * (`rex_{firm}_{period}_sales` / `cash_lines`). Web postgres.query prefix’i yok.
 *
 * Dönemsel net bakiye = açılış fişi + uygun sales + CH_ODEME/CH_TAHSILAT.
 */
import {
  sqlPaymentMethodImpliesCustomerDebtExpr,
  sqlPaymentMethodImpliesSupplierDebtExpr,
} from './paymentMethodUtils';
import { cashLinesTable, customersTable, salesTable, suppliersTable } from './erpTables';

const customerDebtPmSql = sqlPaymentMethodImpliesCustomerDebtExpr();
const customerDebtPmSqlS = sqlPaymentMethodImpliesCustomerDebtExpr('s');
const supplierDebtPmSql = sqlPaymentMethodImpliesSupplierDebtExpr();
const supplierDebtPmSqlSl = sqlPaymentMethodImpliesSupplierDebtExpr('sl');

/** Müşteri dönem ledger CTE — sales + cash_lines (id veya ünvan) */
export function sqlCustomerAccountBalancesCte(opts: {
  custTable: string;
  salesTable: string;
  cashLinesTable: string;
  /** örn. `$1::text` veya `'001'` */
  firmNrBind: string;
}): string {
  const { custTable, salesTable: sales, cashLinesTable: cash, firmNrBind } = opts;
  return `
    account_balances AS (
      SELECT id, SUM(line_contrib) AS calculated_balance, COUNT(*)::int AS txn_count
      FROM (
        SELECT customer_id AS id,
          CASE WHEN fiche_type = 'return_invoice' THEN -net_amount ELSE net_amount END AS line_contrib
        FROM ${sales}
        WHERE customer_id IS NOT NULL AND COALESCE(is_cancelled, false) = false
          AND (
            fiche_type IN ('return_invoice', 'opening_balance')
            OR ${customerDebtPmSql}
          )
        UNION ALL
        SELECT c.id,
          CASE WHEN s.fiche_type = 'return_invoice' THEN -s.net_amount ELSE s.net_amount END
        FROM ${sales} s
        INNER JOIN ${custTable} c ON TRIM(LOWER(COALESCE(s.customer_name, ''))) = TRIM(LOWER(c.name))
          AND (
            c.firm_nr = ${firmNrBind}
            OR LPAD(TRIM(COALESCE(c.firm_nr, '')), 3, '0') = LPAD(TRIM(${firmNrBind}), 3, '0')
            OR c.firm_nr IS NULL
            OR TRIM(COALESCE(c.firm_nr, '')) = ''
          )
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
        FROM ${cash}
        WHERE customer_id IS NOT NULL
          AND UPPER(TRIM(transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT')
      ) customer_tx
      GROUP BY id
    )`;
}

/** Tedarikçi dönem ledger CTE — peşin alış hariç */
export function sqlSupplierAccountBalancesCte(opts: {
  suppTable: string;
  salesTable: string;
  cashLinesTable: string;
}): string {
  const { suppTable, salesTable: sales, cashLinesTable: cash } = opts;
  return `
    supplier_balances AS (
      SELECT id, SUM(line_contrib) AS calculated_balance, COUNT(*)::int AS txn_count
      FROM (
        SELECT customer_id AS id,
          CASE
            WHEN COALESCE(trcode, 0) = 6 THEN -ABS(net_amount)
            WHEN fiche_type = 'purchase_invoice' THEN net_amount
            WHEN fiche_type = 'return_invoice' THEN -net_amount
            WHEN fiche_type = 'opening_balance' THEN net_amount
            ELSE 0
          END AS line_contrib
        FROM ${sales}
        WHERE customer_id IS NOT NULL
          AND COALESCE(is_cancelled, false) = false
          AND (
            fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance')
            OR COALESCE(trcode, 0) = 6
          )
          AND (
            fiche_type IN ('return_invoice', 'opening_balance')
            OR COALESCE(trcode, 0) = 6
            OR ${supplierDebtPmSql}
          )
        UNION ALL
        SELECT s.id,
          CASE
            WHEN COALESCE(sl.trcode, 0) = 6 THEN -ABS(sl.net_amount)
            WHEN sl.fiche_type = 'purchase_invoice' THEN sl.net_amount
            WHEN sl.fiche_type = 'return_invoice' THEN -sl.net_amount
            WHEN sl.fiche_type = 'opening_balance' THEN sl.net_amount
            ELSE 0
          END AS line_contrib
        FROM ${sales} sl
        INNER JOIN ${suppTable} s ON TRIM(LOWER(COALESCE(sl.customer_name, ''))) = TRIM(LOWER(s.name))
        WHERE (sl.customer_id IS NULL OR sl.customer_id::text <> s.id::text)
          AND COALESCE(sl.is_cancelled, false) = false
          AND TRIM(COALESCE(sl.customer_name, '')) <> ''
          AND (
            sl.fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance')
            OR COALESCE(sl.trcode, 0) = 6
          )
          AND (
            sl.fiche_type IN ('return_invoice', 'opening_balance')
            OR COALESCE(sl.trcode, 0) = 6
            OR ${supplierDebtPmSqlSl}
          )
        UNION ALL
        SELECT customer_id AS id,
          (CASE WHEN UPPER(TRIM(transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT') THEN -ABS(amount) ELSE 0 END) AS line_contrib
        FROM ${cash}
        WHERE customer_id IS NOT NULL
          AND UPPER(TRIM(transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT')
      ) supplier_tx
      GROUP BY id
    )`;
}

/** Hareket varsa ledger; yoksa 0 */
export function sqlResolvedCustomerBalanceExpr(): string {
  return `CASE
    WHEN b.txn_count > 0 THEN COALESCE(b.calculated_balance, 0)
    ELSE 0
  END`;
}

export function sqlResolvedSupplierBalanceExpr(): string {
  return `COALESCE(b.calculated_balance, 0)`;
}

/** Aktif oturum tablo adlarıyla müşteri CTE */
export function customerBalancesCteForSession(firmNrBind: string): string {
  return sqlCustomerAccountBalancesCte({
    custTable: customersTable(),
    salesTable: salesTable(),
    cashLinesTable: cashLinesTable(),
    firmNrBind,
  });
}

export function supplierBalancesCteForSession(): string {
  return sqlSupplierAccountBalancesCte({
    suppTable: suppliersTable(),
    salesTable: salesTable(),
    cashLinesTable: cashLinesTable(),
  });
}
