/**
 * bookingError — randevu kayıt hata ayrıştırıcı birim testleri.
 *
 * Bu test AppointmentPOS "Kayıt sırasında hata" modalındaki parse mantığını
 * doğrular. Amaç: kullanıcı hata aldığında spesifik neden görebilsin
 * (migration / unique / null / fk / connection / unknown) ve hangi adımın
 * başarısız olduğunu (appointment / payment / sale / unknown) bilsin.
 */

import { describe, it, expect } from 'vitest';
import {
    parseBookingApiError,
    detectFailedStep,
    extractTechnicalError,
    extractPgCode,
} from '../../utils/bookingError';

describe('parseBookingApiError — Postgres SQLSTATE tanıma', () => {
    it('migration_required: undefined_table (42P01)', () => {
        const err = {
            code: '42P01',
            message: 'relation "rex_001_01_beauty_appointments" does not exist',
        };
        const parsed = parseBookingApiError(err);
        expect(parsed.reasonKey).toBe('migration_required');
        expect(parsed.pgCode).toBe('42P01');
    });

    it('migration_required: undefined_column (42703)', () => {
        const err = {
            code: '42703',
            message: 'column "deposit_amount" does not exist',
        };
        const parsed = parseBookingApiError(err);
        expect(parsed.reasonKey).toBe('migration_required');
        expect(parsed.pgCode).toBe('42703');
    });

    it('migration_required: metin içinde "does not exist"', () => {
        const err = new Error('column linked_appointment_id does not exist');
        const parsed = parseBookingApiError(err);
        expect(parsed.reasonKey).toBe('migration_required');
    });

    it('unique_violation: SQLSTATE 23505', () => {
        const err = {
            code: '23505',
            message: 'duplicate key value violates unique constraint "sales_fiche_no_key"',
            detail: 'Key (fiche_no)=(BEAUTY-PESINAT-apt1-20260930120000) already exists.',
        };
        const parsed = parseBookingApiError(err);
        expect(parsed.reasonKey).toBe('unique_violation');
        expect(parsed.pgCode).toBe('23505');
        expect(parsed.detail).toContain('duplicate key');
    });

    it('null_constraint: SQLSTATE 23502', () => {
        const err = {
            code: '23502',
            message: 'null value in column "customer_name" violates not-null constraint',
        };
        const parsed = parseBookingApiError(err);
        expect(parsed.reasonKey).toBe('null_constraint');
        expect(parsed.pgCode).toBe('23502');
    });

    it('fk_violation: SQLSTATE 23503', () => {
        const err = {
            code: '23503',
            message: 'insert or update on table violates foreign key constraint',
            detail: 'Key (specialist_id)=(uuid-missing) is not present in table "staff".',
        };
        const parsed = parseBookingApiError(err);
        expect(parsed.reasonKey).toBe('fk_violation');
        expect(parsed.pgCode).toBe('23503');
    });

    it('connection: fetch failed / networkerror / timeout', () => {
        const fetchFail = parseBookingApiError(new Error('fetch failed'));
        expect(fetchFail.reasonKey).toBe('connection');

        const timeout = parseBookingApiError(new Error('PostgresConnection timeout'));
        expect(timeout.reasonKey).toBe('connection');

        const ref = parseBookingApiError(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
        expect(ref.reasonKey).toBe('connection');
    });

    it('unknown: tanınmayan hata', () => {
        const parsed = parseBookingApiError(new Error('Some random runtime error'));
        expect(parsed.reasonKey).toBe('unknown');
        expect(parsed.pgCode).toBeNull();
    });

    it('string hata kabul eder', () => {
        const parsed = parseBookingApiError('column foo does not exist');
        expect(parsed.reasonKey).toBe('migration_required');
    });

    it('null/undefined hata güvenli', () => {
        expect(parseBookingApiError(null).reasonKey).toBe('unknown');
        expect(parseBookingApiError(undefined).reasonKey).toBe('unknown');
    });
});

describe('detectFailedStep — başarısız adımı tespit', () => {
    it('appointment: beauty_appointments INSERT hatası', () => {
        expect(
            detectFailedStep(
                'insert into rex_001_01_beauty_appointments: column clinical_data does not exist',
            ),
        ).toBe('appointment');
    });

    it('payment: deposit_sale_id / appointment_payments hatası', () => {
        expect(
            detectFailedStep(
                'INSERT INTO rex_001_01_beauty_appointment_payments: null value in column "amount"',
            ),
        ).toBe('payment');
        expect(detectFailedStep('column deposit_amount does not exist')).toBe('payment');
    });

    it('sale: sales INSERT / fiche_no hatası', () => {
        expect(
            detectFailedStep(
                'INSERT INTO rex_001_01_sales: duplicate key value violates unique constraint "fiche_no"',
            ),
        ).toBe('sale');
        expect(detectFailedStep('column sale_items.unit_price does not exist')).toBe('sale');
    });

    it('unknown: tanınmayan', () => {
        expect(detectFailedStep('generic error')).toBe('unknown');
        expect(detectFailedStep('')).toBe('unknown');
    });
});

describe('extractTechnicalError — format normalleştirme', () => {
    it('string → kendisi', () => {
        expect(extractTechnicalError('hello')).toBe('hello');
    });
    it('Error.message', () => {
        expect(extractTechnicalError(new Error('boom'))).toBe('boom');
    });
    it('object { message, code, detail, hint }', () => {
        const e = { message: 'm', code: 'c', detail: 'd', hint: 'h' };
        expect(extractTechnicalError(e)).toBe('m | c | d | h');
    });
    it('object { message, code }', () => {
        expect(extractTechnicalError({ message: 'm', code: 'c' })).toBe('m | c');
    });
    it('null / undefined → boş string', () => {
        expect(extractTechnicalError(null)).toBe('');
        expect(extractTechnicalError(undefined)).toBe('');
    });
});

describe('extractPgCode — SQLSTATE çıkarma', () => {
    it('e.code geçerli 5-haneli kod → döner', () => {
        expect(extractPgCode({ code: '23505' })).toBe('23505');
        expect(extractPgCode({ pgCode: '42P01' })).toBe('42P01');
        expect(extractPgCode({ sqlState: '23502' })).toBe('23502');
    });
    it('geçersiz / yok → null', () => {
        expect(extractPgCode({ code: 'invalid' })).toBeNull();
        expect(extractPgCode({})).toBeNull();
        expect(extractPgCode(null)).toBeNull();
    });
});

describe('parseBookingApiError — gerçek senaryolar (kullanıcı hata aldığında)', () => {
    it('Senaryo A: migration 181/182 uygulanmamış (en olası)', () => {
        // appointment INSERT başarısız → kullanıcı "Kayıt sırasında hata" alır
        const parsed = parseBookingApiError({
            code: '42703',
            message: 'column "deposit_amount" of relation "beauty_appointments" does not exist',
        });
        expect(parsed.reasonKey).toBe('migration_required');
        expect(parsed.failedStep).toBe('payment'); // deposit_amount → payment ipucu
        expect(parsed.pgCode).toBe('42703');
    });

    it('Senaryo B: NOT NULL ihlali — müşteri adı boş', () => {
        const parsed = parseBookingApiError({
            code: '23502',
            message: 'null value in column "customer_name" violates not-null constraint',
        });
        expect(parsed.reasonKey).toBe('null_constraint');
        expect(parsed.failedStep).toBe('unknown'); // müşteri/satış ayrımı yok
    });

    it('Senaryo C: sales.fiche_no UNIQUE çakışması (aynı saniyede 2 peşinat)', () => {
        const parsed = parseBookingApiError({
            code: '23505',
            message: 'duplicate key value violates unique constraint "sales_fiche_no_key"',
            detail: 'Key (fiche_no)=(BEAUTY-PESINAT-uuid-20260930120000) already exists.',
        });
        expect(parsed.reasonKey).toBe('unique_violation');
        expect(parsed.failedStep).toBe('sale');
    });

    it('Senaryo D: bridge timeout / unreachable', () => {
        const parsed = parseBookingApiError(new Error('fetch failed: pg_bridge timeout'));
        expect(parsed.reasonKey).toBe('connection');
        expect(parsed.failedStep).toBe('unknown');
    });

    it('Senaryo E: FK ihlali (silinen müşteri)', () => {
        const parsed = parseBookingApiError({
            code: '23503',
            message: 'insert or update on table "beauty_appointments" violates foreign key constraint',
            detail: 'Key (client_id)=(missing) is not present in table "customers".',
        });
        expect(parsed.reasonKey).toBe('fk_violation');
        // beauty_appointments INSERT hatası; tablo adı geçtiği için 'appointment' adımı
        expect(parsed.failedStep).toBe('appointment');
    });
});