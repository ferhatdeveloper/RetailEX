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

/**
 * Soft-delete satışlara bağlı kasa satırlarını (tam fiş + `FİŞ-%` sonek) siler;
 * kasa defteri bakiyesini geri alır. Orphan CH_TAHSILAT/CH_ODEME ekstre şişmesini önler.
 */
async function purgeCashLinesLinkedToCancelledSales(firmNr: string, periodNr: string): Promise<void> {
  const queryOpts = { firmNr, periodNr };

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    try {
      const { postgrest } = await import('./postgrestClient');
      const fn = String(firmNr).padStart(3, '0').slice(0, 10);
      const pn = String(periodNr).padStart(2, '0').slice(0, 10);
      const salesPath = `/rex_${fn}_${pn}_sales`;
      const cashPath = `/rex_${fn}_${pn}_cash_lines`;
      const regPath = `/rex_${fn}_cash_registers`;
      const cancelled = await postgrest.get<{ fiche_no?: string }[]>(
        salesPath,
        {
          select: 'fiche_no',
          is_cancelled: 'eq.true',
          limit: '5000',
        },
        { schema: 'public' },
      );
      const fiches = [
        ...new Set(
          (Array.isArray(cancelled) ? cancelled : [])
            .map((r) => String(r.fiche_no || '').trim())
            .filter(Boolean),
        ),
      ];
      for (const fiche of fiches) {
        const exact = await postgrest.get<any[]>(
          cashPath,
          { select: 'id,register_id,amount,sign', fiche_no: `eq.${fiche}`, limit: '200' },
          { schema: 'public' },
        );
        const prefixed = await postgrest.get<any[]>(
          cashPath,
          { select: 'id,register_id,amount,sign', fiche_no: `like.${fiche}-*`, limit: '200' },
          { schema: 'public' },
        );
        const byId = new Map<string, any>();
        for (const row of [...(Array.isArray(exact) ? exact : []), ...(Array.isArray(prefixed) ? prefixed : [])]) {
          if (row?.id) byId.set(String(row.id), row);
        }
        for (const line of byId.values()) {
          const regId = line.register_id;
          const amt = parseFloat(String(line.amount ?? 0)) || 0;
          const sgn = parseInt(String(line.sign ?? 1), 10) || 1;
          const delta = amt * sgn;
          if (regId && delta !== 0) {
            try {
              const cur = await postgrest.get<any[]>(
                regPath,
                { select: 'balance', id: `eq.${regId}`, limit: 1 },
                { schema: 'public' },
              );
              const b = Number(Array.isArray(cur) ? cur[0]?.balance : 0) || 0;
              await postgrest.patch(
                `${regPath}?id=eq.${encodeURIComponent(String(regId))}`,
                { balance: b - delta },
                { schema: 'public', prefer: 'return=minimal' },
              );
            } catch {
              /* */
            }
          }
          try {
            await postgrest.delete(
              `${cashPath}?id=eq.${encodeURIComponent(String(line.id))}`,
              { schema: 'public', prefer: 'return=minimal' },
            );
          } catch {
            /* */
          }
        }
      }
    } catch (e) {
      console.warn('[repairCariLedger] purge cancelled cash (rest):', e);
    }
    return;
  }

  try {
    // Önce kasa bakiyelerini satır tutarlarıyla düzelt, sonra satırları sil
    await postgres.query(
      `UPDATE cash_registers cr
       SET balance = COALESCE(cr.balance, 0)::numeric - sub.delta
       FROM (
         SELECT cl.register_id,
                SUM(COALESCE(cl.amount, 0)::numeric * COALESCE(cl.sign, 1)::numeric) AS delta
         FROM cash_lines cl
         WHERE cl.register_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM sales s
             WHERE COALESCE(s.is_cancelled, false) = true
               AND TRIM(COALESCE(s.fiche_no, '')) <> ''
               AND (
                 cl.fiche_no::text = s.fiche_no::text
                 OR cl.fiche_no::text LIKE (s.fiche_no::text || '-%')
               )
           )
         GROUP BY cl.register_id
       ) sub
       WHERE cr.id = sub.register_id`,
      [],
      queryOpts,
    );
    await postgres.query(
      `DELETE FROM cash_lines cl
       WHERE EXISTS (
         SELECT 1 FROM sales s
         WHERE COALESCE(s.is_cancelled, false) = true
           AND TRIM(COALESCE(s.fiche_no, '')) <> ''
           AND (
             cl.fiche_no::text = s.fiche_no::text
             OR cl.fiche_no::text LIKE (s.fiche_no::text || '-%')
           )
       )`,
      [],
      queryOpts,
    );
  } catch (e) {
    console.warn('[repairCariLedger] purge cancelled cash:', e);
  }
}

async function repairCariBalancesRestApi(firmNr: string): Promise<void> {
  const { postgrest } = await import('./postgrestClient');
  const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  await purgeCashLinesLinkedToCancelledSales(firmNr, pn);
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

  await purgeCashLinesLinkedToCancelledSales(firmNr, String(ERP_SETTINGS.periodNr ?? '01'));

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
