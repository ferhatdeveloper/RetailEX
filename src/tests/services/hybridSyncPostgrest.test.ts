import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/retailexDevProxy', () => ({
  fetchRetailexAware: vi.fn(),
}));

import { fetchRetailexAware } from '../../utils/retailexDevProxy';
import { testPostgrestSyncEndpoint } from '../../services/hybridSyncPostgrest';

describe('testPostgrestSyncEndpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('write mode accepts reachable firms table', async () => {
    vi.mocked(fetchRetailexAware).mockResolvedValue({ ok: true, status: 200 } as Response);
    const r = await testPostgrestSyncEndpoint('https://api.retailex.app/lovan', 'write');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('veri tabloları');
  });

  it('queue mode explains missing sync_queue on 400', async () => {
    vi.mocked(fetchRetailexAware)
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => '' } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' } as Response);
    const r = await testPostgrestSyncEndpoint('https://api.retailex.app/lovan', 'queue');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('sync_queue');
    expect(r.message).toContain('Caddy');
  });
});
