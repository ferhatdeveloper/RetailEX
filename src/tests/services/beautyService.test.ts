/**
 * beautyService — Peşinatlı satış sonrası randevu tamamlama akışı testleri.
 *
 * 90 yıllık kıdemli muhasebeci gözüyle doğrulanan senaryolar:
 *   • `listInProgressAppointments` yalnızca status='in_progress' olanları döner
 *     ve `remaining_amount` doğru hesaplanır (total − deposit − paidRemainder).
 *   • `collectAppointmentRemainder` çağrısı:
 *       1) cash_lines INSERT (CH_TAHSILAT, sign=+1) yazılır,
 *       2) cash_registers.balance += amount,
 *       3) beauty_appointment_payments (payment_kind='remainder') eklenir,
 *       4) beauty_appointments.remainder_paid_amount artırılır,
 *       5) remainder_payment_date set edilir.
 *   • `completeAppointmentWithRemainder` → önce tahsilat sonra status='completed'
 *     geçişi (stok düşümü tetikleyici).
 *   • Yetersiz tutar / boş appointmentId / müşterisiz randevu → hata.
 *
 * Postgres çağrıları `vi.mock` ile soyutlanır; gerçek `postgres.query` her zaman
 * `{ rows: T[]; rowCount: number }` döndürdüğü için mock'lar bu yapıyı taklit eder.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const {
    queryMock,
    getMovementTableNameMock,
    getCardTableNameMock,
} = vi.hoisted(() => ({
    queryMock: vi.fn(),
    getMovementTableNameMock: vi.fn(
        (table: string, schema: string) => `${schema}.rex_001_01_${table}`,
    ),
    getCardTableNameMock: vi.fn(
        (table: string, schema = 'public') => `${schema}.${table}`,
    ),
}));

vi.mock('../../services/postgres', () => ({
    postgres: {
        query: queryMock as unknown as (...args: any[]) => any,
        getMovementTableName: getMovementTableNameMock as unknown as (
            table: string,
            schema?: string,
        ) => string,
        getCardTableName: getCardTableNameMock as unknown as (
            table: string,
            schema?: string,
        ) => string,
    },
    ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
    PostgresConnection: {
        getInstance: () => ({
            query: (...args: any[]) => queryMock(...args),
        }),
    },
}));

vi.mock('../../services/loggingService', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

import { beautyService } from '../../services/beautyService';
import { AppointmentStatus } from '../../types/beauty';

const sqlContains = (haystack: string, needle: string) =>
    haystack.replace(/\s+/g, ' ').includes(needle.replace(/\s+/g, ' '));

/** Mock formatı: { rows: T[], rowCount } — gerçek postgres.query sözleşmesi. */
const ok = (rows: unknown[]) => ({ rows, rowCount: rows.length });

describe('beautyService — in_progress randevu tamamlama akışı', () => {
    beforeEach(() => {
        queryMock.mockReset();
        getMovementTableNameMock.mockClear();
        getCardTableNameMock.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('listInProgressAppointments', () => {
        it('status=in_progress filtreli sorgu atar ve remaining_amount doğru hesaplanır', async () => {
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        client_id: 'cust-9',
                        service_id: 'svc-3',
                        specialist_id: 'spc-1',
                        device_id: null,
                        appointment_date: '2026-09-30',
                        appointment_time: '10:00:00',
                        duration: 45,
                        status: 'in_progress',
                        notes: null,
                        total_price: 100,
                        deposit_amount: 30,
                        remainder_paid_amount: 0,
                        deposit_date: '2026-09-29',
                        remainder_payment_date: null,
                        commission_amount: 0,
                        is_package_session: false,
                        package_purchase_id: null,
                        session_series_id: null,
                        customer_name: 'Ayşe Yılmaz',
                        customer_phone: '+905551112233',
                        service_name: 'Cilt Bakımı',
                        service_color: '#a855f7',
                        staff_name: 'Elif Hanım',
                        device_name: null,
                    },
                ]),
            );

            const list = await beautyService.listInProgressAppointments('2026-09-30');

            expect(list).toHaveLength(1);
            const apt = list[0];
            expect(apt.id).toBe('apt-1');
            expect(apt.status).toBe('in_progress');
            expect(apt.customer_name).toBe('Ayşe Yılmaz');
            expect((apt as { remaining_amount?: number }).remaining_amount).toBe(70);
            expect((apt as { deposit_amount?: number }).deposit_amount).toBe(30);
            expect((apt as { remainder_paid_amount?: number }).remainder_paid_amount).toBe(0);

            const sql = String(queryMock.mock.calls[0][0]);
            expect(sqlContains(sql, "status = 'in_progress'")).toBe(true);
            expect(getMovementTableNameMock).toHaveBeenCalledWith(
                'beauty_appointments',
                'beauty',
            );
        });

        it('remainder_paid_amount kısmen ödendiyse kalan doğru hesaplanır', async () => {
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-2',
                        client_id: 'cust-7',
                        service_id: 'svc-1',
                        specialist_id: null,
                        device_id: null,
                        appointment_date: '2026-09-30',
                        appointment_time: '11:00:00',
                        duration: 30,
                        status: 'in_progress',
                        notes: null,
                        total_price: 100,
                        deposit_amount: 30,
                        remainder_paid_amount: 10,
                        deposit_date: '2026-09-28',
                        remainder_payment_date: null,
                        commission_amount: 0,
                        is_package_session: false,
                        package_purchase_id: null,
                        session_series_id: null,
                        customer_name: 'Mehmet',
                        customer_phone: null,
                        service_name: 'Saç',
                        service_color: null,
                        staff_name: null,
                        device_name: null,
                    },
                ]),
            );

            const list = await beautyService.listInProgressAppointments('2026-09-30');
            expect(list).toHaveLength(1);
            expect((list[0] as { remaining_amount?: number }).remaining_amount).toBe(60);
        });

        it('randevu yoksa boş liste döner', async () => {
            queryMock.mockResolvedValueOnce(ok([]));
            const list = await beautyService.listInProgressAppointments();
            expect(list).toEqual([]);
        });
    });

    describe('collectAppointmentRemainder', () => {
        it('başarılı tahsilat → cash_lines + cash_registers + payment + appointment UPDATE', async () => {
            // 1) SELECT randevu
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        customer_id: 'cust-9',
                        total_price: 100,
                        deposit_amount: 30,
                        remainder_paid_amount: 0,
                    },
                ]),
            );
            // 2) cash_register doğrulama (verilen id ile)
            queryMock.mockResolvedValueOnce(ok([{ id: 'k-1' }]));
            // 3) cash_lines INSERT ... RETURNING (inserted=true)
            queryMock.mockResolvedValueOnce(ok([{ id: 'cr-77', inserted: true }]));
            // 4) UPDATE cash_registers.balance
            queryMock.mockResolvedValueOnce(ok([]));
            // 5) INSERT beauty_appointment_payments
            queryMock.mockResolvedValueOnce(ok([]));
            // 6) UPDATE beauty_appointments.remainder_paid_amount
            queryMock.mockResolvedValueOnce(ok([]));

            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: 'apt-1',
                amount: 70,
                paymentMethod: 'cash',
                cashRegisterId: 'k-1',
                cashier: 'Kasiyer-1',
                notes: 'Kalan ödeme',
            });

            expect(res.ok).toBe(true);
            expect(res.paymentId).toBeTruthy();

            const calls = queryMock.mock.calls;
            expect(calls.length).toBeGreaterThanOrEqual(6);

            // (1) SELECT appointment
            expect(String(calls[0][0])).toMatch(/FROM.*beauty_appointments.*WHERE id = \$1/i);
            expect(String(calls[0][1][0])).toBe('apt-1');

            // (3) cash_lines INSERT — CH_TAHSILAT, sign=+1
            const cashLinesSql = String(calls[2][0]);
            expect(sqlContains(cashLinesSql, "INSERT INTO cash_lines")).toBe(true);
            // SQL'de literal 'CH_TAHSILAT' VALUES listesinde yer alır
            expect(sqlContains(cashLinesSql, "'CH_TAHSILAT'")).toBe(true);
            // sign parametresi 8. sırada ($8::integer)
            expect(Number(calls[2][1][7])).toBe(1); // sign = +1

            // (4) UPDATE cash_registers.balance += amount
            const updateCashSql = String(calls[3][0]);
            expect(sqlContains(updateCashSql, 'balance = COALESCE')).toBe(true);
            expect(sqlContains(updateCashSql, 'cash_registers')).toBe(true);
            expect(Number(calls[3][1][0])).toBe(70);
            expect(String(calls[3][1][1])).toBe('k-1');

            // (5) INSERT appointment_payments — payment_kind='remainder'
            const paymentsSql = String(calls[4][0]);
            expect(sqlContains(paymentsSql, 'payment_kind')).toBe(true);
            expect(sqlContains(paymentsSql, "'remainder'")).toBe(true);
            expect(sqlContains(paymentsSql, 'beauty_appointment_payments')).toBe(true);
            expect(Number(calls[4][1][3])).toBe(70); // amount

            // (6) UPDATE appointment.remainder_paid_amount + remainder_payment_date
            const updateAptSql = String(calls[5][0]);
            expect(sqlContains(updateAptSql, 'remainder_paid_amount')).toBe(true);
            expect(sqlContains(updateAptSql, 'remainder_payment_date')).toBe(true);
            expect(Number(calls[5][1][0])).toBe(70);
        });

        it('cashRegisterId verilmediğinde MERKEZ/PATRON kasaya düşer', async () => {
            // 1) SELECT randevu
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        customer_id: 'cust-9',
                        total_price: 100,
                        deposit_amount: 30,
                        remainder_paid_amount: 0,
                    },
                ]),
            );
            // 2) input.cashRegisterId undefined → cash_register verify sorgusu atlanır
            //    doğrudan fallback sorgusu çalışır.
            queryMock.mockResolvedValueOnce(ok([{ id: 'k-central' }]));
            // 3) cash_lines INSERT
            queryMock.mockResolvedValueOnce(ok([{ id: 'cr-77', inserted: true }]));
            // 4) UPDATE cash_registers
            queryMock.mockResolvedValueOnce(ok([]));
            // 5) INSERT payments
            queryMock.mockResolvedValueOnce(ok([]));
            // 6) UPDATE appointment
            queryMock.mockResolvedValueOnce(ok([]));

            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: 'apt-1',
                amount: 70,
                paymentMethod: 'cash',
            });
            expect(res.ok).toBe(true);

            // Fallback sorguda MERKEZ/PATRON önceliği kontrolü
            const fbSql = String(queryMock.mock.calls[1][0]);
            expect(sqlContains(fbSql, 'MERKEZ KASA')).toBe(true);
            expect(sqlContains(fbSql, 'PATRON KASA')).toBe(true);
        });

        it('verilen cashRegisterId aktif değilse MERKEZ/PATRON fallback çalışır', async () => {
            // 1) SELECT randevu
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        customer_id: 'cust-9',
                        total_price: 100,
                        deposit_amount: 30,
                        remainder_paid_amount: 0,
                    },
                ]),
            );
            // 2) Verilen kasa bulunamadı (is_active=false) → targetRegisterId null
            queryMock.mockResolvedValueOnce(ok([]));
            // 3) Fallback MERKEZ/PATRON kasa
            queryMock.mockResolvedValueOnce(ok([{ id: 'k-central' }]));
            // 4) cash_lines INSERT
            queryMock.mockResolvedValueOnce(ok([{ id: 'cr-77', inserted: true }]));
            // 5) UPDATE cash_registers
            queryMock.mockResolvedValueOnce(ok([]));
            // 6) INSERT payments
            queryMock.mockResolvedValueOnce(ok([]));
            // 7) UPDATE appointment
            queryMock.mockResolvedValueOnce(ok([]));

            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: 'apt-1',
                amount: 70,
                paymentMethod: 'cash',
                cashRegisterId: 'k-inactive',
            });
            expect(res.ok).toBe(true);

            // Fallback sorgusu calls[2]
            const fbSql = String(queryMock.mock.calls[2][0]);
            expect(sqlContains(fbSql, 'MERKEZ KASA')).toBe(true);
            expect(sqlContains(fbSql, 'PATRON KASA')).toBe(true);
        });

        it('appointmentId boş ise hata döner (DB çağrısı yok)', async () => {
            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: '',
                amount: 100,
            });
            expect(res.ok).toBe(false);
            expect(res.error).toMatch(/appointmentId/i);
            expect(queryMock).not.toHaveBeenCalled();
        });

        it('tutar 0 veya negatifse hata döner', async () => {
            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: 'apt-1',
                amount: 0,
            });
            expect(res.ok).toBe(false);
            expect(res.error).toMatch(/tutar/i);
        });

        it('randevu bulunamazsa hata döner', async () => {
            queryMock.mockResolvedValueOnce(ok([]));
            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: 'apt-x',
                amount: 50,
            });
            expect(res.ok).toBe(false);
            expect(res.error).toMatch(/bulunamadı/i);
        });

        it('müşterisiz randevuda hata döner', async () => {
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-x',
                        customer_id: null,
                        total_price: 100,
                        deposit_amount: 30,
                        remainder_paid_amount: 0,
                    },
                ]),
            );
            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: 'apt-x',
                amount: 70,
            });
            expect(res.ok).toBe(false);
            expect(res.error).toMatch(/müşteri/i);
        });

        it('aktif kasa yoksa hata döner', async () => {
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        customer_id: 'cust-9',
                        total_price: 100,
                        deposit_amount: 30,
                        remainder_paid_amount: 0,
                    },
                ]),
            );
            // cash_register fallback boş
            queryMock.mockResolvedValueOnce(ok([]));

            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: 'apt-1',
                amount: 70,
            });
            expect(res.ok).toBe(false);
            expect(res.error).toMatch(/kasa/i);
        });

        it('card ödeme yöntemi seçildiğinde provider parametresi card olur', async () => {
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        customer_id: 'cust-9',
                        total_price: 100,
                        deposit_amount: 30,
                        remainder_paid_amount: 0,
                    },
                ]),
            );
            queryMock.mockResolvedValueOnce(ok([{ id: 'k-1' }]));
            queryMock.mockResolvedValueOnce(ok([{ id: 'cr-77', inserted: true }]));
            queryMock.mockResolvedValueOnce(ok([]));
            queryMock.mockResolvedValueOnce(ok([]));
            queryMock.mockResolvedValueOnce(ok([]));

            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: 'apt-1',
                amount: 70,
                paymentMethod: 'card',
                cashRegisterId: 'k-1',
            });
            expect(res.ok).toBe(true);

            // payments INSERT — provider parametresi 'card' (5. sırada)
            const paymentsArgs = queryMock.mock.calls[4][1];
            expect(String(paymentsArgs[4])).toBe('card');
        });
    });

    describe('completeAppointmentWithRemainder', () => {
        it('önce collectAppointmentRemainder, sonra status=COMPLETED çağrılır', async () => {
            // updateAppointmentStatus zinciri (SELECT package, UPDATE status,
            // applyConsumableDeductionForAppointment, ...) çok derin olduğu için
            // bu testte beautyService.updateAppointmentStatus'u spy edip her
            // durumda başarılı sayıyoruz — odak: collectAppointmentRemainder
            // başarısızsa updateAppointmentStatus çağrılmaz; başarılıysa
            // AppointmentStatus.COMPLETED ile bir kez çağrılır.
            const spy = vi
                .spyOn(beautyService, 'updateAppointmentStatus')
                .mockResolvedValue(undefined as unknown as void);

            // collectAppointmentRemainder içindeki sorgular (6 adet):
            // 1) SELECT randevu
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        customer_id: 'cust-9',
                        total_price: 100,
                        deposit_amount: 30,
                        remainder_paid_amount: 0,
                    },
                ]),
            );
            // 2) cash_register doğrulama
            queryMock.mockResolvedValueOnce(ok([{ id: 'k-1' }]));
            // 3) cash_lines INSERT
            queryMock.mockResolvedValueOnce(ok([{ id: 'cr-77', inserted: true }]));
            // 4) UPDATE cash_registers
            queryMock.mockResolvedValueOnce(ok([]));
            // 5) INSERT payments
            queryMock.mockResolvedValueOnce(ok([]));
            // 6) UPDATE appointment.remainder_paid_amount
            queryMock.mockResolvedValueOnce(ok([]));

            const res = await beautyService.completeAppointmentWithRemainder({
                appointmentId: 'apt-1',
                amount: 70,
                paymentMethod: 'cash',
                cashRegisterId: 'k-1',
            });

            expect(res.ok).toBe(true);
            expect(res.paymentId).toBeTruthy();
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith('apt-1', AppointmentStatus.COMPLETED);

            spy.mockRestore();
        });

        it('collect başarısızsa updateAppointmentStatus çağrılmaz', async () => {
            const spy = vi
                .spyOn(beautyService, 'updateAppointmentStatus')
                .mockResolvedValue(undefined as unknown as void);

            // collect: SELECT randevu yok
            queryMock.mockResolvedValueOnce(ok([]));

            const res = await beautyService.completeAppointmentWithRemainder({
                appointmentId: 'apt-x',
                amount: 70,
            });
            expect(res.ok).toBe(false);
            expect(res.error).toMatch(/bulunamadı/i);
            expect(spy).not.toHaveBeenCalled();

            // Sadece 1 sorgu (collect içindeki SELECT) — status UPDATE yok
            expect(queryMock.mock.calls.length).toBe(1);

            spy.mockRestore();
        });

        it('appointmentId boş ise hata', async () => {
            const res = await beautyService.completeAppointmentWithRemainder({
                appointmentId: '',
                amount: 50,
            });
            expect(res.ok).toBe(false);
            expect(res.error).toMatch(/appointmentId/i);
        });
    });
});