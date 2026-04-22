import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import type { Sale, SaleItem } from '../core/types/models';
import { postgres, ERP_SETTINGS } from './postgres';
import { useSaleStore } from '../store/useSaleStore';
import { useCustomerStore } from '../store/useCustomerStore';
import {
    buildReminderText,
    sendAtakSms,
    sendWhatsAppText,
    getAtakBalance,
    type ClinicMessagingPortalConfig,
} from './messaging/clinicMessaging';
import { getEmbeddedBridgeStatus } from './messaging/whatsappEmbeddedBridge';
import {
    AppointmentStatus,
    BeautyAppointment,
    BeautyService,
    BeautySpecialist,
    BeautyDevice,
    BeautyPackage,
    BeautyPackagePurchase,
    BeautyLead,
    BeautyBodyRegion,
    BeautyCustomerFeedback,
    BeautySale,
    BeautySaleItem,
    BeautyCustomer,
    BeautySatisfactionSurvey,
    BeautySatisfactionQuestion,
    BeautySatisfactionLabels,
    BeautyPortalSettings,
    BeautyBranch,
    BeautyRoom,
    BeautyCorporateAccount,
    BeautyConsentTemplate,
    BeautyMembership,
    BeautyServiceConsumableRow,
    BeautyCustomerHealth,
    BeautyProductBatch,
    BeautyMarketingCampaign,
    BeautyIntegrationSettings,
    BeautyWaitlistEntry,
    BeautyBookingRequest,
    BeautyClinicalNote,
    BeautyPatientPhoto,
    BeautyAuditLogEntry,
    BeautyClinicAnalytics,
    type BeautyAppointmentClinicalData,
} from '../types/beauty';

/** Müşteri profili: randevu / satış / paket sorgularında aynı kişiye ait yinelenen kartları bulmak için */
export type BeautyCustomerProfileQueryOpts = {
    phone?: string | null;
    email?: string | null;
    code?: string | null;
    name?: string | null;
};

/** PG uuid sütunlarında `""` geçersizdir — null kullanılmalı */
function pgUuidOrNull(v: unknown): string | null {
    if (v == null || v === undefined) return null;
    const s = String(v).trim();
    return s.length ? s : null;
}

/** TIME sütunu için güvenli biçim (HH:mm:ss) */
function normalizeAppointmentTimeForPg(t: unknown): string | null {
    if (t == null || t === undefined) return null;
    const s = String(t).trim().split('.')[0];
    if (!s) return null;
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    const ss = m[3] != null ? Math.min(59, Math.max(0, parseInt(m[3], 10))) : 0;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function pgDateOrNull(d: unknown): string | null {
    if (d == null || d === undefined) return null;
    const s = String(d).trim();
    if (!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        const da = parseInt(m[3], 10);
        if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return s;
    }
    const d2 = new Date(s);
    if (!Number.isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
    return null;
}

function pgTimestamptzOrNull(v: unknown): string | null {
    if (v == null) return null;
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
    const s = String(v).trim();
    return s.length ? s : null;
}

/** İlk seans tarihinden itibaren her ayın aynı günü (kısa ayda son güne sıkıştırılır). */
function computeMonthlySameDayDates(firstYmd: string, count: number): string[] {
    const m = String(firstYmd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m || count < 1) return [];
    let year = parseInt(m[1], 10);
    let month = parseInt(m[2], 10) - 1;
    const targetDay = parseInt(m[3], 10);
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        const lastDay = new Date(year, month + 1, 0).getDate();
        const day = Math.min(targetDay, lastDay);
        const dt = new Date(year, month, day);
        out.push(dt.toISOString().slice(0, 10));
        month += 1;
        if (month > 11) {
            month = 0;
            year += 1;
        }
    }
    return out;
}

function addDaysYmd(ymd: string, days: number): string {
    const m = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Raporlarda yerel takvim gününe göre filtre (UTC gece kayması olmasın diye tarayıcı yerel aralığı ISO’ya çevirir) */
/** Güzellik ödeme kodunu MarketPOS / salesAPI ile uyumlu hale getirir (yalnızca `cash` kasaya yazılır; restoran POS ile aynı ayrım) */
function mapBeautyPaymentToErpMethod(raw: string | undefined): string {
    const s = String(raw ?? '').trim();
    const m = s.toLowerCase();
    if (m === 'cash' || /^nak[ıi]t$/i.test(s) || m === 'nakit') return 'cash';
    if (m === 'transfer' || m === 'havale' || /havale|eft|transfer/i.test(s)) return 'transfer';
    if (m === 'card' || m === 'kart' || /kredi|kart/i.test(s)) return 'card';
    if (m === 'gateway' || /sanal|gateway/i.test(s)) return 'gateway';
    if (m === 'veresiye') return 'veresiye';
    return 'cash';
}

/** Tablo öneki `rex_00x_*` ile uyum: oturumdaki firma no `1` / `01` iken satır `firm_nr` hep `001` olmalı */
function erpFirmNrForRow(): string {
    return String(ERP_SETTINGS.firmNr ?? '001').trim().padStart(3, '0').slice(0, 10);
}

/** `beauty_appointments.clinical_data` JSONB satırını nesneye çevirir */
function parseClinicalDataRow(raw: unknown): BeautyAppointmentClinicalData | null {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'string') {
        try {
            const o = JSON.parse(raw) as unknown;
            if (typeof o === 'object' && o != null && !Array.isArray(o)) {
                return o as BeautyAppointmentClinicalData;
            }
            return null;
        } catch {
            return null;
        }
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as BeautyAppointmentClinicalData;
    }
    return null;
}

function clinicalDataForPgInput(a: Partial<BeautyAppointment>): Record<string, unknown> {
    const raw = a.clinical_data;
    if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    return {};
}

/** UUID string (güvenli IN listesi) */
function filterUuidIds(ids: string[]): string[] {
    const uuidRe = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    return [...new Set(ids.map(s => String(s).trim()))].filter(s => uuidRe.test(s));
}

/** Randevu listesi — IN ($1..$n) köprü/pg ile uyumlu (ANY dizisi yerine) */
async function fetchBeautyAppointmentsForIds(
    parts: string[],
    nameForCorp: string | null,
): Promise<BeautyAppointment[]> {
    if (!parts.length) return [];
    const fn = erpFirmNrForRow();
    const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
    const corp = postgres.getCardTableName('beauty_corporate_accounts', 'beauty');
    const n = parts.length;
    const inList = parts.map((_, i) => `$${i + 1}`).join(', ');
    const firmPh = `$${n + 1}`;
    const corpPh = `$${n + 2}`;
    const { rows } = await postgres.query(
        `
            SELECT a.*, COALESCE(s.name, rs.name) AS service_name, COALESCE(sp.name, u.full_name, u.username) AS specialist_name
            FROM ${table} a
            LEFT JOIN ${postgres.getCardTableName('beauty_services', 'beauty')} s ON a.service_id = s.id
            LEFT JOIN ${postgres.getCardTableName('services')} rs ON a.service_id = rs.id AND rs.firm_nr = ${firmPh}
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            LEFT JOIN users u ON a.specialist_id = u.id AND lpad(trim(u.firm_nr::text), 3, '0') = ${firmPh}
            WHERE (
                a.client_id IN (${inList})
                OR (
                    ${corpPh}::text IS NOT NULL
                    AND a.corporate_account_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM ${corp} ca
                        WHERE ca.id = a.corporate_account_id
                          AND LOWER(TRIM(ca.name)) = LOWER(TRIM(${corpPh}::text))
                    )
                )
            )
            ORDER BY a.appointment_date DESC NULLS LAST, a.appointment_time DESC NULLS LAST LIMIT 400
        `,
        [...parts, fn, nameForCorp],
    );
        return rows.map((r: Record<string, unknown> & { clinical_data?: unknown }) => ({
            ...r,
            clinical_data: parseClinicalDataRow(r.clinical_data) ?? undefined,
        })) as BeautyAppointment[];
    }

/** Aynı firmada ünvanı birebir eşleşen tüm müşteri kartları (profil geçmişi genişletme) */
async function fetchCustomerIdsByExactFirmName(displayName: string): Promise<string[]> {
    const n = String(displayName ?? '').trim();
    if (n.length < 8) return [];
    const ct = postgres.getCardTableName('customers');
    const fn = erpFirmNrForRow();
    const { rows } = await postgres.query(
        `SELECT id::text AS id FROM ${ct} c
         WHERE lpad(trim(c.firm_nr::text), 3, '0') = $1
           AND LOWER(TRIM(c.name)) = LOWER(TRIM($2::text))`,
        [fn, n],
    );
    return filterUuidIds(rows.map((r: { id: string }) => r.id));
}

async function resolveBeautyCustomerName(customerId: unknown, hint?: string | null): Promise<string> {
    if (hint != null && String(hint).trim()) return String(hint).trim();
    const id = pgUuidOrNull(customerId);
    if (!id) return '';
    try {
        const ct = postgres.getCardTableName('customers');
        const { rows } = await postgres.query<{ name?: string }>(
            `SELECT name FROM ${ct} WHERE id = $1 LIMIT 1`,
            [id]
        );
        return rows[0]?.name != null ? String(rows[0].name) : '';
    } catch {
        return '';
    }
}

function localYmdToIsoRange(ymd: string): { startIso: string; endIso: string } {
    const parts = ymd.split('-').map(Number);
    if (parts.length < 3 || parts.some(n => Number.isNaN(n))) {
        const n = new Date();
        const start = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
        const end = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
        return { startIso: start.toISOString(), endIso: end.toISOString() };
    }
    const [y, mo, d] = parts;
    const start = new Date(y, mo - 1, d, 0, 0, 0, 0);
    const end = new Date(y, mo - 1, d, 23, 59, 59, 999);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Hizmet kartı (rex_*_services) ve malzeme «hizmet» satırları için süre tahmini */
function inferDurationMinFromUnit(unit: unknown): number {
    const u = String(unit ?? '').toLowerCase();
    if (u.includes('saat') || u.includes('hour')) return 60;
    if (u.includes('gün') || u.includes('gun') || u.includes('day')) return 24 * 60;
    if (u.includes('dk') || u.includes('dak') || u.includes('min')) return 15;
    return 60;
}

function mapFirmServiceRowToBeauty(row: Record<string, unknown>): BeautyService {
    const cat = String(row.category ?? '').trim();
    const active = row.is_active;
    const isActive = active === undefined || active === null ? true : active !== false;
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        category: cat.length ? cat : 'beauty',
        duration_min: inferDurationMinFromUnit(row.unit),
        price: Number(row.unit_price ?? 0),
        cost_price: row.purchase_price != null ? Number(row.purchase_price) : undefined,
        color: '#6366f1',
        commission_rate: 0,
        description: row.description != null ? String(row.description) : undefined,
        requires_device: false,
        default_sessions: 1,
        is_active: isActive,
    };
}

function productRowIsService(row: Record<string, unknown>): boolean {
    const a = String(row.material_type ?? '').trim().toLowerCase();
    const b = String(row.materialtype ?? '').trim().toLowerCase();
    const camel = row.materialType != null ? String(row.materialType).trim().toLowerCase() : '';
    return a === 'service' || b === 'service' || camel === 'service';
}

function mapProductServiceRowToBeauty(row: Record<string, unknown>): BeautyService {
    const cat = String(row.category_code ?? row.categorycode ?? '').trim();
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        category: cat.length ? cat : 'beauty',
        duration_min: inferDurationMinFromUnit(row.unit),
        price: Number(row.price ?? 0),
        cost_price: row.cost != null ? Number(row.cost) : undefined,
        color: '#0d9488',
        commission_rate: 0,
        description: row.description != null ? String(row.description) : undefined,
        requires_device: false,
        default_sessions: 1,
        is_active: row.is_active !== false,
    };
}

/** Aylık seri için: önce güzellik hizmet kartı, yoksa ERP hizmet / stok hizmeti */
async function resolveServiceForMonthlySeries(serviceId: string): Promise<{
    name: string;
    price: number;
    duration_min: number;
    default_sessions: number;
} | null> {
    const svt = postgres.getCardTableName('beauty_services', 'beauty');
    try {
        const { rows } = await postgres.query(
            `SELECT name, price, duration_min, COALESCE(default_sessions, 1) AS default_sessions
             FROM ${svt} WHERE id = $1 AND COALESCE(is_active, true) = true`,
            [serviceId]
        );
        const r = rows[0] as Record<string, unknown> | undefined;
        if (r) {
            return {
                name: String(r.name ?? ''),
                price: Number(r.price ?? 0),
                duration_min: Math.max(1, Math.round(Number(r.duration_min ?? 30))),
                default_sessions: Math.max(1, Math.round(Number(r.default_sessions ?? 1))),
            };
        }
    } catch {
        try {
            const { rows } = await postgres.query(
                `SELECT name, price, duration_min FROM ${svt} WHERE id = $1 AND COALESCE(is_active, true) = true`,
                [serviceId]
            );
            const r = rows[0] as Record<string, unknown> | undefined;
            if (r) {
                return {
                    name: String(r.name ?? ''),
                    price: Number(r.price ?? 0),
                    duration_min: Math.max(1, Math.round(Number(r.duration_min ?? 30))),
                    default_sessions: 1,
                };
            }
        } catch {
            /* devam */
        }
    }

    const firmRaw = String(ERP_SETTINGS.firmNr ?? '001').trim();
    const firmPadded = firmRaw.padStart(3, '0').slice(0, 10);
    const firmCandidates =
        firmPadded === firmRaw ? [firmPadded] : [firmPadded, firmRaw];
    const firmInSql = firmCandidates.map((_, i) => `$${i + 2}`).join(', ');

    const svcTbl = postgres.getCardTableName('services');
    try {
        const { rows } = await postgres.query(
            `SELECT name, unit_price, unit, category FROM ${svcTbl}
             WHERE id = $1 AND firm_nr IN (${firmInSql})`,
            [serviceId, ...firmCandidates]
        );
        const r = rows[0] as Record<string, unknown> | undefined;
        if (r) {
            return {
                name: String(r.name ?? ''),
                price: Number(r.unit_price ?? 0),
                duration_min: inferDurationMinFromUnit(r.unit),
                default_sessions: 1,
            };
        }
    } catch {
        /* */
    }

    const prodTbl = postgres.getCardTableName('products');
    try {
        const { rows } = await postgres.query(
            `SELECT name, price, unit FROM ${prodTbl}
             WHERE id = $1 AND firm_nr IN (${firmInSql})
               AND (
                 LOWER(TRIM(COALESCE(material_type, ''))) = 'service'
                 OR LOWER(TRIM(COALESCE(materialtype, ''))) = 'service'
               )`,
            [serviceId, ...firmCandidates]
        );
        const r = rows[0] as Record<string, unknown> | undefined;
        if (r) {
            return {
                name: String(r.name ?? ''),
                price: Number(r.price ?? 0),
                duration_min: inferDurationMinFromUnit(r.unit),
                default_sessions: 1,
            };
        }
    } catch {
        /* */
    }

    return null;
}

/** ERP kasa + müşteri puanı — tek sefer tahsilat (kalem ayrı güzellik fişlerinden sonra toplam). */
type BeautyErpSyncContext = {
    invoiceNumber: string;
    /** Varsa fiş notunda kaynak beauty_sales kaydı */
    beautySaleId?: string;
};

async function runBeautySaleErpAndLoyalty(
    sale: Partial<BeautySale>,
    items: Partial<BeautySaleItem>[],
    ctx: BeautyErpSyncContext,
): Promise<void> {
    const erpItems: SaleItem[] = (items.length > 0 ? items : [{
        name: 'Güzellik',
        quantity: 1,
        unit_price: sale.total ?? 0,
        total: sale.total ?? 0,
        discount: 0,
        item_type: 'service',
    }]).map((item) => ({
        productId: item.item_id
            ? String(item.item_id)
            : `beauty-${String(item.item_type ?? 'line')}-${String(item.name ?? 'x').slice(0, 24)}`,
        productName: String(item.name ?? 'Kalem'),
        quantity: Number(item.quantity ?? 1),
        price: Number(item.unit_price ?? 0),
        discount: Number(item.discount ?? 0),
        total: Number(item.total ?? 0),
    }));

    const customerLabel = await resolveBeautyCustomerName(
        sale.customer_id,
        sale.customer_name != null ? String(sale.customer_name) : undefined
    );
    const pm = mapBeautyPaymentToErpMethod(String(sale.payment_method ?? 'cash'));
    const dateIso = new Date().toISOString();

    try {
        const noteTail = sale.notes?.trim() ? String(sale.notes).trim() : 'Güzellik satışı';
        const erpNotes = ctx.beautySaleId
            ? `GüzellikPOS|beauty_sale_id:${ctx.beautySaleId}|${noteTail}`
            : `GüzellikPOS|checkout_tek_tahsilat|${noteTail}`;

        await useSaleStore.getState().addSale({
            id: uuidv4(),
            receiptNumber: ctx.invoiceNumber,
            date: dateIso,
            customerId: sale.customer_id ?? undefined,
            customerName: customerLabel || 'Peşin Müşteri',
            items: erpItems,
            subtotal: Number(sale.subtotal ?? 0),
            discount: Number(sale.discount ?? 0),
            tax: Number(sale.tax ?? 0),
            total: Number(sale.total ?? 0),
            paymentMethod: pm,
            paymentStatus: 'paid',
            status: 'completed',
            notes: erpNotes,
            cashier: 'Güzellik',
            firmNr: ERP_SETTINGS.firmNr,
            periodNr: ERP_SETTINGS.periodNr,
        });
    } catch (erpErr) {
        const detail = erpErr instanceof Error ? erpErr.message : String(erpErr);
        console.error('[beautyService] ERP addSale başarısız', {
            invoiceNumber: ctx.invoiceNumber,
            beautySaleId: ctx.beautySaleId,
            error: erpErr,
        });
        toast.warning('Fatura / kasa kaydı oluşturulamadı', {
            description:
                `Güzellik satışı veritabanında duruyor (Fiş: ${ctx.invoiceNumber}). Muhasebe ve kasa tarafını kontrol edin. Hata: ${detail}`,
            duration: 14_000,
        });
        throw new Error(
            `Güzellik satışı kaydedildi ancak perakende fatura veya kasa işlenemedi. Fiş: ${ctx.invoiceNumber}. ${detail}`
        );
    }

    const cid = pgUuidOrNull(sale.customer_id);
    const tot = Number(sale.total ?? 0);
    if (cid && tot > 0) {
        try {
            await useCustomerStore.getState().updatePurchaseHistory(cid, tot);
            const pts = Math.floor(tot / 100);
            if (pts > 0) await useCustomerStore.getState().updatePoints(cid, pts);
        } catch (e) {
            console.warn('[beautyService] Müşteri alışveriş / puan güncellenemedi:', e);
        }
    }
}

export const beautyService = {

    /**
     * Profil / geçmiş sorguları: aynı telefon, e-posta, kod veya (uzun) ünvana sahip tüm cari kartlarının id'lerini döner.
     * `$1::uuid` kullanılmaz; geçersiz id veya köprü uyumsuzluğu durumunda tek id ile devam edilir.
     */
    async resolveLinkedCustomerIdsForProfile(
        customerId: string,
        opts?: BeautyCustomerProfileQueryOpts | null,
    ): Promise<string[]> {
        const ct = postgres.getCardTableName('customers');
        const fn = erpFirmNrForRow();
        const phoneDigits = String(opts?.phone ?? '').replace(/\D/g, '');
        const emailNorm = String(opts?.email ?? '').trim().toLowerCase();
        const codeTrim = String(opts?.code ?? '').trim();
        const nameTrim = String(opts?.name ?? '').trim();
        const idTrim = String(customerId ?? '').trim();
        try {
            const { rows } = await postgres.query(
                `SELECT DISTINCT c.id::text AS id
                 FROM ${ct} c
                 WHERE (
                     -- Önce id: firm_nr uyuşmasa bile kart varsa yakala (çoklu tenant / demo sapması)
                     (NULLIF($1::text, '') IS NOT NULL AND c.id::text = $1::text)
                     OR (
                         lpad(trim(c.firm_nr::text), 3, '0') = $2
                         AND (
                             ($3::text IS NOT NULL AND LENGTH($3::text) >= 8
                                 AND REGEXP_REPLACE(COALESCE(c.phone, ''), '[^0-9]', '', 'g') = $3)
                             OR ($4::text IS NOT NULL AND $4::text <> ''
                                 AND LOWER(TRIM(COALESCE(c.email, ''))) = $4)
                             OR ($5::text IS NOT NULL AND LENGTH(TRIM($5::text)) >= 1
                                 AND UPPER(TRIM(COALESCE(c.code, ''))) = UPPER(TRIM($5::text)))
                             OR ($6::text IS NOT NULL AND LENGTH(TRIM($6::text)) >= 8
                                 AND LOWER(TRIM(c.name)) = LOWER(TRIM($6::text)))
                         )
                     )
                   )`,
                [idTrim || null, fn, phoneDigits || null, emailNorm || null, codeTrim || null, nameTrim || null],
            );
            const out = rows.map((r: { id: string }) => String(r.id));
            return out.length > 0 ? out : idTrim ? [idTrim] : [];
        } catch (e) {
            console.warn('[beautyService] resolveLinkedCustomerIdsForProfile failed:', e);
            return idTrim ? [idTrim] : [];
        }
    },

    // =========================================================================
    // CUSTOMERS  (general rex_{firm}_customers table)
    // =========================================================================
    async getCustomers(): Promise<BeautyCustomer[]> {
        const t = postgres.getCardTableName('customers');
        const apt = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const svc = postgres.getCardTableName('beauty_services', 'beauty');
        const svcFirm = postgres.getCardTableName('services');
        const prodTbl = postgres.getCardTableName('products');
        const fn = erpFirmNrForRow();
        const { rows } = await postgres.query(`
            SELECT
                c.id, c.code, c.name, c.phone, c.phone2, c.age, c.file_id, c.occupation,
                c.gender, c.customer_tier, c.heard_from, c.email,
                c.address, c.city, c.points, c.total_spent, c.balance,
                c.is_active, c.notes, c.created_at,
                COUNT(a.id)::int          AS appointment_count,
                MAX(a.appointment_date)   AS last_appointment_date,
                (SELECT COALESCE(sb.name, sf.name, pr.name)
                 FROM ${apt} la
                 LEFT JOIN ${svc} sb ON sb.id = la.service_id
                 LEFT JOIN ${svcFirm} sf ON sf.id = la.service_id AND sf.firm_nr = $1
                 LEFT JOIN ${prodTbl} pr ON pr.id = la.service_id AND pr.firm_nr = $1
                   AND (
                     LOWER(TRIM(COALESCE(pr.material_type, ''))) = 'service'
                     OR LOWER(TRIM(COALESCE(pr.materialtype, ''))) = 'service'
                   )
                 WHERE la.client_id = c.id
                 ORDER BY la.appointment_date DESC NULLS LAST, la.appointment_time DESC NULLS LAST
                 LIMIT 1)              AS last_service_name
            FROM ${t} c
            LEFT JOIN ${apt} a ON a.client_id = c.id
            WHERE c.is_active = true AND lpad(trim(c.firm_nr::text), 3, '0') = $2
            GROUP BY c.id
            ORDER BY c.name
        `, [fn, fn]);
        return rows;
    },

    async searchCustomers(term: string): Promise<BeautyCustomer[]> {
        const t = postgres.getCardTableName('customers');
        const fn = erpFirmNrForRow();
        const { rows } = await postgres.query(
            `SELECT id, code, name, phone, phone2, age, file_id, occupation, gender, customer_tier, heard_from, email, address, city, points, total_spent, balance, is_active, notes
             FROM ${t}
             WHERE is_active = true AND lpad(trim(firm_nr::text), 3, '0') = $2
               AND (
                 name ILIKE $1 OR phone ILIKE $1 OR COALESCE(phone2, '') ILIKE $1
                 OR email ILIKE $1 OR code ILIKE $1
                 OR COALESCE(notes, '') ILIKE $1 OR COALESCE(occupation, '') ILIKE $1
                 OR COALESCE(file_id, '') ILIKE $1
               )
             ORDER BY name LIMIT 50`,
            [`%${term}%`, fn]
        );
        return rows;
    },

    async createCustomer(data: Partial<BeautyCustomer>): Promise<string> {
        const t = postgres.getCardTableName('customers');
        const fn = erpFirmNrForRow();
        const id = uuidv4();
        const code = `BEA-${Date.now().toString(36).toUpperCase()}`;
        let ageVal: number | null = null;
        if (data.age !== undefined && data.age !== null) {
            const n = Number(data.age);
            if (Number.isFinite(n)) ageVal = Math.round(n);
        }
        const fileIdVal =
            data.file_id != null && String(data.file_id).trim() !== ''
                ? String(data.file_id).trim()
                : null;
        const g = String(data.gender ?? '').trim().toLowerCase();
        const genderVal = g === 'female' || g === 'male' || g === 'other' ? g : null;
        const tierRaw = String(data.customer_tier ?? 'normal').trim().toLowerCase();
        const tierVal = tierRaw === 'vip' ? 'vip' : 'normal';
        await postgres.query(
            `INSERT INTO ${t} (
               id, firm_nr, code, name, phone, phone2, email, address, city, notes, age, file_id, occupation,
               gender, customer_tier, heard_from, is_active
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true)`,
            [
                id,
                fn,
                code,
                data.name,
                data.phone ?? null,
                data.phone2?.trim() || null,
                data.email ?? null,
                data.address ?? null,
                data.city ?? null,
                data.notes?.trim() || null,
                ageVal,
                fileIdVal,
                data.occupation?.trim() || null,
                genderVal,
                tierVal,
                data.heard_from?.trim() || null,
            ]
        );
        return id;
    },

    async updateCustomer(id: string, data: Partial<BeautyCustomer>): Promise<void> {
        const t = postgres.getCardTableName('customers');
        const fn = erpFirmNrForRow();
        const sets: string[] = [];
        const vals: unknown[] = [];
        let i = 1;
        const push = (col: string, v: unknown) => {
            sets.push(`${col} = $${i++}`);
            vals.push(v);
        };
        if (data.name !== undefined) push('name', data.name);
        if (data.phone !== undefined) push('phone', data.phone ?? null);
        if (data.phone2 !== undefined) push('phone2', data.phone2?.trim() || null);
        if (data.email !== undefined) push('email', data.email ?? null);
        if (data.address !== undefined) push('address', data.address ?? null);
        if (data.city !== undefined) push('city', data.city ?? null);
        if (data.notes !== undefined) push('notes', data.notes ?? null);
        if (data.file_id !== undefined) {
            push(
                'file_id',
                data.file_id != null && String(data.file_id).trim() !== ''
                    ? String(data.file_id).trim()
                    : null
            );
        }
        if (data.occupation !== undefined) push('occupation', data.occupation?.trim() || null);
        if (data.gender !== undefined) {
            const g = String(data.gender ?? '').trim().toLowerCase();
            push('gender', g === 'female' || g === 'male' || g === 'other' ? g : null);
        }
        if (data.customer_tier !== undefined) {
            const t = String(data.customer_tier ?? 'normal').trim().toLowerCase();
            push('customer_tier', t === 'vip' ? 'vip' : 'normal');
        }
        if (data.heard_from !== undefined) {
            push('heard_from', data.heard_from?.trim() || null);
        }
        if (data.age !== undefined) {
            if (data.age === null) push('age', null);
            else {
                const n = Number(data.age);
                push('age', Number.isFinite(n) ? Math.round(n) : null);
            }
        }
        if (sets.length === 0) return;
        vals.push(id, fn);
        await postgres.query(
            `UPDATE ${t} SET ${sets.join(', ')} WHERE id=$${i} AND lpad(trim(firm_nr::text), 3, '0') = $${i + 1}`,
            vals
        );
    },

    // =========================================================================
    // SPECIALISTS — liste: `public.users` (Kullanıcı Yönetimi) + isteğe bağlı güzellik kartı
    // `beauty_specialists.id` = `users.id` olduğunda prim / renk / uzmanlık burada saklanır.
    // Randevu `specialist_id` aynı UUID’yi kullanır. Eski (yalnızca kart) kayıtlar UNION ile gelir.
    // =========================================================================
    async getSpecialists(): Promise<BeautySpecialist[]> {
        const palette = ['#9333ea', '#6366f1', '#0d9488', '#ea580c', '#db2777', '#0891b2', '#7c3aed', '#059669'];
        const fn = erpFirmNrForRow();
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        const { rows: userLinked } = await postgres.query(
            `SELECT
                u.id,
                COALESCE(bs.name, NULLIF(TRIM(u.full_name), ''), u.username) AS name,
                NULLIF(TRIM(u.phone), '') AS phone,
                NULLIF(TRIM(u.email), '') AS email,
                COALESCE(bs.specialty, r.name, u.role) AS specialty,
                bs.color,
                COALESCE(bs.commission_rate, 0)::float AS commission_rate,
                (COALESCE(bs.is_active, u.is_active) IS NOT FALSE) AS is_active,
                bs.avatar_url,
                bs.working_hours
             FROM public.users u
             LEFT JOIN public.roles r ON r.id = u.role_id
             LEFT JOIN ${t} bs ON bs.id = u.id
             WHERE lpad(trim(u.firm_nr::text), 3, '0') = $1
             ORDER BY COALESCE(bs.name, NULLIF(TRIM(u.full_name), ''), u.username)`,
            [fn]
        );
        const fromUsers: BeautySpecialist[] = (userLinked as any[]).map((r, i) => ({
            id: r.id,
            name: String(r.name ?? ''),
            phone: r.phone ?? undefined,
            email: r.email ?? undefined,
            specialty: r.specialty ?? undefined,
            color: r.color || palette[i % palette.length],
            commission_rate: Number(r.commission_rate) || 0,
            is_active: r.is_active !== false,
            avatar_url: r.avatar_url ?? undefined,
            working_hours: r.working_hours ?? undefined,
        }));

        const { rows: legacyOnly } = await postgres.query(
            `SELECT bs.*
             FROM ${t} bs
             WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = bs.id)
             ORDER BY bs.name`,
            []
        );
        const legacy: BeautySpecialist[] = (legacyOnly as any[]).map((r) => ({
            id: r.id,
            name: r.name,
            phone: r.phone ?? undefined,
            email: r.email ?? undefined,
            specialty: r.specialty ?? undefined,
            color: r.color ?? '#9333ea',
            commission_rate: Number(r.commission_rate) || 0,
            is_active: r.is_active !== false,
            avatar_url: r.avatar_url ?? undefined,
            working_hours: r.working_hours ?? undefined,
        }));

        return [...fromUsers, ...legacy];
    },

    async createSpecialist(data: Partial<BeautySpecialist>): Promise<string> {
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO ${t}
                (id, name, phone, email, specialty, color, commission_rate, avatar_url, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`,
            [id, data.name, data.phone ?? null, data.email ?? null, data.specialty ?? null,
             data.color ?? '#9333ea', data.commission_rate ?? 0, data.avatar_url ?? null,
             data.is_active !== false]
        );
        return id;
    },

    async updateSpecialist(id: string, data: Partial<BeautySpecialist>): Promise<void> {
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        const active = data.is_active !== false;
        await postgres.query(
            `INSERT INTO ${t}
                (id, name, phone, email, specialty, color, commission_rate, avatar_url, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                phone = EXCLUDED.phone,
                email = EXCLUDED.email,
                specialty = EXCLUDED.specialty,
                color = EXCLUDED.color,
                commission_rate = EXCLUDED.commission_rate,
                avatar_url = EXCLUDED.avatar_url,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()`,
            [
                id,
                data.name ?? '',
                data.phone ?? null,
                data.email ?? null,
                data.specialty ?? null,
                data.color ?? '#9333ea',
                data.commission_rate ?? 0,
                data.avatar_url ?? null,
                active,
            ]
        );
    },

    async toggleSpecialist(id: string, active: boolean): Promise<void> {
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        const res = await postgres.query(
            `UPDATE ${t} SET is_active=$2, updated_at=NOW() WHERE id=$1`,
            [id, active]
        );
        const n = res.rowCount ?? 0;
        if (n > 0) return;
        const { rows } = await postgres.query<{ full_name: string; username: string; phone: string | null; email: string | null }>(
            `SELECT full_name, username, phone, email FROM public.users WHERE id = $1`,
            [id]
        );
        const u = rows[0];
        if (!u) return;
        await postgres.query(
            `INSERT INTO ${t}
                (id, name, phone, email, specialty, color, commission_rate, avatar_url, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,NULL,$5,0,NULL,$6,NOW(),NOW())
             ON CONFLICT (id) DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = NOW()`,
            [id, (u.full_name || u.username || '').trim() || u.username, u.phone ?? null, u.email ?? null, '#9333ea', active]
        );
    },

    // =========================================================================
    // SERVICES  (firm card table: rex_{firm}_beauty_services)
    // =========================================================================
    async getServices(): Promise<BeautyService[]> {
        const seen = new Set<string>();
        const out: BeautyService[] = [];

        const firmRaw = String(ERP_SETTINGS.firmNr ?? '001').trim();
        const firmPadded = firmRaw.padStart(3, '0').slice(0, 10);
        const firmCandidates =
            firmPadded === firmRaw ? [firmPadded] : [firmPadded, firmRaw];
        const firmInSql = firmCandidates.map((_, i) => `$${i + 1}`).join(', ');

        const t = postgres.getCardTableName('beauty_services', 'beauty');
        try {
            const { rows: beautyRows } = await postgres.query(
                `SELECT * FROM ${t} WHERE is_active IS NOT FALSE ORDER BY category, name`
            );
            for (const r of beautyRows as Record<string, unknown>[]) {
                const id = String(r.id);
                if (seen.has(id)) continue;
                seen.add(id);
                const raw = r as Record<string, unknown>;
                const a = raw.is_active;
                const isActive = a === undefined || a === null ? true : a !== false;
                out.push({ ...(raw as unknown as BeautyService), is_active: isActive });
            }
        } catch {
            /* beauty_services yok / hata — hizmet kartları (ERP) yine yüklensin */
        }

        const svcTbl = postgres.getCardTableName('services');
        try {
            const { rows: erpRows } = await postgres.query(
                `SELECT * FROM ${svcTbl}
                 WHERE firm_nr IN (${firmInSql})
                   AND (is_active IS NULL OR is_active = true)
                 ORDER BY category NULLS LAST, name`,
                firmCandidates
            );
            for (const r of erpRows as Record<string, unknown>[]) {
                const id = String(r.id);
                if (seen.has(id)) continue;
                seen.add(id);
                out.push(mapFirmServiceRowToBeauty(r));
            }
        } catch {
            /* rex_*_services yoksa veya kolon farkı */
        }

        const prodTbl = postgres.getCardTableName('products');
        try {
            const { rows: prodRows } = await postgres.query(
                `SELECT * FROM ${prodTbl}
                 WHERE firm_nr IN (${firmInSql})
                   AND (is_active IS NULL OR is_active = true)`,
                firmCandidates
            );
            for (const r of prodRows as Record<string, unknown>[]) {
                if (!productRowIsService(r)) continue;
                const id = String(r.id);
                if (seen.has(id)) continue;
                seen.add(id);
                out.push(mapProductServiceRowToBeauty(r));
            }
        } catch {
            /* ürün şeması farklı olabilir */
        }

        out.sort((a, b) => {
            const c = String(a.category ?? '').localeCompare(String(b.category ?? ''), 'tr');
            if (c !== 0) return c;
            return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr');
        });
        return out;
    },

    async createService(data: Partial<BeautyService>): Promise<string> {
        const t = postgres.getCardTableName('beauty_services', 'beauty');
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO ${t}
                (id, name, category, duration_min, price, cost_price, color, commission_rate,
                 description, requires_device, expected_shots, default_sessions, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,NOW(),NOW())`,
            [id, data.name, data.category ?? 'beauty', data.duration_min ?? 30,
             data.price ?? 0, data.cost_price ?? 0, data.color ?? '#9333ea',
             data.commission_rate ?? 0, data.description ?? null,
             data.requires_device ?? false, data.expected_shots ?? 0,
             Math.max(1, Math.round(Number(data.default_sessions ?? 1)))]
        );
        return id;
    },

    async updateService(id: string, data: Partial<BeautyService>): Promise<void> {
        const t = postgres.getCardTableName('beauty_services', 'beauty');
        await postgres.query(
            `UPDATE ${t}
             SET name=$2, category=$3, duration_min=$4, price=$5, cost_price=$6, color=$7,
                 commission_rate=$8, description=$9, requires_device=$10, expected_shots=$11,
                 default_sessions=$12, updated_at=NOW()
             WHERE id=$1`,
            [id, data.name, data.category ?? 'beauty', data.duration_min ?? 30,
             data.price ?? 0, data.cost_price ?? 0, data.color ?? '#9333ea',
             data.commission_rate ?? 0, data.description ?? null,
             data.requires_device ?? false, data.expected_shots ?? 0,
             Math.max(1, Math.round(Number(data.default_sessions ?? 1)))]
        );
    },

    async deleteService(id: string): Promise<void> {
        const t = postgres.getCardTableName('beauty_services', 'beauty');
        await postgres.query(
            `UPDATE ${t} SET is_active=false, updated_at=NOW() WHERE id=$1`, [id]
        );
    },

    // =========================================================================
    // APPOINTMENTS  (period movement table)
    // =========================================================================
    async getAppointments(date: string): Promise<BeautyAppointment[]> {
        return beautyService.getAppointmentsInRange(date, date);
    },

    async getAppointmentsInRange(startDate: string, endDate: string): Promise<BeautyAppointment[]> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const svcBeauty = postgres.getCardTableName('beauty_services', 'beauty');
        const svcFirm = postgres.getCardTableName('services');
        const query = `
            SELECT
                a.id,
                a.client_id        AS customer_id,
                a.service_id,
                a.specialist_id    AS staff_id,
                a.device_id,
                a.body_region_id,
                a.appointment_date AS date,
                a.appointment_time AS time,
                a.appointment_time,
                a.duration,
                a.status,
                a.type,
                a.notes,
                a.total_price,
                a.commission_amount,
                a.is_package_session,
                a.package_purchase_id,
                a.session_series_id,
                a.reminder_sent,
                a.branch_id,
                a.room_id,
                a.tele_meeting_url,
                a.booking_channel,
                a.corporate_account_id,
                a.reminder_sent_at,
                a.last_notification_channel,
                a.confirmation_call_at,
                a.pre_visit_activity_at,
                a.treatment_degree,
                a.treatment_shots,
                a.clinical_data,
                a.created_at,
                COALESCE(s.name, rs.name)   AS service_name,
                COALESCE(s.color, '#6366f1') AS service_color,
                COALESCE(sp.name, u.full_name, u.username) AS specialist_name,
                c.name   AS customer_name,
                d.name   AS device_name
            FROM ${table} a
            LEFT JOIN ${svcBeauty} s ON a.service_id = s.id
            LEFT JOIN ${svcFirm} rs ON a.service_id = rs.id AND rs.firm_nr = $3
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            LEFT JOIN users u ON a.specialist_id = u.id AND lpad(trim(u.firm_nr::text), 3, '0') = $3
            LEFT JOIN ${postgres.getCardTableName('beauty_devices', 'beauty')} d ON a.device_id = d.id
            LEFT JOIN ${postgres.getCardTableName('customers')}                    c  ON a.client_id     = c.id
            WHERE a.appointment_date >= $1 AND a.appointment_date <= $2
            ORDER BY a.appointment_date, a.appointment_time
        `;
        const fn = erpFirmNrForRow();
        const result = await postgres.query(query, [startDate, endDate, fn]);
        return result.rows.map((r: Record<string, unknown> & { clinical_data?: unknown }) => ({
            ...r,
            clinical_data: parseClinicalDataRow(r.clinical_data) ?? undefined,
        })) as BeautyAppointment[];
    },

    async createAppointment(appointment: Partial<BeautyAppointment>): Promise<string> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const id = uuidv4();
        const rawStatus = appointment.status;
        const statusStr =
            typeof rawStatus === 'string' ? rawStatus : rawStatus != null ? String(rawStatus) : 'scheduled';
        const rawType = appointment.type;
        const typeStr =
            typeof rawType === 'string' ? rawType : rawType != null ? String(rawType) : 'regular';
        const dur = Math.max(1, Math.round(Number(appointment.duration ?? 30)) || 30);
        const totalPrice = Number(appointment.total_price ?? 0);
        const comm = Number(appointment.commission_amount ?? 0);
        await postgres.query(`
            INSERT INTO ${table} (
                id, client_id, service_id, specialist_id, device_id, body_region_id,
                appointment_date, appointment_time, duration,
                status, type, notes, total_price, commission_amount, is_package_session, package_purchase_id,
                branch_id, room_id, tele_meeting_url, booking_channel, corporate_account_id,
                session_series_id, treatment_degree, treatment_shots, clinical_data
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
        `, [
            id,
            pgUuidOrNull(appointment.customer_id ?? appointment.client_id),
            pgUuidOrNull(appointment.service_id),
            pgUuidOrNull(appointment.staff_id ?? appointment.specialist_id),
            pgUuidOrNull(appointment.device_id),
            pgUuidOrNull(appointment.body_region_id),
            pgDateOrNull(appointment.date ?? appointment.appointment_date),
            normalizeAppointmentTimeForPg(appointment.time ?? appointment.appointment_time),
            dur,
            statusStr,
            typeStr,
            appointment.notes ?? null,
            totalPrice,
            comm,
            appointment.is_package_session ?? false,
            pgUuidOrNull(appointment.package_purchase_id),
            pgUuidOrNull(appointment.branch_id),
            pgUuidOrNull(appointment.room_id),
            appointment.tele_meeting_url ?? null,
            appointment.booking_channel ?? 'staff',
            pgUuidOrNull(appointment.corporate_account_id),
            pgUuidOrNull(appointment.session_series_id),
            appointment.treatment_degree != null && String(appointment.treatment_degree).trim() !== ''
                ? String(appointment.treatment_degree).trim()
                : null,
            appointment.treatment_shots != null && String(appointment.treatment_shots).trim() !== ''
                ? String(appointment.treatment_shots).trim()
                : null,
            clinicalDataForPgInput(appointment),
        ]);
        return id;
    },

    /** PATCH: yalnızca `patch` içinde tanımlı (undefined olmayan) alanlar güncellenir; diğerleri korunur */
    mergeBeautyAppointmentPatch(current: BeautyAppointment, patch: Partial<BeautyAppointment>): BeautyAppointment {
        const out = { ...current };
        (Object.keys(patch) as (keyof BeautyAppointment)[]).forEach((key) => {
            const v = patch[key];
            if (v !== undefined) {
                (out as Record<string, unknown>)[key as string] = v as unknown;
            }
        });
        return out;
    },

    async updateAppointment(id: string, data: Partial<BeautyAppointment>): Promise<void> {
        const current = await beautyService.getAppointmentById(id);
        if (!current) {
            throw new Error(`beauty appointment not found: ${id}`);
        }
        const merged = beautyService.mergeBeautyAppointmentPatch(current, data);
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const dur = Math.max(1, Math.round(Number(merged.duration ?? 30)) || 30);
        const totalPrice = Number(merged.total_price ?? 0);
        const statusStr =
            typeof merged.status === 'string' ? merged.status : merged.status != null ? String(merged.status) : 'scheduled';
        const degRaw = merged.treatment_degree;
        const shotsRaw = merged.treatment_shots;
        const treatmentDegree =
            degRaw === null || degRaw === undefined
                ? null
                : String(degRaw).trim() === ''
                    ? null
                    : String(degRaw).trim();
        const treatmentShots =
            shotsRaw === null || shotsRaw === undefined
                ? null
                : String(shotsRaw).trim() === ''
                    ? null
                    : String(shotsRaw).trim();
        const clinicalJson = clinicalDataForPgInput(merged);

        await postgres.query(
            `UPDATE ${table}
             SET client_id=$2, service_id=$3, specialist_id=$4, device_id=$5, body_region_id=$6,
                 appointment_date=$7, appointment_time=$8, duration=$9, status=$10,
                 notes=$11, total_price=$12,
                 branch_id=$13, room_id=$14, tele_meeting_url=$15, booking_channel=$16, corporate_account_id=$17,
                 confirmation_call_at=$18, pre_visit_activity_at=$19,
                 treatment_degree=$20, treatment_shots=$21, clinical_data=$22::jsonb,
                 updated_at=NOW()
             WHERE id=$1`,
            [id,
             pgUuidOrNull(merged.customer_id ?? merged.client_id),
             pgUuidOrNull(merged.service_id),
             pgUuidOrNull(merged.staff_id ?? merged.specialist_id),
             pgUuidOrNull(merged.device_id),
             pgUuidOrNull(merged.body_region_id),
             pgDateOrNull(merged.date ?? merged.appointment_date),
             normalizeAppointmentTimeForPg(merged.time ?? merged.appointment_time),
             dur,
             statusStr,
             merged.notes ?? null,
             totalPrice,
             pgUuidOrNull(merged.branch_id),
             pgUuidOrNull(merged.room_id),
             merged.tele_meeting_url ?? null,
             merged.booking_channel ?? null,
             pgUuidOrNull(merged.corporate_account_id),
             pgTimestamptzOrNull(merged.confirmation_call_at),
             pgTimestamptzOrNull(merged.pre_visit_activity_at),
             treatmentDegree,
             treatmentShots,
             JSON.stringify(clinicalJson)]
        );
        if (statusStr === 'cancelled') {
            await beautyService.voidPaidBeautySalesLinkedToAppointment(id);
        }
    },

    /** POS satış notlarında `rex_appt:<uuid>` ile eşlenen ödenmiş kayıtları iptal (ciro dışı). */
    async voidPaidBeautySalesLinkedToAppointment(appointmentId: string): Promise<void> {
        const aid = String(appointmentId ?? '').trim();
        if (!aid) return;
        const table = postgres.getMovementTableName('beauty_sales', 'beauty');
        const needle = `%rex_appt:${aid}%`;
        await postgres.query(
            `UPDATE ${table}
             SET payment_status = 'cancelled'
             WHERE COALESCE(notes, '') LIKE $1
               AND COALESCE(payment_status, 'paid') = 'paid'`,
            [needle]
        );
    },

    /** Yalnızca video / tele alanları — diğer sütunlara dokunmaz */
    async patchAppointmentTele(id: string, teleMeetingUrl: string | null, apptType = 'tele'): Promise<void> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        await postgres.query(
            `UPDATE ${table} SET tele_meeting_url = $2, type = $3, updated_at = NOW() WHERE id = $1`,
            [id, teleMeetingUrl, apptType]
        );
    },

    async updateAppointmentStatus(id: string, status: string): Promise<void> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        await postgres.query(
            `UPDATE ${table} SET status=$1, updated_at=NOW() WHERE id=$2`,
            [status, id]
        );
        if (status === 'completed') {
            try {
                await beautyService.applyConsumableDeductionForAppointment(id);
            } catch {
                /* stok/sarf yoksa sessizce geç */
            }
        }
        if (status === 'cancelled') {
            await beautyService.voidPaidBeautySalesLinkedToAppointment(id);
        }
    },

    async getAppointmentById(id: string): Promise<BeautyAppointment | null> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const { rows } = await postgres.query(`
            SELECT
                a.id,
                a.client_id AS customer_id,
                a.service_id,
                a.specialist_id AS staff_id,
                a.device_id,
                a.body_region_id,
                a.appointment_date AS date,
                a.appointment_time AS time,
                a.appointment_time,
                a.duration,
                a.status,
                a.type,
                a.notes,
                a.total_price,
                a.commission_amount,
                a.is_package_session,
                a.package_purchase_id,
                a.session_series_id,
                a.reminder_sent,
                a.branch_id,
                a.room_id,
                a.tele_meeting_url,
                a.booking_channel,
                a.corporate_account_id,
                a.reminder_sent_at,
                a.last_notification_channel,
                a.confirmation_call_at,
                a.pre_visit_activity_at,
                a.treatment_degree,
                a.treatment_shots,
                a.clinical_data,
                COALESCE(s.name, rs.name) AS service_name,
                COALESCE(sp.name, u.full_name, u.username) AS specialist_name,
                c.name AS customer_name
            FROM ${table} a
            LEFT JOIN ${postgres.getCardTableName('beauty_services', 'beauty')} s ON a.service_id = s.id
            LEFT JOIN ${postgres.getCardTableName('services')} rs ON a.service_id = rs.id AND rs.firm_nr = $2
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            LEFT JOIN users u ON a.specialist_id = u.id AND lpad(trim(u.firm_nr::text), 3, '0') = $2
            LEFT JOIN ${postgres.getCardTableName('customers')} c ON a.client_id = c.id
            WHERE a.id = $1
        `, [id, erpFirmNrForRow()]);
        const row = rows[0] as (BeautyAppointment & { clinical_data?: unknown }) | undefined;
        if (!row) return null;
        const { clinical_data: rawCd, ...rest } = row;
        return {
            ...rest,
            clinical_data: parseClinicalDataRow(rawCd) ?? undefined,
        };
    },

    async getAppointmentsByCustomer(
        customerId: string,
        opts?: BeautyCustomerProfileQueryOpts | null,
    ): Promise<BeautyAppointment[]> {
        const ids = await beautyService.resolveLinkedCustomerIdsForProfile(customerId, opts);
        let parts = filterUuidIds(ids);
        if (!parts.length) {
            parts = filterUuidIds([String(customerId ?? '')]);
        }
        if (!parts.length) return [];
        const profileName = String(opts?.name ?? '').trim();
        const nameForCorp = profileName.length >= 8 ? profileName : null;
        let rows = await fetchBeautyAppointmentsForIds(parts, nameForCorp);
        if (!rows.length && nameForCorp) {
            const extra = await fetchCustomerIdsByExactFirmName(nameForCorp);
            const merged = filterUuidIds([...parts, ...extra]);
            if (merged.length > parts.length) {
                rows = await fetchBeautyAppointmentsForIds(merged, nameForCorp);
            }
        }
        return rows;
    },

    // =========================================================================
    // DEVICES  (firm card table: rex_{firm}_beauty_devices)
    // =========================================================================
    async getDevices(): Promise<BeautyDevice[]> {
        const t = postgres.getCardTableName('beauty_devices', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} WHERE is_active = true ORDER BY name`
        );
        return rows;
    },

    async createDevice(data: Partial<BeautyDevice>): Promise<string> {
        const t = postgres.getCardTableName('beauty_devices', 'beauty');
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO ${t}
                (id, name, device_type, serial_number, manufacturer, model,
                 total_shots, max_shots, maintenance_due, last_maintenance,
                 purchase_date, warranty_expiry, status, notes, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,NOW(),NOW())`,
            [id, data.name, data.device_type ?? 'laser', data.serial_number ?? null,
             data.manufacturer ?? null, data.model ?? null,
             data.total_shots ?? 0, data.max_shots ?? 500000,
             data.maintenance_due ?? null, data.last_maintenance ?? null,
             data.purchase_date ?? null, data.warranty_expiry ?? null,
             data.status ?? 'active', data.notes ?? null]
        );
        return id;
    },

    async updateDevice(id: string, data: Partial<BeautyDevice>): Promise<void> {
        const t = postgres.getCardTableName('beauty_devices', 'beauty');
        await postgres.query(
            `UPDATE ${t}
             SET name=$2, device_type=$3, serial_number=$4, manufacturer=$5, model=$6,
                 max_shots=$7, maintenance_due=$8, last_maintenance=$9,
                 warranty_expiry=$10, status=$11, notes=$12, updated_at=NOW()
             WHERE id=$1`,
            [id, data.name, data.device_type ?? 'laser', data.serial_number ?? null,
             data.manufacturer ?? null, data.model ?? null,
             data.max_shots ?? 500000, data.maintenance_due ?? null,
             data.last_maintenance ?? null, data.warranty_expiry ?? null,
             data.status ?? 'active', data.notes ?? null]
        );
    },

    async recordDeviceUsage(usage: {
        device_id: string;
        appointment_id: string;
        customer_id?: string;
        specialist_id?: string;
        body_region_id?: string;
        shots_used: number;
        expected_shots?: number;
    }): Promise<void> {
        const usageTable = postgres.getMovementTableName('beauty_device_usage', 'beauty');
        const isExcessive = usage.expected_shots
            ? usage.shots_used > usage.expected_shots * 1.2
            : false;

        await postgres.query(`
            INSERT INTO ${usageTable}
                (device_id, appointment_id, customer_id, specialist_id, body_region_id,
                 shots_used, expected_shots, is_excessive, usage_date)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE)
        `, [usage.device_id, usage.appointment_id,
            usage.customer_id ?? null, usage.specialist_id ?? null,
            usage.body_region_id ?? null,
            usage.shots_used, usage.expected_shots ?? 0, isExcessive]);

        const devT = postgres.getCardTableName('beauty_devices', 'beauty');
        await postgres.query(
            `UPDATE ${devT} SET total_shots = total_shots + $1, updated_at=NOW() WHERE id=$2`,
            [usage.shots_used, usage.device_id]
        );

        if (isExcessive) {
            const alertTable = postgres.getMovementTableName('beauty_device_alerts', 'beauty');
            await postgres.query(`
                INSERT INTO ${alertTable} (device_id, alert_type, message, severity)
                VALUES ($1,'excessive_shots',$2,'warning')
            `, [usage.device_id,
                `Bölge için beklenen atım sayısı aşıldı: ${usage.shots_used} atım kullanıldı`]);
        }
    },

    // =========================================================================
    // BODY REGIONS  (shared static table: beauty.body_regions)
    // =========================================================================
    async getBodyRegions(): Promise<BeautyBodyRegion[]> {
        const { rows } = await postgres.query(
            'SELECT * FROM beauty.body_regions ORDER BY sort_order'
        );
        return rows;
    },

    // =========================================================================
    // PACKAGES  (firm card table: rex_{firm}_beauty_packages)
    // =========================================================================
    async getPackages(): Promise<BeautyPackage[]> {
        const { rows } = await postgres.query(
            'SELECT * FROM beauty_packages WHERE is_active = true ORDER BY name'
        );
        return rows;
    },

    async createPackage(data: Partial<BeautyPackage>): Promise<string> {
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO beauty_packages
                (id, name, description, service_id, total_sessions, price, cost_price,
                 discount_pct, validity_days, color, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,NOW(),NOW())`,
            [id, data.name, data.description ?? null, data.service_id ?? null,
             data.total_sessions ?? 1, data.price ?? 0, data.cost_price ?? 0,
             data.discount_pct ?? 0, data.validity_days ?? 365, data.color ?? '#6366f1']
        );
        return id;
    },

    async updatePackage(id: string, data: Partial<BeautyPackage>): Promise<void> {
        await postgres.query(
            `UPDATE beauty_packages
             SET name=$2, description=$3, service_id=$4, total_sessions=$5, price=$6,
                 discount_pct=$7, validity_days=$8, color=$9, updated_at=NOW()
             WHERE id=$1`,
            [id, data.name, data.description ?? null, data.service_id ?? null,
             data.total_sessions ?? 1, data.price ?? 0,
             data.discount_pct ?? 0, data.validity_days ?? 365, data.color ?? '#6366f1']
        );
    },

    async deletePackage(id: string): Promise<void> {
        await postgres.query(
            'UPDATE beauty_packages SET is_active=false, updated_at=NOW() WHERE id=$1', [id]
        );
    },

    async purchasePackage(purchase: Partial<BeautyPackagePurchase>): Promise<string> {
        const saleTable = postgres.getMovementTableName('beauty_package_purchases', 'beauty');
        const id = uuidv4();
        const expiry = purchase.expiry_date ??
            new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        await postgres.query(`
            INSERT INTO ${saleTable}
                (id, customer_id, package_id, total_sessions, used_sessions, remaining_sessions,
                 sale_price, purchase_date, expiry_date, status)
            VALUES ($1,$2,$3,$4,0,$4,$5,CURRENT_DATE,$6,'active')
        `, [id, purchase.customer_id, purchase.package_id,
            purchase.total_sessions ?? 1, purchase.sale_price ?? 0, expiry]);
        return id;
    },

    async getCustomerPackages(
        customerId: string,
        opts?: BeautyCustomerProfileQueryOpts | null,
    ): Promise<BeautyPackagePurchase[]> {
        const ids = await beautyService.resolveLinkedCustomerIdsForProfile(customerId, opts);
        let parts = filterUuidIds(ids);
        if (!parts.length) {
            parts = filterUuidIds([String(customerId ?? '')]);
        }
        if (!parts.length) return [];
        const t = postgres.getMovementTableName('beauty_package_purchases', 'beauty');
        const pt = postgres.getCardTableName('beauty_packages', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const loadPkgs = async (p: string[]) => {
            if (!p.length) return [];
            const inList = p.map((_, i) => `$${i + 1}`).join(', ');
            const { rows } = await postgres.query(
                `
                SELECT pp.*, p.name AS package_name, c.name AS customer_name
                FROM ${t} pp
                LEFT JOIN ${pt} p ON pp.package_id = p.id
                LEFT JOIN ${ct} c ON pp.customer_id = c.id
                WHERE pp.customer_id IN (${inList})
                ORDER BY pp.purchase_date DESC
            `,
                p,
            );
            return rows;
        };
        let rows = await loadPkgs(parts);
        if (!rows.length && opts?.name && String(opts.name).trim().length >= 8) {
            const extra = await fetchCustomerIdsByExactFirmName(String(opts.name).trim());
            const merged = filterUuidIds([...parts, ...extra]);
            if (merged.length > parts.length) {
                rows = await loadPkgs(merged);
            }
        }
        return rows;
    },

    /**
     * Paket veya «normal hizmet» ile her ayın aynı günü N seans planı.
     * Paket: satış + paket seansı; hizmet: paket satışı yok, `default_sessions` / `session_count` ile.
     */
    async createMonthlySessionSeries(input: {
        customer_id: string;
        first_session_date: string;
        appointment_time: string;
        specialist_id?: string;
        service_id?: string;
        branch_id?: string;
        room_id?: string;
        device_id?: string;
        package_id?: string;
        existing_package_purchase_id?: string;
        /** Hizmet planında paket seans sayısı yerine (hizmet kartı default’u da kullanılabilir) */
        session_count?: number;
    }): Promise<{ series_id: string; purchase_id: string | null; appointment_ids: string[] }> {
        const firstY = pgDateOrNull(input.first_session_date);
        if (!firstY) throw new Error('Geçerli ilk seans tarihi girin');
        const timeNorm = normalizeAppointmentTimeForPg(input.appointment_time) || '09:00:00';
        const timeUi = timeNorm.slice(0, 5);

        if (input.package_id) {
            const pkgT = postgres.getCardTableName('beauty_packages', 'beauty');
            const { rows: prow } = await postgres.query(
                `SELECT * FROM ${pkgT} WHERE id = $1 AND COALESCE(is_active, true) = true`,
                [input.package_id]
            );
            const pkg = prow[0] as Record<string, unknown> | undefined;
            if (!pkg) throw new Error('Paket bulunamadı');
            const totalSessions = Math.max(1, Math.round(Number(pkg.total_sessions ?? 1)));
            const dates = computeMonthlySameDayDates(firstY, totalSessions);
            if (dates.length !== totalSessions) throw new Error('Seans tarihleri üretilemedi');

            const saleTable = postgres.getMovementTableName('beauty_package_purchases', 'beauty');
            let purchaseId: string;
            let salePrice = Number(pkg.price ?? 0);
            const validityDays = Math.max(1, Math.round(Number(pkg.validity_days ?? 365)));
            const expiryDate = addDaysYmd(firstY, validityDays);

            if (input.existing_package_purchase_id) {
                const { rows: ppr } = await postgres.query(
                    `SELECT * FROM ${saleTable} WHERE id = $1`,
                    [input.existing_package_purchase_id]
                );
                const pp = ppr[0] as Record<string, unknown> | undefined;
                if (!pp) throw new Error('Paket satış kaydı bulunamadı');
                if (String(pp.customer_id) !== String(input.customer_id)) throw new Error('Satış müşteriye ait değil');
                if (String(pp.package_id) !== String(input.package_id)) throw new Error('Satış farklı pakete ait');
                const rem = Math.max(0, Math.round(Number(pp.remaining_sessions ?? 0)));
                if (rem < totalSessions) {
                    throw new Error(`Pakette yeterli kalan seans yok (kalan: ${rem}, gerekli: ${totalSessions})`);
                }
                purchaseId = input.existing_package_purchase_id;
                salePrice = Number(pp.sale_price ?? salePrice);
            } else {
                purchaseId = await beautyService.purchasePackage({
                    customer_id: input.customer_id,
                    package_id: input.package_id,
                    total_sessions: totalSessions,
                    sale_price: salePrice,
                    expiry_date: expiryDate,
                });
            }

            const seriesId = uuidv4();
            const svcId = pgUuidOrNull(input.service_id ?? pkg.service_id);
            let duration = 30;
            if (svcId) {
                const svt = postgres.getCardTableName('beauty_services', 'beauty');
                const { rows: sr } = await postgres.query(
                    `SELECT duration_min FROM ${svt} WHERE id = $1`,
                    [svcId]
                );
                if (sr[0]?.duration_min != null) {
                    duration = Math.max(1, Math.round(Number((sr[0] as { duration_min?: unknown }).duration_min)));
                }
            }
            const priceEach = totalSessions > 0 ? Math.round((salePrice / totalSessions) * 100) / 100 : 0;
            const appointmentIds: string[] = [];

            for (let i = 0; i < dates.length; i++) {
                const aid = await beautyService.createAppointment({
                    customer_id: input.customer_id,
                    service_id: svcId ?? undefined,
                    specialist_id: input.specialist_id,
                    date: dates[i],
                    time: timeUi,
                    duration,
                    total_price: priceEach,
                    status: AppointmentStatus.SCHEDULED,
                    type: 'monthly_series',
                    is_package_session: true,
                    package_purchase_id: purchaseId,
                    session_series_id: seriesId,
                    branch_id: input.branch_id,
                    room_id: input.room_id,
                    device_id: input.device_id,
                    notes: `Aylık paket seansı ${i + 1}/${totalSessions} — Saat, seanstan 1 gün önce kesinleşir`,
                });
                appointmentIds.push(aid);
            }

            return { series_id: seriesId, purchase_id: purchaseId, appointment_ids: appointmentIds };
        }

        if (input.service_id) {
            const resolved = await resolveServiceForMonthlySeries(input.service_id);
            if (!resolved) throw new Error('Hizmet bulunamadı');
            const totalSessions = Math.max(1, Math.round(
                input.session_count ?? resolved.default_sessions ?? 1
            ));
            const dates = computeMonthlySameDayDates(firstY, totalSessions);
            if (dates.length !== totalSessions) throw new Error('Seans tarihleri üretilemedi');

            const seriesId = uuidv4();
            const priceEach = totalSessions > 0 ? Math.round((resolved.price / totalSessions) * 100) / 100 : 0;
            const appointmentIds: string[] = [];

            for (let i = 0; i < dates.length; i++) {
                const aid = await beautyService.createAppointment({
                    customer_id: input.customer_id,
                    service_id: input.service_id,
                    specialist_id: input.specialist_id,
                    date: dates[i],
                    time: timeUi,
                    duration: resolved.duration_min,
                    total_price: priceEach,
                    status: AppointmentStatus.SCHEDULED,
                    type: 'monthly_series',
                    is_package_session: false,
                    session_series_id: seriesId,
                    branch_id: input.branch_id,
                    room_id: input.room_id,
                    device_id: input.device_id,
                    notes: `Aylık seans ${i + 1}/${totalSessions} (${resolved.name}) — Saat, seanstan 1 gün önce kesinleşir`,
                });
                appointmentIds.push(aid);
            }

            return { series_id: seriesId, purchase_id: null, appointment_ids: appointmentIds };
        }

        throw new Error('Paket veya hizmet seçin');
    },

    async listMonthlySessionSeriesReport(): Promise<
        {
            session_series_id: string;
            customer_name: string | null;
            phone: string | null;
            package_name: string | null;
            purchase_id: string | null;
            total_sessions: number;
            completed_sessions: number;
            next_appointment_date: string | null;
            last_appointment_date: string | null;
        }[]
    > {
        const apt = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const ppt = postgres.getMovementTableName('beauty_package_purchases', 'beauty');
        const pkgT = postgres.getCardTableName('beauty_packages', 'beauty');
        const bs = postgres.getCardTableName('beauty_services', 'beauty');
        const { rows } = await postgres.query(`
            SELECT
              a.session_series_id::text AS session_series_id,
              MAX(c.name) AS customer_name,
              MAX(c.phone)::text AS phone,
              MAX(COALESCE(pkg.name, bs.name)) AS package_name,
              MAX(pp.id::text) AS purchase_id,
              COUNT(*)::int AS total_sessions,
              COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed_sessions,
              MIN(a.appointment_date) FILTER (WHERE a.status IN ('scheduled','confirmed','in_progress')) AS next_appointment_date,
              MAX(a.appointment_date) AS last_appointment_date
            FROM ${apt} a
            LEFT JOIN ${ct} c ON a.client_id = c.id
            LEFT JOIN ${ppt} pp ON a.package_purchase_id = pp.id
            LEFT JOIN ${pkgT} pkg ON pp.package_id = pkg.id
            LEFT JOIN ${bs} bs ON a.service_id = bs.id
            WHERE a.session_series_id IS NOT NULL
            GROUP BY a.session_series_id
            ORDER BY
              MIN(a.appointment_date) FILTER (WHERE a.status IN ('scheduled','confirmed','in_progress')) NULLS LAST,
              MAX(c.name) NULLS LAST
        `);
        return rows as {
            session_series_id: string;
            customer_name: string | null;
            phone: string | null;
            package_name: string | null;
            purchase_id: string | null;
            total_sessions: number;
            completed_sessions: number;
            next_appointment_date: string | null;
            last_appointment_date: string | null;
        }[];
    },

    async sendWhatsAppForNextSessionInSeries(sessionSeriesId: string): Promise<{ success: boolean; error?: string }> {
        const apt = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const svcB = postgres.getCardTableName('beauty_services', 'beauty');
        const svcF = postgres.getCardTableName('services');
        const fn = erpFirmNrForRow();
        const { rows } = await postgres.query(
            `SELECT a.appointment_date, a.appointment_time,
                    c.name AS customer_name, c.phone::text AS phone,
                    COALESCE(sb.name, sf.name) AS service_name
             FROM ${apt} a
             LEFT JOIN ${ct} c ON a.client_id = c.id
             LEFT JOIN ${svcB} sb ON a.service_id = sb.id
             LEFT JOIN ${svcF} sf ON a.service_id = sf.id AND sf.firm_nr = $2
             WHERE a.session_series_id = $1
               AND a.status IN ('scheduled','confirmed')
             ORDER BY a.appointment_date, a.appointment_time
             LIMIT 1`,
            [sessionSeriesId, fn]
        );
        const r = rows[0] as Record<string, unknown> | undefined;
        if (!r) return { success: false, error: 'Bekleyen seans yok' };
        const phone = r.phone != null ? String(r.phone).trim() : '';
        if (!phone) return { success: false, error: 'Müşteri telefonu yok' };
        const settings = (await beautyService.getPortalSettings()) as ClinicMessagingPortalConfig | null;
        if (!settings) return { success: false, error: 'Portal ayarı yok' };
        const tstr = r.appointment_time != null ? String(r.appointment_time).slice(0, 5) : '';
        const dstr = r.appointment_date != null ? String(r.appointment_date) : '';
        const name = r.customer_name != null ? String(r.customer_name) : 'Merhaba';
        const svc = r.service_name != null ? String(r.service_name) : 'seans';
        const text =
            `Merhaba ${name}, ${dstr} ${tstr} tarihindeki ${svc} seansınızı hatırlatmak istedik. İyi günler.`;
        return sendWhatsAppText(settings, phone, text);
    },

    // =========================================================================
    // LEADS  (firm card table: rex_{firm}_beauty_leads)
    // =========================================================================
    async getLeads(): Promise<BeautyLead[]> {
        const lt = postgres.getCardTableName('beauty_leads', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${lt} ORDER BY created_at DESC`
        );
        return rows;
    },

    async createLead(data: Partial<BeautyLead>): Promise<string> {
        const lt = postgres.getCardTableName('beauty_leads', 'beauty');
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO ${lt}
                (id, name, phone, email, source, status, notes, assigned_to,
                 first_contact_date, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,NOW(),NOW())`,
            [id, data.name, data.phone ?? null, data.email ?? null,
             data.source ?? 'other', data.status ?? 'new',
             data.notes ?? null, data.assigned_to ?? null]
        );
        return id;
    },

    async updateLead(id: string, data: Partial<BeautyLead>): Promise<void> {
        const lt = postgres.getCardTableName('beauty_leads', 'beauty');
        await postgres.query(
            `UPDATE ${lt}
             SET name=$2, phone=$3, email=$4, source=$5, status=$6, notes=$7,
                 last_contact_date=CURRENT_DATE, lost_reason=$8, updated_at=NOW()
             WHERE id=$1`,
            [id, data.name, data.phone ?? null, data.email ?? null,
             data.source ?? 'other', data.status ?? 'new',
             data.notes ?? null, data.lost_reason ?? null]
        );
    },

    async convertLeadToCustomer(leadId: string): Promise<string> {
        const lt = postgres.getCardTableName('beauty_leads', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const leadRes = await postgres.query(`SELECT * FROM ${lt} WHERE id=$1`, [leadId]);
        const lead = leadRes.rows[0] as BeautyLead;
        if (!lead) throw new Error('Lead bulunamadı');

        const customerId = await beautyService.createCustomer({
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            notes: lead.notes,
        });

        await postgres.query(
            `UPDATE ${lt} SET status='converted', converted_customer_id=$1, updated_at=NOW() WHERE id=$2`,
            [customerId, leadId]
        );
        return customerId;
    },

    /** Müşteriye bağlı CRM (lead) kayıtları: dönüşüm + telefon/e-posta eşleşmesi */
    async getLeadsLinkedToCustomer(
        customerId: string,
        phone?: string | null,
        email?: string | null
    ): Promise<BeautyLead[]> {
        const lt = postgres.getCardTableName('beauty_leads', 'beauty');
        const p = phone?.trim() || null;
        const e = email?.trim().toLowerCase() || null;
        const { rows } = await postgres.query(
            `SELECT * FROM ${lt}
             WHERE converted_customer_id = $1
                OR ($2::text IS NOT NULL AND phone IS NOT NULL AND TRIM(phone) = $2)
                OR ($3::text IS NOT NULL AND email IS NOT NULL AND LOWER(TRIM(email)) = $3)
             ORDER BY created_at DESC NULLS LAST`,
            [customerId, p, e]
        );
        return rows;
    },

    // =========================================================================
    // SATISFACTION SURVEYS  (firm card tables — çok dilli sorular)
    // =========================================================================
    parseSatisfactionLabels(raw: unknown): BeautySatisfactionLabels {
        if (!raw || typeof raw !== 'object') return {};
        const o = raw as Record<string, unknown>;
        const out: BeautySatisfactionLabels = {};
        for (const k of ['tr', 'en', 'ar', 'ku'] as const) {
            if (typeof o[k] === 'string') out[k] = o[k];
        }
        return out;
    },

    async getSatisfactionSurveys(): Promise<BeautySatisfactionSurvey[]> {
        const t = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} ORDER BY sort_order ASC, created_at ASC`
        );
        return rows;
    },

    async getSatisfactionQuestions(surveyId: string): Promise<BeautySatisfactionQuestion[]> {
        const t = postgres.getCardTableName('beauty_satisfaction_questions', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} WHERE survey_id = $1 ORDER BY sort_order ASC, created_at ASC`,
            [surveyId]
        );
        return rows.map((r: BeautySatisfactionQuestion & { labels_json: unknown }) => ({
            ...r,
            labels_json: beautyService.parseSatisfactionLabels(r.labels_json),
        }));
    },

    async getActiveSatisfactionSurveyWithQuestions(): Promise<{
        survey: BeautySatisfactionSurvey | null;
        questions: BeautySatisfactionQuestion[];
    }> {
        const st = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${st} WHERE is_active = true ORDER BY sort_order ASC, created_at ASC LIMIT 1`
        );
        const survey = (rows[0] as BeautySatisfactionSurvey | undefined) ?? null;
        if (!survey) return { survey: null, questions: [] };
        const questions = await beautyService.getSatisfactionQuestions(survey.id);
        return { survey, questions };
    },

    async deactivateOtherSatisfactionSurveys(exceptId: string): Promise<void> {
        const t = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
        await postgres.query(
            `UPDATE ${t} SET is_active = false, updated_at = NOW() WHERE id <> $1 AND is_active = true`,
            [exceptId]
        );
    },

    async createSatisfactionSurvey(data: Partial<BeautySatisfactionSurvey>): Promise<string> {
        const t = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, name, is_active, sort_order) VALUES ($1,$2,$3,$4)`,
            [id, data.name ?? 'Anket', data.is_active ?? false, data.sort_order ?? 0]
        );
        if (data.is_active) await beautyService.deactivateOtherSatisfactionSurveys(id);
        return id;
    },

    async updateSatisfactionSurvey(id: string, data: Partial<BeautySatisfactionSurvey>): Promise<void> {
        const t = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${t} WHERE id = $1`, [id]);
        const row = rows[0] as BeautySatisfactionSurvey | undefined;
        if (!row) return;
        const merged = {
            name: data.name !== undefined ? data.name : row.name,
            is_active: data.is_active !== undefined ? data.is_active : row.is_active,
            sort_order: data.sort_order !== undefined ? data.sort_order : row.sort_order,
        };
        await postgres.query(
            `UPDATE ${t} SET name = $2, is_active = $3, sort_order = $4, updated_at = NOW() WHERE id = $1`,
            [id, merged.name, merged.is_active, merged.sort_order]
        );
        if (merged.is_active) await beautyService.deactivateOtherSatisfactionSurveys(id);
    },

    async deleteSatisfactionSurvey(id: string): Promise<void> {
        const t = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
        await postgres.query(`DELETE FROM ${t} WHERE id = $1`, [id]);
    },

    async createSatisfactionQuestion(data: Partial<BeautySatisfactionQuestion>): Promise<string> {
        if (!data.survey_id) throw new Error('createSatisfactionQuestion: survey_id gerekli');
        const t = postgres.getCardTableName('beauty_satisfaction_questions', 'beauty');
        const id = uuidv4();
        const labels = data.labels_json ?? {};
        await postgres.query(
            `INSERT INTO ${t}
                (id, survey_id, sort_order, question_type, scale_max, is_required, labels_json)
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
            [
                id,
                data.survey_id!,
                data.sort_order ?? 0,
                data.question_type ?? 'rating',
                data.scale_max ?? 5,
                data.is_required ?? true,
                JSON.stringify(labels),
            ]
        );
        return id;
    },

    async updateSatisfactionQuestion(id: string, data: Partial<BeautySatisfactionQuestion>): Promise<void> {
        const t = postgres.getCardTableName('beauty_satisfaction_questions', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${t} WHERE id = $1`, [id]);
        const row = rows[0] as (BeautySatisfactionQuestion & { labels_json: unknown }) | undefined;
        if (!row) return;
        const curLabels = beautyService.parseSatisfactionLabels(row.labels_json);
        const mergedLabels = data.labels_json !== undefined ? data.labels_json : curLabels;
        await postgres.query(
            `UPDATE ${t}
             SET sort_order = $2, question_type = $3, scale_max = $4, is_required = $5,
                 labels_json = $6::jsonb, updated_at = NOW()
             WHERE id = $1`,
            [
                id,
                data.sort_order !== undefined ? data.sort_order : row.sort_order,
                data.question_type !== undefined ? data.question_type : row.question_type,
                data.scale_max !== undefined ? data.scale_max : row.scale_max,
                data.is_required !== undefined ? data.is_required : row.is_required,
                JSON.stringify(mergedLabels),
            ]
        );
    },

    async deleteSatisfactionQuestion(id: string): Promise<void> {
        const t = postgres.getCardTableName('beauty_satisfaction_questions', 'beauty');
        await postgres.query(`DELETE FROM ${t} WHERE id = $1`, [id]);
    },

    // =========================================================================
    // CUSTOMER FEEDBACK  (period movement table)
    // =========================================================================
    parseFeedbackRow(row: BeautyCustomerFeedback & { survey_answers?: unknown }): BeautyCustomerFeedback {
        let survey_answers = row.survey_answers as BeautyCustomerFeedback['survey_answers'];
        if (survey_answers && typeof survey_answers === 'string') {
            try {
                survey_answers = JSON.parse(survey_answers as unknown as string);
            } catch {
                survey_answers = null;
            }
        }
        return { ...row, survey_answers };
    },

    async addFeedback(feedback: Partial<BeautyCustomerFeedback>): Promise<void> {
        const table = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const id = uuidv4();
        const rawAnswers =
            feedback.survey_answers && feedback.survey_answers.length
                ? feedback.survey_answers
                : null;
        await postgres.query(`
            INSERT INTO ${table}
                (id, appointment_id, customer_id, service_rating, staff_rating,
                 cleanliness_rating, overall_rating, comment, would_recommend,
                 survey_id, survey_answers)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
        `, [
            id,
            feedback.appointment_id ?? null,
            feedback.customer_id ?? null,
            feedback.service_rating ?? 5,
            feedback.staff_rating ?? 5,
            feedback.cleanliness_rating ?? 5,
            feedback.overall_rating ?? 5,
            feedback.comment ?? null,
            feedback.would_recommend ?? true,
            feedback.survey_id ?? null,
            rawAnswers,
        ]);
    },

    async getFeedbackForAppointment(appointmentId: string): Promise<BeautyCustomerFeedback | null> {
        const table = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${table} WHERE appointment_id=$1 ORDER BY created_at DESC NULLS LAST LIMIT 1`,
            [appointmentId]
        );
        const row = rows[0] as BeautyCustomerFeedback | undefined;
        return row ? beautyService.parseFeedbackRow(row as BeautyCustomerFeedback & { survey_answers?: unknown }) : null;
    },

    async upsertFeedbackForAppointment(
        feedback: Partial<BeautyCustomerFeedback> & { appointment_id: string; customer_id: string }
    ): Promise<void> {
        const table = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const existing = await beautyService.getFeedbackForAppointment(feedback.appointment_id);
        const mergedAnswers =
            feedback.survey_answers !== undefined
                ? feedback.survey_answers && feedback.survey_answers.length
                    ? feedback.survey_answers
                    : null
                : existing?.survey_answers ?? null;
        if (existing?.id) {
            await postgres.query(
                `UPDATE ${table} SET
                    service_rating = $2,
                    staff_rating = $3,
                    cleanliness_rating = $4,
                    overall_rating = $5,
                    comment = $6,
                    would_recommend = $7,
                    survey_id = $8,
                    survey_answers = $9::jsonb
                 WHERE id = $1`,
                [
                    existing.id,
                    feedback.service_rating ?? existing.service_rating ?? 5,
                    feedback.staff_rating ?? existing.staff_rating ?? 5,
                    feedback.cleanliness_rating ?? existing.cleanliness_rating ?? 5,
                    feedback.overall_rating ?? existing.overall_rating ?? 5,
                    feedback.comment ?? existing.comment ?? null,
                    feedback.would_recommend ?? existing.would_recommend ?? true,
                    feedback.survey_id ?? existing.survey_id ?? null,
                    mergedAnswers,
                ]
            );
        } else {
            await beautyService.addFeedback({ ...feedback, survey_answers: mergedAnswers ?? feedback.survey_answers });
        }
    },

    async getCustomerContact(customerId: string): Promise<{ name: string; phone: string | null; email: string | null } | null> {
        const ct = postgres.getCardTableName('customers');
        const { rows } = await postgres.query<{ name?: string; phone?: string; email?: string }>(
            `SELECT name, phone, email FROM ${ct} WHERE id = $1 LIMIT 1`,
            [customerId]
        );
        const r = rows[0];
        if (!r) return null;
        return {
            name: String(r.name ?? ''),
            phone: r.phone != null && String(r.phone).trim() !== '' ? String(r.phone).trim() : null,
            email: r.email != null && String(r.email).trim() !== '' ? String(r.email).trim() : null,
        };
    },

    /** CRM: randevu satırına bağlı müşteri takip notları (audit log) */
    async logCrmActivity(
        appointmentId: string,
        userId: string | null,
        payload: { preset?: string; note?: string; label?: string }
    ): Promise<void> {
        await beautyService.appendAuditLog('beauty_appointments', 'crm_activity', appointmentId, userId, payload);
    },

    /** Randevu CRM aktivitesini, eşleşen lead kayıtlarının not alanına ekler (Lead yönetimi ekranında görünür). */
    async syncCrmActivityToLeadNotes(customerId: string, activityLine: string): Promise<void> {
        const line = String(activityLine ?? '').trim();
        if (!line) return;
        const contact = await beautyService.getCustomerContact(customerId);
        if (!contact) return;
        const leads = await beautyService.getLeadsLinkedToCustomer(customerId, contact.phone, contact.email);
        if (!leads.length) return;
        const lt = postgres.getCardTableName('beauty_leads', 'beauty');
        const stamp = new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
        const block = `[${stamp}] ${line}`;
        for (const lead of leads) {
            const prev = (lead.notes != null ? String(lead.notes) : '').trim();
            const next = prev ? `${prev}\n\n${block}` : block;
            await postgres.query(
                `UPDATE ${lt}
                 SET notes = $2, last_contact_date = CURRENT_DATE, updated_at = NOW()
                 WHERE id = $1`,
                [lead.id, next]
            );
        }
    },

    async getCrmActivitiesForAppointment(appointmentId: string): Promise<
        { id: string; created_at: string; payload_json: Record<string, unknown> }[]
    > {
        const t = postgres.getMovementTableName('beauty_audit_log', 'beauty');
        /** `table_name = 'beauty_appointments'` SQL literal yazılamaz: pg.query tablo adı rewrite ile
         *  `'beauty_appointments'` → `beauty.rex_*_beauty_appointments` olur; INSERT ise parametre ile doğru kalır. */
        const { rows } = await postgres.query(
            `SELECT id, created_at, payload_json
             FROM ${t}
             WHERE table_name = $1
               AND record_id = $2::uuid
               AND action = $3
             ORDER BY created_at DESC
             LIMIT 100`,
            ['beauty_appointments', appointmentId, 'crm_activity']
        );
        return rows.map((r: { id: string; created_at: string; payload_json: unknown }) => ({
            id: String(r.id),
            created_at: String(r.created_at),
            payload_json:
                typeof r.payload_json === 'string'
                    ? (JSON.parse(r.payload_json) as Record<string, unknown>)
                    : (r.payload_json as Record<string, unknown>) ?? {},
        }));
    },

    async getFeedbackByCustomer(
        customerId: string,
        opts?: BeautyCustomerProfileQueryOpts | null,
    ): Promise<BeautyCustomerFeedback[]> {
        const ids = await beautyService.resolveLinkedCustomerIdsForProfile(customerId, opts);
        let parts = filterUuidIds(ids);
        if (!parts.length) {
            parts = filterUuidIds([String(customerId ?? '')]);
        }
        if (!parts.length) return [];
        const runFb = async (p: string[]) => {
            const inList = p.map((_, i) => `$${i + 1}`).join(', ');
            const table = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
            const { rows } = await postgres.query(
                `SELECT * FROM ${table} WHERE customer_id IN (${inList}) ORDER BY created_at DESC NULLS LAST`,
                p,
            );
            return rows;
        };
        let rows = await runFb(parts);
        if (!rows.length && opts?.name && String(opts.name).trim().length >= 8) {
            const extra = await fetchCustomerIdsByExactFirmName(String(opts.name).trim());
            const merged = filterUuidIds([...parts, ...extra]);
            if (merged.length > parts.length) {
                rows = await runFb(merged);
            }
        }
        return rows.map((r: BeautyCustomerFeedback & { survey_answers?: unknown }) =>
            beautyService.parseFeedbackRow(r)
        );
    },

    // =========================================================================
    // SALES  (period movement table)
    // =========================================================================
    async getSales(): Promise<BeautySale[]> {
        const t = postgres.getMovementTableName('beauty_sales', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const { rows } = await postgres.query(`
            SELECT s.*, c.name AS customer_name
            FROM ${t} s
            LEFT JOIN ${ct} c ON s.customer_id = c.id
            ORDER BY s.created_at DESC LIMIT 100
        `);
        return rows;
    },

    async getSalesByCustomer(
        customerId: string,
        opts?: BeautyCustomerProfileQueryOpts | null,
    ): Promise<BeautySale[]> {
        const ids = await beautyService.resolveLinkedCustomerIdsForProfile(customerId, opts);
        let parts = filterUuidIds(ids);
        if (!parts.length) {
            parts = filterUuidIds([String(customerId ?? '')]);
        }
        if (!parts.length) return [];
        const st = postgres.getMovementTableName('beauty_sales', 'beauty');
        const it = postgres.getMovementTableName('beauty_sale_items', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const loadSales = async (p: string[]): Promise<BeautySale[]> => {
            if (!p.length) return [];
            const inList = p.map((_, i) => `$${i + 1}`).join(', ');
            const { rows: sales } = await postgres.query(
                `SELECT s.*, c.name AS customer_name
                 FROM ${st} s
                 LEFT JOIN ${ct} c ON s.customer_id = c.id
                 WHERE s.customer_id IN (${inList})
                 ORDER BY s.created_at DESC NULLS LAST
                 LIMIT 400`,
                p,
            );
            if (!sales.length) return [];
            const saleIds = sales.map((s: { id: string }) => s.id);
            const saleParts = filterUuidIds(saleIds);
            if (!saleParts.length) return sales.map((s: BeautySale) => ({ ...s, items: [] }));
            const saleIn = saleParts.map((_, i) => `$${i + 1}`).join(', ');
            const { rows: allItems } = await postgres.query(
                `SELECT * FROM ${it} WHERE sale_id IN (${saleIn})`,
                saleParts,
            );
            const bySale = new Map<string, BeautySaleItem[]>();
            for (const row of allItems) {
                const arr = bySale.get(row.sale_id) ?? [];
                arr.push(row as BeautySaleItem);
                bySale.set(row.sale_id, arr);
            }
            return sales.map((s: BeautySale) => ({ ...s, items: bySale.get(s.id) ?? [] }));
        };
        let out = await loadSales(parts);
        if (!out.length && opts?.name && String(opts.name).trim().length >= 8) {
            const extra = await fetchCustomerIdsByExactFirmName(String(opts.name).trim());
            const merged = filterUuidIds([...parts, ...extra]);
            if (merged.length > parts.length) {
                out = await loadSales(merged);
            }
        }
        return out;
    },

    /**
     * Günlük / Z raporu: yerel YYYY-MM-DD gününe düşen ödenmiş güzellik satışları (kalemler dahil).
     * Ana ERP `sales` tablosundan ayrı tutulduğu için rapor modülü burayı birleştirir.
     */
    async getSalesWithItemsForLocalCalendarDay(ymd: string): Promise<BeautySale[]> {
        const { startIso, endIso } = localYmdToIsoRange(ymd);
        const st = postgres.getMovementTableName('beauty_sales', 'beauty');
        const it = postgres.getMovementTableName('beauty_sale_items', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const { rows: salesRows } = await postgres.query(
            `SELECT s.*, c.name AS customer_name
             FROM ${st} s
             LEFT JOIN ${ct} c ON s.customer_id = c.id
             WHERE s.created_at >= $1 AND s.created_at <= $2
               AND COALESCE(s.payment_status, 'paid') = 'paid'
             ORDER BY s.created_at ASC`,
            [startIso, endIso]
        );
        if (!salesRows.length) return [];
        const saleIds = salesRows.map((s: { id: string }) => s.id);
        const { rows: allItems } = await postgres.query(
            `SELECT * FROM ${it} WHERE sale_id = ANY($1::uuid[])`,
            [saleIds]
        );
        const bySale = new Map<string, BeautySaleItem[]>();
        for (const row of allItems) {
            const arr = bySale.get(row.sale_id) ?? [];
            arr.push(row as BeautySaleItem);
            bySale.set(row.sale_id, arr);
        }
        return salesRows.map((s: BeautySale) => ({ ...s, items: bySale.get(s.id) ?? [] }));
    },

    /**
     * Excel / yedek: yerel gün aralığında güzellik satışları + kalemler + müşteri kodu.
     * `payment_status` filtresi yok (paid / pending / cancelled hepsi listelenir; Excel’de süzebilirsiniz).
     */
    async getSalesWithItemsForExportRange(startYmd: string, endYmd: string): Promise<BeautySale[]> {
        const { startIso } = localYmdToIsoRange(startYmd);
        const { endIso } = localYmdToIsoRange(endYmd);
        const st = postgres.getMovementTableName('beauty_sales', 'beauty');
        const it = postgres.getMovementTableName('beauty_sale_items', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const fn = erpFirmNrForRow();
        const { rows: salesRows } = await postgres.query(
            `SELECT s.*, c.name AS customer_name, c.code AS customer_code
             FROM ${st} s
             LEFT JOIN ${ct} c ON s.customer_id = c.id AND lpad(trim(c.firm_nr::text), 3, '0') = $3
             WHERE s.created_at >= $1 AND s.created_at <= $2
             ORDER BY s.created_at DESC
             LIMIT 50000`,
            [startIso, endIso, fn]
        );
        if (!salesRows.length) return [];
        const saleIds = salesRows.map((s: { id: string }) => s.id);
        const { rows: allItems } = await postgres.query(
            `SELECT * FROM ${it} WHERE sale_id = ANY($1::uuid[])`,
            [saleIds]
        );
        const bySale = new Map<string, BeautySaleItem[]>();
        for (const row of allItems) {
            const arr = bySale.get(row.sale_id) ?? [];
            arr.push(row as BeautySaleItem);
            bySale.set(row.sale_id, arr);
        }
        return salesRows.map((s: BeautySale & { customer_code?: string }) => ({
            ...s,
            items: bySale.get(s.id) ?? [],
        }));
    },

    /**
     * Güzellik satışı + kalemler. `skipErpAndLoyalty`: yalnızca beauty şeması (kalem ayrı fiş);
     * sonra `syncBeautyCheckoutToErp` ile tek tahsilat.
     */
    async createSale(
        sale: Partial<BeautySale>,
        items: Partial<BeautySaleItem>[],
        opts?: { skipErpAndLoyalty?: boolean },
    ): Promise<string> {
        const st = postgres.getMovementTableName('beauty_sales', 'beauty');
        const it = postgres.getMovementTableName('beauty_sale_items', 'beauty');
        const id = uuidv4();
        const invoiceNumber = `BEA-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

        await postgres.query(`
            INSERT INTO ${st}
                (id, invoice_number, customer_id, subtotal, discount, tax, total,
                 payment_method, payment_status, paid_amount, remaining_amount, notes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `, [id, invoiceNumber, pgUuidOrNull(sale.customer_id),
            sale.subtotal ?? 0, sale.discount ?? 0, sale.tax ?? 0, sale.total ?? 0,
            sale.payment_method ?? 'cash', sale.payment_status ?? 'paid',
            sale.paid_amount ?? sale.total ?? 0,
            sale.remaining_amount ?? 0, sale.notes ?? null]);

        for (const item of items) {
            const itemId = uuidv4();
            await postgres.query(`
                INSERT INTO ${it}
                    (id, sale_id, item_type, item_id, name, quantity, unit_price,
                     discount, total, staff_id, commission_amount)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            `, [itemId, id, item.item_type ?? 'service', pgUuidOrNull(item.item_id),
                item.name, item.quantity ?? 1, item.unit_price ?? 0,
                item.discount ?? 0, item.total ?? 0,
                pgUuidOrNull(item.staff_id), item.commission_amount ?? 0]);
        }

        if (!opts?.skipErpAndLoyalty) {
            await runBeautySaleErpAndLoyalty(sale, items, { invoiceNumber, beautySaleId: id });
        }

        return id;
    },

    /**
     * Kalem ayrı `beauty_sales` kayıtları yazıldıktan sonra: tek ERP/kasa hareketi ve tek müşteri puanı (toplam tutar).
     */
    async syncBeautyCheckoutToErp(sale: Partial<BeautySale>, items: Partial<BeautySaleItem>[]): Promise<void> {
        const invoiceNumber = `BEA-${new Date().getFullYear()}-CHK-${Date.now().toString(36).toUpperCase()}`;
        await runBeautySaleErpAndLoyalty(sale, items, { invoiceNumber });
    },

    // =========================================================================
    // REPORT STATS  (aggregated analytics)
    // =========================================================================
    async getReportStats(): Promise<{
        monthlyRevenue: number;
        transactionCount: number;
        newCustomers: number;
        avgCartValue: number;
        prevMonthRevenue: number;
        prevMonthTransactions: number;
        revenueTrend: { month: string; label: string; revenue: number; transactions: number }[];
        serviceDistribution: { category: string; count: number; revenue: number }[];
        staffPerformance: { specialist_id: string; name: string; commission_rate: number; transactions: number; revenue: number; commission: number }[];
    }> {
        const st  = postgres.getMovementTableName('beauty_sales', 'beauty');
        const it  = postgres.getMovementTableName('beauty_sale_items', 'beauty');
        const spt = postgres.getCardTableName('beauty_specialists', 'beauty');
        const svt = postgres.getCardTableName('beauty_services', 'beauty');
        const svtFirm = postgres.getCardTableName('services');
        const pt = postgres.getCardTableName('products');
        const ct  = postgres.getCardTableName('customers');

        const MONTH_TR: Record<string, string> = {
            '01':'OCA','02':'ŞUB','03':'MAR','04':'NİS','05':'MAY','06':'HAZ',
            '07':'TEM','08':'AĞU','09':'EYL','10':'EKİ','11':'KAS','12':'ARA',
        };

        const [monthlyRes, prevRes, newCustRes, trendRes, svcRes, staffRes] = await Promise.all([
            // Current month stats
            postgres.query(`
                SELECT
                    COALESCE(SUM(total), 0)::float  AS revenue,
                    COUNT(*)::int                    AS transactions,
                    COALESCE(AVG(total), 0)::float  AS avg_cart
                FROM ${st}
                WHERE payment_status = 'paid'
                  AND created_at >= date_trunc('month', CURRENT_DATE)
            `),
            // Previous month stats (for % change)
            postgres.query(`
                SELECT
                    COALESCE(SUM(total), 0)::float AS revenue,
                    COUNT(*)::int                   AS transactions
                FROM ${st}
                WHERE payment_status = 'paid'
                  AND created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
                  AND created_at <  date_trunc('month', CURRENT_DATE)
            `),
            // New customers this month
            postgres.query(`
                SELECT COUNT(*)::int AS count
                FROM ${ct}
                WHERE created_at >= date_trunc('month', CURRENT_DATE)
            `),
            // Revenue trend — last 6 months
            postgres.query(`
                SELECT
                    to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                    COALESCE(SUM(total), 0)::float  AS revenue,
                    COUNT(*)::int                    AS transactions
                FROM ${st}
                WHERE payment_status = 'paid'
                  AND created_at >= (CURRENT_DATE - INTERVAL '6 months')
                GROUP BY date_trunc('month', created_at)
                ORDER BY date_trunc('month', created_at)
            `),
            // Service distribution (current month) — güzellik + hizmet kartı + malzeme=hizmet
            postgres.query(`
                SELECT
                    COALESCE(s.category, fs.category, p.category_code, p.categorycode, 'other') AS category,
                    COUNT(si.id)::int               AS count,
                    COALESCE(SUM(si.total), 0)::float AS revenue
                FROM ${it} si
                LEFT JOIN ${svt} s ON si.item_id = s.id
                LEFT JOIN ${svtFirm} fs ON si.item_id = fs.id AND fs.firm_nr = $1
                LEFT JOIN ${pt} p ON si.item_id = p.id AND p.firm_nr = $1
                  AND (
                    LOWER(TRIM(COALESCE(p.material_type, ''))) = 'service'
                    OR LOWER(TRIM(COALESCE(p.materialtype, ''))) = 'service'
                  )
                WHERE si.item_type = 'service'
                  AND si.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
                GROUP BY COALESCE(s.category, fs.category, p.category_code, p.categorycode, 'other')
                ORDER BY revenue DESC
                LIMIT 6
            `, [String(ERP_SETTINGS.firmNr ?? '001').trim()]),
            // Staff performance (current month) — staff_id = kullanıcı veya eski uzman kartı UUID
            postgres.query(`
                SELECT
                    si.staff_id AS specialist_id,
                    COALESCE(sp.name, u.full_name, u.username) AS name,
                    COALESCE(sp.commission_rate, 0)::float AS commission_rate,
                    COUNT(si.id)::int                       AS transactions,
                    COALESCE(SUM(si.total), 0)::float       AS revenue,
                    COALESCE(SUM(si.commission_amount), 0)::float AS commission
                FROM ${it} si
                LEFT JOIN ${spt} sp ON si.staff_id = sp.id
                LEFT JOIN public.users u ON si.staff_id = u.id
                  AND lpad(trim(u.firm_nr::text), 3, '0') = $1
                WHERE si.created_at >= date_trunc('month', CURRENT_DATE)
                  AND si.staff_id IS NOT NULL
                GROUP BY si.staff_id, COALESCE(sp.name, u.full_name, u.username), COALESCE(sp.commission_rate, 0)
                ORDER BY revenue DESC
                LIMIT 10
            `, [erpFirmNrForRow()]),
        ]);

        const trend = (trendRes.rows as any[]).map(r => ({
            month: r.month,
            label: MONTH_TR[r.month.split('-')[1]] ?? r.month,
            revenue: r.revenue,
            transactions: r.transactions,
        }));

        return {
            monthlyRevenue:       monthlyRes.rows[0]?.revenue      ?? 0,
            transactionCount:     monthlyRes.rows[0]?.transactions  ?? 0,
            avgCartValue:         monthlyRes.rows[0]?.avg_cart      ?? 0,
            newCustomers:         newCustRes.rows[0]?.count         ?? 0,
            prevMonthRevenue:     prevRes.rows[0]?.revenue          ?? 0,
            prevMonthTransactions:prevRes.rows[0]?.transactions     ?? 0,
            revenueTrend:         trend,
            serviceDistribution:  svcRes.rows  as any[],
            staffPerformance:     staffRes.rows as any[],
        };
    },

    // =========================================================================
    // CLINIC OPERATIONS (şube, portal, bekleme, hatırlatma, SOAP, vb.)
    // =========================================================================

    async getClinicAnalytics(): Promise<BeautyClinicAnalytics> {
        const apt = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const br = postgres.getMovementTableName('beauty_booking_requests', 'beauty');
        const wl = postgres.getMovementTableName('beauty_waitlist', 'beauty');
        const cul = postgres.getMovementTableName('beauty_consumable_usage_log', 'beauty');
        const [st, rq, wq, cu] = await Promise.all([
            postgres.query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = 'no_show')::int AS ns,
                    COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cx,
                    COUNT(*) FILTER (WHERE status = 'completed')::int AS cp,
                    COUNT(*) FILTER (WHERE status IN ('scheduled','confirmed'))::int AS sc
                FROM ${apt}
                WHERE appointment_date >= CURRENT_DATE - INTERVAL '90 days'
            `),
            postgres.query(`SELECT COUNT(*)::int AS c FROM ${br} WHERE status = 'pending'`),
            postgres.query(`SELECT COUNT(*)::int AS c FROM ${wl} WHERE status = 'active'`),
            postgres.query(`SELECT COUNT(*)::int AS c FROM ${cul} WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`),
        ]);
        const r0 = st.rows[0] as Record<string, number>;
        return {
            noShowCount: r0?.ns ?? 0,
            cancelledCount: r0?.cx ?? 0,
            completedCount: r0?.cp ?? 0,
            scheduledCount: r0?.sc ?? 0,
            pendingBookingRequests: rq.rows[0]?.c ?? 0,
            waitlistActive: wq.rows[0]?.c ?? 0,
            consumableUsage30d: cu.rows[0]?.c ?? 0,
        };
    },

    async appendAuditLog(
        tableName: string,
        action: string,
        recordId: string | null,
        userId: string | null,
        payload?: Record<string, unknown>
    ): Promise<void> {
        const t = postgres.getMovementTableName('beauty_audit_log', 'beauty');
        await postgres.query(
            `INSERT INTO ${t} (id, table_name, record_id, action, user_id, payload_json)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
            [uuidv4(), tableName, recordId, action, userId, JSON.stringify(payload ?? {})]
        );
    },

    async getBranches(): Promise<BeautyBranch[]> {
        const t = postgres.getCardTableName('beauty_branches', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} ORDER BY sort_order, name`
        );
        return rows;
    },

    async upsertBranch(row: Partial<BeautyBranch> & { name: string }): Promise<string> {
        const t = postgres.getCardTableName('beauty_branches', 'beauty');
        const id = row.id ?? uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, name, address, phone, is_active, sort_order, created_at)
             VALUES ($1,$2,$3,$4,COALESCE($5,true),COALESCE($6,0),NOW())
             ON CONFLICT (id) DO UPDATE SET
               name=EXCLUDED.name, address=EXCLUDED.address, phone=EXCLUDED.phone,
               is_active=EXCLUDED.is_active, sort_order=EXCLUDED.sort_order`,
            [id, row.name, row.address ?? null, row.phone ?? null, row.is_active, row.sort_order ?? 0]
        );
        return id;
    },

    async getRooms(): Promise<BeautyRoom[]> {
        const t = postgres.getCardTableName('beauty_rooms', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${t} ORDER BY name`);
        return rows;
    },

    async upsertRoom(row: Partial<BeautyRoom> & { name: string }): Promise<string> {
        const t = postgres.getCardTableName('beauty_rooms', 'beauty');
        const id = row.id ?? uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, branch_id, name, capacity, is_active, sort_order, created_at)
             VALUES ($1,$2,$3,COALESCE($4,1),COALESCE($5,true),COALESCE($6,0),NOW())
             ON CONFLICT (id) DO UPDATE SET
               branch_id=EXCLUDED.branch_id, name=EXCLUDED.name, capacity=EXCLUDED.capacity,
               is_active=EXCLUDED.is_active, sort_order=EXCLUDED.sort_order`,
            [id, pgUuidOrNull(row.branch_id), row.name, row.capacity, row.is_active, row.sort_order ?? 0]
        );
        return id;
    },

    async getPortalSettings(): Promise<BeautyPortalSettings | null> {
        const t = postgres.getCardTableName('beauty_portal_settings', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${t} ORDER BY created_at LIMIT 1`);
        if (!rows[0]) {
            await postgres.query(
                `INSERT INTO ${t} (id, online_booking_enabled, public_token, reminder_hours_before)
                 VALUES ($1, false, encode(gen_random_bytes(24), 'hex'), 24)`,
                [uuidv4()]
            );
            const r2 = await postgres.query(`SELECT * FROM ${t} LIMIT 1`);
            return r2.rows[0] ?? null;
        }
        return rows[0];
    },

    async updatePortalSettings(data: Partial<BeautyPortalSettings>): Promise<void> {
        const t = postgres.getCardTableName('beauty_portal_settings', 'beauty');
        const cur = await beautyService.getPortalSettings();
        const id = cur?.id;
        if (!id) return;
        const merged: BeautyPortalSettings = { ...cur, ...data } as BeautyPortalSettings;
        await postgres.query(
            `UPDATE ${t} SET
               online_booking_enabled = $2,
               public_slug = $3,
               public_token = $4,
               reminder_hours_before = $5,
               sms_template = $6,
               whatsapp_template = $7,
               sms_user = $8,
               sms_password = $9,
               sms_sender = $10,
               whatsapp_provider = $11,
               whatsapp_base_url = $12,
               whatsapp_token = $13,
               whatsapp_instance_id = $14,
               whatsapp_phone_id = $15,
               default_reminder_channel = $16,
               allow_staff_slot_overlap = COALESCE($17, false),
               updated_at = NOW()
             WHERE id = $1`,
            [
                id,
                merged.online_booking_enabled,
                merged.public_slug ?? null,
                merged.public_token,
                merged.reminder_hours_before ?? 24,
                merged.sms_template ?? null,
                merged.whatsapp_template ?? null,
                merged.sms_user ?? null,
                merged.sms_password ?? null,
                merged.sms_sender ?? null,
                (merged.whatsapp_provider || 'NONE').toString().toUpperCase(),
                merged.whatsapp_base_url ?? null,
                merged.whatsapp_token ?? null,
                merged.whatsapp_instance_id ?? null,
                merged.whatsapp_phone_id ?? null,
                (merged.default_reminder_channel || 'sms').toString().toLowerCase(),
                merged.allow_staff_slot_overlap ?? false,
            ]
        );
    },

    async getAtakSmsBalance(): Promise<{ success: boolean; credit?: number; error?: string }> {
        const s = await beautyService.getPortalSettings();
        if (!s) return { success: false, error: 'Portal ayarı yok' };
        return getAtakBalance(s as ClinicMessagingPortalConfig);
    },

    /**
     * Yerel QR köprüsü: GET {baseUrl}/status — EMBEDDED sağlayıcı.
     * `override` ile kaydetmeden formdaki URL/token ile sorgulanabilir.
     */
    async getEmbeddedWhatsAppStatus(override?: {
        whatsapp_base_url?: string | null;
        whatsapp_token?: string | null;
    }): Promise<{
        ok: boolean;
        status?: string;
        qr?: string | null;
        error?: string;
    }> {
        if (override?.whatsapp_base_url != null && String(override.whatsapp_base_url).trim() !== '') {
            return getEmbeddedBridgeStatus({
                whatsapp_base_url: override.whatsapp_base_url,
                whatsapp_token: override.whatsapp_token ?? null,
            });
        }
        const s = await beautyService.getPortalSettings();
        if (!s) return { ok: false, error: 'Portal ayarı yok' };
        return getEmbeddedBridgeStatus({
            whatsapp_base_url: s.whatsapp_base_url,
            whatsapp_token: s.whatsapp_token,
        });
    },

    /**
     * Bildirim kuyruğundaki bekleyenleri Atak SMS veya Evolution/Meta ile gönderir (whatshapp akışı).
     */
    async processPendingNotifications(limit = 15): Promise<{ processed: number; errors: string[] }> {
        const q = postgres.getMovementTableName('beauty_notification_queue', 'beauty');
        const apt = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const svc = postgres.getCardTableName('beauty_services', 'beauty');
        const svcFirm = postgres.getCardTableName('services');
        const settings = (await beautyService.getPortalSettings()) as ClinicMessagingPortalConfig | null;
        if (!settings) return { processed: 0, errors: ['Portal ayarı yok'] };

        const { rows: pending } = await postgres.query(
            `SELECT * FROM ${q} WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1`,
            [limit]
        );
        const errors: string[] = [];
        let processed = 0;

        for (const row of pending as Record<string, unknown>[]) {
            const qid = String(row.id);
            const appointmentId = row.appointment_id ? String(row.appointment_id) : null;
            const channel = String(row.channel || 'sms').toLowerCase();
            if (!appointmentId) {
                await postgres.query(
                    `UPDATE ${q} SET status = 'failed', error_text = $2 WHERE id = $1`,
                    [qid, 'appointment_id yok']
                );
                errors.push(`${qid}: appointment_id yok`);
                continue;
            }

            try {
                const { rows: ar } = await postgres.query(
                    `SELECT a.appointment_date, a.appointment_time,
                            c.name AS customer_name, c.phone,
                            COALESCE(s.name, rs.name) AS service_name
                     FROM ${apt} a
                     LEFT JOIN ${ct} c ON a.client_id = c.id
                     LEFT JOIN ${svc} s ON a.service_id = s.id
                     LEFT JOIN ${svcFirm} rs ON a.service_id = rs.id AND rs.firm_nr = $2
                     WHERE a.id = $1`,
                    [appointmentId, String(ERP_SETTINGS.firmNr ?? '001').trim()]
                );
                const a = ar[0] as Record<string, unknown> | undefined;
                const phone = a?.phone != null ? String(a.phone).trim() : '';
                if (!phone) throw new Error('Müşteri telefonu yok');

                const timeStr = a.appointment_time != null ? String(a.appointment_time).slice(0, 5) : '';
                const ctx = {
                    name: a.customer_name != null ? String(a.customer_name) : 'Musteri',
                    date: a.appointment_date != null ? String(a.appointment_date) : '',
                    time: timeStr,
                    service: a.service_name != null ? String(a.service_name) : 'Hizmet',
                };

                if (channel === 'sms') {
                    const text = buildReminderText(settings.sms_template, 'sms', ctx);
                    const r = await sendAtakSms(settings, phone, text);
                    if (!r.success) throw new Error(r.error || 'SMS gönderilemedi');
                } else if (channel === 'whatsapp') {
                    const text = buildReminderText(settings.whatsapp_template || settings.sms_template, 'whatsapp', ctx);
                    const r = await sendWhatsAppText(settings, phone, text);
                    if (!r.success) throw new Error(r.error || 'WhatsApp gönderilemedi');
                } else {
                    throw new Error(`Bilinmeyen kanal: ${channel}`);
                }

                await postgres.query(
                    `UPDATE ${q} SET status = 'sent', sent_at = NOW(), error_text = NULL WHERE id = $1`,
                    [qid]
                );
                processed++;
            } catch (e: unknown) {
                const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
                errors.push(msg);
                await postgres.query(
                    `UPDATE ${q} SET status = 'failed', error_text = $2 WHERE id = $1`,
                    [qid, msg]
                );
            }
        }

        return { processed, errors };
    },

    async sendTestSmsMessage(phone: string): Promise<{ success: boolean; error?: string }> {
        const s = await beautyService.getPortalSettings();
        if (!s) return { success: false, error: 'Portal ayarı yok' };
        return sendAtakSms(s as ClinicMessagingPortalConfig, phone, 'RetailEX — Atak SMS test mesajı.');
    },

    async sendTestWhatsAppMessage(phone: string): Promise<{ success: boolean; error?: string }> {
        const s = await beautyService.getPortalSettings();
        if (!s) return { success: false, error: 'Portal ayarı yok' };
        return sendWhatsAppText(
            s as ClinicMessagingPortalConfig,
            phone,
            'RetailEX — WhatsApp test mesajı.'
        );
    },

    async getPortalSettingsRaw(firmNr: string): Promise<BeautyPortalSettings | null> {
        const fn = firmNr.padStart(3, '0');
        const full = `beauty.rex_${fn}_beauty_portal_settings`;
        const { rows } = await postgres.query(`SELECT * FROM ${full} ORDER BY created_at LIMIT 1`, [], { firmNr: fn });
        return rows[0] ?? null;
    },

    async submitPublicBookingRequest(
        firmNr: string,
        periodNr: string,
        token: string,
        body: {
            name: string;
            phone: string;
            email?: string;
            service_id?: string;
            requested_date: string;
            requested_time?: string;
            notes?: string;
        }
    ): Promise<void> {
        const settings = await beautyService.getPortalSettingsRaw(firmNr);
        if (!settings?.online_booking_enabled) throw new Error('Online randevu kapalı');
        if (!settings.public_token || settings.public_token !== token) throw new Error('Geçersiz bağlantı anahtarı');
        const bt = `beauty.rex_${firmNr.padStart(3, '0')}_${periodNr.padStart(2, '0')}_beauty_booking_requests`;
        const timeVal = body.requested_time
            ? (String(body.requested_time).length === 5
                ? `${body.requested_time}:00`
                : String(body.requested_time))
            : null;
        await postgres.query(
            `INSERT INTO ${bt}
             (id, name, phone, email, service_id, requested_date, requested_time, notes, status, public_token_used)
             VALUES ($1,$2,$3,$4,$5,$6,$7::time,$8,'pending',$9)`,
            [
                uuidv4(),
                body.name,
                body.phone,
                body.email ?? null,
                pgUuidOrNull(body.service_id),
                body.requested_date,
                timeVal,
                body.notes ?? null,
                token,
            ],
            { firmNr: firmNr.padStart(3, '0'), periodNr: periodNr.padStart(2, '0') }
        );
    },

    async listBookingRequests(): Promise<BeautyBookingRequest[]> {
        const t = postgres.getMovementTableName('beauty_booking_requests', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} WHERE status = 'pending' ORDER BY created_at DESC`
        );
        return rows;
    },

    async approveBookingRequest(
        requestId: string,
        opts: { customerId?: string; specialistId?: string; userId?: string }
    ): Promise<string> {
        const bt = postgres.getMovementTableName('beauty_booking_requests', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${bt} WHERE id = $1`, [requestId]);
        const req = rows[0];
        if (!req) throw new Error('Talep bulunamadı');

        let customerId = opts.customerId ?? null;
        if (!customerId) {
            const ct = postgres.getCardTableName('customers');
            const found = await postgres.query(
                `SELECT id FROM ${ct} WHERE phone = $1 LIMIT 1`,
                [req.phone]
            );
            if (found.rows[0]) {
                customerId = found.rows[0].id;
            } else {
                customerId = await beautyService.createCustomer({
                    name: req.name,
                    phone: req.phone,
                    email: req.email ?? undefined,
                });
            }
        }

        const svc = postgres.getCardTableName('beauty_services', 'beauty');
        const svcFirm = postgres.getCardTableName('services');
        const prodTbl = postgres.getCardTableName('products');
        const fn = String(ERP_SETTINGS.firmNr ?? '001').trim();
        let price = 0;
        let duration = 30;
        if (req.service_id) {
            const pr = await postgres.query(`SELECT price, duration_min FROM ${svc} WHERE id = $1`, [req.service_id]);
            if (pr.rows[0]) {
                price = Number(pr.rows[0].price ?? 0);
                duration = Number(pr.rows[0].duration_min ?? 30);
            } else {
                const pr2 = await postgres.query(
                    `SELECT unit_price AS price, unit FROM ${svcFirm} WHERE id = $1 AND firm_nr = $2`,
                    [req.service_id, fn]
                );
                if (pr2.rows[0]) {
                    price = Number(pr2.rows[0].price ?? 0);
                    duration = inferDurationMinFromUnit(pr2.rows[0].unit);
                } else {
                    const pr3 = await postgres.query(
                        `SELECT price, unit FROM ${prodTbl}
                         WHERE id = $1 AND firm_nr = $2 AND is_active = true
                           AND (
                             LOWER(TRIM(COALESCE(material_type, ''))) = 'service'
                             OR LOWER(TRIM(COALESCE(materialtype, ''))) = 'service'
                           )`,
                        [req.service_id, fn]
                    );
                    if (pr3.rows[0]) {
                        price = Number(pr3.rows[0].price ?? 0);
                        duration = inferDurationMinFromUnit(pr3.rows[0].unit);
                    }
                }
            }
        }

        const apptId = await beautyService.createAppointment({
            customer_id: customerId!,
            service_id: req.service_id,
            staff_id: opts.specialistId,
            date: req.requested_date,
            time: req.requested_time ? String(req.requested_time).slice(0, 5) : '09:00',
            duration,
            total_price: price,
            status: 'scheduled',
            booking_channel: 'online',
            notes: req.notes ?? undefined,
        });

        await postgres.query(
            `UPDATE ${bt} SET status = 'approved', processed_appointment_id = $2 WHERE id = $1`,
            [requestId, apptId]
        );
        await beautyService.appendAuditLog('beauty_booking_requests', 'approve', requestId, opts.userId ?? null, {
            appointment_id: apptId,
        });
        return apptId;
    },

    async listWaitlist(): Promise<BeautyWaitlistEntry[]> {
        const t = postgres.getMovementTableName('beauty_waitlist', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} WHERE status = 'active' ORDER BY created_at DESC`
        );
        return rows;
    },

    async addWaitlistEntry(row: Partial<BeautyWaitlistEntry>): Promise<string> {
        const t = postgres.getMovementTableName('beauty_waitlist', 'beauty');
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO ${t}
             (id, customer_id, service_id, specialist_id, preferred_date_from, preferred_date_to, notes, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'active')`,
            [
                id,
                pgUuidOrNull(row.customer_id),
                pgUuidOrNull(row.service_id),
                pgUuidOrNull(row.specialist_id),
                pgDateOrNull(row.preferred_date_from),
                pgDateOrNull(row.preferred_date_to),
                row.notes ?? null,
            ]
        );
        return id;
    },

    async enqueueAppointmentReminders(_hoursBefore: number): Promise<number> {
        const apt = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const q = postgres.getMovementTableName('beauty_notification_queue', 'beauty');
        const ps = await beautyService.getPortalSettings();
        const ch = (ps?.default_reminder_channel || 'sms').toString().toLowerCase();
        const channels =
            ch === 'both' ? (['sms', 'whatsapp'] as const) : ch === 'whatsapp' ? (['whatsapp'] as const) : (['sms'] as const);

        const { rows } = await postgres.query(`
            SELECT id FROM ${apt}
            WHERE status IN ('scheduled','confirmed')
              AND appointment_date = CURRENT_DATE + INTERVAL '1 day'
              AND reminder_sent_at IS NULL
        `);
        let n = 0;
        for (const r of rows as { id: string }[]) {
            for (const channel of channels) {
                await postgres.query(
                    `INSERT INTO ${q} (id, appointment_id, channel, status, payload_json, scheduled_at)
                     VALUES ($1,$2,$3,'pending', '{}'::jsonb, NOW())`,
                    [uuidv4(), r.id, channel]
                );
                n++;
            }
            await postgres.query(
                `UPDATE ${apt} SET reminder_sent_at = NOW() WHERE id = $1`,
                [r.id]
            );
        }
        return n;
    },

    async listNotificationQueue(limit = 50): Promise<{ id: string; appointment_id?: string; channel: string; status: string }[]> {
        const t = postgres.getMovementTableName('beauty_notification_queue', 'beauty');
        const { rows } = await postgres.query(
            `SELECT id, appointment_id, channel, status FROM ${t} ORDER BY created_at DESC LIMIT $1`,
            [limit]
        );
        return rows;
    },

    async markNotificationSent(id: string): Promise<void> {
        const t = postgres.getMovementTableName('beauty_notification_queue', 'beauty');
        await postgres.query(
            `UPDATE ${t} SET status = 'sent', sent_at = NOW() WHERE id = $1`,
            [id]
        );
    },

    async listConsentTemplates(): Promise<BeautyConsentTemplate[]> {
        const t = postgres.getCardTableName('beauty_consent_templates', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${t} ORDER BY sort_order, title`);
        return rows;
    },

    async saveConsentTemplate(row: Partial<BeautyConsentTemplate> & { title: string }): Promise<string> {
        const t = postgres.getCardTableName('beauty_consent_templates', 'beauty');
        const id = row.id ?? uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, title, body_html, is_active, sort_order, created_at)
             VALUES ($1,$2,$3,COALESCE($4,true),COALESCE($5,0),NOW())
             ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, body_html=EXCLUDED.body_html,
               is_active=EXCLUDED.is_active, sort_order=EXCLUDED.sort_order`,
            [id, row.title, row.body_html ?? null, row.is_active, row.sort_order ?? 0]
        );
        return id;
    },

    async listCorporateAccounts(): Promise<BeautyCorporateAccount[]> {
        const t = postgres.getCardTableName('beauty_corporate_accounts', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${t} ORDER BY name`);
        return rows;
    },

    async saveCorporateAccount(row: Partial<BeautyCorporateAccount> & { name: string }): Promise<string> {
        const t = postgres.getCardTableName('beauty_corporate_accounts', 'beauty');
        const id = row.id ?? uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, name, tax_nr, discount_pct, notes, is_active, created_at)
             VALUES ($1,$2,$3,$4,$5,COALESCE($6,true),NOW())
             ON CONFLICT (id) DO UPDATE SET
               name=EXCLUDED.name, tax_nr=EXCLUDED.tax_nr, discount_pct=EXCLUDED.discount_pct,
               notes=EXCLUDED.notes, is_active=EXCLUDED.is_active`,
            [id, row.name, row.tax_nr ?? null, row.discount_pct ?? 0, row.notes ?? null, row.is_active]
        );
        return id;
    },

    async listMemberships(): Promise<BeautyMembership[]> {
        const t = postgres.getCardTableName('beauty_memberships', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${t} WHERE is_active = true ORDER BY name`);
        return rows;
    },

    async createMembershipSubscription(customerId: string, membershipId: string): Promise<string> {
        const t = postgres.getMovementTableName('beauty_membership_subscriptions', 'beauty');
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, customer_id, membership_id, start_date, status, auto_renew)
             VALUES ($1,$2,$3,CURRENT_DATE,'active',false)`,
            [id, customerId, membershipId]
        );
        await beautyService.appendAuditLog('beauty_membership_subscriptions', 'create', id, null, {
            customer_id: customerId,
            membership_id: membershipId,
        });
        return id;
    },

    async saveMembership(row: Partial<BeautyMembership> & { name: string }): Promise<string> {
        const t = postgres.getCardTableName('beauty_memberships', 'beauty');
        const id = row.id ?? uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, name, monthly_price, session_credit, benefits_json, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5::jsonb,COALESCE($6,true),NOW(),NOW())
             ON CONFLICT (id) DO UPDATE SET
               name=EXCLUDED.name, monthly_price=EXCLUDED.monthly_price, session_credit=EXCLUDED.session_credit,
               benefits_json=EXCLUDED.benefits_json, is_active=EXCLUDED.is_active, updated_at=NOW()`,
            [id, row.name, row.monthly_price ?? 0, row.session_credit ?? 0, JSON.stringify(row.benefits_json ?? {}), row.is_active]
        );
        return id;
    },

    async listMarketingCampaigns(): Promise<BeautyMarketingCampaign[]> {
        const t = postgres.getCardTableName('beauty_marketing_campaigns', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${t} ORDER BY created_at DESC`);
        return rows;
    },

    async saveMarketingCampaign(row: Partial<BeautyMarketingCampaign> & { name: string }): Promise<string> {
        const t = postgres.getCardTableName('beauty_marketing_campaigns', 'beauty');
        const id = row.id ?? uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, name, channel, segment_filter_json, message_template, scheduled_at, status, created_at)
             VALUES ($1,$2,$3,$4::jsonb,$5,$6,COALESCE($7,'draft'),NOW())
             ON CONFLICT (id) DO UPDATE SET
               name=EXCLUDED.name, channel=EXCLUDED.channel, segment_filter_json=EXCLUDED.segment_filter_json,
               message_template=EXCLUDED.message_template, scheduled_at=EXCLUDED.scheduled_at, status=EXCLUDED.status`,
            [
                id,
                row.name,
                row.channel ?? 'sms',
                JSON.stringify(row.segment_filter_json ?? {}),
                row.message_template ?? null,
                row.scheduled_at ?? null,
                row.status ?? 'draft',
            ]
        );
        return id;
    },

    async getIntegrationSettings(): Promise<BeautyIntegrationSettings | null> {
        const t = postgres.getCardTableName('beauty_integration_settings', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${t} WHERE id = 1`);
        return rows[0] ?? null;
    },

    async updateIntegrationSettings(data: Partial<BeautyIntegrationSettings>): Promise<void> {
        const t = postgres.getCardTableName('beauty_integration_settings', 'beauty');
        const cur = await postgres.query(`SELECT id FROM ${t} WHERE id = 1`);
        const ext = JSON.stringify(data.external_calendar_json ?? {});
        if (!cur.rows[0]) {
            await postgres.query(
                `INSERT INTO ${t} (id, google_calendar_id, external_calendar_json, updated_at)
                 VALUES (1, $1, $2::jsonb, NOW())`,
                [data.google_calendar_id ?? null, ext]
            );
            return;
        }
        await postgres.query(
            `UPDATE ${t} SET
               google_calendar_id = COALESCE($1, google_calendar_id),
               external_calendar_json = COALESCE($2::jsonb, external_calendar_json),
               updated_at = NOW()
             WHERE id = 1`,
            [data.google_calendar_id ?? null, ext]
        );
    },

    async getCustomerHealth(customerId: string): Promise<BeautyCustomerHealth | null> {
        const t = postgres.getCardTableName('beauty_customer_health', 'beauty');
        const { rows } = await postgres.query(`SELECT * FROM ${t} WHERE customer_id = $1`, [customerId]);
        return rows[0] ?? null;
    },

    async saveCustomerHealth(customerId: string, data: Partial<BeautyCustomerHealth>): Promise<void> {
        const t = postgres.getCardTableName('beauty_customer_health', 'beauty');
        await postgres.query(
            `INSERT INTO ${t}
             (customer_id, allergies, medications, pregnancy, chronic_notes, warnings_banner, kvkk_consent_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
             ON CONFLICT (customer_id) DO UPDATE SET
               allergies=EXCLUDED.allergies, medications=EXCLUDED.medications, pregnancy=EXCLUDED.pregnancy,
               chronic_notes=EXCLUDED.chronic_notes, warnings_banner=EXCLUDED.warnings_banner,
               kvkk_consent_at=COALESCE(EXCLUDED.kvkk_consent_at, kvkk_consent_at),
               updated_at=NOW()`,
            [
                customerId,
                data.allergies ?? null,
                data.medications ?? null,
                data.pregnancy ?? false,
                data.chronic_notes ?? null,
                data.warnings_banner ?? null,
                data.kvkk_consent_at ?? null,
            ]
        );
    },

    async listServiceConsumables(serviceId?: string): Promise<BeautyServiceConsumableRow[]> {
        const t = postgres.getCardTableName('beauty_service_consumables', 'beauty');
        const p = postgres.getCardTableName('products');
        const q = serviceId
            ? `SELECT c.id, c.service_id, c.product_id, c.qty_per_service, c.created_at,
                      pr.name AS product_name, pr.unit AS product_unit
               FROM ${t} c
               LEFT JOIN ${p} pr ON pr.id = c.product_id
               WHERE c.service_id = $1 ORDER BY c.created_at`
            : `SELECT c.id, c.service_id, c.product_id, c.qty_per_service, c.created_at,
                      pr.name AS product_name, pr.unit AS product_unit
               FROM ${t} c
               LEFT JOIN ${p} pr ON pr.id = c.product_id
               ORDER BY c.created_at`;
        const { rows } = serviceId
            ? await postgres.query(q, [serviceId])
            : await postgres.query(q);
        return rows;
    },

    async setServiceConsumable(row: { service_id: string; product_id: string; qty_per_service: number }): Promise<string> {
        const t = postgres.getCardTableName('beauty_service_consumables', 'beauty');
        const dup = await postgres.query(
            `SELECT id FROM ${t} WHERE service_id = $1 AND product_id = $2 LIMIT 1`,
            [row.service_id, row.product_id]
        );
        if (dup.rows[0]?.id) {
            await postgres.query(
                `UPDATE ${t} SET qty_per_service = $2 WHERE id = $1`,
                [dup.rows[0].id, row.qty_per_service]
            );
            return dup.rows[0].id as string;
        }
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, service_id, product_id, qty_per_service) VALUES ($1,$2,$3,$4)`,
            [id, row.service_id, row.product_id, row.qty_per_service]
        );
        return id;
    },

    async updateServiceConsumable(id: string, qty_per_service: number): Promise<void> {
        const t = postgres.getCardTableName('beauty_service_consumables', 'beauty');
        await postgres.query(`UPDATE ${t} SET qty_per_service = $2 WHERE id = $1`, [id, qty_per_service]);
    },

    async deleteServiceConsumable(id: string): Promise<void> {
        const t = postgres.getCardTableName('beauty_service_consumables', 'beauty');
        await postgres.query(`DELETE FROM ${t} WHERE id = $1`, [id]);
    },

    async listProductBatches(productId?: string): Promise<BeautyProductBatch[]> {
        const t = postgres.getCardTableName('beauty_product_batches', 'beauty');
        const { rows } = productId
            ? await postgres.query(`SELECT * FROM ${t} WHERE product_id = $1 ORDER BY expiry_date NULLS LAST`, [productId])
            : await postgres.query(`SELECT * FROM ${t} ORDER BY expiry_date NULLS LAST`);
        return rows;
    },

    async saveProductBatch(row: Partial<BeautyProductBatch> & { product_id: string }): Promise<string> {
        const t = postgres.getCardTableName('beauty_product_batches', 'beauty');
        const id = row.id ?? uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, product_id, lot_code, expiry_date, qty, barcode, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW())
             ON CONFLICT (id) DO UPDATE SET
               lot_code=EXCLUDED.lot_code, expiry_date=EXCLUDED.expiry_date, qty=EXCLUDED.qty, barcode=EXCLUDED.barcode`,
            [
                id,
                row.product_id,
                row.lot_code ?? null,
                row.expiry_date ?? null,
                row.qty ?? 0,
                row.barcode ?? null,
            ]
        );
        return id;
    },

    async listClinicalNotesForAppointment(appointmentId: string): Promise<BeautyClinicalNote[]> {
        const t = postgres.getMovementTableName('beauty_clinical_notes', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} WHERE appointment_id = $1 ORDER BY created_at DESC`,
            [appointmentId]
        );
        return rows;
    },

    async saveClinicalNote(row: Partial<BeautyClinicalNote> & { appointment_id: string }): Promise<string> {
        const t = postgres.getMovementTableName('beauty_clinical_notes', 'beauty');
        const id = row.id ?? uuidv4();
        await postgres.query(
            `INSERT INTO ${t}
             (id, appointment_id, customer_id, subjective, objective, assessment, plan, extra_json, created_by, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,NOW())`,
            [
                id,
                row.appointment_id,
                pgUuidOrNull(row.customer_id),
                row.subjective ?? null,
                row.objective ?? null,
                row.assessment ?? null,
                row.plan ?? null,
                JSON.stringify(row.extra_json ?? {}),
                pgUuidOrNull(row.created_by),
            ]
        );
        return id;
    },

    async listPatientPhotos(customerId: string): Promise<BeautyPatientPhoto[]> {
        const t = postgres.getMovementTableName('beauty_patient_photos', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} WHERE customer_id = $1 ORDER BY created_at DESC`,
            [customerId]
        );
        return rows;
    },

    async addPatientPhoto(row: Partial<BeautyPatientPhoto> & { customer_id: string; storage_url: string }): Promise<string> {
        const t = postgres.getMovementTableName('beauty_patient_photos', 'beauty');
        const id = row.id ?? uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, customer_id, appointment_id, kind, storage_url, caption, taken_at, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
            [
                id,
                row.customer_id,
                pgUuidOrNull(row.appointment_id),
                row.kind ?? 'before',
                row.storage_url,
                row.caption ?? null,
                row.taken_at ?? null,
            ]
        );
        return id;
    },

    async listAuditLog(limit = 100): Promise<BeautyAuditLogEntry[]> {
        const t = postgres.getMovementTableName('beauty_audit_log', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} ORDER BY created_at DESC LIMIT $1`,
            [limit]
        );
        return rows;
    },

    async applyConsumableDeductionForAppointment(appointmentId: string): Promise<void> {
        const apt = await beautyService.getAppointmentById(appointmentId);
        if (!apt?.service_id) return;
        const lines = await beautyService.listServiceConsumables(apt.service_id);
        if (!lines.length) return;
        const logT = postgres.getMovementTableName('beauty_consumable_usage_log', 'beauty');
        const batchT = postgres.getCardTableName('beauty_product_batches', 'beauty');
        const prodT = postgres.getCardTableName('products');
        for (const line of lines) {
            const qty = Number(line.qty_per_service ?? 1);
            await postgres.query(
                `INSERT INTO ${logT} (id, appointment_id, product_id, qty) VALUES ($1,$2,$3,$4)`,
                [uuidv4(), appointmentId, line.product_id, qty]
            );
            const batches = await postgres.query(
                `SELECT id, qty FROM ${batchT} WHERE product_id = $1 AND qty > 0 ORDER BY expiry_date NULLS LAST LIMIT 1`,
                [line.product_id]
            );
            const b = batches.rows[0] as { id: string; qty: number } | undefined;
            if (b) {
                const next = Math.max(0, Number(b.qty) - qty);
                await postgres.query(`UPDATE ${batchT} SET qty = $1 WHERE id = $2`, [next, b.id]);
            }
            try {
                await postgres.query(
                    `UPDATE ${prodT} SET stock = GREATEST(0, COALESCE(stock,0) - $2::numeric) WHERE id = $1`,
                    [line.product_id, qty]
                );
            } catch {
                /* ürün tablosu yoksa atla */
            }
        }
        await beautyService.appendAuditLog('beauty_appointments', 'consumable_deduct', appointmentId, null, {
            service_id: apt.service_id,
        });
    },
};
