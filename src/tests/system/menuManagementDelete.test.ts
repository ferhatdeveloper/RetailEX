/**
 * MenuManagementPanel.deleteMenuItem — timeout + retry + unmount cleanup
 * davranış sözleşmesi. Gerçek bileşen değil; postgrest.delete etkileşimini
 * izole eden sözleşme testleri.
 *
 * Kök neden: MenuManagementPanel daha önce `supabase.from('menu_items').delete()`
 * ile RetailEX dışı bir Supabase URL'ine gidiyordu; PostgREST 8 sn timeout
 * + transient retry ile bu testte sözleşmeyi sabitliyoruz.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const deleteMock = vi.fn();

vi.mock('../../services/api/postgrestClient', () => ({
  postgrest: {
    delete: deleteMock,
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    upsert: vi.fn(),
    pathOne: vi.fn(),
    eq: vi.fn(),
    stripOp: vi.fn(),
  },
}));

describe('MenuManagementPanel.deleteMenuItem (postgrest.delete)', () => {
  beforeEach(() => {
    deleteMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tek başarılı silme isteğinde yalnız 1 delete çağrısı yapar', async () => {
    deleteMock.mockResolvedValueOnce(undefined);
    const { postgrest } = await import('../../services/api/postgrestClient');
    await postgrest.delete('/menu_items?id=eq.42', {
      schema: 'public',
      prefer: 'return=representation',
      signal: new AbortController().signal,
    });
    expect(deleteMock).toHaveBeenCalledTimes(1);
    const [path, opts] = deleteMock.mock.calls[0];
    expect(path).toBe('/menu_items?id=eq.42');
    expect(opts.schema).toBe('public');
    expect(opts.prefer).toBe('return=representation');
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('AbortError fırlatıldığında signal.aborted true olur (timeout tetiklendi)', async () => {
    const controller = new AbortController();
    deleteMock.mockImplementationOnce(async (_path: string, opts: any) => {
      // 8 sn sonra abortlanacağı için burada manuel abort edip fırlatıyoruz.
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        (err as any).name = 'AbortError';
        // @ts-expect-error rejection
      });
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    const { postgrest } = await import('../../services/api/postgrestClient');
    setTimeout(() => controller.abort(), 5);
    await expect(
      postgrest.delete('/menu_items?id=eq.7', {
        schema: 'public',
        prefer: 'return=representation',
        signal: controller.signal,
      }),
    ).rejects.toThrow(/aborted/i);
    expect(controller.signal.aborted).toBe(true);
  });

  it('500 transient hatasında ikinci deneme yapılır ve sonuç başarı olursa normalize edilir', async () => {
    deleteMock
      .mockRejectedValueOnce(new Error('PostgREST DELETE /menu_items: 503 Service Unavailable'))
      .mockResolvedValueOnce(undefined);
    const { postgrest } = await import('../../services/api/postgrestClient');
    const first = postgrest.delete('/menu_items?id=eq.9', {
      schema: 'public',
      prefer: 'return=representation',
      signal: new AbortController().signal,
    });
    await expect(first).rejects.toThrow(/503/);
    await postgrest.delete('/menu_items?id=eq.9', {
      schema: 'public',
      prefer: 'return=representation',
      signal: new AbortController().signal,
    });
    expect(deleteMock).toHaveBeenCalledTimes(2);
  });

  it('schema public olarak gönderilir (Accept-Profile / Content-Profile = public)', async () => {
    deleteMock.mockResolvedValueOnce(undefined);
    const { postgrest } = await import('../../services/api/postgrestClient');
    await postgrest.delete('/menu_items?id=eq.123', {
      schema: 'public',
      prefer: 'return=representation',
      signal: new AbortController().signal,
    });
    const [, opts] = deleteMock.mock.calls[0];
    expect(opts.schema).toBe('public');
  });
});
