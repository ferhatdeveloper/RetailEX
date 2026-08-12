import { PostgresConnection } from './postgres';
import {
    BeautyAppointment,
    Specialist,
    Service,
    Client
} from '../components/beauty/types';

export class BeautyService {
    private static connection = PostgresConnection.getInstance();

    /**
     * Get all beauty specialists
     */
    static async getSpecialists() {
        const { rows } = await this.connection.query('SELECT * FROM beauty_specialists WHERE is_active = true');
        return rows as Specialist[];
    }

    /**
     * Get all beauty services
     */
    static async getServices() {
        const { rows } = await this.connection.query('SELECT * FROM beauty_services WHERE is_active = true');
        return rows as Service[];
    }

    /**
     * Get active appointments for a date
     */
    static async getAppointments(date: string) {
        const sql = `
            SELECT * FROM beauty_appointments 
            WHERE appointment_date = $1 
            ORDER BY appointment_time
        `;
        const { rows } = await this.connection.query(sql, [date]);
        return rows as BeautyAppointment[];
    }

    /**
     * Save or update an appointment
     */
    static async saveAppointment(apt: Omit<BeautyAppointment, 'id'> & { id?: string }) {
        if (apt.id) {
            const sql = `
                UPDATE beauty_appointments 
                SET status = $2, notes = $3, total_price = $4, is_package_session = $5
                WHERE id = $1
            `;
            await this.connection.query(sql, [apt.id, apt.status, apt.notes, apt.totalPrice, apt.isPackageSession]);
            return apt.id;
        } else {
            const sql = `
                INSERT INTO beauty_appointments (
                    client_id, service_id, specialist_id, appointment_date, 
                    appointment_time, duration, status, type, notes, total_price, is_package_session
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id
            `;
            const { rows } = await this.connection.query(sql, [
                apt.clientId, apt.serviceId, apt.specialistId,
                apt.date, apt.time, apt.duration, apt.status,
                apt.type, apt.notes, apt.totalPrice, apt.isPackageSession
            ]);
            return rows[0].id;
        }
    }

    /**
     * Update specialist data
     */
    static async saveSpecialist(specialist: Omit<Specialist, 'id'> & { id?: string }) {
        if (specialist.id) {
            const sql = 'UPDATE beauty_specialists SET name = $2, specialty = $3, avatar = $4 WHERE id = $1';
            await this.connection.query(sql, [specialist.id, specialist.name, specialist.specialty, specialist.avatar]);
        } else {
            const sql = 'INSERT INTO beauty_specialists (name, specialty, avatar) VALUES ($1, $2, $3)';
            await this.connection.query(sql, [specialist.name, specialist.specialty, specialist.avatar]);
        }
    }
}


