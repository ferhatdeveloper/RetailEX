import { describe, expect, it } from 'vitest';
import {
  POS_CARI_REMAINING_THRESHOLD,
  appendVeresiyeForRemaining,
  buildVeresiyeForRemaining,
  hasPosCariRemainder,
} from '../../utils/posCariRemainder';

describe('POS kalanı cariye — eşik / buildVeresiye', () => {
  it('eşik altı kalan cariye yazılmaz', () => {
    expect(hasPosCariRemainder(0)).toBe(false);
    expect(hasPosCariRemainder(POS_CARI_REMAINING_THRESHOLD)).toBe(false);
    expect(hasPosCariRemainder(0.01)).toBe(true);
  });

  it('kalan tutarı veresiye satırına yazar', () => {
    const row = buildVeresiyeForRemaining(60, 'USD');
    expect(row.method).toBe('veresiye');
    expect(row.amount).toBe(60);
    expect(row.currency).toBe('USD');
  });

  it('onay: 40 nakit + kalan 60 → veresiye eklenir', () => {
    const result = appendVeresiyeForRemaining(
      [{ method: 'cash', amount: 40 }],
      60,
      { hasCustomer: true, currency: 'USD' },
    );
    expect(result.appended).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.payments).toEqual([
      { method: 'cash', amount: 40 },
      { method: 'veresiye', amount: 60, currency: 'USD' },
    ]);
  });

  it('müşteri yokken kalan veresiye satırı eklenmez', () => {
    const result = appendVeresiyeForRemaining(
      [{ method: 'cash', amount: 40 }],
      60,
      { hasCustomer: false, currency: 'USD' },
    );
    expect(result.appended).toBe(false);
    expect(result.remaining).toBe(60);
    expect(result.payments).toEqual([{ method: 'cash', amount: 40 }]);
  });

  it('yuvarlama eşiğinin altındaki küsürat eklenmez', () => {
    const result = appendVeresiyeForRemaining(
      [{ method: 'cash', amount: 100 }],
      0.005,
      { hasCustomer: true, currency: 'USD' },
    );
    expect(result.appended).toBe(false);
    expect(result.payments).toHaveLength(1);
  });
});
