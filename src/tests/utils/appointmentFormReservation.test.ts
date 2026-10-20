import { describe, expect, it } from 'vitest';
import {
  appointmentFormTotal,
  appointmentRemainingAfterDeposit,
  appointmentReservationField,
  appointmentServiceGross,
  depositAmountsForNewAppointments,
  planNewAppointmentDeposit,
  resolveVisitReservationAmount,
} from '../../utils/appointmentFormReservation';

describe('randevu formu rezervasyon', () => {
  const hairCut = { type: 'service', name: 'HAIR CUT', unitPrice: 50_000, qty: 1 };
  const sacBoya = { type: 'service', name: 'SAC BOYA', unitPrice: 30_000, qty: 1 };
  const depositLine = {
    type: 'deposit',
    name: 'DEPOSIT',
    code: 'DEPOSIT',
    itemId: 'DEPOSIT',
    unitPrice: 13_000,
    qty: 1,
  };

  it('rezervasyon 20.000 ve iki hizmet 80.000 iken toplam 80.000 kalır', () => {
    const gross = appointmentServiceGross([hairCut, sacBoya, depositLine]);
    expect(gross).toBe(80_000);
    expect(appointmentFormTotal(gross, 0)).toBe(80_000);
    expect(appointmentFormTotal(gross, 0)).not.toBe(93_000);

    const reservation = appointmentReservationField({
      existing: false,
      enteredAmount: 20_000,
      storedDeposits: [13_000],
      sourceAmount: 13_000,
    });
    expect(reservation).toBe(20_000);
  });

  it('depozito satırı ara toplama eklenmez ve rezervasyonun yerine geçmez', () => {
    const gross = appointmentServiceGross([
      { type: 'service', name: 'HAIR CUT', unitPrice: 42_000, qty: 1 },
      { type: 'service', name: 'SAC BOYA', unitPrice: 38_000, qty: 1 },
      depositLine,
    ]);
    expect(gross).toBe(80_000);
    expect(appointmentReservationField({
      existing: false,
      enteredAmount: 20_000,
    })).toBe(20_000);
  });

  it('kayıtlı pay 13.000 ise ve kaynak 20.000 ise 20.000 gösterilir', () => {
    expect(resolveVisitReservationAmount({
      storedDeposits: [13_000],
      sourceAmount: 20_000,
    })).toBe(20_000);
    expect(resolveVisitReservationAmount({
      storedDeposits: [13_000, 7_000],
      sourceAmount: null,
    })).toBe(20_000);
  });

  it('kaynak da 13.000 ise tutar uydurulmaz', () => {
    expect(resolveVisitReservationAmount({
      storedDeposits: [13_000],
      sourceAmount: 13_000,
    })).toBe(13_000);
  });

  it('aynı tutar kardeş randevuya kopyalandıysa bir kez sayılır', () => {
    expect(resolveVisitReservationAmount({
      storedDeposits: [20_000, 20_000],
    })).toBe(20_000);
  });

  it('hizmet kapanınca kalan 60.000 olur ve depozito ikinci kez düşülmez', () => {
    expect(appointmentRemainingAfterDeposit({
      serviceGross: 80_000,
      reservation: 20_000,
      completed: false,
    })).toBeNull();
    expect(appointmentRemainingAfterDeposit({
      serviceGross: 80_000,
      reservation: 20_000,
      completed: true,
    })).toBe(60_000);
  });

  it('yeni kayıt kullanıcı tutarını ilk randevuda tutar', () => {
    expect(depositAmountsForNewAppointments(20_000, 2)).toEqual([20_000, 0]);
  });

  it('50.000 + 60.000 hizmet ve 20.000 rezervasyon: toplam 110.000, depozito tam 20.000', () => {
    const hairPink = { type: 'service', name: 'HAIR PINK COLOR', unitPrice: 60_000, qty: 1 };
    const strayDeposit = {
      type: 'deposit',
      name: 'DEPOSIT',
      code: 'DEPOSIT',
      itemId: 'DEPOSIT',
      unitPrice: 13_000,
      qty: 1,
    };
    const plan = planNewAppointmentDeposit({
      lines: [hairCut, hairPink, strayDeposit],
      discountPercent: 0,
      reservationAmount: 20_000,
      cutReceipt: false,
    });

    expect(plan.serviceUnitPrices).toEqual([50_000, 60_000]);
    expect(plan.serviceGross).toBe(110_000);
    expect(plan.formTotal).toBe(110_000);
    expect(plan.formTotal).not.toBe(130_000);
    expect(plan.depositAmount).toBe(20_000);
    expect(plan.depositByAppointment).toEqual([20_000, 0]);
    expect(plan.depositByAppointment).not.toContain(13_000);
    expect(plan.includeDepositCartLine).toBe(false);
    expect(plan.recordCustomerAdvance).toBe(true);
    expect(plan.cashIn).toBe(20_000);
    expect(plan.cutReservationReceipt).toBe(false);
    expect(plan.customerServiceDebt).toBe(0);
    expect(appointmentRemainingAfterDeposit({
      serviceGross: plan.serviceGross,
      reservation: plan.depositAmount,
      completed: false,
    })).toBeNull();
    expect(appointmentRemainingAfterDeposit({
      serviceGross: plan.serviceGross,
      reservation: plan.depositAmount,
      completed: true,
    })).toBe(90_000);
  });

  it('kutu işaretliyse fiş kesilir, tutar 0 ise kesilmez', () => {
    const lines = [
      { type: 'service', name: 'HAIR CUT', unitPrice: 50_000, qty: 1 },
      { type: 'service', name: 'HAIR PINK COLOR', unitPrice: 60_000, qty: 1 },
    ];
    expect(planNewAppointmentDeposit({
      lines,
      reservationAmount: 20_000,
      cutReceipt: true,
    }).cutReservationReceipt).toBe(true);
    const empty = planNewAppointmentDeposit({
      lines,
      reservationAmount: 0,
      cutReceipt: true,
    });
    expect(empty.cutReservationReceipt).toBe(false);
    expect(empty.recordCustomerAdvance).toBe(false);
    expect(empty.cashIn).toBe(0);
    expect(empty.depositAmount).toBe(0);
    expect(empty.formTotal).toBe(110_000);
  });
});
