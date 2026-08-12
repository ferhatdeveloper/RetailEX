import { describe, it, expect } from 'vitest';
import {
  countProductsWithPrice,
  formatAckRelativeTime,
  formatTableBreakdownShort,
  summarizePriceChanges,
} from '../../services/deviceSyncAckService';
import type { PriceChangeSnapshot } from '../../services/hybridDeviceSyncLogService';

describe('deviceSyncAckService', () => {
  it('formatAckRelativeTime handles recent timestamps', () => {
    const recent = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatAckRelativeTime(recent)).toMatch(/dk önce/);
    expect(formatAckRelativeTime(null)).toBe('—');
  });

  it('formatTableBreakdownShort shortens table names', () => {
    const text = formatTableBreakdownShort([
      { tableName: 'rex_002_products', count: 80 },
      { tableName: 'rex_002_customers', count: 12 },
    ]);
    expect(text).toContain('products(80)');
    expect(text).toContain('customers(12)');
  });

  it('countProductsWithPrice counts diff or priced rows', () => {
    const rows: PriceChangeSnapshot[] = [
      { tableName: 't', recordId: '1', prices: {}, priceDiff: [{ field: 'price', old: 1, new: 2 }] },
      { tableName: 't', recordId: '2', prices: { price: 10 } },
      { tableName: 't', recordId: '3', prices: {} },
    ];
    expect(countProductsWithPrice(rows)).toBe(2);
  });

  it('summarizePriceChanges includes diff text', () => {
    const text = summarizePriceChanges([
      {
        tableName: 'rex_002_products',
        recordId: 'x',
        code: 'P001',
        prices: { price: 120 },
        priceDiff: [{ field: 'price', old: 100, new: 120 }],
      },
    ]);
    expect(text).toContain('P001');
    expect(text).toContain('100');
    expect(text).toContain('120');
  });
});
