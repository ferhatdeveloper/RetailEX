/**
 * Bir randevunun 15.000 peşinatı dört raporda bir kez durur.
 * Kasa satırının notu İngilizce olsa da bağ randevu kimliğidir.
 * İkinci randevunun kendi 15.000 peşinatı ayrıca sayılır.
 * Kapanmış randevunun peşinatı hizmet cirosundadır.
 */
import { describe, expect, it } from 'vitest';
import {
  cancelledUnclosedReservationBox,
  cancelledUnclosedReservationByPeriod,
  dailyReservationAvansList,
  type CancelledReservationBoxInput,
} from '../../utils/cancelledReservationBox';
import { periodSummaryHeadline, reportDisplayNet } from '../../utils/periodSummaryNet';
import {
  buildDayEndZPieSlices,
  composeDayEndZStatement,
} from '../../utils/posZReport';
import { reservationPendingForRange } from '../../utils/reportReservationPending';

const DAY = '2026-11-01';
const SUNUK = '66da4d9d-d659-4a1a-8824-d54b06fcfb83';
const OTHER = '77777777-2222-4222-8222-222222222222';
const CLOSED = '88888888-3333-4333-8333-333333333333';

function collectionNote(appointmentId: string, fiche: string): string {
  return `reserved_sale_fiche:${fiche} | rex_appt:${appointmentId} | Reservation Amount · Appointment No ${appointmentId}`;
}

function openAppointment(id: string) {
  return {
    id,
    status: 'pre_paid',
    total_price: 75_000,
    deposit_amount: 15_000,
    deposit_date: `${DAY}T08:44:57.819Z`,
    appointment_date: DAY,
    created_at: `${DAY}T08:44:55.265Z`,
    customer_name: id === SUNUK ? 'sunuk' : 'roza',
  };
}

function openAvans(id: string, fiche: string) {
  return {
    amount: 15_000,
    status: 'open',
    notes: collectionNote(id, fiche),
    created_at: `${DAY}T08:44:56.692Z`,
    cash_line_id: `cash-${id}`,
  };
}

function sunukInput(): CancelledReservationBoxInput {
  return {
    appointments: [
      openAppointment(SUNUK),
      {
        id: CLOSED,
        status: 'completed',
        total_price: 75_000,
        deposit_amount: 15_000,
        deposit_date: `${DAY}T07:35:36.110Z`,
        appointment_date: DAY,
        created_at: `${DAY}T07:35:23.025Z`,
      },
    ],
    avansRows: [
      openAvans(SUNUK, 'BEA-2026-00012'),
      {
        amount: 15_000,
        status: 'applied',
        notes: collectionNote(CLOSED, 'BEA-2026-00004'),
        appointmentStatus: 'completed',
        created_at: `${DAY}T07:35:26.538Z`,
        cash_line_id: `cash-${CLOSED}`,
      },
    ],
    depositSales: [
      {
        amount: 15_000,
        total: 15_000,
        notes: collectionNote(SUNUK, 'BEA-2026-00012'),
        linkedAppointmentId: SUNUK,
        date: `${DAY}T08:44:57.819Z`,
      },
    ],
  };
}

describe('açık 15.000 peşinat bir kez', () => {
  it('günlük kart, aylık gün, yıllık ay ve Z raporu 1 adet ve 15.000', () => {
    const input = sunukInput();
    const daily = cancelledUnclosedReservationBox(input);
    const byDay = cancelledUnclosedReservationByPeriod(input, 'monthly-days');
    const byMonth = cancelledUnclosedReservationByPeriod(input, 'yearly-months');
    const z = composeDayEndZStatement({
      grossSales: 560_000,
      discount: 0,
      salesReturn: 0,
      expense: 36_750,
      reservation: input,
    });
    const pending = reservationPendingForRange(input.appointments, DAY, DAY);
    const dailyNet = reportDisplayNet({
      revenue: 560_000,
      reservationAmount: daily.amount,
      returnDeduction: 0,
      discount: 0,
      expenses: 36_750,
      expenseEnabled: true,
    });
    const monthHeadline = periodSummaryHeadline({
      revenue: 560_000,
      returnsAmount: 0,
      returnDeduction: 0,
      expenses: 41_500,
      expenseEnabled: true,
      reservationDeposit: byMonth.get('2026-11')?.amount ?? 0,
      discount: 0,
    });

    expect(daily).toEqual({ amount: 15_000, count: 1 });
    expect(byDay.get(DAY)).toEqual({ amount: 15_000, count: 1 });
    expect(byMonth.get('2026-11')).toEqual({ amount: 15_000, count: 1 });
    expect(z.reservationAmount).toBe(15_000);
    expect(z.netSales).toBe(523_250);
    expect(z.netCash).toBe(538_250);
    expect(dailyNet).toBe(538_250);
    expect(dailyNet).not.toBe(553_250);
    expect(z.netCash).not.toBe(553_250);
    expect(buildDayEndZPieSlices(z).find((slice) => slice.key === 'reservation')?.amount).toBe(15_000);

    expect(pending.gross).toBe(75_000);
    expect(pending.deposit).toBe(15_000);
    expect(pending.pending).toBe(60_000);
    expect(pending.count).toBe(1);

    expect(monthHeadline.depositInfo).toBe(15_000);
    expect(monthHeadline.netRevenue).toBe(533_500);
    expect(monthHeadline.grossRevenue).toBe(560_000);

    const visible = dailyReservationAvansList([
      { ...openAvans(SUNUK, 'BEA-2026-00012'), appointmentStatus: 'pre_paid' },
      {
        amount: 15_000,
        status: 'applied',
        notes: collectionNote(CLOSED, 'BEA-2026-00004'),
        appointmentStatus: 'completed',
        createdAt: `${DAY}T07:35:26.538Z`,
      },
    ]);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.amount).toBe(15_000);
    expect(String(visible[0]?.notes)).toContain('BEA-2026-00012');
  });

  it('İngilizce etiket tek başına da aynı randevuya bağlanır', () => {
    const input: CancelledReservationBoxInput = {
      appointments: [openAppointment(SUNUK)],
      avansRows: [{
        amount: 15_000,
        status: 'open',
        notes: `Reservation Amount · Appointment No ${SUNUK}`,
        created_at: `${DAY}T08:44:56.692Z`,
      }],
    };
    expect(cancelledUnclosedReservationBox(input)).toEqual({ amount: 15_000, count: 1 });
  });

  it('aynı randevuya yazılmış ikinci kasa satırı bir kez sayılır', () => {
    const input: CancelledReservationBoxInput = {
      appointments: [openAppointment(SUNUK)],
      avansRows: [
        openAvans(SUNUK, 'BEA-2026-00012'),
        {
          ...openAvans(SUNUK, 'BEA-2026-00012'),
          cash_line_id: 'cash-sunuk-copy',
        },
      ],
    };
    expect(cancelledUnclosedReservationBox(input)).toEqual({ amount: 15_000, count: 1 });
  });

  it('ayrı randevunun kendi 15.000 peşinatı 2 adet ve 30.000 olur', () => {
    const input: CancelledReservationBoxInput = {
      appointments: [openAppointment(SUNUK), openAppointment(OTHER)],
      avansRows: [
        openAvans(SUNUK, 'BEA-2026-00012'),
        openAvans(OTHER, 'BEA-2026-00013'),
      ],
    };
    const box = cancelledUnclosedReservationBox(input);
    const byDay = cancelledUnclosedReservationByPeriod(input, 'monthly-days');
    const byMonth = cancelledUnclosedReservationByPeriod(input, 'yearly-months');
    const z = composeDayEndZStatement({
      grossSales: 560_000,
      expense: 36_750,
      reservation: input,
    });
    const net = reportDisplayNet({
      revenue: 560_000,
      reservationAmount: box.amount,
      returnDeduction: 0,
      discount: 0,
      expenses: 36_750,
      expenseEnabled: true,
    });

    expect(box).toEqual({ amount: 30_000, count: 2 });
    expect(byDay.get(DAY)).toEqual({ amount: 30_000, count: 2 });
    expect(byMonth.get('2026-11')).toEqual({ amount: 30_000, count: 2 });
    expect(z.reservationAmount).toBe(30_000);
    expect(z.netCash).toBe(553_250);
    expect(net).toBe(553_250);
    expect(net).toBe(560_000 + 30_000 - 36_750);
  });
});
