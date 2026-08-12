import { describe, expect, it } from 'vitest';
import { explainPostgrestConnectionError } from '../../services/postgres';

describe('explainPostgrestConnectionError', () => {
  it('SaaS 404 için LAN / 3002 metni vermez', () => {
    const msg = explainPostgrestConnectionError('https://api.retailex.app/ozbek', {
      httpStatus: 404,
      bodySnippet: '{"ok":false,"error":"not_found"}',
    });
    expect(msg).toMatch(/RetailEX bulutu/i);
    expect(msg).toMatch(/ozbek/);
    expect(msg).not.toMatch(/TCP 3002/);
    expect(msg).not.toMatch(/Wi‑Fi ağında/);
    expect(msg).not.toMatch(/RetailEX_PostgREST/);
  });

  it('SaaS ağ hatasında LAN Wi‑Fi metni vermez', () => {
    const msg = explainPostgrestConnectionError('https://api.retailex.app/ozbek', {
      error: 'Failed to fetch',
    });
    expect(msg).toMatch(/api\.retailex\.app/);
    expect(msg).toMatch(/LAN Wi‑Fi \/ TCP 3002 bu ekran için geçerli değildir/);
    expect(msg).not.toMatch(/aynı Wi‑Fi ağında/);
  });

  it('LAN 404 için port 3002 yönlendirmesi verir', () => {
    const msg = explainPostgrestConnectionError('http://192.168.1.10:3002', {
      httpStatus: 404,
    });
    expect(msg).toMatch(/Port 3002/);
    expect(msg).toMatch(/RetailEX_PostgREST/);
  });

  it('SaaS 503 için bulut teşhisi verir', () => {
    const msg = explainPostgrestConnectionError('https://api.retailex.app/testere', {
      httpStatus: 503,
    });
    expect(msg).toMatch(/HTTP 503/);
    expect(msg).toMatch(/postgrest_testere/);
    expect(msg).not.toMatch(/Wi‑Fi/);
  });
});
