/**
 * Günlük rapor Satış Detayları — 25.10.2026.
 * Kapanmış randevunun AVANS satırı listede yoktur.
 * Hizmet fişi ve net 75.000 durur. 25.000 ikinci kez girmez ve düşülmez.
 * İptal fişinin AVANS satırı kalır; tutarı rezervasyon kutusuna bir kez girer ve iade değildir.
 * Açık peşinat satırı kalır. Gizleme müşteri adına göre değildir.
 */
import { describe, expect, it } from 'vitest';
import {
  cancelledUnclosedReservationBox,
  dailyReservationAvansList,
  dailyReservationAvansNet,
} from '../../utils/cancelledReservationBox';
import { summarizeDailyScreenFiches } from '../../utils/dailySalesDetailFicheSet';
import { isDailySalesDetailReturn } from '../../utils/dailySalesDetailKind';
import { reportDisplayNet } from '../../utils/periodSummaryNet';

const CLOSED_ID = '7df0cac9-1111-4111-8111-111111111111';
const CANCEL_ID = 'aaaaaaaa-2222-4222-8222-222222222222';
const OPEN_ID = 'bbbbbbbb-3333-4333-8333-333333333333';

interface AvansRow {
  id: string;
  amount: number;
  status: string;
  notes: string;
  appointmentStatus: string;
  customerName: string;
  referenceNo: string;
}

function avans(partial: AvansRow): AvansRow {
  return partial;
}

const closedAvans = avans({
  id: '7df0cac9-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  amount: 25_000,
  status: 'applied',
  notes: `Rezervasyon Tutarı · Randevu No ${CLOSED_ID}`,
  appointmentStatus: 'completed',
  customerName: 'FERHAT',
  referenceNo: 'AVANS-7df0cac9',
});

const cancelledAvans = avans({
  id: 'cancel-avans-1',
  amount: 10_000,
  status: 'kept_on_cancel',
  notes: `Rezervasyon Tutarı · Randevu No ${CANCEL_ID}`,
  appointmentStatus: 'cancelled',
  customerName: 'FERHAT',
  referenceNo: 'AVANS-iptal',
});

const openAvans = avans({
  id: 'open-avans-1',
  amount: 8_000,
  status: 'open',
  notes: `Rezervasyon Tutarı · Randevu No ${OPEN_ID}`,
  appointmentStatus: 'pre_paid',
  customerName: 'FERHAT',
  referenceNo: 'AVANS-acik',
});

const serviceReceipt = 'BEA-2026-00001';

describe('kapanmış randevunun avans satırı', () => {
  it('AVANS-7df0cac9 listede yoktur; hizmet satırı ve net 75.000 durur', () => {
    const visible = dailyReservationAvansList([closedAvans]);
    expect(visible).toHaveLength(0);
    expect(visible.map((row) => row.referenceNo)).not.toContain('AVANS-7df0cac9');
    expect(dailyReservationAvansNet(closedAvans)).toBe(0);

    const box = cancelledUnclosedReservationBox({
      appointments: [{
        id: CLOSED_ID,
        status: 'completed',
        depositAmount: 25_000,
        appointmentDate: '2026-10-25',
      }],
      avansRows: [closedAvans],
    });
    expect(box.amount).toBe(0);
    expect(box.count).toBe(0);

    const screen = summarizeDailyScreenFiches([
      {
        id: 'bea-2026-00001',
        receiptNumber: serviceReceipt,
        customerName: 'FERHAT',
        revenue: 75_000,
      },
      {
        id: closedAvans.id,
        receiptNumber: closedAvans.referenceNo,
        customerName: 'FERHAT',
        depositAmount: 25_000,
        closed: true,
      },
    ]);
    expect(screen.rows).toHaveLength(1);
    expect(screen.rows[0]?.receiptNumber).toBe(serviceReceipt);
    expect(screen.rows.map((row) => row.receiptNumber)).not.toContain('AVANS-7df0cac9');
    expect(screen.revenue).toBe(75_000);
    expect(screen.reservation).toBe(0);
    expect(screen.returns).toBe(0);
    expect(screen.expenses).toBe(0);
    expect(screen.net).toBe(75_000);
    expect(screen.footer).toBe(75_000);
    expect(screen.net).toBe(reportDisplayNet({
      revenue: 75_000,
      reservationAmount: box.amount,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
    }));
    expect(screen.net).not.toBe(75_000 - 25_000);
    expect(screen.net).not.toBe(75_000 + 25_000);
    expect(screen.net).not.toBe(50_000);
    expect(screen.net).not.toBe(100_000);
  });

  it('iptal fişinin AVANS satırı durur; tutar kutuya bir kez girer ve iade değildir', () => {
    const visible = dailyReservationAvansList([cancelledAvans]);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.referenceNo).toBe('AVANS-iptal');
    expect(visible[0]?.amount).toBe(10_000);
    expect(dailyReservationAvansNet(cancelledAvans)).toBe(10_000);

    const box = cancelledUnclosedReservationBox({
      appointments: [{
        id: CANCEL_ID,
        status: 'cancelled',
        depositAmount: 10_000,
        appointmentDate: '2026-10-25',
      }],
      avansRows: [cancelledAvans],
    });
    expect(box.amount).toBe(10_000);
    expect(box.count).toBe(1);
    expect(box.amount).not.toBe(20_000);

    const net = reportDisplayNet({
      revenue: 0,
      reservationAmount: box.amount,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
    });
    expect(net).toBe(10_000);
    expect(net).not.toBe(-10_000);
    expect(isDailySalesDetailReturn({
      isAvans: true,
      isForfeitedDeposit: true,
      total: cancelledAvans.amount,
      status: 'kept_on_cancel',
    })).toBe(false);
  });

  it('açık peşinat satırı durur ve rezervasyon kutusunda kalır', () => {
    const visible = dailyReservationAvansList([openAvans]);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.referenceNo).toBe('AVANS-acik');
    expect(visible[0]?.amount).toBe(8_000);

    const box = cancelledUnclosedReservationBox({
      appointments: [{
        id: OPEN_ID,
        status: 'pre_paid',
        depositAmount: 8_000,
        appointmentDate: '2026-10-25',
      }],
      avansRows: [openAvans],
    });
    expect(box.amount).toBe(8_000);
    expect(box.count).toBe(1);
  });

  it('aynı carinin kapanmış fişi gizlenir, iptal ve açık fişi durur', () => {
    const visible = dailyReservationAvansList([closedAvans, cancelledAvans, openAvans]);
    expect(visible.map((row) => row.referenceNo)).toEqual(['AVANS-iptal', 'AVANS-acik']);
    expect(visible.every((row) => row.customerName === 'FERHAT')).toBe(true);
    expect(closedAvans.customerName).toBe(cancelledAvans.customerName);
    expect(visible.some((row) => row.referenceNo === 'AVANS-7df0cac9')).toBe(false);

    const otherCustomerClosed = avans({
      ...closedAvans,
      id: 'other-closed',
      customerName: 'ROZA',
      referenceNo: 'AVANS-roza-kapali',
      notes: 'Rezervasyon Tutarı · Randevu No cccccccc-4444-4444-8444-444444444444',
      appointmentStatus: 'closed',
    });
    const mixed = dailyReservationAvansList([
      otherCustomerClosed,
      cancelledAvans,
      openAvans,
      closedAvans,
    ]);
    expect(mixed.map((row) => row.referenceNo)).toEqual(['AVANS-iptal', 'AVANS-acik']);
    expect(mixed).toHaveLength(2);

    const screen = summarizeDailyScreenFiches([
      {
        id: 'bea-2026-00001',
        receiptNumber: serviceReceipt,
        customerName: 'FERHAT',
        revenue: 75_000,
      },
      {
        id: closedAvans.id,
        receiptNumber: 'AVANS-7df0cac9',
        customerName: 'FERHAT',
        depositAmount: 25_000,
        closed: true,
      },
      {
        id: cancelledAvans.id,
        receiptNumber: 'AVANS-iptal',
        customerName: 'FERHAT',
        depositAmount: 10_000,
        ownCancelled: true,
      },
      {
        id: openAvans.id,
        receiptNumber: 'AVANS-acik',
        customerName: 'FERHAT',
        depositAmount: 8_000,
        openDeposit: true,
      },
    ]);
    expect(screen.rows.map((row) => row.receiptNumber)).toEqual([
      serviceReceipt,
      'AVANS-iptal',
      'AVANS-acik',
    ]);
    expect(screen.rows).toHaveLength(3);
    expect(screen.revenue).toBe(75_000);
    expect(screen.reservation).toBe(18_000);
    expect(screen.returns).toBe(0);
    expect(screen.net).toBe(75_000 + 18_000);
    expect(screen.net).not.toBe(75_000 + 18_000 + 25_000);
    expect(screen.net).not.toBe(75_000 - 25_000);
  });

  it('yeni fiş eski açık ve iptal satırlarını düşürmez', () => {
    const older = [1, 2, 3, 4].map((index) => avans({
      id: `eski-${index}`,
      amount: 1_000 * index,
      status: index % 2 === 0 ? 'open' : 'kept_on_cancel',
      notes: `Rezervasyon Tutarı · Randevu No ${index}1111111-5555-4555-8555-555555555555`,
      appointmentStatus: index % 2 === 0 ? 'confirmed' : 'cancelled',
      customerName: 'FERHAT',
      referenceNo: `AVANS-eski-${index}`,
    }));
    const visible = dailyReservationAvansList([...older, closedAvans, openAvans]);
    expect(visible.length).toBeGreaterThan(4);
    expect(visible).toHaveLength(older.length + 1);
    expect(visible.map((row) => row.referenceNo).slice(0, 4)).toEqual(
      older.map((row) => row.referenceNo),
    );
    expect(visible.map((row) => row.referenceNo)).toContain('AVANS-acik');
    expect(visible.map((row) => row.referenceNo)).not.toContain('AVANS-7df0cac9');
  });
});
