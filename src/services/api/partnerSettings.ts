/**
 * Partner Settings — firma-düzey ortak/kâr dağıtım ayarları
 *
 * distribution_mode: 'daily' | 'period' | 'manual'
 *   - daily: günlük kasa kapanışı popup'ında otomatik öneri
 *   - period: dönem sonu kapamada otomatik öneri
 *   - manual: yönetici PartnerDistributionModal'dan tetikler
 *
 * distribution_base: 'net_profit' | 'cash_net' | 'manual'
 *   - net_profit: brüt satış − alış iade − gider
 *   - cash_net: kasa + banka net pozisyonu
 *   - manual: kullanıcı tutarı girer
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import type { PartnerSettings, PartnerDistributionMode, PartnerDistributionBase } from '../../core/types/models';

function settingsTable(): string {
  return `rex_${normalizeFirmTableNr(ERP_SETTINGS.firmNr)}_partner_settings`;
}

function defaultSettings(firmNr: string): PartnerSettings {
  return {
    firm_nr: firmNr,
    distribution_mode: 'manual',
    distribution_base: 'manual',
    expense_share_enabled: false,
  };
}

export async function getPartnerSettings(): Promise<PartnerSettings> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const table = settingsTable();
  const { rows } = await postgres.query(
    `SELECT firm_nr, distribution_mode, distribution_base, expense_share_enabled, updated_at
     FROM ${table} WHERE firm_nr = $1::text LIMIT 1`,
    [firmNr],
  );
  if (!rows || !rows.length) {
    const def = defaultSettings(firmNr);
    await postgres.query(
      `INSERT INTO ${table} (firm_nr, distribution_mode, distribution_base, expense_share_enabled)
       VALUES ($1::text, $2::text, $3::text, $4::boolean) ON CONFLICT (firm_nr) DO NOTHING`,
      [def.firm_nr, def.distribution_mode, def.distribution_base, def.expense_share_enabled],
    );
    return def;
  }
  const r = rows[0];
  return {
    firm_nr: r.firm_nr,
    distribution_mode: (r.distribution_mode || 'manual') as PartnerDistributionMode,
    distribution_base: (r.distribution_base || 'manual') as PartnerDistributionBase,
    expense_share_enabled: r.expense_share_enabled === true || String(r.expense_share_enabled) === 'true',
    updated_at: r.updated_at,
  };
}

export async function updatePartnerSettings(updates: Partial<PartnerSettings>): Promise<PartnerSettings> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const table = settingsTable();
  const current = await getPartnerSettings();
  const next: PartnerSettings = { ...current, ...updates, firm_nr: firmNr };

  const allowedModes: PartnerDistributionMode[] = ['daily', 'period', 'manual'];
  const allowedBases: PartnerDistributionBase[] = ['net_profit', 'cash_net', 'manual'];
  if (!allowedModes.includes(next.distribution_mode)) {
    throw new Error(`Geçersiz distribution_mode: ${next.distribution_mode}`);
  }
  if (!allowedBases.includes(next.distribution_base)) {
    throw new Error(`Geçersiz distribution_base: ${next.distribution_base}`);
  }

  await postgres.query(
    `INSERT INTO ${table} (firm_nr, distribution_mode, distribution_base, expense_share_enabled, updated_at)
     VALUES ($1::text, $2::text, $3::text, $4::boolean, NOW())
     ON CONFLICT (firm_nr) DO UPDATE SET
       distribution_mode = EXCLUDED.distribution_mode,
       distribution_base = EXCLUDED.distribution_base,
       expense_share_enabled = EXCLUDED.expense_share_enabled,
       updated_at = NOW()`,
    [firmNr, next.distribution_mode, next.distribution_base, next.expense_share_enabled],
  );
  return next;
}
