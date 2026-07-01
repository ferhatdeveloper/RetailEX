import { describe, it, expect } from 'vitest';
import {
  comparePriceFields,
  extractPriceFields,
  formatPriceDiffShort,
  deviceLabel,
  type RegisteredDeviceRow,
} from '../../services/priceChangeSyncService';

describe('priceChangeSyncService', () => {
  it('comparePriceFields detects old vs new price', () => {
    const diffs = comparePriceFields({ price: 100, cost: 50 }, { price: 120, cost: 50 });
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({ field: 'price', old: 100, new: 120 });
  });

  it('comparePriceFields returns empty when unchanged', () => {
    expect(comparePriceFields({ price: 100 }, { price: 100 })).toHaveLength(0);
  });

  it('extractPriceFields ignores non-price columns', () => {
    const fields = extractPriceFields({ code: 'X', price: 10, name: 'Test' });
    expect(fields).toEqual({ price: 10 });
    expect(fields).not.toHaveProperty('code');
  });

  it('formatPriceDiffShort renders arrow notation', () => {
    const text = formatPriceDiffShort([
      { field: 'price', old: 100, new: 120 },
      { field: 'price_list_1', old: 95, new: 110 },
    ]);
    expect(text).toContain('price: 100 → 120');
    expect(text).toContain('price_list_1: 95 → 110');
  });

  it('deviceLabel prefers terminal name', () => {
    const devices: RegisteredDeviceRow[] = [
      { deviceId: 'abc-123', terminalName: 'Kasa-1', storeId: null, storeName: null },
    ];
    expect(deviceLabel('abc-123', devices)).toBe('Kasa-1');
    expect(deviceLabel('unknown', devices)).toBe('unknown'.slice(0, 8));
  });
});
