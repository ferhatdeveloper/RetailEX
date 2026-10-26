/**
 * Net = ciro + rezervasyon tutarı − iade − gider.
 * Açık peşinat rezervasyon kutusundadır ve nete bir kez girer.
 * Randevu kapanınca peşinat kutudan çıkar, hizmet tutarı cirodadır.
 * İndirim ciro netindedir. Gider bir kez düşer. İade bir kez düşer.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { KasaIslemi } from '../../services/api/kasa';
import {
  cancelledUnclosedReservationBox,
  cancelledUnclosedReservationByPeriod,
  clinicPanelTahsilat,
} from '../../utils/cancelledReservationBox';
import {
  periodSummaryHeadline,
  periodSummaryNetRemaining,
  reportDisplayNet,
} from '../../utils/periodSummaryNet';
import { mergeExpensesWithCashOuts } from '../../utils/reportUnifiedExpenses';

const OPEN_ID = '33333333-3333-4333-8333-333333333333';

const openAppointment = {
  id: OPEN_ID,
  status: 'pre_paid',
  depositAmount: 25_000,
  appointmentDate: '2026-10-25',
};

describe('net = ciro + rezervasyon − iade − gider', () => {
  it('ciro 25.000 + açık peşinat 25.000 = net 50.000', () => {
    const box = cancelledUnclosedReservationBox({ appointments: [openAppointment] });
    const day = cancelledUnclosedReservationByPeriod({ appointments: [openAppointment] }, 'monthly-days');
    const year = cancelledUnclosedReservationByPeriod({ appointments: [openAppointment] }, 'yearly-months');

    expect(box.amount).toBe(25_000);
    expect(box.count).toBe(1);
    expect(day.get('2026-10-25')?.amount).toBe(25_000);
    expect(year.get('2026-10')?.amount).toBe(25_000);

    const daily = reportDisplayNet({
      revenue: 25_000,
      reservationAmount: box.amount,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
    });
    const month = periodSummaryHeadline({
      revenue: 25_000,
      returnsAmount: 0,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
      reservationDeposit: day.get('2026-10-25')?.amount,
    });
    const yearly = periodSummaryHeadline({
      revenue: 25_000,
      returnsAmount: 0,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
      reservationDeposit: year.get('2026-10')?.amount,
    });

    expect(daily).toBe(50_000);
    expect(month.grossRevenue).toBe(25_000);
    expect(month.depositInfo).toBe(25_000);
    expect(month.netRevenue).toBe(50_000);
    expect(yearly.netRevenue).toBe(50_000);
    expect(month.netRevenue).not.toBe(25_000);
  });

  it('kapanınca peşinat rezervasyondan çıkar, ciro 75.000, rezervasyon 0, net 75.000', () => {
    const closed = {
      id: OPEN_ID,
      status: 'completed',
      depositAmount: 25_000,
      appointmentDate: '2026-10-25',
    };
    const applied = {
      amount: 25_000,
      status: 'applied',
      appointmentStatus: 'completed',
      notes: `Rezervasyon Tutarı · Randevu No ${OPEN_ID}`,
      createdAt: '2026-10-25',
    };
    const box = cancelledUnclosedReservationBox({
      appointments: [closed],
      avansRows: [applied],
    });
    const day = cancelledUnclosedReservationByPeriod({
      appointments: [closed],
      avansRows: [applied],
    }, 'monthly-days');
    const year = cancelledUnclosedReservationByPeriod({
      appointments: [closed],
      avansRows: [applied],
    }, 'yearly-months');

    expect(box.amount).toBe(0);
    expect(day.get('2026-10-25')?.amount ?? 0).toBe(0);
    expect(year.get('2026-10')?.amount ?? 0).toBe(0);

    const net = reportDisplayNet({
      revenue: 75_000,
      reservationAmount: box.amount,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
    });
    const month = periodSummaryHeadline({
      revenue: 75_000,
      returnsAmount: 0,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
      reservationDeposit: box.amount,
      forfeitedDeposit: 0,
    });

    expect(net).toBe(75_000);
    expect(net).not.toBe(100_000);
    expect(net).not.toBe(75_000 + 25_000);
    expect(month.netRevenue).toBe(75_000);
    expect(month.netRevenue).not.toBe(100_000);
  });

  it('gider 10.000 ise net 40.000; virman gider değildir', () => {
    expect(reportDisplayNet({
      revenue: 25_000,
      reservationAmount: 25_000,
      returnDeduction: 0,
      expenses: 10_000,
      expenseEnabled: true,
    })).toBe(40_000);

    const virman = {
      id: 'line-virman',
      firma_id: '001',
      kasa_id: 'reg-1',
      target_register_id: 'reg-2',
      islem_tarihi: '2026-10-25',
      islem_tipi: 'VIRMAN',
      islem_aciklamasi: 'Kasa virmanı',
      islem_no: 'VRM-1',
      tutar: 10_000,
      sign: -1,
    } as KasaIslemi;
    const expenses = mergeExpensesWithCashOuts([], [virman]);
    expect(expenses).toHaveLength(0);
    expect(reportDisplayNet({
      revenue: 25_000,
      reservationAmount: 25_000,
      returnDeduction: 0,
      expenses: expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
      expenseEnabled: true,
    })).toBe(50_000);
  });

  it('iade bir kez düşer; indirim ciro netindedir', () => {
    const gross = reportDisplayNet({
      revenue: 40_000,
      reservationAmount: 25_000,
      returnDeduction: 15_000,
      expenses: 0,
      expenseEnabled: true,
    });
    const ciroAlreadyNet = reportDisplayNet({
      revenue: 25_000,
      reservationAmount: 25_000,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
    });
    expect(gross).toBe(50_000);
    expect(gross).not.toBe(40_000 + 25_000 - 15_000 - 15_000);
    expect(ciroAlreadyNet).toBe(gross);

    expect(reportDisplayNet({
      revenue: 24_000,
      reservationAmount: 25_000,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
    })).toBe(49_000);

    expect(periodSummaryNetRemaining({
      revenue: 25_000,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
      reservationDeposit: 25_000,
      ciroDisiTahsilat: 25_000,
    })).toBe(50_000);
  });

  it('günlük dip toplam kartla aynıdır; klinik tahsilata açık peşinat girmez', () => {
    const daily = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    const period = readFileSync(resolve('src/components/reports/PeriodSummaryReport.tsx'), 'utf8');
    const clinic = readFileSync(resolve('src/components/beauty/components/ClinicDashboard.tsx'), 'utf8');

    expect(daily).toContain('reportDisplayNet');
    expect(daily).toContain('dailyRevenueDiscount(dailySalesActive)');
    expect(daily).toContain('displayedDailySalesDetailNet');
    expect(period).toContain('discount: sale.discount');
    expect(period).toContain('const netRemaining = headline.netRevenue');
    expect(period).toContain('netRemaining: acc.netRemaining + r.netRemaining');
    expect(clinic).not.toContain('reportDisplayNet');

    expect(clinicPanelTahsilat({
      closedSaleCash: 25_000,
      appointments: [openAppointment],
    })).toBe(25_000);
  });
});
