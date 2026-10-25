/**
 * Rezervasyon kutusu: kapanmış peşinat girmez, iptal ve kapanmamış peşinat girer.
 * Ciro ve net bu tutardan değişmez. Aylık ve yıllık kutu renkleri yer değiştirir.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clinicDashboardKpiTone } from '../../utils/clinicDashboardKpiTones';
import { dailyReportCardTone } from '../../utils/dailyReportScreenCards';
import { periodSummaryHeadline } from '../../utils/periodSummaryNet';
import {
  periodSummaryHeadlineTone,
} from '../../utils/periodSummaryScreen';
import {
  cancelledUnclosedReservationBox,
  cancelledUnclosedReservationByPeriod,
} from '../../utils/cancelledReservationBox';

const CLOSED_ID = '11111111-1111-4111-8111-111111111111';
const CANCELLED_ID = '22222222-2222-4222-8222-222222222222';
const OPEN_ID = '33333333-3333-4333-8333-333333333333';
const NO_SHOW_ID = '44444444-4444-4444-8444-444444444444';

describe('iptal edilmiş ve kapanmamış rezervasyon kutusu', () => {
  const appointments = [
    {
      id: CLOSED_ID,
      status: 'completed',
      depositAmount: 5_000,
      appointmentDate: '2026-10-25',
    },
    {
      id: CANCELLED_ID,
      status: 'cancelled',
      depositAmount: 10_000,
      appointmentDate: '2026-10-25',
    },
    {
      id: OPEN_ID,
      status: 'confirmed',
      depositAmount: 7_000,
      appointmentDate: '2026-10-25',
    },
    {
      id: NO_SHOW_ID,
      status: 'no_show',
      depositAmount: 3_000,
      appointmentDate: '2026-10-25',
    },
  ];

  it('kapanmış 5.000 girmez, iptal 10.000 girer, ikisi varken kutu 10.000 ve adet 1', () => {
    const closedOnly = cancelledUnclosedReservationBox({
      appointments: [appointments[0]],
    });
    expect(closedOnly.amount).toBe(0);
    expect(closedOnly.count).toBe(0);

    const cancelledOnly = cancelledUnclosedReservationBox({
      appointments: [appointments[1]],
    });
    expect(cancelledOnly.amount).toBe(10_000);
    expect(cancelledOnly.count).toBe(1);

    const both = cancelledUnclosedReservationBox({ appointments });
    expect(both.amount).toBe(10_000);
    expect(both.count).toBe(1);
    expect(both.amount).not.toBe(5_000);
    expect(both.amount).not.toBe(15_000);
    expect(both.amount).not.toBe(25_000);

    const day = cancelledUnclosedReservationByPeriod({ appointments }, 'monthly-days');
    const month = cancelledUnclosedReservationByPeriod({ appointments }, 'yearly-months');
    expect(day.get('2026-10-25')).toEqual({ amount: 10_000, count: 1 });
    expect(month.get('2026-10')).toEqual({ amount: 10_000, count: 1 });

    const withAvans = cancelledUnclosedReservationBox({
      appointments,
      avansRows: [
        {
          amount: 5_000,
          status: 'applied',
          notes: `Rezervasyon Tutarı · Randevu No ${CLOSED_ID}`,
          createdAt: '2026-10-25',
        },
        {
          amount: 10_000,
          status: 'kept_on_cancel',
          notes: `Rezervasyon Tutarı · Randevu No ${CANCELLED_ID}`,
          createdAt: '2026-10-25',
        },
      ],
    });
    expect(withAvans.amount).toBe(10_000);
    expect(withAvans.count).toBe(1);
  });

  it('ciro ve net rezervasyon kutusundan değişmez; iade 15.000 durur', () => {
    const box = cancelledUnclosedReservationBox({ appointments });
    const base = {
      revenue: 40_000,
      returnsAmount: 15_000,
      returnDeduction: 15_000,
      expenses: 0,
      expenseEnabled: true,
      forfeitedDeposit: 10_000,
    };
    const before = periodSummaryHeadline({
      ...base,
      reservationDeposit: 15_000,
    });
    const after = periodSummaryHeadline({
      ...base,
      reservationDeposit: box.amount,
    });

    expect(box.amount).toBe(10_000);
    expect(box.count).toBe(1);
    expect(after.grossRevenue).toBe(40_000);
    expect(after.returnAmount).toBe(15_000);
    expect(after.grossRevenue).toBe(before.grossRevenue);
    expect(after.netRevenue).toBe(before.netRevenue);
    expect(after.netRevenue).toBe(35_000);
    expect(after.depositInfo).toBe(10_000);
    expect(after.netRevenue).not.toBe(before.netRevenue + box.amount);
  });

  it('aylık ve yıllık rezervasyon turuncu, iade teal; günlük ve panel turuncusu durur', () => {
    const reservation = periodSummaryHeadlineTone('reservation');
    const returns = periodSummaryHeadlineTone('returns');
    const dailyReservation = dailyReportCardTone('reservation-amount').background;
    const panelReservation = clinicDashboardKpiTone('reservation').background;

    expect(reservation.background).toBe('#f59e0b');
    expect(reservation.background).toBe(dailyReservation);
    expect(panelReservation).toBe('#f59e0b');
    expect(returns.background).toBe('#0d9488');
    expect(returns.background).not.toBe(reservation.background);
    expect(periodSummaryHeadlineTone('revenue').background).toBe('#2563eb');
    expect(periodSummaryHeadlineTone('expenses').background).toBe('#f04438');
    expect(periodSummaryHeadlineTone('net').background).toBe('#12b76a');
    expect(dailyReportCardTone('total-revenue').background).toBe('#2563eb');
    expect(dailyReportCardTone('return-amount').background).toBe('#e11d48');

    const period = readFileSync(resolve('src/components/reports/PeriodSummaryReport.tsx'), 'utf8');
    const daily = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    const clinic = readFileSync(resolve('src/components/beauty/components/ClinicDashboard.tsx'), 'utf8');
    const scheduler = readFileSync(resolve('src/components/beauty/components/SmartScheduler.tsx'), 'utf8');
    expect(period).toContain('cancelledUnclosedReservationByPeriod');
    expect(daily).toContain('cancelledUnclosedReservationBox');
    expect(clinic).toContain('cancelledUnclosedReservationBox');
    expect(scheduler).not.toMatch(/AppointmentStatus\.NO_SHOW,\s*label:\s*tm\('bStatusNoShow'\)/);
  });
});
