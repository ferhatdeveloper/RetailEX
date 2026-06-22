/**
 * Cari bakiye tutarlılığı: iptal faturaları ekstreden düşer, saklanan balance ledger ile hizalanır.
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import {
  firmCustomersTable,
  firmSuppliersTable,
  sqlCustomerAccountBalancesCte,
  sqlSupplierAccountBalancesCte,
  normalizeFirmTableNr,
} from './accountBalance';

export async function repairCariLedgerConsistency(): Promise<void> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') return;

  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const custTable = firmCustomersTable(firmNr);
  const suppTable = firmSuppliersTable(firmNr);
  const queryOpts = { firmNr, periodNr: ERP_SETTINGS.periodNr };

  await postgres.query(
    `UPDATE sales
     SET is_cancelled = true
     WHERE COALESCE(is_cancelled, false) = false
       AND LOWER(TRIM(COALESCE(status, ''))) IN ('iptal', 'cancelled', 'canceled', 'deleted', 'silindi')`,
    [],
    queryOpts,
  );

  await postgres.query(
    `WITH ${sqlCustomerAccountBalancesCte(custTable, '$1::text')}
     UPDATE ${custTable} c
     SET balance = CASE
       WHEN EXISTS (
         SELECT 1 FROM account_balances b
         WHERE b.id = c.id AND COALESCE(b.txn_count, 0) > 0
       )
       THEN (
         SELECT COALESCE(b.calculated_balance, 0) FROM account_balances b WHERE b.id = c.id
       )
       ELSE COALESCE(c.balance, 0)
     END
     WHERE c.firm_nr = $1::text`,
    [firmNr],
    queryOpts,
  );

  await postgres.query(
    `WITH ${sqlSupplierAccountBalancesCte(suppTable)}
     UPDATE ${suppTable} s
     SET balance = CASE
       WHEN EXISTS (
         SELECT 1 FROM supplier_balances b
         WHERE b.id = s.id AND COALESCE(b.txn_count, 0) > 0
       )
       THEN (
         SELECT COALESCE(b.calculated_balance, 0) FROM supplier_balances b WHERE b.id = s.id
       )
       ELSE COALESCE(s.balance, 0)
     END`,
    [],
    queryOpts,
  );
}
