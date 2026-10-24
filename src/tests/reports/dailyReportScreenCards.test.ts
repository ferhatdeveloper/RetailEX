import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DailyReportKpiGrid } from '../../components/reports/DailyReportKpiGrid';
import { translate } from '../../locales/module-translations';
import {
  DAILY_REPORT_REMOVED_CARD_KEYS,
  DAILY_REPORT_SCREEN_CARD_KEYS,
  DAILY_REPORT_SCREEN_CARD_LABEL_KEY,
  dailyReportScreenShowsCard,
  visibleDailyReportScreenCardKeys,
} from '../../utils/dailyReportScreenCards';

const FORBIDDEN_ON_SCREEN = [
  'Kart',
  'Veresiye verilen',
  'Kasa Para Girişi',
  'Kasa Para Çıkışı',
  'Nakit gider',
  'BELGE TUTARI',
  'TAHSİL EDİLEN',
  'VERESİYE VERİLEN',
];

const ALL_ON = {
  totalSales: true,
  totalRevenue: true,
  totalDiscount: true,
  cash: true,
  salesReturn: true,
  totalExpense: true,
  net: true,
};

describe('günlük rapor ekran kartları', () => {
  it('kaldırılan anahtarlar kart listesinde yoktur', () => {
    const visible = visibleDailyReportScreenCardKeys(ALL_ON);
    for (const key of DAILY_REPORT_REMOVED_CARD_KEYS) {
      expect(DAILY_REPORT_SCREEN_CARD_KEYS).not.toContain(key);
      expect(visible).not.toContain(key);
      expect(dailyReportScreenShowsCard(key)).toBe(false);
    }
  });

  it('kalan kart sırası sabittir', () => {
    expect(visibleDailyReportScreenCardKeys(ALL_ON)).toEqual([
      'total-sales',
      'reservation-amount',
      'total-revenue',
      'total-discount',
      'cash',
      'sales-return',
      'total-expense',
      'net-gross',
      'net-cash',
    ]);
  });

  it('rezervasyon her zaman durur; net kapalıysa her iki net kartı da gizlenir', () => {
    const keys = visibleDailyReportScreenCardKeys({
      ...ALL_ON,
      totalSales: false,
      net: false,
    });
    expect(keys[0]).toBe('reservation-amount');
    expect(keys).not.toContain('net-gross');
    expect(keys).not.toContain('net-cash');
    expect(keys).not.toContain('card');
    expect(keys).not.toContain('cash-expense');
  });

  it('ekran kart listesinde Kart, veresiye, kasa ve belge şeridi yoktur', () => {
    const labels = visibleDailyReportScreenCardKeys(ALL_ON).map((key) =>
      translate(DAILY_REPORT_SCREEN_CARD_LABEL_KEY[key], 'tr'),
    );
    expect(labels).toEqual([
      'Toplam Satış',
      'Rezervasyon Tutarı',
      'Toplam Ciro',
      'Toplam İndirim',
      'Nakit',
      'Satış iade',
      'Toplam Gider',
      'Net (Brüt)',
      'Net (Nakit)',
    ]);
    for (const banned of FORBIDDEN_ON_SCREEN) {
      expect(labels).not.toContain(banned);
    }

    render(
      createElement(DailyReportKpiGrid, {
        cards: visibleDailyReportScreenCardKeys(ALL_ON).map((key) => ({
          key,
          label: translate(DAILY_REPORT_SCREEN_CARD_LABEL_KEY[key], 'tr'),
          value: key === 'total-discount' ? '1.500' : '0',
        })),
      }),
    );
    const text = screen.getByTestId('daily-report-kpi-grid').textContent ?? '';
    expect(text).toContain('Toplam İndirim');
    expect(text).toContain('1.500');
    expect(text).not.toContain('Veresiye verilen');
    for (const banned of FORBIDDEN_ON_SCREEN) {
      expect(text).not.toContain(banned);
    }

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
    expect(view).not.toContain('ReportKpiStrip');
    expect(view).not.toContain('DailyCashFlowModal');
    expect(kpi).toContain('formatNumber(dailyDiscount, 2, false)');
    expect(kpi).not.toContain('dailyRemaining');
    expect(kpi).not.toContain('cashExpensesForReport');
    expect(kpi).not.toContain('totalDailyCashIn');
    for (const token of [
      "tm('cardLabel')",
      "tm('veresiyeVerilen')",
      "tm('dailyCashIn')",
      "tm('dailyCashOut')",
      "tm('expenseCashTotal')",
      "tm('belgeTutari')",
      "tm('tahsilEdilen')",
      'BELGE TUTARI',
      'TAHSİL EDİLEN',
      'VERESİYE VERİLEN',
      'Kasa Para Girişi',
      'Kasa Para Çıkışı',
      'Nakit gider',
      'Veresiye verilen',
    ]) {
      expect(kpi).not.toContain(token);
      expect(view).not.toContain(token);
    }
  });
});
