import { describe, expect, it } from 'vitest';
import {
  normalizePaymentMethodBucket,
  paymentMethodBucketTranslationKey,
  paymentMethodImpliesCashRegisterOnInvoice,
  paymentMethodImpliesCustomerDebt,
  paymentMethodImpliesPaidNow,
  paymentMethodImpliesSupplierDebt,
} from '../../utils/paymentMethodUtils';

describe('paymentMethodUtils — pesinatli semantik', () => {
  it('paymentMethodImpliesPaidNow("pesinatli") === true (ilk taksit peşin)', () => {
    expect(paymentMethodImpliesPaidNow('pesinatli')).toBe(true);
    expect(paymentMethodImpliesPaidNow('Peşinatlı')).toBe(true);
  });

  it('paymentMethodImpliesCustomerDebt("pesinatli") === false (cari borç yaratmaz)', () => {
    expect(paymentMethodImpliesCustomerDebt('pesinatli')).toBe(false);
    expect(paymentMethodImpliesCustomerDebt('Peşinatlı')).toBe(false);
  });

  it('paymentMethodImpliesCashRegisterOnInvoice("pesinatli") === true (kasaya yansır)', () => {
    expect(paymentMethodImpliesCashRegisterOnInvoice('pesinatli')).toBe(true);
  });

  it('paymentMethodImpliesSupplierDebt("pesinatli") === false (alışta da peşin)', () => {
    expect(paymentMethodImpliesSupplierDebt('pesinatli')).toBe(false);
  });

  it('normalizePaymentMethodBucket("pesinatli") === "pesinatli"', () => {
    expect(normalizePaymentMethodBucket('pesinatli')).toBe('pesinatli');
    expect(normalizePaymentMethodBucket('Peşinatlı')).toBe('pesinatli');
  });

  it('paymentMethodBucketTranslationKey("pesinatli") === "paymentMethodPesinatli"', () => {
    expect(paymentMethodBucketTranslationKey('pesinatli')).toBe('paymentMethodPesinatli');
  });

  it('mevcut provider\'lar geriye dönük uyumlu', () => {
    expect(paymentMethodImpliesPaidNow('cash')).toBe(true);
    expect(paymentMethodImpliesPaidNow('card')).toBe(true);
    expect(paymentMethodImpliesPaidNow('veresiye')).toBe(false);

    expect(paymentMethodImpliesCustomerDebt('veresiye')).toBe(true);
    expect(paymentMethodImpliesCustomerDebt('cash')).toBe(false);
    expect(paymentMethodImpliesCustomerDebt('card')).toBe(false);

    expect(normalizePaymentMethodBucket('cash')).toBe('cash');
    expect(normalizePaymentMethodBucket('card')).toBe('card');
    expect(normalizePaymentMethodBucket('veresiye')).toBe('credit');
  });
});
