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

/**
 * Dönem özeti "Gider" kolonuna dahil edilecek kasa çıkış tipleri.
 *
 * Bug 31 geri-çevrimi (2026-10-04 — Ferhat datası 72M beklentisi):
 * Ciro/Gider/Alış formülünde Gider = işletme gideri + kasa çıkışları
 * (cari ödeme, maaş, avans, ortak sermaye ödeme, kâr dağıtımı). Kullanıcı
 * doğrulaması: 780965d6 öncesi Gider 72M görünüyordu; Bug 31 sonrası 48M
 * (CH_ODEME / AVANS_ODEME / ORTAK_DAGITIM_KAR hariç). Eski 7-kalem
 * davranışına geri dönüldü.
 *
 * - Dönem özetinin Net Kalan'ı = Ciro − Gider − Alış.
 * - CH_ODEME, MAAS_ODEME, AVANS_ODEME, ORTAK_SERMAYE_ODEME, ORTAK_DAGITIM_KAR
 *   kasadan çıkan hareketlerdir; işletme gideri sayılır ve Gider kolonuna
 *   DAHİL edilir (Ferhat datası 72M doğrulaması).
 * - Expense tablosundaki (Gider Yönetimi) gerçek giderler +
 *   bağlanmamış GIDER_PUSULASI / KASA_CIKIS (işletme gideri olarak
 *   nitelenen manuel kasa çıkışları) DAHİL.
 * - CH_TAHSILAT (ledger simetrisi: kasa + / cari -) Ciro'ya DEĞİL; Net
 *   Kalan'a da dahil değildir.
 */
export const PERIOD_SUMMARY_CASH_OUT_TYPES = new Set([
  'GIDER_PUSULASI',
  'KASA_CIKIS',
  'MAAS_ODEME',
  'ORTAK_SERMAYE_ODEME',
  'CH_ODEME',
  'AVANS_ODEME',
  'ORTAK_DAGITIM_KAR',
]);

/** Günlük/Dönem raporu için kasa para GİRİŞİ tipleri (sign=+1).
 *
 * Ciro tanımı: Ciro = yalnızca satış cirosu (CH_TAHSILAT Hariç).
 * CH_TAHSILAT (cari tahsilatları) Ciro'ya yansımaz; ayrı "Kasa Para Girişi"
 * kolonu + PeriodCashInDetailModal "Cari Tahsilatlar" alt bölümünde
 * izlenir. Ciro formülü `sale.revenue` (cashIn'e bağlı değil); bu yüzden
 * CH_TAHSILAT'ın set'e dahil edilmesi Ciro'yu etkilemez — sadece "Kasa
 * Para Girişi" kolonu/alt toplamı doğru gösterir (Ferhat datası 24,5M).
 */
export const REPORT_CASH_IN_TYPES = new Set([
  'KASA_GIRIS',
  'ORTAK_SERMAYE_TAHSILAT',
  'ORTAK_PARA_GIRIS',
  'CH_TAHSILAT',
]);

const CASH_IN_CATEGORY_TR: Record<string, string> = {
  KASA_GIRIS: 'Kasa giriş',
  ORTAK_SERMAYE_TAHSILAT: 'Ortak sermaye tahsilatı',
  ORTAK_PARA_GIRIS: 'Ortak para girişi',
  CH_TAHSILAT: 'Cari tahsilat',
};

export function reportCashInCategory(typeCode: string): string {
  const u = String(typeCode || '').trim().toUpperCase();
  return CASH_IN_CATEGORY_TR[u] || u || 'Kasa giriş';
}

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
  options?: { allowedCashOutTypes?: Set<string> },
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

  const allowedTypes = options?.allowedCashOutTypes ?? REPORT_CASH_OUT_TYPES;

  const unified: Expense[] = allExpenses.map((e) => ({ ...e }));

  for (const cl of Array.isArray(cashLines) ? cashLines : []) {
    const type = String(cl.islem_tipi || '').trim().toUpperCase();
    if (!allowedTypes.has(type)) continue;
    // Ferhat datası 72M geri-çevrimi (2026-10-04): MAAS_ODEME,
    // ORTAK_SERMAYE_ODEME, CH_ODEME, AVANS_ODEME, ORTAK_DAGITIM_KAR
    // Gider kolonuna dahil edildiği için bu 5 tip için `cash_line_id`
    // üzerinden Expense tablosuna bağlı satırların "çift sayım" filtresi
    // devre dışı bırakılır; GIDER_PUSULASI / KASA_CIKIS için çift sayım
    // koruması korunur.
    const skipLinkedCheck =
      type === 'MAAS_ODEME' ||
      type === 'ORTAK_SERMAYE_ODEME' ||
      type === 'CH_ODEME' ||
      type === 'AVANS_ODEME' ||
      type === 'ORTAK_DAGITIM_KAR';
    if (!skipLinkedCheck && cl.id && linkedCashIds.has(String(cl.id))) continue;
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

/**
 * Cash_lines kayıtları içinden kasa para GİRİŞİ tiplerini (`REPORT_CASH_IN_TYPES`)
 * `DailyExpenseRow` benzeri tek-forma dönüştürür. sign=+1 doğrulanır.
 * Günlük raporda "Kasa Para Girişi" panelinde gösterilir.
 */
export function mergeExpensesWithCashIns(
  cashLines: KasaIslemi[],
): KasaIslemi[] {
  const list = Array.isArray(cashLines) ? cashLines : [];
  const unified: KasaIslemi[] = [];
  for (const cl of list) {
    const type = String(cl.islem_tipi || '').trim().toUpperCase();
    if (!REPORT_CASH_IN_TYPES.has(type)) continue;
    const amt = Math.abs(Number(cl.tutar) || 0);
    if (!amt) continue;
    unified.push({
      ...cl,
        tutar: amt,
        islem_tipi: type,
      });
  }
  return unified;
}

/**
 * cashIn listesini tarih (YYYY-MM-DD) veya ay (YYYY-MM) bazında toplar.
 * - `groupBy='day'` → `Map<YYYY-MM-DD, number>`
 * - `groupBy='month'` → `Map<YYYY-MM, number>`
 */
export function aggregateCashIns(
  cashIns: KasaIslemi[],
  groupBy: 'day' | 'month' = 'day',
): Map<string, number> {
  const map = new Map<string, number>();
  for (const cl of Array.isArray(cashIns) ? cashIns : []) {
    const day =
      toSqlDateInputString(cl.islem_tarihi || '') ||
      localCalendarDateKey(cl.islem_tarihi) ||
      '';
    if (!day) continue;
    const key = groupBy === 'month' ? day.slice(0, 7) : day;
    map.set(key, (map.get(key) || 0) + (Number(cl.tutar) || 0));
  }
  return map;
}

/** Bir `KasaIslemi`'nin geçmiş tarihe işaretlenip işaretlenmediğini söyler (audit). */
export function isCashLineBackDated(
  cl: KasaIslemi | null | undefined,
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (!cl) return false;
  const raw = cl.islem_tarihi || '';
  const dateKey = String(raw).slice(0, 10);
  if (!dateKey) return false;
  // created_at varsa ve islem_tarihi created_at'ten önceyse gerçekten geçmiş tarihli
  const created = cl.olusturma_tarihi || '';
  const createdKey = String(created).slice(0, 10);
  if (createdKey && dateKey < createdKey) return true;
  return dateKey < today;
}
