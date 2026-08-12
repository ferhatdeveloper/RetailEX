import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/retailexDevProxy', () => ({
  fetchRetailexAware: vi.fn(),
}));

import { fetchRetailexAware } from '../../utils/retailexDevProxy';
import {
  countPostgrestTableRows,
  parsePostgrestContentRangeTotal,
} from '../../services/hybridSyncPostgrest';
import {
  formatRemoteMasterVerifyMessage,
  masterTableNamesForFirm,
} from '../../services/hybridSyncEngine';

describe('hybridSync remote verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parsePostgrestContentRangeTotal', () => {
    expect(parsePostgrestContentRangeTotal('0-0/1018')).toBe(1018);
    expect(parsePostgrestContentRangeTotal('')).toBeNull();
  });

  it('countPostgrestTableRows reads Content-Range', async () => {
    vi.mocked(fetchRetailexAware).mockResolvedValue({
      ok: true,
      status: 206,
      headers: new Headers({ 'Content-Range': '0-0/136' }),
      json: async () => [{}],
    } as Response);

    const n = await countPostgrestTableRows('https://api.retailex.app/lovan', 'rex_002_customers');
    expect(n).toBe(136);
  });

  it('formatRemoteMasterVerifyMessage', () => {
    const msg = formatRemoteMasterVerifyMessage([
      { tableName: 'rex_002_products', count: 1018 },
      { tableName: 'rex_002_customers', count: 0 },
      { tableName: 'rex_002_suppliers', count: null },
    ]);
    expect(msg).toContain('✓ products: 1018');
    expect(msg).toContain('⚠ customers: merkezde 0');
    expect(msg).toContain('? suppliers: kontrol edilemedi');
  });

  it('masterTableNamesForFirm', () => {
    expect(masterTableNamesForFirm('2')).toEqual([
      'rex_002_products',
      'rex_002_customers',
      'rex_002_suppliers',
    ]);
  });
});
