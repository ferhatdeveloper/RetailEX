import { describe, expect, it } from 'vitest';
import {
  beautySalePocketCollected,
  beautySaleRemainingCari,
  extraCustomerCollectionsNotOnSales,
  resolvePosCheckoutSettlement,
  saleCollectedSplit,
  splitPaymentRows,
} from '../../utils/saleCollectedAmounts';

describe('saleCollectedSplit — belge vs tahsilat', () => {
  it('saf veresiye 100: nakit 0, kalan 100', () => {
    const s = saleCollectedSplit({ total: 100, paymentMethod: 'veresiye' });
    expect(s.document).toBe(100);
    expect(s.cash).toBe(0);
    expect(s.collected).toBe(0);
    expect(s.remaining).toBe(100);
  });

  it('açık cari hesap belge tutarını kasaya yazmaz', () => {
    const s = saleCollectedSplit({ total: 100, paymentMethod: 'Açık Cari Hesap' });
    expect(s.cash).toBe(0);
    expect(s.remaining).toBe(100);
  });

  it('peşin nakit 100: cebe 100, kalan 0', () => {
    const s = saleCollectedSplit({ total: 100, paymentMethod: 'cash' });
    expect(s.cash).toBe(100);
    expect(s.collected).toBe(100);
    expect(s.remaining).toBe(0);
  });

  it('karma 40 nakit + 60 veresiye: cebe 40, kalan 60', () => {
    const s = splitPaymentRows(100, [
      { method: 'cash', amount: 40 },
      { method: 'veresiye', amount: 60 },
    ]);
    expect(s.cash).toBe(40);
    expect(s.credit).toBe(60);
    expect(s.collected).toBe(40);
    expect(s.remaining).toBe(60);
  });

  it('bucket credit belge tutarını kasaya yazmaz', () => {
    const s = saleCollectedSplit({ total: 100, paymentMethod: 'credit' });
    expect(s.cash).toBe(0);
    expect(s.collected).toBe(0);
    expect(s.remaining).toBe(100);
  });

  it('veresiye + payments nakit 40: cebe 40, kalan 60', () => {
    const s = splitPaymentRows(100, [{ method: 'cash', amount: 40 }], 'veresiye');
    expect(s.cash).toBe(40);
    expect(s.collected).toBe(40);
    expect(s.remaining).toBe(60);
  });

  it('veresiye etiket + payments tam nakit: hayalet kasa yok', () => {
    const s = saleCollectedSplit({
      total: 100,
      paymentMethod: 'veresiye',
      payments: [{ method: 'cash', amount: 100 }],
    });
    expect(s.cash).toBe(0);
    expect(s.collected).toBe(0);
    expect(s.remaining).toBe(100);
  });

  it('boş ödeme yöntemi nakit sayılmaz (ödenmemiş cari)', () => {
    const s = saleCollectedSplit({ total: 80, paymentMethod: '' });
    expect(s.cash).toBe(0);
    expect(s.remaining).toBe(80);
  });
});

describe('extraCustomerCollectionsNotOnSales — çift sayım yok', () => {
  it('sonradan CH_TAHSILAT 40 fişsiz satışa eklenir', () => {
    const extra = extraCustomerCollectionsNotOnSales(
      [{ islem_tipi: 'CH_TAHSILAT', tutar: 40, islem_no: 'THS-1' }],
      [{ total: 100, paymentMethod: 'veresiye', receiptNumber: 'SAT-1' }],
    );
    expect(extra).toBe(40);
  });

  it('peşin nakit satışın KASA_GIRIS fişine hayalet tahsilat eklemez', () => {
    const extra = extraCustomerCollectionsNotOnSales(
      [{ islem_tipi: 'CH_TAHSILAT', tutar: 100, islem_no: 'SAT-CASH' }],
      [{
        total: 100,
        paymentMethod: 'cash',
        receiptNumber: 'SAT-CASH',
        payments: [{ method: 'cash', amount: 100 }],
      }],
    );
    expect(extra).toBe(0);
  });

  it('güzellik paid_amount 40 / remaining 60: cebe 40', () => {
    expect(beautySalePocketCollected({
      total: 100,
      payment_method: 'veresiye',
      paid_amount: 40,
      remaining_amount: 60,
    })).toBe(40);
    expect(beautySaleRemainingCari({
      total: 100,
      payment_method: 'veresiye',
      paid_amount: 40,
      remaining_amount: 60,
    })).toBe(60);
  });

  it('eski karma (payments yok) veresiye fişindeki CH_TAHSILAT 40 sayılır', () => {
    const extra = extraCustomerCollectionsNotOnSales(
      [{ islem_tipi: 'CH_TAHSILAT', tutar: 40, islem_no: 'SAT-MIX' }],
      [{ total: 100, paymentMethod: 'veresiye', receiptNumber: 'SAT-MIX' }],
    );
    expect(extra).toBe(40);
  });

  it('güzellik KPI: paid 0 + rem 0 + veresiye → belge kalanı (eski bozuk kayıt)', () => {
    expect(beautySalePocketCollected({
      total: 45000,
      payment_method: 'veresiye',
      paid_amount: 0,
      remaining_amount: 0,
    })).toBe(0);
    expect(beautySaleRemainingCari({
      total: 45000,
      payment_method: 'veresiye',
      paid_amount: 0,
      remaining_amount: 0,
    })).toBe(45000);
  });
});

describe('resolvePosCheckoutSettlement — kısmi nakit + kalan cari', () => {
  it('45k belge / 25k nakit / 20k veresiye: method=veresiye, cebe 25k, kalan 20k', () => {
    const s = resolvePosCheckoutSettlement(45000, [
      { method: 'cash', amount: 25000, currency: 'IQD' },
      { method: 'veresiye', amount: 20000, currency: 'IQD' },
    ]);
    expect(s.paymentMethod).toBe('veresiye');
    expect(s.collected).toBe(25000);
    expect(s.cash).toBe(25000);
    expect(s.remaining).toBe(20000);
    expect(s.credit).toBe(20000);
  });

  it('çoğunluk peşin olsa bile kalan cari varsa belge veresiye kalır', () => {
    const s = resolvePosCheckoutSettlement(100, [
      { method: 'cash', amount: 70 },
      { method: 'veresiye', amount: 30 },
    ]);
    expect(s.paymentMethod).toBe('veresiye');
    expect(s.collected).toBe(70);
    expect(s.remaining).toBe(30);
  });

  it('yalnızca nakit: payment_method=cash, kalan 0', () => {
    const s = resolvePosCheckoutSettlement(45000, [
      { method: 'cash', amount: 45000, currency: 'IQD' },
    ]);
    expect(s.paymentMethod).toBe('cash');
    expect(s.collected).toBe(45000);
    expect(s.remaining).toBe(0);
  });

  it('veresiye etiket + kısmi nakit payments (kredi satırı yok): cebe korunur', () => {
    const s = splitPaymentRows(45000, [{ method: 'cash', amount: 25000 }], 'veresiye');
    expect(s.collected).toBe(25000);
    expect(s.remaining).toBe(20000);
  });

  it('güzellik KPI: settlement skalerleri 25k/20k', () => {
    expect(beautySalePocketCollected({
      total: 45000,
      payment_method: 'veresiye',
      paid_amount: 25000,
      remaining_amount: 20000,
    })).toBe(25000);
    expect(beautySaleRemainingCari({
      total: 45000,
      payment_method: 'veresiye',
      paid_amount: 25000,
      remaining_amount: 20000,
    })).toBe(20000);
  });
});
