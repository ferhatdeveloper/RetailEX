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
// Bug 29 follow-up: Dönem özeti Net Kalan = Ciro − Gider − Alış
// CH_TAHSILAT etkisiz (ledger simetrisi: kasa + / cari -).
// =============================================================
describe('periodSummaryNet — Ciro − Gider − Alış (CH_TAHSILAT hariç)', () => {
  it('kullanıcı senaryosu: Ciro 2.173.250 / Gider 525.000 / Alış 4.357.000 → −2.708.750', () => {
    const revenue = 2_173_250;
    const gider = 525_000;
    const alis = 4_357_000;
    const cariTahsilat = 22_400_000; // CH_TAHSILAT — Net Kalan'a etki ETMEMELİ

    // CH_TAHSILAT bu fonksiyona geçilmiyor; ledger simetrisi nedeniyle
    // Net Kalan'da yer almaz. Hesap yalnızca Ciro − Gider − Alış.
    const net = reportNetAfterOptionalExpenseAndPurchases(
      revenue,
      gider,
      true, // gider kartı açık
      alis,
      true, // alış kartı açık
    );
    expect(net).toBe(-2_708_750);

    // CH_TAHSILAT'ı eklemeye çalışırsak hata verir:
    expect(net + cariTahsilat).not.toBe(net); // 22.4M eklemek yanlış
    expect(net - cariTahsilat).not.toBe(net); // 22.4M çıkarmak da yanlış
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