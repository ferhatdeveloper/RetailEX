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

// PostgREST hibrit yolunu testlerde kapalı tut: her zaman SQL/postgres.query yoluna düş.
vi.mock('../../config/postgrest.config', () => ({
    shouldUseTenantPostgrestApi: () => false,
    isPostgrestEnabledForCurrentEnv: () => false,
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
        it('başarılı tahsilat → cash_lines + cash_registers + payment + appointment UPDATE + ana sales fişi', async () => {
            // 1) SELECT randevu (Plan §6 Adım 4: deposit_sale_id + customer_name JOIN'i eklendi)
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        customer_id: 'cust-9',
                        customer_name: 'Test Müşteri',
                        total_price: 100,
                        deposit_amount: 30,
                        deposit_sale_id: 'sale-pep-1',
                        sale_group_id: 'apt-apt-1',
                        service_name: 'Lazer Epilasyon',
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
            // 5) Plan §6 Adım 4 — ana sales INSERT (BEAUTY-MAIN-{aptId}-{ts})
            queryMock.mockResolvedValueOnce(ok([{ id: 'sale-main-1', fiche_no: 'BEAUTY-MAIN-apt-1-20260930120000' }]));
            // 6) sale_items INSERT (hizmet kalemi)
            queryMock.mockResolvedValueOnce(ok([]));
            // 7) appointment geri yaz UPDATE (remainder_sale_id + fiche_no + sale_group_id)
            queryMock.mockResolvedValueOnce(ok([]));
            // 8) INSERT beauty_appointment_payments
            queryMock.mockResolvedValueOnce(ok([]));
            // 9) UPDATE beauty_appointments.remainder_paid_amount
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
            // Plan §6 Adım 4 — yeni dönüş alanları
            expect(res.saleId).toBe('sale-main-1');
            expect(res.ficheNo).toMatch(/^BEAUTY-MAIN-apt-1-\d{14}$/);

            const calls = queryMock.mock.calls;
            expect(calls.length).toBeGreaterThanOrEqual(9);

            // (1) SELECT appointment — JOIN customers + service_name/deposit_sale_id
            expect(String(calls[0][0])).toMatch(/FROM beauty\.rex_001_01_beauty_appointments/i);
            expect(String(calls[0][0])).toMatch(/LEFT JOIN rex_001_customers/i);
            expect(String(calls[0][0])).toMatch(/deposit_sale_id/i);
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

            // (5) Plan §6 Adım 4 — ana sales INSERT — BEAUTY-MAIN-{aptId}-{ts}
            const salesSql = String(calls[4][0]);
            expect(sqlContains(salesSql, 'INSERT INTO rex_001_01_sales')).toBe(true);
            expect(salesSql).toMatch(/deposit_sale_id/);
            expect(salesSql).toMatch(/sale_group_id/);
            expect(salesSql).toMatch(/is_deposit/);
            expect(salesSql).toMatch(/ON CONFLICT \(fiche_no\) DO NOTHING/i);
            // ficheNo artık parametre $3 olarak gönderiliyor (literal değil)
            expect(String(calls[4][1][2])).toMatch(/^BEAUTY-MAIN-apt-1-\d{14}$/);
            expect(String(calls[4][1][5])).toBe('cust-9');   // customer_id
            expect(String(calls[4][1][6])).toBe('Test Müşteri'); // customer_name
            expect(Number(calls[4][1][7])).toBe(70);        // amount
            expect(String(calls[4][1][10])).toBe('apt-1');  // linked_appointment_id
            expect(String(calls[4][1][11])).toBe('sale-pep-1'); // deposit_sale_id (peşinat fişine bağ)
            expect(String(calls[4][1][12])).toBe('apt-apt-1'); // sale_group_id

            // (6) sale_items INSERT — hizmet kalemi (serviceName)
            const itemsSql = String(calls[5][0]);
            expect(sqlContains(itemsSql, 'INSERT INTO rex_001_01_sale_items')).toBe(true);
            expect(String(itemsSql)).toMatch(/item_type/);
            expect(String(calls[5][1][2])).toBe('Lazer Epilasyon'); // service_name

            // (7) appointment geri yaz UPDATE (remainder_sale_id + fiche_no)
            const aptBackSql = String(calls[6][0]);
            expect(sqlContains(aptBackSql, 'remainder_sale_id')).toBe(true);
            expect(sqlContains(aptBackSql, 'remainder_sale_fiche_no')).toBe(true);
            expect(String(calls[6][1][0])).toBe('apt-1');
            expect(String(calls[6][1][1])).toBe('sale-main-1');

            // (8) INSERT appointment_payments — payment_kind='remainder'
            const paymentsSql = String(calls[7][0]);
            expect(sqlContains(paymentsSql, 'payment_kind')).toBe(true);
            expect(sqlContains(paymentsSql, "'remainder'")).toBe(true);
            expect(sqlContains(paymentsSql, 'beauty_appointment_payments')).toBe(true);
            expect(Number(calls[7][1][3])).toBe(70); // amount

            // (9) UPDATE appointment.remainder_paid_amount + remainder_payment_date
            const updateAptSql = String(calls[8][0]);
            expect(sqlContains(updateAptSql, 'remainder_paid_amount')).toBe(true);
            expect(sqlContains(updateAptSql, 'remainder_payment_date')).toBe(true);
            expect(Number(calls[8][1][0])).toBe(70);
        });

        it('sales INSERT hata verirse ana akış yine de tamamlanır (saleId/ficheNo null)', async () => {
            // 1) SELECT randevu
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        customer_id: 'cust-9',
                        customer_name: 'Müşteri',
                        total_price: 100,
                        deposit_amount: 30,
                        deposit_sale_id: null,
                        sale_group_id: null,
                        service_name: 'Hizmet',
                        remainder_paid_amount: 0,
                    },
                ]),
            );
            // 2) cash_register verify
            queryMock.mockResolvedValueOnce(ok([{ id: 'k-1' }]));
            // 3) cash_lines INSERT
            queryMock.mockResolvedValueOnce(ok([{ id: 'cr-77', inserted: true }]));
            // 4) UPDATE cash_registers
            queryMock.mockResolvedValueOnce(ok([]));
            // 5) sales INSERT → HATA (best-effort)
            queryMock.mockRejectedValueOnce(new Error('FK violation'));

            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: 'apt-1',
                amount: 70,
                cashRegisterId: 'k-1',
            });

            // Ana akış yine başarılı; saleId null, ficheNo null
            expect(res.ok).toBe(true);
            expect(res.saleId).toBeUndefined();
            expect(res.ficheNo).toBeUndefined();
            // payment INSERT + appointment UPDATE yine de çağrıldı
            expect(queryMock.mock.calls.length).toBeGreaterThanOrEqual(6);
        });

        it('cashRegisterId verilmediğinde MERKEZ/PATRON kasaya düşer', async () => {
            // 1) SELECT randevu
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        customer_id: 'cust-9',
                        customer_name: null,
                        total_price: 100,
                        deposit_amount: 30,
                        deposit_sale_id: null,
                        sale_group_id: null,
                        service_name: null,
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
            // 5) sales INSERT (Plan §6 Adım 4)
            queryMock.mockResolvedValueOnce(ok([{ id: 'sale-main-1', fiche_no: 'BEAUTY-MAIN-apt-1-20260930120000' }]));
            // 6) sale_items INSERT
            queryMock.mockResolvedValueOnce(ok([]));
            // 7) appointment geri yaz UPDATE
            queryMock.mockResolvedValueOnce(ok([]));
            // 8) INSERT payments
            queryMock.mockResolvedValueOnce(ok([]));
            // 9) UPDATE appointment
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
                        customer_name: null,
                        total_price: 100,
                        deposit_amount: 30,
                        deposit_sale_id: null,
                        sale_group_id: null,
                        service_name: null,
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
            // 6) sales INSERT (Plan §6 Adım 4)
            queryMock.mockResolvedValueOnce(ok([{ id: 'sale-main-1', fiche_no: 'BEAUTY-MAIN-apt-1-20260930120000' }]));
            // 7) sale_items INSERT
            queryMock.mockResolvedValueOnce(ok([]));
            // 8) appointment geri yaz UPDATE
            queryMock.mockResolvedValueOnce(ok([]));
            // 9) INSERT payments
            queryMock.mockResolvedValueOnce(ok([]));
            // 10) UPDATE appointment
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
                        customer_name: null,
                        total_price: 100,
                        deposit_amount: 30,
                        deposit_sale_id: null,
                        sale_group_id: null,
                        service_name: null,
                        remainder_paid_amount: 0,
                    },
                ]),
            );
            queryMock.mockResolvedValueOnce(ok([{ id: 'k-1' }]));
            queryMock.mockResolvedValueOnce(ok([{ id: 'cr-77', inserted: true }]));
            queryMock.mockResolvedValueOnce(ok([]));
            // sales INSERT
            queryMock.mockResolvedValueOnce(ok([{ id: 'sale-main-1', fiche_no: 'BEAUTY-MAIN-apt-1-20260930120000' }]));
            // sale_items INSERT
            queryMock.mockResolvedValueOnce(ok([]));
            // appointment geri yaz UPDATE
            queryMock.mockResolvedValueOnce(ok([]));
            // payments INSERT
            queryMock.mockResolvedValueOnce(ok([]));
            // appointment UPDATE
            queryMock.mockResolvedValueOnce(ok([]));

            const res = await beautyService.collectAppointmentRemainder({
                appointmentId: 'apt-1',
                amount: 70,
                paymentMethod: 'card',
                cashRegisterId: 'k-1',
            });
            expect(res.ok).toBe(true);

            // payments INSERT — provider parametresi 'card' (5. sırada)
            // Sorgu sırası: SELECT(0), cash_reg verify(1), cash_lines(2), cash_reg UPDATE(3),
            //               sales INSERT(4), sale_items(5), apt back(6), payments(7), apt UPDATE(8)
            const paymentsArgs = queryMock.mock.calls[7][1];
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

            // collectAppointmentRemainder içindeki sorgular (Plan §6 Adım 4 ile 9 adet):
            // 1) SELECT randevu
            queryMock.mockResolvedValueOnce(
                ok([
                    {
                        id: 'apt-1',
                        customer_id: 'cust-9',
                        customer_name: null,
                        total_price: 100,
                        deposit_amount: 30,
                        deposit_sale_id: null,
                        sale_group_id: null,
                        service_name: null,
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
            // 5) Plan §6 Adım 4 — sales INSERT
            queryMock.mockResolvedValueOnce(ok([{ id: 'sale-main-1', fiche_no: 'BEAUTY-MAIN-apt-1-20260930120000' }]));
            // 6) sale_items INSERT
            queryMock.mockResolvedValueOnce(ok([]));
            // 7) appointment geri yaz UPDATE
            queryMock.mockResolvedValueOnce(ok([]));
            // 8) INSERT payments
            queryMock.mockResolvedValueOnce(ok([]));
            // 9) UPDATE appointment.remainder_paid_amount
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

    describe('createSale — Plan §6 Adım 5 opsiyonel parent/linked metadata', () => {
        it('linkedAppointmentId + parentSaleId verildiğinde notes içine rex_appt/parent_sale tag\'leri eklenir', async () => {
            // createSale → beauty_sales INSERT + items INSERT + runBeautySaleErpAndLoyalty (addSale)
            // 1) INSERT beauty_sales
            queryMock.mockResolvedValueOnce(ok([{ id: 'beauty-sale-1' }]));
            // 2) INSERT beauty_sale_items (boş items[] → atlanır)
            // 3) addSale zincirinde çağrılan satış INSERT: invoicesAPI içinden
            //    Burada addSale mock'lanmadığı için salesAPI.create başarısız olabilir
            //    — test yalnız opts metadata'nın notes'a eklenip eklenmediğini kontrol eder.

            try {
                await beautyService.createSale(
                    {
                        customer_id: 'cust-9',
                        customer_name: 'Müşteri',
                        subtotal: 100,
                        discount: 0,
                        tax: 0,
                        total: 100,
                        payment_method: 'cash',
                        notes: 'Başlangıç notu',
                    } as any,
                    [],
                    {
                        linkedAppointmentId: 'apt-1',
                        parentSaleId: 'sale-pep-1',
                        saleGroupId: 'apt-apt-1',
                        isDeposit: false,
                    },
                );
            } catch {
                // salesAPI.create başarısız olabilir (PostgRest zincirinde mock yok);
                // asıl doğrulama: INSERT beauty_sales çağrıldı mı? notes metadata taşıyor mu?
            }

            const insertSaleCall = queryMock.mock.calls[0];
            const insertSaleSql = String(insertSaleCall[0]);
            expect(insertSaleSql).toMatch(/INSERT INTO beauty\.rex_001_01_beauty_sales/i);
            // Notes parametresi ($12) — rex_appt/parent_sale/sale_group tag'leri eklenmiş olmalı
            const notesArg = insertSaleCall[1][11];
            expect(String(notesArg)).toContain('rex_appt:apt-1');
            expect(String(notesArg)).toContain('parent_sale:sale-pep-1');
            expect(String(notesArg)).toContain('sale_group:apt-apt-1');
            expect(String(notesArg)).toContain('Başlangıç notu');
        });

        it('isDeposit=true verildiğinde notes içine deposit:1 tag\'i eklenir', async () => {
            queryMock.mockResolvedValueOnce(ok([{ id: 'beauty-sale-2' }]));

            try {
                await beautyService.createSale(
                    {
                        customer_id: 'cust-9',
                        customer_name: 'Müşteri',
                        subtotal: 30,
                        discount: 0,
                        tax: 0,
                        total: 30,
                        payment_method: 'cash',
                        notes: '',
                    } as any,
                    [],
                    {
                        linkedAppointmentId: 'apt-1',
                        saleGroupId: 'apt-apt-1',
                        isDeposit: true,
                    },
                );
            } catch {
                /* salesAPI zincir başarısız olabilir */
            }

            const notesArg = queryMock.mock.calls[0][1][11];
            expect(String(notesArg)).toContain('rex_appt:apt-1');
            expect(String(notesArg)).toContain('sale_group:apt-apt-1');
            expect(String(notesArg)).toContain('deposit:1');
        });

        it('opts verilmezse eski davranış korunur (notes metadata eklenmez)', async () => {
            queryMock.mockResolvedValueOnce(ok([{ id: 'beauty-sale-3' }]));

            try {
                await beautyService.createSale(
                    {
                        customer_id: 'cust-9',
                        customer_name: 'Müşteri',
                        subtotal: 50,
                        discount: 0,
                        tax: 0,
                        total: 50,
                        payment_method: 'cash',
                        notes: 'Sadece not',
                    } as any,
                    [],
                );
            } catch {
                /* salesAPI zincir başarısız olabilir */
            }

            const notesArg = queryMock.mock.calls[0][1][11];
            expect(String(notesArg)).not.toContain('rex_appt:');
            expect(String(notesArg)).not.toContain('deposit:1');
            expect(String(notesArg)).toBe('Sadece not');
        });
    });
});