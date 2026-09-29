import { describe, expect, it } from 'vitest';
import {
  PESINATLI_INSTALLMENT_OPTIONS,
  appendPesinatliVeresiyeForRemaining,
  buildPesinatliPayment,
  buildPesinatliVeresiye,
  calculatePesinatliInstallmentAmount,
  isValidPesinatliInstallments,
} from '../../utils/posPesinatli';

describe('posPesinatli - installment calculation', () => {
  it('9000 / 3 ay = 3000 IQD', () => {
    expect(calculatePesinatliInstallmentAmount(9000, 3, 'IQD')).toBe(3000);
  });

  it('9000 / 6 ay = 1500 IQD', () => {
    expect(calculatePesinatliInstallmentAmount(9000, 6, 'IQD')).toBe(1500);
  });

  it('9000 / 12 ay = 750 IQD', () => {
    expect(calculatePesinatliInstallmentAmount(9000, 12, 'IQD')).toBe(750);
  });

  it('10.000 / 3 → IQD 250 kademesine yuvarlar (POS standart)', () => {
    // IQD POS para yuvarlaması 250 kademesidir (en yakın).
    // 10.000 / 3 = 3333.33 → Math.round(13.33) * 250 = 3250 IQD
    const result = calculatePesinatliInstallmentAmount(10_000, 3, 'IQD');
    expect(result).toBe(3250);
  });

  it('USD para biriminde ondalık korunur', () => {
    // USD 2 ondalık basamağa yuvarlanır (IQD kademesi uygulanmaz)
    const result = calculatePesinatliInstallmentAmount(10_000, 3, 'USD');
    expect(result).toBeCloseTo(3333.33, 2);
  });

  it('Sıfır tutar için 0 döner', () => {
    expect(calculatePesinatliInstallmentAmount(0, 3)).toBe(0);
  });

  it('Geçersiz taksit sayısı (0/negatif) için 0 döner', () => {
    expect(calculatePesinatliInstallmentAmount(9000, 0)).toBe(0);
    expect(calculatePesinatliInstallmentAmount(9000, -3)).toBe(0);
  });
});

describe('posPesinatli - isValidPesinatliInstallments', () => {
  it('3, 6, 9, 12 geçerli', () => {
    expect(isValidPesinatliInstallments(3)).toBe(true);
    expect(isValidPesinatliInstallments(6)).toBe(true);
    expect(isValidPesinatliInstallments(9)).toBe(true);
    expect(isValidPesinatliInstallments(12)).toBe(true);
  });

  it('1, 4, 5, 24 geçersiz', () => {
    expect(isValidPesinatliInstallments(1)).toBe(false);
    expect(isValidPesinatliInstallments(4)).toBe(false);
    expect(isValidPesinatliInstallments(5)).toBe(false);
    expect(isValidPesinatliInstallments(24)).toBe(false);
  });

  it('null / undefined / string (sayı dışı) → false', () => {
    expect(isValidPesinatliInstallments(null)).toBe(false);
    expect(isValidPesinatliInstallments(undefined)).toBe(false);
    expect(isValidPesinatliInstallments('abc')).toBe(false);
    expect(isValidPesinatliInstallments({})).toBe(false);
  });
});

describe('posPesinatli - buildPesinatliPayment (ilk taksit satırı)', () => {
  it('method="pesinatli", installments=6, amount=1500', () => {
    const row = buildPesinatliPayment({
      amount: 1500,
      installments: 6,
      currency: 'IQD',
      cashRegister: { id: 'k1', kasa_adi: 'Ana Kasa', kasa_kodu: 'K01' },
    });
    expect(row.method).toBe('pesinatli');
    expect(row.amount).toBe(1500);
    expect(row.installments).toBe(6);
    expect(row.cash_register_id).toBe('k1');
    expect(row.cash_register_name).toBe('Ana Kasa');
  });

  it('cashRegister null olabilir', () => {
    const row = buildPesinatliPayment({
      amount: 1500,
      installments: 6,
      currency: 'IQD',
      cashRegister: null,
    });
    expect(row.cash_register_id).toBeNull();
    expect(row.cash_register_name).toBeNull();
  });

  it('Geçersiz tutar → 0 (negatif koruması)', () => {
    const row = buildPesinatliPayment({
      amount: -100,
      installments: 3,
      currency: 'IQD',
      cashRegister: null,
    });
    expect(row.amount).toBe(0);
  });
});

describe('posPesinatli - buildPesinatliVeresiye (kalan tutar veresiye)', () => {
  it('method="veresiye" + installments=6 + installment_amount hesaplanır', () => {
    const row = buildPesinatliVeresiye({ amount: 9000, installments: 6, currency: 'IQD' });
    expect(row.method).toBe('veresiye');
    expect(row.amount).toBe(9000);
    expect(row.installments).toBe(6);
    expect(row.installment_amount).toBe(1500);
  });

  it('installment_amount = 0 tutarda 0 olur', () => {
    const row = buildPesinatliVeresiye({ amount: 0, installments: 6, currency: 'IQD' });
    expect(row.amount).toBe(0);
    expect(row.installment_amount).toBe(0);
  });
});

describe('posPesinatli - appendPesinatliVeresiyeForRemaining', () => {
  it('müşteri varsa ve kalan > 0: veresiye satırı + installments metadata eklenir', () => {
    const payments: Array<{ method: string; amount: number }> = [];
    const out = appendPesinatliVeresiyeForRemaining(payments, 9000, {
      hasCustomer: true,
      currency: 'IQD',
      installments: 6,
    });
    expect(out.appended).toBe(true);
    expect(out.remaining).toBe(0);
    expect(out.payments).toHaveLength(1);
    const row = out.payments[0] as any;
    expect(row.method).toBe('veresiye');
    expect(row.amount).toBe(9000);
    expect(row.installments).toBe(6);
    expect(row.installment_amount).toBe(1500);
  });

  it('müşteri yoksa: kalan korunur, satır eklenmez', () => {
    const payments: Array<{ method: string; amount: number }> = [];
    const out = appendPesinatliVeresiyeForRemaining(payments, 9000, {
      hasCustomer: false,
      currency: 'IQD',
      installments: 6,
    });
    expect(out.appended).toBe(false);
    expect(out.remaining).toBe(9000);
    expect(out.payments).toHaveLength(0);
  });

  it('kalan 0 / negatif: appended=false', () => {
    const payments: Array<{ method: string; amount: number }> = [];
    const out = appendPesinatliVeresiyeForRemaining(payments, 0, {
      hasCustomer: true,
      currency: 'IQD',
      installments: 6,
    });
    expect(out.appended).toBe(false);
    expect(out.payments).toHaveLength(0);
  });

  it('mevcut payment listesinin sonuna ekler (ilk cash + sonra pesinatli veresiye)', () => {
    const payments: Array<{ method: string; amount: number }> = [
      { method: 'cash', amount: 1000 },
    ];
    const out = appendPesinatliVeresiyeForRemaining(payments, 9000, {
      hasCustomer: true,
      currency: 'IQD',
      installments: 3,
    });
    expect(out.payments).toHaveLength(2);
    expect(out.payments[0]?.method).toBe('cash');
    expect(out.payments[1]?.method).toBe('veresiye');
    expect((out.payments[1] as any).installments).toBe(3);
    expect((out.payments[1] as any).installment_amount).toBe(3000);
  });
});

describe('posPesinatli - PESINATLI_INSTALLMENT_OPTIONS', () => {
  it('3, 6, 9, 12 sırasıyla', () => {
    expect(PESINATLI_INSTALLMENT_OPTIONS).toEqual([3, 6, 9, 12]);
  });
});
