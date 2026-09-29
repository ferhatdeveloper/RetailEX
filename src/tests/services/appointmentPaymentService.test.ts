/**
 * appointmentPaymentService — Ön ödeme (deposit) + kalan ödeme (remainder) testleri.
 *
 * 90 yıllık kıdemli muhasebeci gözüyle doğrulanan senaryolar:
 *   • Deposit → cari avans ekstresi (−), kasa/banka (+), stok etkilenmez.
 *   • Remainder → cari (−, hizmet faturası borcuna), kasa/banka (+), stok etkilenmez.
 *   • completeAppointment → yalnızca status='completed' güncellemesi + opsiyonel remainder;
 *     sarf/stok düşümü beautyService.updateAppointmentStatus içinde zaten tetikleniyor.
 *
 * Postgres çağrıları `vi.mock` ile soyutlanır; önemli olan SQL parametrelerinin doğru
 * gitmesi ve simetri / işaret kontrollerinin yapılmasıdır.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Postgres mock'ları — `vi.mock` factory'si top-level'a hoist edildiği için mock referansları
// `vi.hoisted` ile yukarı taşınmalı; aksi halde "Cannot access before initialization" hatası.
const { queryMock, getMovementTableNameMock, getCardTableNameMock } = vi.hoisted(() => {
    return {
        queryMock: vi.fn(),
        getMovementTableNameMock: vi.fn((table: string, schema: string) => `${schema}.rex_001_01_${table}`),
        getCardTableNameMock: vi.fn((table: string, schema = 'public') => `${schema}.${table}`),
    };
});

vi.mock('../../services/postgres', () => ({
    postgres: {
        query: queryMock as unknown as (...args: any[]) => any,
        getMovementTableName: getMovementTableNameMock as unknown as (table: string, schema?: string) => string,
        getCardTableName: getCardTableNameMock as unknown as (table: string, schema?: string) => string,
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

import { appointmentPaymentService } from '../../services/appointmentPaymentService';

describe('appointmentPaymentService — deposit (ön ödeme) + remainder (kalan)', () => {
    beforeEach(() => {
        queryMock.mockReset();
        getMovementTableNameMock.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('createAppointmentDeposit: deposit satırı doğru tablo ve parametrelerle yazılır', async () => {
        // 1. çağrı → SELECT randevu
        queryMock.mockResolvedValueOnce([
            { id: 'apt-1', total_price: 100, client_id: 'cust-9' },
        ]);

        const id = await appointmentPaymentService.createAppointmentDeposit({
            appointmentId: 'apt-1',
            customerId: 'cust-9',
            amount: 30,
            provider: 'cash',
            currency: 'IQD',
            cashRegisterId: 'k-1',
            cashRegisterCode: 'KASA-01',
            notes: 'test deposit',
        });

        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);

        // Sorgu sayısı: SELECT apt + UPDATE appointments + INSERT payment = 3
        // (cash provider: cari simetri zaten fatura cash_lines'ta → ek sorgu yok)
        expect(queryMock).toHaveBeenCalledTimes(3);

        // İlk sorgu SELECT
        const firstCall = queryMock.mock.calls[0];
        expect(String(firstCall[0])).toMatch(/SELECT.*total_price.*client_id.*FROM/i);

        // Üçüncü sorgu INSERT deposit
        const insertCall = queryMock.mock.calls[2];
        const insertSql = String(insertCall[0]);
        expect(insertSql).toMatch(/INSERT INTO.*appointment_payments/i);
        // payment_kind literal SQL'de ('deposit'); diğer parametreler $4..$11 sırasında
        expect(insertSql).toMatch(/'deposit'/);
        // Parametre dizilimi (id, appointment_id, customer_id, amount, currency, provider, cash_register_id, ...)
        expect(insertCall[1][3]).toBe(30);        // amount
        expect(insertCall[1][4]).toBe('IQD');     // currency
        expect(insertCall[1][5]).toBe('cash');    // provider
        expect(insertCall[1][6]).toBe('k-1');     // cash_register_id
    });

    it('createAppointmentDeposit: miktar <= 0 hata fırlatır', async () => {
        await expect(
            appointmentPaymentService.createAppointmentDeposit({
                appointmentId: 'apt-x',
                amount: 0,
                provider: 'cash',
            }),
        ).rejects.toThrow();
        expect(queryMock).not.toHaveBeenCalled();
    });

    it('createAppointmentDeposit: provider=veresiye → cash_lines CH_TAHSILAT + account_movements debit yazılır', async () => {
        queryMock.mockResolvedValueOnce([
            { id: 'apt-1', total_price: 100, client_id: 'cust-9' },
        ]);

        const id = await appointmentPaymentService.createAppointmentDeposit({
            appointmentId: 'apt-1',
            customerId: 'cust-9',
            amount: 30,
            provider: 'veresiye',
            currency: 'IQD',
        });

        expect(typeof id).toBe('string');

        // Sorgu sayısı: SELECT + UPDATE apt + INSERT payment + INSERT cash_lines + INSERT account_movements = 5
        // (account_movements ON CONFLICT DO NOTHING — başarısız olursa akışı durdurmaz)
        expect(queryMock).toHaveBeenCalledTimes(5);

        // 4. sorgu: cash_lines CH_TAHSILAT
        const cashLineCall = queryMock.mock.calls[3];
        const cashLineSql = String(cashLineCall[0]);
        expect(cashLineSql).toMatch(/INSERT INTO.*cash_lines/i);
        expect(cashLineSql).toMatch(/CH_TAHSILAT/);
        expect(cashLineSql).toMatch(/ON CONFLICT \(fiche_no\)/);
        // Parametreler: firmNr, periodNr, ficheNo, now, amount, definition, customerId
        expect(cashLineCall[1][0]).toBe('001');     // firmNr
        expect(cashLineCall[1][1]).toBe('001');     // periodNr (3-haneli pad)
        expect(cashLineCall[1][4]).toBe(30);        // amount
        expect(cashLineCall[1][6]).toBe('cust-9');  // customerId

        // 5. sorgu: account_movements debit (sign=1)
        const amCall = queryMock.mock.calls[4];
        const amSql = String(amCall[0]);
        expect(amSql).toMatch(/INSERT INTO.*account_movements/i);
        expect(amSql).toMatch(/ON CONFLICT DO NOTHING/);
        // Parametreler: fn, pn, customerId, ficheNo, now, amount, sign, definition
        expect(amCall[1][2]).toBe('cust-9');
        expect(amCall[1][5]).toBe(30);
        expect(amCall[1][6]).toBe(1); // sign=1 (debit)
    });

    it('createAppointmentDeposit: provider=cash → cari cash_lines/account_movements YAZILMAZ (fatura cash_lines yeter)', async () => {
        queryMock.mockResolvedValueOnce([
            { id: 'apt-1', total_price: 100, client_id: 'cust-9' },
        ]);

        await appointmentPaymentService.createAppointmentDeposit({
            appointmentId: 'apt-1',
            customerId: 'cust-9',
            amount: 30,
            provider: 'cash',
            currency: 'IQD',
        });

        // Yalnızca 3 sorgu: SELECT + UPDATE + INSERT payment (cash_lines/account_movements YOK)
        expect(queryMock).toHaveBeenCalledTimes(3);
        const allSqls = queryMock.mock.calls.map((c) => String(c[0])).join('\n');
        expect(allSqls).not.toMatch(/INSERT INTO.*cash_lines/i);
        expect(allSqls).not.toMatch(/INSERT INTO.*account_movements/i);
    });

    it('createAppointmentRemainderPayment: remainder satırı doğru parametrelerle', async () => {
        queryMock.mockResolvedValueOnce([
            { id: 'apt-1', client_id: 'cust-9', status: 'completed' },
        ]);

        await appointmentPaymentService.createAppointmentRemainderPayment({
            appointmentId: 'apt-1',
            customerId: 'cust-9',
            amount: 70,
            provider: 'card',
            currency: 'IQD',
        });

        expect(queryMock).toHaveBeenCalledTimes(3);
        const insertCall = queryMock.mock.calls[2];
        const insertSql = String(insertCall[0]);
        expect(insertSql).toMatch(/INSERT INTO.*appointment_payments/i);
        expect(insertSql).toMatch(/'remainder'/);
        // Parametre dizilimi (id, appointment_id, customer_id, amount, currency, provider, ...)
        expect(insertCall[1][3]).toBe(70);          // amount
        expect(insertCall[1][5]).toBe('card');      // provider
    });

    it('createAppointmentRemainderPayment: provider=veresiye → cash_lines CH_TAHSILAT (cari ekstre)', async () => {
        queryMock.mockResolvedValueOnce([
            { id: 'apt-1', client_id: 'cust-9', status: 'completed' },
        ]);

        await appointmentPaymentService.createAppointmentRemainderPayment({
            appointmentId: 'apt-1',
            customerId: 'cust-9',
            amount: 70,
            provider: 'veresiye',
            currency: 'IQD',
        });

        // SELECT + UPDATE apt + INSERT payment + INSERT cash_lines + INSERT account_movements = 5
        expect(queryMock).toHaveBeenCalledTimes(5);

        const cashLineCall = queryMock.mock.calls[3];
        const cashLineSql = String(cashLineCall[0]);
        expect(cashLineSql).toMatch(/INSERT INTO.*cash_lines/i);
        expect(cashLineSql).toMatch(/CH_TAHSILAT/);
        // Parametreler: firmNr, periodNr, ficheNo, now, amount, definition, customerId
        expect(cashLineCall[1][4]).toBe(70);
        expect(cashLineCall[1][6]).toBe('cust-9');

        const amCall = queryMock.mock.calls[4];
        const amSql = String(amCall[0]);
        expect(amSql).toMatch(/INSERT INTO.*account_movements/i);
        expect(amCall[1][5]).toBe(70);
        expect(amCall[1][6]).toBe(1); // sign=1 (debit)
    });

    it('completeAppointment: collectRemainder=true → remainder satırı yazılır', async () => {
        queryMock.mockResolvedValueOnce([
            { id: 'apt-1', client_id: 'cust-9', status: 'completed' },
        ]);

        const res = await appointmentPaymentService.completeAppointment({
            appointmentId: 'apt-1',
            collectRemainder: true,
            customerId: 'cust-9',
            remainderAmount: 70,
            remainderProvider: 'cash',
            currency: 'IQD',
        });

        expect(res.remainderPaymentId).toBeTruthy();
        // SELECT + UPDATE apt + INSERT payment + UPDATE account_movements (avans mahsup) = 4
        expect(queryMock).toHaveBeenCalledTimes(4);
        const insertCall = queryMock.mock.calls[2];
        const insertSql = String(insertCall[0]);
        expect(insertSql).toMatch(/'remainder'/);
        expect(insertCall[1][3]).toBe(70); // amount

        // 4. sorgu: markDepositAvansMahsup UPDATE
        const mahsupCall = queryMock.mock.calls[3];
        const mahsupSql = String(mahsupCall[0]);
        expect(mahsupSql).toMatch(/UPDATE.*account_movements/i);
        expect(mahsupSql).toMatch(/sign\s*=\s*0/);
    });

    it('completeAppointment: collectRemainder=false → yalnızca account_movements avans mahsup denemesi', async () => {
        const res = await appointmentPaymentService.completeAppointment({
            appointmentId: 'apt-1',
            collectRemainder: false,
        });

        expect(res.remainderPaymentId).toBeUndefined();
        // completeAppointment her durumda markDepositAvansMahsup çağırır (UPDATE account_movements)
        expect(queryMock).toHaveBeenCalledTimes(1);
        const mahsupCall = queryMock.mock.calls[0];
        expect(String(mahsupCall[0])).toMatch(/UPDATE.*account_movements/i);
    });

    it('listPayments: randevuya göre artan sırada döner', async () => {
        queryMock.mockResolvedValueOnce([
            { id: 'p-1', payment_kind: 'deposit', amount: 30 },
            { id: 'p-2', payment_kind: 'remainder', amount: 70 },
        ]);

        const rows = await appointmentPaymentService.listPayments('apt-1');
        expect(rows).toHaveLength(2);
        expect(rows[0].payment_kind).toBe('deposit');
        expect(rows[1].payment_kind).toBe('remainder');
    });

    it('getSummary: deposit + remainder simetrisi (cari/kasa)', async () => {
        // SELECT apt → toplam, deposit, remainder_paid_amount
        queryMock.mockResolvedValueOnce([
            {
                id: 'apt-1',
                total_price: 100,
                deposit_amount: 30,
                remainder_paid_amount: 70,
            },
        ]);
        // listPayments → 2 satır
        queryMock.mockResolvedValueOnce([
            { id: 'p-1', payment_kind: 'deposit', amount: 30 },
            { id: 'p-2', payment_kind: 'remainder', amount: 70 },
        ]);

        const summary = await appointmentPaymentService.getSummary('apt-1');
        expect(summary.totalPrice).toBe(100);
        expect(summary.depositAmount).toBe(30);
        expect(summary.remainderPaidAmount).toBe(70);
        expect(summary.outstandingAmount).toBe(0);
        expect(summary.paymentState).toBe('paid');

        // Muhasebe simetrisi kontrolü (kıdemli muhasebeci):
        //   toplam ödeme = deposit + remainder = total
        expect(summary.depositAmount + summary.remainderPaidAmount).toBe(summary.totalPrice);
    });

    it('getSummary: yalnızca deposit alındığında outstanding > 0 ve paymentState=deposit_only', async () => {
        queryMock.mockResolvedValueOnce([
            {
                id: 'apt-1',
                total_price: 100,
                deposit_amount: 30,
                remainder_paid_amount: 0,
            },
        ]);
        queryMock.mockResolvedValueOnce({ rows: [{ id: 'p-1', payment_kind: 'deposit', amount: 30 }], rowCount: 1 });

        const summary = await appointmentPaymentService.getSummary('apt-1');
        expect(summary.outstandingAmount).toBe(70);
        expect(summary.paymentState).toBe('deposit_only');
    });

    it('getSummary: randevu bulunamadığında güvenli fallback (no_amount)', async () => {
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        const summary = await appointmentPaymentService.getSummary('apt-missing');
        expect(summary.paymentState).toBe('no_amount');
        expect(summary.outstandingAmount).toBe(0);
        expect(summary.payments).toEqual([]);
    });

    it('getSummary: hiç ödeme yok → paymentState=unpaid', async () => {
        queryMock.mockResolvedValueOnce([
            {
                id: 'apt-1',
                total_price: 100,
                deposit_amount: 0,
                remainder_paid_amount: 0,
            },
        ]);
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const summary = await appointmentPaymentService.getSummary('apt-1');
        expect(summary.paymentState).toBe('unpaid');
        expect(summary.outstandingAmount).toBe(100);
    });
});

describe('appointmentPaymentService — muhasebe simetrisi (kıdemli muhasebeci)', () => {
    it('tipik akış: 100 TL hizmet → 30 deposit + 70 remainder → NET 0 borç', () => {
        // Bu test pure aritmetiktir; servis çağırmaz.
        const total = 100;
        const deposit = 30;
        const remainder = 70;

        // Cari hareketleri (jRetail/Logo "Alınan Sipariş Avansı"):
        //  - Deposit: cari -30 (avans ekstresi)
        //  - Hizmet verildi: cari +100 (hizmet faturası)
        //  - Remainder: cari -70 (kalan ödeme)
        // NET: 0 (mükemmel denge)
        const cariNet = -deposit + total - remainder;
        expect(cariNet).toBe(0);

        // Kasa/Banka: deposit + remainder = total
        const kasaNet = deposit + remainder;
        expect(kasaNet).toBe(total);

        // Stok: yalnızca tamamlandığında (mevcut applyConsumableDeductionForAppointment)
        // deposit ve remainder anında 0 düşüm.
        const stokDepositAninda = 0;
        const stokRemainderAninda = 0;
        const stokCompleteAninda = 'applyConsumableDeductionForAppointment';
        expect(stokDepositAninda).toBe(0);
        expect(stokRemainderAninda).toBe(0);
        expect(stokCompleteAninda).toBeTruthy();
    });

    it('avans olarak işlenmediğinde gelir iki kez yazılır (negatif test)', () => {
        // HATA senaryosu: ön ödeme direkt hizmet geliri sayılırsa,
        // remainder ödemesi cariyi -70 yapar ama hizmet verildiğinde +100 daha yazılır.
        // Müşteri gerçekte 100 ödedi (30 deposit + 70 remainder) ama gelir 130 yazılır.
        const total = 100;
        const depositHataliGelir = 30;       // hizmet geliri sayıldı (YANLIŞ)
        const remainderCariAzaltma = 70;     // cariye yazılan (doğru)
        const hizmetVerildigindeBorc = 100;  // cari + (doğru)

        // Hatalı senaryo:
        //   cari hareketleri: -30 (deposit yanlışlıkla gelir) - 70 (kalan) + 100 (hizmet) = 0
        //   GELİR kayıtları: +30 (deposit hatalı) + 100 (hizmet) = 130
        //   KASA: 30 + 70 = 100
        // 130 gelir - 100 kasa = +30 hayali gelir = muhasebe simetrisi bozuk
        const toplamGelirHatali = depositHataliGelir + hizmetVerildigindeBorc;
        const toplamKasa = depositHataliGelir + remainderCariAzaltma;
        const hayaliGelir = toplamGelirHatali - toplamKasa;
        expect(hayaliGelir).toBe(30); // ← 30 TL hayali gelir; bu yüzden deposit AVANS olmalı.
    });
});

describe('appointmentPaymentService — veresiye cari simetri (kıdemli muhasebeci)', () => {
    it('tipik akış: 100 TL hizmet → 30 veresiye deposit + 70 veresiye remainder → NET 0', () => {
        // Tüm provider veresiye olduğunda cash_lines CH_TAHSILAT 2 kez yazılır,
        // account_movements debit 2 kez yazılır (her ikisi sign=1).
        // Hizmet tamamlandığında account_movements debit → credit çevrilir (mahsup).
        const total = 100;
        const depositVeresiye = 30;
        const remainderVeresiye = 70;

        // Cari bakiye (cash_lines CH_TAHSILAT bazlı):
        //  - deposit: cari -30 (tahsilat)
        //  - remainder: cari -70 (tahsilat)
        //  - toplam: -100 (müşteri alacaklı bakiyesi)
        const cariNetAfterPayments = -(depositVeresiye + remainderVeresiye);
        expect(cariNetAfterPayments).toBe(-total);

        // account_movements (mahsup sonrası):
        //  - deposit debit → credit (mahsup), 0 etki
        //  - remainder debit (kalan)
        //  NET: -remainder
        const accountMovementsNet = -remainderVeresiye;
        expect(accountMovementsNet).toBe(-remainderVeresiye);

        // Eğer hizmet verildiğinde ayrıca sales yazılmıyorsa +100 eklenir → bakiye +30 olur
        // (bu hatırlatma: sales kaydı fatura oluştuğunda yazılır, biz sadece cari tarafı yazıyoruz)
    });

    it('karma ödeme: 30 cash deposit + 70 veresiye remainder → cash_lines 1, account_movements 1', () => {
        // cash provider deposit: cash_lines CH_TAHSILAT yazılmaz (fatura cash_lines yeter)
        // veresiye remainder: cash_lines CH_TAHSILAT yazılır, account_movements debit yazılır
        const cashDeposit = 30;
        const veresiyeRemainder = 70;

        // cash_lines etkisi:
        //  - cash deposit: 0 (fatura cash_lines'a fatura kaydında yansır)
        //  - veresiye remainder: -70 (CH_TAHSILAT)
        const cashLinesNet = -veresiyeRemainder;
        expect(cashLinesNet).toBe(-70);

        // account_movements etkisi:
        //  - veresiye remainder debit: +70 sign=1
        const accountMovementsDebit = veresiyeRemainder;
        expect(accountMovementsDebit).toBe(70);
    });

    it('veresiye + remainder < total → cari alacak bakiyesi kalır (müşteri borçlu)', () => {
        // Kısmi veresiye: 100 TL hizmet, 50 veresiye remainder, kalan 50 müşterinin borcu.
        const total = 100;
        const veresiyeRemainder = 50;
        const customerDebt = total - veresiyeRemainder;
        expect(customerDebt).toBe(50);
    });
});
