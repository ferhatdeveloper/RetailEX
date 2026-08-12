import { describe, it, expect } from 'vitest';
import {
  buildTableBreakdown,
  collectPriceSnapshotsFromQueueItems,
  extractProductPriceSnapshot,
  formatDeviceSyncLogSummary,
  PRODUCT_PRICE_FIELDS,
} from '../../services/hybridDeviceSyncLogService';

describe('hybridDeviceSyncLogService', () => {
  it('extractProductPriceSnapshot collects price fields', () => {
    const snap = extractProductPriceSnapshot('rex_002_products', 'id-1', {
      code: 'P001',
      name: 'Test',
      price: 100,
      price_list_1: 95,
      cost: 80,
    });
    expect(snap?.prices.price).toBe(100);
    expect(snap?.prices.price_list_1).toBe(95);
    expect(PRODUCT_PRICE_FIELDS).toContain('price');
  });

  it('buildTableBreakdown aggregates by table', () => {
    const rows = buildTableBreakdown([
      { table_name: 'rex_002_products' },
      { table_name: 'rex_002_products' },
      { table_name: 'rex_002_customers' },
    ]);
    expect(rows.find((r) => r.tableName.includes('products'))?.count).toBe(2);
  });

  it('collectPriceSnapshotsFromQueueItems limits product price rows', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      table_name: 'rex_002_products',
      record_id: `id-${i}`,
      data: { code: `C${i}`, price: i },
    }));
    expect(collectPriceSnapshotsFromQueueItems(items, 10)).toHaveLength(10);
  });

  it('formatDeviceSyncLogSummary', () => {
    const text = formatDeviceSyncLogSummary({
      id: '1',
      deviceId: 'dev',
      firmNr: '002',
      direction: 'local_to_remote',
      syncMode: 'incremental',
      status: 'ok',
      recordCount: 100,
      priceChangeCount: 12,
      watermarkFrom: null,
      watermarkTo: null,
      tableBreakdown: [{ tableName: 'rex_002_products', count: 80 }],
      message: null,
      createdAt: Date.now(),
    });
    expect(text).toContain('Gönder');
    expect(text).toContain('fiyat 12');
  });
});
