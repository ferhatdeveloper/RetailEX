import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import type { Sale, SaleItem } from '../core/types/models';
import { shouldUseTenantPostgrestApi } from '../config/postgrest.config';
import { postgres, ERP_SETTINGS } from './postgres';
import { useSaleStore } from '../store/useSaleStore';
import { useCustomerStore } from '../store/useCustomerStore';
import {
    buildReminderText,
    sendAtakSms,
    sendWhatsAppNotification,
    sendWhatsAppText,
    getAtakBalance,
    type ClinicMessagingPortalConfig,
} from './messaging/clinicMessaging';
import {
    buildMetaAppointmentQueuePayload,
    previewMetaTemplateBody,
    resolveMetaAppointmentTemplate,
} from './messaging/metaWhatsAppTemplates';
import { messagingService } from './messaging/messagingService';
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
    BeautyCustomerLastTreatment,
    BeautyStaffTreatmentReport,
    BeautyCustomer,
    BeautySatisfactionSurvey,
    BeautySatisfactionQuestion,
    BeautySatisfactionLabels,
    BeautySurveyResultsReport,
    BeautySurveyQuestionStat,
    BeautySurveyResponseRow,
    BeautySurveyTrendReport,
    BeautySurveyTrendPoint,
    BeautySurveyBreakdownRow,
    BeautySurveyStaffReport,
    BeautySurveyServiceReport,
    BeautySurveyNpsReport,
    BeautySurveyCommentsReport,
    BeautySurveyCommentRow,
    SatisfactionLangCode,
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
    type BeautyFollowUpReminder,
    type BeautyFollowUpReminderAction,
    type BeautyFollowUpReminderStatus,
} from '../types/beauty';
import { mergeFollowUpRemindersWithActions } from '../utils/beautyFollowUpReminderUtils';

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

function erpPeriodNrForRow(): string {
    return String(ERP_SETTINGS.periodNr ?? '01').trim().padStart(2, '0').slice(0, 10);
}

function stripUndefinedFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const out: Partial<T> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) {
            (out as Record<string, unknown>)[k] = v;
        }
    }
    return out;
}

async function postgrestRowExists(path: string, schema: 'public' | 'beauty', id: string): Promise<boolean> {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<Record<string, unknown>[]>(
        path,
        { select: 'id', id: `eq.${id}`, limit: 1 },
        { schema }
    );
    return Array.isArray(rows) && rows.length > 0;
}

function normalizeFollowUpReminderDays(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(3650, n);
}

function normalizeParentCategory(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length ? s.slice(0, 100) : null;
}

function pgCellToYmd(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : v.slice(0, 10);
    }
    if (v instanceof Date) {
        const y = v.getFullYear();
        const mo = String(v.getMonth() + 1).padStart(2, '0');
        const da = String(v.getDate()).padStart(2, '0');
        return `${y}-${mo}-${da}`;
    }
    return String(v).slice(0, 10);
}

function normalizeAppointmentTimeCell(v: unknown): string {
    if (v == null) return '';
    const s = String(v).trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s.slice(0, 5);
    return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
}

function pickCustomerPhoneFromRow(r: Record<string, unknown>): string | undefined {
    const primary = String(r.customer_phone ?? r.phone ?? '').trim();
    if (primary) return primary;
    const secondary = String(r.phone2 ?? r.customer_phone2 ?? '').trim();
    return secondary || undefined;
}

function normalizeAppointmentRow(
    r: Record<string, unknown> & { clinical_data?: unknown },
): BeautyAppointment {
    const ymd = pgCellToYmd(r.date ?? r.appointment_date);
    const hhmm = normalizeAppointmentTimeCell(r.time ?? r.appointment_time);
    return {
        ...r,
        // Tüm ekranlar için her iki anahtarın da dolu gelmesini garanti et.
        date: ymd || undefined,
        appointment_date: ymd || undefined,
        time: hhmm || undefined,
        appointment_time: hhmm || undefined,
        service_name: String(r.service_name ?? '').trim() || undefined,
        customer_phone: pickCustomerPhoneFromRow(r),
        clinical_data: parseClinicalDataRow(r.clinical_data) ?? undefined,
    } as BeautyAppointment;
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
    const prodTbl = postgres.getCardTableName('products');
    const n = parts.length;
    const inList = parts.map((_, i) => `$${i + 1}`).join(', ');
    const firmPh = `$${n + 1}`;
    const corpPh = `$${n + 2}`;
    const { rows } = await postgres.query(
        `
            SELECT
                a.*,
                COALESCE(
                    s.name,
                    rs.name,
                    pr.name
                ) AS service_name,
                COALESCE(sp.name, u.full_name, u.username) AS specialist_name
            FROM ${table} a
            LEFT JOIN ${postgres.getCardTableName('beauty_services', 'beauty')} s ON a.service_id = s.id
            LEFT JOIN ${postgres.getCardTableName('services')} rs ON a.service_id = rs.id AND rs.firm_nr = ${firmPh}
            LEFT JOIN ${prodTbl} pr ON pr.id = a.service_id AND pr.firm_nr = ${firmPh}
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
        return rows.map((r: Record<string, unknown> & { clinical_data?: unknown }) => normalizeAppointmentRow(r));
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

const BEAUTY_PGREST_CHUNK = 40;

function periodPaddedForBeauty(): string {
    return String(ERP_SETTINGS.periodNr ?? '01').trim().padStart(2, '0').slice(0, 10);
}

async function postgrestGetByIds<T extends Record<string, unknown>>(
    path: string,
    ids: string[],
    schema: 'public' | 'beauty',
    extra: Record<string, string | number | undefined> = {}
): Promise<T[]> {
    const uuidIds = filterUuidIds(ids);
    if (!uuidIds.length) return [];
    const { postgrest } = await import('./api/postgrestClient');
    const out: T[] = [];
    for (let i = 0; i < uuidIds.length; i += BEAUTY_PGREST_CHUNK) {
        const chunk = uuidIds.slice(i, i + BEAUTY_PGREST_CHUNK);
        const inList = chunk.join(',');
        try {
            const rows = await postgrest.get<T[]>(
                path,
                { select: '*', id: `in.(${inList})`, limit: chunk.length, ...extra },
                { schema }
            );
            if (Array.isArray(rows)) out.push(...rows);
        } catch {
            /* tek parça başarısız — diğer parçalar */
        }
    }
    return out;
}

function addOneDayYmd(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function surveyFeedbackDayKey(createdAt: string | undefined | null): string {
    const raw = String(createdAt ?? '').trim();
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : raw.slice(0, 10);
}

/** Anket geri bildirimleri — tarih aralığı (PostgREST) */
async function fetchSurveyFeedbackInRangePostgrest(
    start: string,
    end: string,
    surveyId?: string | null,
): Promise<BeautyCustomerFeedback[]> {
    if (!shouldUseTenantPostgrestApi()) return [];
    const fn = erpFirmNrForRow();
    const pn = periodPaddedForBeauty();
    const { postgrest } = await import('./api/postgrestClient');
    const endExclusive = addOneDayYmd(end);
    const sid = surveyId?.trim();
    const path = `/rex_${fn}_${pn}_beauty_customer_feedback`;
    const parseRows = (rows: Record<string, unknown>[]) =>
        (Array.isArray(rows) ? rows : []).map((r) =>
            beautyService.parseFeedbackRow(r as BeautyCustomerFeedback & { survey_answers?: unknown }),
        );

    try {
        const andParts = [
            `created_at.gte.${start}T00:00:00.000Z`,
            `created_at.lt.${endExclusive}T00:00:00.000Z`,
        ];
        if (sid) andParts.push(`survey_id.eq.${sid}`);
        const rows = await postgrest.get<Record<string, unknown>[]>(
            path,
            {
                select: '*',
                and: `(${andParts.join(',')})`,
                order: 'created_at.desc',
                limit: 10000,
            },
            { schema: 'beauty' },
        );
        return parseRows(rows);
    } catch (e) {
        console.warn('[beautyService] fetchSurveyFeedbackInRangePostgREST (and):', e);
    }

    const fallbackParams: Record<string, string | number> = {
        select: '*',
        order: 'created_at.desc',
        limit: 10000,
    };
    if (sid) fallbackParams.survey_id = `eq.${sid}`;
    const rows = await postgrest.get<Record<string, unknown>[]>(path, fallbackParams, { schema: 'beauty' });
    return parseRows(rows).filter((r) => {
        const day = surveyFeedbackDayKey(r.created_at);
        return day >= start && day <= end;
    });
}

async function resolveServiceNamesPostgrest(svcIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const uniq = [...new Set(filterUuidIds(svcIds))];
    if (!uniq.length) return out;
    const fn = erpFirmNrForRow();
    const { postgrest } = await import('./api/postgrestClient');
    const beautySvc = await postgrestGetByIds<Record<string, unknown>>(
        `/rex_${fn}_beauty_services`,
        uniq,
        'beauty',
    );
    for (const r of beautySvc) {
        const nm = String(r.name ?? '').trim();
        if (nm) out.set(String(r.id), nm);
    }
    const remaining = uniq.filter((id) => !out.has(id));
    for (let i = 0; i < remaining.length; i += BEAUTY_PGREST_CHUNK) {
        const chunk = remaining.slice(i, i + BEAUTY_PGREST_CHUNK);
        const inList = chunk.join(',');
        try {
            const part = await postgrest.get<Record<string, unknown>[]>(
                `/rex_${fn}_services`,
                {
                    select: 'id,name',
                    id: `in.(${inList})`,
                    firm_nr: `eq.${fn}`,
                    limit: chunk.length,
                },
                { schema: 'public' },
            );
            for (const r of Array.isArray(part) ? part : []) {
                const nm = String(r.name ?? '').trim();
                if (nm) out.set(String(r.id), nm);
            }
        } catch {
            /* */
        }
    }
    const stillMissing = uniq.filter((id) => !out.has(id));
    if (stillMissing.length) {
        const prod = await postgrestGetByIds<Record<string, unknown>>(
            `/rex_${fn}_products`,
            stillMissing,
            'public',
        );
        for (const r of prod) {
            const nm = String(r.name ?? '').trim();
            if (nm) out.set(String(r.id), nm);
        }
    }
    return out;
}

async function resolveSpecialistNamesPostgrest(spIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const uniq = [...new Set(filterUuidIds(spIds))];
    if (!uniq.length) return out;
    const fn = erpFirmNrForRow();
    const { postgrest } = await import('./api/postgrestClient');
    const spCards = await postgrestGetByIds<Record<string, unknown>>(
        `/rex_${fn}_beauty_specialists`,
        uniq,
        'beauty',
    );
    for (const r of spCards) {
        const nm = String(r.name ?? '').trim();
        if (nm) out.set(String(r.id), nm);
    }
    const remaining = uniq.filter((id) => !out.has(id));
    for (let i = 0; i < remaining.length; i += BEAUTY_PGREST_CHUNK) {
        const chunk = remaining.slice(i, i + BEAUTY_PGREST_CHUNK);
        const inList = chunk.join(',');
        try {
            const part = await postgrest.get<Record<string, unknown>[]>(
                '/users',
                {
                    select: 'id,full_name,username',
                    id: `in.(${inList})`,
                    firm_nr: `eq.${fn}`,
                    limit: chunk.length,
                },
                { schema: 'public' },
            );
            for (const u of Array.isArray(part) ? part : []) {
                const nm = String(u.full_name ?? '').trim() || String(u.username ?? '').trim();
                if (nm) out.set(String(u.id), nm);
            }
        } catch {
            /* */
        }
    }
    return out;
}

type SurveyFeedbackEnrichedRow = BeautyCustomerFeedback & {
    customer_name?: string;
    customer_phone?: string | null;
    appointment_date?: string | null;
    appointment_time?: string | null;
    survey_name?: string | null;
    specialist_id?: string;
    specialist_name?: string;
    service_id?: string;
    service_name?: string;
};

async function enrichSurveyFeedbackPostgrest(
    feedback: BeautyCustomerFeedback[],
): Promise<SurveyFeedbackEnrichedRow[]> {
    if (!feedback.length) return [];
    const fn = erpFirmNrForRow();
    const pn = periodPaddedForBeauty();
    const aptIds = [
        ...new Set(
            feedback
                .map((f) => f.appointment_id)
                .filter((id): id is string => Boolean(id?.trim())),
        ),
    ];
    const custIds = [
        ...new Set(
            feedback
                .map((f) => f.customer_id)
                .filter((id): id is string => Boolean(id?.trim())),
        ),
    ];
    const surveyIds = [
        ...new Set(
            feedback
                .map((f) => f.survey_id)
                .filter((id): id is string => Boolean(id?.trim())),
        ),
    ];

    const [apts, custs, surveys] = await Promise.all([
        postgrestGetByIds<Record<string, unknown>>(
            `/rex_${fn}_${pn}_beauty_appointments`,
            aptIds,
            'beauty',
        ),
        postgrestGetByIds<Record<string, unknown>>(`/rex_${fn}_customers`, custIds, 'public'),
        postgrestGetByIds<Record<string, unknown>>(
            `/rex_${fn}_beauty_satisfaction_surveys`,
            surveyIds,
            'beauty',
        ),
    ]);

    const aptMap = new Map<string, Record<string, unknown>>();
    const spIds: string[] = [];
    const svcIds: string[] = [];
    for (const a of apts) {
        const id = String(a.id);
        aptMap.set(id, a);
        if (a.specialist_id) spIds.push(String(a.specialist_id));
        if (a.service_id) svcIds.push(String(a.service_id));
    }
    const custMap = new Map<string, { name: string; phone: string }>();
    for (const c of custs) {
        const phone =
            String(c.phone ?? '').trim() || String(c.phone2 ?? '').trim();
        custMap.set(String(c.id), {
            name: String(c.name ?? ''),
            phone,
        });
    }
    const surveyMap = new Map<string, string>();
    for (const s of surveys) surveyMap.set(String(s.id), String(s.name ?? ''));

    const [spNames, svcNames] = await Promise.all([
        resolveSpecialistNamesPostgrest(spIds),
        resolveServiceNamesPostgrest(svcIds),
    ]);

    return feedback.map((f) => {
        const apt = f.appointment_id ? aptMap.get(String(f.appointment_id)) : undefined;
        const spId = apt?.specialist_id ? String(apt.specialist_id) : '';
        const svcId = apt?.service_id ? String(apt.service_id) : '';
        const aptDateRaw = apt?.appointment_date;
        const aptTimeRaw = apt?.appointment_time;
        const cust = f.customer_id ? custMap.get(String(f.customer_id)) : undefined;
        return {
            ...f,
            customer_name: cust?.name ?? '',
            customer_phone: cust?.phone || null,
            appointment_date: aptDateRaw != null ? String(aptDateRaw).slice(0, 10) : null,
            appointment_time:
                aptTimeRaw != null ? String(aptTimeRaw).slice(0, 5) : null,
            survey_name: f.survey_id ? (surveyMap.get(String(f.survey_id)) ?? '') : null,
            specialist_id: spId,
            specialist_name: spId ? (spNames.get(spId) ?? '—') : undefined,
            service_id: svcId,
            service_name: svcId ? (svcNames.get(svcId) ?? '—') : undefined,
        };
    });
}

async function completedAppointmentStatsPostgrest(
    start: string,
    end: string,
): Promise<{ total: number; byDay: Map<string, number> }> {
    const byDay = new Map<string, number>();
    let total = 0;
    const apts = await getAppointmentsInRangePostgrestBranch(start, end);
    if (!apts) return { total, byDay };
    for (const a of apts) {
        if (String(a.status ?? '').trim().toLowerCase() !== 'completed') continue;
        const key = String(a.appointment_date ?? a.date ?? '').slice(0, 10);
        if (!key || key < start || key > end) continue;
        total += 1;
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    return { total, byDay };
}

/** Anket raporları — geri bildirim + tamamlanan randevu (PostgREST) */
async function buildSurveyFeedbackContextPostgrest(
    start: string,
    end: string,
    surveyId?: string | null,
): Promise<{
    feedback: BeautyCustomerFeedback[];
    enriched: SurveyFeedbackEnrichedRow[];
    completedTotal: number;
    completedByDay: Map<string, number>;
} | null> {
    if (!shouldUseTenantPostgrestApi()) return null;
    try {
        const [feedback, completed] = await Promise.all([
            fetchSurveyFeedbackInRangePostgrest(start, end, surveyId),
            completedAppointmentStatsPostgrest(start, end),
        ]);
        const enriched = await enrichSurveyFeedbackPostgrest(feedback);
        return {
            feedback,
            enriched,
            completedTotal: completed.total,
            completedByDay: completed.byDay,
        };
    } catch (e) {
        console.warn('[beautyService] buildSurveyFeedbackContextPostgREST:', e);
        return null;
    }
}

/** PostgREST modunda köprü SQL yedeği kullanılmaz (slug ≠ DB adı, örn. aqua / aqua_beauty). */
function surveyReportBlocksSqlFallback(): boolean {
    return shouldUseTenantPostgrestApi();
}

/** Web hibrit: güzellik hizmet listesi PostgREST (köprü SQL yok) */
async function getServicesPostgrestBranch(): Promise<BeautyService[] | null> {
    if (!shouldUseTenantPostgrestApi()) return null;
    try {
        const { postgrest } = await import('./api/postgrestClient');
        const fn = erpFirmNrForRow();
        const firmRaw = String(ERP_SETTINGS.firmNr ?? '001').trim();
        const firmPadded = firmRaw.padStart(3, '0').slice(0, 10);
        const firmCandidates = firmPadded === firmRaw ? [firmPadded] : [firmPadded, firmRaw];
        const firmIn = firmCandidates.join(',');
        const seen = new Set<string>();
        const out: BeautyService[] = [];

        try {
            const beautyRows = await postgrest.get<Record<string, unknown>[]>(
                `/rex_${fn}_beauty_services`,
                {
                    select: '*',
                    order: 'parent_category.asc.nullsfirst,category.asc,name.asc',
                    limit: 4000,
                },
                { schema: 'beauty' }
            );
            for (const r of Array.isArray(beautyRows) ? beautyRows : []) {
                const id = String(r.id);
                if (seen.has(id)) continue;
                seen.add(id);
                const isActive = r.is_active === undefined || r.is_active === null ? true : r.is_active !== false;
                out.push({ ...(r as unknown as BeautyService), is_active: isActive });
            }
        } catch (e) {
            console.warn('[beautyService] PostgREST beauty_services:', e);
        }

        try {
            const erpRows = await postgrest.get<Record<string, unknown>[]>(
                `/rex_${fn}_services`,
                {
                    select: '*',
                    firm_nr: `in.(${firmIn})`,
                    order: 'category.asc.nullslast,name.asc',
                    limit: 4000,
                },
                { schema: 'public' }
            );
            for (const r of Array.isArray(erpRows) ? erpRows : []) {
                const id = String(r.id);
                if (seen.has(id)) continue;
                const active = r.is_active;
                if (active !== undefined && active !== null && active === false) continue;
                seen.add(id);
                out.push(mapFirmServiceRowToBeauty(r));
            }
        } catch (e) {
            console.warn('[beautyService] PostgREST rex_services:', e);
        }

        try {
            const prodRows = await postgrest.get<Record<string, unknown>[]>(
                `/rex_${fn}_products`,
                {
                    select: '*',
                    firm_nr: `in.(${firmIn})`,
                    limit: 5000,
                },
                { schema: 'public' }
            );
            for (const r of Array.isArray(prodRows) ? prodRows : []) {
                if (!productRowIsService(r)) continue;
                const id = String(r.id);
                if (seen.has(id)) continue;
                seen.add(id);
                out.push(mapProductServiceRowToBeauty(r));
            }
        } catch (e) {
            console.warn('[beautyService] PostgREST products (hizmet):', e);
        }

        out.sort((a, b) => {
            const c = String(a.category ?? '').localeCompare(String(b.category ?? ''), 'tr');
            if (c !== 0) return c;
            return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr');
        });
        return out;
    } catch (e) {
        console.warn('[beautyService] getServicesPostgrestBranch:', e);
        return null;
    }
}

/** Randevu aralığı — PostgREST çoklu istek + birleştirme */
async function getAppointmentsInRangePostgrestBranch(
    startDate: string,
    endDate: string
): Promise<BeautyAppointment[] | null> {
    if (!shouldUseTenantPostgrestApi()) return null;
    const fn = erpFirmNrForRow();
    const pn = periodPaddedForBeauty();
    try {
        const { postgrest } = await import('./api/postgrestClient');
        const aptPath = `/rex_${fn}_${pn}_beauty_appointments`;
        const rows = await postgrest.get<Record<string, unknown>[]>(
            aptPath,
            {
                select: '*',
                or: `(and(appointment_date.gte.${startDate},appointment_date.lte.${endDate}),and(status.eq.completed,updated_at.gte.${startDate}T00:00:00.000Z,updated_at.lte.${endDate}T23:59:59.999Z))`,
                order: 'appointment_date.asc,appointment_time.asc',
                limit: 4000,
            },
            { schema: 'beauty' }
        );
        const appointments = Array.isArray(rows) ? rows : [];
        const svcIds: string[] = [];
        const spIds: string[] = [];
        const custIds: string[] = [];
        const devIds: string[] = [];
        for (const a of appointments) {
            if (a.service_id) svcIds.push(String(a.service_id));
            if (a.specialist_id) spIds.push(String(a.specialist_id));
            if (a.client_id) custIds.push(String(a.client_id));
            if (a.device_id) devIds.push(String(a.device_id));
        }

        const beautySvc = await postgrestGetByIds<Record<string, unknown>>(
            `/rex_${fn}_beauty_services`,
            svcIds,
            'beauty'
        );
        const mapBeautySvc = new Map<string, { name: string; color: string }>();
        for (const r of beautySvc) {
            mapBeautySvc.set(String(r.id), {
                name: String(r.name ?? ''),
                color: String(r.color ?? '#6366f1'),
            });
        }

        const firmIn = fn;
        const erpSvcList: Record<string, unknown>[] = [];
        for (let i = 0; i < svcIds.length; i += BEAUTY_PGREST_CHUNK) {
            const chunk = filterUuidIds(svcIds.slice(i, i + BEAUTY_PGREST_CHUNK));
            if (!chunk.length) continue;
            const inList = chunk.join(',');
            try {
                const part = await postgrest.get<Record<string, unknown>[]>(
                    `/rex_${fn}_services`,
                    {
                        select: 'id,name',
                        id: `in.(${inList})`,
                        firm_nr: `eq.${firmIn}`,
                        limit: chunk.length,
                    },
                    { schema: 'public' }
                );
                if (Array.isArray(part)) erpSvcList.push(...part);
            } catch {
                /* */
            }
        }
        const mapErpSvc = new Map<string, string>();
        for (const r of erpSvcList) mapErpSvc.set(String(r.id), String(r.name ?? ''));

        const prodList = await postgrestGetByIds<Record<string, unknown>>(
            `/rex_${fn}_products`,
            svcIds,
            'public'
        );
        const mapProdSvc = new Map<string, string>();
        for (const r of prodList) {
            const nm = String(r.name ?? '').trim();
            if (nm) mapProdSvc.set(String(r.id), nm);
        }

        const spCards = await postgrestGetByIds<Record<string, unknown>>(
            `/rex_${fn}_beauty_specialists`,
            spIds,
            'beauty'
        );
        const mapSpCard = new Map<string, string>();
        for (const r of spCards) mapSpCard.set(String(r.id), String(r.name ?? ''));

        const usersList: Record<string, unknown>[] = [];
        for (let i = 0; i < spIds.length; i += BEAUTY_PGREST_CHUNK) {
            const chunk = filterUuidIds(spIds.slice(i, i + BEAUTY_PGREST_CHUNK));
            if (!chunk.length) continue;
            const inList = chunk.join(',');
            try {
                const part = await postgrest.get<Record<string, unknown>[]>(
                    '/users',
                    {
                        select: 'id,full_name,username,phone,email',
                        id: `in.(${inList})`,
                        firm_nr: `eq.${firmIn}`,
                        limit: chunk.length,
                    },
                    { schema: 'public' }
                );
                if (Array.isArray(part)) usersList.push(...part);
            } catch {
                /* users tablosu PostgREST’te kapalı olabilir */
            }
        }
        const mapUserSp = new Map<string, string>();
        for (const u of usersList) {
            const nm = String(u.full_name ?? '').trim() || String(u.username ?? '');
            if (nm) mapUserSp.set(String(u.id), nm);
        }

        const custRows = await postgrestGetByIds<Record<string, unknown>>(
            `/rex_${fn}_customers`,
            custIds,
            'public'
        );
        const mapCust = new Map<string, { name: string; phone: string }>();
        for (const c of custRows) {
            const phone =
                String(c.phone ?? '').trim() || String(c.phone2 ?? '').trim();
            mapCust.set(String(c.id), {
                name: String(c.name ?? ''),
                phone,
            });
        }

        const devRows = await postgrestGetByIds<Record<string, unknown>>(
            `/rex_${fn}_beauty_devices`,
            devIds,
            'beauty'
        );
        const mapDev = new Map<string, string>();
        for (const d of devRows) mapDev.set(String(d.id), String(d.name ?? ''));

        const merged: BeautyAppointment[] = appointments.map((a) => {
            const sid = a.service_id ? String(a.service_id) : '';
            const bs = sid ? mapBeautySvc.get(sid) : undefined;
            const svcName =
                (bs?.name && bs.name.trim()) ||
                (sid ? mapErpSvc.get(sid) : '') ||
                (sid ? mapProdSvc.get(sid) : '') ||
                '';
            const spid = a.specialist_id ? String(a.specialist_id) : '';
            const specName =
                (spid && mapSpCard.get(spid)) ||
                (spid && mapUserSp.get(spid)) ||
                '';
            const cid = a.client_id ? String(a.client_id) : '';
            const cust = cid ? mapCust.get(cid) : undefined;
            const did = a.device_id ? String(a.device_id) : '';
            const row: Record<string, unknown> & { clinical_data?: unknown } = {
                ...a,
                service_name: svcName,
                service_color: bs?.color ?? '#6366f1',
                specialist_name: specName,
                customer_name: cust?.name ?? '',
                customer_phone: cust?.phone || undefined,
                device_name: did ? mapDev.get(did) ?? '' : '',
            };
            return normalizeAppointmentRow(row);
        });
        return merged;
    } catch (e) {
        console.warn('[beautyService] getAppointmentsInRange PostgREST:', e);
        return null;
    }
}

/** Uzman listesi — kullanıcılar + güzellik kartı (PostgREST) */
async function getSpecialistsPostgrestBranch(): Promise<BeautySpecialist[] | null> {
    if (!shouldUseTenantPostgrestApi()) return null;
    const palette = ['#9333ea', '#6366f1', '#0d9488', '#ea580c', '#db2777', '#0891b2', '#7c3aed', '#059669'];
    const fn = erpFirmNrForRow();
    try {
        const { postgrest } = await import('./api/postgrestClient');
        let userRows: Record<string, unknown>[] = [];
        try {
            const u = await postgrest.get<Record<string, unknown>[]>(
                '/users',
                {
                    select: 'id,full_name,username,phone,email,is_active',
                    firm_nr: `eq.${fn}`,
                    order: 'full_name.asc',
                    limit: 800,
                },
                { schema: 'public' }
            );
            userRows = Array.isArray(u) ? u : [];
        } catch {
            return null;
        }

        const spRows = await postgrest.get<Record<string, unknown>[]>(
            `/rex_${fn}_beauty_specialists`,
            { select: '*', order: 'name.asc', limit: 800 },
            { schema: 'beauty' }
        );
        const spById = new Map<string, Record<string, unknown>>();
        for (const r of Array.isArray(spRows) ? spRows : []) spById.set(String(r.id), r);

        const fromUsers: BeautySpecialist[] = userRows.map((u, i) => {
            const bs = spById.get(String(u.id));
            const name =
                (bs?.name != null && String(bs.name).trim()) ||
                String(u.full_name ?? '').trim() ||
                String(u.username ?? '');
            return {
                id: String(u.id),
                name,
                phone: u.phone != null ? String(u.phone) : undefined,
                email: u.email != null ? String(u.email) : undefined,
                specialty: bs?.specialty != null ? String(bs.specialty) : undefined,
                color: (bs?.color as string) || palette[i % palette.length],
                commission_rate: Number(bs?.commission_rate ?? 0) || 0,
                product_unit_commission: Number(bs?.product_unit_commission ?? 0) || 0,
                is_active: (bs?.is_active !== undefined ? bs?.is_active : u.is_active) !== false,
                avatar_url: bs?.avatar_url != null ? String(bs.avatar_url) : undefined,
                working_hours: bs?.working_hours ?? undefined,
            } as BeautySpecialist;
        });

        const userIds = new Set(userRows.map((u) => String(u.id)));
        const legacy: BeautySpecialist[] = [];
        for (const r of Array.isArray(spRows) ? spRows : []) {
            if (userIds.has(String(r.id))) continue;
            legacy.push({
                id: String(r.id),
                name: String(r.name ?? ''),
                phone: r.phone != null ? String(r.phone) : undefined,
                email: r.email != null ? String(r.email) : undefined,
                specialty: r.specialty != null ? String(r.specialty) : undefined,
                color: (r.color as string) ?? '#9333ea',
                commission_rate: Number(r.commission_rate) || 0,
                product_unit_commission: Number(r.product_unit_commission) || 0,
                is_active: r.is_active !== false,
                avatar_url: r.avatar_url != null ? String(r.avatar_url) : undefined,
                working_hours: r.working_hours ?? undefined,
            } as BeautySpecialist);
        }
        return [...fromUsers, ...legacy];
    } catch (e) {
        console.warn('[beautyService] getSpecialists PostgREST:', e);
        return null;
    }
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
    }]).map((item) => {
        const line = item as Partial<BeautySaleItem>;
        return {
        productId: line.item_id
            ? String(line.item_id)
            : `beauty-${String(line.item_type ?? 'line')}-${String(line.name ?? 'x').slice(0, 24)}`,
        productName: String(line.name ?? 'Kalem'),
        quantity: Number(line.quantity ?? 1),
        price: Number(line.unit_price ?? 0),
        discount: Number(line.discount ?? 0),
        total: Number(line.total ?? 0),
    };
    });

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
        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = erpFirmNrForRow();
                const rows = await postgrest.get<BeautyCustomer[]>(
                    `/rex_${fn}_customers`,
                    {
                        select:
                            'id,code,name,phone,phone2,age,file_id,occupation,gender,customer_tier,heard_from,email,address,city,points,total_spent,balance,is_active,notes,created_at',
                        is_active: 'eq.true',
                        firm_nr: `eq.${fn}`,
                        order: 'name.asc',
                        limit: 5000,
                    },
                    { schema: 'public' }
                );
                const list = Array.isArray(rows) ? rows : [];
                return list.map((c: BeautyCustomer): BeautyCustomer => ({
                    ...c,
                    appointment_count: 0,
                    last_appointment_date: undefined,
                    last_service_name: undefined,
                }));
            } catch (e) {
                console.warn('[beautyService] getCustomers PostgREST (basit liste, randevu sayıları yok):', e);
            }
        }
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
        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const px = `rex_${fn}`;
                const q = String(term || '').trim().slice(0, 120).replace(/[(),]/g, ' ');
                if (!q) return [];
                const pat = `*${q}*`;
                const rows = await postgrest.get<BeautyCustomer[]>(
                    `/${px}_customers`,
                    {
                        select:
                            'id,code,name,phone,phone2,age,file_id,occupation,gender,customer_tier,heard_from,email,address,city,points,total_spent,balance,is_active,notes',
                        is_active: 'eq.true',
                        or: `(name.ilike.${pat},phone.ilike.${pat},phone2.ilike.${pat},email.ilike.${pat},code.ilike.${pat},notes.ilike.${pat},occupation.ilike.${pat},file_id.ilike.${pat})`,
                        order: 'name.asc',
                        limit: 50,
                    },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            } catch (e) {
                console.warn('[beautyService] searchCustomers PostgREST failed:', e);
                return [];
            }
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const path = `/rex_${fn}_customers`;
            await postgrest.post(
                path,
                {
                    id,
                    firm_nr: fn,
                    code,
                    name: data.name,
                    phone: data.phone ?? null,
                    phone2: data.phone2?.trim() || null,
                    email: data.email ?? null,
                    address: data.address ?? null,
                    city: data.city ?? null,
                    notes: data.notes?.trim() || null,
                    age: ageVal,
                    file_id: fileIdVal,
                    occupation: data.occupation?.trim() || null,
                    gender: genderVal,
                    customer_tier: tierVal,
                    heard_from: data.heard_from?.trim() || null,
                    is_active: true,
                },
                { schema: 'public', prefer: 'return=minimal' }
            );
            return id;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const patchBody = stripUndefinedFields({
                name: data.name,
                phone: data.phone === undefined ? undefined : data.phone ?? null,
                phone2: data.phone2 === undefined ? undefined : data.phone2?.trim() || null,
                email: data.email === undefined ? undefined : data.email ?? null,
                address: data.address === undefined ? undefined : data.address ?? null,
                city: data.city === undefined ? undefined : data.city ?? null,
                notes: data.notes === undefined ? undefined : data.notes ?? null,
                file_id:
                    data.file_id === undefined
                        ? undefined
                        : data.file_id != null && String(data.file_id).trim() !== ''
                            ? String(data.file_id).trim()
                            : null,
                occupation: data.occupation === undefined ? undefined : data.occupation?.trim() || null,
                gender:
                    data.gender === undefined
                        ? undefined
                        : (() => {
                            const g = String(data.gender ?? '').trim().toLowerCase();
                            return g === 'female' || g === 'male' || g === 'other' ? g : null;
                        })(),
                customer_tier:
                    data.customer_tier === undefined
                        ? undefined
                        : String(data.customer_tier ?? 'normal').trim().toLowerCase() === 'vip'
                            ? 'vip'
                            : 'normal',
                heard_from: data.heard_from === undefined ? undefined : data.heard_from?.trim() || null,
                age:
                    data.age === undefined
                        ? undefined
                        : data.age === null
                            ? null
                            : (() => {
                                const n = Number(data.age);
                                return Number.isFinite(n) ? Math.round(n) : null;
                            })(),
            });
            if (Object.keys(patchBody).length === 0) return;
            await postgrest.patch(
                `/rex_${fn}_customers?id=eq.${encodeURIComponent(id)}`,
                patchBody,
                { schema: 'public', prefer: 'return=minimal' }
            );
            return;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            try {
                const pr = await getSpecialistsPostgrestBranch();
                if (pr != null) return pr;
            } catch (e) {
                console.warn('[beautyService] getSpecialists PostgREST denemesi:', e);
            }
        }
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
                COALESCE(bs.product_unit_commission, 0)::float AS product_unit_commission,
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
            product_unit_commission: Number(r.product_unit_commission) || 0,
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
            product_unit_commission: Number(r.product_unit_commission) || 0,
            is_active: r.is_active !== false,
            avatar_url: r.avatar_url ?? undefined,
            working_hours: r.working_hours ?? undefined,
        }));

        return [...fromUsers, ...legacy];
    },

    async createSpecialist(data: Partial<BeautySpecialist>): Promise<string> {
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        const fn = erpFirmNrForRow();
        const id = uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            await postgrest.post(
                `/rex_${fn}_beauty_specialists`,
                {
                    id,
                    name: data.name,
                    phone: data.phone ?? null,
                    email: data.email ?? null,
                    specialty: data.specialty ?? null,
                    color: data.color ?? '#9333ea',
                    commission_rate: data.commission_rate ?? 0,
                    product_unit_commission: data.product_unit_commission ?? 0,
                    avatar_url: data.avatar_url ?? null,
                    is_active: data.is_active !== false,
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
        await postgres.query(
            `INSERT INTO ${t}
                (id, name, phone, email, specialty, color, commission_rate, product_unit_commission, avatar_url, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
            [id, data.name, data.phone ?? null, data.email ?? null, data.specialty ?? null,
             data.color ?? '#9333ea', data.commission_rate ?? 0, data.product_unit_commission ?? 0, data.avatar_url ?? null,
             data.is_active !== false]
        );
        return id;
    },

    async updateSpecialist(id: string, data: Partial<BeautySpecialist>): Promise<void> {
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        const fn = erpFirmNrForRow();
        const active = data.is_active !== false;
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const path = `/rex_${fn}_beauty_specialists`;
            const row = {
                id,
                name: data.name ?? '',
                phone: data.phone ?? null,
                email: data.email ?? null,
                specialty: data.specialty ?? null,
                color: data.color ?? '#9333ea',
                commission_rate: data.commission_rate ?? 0,
                product_unit_commission: data.product_unit_commission ?? 0,
                avatar_url: data.avatar_url ?? null,
                is_active: active,
            };
            if (await postgrestRowExists(path, 'beauty', id)) {
                await postgrest.patch(
                    `${path}?id=eq.${encodeURIComponent(id)}`,
                    stripUndefinedFields(row),
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await postgrest.post(path, row, { schema: 'beauty', prefer: 'return=minimal' });
            }
            return;
        }
        await postgres.query(
            `INSERT INTO ${t}
                (id, name, phone, email, specialty, color, commission_rate, product_unit_commission, avatar_url, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                phone = EXCLUDED.phone,
                email = EXCLUDED.email,
                specialty = EXCLUDED.specialty,
                color = EXCLUDED.color,
                commission_rate = EXCLUDED.commission_rate,
                product_unit_commission = EXCLUDED.product_unit_commission,
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
                data.product_unit_commission ?? 0,
                data.avatar_url ?? null,
                active,
            ]
        );
    },

    async toggleSpecialist(id: string, active: boolean): Promise<void> {
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        const fn = erpFirmNrForRow();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const path = `/rex_${fn}_beauty_specialists`;
            if (await postgrestRowExists(path, 'beauty', id)) {
                await postgrest.patch(
                    `${path}?id=eq.${encodeURIComponent(id)}`,
                    { is_active: active, updated_at: new Date().toISOString() },
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
                return;
            }
            const users = await postgrest.get<Record<string, unknown>[]>(
                '/users',
                { select: 'full_name,username,phone,email', id: `eq.${id}`, limit: 1 },
                { schema: 'public' }
            );
            const u = Array.isArray(users) ? users[0] : undefined;
            if (!u) return;
            await postgrest.post(
                path,
                {
                    id,
                    name: (String(u.full_name ?? u.username ?? '').trim() || String(u.username ?? '')).trim(),
                    phone: u.phone ?? null,
                    email: u.email ?? null,
                    specialty: null,
                    color: '#9333ea',
                    commission_rate: 0,
                    product_unit_commission: 0,
                    avatar_url: null,
                    is_active: active,
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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
                (id, name, phone, email, specialty, color, commission_rate, product_unit_commission, avatar_url, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,NULL,$5,0,0,NULL,$6,NOW(),NOW())
             ON CONFLICT (id) DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = NOW()`,
            [id, (u.full_name || u.username || '').trim() || u.username, u.phone ?? null, u.email ?? null, '#9333ea', active]
        );
    },

    // =========================================================================
    // SERVICES  (firm card table: rex_{firm}_beauty_services)
    // =========================================================================
    async getServices(): Promise<BeautyService[]> {
        if (shouldUseTenantPostgrestApi()) {
            try {
                const pr = await getServicesPostgrestBranch();
                if (pr != null) return pr;
            } catch (e) {
                console.warn('[beautyService] getServices PostgREST denemesi:', e);
            }
        }
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
                `SELECT * FROM ${t} WHERE is_active IS NOT FALSE ORDER BY parent_category NULLS FIRST, category, name`
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
        const fn = erpFirmNrForRow();
        const id = uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            await postgrest.post(
                `/rex_${fn}_beauty_services`,
                {
                    id,
                    name: data.name,
                    category: data.category ?? 'beauty',
                    parent_category: normalizeParentCategory(data.parent_category),
                    duration_min: data.duration_min ?? 30,
                    price: data.price ?? 0,
                    cost_price: data.cost_price ?? 0,
                    color: data.color ?? '#9333ea',
                    commission_rate: data.commission_rate ?? 0,
                    description: data.description ?? null,
                    requires_device: data.requires_device ?? false,
                    expected_shots: data.expected_shots ?? 0,
                    default_sessions: Math.max(1, Math.round(Number(data.default_sessions ?? 1))),
                    follow_up_reminder_days: normalizeFollowUpReminderDays(data.follow_up_reminder_days),
                    is_active: true,
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
        await postgres.query(
            `INSERT INTO ${t}
                (id, name, category, parent_category, duration_min, price, cost_price, color, commission_rate,
                 description, requires_device, expected_shots, default_sessions, follow_up_reminder_days, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,NOW(),NOW())`,
            [id, data.name, data.category ?? 'beauty', normalizeParentCategory(data.parent_category),
             data.duration_min ?? 30,
             data.price ?? 0, data.cost_price ?? 0, data.color ?? '#9333ea',
             data.commission_rate ?? 0, data.description ?? null,
             data.requires_device ?? false, data.expected_shots ?? 0,
             Math.max(1, Math.round(Number(data.default_sessions ?? 1))),
             normalizeFollowUpReminderDays(data.follow_up_reminder_days)]
        );
        return id;
    },

    async updateService(id: string, data: Partial<BeautyService>): Promise<void> {
        const t = postgres.getCardTableName('beauty_services', 'beauty');
        const fn = erpFirmNrForRow();
        const active = data.is_active !== false;
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const beautyPath = `/rex_${fn}_beauty_services`;
            const row = {
                id,
                name: data.name,
                category: data.category ?? 'beauty',
                parent_category: normalizeParentCategory(data.parent_category),
                duration_min: data.duration_min ?? 30,
                price: data.price ?? 0,
                cost_price: data.cost_price ?? 0,
                color: data.color ?? '#9333ea',
                commission_rate: data.commission_rate ?? 0,
                description: data.description ?? null,
                requires_device: data.requires_device ?? false,
                expected_shots: data.expected_shots ?? 0,
                default_sessions: Math.max(1, Math.round(Number(data.default_sessions ?? 1))),
                follow_up_reminder_days: normalizeFollowUpReminderDays(data.follow_up_reminder_days),
                is_active: active,
            };
            if (await postgrestRowExists(beautyPath, 'beauty', id)) {
                await postgrest.patch(
                    `${beautyPath}?id=eq.${encodeURIComponent(id)}`,
                    stripUndefinedFields(row),
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await postgrest.post(beautyPath, row, { schema: 'beauty', prefer: 'return=minimal' });
            }
            await postgrest.patch(
                `/rex_${fn}_services?id=eq.${encodeURIComponent(id)}`,
                {
                    name: data.name,
                    category: data.category ?? 'beauty',
                    unit_price: data.price ?? 0,
                    purchase_price: data.cost_price ?? 0,
                    updated_at: new Date().toISOString(),
                },
                { schema: 'public', prefer: 'return=minimal' }
            );
            return;
        }
        // Yalnızca UPDATE: kayıt sadece public.rex_*_services içindeyse (ERP hizmet kartı) güzellik
        // tablosunda satır olmaz; follow_up_reminder_days vb. alanlar hiç yazılmazdı. UPSERT ile aynı
        // id üzerinden beauty_services satırı oluşturulur / güncellenir; liste getServices() önce bu
        // tabloyu okuduğu için hatırlatma günü ekranda kalır.
        await postgres.query(
            `INSERT INTO ${t}
                (id, name, category, parent_category, duration_min, price, cost_price, color, commission_rate,
                 description, requires_device, expected_shots, default_sessions, follow_up_reminder_days, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
             ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name,
                 category = EXCLUDED.category,
                 parent_category = EXCLUDED.parent_category,
                 duration_min = EXCLUDED.duration_min,
                 price = EXCLUDED.price,
                 cost_price = EXCLUDED.cost_price,
                 color = EXCLUDED.color,
                 commission_rate = EXCLUDED.commission_rate,
                 description = EXCLUDED.description,
                 requires_device = EXCLUDED.requires_device,
                 expected_shots = EXCLUDED.expected_shots,
                 default_sessions = EXCLUDED.default_sessions,
                 follow_up_reminder_days = EXCLUDED.follow_up_reminder_days,
                 is_active = EXCLUDED.is_active,
                 updated_at = NOW()`,
            [id, data.name, data.category ?? 'beauty', normalizeParentCategory(data.parent_category),
             data.duration_min ?? 30,
             data.price ?? 0, data.cost_price ?? 0, data.color ?? '#9333ea',
             data.commission_rate ?? 0, data.description ?? null,
             data.requires_device ?? false, data.expected_shots ?? 0,
             Math.max(1, Math.round(Number(data.default_sessions ?? 1))),
             normalizeFollowUpReminderDays(data.follow_up_reminder_days),
             active]
        );

        // ERP hizmet kartı (rex_*_services) ile aynı id varsa ad / fiyat / kategori senkron kalsın.
        const svcTbl = postgres.getCardTableName('services');
        const firmRaw = String(ERP_SETTINGS.firmNr ?? '001').trim();
        const firmPadded = firmRaw.padStart(3, '0').slice(0, 10);
        const firmCandidates = firmPadded === firmRaw ? [firmPadded] : [firmPadded, firmRaw];
        const firmInSqlFallback = firmCandidates.map((_, i) => `$${i + 6}`).join(', ');
        await postgres.query(
            `UPDATE ${svcTbl}
             SET name=$2,
                 category=$3,
                 unit_price=$4,
                 purchase_price=$5,
                 updated_at=NOW()
             WHERE id=$1
               AND firm_nr IN (${firmInSqlFallback})`,
            [id, data.name, data.category ?? 'beauty',
             data.price ?? 0, data.cost_price ?? 0,
             ...firmCandidates]
        );
    },

    async deleteService(id: string): Promise<void> {
        const t = postgres.getCardTableName('beauty_services', 'beauty');
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.patch(
                `/rex_${fn}_beauty_services?id=eq.${encodeURIComponent(id)}`,
                { is_active: false, updated_at: new Date().toISOString() },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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

    async getCompletedAppointmentsForDay(dayYmd: string): Promise<BeautyAppointment[]> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const svcBeauty = postgres.getCardTableName('beauty_services', 'beauty');
        const svcFirm = postgres.getCardTableName('services');
        const prodTbl = postgres.getCardTableName('products');
        const fn = erpFirmNrForRow();
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
                a.updated_at,
                COALESCE(
                    s.name,
                    rs.name,
                    pr.name
                ) AS service_name,
                COALESCE(s.color, '#6366f1') AS service_color,
                COALESCE(sp.name, u.full_name, u.username) AS specialist_name,
                c.name   AS customer_name,
                COALESCE(NULLIF(TRIM(c.phone::text), ''), NULLIF(TRIM(c.phone2::text), '')) AS customer_phone,
                d.name   AS device_name
            FROM ${table} a
            LEFT JOIN ${svcBeauty} s ON a.service_id = s.id
            LEFT JOIN ${svcFirm} rs ON a.service_id = rs.id AND rs.firm_nr = $2
            LEFT JOIN ${prodTbl} pr ON pr.id = a.service_id AND pr.firm_nr = $2
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            LEFT JOIN users u ON a.specialist_id = u.id AND lpad(trim(u.firm_nr::text), 3, '0') = $2
            LEFT JOIN ${postgres.getCardTableName('beauty_devices', 'beauty')} d ON a.device_id = d.id
            LEFT JOIN ${postgres.getCardTableName('customers')} c ON a.client_id = c.id
            WHERE LOWER(TRIM(COALESCE(a.status::text, ''))) = 'completed'
              AND (
                a.appointment_date = $1::date
                OR (a.updated_at IS NOT NULL AND a.updated_at::date = $1::date)
              )
            ORDER BY COALESCE(a.updated_at, a.created_at) DESC NULLS LAST, a.appointment_time DESC NULLS LAST
        `;
        const result = await postgres.query(query, [dayYmd, fn]);
        return result.rows.map((r: Record<string, unknown> & { clinical_data?: unknown }) => normalizeAppointmentRow(r));
    },

    async getAppointmentsInRange(startDate: string, endDate: string): Promise<BeautyAppointment[]> {
        if (shouldUseTenantPostgrestApi()) {
            try {
                const pr = await getAppointmentsInRangePostgrestBranch(startDate, endDate);
                if (pr != null) return pr;
            } catch (e) {
                console.warn('[beautyService] getAppointmentsInRange PostgREST denemesi:', e);
            }
        }
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const svcBeauty = postgres.getCardTableName('beauty_services', 'beauty');
        const svcFirm = postgres.getCardTableName('services');
        const prodTbl = postgres.getCardTableName('products');
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
                a.updated_at,
                COALESCE(
                    s.name,
                    rs.name,
                    pr.name
                ) AS service_name,
                COALESCE(s.color, '#6366f1') AS service_color,
                COALESCE(sp.name, u.full_name, u.username) AS specialist_name,
                c.name   AS customer_name,
                COALESCE(NULLIF(TRIM(c.phone::text), ''), NULLIF(TRIM(c.phone2::text), '')) AS customer_phone,
                d.name   AS device_name
            FROM ${table} a
            LEFT JOIN ${svcBeauty} s ON a.service_id = s.id
            LEFT JOIN ${svcFirm} rs ON a.service_id = rs.id AND rs.firm_nr = $3
            LEFT JOIN ${prodTbl} pr ON pr.id = a.service_id AND pr.firm_nr = $3
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            LEFT JOIN users u ON a.specialist_id = u.id AND lpad(trim(u.firm_nr::text), 3, '0') = $3
            LEFT JOIN ${postgres.getCardTableName('beauty_devices', 'beauty')} d ON a.device_id = d.id
            LEFT JOIN ${postgres.getCardTableName('customers')}                    c  ON a.client_id     = c.id
            WHERE (
                a.appointment_date >= $1 AND a.appointment_date <= $2
                OR (
                    LOWER(TRIM(COALESCE(a.status::text, ''))) = 'completed'
                    AND a.updated_at IS NOT NULL
                    AND a.updated_at::date >= $1
                    AND a.updated_at::date <= $2
                )
            )
            ORDER BY a.appointment_date, a.appointment_time
        `;
        const fn = erpFirmNrForRow();
        const result = await postgres.query(query, [startDate, endDate, fn]);
        return result.rows.map((r: Record<string, unknown> & { clinical_data?: unknown }) => normalizeAppointmentRow(r));
    },

    async listFollowUpReminderActionsInRange(
        startDate: string,
        endDate: string,
    ): Promise<BeautyFollowUpReminderAction[]> {
        try {
            const table = postgres.getCardTableName('follow_up_reminder_actions', 'beauty');
            const fn = erpFirmNrForRow();
            const sql = `
              SELECT *
              FROM ${table}
              WHERE firm_nr = $1
                AND status <> 'dismissed'
                AND (
                  (natural_due_date >= $2::date AND natural_due_date <= $3::date)
                  OR (postponed_due_date IS NOT NULL AND postponed_due_date >= $2::date AND postponed_due_date <= $3::date)
                )
            `;
            const { rows } = await postgres.query(sql, [fn, startDate, endDate]);
            return (rows as Record<string, unknown>[]).map((r) => ({
                id: r.id != null ? String(r.id) : undefined,
                firm_nr: r.firm_nr != null ? String(r.firm_nr) : undefined,
                customer_id: String(r.customer_id ?? ''),
                service_id: String(r.service_id ?? ''),
                product_id: r.product_id != null ? String(r.product_id) : undefined,
                reminder_kind: String(r.reminder_kind ?? 'service') === 'product' ? 'product' : 'service',
                last_completed_date: pgCellToYmd(r.last_completed_date),
                natural_due_date: pgCellToYmd(r.natural_due_date),
                reminder_days: r.reminder_days != null ? Number(r.reminder_days) : undefined,
                customer_name: r.customer_name != null ? String(r.customer_name) : undefined,
                customer_phone: r.customer_phone != null ? String(r.customer_phone) : undefined,
                service_name: r.service_name != null ? String(r.service_name) : undefined,
                product_name: r.product_name != null ? String(r.product_name) : undefined,
                status: String(r.status ?? 'due') as BeautyFollowUpReminderStatus,
                postponed_due_date: r.postponed_due_date ? pgCellToYmd(r.postponed_due_date) : undefined,
                show_natural_when_postponed: Boolean(r.show_natural_when_postponed),
                note: r.note != null ? String(r.note) : undefined,
            }));
        } catch (e: unknown) {
            console.warn(
                '[beautyService] listFollowUpReminderActionsInRange skipped:',
                e instanceof Error ? e.message : String(e),
            );
            return [];
        }
    },

    async upsertFollowUpReminderAction(
        payload: BeautyFollowUpReminderAction,
    ): Promise<void> {
        const table = postgres.getCardTableName('follow_up_reminder_actions', 'beauty');
        const fn = erpFirmNrForRow();
        const status = payload.status ?? 'due';
        const postponed =
            status === 'postponed' && payload.postponed_due_date
                ? payload.postponed_due_date
                : null;
        const sql = `
          INSERT INTO ${table} (
            firm_nr, customer_id, service_id, product_id, reminder_kind,
            last_completed_date, natural_due_date, reminder_days,
            customer_name, customer_phone, service_name, product_name,
            status, postponed_due_date, show_natural_when_postponed, note, updated_at
          ) VALUES (
            $1, $2::uuid, $3::uuid, $4::uuid, $5,
            $6::date, $7::date, $8,
            $9, $10, $11, $12,
            $13, $14::date, $15, $16, NOW()
          )
          ON CONFLICT (customer_id, service_id, COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid), last_completed_date, natural_due_date, reminder_kind)
          DO UPDATE SET
            status = EXCLUDED.status,
            postponed_due_date = EXCLUDED.postponed_due_date,
            show_natural_when_postponed = EXCLUDED.show_natural_when_postponed,
            note = EXCLUDED.note,
            customer_name = EXCLUDED.customer_name,
            customer_phone = EXCLUDED.customer_phone,
            service_name = EXCLUDED.service_name,
            product_name = EXCLUDED.product_name,
            reminder_days = EXCLUDED.reminder_days,
            updated_at = NOW()
        `;
        await postgres.query(sql, [
            fn,
            payload.customer_id,
            payload.service_id,
            payload.product_id || null,
            payload.reminder_kind ?? 'service',
            payload.last_completed_date,
            payload.natural_due_date,
            payload.reminder_days ?? null,
            payload.customer_name ?? null,
            payload.customer_phone ?? null,
            payload.service_name ?? null,
            payload.product_name ?? null,
            status,
            postponed,
            status === 'postponed' && Boolean(payload.show_natural_when_postponed),
            payload.note?.trim() || null,
        ]);
    },

    async getFollowUpRemindersInRange(startDate: string, endDate: string): Promise<BeautyFollowUpReminder[]> {
        try {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const logT = postgres.getMovementTableName('beauty_consumable_usage_log', 'beauty');
        const svcBeauty = postgres.getCardTableName('beauty_services', 'beauty');
        const prodT = postgres.getCardTableName('products');
        const cust = postgres.getCardTableName('customers');
        const firmRaw = String(ERP_SETTINGS.firmNr ?? '001').trim();
        const firmPadded = firmRaw.padStart(3, '0').slice(0, 10);
        const firmCandidates = firmPadded === firmRaw ? [firmPadded] : [firmPadded, firmRaw];
        const firmInSql = firmCandidates.map((_, i) => `$${3 + i}`).join(', ');
        const params = [startDate, endDate, ...firmCandidates];

        const query = `
            WITH appt_events AS (
                SELECT
                    a.*,
                    CASE
                        WHEN LOWER(TRIM(COALESCE(a.status::text, ''))) = 'completed'
                          AND a.updated_at IS NOT NULL
                          AND a.appointment_date IS NOT NULL
                          AND a.updated_at::date < a.appointment_date::date
                        THEN a.updated_at::date
                        ELSE a.appointment_date::date
                    END AS effective_appointment_date
                FROM ${table} a
            ),
            last_done AS (
                SELECT
                    a.client_id AS customer_id,
                    a.service_id,
                    MAX(a.effective_appointment_date) AS last_dt
                FROM appt_events a
                WHERE LOWER(TRIM(COALESCE(a.status::text, ''))) = 'completed'
                  AND a.client_id IS NOT NULL
                  AND a.service_id IS NOT NULL
                  AND a.effective_appointment_date IS NOT NULL
                GROUP BY a.client_id, a.service_id
            ),
            customer_completed_visits AS (
                SELECT DISTINCT
                    a.client_id AS customer_id,
                    a.effective_appointment_date AS visit_dt
                FROM appt_events a
                WHERE LOWER(TRIM(COALESCE(a.status::text, ''))) = 'completed'
                  AND a.client_id IS NOT NULL
                  AND a.effective_appointment_date IS NOT NULL
            ),
            svc AS (
                SELECT s.id AS service_id, s.name AS service_name, s.follow_up_reminder_days::int AS days
                FROM ${svcBeauty} s
                WHERE s.follow_up_reminder_days IS NOT NULL
                  AND s.follow_up_reminder_days > 0
                  AND (s.is_active IS NULL OR s.is_active = true)
            ),
            svc_rows AS (
                SELECT
                    (ld.last_dt + svc.days) AS due_date,
                    ld.last_dt AS last_completed_date,
                    svc.days AS reminder_days,
                    ld.service_id::text AS service_id,
                    svc.service_name,
                    ld.customer_id::text AS customer_id,
                    COALESCE(NULLIF(trim(c.name), ''), '') AS customer_name,
                    COALESCE(NULLIF(TRIM(c.phone::text), ''), NULLIF(TRIM(c.phone2::text), '')) AS customer_phone,
                    'service'::text AS reminder_kind,
                    NULL::text AS product_id,
                    NULL::text AS product_name
                FROM last_done ld
                INNER JOIN svc ON svc.service_id = ld.service_id
                LEFT JOIN ${cust} c ON c.id = ld.customer_id
                WHERE (ld.last_dt + svc.days) >= $1::date
                  AND (ld.last_dt + svc.days) <= $2::date
                  AND NOT EXISTS (
                    SELECT 1
                    FROM appt_events b
                    WHERE b.client_id = ld.customer_id
                      AND b.service_id = ld.service_id
                      AND b.effective_appointment_date > ld.last_dt
                      AND b.effective_appointment_date <= (ld.last_dt + svc.days)
                      AND b.status NOT IN ('cancelled', 'no_show')
                  )
                  AND NOT EXISTS (
                    SELECT 1
                    FROM customer_completed_visits v
                    WHERE v.customer_id = ld.customer_id
                      AND v.visit_dt > ld.last_dt
                      AND v.visit_dt <= (ld.last_dt + svc.days)
                  )
            ),
            last_product AS (
                SELECT DISTINCT ON (a.client_id, l.product_id)
                    a.client_id AS customer_id,
                    l.product_id,
                    a.effective_appointment_date AS last_dt,
                    a.service_id AS anchor_service_id
                FROM ${logT} l
                INNER JOIN appt_events a ON a.id = l.appointment_id
                WHERE LOWER(TRIM(COALESCE(a.status::text, ''))) = 'completed'
                  AND a.client_id IS NOT NULL
                  AND a.effective_appointment_date IS NOT NULL
                ORDER BY a.client_id, l.product_id, a.effective_appointment_date DESC, a.appointment_time DESC
            ),
            prd AS (
                SELECT p.id AS product_id, trim(p.name) AS product_name, p.follow_up_reminder_days::int AS days
                FROM ${prodT} p
                WHERE p.follow_up_reminder_days IS NOT NULL
                  AND p.follow_up_reminder_days > 0
                  AND (p.is_active IS NULL OR p.is_active = true)
                  AND p.firm_nr IN (${firmInSql})
            ),
            prd_rows AS (
                SELECT
                    (lp.last_dt + prd.days) AS due_date,
                    lp.last_dt AS last_completed_date,
                    prd.days AS reminder_days,
                    lp.anchor_service_id::text AS service_id,
                    prd.product_name AS service_name,
                    lp.customer_id::text AS customer_id,
                    COALESCE(NULLIF(trim(c.name), ''), '') AS customer_name,
                    COALESCE(NULLIF(TRIM(c.phone::text), ''), NULLIF(TRIM(c.phone2::text), '')) AS customer_phone,
                    'product'::text AS reminder_kind,
                    lp.product_id::text AS product_id,
                    prd.product_name AS product_name
                FROM last_product lp
                INNER JOIN prd ON prd.product_id = lp.product_id
                LEFT JOIN ${cust} c ON c.id = lp.customer_id
                WHERE (lp.last_dt + prd.days) >= $1::date
                  AND (lp.last_dt + prd.days) <= $2::date
                  AND NOT EXISTS (
                    SELECT 1
                    FROM appt_events b
                    INNER JOIN ${logT} lb ON lb.appointment_id = b.id AND lb.product_id = lp.product_id
                    WHERE b.client_id = lp.customer_id
                      AND b.effective_appointment_date > lp.last_dt
                      AND b.effective_appointment_date <= (lp.last_dt + prd.days)
                      AND b.status NOT IN ('cancelled', 'no_show')
                  )
                  AND NOT EXISTS (
                    SELECT 1
                    FROM customer_completed_visits v
                    WHERE v.customer_id = lp.customer_id
                      AND v.visit_dt > lp.last_dt
                      AND v.visit_dt <= (lp.last_dt + prd.days)
                  )
            )
            SELECT * FROM (
                SELECT * FROM svc_rows
                UNION ALL
                SELECT * FROM prd_rows
            ) u
            ORDER BY u.due_date, u.reminder_kind, u.service_name, u.customer_name
        `;
        const result = await postgres.query(query, params);
        const base = (result.rows as Record<string, unknown>[]).map(r => {
            const kindRaw = String(r.reminder_kind ?? 'service').toLowerCase();
            const reminder_kind = kindRaw === 'product' ? 'product' : 'service';
            const product_id = r.product_id != null && String(r.product_id).length > 0 ? String(r.product_id) : undefined;
            const product_name =
                reminder_kind === 'product'
                    ? String(r.product_name ?? r.service_name ?? '').trim() || undefined
                    : undefined;
            const due = pgCellToYmd(r.due_date);
            return {
                due_date: due,
                natural_due_date: due,
                last_completed_date: pgCellToYmd(r.last_completed_date),
                reminder_days: Math.max(1, Math.round(Number(r.reminder_days) || 1)),
                service_id: String(r.service_id ?? ''),
                service_name: String(r.service_name ?? ''),
                customer_id: String(r.customer_id ?? ''),
                customer_name: String(r.customer_name ?? ''),
                customer_phone: String(r.customer_phone ?? '').trim() || undefined,
                reminder_kind,
                product_id,
                product_name,
                follow_up_status: 'due' as const,
            };
        }) as BeautyFollowUpReminder[];
        const actions = await this.listFollowUpReminderActionsInRange(startDate, endDate);
        return mergeFollowUpRemindersWithActions(base, actions, startDate, endDate);
        } catch (e: unknown) {
            console.warn('[beautyService] getFollowUpRemindersInRange skipped:', e instanceof Error ? e.message : String(e));
            return [];
        }
    },

    async createAppointment(appointment: Partial<BeautyAppointment>): Promise<string> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const id = uuidv4();
        const fn = erpFirmNrForRow();
        const pn = erpPeriodNrForRow();
        const rawStatus = appointment.status;
        const statusStr =
            typeof rawStatus === 'string' ? rawStatus : rawStatus != null ? String(rawStatus) : 'scheduled';
        const rawType = appointment.type;
        const typeStr =
            typeof rawType === 'string' ? rawType : rawType != null ? String(rawType) : 'regular';
        const dur = Math.max(1, Math.round(Number(appointment.duration ?? 30)) || 30);
        const totalPrice = Number(appointment.total_price ?? 0);
        const comm = Number(appointment.commission_amount ?? 0);
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_appointments`,
                {
                    id,
                    client_id: pgUuidOrNull(appointment.customer_id ?? appointment.client_id),
                    service_id: pgUuidOrNull(appointment.service_id),
                    specialist_id: pgUuidOrNull(appointment.staff_id ?? appointment.specialist_id),
                    device_id: pgUuidOrNull(appointment.device_id),
                    body_region_id: pgUuidOrNull(appointment.body_region_id),
                    appointment_date: pgDateOrNull(appointment.date ?? appointment.appointment_date),
                    appointment_time: normalizeAppointmentTimeForPg(appointment.time ?? appointment.appointment_time),
                    duration: dur,
                    status: statusStr,
                    type: typeStr,
                    notes: appointment.notes ?? null,
                    total_price: totalPrice,
                    commission_amount: comm,
                    is_package_session: appointment.is_package_session ?? false,
                    package_purchase_id: pgUuidOrNull(appointment.package_purchase_id),
                    branch_id: pgUuidOrNull(appointment.branch_id),
                    room_id: pgUuidOrNull(appointment.room_id),
                    tele_meeting_url: appointment.tele_meeting_url ?? null,
                    booking_channel: appointment.booking_channel ?? 'staff',
                    corporate_account_id: pgUuidOrNull(appointment.corporate_account_id),
                    session_series_id: pgUuidOrNull(appointment.session_series_id),
                    treatment_degree:
                        appointment.treatment_degree != null && String(appointment.treatment_degree).trim() !== ''
                            ? String(appointment.treatment_degree).trim()
                            : null,
                    treatment_shots:
                        appointment.treatment_shots != null && String(appointment.treatment_shots).trim() !== ''
                            ? String(appointment.treatment_shots).trim()
                            : null,
                    clinical_data: clinicalDataForPgInput(appointment),
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            const hasDatePatch = data.date !== undefined || data.appointment_date !== undefined;
            const hasTimePatch = data.time !== undefined || data.appointment_time !== undefined;
            const statusStr =
                data.status === undefined
                    ? undefined
                    : (typeof data.status === 'string'
                        ? data.status
                        : data.status != null
                            ? String(data.status)
                            : 'scheduled');
            const degRaw = data.treatment_degree;
            const shotsRaw = data.treatment_shots;
            const treatmentDegree =
                degRaw === undefined
                    ? undefined
                    : (degRaw === null || String(degRaw).trim() === '' ? null : String(degRaw).trim());
            const treatmentShots =
                shotsRaw === undefined
                    ? undefined
                    : (shotsRaw === null || String(shotsRaw).trim() === '' ? null : String(shotsRaw).trim());
            const hasClinicalDataPatch = data.clinical_data !== undefined;
            const patchBody = stripUndefinedFields({
                client_id:
                    data.customer_id !== undefined || data.client_id !== undefined
                        ? pgUuidOrNull(data.customer_id ?? data.client_id)
                        : undefined,
                service_id: data.service_id !== undefined ? pgUuidOrNull(data.service_id) : undefined,
                specialist_id:
                    data.staff_id !== undefined || data.specialist_id !== undefined
                        ? pgUuidOrNull(data.staff_id ?? data.specialist_id)
                        : undefined,
                device_id: data.device_id !== undefined ? pgUuidOrNull(data.device_id) : undefined,
                body_region_id: data.body_region_id !== undefined ? pgUuidOrNull(data.body_region_id) : undefined,
                appointment_date: hasDatePatch ? pgDateOrNull(data.date ?? data.appointment_date) : undefined,
                appointment_time: hasTimePatch ? normalizeAppointmentTimeForPg(data.time ?? data.appointment_time) : undefined,
                duration: data.duration !== undefined ? Math.max(1, Math.round(Number(data.duration ?? 30)) || 30) : undefined,
                status: statusStr,
                notes: data.notes !== undefined ? data.notes ?? null : undefined,
                total_price: data.total_price !== undefined ? Number(data.total_price ?? 0) : undefined,
                branch_id: data.branch_id !== undefined ? pgUuidOrNull(data.branch_id) : undefined,
                room_id: data.room_id !== undefined ? pgUuidOrNull(data.room_id) : undefined,
                tele_meeting_url: data.tele_meeting_url !== undefined ? data.tele_meeting_url ?? null : undefined,
                booking_channel: data.booking_channel !== undefined ? data.booking_channel ?? null : undefined,
                corporate_account_id:
                    data.corporate_account_id !== undefined ? pgUuidOrNull(data.corporate_account_id) : undefined,
                confirmation_call_at:
                    data.confirmation_call_at !== undefined ? pgTimestamptzOrNull(data.confirmation_call_at) : undefined,
                pre_visit_activity_at:
                    data.pre_visit_activity_at !== undefined ? pgTimestamptzOrNull(data.pre_visit_activity_at) : undefined,
                treatment_degree: treatmentDegree,
                treatment_shots: treatmentShots,
                clinical_data: hasClinicalDataPatch ? clinicalDataForPgInput(data) : undefined,
                updated_at: new Date().toISOString(),
            });
            await postgrest.patch(
                `/rex_${fn}_${pn}_beauty_appointments?id=eq.${encodeURIComponent(id)}`,
                patchBody,
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            if (statusStr === 'cancelled') {
                await beautyService.voidPaidBeautySalesLinkedToAppointment(id);
            }
            return;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            const rows = await postgrest.get<{ id: string }[]>(
                `/rex_${fn}_${pn}_beauty_sales`,
                {
                    select: 'id',
                    payment_status: 'eq.paid',
                    notes: `like.*rex_appt:${aid}*`,
                    limit: 500,
                },
                { schema: 'beauty' }
            );
            for (const row of rows) {
                if (!row?.id) continue;
                await postgrest.patch(
                    `/rex_${fn}_${pn}_beauty_sales?id=eq.${encodeURIComponent(String(row.id))}`,
                    { payment_status: 'cancelled' },
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return;
        }
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

    /** Randevuya bağlı satış kalemlerinde personeli ve prim tutarını günceller (audit log yazar). */
    async reassignSaleItemsStaffForAppointment(opts: {
        appointmentId: string;
        itemId?: string;
        previousStaffId?: string | null;
        nextStaffId?: string | null;
        nextCommissionRate?: number;
        userId?: string | null;
    }): Promise<number> {
        const aid = String(opts.appointmentId ?? '').trim();
        if (!aid) return 0;
        const st = postgres.getMovementTableName('beauty_sales', 'beauty');
        const it = postgres.getMovementTableName('beauty_sale_items', 'beauty');
        const needle = `%rex_appt:${aid}%`;
        const nextRate = Math.max(0, Number(opts.nextCommissionRate ?? 0) || 0);
        const itemId = String(opts.itemId ?? '').trim();
        const prevStaffId = String(opts.previousStaffId ?? '').trim();

        const whereParts: string[] = [
            `si.sale_id = s.id`,
            `COALESCE(s.notes, '') LIKE $3`,
        ];
        const params: any[] = [
            pgUuidOrNull(opts.nextStaffId),
            nextRate,
            needle,
        ];

        if (itemId) {
            whereParts.push(`si.item_id = $4`);
            params.push(pgUuidOrNull(itemId));
        }
        if (prevStaffId) {
            whereParts.push(`si.staff_id = $${params.length + 1}`);
            params.push(pgUuidOrNull(prevStaffId));
        }

        const sql = `
            UPDATE ${it} si
               SET staff_id = $1,
                   commission_amount = CASE
                       WHEN $2 > 0 THEN ROUND((COALESCE(si.total, 0) * $2 / 100)::numeric, 2)::float
                       ELSE 0
                   END
              FROM ${st} s
             WHERE ${whereParts.join(' AND ')}
        `;
        const res = await postgres.query(sql, params);
        const affected = Number((res as any)?.rowCount ?? 0) || 0;

        await beautyService.appendAuditLog(
            'beauty_sale_items',
            'staff_reassign_from_appointment',
            aid,
            opts.userId ?? null,
            {
                appointment_id: aid,
                item_id: itemId || null,
                previous_staff_id: prevStaffId || null,
                next_staff_id: opts.nextStaffId ?? null,
                next_commission_rate: nextRate,
                rows_affected: affected,
            },
        );
        return affected;
    },

    /** Yalnızca video / tele alanları — diğer sütunlara dokunmaz */
    async patchAppointmentTele(id: string, teleMeetingUrl: string | null, apptType = 'tele'): Promise<void> {
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.patch(
                `/rex_${fn}_${pn}_beauty_appointments?id=eq.${encodeURIComponent(id)}`,
                {
                    tele_meeting_url: teleMeetingUrl,
                    type: apptType,
                    updated_at: new Date().toISOString(),
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        await postgres.query(
            `UPDATE ${table} SET tele_meeting_url = $2, type = $3, updated_at = NOW() WHERE id = $1`,
            [id, teleMeetingUrl, apptType]
        );
    },

    async updateAppointmentStatus(id: string, status: string): Promise<void> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.patch(
                `/rex_${fn}_${pn}_beauty_appointments?id=eq.${encodeURIComponent(id)}`,
                { status, updated_at: new Date().toISOString() },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
        } else {
        await postgres.query(
            `UPDATE ${table} SET status=$1, updated_at=NOW() WHERE id=$2`,
            [status, id]
        );
        }
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
        const prodTbl = postgres.getCardTableName('products');
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
                COALESCE(
                    s.name,
                    rs.name,
                    pr.name
                ) AS service_name,
                COALESCE(sp.name, u.full_name, u.username) AS specialist_name,
                c.name AS customer_name,
                COALESCE(NULLIF(TRIM(c.phone::text), ''), NULLIF(TRIM(c.phone2::text), '')) AS customer_phone
            FROM ${table} a
            LEFT JOIN ${postgres.getCardTableName('beauty_services', 'beauty')} s ON a.service_id = s.id
            LEFT JOIN ${postgres.getCardTableName('services')} rs ON a.service_id = rs.id AND rs.firm_nr = $2
            LEFT JOIN ${prodTbl} pr ON pr.id = a.service_id AND pr.firm_nr = $2
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            LEFT JOIN users u ON a.specialist_id = u.id AND lpad(trim(u.firm_nr::text), 3, '0') = $2
            LEFT JOIN ${postgres.getCardTableName('customers')} c ON a.client_id = c.id
            WHERE a.id = $1
        `, [id, erpFirmNrForRow()]);
        const row = rows[0] as (Record<string, unknown> & { clinical_data?: unknown }) | undefined;
        if (!row) return null;
        return normalizeAppointmentRow(row);
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
        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = erpFirmNrForRow();
                const rows = await postgrest.get<BeautyDevice[]>(
                    `/rex_${fn}_beauty_devices`,
                    {
                        select: '*',
                        is_active: 'eq.true',
                        order: 'name.asc',
                        limit: 2000,
                    },
                    { schema: 'beauty' }
                );
                return Array.isArray(rows) ? rows : [];
            } catch (e) {
                console.warn('[beautyService] getDevices PostgREST:', e);
            }
        }
        const t = postgres.getCardTableName('beauty_devices', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} WHERE is_active = true ORDER BY name`
        );
        return rows;
    },

    async createDevice(data: Partial<BeautyDevice>): Promise<string> {
        const t = postgres.getCardTableName('beauty_devices', 'beauty');
        const fn = erpFirmNrForRow();
        const id = uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            await postgrest.post(
                `/rex_${fn}_beauty_devices`,
                {
                    id,
                    name: data.name,
                    device_type: data.device_type ?? 'laser',
                    serial_number: data.serial_number ?? null,
                    manufacturer: data.manufacturer ?? null,
                    model: data.model ?? null,
                    total_shots: data.total_shots ?? 0,
                    max_shots: data.max_shots ?? 500000,
                    maintenance_due: data.maintenance_due ?? null,
                    last_maintenance: data.last_maintenance ?? null,
                    purchase_date: data.purchase_date ?? null,
                    warranty_expiry: data.warranty_expiry ?? null,
                    status: data.status ?? 'active',
                    notes: data.notes ?? null,
                    is_active: true,
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.patch(
                `/rex_${fn}_beauty_devices?id=eq.${encodeURIComponent(id)}`,
                {
                    name: data.name,
                    device_type: data.device_type ?? 'laser',
                    serial_number: data.serial_number ?? null,
                    manufacturer: data.manufacturer ?? null,
                    model: data.model ?? null,
                    max_shots: data.max_shots ?? 500000,
                    maintenance_due: data.maintenance_due ?? null,
                    last_maintenance: data.last_maintenance ?? null,
                    warranty_expiry: data.warranty_expiry ?? null,
                    status: data.status ?? 'active',
                    notes: data.notes ?? null,
                    updated_at: new Date().toISOString(),
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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
        const isExcessive = usage.expected_shots
            ? usage.shots_used > usage.expected_shots * 1.2
            : false;
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_device_usage`,
                [
                    {
                        device_id: usage.device_id,
                        appointment_id: usage.appointment_id,
                        customer_id: pgUuidOrNull(usage.customer_id),
                        specialist_id: pgUuidOrNull(usage.specialist_id),
                        body_region_id: pgUuidOrNull(usage.body_region_id),
                        shots_used: usage.shots_used,
                        expected_shots: usage.expected_shots ?? 0,
                        is_excessive: isExcessive,
                        usage_date: new Date().toISOString().slice(0, 10),
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            const deviceRows = await postgrest.get<{ id: string; total_shots?: number }[]>(
                `/rex_${fn}_beauty_devices`,
                { select: 'id,total_shots', id: `eq.${usage.device_id}`, limit: 1 },
                { schema: 'beauty' }
            );
            const device = deviceRows[0];
            if (device?.id) {
                await postgrest.patch(
                    `/rex_${fn}_beauty_devices?id=eq.${encodeURIComponent(device.id)}`,
                    {
                        total_shots: Math.max(0, Number(device.total_shots ?? 0) + Number(usage.shots_used ?? 0)),
                        updated_at: new Date().toISOString(),
                    },
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            if (isExcessive) {
                await postgrest.post(
                    `/rex_${fn}_${pn}_beauty_device_alerts`,
                    [
                        {
                            device_id: usage.device_id,
                            alert_type: 'excessive_shots',
                            message: `Bölge için beklenen atım sayısı aşıldı: ${usage.shots_used} atım kullanıldı`,
                            severity: 'warning',
                        },
                    ],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return;
        }
        const usageTable = postgres.getMovementTableName('beauty_device_usage', 'beauty');

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
        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const rows = await postgrest.get<BeautyBodyRegion[]>(
                    '/body_regions',
                    { select: '*', order: 'sort_order.asc', limit: 500 },
                    { schema: 'beauty' }
                );
                return Array.isArray(rows) ? rows : [];
            } catch (e) {
                console.warn('[beautyService] getBodyRegions PostgREST:', e);
            }
        }
        const { rows } = await postgres.query(
            'SELECT * FROM beauty.body_regions ORDER BY sort_order'
        );
        return rows;
    },

    // =========================================================================
    // PACKAGES  (firm card table: rex_{firm}_beauty_packages)
    // =========================================================================
    async getPackages(): Promise<BeautyPackage[]> {
        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = erpFirmNrForRow();
                const rows = await postgrest.get<BeautyPackage[]>(
                    `/rex_${fn}_beauty_packages`,
                    { select: '*', order: 'name.asc', limit: 2000 },
                    { schema: 'beauty' }
                );
                const list = Array.isArray(rows) ? rows : [];
                return list.filter((p) => p.is_active !== false);
            } catch (e) {
                console.warn('[beautyService] getPackages PostgREST:', e);
            }
        }
        const { rows } = await postgres.query(
            'SELECT * FROM beauty_packages WHERE is_active = true ORDER BY name'
        );
        return rows;
    },

    async createPackage(data: Partial<BeautyPackage>): Promise<string> {
        const fn = erpFirmNrForRow();
        const id = uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            await postgrest.post(
                `/rex_${fn}_beauty_packages`,
                {
                    id,
                    name: data.name,
                    description: data.description ?? null,
                    service_id: data.service_id ?? null,
                    total_sessions: data.total_sessions ?? 1,
                    price: data.price ?? 0,
                    cost_price: data.cost_price ?? 0,
                    discount_pct: data.discount_pct ?? 0,
                    validity_days: data.validity_days ?? 365,
                    color: data.color ?? '#6366f1',
                    is_active: true,
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.patch(
                `/rex_${fn}_beauty_packages?id=eq.${encodeURIComponent(id)}`,
                {
                    name: data.name,
                    description: data.description ?? null,
                    service_id: data.service_id ?? null,
                    total_sessions: data.total_sessions ?? 1,
                    price: data.price ?? 0,
                    discount_pct: data.discount_pct ?? 0,
                    validity_days: data.validity_days ?? 365,
                    color: data.color ?? '#6366f1',
                    updated_at: new Date().toISOString(),
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.patch(
                `/rex_${fn}_beauty_packages?id=eq.${encodeURIComponent(id)}`,
                { is_active: false, updated_at: new Date().toISOString() },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
        await postgres.query(
            'UPDATE beauty_packages SET is_active=false, updated_at=NOW() WHERE id=$1', [id]
        );
    },

    async purchasePackage(purchase: Partial<BeautyPackagePurchase>): Promise<string> {
        const id = uuidv4();
        const expiry = purchase.expiry_date ??
            new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_package_purchases`,
                [
                    {
                        id,
                        customer_id: pgUuidOrNull(purchase.customer_id),
                        package_id: pgUuidOrNull(purchase.package_id),
                        total_sessions: purchase.total_sessions ?? 1,
                        used_sessions: 0,
                        remaining_sessions: purchase.total_sessions ?? 1,
                        sale_price: purchase.sale_price ?? 0,
                        purchase_date: new Date().toISOString().slice(0, 10),
                        expiry_date: expiry,
                        status: 'active',
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
        const saleTable = postgres.getMovementTableName('beauty_package_purchases', 'beauty');
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
        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = erpFirmNrForRow();
                const rows = await postgrest.get<BeautyLead[]>(
                    `/rex_${fn}_beauty_leads`,
                    { select: '*', order: 'created_at.desc', limit: 3000 },
                    { schema: 'beauty' }
                );
                return Array.isArray(rows) ? rows : [];
            } catch (e) {
                console.warn('[beautyService] getLeads PostgREST:', e);
            }
        }
        const lt = postgres.getCardTableName('beauty_leads', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${lt} ORDER BY created_at DESC`
        );
        return rows;
    },

    async createLead(data: Partial<BeautyLead>): Promise<string> {
        const lt = postgres.getCardTableName('beauty_leads', 'beauty');
        const fn = erpFirmNrForRow();
        const id = uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            await postgrest.post(
                `/rex_${fn}_beauty_leads`,
                {
                    id,
                    name: data.name,
                    phone: data.phone ?? null,
                    email: data.email ?? null,
                    source: data.source ?? 'other',
                    status: data.status ?? 'new',
                    notes: data.notes ?? null,
                    assigned_to: data.assigned_to ?? null,
                    first_contact_date: new Date().toISOString().slice(0, 10),
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.patch(
                `/rex_${fn}_beauty_leads?id=eq.${encodeURIComponent(id)}`,
                {
                    name: data.name,
                    phone: data.phone ?? null,
                    email: data.email ?? null,
                    source: data.source ?? 'other',
                    status: data.status ?? 'new',
                    notes: data.notes ?? null,
                    last_contact_date: new Date().toISOString().slice(0, 10),
                    lost_reason: data.lost_reason ?? null,
                    updated_at: new Date().toISOString(),
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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
        let lead: BeautyLead | null = null;
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const rows = await postgrest.get<BeautyLead[]>(
                `/rex_${fn}_beauty_leads`,
                { select: '*', id: `eq.${leadId}`, limit: 1 },
                { schema: 'beauty' }
            );
            lead = rows[0] ?? null;
        } else {
            const leadRes = await postgres.query(`SELECT * FROM ${lt} WHERE id=$1`, [leadId]);
            lead = (leadRes.rows[0] as BeautyLead | undefined) ?? null;
        }
        if (!lead) throw new Error('Lead bulunamadı');

        const customerId = await beautyService.createCustomer({
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            notes: lead.notes,
        });

        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.patch(
                `/rex_${fn}_beauty_leads?id=eq.${encodeURIComponent(leadId)}`,
                {
                    status: 'converted',
                    converted_customer_id: customerId,
                    updated_at: new Date().toISOString(),
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
        } else {
            await postgres.query(
                `UPDATE ${lt} SET status='converted', converted_customer_id=$1, updated_at=NOW() WHERE id=$2`,
                [customerId, leadId]
            );
        }
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
        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = erpFirmNrForRow();
                const rows = await postgrest.get<BeautySatisfactionSurvey[]>(
                    `/rex_${fn}_beauty_satisfaction_surveys`,
                    { select: '*', order: 'sort_order.asc,created_at.asc', limit: 500 },
                    { schema: 'beauty' },
                );
                if (Array.isArray(rows)) return rows;
            } catch (e) {
                console.warn('[beautyService] getSatisfactionSurveys PostgREST:', e);
            }
        }
        const t = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} ORDER BY sort_order ASC, created_at ASC`
        );
        return rows;
    },

    async getSatisfactionQuestions(surveyId: string): Promise<BeautySatisfactionQuestion[]> {
        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = erpFirmNrForRow();
                const rows = await postgrest.get<
                    (BeautySatisfactionQuestion & { labels_json?: unknown })[]
                >(
                    `/rex_${fn}_beauty_satisfaction_questions`,
                    {
                        select: '*',
                        survey_id: `eq.${surveyId}`,
                        order: 'sort_order.asc,created_at.asc',
                        limit: 500,
                    },
                    { schema: 'beauty' },
                );
                return (Array.isArray(rows) ? rows : []).map(
                    (r: BeautySatisfactionQuestion & { labels_json: unknown }) => ({
                        ...r,
                        labels_json: beautyService.parseSatisfactionLabels(r.labels_json),
                    }),
                );
            } catch (e) {
                console.warn('[beautyService] getSatisfactionQuestions PostgREST:', e);
            }
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.patch(
                `/rex_${fn}_beauty_satisfaction_surveys?id=neq.${encodeURIComponent(exceptId)}&is_active=eq.true`,
                { is_active: false, updated_at: new Date().toISOString() },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
        const t = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
        await postgres.query(
            `UPDATE ${t} SET is_active = false, updated_at = NOW() WHERE id <> $1 AND is_active = true`,
            [exceptId]
        );
    },

    async createSatisfactionSurvey(data: Partial<BeautySatisfactionSurvey>): Promise<string> {
        const id = uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.post(
                `/rex_${fn}_beauty_satisfaction_surveys`,
                [
                    {
                        id,
                        name: data.name ?? 'Anket',
                        is_active: data.is_active ?? false,
                        sort_order: data.sort_order ?? 0,
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
        } else {
            const t = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
            await postgres.query(
                `INSERT INTO ${t} (id, name, is_active, sort_order) VALUES ($1,$2,$3,$4)`,
                [id, data.name ?? 'Anket', data.is_active ?? false, data.sort_order ?? 0]
            );
        }
        if (data.is_active) await beautyService.deactivateOtherSatisfactionSurveys(id);
        return id;
    },

    async updateSatisfactionSurvey(id: string, data: Partial<BeautySatisfactionSurvey>): Promise<void> {
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const rows = await postgrest.get<BeautySatisfactionSurvey[]>(
                `/rex_${fn}_beauty_satisfaction_surveys`,
                { select: '*', id: `eq.${id}`, limit: 1 },
                { schema: 'beauty' }
            );
            const row = rows[0];
            if (!row) return;
            const merged = {
                name: data.name !== undefined ? data.name : row.name,
                is_active: data.is_active !== undefined ? data.is_active : row.is_active,
                sort_order: data.sort_order !== undefined ? data.sort_order : row.sort_order,
            };
            await postgrest.patch(
                `/rex_${fn}_beauty_satisfaction_surveys?id=eq.${encodeURIComponent(id)}`,
                { ...merged, updated_at: new Date().toISOString() },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            if (merged.is_active) await beautyService.deactivateOtherSatisfactionSurveys(id);
            return;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.delete(
                `/rex_${fn}_beauty_satisfaction_surveys?id=eq.${encodeURIComponent(id)}`,
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
        const t = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
        await postgres.query(`DELETE FROM ${t} WHERE id = $1`, [id]);
    },

    async createSatisfactionQuestion(data: Partial<BeautySatisfactionQuestion>): Promise<string> {
        if (!data.survey_id) throw new Error('createSatisfactionQuestion: survey_id gerekli');
        const id = uuidv4();
        const labels = data.labels_json ?? {};
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.post(
                `/rex_${fn}_beauty_satisfaction_questions`,
                [
                    {
                        id,
                        survey_id: data.survey_id!,
                        sort_order: data.sort_order ?? 0,
                        question_type: data.question_type ?? 'rating',
                        scale_max: data.scale_max ?? 5,
                        is_required: data.is_required ?? true,
                        labels_json: labels,
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
        } else {
            const t = postgres.getCardTableName('beauty_satisfaction_questions', 'beauty');
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
        }
        return id;
    },

    async updateSatisfactionQuestion(id: string, data: Partial<BeautySatisfactionQuestion>): Promise<void> {
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const rows = await postgrest.get<(BeautySatisfactionQuestion & { labels_json?: unknown })[]>(
                `/rex_${fn}_beauty_satisfaction_questions`,
                { select: '*', id: `eq.${id}`, limit: 1 },
                { schema: 'beauty' }
            );
            const row = rows[0];
            if (!row) return;
            const curLabels = beautyService.parseSatisfactionLabels(row.labels_json);
            const mergedLabels = data.labels_json !== undefined ? data.labels_json : curLabels;
            await postgrest.patch(
                `/rex_${fn}_beauty_satisfaction_questions?id=eq.${encodeURIComponent(id)}`,
                {
                    sort_order: data.sort_order !== undefined ? data.sort_order : row.sort_order,
                    question_type: data.question_type !== undefined ? data.question_type : row.question_type,
                    scale_max: data.scale_max !== undefined ? data.scale_max : row.scale_max,
                    is_required: data.is_required !== undefined ? data.is_required : row.is_required,
                    labels_json: mergedLabels,
                    updated_at: new Date().toISOString(),
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.delete(
                `/rex_${fn}_beauty_satisfaction_questions?id=eq.${encodeURIComponent(id)}`,
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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
        const id = uuidv4();
        const rawAnswers =
            feedback.survey_answers && feedback.survey_answers.length
                ? feedback.survey_answers
                : null;
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_customer_feedback`,
                [
                    {
                        id,
                        appointment_id: pgUuidOrNull(feedback.appointment_id),
                        customer_id: pgUuidOrNull(feedback.customer_id),
                        service_rating: feedback.service_rating ?? 5,
                        staff_rating: feedback.staff_rating ?? 5,
                        cleanliness_rating: feedback.cleanliness_rating ?? 5,
                        overall_rating: feedback.overall_rating ?? 5,
                        comment: feedback.comment ?? null,
                        would_recommend: feedback.would_recommend ?? true,
                        survey_id: pgUuidOrNull(feedback.survey_id),
                        survey_answers: rawAnswers,
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
        const table = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
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

    async getFeedbackAppointmentIds(appointmentIds: string[]): Promise<Set<string>> {
        const validIds = filterUuidIds((appointmentIds ?? []).map(id => String(id))).slice(0, 500);
        if (!validIds.length) return new Set<string>();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            const path = `/rex_${fn}_${pn}_beauty_customer_feedback`;
            const out = new Set<string>();
            for (let i = 0; i < validIds.length; i += BEAUTY_PGREST_CHUNK) {
                const chunk = validIds.slice(i, i + BEAUTY_PGREST_CHUNK);
                const inList = chunk.join(',');
                try {
                    const rows = await postgrest.get<{ appointment_id: string | null }[]>(
                        path,
                        {
                            select: 'appointment_id',
                            appointment_id: `in.(${inList})`,
                            limit: chunk.length,
                        },
                        { schema: 'beauty' },
                    );
                    if (Array.isArray(rows)) {
                        for (const r of rows) {
                            const aid = String(r.appointment_id ?? '').trim();
                            if (aid) out.add(aid);
                        }
                    }
                } catch {
                    /* tek parça başarısız — diğer parçalar */
                }
            }
            return out;
        }
        const table = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const inList = validIds.map((_, i) => `$${i + 1}`).join(', ');
        const { rows } = await postgres.query<{ appointment_id: string }>(
            `SELECT DISTINCT appointment_id::text AS appointment_id
             FROM ${table}
             WHERE appointment_id IN (${inList})`,
            validIds,
        );
        return new Set(
            rows
                .map(r => String(r.appointment_id ?? '').trim())
                .filter(Boolean),
        );
    },

    async upsertFeedbackForAppointment(
        feedback: Partial<BeautyCustomerFeedback> & { appointment_id: string; customer_id: string }
    ): Promise<void> {
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            const existingRows = await postgrest.get<BeautyCustomerFeedback[]>(
                `/rex_${fn}_${pn}_beauty_customer_feedback`,
                {
                    select: '*',
                    appointment_id: `eq.${feedback.appointment_id}`,
                    order: 'created_at.desc',
                    limit: 1,
                },
                { schema: 'beauty' }
            );
            const existing = existingRows[0];
            const mergedAnswers =
                feedback.survey_answers !== undefined
                    ? feedback.survey_answers && feedback.survey_answers.length
                        ? feedback.survey_answers
                        : null
                    : existing?.survey_answers ?? null;
            if (existing?.id) {
                await postgrest.patch(
                    `/rex_${fn}_${pn}_beauty_customer_feedback?id=eq.${encodeURIComponent(existing.id)}`,
                    {
                        service_rating: feedback.service_rating ?? existing.service_rating ?? 5,
                        staff_rating: feedback.staff_rating ?? existing.staff_rating ?? 5,
                        cleanliness_rating: feedback.cleanliness_rating ?? existing.cleanliness_rating ?? 5,
                        overall_rating: feedback.overall_rating ?? existing.overall_rating ?? 5,
                        comment: feedback.comment ?? existing.comment ?? null,
                        would_recommend: feedback.would_recommend ?? existing.would_recommend ?? true,
                        survey_id: pgUuidOrNull(feedback.survey_id ?? existing.survey_id ?? null),
                        survey_answers: mergedAnswers,
                    },
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await beautyService.addFeedback({ ...feedback, survey_answers: mergedAnswers ?? feedback.survey_answers });
            }
            return;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            for (const lead of leads) {
                if (!lead?.id) continue;
                const prev = (lead.notes != null ? String(lead.notes) : '').trim();
                const next = prev ? `${prev}\n\n${block}` : block;
                await postgrest.patch(
                    `/rex_${fn}_beauty_leads?id=eq.${encodeURIComponent(String(lead.id))}`,
                    {
                        notes: next,
                        last_contact_date: new Date().toISOString().slice(0, 10),
                        updated_at: new Date().toISOString(),
                    },
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return;
        }
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
        return beautyService.enrichSalesWithLinkedAppointments(out);
    },

    async enrichSalesWithLinkedAppointments(sales: BeautySale[]): Promise<BeautySale[]> {
        if (!sales.length) return sales;
        const aptIds = [
            ...new Set(
                sales
                    .map((s) => beautyService.parseRexAppointmentIdFromNotes(s.notes))
                    .filter((id): id is string => Boolean(id)),
            ),
        ];
        if (!aptIds.length) return sales;

        type AptLinkRow = {
            id: string;
            specialist_id: string | null;
            treatment_shots: string | null;
            treatment_degree: string | null;
        };
        const aptMap = new Map<string, AptLinkRow>();
        const spNames = new Map<string, string>();

        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = erpFirmNrForRow();
                const pn = periodPaddedForBeauty();
                const aptPath = `/rex_${fn}_${pn}_beauty_appointments`;
                const spPath = `/rex_${fn}_beauty_specialists`;
                const aptRows: AptLinkRow[] = [];
                for (let i = 0; i < aptIds.length; i += BEAUTY_PGREST_CHUNK) {
                    const chunk = aptIds.slice(i, i + BEAUTY_PGREST_CHUNK);
                    const inList = chunk.join(',');
                    try {
                        const part = await postgrest.get<AptLinkRow[]>(
                            aptPath,
                            {
                                select: 'id,specialist_id,treatment_shots,treatment_degree',
                                id: `in.(${inList})`,
                                limit: chunk.length,
                            },
                            { schema: 'beauty' },
                        );
                        if (Array.isArray(part)) aptRows.push(...part);
                    } catch {
                        /* */
                    }
                }
                for (const r of aptRows) aptMap.set(String(r.id), r);
                const spIds = [...new Set(aptRows.map((r) => String(r.specialist_id ?? '').trim()).filter(Boolean))];
                for (let i = 0; i < spIds.length; i += BEAUTY_PGREST_CHUNK) {
                    const chunk = spIds.slice(i, i + BEAUTY_PGREST_CHUNK);
                    const inList = chunk.join(',');
                    try {
                        const part = await postgrest.get<{ id: string; name: string }[]>(
                            spPath,
                            { select: 'id,name', id: `in.(${inList})`, limit: chunk.length },
                            { schema: 'beauty' },
                        );
                        for (const r of Array.isArray(part) ? part : []) {
                            spNames.set(String(r.id), String(r.name ?? '').trim() || '—');
                        }
                    } catch {
                        /* */
                    }
                }
            } catch (e) {
                console.warn('[beautyService] enrichSalesWithLinkedAppointments PostgREST:', e);
            }
        } else {
        const aptTable = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const spTable = postgres.getCardTableName('beauty_specialists', 'beauty');
        const inList = aptIds.map((_, i) => `$${i + 1}`).join(', ');
        const { rows: aptRows } = await postgres.query<AptLinkRow>(
            `SELECT a.id::text AS id, a.specialist_id::text AS specialist_id,
                    a.treatment_shots, a.treatment_degree
             FROM ${aptTable} a WHERE a.id IN (${inList})`,
            aptIds,
        );
        for (const r of aptRows) aptMap.set(String(r.id), r);
        const spIds = [...new Set(aptRows.map((r) => String(r.specialist_id ?? '').trim()).filter(Boolean))];
        if (spIds.length) {
            const spIn = spIds.map((_, i) => `$${i + 1}`).join(', ');
            const { rows: spRows } = await postgres.query<{ id: string; name: string }>(
                `SELECT id::text AS id, name FROM ${spTable} WHERE id IN (${spIn})`,
                spIds,
            );
            for (const r of spRows) spNames.set(String(r.id), String(r.name ?? '').trim() || '—');
        }
        }

        return sales.map((s) => {
            const aid = beautyService.parseRexAppointmentIdFromNotes(s.notes);
            if (!aid) return s;
            const apt = aptMap.get(aid);
            if (!apt) return { ...s, linked_appointment_id: aid };
            const spId = String(apt.specialist_id ?? '').trim();
            return {
                ...s,
                linked_appointment_id: aid,
                linked_staff_name: spId ? (spNames.get(spId) ?? '—') : undefined,
                linked_treatment_shots: apt.treatment_shots,
                linked_treatment_degree: apt.treatment_degree,
            };
        });
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
        const id = uuidv4();
        const invoiceNumber = `BEA-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_sales`,
                [
                    {
                        id,
                        invoice_number: invoiceNumber,
                        customer_id: pgUuidOrNull(sale.customer_id),
                        subtotal: sale.subtotal ?? 0,
                        discount: sale.discount ?? 0,
                        tax: sale.tax ?? 0,
                        total: sale.total ?? 0,
                        payment_method: sale.payment_method ?? 'cash',
                        payment_status: sale.payment_status ?? 'paid',
                        paid_amount: sale.paid_amount ?? sale.total ?? 0,
                        remaining_amount: sale.remaining_amount ?? 0,
                        notes: sale.notes ?? null,
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            if (items.length > 0) {
                const payload = items.map((item) => ({
                    id: uuidv4(),
                    sale_id: id,
                    item_type: item.item_type ?? 'service',
                    item_id: pgUuidOrNull(item.item_id),
                    name: item.name ?? 'Kalem',
                    quantity: item.quantity ?? 1,
                    unit_price: item.unit_price ?? 0,
                    discount: item.discount ?? 0,
                    total: item.total ?? 0,
                    staff_id: pgUuidOrNull(item.staff_id),
                    commission_amount: item.commission_amount ?? 0,
                }));
                await postgrest.post(
                    `/rex_${fn}_${pn}_beauty_sale_items`,
                    payload,
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
        } else {
            const st = postgres.getMovementTableName('beauty_sales', 'beauty');
            const it = postgres.getMovementTableName('beauty_sale_items', 'beauty');
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

            if (items.length > 0) {
                const values: unknown[] = [];
                const tuples: string[] = [];
                for (const item of items) {
                    const base = values.length;
                    values.push(
                        uuidv4(),
                        id,
                        item.item_type ?? 'service',
                        pgUuidOrNull(item.item_id),
                        item.name ?? 'Kalem',
                        item.quantity ?? 1,
                        item.unit_price ?? 0,
                        item.discount ?? 0,
                        item.total ?? 0,
                        pgUuidOrNull(item.staff_id),
                        item.commission_amount ?? 0,
                    );
                    tuples.push(
                        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`,
                    );
                }
                await postgres.query(
                    `INSERT INTO ${it}
                        (id, sale_id, item_type, item_id, name, quantity, unit_price,
                         discount, total, staff_id, commission_amount)
                     VALUES ${tuples.join(', ')}`,
                    values,
                );
            }
        }

        if (!opts?.skipErpAndLoyalty) {
            await runBeautySaleErpAndLoyalty(sale, items, { invoiceNumber, beautySaleId: id });
        }

        return id;
    },

    /** Satış notundaki `rex_appt:<uuid>` bağlantısı */
    parseRexAppointmentIdFromNotes(notes?: string | null): string | null {
        const m = String(notes ?? '').match(/rex_appt:([0-9a-f-]{36})/i);
        return m ? m[1] : null;
    },

    /** Randevuya bağlı ürün adları (beauty_sales + sale_items) */
    async getProductLabelsByAppointmentIds(appointmentIds: string[]): Promise<Map<string, string[]>> {
        const out = new Map<string, string[]>();
        const ids = [...new Set(appointmentIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
        if (!ids.length) return out;

        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = erpFirmNrForRow();
                const pn = periodPaddedForBeauty();
                const salesPath = `/rex_${fn}_${pn}_beauty_sales`;
                const itemsPath = `/rex_${fn}_${pn}_beauty_sale_items`;
                const saleRows: { id: string; notes: string | null }[] = [];
                for (const aptId of ids) {
                    try {
                        const part = await postgrest.get<{ id: string; notes: string | null }[]>(
                            salesPath,
                            {
                                select: 'id,notes',
                                notes: `like.*rex_appt:${aptId}*`,
                                limit: 20,
                            },
                            { schema: 'beauty' },
                        );
                        if (Array.isArray(part)) saleRows.push(...part);
                    } catch {
                        /* */
                    }
                }
                if (!saleRows.length) return out;
                const saleIds = [...new Set(saleRows.map((s) => String(s.id)))];
                const itemsBySale = new Map<string, string[]>();
                for (let i = 0; i < saleIds.length; i += BEAUTY_PGREST_CHUNK) {
                    const chunk = saleIds.slice(i, i + BEAUTY_PGREST_CHUNK);
                    const inList = chunk.join(',');
                    try {
                        const items = await postgrest.get<{ sale_id: string; name: string; item_type: string }[]>(
                            itemsPath,
                            {
                                select: 'sale_id,name,item_type',
                                sale_id: `in.(${inList})`,
                                item_type: 'eq.product',
                                limit: 500,
                            },
                            { schema: 'beauty' },
                        );
                        for (const row of Array.isArray(items) ? items : []) {
                            const nm = String(row.name ?? '').trim();
                            if (!nm) continue;
                            const arr = itemsBySale.get(row.sale_id) ?? [];
                            arr.push(nm);
                            itemsBySale.set(row.sale_id, arr);
                        }
                    } catch {
                        /* */
                    }
                }
                for (const sale of saleRows) {
                    const aptId = beautyService.parseRexAppointmentIdFromNotes(sale.notes);
                    if (!aptId) continue;
                    const labels = itemsBySale.get(sale.id) ?? [];
                    if (!labels.length) continue;
                    const prev = out.get(aptId) ?? [];
                    out.set(aptId, [...prev, ...labels]);
                }
            } catch (e) {
                console.warn('[beautyService] getProductLabelsByAppointmentIds PostgREST:', e);
            }
            return out;
        }

        const st = postgres.getMovementTableName('beauty_sales', 'beauty');
        const it = postgres.getMovementTableName('beauty_sale_items', 'beauty');
        const likeParts = ids.map((_, i) => `notes ILIKE $${i + 1}`);
        const likeParams = ids.map((id) => `%rex_appt:${id}%`);
        const { rows: sales } = await postgres.query<{ id: string; notes: string | null }>(
            `SELECT id, notes FROM ${st} WHERE ${likeParts.join(' OR ')}`,
            likeParams,
        );
        if (!sales.length) return out;
        const saleIds = sales.map((s) => s.id);
        const saleIn = saleIds.map((_, i) => `$${i + 1}`).join(', ');
        const { rows: items } = await postgres.query<{ sale_id: string; name: string; item_type: string }>(
            `SELECT sale_id, name, item_type FROM ${it}
             WHERE sale_id IN (${saleIn}) AND LOWER(TRIM(COALESCE(item_type::text, ''))) = 'product'`,
            saleIds,
        );
        const itemsBySale = new Map<string, string[]>();
        for (const row of items) {
            const nm = String(row.name ?? '').trim();
            if (!nm) continue;
            const arr = itemsBySale.get(row.sale_id) ?? [];
            arr.push(nm);
            itemsBySale.set(row.sale_id, arr);
        }
        for (const sale of sales) {
            const aptId = beautyService.parseRexAppointmentIdFromNotes(sale.notes);
            if (!aptId) continue;
            const labels = itemsBySale.get(sale.id) ?? [];
            if (!labels.length) continue;
            const prev = out.get(aptId) ?? [];
            out.set(aptId, [...prev, ...labels]);
        }
        return out;
    },

    /** Müşterinin son tamamlanan randevusundaki shot / derece */
    async getLastCustomerTreatments(customerIds: string[]): Promise<Map<string, BeautyCustomerLastTreatment>> {
        const out = new Map<string, BeautyCustomerLastTreatment>();
        const ids = [...new Set(customerIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
        if (!ids.length) return out;

        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = erpFirmNrForRow();
                const pn = periodPaddedForBeauty();
                const aptPath = `/rex_${fn}_${pn}_beauty_appointments`;
                type AptRow = {
                    client_id: string;
                    treatment_shots: string | null;
                    treatment_degree: string | null;
                    appointment_date: string | null;
                    status: string | null;
                    updated_at?: string | null;
                };
                const rows: AptRow[] = [];
                for (let i = 0; i < ids.length; i += BEAUTY_PGREST_CHUNK) {
                    const chunk = ids.slice(i, i + BEAUTY_PGREST_CHUNK);
                    const inList = chunk.join(',');
                    try {
                        const part = await postgrest.get<AptRow[]>(
                            aptPath,
                            {
                                select: 'client_id,treatment_shots,treatment_degree,appointment_date,status,updated_at',
                                client_id: `in.(${inList})`,
                                status: 'eq.completed',
                                order: 'appointment_date.desc,updated_at.desc',
                                limit: 2000,
                            },
                            { schema: 'beauty' },
                        );
                        if (Array.isArray(part)) rows.push(...part);
                    } catch {
                        /* */
                    }
                }
                for (const r of rows) {
                    const cid = String(r.client_id ?? '').trim();
                    if (!cid || out.has(cid)) continue;
                    const shots = String(r.treatment_shots ?? '').trim();
                    const degree = String(r.treatment_degree ?? '').trim();
                    if (!shots && !degree) continue;
                    out.set(cid, {
                        customer_id: cid,
                        treatment_shots: r.treatment_shots,
                        treatment_degree: r.treatment_degree,
                        appointment_date: String(r.appointment_date ?? '').slice(0, 10) || null,
                    });
                }
            } catch (e) {
                console.warn('[beautyService] getLastCustomerTreatments PostgREST:', e);
            }
            return out;
        }

        const aptTable = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const inList = ids.map((_, i) => `$${i + 1}`).join(', ');
        const { rows } = await postgres.query<{
            client_id: string;
            treatment_shots: string | null;
            treatment_degree: string | null;
            appointment_date: string | null;
        }>(
            `SELECT DISTINCT ON (client_id)
                client_id::text AS client_id,
                treatment_shots,
                treatment_degree,
                appointment_date::text AS appointment_date
             FROM ${aptTable}
             WHERE client_id IN (${inList})
               AND LOWER(TRIM(COALESCE(status::text, ''))) = 'completed'
               AND (NULLIF(TRIM(COALESCE(treatment_shots::text, '')), '') IS NOT NULL
                    OR NULLIF(TRIM(COALESCE(treatment_degree::text, '')), '') IS NOT NULL)
             ORDER BY client_id, appointment_date DESC NULLS LAST, updated_at DESC NULLS LAST`,
            ids,
        );
        for (const r of rows) {
            const cid = String(r.client_id ?? '').trim();
            if (!cid) continue;
            out.set(cid, {
                customer_id: cid,
                treatment_shots: r.treatment_shots,
                treatment_degree: r.treatment_degree,
                appointment_date: r.appointment_date,
            });
        }
        return out;
    },

    /** Personel bazında günlük shot / derece raporu */
    async getStaffTreatmentReport(startYmd: string, endYmd: string): Promise<BeautyStaffTreatmentReport> {
        const start = String(startYmd || '').trim();
        const end = String(endYmd || '').trim();
        const empty: BeautyStaffTreatmentReport = { start_ymd: start, end_ymd: end, rows: [] };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return empty;

        const apts = await beautyService.getAppointmentsInRange(start, end);
        const spTable = postgres.getCardTableName('beauty_specialists', 'beauty');
        const { rows: spRows } = await postgres.query<{ id: string; name: string }>(
            `SELECT id::text AS id, name FROM ${spTable}`,
        );
        const spNames = new Map(spRows.map((r) => [String(r.id), String(r.name ?? '').trim() || '—']));

        const parseShots = (raw: string | null | undefined): number => {
            const s = String(raw ?? '').trim();
            if (!s) return 0;
            const m = s.match(/(\d+)/);
            return m ? Math.max(0, parseInt(m[1], 10)) : 0;
        };

        type Acc = {
            staff_id: string;
            staff_name: string;
            day_ymd: string;
            appointment_count: number;
            shots_count: number;
            degree_count: number;
            shots_samples: string[];
            degree_samples: string[];
        };
        const map = new Map<string, Acc>();

        for (const a of apts) {
            const day = String(a.appointment_date ?? a.date ?? '').slice(0, 10);
            if (!day || day < start || day > end) continue;
            const sid = String(a.staff_id ?? a.specialist_id ?? '').trim() || '__unassigned__';
            const shotsRaw = String(a.treatment_shots ?? '').trim();
            const degreeRaw = String(a.treatment_degree ?? '').trim();
            if (!shotsRaw && !degreeRaw) continue;
            const key = `${sid}|${day}`;
            let acc = map.get(key);
            if (!acc) {
                acc = {
                    staff_id: sid,
                    staff_name: sid === '__unassigned__' ? '—' : (spNames.get(sid) ?? a.specialist_name ?? a.staff_name ?? '—'),
                    day_ymd: day,
                    appointment_count: 0,
                    shots_count: 0,
                    degree_count: 0,
                    shots_samples: [],
                    degree_samples: [],
                };
                map.set(key, acc);
            }
            acc.appointment_count += 1;
            if (shotsRaw) {
                acc.shots_count += parseShots(shotsRaw);
                if (!acc.shots_samples.includes(shotsRaw)) acc.shots_samples.push(shotsRaw);
            }
            if (degreeRaw) {
                acc.degree_count += 1;
                if (!acc.degree_samples.includes(degreeRaw)) acc.degree_samples.push(degreeRaw);
            }
        }

        const rows = [...map.values()].sort((a, b) => {
            if (a.day_ymd !== b.day_ymd) return a.day_ymd.localeCompare(b.day_ymd);
            return a.staff_name.localeCompare(b.staff_name, 'tr');
        });
        return { start_ymd: start, end_ymd: end, rows };
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
        productStaffPerformance: { specialist_id: string; name: string; commission_rate: number; transactions: number; revenue: number; commission: number }[];
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

        const [monthlyRes, prevRes, newCustRes, trendRes, svcRes, staffRes, productStaffRes] = await Promise.all([
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
                    CASE
                        WHEN COALESCE(SUM(si.total), 0) > 0
                            THEN ROUND((COALESCE(SUM(si.commission_amount), 0) / COALESCE(SUM(si.total), 0) * 100)::numeric, 2)::float
                        ELSE 0::float
                    END AS commission_rate,
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
            postgres.query(`
                SELECT
                    si.staff_id AS specialist_id,
                    COALESCE(sp.name, u.full_name, u.username) AS name,
                    CASE
                        WHEN COALESCE(SUM(si.total), 0) > 0
                            THEN ROUND((COALESCE(SUM(si.commission_amount), 0) / COALESCE(SUM(si.total), 0) * 100)::numeric, 2)::float
                        ELSE 0::float
                    END AS commission_rate,
                    COUNT(si.id)::int                       AS transactions,
                    COALESCE(SUM(si.total), 0)::float       AS revenue,
                    COALESCE(SUM(si.commission_amount), 0)::float AS commission
                FROM ${it} si
                LEFT JOIN ${spt} sp ON si.staff_id = sp.id
                LEFT JOIN public.users u ON si.staff_id = u.id
                  AND lpad(trim(u.firm_nr::text), 3, '0') = $1
                WHERE si.created_at >= date_trunc('month', CURRENT_DATE)
                  AND si.staff_id IS NOT NULL
                  AND si.item_type = 'product'
                GROUP BY si.staff_id, COALESCE(sp.name, u.full_name, u.username), COALESCE(sp.commission_rate, 0)
                ORDER BY revenue DESC
                LIMIT 20
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
            productStaffPerformance: productStaffRes.rows as any[],
        };
    },

    async getCommissionReport(startYmd: string, endYmd: string): Promise<{
        rows: Array<{
            specialist_id: string;
            name: string;
            service_revenue: number;
            service_commission: number;
            service_rate_effective: number;
            product_revenue: number;
            product_commission: number;
            product_rate_effective: number;
            total_revenue: number;
            total_commission: number;
            total_transactions: number;
        }>;
        history_rows: Array<{
            date_ymd: string;
            specialist_id: string;
            name: string;
            service_commission: number;
            product_commission: number;
            total_commission: number;
        }>;
        totals: {
            service_revenue: number;
            service_commission: number;
            product_revenue: number;
            product_commission: number;
            total_revenue: number;
            total_commission: number;
            total_transactions: number;
        };
    }> {
        const st = postgres.getMovementTableName('beauty_sales', 'beauty');
        const it = postgres.getMovementTableName('beauty_sale_items', 'beauty');
        const spt = postgres.getCardTableName('beauty_specialists', 'beauty');
        const start = String(startYmd || '').trim();
        const end = String(endYmd || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            return {
                rows: [],
                history_rows: [],
                totals: {
                    service_revenue: 0,
                    service_commission: 0,
                    product_revenue: 0,
                    product_commission: 0,
                    total_revenue: 0,
                    total_commission: 0,
                    total_transactions: 0,
                },
            };
        }

        const [staffRowsRes, historyRowsRes] = await Promise.all([
            postgres.query(
            `
            SELECT
                si.staff_id AS specialist_id,
                COALESCE(sp.name, u.full_name, u.username, '—') AS name,
                COALESCE(SUM(CASE WHEN si.item_type = 'service' THEN si.total ELSE 0 END), 0)::float AS service_revenue,
                COALESCE(SUM(CASE WHEN si.item_type = 'service' THEN si.commission_amount ELSE 0 END), 0)::float AS service_commission,
                COALESCE(SUM(CASE WHEN si.item_type = 'product' THEN si.total ELSE 0 END), 0)::float AS product_revenue,
                COALESCE(SUM(CASE WHEN si.item_type = 'product' THEN si.commission_amount ELSE 0 END), 0)::float AS product_commission,
                COALESCE(SUM(si.total), 0)::float AS total_revenue,
                COALESCE(SUM(si.commission_amount), 0)::float AS total_commission,
                COUNT(si.id)::int AS total_transactions
            FROM ${it} si
            JOIN ${st} s ON s.id = si.sale_id
            LEFT JOIN ${spt} sp ON si.staff_id = sp.id
            LEFT JOIN public.users u ON si.staff_id = u.id
              AND lpad(trim(u.firm_nr::text), 3, '0') = $3
            WHERE si.staff_id IS NOT NULL
              AND COALESCE(s.payment_status, 'paid') = 'paid'
              AND s.created_at >= ($1::date)
              AND s.created_at < (($2::date) + INTERVAL '1 day')
            GROUP BY si.staff_id, COALESCE(sp.name, u.full_name, u.username, '—')
            ORDER BY total_commission DESC, total_revenue DESC
            `,
            [start, end, erpFirmNrForRow()],
            ),
            postgres.query(
            `
            SELECT
                to_char(s.created_at::date, 'YYYY-MM-DD') AS date_ymd,
                si.staff_id AS specialist_id,
                COALESCE(sp.name, u.full_name, u.username, '—') AS name,
                COALESCE(SUM(CASE WHEN si.item_type = 'service' THEN si.commission_amount ELSE 0 END), 0)::float AS service_commission,
                COALESCE(SUM(CASE WHEN si.item_type = 'product' THEN si.commission_amount ELSE 0 END), 0)::float AS product_commission,
                COALESCE(SUM(si.commission_amount), 0)::float AS total_commission
            FROM ${it} si
            JOIN ${st} s ON s.id = si.sale_id
            LEFT JOIN ${spt} sp ON si.staff_id = sp.id
            LEFT JOIN public.users u ON si.staff_id = u.id
              AND lpad(trim(u.firm_nr::text), 3, '0') = $3
            WHERE si.staff_id IS NOT NULL
              AND COALESCE(s.payment_status, 'paid') = 'paid'
              AND s.created_at >= ($1::date)
              AND s.created_at < (($2::date) + INTERVAL '1 day')
            GROUP BY to_char(s.created_at::date, 'YYYY-MM-DD'), si.staff_id, COALESCE(sp.name, u.full_name, u.username, '—')
            ORDER BY date_ymd DESC, total_commission DESC
            `,
            [start, end, erpFirmNrForRow()],
            ),
        ]);
        const rows = staffRowsRes.rows;

        const normalized = (rows as any[]).map((r) => {
            const serviceRevenue = Number(r.service_revenue) || 0;
            const serviceCommission = Number(r.service_commission) || 0;
            const productRevenue = Number(r.product_revenue) || 0;
            const productCommission = Number(r.product_commission) || 0;
            return {
                specialist_id: String(r.specialist_id ?? ''),
                name: String(r.name ?? '—'),
                service_revenue: serviceRevenue,
                service_commission: serviceCommission,
                service_rate_effective: serviceRevenue > 0 ? Number(((serviceCommission / serviceRevenue) * 100).toFixed(2)) : 0,
                product_revenue: productRevenue,
                product_commission: productCommission,
                product_rate_effective: productRevenue > 0 ? Number(((productCommission / productRevenue) * 100).toFixed(2)) : 0,
                total_revenue: Number(r.total_revenue) || 0,
                total_commission: Number(r.total_commission) || 0,
                total_transactions: Number(r.total_transactions) || 0,
            };
        });

        const totals = normalized.reduce(
            (acc, row) => {
                acc.service_revenue += row.service_revenue;
                acc.service_commission += row.service_commission;
                acc.product_revenue += row.product_revenue;
                acc.product_commission += row.product_commission;
                acc.total_revenue += row.total_revenue;
                acc.total_commission += row.total_commission;
                acc.total_transactions += row.total_transactions;
                return acc;
            },
            {
                service_revenue: 0,
                service_commission: 0,
                product_revenue: 0,
                product_commission: 0,
                total_revenue: 0,
                total_commission: 0,
                total_transactions: 0,
            },
        );

        const historyRows = (historyRowsRes.rows as any[]).map((r) => ({
            date_ymd: String(r.date_ymd ?? ''),
            specialist_id: String(r.specialist_id ?? ''),
            name: String(r.name ?? '—'),
            service_commission: Number(r.service_commission) || 0,
            product_commission: Number(r.product_commission) || 0,
            total_commission: Number(r.total_commission) || 0,
        }));

        return { rows: normalized, history_rows: historyRows, totals };
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_audit_log`,
                [
                    {
                        id: uuidv4(),
                        table_name: tableName,
                        record_id: pgUuidOrNull(recordId),
                        action,
                        user_id: pgUuidOrNull(userId),
                        payload_json: payload ?? {},
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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
        const id = row.id ?? uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const payload = {
                id,
                name: row.name,
                address: row.address ?? null,
                phone: row.phone ?? null,
                is_active: row.is_active ?? true,
                sort_order: row.sort_order ?? 0,
            };
            if (await postgrestRowExists(`/rex_${fn}_beauty_branches`, 'beauty', id)) {
                await postgrest.patch(
                    `/rex_${fn}_beauty_branches?id=eq.${encodeURIComponent(id)}`,
                    payload,
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await postgrest.post(
                    `/rex_${fn}_beauty_branches`,
                    [payload],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return id;
        }
        const t = postgres.getCardTableName('beauty_branches', 'beauty');
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
        const id = row.id ?? uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const payload = {
                id,
                branch_id: pgUuidOrNull(row.branch_id),
                name: row.name,
                capacity: row.capacity ?? 1,
                is_active: row.is_active ?? true,
                sort_order: row.sort_order ?? 0,
            };
            if (await postgrestRowExists(`/rex_${fn}_beauty_rooms`, 'beauty', id)) {
                await postgrest.patch(
                    `/rex_${fn}_beauty_rooms?id=eq.${encodeURIComponent(id)}`,
                    payload,
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await postgrest.post(
                    `/rex_${fn}_beauty_rooms`,
                    [payload],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return id;
        }
        const t = postgres.getCardTableName('beauty_rooms', 'beauty');
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const rows = await postgrest.get<BeautyPortalSettings[]>(
                `/rex_${fn}_beauty_portal_settings`,
                { select: '*', order: 'created_at.asc', limit: 1 },
                { schema: 'beauty' }
            );
            if (!rows[0]) {
                const generatedToken = uuidv4().replace(/-/g, '').slice(0, 32);
                await postgrest.post(
                    `/rex_${fn}_beauty_portal_settings`,
                    [{
                        id: uuidv4(),
                        online_booking_enabled: false,
                        public_token: generatedToken,
                        reminder_hours_before: 24,
                    }],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
                const refreshed = await postgrest.get<BeautyPortalSettings[]>(
                    `/rex_${fn}_beauty_portal_settings`,
                    { select: '*', order: 'created_at.asc', limit: 1 },
                    { schema: 'beauty' }
                );
                return refreshed[0] ?? null;
            }
            return rows[0] ?? null;
        }
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
        const cur = await beautyService.getPortalSettings();
        const id = cur?.id;
        if (!id) return;
        const merged: BeautyPortalSettings = { ...cur, ...data } as BeautyPortalSettings;
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.patch(
                `/rex_${fn}_beauty_portal_settings?id=eq.${encodeURIComponent(id)}`,
                {
                    online_booking_enabled: merged.online_booking_enabled,
                    public_slug: merged.public_slug ?? null,
                    public_token: merged.public_token,
                    reminder_hours_before: merged.reminder_hours_before ?? 24,
                    sms_template: merged.sms_template ?? null,
                    whatsapp_template: merged.whatsapp_template ?? null,
                    sms_user: merged.sms_user ?? null,
                    sms_password: merged.sms_password ?? null,
                    sms_sender: merged.sms_sender ?? null,
                    whatsapp_provider: (merged.whatsapp_provider || 'NONE').toString().toUpperCase(),
                    whatsapp_base_url: merged.whatsapp_base_url ?? null,
                    whatsapp_token: merged.whatsapp_token ?? null,
                    whatsapp_instance_id: merged.whatsapp_instance_id ?? null,
                    whatsapp_phone_id: merged.whatsapp_phone_id ?? null,
                    default_reminder_channel: (merged.default_reminder_channel || 'sms').toString().toLowerCase(),
                    allow_staff_slot_overlap: merged.allow_staff_slot_overlap ?? false,
                    updated_at: new Date().toISOString(),
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
        const t = postgres.getCardTableName('beauty_portal_settings', 'beauty');
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
        const sendBeautyWhatsApp = async (
            portal: ClinicMessagingPortalConfig,
            phone: string,
            ctx: { name: string; date: string; time: string; service: string }
        ) => {
            const provider = (portal.whatsapp_provider || 'NONE').toString().toUpperCase();
            if (provider === 'META') {
                const erpMsg = await messagingService.getSettings();
                const meta = buildMetaAppointmentQueuePayload(erpMsg || {}, ctx);
                const tpl = resolveMetaAppointmentTemplate(
                    erpMsg?.meta_appointment_template_name,
                    erpMsg?.meta_appointment_template_language
                );
                const text = previewMetaTemplateBody(tpl, meta.meta_body_parameters);
                return sendWhatsAppNotification(portal, phone, {
                    text,
                    metaTemplate: {
                        name: meta.meta_template_name,
                        language: meta.meta_template_language,
                        bodyParameters: meta.meta_body_parameters,
                    },
                });
            }
            const text = buildReminderText(
                (portal.whatsapp_template ?? portal.sms_template) ?? undefined,
                'whatsapp',
                ctx
            );
            return sendWhatsAppText(portal, phone, text);
        };
        const settings = (await beautyService.getPortalSettings()) as ClinicMessagingPortalConfig | null;
        if (!settings) return { processed: 0, errors: ['Portal ayarı yok'] };
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            const pending = await postgrest.get<Record<string, unknown>[]>(
                `/rex_${fn}_${pn}_beauty_notification_queue`,
                {
                    select: '*',
                    status: 'eq.pending',
                    order: 'created_at.asc',
                    limit,
                },
                { schema: 'beauty' }
            );
            const errors: string[] = [];
            let processed = 0;
            for (const row of pending) {
                const qid = String(row.id ?? '');
                const appointmentId = row.appointment_id ? String(row.appointment_id) : null;
                const channel = String(row.channel || 'sms').toLowerCase();
                if (!qid) continue;
                if (!appointmentId) {
                    await postgrest.patch(
                        `/rex_${fn}_${pn}_beauty_notification_queue?id=eq.${encodeURIComponent(qid)}`,
                        { status: 'failed', error_text: 'appointment_id yok' },
                        { schema: 'beauty', prefer: 'return=minimal' }
                    );
                    errors.push(`${qid}: appointment_id yok`);
                    continue;
                }
                try {
                    const apptRows = await postgrest.get<Record<string, unknown>[]>(
                        `/rex_${fn}_${pn}_beauty_appointments`,
                        {
                            select: 'appointment_date,appointment_time,service_id,client_id',
                            id: `eq.${appointmentId}`,
                            limit: 1,
                        },
                        { schema: 'beauty' }
                    );
                    const appt = apptRows[0];
                    if (!appt) throw new Error('Randevu bulunamadı');
                    const customerId = String(appt.client_id ?? '').trim();
                    let customerName = 'Musteri';
                    let customerPhone = '';
                    if (customerId) {
                        const customerRows = await postgrest.get<Record<string, unknown>[]>(
                            `/rex_${fn}_customers`,
                            { select: 'name,phone', id: `eq.${customerId}`, limit: 1 },
                            { schema: 'public' }
                        );
                        if (customerRows[0]) {
                            customerName = customerRows[0].name != null ? String(customerRows[0].name) : 'Musteri';
                            customerPhone = customerRows[0].phone != null ? String(customerRows[0].phone).trim() : '';
                        }
                    }
                    if (!customerPhone) throw new Error('Müşteri telefonu yok');
                    let serviceName = 'Hizmet';
                    const serviceId = String(appt.service_id ?? '').trim();
                    if (serviceId) {
                        const serviceRows = await postgrest.get<Record<string, unknown>[]>(
                            `/rex_${fn}_beauty_services`,
                            { select: 'name', id: `eq.${serviceId}`, limit: 1 },
                            { schema: 'beauty' }
                        );
                        if (serviceRows[0]?.name != null) {
                            serviceName = String(serviceRows[0].name);
                        }
                    }
                    const timeStr = appt.appointment_time != null ? String(appt.appointment_time).slice(0, 5) : '';
                    const ctx = {
                        name: customerName,
                        date: appt.appointment_date != null ? String(appt.appointment_date) : '',
                        time: timeStr,
                        service: serviceName,
                    };
                    if (channel === 'sms') {
                        const text = buildReminderText(settings.sms_template ?? undefined, 'sms', ctx);
                        const r = await sendAtakSms(settings, customerPhone, text);
                        if (!r.success) throw new Error(r.error || 'SMS gönderilemedi');
                    } else if (channel === 'whatsapp') {
                        const r = await sendBeautyWhatsApp(settings, customerPhone, ctx);
                        if (!r.success) throw new Error(r.error || 'WhatsApp gönderilemedi');
                    } else {
                        throw new Error(`Bilinmeyen kanal: ${channel}`);
                    }
                    await postgrest.patch(
                        `/rex_${fn}_${pn}_beauty_notification_queue?id=eq.${encodeURIComponent(qid)}`,
                        { status: 'sent', sent_at: new Date().toISOString(), error_text: null },
                        { schema: 'beauty', prefer: 'return=minimal' }
                    );
                    processed++;
                } catch (e: unknown) {
                    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
                    errors.push(msg);
                    await postgrest.patch(
                        `/rex_${fn}_${pn}_beauty_notification_queue?id=eq.${encodeURIComponent(qid)}`,
                        { status: 'failed', error_text: msg },
                        { schema: 'beauty', prefer: 'return=minimal' }
                    );
                }
            }
            return { processed, errors };
        }
        const q = postgres.getMovementTableName('beauty_notification_queue', 'beauty');
        const apt = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const svc = postgres.getCardTableName('beauty_services', 'beauty');
        const svcFirm = postgres.getCardTableName('services');

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
                if (!a) throw new Error('Randevu bulunamadı');
                const phone = a.phone != null ? String(a.phone).trim() : '';
                if (!phone) throw new Error('Müşteri telefonu yok');

                const timeStr = a.appointment_time != null ? String(a.appointment_time).slice(0, 5) : '';
                const ctx = {
                    name: a.customer_name != null ? String(a.customer_name) : 'Musteri',
                    date: a.appointment_date != null ? String(a.appointment_date) : '',
                    time: timeStr,
                    service: a.service_name != null ? String(a.service_name) : 'Hizmet',
                };

                if (channel === 'sms') {
                    const text = buildReminderText(settings.sms_template ?? undefined, 'sms', ctx);
                    const r = await sendAtakSms(settings, phone, text);
                    if (!r.success) throw new Error(r.error || 'SMS gönderilemedi');
                } else if (channel === 'whatsapp') {
                    const r = await sendBeautyWhatsApp(settings, phone, ctx);
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const rows = await postgrest.get<BeautyPortalSettings[]>(
                `/rex_${fn}_beauty_portal_settings`,
                { select: '*', order: 'created_at.asc', limit: 1 },
                { schema: 'beauty' }
            );
            return rows[0] ?? null;
        }
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
        const fn = firmNr.padStart(3, '0');
        const pn = periodNr.padStart(2, '0');
        const settings = await beautyService.getPortalSettingsRaw(firmNr);
        if (!settings?.online_booking_enabled) throw new Error('Online randevu kapalı');
        if (!settings.public_token || settings.public_token !== token) throw new Error('Geçersiz bağlantı anahtarı');
        const timeVal = body.requested_time
            ? (String(body.requested_time).length === 5
                ? `${body.requested_time}:00`
                : String(body.requested_time))
            : null;
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_booking_requests`,
                [
                    {
                        id: uuidv4(),
                        name: body.name,
                        phone: body.phone,
                        email: body.email ?? null,
                        service_id: pgUuidOrNull(body.service_id),
                        requested_date: body.requested_date,
                        requested_time: timeVal,
                        notes: body.notes ?? null,
                        status: 'pending',
                        public_token_used: token,
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
        const bt = `beauty.rex_${fn}_${pn}_beauty_booking_requests`;
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            const rows = await postgrest.get<BeautyBookingRequest[]>(
                `/rex_${fn}_${pn}_beauty_booking_requests`,
                { select: '*', status: 'eq.pending', order: 'created_at.desc', limit: 500 },
                { schema: 'beauty' }
            );
            return rows;
        }
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
        let req: BeautyBookingRequest | null = null;
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            const rows = await postgrest.get<BeautyBookingRequest[]>(
                `/rex_${fn}_${pn}_beauty_booking_requests`,
                { select: '*', id: `eq.${requestId}`, limit: 1 },
                { schema: 'beauty' }
            );
            req = rows[0] ?? null;
        } else {
            const { rows } = await postgres.query(`SELECT * FROM ${bt} WHERE id = $1`, [requestId]);
            req = (rows[0] as BeautyBookingRequest | undefined) ?? null;
        }
        if (!req) throw new Error('Talep bulunamadı');

        let customerId = opts.customerId ?? null;
        if (!customerId) {
            if (shouldUseTenantPostgrestApi()) {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = erpFirmNrForRow();
                const found = await postgrest.get<{ id: string }[]>(
                    `/rex_${fn}_customers`,
                    {
                        select: 'id',
                        phone: `eq.${String(req.phone ?? '').trim()}`,
                        limit: 1,
                    },
                    { schema: 'public' }
                );
                if (found[0]?.id) {
                    customerId = found[0].id;
                } else {
                    customerId = await beautyService.createCustomer({
                        name: req.name,
                        phone: req.phone,
                        email: req.email ?? undefined,
                    });
                }
            } else {
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
            status: AppointmentStatus.SCHEDULED,
            booking_channel: 'online',
            notes: req.notes ?? undefined,
        });

        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.patch(
                `/rex_${fn}_${pn}_beauty_booking_requests?id=eq.${encodeURIComponent(requestId)}`,
                {
                    status: 'approved',
                    processed_appointment_id: apptId,
                },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
        } else {
            await postgres.query(
                `UPDATE ${bt} SET status = 'approved', processed_appointment_id = $2 WHERE id = $1`,
                [requestId, apptId]
            );
        }
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
        const id = uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_waitlist`,
                [
                    {
                        id,
                        customer_id: pgUuidOrNull(row.customer_id),
                        service_id: pgUuidOrNull(row.service_id),
                        specialist_id: pgUuidOrNull(row.specialist_id),
                        preferred_date_from: pgDateOrNull(row.preferred_date_from),
                        preferred_date_to: pgDateOrNull(row.preferred_date_to),
                        notes: row.notes ?? null,
                        status: 'active',
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
        const t = postgres.getMovementTableName('beauty_waitlist', 'beauty');
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
        const ps = await beautyService.getPortalSettings();
        const ch = (ps?.default_reminder_channel || 'sms').toString().toLowerCase();
        const channels =
            ch === 'both' ? (['sms', 'whatsapp'] as const) : ch === 'whatsapp' ? (['whatsapp'] as const) : (['sms'] as const);
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + 1);
            const tomorrowYmd = targetDate.toISOString().slice(0, 10);
            const rows = await postgrest.get<{ id: string }[]>(
                `/rex_${fn}_${pn}_beauty_appointments`,
                {
                    select: 'id',
                    status: 'in.(scheduled,confirmed)',
                    appointment_date: `eq.${tomorrowYmd}`,
                    reminder_sent_at: 'is.null',
                    limit: 3000,
                },
                { schema: 'beauty' }
            );
            let n = 0;
            for (const r of rows) {
                if (!r?.id) continue;
                for (const channel of channels) {
                    await postgrest.post(
                        `/rex_${fn}_${pn}_beauty_notification_queue`,
                        [{
                            id: uuidv4(),
                            appointment_id: r.id,
                            channel,
                            status: 'pending',
                            payload_json: {},
                            scheduled_at: new Date().toISOString(),
                        }],
                        { schema: 'beauty', prefer: 'return=minimal' }
                    );
                    n++;
                }
                await postgrest.patch(
                    `/rex_${fn}_${pn}_beauty_appointments?id=eq.${encodeURIComponent(r.id)}`,
                    { reminder_sent_at: new Date().toISOString() },
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return n;
        }
        const apt = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const q = postgres.getMovementTableName('beauty_notification_queue', 'beauty');

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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.patch(
                `/rex_${fn}_${pn}_beauty_notification_queue?id=eq.${encodeURIComponent(id)}`,
                { status: 'sent', sent_at: new Date().toISOString() },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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
        const id = row.id ?? uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const payload = {
                id,
                title: row.title,
                body_html: row.body_html ?? null,
                is_active: row.is_active ?? true,
                sort_order: row.sort_order ?? 0,
            };
            if (await postgrestRowExists(`/rex_${fn}_beauty_consent_templates`, 'beauty', id)) {
                await postgrest.patch(
                    `/rex_${fn}_beauty_consent_templates?id=eq.${encodeURIComponent(id)}`,
                    payload,
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await postgrest.post(
                    `/rex_${fn}_beauty_consent_templates`,
                    [payload],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return id;
        }
        const t = postgres.getCardTableName('beauty_consent_templates', 'beauty');
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
        const id = row.id ?? uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const payload = {
                id,
                name: row.name,
                tax_nr: row.tax_nr ?? null,
                discount_pct: row.discount_pct ?? 0,
                notes: row.notes ?? null,
                is_active: row.is_active ?? true,
            };
            if (await postgrestRowExists(`/rex_${fn}_beauty_corporate_accounts`, 'beauty', id)) {
                await postgrest.patch(
                    `/rex_${fn}_beauty_corporate_accounts?id=eq.${encodeURIComponent(id)}`,
                    payload,
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await postgrest.post(
                    `/rex_${fn}_beauty_corporate_accounts`,
                    [payload],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return id;
        }
        const t = postgres.getCardTableName('beauty_corporate_accounts', 'beauty');
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
        const id = uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_membership_subscriptions`,
                [
                    {
                        id,
                        customer_id: customerId,
                        membership_id: membershipId,
                        start_date: new Date().toISOString().slice(0, 10),
                        status: 'active',
                        auto_renew: false,
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
        } else {
            const t = postgres.getMovementTableName('beauty_membership_subscriptions', 'beauty');
            await postgres.query(
                `INSERT INTO ${t} (id, customer_id, membership_id, start_date, status, auto_renew)
                 VALUES ($1,$2,$3,CURRENT_DATE,'active',false)`,
                [id, customerId, membershipId]
            );
        }
        await beautyService.appendAuditLog('beauty_membership_subscriptions', 'create', id, null, {
            customer_id: customerId,
            membership_id: membershipId,
        });
        return id;
    },

    async saveMembership(row: Partial<BeautyMembership> & { name: string }): Promise<string> {
        const id = row.id ?? uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const payload = {
                id,
                name: row.name,
                monthly_price: row.monthly_price ?? 0,
                session_credit: row.session_credit ?? 0,
                benefits_json: row.benefits_json ?? {},
                is_active: row.is_active ?? true,
            };
            if (await postgrestRowExists(`/rex_${fn}_beauty_memberships`, 'beauty', id)) {
                await postgrest.patch(
                    `/rex_${fn}_beauty_memberships?id=eq.${encodeURIComponent(id)}`,
                    { ...payload, updated_at: new Date().toISOString() },
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await postgrest.post(
                    `/rex_${fn}_beauty_memberships`,
                    [payload],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return id;
        }
        const t = postgres.getCardTableName('beauty_memberships', 'beauty');
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
        const id = row.id ?? uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const payload = {
                id,
                name: row.name,
                channel: row.channel ?? 'sms',
                segment_filter_json: row.segment_filter_json ?? {},
                message_template: row.message_template ?? null,
                scheduled_at: row.scheduled_at ?? null,
                status: row.status ?? 'draft',
            };
            if (await postgrestRowExists(`/rex_${fn}_beauty_marketing_campaigns`, 'beauty', id)) {
                await postgrest.patch(
                    `/rex_${fn}_beauty_marketing_campaigns?id=eq.${encodeURIComponent(id)}`,
                    payload,
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await postgrest.post(
                    `/rex_${fn}_beauty_marketing_campaigns`,
                    [payload],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return id;
        }
        const t = postgres.getCardTableName('beauty_marketing_campaigns', 'beauty');
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const ext = data.external_calendar_json ?? {};
            const rows = await postgrest.get<{ id: number }[]>(
                `/rex_${fn}_beauty_integration_settings`,
                { select: 'id', id: 'eq.1', limit: 1 },
                { schema: 'beauty' }
            );
            if (!rows[0]) {
                await postgrest.post(
                    `/rex_${fn}_beauty_integration_settings`,
                    [
                        {
                            id: 1,
                            google_calendar_id: data.google_calendar_id ?? null,
                            external_calendar_json: ext,
                        },
                    ],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
                return;
            }
            const patchBody = stripUndefinedFields({
                google_calendar_id: data.google_calendar_id,
                external_calendar_json: data.external_calendar_json,
                updated_at: new Date().toISOString(),
            });
            await postgrest.patch(
                `/rex_${fn}_beauty_integration_settings?id=eq.1`,
                patchBody,
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const rows = await postgrest.get<{ customer_id: string }[]>(
                `/rex_${fn}_beauty_customer_health`,
                { select: 'customer_id', customer_id: `eq.${customerId}`, limit: 1 },
                { schema: 'beauty' }
            );
            const payload = {
                customer_id: customerId,
                allergies: data.allergies ?? null,
                medications: data.medications ?? null,
                pregnancy: data.pregnancy ?? false,
                chronic_notes: data.chronic_notes ?? null,
                warnings_banner: data.warnings_banner ?? null,
                kvkk_consent_at: data.kvkk_consent_at ?? null,
            };
            if (rows[0]) {
                await postgrest.patch(
                    `/rex_${fn}_beauty_customer_health?customer_id=eq.${encodeURIComponent(customerId)}`,
                    { ...payload, updated_at: new Date().toISOString() },
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await postgrest.post(
                    `/rex_${fn}_beauty_customer_health`,
                    [payload],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const rows = await postgrest.get<{ id: string }[]>(
                `/rex_${fn}_beauty_service_consumables`,
                {
                    select: 'id',
                    service_id: `eq.${row.service_id}`,
                    product_id: `eq.${row.product_id}`,
                    limit: 1,
                },
                { schema: 'beauty' }
            );
            if (rows[0]?.id) {
                await postgrest.patch(
                    `/rex_${fn}_beauty_service_consumables?id=eq.${encodeURIComponent(rows[0].id)}`,
                    { qty_per_service: row.qty_per_service },
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
                return rows[0].id;
            }
            const id = uuidv4();
            await postgrest.post(
                `/rex_${fn}_beauty_service_consumables`,
                [{
                    id,
                    service_id: row.service_id,
                    product_id: row.product_id,
                    qty_per_service: row.qty_per_service,
                }],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
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
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.patch(
                `/rex_${fn}_beauty_service_consumables?id=eq.${encodeURIComponent(id)}`,
                { qty_per_service },
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
        const t = postgres.getCardTableName('beauty_service_consumables', 'beauty');
        await postgres.query(`UPDATE ${t} SET qty_per_service = $2 WHERE id = $1`, [id, qty_per_service]);
    },

    async deleteServiceConsumable(id: string): Promise<void> {
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            await postgrest.delete(
                `/rex_${fn}_beauty_service_consumables?id=eq.${encodeURIComponent(id)}`,
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return;
        }
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
        const id = row.id ?? uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const payload = {
                id,
                product_id: row.product_id,
                lot_code: row.lot_code ?? null,
                expiry_date: row.expiry_date ?? null,
                qty: row.qty ?? 0,
                barcode: row.barcode ?? null,
            };
            if (await postgrestRowExists(`/rex_${fn}_beauty_product_batches`, 'beauty', id)) {
                await postgrest.patch(
                    `/rex_${fn}_beauty_product_batches?id=eq.${encodeURIComponent(id)}`,
                    payload,
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            } else {
                await postgrest.post(
                    `/rex_${fn}_beauty_product_batches`,
                    [payload],
                    { schema: 'beauty', prefer: 'return=minimal' }
                );
            }
            return id;
        }
        const t = postgres.getCardTableName('beauty_product_batches', 'beauty');
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
        const id = row.id ?? uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_clinical_notes`,
                [
                    {
                        id,
                        appointment_id: row.appointment_id,
                        customer_id: pgUuidOrNull(row.customer_id),
                        subjective: row.subjective ?? null,
                        objective: row.objective ?? null,
                        assessment: row.assessment ?? null,
                        plan: row.plan ?? null,
                        extra_json: row.extra_json ?? {},
                        created_by: pgUuidOrNull(row.created_by),
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
        const t = postgres.getMovementTableName('beauty_clinical_notes', 'beauty');
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
        const id = row.id ?? uuidv4();
        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const fn = erpFirmNrForRow();
            const pn = erpPeriodNrForRow();
            await postgrest.post(
                `/rex_${fn}_${pn}_beauty_patient_photos`,
                [
                    {
                        id,
                        customer_id: row.customer_id,
                        appointment_id: pgUuidOrNull(row.appointment_id),
                        kind: row.kind ?? 'before',
                        storage_url: row.storage_url,
                        caption: row.caption ?? null,
                        taken_at: row.taken_at ?? null,
                    },
                ],
                { schema: 'beauty', prefer: 'return=minimal' }
            );
            return id;
        }
        const t = postgres.getMovementTableName('beauty_patient_photos', 'beauty');
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

    async getSurveyResultsReport(
        startYmd: string,
        endYmd: string,
        opts?: { surveyId?: string | null; lang?: SatisfactionLangCode },
    ): Promise<BeautySurveyResultsReport> {
        const empty: BeautySurveyResultsReport = {
            start_ymd: startYmd,
            end_ymd: endYmd,
            survey_options: [],
            selected_survey_id: opts?.surveyId ?? null,
            summary: {
                response_count: 0,
                avg_overall_rating: 0,
                would_recommend_count: 0,
                would_recommend_pct: 0,
                completed_appointments: 0,
                response_rate_pct: 0,
                legacy_avg_service: null,
                legacy_avg_staff: null,
                legacy_avg_cleanliness: null,
            },
            question_stats: [],
            responses: [],
        };
        const start = String(startYmd || '').trim();
        const end = String(endYmd || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            return empty;
        }
        const lang = opts?.lang ?? 'tr';
        const surveyFilter = opts?.surveyId?.trim() || null;

        const surveyOptions = await beautyService.getSatisfactionSurveys();

        let rawRows: Array<
            BeautyCustomerFeedback & {
                customer_name?: string;
                customer_phone?: string | null;
                appointment_date?: string | null;
                appointment_time?: string | null;
                specialist_name?: string | null;
                service_name?: string | null;
                survey_name?: string | null;
                survey_answers?: unknown;
            }
        >;
        let completedAppointments: number;

        const pgCtx = await buildSurveyFeedbackContextPostgrest(start, end, surveyFilter);
        if (pgCtx) {
            rawRows = pgCtx.enriched;
            completedAppointments = pgCtx.completedTotal;
        } else if (surveyReportBlocksSqlFallback()) {
            return empty;
        } else {
            const fbTable = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
            const aptTable = postgres.getMovementTableName('beauty_appointments', 'beauty');
            const custTable = postgres.getCardTableName('customers');
            const surveyTable = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
            const spTable = postgres.getCardTableName('beauty_specialists', 'beauty');
            const bsTable = postgres.getCardTableName('beauty_services', 'beauty');
            const rsTable = postgres.getCardTableName('services');
            const prodTbl = postgres.getCardTableName('products');
            const fn = erpFirmNrForRow();

            const fbParams: unknown[] = [start, end, fn];
            let surveySql = '';
            if (surveyFilter) {
                fbParams.push(surveyFilter);
                surveySql = ` AND f.survey_id = $${fbParams.length}::uuid`;
            }

            const [fbRes, completedRes] = await Promise.all([
                postgres.query(
                    `SELECT
                       f.*,
                       c.name AS customer_name,
                       COALESCE(NULLIF(TRIM(c.phone::text), ''), NULLIF(TRIM(c.phone2::text), '')) AS customer_phone,
                       a.appointment_date::text AS appointment_date,
                       to_char(a.appointment_time, 'HH24:MI') AS appointment_time,
                       sv.name AS survey_name,
                       COALESCE(sp.name, u.full_name, u.username) AS specialist_name,
                       COALESCE(bs.name, rs.name, pr.name) AS service_name
                     FROM ${fbTable} f
                     LEFT JOIN ${custTable} c ON f.customer_id = c.id
                     LEFT JOIN ${aptTable} a ON f.appointment_id = a.id
                     LEFT JOIN ${surveyTable} sv ON f.survey_id = sv.id
                     LEFT JOIN ${spTable} sp ON a.specialist_id = sp.id
                     LEFT JOIN users u ON a.specialist_id = u.id AND lpad(trim(u.firm_nr::text), 3, '0') = $3
                     LEFT JOIN ${bsTable} bs ON a.service_id = bs.id
                     LEFT JOIN ${rsTable} rs ON a.service_id = rs.id AND rs.firm_nr = $3
                     LEFT JOIN ${prodTbl} pr ON pr.id = a.service_id AND pr.firm_nr = $3
                     WHERE f.created_at >= $1::date
                       AND f.created_at < ($2::date + INTERVAL '1 day')
                       ${surveySql}
                     ORDER BY f.created_at DESC`,
                    fbParams,
                ),
                postgres.query(
                    `SELECT COUNT(*)::int AS cnt
                     FROM ${aptTable} a
                     WHERE LOWER(TRIM(COALESCE(a.status::text, ''))) = 'completed'
                       AND a.appointment_date >= $1::date
                       AND a.appointment_date <= $2::date`,
                    [start, end],
                ),
            ]);

            rawRows = fbRes.rows as typeof rawRows;
            completedAppointments = Number(
                (completedRes.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0,
            );
        }

        const parsedRows = rawRows.map((r) => beautyService.parseFeedbackRow(r));

        const responses: BeautySurveyResponseRow[] = rawRows.map((raw, i) => {
            const r = parsedRows[i];
            return {
                id: String(r.id),
                created_at: String(r.created_at ?? ''),
                customer_id: r.customer_id ?? null,
                customer_name: String(raw.customer_name ?? '').trim() || '—',
                customer_phone: raw.customer_phone?.trim() || null,
                appointment_id: r.appointment_id ?? null,
                appointment_date: raw.appointment_date?.slice(0, 10) ?? null,
                appointment_time: raw.appointment_time?.trim() || null,
                specialist_name: raw.specialist_name?.trim() || null,
                service_name: raw.service_name?.trim() || null,
                overall_rating: Number(r.overall_rating ?? 0),
                would_recommend: Boolean(r.would_recommend),
                comment: r.comment?.trim() || null,
                survey_id: r.survey_id ?? null,
                survey_name: raw.survey_name?.trim() || null,
                survey_answers: Array.isArray(r.survey_answers) ? r.survey_answers : [],
            };
        });

        const responseCount = responses.length;
        const avgOverall =
            responseCount > 0
                ? responses.reduce((s, r) => s + r.overall_rating, 0) / responseCount
                : 0;
        const recommendCount = responses.filter((r) => r.would_recommend).length;
        const recommendPct = responseCount > 0 ? Math.round((recommendCount / responseCount) * 100) : 0;
        const responseRatePct =
            completedAppointments > 0
                ? Math.round((responseCount / completedAppointments) * 100)
                : responseCount > 0
                  ? 100
                  : 0;

        let legacyServiceSum = 0;
        let legacyStaffSum = 0;
        let legacyCleanSum = 0;
        let legacyLegacyCount = 0;
        for (const r of parsedRows) {
            if (r.survey_answers?.length) continue;
            legacyLegacyCount += 1;
            legacyServiceSum += Number(r.service_rating ?? 0);
            legacyStaffSum += Number(r.staff_rating ?? 0);
            legacyCleanSum += Number(r.cleanliness_rating ?? 0);
        }

        const surveyIds = [
            ...new Set(
                responses.map((r) => r.survey_id).filter((id): id is string => Boolean(id?.trim())),
            ),
        ];
        const questionMeta = new Map<
            string,
            { label: string; question_type: string; scale_max: number; sort_order: number }
        >();
        for (const sid of surveyIds) {
            const questions = await beautyService.getSatisfactionQuestions(sid);
            for (const q of questions) {
                const label =
                    q.labels_json[lang] ||
                    q.labels_json.tr ||
                    q.labels_json.en ||
                    Object.values(q.labels_json)[0] ||
                    q.id.slice(0, 8);
                questionMeta.set(q.id, {
                    label,
                    question_type: String(q.question_type ?? 'rating'),
                    scale_max: Number(q.scale_max ?? 5),
                    sort_order: Number(q.sort_order ?? 0),
                });
            }
        }

        type Acc = {
            label: string;
            question_type: string;
            scale_max: number;
            sort_order: number;
            count: number;
            ratingSum: number;
            ratingCount: number;
            ratingBuckets: number[];
            yes: number;
            no: number;
            texts: string[];
        };
        const accMap = new Map<string, Acc>();

        const ensureAcc = (qid: string, fallbackLabel?: string) => {
            let acc = accMap.get(qid);
            if (!acc) {
                const meta = questionMeta.get(qid);
                acc = {
                    label: meta?.label ?? fallbackLabel ?? qid.slice(0, 8),
                    question_type: meta?.question_type ?? 'rating',
                    scale_max: meta?.scale_max ?? 5,
                    sort_order: meta?.sort_order ?? 999,
                    count: 0,
                    ratingSum: 0,
                    ratingCount: 0,
                    ratingBuckets: Array.from({ length: meta?.scale_max ?? 5 }, () => 0),
                    yes: 0,
                    no: 0,
                    texts: [],
                };
                accMap.set(qid, acc);
            }
            return acc;
        };

        for (const row of responses) {
            for (const ans of row.survey_answers) {
                const qid = String(ans.question_id ?? '').trim();
                if (!qid) continue;
                const acc = ensureAcc(qid, ans.label_snapshot);
                acc.count += 1;
                if (typeof ans.rating === 'number' && !Number.isNaN(ans.rating)) {
                    acc.ratingSum += ans.rating;
                    acc.ratingCount += 1;
                    const star = Math.min(
                        acc.scale_max,
                        Math.max(1, Math.round(ans.rating)),
                    );
                    if (acc.ratingBuckets[star - 1] != null) {
                        acc.ratingBuckets[star - 1] += 1;
                    }
                }
                if (typeof ans.yes_no === 'boolean') {
                    if (ans.yes_no) acc.yes += 1;
                    else acc.no += 1;
                }
                const txt = ans.text?.trim();
                if (txt && acc.texts.length < 5) acc.texts.push(txt);
            }
        }

        const question_stats: BeautySurveyQuestionStat[] = [...accMap.entries()]
            .map(([question_id, acc]) => ({
                question_id,
                label: acc.label,
                question_type: acc.question_type,
                scale_max: acc.scale_max,
                response_count: acc.count,
                avg_rating:
                    acc.ratingCount > 0
                        ? Math.round((acc.ratingSum / acc.ratingCount) * 10) / 10
                        : null,
                yes_count: acc.yes + acc.no > 0 ? acc.yes : null,
                no_count: acc.yes + acc.no > 0 ? acc.no : null,
                yes_pct:
                    acc.yes + acc.no > 0
                        ? Math.round((acc.yes / (acc.yes + acc.no)) * 100)
                        : null,
                text_samples: acc.texts,
                rating_breakdown:
                    acc.ratingCount > 0 ? [...acc.ratingBuckets] : undefined,
            }))
            .sort((a, b) => {
                const ao = accMap.get(a.question_id)?.sort_order ?? 999;
                const bo = accMap.get(b.question_id)?.sort_order ?? 999;
                return ao - bo;
            });

        return {
            start_ymd: start,
            end_ymd: end,
            survey_options: surveyOptions,
            selected_survey_id: surveyFilter,
            summary: {
                response_count: responseCount,
                avg_overall_rating: Math.round(avgOverall * 10) / 10,
                would_recommend_count: recommendCount,
                would_recommend_pct: recommendPct,
                completed_appointments: completedAppointments,
                response_rate_pct: responseRatePct,
                legacy_avg_service:
                    legacyLegacyCount > 0
                        ? Math.round((legacyServiceSum / legacyLegacyCount) * 10) / 10
                        : null,
                legacy_avg_staff:
                    legacyLegacyCount > 0
                        ? Math.round((legacyStaffSum / legacyLegacyCount) * 10) / 10
                        : null,
                legacy_avg_cleanliness:
                    legacyLegacyCount > 0
                        ? Math.round((legacyCleanSum / legacyLegacyCount) * 10) / 10
                        : null,
            },
            question_stats,
            responses,
        };
    },

    async getSurveyTrendReport(
        startYmd: string,
        endYmd: string,
        opts?: { surveyId?: string | null },
    ): Promise<BeautySurveyTrendReport> {
        const empty: BeautySurveyTrendReport = {
            start_ymd: startYmd,
            end_ymd: endYmd,
            survey_options: [],
            selected_survey_id: opts?.surveyId ?? null,
            points: [],
            summary: { response_count: 0, avg_overall_rating: 0, would_recommend_pct: 0 },
        };
        const start = String(startYmd || '').trim();
        const end = String(endYmd || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return empty;

        const surveyFilter = opts?.surveyId?.trim() || null;
        const surveyOptions = await beautyService.getSatisfactionSurveys();

        const pgCtx = await buildSurveyFeedbackContextPostgrest(start, end, surveyFilter);
        if (pgCtx) {
            const fbByDay = new Map<
                string,
                { count: number; ratingSum: number; recommend: number }
            >();
            for (const f of pgCtx.feedback) {
                const dayKey = surveyFeedbackDayKey(f.created_at);
                if (!dayKey) continue;
                const acc = fbByDay.get(dayKey) ?? { count: 0, ratingSum: 0, recommend: 0 };
                acc.count += 1;
                acc.ratingSum += Number(f.overall_rating ?? 0);
                if (f.would_recommend) acc.recommend += 1;
                fbByDay.set(dayKey, acc);
            }

            const points: BeautySurveyTrendPoint[] = [...fbByDay.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dayKey, acc]) => {
                    const responseCount = acc.count;
                    const completed = pgCtx.completedByDay.get(dayKey) ?? 0;
                    return {
                        day_key: dayKey,
                        response_count: responseCount,
                        avg_overall_rating:
                            responseCount > 0
                                ? Math.round((acc.ratingSum / responseCount) * 100) / 100
                                : 0,
                        would_recommend_pct:
                            responseCount > 0
                                ? Math.round((acc.recommend / responseCount) * 100)
                                : 0,
                        completed_appointments: completed,
                        response_rate_pct:
                            completed > 0
                                ? Math.round((responseCount / completed) * 100)
                                : responseCount > 0
                                  ? 100
                                  : 0,
                    };
                });

            const totalResponses = points.reduce((s, p) => s + p.response_count, 0);
            const avgOverall =
                totalResponses > 0
                    ? points.reduce((s, p) => s + p.avg_overall_rating * p.response_count, 0) /
                      totalResponses
                    : 0;
            const totalRecommend = pgCtx.feedback.filter((f) => f.would_recommend).length;

            return {
                start_ymd: start,
                end_ymd: end,
                survey_options: surveyOptions,
                selected_survey_id: surveyFilter,
                points,
                summary: {
                    response_count: totalResponses,
                    avg_overall_rating: Math.round(avgOverall * 10) / 10,
                    would_recommend_pct:
                        totalResponses > 0
                            ? Math.round((totalRecommend / totalResponses) * 100)
                            : 0,
                },
            };
        }

        if (surveyReportBlocksSqlFallback()) {
            return empty;
        }

        const fbTable = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const aptTable = postgres.getMovementTableName('beauty_appointments', 'beauty');

        const fbParams: unknown[] = [start, end];
        let surveySql = '';
        if (surveyFilter) {
            fbParams.push(surveyFilter);
            surveySql = ` AND f.survey_id = $${fbParams.length}::uuid`;
        }

        const [fbRes, aptRes] = await Promise.all([
            postgres.query(
                `SELECT
                   DATE(f.created_at)::text AS day_key,
                   COUNT(*)::int AS response_count,
                   ROUND(AVG(f.overall_rating)::numeric, 2)::float AS avg_overall_rating,
                   SUM(CASE WHEN f.would_recommend THEN 1 ELSE 0 END)::int AS would_recommend_count
                 FROM ${fbTable} f
                 WHERE f.created_at >= $1::date
                   AND f.created_at < ($2::date + INTERVAL '1 day')
                   ${surveySql}
                 GROUP BY DATE(f.created_at)
                 ORDER BY day_key`,
                fbParams,
            ),
            postgres.query(
                `SELECT a.appointment_date::text AS day_key, COUNT(*)::int AS cnt
                 FROM ${aptTable} a
                 WHERE LOWER(TRIM(COALESCE(a.status::text, ''))) = 'completed'
                   AND a.appointment_date >= $1::date
                   AND a.appointment_date <= $2::date
                 GROUP BY a.appointment_date
                 ORDER BY day_key`,
                [start, end],
            ),
        ]);

        const completedByDay = new Map<string, number>();
        for (const row of aptRes.rows as Array<{ day_key?: string; cnt?: number }>) {
            const key = String(row.day_key ?? '').slice(0, 10);
            if (key) completedByDay.set(key, Number(row.cnt ?? 0));
        }

        const points: BeautySurveyTrendPoint[] = (fbRes.rows as Array<{
            day_key?: string;
            response_count?: number;
            avg_overall_rating?: number;
            would_recommend_count?: number;
        }>).map((r) => {
            const dayKey = String(r.day_key ?? '').slice(0, 10);
            const responseCount = Number(r.response_count ?? 0);
            const recommendCount = Number(r.would_recommend_count ?? 0);
            const completed = completedByDay.get(dayKey) ?? 0;
            return {
                day_key: dayKey,
                response_count: responseCount,
                avg_overall_rating: Number(r.avg_overall_rating ?? 0),
                would_recommend_pct:
                    responseCount > 0 ? Math.round((recommendCount / responseCount) * 100) : 0,
                completed_appointments: completed,
                response_rate_pct:
                    completed > 0
                        ? Math.round((responseCount / completed) * 100)
                        : responseCount > 0
                          ? 100
                          : 0,
            };
        });

        const totalResponses = points.reduce((s, p) => s + p.response_count, 0);
        const avgOverall =
            totalResponses > 0
                ? points.reduce((s, p) => s + p.avg_overall_rating * p.response_count, 0) / totalResponses
                : 0;
        const totalRecommend = (fbRes.rows as Array<{ would_recommend_count?: number }>).reduce(
            (s, r) => s + Number(r.would_recommend_count ?? 0),
            0,
        );

        return {
            start_ymd: start,
            end_ymd: end,
            survey_options: surveyOptions,
            selected_survey_id: surveyFilter,
            points,
            summary: {
                response_count: totalResponses,
                avg_overall_rating: Math.round(avgOverall * 10) / 10,
                would_recommend_pct:
                    totalResponses > 0 ? Math.round((totalRecommend / totalResponses) * 100) : 0,
            },
        };
    },

    async getSurveyStaffReport(
        startYmd: string,
        endYmd: string,
        opts?: { surveyId?: string | null },
    ): Promise<BeautySurveyStaffReport> {
        const empty: BeautySurveyStaffReport = {
            start_ymd: startYmd,
            end_ymd: endYmd,
            survey_options: [],
            selected_survey_id: opts?.surveyId ?? null,
            rows: [],
        };
        const start = String(startYmd || '').trim();
        const end = String(endYmd || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return empty;

        const surveyFilter = opts?.surveyId?.trim() || null;
        const surveyOptions = await beautyService.getSatisfactionSurveys();

        const pgCtx = await buildSurveyFeedbackContextPostgrest(start, end, surveyFilter);
        if (pgCtx) {
            type StaffAcc = {
                id: string;
                name: string;
                count: number;
                overallSum: number;
                staffSum: number;
                staffCnt: number;
                recommend: number;
                low: number;
            };
            const accMap = new Map<string, StaffAcc>();
            for (const r of pgCtx.enriched) {
                if (!r.appointment_id) continue;
                const id = r.specialist_id?.trim() || 'unknown';
                const name = r.specialist_name?.trim() || '—';
                let acc = accMap.get(id);
                if (!acc) {
                    acc = {
                        id,
                        name,
                        count: 0,
                        overallSum: 0,
                        staffSum: 0,
                        staffCnt: 0,
                        recommend: 0,
                        low: 0,
                    };
                    accMap.set(id, acc);
                }
                acc.count += 1;
                acc.overallSum += Number(r.overall_rating ?? 0);
                const sr = r.staff_rating;
                if (sr != null && !Number.isNaN(Number(sr))) {
                    acc.staffSum += Number(sr);
                    acc.staffCnt += 1;
                }
                if (r.would_recommend) acc.recommend += 1;
                if (Number(r.overall_rating ?? 0) <= 2) acc.low += 1;
            }

            const breakdownRows: BeautySurveyBreakdownRow[] = [...accMap.values()]
                .map((acc) => ({
                    id: acc.id,
                    name: acc.name,
                    response_count: acc.count,
                    avg_overall_rating: Math.round((acc.overallSum / acc.count) * 10) / 10,
                    avg_staff_rating:
                        acc.staffCnt > 0
                            ? Math.round((acc.staffSum / acc.staffCnt) * 10) / 10
                            : null,
                    would_recommend_pct:
                        acc.count > 0 ? Math.round((acc.recommend / acc.count) * 100) : 0,
                    low_score_count: acc.low,
                }))
                .sort(
                    (a, b) =>
                        b.avg_overall_rating - a.avg_overall_rating ||
                        b.response_count - a.response_count,
                );

            return {
                start_ymd: start,
                end_ymd: end,
                survey_options: surveyOptions,
                selected_survey_id: surveyFilter,
                rows: breakdownRows,
            };
        }

        if (surveyReportBlocksSqlFallback()) {
            return empty;
        }

        const fn = erpFirmNrForRow();
        const fbTable = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const aptTable = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const spTable = postgres.getCardTableName('beauty_specialists', 'beauty');

        const params: unknown[] = [start, end, fn];
        let surveySql = '';
        if (surveyFilter) {
            params.push(surveyFilter);
            surveySql = ` AND f.survey_id = $${params.length}::uuid`;
        }

        const { rows } = await postgres.query(
            `SELECT
               COALESCE(a.specialist_id::text, '') AS specialist_id,
               COALESCE(sp.name, u.full_name, u.username, '—') AS specialist_name,
               COUNT(f.id)::int AS response_count,
               ROUND(AVG(f.overall_rating)::numeric, 1)::float AS avg_overall_rating,
               ROUND(AVG(f.staff_rating)::numeric, 1)::float AS avg_staff_rating,
               SUM(CASE WHEN f.would_recommend THEN 1 ELSE 0 END)::int AS would_recommend_count,
               SUM(CASE WHEN f.overall_rating <= 2 THEN 1 ELSE 0 END)::int AS low_score_count
             FROM ${fbTable} f
             INNER JOIN ${aptTable} a ON f.appointment_id = a.id
             LEFT JOIN ${spTable} sp ON a.specialist_id = sp.id
             LEFT JOIN users u ON a.specialist_id = u.id AND lpad(trim(u.firm_nr::text), 3, '0') = $3
             WHERE f.created_at >= $1::date
               AND f.created_at < ($2::date + INTERVAL '1 day')
               ${surveySql}
             GROUP BY a.specialist_id, specialist_name
             HAVING COUNT(f.id) > 0
             ORDER BY avg_overall_rating DESC NULLS LAST, response_count DESC`,
            params,
        );

        const breakdownRows: BeautySurveyBreakdownRow[] = (rows as Array<{
            specialist_id?: string;
            specialist_name?: string;
            response_count?: number;
            avg_overall_rating?: number;
            avg_staff_rating?: number | null;
            would_recommend_count?: number;
            low_score_count?: number;
        }>).map((r) => {
            const cnt = Number(r.response_count ?? 0);
            const rec = Number(r.would_recommend_count ?? 0);
            return {
                id: String(r.specialist_id ?? '').trim() || 'unknown',
                name: String(r.specialist_name ?? '').trim() || '—',
                response_count: cnt,
                avg_overall_rating: Number(r.avg_overall_rating ?? 0),
                avg_staff_rating:
                    r.avg_staff_rating != null && !Number.isNaN(Number(r.avg_staff_rating))
                        ? Number(r.avg_staff_rating)
                        : null,
                would_recommend_pct: cnt > 0 ? Math.round((rec / cnt) * 100) : 0,
                low_score_count: Number(r.low_score_count ?? 0),
            };
        });

        return {
            start_ymd: start,
            end_ymd: end,
            survey_options: surveyOptions,
            selected_survey_id: surveyFilter,
            rows: breakdownRows,
        };
    },

    async getSurveyServiceReport(
        startYmd: string,
        endYmd: string,
        opts?: { surveyId?: string | null },
    ): Promise<BeautySurveyServiceReport> {
        const empty: BeautySurveyServiceReport = {
            start_ymd: startYmd,
            end_ymd: endYmd,
            survey_options: [],
            selected_survey_id: opts?.surveyId ?? null,
            rows: [],
        };
        const start = String(startYmd || '').trim();
        const end = String(endYmd || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return empty;

        const surveyFilter = opts?.surveyId?.trim() || null;
        const surveyOptions = await beautyService.getSatisfactionSurveys();

        const pgCtx = await buildSurveyFeedbackContextPostgrest(start, end, surveyFilter);
        if (pgCtx) {
            type SvcAcc = {
                id: string;
                name: string;
                count: number;
                overallSum: number;
                svcSum: number;
                svcCnt: number;
                recommend: number;
                low: number;
            };
            const accMap = new Map<string, SvcAcc>();
            for (const r of pgCtx.enriched) {
                if (!r.appointment_id) continue;
                const id = r.service_id?.trim() || 'unknown';
                const name = r.service_name?.trim() || '—';
                let acc = accMap.get(id);
                if (!acc) {
                    acc = {
                        id,
                        name,
                        count: 0,
                        overallSum: 0,
                        svcSum: 0,
                        svcCnt: 0,
                        recommend: 0,
                        low: 0,
                    };
                    accMap.set(id, acc);
                }
                acc.count += 1;
                acc.overallSum += Number(r.overall_rating ?? 0);
                const svr = r.service_rating;
                if (svr != null && !Number.isNaN(Number(svr))) {
                    acc.svcSum += Number(svr);
                    acc.svcCnt += 1;
                }
                if (r.would_recommend) acc.recommend += 1;
                if (Number(r.overall_rating ?? 0) <= 2) acc.low += 1;
            }

            const breakdownRows: BeautySurveyBreakdownRow[] = [...accMap.values()]
                .map((acc) => ({
                    id: acc.id,
                    name: acc.name,
                    response_count: acc.count,
                    avg_overall_rating: Math.round((acc.overallSum / acc.count) * 10) / 10,
                    avg_staff_rating:
                        acc.svcCnt > 0 ? Math.round((acc.svcSum / acc.svcCnt) * 10) / 10 : null,
                    would_recommend_pct:
                        acc.count > 0 ? Math.round((acc.recommend / acc.count) * 100) : 0,
                    low_score_count: acc.low,
                }))
                .sort(
                    (a, b) =>
                        b.avg_overall_rating - a.avg_overall_rating ||
                        b.response_count - a.response_count,
                );

            return {
                start_ymd: start,
                end_ymd: end,
                survey_options: surveyOptions,
                selected_survey_id: surveyFilter,
                rows: breakdownRows,
            };
        }

        if (surveyReportBlocksSqlFallback()) {
            return empty;
        }

        const fn = erpFirmNrForRow();
        const fbTable = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const aptTable = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const bsTable = postgres.getCardTableName('beauty_services', 'beauty');
        const rsTable = postgres.getCardTableName('services');
        const prodTbl = postgres.getCardTableName('products');

        const params: unknown[] = [start, end, fn];
        let surveySql = '';
        if (surveyFilter) {
            params.push(surveyFilter);
            surveySql = ` AND f.survey_id = $${params.length}::uuid`;
        }

        const { rows } = await postgres.query(
            `SELECT
               COALESCE(a.service_id::text, '') AS service_id,
               COALESCE(bs.name, rs.name, pr.name, '—') AS service_name,
               COUNT(f.id)::int AS response_count,
               ROUND(AVG(f.overall_rating)::numeric, 1)::float AS avg_overall_rating,
               ROUND(AVG(f.service_rating)::numeric, 1)::float AS avg_service_rating,
               SUM(CASE WHEN f.would_recommend THEN 1 ELSE 0 END)::int AS would_recommend_count,
               SUM(CASE WHEN f.overall_rating <= 2 THEN 1 ELSE 0 END)::int AS low_score_count
             FROM ${fbTable} f
             INNER JOIN ${aptTable} a ON f.appointment_id = a.id
             LEFT JOIN ${bsTable} bs ON a.service_id = bs.id
             LEFT JOIN ${rsTable} rs ON a.service_id = rs.id AND rs.firm_nr = $3
             LEFT JOIN ${prodTbl} pr ON pr.id = a.service_id AND pr.firm_nr = $3
             WHERE f.created_at >= $1::date
               AND f.created_at < ($2::date + INTERVAL '1 day')
               ${surveySql}
             GROUP BY a.service_id, service_name
             HAVING COUNT(f.id) > 0
             ORDER BY avg_overall_rating DESC NULLS LAST, response_count DESC`,
            params,
        );

        const breakdownRows: BeautySurveyBreakdownRow[] = (rows as Array<{
            service_id?: string;
            service_name?: string;
            response_count?: number;
            avg_overall_rating?: number;
            avg_service_rating?: number | null;
            would_recommend_count?: number;
            low_score_count?: number;
        }>).map((r) => {
            const cnt = Number(r.response_count ?? 0);
            const rec = Number(r.would_recommend_count ?? 0);
            return {
                id: String(r.service_id ?? '').trim() || 'unknown',
                name: String(r.service_name ?? '').trim() || '—',
                response_count: cnt,
                avg_overall_rating: Number(r.avg_overall_rating ?? 0),
                avg_staff_rating:
                    r.avg_service_rating != null && !Number.isNaN(Number(r.avg_service_rating))
                        ? Number(r.avg_service_rating)
                        : null,
                would_recommend_pct: cnt > 0 ? Math.round((rec / cnt) * 100) : 0,
                low_score_count: Number(r.low_score_count ?? 0),
            };
        });

        return {
            start_ymd: start,
            end_ymd: end,
            survey_options: surveyOptions,
            selected_survey_id: surveyFilter,
            rows: breakdownRows,
        };
    },

    async getSurveyNpsReport(
        startYmd: string,
        endYmd: string,
        opts?: { surveyId?: string | null },
    ): Promise<BeautySurveyNpsReport> {
        const empty: BeautySurveyNpsReport = {
            start_ymd: startYmd,
            end_ymd: endYmd,
            survey_options: [],
            selected_survey_id: opts?.surveyId ?? null,
            summary: {
                response_count: 0,
                nps_score: 0,
                promoter_count: 0,
                passive_count: 0,
                detractor_count: 0,
                promoter_pct: 0,
                passive_pct: 0,
                detractor_pct: 0,
                would_recommend_pct: 0,
                avg_overall_rating: 0,
            },
        };
        const start = String(startYmd || '').trim();
        const end = String(endYmd || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return empty;

        const surveyFilter = opts?.surveyId?.trim() || null;
        const surveyOptions = await beautyService.getSatisfactionSurveys();

        const pgCtx = await buildSurveyFeedbackContextPostgrest(start, end, surveyFilter);
        if (pgCtx) {
            let promoters = 0;
            let passives = 0;
            let detractors = 0;
            let recommendCount = 0;
            let ratingSum = 0;

            for (const raw of pgCtx.feedback) {
                const rating = Math.min(5, Math.max(1, Math.round(Number(raw.overall_rating ?? 0))));
                ratingSum += rating;
                if (raw.would_recommend) recommendCount += 1;
                if (rating >= 5) promoters += 1;
                else if (rating >= 4) passives += 1;
                else detractors += 1;
            }

            const total = pgCtx.feedback.length;
            const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

            return {
                start_ymd: start,
                end_ymd: end,
                survey_options: surveyOptions,
                selected_survey_id: surveyFilter,
                summary: {
                    response_count: total,
                    nps_score: npsScore,
                    promoter_count: promoters,
                    passive_count: passives,
                    detractor_count: detractors,
                    promoter_pct: total > 0 ? Math.round((promoters / total) * 100) : 0,
                    passive_pct: total > 0 ? Math.round((passives / total) * 100) : 0,
                    detractor_pct: total > 0 ? Math.round((detractors / total) * 100) : 0,
                    would_recommend_pct:
                        total > 0 ? Math.round((recommendCount / total) * 100) : 0,
                    avg_overall_rating:
                        total > 0 ? Math.round((ratingSum / total) * 10) / 10 : 0,
                },
            };
        }

        if (surveyReportBlocksSqlFallback()) {
            return empty;
        }

        const fbTable = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');

        const params: unknown[] = [start, end];
        let surveySql = '';
        if (surveyFilter) {
            params.push(surveyFilter);
            surveySql = ` AND f.survey_id = $${params.length}::uuid`;
        }

        const { rows } = await postgres.query(
            `SELECT f.overall_rating, f.would_recommend
             FROM ${fbTable} f
             WHERE f.created_at >= $1::date
               AND f.created_at < ($2::date + INTERVAL '1 day')
               ${surveySql}`,
            params,
        );

        let promoters = 0;
        let passives = 0;
        let detractors = 0;
        let recommendCount = 0;
        let ratingSum = 0;

        for (const raw of rows as Array<{ overall_rating?: number; would_recommend?: boolean }>) {
            const rating = Math.min(5, Math.max(1, Math.round(Number(raw.overall_rating ?? 0))));
            ratingSum += rating;
            if (raw.would_recommend) recommendCount += 1;
            if (rating >= 5) promoters += 1;
            else if (rating >= 4) passives += 1;
            else detractors += 1;
        }

        const total = rows.length;
        const npsScore =
            total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

        return {
            start_ymd: start,
            end_ymd: end,
            survey_options: surveyOptions,
            selected_survey_id: surveyFilter,
            summary: {
                response_count: total,
                nps_score: npsScore,
                promoter_count: promoters,
                passive_count: passives,
                detractor_count: detractors,
                promoter_pct: total > 0 ? Math.round((promoters / total) * 100) : 0,
                passive_pct: total > 0 ? Math.round((passives / total) * 100) : 0,
                detractor_pct: total > 0 ? Math.round((detractors / total) * 100) : 0,
                would_recommend_pct: total > 0 ? Math.round((recommendCount / total) * 100) : 0,
                avg_overall_rating: total > 0 ? Math.round((ratingSum / total) * 10) / 10 : 0,
            },
        };
    },

    async getSurveyCommentsReport(
        startYmd: string,
        endYmd: string,
        opts?: { surveyId?: string | null; maxRating?: number },
    ): Promise<BeautySurveyCommentsReport> {
        const empty: BeautySurveyCommentsReport = {
            start_ymd: startYmd,
            end_ymd: endYmd,
            survey_options: [],
            selected_survey_id: opts?.surveyId ?? null,
            summary: { total_with_comment: 0, low_score_count: 0, avg_rating_comments: null },
            rows: [],
        };
        const start = String(startYmd || '').trim();
        const end = String(endYmd || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return empty;

        const surveyFilter = opts?.surveyId?.trim() || null;
        const maxRating = Math.min(5, Math.max(1, Number(opts?.maxRating ?? 3)));
        const surveyOptions = await beautyService.getSatisfactionSurveys();

        const pgCtx = await buildSurveyFeedbackContextPostgrest(start, end, surveyFilter);
        if (pgCtx) {
            const filtered = pgCtx.enriched.filter((r) => {
                const comment = String(r.comment ?? '').trim();
                return comment.length > 0 || Number(r.overall_rating ?? 0) <= maxRating;
            });

            const commentRows: BeautySurveyCommentRow[] = filtered
                .sort(
                    (a, b) =>
                        Number(a.overall_rating ?? 0) - Number(b.overall_rating ?? 0) ||
                        String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
                )
                .map((r) => ({
                    id: String(r.id ?? ''),
                    created_at: String(r.created_at ?? ''),
                    customer_name: String(r.customer_name ?? '').trim() || '—',
                    appointment_date: r.appointment_date?.slice(0, 10) ?? null,
                    overall_rating: Number(r.overall_rating ?? 0),
                    would_recommend: Boolean(r.would_recommend),
                    comment: String(r.comment ?? '').trim(),
                    specialist_name: r.specialist_name?.trim() || null,
                    service_name: r.service_name?.trim() || null,
                    survey_name: r.survey_name?.trim() || null,
                }));

            const withComment = commentRows.filter((r) => r.comment.length > 0);
            const lowScore = commentRows.filter((r) => r.overall_rating <= maxRating);
            const avgCommentRating =
                withComment.length > 0
                    ? Math.round(
                          (withComment.reduce((s, r) => s + r.overall_rating, 0) / withComment.length) *
                              10,
                      ) / 10
                    : null;

            return {
                start_ymd: start,
                end_ymd: end,
                survey_options: surveyOptions,
                selected_survey_id: surveyFilter,
                summary: {
                    total_with_comment: withComment.length,
                    low_score_count: lowScore.length,
                    avg_rating_comments: avgCommentRating,
                },
                rows: commentRows,
            };
        }

        if (surveyReportBlocksSqlFallback()) {
            return empty;
        }

        const fn = erpFirmNrForRow();
        const fbTable = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const aptTable = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const custTable = postgres.getCardTableName('customers');
        const surveyTable = postgres.getCardTableName('beauty_satisfaction_surveys', 'beauty');
        const spTable = postgres.getCardTableName('beauty_specialists', 'beauty');
        const bsTable = postgres.getCardTableName('beauty_services', 'beauty');
        const rsTable = postgres.getCardTableName('services');
        const prodTbl = postgres.getCardTableName('products');

        const params: unknown[] = [start, end, fn, maxRating];
        let surveySql = '';
        if (surveyFilter) {
            params.push(surveyFilter);
            surveySql = ` AND f.survey_id = $${params.length}::uuid`;
        }

        const { rows } = await postgres.query(
            `SELECT
               f.id,
               f.created_at,
               f.overall_rating,
               f.would_recommend,
               f.comment,
               c.name AS customer_name,
               a.appointment_date::text AS appointment_date,
               sv.name AS survey_name,
               COALESCE(sp.name, u.full_name, u.username) AS specialist_name,
               COALESCE(bs.name, rs.name, pr.name) AS service_name
             FROM ${fbTable} f
             LEFT JOIN ${custTable} c ON f.customer_id = c.id
             LEFT JOIN ${aptTable} a ON f.appointment_id = a.id
             LEFT JOIN ${surveyTable} sv ON f.survey_id = sv.id
             LEFT JOIN ${spTable} sp ON a.specialist_id = sp.id
             LEFT JOIN users u ON a.specialist_id = u.id AND lpad(trim(u.firm_nr::text), 3, '0') = $3
             LEFT JOIN ${bsTable} bs ON a.service_id = bs.id
             LEFT JOIN ${rsTable} rs ON a.service_id = rs.id AND rs.firm_nr = $3
             LEFT JOIN ${prodTbl} pr ON pr.id = a.service_id AND pr.firm_nr = $3
             WHERE f.created_at >= $1::date
               AND f.created_at < ($2::date + INTERVAL '1 day')
               AND (
                 NULLIF(TRIM(COALESCE(f.comment, '')), '') IS NOT NULL
                 OR f.overall_rating <= $4
               )
               ${surveySql}
             ORDER BY f.overall_rating ASC, f.created_at DESC`,
            params,
        );

        const commentRows: BeautySurveyCommentRow[] = (rows as Array<{
            id?: string;
            created_at?: string;
            overall_rating?: number;
            would_recommend?: boolean;
            comment?: string | null;
            customer_name?: string;
            appointment_date?: string | null;
            survey_name?: string | null;
            specialist_name?: string | null;
            service_name?: string | null;
        }>).map((r) => ({
            id: String(r.id ?? ''),
            created_at: String(r.created_at ?? ''),
            customer_name: String(r.customer_name ?? '').trim() || '—',
            appointment_date: r.appointment_date?.slice(0, 10) ?? null,
            overall_rating: Number(r.overall_rating ?? 0),
            would_recommend: Boolean(r.would_recommend),
            comment: String(r.comment ?? '').trim(),
            specialist_name: r.specialist_name?.trim() || null,
            service_name: r.service_name?.trim() || null,
            survey_name: r.survey_name?.trim() || null,
        }));

        const withComment = commentRows.filter((r) => r.comment.length > 0);
        const lowScore = commentRows.filter((r) => r.overall_rating <= maxRating);
        const avgCommentRating =
            withComment.length > 0
                ? Math.round(
                      (withComment.reduce((s, r) => s + r.overall_rating, 0) / withComment.length) * 10,
                  ) / 10
                : null;

        return {
            start_ymd: start,
            end_ymd: end,
            survey_options: surveyOptions,
            selected_survey_id: surveyFilter,
            summary: {
                total_with_comment: withComment.length,
                low_score_count: lowScore.length,
                avg_rating_comments: avgCommentRating,
            },
            rows: commentRows,
        };
    },
};
