/**
 * PostgREST randevu INSERT: aynı id için ignore-duplicates.
 * Fiş UNIQUE cevabı 409 olarak kalır (istemci yutmaz).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postgrest } from '../../services/api/postgrestClient';

const FIXED_ID = 'a31ab870-0351-4bc5-9d98-c3c27f88c48e';

describe('postgrestPost — randevu id çakışması', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('tek POST: on_conflict=id ve resolution=ignore-duplicates', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 201,
            statusText: 'Created',
            headers: { get: () => null },
            text: async () => '',
        });

        await postgrest.post(
            '/rex_001_01_beauty_appointments',
            { id: FIXED_ID, status: 'scheduled', total_price: 80, deposit_amount: 10 },
            {
                schema: 'beauty',
                prefer: 'return=minimal',
                onConflict: 'id',
                resolution: 'ignore-duplicates',
            },
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, { method?: string; headers?: Record<string, string>; body?: string }];
        expect(String(url)).toContain('/rex_001_01_beauty_appointments');
        expect(String(url)).toContain('on_conflict=id');
        expect(init.method).toBe('POST');
        expect(init.headers?.Prefer).toContain('resolution=ignore-duplicates');
        expect(init.headers?.Prefer).not.toContain('merge-duplicates');
        expect(init.headers?.['Content-Profile']).toBe('beauty');
        const body = JSON.parse(String(init.body));
        expect(body.id).toBe(FIXED_ID);
        expect(body.deposit_amount).toBe(10);
        expect(body.total_price).toBe(80);
    });

    it('fiş numarası 409 yanıtı hata olarak kalır ve ikinci istek atılmaz', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 409,
            statusText: 'Conflict',
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    code: '23505',
                    details: 'Key (fiche_no)=(BEA-2026-00001) already exists.',
                    hint: null,
                    message: 'duplicate key value violates unique constraint "rex_001_01_sales_fiche_no_key"',
                }),
        });

        await expect(
            postgrest.post(
                '/rex_001_01_sales',
                { id: FIXED_ID, fiche_no: 'BEA-2026-00001' },
                {
                    schema: 'public',
                    prefer: 'return=minimal',
                    onConflict: 'id',
                    resolution: 'ignore-duplicates',
                },
            ),
        ).rejects.toThrow(/fiche_no/);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
