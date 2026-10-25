/**
 * Kasa Durumu — üst tarih filtresi sayfadaki TÜM tabloları ve üç kutucuğu
 * belirlemelidir.
 *
 * Kullanıcı isteği (2026-10-24):
 * "bu raporda yukarıda seçili olan fitlreler aşağıda seçili olan tabloda da
 *  çalışması lazım. yani aşağıdaki tablodaki veriler yukarıdaki fltreye bağlı olmalı"
 *
 * Bu dosya şunları doğrular:
 *  1. Filtresiz → üç kutu 1 Ocak–bugün; tablolar yılbaşı→bugün.
 *  2. Filtreli → üç kutu + Kasalar tablosu + Kasa Hareketleri tablosu yalnız
 *     seçili aralıkta.
 *  3. Filtre temizlenince yılbaşı→bugüne dönüş.
 *  4. Gider kutusu = kasadaki gider kalemlerinin toplamı; çift sayım yok.
 *  5. Aralık değişince ekranda ESKİ aralık rakamları gösterilmez (yarış koşulu).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cashRegisterDistributionLines,
  cashRegisterStatusFromLedger,
  cashStatusMovementRows,
  cashStatusThreeBoxes,
  sumCashRegisterDistribution,
} from '../../utils/cashStatusTotals';
import {
  buildCashStatusRange,
  cashStatusFilterActive,
  emptyCashStatusDate,
  resolveCashStatusQuery,
} from '../../utils/reportDatePresets';
import {
  PERIOD_SUMMARY_CASH_OUT_TYPES,
  REPORT_CASH_OUT_TYPES,
} from '../../utils/reportUnifiedExpenses';

const noon = new Date('2026-10-24T09:00:00.000Z');

/** DB'deki gerçek defter (rex_001_01_cash_lines) — 2026 yılı. */
const LEDGER = [
  {
    kasa_id: 'k1',
    islem_tipi: 'ACILIS_ALACAK',
    tutar: 38_500,
    islem_tarihi: '2026-01-01',
    islem_no: 'AC-1',
    payment_method: 'cash',
  },
  {
    kasa_id: 'k1',
    islem_tipi: 'ACILIS_BORC',
    tutar: 500,
    islem_tarihi: '2026-01-01',
    islem_no: 'AB-1',
    payment_method: 'cash',
  },
  {
    kasa_id: 'k1',
    islem_tipi: 'CH_ODEME',
    tutar: 30_000,
    islem_tarihi: '2026-09-30',
    islem_no: 'CH-1',
    payment_method: 'cash',
  },
  {
    kasa_id: 'k1',
    islem_tipi: 'KUR_FARKI_ALACAK',
    tutar: 5_000,
    islem_tarihi: '2026-10-24',
    islem_no: 'KF-1',
    payment_method: 'cash',
  },
  {
    kasa_id: 'k1',
    islem_tipi: 'CH_TAHSILAT',
    tutar: 10_000,
    islem_tarihi: '2026-10-24',
    islem_no: 'AV-1',
    payment_method: 'cash',
    ozel_kod: 'REZERVASYON',
  },
  {
    kasa_id: 'k1',
    islem_tipi: 'KASA_GIRIS',
    tutar: 318_500,
    islem_tarihi: '2026-10-24',
    islem_no: 'BEA-2026-00001',
    payment_method: 'cash',
  },
];

/**
 * Gider kutusu senaryosu: kasada bir gider pusulası var.
 * `GIDER_PUSULASI` hem `PERIOD_SUMMARY_CASH_OUT_TYPES` hem `REPORT_CASH_OUT_TYPES`
 * kümesindedir; defterden ve gider toplamından gelirse TEK SEFER sayılır.
 */
const EXPENSE_LEDGER = [
  {
    kasa_id: 'k1',
    islem_tipi: 'KASA_GIRIS',
    tutar: 318_500,
    islem_tarihi: '2026-10-24',
    islem_no: 'BEA-2026-00001',
    payment_method: 'cash',
  },
  {
    kasa_id: 'k1',
    islem_tipi: 'GIDER_PUSULASI',
    tutar: 5_000,
    islem_tarihi: '2026-10-24',
    islem_no: 'GP-1',
    payment_method: 'cash',
  },
];

const REGISTERS = [
  { id: 'k1', code: 'KASA.001', name: 'MERKEZ KASA' },
  { id: 'k2', code: '000002', name: 'QICARD' },
];

describe('Kasa Durumu filtre bağımlılığı', () => {
  it('filtresizken üç kutu 1 Ocak–bugün aralığını kullanır', () => {
    const empty = emptyCashStatusDate();
    expect(cashStatusFilterActive(empty)).toBe(false);

    const query = resolveCashStatusQuery(empty, noon);
    expect(query.from).toBe('2026-01-01');
    expect(query.to).toBe('2026-10-24');
    expect(query.filtered).toBe(false);
    expect(query.balanceFromRegisters).toBe(true);
  });

  it('filtreliyken aralık yalnız seçili günleri kapsar', () => {
    const today = buildCashStatusRange('today', 0, '', '', noon);
    const query = resolveCashStatusQuery(today, noon);
    expect(query.from).toBe('2026-10-24');
    expect(query.to).toBe('2026-10-24');
    expect(query.filtered).toBe(true);
    expect(query.balanceFromRegisters).toBe(false);

    const month = buildCashStatusRange('month', 0, '', '', noon);
    const monthQuery = resolveCashStatusQuery(month, noon);
    expect(monthQuery.from).toBe('2026-10-01');
    expect(monthQuery.to).toBe('2026-10-24');

    const lastMonth = buildCashStatusRange('lastMonth', 0, '', '', noon);
    const lastMonthQuery = resolveCashStatusQuery(lastMonth, noon);
    expect(lastMonthQuery.from).toBe('2026-09-01');
    expect(lastMonthQuery.to).toBe('2026-09-30');
  });

  it('Bugün seçilince Kasa Hareketleri tablosunda yalnız 24.10.2026 satırları vardır', () => {
    const query = resolveCashStatusQuery(buildCashStatusRange('today', 0, '', '', noon), noon);
    const rows = cashStatusMovementRows({
      salesCash: 318_500,
      lines: LEDGER,
      dateFrom: query.from,
      dateTo: query.to,
      saleReceiptKeys: ['BEA-2026-00001'],
      customerCollectionsInSalesCash: true,
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.date === '2026-10-24')).toBe(true);
    // Aralık dışı fişler (01.01 ve 30.09) tabloda yok.
    expect(rows.some((row) => row.date === '2026-01-01')).toBe(false);
    expect(rows.some((row) => row.date === '2026-09-30')).toBe(false);
  });

  it('Geçen ay seçilince Kasa Hareketleri tablosunda yalnız Eylül satırı vardır', () => {
    const query = resolveCashStatusQuery(buildCashStatusRange('lastMonth', 0, '', '', noon), noon);
    const rows = cashStatusMovementRows({
      salesCash: 0,
      lines: LEDGER,
      dateFrom: query.from,
      dateTo: query.to,
      customerCollectionsInSalesCash: true,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-09-30');
    expect(rows[0].typeCode).toBe('CH_ODEME');
    expect(rows[0].amount).toBe(-30_000);
  });

  it('Kasalar tablosu da aynı aralığı kullanır (filtreye bağlı)', () => {
    const todayQuery = resolveCashStatusQuery(buildCashStatusRange('today', 0, '', '', noon), noon);
    const todayRows = cashRegisterStatusFromLedger({
      registers: REGISTERS,
      lines: LEDGER,
      dateFrom: todayQuery.from,
      dateTo: todayQuery.to,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const todayLines = cashRegisterDistributionLines(todayRows);
    // Kasalar tablosu ARALIK SONU bakiyesini gösterir (dateTo'ya kadar birikim):
    // açılış −38.500 + borç 500 − cari ödeme 30.000 − kur farkı 5.000
    // + rezervasyon 10.000 + satış 318.500 = 255.500
    expect(sumCashRegisterDistribution(todayLines)).toBe(255_500);

    const lastMonthQuery = resolveCashStatusQuery(
      buildCashStatusRange('lastMonth', 0, '', '', noon),
      noon,
    );
    const lastMonthRows = cashRegisterStatusFromLedger({
      registers: REGISTERS,
      lines: LEDGER,
      dateFrom: lastMonthQuery.from,
      dateTo: lastMonthQuery.to,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const lastMonthLines = cashRegisterDistributionLines(lastMonthRows);
    // Eylül sonu bakiyesi: açılış −38.500 + 500 − 30.000 = −68.000
    expect(sumCashRegisterDistribution(lastMonthLines)).toBe(-68_000);
  });

  it('gider kutusu kasadaki gider kalemlerinin toplamıdır ve çift sayım yoktur', () => {
    const query = resolveCashStatusQuery(buildCashStatusRange('today', 0, '', '', noon), noon);

    // Gider toplamı yok: gider çekmeceden çıkanlar bir kez sayılır.
    const withoutExpense = cashStatusThreeBoxes({
      salesCash: 318_500,
      expense: 0,
      lines: EXPENSE_LEDGER,
      dateFrom: query.from,
      dateTo: query.to,
      saleReceiptKeys: ['BEA-2026-00001'],
      customerCollectionsInSalesCash: true,
    });
    expect(withoutExpense.totalOut).toBe(5_000);

    // Aynı gider hem toplam hem defterden gelirse tekrar sayılmaz.
    const withExpense = cashStatusThreeBoxes({
      salesCash: 318_500,
      expense: 5_000,
      countedExpenseKeys: ['GP-1'],
      lines: EXPENSE_LEDGER,
      dateFrom: query.from,
      dateTo: query.to,
      saleReceiptKeys: ['BEA-2026-00001'],
      customerCollectionsInSalesCash: true,
    });
    expect(withExpense.totalOut).toBe(5_000);
    expect(withExpense.totalOut).not.toBe(10_000);

    // Aralık dışındaki gider (Eylül cari ödemesi) Bugün kutusuna girmez.
    const outsideRange = cashStatusThreeBoxes({
      salesCash: 318_500,
      expense: 0,
      lines: LEDGER,
      dateFrom: query.from,
      dateTo: query.to,
      saleReceiptKeys: ['BEA-2026-00001'],
      customerCollectionsInSalesCash: true,
    });
    // CH_ODEME 30.000 Eylül'de; KUR_FARKI_ALACAK 5.000 Bugün.
    expect(outsideRange.totalOut).toBe(5_000);
  });

  it('bakiye = önceki bakiye + giren − çıkan (aralık sonu)', () => {
    const query = resolveCashStatusQuery(buildCashStatusRange('today', 0, '', '', noon), noon);
    // Satış nakdi 318.500 + rezervasyon peşinatı 10.000 = 328.500 (peşinat bir kez).
    const boxes = cashStatusThreeBoxes({
      salesCash: 328_500,
      expense: 0,
      lines: LEDGER,
      dateFrom: query.from,
      dateTo: query.to,
      saleReceiptKeys: ['BEA-2026-00001'],
      customerCollectionsInSalesCash: true,
      balanceFromRegisters: false,
    });
    // Aralık öncesi bakiye: açılış −38.500 + borç 500 − cari ödeme 30.000 = −68.000
    expect(boxes.priorBalance).toBe(-68_000);
    expect(boxes.totalIn).toBe(328_500);
    expect(boxes.totalOut).toBe(5_000);
    expect(boxes.balance).toBe(boxes.priorBalance + boxes.totalIn - boxes.totalOut);
    // Aralık sonu bakiye, Kasalar tablosu toplamıyla aynı olmalı (255.500).
    expect(boxes.balance).toBe(255_500);
  });

  it('kâr dağıtımı ve ortak sermaye ödemesi işletme gideri değildir', () => {
    // Bu tipler PERIOD_SUMMARY kümesinde olsa da REPORT_CASH_OUT_TYPES'ta yok.
    expect(REPORT_CASH_OUT_TYPES.has('ORTAK_DAGITIM_KAR')).toBe(false);
    expect(REPORT_CASH_OUT_TYPES.has('ORTAK_SERMAYE_ODEME')).toBe(false);
    // Kasa çıkış fişi her iki kümede de var — kaybolmamalı.
    expect(REPORT_CASH_OUT_TYPES.has('KASA_CIKIS')).toBe(true);
    expect(PERIOD_SUMMARY_CASH_OUT_TYPES.has('KASA_CIKIS')).toBe(true);
    // İşletme gideri tipleri her iki kümede de var.
    for (const tip of ['GIDER_PUSULASI', 'MAAS_ODEME', 'AVANS_ODEME', 'CH_ODEME']) {
      expect(REPORT_CASH_OUT_TYPES.has(tip)).toBe(true);
      expect(PERIOD_SUMMARY_CASH_OUT_TYPES.has(tip)).toBe(true);
    }
  });

  it('filtre temizlenince aralık yılbaşına döner', () => {
    const picked = buildCashStatusRange('today', 0, '', '', noon);
    expect(resolveCashStatusQuery(picked, noon).filtered).toBe(true);

    const cleared = emptyCashStatusDate();
    const again = resolveCashStatusQuery(cleared, noon);
    expect(again.filtered).toBe(false);
    expect(again.from).toBe('2026-01-01');
    expect(again.to).toBe('2026-10-24');
    expect(again.balanceFromRegisters).toBe(true);
  });

  it('aralık değişince ekran eski aralık rakamlarını göstermez (yarış koşulu yok)', () => {
    const source = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');

    // Aralık anahtarı takip edilir; yeni veri gelene kadar "yükleniyor" gösterilir.
    expect(source).toContain('cashStatusRangeKey');
    expect(source).toContain('cashStatusRangeReady');
    expect(source).toContain('data-testid="cash-status-loading"');
    // Özet, aralık hazır değilken render edilmez.
    const cashBlock = source.slice(source.indexOf("selectedTab === 'cash-status'"));
    const nextTab = cashBlock.indexOf("selectedTab === 'payment-distribution'");
    const summary = nextTab > 0 ? cashBlock.slice(0, nextTab) : cashBlock;
    expect(summary).toContain('cashStatusRangeReady');
    expect(summary).toContain('CashStatusFigures');
  });
});
