import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryPgRows = vi.fn();

vi.mock('../../services/hybridSyncEngine', () => ({
  queryPgRows: (...args: unknown[]) => queryPgRows(...args),
}));

vi.mock('../../services/enterpriseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/enterpriseSyncService')>();
  return {
    ...actual,
    resolveSyncPgEndpoint: vi.fn(() => ({
      host: '72.60.182.107',
      port: 5432,
      database: 'lovan',
      user: 'postgres',
      password: 'x',
    })),
  };
});

import { getMposTransferPreview } from '../../services/mposSyncPreviewService';

describe('getMposTransferPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero totals when storeId is missing', async () => {
    const r = await getMposTransferPreview({
      firmNr: '002',
      sendFileTypes: ['products'],
      receiveFileTypes: ['sales'],
      syncMode: 'incremental',
      dateFrom: '2026-06-24',
      dateTo: '2026-07-01',
    });
    expect(r.sendTotal).toBe(0);
    expect(r.receiveTotal).toBe(0);
    expect(queryPgRows).not.toHaveBeenCalled();
  });

  it('counts master changes and queue with NULL target_store_id (firma eşleşmesi)', async () => {
    queryPgRows.mockImplementation(async (_pg, sql: string) => {
      if (sql.includes('FROM sync_queue') && sql.includes('target_store_id')) {
        return [{ table_name: 'rex_002_products', cnt: '1290' }];
      }
      if (sql.includes('FROM rex_002_products')) {
        return [{ cnt: '1018' }];
      }
      if (sql.includes('FROM rex_002_01_sales')) {
        return [{ cnt: '0' }];
      }
      if (sql.includes('source_store_id')) {
        return [];
      }
      return [];
    });

    const r = await getMposTransferPreview({
      firmNr: '002',
      storeId: '99ee937c-bafa-4adb-996c-06b1d8da1381',
      terminalName: '7e87aae1-16ff-4e14-a607-312440cab7c7',
      sendFileTypes: ['products'],
      receiveFileTypes: ['sales'],
      syncMode: 'incremental',
      dateFrom: '2026-06-24',
      dateTo: '2026-07-01',
    });

    expect(r.sendLines[0]).toMatchObject({
      key: 'products',
      count: 1018,
    });
    expect(r.sendTotal).toBe(1290);
    expect(r.receiveTotal).toBe(0);
  });

  it('inbound queue yalnızca source_store_id dolu kayıtları sayar', async () => {
    queryPgRows.mockImplementation(async (_pg, sql: string) => {
      if (sql.includes('FROM sync_queue') && sql.includes('target_store_id')) {
        return [{ table_name: 'rex_002_products', cnt: '1290' }];
      }
      if (sql.includes('FROM sync_queue') && sql.includes('source_store_id = $1')) {
        return [];
      }
      if (sql.includes('FROM rex_002_products')) {
        return [{ cnt: '1018' }];
      }
      return [{ cnt: '0' }];
    });

    const r = await getMposTransferPreview({
      firmNr: '002',
      storeId: '99ee937c-bafa-4adb-996c-06b1d8da1381',
      sendFileTypes: ['products'],
      receiveFileTypes: ['day_end'],
      syncMode: 'incremental',
      dateFrom: '2026-06-24',
      dateTo: '2026-07-01',
    });

    expect(r.sendTotal).toBe(1290);
    expect(r.receiveTotal).toBe(0);
    expect(r.receiveLines.find((l) => l.key === 'invoices_note')?.count).toBe(0);
  });

  it('uses max(masterCount, queueTotal) for incremental products to avoid double count in line sum', async () => {
    queryPgRows.mockImplementation(async (_pg, sql: string) => {
      if (sql.includes('FROM sync_queue') && sql.includes('target_store_id')) {
        return [{ table_name: 'rex_002_products', cnt: '500' }];
      }
      if (sql.includes('FROM rex_002_products')) {
        return [{ cnt: '1018' }];
      }
      return [{ cnt: '0' }];
    });

    const r = await getMposTransferPreview({
      firmNr: '002',
      storeId: '99ee937c-bafa-4adb-996c-06b1d8da1381',
      sendFileTypes: ['products'],
      receiveFileTypes: ['sales'],
      syncMode: 'incremental',
      dateFrom: '2026-06-24',
      dateTo: '2026-07-01',
    });

    expect(r.sendTotal).toBe(1018);
  });

  it('aggregates preview for multiple send and receive types', async () => {
    queryPgRows.mockImplementation(async (_pg, sql: string) => {
      if (sql.includes('FROM sync_queue') && sql.includes('target_store_id')) {
        return [{ table_name: 'rex_002_products', cnt: '100' }];
      }
      if (sql.includes('FROM rex_002_products')) return [{ cnt: '50' }];
      if (sql.includes('FROM rex_002_customers')) return [{ cnt: '20' }];
      return [{ cnt: '0' }];
    });

    const r = await getMposTransferPreview({
      firmNr: '002',
      storeId: '99ee937c-bafa-4adb-996c-06b1d8da1381',
      sendFileTypes: ['products', 'customers', 'promotions'],
      receiveFileTypes: ['sales', 'day_end', 'z_report'],
      syncMode: 'incremental',
      dateFrom: '2026-06-24',
      dateTo: '2026-07-01',
    });

    expect(r.sendLines.some((l) => l.key === 'products' && l.count === 50)).toBe(true);
    expect(r.sendLines.some((l) => l.key === 'customers' && l.count === 20)).toBe(true);
    expect(r.sendLines.some((l) => l.key === 'promotions')).toBe(true);
    expect(r.receiveLines.some((l) => l.key === 'receive_z_report')).toBe(true);
  });
});
