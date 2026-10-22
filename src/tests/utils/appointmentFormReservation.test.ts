import { describe, expect, it } from 'vitest';
import {
  appointmentFormTotal,
  appointmentRemainingAfterDeposit,
  appointmentReservationField,
  appointmentServiceGross,
  depositAmountsForNewAppointments,
  parseReservationAmountInput,
  planNewAppointmentDeposit,
  readAppointmentDepositFicheNo,
  resolveVisitReservationAmount,
  syncAutomaticDepositCart,
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

  it('peşinat varken kalan hizmet kapanmadan da görünür ve depozito ikinci kez düşülmez', () => {
    expect(appointmentRemainingAfterDeposit({
      serviceGross: 80_000,
      reservation: 20_000,
      completed: false,
    })).toBe(60_000);
    expect(appointmentRemainingAfterDeposit({
      serviceGross: 80_000,
      reservation: 20_000,
      completed: true,
    })).toBe(60_000);
    expect(appointmentRemainingAfterDeposit({
      serviceGross: 80_000,
      reservation: 0,
      completed: false,
    })).toBeNull();
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
    expect(plan.includeDepositCartLine).toBe(true);
    expect(plan.recordCustomerAdvance).toBe(true);
    expect(plan.cashIn).toBe(20_000);
    expect(plan.cutReservationReceipt).toBe(false);
    expect(plan.customerServiceDebt).toBe(0);
    expect(appointmentRemainingAfterDeposit({
      serviceGross: plan.serviceGross,
      reservation: plan.depositAmount,
      completed: false,
    })).toBe(90_000);
    expect(appointmentRemainingAfterDeposit({
      serviceGross: plan.serviceGross,
      reservation: plan.depositAmount,
      completed: true,
    })).toBe(90_000);
    expect(appointmentRemainingAfterDeposit({
      serviceGross: 110_000,
      reservation: 0,
      completed: false,
    })).toBeNull();
    expect(appointmentRemainingAfterDeposit({
      serviceGross: 110_000,
      reservation: 0,
      completed: true,
    })).toBe(110_000);
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
    expect(empty.includeDepositCartLine).toBe(false);
    expect(empty.formTotal).toBe(110_000);
  });

  it('rezervasyon 20.000 yazılınca sepette tek DEPOSIT satırı 20.000 olur', () => {
    const hairPink = { type: 'service', name: 'HAIR PINK COLOR', unitPrice: 60_000, qty: 1 };
    const makeDeposit = (amount: number) => ({
      type: 'deposit' as const,
      name: 'DEPOSIT',
      code: 'DEPOSIT',
      itemId: 'DEPOSIT',
      unitPrice: amount,
      qty: 1,
    });
    const withLine = syncAutomaticDepositCart([hairCut, hairPink], 20_000, makeDeposit);
    expect(withLine.map((line) => line.unitPrice)).toEqual([50_000, 60_000, 20_000]);
    expect(withLine[0]).toBe(hairCut);
    expect(withLine[1]).toBe(hairPink);
    expect(withLine[2]?.name).toBe('DEPOSIT');
    expect(appointmentServiceGross(withLine)).toBe(110_000);
    expect(appointmentFormTotal(appointmentServiceGross(withLine), 0)).toBe(110_000);
    expect(appointmentFormTotal(appointmentServiceGross(withLine), 0)).not.toBe(130_000);

    const updated = syncAutomaticDepositCart(withLine, 15_000, makeDeposit);
    expect(updated.filter((line) => line.name === 'DEPOSIT')).toHaveLength(1);
    expect(updated[2]?.unitPrice).toBe(15_000);
    expect(updated[0]?.unitPrice).toBe(50_000);
    expect(updated[1]?.unitPrice).toBe(60_000);

    const cleared = syncAutomaticDepositCart(updated, 0, makeDeposit);
    expect(cleared.map((line) => line.name)).toEqual(['HAIR CUT', 'HAIR PINK COLOR']);
    expect(cleared.some((line) => line.name === 'DEPOSIT')).toBe(false);

    const stray = syncAutomaticDepositCart(
      [hairCut, hairPink, { ...makeDeposit(13_000) }],
      20_000,
      makeDeposit,
    );
    expect(stray.map((line) => line.unitPrice)).toEqual([50_000, 60_000, 20_000]);
    expect(stray.filter((line) => line.name === 'DEPOSIT')).toHaveLength(1);
    expect(stray.some((line) => line.unitPrice === 13_000)).toBe(false);
    expect(stray.some((line) => line.unitPrice === 42_000 || line.unitPrice === 25_000)).toBe(false);
  });

  it('yeni randevuda fiş no okunurken fırlatmaz', () => {
    expect(() => readAppointmentDepositFicheNo(null)).not.toThrow();
    expect(() => readAppointmentDepositFicheNo(undefined)).not.toThrow();
    expect(readAppointmentDepositFicheNo(null)).toBeNull();
    expect(readAppointmentDepositFicheNo(undefined)).toBeNull();
    expect(readAppointmentDepositFicheNo({})).toBeNull();
    expect(readAppointmentDepositFicheNo({ deposit_sale_fiche_no: '   ' })).toBeNull();
    expect(readAppointmentDepositFicheNo({ deposit_sale_fiche_no: ' RX-19 ' })).toBe('RX-19');
  });

  it('rezervasyon yazılırken boş, ara değer ve binlik ayraç çökmez', () => {
    const iqd = 0;
    const tryDigits = 2;
    expect(() => parseReservationAmountInput('', iqd)).not.toThrow();
    expect(parseReservationAmountInput('', iqd)).toBe(0);
    expect(parseReservationAmountInput('.', iqd)).toBe(0);
    expect(parseReservationAmountInput(',', tryDigits)).toBe(0);
    expect(parseReservationAmountInput('1.', iqd)).toBe(1);
    expect(parseReservationAmountInput('1,', tryDigits)).toBe(1);
    expect(parseReservationAmountInput('1.', tryDigits)).toBe(1);
    expect(parseReservationAmountInput('20.000', iqd)).toBe(20_000);
    expect(parseReservationAmountInput('20,000', iqd)).toBe(20_000);
    expect(parseReservationAmountInput('1.250.000', iqd)).toBe(1_250_000);
    expect(parseReservationAmountInput('1.5', iqd)).toBe(2);
    expect(parseReservationAmountInput('20,50', tryDigits)).toBe(20.5);
    expect(parseReservationAmountInput('20.50', tryDigits)).toBe(20.5);
    expect(parseReservationAmountInput('1.250,75', tryDigits)).toBe(1250.75);
    expect(parseReservationAmountInput('abc', iqd)).toBe(0);
    expect(parseReservationAmountInput('-5', iqd)).toBe(0);
    expect(parseReservationAmountInput('20000', iqd)).toBe(20_000);
  });

  it('yazılan 20.000 peşinattır; hizmet 110.000 ve ürün 10.000 toplamı 120.000 kalır', () => {
    const amount = parseReservationAmountInput('20.000', 0);
    const plan = planNewAppointmentDeposit({
      lines: [
        { type: 'service', name: 'HIZMET', unitPrice: 110_000, qty: 1 },
        { type: 'product', name: 'URUN', unitPrice: 10_000, qty: 1 },
      ],
      reservationAmount: amount,
      cutReceipt: false,
    });
    expect(plan.serviceGross).toBe(120_000);
    expect(plan.formTotal).toBe(120_000);
    expect(plan.formTotal).not.toBe(140_000);
    expect(plan.depositAmount).toBe(20_000);
    expect(plan.cashIn).toBe(20_000);
    expect(plan.customerServiceDebt).toBe(0);
  });
});
