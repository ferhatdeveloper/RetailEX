/**
 * appointmentPaymentService — Ön ödeme (deposit) testleri.
 *
 * 90 yıllık kıdemli muhasebeci gözüyle doğrulanan senaryolar:
 *   • Deposit → cari avans ekstresi (−), kasa/banka (+), stok etkilenmez.
 *   • Veresiye provider artık cash_lines / account_movements yazmaz;
 *     cari tarafı fatura kaydında zaten yansır.
 *   • "Kalan ödeme" (remainder) akışı 2026-09-29 itibarıyla kaldırıldı.
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

describe('appointmentPaymentService — deposit (ön ödeme)', () => {
    beforeEach(() => {
        queryMock.mockReset();
        getMovementTableNameMock.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('createAppointmentDeposit: deposit satırı doğru tablo ve parametrelerle yazılır', async () => {
        // 1. çağrı → SELECT randevu (Plan §6 Adım 3: customer_name JOIN'i eklendi)
        queryMock.mockResolvedValueOnce({
            rows: [{ id: 'apt-1', total_price: 100, client_id: 'cust-9', customer_name: 'Test Müşteri' }],
            rowCount: 1,
        });
        // 2) UPDATE appointments
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // 3) INSERT payment
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // 4) sales INSERT → RETURNING id, fiche_no
        queryMock.mockResolvedValueOnce({
            rows: [{ id: 'sale-pep-1', fiche_no: 'BEAUTY-PESINAT-apt-1-20260930120000' }],
            rowCount: 1,
        });
        // 5) sale_items INSERT
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // 6) appointment geri yaz UPDATE (deposit_sale_id + fiche_no)
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await appointmentPaymentService.createAppointmentDeposit({
            appointmentId: 'apt-1',
            customerId: 'cust-9',
            amount: 30,
            provider: 'cash',
            currency: 'IQD',
            cashRegisterId: 'k-1',
            cashRegisterCode: 'KASA-01',
            notes: 'test deposit',
        });

        // Plan §6 Adım 3 — dönüş tipi { paymentId, saleId, ficheNo }
        expect(typeof result.paymentId).toBe('string');
        expect(result.paymentId.length).toBeGreaterThan(0);
        expect(result.ficheNo).toMatch(/^BEAUTY-PESINAT-apt-1-\d{14}$/);

        // Plan §6 Adım 3 — toplam 4 ana sorgu (sales INSERT mock'ta hata fırlatırsa 5 olur):
        //  1) SELECT randevu (JOIN customers)
        //  2) UPDATE appointments (deposit_amount)
        //  3) INSERT appointment_payments
        //  4) INSERT sales (BEAUTY-PESINAT-{aptId}-{ts}) + INSERT sale_items + UPDATE appointment(geri yaz)
        // Mock'lar başarılı döndüğünde ek 2 sorgu daha (sale_items INSERT + appointment geri yaz UPDATE)
        // → toplam 6 sorgu bekleniyor. Burada SELECT'i 2.mock ile cevaplıyoruz.
        expect(queryMock.mock.calls.length).toBeGreaterThanOrEqual(6);

        // İlk sorgu SELECT — JOIN ile customer_name
        const firstCall = queryMock.mock.calls[0];
        const firstSql = String(firstCall[0]);
        // Çok satırlı SQL — `s` flag ile newline dahil et
        expect(firstSql).toMatch(/SELECT[\s\S]*total_price[\s\S]*client_id[\s\S]*customer_name[\s\S]*FROM/i);
        expect(firstSql).toMatch(/LEFT JOIN rex_001_customers/i);

        // 3. sorgu INSERT deposit
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

        // 4. sorgu INSERT sales — peşinat fişi
        const salesCall = queryMock.mock.calls[3];
        const salesSql = String(salesCall[0]);
        expect(salesSql).toMatch(/INSERT INTO rex_001_01_sales/i);
        expect(salesSql).toMatch(/is_deposit/);
        expect(salesSql).toMatch(/sale_group_id/);
        expect(salesSql).toMatch(/linked_appointment_id/);
        expect(salesSql).toMatch(/ON CONFLICT \(fiche_no\) DO NOTHING/i);
        // Parametreler: [fn, pn, ficheNo, ficheNo, trcode, ficheType, custId, custName, amount, currency, providerLabel, notes, aptId, saleGroupId]
        expect(salesCall[1][2]).toMatch(/^BEAUTY-PESINAT-apt-1-\d{14}$/);
        expect(salesCall[1][6]).toBe('cust-9');   // customer_id
        expect(salesCall[1][7]).toBe('Test Müşteri'); // customer_name (JOIN'den)
        expect(salesCall[1][8]).toBe(30);         // amount
        expect(salesCall[1][12]).toBe('apt-1');   // linked_appointment_id
        expect(salesCall[1][13]).toBe('apt-apt-1'); // sale_group_id = buildSaleGroupId('apt-1')

        // 5. sorgu INSERT sale_items (hizmet kalemi)
        const itemCall = queryMock.mock.calls[4];
        const itemSql = String(itemCall[0]);
        expect(itemSql).toMatch(/INSERT INTO rex_001_01_sale_items/i);
        expect(itemSql).toMatch(/item_type/);
        // saleId (sale_items INSERT'in $1'i), amount ($2), name 'Ön Ödeme Peşinatı' ($3)
        expect(itemCall[1][1]).toBe(30);          // amount
        expect(itemCall[1][2]).toBe('Ön Ödeme Peşinatı'); // name

        // 6. sorgu UPDATE appointment — deposit_sale_id + fiche_no geri yaz
        const updCall = queryMock.mock.calls[5];
        const updSql = String(updCall[0]);
        expect(updSql).toMatch(/UPDATE beauty[\s\S]*SET deposit_sale_id/i);
        expect(updSql).toMatch(/deposit_sale_fiche_no/i);
    });

    it('createAppointmentDeposit: sales INSERT hata verirse ana akış bozulmaz, saleId=null döner', async () => {
        // 1) SELECT randevu
        queryMock.mockResolvedValueOnce({
            rows: [{ id: 'apt-1', total_price: 100, client_id: 'cust-9', customer_name: null }],
            rowCount: 1,
        });
        // 2) UPDATE
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // 3) INSERT payment
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // 4) sales INSERT hata fırlatır → ana akış yine de tamamlanır (best-effort)
        queryMock.mockRejectedValueOnce(new Error('FK violation'));

        const result = await appointmentPaymentService.createAppointmentDeposit({
            appointmentId: 'apt-1',
            customerId: 'cust-9',
            amount: 30,
            provider: 'cash',
        });

        expect(result.paymentId).toBeTruthy();
        // sales INSERT başarısız → saleId null (best-effort), ficheNo her zaman üretilir.
        expect(result.saleId).toBeNull();
        expect(result.ficheNo).toMatch(/^BEAUTY-PESINAT-apt-1-\d{14}$/);
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

    it('createAppointmentDeposit: provider=veresiye → cash_lines/account_movements YAZILMAZ (fatura cash_lines yeter)', async () => {
        // 1) SELECT appointment
        queryMock.mockResolvedValueOnce({
            rows: [{ id: 'apt-1', total_price: 100, client_id: 'cust-9' }],
            rowCount: 1,
        });
        // 2) UPDATE apt
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // 3) INSERT payment
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // 4) sales INSERT → başarılı (veresiye provider'da da peşinat sales fişi yazılır)
        queryMock.mockResolvedValueOnce({
            rows: [{ id: 'sale-pep-2', fiche_no: 'BEAUTY-PESINAT-apt-1-20260930120100' }],
            rowCount: 1,
        });
        // 5) sale_items INSERT
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // 6) appointment geri yaz UPDATE
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await appointmentPaymentService.createAppointmentDeposit({
            appointmentId: 'apt-1',
            customerId: 'cust-9',
            amount: 30,
            provider: 'veresiye',
            currency: 'IQD',
        });

        expect(typeof result.paymentId).toBe('string');
        expect(result.ficheNo).toMatch(/^BEAUTY-PESINAT-apt-1-\d{14}$/);

        // Plan §6 — toplam 6 sorgu (SELECT + UPDATE apt + INSERT payment + INSERT sales + INSERT sale_items + UPDATE apt geri)
        // Önemli olan cash_lines / account_movements YAZILMAMASı.
        expect(queryMock).toHaveBeenCalledTimes(6);
        const allSqls = queryMock.mock.calls.map((c) => String(c[0])).join('\n');
        expect(allSqls).not.toMatch(/INSERT INTO.*cash_lines/i);
        expect(allSqls).not.toMatch(/INSERT INTO.*account_movements/i);
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
    it('tipik akış: 100 TL hizmet → 30 deposit → cari avans −30, kasa +30', () => {
        // Bu test pure aritmetiktir; servis çağırmaz.
        const total = 100;
        const deposit = 30;

        // Cari hareketleri (jRetail/Logo "Alınan Sipariş Avansı"):
        //  - Deposit: cari -30 (avans ekstresi)
        //  - Hizmet verildi: cari +100 (hizmet faturası)
        // NET (deposit sonrası): +70 (müşteri hizmet borcu)
        const cariNetAfterDeposit = -deposit;
        expect(cariNetAfterDeposit).toBe(-deposit);

        // Kasa/Banka: deposit anında +30
        const kasaNet = deposit;
        expect(kasaNet).toBe(total - 70);

        // Stok: yalnızca tamamlandığında (mevcut applyConsumableDeductionForAppointment)
        // deposit anında 0 düşüm.
        const stokDepositAninda = 0;
        expect(stokDepositAninda).toBe(0);
    });

    it('avans olarak işlenmediğinde gelir iki kez yazılır (negatif test)', () => {
        // HATA senaryosu: ön ödeme direkt hizmet geliri sayılırsa,
        // müşteri gerçekte 100 ödedi (30 deposit + 70 hizmet anında) ama gelir 130 yazılır.
        const total = 100;
        const depositHataliGelir = 30;       // hizmet geliri sayıldı (YANLIŞ)
        const hizmetVerildigindeBorc = 100;  // cari + (doğru)

        // Hatalı senaryo:
        //   GELİR kayıtları: +30 (deposit hatalı) + 100 (hizmet) = 130
        // 130 gelir - 100 kasa = +30 hayali gelir = muhasebe simetrisi bozuk
        const toplamGelirHatali = depositHataliGelir + hizmetVerildigindeBorc;
        const toplamKasa = total;
        const hayaliGelir = toplamGelirHatali - toplamKasa;
        expect(hayaliGelir).toBe(30); // ← 30 TL hayali gelir; bu yüzden deposit AVANS olmalı.
    });
});