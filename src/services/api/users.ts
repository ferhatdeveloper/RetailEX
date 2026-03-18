/**
 * User API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS } from '../postgres';

/** Kullanıcının görebileceği (firma, dönem) çifti */
export interface UserAllowedPeriod {
    firm_nr: string;
    period_nr: number;
}

export interface User {
    id: string;
    username: string;
    email?: string;
    full_name: string;
    role: string; // Legacy role name
    role_id?: string;
    role_name?: string; // From join
    store_id?: string;
    store_name?: string; // From join
    phone?: string;
    is_active: boolean;
    last_login_at?: string;
    created_at: string;
    updated_at: string;
    /** Kullanıcının erişebileceği firma numaraları. Boş = sadece firm_nr */
    allowed_firm_nrs?: string[];
    /** Görebileceği (firm_nr, period_nr) çiftleri. Boş = seçili firmalarda tüm dönemler */
    allowed_periods?: UserAllowedPeriod[];
    /** Görebileceği mağaza/depo (stores) id listesi. Boş = tümü */
    allowed_store_ids?: string[];
}

export const userAPI = {
    /**
     * Get all users
     */
    async getAll(): Promise<User[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT u.*, s.name as store_name, r.name as role_name
         FROM users u 
         LEFT JOIN stores s ON u.store_id = s.id 
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.firm_nr = $1
         ORDER BY u.username ASC`,
                [ERP_SETTINGS.firmNr]
            );
            return (rows || []).map((r: any) => this.mapRow(r));
        } catch (error) {
            console.error('[UserAPI] getAll failed:', error);
            return [];
        }
    },

    /**
     * Get user by ID
     */
    async getById(id: string): Promise<User | null> {
        try {
            const { rows } = await postgres.query(
                `SELECT u.*, s.name as store_name, r.name as role_name
         FROM users u 
         LEFT JOIN stores s ON u.store_id = s.id 
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1 AND u.firm_nr = $2`,
                [id, ERP_SETTINGS.firmNr]
            );
            return rows[0] ? this.mapRow(rows[0]) : null;
        } catch (error) {
            console.error('[UserAPI] getById failed:', error);
            return null;
        }
    },

    /**
     * Create new user
     */
    async create(user: any): Promise<User | null> {
        try {
            const firmNr = (Array.isArray(user.allowed_firm_nrs) && user.allowed_firm_nrs.length > 0)
                ? user.allowed_firm_nrs[0]
                : ERP_SETTINGS.firmNr;
            const allowedFirmNrs = Array.isArray(user.allowed_firm_nrs) ? JSON.stringify(user.allowed_firm_nrs) : '[]';
            const allowedPeriods = Array.isArray(user.allowed_periods) ? JSON.stringify(user.allowed_periods) : '[]';
            const allowedStoreIds = Array.isArray(user.allowed_store_ids) ? JSON.stringify(user.allowed_store_ids) : '[]';
            const { rows } = await postgres.query(
                `INSERT INTO users (username, password_hash, full_name, role, role_id, store_id, phone, email, is_active, firm_nr, allowed_firm_nrs, allowed_periods, allowed_store_ids) 
         VALUES ($1, crypt($2, gen_salt('bf')), $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb) RETURNING *`,
                [
                    user.username,
                    user.password,
                    user.full_name,
                    user.role || 'cashier',
                    user.role_id || null,
                    user.store_id || null,
                    user.phone || '',
                    user.email || '',
                    true,
                    firmNr,
                    allowedFirmNrs,
                    allowedPeriods,
                    allowedStoreIds
                ]
            );
            return this.mapRow(rows[0]);
        } catch (error) {
            console.error('[UserAPI] create failed:', error);
            throw error;
        }
    },

    mapRow(r: any): User | null {
        if (!r) return null;
        const allowedFirmNrs = r.allowed_firm_nrs != null ? (typeof r.allowed_firm_nrs === 'string' ? JSON.parse(r.allowed_firm_nrs || '[]') : r.allowed_firm_nrs) : [];
        const allowedPeriods = r.allowed_periods != null ? (typeof r.allowed_periods === 'string' ? JSON.parse(r.allowed_periods || '[]') : r.allowed_periods) : [];
        const allowedStoreIds = r.allowed_store_ids != null ? (typeof r.allowed_store_ids === 'string' ? JSON.parse(r.allowed_store_ids || '[]') : r.allowed_store_ids) : [];
        return { ...r, allowed_firm_nrs: allowedFirmNrs, allowed_periods: allowedPeriods, allowed_store_ids: allowedStoreIds };
    },

    /**
     * Update user
     */
    async update(id: string, updates: any): Promise<User | null> {
        try {
            const fields: string[] = [];
            const values: any[] = [];
            let i = 1;
            const uuidKeys = ['store_id', 'role_id'];

            const jsonbKeys = ['allowed_firm_nrs', 'allowed_periods', 'allowed_store_ids'];
            Object.entries(updates).forEach(([key, value]) => {
                if (key !== 'id' && key !== 'password' && key !== 'role_name' && key !== 'store_name' && value !== undefined) {
                    if (jsonbKeys.includes(key)) {
                        fields.push(`${key} = $${i++}::jsonb`);
                        values.push(JSON.stringify(Array.isArray(value) ? value : value));
                    } else {
                        const normalized = (uuidKeys.includes(key) && (value === '' || value == null)) ? null : value;
                        fields.push(`${key} = $${i++}`);
                        values.push(normalized);
                    }
                }
            });

            // Special handling for password
            if (updates.password) {
                fields.push(`password_hash = crypt($${i++}, gen_salt('bf'))`);
                values.push(updates.password);
            }

            if (fields.length === 0) return this.getById(id);

            values.push(id);
            values.push(ERP_SETTINGS.firmNr);
            const { rows } = await postgres.query(
                `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} AND firm_nr = $${i + 1} RETURNING *`,
                values
            );

            return rows[0] ? this.mapRow(rows[0]) : null;
        } catch (error) {
            console.error('[UserAPI] update failed:', error);
            throw error;
        }
    },

    /**
     * Delete user (soft delete)
     */
    async delete(id: string): Promise<boolean> {
        try {
            const { rowCount } = await postgres.query(
                `UPDATE users SET is_active = false WHERE id = $1 AND firm_nr = $2`,
                [id, ERP_SETTINGS.firmNr]
            );
            return rowCount > 0;
        } catch (error) {
            console.error('[UserAPI] delete failed:', error);
            return false;
        }
    }
};

