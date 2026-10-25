/**
 * Aylık Gün Özeti / Yıllık Ay Özeti görünürlüğü.
 * Rezervasyon Brüt ve Rezervasyon Kalan kolon tanımında yoktur.
 * Rezervasyon Tutarı ve Rezervasyon Miktarı durur.
 * Dört kutu klinik dolu tonunu kullanır. Tutar formülü bu dosyada yoktur.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PeriodSummaryHeadlineCard } from '../../components/reports/PeriodSummaryReport';
import { clinicDashboardKpiTone } from '../../utils/clinicDashboardKpiTones';
import { dailyReportCardTone } from '../../utils/dailyReportScreenCards';
import {
  isPeriodSummaryGridColumnVisible,
  periodSummaryHeadlineTone,
} from '../../utils/periodSummaryScreen';

function cssColor(hex: string): string {
  const body = hex.replace('#', '');
  const r = Number.parseInt(body.slice(0, 2), 16);
  const g = Number.parseInt(body.slice(2, 4), 16);
  const b = Number.parseInt(body.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

describe('Aylık ve yıllık özet görünümü', () => {
  afterEach(() => {
    cleanup();
  });

  it('rezervasyon brüt ve kalan kolonlarını listeden çıkarır', () => {
    expect(isPeriodSummaryGridColumnVisible('reservationGross')).toBe(false);
    expect(isPeriodSummaryGridColumnVisible('reservationPending')).toBe(false);
    expect(isPeriodSummaryGridColumnVisible('reservationDeposit')).toBe(true);
    expect(isPeriodSummaryGridColumnVisible('reservationCount')).toBe(true);
    expect(isPeriodSummaryGridColumnVisible('revenue')).toBe(true);
    expect(isPeriodSummaryGridColumnVisible('discount')).toBe(true);
    expect(isPeriodSummaryGridColumnVisible('netRemaining')).toBe(true);

    const src = readFileSync(resolve('src/components/reports/PeriodSummaryReport.tsx'), 'utf8');
    expect(src).not.toMatch(/key:\s*'reservationGross'/);
    expect(src).not.toMatch(/key:\s*'reservationPending'/);
    expect(src).toMatch(/key:\s*'reservationCount'/);
    expect(src).toMatch(/key:\s*'reservationDeposit'/);
    expect(src).toContain('isPeriodSummaryGridColumnVisible');
    expect(src).toContain('periodSummaryHeadlineTone');
    expect(src).toContain('data-testid="period-summary-headline"');
    expect(src).toContain('data-testid="period-summary-toolbar"');
  });

  it('dört kutuyu klinik dolu tonuyla boyar', () => {
    const revenue = periodSummaryHeadlineTone('revenue');
    const returns = periodSummaryHeadlineTone('returns');
    const expenses = periodSummaryHeadlineTone('expenses');
    const net = periodSummaryHeadlineTone('net');

    expect(revenue.background).toBe('#2563eb');
    expect(revenue.background).toBe(clinicDashboardKpiTone('completed').background);
    expect(revenue.background).toBe(dailyReportCardTone('total-revenue').background);
    expect(revenue.value).toBe('#ffffff');
    expect(revenue.label).toBe('#ffffff');

    expect(returns.background).toBe(clinicDashboardKpiTone('reservation').background);
    expect(returns.background).toBe(dailyReportCardTone('reservation-amount').background);
    expect(returns.background).toBe('#f59e0b');
    expect(returns.value).toBe('#ffffff');

    expect(expenses.background).toBe('#f04438');
    expect(expenses.background).toBe(clinicDashboardKpiTone('cancelled').background);
    expect(expenses.background).toBe(dailyReportCardTone('total-expense').background);
    expect(expenses.value).toBe('#ffffff');

    expect(net.background).toBe('#12b76a');
    expect(net.background).toBe(clinicDashboardKpiTone('collection').background);
    expect(net.background).toBe(dailyReportCardTone('net-cash').background);
    expect(net.value).toBe('#ffffff');
  });

  it('örnek tutarları dolu zeminde beyaz yazar', () => {
    render(
      createElement(
        'div',
        null,
        createElement(PeriodSummaryHeadlineCard, {
          toneKey: 'revenue',
          label: 'Toplam Ciro',
          value: '220.000 IQD',
          hint: '6 satış adedi',
        }),
        createElement(PeriodSummaryHeadlineCard, {
          toneKey: 'returns',
          label: 'İade',
          value: '0 IQD',
          hint: '0 iade adedi',
        }),
        createElement(PeriodSummaryHeadlineCard, {
          toneKey: 'expenses',
          label: 'Toplam Masraf',
          value: '50.000 IQD',
          hint: 'Masraf detayı',
        }),
        createElement(PeriodSummaryHeadlineCard, {
          toneKey: 'net',
          label: 'Net Kalan',
          value: '170.000 IQD',
        }),
      ),
    );

    const revenue = screen.getByTestId('period-summary-kpi-revenue');
    const returns = screen.getByTestId('period-summary-kpi-returns');
    const expenses = screen.getByTestId('period-summary-kpi-expenses');
    const net = screen.getByTestId('period-summary-kpi-net');

    expect(revenue.textContent).toContain('220.000 IQD');
    expect(revenue.textContent).toContain('6 satış adedi');
    expect(revenue.style.backgroundColor).toBe(cssColor('#2563eb'));
    expect(revenue.className).not.toContain('bg-white');

    expect(returns.textContent).toContain('0 IQD');
    expect(returns.style.backgroundColor).toBe(cssColor(clinicDashboardKpiTone('reservation').background));
    expect(returns.className).not.toContain('bg-white');

    expect(expenses.textContent).toContain('50.000 IQD');
    expect(expenses.textContent).toContain('Masraf detayı');
    expect(expenses.style.backgroundColor).toBe(cssColor('#f04438'));

    expect(net.textContent).toContain('170.000 IQD');
    expect(net.style.backgroundColor).toBe(cssColor('#12b76a'));

    for (const card of [revenue, returns, expenses, net]) {
      const value = card.querySelectorAll('p')[1] as HTMLElement;
      expect(value.style.color).toBe(cssColor('#ffffff'));
    }
  });
});
