import { describe, it, expect } from 'vitest';
import { firmNrFromSyncTableName, normalizeSyncRow } from '../../services/hybridSyncNormalize';

describe('hybridSyncNormalize', () => {
  it('firmNrFromSyncTableName extracts padded firm from rex table', () => {
    expect(firmNrFromSyncTableName('rex_002_products')).toBe('002');
    expect(firmNrFromSyncTableName('rex_001_01_sales')).toBe('001');
    expect(firmNrFromSyncTableName('firms')).toBeNull();
  });

  it('normalizeSyncRow injects firm_nr when missing', () => {
    const row = normalizeSyncRow(
      'rex_002_products',
      { id: '00000000-0000-0000-0000-000000000099', code: 'X', name: 'Test' },
      '00000000-0000-0000-0000-000000000099',
    );
    expect(row.firm_nr).toBe('002');
    expect(row.is_active).toBe(true);
  });

  it('normalizeSyncRow keeps existing firm_nr', () => {
    const row = normalizeSyncRow('rex_002_products', { firm_nr: '002', code: 'Y' });
    expect(row.firm_nr).toBe('002');
  });
});
