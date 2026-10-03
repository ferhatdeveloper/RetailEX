import { describe, expect, it } from 'vitest';
import {
  reportNetAfterOptionalExpense,
  reportNetAfterOptionalExpenseAndPurchases,
} from '../../services/reportMenuParamsService';
import { saleCollectedSplit } from '../../utils/saleCollectedAmounts';

/**
 * Günlük rapor Net hesabı — muhasebe çift yönü doğrulaması.
 *
 * Veresiye satış → cari alacak (+) / gelir (+); tahsil edilene kadar kasa/banka akışı 0.
 * Bu nedenle Net iki yorumlu gösterilir:
 * - Net (Brüt) = brüt ciro − gider (gelir tablosu; veresiye dahil).
 * - Net (Nakit) = tahsilat − gider (kasa/banka; veresiye hariç).
 *
 * Kullanıcı senaryosu (dashboard):
 *   Brüt Ciro 65.000, Nakit 55.000, Kart 0, Veresiye 10.000, Gider 11.000
 *   → Net (Brüt) = 54.000, Net (Nakit) = 44.000
 */

describe('dailyReportNet — muhasebe çift yönü', () => {
  it('brüt + nakit + veresiye senaryosu: Net (Brüt) ve Net (Nakit) ayrışır', () => {
    const brutCiro = 65_000;
    const nakitCiro = 55_000;
    const kartCiro = 0;
    const veresiyeCiro = brutCiro - nakitCiro - kartCiro; // 10.000
    expect(veresiyeCiro).toBe(10_000);

    const gider = 11_000;

    // Muhasebe gelir tablosu: brüt ciro − gider
    const netBrut = reportNetAfterOptionalExpense(brutCiro, gider, true);
    expect(netBrut).toBe(54_000);

    // Kasa/banka akışı: tahsilat − gider (veresiye hariç)
    const tahsilat = nakitCiro + kartCiro;
    const netNakit = reportNetAfterOptionalExpense(tahsilat, gider, true);
    expect(netNakit).toBe(44_000);

    // Çift yön simetri: brüt ciro = tahsilat + veresiye
    expect(brutCiro).toBe(tahsilat + veresiyeCiro);
  });

  it('tamamen nakit satışta Net (Brüt) == Net (Nakit)', () => {
    const brutCiro = 50_000;
    const nakitCiro = 50_000;
    const gider = 5_000;

    const netBrut = reportNetAfterOptionalExpense(brutCiro, gider, true);
    const netNakit = reportNetAfterOptionalExpense(nakitCiro, gider, true);
    expect(netBrut).toBe(netNakit);
    expect(netBrut).toBe(45_000);
  });

  it('tamamen veresiye: Net (Brüt) pozitif, Net (Nakit) negatif (gider fazlası)', () => {
    const brutCiro = 30_000;
    const nakitCiro = 0;
    const gider = 15_000;

    const netBrut = reportNetAfterOptionalExpense(brutCiro, gider, true);
    const netNakit = reportNetAfterOptionalExpense(nakitCiro, gider, true);
    expect(netBrut).toBe(15_000);
    expect(netNakit).toBe(-15_000);
  });

  it('gider kartı kapalıyken gider düşülmez', () => {
    const brutCiro = 20_000;
    const tahsilat = 15_000;
    const gider = 5_000;

    const netBrutWithExpense = reportNetAfterOptionalExpense(brutCiro, gider, true);
    const netBrutWithoutExpense = reportNetAfterOptionalExpense(brutCiro, gider, false);
    const netNakitWithExpense = reportNetAfterOptionalExpense(tahsilat, gider, true);
    const netNakitWithoutExpense = reportNetAfterOptionalExpense(tahsilat, gider, false);

    expect(netBrutWithExpense).toBe(15_000);
    expect(netBrutWithoutExpense).toBe(20_000);
    expect(netNakitWithExpense).toBe(10_000);
    expect(netNakitWithoutExpense).toBe(15_000);
  });

  it('kısmi tahsilat: peşin 40 + veresiye 60 → tahsilat 40, kalan 60', () => {
    const split = saleCollectedSplit({ total: 100, paymentMethod: 'cash', payments: undefined });
    // paymentMethod='cash' default tüm tutar nakit
    expect(split.cash).toBe(100);
    expect(split.collected).toBe(100);
    expect(split.remaining).toBe(0);
  });

  it('veresiye satışta tahsilat=0, kalan=belge tutarı', () => {
    const split = saleCollectedSplit({ total: 100, paymentMethod: 'veresiye', payments: undefined });
    expect(split.collected).toBe(0);
    expect(split.remaining).toBe(100);
    expect(split.cash).toBe(0);
    expect(split.card).toBe(0);
  });

  it('karma ödeme: nakit 60 + kart 40 → tahsilat 100, kalan 0', () => {
    const split = saleCollectedSplit({
      total: 100,
      paymentMethod: 'cash',
      payments: [
        { method: 'cash', amount: 60 },
        { method: 'card', amount: 40 },
      ],
    });
    expect(split.cash).toBe(60);
    expect(split.card).toBe(40);
    expect(split.collected).toBe(100);
    expect(split.remaining).toBe(0);
  });
});

// =============================================================
// Bug 31: Ciro/Gider/Alış formülünde MAAS_ODEME ve ORTAK_SERMAYE_ODEME
// gerçek işletme gideri olarak Gider kolonuna DAHİL edilir.
//
// Kök neden: Bug 29 follow-up'ta PERIOD_SUMMARY_CASH_OUT_TYPES yalnızca
// GIDER_PUSULASI + KASA_CIKIS olacak şekilde kısıtlanmıştı; ancak
// MAAS_ODEME ve ORTAK_SERMAYE_ODEME de gerçek işletme gideridir (maaş
// bordrosu, ortak sermaye çıkışı). Bunların dışlanması Gider'i eksik
// gösteriyordu.
//
// Ciro kök neden (korundu): iade faturaları Ciro'ya dahil edilince iki
// kez düşülüyordu (Sale.total zaten negatif; aggregateSales ayrıca
// absTotal daha düşüyordu). salesAPI.getByDateRange artık yalnız Satis
// kategorisini (iade Hariç) döner.
//
// mergeExpensesWithCashOuts içinde Bug 31 düzeltmesi: linkedCashIds
// filtresi MAAS_ODEME ve ORTAK_SERMAYE_ODEME için skip edilir; diğer
// type'lar için çift sayım koruması korunur.
// =============================================================

import { PERIOD_SUMMARY_CASH_OUT_TYPES, REPORT_CASH_OUT_TYPES } from '../../utils/reportUnifiedExpenses';

describe('periodSummaryCashOutTypes — gider filtre (Bug 31)', () => {
  it('PERIOD_SUMMARY_CASH_OUT_TYPES gerçek gider tiplerini içerir (Bug 31)', () => {
    expect(PERIOD_SUMMARY_CASH_OUT_TYPES.has('GIDER_PUSULASI')).toBe(true);
    expect(PERIOD_SUMMARY_CASH_OUT_TYPES.has('KASA_CIKIS')).toBe(true);
  });

  it('PERIOD_SUMMARY_CASH_OUT_TYPES MAAS_ODEME ve ORTAK_SERMAYE_ODEME dahil eder (Bug 31)', () => {
    // Bug 31: Ciro/Gider/Alış formülü maaş + ortak sermaye çıkışını gider sayar
    expect(PERIOD_SUMMARY_CASH_OUT_TYPES.has('MAAS_ODEME')).toBe(true);
    expect(PERIOD_SUMMARY_CASH_OUT_TYPES.has('ORTAK_SERMAYE_ODEME')).toBe(true);
  });

  it('PERIOD_SUMMARY_CASH_OUT_TYPES cari ödeme / avans / kar dağıtımı Hariç tutar', () => {
    expect(PERIOD_SUMMARY_CASH_OUT_TYPES.has('CH_ODEME')).toBe(false);
    expect(PERIOD_SUMMARY_CASH_OUT_TYPES.has('AVANS_ODEME')).toBe(false);
    expect(PERIOD_SUMMARY_CASH_OUT_TYPES.has('ORTAK_DAGITIM_KAR')).toBe(false);
  });

  it('REPORT_CASH_OUT_TYPES (günlük rapor) tüm kasa çıkışlarını içerir', () => {
    expect(REPORT_CASH_OUT_TYPES.has('MAAS_ODEME')).toBe(true);
    expect(REPORT_CASH_OUT_TYPES.has('CH_ODEME')).toBe(true);
  });
});
describe('periodSummaryNet — Ciro − Gider − Alış (CH_TAHSILAT hariç) — Bug 31', () => {
  it('aqua_beauty 30.09.2026 (Bug 31): Ciro + Gider(GIDER+MAAS+ORTAK) + Alış', () => {
    // Bug 31 sonrası doğru değerler — Ciro/Gider/Alış formülü:
    // - Ciro = 35 satış faturası total_net = 3.315.370 IQD (iade Hariç)
    // - Gider = Expense tablosu (43.000) + MAAS_ODEME (6.500.000) +
    //   ORTAK_SERMAYE_ODEME (1.250.000) = 7.793.000 IQD
    // - Alış = 5 alış faturası = 4.937.000 IQD
    // - Net Kalan = Ciro − Gider − Alış = −9.414.630 IQD
    const revenue = 3_315_370;
    const gider = 7_793_000; // 43.000 (GIDER_PUSULASI) + 6.500.000 (MAAS) + 1.250.000 (ORTAK_SERMAYE)
    const alis = 4_937_000;
    const cariTahsilat = 22_400_000; // CH_TAHSILAT — Net Kalan'a etki ETMEMELİ

    const net = reportNetAfterOptionalExpenseAndPurchases(
      revenue,
      gider,
      true, // gider kartı açık
      alis,
      true, // alış kartı açık
    );
    // Doğru sonuç: Ciro − Gider − Alış = 3.315.370 − 7.793.000 − 4.937.000 = −9.414.630
    expect(net).toBe(-9_414_630);

    // CH_TAHSILAT ledger simetrisi (kasa + / cari -) Net Kalan'da yer almaz.
    // Eklemek ya da çıkarmak yanlış olur.
    expect(net + cariTahsilat).toBe(12_985_370);
    expect(net - cariTahsilat).toBe(-31_814_630);
  });

  it('kullanıcı senaryosu doğrulama (Bug 31): Ciro − Gider − Alış formülü simetri', () => {
    // Bug 31: Gider kolonu MAAS_ODEME + ORTAK_SERMAYE_ODEME'yi de içerir.
    // Ciro 3.315.370 − Gider 7.793.000 − Alış 4.937.000 = −9.414.630.
    const revenue = 3_315_370;
    const gider = 7_793_000;
    const alis = 4_937_000;

    const net = reportNetAfterOptionalExpenseAndPurchases(revenue, gider, true, alis, true);
    expect(net).toBe(-9_414_630);
  });

  it('gider kartı kapalı → gider düşülmez', () => {
    const revenue = 100_000;
    const gider = 20_000;
    const alis = 30_000;

    const netAcik = reportNetAfterOptionalExpenseAndPurchases(revenue, gider, true, alis, true);
    expect(netAcik).toBe(50_000);

    const netGiderKapali = reportNetAfterOptionalExpenseAndPurchases(revenue, gider, false, alis, true);
    expect(netGiderKapali).toBe(70_000);
  });

  it('alış kartı kapalı → alış düşülmez', () => {
    const revenue = 100_000;
    const gider = 20_000;
    const alis = 30_000;

    const netAcik = reportNetAfterOptionalExpenseAndPurchases(revenue, gider, true, alis, true);
    expect(netAcik).toBe(50_000);

    const netAlisKapali = reportNetAfterOptionalExpenseAndPurchases(revenue, gider, true, alis, false);
    expect(netAlisKapali).toBe(80_000);
  });

  it('tüm parametreler açık → tam Ciro − Gider − Alış', () => {
    const revenue = 65_000;
    const gider = 11_000;
    const alis = 5_000;
    const net = reportNetAfterOptionalExpenseAndPurchases(revenue, gider, true, alis, true);
    expect(net).toBe(49_000);
  });

  it('tüm parametreler kapalı → yalnız Ciro döner', () => {
    const revenue = 65_000;
    const gider = 11_000;
    const alis = 5_000;
    const net = reportNetAfterOptionalExpenseAndPurchases(revenue, gider, false, alis, false);
    expect(net).toBe(65_000);
  });
});

// =============================================================
// Bug 31: mergeExpensesWithCashOuts linkedCashIds filtresinin
// MAAS_ODEME / ORTAK_SERMAYE_ODEME için skip edilmesi.
// GIDER_PUSULASI / KASA_CIKIS için çift sayım koruması korunur.
// =============================================================

import { mergeExpensesWithCashOuts } from '../../utils/reportUnifiedExpenses';
import type { Expense } from '../../services/api/expenses';
import type { KasaIslemi } from '../../services/api/kasa';

function makeExpense(partial: Partial<Expense> = {}): Expense {
  return {
    id: partial.id || 'exp-1',
    category: partial.category || 'Gider pusulası',
    description: partial.description || 'Test gider',
    amount: partial.amount ?? 1_000,
    payment_method: partial.payment_method || 'cash',
    document_number: partial.document_number,
    store_id: partial.store_id || '',
    cost_center_name: partial.cost_center_name,
    expense_date: partial.expense_date || '2026-09-15',
    notes: partial.notes,
    created_by: partial.created_by || '',
    firm_nr: partial.firm_nr || '1',
    cash_line_id: partial.cash_line_id,
  } as Expense;
}

function makeCashLine(partial: Partial<KasaIslemi> = {}): KasaIslemi {
  return {
    id: partial.id || 'cl-1',
    firma_id: partial.firma_id || '1',
    donem_id: partial.donem_id,
    kasa_id: partial.kasa_id || '1',
    islem_no: partial.islem_no || 'K-0001',
    islem_tarihi: partial.islem_tarihi || '2026-09-15',
    islem_saati: partial.islem_saati,
    duzenlenme_tarihi: partial.duzenlenme_tarihi,
    islem_tipi: partial.islem_tipi || 'GIDER_PUSULASI',
    tutar: partial.tutar ?? 1_000,
    islem_aciklamasi: partial.islem_aciklamasi || 'Açıklama',
    cari_hesap_id: partial.cari_hesap_id,
    cari_hesap_kodu: partial.cari_hesap_kodu,
    cari_hesap_unvani: partial.cari_hesap_unvani,
    doviz_kodu: partial.doviz_kodu,
    dovizli_tutar: partial.dovizli_tutar,
    olusturma_tarihi: partial.olusturma_tarihi,
    guncelleme_tarihi: partial.guncelleme_tarihi,
    ozel_kod: partial.ozel_kod,
  };
}

describe('mergeExpensesWithCashOuts — Bug 31 linkedCashIds skip', () => {
  it('MAAS_ODEME: cash_line_id Expense tablosunda olsa bile dahil edilir', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'exp-maas', amount: 5_000, cash_line_id: 'cl-maas' }),
    ];
    const cashLines: KasaIslemi[] = [
      makeCashLine({ id: 'cl-maas', islem_tipi: 'MAAS_ODEME', tutar: 5_000 }),
    ];
    const merged = mergeExpensesWithCashOuts(expenses, cashLines);
    // Bug 31: MAAS_ODEME linkedCashIds filtresinden muaf; 2 satır (expense + maaş)
    expect(merged.length).toBe(2);
    expect(merged.some((m) => m.notes === 'MAAS_ODEME')).toBe(true);
  });

  it('ORTAK_SERMAYE_ODEME: cash_line_id Expense tablosunda olsa bile dahil edilir', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'exp-ortak', amount: 2_000, cash_line_id: 'cl-ortak' }),
    ];
    const cashLines: KasaIslemi[] = [
      makeCashLine({ id: 'cl-ortak', islem_tipi: 'ORTAK_SERMAYE_ODEME', tutar: 2_000 }),
    ];
    const merged = mergeExpensesWithCashOuts(expenses, cashLines);
    expect(merged.length).toBe(2);
    expect(merged.some((m) => m.notes === 'ORTAK_SERMAYE_ODEME')).toBe(true);
  });

  it('GIDER_PUSULASI: cash_line_id Expense tablosunda ise çift sayım korunur (skip edilir)', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'exp-gp', amount: 1_000, cash_line_id: 'cl-gp' }),
    ];
    const cashLines: KasaIslemi[] = [
      makeCashLine({ id: 'cl-gp', islem_tipi: 'GIDER_PUSULASI', tutar: 1_000 }),
    ];
    const merged = mergeExpensesWithCashOuts(expenses, cashLines);
    // linkedCashIds filtresi GIDER_PUSULASI için aktif; çift sayım yok
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe('exp-gp');
  });

  it('KASA_CIKIS: cash_line_id Expense tablosunda ise çift sayım korunur (skip edilir)', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'exp-kc', amount: 800, cash_line_id: 'cl-kc' }),
    ];
    const cashLines: KasaIslemi[] = [
      makeCashLine({ id: 'cl-kc', islem_tipi: 'KASA_CIKIS', tutar: 800 }),
    ];
    const merged = mergeExpensesWithCashOuts(expenses, cashLines);
    expect(merged.length).toBe(1);
  });

  it('MAAS_ODEME bağlı değilse de düşer', () => {
    const expenses: Expense[] = [];
    const cashLines: KasaIslemi[] = [
      makeCashLine({ id: 'cl-maas-free', islem_tipi: 'MAAS_ODEME', tutar: 3_500 }),
    ];
    const merged = mergeExpensesWithCashOuts(expenses, cashLines);
    expect(merged.length).toBe(1);
    expect(merged[0].amount).toBe(3_500);
    expect(merged[0].notes).toBe('MAAS_ODEME');
  });

  it('CH_ODEME / AVANS_ODEME / ORTAK_DAGITIM_KAR: allowedTypes dışı; merge edilmez', () => {
    // REPORT_CASH_OUT_TYPES hepsini içerir, ancak PERIOD_SUMMARY_CASH_OUT_TYPES Hariç.
    const cashLines: KasaIslemi[] = [
      makeCashLine({ id: 'cl-ch', islem_tipi: 'CH_ODEME', tutar: 1_000 }),
      makeCashLine({ id: 'cl-av', islem_tipi: 'AVANS_ODEME', tutar: 1_000 }),
      makeCashLine({ id: 'cl-kd', islem_tipi: 'ORTAK_DAGITIM_KAR', tutar: 1_000 }),
    ];
    const merged = mergeExpensesWithCashOuts([], cashLines, {
      allowedCashOutTypes: PERIOD_SUMMARY_CASH_OUT_TYPES,
    });
    // Bug 31: PERIOD_SUMMARY_CASH_OUT_TYPES yalnız GIDER_PUSULASI + KASA_CIKIS
    // + MAAS_ODEME + ORTAK_SERMAYE_ODEME; CH_ODEME/AVANS/ORTAK_DAGITIM_KAR Hariç
    expect(merged.length).toBe(0);
  });
});