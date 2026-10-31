/**
 * Randevu oluşturma: aynı istemci id'si ikinci POST'ta pkey 23505 verirse
 * başarıdır ve ikinci satır açılmaz. Fiş numarası UNIQUE ihlali yine hata.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const FIXED_ID = 'a31ab870-0351-4bc5-9d98-c3c27f88c48e';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

const { queryMock, postMock, usePostgrest } = vi.hoisted(() => ({
    queryMock: vi.fn(),
    postMock: vi.fn(),
    usePostgrest: { current: true },
}));

vi.mock('../../services/postgres', () => ({
    postgres: {
        query: (...args: unknown[]) => queryMock(...args),
        getMovementTableName: (table: string, schema: string) => `${schema}.rex_001_01_${table}`,
        getCardTableName: (table: string, schema = 'public') => `${schema}.${table}`,
    },
    ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
    PostgresConnection: {
        getInstance: () => ({
            query: (...args: unknown[]) => queryMock(...args),
        }),
    },
}));

vi.mock('../../services/loggingService', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), crudError: vi.fn() },
}));

vi.mock('../../config/postgrest.config', () => ({
    shouldUseTenantPostgrestApi: () => usePostgrest.current,
    isPostgrestEnabledForCurrentEnv: () => usePostgrest.current,
}));

vi.mock('../../services/api/postgrestClient', () => ({
    postgrest: {
        post: (...args: unknown[]) => postMock(...args),
        get: vi.fn(),
        patch: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
    },
}));

import { beautyService } from '../../services/beautyService';

const pkeyConflict = new Error(
    `PostgREST POST /rex_001_01_beauty_appointments: 409 Conflict — {"code":"23505","details":"Key (id)=(${FIXED_ID}) already exists.","hint":null,"message":"duplicate key value violates unique constraint \\"rex_001_01_beauty_appointments_pkey\\""}`,
);

const ficheConflict = new Error(
    'duplicate key value violates unique constraint "rex_001_01_sales_fiche_no_key" Key (fiche_no)=(BEA-2026-00001) already exists. code 23505',
);

describe('beautyService.createAppointment — aynı id yeniden deneme', () => {
    beforeEach(() => {
        queryMock.mockReset();
        postMock.mockReset();
        usePostgrest.current = true;
        postMock.mockResolvedValue(undefined);
        queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it('verilen id ile tek POST atar; pkey çakışmasında yok sayar, tutar alanlarını ikinci kez yazmaz', async () => {
        const id = await beautyService.createAppointment({
            id: FIXED_ID,
            customer_id: CUSTOMER_ID,
            date: '2026-10-31',
            time: '10:00',
            total_price: 150,
            deposit_amount: 40,
        });

        expect(id).toBe(FIXED_ID);
        expect(postMock).toHaveBeenCalledTimes(1);
        const [path, body, opts] = postMock.mock.calls[0] as [
            string,
            { id: string; total_price: number; deposit_amount: number },
            { onConflict?: string; resolution?: string; prefer?: string },
        ];
        expect(path).toBe('/rex_001_01_beauty_appointments');
        expect(body.id).toBe(FIXED_ID);
        expect(body.total_price).toBe(150);
        expect(body.deposit_amount).toBe(40);
        expect(opts.onConflict).toBe('id');
        expect(opts.resolution).toBe('ignore-duplicates');
        expect(opts.prefer).toBe('return=minimal');
    });

    it('ilk INSERT commit olduktan sonra aynı id 409 pkey ise başarıdır ve ikinci POST yoktur', async () => {
        postMock.mockRejectedValueOnce(pkeyConflict);

        await expect(
            beautyService.createAppointment({
                id: FIXED_ID,
                customer_id: CUSTOMER_ID,
                date: '2026-10-31',
                time: '10:30',
            }),
        ).resolves.toBe(FIXED_ID);

        expect(postMock).toHaveBeenCalledTimes(1);
        expect(queryMock).not.toHaveBeenCalled();
    });

    it('fiş numarası UNIQUE ihlali yine hata verir', async () => {
        postMock.mockRejectedValueOnce(ficheConflict);

        await expect(
            beautyService.createAppointment({
                id: FIXED_ID,
                customer_id: CUSTOMER_ID,
                date: '2026-10-31',
                time: '11:00',
            }),
        ).rejects.toThrow(/fiche_no/);

        expect(postMock).toHaveBeenCalledTimes(1);
    });

    it('SQL yolunda ON CONFLICT (id) DO NOTHING; DO UPDATE ile peşinat ezilmez', async () => {
        usePostgrest.current = false;

        const id = await beautyService.createAppointment({
            id: FIXED_ID,
            customer_id: CUSTOMER_ID,
            date: '2026-10-31',
            time: '12:00',
            deposit_amount: 25,
        });

        expect(id).toBe(FIXED_ID);
        expect(queryMock).toHaveBeenCalledTimes(1);
        expect(postMock).not.toHaveBeenCalled();
        const sql = String(queryMock.mock.calls[0][0]);
        expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/i);
        expect(sql).not.toMatch(/DO UPDATE/i);
        expect(queryMock.mock.calls[0][1][0]).toBe(FIXED_ID);
    });

    it('SQL pkey 23505 başarıdır; fiş UNIQUE yükselir', async () => {
        usePostgrest.current = false;
        queryMock.mockRejectedValueOnce(pkeyConflict);

        await expect(
            beautyService.createAppointment({
                id: FIXED_ID,
                customer_id: CUSTOMER_ID,
                date: '2026-10-31',
                time: '12:30',
            }),
        ).resolves.toBe(FIXED_ID);
        expect(queryMock).toHaveBeenCalledTimes(1);

        queryMock.mockRejectedValueOnce(ficheConflict);
        await expect(
            beautyService.createAppointment({
                id: FIXED_ID,
                customer_id: CUSTOMER_ID,
                date: '2026-10-31',
                time: '13:00',
            }),
        ).rejects.toThrow(/fiche_no/);
    });
});
