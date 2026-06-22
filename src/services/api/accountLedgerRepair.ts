/**
 * Cari bakiye tutarlılığı: iptal faturaları ekstreden düşer, saklanan balance ledger ile hizalanır.
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';

export async function repairCariLedgerConsistency(): Promise<void> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') return;

  const firmNr = String(ERP_SETTINGS.firmNr ?? '001').trim();
  const custTable = `rex_${firmNr}_customers`;
  const suppTable = `rex_${firmNr}_suppliers`;

  await postgres.query(
    `UPDATE sales
     SET is_cancelled = true
     WHERE COALESCE(is_cancelled, false) = false
       AND LOWER(TRIM(COALESCE(status, ''))) IN ('iptal', 'cancelled', 'canceled', 'deleted')`,
    [],
    { firmNr, periodNr: ERP_SETTINGS.periodNr }
  );

  await postgres.query(
    `WITH account_balances AS (
       SELECT customer_id AS id, SUM(line_contrib) AS calculated_balance
       FROM (
         SELECT customer_id,
           CASE WHEN fiche_type = 'return_invoice' THEN -net_amount ELSE net_amount END AS line_contrib
         FROM sales
         WHERE customer_id IS NOT NULL AND COALESCE(is_cancelled, false) = false
         UNION ALL
         SELECT customer_id, -amount AS line_contrib
         FROM cash_lines
         WHERE transaction_type IN ('CH_ODEME', 'CH_TAHSILAT')
       ) t
       GROUP BY customer_id
     )
     UPDATE ${custTable} c
     SET balance = COALESCE(b.calculated_balance, 0)
     FROM account_balances b
     WHERE c.id = b.id AND c.firm_nr = $1::text`,
    [firmNr],
    { firmNr, periodNr: ERP_SETTINGS.periodNr }
  );

  await postgres.query(
    `WITH account_balances AS (
       SELECT customer_id AS id, SUM(line_contrib) AS calculated_balance
       FROM (
         SELECT customer_id,
           CASE WHEN fiche_type = 'return_invoice' THEN net_amount ELSE -net_amount END AS line_contrib
         FROM sales
         WHERE customer_id IS NOT NULL AND COALESCE(is_cancelled, false) = false
         UNION ALL
         SELECT customer_id, amount AS line_contrib
         FROM cash_lines
         WHERE transaction_type IN ('CH_ODEME', 'CH_TAHSILAT')
       ) t
       GROUP BY customer_id
     )
     UPDATE ${suppTable} s
     SET balance = COALESCE(b.calculated_balance, 0)
     FROM account_balances b
     WHERE s.id = b.id`,
    [],
    { firmNr, periodNr: ERP_SETTINGS.periodNr }
  );
}
