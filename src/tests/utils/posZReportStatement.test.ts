/**
 * Gün sonu Z — görseldeki sıra.
 * Net satış = brüt − indirim − iade − gider.
 * Net nakit = net satış + açık veya iptal peşinat.
 * Kapanmış peşinat rezervasyon satırında 0 kalır ve net nakde eklenmez.
 * Kimlik fiş / randevu kimliğidir. Müşteri adı küme anahtarı değildir.
 * İndirim açık cari değildir. Virman gider değildir.
 * İade ve gider bir kez düşülür.
 * Pasta dilimleri birbirine eklenmez. Brüt, net nakit ve işlem sayısı dilim değildir.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { KasaIslemi } from '../../services/api/kasa';
import type { CancelledReservationBoxInput } from '../../utils/cancelledReservationBox';
import { DayEndZPieChart } from '../../components/reports/DayEndZPieChart';
import {
  buildDayEndZPieSlices,
  composeDayEndZStatement,
  DAY_END_Z_PIE_COLORS,
} from '../../utils/posZReport';
import { mergeExpensesWithCashOuts } from '../../utils/reportUnifiedExpenses';

vi.mock('recharts', async () => {
  const React = await import('react');
  return {
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => React.createElement('div', null, children),
    PieChart: ({ children }: { children?: ReactNode }) => React.createElement('div', { 'data-testid': 'z-pie-chart' }, children),
    Pie: ({ data }: { data?: Array<{ key: string; amount: number }> }) => React.createElement(
      'ul',
      { 'data-testid': 'z-pie-slices' },
      (data || []).map((item) => React.createElement('li', { key: item.key }, `${item.key}:${item.amount}`)),
    ),
    Cell: () => null,
    Tooltip: () => null,
  };
});

const OPEN_ID = 'bbbbbbbb-3333-4333-8333-333333333333';
const CLOSED_ID = '7df0cac9-1111-4111-8111-111111111111';
const CANCEL_ID = 'aaaaaaaa-2222-4222-8222-222222222222';
const OTHER_OPEN_ID = 'cccccccc-5555-4555-8555-555555555555';

function picture(reservation?: CancelledReservationBoxInput) {
  return composeDayEndZStatement({
    transactionCount: 2,
    grossSales: 105_000,
    discount: 0,
    salesReturn: 15_000,
    expense: 5_000,
    reservation,
  });
}

const openReservation: CancelledReservationBoxInput = {
  appointments: [{
    id: OPEN_ID,
    status: 'pre_paid',
    depositAmount: 30_000,
    appointmentDate: '2026-10-25',
  }],
  avansRows: [{
    amount: 30_000,
    status: 'open',
    appointmentStatus: 'pre_paid',
    notes: `Rezervasyon Tutarı · Randevu No ${OPEN_ID}`,
    createdAt: '2026-10-25',
  }],
};

const cancelledReservation: CancelledReservationBoxInput = {
  appointments: [{
    id: CANCEL_ID,
    status: 'cancelled',
    depositAmount: 30_000,
    appointmentDate: '2026-10-25',
  }],
  avansRows: [{
    amount: 30_000,
    status: 'kept_on_cancel',
    appointmentStatus: 'cancelled',
    notes: `Rezervasyon Tutarı · Randevu No ${CANCEL_ID}`,
    createdAt: '2026-10-25',
  }],
};

const closedReservation: CancelledReservationBoxInput = {
  appointments: [{
    id: CLOSED_ID,
    status: 'completed',
    depositAmount: 30_000,
    appointmentDate: '2026-10-25',
  }],
  avansRows: [{
    amount: 30_000,
    status: 'applied',
    appointmentStatus: 'completed',
    notes: `Rezervasyon Tutarı · Randevu No ${CLOSED_ID}`,
    createdAt: '2026-10-25',
  }],
};

describe('gün sonu Z — net satış ve net nakit', () => {
  it('brüt 105.000, indirim 0, iade 15.000, gider 5.000, net satış 85.000', () => {
    const row = picture();
    expect(row.transactionCount).toBe(2);
    expect(row.grossSales).toBe(105_000);
    expect(row.discount).toBe(0);
    expect(row.salesReturn).toBe(15_000);
    expect(row.expense).toBe(5_000);
    expect(row.netSales).toBe(85_000);
    expect(row.netSales).toBe(105_000 - 0 - 15_000 - 5_000);
    expect(row.reservationAmount).toBe(0);
    expect(row.netCash).toBe(85_000);
    expect(row).not.toHaveProperty('creditAmount');
    expect(row).not.toHaveProperty('openAccount');
  });

  it('açık peşinat 30.000 ise net nakit 115.000; iade ve gider ikinci kez düşmez', () => {
    const row = picture(openReservation);
    expect(row.reservationAmount).toBe(30_000);
    expect(row.netSales).toBe(85_000);
    expect(row.netCash).toBe(115_000);
    expect(row.netCash).toBe(row.netSales + row.reservationAmount);
    expect(row.netCash).not.toBe(115_000 - 15_000 - 5_000);
    expect(row.netSales).not.toBe(85_000 - 15_000);
    expect(row.netSales).not.toBe(85_000 - 5_000);
  });

  it('iptal peşinatı 30.000 satırda durur, iade değildir ve net nakde bir kez eklenir', () => {
    const row = picture(cancelledReservation);
    expect(row.reservationAmount).toBe(30_000);
    expect(row.salesReturn).toBe(15_000);
    expect(row.netSales).toBe(85_000);
    expect(row.netSales).not.toBe(85_000 - 30_000);
    expect(row.netCash).toBe(115_000);
    expect(row.netCash).not.toBe(115_000 + 30_000);
  });

  it('kapanmış peşinat rezervasyon satırında 0, net nakde eklenmez', () => {
    const row = picture(closedReservation);
    expect(row.reservationAmount).toBe(0);
    expect(row.netSales).toBe(85_000);
    expect(row.netCash).toBe(85_000);
    expect(row.netCash).not.toBe(115_000);
    expect(row.netSales).not.toBe(85_000 - 30_000);
  });

  it('aynı müşteride kapanmış fiş düşmez, açık fiş randevu kimliğiyle bir kez kalır', () => {
    const row = picture({
      appointments: [
        { id: CLOSED_ID, status: 'completed', depositAmount: 30_000, appointmentDate: '2026-10-25' },
        { id: OPEN_ID, status: 'pre_paid', depositAmount: 30_000, appointmentDate: '2026-10-25' },
      ],
      avansRows: [
        {
          amount: 30_000,
          status: 'applied',
          appointmentStatus: 'completed',
          notes: `Rezervasyon Tutarı · Randevu No ${CLOSED_ID}`,
          createdAt: '2026-10-25',
        },
        {
          amount: 30_000,
          status: 'open',
          appointmentStatus: 'pre_paid',
          notes: `Rezervasyon Tutarı · Randevu No ${OPEN_ID}`,
          createdAt: '2026-10-25',
        },
      ],
    });
    expect(row.reservationAmount).toBe(30_000);
    expect(row.netCash).toBe(115_000);
    expect(row.netCash).not.toBe(145_000);
    expect(row.netCash).not.toBe(85_000);

    const twoOpen = picture({
      appointments: [
        { id: OPEN_ID, status: 'confirmed', depositAmount: 30_000, appointmentDate: '2026-10-25' },
        { id: OTHER_OPEN_ID, status: 'pre_paid', depositAmount: 30_000, appointmentDate: '2026-10-25' },
      ],
    });
    expect(twoOpen.reservationAmount).toBe(60_000);
    expect(twoOpen.netCash).toBe(145_000);
  });

  it('indirim bir kez düşülür ve açık cari satırı açmaz; virman gider değildir', () => {
    const discounted = composeDayEndZStatement({
      grossSales: 105_000,
      discount: 10_000,
      salesReturn: 15_000,
      expense: 5_000,
    });
    expect(discounted.discount).toBe(10_000);
    expect(discounted.netSales).toBe(75_000);
    expect(discounted.netCash).toBe(75_000);
    expect(discounted.netSales).not.toBe(105_000 - 10_000 - 10_000 - 15_000 - 5_000);
    expect(discounted).not.toHaveProperty('creditAmount');

    const virman = {
      id: 'line-virman',
      firma_id: '001',
      kasa_id: 'reg-1',
      target_register_id: 'reg-2',
      islem_tarihi: '2026-10-25',
      islem_tipi: 'VIRMAN',
      islem_aciklamasi: 'Kasa virmanı',
      islem_no: 'VRM-1',
      tutar: 20_000,
      sign: -1,
    } as KasaIslemi;
    const expenses = mergeExpensesWithCashOuts([], [virman]);
    expect(expenses).toHaveLength(0);
    const withVirman = picture(openReservation);
    const expense = 5_000 + expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    expect(expense).toBe(withVirman.expense);
    expect(withVirman.netSales).toBe(85_000);
    expect(withVirman.netCash).toBe(115_000);
  });

  it('ekran ve yazdırma sekiz satırdır; eski net satırları yoktur', () => {
    const src = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    const printStart = src.indexOf('const printZReport');
    const printEnd = src.indexOf('const getAnalysisColumnsAndData');
    const print = src.slice(printStart, printEnd);
    const screenStart = src.indexOf('data-testid="z-report-statement"');
    const screenEnd = src.indexOf('reportsReceiptRangeSection', screenStart);
    expect(screenEnd).toBeGreaterThan(screenStart);
    const screen = src.slice(screenStart, screenEnd);
    const order = [
      'reportsZTxnCount',
      'reportsZGrossSales',
      'reportsTotalDiscount',
      'reportsZSalesReturnAmount',
      'totalExpense',
      'reportsZNetSalesAmount',
      'dailyDepositCollected',
      'reportsZNetCashAmount',
    ];

    let cursor = 0;
    for (const key of order) {
      const at = print.indexOf(key, cursor);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }

    const screenKeys = ['txn', 'gross', 'discount', 'return', 'expense', 'net-sales', 'reservation', 'net-cash'];
    cursor = 0;
    for (const key of screenKeys) {
      const at = screen.indexOf(`key: '${key}'`, cursor);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }

    expect(src).toContain('composeDayEndZStatement');
    expect(src).toContain('appointments: dailyAppointments');
    expect(src).toContain('avansRows: dailyAvansList');
    expect(src).toContain('depositSales: dailyDepositSales');
    expect(print).not.toContain('reportsNetTurnover');
    expect(print).not.toContain('reportsZPrintNetTurnover');
    expect(print).not.toContain('reportsNetAfterExpenses');
    expect(print).not.toContain('reportsZPrintNetAfterExpensesUpper');
    expect(print).not.toContain('cashStatusReservationInfo');
    expect(screen).not.toContain('reportsNetTurnover');
    expect(screen).not.toContain('reportsNetAfterExpenses');
    expect(screen).not.toContain('cashStatusReservationInfo');
    expect(screen).not.toContain('reservationGrossLabel');
    expect(screen).toContain('zReport.netCash');
    expect(screen).toContain("data-testid=\"z-report-statement\"");
    expect(screen).toContain('Kasiyer / personel cirosu');
    expect(screen).not.toContain('reportsPaymentSummarySection');
    expect(screen).not.toContain('reportsCashPayments');
    expect(screen).not.toContain('reportsCardPayments');
    expect(screen).not.toContain('veresiyeVerilen');
    expect(print).not.toContain('reportsZPrintFirstReceiptNo');
    expect(print).not.toContain('reportsZPrintLastReceiptNo');
    expect(print).not.toContain('reportsPaymentSummarySection');
    expect(print).not.toContain('reportsPaymentPieCash');
    expect(print).not.toContain('veresiyeVerilen');
    expect(print).toContain('dateLabel');
    expect(print).toContain('reportsZPrintReportTime');
    expect(print).toContain('reportsZPrintAutoGenerated');
    expect(print).toContain('RetailOS v1.0');
    expect(screen).toContain('z-day-split');
    expect(screen).toContain('z-day-lines');
    expect(screen).toContain('<DayEndZPieChart');
    expect(screen).not.toContain('justify-between');
    const layoutCss = readFileSync(resolve('src/components/reports/DayEndZReportLayout.css'), 'utf8');
    expect(layoutCss).toContain('grid-template-columns: max-content minmax(6.75rem, max-content)');
    expect(layoutCss).toContain('align-items: center');
    expect(layoutCss).toContain('@media (max-width: 959px)');
    expect(layoutCss).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(print).not.toContain('DayEndZPieChart');
    expect(print).not.toContain('z-report-pie');
    expect(print).not.toContain('buildDayEndZPieSlices');
    const pieSrc = readFileSync(resolve('src/components/reports/DayEndZPieChart.tsx'), 'utf8');
    expect(pieSrc).toContain('buildDayEndZPieSlices');
    expect(pieSrc).toContain('data-testid="z-report-pie"');
    expect(pieSrc).not.toContain('reportsPaymentSummarySection');
    expect(pieSrc).not.toContain('reportsZPrintFirstReceiptNo');
  });
});

const OPEN_10K = 'dddddddd-1010-4010-8010-101010101010';

function picture25October(reservation?: CancelledReservationBoxInput, discount = 0) {
  return composeDayEndZStatement({
    transactionCount: 2,
    grossSales: 105_000,
    discount,
    salesReturn: 15_000,
    expense: 55_000,
    reservation,
  });
}

const openDeposit10k: CancelledReservationBoxInput = {
  appointments: [{
    id: OPEN_10K,
    status: 'pre_paid',
    depositAmount: 10_000,
    appointmentDate: '2026-10-25',
  }],
};

describe('gün sonu Z pastası — 25 Ekim görseli', () => {
  it('gider 55.000 ve açık peşinat 10.000 ise net satış 35.000, net nakit 45.000', () => {
    const row = picture25October(openDeposit10k);
    expect(row.transactionCount).toBe(2);
    expect(row.grossSales).toBe(105_000);
    expect(row.discount).toBe(0);
    expect(row.salesReturn).toBe(15_000);
    expect(row.expense).toBe(55_000);
    expect(row.netSales).toBe(35_000);
    expect(row.netSales).toBe(105_000 - 0 - 15_000 - 55_000);
    expect(row.reservationAmount).toBe(10_000);
    expect(row.netCash).toBe(45_000);
    expect(row.netCash).toBe(row.netSales + row.reservationAmount);
    expect(row.netSales).not.toBe(35_000 - 55_000);
    expect(row.netCash).not.toBe(45_000 - 15_000);
    expect(row.netCash).not.toBe(45_000 - 55_000);
    expect(row).not.toHaveProperty('creditAmount');
    expect(row).not.toHaveProperty('openAccount');

    const slices = buildDayEndZPieSlices(row);
    const chart = slices.filter((slice) => slice.inChart);
    expect(chart.map((slice) => [slice.key, slice.amount])).toEqual([
      ['netSales', 35_000],
      ['reservation', 10_000],
      ['salesReturn', 15_000],
      ['expense', 55_000],
    ]);
    expect(chart.some((slice) => slice.key === 'discount')).toBe(false);
    expect(slices.find((slice) => slice.key === 'discount')).toMatchObject({ amount: 0, inChart: false });
    const keys = slices.map((slice) => slice.key);
    expect(keys).not.toContain('grossSales');
    expect(keys).not.toContain('netCash');
    expect(keys).not.toContain('transactionCount');
    expect(DAY_END_Z_PIE_COLORS.netSales).toBe('#15803d');
    expect(DAY_END_Z_PIE_COLORS.reservation).toBe('#ea580c');
    expect(DAY_END_Z_PIE_COLORS.salesReturn).toBe('#dc2626');
    expect(DAY_END_Z_PIE_COLORS.expense).toBe('#9f1239');
    expect(DAY_END_Z_PIE_COLORS.discount).toBe('#7c3aed');
  });

  it('kapanmış peşinat dilime girmez; pozitif indirim girer', () => {
    const closed = picture25October(closedReservation);
    expect(closed.reservationAmount).toBe(0);
    expect(closed.netSales).toBe(35_000);
    expect(closed.netCash).toBe(35_000);
    const closedChart = buildDayEndZPieSlices(closed).filter((slice) => slice.inChart);
    expect(closedChart.some((slice) => slice.key === 'reservation')).toBe(false);
    expect(closedChart.find((slice) => slice.key === 'netSales')?.amount).toBe(35_000);

    const discounted = picture25October(openDeposit10k, 4_000);
    expect(discounted.discount).toBe(4_000);
    expect(discounted.netSales).toBe(31_000);
    expect(discounted.netSales).toBe(105_000 - 4_000 - 15_000 - 55_000);
    expect(discounted.netCash).toBe(41_000);
    expect(discounted).not.toHaveProperty('creditAmount');
    const discountChart = buildDayEndZPieSlices(discounted).filter((slice) => slice.inChart);
    expect(discountChart.map((slice) => slice.key)).toEqual([
      'netSales',
      'reservation',
      'salesReturn',
      'expense',
      'discount',
    ]);
    expect(discountChart.find((slice) => slice.key === 'discount')?.amount).toBe(4_000);
    expect(discountChart.find((slice) => slice.key === 'expense')?.amount).toBe(55_000);
    expect(discountChart.find((slice) => slice.key === 'netSales')?.amount).toBe(31_000);
  });

  it('lejant liste tutarını gösterir, indirim 0 ve brüt dilim değildir', () => {
    const row = picture25October(openDeposit10k);
    render(createElement(DayEndZPieChart, {
      netSales: row.netSales,
      reservationAmount: row.reservationAmount,
      salesReturn: row.salesReturn,
      expense: row.expense,
      discount: row.discount,
      netCash: row.netCash,
      title: 'Günün parçaları',
      netCashLabel: 'Net nakit tutarı',
      labels: {
        netSales: 'Net satış tutarı',
        reservation: 'Rezervasyon Tutarı',
        salesReturn: 'Satış iade tutarı',
        expense: 'Toplam Gider',
        discount: 'Toplam İndirim',
      },
    }));

    const legend = screen.getByTestId('z-report-pie-legend');
    expect(legend).toHaveTextContent('Net satış tutarı');
    expect(legend).toHaveTextContent('35.000');
    expect(legend).toHaveTextContent('Rezervasyon Tutarı');
    expect(legend).toHaveTextContent('10.000');
    expect(legend).toHaveTextContent('Satış iade tutarı');
    expect(legend).toHaveTextContent('15.000');
    expect(legend).toHaveTextContent('Toplam Gider');
    expect(legend).toHaveTextContent('55.000');
    expect(legend).toHaveTextContent('Toplam İndirim');
    expect(legend).toHaveTextContent('0');
    expect(legend).not.toHaveTextContent('105.000');
    expect(legend).not.toHaveTextContent('45.000');
    expect(screen.getByTestId('z-report-pie-center')).toHaveTextContent('45.000');
    expect(screen.getByTestId('z-report-pie-center')).toHaveTextContent('Net nakit tutarı');
    expect(screen.getByTestId('z-report-pie-slice-discount')).toHaveAttribute('data-in-chart', '0');
    expect(screen.getByTestId('z-report-pie-slice-netSales')).toHaveAttribute('data-in-chart', '1');
    expect(screen.getByTestId('z-report-pie-slice-reservation')).toHaveAttribute('data-amount', '10000');
    expect(screen.getByTestId('z-report-pie-slice-salesReturn')).toHaveAttribute('data-amount', '15000');
    expect(screen.getByTestId('z-report-pie-slice-expense')).toHaveAttribute('data-amount', '55000');
    expect(screen.queryByTestId('z-report-pie-slice-grossSales')).toBeNull();
    const painted = screen.getByTestId('z-pie-slices').textContent || '';
    expect(painted).toContain('netSales:35000');
    expect(painted).toContain('reservation:10000');
    expect(painted).toContain('salesReturn:15000');
    expect(painted).toContain('expense:55000');
    expect(painted).not.toContain('discount');
    expect(painted).not.toContain('gross');
    expect(screen.getByTestId('z-report-pie-slice-discount')).toHaveAttribute('data-amount', '0');
    expect(screen.getByTestId('z-report-pie').textContent || '').not.toMatch(/\b2\b/);
  });
});
