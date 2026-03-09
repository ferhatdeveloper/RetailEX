import { v4 as uuidv4 } from 'uuid';
import { postgres } from './postgres';
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
} from '../types/beauty';

export const beautyService = {

    // =========================================================================
    // CUSTOMERS  (general rex_{firm}_customers table)
    // =========================================================================
    async getCustomers(): Promise<BeautyCustomer[]> {
        const t = postgres.getCardTableName('customers');
        const apt = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const svc = postgres.getCardTableName('beauty_services', 'beauty');
        const { rows } = await postgres.query(`
            SELECT
                c.id, c.code, c.name, c.phone, c.email,
                c.address, c.city, c.points, c.total_spent, c.balance,
                c.is_active, c.notes, c.created_at,
                COUNT(a.id)::int          AS appointment_count,
                MAX(a.appointment_date)   AS last_appointment_date,
                (SELECT s.name FROM ${svc} s
                 WHERE s.id = (
                     SELECT service_id FROM ${apt}
                     WHERE client_id = c.id
                     ORDER BY appointment_date DESC LIMIT 1
                 ) LIMIT 1)              AS last_service_name
            FROM ${t} c
            LEFT JOIN ${apt} a ON a.client_id = c.id
            WHERE c.is_active = true
            GROUP BY c.id
            ORDER BY c.name
        `);
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
        const { rows } = await postgres.query(
            'SELECT * FROM beauty_specialists WHERE is_active = true ORDER BY name'
        );
        return rows;
    },

    async createSpecialist(data: Partial<BeautySpecialist>): Promise<string> {
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO beauty_specialists
                (id, name, phone, email, specialty, color, commission_rate, avatar_url, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW(),NOW())`,
            [id, data.name, data.phone ?? null, data.email ?? null, data.specialty ?? null,
             data.color ?? '#9333ea', data.commission_rate ?? 0, data.avatar_url ?? null]
        );
        return id;
    },

    async updateSpecialist(id: string, data: Partial<BeautySpecialist>): Promise<void> {
        await postgres.query(
            `UPDATE beauty_specialists
             SET name=$2, phone=$3, email=$4, specialty=$5, color=$6, commission_rate=$7, updated_at=NOW()
             WHERE id=$1`,
            [id, data.name, data.phone ?? null, data.email ?? null, data.specialty ?? null,
             data.color ?? '#9333ea', data.commission_rate ?? 0]
        );
    },

    async toggleSpecialist(id: string, active: boolean): Promise<void> {
        await postgres.query(
            'UPDATE beauty_specialists SET is_active=$2, updated_at=NOW() WHERE id=$1',
            [id, active]
        );
    },

    // =========================================================================
    // SERVICES  (firm card table: rex_{firm}_beauty_services)
    // =========================================================================
    async getServices(): Promise<BeautyService[]> {
        const { rows } = await postgres.query(
            'SELECT * FROM beauty_services WHERE is_active = true ORDER BY category, name'
        );
        return rows;
    },

    async createService(data: Partial<BeautyService>): Promise<string> {
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO beauty_services
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
        await postgres.query(
            `UPDATE beauty_services
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
        await postgres.query(
            'UPDATE beauty_services SET is_active=false, updated_at=NOW() WHERE id=$1', [id]
        );
    },

    // =========================================================================
    // APPOINTMENTS  (period movement table)
    // =========================================================================
    async getAppointments(date: string): Promise<BeautyAppointment[]> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
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
                s.name   AS service_name,
                s.color  AS service_color,
                sp.name  AS specialist_name,
                c.name   AS customer_name
            FROM ${table} a
            LEFT JOIN ${postgres.getCardTableName('beauty_services', 'beauty')}    s  ON a.service_id    = s.id
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            LEFT JOIN ${postgres.getCardTableName('customers')}                    c  ON a.client_id     = c.id
            WHERE a.appointment_date = $1
            ORDER BY a.appointment_time
        `;
        const result = await postgres.query(query, [date]);
        return result.rows;
    },

    async createAppointment(appointment: Partial<BeautyAppointment>): Promise<string> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const id = uuidv4();
        await postgres.query(`
            INSERT INTO ${table} (
                id, client_id, service_id, specialist_id, device_id, body_region_id,
                appointment_date, appointment_time, duration,
                status, type, notes, total_price, commission_amount, is_package_session
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [
            id,
            appointment.customer_id ?? appointment.client_id ?? null,
            appointment.service_id ?? null,
            appointment.staff_id ?? appointment.specialist_id ?? null,
            appointment.device_id ?? null,
            appointment.body_region_id ?? null,
            appointment.date ?? appointment.appointment_date ?? null,
            appointment.time ?? appointment.appointment_time ?? null,
            appointment.duration ?? 30,
            appointment.status ?? 'scheduled',
            appointment.type ?? 'regular',
            appointment.notes ?? null,
            appointment.total_price ?? 0,
            appointment.commission_amount ?? 0,
            appointment.is_package_session ?? false,
        ]);
        return id;
    },

    async updateAppointment(id: string, data: Partial<BeautyAppointment>): Promise<void> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        await postgres.query(
            `UPDATE ${table}
             SET client_id=$2, service_id=$3, specialist_id=$4, device_id=$5, body_region_id=$6,
                 appointment_date=$7, appointment_time=$8, duration=$9, status=$10,
                 notes=$11, total_price=$12, updated_at=NOW()
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
             data.total_price ?? 0]
        );
    },

    async updateAppointmentStatus(id: string, status: string): Promise<void> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        await postgres.query(
            `UPDATE ${table} SET status=$1, updated_at=NOW() WHERE id=$2`,
            [status, id]
        );
    },

    async getAppointmentsByCustomer(customerId: string): Promise<BeautyAppointment[]> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const { rows } = await postgres.query(`
            SELECT a.*, s.name AS service_name, sp.name AS specialist_name
            FROM ${table} a
            LEFT JOIN ${postgres.getCardTableName('beauty_services', 'beauty')} s ON a.service_id = s.id
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            WHERE a.client_id = $1
            ORDER BY a.appointment_date DESC LIMIT 20
        `, [customerId]);
        return rows;
    },

    // =========================================================================
    // DEVICES  (firm card table: rex_{firm}_beauty_devices)
    // =========================================================================
    async getDevices(): Promise<BeautyDevice[]> {
        const { rows } = await postgres.query(
            'SELECT * FROM beauty_devices WHERE is_active = true ORDER BY name'
        );
        return rows;
    },

    async createDevice(data: Partial<BeautyDevice>): Promise<string> {
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO beauty_devices
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
        await postgres.query(
            `UPDATE beauty_devices
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

        await postgres.query(
            'UPDATE beauty_devices SET total_shots = total_shots + $1, updated_at=NOW() WHERE id=$2',
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
        const { rows } = await postgres.query(
            `SELECT * FROM beauty_leads ORDER BY created_at DESC`
        );
        return rows;
    },

    async createLead(data: Partial<BeautyLead>): Promise<string> {
        const id = uuidv4();
        await postgres.query(
            `INSERT INTO beauty_leads
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
        await postgres.query(
            `UPDATE beauty_leads
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

    // =========================================================================
    // CUSTOMER FEEDBACK  (period movement table)
    // =========================================================================
    async addFeedback(feedback: Partial<BeautyCustomerFeedback>): Promise<void> {
        const table = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const id = uuidv4();
        await postgres.query(`
            INSERT INTO ${table}
                (id, appointment_id, customer_id, service_rating, staff_rating,
                 cleanliness_rating, overall_rating, comment, would_recommend)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [id, feedback.appointment_id ?? null, feedback.customer_id ?? null,
            feedback.service_rating ?? 5, feedback.staff_rating ?? 5,
            feedback.cleanliness_rating ?? 5, feedback.overall_rating ?? 5,
            feedback.comment ?? null, feedback.would_recommend ?? true]);
    },

    async getFeedbackForAppointment(appointmentId: string): Promise<BeautyCustomerFeedback | null> {
        const table = postgres.getMovementTableName('beauty_customer_feedback', 'beauty');
        const { rows } = await postgres.query(
            `SELECT * FROM ${table} WHERE appointment_id=$1 LIMIT 1`, [appointmentId]
        );
        return rows[0] ?? null;
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
        `, [id, invoiceNumber, sale.customer_id ?? null,
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
            `, [itemId, id, item.item_type ?? 'service', item.item_id ?? null,
                item.name, item.quantity ?? 1, item.unit_price ?? 0,
                item.discount ?? 0, item.total ?? 0,
                item.staff_id ?? null, item.commission_amount ?? 0]);
        }
        return id;
    },
};
