import { v4 as uuidv4 } from 'uuid';
import { postgres } from './postgres';
import {
    BeautyAppointment,
    BeautyService,
    BeautySpecialist,
    BeautyDevice,
    BeautyPackage,
    BeautyPackagePurchase
} from '../types/beauty';

export const beautyService = {
    // -------------------------------------------------------------------------
    // Specialists  (firm card table: rex_{firm}_beauty_specialists)
    // Columns from 002_logic.sql: id, name, specialty, avatar, is_active
    // -------------------------------------------------------------------------
    async getSpecialists(): Promise<BeautySpecialist[]> {
        const { rows } = await postgres.query(
            'SELECT * FROM beauty_specialists WHERE is_active = true ORDER BY name'
        );
        return rows;
    },

    // -------------------------------------------------------------------------
    // Services  (firm card table: rex_{firm}_beauty_services)
    // Columns from 002_logic.sql: id, name, duration, price, category, color, is_active
    // -------------------------------------------------------------------------
    async getServices(): Promise<BeautyService[]> {
        const { rows } = await postgres.query(
            'SELECT * FROM beauty_services WHERE is_active = true ORDER BY category, name'
        );
        return rows;
    },

    // -------------------------------------------------------------------------
    // Appointments  (period movement table: rex_{firm}_{period}_beauty_appointments)
    // Columns from 002_logic.sql:
    //   id, client_id, service_id, specialist_id,
    //   appointment_date, appointment_time, duration,
    //   status, type, notes, total_price, is_package_session
    // We alias back to camelCase-friendly names for the front-end types.
    // -------------------------------------------------------------------------
    async getAppointments(date: string): Promise<BeautyAppointment[]> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const query = `
            SELECT
                a.id,
                a.client_id        AS customer_id,
                a.service_id,
                a.specialist_id    AS staff_id,
                a.appointment_date AS date,
                a.appointment_time AS time,
                a.duration,
                a.status,
                a.type,
                a.notes,
                a.total_price,
                a.is_package_session,
                s.name   AS service_name,
                s.color  AS service_color,
                sp.name  AS staff_name,
                c.name   AS customer_name
            FROM ${table} a
            LEFT JOIN ${postgres.getCardTableName('beauty_services', 'beauty')}   s  ON a.service_id   = s.id
            LEFT JOIN ${postgres.getCardTableName('beauty_specialists', 'beauty')} sp ON a.specialist_id = sp.id
            LEFT JOIN ${postgres.getCardTableName('customers')}                    c  ON a.client_id     = c.id
            WHERE a.appointment_date = $1
            ORDER BY a.appointment_time
        `;
        const result = await postgres.query(query, [date]);
        return result.rows;
    },

    async createAppointment(appointment: Omit<BeautyAppointment, 'id'>): Promise<string> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        const id = uuidv4();
        const query = `
            INSERT INTO ${table} (
                id, client_id, service_id, specialist_id,
                appointment_date, appointment_time, duration,
                status, notes, total_price, is_package_session
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        await postgres.query(query, [
            id,
            appointment.customer_id,   // maps to client_id
            appointment.service_id,
            appointment.staff_id,      // maps to specialist_id
            appointment.date,          // maps to appointment_date
            appointment.time,          // maps to appointment_time
            appointment.duration,
            appointment.status,
            appointment.notes,
            appointment.total_price,
            appointment.is_package_session
        ]);
        return id;
    },

    async updateAppointmentStatus(id: string, status: string): Promise<void> {
        const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
        await postgres.query(
            `UPDATE ${table} SET status = $1, updated_at = NOW() WHERE id = $2`,
            [status, id]
        );
    },

    // -------------------------------------------------------------------------
    // Devices  (firm card table: rex_{firm}_beauty_devices — from 054 migration)
    // -------------------------------------------------------------------------
    async getDevices(): Promise<BeautyDevice[]> {
        const { rows } = await postgres.query(
            'SELECT * FROM beauty_devices ORDER BY name'
        );
        return rows;
    },

    async recordDeviceUsage(usage: {
        device_id: string;
        appointment_id: string;
        shots_fired: number;
        body_region: string;
    }): Promise<void> {
        const usageTable = postgres.getMovementTableName('beauty_device_usage', 'beauty');
        await postgres.query(`
            INSERT INTO ${usageTable}
                (device_id, session_id, shots_used, notes, usage_date)
            VALUES ($1, $2, $3, $4, CURRENT_DATE)
        `, [usage.device_id, usage.appointment_id, usage.shots_fired, usage.body_region]);

        await postgres.query(
            'UPDATE beauty_devices SET total_shots = total_shots + $1 WHERE id = $2',
            [usage.shots_fired, usage.device_id]
        );
    },

    // -------------------------------------------------------------------------
    // Packages  (firm card table: rex_{firm}_beauty_packages)
    // -------------------------------------------------------------------------
    async getPackages(): Promise<BeautyPackage[]> {
        const { rows } = await postgres.query(
            'SELECT * FROM beauty_packages WHERE is_active = true'
        );
        return rows;
    },

    async purchasePackage(purchase: Partial<BeautyPackagePurchase>): Promise<void> {
        const saleTable = postgres.getMovementTableName('beauty_package_sales', 'beauty');
        await postgres.query(`
            INSERT INTO ${saleTable}
                (customer_id, package_id, total_sessions, sale_price, sale_date, expiry_date, status)
            VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, 'active')
        `, [
            purchase.customer_id,
            purchase.package_id,
            purchase.total_sessions,
            purchase.sale_price ?? 0,
            purchase.expiry_date
        ]);
    }
};


