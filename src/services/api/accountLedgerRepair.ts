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
  computeCustomerBalanceFromLedger,
  computeSupplierBalanceFromLedger,
} from './accountBalance';

async function repairCariBalancesRestApi(firmNr: string): Promise<void> {
  const { postgrest } = await import('./postgrestClient');
  const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const custTable = firmCustomersTable(firmNr);
  const suppTable = firmSuppliersTable(firmNr);
  const salesPath = `/rex_${firmNr}_${pn}_sales`;
  const cashPath = `/rex_${firmNr}_${pn}_cash_lines`;

  const safeGet = async (path: string, query: Record<string, string>) => {
    try {
      const rows = await postgrest.get<any[]>(path, query, { schema: 'public' });
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [] as any[];
    }
  };

  const [customers, suppliers, salesRows, cashRows] = await Promise.all([
    safeGet(`/${custTable}`, { select: 'id,name,balance', firm_nr: `eq.${firmNr}`, is_active: 'eq.true', limit: '5000' }),
    safeGet(`/${suppTable}`, { select: 'id,name,balance', is_active: 'eq.true', limit: '5000' }),
    safeGet(salesPath, {
      select: 'customer_id,customer_name,net_amount,fiche_type,is_cancelled,payment_method',
      is_cancelled: 'eq.false',
      limit: '50000',
    }),
    safeGet(cashPath, {
      select: 'customer_id,amount,transaction_type',
      transaction_type: 'in.(CH_ODEME,CH_TAHSILAT)',
      limit: '50000',
    }),
  ]);

  for (const row of customers) {
    const id = String(row.id || '');
    if (!id) continue;
    const ledger = computeCustomerBalanceFromLedger(
      id,
      String(row.name || ''),
      salesRows,
      cashRows,
      parseFloat(String(row.balance ?? 0)) || 0,
    );
    const stored = parseFloat(String(row.balance ?? 0)) || 0;
    if (Math.abs(stored - ledger) < 0.0001) continue;
    await postgrest.patch(
      `/${custTable}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(firmNr)}`,
      { balance: ledger },
      { schema: 'public', prefer: 'return=minimal' },
    ).catch((err) => console.warn('[repairCariLedger] customer balance patch:', id, err));
  }

  for (const row of suppliers) {
    const id = String(row.id || '');
    if (!id) continue;
    const ledger = computeSupplierBalanceFromLedger(id, String(row.name || ''), salesRows, cashRows, 0);
    const stored = parseFloat(String(row.balance ?? 0)) || 0;
    if (Math.abs(stored - ledger) < 0.0001) continue;
    await postgrest.patch(
      `/${suppTable}?id=eq.${encodeURIComponent(id)}`,
      { balance: ledger },
      { schema: 'public', prefer: 'return=minimal' },
    ).catch((err) => console.warn('[repairCariLedger] supplier balance patch:', id, err));
  }
}

export async function repairCariLedgerConsistency(): Promise<void> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    await repairCariBalancesRestApi(firmNr).catch((err) => {
      console.warn('[repairCariLedger] rest_api cari repair:', err);
    });
    return;
  }

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
       ELSE 0
     END
     WHERE c.firm_nr = $1::text`,
    [firmNr],
    queryOpts,
  );

  await postgres.query(
    `WITH ${sqlSupplierAccountBalancesCte(suppTable)}
     UPDATE ${suppTable} s
     SET balance = COALESCE(
       (SELECT b.calculated_balance FROM supplier_balances b WHERE b.id = s.id),
       0
     )`,
    [],
    queryOpts,
  );
}
