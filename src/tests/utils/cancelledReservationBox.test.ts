/**
 * Rezervasyon kutusu: kapanmış peşinat girmez.
 * Bekleyen ve iptal peşinatı girer. Ciro bu tutardan ikinci kez büyümez.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppointmentStatus, type BeautyAppointment } from '../../types/beauty';
import { clinicDashboardKpiTone } from '../../utils/clinicDashboardKpiTones';
import { computeClinicExpectedRevenue } from '../../utils/clinicDashboardStats';
import { dailyReportCardTone } from '../../utils/dailyReportScreenCards';
import { periodSummaryHeadline } from '../../utils/periodSummaryNet';
import {
  periodSummaryHeadlineTone,
} from '../../utils/periodSummaryScreen';
import {
  cancelledUnclosedReservationBox,
  cancelledUnclosedReservationByPeriod,
  clinicPanelTahsilat,
  dailyReservationAvansList,
  dailyReservationAvansNet,
} from '../../utils/cancelledReservationBox';

const CLOSED_ID = '11111111-1111-4111-8111-111111111111';
const CANCELLED_ID = '22222222-2222-4222-8222-222222222222';
const OPEN_ID = '33333333-3333-4333-8333-333333333333';
const NO_SHOW_ID = '44444444-4444-4444-8444-444444444444';

describe('kapanmamış ve iptal rezervasyon kutusu', () => {
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
      status: 'pre_paid',
      depositAmount: 25_000,
      appointmentDate: '2026-10-25',
    },
    {
      id: NO_SHOW_ID,
      status: 'no_show',
      depositAmount: 3_000,
      appointmentDate: '2026-10-25',
    },
  ];

  const avansRows = [
    {
      amount: 5_000,
      status: 'applied',
      notes: `Rezervasyon Tutarı · Randevu No ${CLOSED_ID}`,
      appointmentStatus: 'completed',
      createdAt: '2026-10-25',
    },
    {
      amount: 25_000,
      status: 'open',
      notes: `Rezervasyon Tutarı · Randevu No ${OPEN_ID}`,
      appointmentStatus: 'pre_paid',
      createdAt: '2026-10-25',
    },
    {
      amount: 10_000,
      status: 'kept_on_cancel',
      notes: `Rezervasyon Tutarı · Randevu No ${CANCELLED_ID}`,
      appointmentStatus: 'cancelled',
      createdAt: '2026-10-25',
    },
  ];

  it('kapanmış 5.000 kutuya girmez, bekleyen 25.000 ve iptal 10.000 girer', () => {
    const closedOnly = cancelledUnclosedReservationBox({
      appointments: [appointments[0]],
    });
    expect(closedOnly.amount).toBe(0);
    expect(closedOnly.count).toBe(0);

    const waitingOnly = cancelledUnclosedReservationBox({
      appointments: [appointments[2]],
    });
    expect(waitingOnly.amount).toBe(25_000);
    expect(waitingOnly.count).toBe(1);

    const cancelledOnly = cancelledUnclosedReservationBox({
      appointments: [appointments[1]],
    });
    expect(cancelledOnly.amount).toBe(10_000);
    expect(cancelledOnly.count).toBe(1);

    const box = cancelledUnclosedReservationBox({ appointments, avansRows });
    expect(box.amount).toBe(35_000);
    expect(box.count).toBe(2);
    expect(box.amount).not.toBe(5_000);
    expect(box.amount).not.toBe(15_000);
    expect(box.amount).not.toBe(40_000);
    expect(box.amount).not.toBe(38_000);

    const day = cancelledUnclosedReservationByPeriod({ appointments, avansRows }, 'monthly-days');
    const month = cancelledUnclosedReservationByPeriod({ appointments, avansRows }, 'yearly-months');
    expect(day.get('2026-10-25')).toEqual({ amount: 35_000, count: 2 });
    expect(month.get('2026-10')).toEqual({ amount: 35_000, count: 2 });
  });

  it('kapanmış 5.000 günlük listede yoktur; bekleyen 25.000 satırda gerçek tutardır', () => {
    const visible = dailyReservationAvansList(avansRows);
    expect(visible.map((row) => row.amount)).toEqual([25_000, 10_000]);
    expect(visible.some((row) => row.appointmentStatus === 'completed')).toBe(false);
    expect(dailyReservationAvansNet(avansRows[0])).toBe(0);
    expect(dailyReservationAvansNet(avansRows[1])).toBe(25_000);
    expect(dailyReservationAvansNet(avansRows[2])).toBe(10_000);
  });

  it('bekleyen 25.000 tahsilata girmez; iptal 10.000 beklenen ciroya girmez', () => {
    const collection = clinicPanelTahsilat({
      closedSaleCash: 20_000,
      appointments,
      avansRows,
    });
    expect(collection).toBe(25_000);
    expect(collection).not.toBe(20_000 + 5_000 + 25_000);
    expect(collection).not.toBe(20_000 + 5_000 + 25_000 + 10_000);
    expect(collection).not.toBe(50_000);

    const expected = computeClinicExpectedRevenue([
      {
        id: CLOSED_ID,
        customer_id: 'c-closed',
        service_id: 'svc',
        appointment_date: '2026-10-25',
        appointment_time: '09:00',
        status: AppointmentStatus.COMPLETED,
        total_price: 25_000,
      },
      {
        id: OPEN_ID,
        customer_id: 'c-open',
        service_id: 'svc',
        appointment_date: '2026-10-25',
        appointment_time: '10:00',
        status: AppointmentStatus.PRE_PAID,
        total_price: 75_000,
      },
      {
        id: CANCELLED_ID,
        customer_id: 'c-cancel',
        service_id: 'svc',
        appointment_date: '2026-10-25',
        appointment_time: '11:00',
        status: AppointmentStatus.CANCELLED,
        total_price: 10_000,
      },
    ] as BeautyAppointment[]);
    expect(expected.amount).toBe(75_000);
    expect(expected.count).toBe(1);
    expect(expected.amount).not.toBe(75_000 + 10_000);
    expect(expected.amount).not.toBe(75_000 + 25_000);
  });

  it('rezervasyon kutusu nete bir kez girer; kapanmış 5.000 ve iptal ikinci kez yok', () => {
    const box = cancelledUnclosedReservationBox({ appointments, avansRows });
    const after = periodSummaryHeadline({
      revenue: 40_000,
      returnsAmount: 15_000,
      returnDeduction: 15_000,
      expenses: 0,
      expenseEnabled: true,
      reservationDeposit: box.amount,
      forfeitedDeposit: 10_000,
    });

    expect(box.amount).toBe(35_000);
    expect(box.count).toBe(2);
    expect(after.grossRevenue).toBe(40_000);
    expect(after.returnAmount).toBe(15_000);
    expect(after.depositInfo).toBe(35_000);
    expect(after.netRevenue).toBe(60_000);
    expect(after.grossRevenue).not.toBe(40_000 + 5_000);
    expect(after.netRevenue).not.toBe(70_000);
    expect(after.netRevenue).not.toBe(65_000);
    expect(after.netRevenue).not.toBe(40_000 + 35_000);
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
    expect(daily).toContain('dailyReservationAvansList');
    expect(clinic).toContain('cancelledUnclosedReservationBox');
    expect(clinic).toContain('clinicPanelTahsilat');
    expect(scheduler).not.toMatch(/AppointmentStatus\.NO_SHOW,\s*label:\s*tm\('bStatusNoShow'\)/);
  });
});
