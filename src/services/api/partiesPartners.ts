/**
 * Parties Partners — şirket ortağı CRUD + share_pct doğrulama.
 */

import { partyAPI } from './parties';
import type { PartyPartner } from '../../core/types/models';

export const partnerAPI = {
  async list(): Promise<PartyPartner[]> {
    const parties = await partyAPI.getAll({ cardType: 'partner' });
    return parties.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      share_pct: p.share_pct || 0,
      capital_contribution: p.capital_contribution || 0,
      partner_role: p.partner_role,
      partner_since: p.partner_since,
      iban: p.iban,
      balance: p.balance || 0,
      is_active: p.is_active,
    }));
  },

  async getActive(): Promise<PartyPartner[]> {
    const all = await this.list();
    return all.filter((p) => p.is_active !== false && (p.share_pct || 0) > 0);
  },

  async getById(id: string): Promise<PartyPartner | null> {
    const p = await partyAPI.getById(id);
    if (!p || p.card_type !== 'partner') return null;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      share_pct: p.share_pct || 0,
      capital_contribution: p.capital_contribution || 0,
      partner_role: p.partner_role,
      partner_since: p.partner_since,
      iban: p.iban,
      balance: p.balance || 0,
      is_active: p.is_active,
    };
  },

  /**
   * Tüm aktif ortakların pay toplamı 100 olmalı.
   */
  async validateSharePctSum(): Promise<{ ok: boolean; totalPct: number; warnings: string[] }> {
    const partners = await this.getActive();
    const total = partners.reduce((s, p) => s + (p.share_pct || 0), 0);
    const rounded = Math.round(total * 100) / 100;
    const warnings: string[] = [];
    if (Math.abs(rounded - 100) > 0.01) {
      warnings.push(`Ortak payları toplamı %${rounded} — %100 olmalı.`);
    }
    if (partners.length === 0) {
      warnings.push('Aktif ortak bulunamadı.');
    }
    return { ok: Math.abs(rounded - 100) <= 0.01 && partners.length > 0, totalPct: rounded, warnings };
  },
};
