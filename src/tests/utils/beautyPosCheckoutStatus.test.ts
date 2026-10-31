import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AppointmentStatus } from '../../types/beauty';
import {
  appointmentIdsClosedByServiceSale,
  appointmentStatusAfterPosPayment,
  postedServiceSaleClosesAppointment,
} from '../../utils/beautyPosCheckoutStatus';

describe('POS ödemesi randevuyu kapatır', () => {
  it('gelecek tarihli hizmet satışı tamamlanır', () => {
    expect(appointmentStatusAfterPosPayment({
      appointmentDate: '2026-11-01',
      today: '2026-10-31',
      prepaymentOnly: false,
    })).toBe(AppointmentStatus.COMPLETED);
  });

  it('bugünkü hizmet satışı tamamlanır', () => {
    expect(appointmentStatusAfterPosPayment({
      appointmentDate: '2026-10-31',
      today: '2026-10-31',
      prepaymentOnly: false,
    })).toBe(AppointmentStatus.COMPLETED);
  });

  it('gelecek tarihli yalnız peşinat planlı kalır', () => {
    expect(appointmentStatusAfterPosPayment({
      appointmentDate: '2026-11-01',
      today: '2026-10-31',
      prepaymentOnly: true,
    })).toBe(AppointmentStatus.SCHEDULED);
  });

  it('bugünkü yalnız peşinat ön ödeme olur', () => {
    expect(appointmentStatusAfterPosPayment({
      appointmentDate: '2026-10-31',
      today: '2026-10-31',
      prepaymentOnly: true,
    })).toBe(AppointmentStatus.PRE_PAID);
  });

  it('yazılı hizmet fişi açık randevuyu kapatır, peşinat fişi kapatmaz', () => {
    expect(postedServiceSaleClosesAppointment({
      appointmentId: 'roza',
      isDeposit: false,
      paidAmount: 20_000,
      paymentStatus: 'paid',
    })).toBe(true);
    expect(postedServiceSaleClosesAppointment({
      appointmentId: 'roza',
      isDeposit: true,
      paidAmount: 5_000,
      paymentStatus: 'paid',
    })).toBe(false);
    expect(appointmentIdsClosedByServiceSale(
      [
        { id: 'roza', status: 'scheduled' },
        { id: 'arz', status: 'completed' },
        { id: 'open-deposit', status: 'pre_paid' },
      ],
      [
        { appointmentId: 'roza', isDeposit: false, paidAmount: 20_000, paymentStatus: 'paid' },
        { appointmentId: 'roza', isDeposit: true, paidAmount: 5_000, paymentStatus: 'paid' },
        { appointmentId: 'arz', isDeposit: false, paidAmount: 50_000, paymentStatus: 'paid' },
        { appointmentId: 'open-deposit', isDeposit: true, paidAmount: 5_000, notes: 'deposit:1' },
      ],
    )).toEqual(['roza']);
  });

  it('ödeme kapanışı gelecek tarihi planlıya zorlamaz', () => {
    const src = readFileSync('src/components/beauty/components/AppointmentPOS.tsx', 'utf8');
    expect(src).toContain('appointmentStatusAfterPosPayment');
    expect(src).toContain('appointmentIdsWithPostedServiceSale');
    expect(src).toContain('serviceSaleAlreadyPosted && existingAppointment?.id');
    expect(src).not.toContain('isFutureAppointment\n                ? AppointmentStatus.SCHEDULED');
    const store = readFileSync('src/components/beauty/store/useBeautyStore.ts', 'utf8');
    expect(store).toContain('closeAppointmentsWithPostedServiceSale');
    expect(store).toContain('appointmentIdsWithPostedServiceSale');
  });
});
