/**
 * Beauty randevu ödeme servisi — Deposit (ön ödeme) + Remainder (kalan ödeme)
 *
 * Muhasebe modeli (kıdemli muhasebeci gözüyle — jRetail / Logo "Alınan Sipariş Avansı"):
 *
 *   1. Randevu oluşturma (`beautyService.createAppointment`):
 *      Cari / Kasa / Stok → etkilenmez.
 *
 *   2. Ön ödeme (`createAppointmentDeposit`):
 *      Cari  → − (avans ekstresi; müşteri "alacak" bakiyesi artar; hizmet geliri SAYILMAZ)
 *      Kasa  → + (seçilen kasaya)         [peşin (cash/card/gateway) provider için]
 *      Stok → etkilenmez (hizmet henüz verilmedi)
 *
 *   3. Hizmet tamamlandığında (`completeAppointment`):
 *      Cari  → + (toplam hizmet borcu; avans ile mahsup EDİLEREK net ödeme çıkar)
 *      Stok → − (mevcut `applyConsumableDeductionForAppointment` → sarf düşümü)
 *
 *   4. Kalan ödeme (`createAppointmentRemainderPayment`):
 *      Cari  → − (hizmet faturası borcuna karşılık)
 *      Kasa  → + (seçilen kasaya)         [peşin (cash/card/gateway) provider için]
 *      Stok → etkilenmez (zaten tamamlandı anında düştü)
 *
 * Veresiye (cari) provider için cari simetri iki tablo üzerinden sağlanır:
 *   • `cash_lines` (transaction_type='CH_TAHSILAT') → cari ekstre buradan okur;
 *     müşteri bakiyesi düşer (tahsilat).
 *   • `account_movements` (Logo CLFLINE uyumlu, `sign=1` debit, `sign=0` credit)
 *     → fatura/avans detayı; gelecekte ek raporlama veya Logo MSSQL senkron için.
 *
 * Tipik örnek (jRetail uyumlu):
 *   • 100 TL hizmet, 30 TL ön ödeme (cash), 70 TL kalan ödeme (veresiye)
 *   • Deposit   → cari: -30 (avans);  kasa: +30 (CH_TAHSILAT)
 *   • Complete  → cari: +100 (hizmet); kasa: 0;     stok: -ürün/sarf
 *   • Remainder → cari: -70  (kalan);  kasa: 0      [veresiye → cash_lines CH_TAHSILAT yazılmaz]
 *   • NET: cari 0 (−30 + 100 − 70), kasa +30, stok düştü. ✓
 *
 * DB şeması: `database/migrations/181_beauty_appointment_pre_payment.sql`
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

export interface CreateRemainderInput extends CreateDepositInput {}

export interface CompleteAppointmentInput {
    appointmentId: string;
    /** Hizmet tamamlandığında kalan (remainder) ödeme ayrıca alınacak mı? */
    collectRemainder?: boolean;
    customerId?: string;
    remainderAmount?: number;
    remainderProvider?: AppointmentPaymentProvider;
    cashRegisterId?: string;
    cashRegisterCode?: string;
    currency?: string;
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
    /** Tenant (firm+period) cash_lines tablosu — cari simetrinin ana kaynağı. */
    private cashLinesTable(): string {
        const fn = this.getFirmNr();
        const pn = this.getPeriodNr();
        return `public.rex_${fn}_${pn}_cash_lines`;
    }
    /** Tenant (firm+period) account_movements tablosu — Logo CLFLINE uyumlu cari hareketler. */
    private accountMovementsTable(): string {
        const fn = this.getFirmNr();
        const pn = this.getPeriodNr();
        return `public.rex_${fn}_${pn}_account_movements`;
    }

    /**
     * Veresiye provider için cari hareketi yazar.
     *
     *   • `cash_lines` (transaction_type='CH_TAHSILAT', sign=1) → cari ekstre buradan okur.
     *     Müşteri bakiyesi düşer (tahsilat yönünde). Veresiye remainder için kullanılır.
     *   • `account_movements` (Logo CLFLINE) → `sign=1` (debit = müşteri borçlanması) ilk
     *     yarım; hizmet tamamlandığında mahsup için `sign=0` (credit) çevrilir.
     *
     * Nakit/kart/gateway/bank_transfer provider için bu fonksiyon çağrılmaz — yalnızca
     * `payments` tablosuna yazılır, cari hareket zaten fatura kaydında cash_lines'a yansır.
     *
     * Hata durumunda: cash_lines insert başarısız olursa hata fırlatır; account_movements
     * opsiyoneldir (CLFLINE uyumlu; bazı kurulumlarda tablo olmayabilir → yakalanmaz).
     */
    private async writeAppointmentCariMovement(opts: {
        appointmentId: string;
        customerId: string | null;
        amount: number;
        kind: 'deposit' | 'remainder';
        definition: string;
        sign: 0 | 1;
        cashRegisterId?: string | null;
    }): Promise<void> {
        const fn = this.getFirmNr();
        const pn = this.getPeriodNr();
        const ficheNo = `BAP-${opts.kind.toUpperCase().slice(0, 3)}-${String(opts.appointmentId).slice(0, 8)}`;
        const now = new Date().toISOString();

        // 1) cash_lines CH_TAHSILAT — cari ekstre için birincil kaynak.
        //    register_id opsiyonel: veresiye için gerçek kasa hareketi yok (borç artışı);
        //    bu yüzden customer_id ile yazıp register_id NULL bırakıyoruz; mevcut
        //    supplierAPI.getAccountStatement `transaction_type='CH_TAHSILAT'` filtreliyor,
        //    kasa null olsa da ekstrede görünür.
        try {
            await postgres.query(
                `INSERT INTO ${this.cashLinesTable()}
                    (firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
                     definition, transaction_type, customer_id, party_id,
                     currency_code, exchange_rate, f_amount, transfer_status, special_code,
                     target_register_id, bank_id, bank_account_id, expense_card_id,
                     tax_rate, withholding_tax_rate)
                 VALUES (
                     $1, $2, NULL, $3, $4, $5, 1,
                     $6, 'CH_TAHSILAT', $7, NULL,
                     'YEREL', 1, 0, 0, '',
                     NULL, NULL, NULL, NULL,
                     0, 0
                 )
                 ON CONFLICT (fiche_no) DO UPDATE
                   SET amount = EXCLUDED.amount,
                       definition = EXCLUDED.definition,
                       customer_id = EXCLUDED.customer_id,
                       updated_at = NOW()`,
                [fn, pn, ficheNo, now, opts.amount, opts.definition, opts.customerId],
            );
        } catch (e) {
            logger.error(
                'appointmentPaymentService',
                'writeAppointmentCariMovement cash_lines failed',
                e as Error,
            );
            throw e;
        }

        // 2) account_movements (Logo CLFLINE) — opsiyonel; tablo yoksa/log tutar, akışı durdurmaz.
        try {
            await postgres.query(
                `INSERT INTO ${this.accountMovementsTable()}
                    (firm_nr, period_nr, ref_id, client_ref, customer_id, supplier_id,
                     fiche_no, date, amount, sign, trcode, module_nr, definition)
                 VALUES ($1, $2, NULL, NULL, $3, NULL, $4, $5, $6, $7, NULL, NULL, $8)
                 ON CONFLICT DO NOTHING`,
                [
                    fn,
                    pn,
                    opts.customerId,
                    ficheNo,
                    now,
                    opts.amount,
                    opts.sign,
                    opts.definition,
                ],
            );
        } catch (e) {
            logger.warn(
                'appointmentPaymentService',
                'account_movements insert atlandı (tablo yok/izin yok): ' +
                    ((e as Error)?.message || String(e)),
            );
            // devam — cash_lines yeterli
        }
    }

    /**
     * Deposit anındaki account_movements debit satırını hizmet tamamlandığında
     * credit'e çevirir (avans mahsup). cash_lines zaten tahsilat; geri alınmaz.
     */
    private async markDepositAvansMahsup(appointmentId: string): Promise<void> {
        const fn = this.getFirmNr();
        const pn = this.getPeriodNr();
        const ficheNoPrefix = `BAP-DEP-${String(appointmentId).slice(0, 8)}`;
        try {
            await postgres.query(
                `UPDATE ${this.accountMovementsTable()}
                    SET definition = COALESCE(definition, '') ||
                                     ' [avans mahsup — hizmet tamamlandı]',
                        sign = 0
                  WHERE firm_nr = $1 AND period_nr = $2
                    AND fiche_no = $3
                    AND sign = 1`,
                [fn, pn, ficheNoPrefix],
            );
        } catch (e) {
            logger.warn(
                'appointmentPaymentService',
                'account_movements mahsup update atlandı: ' +
                    ((e as Error)?.message || String(e)),
            );
        }
    }

    /**
     * Ön ödeme (deposit) kaydeder. Cari avans ekstresi + kasa +. Stok etkilenmez.
     * DB'de:
     *   1. `beauty_appointments` üzerinde deposit_* kolonları güncellenir.
     *   2. `beauty_appointment_payments` tablosuna payment_kind='deposit' satırı yazılır.
     *   3. Provider='veresiye' ise → `cash_lines` (CH_TAHSILAT) + `account_movements`
     *      (sign=1 debit) ile cari simetri sağlanır; aksi halde cari hareketi fatura
     *      kaydında (cash_lines + sales) zaten yansır.
     */
    async createAppointmentDeposit(input: CreateDepositInput): Promise<string> {
        if (!input.appointmentId) throw new Error('appointmentId zorunlu');
        if (!(input.amount > 0)) throw new Error('Ön ödeme tutarı sıfırdan büyük olmalı');

        const aptTable = this.appointmentsTable();
        const payTable = this.paymentsTable();
        const id = uuidv4();
        const now = new Date().toISOString();
        const fn = this.getFirmNr();
        const pn = this.getPeriodNr();

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
            // 2. appointments üzerinde deposit kolonlarını güncelle (idempotent UPSERT mantığı)
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

            // 4. Veresiye provider için cari simetriyi sağla:
            //    cash_lines CH_TAHSILAT (cari ekstre) + account_movements debit (Logo CLFLINE).
            if (input.provider === 'veresiye') {
                await this.writeAppointmentCariMovement({
                    appointmentId: input.appointmentId,
                    customerId: custId,
                    amount: input.amount,
                    kind: 'deposit',
                    definition: `Güzellik randevusu ön ödeme (avans) — ${id.slice(0, 8)}`,
                    sign: 1,
                    cashRegisterId: input.cashRegisterId ?? null,
                });
            }

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

    /**
     * Kalan ödeme (remainder) kaydeder. Yalnızca hizmet verildikten SONRA çağrılır.
     * Cari (hizmet) − + kasa +. Stok etkilenmez (zaten completeAppointment'ta düştü).
     *
     * Veresiye provider için: cash_lines CH_TAHSILAT + account_movements debit yazılır;
     * cari ekstre müşteri bakiyesini bu tahsilatla düşürür.
     */
    async createAppointmentRemainderPayment(input: CreateRemainderInput): Promise<string> {
        if (!input.appointmentId) throw new Error('appointmentId zorunlu');
        if (!(input.amount > 0)) throw new Error('Kalan ödeme tutarı sıfırdan büyük olmalı');

        const aptTable = this.appointmentsTable();
        const payTable = this.paymentsTable();
        const id = uuidv4();
        const now = new Date().toISOString();

        const aptRows = await postgres.query<{ id: string; client_id: string; status: string }>(
            `SELECT id, client_id, status FROM ${aptTable} WHERE id = $1`,
            [input.appointmentId],
        );
        const apt = extractRows<{ id: string; client_id: string; status: string }>(aptRows)[0];
        if (!apt) throw new Error('Randevu bulunamadı');

        const custId = input.customerId ?? apt.client_id ?? null;
        const currency = input.currency ?? 'IQD';

        try {
            await postgres.query(
                `UPDATE ${aptTable}
                    SET remainder_paid_amount   = COALESCE(remainder_paid_amount, 0) + $2,
                        remainder_payment_date  = COALESCE(remainder_payment_date, $3),
                        updated_at              = NOW()
                  WHERE id = $1`,
                [input.appointmentId, input.amount, now],
            );

            await postgres.query(
                `INSERT INTO ${payTable}
                    (id, appointment_id, customer_id, payment_kind, amount, currency,
                     provider, cash_register_id, cash_register_code, notes, paid_at, created_by)
                 VALUES ($1,$2,$3,'remainder',$4,$5,$6,$7,$8,$9,$10,$11)`,
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

            // Veresiye provider için cari simetri:
            //   cash_lines CH_TAHSILAT → cari ekstrede müşteri bakiyesi düşer
            //   account_movements debit → Logo CLFLINE uyumlu kayıt
            if (input.provider === 'veresiye') {
                await this.writeAppointmentCariMovement({
                    appointmentId: input.appointmentId,
                    customerId: custId,
                    amount: input.amount,
                    kind: 'remainder',
                    definition: `Güzellik randevusu kalan ödeme (veresiye) — ${id.slice(0, 8)}`,
                    sign: 1,
                    cashRegisterId: input.cashRegisterId ?? null,
                });
            }

            logger.info(
                'appointmentPaymentService',
                'remainder payment created',
                { id, appointmentId: input.appointmentId, amount: input.amount, provider: input.provider },
            );
            return id;
        } catch (err) {
            logger.error('appointmentPaymentService', 'createAppointmentRemainderPayment failed', err as Error);
            throw err;
        }
    }

    /**
     * Randevuyu tamamla:
     *   • status='completed' güncellemesi (beautyService üzerinden tetiklenir;
     *     orada paket session, sarf düşümü ve commission raporu var).
     *   • Eğer `collectRemainder=true` ve `remainderAmount>0` ise: createAppointmentRemainderPayment çağır.
     *   • Hizmet tamamlandığında, deposit anındaki `account_movements` debit satırı
     *     credit'e çevrilir (avans mahsup). cash_lines zaten tahsilat; geri alınmaz
     *     çünkü nakit/kasa tarafında deposit anında kasa +30 yazıldı.
     *
     * NOT: Bu fonksiyonun çağırıcısı randevuyu kaydettikten hemen sonra 'completed'
     * statüsüne çekmek için `beautyService.updateAppointment` veya
     * `updateAppointmentStatus(id, 'completed')` kullanır; ardından bu fonksiyon
     * çağrılarak remainder tahsil edilir.
     */
    async completeAppointment(input: CompleteAppointmentInput): Promise<{
        remainderPaymentId?: string;
    }> {
        if (!input.appointmentId) throw new Error('appointmentId zorunlu');

        let remainderPaymentId: string | undefined;
        if (
            input.collectRemainder &&
            typeof input.remainderAmount === 'number' &&
            input.remainderAmount > 0
        ) {
            remainderPaymentId = await this.createAppointmentRemainderPayment({
                appointmentId: input.appointmentId,
                customerId: input.customerId,
                amount: input.remainderAmount,
                provider: input.remainderProvider ?? 'cash',
                cashRegisterId: input.cashRegisterId,
                cashRegisterCode: input.cashRegisterCode,
                currency: input.currency,
                createdBy: input.createdBy,
                notes: 'Hizmet tamamlandığında kalan ödeme',
            });
        }

        // Hizmet tamamlandığında deposit avansını mahsup et (account_movements debit → credit).
        // Yalnızca daha önce veresiye deposit alındıysa (debit satırı varsa) anlamlıdır.
        await this.markDepositAvansMahsup(input.appointmentId);

        return { remainderPaymentId };
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
