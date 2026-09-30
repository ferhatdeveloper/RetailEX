/**
 * Beauty peşinat → ayrı sales fiş bağlantı helper'ları.
 *
 * Bu modül `appointmentPaymentService.createAppointmentDeposit` (peşinat) ve
 * `beautyService.collectAppointmentRemainder` (kalan ödeme) tarafından kullanılan
 * ortak fiş no üreticileri ve deposit↔main sale bağlama fonksiyonlarını içerir.
 *
 * Fiş no kuralı (Plan §6 / §2.2):
 *   - Peşinat:  `BEAUTY-PESINAT-{aptId}-{YYYYMMDDHHMMSS}`
 *   - Ana:      `BEAUTY-MAIN-{aptId}-{YYYYMMDDHHMMSS}`
 *
 * NOT (Tauri uyumu): Ham SQL string'leri kullanılır; `DO $$ … END $$` blokları
 * YAZILMAZ. Migration scriptleri `database/scripts/apply-pesinat-sale-link.mjs`
 * ile her firm/period için ayrı `ALTER TABLE` uygular.
 *
 * NOT (gerçek kolonlar): Migration 182 ile `sales` tablosuna
 * `linked_appointment_id`, `deposit_sale_id`, `parent_sale_id`,
 * `sale_group_id`, `is_deposit` kolonları eklenmiştir.
 */

import { postgres, ERP_SETTINGS } from './postgres';

/** `YYYYMMDDHHMMSS` formatında tarih damgası (lokal saat). */
export function tsForFicheNo(d: Date = new Date()): string {
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return (
        `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
        `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    );
}

/**
 * Peşinat sales fiş no üretir.
 * Format: `BEAUTY-PESINAT-{aptId}-{YYYYMMDDHHMMSS}`
 * - UUID (36 char) + prefix (~17 char) + ts (14 char) = ~67 char < 100 ✓
 * - UNIQUE constraint ile çakışma riski düşük; aynı saniyede ikinci peşinat
 *   INSERT'i ON CONFLICT (fiche_no) DO NOTHING ile yok sayılır.
 */
export function nextPesinatFicheNo(aptId: string, ts?: Date): string {
    const cleanApt = String(aptId ?? '').trim();
    if (!cleanApt) throw new Error('nextPesinatFicheNo: aptId zorunlu');
    return `BEAUTY-PESINAT-${cleanApt}-${tsForFicheNo(ts)}`;
}

/**
 * Ana (kalan ödeme) sales fiş no üretir.
 * Format: `BEAUTY-MAIN-{aptId}-{YYYYMMDDHHMMSS}`
 */
export function nextMainFicheNo(aptId: string, ts?: Date): string {
    const cleanApt = String(aptId ?? '').trim();
    if (!cleanApt) throw new Error('nextMainFicheNo: aptId zorunlu');
    return `BEAUTY-MAIN-${cleanApt}-${tsForFicheNo(ts)}`;
}

/**
 * `BEAUTY-PESINAT-{aptId}-…` veya `BEAUTY-MAIN-{aptId}-…` formatlı fiş
 * numarasından `aptId`'yi çıkarır. Tanınmazsa null döner.
 */
export function extractAppointmentIdFromFicheNo(ficheNo: string | null | undefined): string | null {
    const raw = String(ficheNo ?? '').trim();
    if (!raw) return null;
    const m = raw.match(/^BEAUTY-(?:PESINAT|MAIN)-([0-9a-fA-F-]{36})-\d{14}$/);
    return m ? m[1] : null;
}

/**
 * `sale_group_id` üretir — peşinat + ana satışı gruplar.
 * Plan §6 önerisi: `apt-{aptId}`.
 */
export function buildSaleGroupId(aptId: string): string {
    const cleanApt = String(aptId ?? '').trim();
    if (!cleanApt) throw new Error('buildSaleGroupId: aptId zorunlu');
    return `apt-${cleanApt}`;
}

function getSalesTableName(): string {
    const fn = String(ERP_SETTINGS.firmNr ?? '001').padStart(3, '0');
    const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
    return `rex_${fn}_${pn}_sales`;
}

/**
 * Ana sales fişinin `parent_sale_id` alanını peşinat sales id'sine bağlar.
 * İlişki tek yönlüdür (main.deposit_sale_id = deposit.id); deposit.parent_sale_id NULL kalır.
 *
 * Idempotent: aynı id ile birden fazla UPDATE no-op (aynı değer yazılır).
 */
export async function linkDepositToMainSale(
    depositSaleId: string,
    mainSaleId: string,
    salesTable?: string,
): Promise<void> {
    const dep = String(depositSaleId ?? '').trim();
    const main = String(mainSaleId ?? '').trim();
    if (!dep) throw new Error('linkDepositToMainSale: depositSaleId zorunlu');
    if (!main) throw new Error('linkDepositToMainSale: mainSaleId zorunlu');
    const table = salesTable ?? getSalesTableName();
    await postgres.query(
        `UPDATE ${table}
            SET deposit_sale_id = $1::text::uuid,
                updated_at = NOW()
          WHERE id = $2::text::uuid`,
        [dep, main],
    );
}

/**
 * Ana sales fişinin `linked_appointment_id` alanını set eder.
 * createSale opsiyonel parametre olarak ana fişe randevu bağlamak için kullanılır.
 */
export async function setSaleAppointmentLink(
    saleId: string,
    appointmentId: string | null | undefined,
    salesTable?: string,
): Promise<void> {
    const sid = String(saleId ?? '').trim();
    const apt = appointmentId ? String(appointmentId).trim() : null;
    if (!sid) throw new Error('setSaleAppointmentLink: saleId zorunlu');
    const table = salesTable ?? getSalesTableName();
    await postgres.query(
        `UPDATE ${table}
            SET linked_appointment_id = $2::text::uuid,
                updated_at = NOW()
          WHERE id = $1::text::uuid`,
        [sid, apt],
    );
}
