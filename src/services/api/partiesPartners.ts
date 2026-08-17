/**
 * Parties Partners — şirket ortağı CRUD, pay doğrulama, para giriş/çıkış.
 *
 * Muhasebe:
 *   Pozitif bakiye = ortağın işletmeden alacağı (dağıtılmamış kâr / sermaye).
 *   Kâr dağıtımı hesaba yazılır (kasa yok). Para kasadan ayrı çekilir/konur.
 *   Para girişi (ORTAK_SERMAYE_TAHSILAT): kasa +, bakiye +.
 *   Para çıkışı (ORTAK_SERMAYE_ODEME): kasa −, bakiye −.
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import { createKasaIslemi } from './kasa';
import { partyAPI } from './parties';
import { ensurePartyPeriodTables } from './ensurePartyPeriodTables';
import type { PartyLedgerMovement, PartyPartner } from '../../core/types/models';

function ledgerTable(): string {
  const firm = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  return `rex_${firm}_${period}_party_ledger_movements`;
}

function cashLinesTable(): string {
  const firm = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  return `rex_${firm}_${period}_cash_lines`;
}

function mapPartner(p: {
  id: string;
  code?: string;
  name: string;
  share_pct?: number;
  capital_contribution?: number;
  partner_role?: string;
  partner_since?: string | null;
  iban?: string;
  balance?: number;
  is_active?: boolean;
}): PartyPartner {
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
}

export interface PartnerCashWriteResult {
  ledger: PartyLedgerMovement;
  ficheNo?: string | null;
  cashLineId?: string | null;
  balance: number;
}

async function writePartnerLedger(opts: {
  partyId: string;
  transactionType: string;
  amount: number;
  sign: number;
  definition?: string;
  sourceModule?: string;
  sourceId?: string;
  cashLineId?: string;
}): Promise<PartyLedgerMovement> {
  await ensurePartyPeriodTables();
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  const { rows } = await postgres.query(
    `INSERT INTO ${ledgerTable()} (
       firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
       date, amount, sign, definition, source_module, source_id, cash_line_id
     ) VALUES (
       $1::text, $2::text, $3::text::uuid, 'partner', 0, $4::text,
       NOW(), $5::text::numeric, $6::integer, $7::text, $8::text, $9::text::uuid, $10::text::uuid
     ) RETURNING *`,
    [
      firmNr,
      period,
      opts.partyId,
      opts.transactionType,
      opts.amount.toString(),
      opts.sign,
      opts.definition || null,
      opts.sourceModule || 'partner_cash',
      opts.sourceId || null,
      opts.cashLineId || null,
    ],
  );
  const r = rows?.[0];
  return {
    id: r.id,
    firm_nr: r.firm_nr,
    period_nr: r.period_nr,
    party_id: r.party_id,
    card_type: r.card_type,
    trcode: r.trcode,
    transaction_type: r.transaction_type,
    date: r.date,
    amount: parseFloat(r.amount || 0),
    sign: r.sign,
    definition: r.definition,
    source_module: r.source_module,
    source_id: r.source_id,
    cash_line_id: r.cash_line_id,
    created_at: r.created_at,
  };
}

export const partnerAPI = {
  async list(): Promise<PartyPartner[]> {
    const parties = await partyAPI.getAll({ cardType: 'partner' });
    return parties.map(mapPartner);
  },

  async getActive(): Promise<PartyPartner[]> {
    const all = await this.list();
    return all.filter((p) => p.is_active !== false && (p.share_pct || 0) > 0);
  },

  async getById(id: string): Promise<PartyPartner | null> {
    const p = await partyAPI.getById(id);
    if (!p || p.card_type !== 'partner') return null;
    return mapPartner(p);
  },

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

  async getLedger(
    partnerId: string,
    opts?: { startDate?: string; endDate?: string; limit?: number },
  ): Promise<PartyLedgerMovement[]> {
    await ensurePartyPeriodTables();
    const limit = opts?.limit ?? 200;
    const { rows } = await postgres.query(
      `SELECT pl.*, cl.fiche_no
       FROM ${ledgerTable()} pl
       LEFT JOIN ${cashLinesTable()} cl ON cl.id = pl.cash_line_id
       WHERE pl.party_id = $1::text::uuid
         AND ($2::text IS NULL OR pl.date >= $2::date)
         AND ($3::text IS NULL OR pl.date <= $3::date)
       ORDER BY pl.date ASC, pl.created_at ASC
       LIMIT $4::integer`,
      [partnerId, opts?.startDate || null, opts?.endDate || null, limit],
    );
    return (rows || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      firm_nr: String(r.firm_nr || ''),
      period_nr: String(r.period_nr || ''),
      party_id: String(r.party_id),
      card_type: 'partner',
      trcode: Number(r.trcode || 0),
      transaction_type: String(r.transaction_type || ''),
      date: String(r.date || ''),
      amount: parseFloat(String(r.amount || 0)),
      sign: Number(r.sign || 0),
      definition: r.definition != null ? String(r.definition) : undefined,
      source_module: r.source_module != null ? String(r.source_module) : undefined,
      source_id: r.source_id != null ? String(r.source_id) : undefined,
      cash_line_id: r.cash_line_id != null ? String(r.cash_line_id) : undefined,
      fiche_no: r.fiche_no != null ? String(r.fiche_no) : null,
      created_at: r.created_at != null ? String(r.created_at) : undefined,
    }));
  },

  /** Ortak kasaya para koyar (kasa +, hesap alacağı +). */
  async cashIn(input: {
    partnerId: string;
    amount: number;
    registerId: string;
    definition?: string;
  }): Promise<PartnerCashWriteResult> {
    return this.postCash(input, 'in');
  },

  /** Ortak kasadan para çeker (kasa −, hesap alacağı −). */
  async cashOut(input: {
    partnerId: string;
    amount: number;
    registerId: string;
    definition?: string;
  }): Promise<PartnerCashWriteResult> {
    return this.postCash(input, 'out');
  },

  async postCash(
    input: { partnerId: string; amount: number; registerId: string; definition?: string },
    direction: 'in' | 'out',
  ): Promise<PartnerCashWriteResult> {
    if (!input.partnerId) throw new Error('Ortak seçilmedi.');
    if (!(input.amount > 0)) throw new Error('Tutar pozitif olmalı.');
    if (!input.registerId) throw new Error('Kasa/banka seçilmedi.');
    const partner = await this.getById(input.partnerId);
    if (!partner) throw new Error('Ortak cari bulunamadı.');

    const isIn = direction === 'in';
    const kasaTipi = isIn ? 'ORTAK_SERMAYE_TAHSILAT' : 'ORTAK_SERMAYE_ODEME';
    const ledgerTipi = isIn ? 'SERMAYE_TAHSILAT' : 'SERMAYE_ODEME';
    const label = isIn ? 'Para girişi' : 'Para çıkışı';
    const definition = input.definition || `${label} — ${partner.name}`;

    const cih = await createKasaIslemi({
      firma_id: normalizeFirmTableNr(ERP_SETTINGS.firmNr),
      kasa_id: input.registerId,
      islem_tarihi: new Date().toISOString(),
      tutar: input.amount,
      islem_tipi: kasaTipi,
      islem_aciklamasi: definition,
      party_id: partner.id,
      party_code: partner.code,
      party_name: partner.name,
      doviz_kodu: 'YEREL',
      dovizli_tutar: input.amount,
    });

    const ledger = await writePartnerLedger({
      partyId: partner.id,
      transactionType: ledgerTipi,
      amount: input.amount,
      sign: isIn ? 1 : -1,
      definition,
      sourceModule: 'partner_cash',
      sourceId: cih.id,
      cashLineId: cih.id,
    });

    const fresh = await this.getById(partner.id);
    return {
      ledger: { ...ledger, fiche_no: cih.islem_no || null, cash_line_id: cih.id },
      ficheNo: cih.islem_no || null,
      cashLineId: cih.id || null,
      balance: fresh?.balance ?? partner.balance ?? 0,
    };
  },
};
