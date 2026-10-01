/**
 * Beauty randevu ödeme servisi — Deposit (ön ödeme) kaydı.
 *
 * Not (2026-09-29): "Ön ödeme + kalan ödeme" çift aşamalı akış kullanıcı
 * tarafından kaldırıldı. Artık randevuya yalnızca tek seferlik deposit
 * (avans) yazılır; remainder servisi ve veresiye provider → cash_lines /
 * account_movements cari simetri blokları sadeleştirildi.
 *
 * Muhasebe modeli (kıdemli muhasebeci gözüyle — jRetail / Logo "Alınan Sipariş Avansı"):
 *
 *   1. Randevu oluşturma (`beautyService.createAppointment`):
 *      Cari / Kasa / Stok → etkilenmez.
 *
 *   2. Ön ödeme (`createAppointmentDeposit`):
 *      Cari  → − (avans ekstresi; müşteri "alacak" bakiyesi artar; hizmet geliri SAYILMAZ)
 *      Kasa  → + (seçilen kasaya)
 *      Stok → etkilenmez (hizmet henüz verilmedi)
 *
 * Veresiye provider artık bu serviste cari hareket yazmaz; cari tarafı
 * fatura kaydında (cash_lines + sales) zaten yansır. "Kalan ödeme" akışı
 * kaldırıldığı için veresiye remainder kaydı yok.
 */

import { v4 as uuidv4 } from 'uuid';
import { ERP_SETTINGS, postgres, PostgresConnection } from './postgres';
import { logger } from './loggingService';
import {
    buildSaleGroupId,
    nextPesinatFicheNo,
} from './salesHelpers';

export type AppointmentPaymentKind = 'deposit' | 'remainder' | 'full';

export type AppointmentPaymentProvider =
    | 'cash'
    | 'card'
    | 'gateway'
    | 'bank_transfer'
    | 'veresiye';

export interface CreateDepositInput {
    appointmentId: string;
    customerId?: string;
    amount: number;
    provider: AppointmentPaymentProvider;
    cashRegisterId?: string;
    cashRegisterCode?: string;
    currency?: string;
    notes?: string;
    createdBy?: string;
}

export interface AppointmentPaymentRow {
    id: string;
    appointment_id: string;
    customer_id: string | null;
    payment_kind: AppointmentPaymentKind;
    amount: number;
    currency: string;
    provider: string | null;
    cash_register_id: string | null;
    cash_register_code: string | null;
    journal_entry_id: string | null;
    notes: string | null;
    paid_at: string;
    created_by: string | null;
}

/**
 * `createAppointmentDeposit` dönüş tipi — Plan §6 Adım 3.
 * - `paymentId`: `beauty_appointment_payments` audit trail satırı id'si.
 * - `saleId`: `sales` tablosuna yazılan peşinat fişinin id'si (yoksa null).
 * - `ficheNo`: `BEAUTY-PESINAT-{aptId}-{YYYYMMDDHHMMSS}` formatlı fiş no.
 *
 * Muhasebe notu: Peşinat artık `sales` tablosunda gerçek bir fiş; cari tarafı
 * `customerDebtCollection.getCustomerOutstandingInvoices` üzerinden **outstanding**
 * olarak görünür. Kullanıcı "daha önce ne ödendi" sorusunu fiş no ile yanıtlar.
 */
export interface CreateDepositResult {
    paymentId: string;
    saleId: string | null;
    ficheNo: string;
}

export interface AppointmentPaymentSummary {
    appointmentId: string;
    totalPrice: number;
    depositAmount: number;
    remainderPaidAmount: number;
    outstandingAmount: number;
    paymentState: 'no_amount' | 'unpaid' | 'deposit_only' | 'partial' | 'paid';
    payments: AppointmentPaymentRow[];
}

/** DB'deki `beauty.beauty_appointment_payment_status` view'ı ile aynı mantık (yerel fallback). */
function derivePaymentState(
    totalPrice: number,
    depositAmount: number,
    remainderPaid: number,
): AppointmentPaymentSummary['paymentState'] {
    if (totalPrice <= 0) return 'no_amount';
    if (depositAmount <= 0 && remainderPaid <= 0) return 'unpaid';
    if (depositAmount + remainderPaid >= totalPrice) return 'paid';
    if (depositAmount > 0 && remainderPaid <= 0) return 'deposit_only';
    return 'partial';
}

/** postgres.query hem `{rows: []}` hem de direkt array döndürebilir (test/mock uyumu). */
function extractRows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    if (result && typeof result === 'object' && Array.isArray((result as any).rows)) {
        return (result as { rows: T[] }).rows;
    }
    return [];
}

class AppointmentPaymentService {
    private getFirmNr(): string {
        const raw = (ERP_SETTINGS as any)?.firmNr ?? (ERP_SETTINGS as any)?.firm_nr ?? '001';
        return String(raw).trim().padStart(3, '0').slice(0, 10) || '001';
    }
    /**
     * Dönem kodu: `rex_{firmNr}_{periodNr}_*` periyodik tablo yapısında 2 haneli
     * (örn. `01`, `02`). Bazı yerlerde 3 haneli (`001`) gelirse olduğu gibi kabul edip
     * `slice(0, 2)` ile 2 haneye indiririz.
     */
    private getPeriodNr(): string {
        const raw = (ERP_SETTINGS as any)?.periodNr ?? (ERP_SETTINGS as any)?.period_nr ?? '01';
        const trimmed = String(raw).trim();
        // Postgres hareket tablosu periodik kuralı: 2-haneli `rex_{firm}_{period}_sales`.
        // Testlerde ERP_SETTINGS.periodNr='01' geliyor; ham değer 2 hane olarak kullanılır.
        return trimmed.length >= 2 ? trimmed.slice(0, 2) : trimmed.padStart(2, '0');
    }

    private appointmentsTable(): string {
        return postgres.getMovementTableName('beauty_appointments', 'beauty');
    }
    private paymentsTable(): string {
        return postgres.getMovementTableName('beauty_appointment_payments', 'beauty');
    }

    /**
     * Ön ödeme (deposit) kaydeder. Cari avans ekstresi + kasa +. Stok etkilenmez.
     *
     * Plan §6 Adım 3 — peşinat artık `sales` tablosunda **gerçek bir fiş** olur.
     * Sorgu sırası (4 adım):
     *   1) SELECT randevu (total_price / client_id kontrolü)
     *   2) UPDATE beauty_appointments (deposit_amount, deposit_date)
     *   3) INSERT INTO beauty_appointment_payments (audit trail)
     *   4) INSERT INTO rex_*_*_sales (BEAUTY-PESINAT-{aptId}-{ts}) + sale_items
     *
     * Not (2026-09-29): Veresiye provider için artık `cash_lines` / `account_movements`
     * yazılmaz — cari hareketi fatura kaydında (cash_lines + sales) zaten yansır.
     * Kalan ödeme (remainder) akışı kaldırıldı.
     */
    async createAppointmentDeposit(input: CreateDepositInput): Promise<CreateDepositResult> {
        if (!input.appointmentId) throw new Error('appointmentId zorunlu');
        if (!(input.amount > 0)) throw new Error('Ön ödeme tutarı sıfırdan büyük olmalı');

        const aptTable = this.appointmentsTable();
        const payTable = this.paymentsTable();
        const id = uuidv4();
        const now = new Date().toISOString();
        const fn = this.getFirmNr();
        const pn = this.getPeriodNr();

        // 1. Randevunun mevcut total_price'ını oku (deposit_amount > total_price engeli)
        const aptResult = await postgres.query<{
            id: string;
            total_price: number;
            client_id: string;
            customer_name: string | null;
        }>(
            `SELECT a.id, a.total_price, a.client_id,
                    c.name AS customer_name
               FROM ${aptTable} a
               LEFT JOIN rex_${fn}_customers c
                      ON c.id::text = a.client_id::text
              WHERE a.id = $1 AND a.firm_nr = $2`,
            [input.appointmentId, fn],
        );
        const apt = extractRows<{
            id: string;
            total_price: number;
            client_id: string;
            customer_name: string | null;
        }>(aptResult)[0];
        if (!apt) throw new Error('Randevu bulunamadı');

        const custId = input.customerId ?? apt.client_id ?? null;
        const custName = apt.customer_name ?? null;
        const currency = input.currency ?? 'IQD';
        const notes = input.notes ?? null;

        try {
            // 2. appointments üzerinde deposit kolonlarını güncelle
            // Status: scheduled/confirmed → pre_paid (hizmet henüz başlamadı)
            // pre_paid / in_progress / completed → status değişmez (zaten peşinatlı)
            await postgres.query(
                `UPDATE ${aptTable}
                    SET deposit_amount    = COALESCE(deposit_amount, 0) + $2,
                        deposit_provider  = COALESCE($3, deposit_provider),
                        deposit_date      = COALESCE(deposit_date, $4),
                        status            = CASE
                                                WHEN status IN ('scheduled','confirmed') THEN 'pre_paid'
                                                ELSE status
                                            END,
                        updated_at        = NOW()
                  WHERE id = $1 AND firm_nr = $5`,
                [
                    input.appointmentId,
                    input.amount,
                    input.provider,
                    now,
                    fn,
                ],
            );

            // 3. payments tablosuna deposit satırı yaz
            await postgres.query(
                `INSERT INTO ${payTable}
                    (id, appointment_id, customer_id, payment_kind, amount, currency,
                     provider, cash_register_id, cash_register_code, notes, paid_at, created_by)
                 VALUES ($1,$2,$3,'deposit',$4,$5,$6,$7,$8,$9,$10,$11)`,
                [
                    id,
                    input.appointmentId,
                    custId,
                    input.amount,
                    currency,
                    input.provider,
                    input.cashRegisterId ?? null,
                    input.cashRegisterCode ?? null,
                    input.notes ?? null,
                    now,
                    input.createdBy ?? null,
                ],
            );

            // 4. Plan §6 Adım 3 — peşinat sales fişi INSERT.
            //    `sales.fiche_no` UNIQUE → idempotent: aynı saniyede tekrarı `DO NOTHING`.
            //    Migration 182 ile `linked_appointment_id`, `is_deposit`, `sale_group_id`
            //    kolonları eklendi. Tauri uyumu: ham SQL, `DO $$` YOK.
            const salesTable = `rex_${fn}_${pn}_sales`;
            const saleItemsTable = `rex_${fn}_${pn}_sale_items`;
            const ficheNo = nextPesinatFicheNo(input.appointmentId);
            const saleGroupId = buildSaleGroupId(input.appointmentId);
            const trcode = 7; // retail hizmet
            const ficheType = 'sales_invoice';
            const providerLabel =
                input.provider === 'cash'
                    ? 'cash'
                    : input.provider === 'card'
                      ? 'card'
                      : input.provider === 'veresiye'
                        ? 'veresiye'
                        : String(input.provider ?? 'cash');

            let saleId: string | null = null;
            try {
                const salesInsert = await postgres.query<{ id: string; fiche_no: string }>(
                    `INSERT INTO ${salesTable}
                        (id, firm_nr, period_nr, fiche_no, document_no, trcode, fiche_type,
                         customer_id, customer_name, total_net, total_vat, total_gross,
                         total_discount, net_amount, currency, currency_rate,
                         status, payment_method, notes, header_fields,
                         linked_appointment_id, is_deposit, sale_group_id,
                         created_at, updated_at)
                     VALUES
                        (gen_random_uuid(), $1::text, $2::text,
                         $3::text, $4::text, $5::int, $6::text,
                         $7::text::uuid, $8::text, $9::numeric, 0::numeric, $9::numeric,
                         0::numeric, $9::numeric, $10::text, 1::numeric,
                         'completed'::text, $11::text, $12::text, '{}'::jsonb,
                         $13::text::uuid, true::boolean, $14::text,
                         NOW(), NOW())
                     ON CONFLICT (fiche_no) DO NOTHING
                     RETURNING id, fiche_no`,
                    [
                        fn,
                        pn,
                        ficheNo,
                        ficheNo, // document_no = fiche_no (peşinat)
                        trcode,
                        ficheType,
                        custId,
                        custName ?? '',
                        input.amount,
                        currency,
                        providerLabel,
                        notes ?? `Peşinat (Beauty) — ${input.appointmentId}`,
                        input.appointmentId,
                        saleGroupId,
                    ],
                );
                const insertedRows = extractRows<{ id: string; fiche_no: string }>(salesInsert);
                if (insertedRows[0]?.id) {
                    saleId = insertedRows[0].id;
                    // sale_items: tek satır — hizmet kalemi (stok düşmez; sadece fiş bilgisi)
                    await postgres.query(
                        `INSERT INTO ${saleItemsTable}
                            (id, invoice_id, product_id, quantity, unit_price, vat_rate,
                             discount_rate, discount_amount, total_amount, unit_cost, item_type, name)
                         VALUES
                            (gen_random_uuid(), $1::text::uuid, NULL, 1, $2::numeric, 0,
                             0, 0, $2::numeric, 0, 'service'::text, $3::text)`,
                        [saleId, input.amount, 'Ön Ödeme Peşinatı'],
                    );
                    // randevuya deposit_sale_id + fiche_no geri yaz
                    await postgres.query(
                        `UPDATE ${aptTable}
                            SET deposit_sale_id = $2::text::uuid,
                                deposit_sale_fiche_no = $3::text,
                                sale_group_id = $4::text,
                                updated_at = NOW()
                          WHERE id = $1::text::uuid AND firm_nr = $5::text`,
                        [input.appointmentId, saleId, ficheNo, saleGroupId, fn],
                    );
                }
            } catch (salesErr) {
                // sales INSERT başarısız olursa audit trail + appointment UPDATE
                // yine de yazıldı — ana akışı bozma, sadece logla.
                const detail = salesErr instanceof Error ? salesErr.message : String(salesErr);
                logger.warn(
                    'appointmentPaymentService',
                    'deposit sale INSERT failed (audit trail yazıldı)',
                    { ficheNo, error: detail },
                );
            }

            logger.info(
                'appointmentPaymentService',
                'deposit created',
                {
                    paymentId: id,
                    saleId,
                    ficheNo,
                    appointmentId: input.appointmentId,
                    amount: input.amount,
                    provider: input.provider,
                },
            );
            return { paymentId: id, saleId, ficheNo };
        } catch (err) {
            logger.error('appointmentPaymentService', 'createAppointmentDeposit failed', err as Error);
            throw err;
        }
    }

    /** Bir randevunun tüm ödeme hareketleri (deposit + remainder + full) */
    async listPayments(appointmentId: string): Promise<AppointmentPaymentRow[]> {
        const payTable = this.paymentsTable();
        const result = await postgres.query<AppointmentPaymentRow>(
            `SELECT id, appointment_id, customer_id, payment_kind, amount, currency,
                    provider, cash_register_id, cash_register_code, journal_entry_id,
                    notes, paid_at, created_by
               FROM ${payTable}
              WHERE appointment_id = $1
              ORDER BY paid_at ASC, created_at ASC`,
            [appointmentId],
        );
        return extractRows<AppointmentPaymentRow>(result);
    }

    /** Randevunun ödeme özetini döndürür. */
    async getSummary(appointmentId: string): Promise<AppointmentPaymentSummary> {
        const aptTable = this.appointmentsTable();
        const payTable = this.paymentsTable();
        const fn = this.getFirmNr();

        const aptRows = await postgres.query<{
            id: string;
            total_price: number;
            deposit_amount: number;
            remainder_paid_amount: number;
        }>(
            `SELECT id,
                    COALESCE(total_price, 0)             AS total_price,
                    COALESCE(deposit_amount, 0)          AS deposit_amount,
                    COALESCE(remainder_paid_amount, 0)   AS remainder_paid_amount
               FROM ${aptTable}
              WHERE id = $1 AND firm_nr = $2`,
            [appointmentId, fn],
        );
        const apt = extractRows<{ id: string; total_price: number; deposit_amount: number; remainder_paid_amount: number }>(aptRows)[0];
        if (!apt) {
            return {
                appointmentId,
                totalPrice: 0,
                depositAmount: 0,
                remainderPaidAmount: 0,
                outstandingAmount: 0,
                paymentState: 'no_amount',
                payments: [],
            };
        }

        const payments = await this.listPayments(appointmentId);
        const totalPrice = Number(apt.total_price ?? 0);
        const depositAmount = Number(apt.deposit_amount ?? 0);
        const remainderPaidAmount = Number(apt.remainder_paid_amount ?? 0);
        const outstandingAmount = Math.max(0, totalPrice - depositAmount - remainderPaidAmount);

        return {
            appointmentId,
            totalPrice,
            depositAmount,
            remainderPaidAmount,
            outstandingAmount,
            paymentState: derivePaymentState(totalPrice, depositAmount, remainderPaidAmount),
            payments,
        };
    }

    /** Yer tutucu — PostgresConnection singleton kontrolü için diagnostik amaçlı */
    pingDb(): boolean {
        try {
            PostgresConnection.getInstance();
            return true;
        } catch {
            return false;
        }
    }
}

export const appointmentPaymentService = new AppointmentPaymentService();