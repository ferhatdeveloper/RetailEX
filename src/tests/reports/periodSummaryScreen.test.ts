/**
 * Aylık Gün Özeti / Yıllık Ay Özeti görünürlüğü.
 * Rezervasyon Brüt ve Rezervasyon Kalan kolon tanımında yoktur.
 * Rezervasyon Tutarı ve Rezervasyon Miktarı durur.
 * Beş kutu klinik dolu tonunu kullanır. Rezervasyon kutusu turuncudur.
 * İade kutusu tealdir.
 * Rezervasyon tutarı nete eklenmez. Tutar formülü bu dosyada değişmez.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PeriodSummaryHeadlineCard } from '../../components/reports/PeriodSummaryReport';
import { clinicDashboardKpiTone } from '../../utils/clinicDashboardKpiTones';
import { dailyReportCardTone } from '../../utils/dailyReportScreenCards';
import { periodSummaryHeadline } from '../../utils/periodSummaryNet';
import {
  PERIOD_SUMMARY_HEADLINE_KEYS,
  PERIOD_SUMMARY_RESERVATION_FILL,
  PERIOD_SUMMARY_RETURN_FILL,
  isPeriodSummaryGridColumnVisible,
  periodSummaryHeadlineTone,
  periodSummaryReservationHint,
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

  it('beş kutuyu klinik dolu tonuyla boyar; rezervasyon turuncu, iade tealdir', () => {
    expect(PERIOD_SUMMARY_HEADLINE_KEYS).toEqual([
      'revenue',
      'reservation',
      'returns',
      'expenses',
      'net',
    ]);

    const revenue = periodSummaryHeadlineTone('revenue');
    const reservation = periodSummaryHeadlineTone('reservation');
    const returns = periodSummaryHeadlineTone('returns');
    const expenses = periodSummaryHeadlineTone('expenses');
    const net = periodSummaryHeadlineTone('net');

    expect(revenue.background).toBe('#2563eb');
    expect(revenue.background).toBe(clinicDashboardKpiTone('completed').background);
    expect(revenue.background).toBe(dailyReportCardTone('total-revenue').background);
    expect(revenue.value).toBe('#ffffff');
    expect(revenue.label).toBe('#ffffff');

    expect(reservation.background).toBe(PERIOD_SUMMARY_RESERVATION_FILL);
    expect(reservation.background).toBe('#f59e0b');
    expect(reservation.background).toBe(clinicDashboardKpiTone('reservation').background);
    expect(reservation.background).toBe(dailyReportCardTone('reservation-amount').background);
    expect(reservation.value).toBe('#ffffff');
    expect(reservation.label).toBe('#ffffff');
    expect(reservation.hint).toBe('#ffffff');
    expect(reservation.background).not.toBe(revenue.background);
    expect(reservation.background).not.toBe('#0d9488');
    expect(reservation.background).not.toBe('#f04438');
    expect(reservation.background).not.toBe('#12b76a');

    expect(returns.background).toBe(PERIOD_SUMMARY_RETURN_FILL);
    expect(returns.background).toBe('#0d9488');
    expect(returns.background).not.toBe(reservation.background);
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
          toneKey: 'reservation',
          label: 'Rezervasyon Tutarı',
          value: '15.000 IQD',
          hint: '2 rezervasyon miktarı',
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
    const reservation = screen.getByTestId('period-summary-kpi-reservation');
    const returns = screen.getByTestId('period-summary-kpi-returns');
    const expenses = screen.getByTestId('period-summary-kpi-expenses');
    const net = screen.getByTestId('period-summary-kpi-net');

    expect(revenue.textContent).toContain('220.000 IQD');
    expect(revenue.textContent).toContain('6 satış adedi');
    expect(revenue.style.backgroundColor).toBe(cssColor('#2563eb'));
    expect(revenue.className).not.toContain('bg-white');

    expect(reservation.textContent).toContain('15.000 IQD');
    expect(reservation.textContent).toContain('2 rezervasyon miktarı');
    expect(reservation.style.backgroundColor).toBe(cssColor('#f59e0b'));
    expect(reservation.className).not.toContain('bg-white');

    expect(returns.textContent).toContain('0 IQD');
    expect(returns.style.backgroundColor).toBe(cssColor('#0d9488'));
    expect(returns.className).not.toContain('bg-white');

    expect(expenses.textContent).toContain('50.000 IQD');
    expect(expenses.textContent).toContain('Masraf detayı');
    expect(expenses.style.backgroundColor).toBe(cssColor('#f04438'));

    expect(net.textContent).toContain('170.000 IQD');
    expect(net.style.backgroundColor).toBe(cssColor('#12b76a'));

    for (const card of [revenue, reservation, returns, expenses, net]) {
      const value = card.querySelectorAll('p')[1] as HTMLElement;
      expect(value.style.color).toBe(cssColor('#ffffff'));
    }
  });

  it('rezervasyon kutusu 15.000 gösterir; net 35.000 kalır ve rezervasyon eklenmez', () => {
    expect(periodSummaryReservationHint('Rezervasyon Miktarı', 2)).toBe('2 rezervasyon miktarı');

    const shown = periodSummaryHeadline({
      revenue: 40_000,
      returnsAmount: 15_000,
      returnDeduction: 15_000,
      expenses: 0,
      expenseEnabled: true,
      reservationDeposit: 15_000,
      forfeitedDeposit: 10_000,
    });
    const withoutReservation = periodSummaryHeadline({
      revenue: 40_000,
      returnsAmount: 15_000,
      returnDeduction: 15_000,
      expenses: 0,
      expenseEnabled: true,
      reservationDeposit: 0,
      forfeitedDeposit: 10_000,
    });

    expect(shown.grossRevenue).toBe(40_000);
    expect(shown.returnAmount).toBe(15_000);
    expect(shown.depositInfo).toBe(15_000);
    expect(shown.netRevenue).toBe(35_000);
    expect(withoutReservation.netRevenue).toBe(35_000);
    expect(shown.netRevenue).toBe(withoutReservation.netRevenue);
    expect(shown.netRevenue).not.toBe(shown.grossRevenue + shown.depositInfo);
    expect(shown.netRevenue).not.toBe(shown.grossRevenue - shown.returnAmount + shown.depositInfo);

    const src = readFileSync(resolve('src/components/reports/PeriodSummaryReport.tsx'), 'utf8');
    const reservationAt = src.indexOf("key: 'reservation'");
    const returnsAt = src.indexOf("key: 'returns'");
    expect(reservationAt).toBeGreaterThan(0);
    expect(reservationAt).toBeLessThan(returnsAt);
    expect(src).toContain('money(totals.reservationDeposit)');
    expect(src).toContain('periodSummaryReservationHint');
    expect(src).toContain('lg:grid-cols-5');
    expect(src).not.toContain('totals.netRemaining + totals.reservationDeposit');
    expect(src).not.toContain('totals.revenue + totals.reservationDeposit');

    render(
      createElement(
        'div',
        { 'data-testid': 'period-summary-headline' },
        createElement(PeriodSummaryHeadlineCard, {
          toneKey: 'revenue',
          label: 'Toplam Ciro',
          value: '40.000 IQD',
          hint: '2 satış adedi',
        }),
        createElement(PeriodSummaryHeadlineCard, {
          toneKey: 'reservation',
          label: 'Rezervasyon Tutarı',
          value: '15.000 IQD',
          hint: periodSummaryReservationHint('Rezervasyon Miktarı', 2),
        }),
        createElement(PeriodSummaryHeadlineCard, {
          toneKey: 'returns',
          label: 'İade',
          value: '15.000 IQD',
          hint: '1 iade adedi',
        }),
        createElement(PeriodSummaryHeadlineCard, {
          toneKey: 'expenses',
          label: 'Toplam Masraf',
          value: '0 IQD',
          hint: 'Masraf detayı',
        }),
        createElement(PeriodSummaryHeadlineCard, {
          toneKey: 'net',
          label: 'Net Kalan',
          value: '35.000 IQD',
        }),
      ),
    );

    const strip = screen.getByTestId('period-summary-headline');
    const order = [...strip.querySelectorAll('[data-period-kpi]')].map(
      (node) => node.getAttribute('data-period-kpi'),
    );
    expect(order).toEqual(['revenue', 'reservation', 'returns', 'expenses', 'net']);
    const reservation = screen.getByTestId('period-summary-kpi-reservation');
    const net = screen.getByTestId('period-summary-kpi-net');
    expect(reservation.textContent).toContain('15.000 IQD');
    expect(reservation.textContent).toContain('2 rezervasyon miktarı');
    expect(reservation.style.backgroundColor).toBe(cssColor('#f59e0b'));
    expect(net.textContent).toContain('35.000 IQD');
    expect(net.style.backgroundColor).toBe(cssColor('#12b76a'));
    expect(strip.textContent).not.toContain('50.000');
    expect(strip.textContent).not.toContain('55.000');
  });
});
