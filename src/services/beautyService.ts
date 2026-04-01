import { v4 as uuidv4 } from 'uuid';
import { postgres, ERP_SETTINGS } from './postgres';
import {
    buildReminderText,
    sendAtakSms,
    sendWhatsAppText,
    getAtakBalance,
    type ClinicMessagingPortalConfig,
} from './messaging/clinicMessaging';
import { getEmbeddedBridgeStatus } from './messaging/whatsappEmbeddedBridge';
import {
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
} from '../types/beauty';

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
        is_active: row.is_active !== false,
    };
}

export const beautyService = {

    // =========================================================================
    // CUSTOMERS  (general rex_{firm}_customers table)
    // =========================================================================
    async getCustomers(): Promise<BeautyCustomer[]> {
        const t = postgres.getCardTableName('customers');
        const apt = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const svc = postgres.getCardTableName('beauty_services', 'beauty');
        const svcFirm = postgres.getCardTableName('services');
        const prodTbl = postgres.getCardTableName('products');
        const fn = String(ERP_SETTINGS.firmNr ?? '001').trim();
        const { rows } = await postgres.query(`
            SELECT
                c.id, c.code, c.name, c.phone, c.email,
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
            WHERE c.is_active = true
            GROUP BY c.id
            ORDER BY c.name
        `, [fn]);
        return rows;
    },

    async searchCustomers(term: string): Promise<BeautyCustomer[]> {
        const t = postgres.getCardTableName('customers');
        const { rows } = await postgres.query(
            `SELECT id, code, name, phone, email, address, city, points, total_spent, balance, is_active
             FROM ${t}
             WHERE is_active = true
               AND (name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1 OR code ILIKE $1)
             ORDER BY name LIMIT 50`,
            [`%${term}%`]
        );
        return rows;
    },

    async createCustomer(data: Partial<BeautyCustomer>): Promise<string> {
        const t = postgres.getCardTableName('customers');
        const id = uuidv4();
        const code = `BEA-${Date.now().toString(36).toUpperCase()}`;
        await postgres.query(
            `INSERT INTO ${t} (id, code, name, phone, email, address, city, notes, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW(),NOW())`,
            [id, code, data.name, data.phone ?? null, data.email ?? null,
             data.address ?? null, data.city ?? null, data.notes ?? null]
        );
        return id;
    },

    async updateCustomer(id: string, data: Partial<BeautyCustomer>): Promise<void> {
        const t = postgres.getCardTableName('customers');
        await postgres.query(
            `UPDATE ${t} SET name=$2, phone=$3, email=$4, address=$5, city=$6, notes=$7, updated_at=NOW()
             WHERE id=$1`,
            [id, data.name, data.phone ?? null, data.email ?? null,
             data.address ?? null, data.city ?? null, data.notes ?? null]
        );
    },

    // =========================================================================
    // SPECIALISTS  (firm card table: rex_{firm}_beauty_specialists)
    // =========================================================================
    async getSpecialists(): Promise<BeautySpecialist[]> {
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${t} WHERE is_active = true ORDER BY name`
        );
        return rows;
    },

    async createSpecialist(data: Partial<BeautySpecialist>): Promise<string> {
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO ${t}
                (id, name, phone, email, specialty, color, commission_rate, avatar_url, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW(),NOW())`,
            [id, data.name, data.phone ?? null, data.email ?? null, data.specialty ?? null,
             data.color ?? '#9333ea', data.commission_rate ?? 0, data.avatar_url ?? null]
        );
        return id;
    },

    async updateSpecialist(id: string, data: Partial<BeautySpecialist>): Promise<void> {
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        await postgres.query(
            `UPDATE ${t}
             SET name=$2, phone=$3, email=$4, specialty=$5, color=$6, commission_rate=$7, updated_at=NOW()
             WHERE id=$1`,
            [id, data.name, data.phone ?? null, data.email ?? null, data.specialty ?? null,
             data.color ?? '#9333ea', data.commission_rate ?? 0]
        );
    },

    async toggleSpecialist(id: string, active: boolean): Promise<void> {
        const t = postgres.getCardTableName('beauty_specialists', 'beauty');
        await postgres.query(
            `UPDATE ${t} SET is_active=$2, updated_at=NOW() WHERE id=$1`,
            [id, active]
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
                 description, requires_device, expected_shots, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,NOW(),NOW())`,
            [id, data.name, data.category ?? 'beauty', data.duration_min ?? 30,
             data.price ?? 0, data.cost_price ?? 0, data.color ?? '#9333ea',
             data.commission_rate ?? 0, data.description ?? null,
             data.requires_device ?? false, data.expected_shots ?? 0]
        );
        return id;
    },

    async updateService(id: string, data: Partial<BeautyService>): Promise<void> {
        const t = postgres.getCardTableName('beauty_services', 'beauty');
        await postgres.query(
            `UPDATE ${t}
             SET name=$2, category=$3, duration_min=$4, price=$5, cost_price=$6, color=$7,
                 commission_rate=$8, description=$9, requires_device=$10, expected_shots=$11, updated_at=NOW()
             WHERE id=$1`,
            [id, data.name, data.category ?? 'beauty', data.duration_min ?? 30,
             data.price ?? 0, data.cost_price ?? 0, data.color ?? '#9333ea',
             data.commission_rate ?? 0, data.description ?? null,
             data.requires_device ?? false, data.expected_shots ?? 0]
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
                a.reminder_sent,
                a.branch_id,
                a.room_id,
                a.tele_meeting_url,
                a.booking_channel,
                a.corporate_account_id,
                a.reminder_sent_at,
                a.last_notification_channel,
                COALESCE(s.name, rs.name)   AS service_name,
                COALESCE(s.color, '#6366f1') AS service_color,
                sp.name  AS specialist_name,
                c.name   AS customer_name
            FROM ${table} a
            LEFT JOIN ${svcBeauty} s ON a.service_id = s.id
            LEFT JOIN ${svcFirm} rs ON a.service_id = rs.id AND rs.firm_nr = $3
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            LEFT JOIN ${postgres.getCardTableName('customers')}                    c  ON a.client_id     = c.id
            WHERE a.appointment_date >= $1 AND a.appointment_date <= $2
            ORDER BY a.appointment_date, a.appointment_time
        `;
        const fn = String(ERP_SETTINGS.firmNr ?? '001').trim();
        const result = await postgres.query(query, [startDate, endDate, fn]);
        return result.rows;
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
                branch_id, room_id, tele_meeting_url, booking_channel, corporate_account_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
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
        ]);
        return id;
    },

    async updateAppointment(id: string, data: Partial<BeautyAppointment>): Promise<void> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        await postgres.query(
            `UPDATE ${table}
             SET client_id=$2, service_id=$3, specialist_id=$4, device_id=$5, body_region_id=$6,
                 appointment_date=$7, appointment_time=$8, duration=$9, status=$10,
                 notes=$11, total_price=$12,
                 branch_id=$13, room_id=$14, tele_meeting_url=$15, booking_channel=$16, corporate_account_id=$17,
                 updated_at=NOW()
             WHERE id=$1`,
            [id,
             data.customer_id ?? data.client_id ?? null,
             data.service_id ?? null,
             data.staff_id ?? data.specialist_id ?? null,
             data.device_id ?? null,
             data.body_region_id ?? null,
             data.date ?? data.appointment_date ?? null,
             data.time ?? data.appointment_time ?? null,
             data.duration ?? 30,
             data.status ?? 'scheduled',
             data.notes ?? null,
             data.total_price ?? 0,
             pgUuidOrNull(data.branch_id),
             pgUuidOrNull(data.room_id),
             data.tele_meeting_url ?? null,
             data.booking_channel ?? null,
             pgUuidOrNull(data.corporate_account_id)]
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
                a.reminder_sent,
                a.branch_id,
                a.room_id,
                a.tele_meeting_url,
                a.booking_channel,
                a.corporate_account_id,
                a.reminder_sent_at,
                a.last_notification_channel,
                COALESCE(s.name, rs.name) AS service_name,
                sp.name AS specialist_name,
                c.name AS customer_name
            FROM ${table} a
            LEFT JOIN ${postgres.getCardTableName('beauty_services', 'beauty')} s ON a.service_id = s.id
            LEFT JOIN ${postgres.getCardTableName('services')} rs ON a.service_id = rs.id AND rs.firm_nr = $2
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            LEFT JOIN ${postgres.getCardTableName('customers')} c ON a.client_id = c.id
            WHERE a.id = $1
        `, [id, String(ERP_SETTINGS.firmNr ?? '001').trim()]);
        return rows[0] ?? null;
    },

    async getAppointmentsByCustomer(customerId: string): Promise<BeautyAppointment[]> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const { rows } = await postgres.query(`
            SELECT a.*, COALESCE(s.name, rs.name) AS service_name, sp.name AS specialist_name
            FROM ${table} a
            LEFT JOIN ${postgres.getCardTableName('beauty_services', 'beauty')} s ON a.service_id = s.id
            LEFT JOIN ${postgres.getCardTableName('services')} rs ON a.service_id = rs.id AND rs.firm_nr = $2
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            WHERE a.client_id = $1
            ORDER BY a.appointment_date DESC NULLS LAST LIMIT 100
        `, [customerId, String(ERP_SETTINGS.firmNr ?? '001').trim()]);
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

    async getCustomerPackages(customerId: string): Promise<BeautyPackagePurchase[]> {
        const t = postgres.getMovementTableName('beauty_package_purchases', 'beauty');
        const pt = postgres.getCardTableName('beauty_packages', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const { rows } = await postgres.query(`
            SELECT pp.*, p.name AS package_name, c.name AS customer_name
            FROM ${t} pp
            LEFT JOIN ${pt} p ON pp.package_id = p.id
            LEFT JOIN ${ct} c ON pp.customer_id = c.id
            WHERE pp.customer_id = $1
            ORDER BY pp.purchase_date DESC
        `, [customerId]);
        return rows;
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
            `SELECT * FROM ${table} WHERE appointment_id=$1 LIMIT 1`, [appointmentId]
        );
        const row = rows[0] as BeautyCustomerFeedback | undefined;
        return row ? beautyService.parseFeedbackRow(row as BeautyCustomerFeedback & { survey_answers?: unknown }) : null;
    },

    async getFeedbackByCustomer(customerId: string): Promise<BeautyCustomerFeedback[]> {
        const table = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${table} WHERE customer_id=$1 ORDER BY created_at DESC NULLS LAST`,
            [customerId]
        );
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

    async getSalesByCustomer(customerId: string): Promise<BeautySale[]> {
        const st = postgres.getMovementTableName('beauty_sales', 'beauty');
        const it = postgres.getMovementTableName('beauty_sale_items', 'beauty');
        const ct = postgres.getCardTableName('customers');
        const { rows: sales } = await postgres.query(
            `SELECT s.*, c.name AS customer_name
             FROM ${st} s
             LEFT JOIN ${ct} c ON s.customer_id = c.id
             WHERE s.customer_id = $1
             ORDER BY s.created_at DESC NULLS LAST
             LIMIT 100`,
            [customerId]
        );
        if (!sales.length) return [];
        const saleIds = sales.map((s: { id: string }) => s.id);
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
        return sales.map((s: BeautySale) => ({ ...s, items: bySale.get(s.id) ?? [] }));
    },

    async createSale(sale: Partial<BeautySale>, items: Partial<BeautySaleItem>[]): Promise<string> {
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
        return id;
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
            // Staff performance (current month)
            postgres.query(`
                SELECT
                    sp.id   AS specialist_id,
                    sp.name,
                    sp.commission_rate,
                    COUNT(si.id)::int                       AS transactions,
                    COALESCE(SUM(si.total), 0)::float       AS revenue,
                    COALESCE(SUM(si.commission_amount), 0)::float AS commission
                FROM ${spt} sp
                LEFT JOIN ${it} si ON si.staff_id = sp.id
                  AND si.created_at >= date_trunc('month', CURRENT_DATE)
                WHERE sp.is_active = true
                GROUP BY sp.id, sp.name, sp.commission_rate
                ORDER BY revenue DESC
                LIMIT 10
            `),
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
        const q = serviceId
            ? `SELECT * FROM ${t} WHERE service_id = $1 ORDER BY created_at`
            : `SELECT * FROM ${t} ORDER BY created_at`;
        const { rows } = serviceId
            ? await postgres.query(q, [serviceId])
            : await postgres.query(q);
        return rows;
    },

    async setServiceConsumable(row: { service_id: string; product_id: string; qty_per_service: number }): Promise<string> {
        const t = postgres.getCardTableName('beauty_service_consumables', 'beauty');
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO ${t} (id, service_id, product_id, qty_per_service) VALUES ($1,$2,$3,$4)`,
            [id, row.service_id, row.product_id, row.qty_per_service]
        );
        return id;
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
