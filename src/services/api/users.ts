/**
 * User API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS } from '../postgres';

export interface User {
    id: string;
    username: string;
    email?: string;
    full_name: string;
    role: string;
    store_id?: string;
    phone?: string;
    is_active: boolean;
    last_login_at?: string;
    created_at: string;
    updated_at: string;
}

export const userAPI = {
    /**
     * Get all users
     */
    async getAll(): Promise<User[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT u.*, s.name as store_name 
         FROM users u 
         LEFT JOIN stores s ON u.store_id = s.id 
         WHERE u.firm_nr = $1 AND u.is_active = true 
         ORDER BY u.username ASC`,
                [ERP_SETTINGS.firmNr]
            );
            return rows;
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
                `SELECT u.*, s.name as store_name 
         FROM users u 
         LEFT JOIN stores s ON u.store_id = s.id 
         WHERE u.id = $1 AND u.firm_nr = $2`,
                [id, ERP_SETTINGS.firmNr]
            );
            return rows[0] || null;
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
            const { rows } = await postgres.query(
                `INSERT INTO users (username, password_hash, full_name, role, store_id, phone, email, is_active, firm_nr) 
         VALUES ($1, crypt($2, gen_salt('bf')), $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                [
                    user.username,
                    user.password,
                    user.full_name,
                    user.role,
                    user.store_id || null,
                    user.phone || '',
                    user.email || '',
                    true,
                    ERP_SETTINGS.firmNr
                ]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('[UserAPI] create failed:', error);
            throw error;
        }
    },

    /**
     * Update user
     */
    async update(id: string, updates: any): Promise<User | null> {
        try {
            const fields: string[] = [];
            const values: any[] = [];
            let i = 1;

            Object.entries(updates).forEach(([key, value]) => {
                if (key !== 'id' && key !== 'password' && value !== undefined) {
                    fields.push(`${key} = $${i++}`);
                    values.push(value);
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
                `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} AND firm_nr = $${i + 1} RETURNING *`,
                values
            );

            return rows[0] || null;
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

