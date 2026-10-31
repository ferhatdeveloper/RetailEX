/**
 * Açık peşinat, paranın kaydedildiği günde bir kez durur.
 * Randevu günü ileri olsa da rezervasyon kutusu orada 0 kalır.
 * Kapanınca tahsilat günü de 0 olur; hizmet cirosu kapanış günündedir.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAppointmentReport } from '../../utils/appointmentReport';
import {
  cancelledUnclosedReservationBox,
  cancelledUnclosedReservationByPeriod,
} from '../../utils/cancelledReservationBox';
import { prePaymentListedYmd } from '../../utils/depositPrePaymentAllocation';
import { clipReservationToDayEndRange, composeDayEndZStatementForRange } from '../../utils/posZReport';
import { recordedCustomerName } from '../../utils/recordedCustomerName';
import { reportDisplayNet } from '../../utils/periodSummaryNet';
import type { Sale } from '../../core/types';

const OPEN_ID = '8a58b7b7-1111-4111-8111-111111111111';
const COLLECTED = '2026-10-31';
const VISIT = '2026-11-02';

const openDeposit = {
  id: OPEN_ID,
  status: 'pre_paid',
  depositAmount: 5_000,
  depositDate: `${COLLECTED}T18:40:00`,
  appointmentDate: VISIT,
  customerName: 'TASNIM',
};

describe('peşinat kasa günü', () => {
  it('5000 peşinat 31.10 kutusunda, 02.11 kutusu 0, Kasım ayı 0, yıl Ekim', () => {
    const octoberDay = clipReservationToDayEndRange({
      appointments: [openDeposit],
    }, COLLECTED, COLLECTED);
    const visitDay = clipReservationToDayEndRange({
      appointments: [openDeposit],
    }, VISIT, VISIT);
    const collectedBox = cancelledUnclosedReservationBox(octoberDay);
    const visitBox = cancelledUnclosedReservationBox(visitDay);
    const byDay = cancelledUnclosedReservationByPeriod({
      appointments: [openDeposit],
    }, 'monthly-days');
    const byMonth = cancelledUnclosedReservationByPeriod({
      appointments: [openDeposit],
    }, 'yearly-months');

    expect(collectedBox.amount).toBe(5_000);
    expect(collectedBox.count).toBe(1);
    expect(visitBox.amount).toBe(0);
    expect(visitBox.count).toBe(0);
    expect(byDay.get(COLLECTED)?.amount).toBe(5_000);
    expect(byDay.get(VISIT)?.amount ?? 0).toBe(0);
    expect(byMonth.get('2026-10')?.amount).toBe(5_000);
    expect(byMonth.get('2026-11')?.amount ?? 0).toBe(0);

    const collectedNet = reportDisplayNet({
      revenue: 0,
      reservationAmount: collectedBox.amount,
      returnDeduction: 0,
      discount: 0,
      expenses: 0,
      expenseEnabled: true,
    });
    const visitNet = reportDisplayNet({
      revenue: 0,
      reservationAmount: visitBox.amount,
      returnDeduction: 0,
      discount: 0,
      expenses: 0,
      expenseEnabled: true,
    });
    expect(collectedNet).toBe(5_000);
    expect(visitNet).toBe(0);
  });

  it('avans fişi ile randevu peşinatı aynı tutarı iki güne yazmaz', () => {
    const input = {
      appointments: [openDeposit],
      avansRows: [{
        amount: 5_000,
        status: 'open',
        notes: `Rezervasyon Tutarı · Randevu No ${OPEN_ID}`,
        appointmentStatus: 'pre_paid',
        createdAt: `${COLLECTED}T18:40:00`,
      }],
    };
    const box = cancelledUnclosedReservationBox(input);
    const byDay = cancelledUnclosedReservationByPeriod(input, 'monthly-days');
    expect(box.amount).toBe(5_000);
    expect(box.count).toBe(1);
    expect(byDay.get(COLLECTED)?.amount).toBe(5_000);
    expect(byDay.get(VISIT)?.amount ?? 0).toBe(0);
    expect([...byDay.values()].reduce((sum, row) => sum + row.amount, 0)).toBe(5_000);
  });

  it('kapanınca tahsilat günü rezervasyon 0, kapanış cirosu peşinatı ikinci kez almaz', () => {
    const closed = {
      ...openDeposit,
      status: 'completed',
    };
    const applied = {
      amount: 5_000,
      status: 'applied',
      notes: `Rezervasyon Tutarı · Randevu No ${OPEN_ID}`,
      appointmentStatus: 'completed',
      createdAt: `${COLLECTED}T18:40:00`,
    };
    const collected = cancelledUnclosedReservationBox(clipReservationToDayEndRange({
      appointments: [closed],
      avansRows: [applied],
    }, COLLECTED, COLLECTED));
    const visit = cancelledUnclosedReservationBox(clipReservationToDayEndRange({
      appointments: [closed],
      avansRows: [applied],
    }, VISIT, VISIT));
    expect(collected.amount).toBe(0);
    expect(visit.amount).toBe(0);

    const sale = {
      id: 'sale-close',
      receiptNumber: 'HIZ-1',
      date: `${VISIT}T20:00:00`,
      items: [],
      subtotal: 75_000,
      discount: 0,
      total: 75_000,
      paymentMethod: 'cash',
      status: 'completed',
    } as unknown as Sale;
    const statement = composeDayEndZStatementForRange({
      sales: [sale],
      dateFrom: VISIT,
      dateTo: VISIT,
      reservation: { appointments: [closed], avansRows: [applied] },
    });
    expect(statement.grossSales).toBe(75_000);
    expect(statement.reservationAmount).toBe(0);
    expect(statement.netCash).toBe(75_000);
    expect(statement.netCash).not.toBe(80_000);
  });

  it('indirim, iade ve gider birer kez düşülür', () => {
    const net = reportDisplayNet({
      revenue: 100_000,
      reservationAmount: 5_000,
      returnDeduction: 10_000,
      discount: 5_000,
      expenses: 20_000,
      expenseEnabled: true,
    });
    expect(net).toBe(70_000);
    expect(net).not.toBe(100_000 + 5_000);
    expect(net).not.toBe(70_000 - 10_000);
  });

  it('günlük rezervasyon satırında cari adı yazılır, kimlik ad olmaz', () => {
    expect(recordedCustomerName(
      'TASNIM',
      '8a58b7b7-1111-4111-8111-111111111111',
    )).toBe('TASNIM');
    expect(recordedCustomerName(
      '',
      '8a58b7b7-1111-4111-8111-111111111111',
      'ROZA',
    )).toBe('ROZA');
    expect(recordedCustomerName('8a58b7b7-1111-4111-8111-111111111111')).toBe('—');
    expect(recordedCustomerName('8a58b7b7-1111-4111-8111-111111111111')).not.toBe('Silinmiş müşteri');
  });

  it('randevu raporu ön ödemeyi tahsilat gününde sayar', () => {
    const row = {
      id: OPEN_ID,
      date: VISIT,
      time: '20:00',
      status: 'scheduled',
      staffId: 'st-1',
      staffName: 'Ayşe Demir',
      depositAmount: 5_000,
      depositDate: `${COLLECTED}T18:40:00`,
    };
    const collected = buildAppointmentReport([row], { from: COLLECTED, to: COLLECTED });
    const visit = buildAppointmentReport([row], { from: VISIT, to: VISIT });
    const prepaidCollected = collected.summary.slices.find((slice) => slice.key === 'prepaid');
    const prepaidVisit = visit.summary.slices.find((slice) => slice.key === 'prepaid');
    expect(collected.summary.total).toBe(1);
    expect(prepaidCollected?.count).toBe(1);
    expect(visit.summary.total).toBe(0);
    expect(prepaidVisit?.count ?? 0).toBe(0);
  });

  it('erken gelen rezervasyon tutarı tahsilat günündedir, kapanan hizmet randevu gününde kalır', () => {
    expect(prePaymentListedYmd({
      appointment_date: '2026-10-31',
      deposit_date: '2026-10-31T09:00:00',
      payment_state: 'paid',
      status: 'completed',
      deposit_amount: 25_000,
    })).toBe('2026-10-31');
    expect(prePaymentListedYmd({
      appointment_date: VISIT,
      deposit_date: `${COLLECTED}T10:00:00`,
      payment_state: 'paid',
      status: 'pre_paid',
      deposit_amount: 5_000,
    })).toBe(COLLECTED);
    expect(prePaymentListedYmd({
      appointment_date: VISIT,
      deposit_date: `${COLLECTED}T10:00:00`,
      payment_state: 'paid',
      status: 'pre_paid',
      deposit_amount: 5_000,
    })).not.toBe(VISIT);

    const service = readFileSync(resolve('src/services/beautyService.ts'), 'utf8');
    const listed = service.slice(
      service.indexOf('const listedDate'),
      service.indexOf('const where: string[]'),
    );
    expect(listed).toContain("IN ('completed', 'closed') THEN pas.appointment_date");
    expect(listed).toContain("pas.payment_state = 'paid' AND COALESCE(pas.deposit_amount, 0) <> 0");
    expect(listed).toContain('COALESCE(a.deposit_date::date, a.created_at::date, pas.appointment_date)');
  });

  it('sadece peşinat satırının tarihi kasa günüdür, kapanan hizmet randevu gününde kalır', () => {
    expect(prePaymentListedYmd({
      appointment_date: VISIT,
      deposit_date: `${COLLECTED}T18:40:00`,
      payment_state: 'deposit_only',
      status: 'scheduled',
    })).toBe(COLLECTED);
    expect(prePaymentListedYmd({
      appointment_date: COLLECTED,
      deposit_date: '2026-10-01T09:00:00',
      payment_state: 'paid',
      status: 'completed',
    })).toBe(COLLECTED);
  });
});
