/**
 * Günlük Rapor üst kartları.
 *
 * Sıra: Toplam Ciro, Rezervasyon Tutarı, Toplam İndirim, Toplam Gider, Net (Nakit).
 * Ciro alt yazısı satış miktarıdır; 140.000 tutarına eklenmez.
 * Net (Nakit) = 138.500 − 5.000 = 133.500. İndirim 1.500 tekrar eklenmez.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DailyReportKpiGrid } from '../../components/reports/DailyReportKpiGrid';
import { translate } from '../../locales/module-translations';
import { sumDailySalesDetailCashBalance } from '../../utils/dailySalesDetailCashBalance';
import {
  DAILY_REPORT_DISCOUNT_TONE,
  DAILY_REPORT_REMOVED_CARD_KEYS,
  DAILY_REPORT_REVENUE_QTY_LABEL_KEY,
  DAILY_REPORT_SCREEN_CARD_KEYS,
  DAILY_REPORT_SCREEN_CARD_LABEL_KEY,
  DAILY_REPORT_SOLID_CARD_FILL,
  dailyReportCardTone,
  dailyReportRevenueQuantityHint,
  dailyReportScreenShowsCard,
  sumDailyReportLineQuantity,
  visibleDailyReportScreenCardKeys,
} from '../../utils/dailyReportScreenCards';

function cssColor(hex: string): string {
  const body = hex.replace('#', '');
  const r = Number.parseInt(body.slice(0, 2), 16);
  const g = Number.parseInt(body.slice(2, 4), 16);
  const b = Number.parseInt(body.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const SCREEN_ORDER = [
  'total-revenue',
  'reservation-amount',
  'total-discount',
  'total-expense',
  'net-cash',
] as const;

const FORBIDDEN_ON_SCREEN = [
  'Toplam Satış',
  'Satış iade',
  'Net (Brüt)',
  'Kart',
  'Veresiye verilen',
  'Kasa Para Girişi',
  'Kasa Para Çıkışı',
  'Nakit gider',
  'BELGE TUTARI',
  'TAHSİL EDİLEN',
  'VERESİYE VERİLEN',
];

describe('günlük rapor ekran kartları', () => {
  it('kaldırılan anahtarlar kart listesinde yoktur', () => {
    const visible = visibleDailyReportScreenCardKeys();
    for (const key of DAILY_REPORT_REMOVED_CARD_KEYS) {
      expect(DAILY_REPORT_SCREEN_CARD_KEYS).not.toContain(key);
      expect(visible).not.toContain(key);
      expect(dailyReportScreenShowsCard(key)).toBe(false);
    }
    for (const key of ['total-sales', 'cash', 'sales-return', 'net-gross'] as const) {
      expect(DAILY_REPORT_SCREEN_CARD_KEYS).not.toContain(key);
      expect(dailyReportScreenShowsCard(key)).toBe(false);
    }
  });

  it('kart sırası tam olarak beş karttır', () => {
    expect(visibleDailyReportScreenCardKeys()).toEqual([...SCREEN_ORDER]);
    expect(DAILY_REPORT_SCREEN_CARD_KEYS).toEqual([...SCREEN_ORDER]);
    expect(DAILY_REPORT_SCREEN_CARD_KEYS).toHaveLength(5);
  });

  it('Türkçe etiketler ve ciro alt bilgisi miktardır; net nakit 133.500, indirim eklenmez', () => {
    const labels = visibleDailyReportScreenCardKeys().map((key) =>
      translate(DAILY_REPORT_SCREEN_CARD_LABEL_KEY[key], 'tr'),
    );
    expect(labels).toEqual([
      'Toplam Ciro',
      'Rezervasyon Tutarı',
      'Toplam İndirim',
      'Toplam Gider',
      'Net (Nakit)',
    ]);
    for (const banned of FORBIDDEN_ON_SCREEN) {
      expect(labels).not.toContain(banned);
    }

    const qtyHint = dailyReportRevenueQuantityHint(
      translate(DAILY_REPORT_REVENUE_QTY_LABEL_KEY, 'tr'),
      4,
    );
    expect(qtyHint).toBe('Satış miktarı: 4');
    expect(qtyHint).not.toContain('140');

    const values: Record<(typeof SCREEN_ORDER)[number], string> = {
      'total-revenue': '140.000',
      'reservation-amount': '10.000',
      'total-discount': '1.500',
      'total-expense': '5.000',
      'net-cash': '133.500',
    };
    render(
      createElement(DailyReportKpiGrid, {
        cards: visibleDailyReportScreenCardKeys().map((key) => ({
          key,
          label: translate(DAILY_REPORT_SCREEN_CARD_LABEL_KEY[key], 'tr'),
          value: values[key],
          hint: key === 'total-revenue' ? qtyHint : undefined,
        })),
      }),
    );
    const text = screen.getByTestId('daily-report-kpi-grid').textContent ?? '';
    expect(text).toContain('Toplam Ciro');
    expect(text).toContain('140.000');
    expect(text).toContain('Satış miktarı: 4');
    expect(text).not.toContain('140.004');
    expect(text).toContain('Toplam İndirim');
    expect(text).toContain('1.500');
    expect(text).toContain('Net (Nakit)');
    expect(text).toContain('133.500');
    expect(text).not.toContain('Toplam Satış');
    expect(text).not.toContain('Satış iade');
    expect(text).not.toContain('Net (Brüt)');
    expect(screen.queryByTestId('daily-report-card-net-gross')).toBeNull();
    expect(screen.queryByTestId('daily-report-card-total-sales')).toBeNull();
    expect(screen.queryByTestId('daily-report-card-cash')).toBeNull();
    expect(screen.queryByTestId('daily-report-card-sales-return')).toBeNull();

    const src = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    const kpiStart = src.indexOf('const dailyReportKpiByKey');
    const kpiEnd = src.indexOf('const dailyReportKpiCards');
    const kpi = src.slice(kpiStart, kpiEnd);
    const viewStart = src.indexOf("{selectedTab === 'daily'");
    const viewEnd = src.indexOf('{/* Sales List */}');
    const view = src.slice(viewStart, viewEnd);
    expect(kpiStart).toBeGreaterThan(0);
    expect(viewStart).toBeGreaterThan(0);
    expect(view).toContain('<DailyReportKpiGrid');
    expect(view).toContain('clinicPalette.accent');
    expect(src).toContain('useClinicMenuPalette');
    expect(kpi).toContain('formatNumber(dailyTotal, 2, false)');
    expect(kpi).toContain('dailyReportRevenueQuantityHint');
    expect(kpi).not.toContain('dailyTotal + dailyRevenueQuantity');
    expect(kpi).toContain('formatNumber(dailyDiscount, 2, false)');
    expect(kpi).toContain('formatNumber(dailyNetNakitAlways, 2, false)');
    expect(src).toContain('dailyCollected - totalExpensesForReport');
    expect(src).toContain('sumDailySalesDetailCashBalance');
    expect(src).toContain('buildDailySalesDetailExpenseRows');
    expect(kpi).not.toContain("'total-sales'");
    expect(kpi).not.toContain("'sales-return'");
    expect(kpi).not.toContain("key: 'cash'");
    expect(kpi).not.toContain("'net-gross'");
    expect(kpi).not.toContain('dailyNetAfterExpenseBrut');
    expect(kpi).not.toContain('dailyRemaining');
    expect(view).not.toContain('net-gross');
    for (const banned of FORBIDDEN_ON_SCREEN) {
      expect(kpi).not.toContain(banned);
    }
  });

  it('kart sırası aynı kalır; ciro mavi, gider kırmızı, net yeşil, indirim lavanta paletindedir', () => {
    expect(visibleDailyReportScreenCardKeys()).toEqual([...SCREEN_ORDER]);

    const revenue = dailyReportCardTone('total-revenue');
    const reservation = dailyReportCardTone('reservation-amount');
    const discount = dailyReportCardTone('total-discount');
    const expense = dailyReportCardTone('total-expense');
    const net = dailyReportCardTone('net-cash');

    expect(revenue.background).toBe(DAILY_REPORT_SOLID_CARD_FILL['total-revenue']);
    expect(revenue.background).toBe('#2563eb');
    expect(revenue.value).toBe('#ffffff');
    expect(revenue.label).toBe('#ffffff');
    expect(revenue.hint).toBe('#ffffff');
    expect(revenue.accent).toBe('#ffffff');

    expect(reservation.background).toBe('#f59e0b');
    expect(reservation.value).toBe('#ffffff');
    expect(reservation.label).toBe('#ffffff');
    expect(reservation.hint).toBe('#ffffff');

    expect(expense.background).toBe('#f04438');
    expect(expense.value).toBe('#ffffff');
    expect(expense.label).toBe('#ffffff');
    expect(expense.hint).toBe('#ffffff');

    expect(net.background).toBe('#12b76a');
    expect(net.value).toBe('#ffffff');
    expect(net.label).toBe('#ffffff');
    expect(net.hint).toBe('#ffffff');

    expect(discount).toEqual(DAILY_REPORT_DISCOUNT_TONE);
    expect(discount.background).toBe('#ede7f7');
    expect(discount.accent).toBe('#5b21b6');
    expect(discount.value).not.toBe('#ffffff');
    expect(discount.background).not.toBe(revenue.background);
    expect(discount.background).not.toBe(expense.background);
    expect(discount.background).not.toBe(net.background);
    expect(discount.background).not.toBe(reservation.background);

    const fills = [revenue, reservation, discount, expense, net].map((tone) => tone.background);
    expect(new Set(fills).size).toBe(5);

    const values: Record<(typeof SCREEN_ORDER)[number], string> = {
      'total-revenue': '140.000',
      'reservation-amount': '10.000',
      'total-discount': '1.500',
      'total-expense': '5.000',
      'net-cash': '133.500',
    };
    render(
      createElement(DailyReportKpiGrid, {
        cards: visibleDailyReportScreenCardKeys().map((key) => ({
          key,
          label: translate(DAILY_REPORT_SCREEN_CARD_LABEL_KEY[key], 'tr'),
          value: values[key],
          hint: key === 'total-revenue' ? 'Satış miktarı: 4' : undefined,
        })),
      }),
    );

    const painted = [
      ['total-revenue', '#2563eb', '#ffffff'],
      ['reservation-amount', '#f59e0b', '#ffffff'],
      ['total-discount', '#ede7f7', '#3b1d7b'],
      ['total-expense', '#f04438', '#ffffff'],
      ['net-cash', '#12b76a', '#ffffff'],
    ] as const;
    const order: string[] = [];
    for (const [key, background, ink] of painted) {
      const card = screen.getByTestId(`daily-report-card-${key}`);
      order.push(card.getAttribute('data-daily-card-key') ?? '');
      expect(card.style.backgroundColor).toBe(cssColor(background));
      const lines = card.querySelectorAll('p');
      expect(lines[1]?.style.color).toBe(cssColor(ink));
      expect(lines[0]?.style.color).toBe(cssColor(key === 'total-discount' ? '#502a9b' : '#ffffff'));
      expect(lines[2]?.style.color).toBe(cssColor(key === 'total-discount' ? '#513b90' : '#ffffff'));
    }
    expect(order).toEqual([...SCREEN_ORDER]);
  });

  it('ciro alt bilgisi satır miktarının toplamıdır ve tutara eklenmez', () => {
    const sales = [1, 2, 3, 4].map((n) => ({
      id: `s${n}`,
      status: 'completed',
      total: n === 4 ? 15_000 : 50_000,
      items: [{ quantity: 1, total: n === 4 ? 15_000 : 50_000, price: n === 4 ? 15_000 : 50_000 }],
    }));
    const deposit = {
      id: 'dep',
      status: 'completed',
      isDeposit: true,
      total: 10_000,
      items: [{ quantity: 1, total: 10_000, price: 10_000 }],
    };
    expect(sumDailyReportLineQuantity([...sales, deposit])).toBe(4);
    const withReturn = [
      ...sales,
      {
        id: 'ret',
        status: 'return',
        total: -1_000,
        items: [{ quantity: 1, total: 1_000, price: 1_000 }],
      },
    ];
    expect(sumDailyReportLineQuantity(withReturn)).toBe(3);
    const hint = dailyReportRevenueQuantityHint('Satış miktarı', 4);
    expect(hint).toBe('Satış miktarı: 4');
    expect(hint).not.toContain('140');
    expect(translate(DAILY_REPORT_REVENUE_QTY_LABEL_KEY, 'tr')).toBe('Satış miktarı');
    expect(translate(DAILY_REPORT_REVENUE_QTY_LABEL_KEY, 'en')).toBe('Sales quantity');
    expect(translate(DAILY_REPORT_REVENUE_QTY_LABEL_KEY, 'ar').length).toBeGreaterThan(0);
    expect(translate(DAILY_REPORT_REVENUE_QTY_LABEL_KEY, 'ku').length).toBeGreaterThan(0);
  });

  it('net nakit 133.500 olur; indirim toplama eklenmez ve peşinat ciro değildir', () => {
    const sales = [
      { receiptNumber: 'BEA-2026-00001', beforeDiscount: 50_000, total: 50_000, discount: 0 },
      { receiptNumber: 'BEA-2026-00002', beforeDiscount: 25_000, total: 25_000, discount: 0 },
      { receiptNumber: 'BEA-2026-00003', beforeDiscount: 50_000, total: 50_000, discount: 0 },
      { receiptNumber: 'BEA-2026-00004', beforeDiscount: 15_000, total: 15_000, discount: 1_500 },
    ];
    const reservation = {
      receiptNumber: 'RSV-10',
      beforeDiscount: 10_000,
      total: 10_000,
      discount: 0,
      isAvans: true as const,
    };
    const expense = {
      receiptNumber: 'GDR-2026-00001',
      beforeDiscount: -5_000,
      total: -5_000,
      discount: 0,
      isExpense: true,
    };
    const cash = sumDailySalesDetailCashBalance([...sales, reservation, expense]);
    expect(cash).toBe(133_500);
    expect(cash).not.toBe(138_500 + 1_500 - 5_000);
    expect(cash).not.toBe(138_500 - 1_500 - 5_000);
    expect(cash).not.toBe(140_000 - 5_000);
    expect(sumDailySalesDetailCashBalance(sales)).toBe(138_500);
    expect(sumDailySalesDetailCashBalance([...sales, reservation])).toBe(138_500);
  });
});
