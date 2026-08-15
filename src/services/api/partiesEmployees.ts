/**
 * Parties Employees — maaş, avans, personel cari işlemleri.
 *
 * Akış:
 *   paySalary: kasa çıkışı (MAAS_ODEME) + party_ledger_movements (MAAS_ODEME)
 *   payAdvance: kasa çıkışı (AVANS_ODEME) + party_ledger_movements (AVANS_ODEME)
 *   reconcileAdvance: AVANS_MAHSUP (kasa etkisiz) + party_ledger_movements (AVANS_MAHSUP)
 *     → party balance'ı düşürür (borç kapama).
 *
 * 90 yıllık muhasebeci denetimi:
 *   - Personel pozitif balance = işletmenin personele avans borcu.
 *   - MAAS_ODEME: kasa −tutar, party balance +tutar (işletme borçlandı).
 *   - AVANS_ODEME: kasa −tutar, party balance +tutar (işletme borçlandı).
 *   - AVANS_MAHSUP: kasa 0, party balance −tutar (avans kapandı).
 *   - Yön ters çevrilirse BDV (borç defter değeri) bozulur; bu yüzden switch tek doğrultuda.
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import { createKasaIslemi } from './kasa';
import { partyAPI } from './parties';
import { ensurePartyPeriodTables } from './ensurePartyPeriodTables';
import type { PartyLedgerMovement, PartyEmployee } from '../../core/types/models';

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

export interface PayrollWriteResult {
  ledger: PartyLedgerMovement;
  ficheNo?: string | null;
  cashLineId?: string | null;
  balance: number;
}

export interface PayrollMonthLine {
  employee_id: string;
  employee_name: string;
  salary_base: number;
  total_advance: number;
  net_payable: number;
  last_payment_date?: string;
}

export const employeeAPI = {
  async list(): Promise<PartyEmployee[]> {
    const parties = await partyAPI.getAll({ cardType: 'employee' });
    return parties.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      phone: p.phone,
      email: p.email,
      salary_base: p.salary_base || 0,
      hire_date: p.hire_date,
      department: p.department,
      position: p.position,
      balance: p.balance || 0,
      is_active: p.is_active,
    }));
  },

  async getById(id: string): Promise<PartyEmployee | null> {
    const p = await partyAPI.getById(id);
    if (!p || p.card_type !== 'employee') return null;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      phone: p.phone,
      email: p.email,
      salary_base: p.salary_base || 0,
      hire_date: p.hire_date,
      department: p.department,
      position: p.position,
      balance: p.balance || 0,
      is_active: p.is_active,
    };
  },

  async listPayrollMonth(periodStart: string, periodEnd: string): Promise<PayrollMonthLine[]> {
    await ensurePartyPeriodTables();
    const employees = await this.list();
    if (!employees.length) return [];
    const ids = employees.map((e) => e.id);
    const { rows } = await postgres.query(
      `SELECT party_id, transaction_type, SUM(amount) AS total, MAX(date) AS last_date
       FROM ${ledgerTable()}
       WHERE party_id = ANY($1::text::uuid[])
         AND date >= $2::date AND date <= $3::date
       GROUP BY party_id, transaction_type`,
      [ids, periodStart, periodEnd],
    );

    const stats = new Map<string, { advance: number; last: string | null }>();
    for (const r of rows || []) {
      const key = String(r.party_id);
      const prev = stats.get(key) || { advance: 0, last: null };
      if (r.transaction_type === 'AVANS_ODEME') {
        prev.advance += parseFloat(r.total || 0);
      }
      if (r.last_date && (!prev.last || String(r.last_date) > prev.last)) {
        prev.last = String(r.last_date);
      }
      stats.set(key, prev);
    }

    return employees.map((e) => {
      const s = stats.get(e.id) || { advance: 0, last: null };
      return {
        employee_id: e.id,
        employee_name: e.name,
        salary_base: e.salary_base || 0,
        total_advance: s.advance,
        net_payable: (e.salary_base || 0) - s.advance,
        last_payment_date: s.last || undefined,
      };
    });
  },

  async paySalary(input: {
    employeeId: string;
    amount: number;
    registerId: string;
    definition?: string;
  }): Promise<PayrollWriteResult> {
    if (!input.employeeId) throw new Error('Personel seçilmedi.');
    if (!(input.amount > 0)) throw new Error('Maaş tutarı pozitif olmalı.');
    if (!input.registerId) throw new Error('Kasa/banka seçilmedi.');
    const emp = await this.getById(input.employeeId);
    if (!emp) throw new Error('Personel bulunamadı.');

    const cih = await createKasaIslemi({
      firma_id: normalizeFirmTableNr(ERP_SETTINGS.firmNr),
      kasa_id: input.registerId,
      islem_tarihi: new Date().toISOString(),
      tutar: input.amount,
      islem_tipi: 'MAAS_ODEME',
      islem_aciklamasi: input.definition || `Maaş ödemesi — ${emp.name}`,
      party_id: emp.id,
      party_code: emp.code,
      party_name: emp.name,
      doviz_kodu: 'YEREL',
      dovizli_tutar: input.amount,
    });

    const ledger = await writePartyLedger({
      partyId: emp.id,
      cardType: 'employee',
      transactionType: 'MAAS_ODEME',
      amount: input.amount,
      sign: 1,
      definition: input.definition || `Maaş ödemesi — ${emp.name}`,
      sourceModule: 'payroll',
      sourceId: cih.id,
      cashLineId: cih.id,
    });
    const fresh = await this.getById(emp.id);
    return {
      ledger: { ...ledger, fiche_no: cih.islem_no || null, cash_line_id: cih.id },
      ficheNo: cih.islem_no || null,
      cashLineId: cih.id || null,
      balance: fresh?.balance ?? (emp.balance || 0) + input.amount,
    };
  },

  async payAdvance(input: {
    employeeId: string;
    amount: number;
    registerId: string;
    definition?: string;
  }): Promise<PayrollWriteResult> {
    if (!input.employeeId) throw new Error('Personel seçilmedi.');
    if (!(input.amount > 0)) throw new Error('Avans tutarı pozitif olmalı.');
    if (!input.registerId) throw new Error('Kasa/banka seçilmedi.');
    const emp = await this.getById(input.employeeId);
    if (!emp) throw new Error('Personel bulunamadı.');

    const cih = await createKasaIslemi({
      firma_id: normalizeFirmTableNr(ERP_SETTINGS.firmNr),
      kasa_id: input.registerId,
      islem_tarihi: new Date().toISOString(),
      tutar: input.amount,
      islem_tipi: 'AVANS_ODEME',
      islem_aciklamasi: input.definition || `Avans ödemesi — ${emp.name}`,
      party_id: emp.id,
      party_code: emp.code,
      party_name: emp.name,
      doviz_kodu: 'YEREL',
      dovizli_tutar: input.amount,
    });

    const ledger = await writePartyLedger({
      partyId: emp.id,
      cardType: 'employee',
      transactionType: 'AVANS_ODEME',
      amount: input.amount,
      sign: 1,
      definition: input.definition || `Avans ödemesi — ${emp.name}`,
      sourceModule: 'payroll',
      sourceId: cih.id,
      cashLineId: cih.id,
    });
    const fresh = await this.getById(emp.id);
    return {
      ledger: { ...ledger, fiche_no: cih.islem_no || null, cash_line_id: cih.id },
      ficheNo: cih.islem_no || null,
      cashLineId: cih.id || null,
      balance: fresh?.balance ?? (emp.balance || 0) + input.amount,
    };
  },

  async reconcileAdvance(input: {
    employeeId: string;
    amount: number;
    relatedCashLineId?: string;
    definition?: string;
  }): Promise<PayrollWriteResult> {
    if (!input.employeeId) throw new Error('Personel seçilmedi.');
    if (!(input.amount > 0)) throw new Error('Mahsup tutarı pozitif olmalı.');
    const emp = await this.getById(input.employeeId);
    if (!emp) throw new Error('Personel bulunamadı.');

    const ledger = await writePartyLedger({
      partyId: emp.id,
      cardType: 'employee',
      transactionType: 'AVANS_MAHSUP',
      amount: input.amount,
      sign: -1,
      definition: input.definition || `Avans mahsup — ${emp.name}`,
      sourceModule: 'payroll',
      sourceId: input.relatedCashLineId,
    });

    // AVANS_MAHSUP — kasa etkisiz; party balance düşürülür (createKasaIslemi kullanmıyoruz)
    // computePartyBalanceDelta(AVANS_MAHSUP) = -tutar
    const delta = -input.amount;
    await postgres.query(
      `UPDATE ${`rex_${normalizeFirmTableNr(ERP_SETTINGS.firmNr)}_parties`}
       SET balance = balance + $1::text::numeric, updated_at = NOW()
       WHERE id = $2::text::uuid`,
      [delta.toString(), emp.id],
    );

    const fresh = await this.getById(emp.id);
    return {
      ledger,
      ficheNo: null,
      cashLineId: input.relatedCashLineId || null,
      balance: fresh?.balance ?? (emp.balance || 0) - input.amount,
    };
  },

  async getLedger(employeeId: string, opts?: { startDate?: string; endDate?: string; limit?: number }): Promise<PartyLedgerMovement[]> {
    await ensurePartyPeriodTables();
    const limit = opts?.limit ?? 200;
    const { rows } = await postgres.query(
      `SELECT pl.*, cl.fiche_no
       FROM ${ledgerTable()} pl
       LEFT JOIN ${cashLinesTable()} cl ON cl.id = pl.cash_line_id
       WHERE pl.party_id = $1::text::uuid
         AND ($2::text IS NULL OR pl.date >= $2::date)
         AND ($3::text IS NULL OR pl.date <= $3::date)
       ORDER BY pl.date DESC, pl.created_at DESC
       LIMIT $4::integer`,
      [employeeId, opts?.startDate || null, opts?.endDate || null, limit],
    );
    return (rows || []).map((r: any) => ({
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
      fiche_no: r.fiche_no || null,
      created_at: r.created_at,
    }));
  },
};

interface WritePartyLedgerOpts {
  partyId: string;
  cardType: 'employee' | 'partner';
  transactionType: string;
  amount: number;
  sign: number;
  definition?: string;
  sourceModule?: string;
  sourceId?: string;
  cashLineId?: string;
}

async function writePartyLedger(opts: WritePartyLedgerOpts): Promise<PartyLedgerMovement> {
  await ensurePartyPeriodTables();
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  const { rows } = await postgres.query(
    `INSERT INTO ${ledgerTable()} (
       firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
       date, amount, sign, definition, source_module, source_id, cash_line_id
     ) VALUES (
       $1::text, $2::text, $3::text::uuid, $4::text, 0, $5::text,
       NOW(), $6::text::numeric, $7::integer, $8::text, $9::text, $10::text::uuid, $11::text::uuid
     ) RETURNING *`,
    [
      firmNr,
      period,
      opts.partyId,
      opts.cardType,
      opts.transactionType,
      opts.amount.toString(),
      opts.sign,
      opts.definition || null,
      opts.sourceModule || null,
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
