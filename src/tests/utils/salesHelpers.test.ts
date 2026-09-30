/**
 * salesHelpers — fiş no üretici + aptId ayrıştırıcı + deposit/main sale bağlama testleri.
 *
 * Plan §6 Adım 10 — `nextPesinatFicheNo`, `nextMainFicheNo`,
 * `extractAppointmentIdFromFicheNo`, `buildSaleGroupId`.
 *
 * DB-yoğun fonksiyonlar (`linkDepositToMainSale`, `setSaleAppointmentLink`)
 * `vi.mock('../../services/postgres')` ile soyutlanır; burada yalnız SQL ve
 * parametreler doğrulanır.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
    queryMock: vi.fn(),
}));

vi.mock('../../services/postgres', () => ({
    postgres: {
        query: queryMock as unknown as (...args: any[]) => any,
    },
    ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
    PostgresConnection: {
        getInstance: () => ({
            query: (...args: any[]) => queryMock(...args),
        }),
    },
}));

import {
    buildSaleGroupId,
    extractAppointmentIdFromFicheNo,
    linkDepositToMainSale,
    nextMainFicheNo,
    nextPesinatFicheNo,
    setSaleAppointmentLink,
    tsForFicheNo,
} from '../../services/salesHelpers';

describe('salesHelpers — fiş no üretimi (Plan §6 Adım 2)', () => {
    it('nextPesinatFicheNo: prefix + aptId + 14-haneli ts formatında üretir', () => {
        const aptId = '11111111-2222-3333-4444-555555555555';
        const ts = new Date(2026, 8, 30, 12, 34, 56); // 30 Eylül 2026 12:34:56 (ay 0-indexed)
        const fiche = nextPesinatFicheNo(aptId, ts);
        expect(fiche).toBe('BEAUTY-PESINAT-' + aptId + '-20260930123456');
    });

    it('nextPesinatFicheNo: ts verilmezse anlık zamanı kullanır', () => {
        const aptId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        const fiche = nextPesinatFicheNo(aptId);
        expect(fiche).toMatch(/^BEAUTY-PESINAT-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-\d{14}$/);
    });

    it('nextMainFicheNo: prefix MAIN kullanır', () => {
        const aptId = '11111111-2222-3333-4444-555555555555';
        const ts = new Date(2026, 11, 31, 23, 59, 59); // 31 Ara 2026 23:59:59
        const fiche = nextMainFicheNo(aptId, ts);
        expect(fiche).toBe('BEAUTY-MAIN-' + aptId + '-20261231235959');
    });

    it('tsForFicheNo: 14 haneli YYYYMMDDHHMMSS döner, pad ile', () => {
        const ts = new Date(2026, 0, 5, 7, 8, 9); // 5 Oca 2026 07:08:09
        expect(tsForFicheNo(ts)).toBe('20260105070809');
    });

    it('extractAppointmentIdFromFicheNo: peşinat veya ana formatından aptId çıkarır', () => {
        const aptId = '11111111-2222-3333-4444-555555555555';
        expect(extractAppointmentIdFromFicheNo(`BEAUTY-PESINAT-${aptId}-20260930123456`)).toBe(aptId);
        expect(extractAppointmentIdFromFicheNo(`BEAUTY-MAIN-${aptId}-20260930123456`)).toBe(aptId);
    });

    it('extractAppointmentIdFromFicheNo: geçersiz / farklı formatta null döner', () => {
        expect(extractAppointmentIdFromFicheNo('BEA-2026-XYZ')).toBeNull();
        expect(extractAppointmentIdFromFicheNo('BEAUTY-REMAINDER-apt-1')).toBeNull();
        expect(extractAppointmentIdFromFicheNo('')).toBeNull();
        expect(extractAppointmentIdFromFicheNo(null)).toBeNull();
        expect(extractAppointmentIdFromFicheNo(undefined)).toBeNull();
    });

    it('buildSaleGroupId: apt-{uuid} formatında', () => {
        const aptId = '11111111-2222-3333-4444-555555555555';
        expect(buildSaleGroupId(aptId)).toBe(`apt-${aptId}`);
    });

    it('nextPesinatFicheNo: aptId boş ise hata fırlatır', () => {
        expect(() => nextPesinatFicheNo('')).toThrow();
        expect(() => nextPesinatFicheNo('   ')).toThrow();
    });

    it('buildSaleGroupId: aptId boş ise hata fırlatır', () => {
        expect(() => buildSaleGroupId('')).toThrow();
    });
});

describe('salesHelpers — DB bağlama fonksiyonları', () => {
    beforeEach(() => {
        queryMock.mockReset();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('linkDepositToMainSale: deposit_sale_id UPDATE sorgusu atılır', async () => {
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await linkDepositToMainSale('dep-id', 'main-id');

        expect(queryMock).toHaveBeenCalledTimes(1);
        const [sql, params] = queryMock.mock.calls[0];
        expect(String(sql)).toMatch(/UPDATE rex_001_01_sales/i);
        expect(String(sql)).toMatch(/SET deposit_sale_id/i);
        expect(String(params[0])).toBe('dep-id');
        expect(String(params[1])).toBe('main-id');
    });

    it('linkDepositToMainSale: id eksikse hata fırlatır', async () => {
        await expect(linkDepositToMainSale('', 'main-id')).rejects.toThrow();
        await expect(linkDepositToMainSale('dep-id', '')).rejects.toThrow();
        expect(queryMock).not.toHaveBeenCalled();
    });

    it('setSaleAppointmentLink: linked_appointment_id UPDATE sorgusu atılır', async () => {
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await setSaleAppointmentLink('sale-1', 'apt-1');

        expect(queryMock).toHaveBeenCalledTimes(1);
        const [sql, params] = queryMock.mock.calls[0];
        expect(String(sql)).toMatch(/UPDATE rex_001_01_sales/i);
        expect(String(sql)).toMatch(/SET linked_appointment_id/i);
        expect(String(params[0])).toBe('sale-1');
        expect(String(params[1])).toBe('apt-1');
    });

    it('setSaleAppointmentLink: appointmentId null olabilir (geri yazım / temizlik)', async () => {
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await setSaleAppointmentLink('sale-1', null);

        const [, params] = queryMock.mock.calls[0];
        expect(params[1]).toBeNull();
    });
});
