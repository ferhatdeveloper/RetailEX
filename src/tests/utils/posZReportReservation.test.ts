import { describe, expect, it } from 'vitest';
import { composeDayEndZTotals } from '../../utils/posZReport';

describe('composeDayEndZTotals — rezervasyon bilgi, ciroya eklenmez', () => {
  it('15.000 rezervasyon bilgi görünür, net ciro 50.000 kalır', () => {
    const totals = composeDayEndZTotals({
      netSales: 50_000,
      totalExpenses: 0,
      subtractExpenses: true,
      cashAmount: 50_000,
      reservation: {
        reservationCash: 15_000,
        openGross: 0,
        openPending: 0,
        openDeposit: 0,
        openCount: 0,
      },
    });

    expect(totals.reservationDeposit).toBe(15_000);
    expect(totals.reservationGross).toBe(15_000);
    expect(totals.reservationPending).toBe(0);
    expect(totals.reservationCount).toBe(1);
    expect(totals.netSales).toBe(50_000);
    expect(totals.netAfterExpenses).toBe(50_000);
    expect(totals.cashAmount).toBe(50_000);
  });

  it('gider düşünce rezervasyon hâlâ nete eklenmez', () => {
    const totals = composeDayEndZTotals({
      netSales: 50_000,
      totalExpenses: 5_000,
      subtractExpenses: true,
      cashAmount: 50_000,
      reservation: { reservationCash: 15_000 },
    });
    expect(totals.netAfterExpenses).toBe(45_000);
    expect(totals.reservationDeposit).toBe(15_000);
  });

  it('açık randevunun brüt ve kalanı sıfır yazılmaz, ciroya eklenmez', () => {
    const totals = composeDayEndZTotals({
      netSales: 50_000,
      totalExpenses: 0,
      cashAmount: 50_000,
      reservation: {
        reservationCash: 15_000,
        openGross: 50_000,
        openPending: 35_000,
        openDeposit: 15_000,
        openCount: 1,
      },
    });
    expect(totals.reservationDeposit).toBe(15_000);
    expect(totals.reservationGross).toBe(50_000);
    expect(totals.reservationPending).toBe(35_000);
    expect(totals.reservationCount).toBe(1);
    expect(totals.netSales).toBe(50_000);
    expect(totals.netAfterExpenses).toBe(50_000);
  });

  it('kasa rezervasyonu yoksa açık randevu peşinatı bilgi kalır', () => {
    const totals = composeDayEndZTotals({
      netSales: 0,
      cashAmount: 0,
      reservation: {
        reservationCash: 0,
        openGross: 50_000,
        openPending: 35_000,
        openDeposit: 15_000,
        openCount: 1,
      },
    });
    expect(totals.reservationDeposit).toBe(15_000);
    expect(totals.reservationGross).toBe(50_000);
    expect(totals.reservationPending).toBe(35_000);
    expect(totals.netSales).toBe(0);
    expect(totals.netAfterExpenses).toBe(0);
  });

  it('iade işareti korunur, net ciro değişmez', () => {
    const totals = composeDayEndZTotals({
      netSales: 50_000,
      totalExpenses: 0,
      cashAmount: 35_000,
      reservation: { reservationCash: -15_000 },
    });
    expect(totals.reservationDeposit).toBe(-15_000);
    expect(totals.reservationGross).toBe(-15_000);
    expect(totals.netSales).toBe(50_000);
    expect(totals.netAfterExpenses).toBe(50_000);
    expect(totals.cashAmount).toBe(35_000);
  });
});
