/**
 * Günlük Rapor ile Aylık/Yıllık özet ortak gider birleşimi:
 * Gider Yönetimi satırları + kasa çıkışları (cari ödeme, maaş, avans…).
 * cash_line_id ile bağlı gider pusulaları çift sayılmaz.
 * Aynı gün + aynı açıklama (ör. EYLUL KIRASI) kasa kardeş fişi de çift sayılmaz.
 */

import type { Expense } from '../services/api/expenses';
import type { KasaIslemi } from '../services/api/kasa';
import { localCalendarDateKey, toSqlDateInputString } from './localCalendarDate';

export function normalizeGiderAciklama(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

/** Günlük Rapor `DAILY_CASH_OUT_TYPES` ile aynı küme */
export const REPORT_CASH_OUT_TYPES = new Set([
  'GIDER_PUSULASI',
  'MAAS_ODEME',
  'AVANS_ODEME',
  'CH_ODEME',
  'KASA_CIKIS',
  'ORTAK_DAGITIM_KAR',
  'ORTAK_SERMAYE_ODEME',
]);

const CASH_OUT_CATEGORY_TR: Record<string, string> = {
  GIDER_PUSULASI: 'Gider pusulası',
  MAAS_ODEME: 'Maaş ödemesi',
  AVANS_ODEME: 'Avans',
  CH_ODEME: 'Cari ödeme',
  KASA_CIKIS: 'Kasa çıkış',
  ORTAK_DAGITIM_KAR: 'Ortak kâr dağıtımı',
  ORTAK_SERMAYE_ODEME: 'Sermaye ödemesi',
};

export function reportCashOutCategory(typeCode: string): string {
  const u = String(typeCode || '').trim().toUpperCase();
  return CASH_OUT_CATEGORY_TR[u] || u || 'Kasa çıkış';
}

/** Expense + bağlanmamış kasa çıkışları → tek liste (detay modal / aggregasyon). */
export function mergeExpensesWithCashOuts(
  expenses: Expense[],
  cashLines: KasaIslemi[],
): Expense[] {
  const allExpenses = Array.isArray(expenses) ? expenses : [];
  const linkedCashIds = new Set(
    allExpenses
      .map((e) => String(e.cash_line_id || '').trim())
      .filter(Boolean),
  );
  const expenseDescKeys = new Set(
    allExpenses
      .map((e) => {
        const day = String(e.expense_date || '').slice(0, 10);
        const desc = normalizeGiderAciklama(e.description);
        return day && desc ? `${day}|${desc}` : '';
      })
      .filter(Boolean),
  );

  const unified: Expense[] = allExpenses.map((e) => ({ ...e }));

  for (const cl of Array.isArray(cashLines) ? cashLines : []) {
    const type = String(cl.islem_tipi || '').trim().toUpperCase();
    if (!REPORT_CASH_OUT_TYPES.has(type)) continue;
    if (cl.id && linkedCashIds.has(String(cl.id))) continue;
    const amt = Math.abs(Number(cl.tutar) || 0);
    if (!amt) continue;
    const day =
      toSqlDateInputString(cl.islem_tarihi || '') ||
      localCalendarDateKey(cl.islem_tarihi) ||
      '';
    if (!day) continue;
    // Gider pusulası veya aynı açıklamalı kasa çıkış kardeşi (450k düzenleme → 45k) çift sayılmaz.
    if (type === 'GIDER_PUSULASI' || type === 'KASA_CIKIS') {
      const descKey = `${day}|${normalizeGiderAciklama(cl.islem_aciklamasi || cl.cari_hesap_unvani)}`;
      if (expenseDescKeys.has(descKey)) continue;
    }
    unified.push({
      id: `cash-${cl.id || `${day}-${type}-${amt}`}`,
      category: reportCashOutCategory(type),
      description: String(cl.islem_aciklamasi || cl.cari_hesap_unvani || '').trim(),
      amount: amt,
      payment_method: 'cash',
      document_number: String(cl.islem_no || '').trim() || undefined,
      store_id: '',
      cost_center_name: String(cl.cari_hesap_unvani || '').trim() || undefined,
      expense_date: day,
      notes: type,
      created_by: '',
      firm_nr: String(cl.firma_id || ''),
      cash_line_id: cl.id || null,
    } as Expense);
  }

  return unified;
}
