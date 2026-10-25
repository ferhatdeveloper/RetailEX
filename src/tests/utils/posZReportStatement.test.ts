/**
 * Gün sonu Z — görseldeki sıra.
 * Net satış = brüt − indirim − iade − gider.
 * Net nakit = net satış + açık veya iptal peşinat.
 * Kapanmış peşinat rezervasyon satırında 0 kalır ve net nakde eklenmez.
 * Kimlik fiş / randevu kimliğidir. Müşteri adı küme anahtarı değildir.
 * İndirim açık cari değildir. Virman gider değildir.
 * İade ve gider bir kez düşülür.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { KasaIslemi } from '../../services/api/kasa';
import type { CancelledReservationBoxInput } from '../../utils/cancelledReservationBox';
import { composeDayEndZStatement } from '../../utils/posZReport';
import { mergeExpensesWithCashOuts } from '../../utils/reportUnifiedExpenses';

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
    const screenEnd = src.indexOf('reportsPaymentSummarySection', screenStart);
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
  });
});
