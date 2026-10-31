/**
 * Günlük Rapor ile Aylık/Yıllık özet ortak gider birleşimi:
 * Gider Yönetimi satırları + kasa çıkışları (cari ödeme, maaş, avans…).
 * cash_line_id ile bağlı gider pusulaları çift sayılmaz.
 * Aynı gün + aynı açıklama (ör. EYLUL KIRASI) kasa kardeş fişi de çift sayılmaz.
 * Kasa fişi silinmiş ayna (`cash_line_id` dolu, listede yok) rapora yazılmaz.
 */

import type { Expense } from '../services/api/expenses';
import type { KasaIslemi } from '../services/api/kasa';
import { readCashLineActor } from './cashLineActor';
import { isCashMovementLabel } from './loginCashierName';
import { isPurchaseReturnCashVoucher, isSalesReturnCashVoucher } from './invoiceCashRegisterPosting';
import { localCalendarDateKey, toSqlDateInputString } from './localCalendarDate';

export function normalizeGiderAciklama(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

/** Günlük Rapor `DAILY_CASH_OUT_TYPES` ile aynı küme.
 * ORTAK_SERMAYE_ODEME ve ORTAK_DAGITIM_KAR kâr dağıtımı / ortaklık sermaye
 * ödemesidir; işletme gideri DEĞİLDİR. 2026-10-21 kullanıcı isteği ile
 * Toplam Gider kartından çıkarıldı. */
export const REPORT_CASH_OUT_TYPES = new Set([
  'GIDER_PUSULASI',
  'MAAS_ODEME',
  'AVANS_ODEME',
  'CH_ODEME',
  'KASA_CIKIS',
]);

/** 7-kalem eski davranışı (ORTAK_SERMAYE_ODEME, ORTAK_DAGITIM_KAR dahil).
 * Geriye dönük uyumluluk ve Dönem Özeti (PeriodSummaryReport) tarafından
 * kâr dağıtımı/sermaye ödemesi ayrımı ihtiyaç duyulursa kullanılır. */
export const REPORT_CASH_OUT_TYPES_LEGACY = new Set([
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
 * CH_TAHSILAT (cari tahsilatları) Ciro'ya YANSIMAZ; ayrıca ana "Kasa Para
 * Girişi" kolonundan da Hariç tutulur — sadece PeriodCashInDetailModal
 * "Cari Tahsilatlar" alt bölümünde gösterilir (kullanıcı isteği 2026-10-04:
 * "bir önceki yerden kaldırıp buraya taşı"). CH_TAHSILAT kasaya giren
 * paradır; Ciro'ya değil, ayrı bölüme yansır.
 */
export const REPORT_CASH_IN_TYPES = new Set([
  'KASA_GIRIS',
  'ORTAK_SERMAYE_TAHSILAT',
  'ORTAK_PARA_GIRIS',
]);

const CASH_IN_CATEGORY_TR: Record<string, string> = {
  KASA_GIRIS: 'Kasa giriş',
  ORTAK_SERMAYE_TAHSILAT: 'Ortak sermaye tahsilatı',
  ORTAK_PARA_GIRIS: 'Ortak para girişi',
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

function blankRecordText(value: unknown): boolean {
  const text = String(value ?? '').trim();
  return !text || text === '—' || text === '-';
}

/**
 * Gider satırındaki ekleyen kişi.
 * Önce `created_by`, boşsa son düzenleyen veya onaylayan kimliği.
 * Yazılı ad `entered_by_name`. Hepsi boşsa kimlik ve ad boş kalır.
 */
export function expenseEnteredBy(row: object | null | undefined): { id: string; name: string } {
  const src = (row ?? {}) as Record<string, unknown>;
  const rawName = blankRecordText(src.entered_by_name) ? '' : String(src.entered_by_name).trim();
  const name = rawName && !isCashMovementLabel(rawName) ? rawName : '';
  let id = '';
  for (const key of ['created_by', 'last_edited_by', 'approved_by'] as const) {
    const text = String(src[key] ?? '').trim();
    if (!blankRecordText(text)) {
      id = text;
      break;
    }
  }
  return { id, name };
}

/**
 * Kasa satırındaki kullanıcıyı gider kaydına taşır.
 * Dolu `created_by` ezilmez. Tutar değişmez.
 * Ad `entered_by_name`, kimlik `created_by` olur. İkisi de yoksa boş kalır.
 */
function applyCashLineActor(expense: Expense, line: KasaIslemi | null | undefined): Expense {
  if (!line) return expense;
  const actor = readCashLineActor(line);
  const next: Expense = { ...expense };
  if (blankRecordText(next.created_by) && actor.id) next.created_by = actor.id;
  if (blankRecordText(next.entered_by_name) && actor.name) next.entered_by_name = actor.name;
  return next;
}

/**
 * Bağlı kasa çıkışındaki fiş anahtarı, kayıt anı ve ekleyen kişiyi gider pusulasına taşır.
 * Belge no olduğu gibi kalır. Kasa fişi ledger_fiche_no olur. Tutar değişmez.
 * Kasa satırında alan yoksa boş kalır.
 */
function attachLinkedCashIdentity(expense: Expense, cashById: ReadonlyMap<string, KasaIslemi>): Expense {
  const linkedId = cashLineKey(expense.cash_line_id);
  if (!linkedId) return expense;
  const line = cashById.get(linkedId);
  if (!line) return expense;
  const next: Expense = { ...expense };
  const fiche = String(line.islem_no || '').trim();
  if (blankRecordText(next.ledger_fiche_no) && !blankRecordText(fiche)) {
    next.ledger_fiche_no = fiche;
  }
  if (blankRecordText(next.cash_register_id) && !blankRecordText(line.kasa_id)) {
    next.cash_register_id = String(line.kasa_id);
  }
  if (blankRecordText(next.created_at)) {
    const created = String(line.olusturma_tarihi || '').trim();
    if (created) next.created_at = created;
  }
  const cashCurrency = String(line.doviz_kodu || '').trim();
  if (cashCurrency) next.currency_code = cashCurrency;
  if (line.exchange_rate != null) {
    const rate = Number(line.exchange_rate);
    next.exchange_rate = Number.isFinite(rate) ? rate : null;
  }
  return applyCashLineActor(next, line);
}

function cashLineKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/**
 * Kasa fişi silinmiş gider aynası.
 * `cash_line_id` boşsa bağsız giderdir; durur.
 * Kimlik dolu ve kasa listesinde yoksa fiş silinmiştir.
 */
export function isOrphanCashExpenseMirror(
  expense: { cash_line_id?: string | null },
  cashLineIds: { has(id: string): boolean },
): boolean {
  const linkedId = cashLineKey(expense.cash_line_id);
  if (!linkedId) return false;
  return !cashLineIds.has(linkedId);
}

/** Expense + bağlanmamış kasa çıkışları → tek liste (detay modal / aggregasyon). */
export function mergeExpensesWithCashOuts(
  expenses: Expense[],
  cashLines: KasaIslemi[],
  options?: { allowedCashOutTypes?: Set<string>; omitOrphanCashMirrors?: boolean },
): Expense[] {
  const allExpenses = Array.isArray(expenses) ? expenses : [];
  const allowedTypes = options?.allowedCashOutTypes ?? REPORT_CASH_OUT_TYPES;

  const cashById = new Map<string, KasaIslemi>();
  for (const line of Array.isArray(cashLines) ? cashLines : []) {
    const id = cashLineKey(line.id);
    if (id) cashById.set(id, line);
  }

  // Boş kasa listesi (okuma hatası) aynayı düşürmez; fiş gerçekten silindiyse
  // listede başka satır varken kayıp cash_line_id rapordan çıkar.
  const omitOrphans = options?.omitOrphanCashMirrors === true && cashById.size > 0;
  const visibleExpenses = omitOrphans
    ? allExpenses.filter((expense) => !isOrphanCashExpenseMirror(expense, cashById))
    : allExpenses;

  const linkedCashIds = new Set(
    visibleExpenses
      .map((e) => cashLineKey(e.cash_line_id))
      .filter(Boolean),
  );
  const expenseDescKeys = new Set(
    visibleExpenses
      .map((e) => {
        const day = String(e.expense_date || '').slice(0, 10);
        const desc = normalizeGiderAciklama(e.description);
        return day && desc ? `${day}|${desc}` : '';
      })
      .filter(Boolean),
  );

  const unified: Expense[] = visibleExpenses.map((e) => attachLinkedCashIdentity(e, cashById));

  for (const cl of Array.isArray(cashLines) ? cashLines : []) {
    const type = String(cl.islem_tipi || '').trim().toUpperCase();
    if (!allowedTypes.has(type)) continue;
    if (
      isSalesReturnCashVoucher(type, cl.islem_aciklamasi)
      || isPurchaseReturnCashVoucher(type, cl.islem_aciklamasi)
    ) {
      continue;
    }
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
    if (!skipLinkedCheck && cl.id && linkedCashIds.has(cashLineKey(cl.id))) continue;
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
    const createdAt = String(cl.olusturma_tarihi || '').trim();
    unified.push(applyCashLineActor({
      id: `cash-${cl.id || `${day}-${type}-${amt}`}`,
      category: reportCashOutCategory(type),
      description: String(cl.islem_aciklamasi || cl.cari_hesap_unvani || '').trim(),
      amount: amt,
      currency_code: String(cl.doviz_kodu || '').trim() || null,
      exchange_rate: cl.exchange_rate != null && Number.isFinite(Number(cl.exchange_rate)) ? Number(cl.exchange_rate) : null,
      payment_method: 'cash',
      document_number: String(cl.islem_no || '').trim() || undefined,
      cash_register_id: cl.kasa_id || undefined,
      ledger_fiche_no: String(cl.islem_no || '').trim() || undefined,
      store_id: '',
      cost_center_name: String(cl.cari_hesap_unvani || '').trim() || undefined,
      expense_date: day,
      notes: type,
      created_by: '',
      created_at: createdAt || undefined,
      firm_nr: String(cl.firma_id || ''),
      cash_line_id: cl.id || null,
    } as Expense, cl));
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
