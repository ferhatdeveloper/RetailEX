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
    private getPeriodNr(): string {
        const raw = (ERP_SETTINGS as any)?.periodNr ?? (ERP_SETTINGS as any)?.period_nr ?? '01';
        return String(raw).trim().padStart(3, '0').slice(0, 10) || '01';
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
     * Not (2026-09-29): Veresiye provider için artık `cash_lines` / `account_movements`
     * yazılmaz — cari hareketi fatura kaydında (cash_lines + sales) zaten yansır.
     * Kalan ödeme (remainder) akışı kaldırıldı.
     */
    async createAppointmentDeposit(input: CreateDepositInput): Promise<string> {
        if (!input.appointmentId) throw new Error('appointmentId zorunlu');
        if (!(input.amount > 0)) throw new Error('Ön ödeme tutarı sıfırdan büyük olmalı');

        const aptTable = this.appointmentsTable();
        const payTable = this.paymentsTable();
        const id = uuidv4();
        const now = new Date().toISOString();
        const fn = this.getFirmNr();

        // 1. Randevunun mevcut total_price'ını oku (deposit_amount > total_price engeli)
        const aptResult = await postgres.query<{ id: string; total_price: number; client_id: string }>(
            `SELECT id, total_price, client_id FROM ${aptTable}
              WHERE id = $1 AND firm_nr = $2`,
            [input.appointmentId, fn],
        );
        const apt = extractRows<{ id: string; total_price: number; client_id: string }>(aptResult)[0];
        if (!apt) throw new Error('Randevu bulunamadı');

        const custId = input.customerId ?? apt.client_id ?? null;
        const currency = input.currency ?? 'IQD';

        try {
            // 2. appointments üzerinde deposit kolonlarını güncelle
            await postgres.query(
                `UPDATE ${aptTable}
                    SET deposit_amount    = COALESCE(deposit_amount, 0) + $2,
                        deposit_provider  = COALESCE($3, deposit_provider),
                        deposit_date      = COALESCE(deposit_date, $4),
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

            logger.info(
                'appointmentPaymentService',
                'deposit created',
                { id, appointmentId: input.appointmentId, amount: input.amount, provider: input.provider },
            );
            return id;
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