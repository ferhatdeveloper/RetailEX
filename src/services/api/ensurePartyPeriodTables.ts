/**
 * Personel/ortak dönem tabloları — eski dönemlerde 121 CREATE etmediği için
 * `rex_{firm}_{period}_party_ledger_movements` yok olabilir.
 * CREATE TABLE IF NOT EXISTS (Tauri: DO $$ yok). Sonuç firma+dönem bazında önbelleklenir.
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';

function isMissingInitFunction(err: unknown): boolean {
  const msg = String((err as { message?: unknown })?.message ?? err ?? '');
  const code = String((err as { code?: unknown })?.code ?? '');
  return /42883|undefined_function|does not exist/i.test(`${code} ${msg}`);
}

const ready = new Set<string>();
const inflight = new Map<string, Promise<void>>();

export async function ensurePartyPeriodTables(
  firmNr?: string,
  periodNr?: string,
): Promise<void> {
  const firm = normalizeFirmTableNr(firmNr || ERP_SETTINGS.firmNr);
  const period = String(periodNr || ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  const key = `${firm}_${period}`;
  if (ready.has(key)) return;
  const existing = inflight.get(key);
  if (existing) return existing;

  const run = createPartyPeriodTables(firm, period)
    .then(() => {
      ready.add(key);
      inflight.delete(key);
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, run);
  return run;
}

async function createPartyPeriodTables(firm: string, period: string): Promise<void> {
  try {
    await postgres.query('SELECT public.INIT_PARTY_PERIOD_TABLES($1, $2)', [firm, period]);
    return;
  } catch (err) {
    if (!isMissingInitFunction(err)) throw err;
  }

  const prefix = `rex_${firm}_${period}`;
  const ledger = `${prefix}_party_ledger_movements`;
  const dist = `${prefix}_partner_distributions`;
  const items = `${prefix}_partner_distribution_items`;

  await postgres.query(`
    CREATE TABLE IF NOT EXISTS ${ledger} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      period_nr VARCHAR(10) NOT NULL,
      party_id UUID NOT NULL,
      card_type VARCHAR(20) NOT NULL,
      trcode INTEGER,
      transaction_type VARCHAR(50) NOT NULL,
      date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      amount DECIMAL(15,2) DEFAULT 0,
      sign INTEGER DEFAULT 0,
      definition TEXT,
      source_module VARCHAR(50),
      source_id UUID,
      cash_line_id UUID,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query(
    `CREATE INDEX IF NOT EXISTS ${prefix}_party_ledger_firm_period_party_date_idx ON ${ledger} (firm_nr, period_nr, party_id, date)`,
  );
  await postgres.query(
    `CREATE INDEX IF NOT EXISTS ${prefix}_party_ledger_trtype_idx ON ${ledger} (transaction_type)`,
  );

  await postgres.query(`
    CREATE TABLE IF NOT EXISTS ${dist} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      period_nr VARCHAR(10) NOT NULL,
      distribution_date DATE NOT NULL,
      base_type VARCHAR(20) NOT NULL,
      base_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      total_partner_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      trigger_type VARCHAR(20) NOT NULL,
      created_by VARCHAR(100),
      notes TEXT,
      reversed_by_id UUID,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query(
    `CREATE INDEX IF NOT EXISTS ${prefix}_partner_distributions_date_idx ON ${dist} (distribution_date)`,
  );
  await postgres.query(
    `CREATE INDEX IF NOT EXISTS ${prefix}_partner_distributions_firm_trigger_idx ON ${dist} (firm_nr, trigger_type)`,
  );

  await postgres.query(`
    CREATE TABLE IF NOT EXISTS ${items} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      distribution_id UUID NOT NULL REFERENCES ${dist}(id) ON DELETE CASCADE,
      partner_id UUID NOT NULL,
      share_pct NUMERIC(5,2) NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      cash_line_id UUID,
      party_ledger_movement_id UUID,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query(
    `CREATE INDEX IF NOT EXISTS ${prefix}_partner_distribution_items_dist_idx ON ${items} (distribution_id)`,
  );
  await postgres.query(
    `CREATE INDEX IF NOT EXISTS ${prefix}_partner_distribution_items_partner_idx ON ${items} (partner_id)`,
  );
}
