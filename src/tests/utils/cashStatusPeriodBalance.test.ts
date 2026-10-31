/**
 * Kasa Durumu yeşil kutu ve kasa içindeki tutar, giren/çıkan ile aynı aralığın
 * hareket netidir. Aralık öncesi açılış eklenmez. İki kasanın toplamı kutuya eşittir.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleTranslations } from '../../locales/module-translations';
import {
  cashStatusMovementNet,
  cashStatusMovementRows,
  cashStatusPeriodRegisterLines,
  cashStatusThreeBoxes,
  sumCashRegisterDistribution,
} from '../../utils/cashStatusTotals';
import {
  buildCashStatusRange,
  cashStatusBalanceHintKey,
  emptyCashStatusDate,
  resolveCashStatusQuery,
} from '../../utils/reportDatePresets';

const noon = new Date('2026-10-24T09:00:00.000Z');

const REGISTERS = [
  { id: 'k1', code: 'KASA.001', name: 'MERKEZ KASA' },
  { id: 'k2', code: 'KASA.002', name: 'ŞUBE KASA' },
];

function line(
  no: string,
  day: string,
  amount: number,
  registerId = 'k1',
  tip?: string,
  extra?: Record<string, unknown>,
) {
  const kind = tip || (amount >= 0 ? 'KASA_GIRIS' : 'KASA_CIKIS');
  return {
    kasa_id: registerId,
    islem_tipi: kind,
    tutar: Math.abs(amount),
    islem_tarihi: day,
    payment_method: 'cash',
    islem_no: no,
    ...extra,
  };
}

const YEAR_LINES = [
  line('ONCE', '2025-12-20', 20_000),
  line('AVANS', '2026-04-01', 15_000, 'k1', 'CH_TAHSILAT', { ozel_kod: 'REZERVASYON' }),
  line('SATIS', '2026-03-01', 85_000),
  line('GIDER', '2026-05-01', -20_000, 'k1', 'GIDER_PUSULASI'),
  line('CIKIS', '2026-06-01', -35_500),
  line('SONRA', '2027-01-02', 9_000),
];

function scoped(from: string, to: string, lines = YEAR_LINES) {
  const movements = cashStatusMovementRows({
    lines,
    dateFrom: from,
    dateTo: to,
    customerCollectionsInSalesCash: true,
    registerNames: { k1: 'MERKEZ KASA', k2: 'ŞUBE KASA' },
    registerCodes: { k1: 'KASA.001', k2: 'KASA.002' },
  });
  const boxes = cashStatusThreeBoxes({
    salesCash: 999_999,
    reservation: 15_000,
    expense: 20_000,
    lines,
    dateFrom: from,
    dateTo: to,
    customerCollectionsInSalesCash: true,
    countLedgerInflows: true,
  });
  const registerLines = cashStatusPeriodRegisterLines({
    movements,
    registers: REGISTERS,
    unassignedLabel: 'Kasaya bağlanmayan',
  });
  const balance = cashStatusMovementNet(movements);
  return { movements, boxes, registerLines, balance };
}

describe('Kasa Durumu aralık bakiyesi', () => {
  it('tarih yoksa bakiye ve içindeki tutar yıl hareket netidir', () => {
    const query = resolveCashStatusQuery(emptyCashStatusDate(), noon);
    expect(query.from).toBe('2026-01-01');
    expect(query.to).toBe('2026-12-31');
    expect(query.filtered).toBe(false);

    const { movements, boxes, registerLines, balance } = scoped(query.from, query.to);
    expect(boxes.totalIn).toBe(100_000);
    expect(boxes.totalOut).toBe(55_500);
    expect(balance).toBe(boxes.totalIn - boxes.totalOut);
    expect(balance).toBe(44_500);
    expect(boxes.priorBalance).not.toBe(0);
    expect(balance).not.toBe(boxes.priorBalance + boxes.totalIn - boxes.totalOut);
    expect(movements.some((row) => row.ficheNo === 'ONCE' || row.ficheNo === 'SONRA')).toBe(false);
    expect(movements.some((row) => row.ficheNo === 'AVANS')).toBe(true);
    expect(movements.some((row) => row.ficheNo === 'GIDER')).toBe(true);

    const merkez = registerLines.find((row) => row.id === 'k1');
    const sube = registerLines.find((row) => row.id === 'k2');
    expect(merkez?.label).toBe('KASA.001 — MERKEZ KASA');
    expect(merkez?.amount).toBe(44_500);
    expect(sube?.amount).toBe(0);
    expect(sumCashRegisterDistribution(registerLines)).toBe(balance);
    expect(movements.reduce((sum, row) => sum + row.amount, 0)).toBe(balance);

    const hintKey = cashStatusBalanceHintKey(query.filtered);
    expect(hintKey).toBe('cashStatusBalanceTodayHint');
    expect(moduleTranslations[hintKey].tr).toBe('Kasa güncel bakiyesi');
  });

  it('hazır aralık ve elle girilen tarih yalnız o aralığın netini yazar', () => {
    const today = resolveCashStatusQuery(buildCashStatusRange('today', 0, '', '', noon), noon);
    const todayScope = scoped(today.from, today.to, [
      ...YEAR_LINES,
      line('BUGUN', '2026-10-24', 7_000),
    ]);
    expect(today.filtered).toBe(true);
    expect(todayScope.boxes.totalIn).toBe(7_000);
    expect(todayScope.boxes.totalOut).toBe(0);
    expect(todayScope.balance).toBe(7_000);
    expect(todayScope.balance).toBe(todayScope.boxes.totalIn - todayScope.boxes.totalOut);
    expect(todayScope.registerLines.find((row) => row.id === 'k1')?.amount).toBe(7_000);
    expect(sumCashRegisterDistribution(todayScope.registerLines)).toBe(todayScope.balance);
    expect(todayScope.balance).not.toBe(44_500);

    const month = resolveCashStatusQuery(buildCashStatusRange('month', 0, '', '', noon), noon);
    const monthScope = scoped(month.from, month.to, [
      ...YEAR_LINES,
      line('AY', '2026-10-02', -2_500),
    ]);
    expect(month.filtered).toBe(true);
    expect(monthScope.balance).toBe(monthScope.boxes.totalIn - monthScope.boxes.totalOut);
    expect(sumCashRegisterDistribution(monthScope.registerLines)).toBe(monthScope.balance);

    const manual = resolveCashStatusQuery(
      buildCashStatusRange('custom', 0, '2026-05-01', '2026-06-01', noon),
      noon,
    );
    const manualScope = scoped(manual.from, manual.to);
    expect(manual.filtered).toBe(true);
    expect(manual.from).toBe('2026-05-01');
    expect(manual.to).toBe('2026-06-01');
    expect(manualScope.boxes.totalIn).toBe(0);
    expect(manualScope.boxes.totalOut).toBe(55_500);
    expect(manualScope.balance).toBe(-55_500);
    expect(manualScope.registerLines.find((row) => row.id === 'k1')?.amount).toBe(-55_500);
    expect(sumCashRegisterDistribution(manualScope.registerLines)).toBe(manualScope.balance);

    const rangeHint = moduleTranslations[cashStatusBalanceHintKey(true)].tr;
    const currentHint = moduleTranslations[cashStatusBalanceHintKey(false)].tr;
    expect(cashStatusBalanceHintKey(today.filtered)).toBe('cashStatusBalanceRangeHint');
    expect(cashStatusBalanceHintKey(month.filtered)).toBe('cashStatusBalanceRangeHint');
    expect(cashStatusBalanceHintKey(manual.filtered)).toBe('cashStatusBalanceRangeHint');
    expect(rangeHint).not.toBe(currentHint);
    expect(rangeHint.toLocaleLowerCase('tr-TR')).not.toContain('güncel');
    expect(rangeHint).toBe('Seçili aralıktaki kasa bakiyesi');
  });

  it('tarih temizlenince yine yıl neti ve güncel kasa yazısı döner', () => {
    const picked = resolveCashStatusQuery(buildCashStatusRange('today', 0, '', '', noon), noon);
    expect(cashStatusBalanceHintKey(picked.filtered)).toBe('cashStatusBalanceRangeHint');
    const again = resolveCashStatusQuery(emptyCashStatusDate(), noon);
    expect(again.filtered).toBe(false);
    expect(again.from).toBe('2026-01-01');
    expect(again.to).toBe('2026-12-31');
    const year = scoped(again.from, again.to);
    expect(year.balance).toBe(44_500);
    expect(moduleTranslations[cashStatusBalanceHintKey(again.filtered)].tr).toBe('Kasa güncel bakiyesi');
  });

  it('iki kasanın içindeki tutar toplanınca yeşil kutuya eşittir', () => {
    const query = resolveCashStatusQuery(emptyCashStatusDate(), noon);
    const lines = [
      line('G1', '2026-02-01', 30_000, 'k1'),
      line('G2', '2026-02-02', 10_000, 'k2'),
      line('C1', '2026-03-01', -5_000, 'k1'),
      line('ONCE', '2025-11-01', 80_000, 'k1'),
      {
        kasa_id: 'k1',
        target_register_id: 'k2',
        islem_tipi: 'VIRMAN',
        tutar: 7_000,
        sign: -1,
        islem_no: 'VRM-1',
        islem_tarihi: '2026-04-10',
        payment_method: 'cash',
      },
    ];
    const { boxes, registerLines, balance, movements } = scoped(query.from, query.to, lines);
    expect(boxes.totalIn).toBe(40_000);
    expect(boxes.totalOut).toBe(5_000);
    expect(balance).toBe(35_000);
    expect(balance).toBe(boxes.totalIn - boxes.totalOut);
    const merkez = registerLines.find((row) => row.id === 'k1')?.amount || 0;
    const sube = registerLines.find((row) => row.id === 'k2')?.amount || 0;
    expect(merkez).toBe(18_000);
    expect(sube).toBe(17_000);
    expect(merkez + sube).toBe(balance);
    expect(sumCashRegisterDistribution(registerLines)).toBe(balance);
    expect(movements.filter((row) => row.categoryCode === 'virman')).toHaveLength(2);
    expect(movements.reduce((sum, row) => sum + row.amount, 0)).toBe(balance);
  });

  it('özet ekranı birikmiş kasa bakiyesini yeşil kutuya yazmaz', () => {
    const moduleSource = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    const marker = "selectedTab === 'cash-status' &&";
    const cashBlock = moduleSource.slice(moduleSource.indexOf(marker));
    const nextTab = cashBlock.indexOf("selectedTab === 'discount-report'");
    const summary = nextTab > 0 ? cashBlock.slice(0, nextTab) : cashBlock;
    expect(summary).toContain('cashStatusMovementNet');
    expect(summary).toContain('cashStatusPeriodRegisterLines');
    expect(summary).not.toContain('cashStatusDisplayedBalance');
    expect(summary).not.toContain('cashRegisterDistributionLines');
    expect(moduleSource).toContain('cashStatusBalanceHintKey(cashStatusQuery.filtered)');
  });
});
