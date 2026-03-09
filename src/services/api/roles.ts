/**
 * Roles API - PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS } from '../postgres';

export interface Permission {
    id: string;
    name: string;
    description: string;
    category: 'pos' | 'management' | 'reports' | 'settings';
}

export interface Role {
    id: string;
    name: string;
    description: string;
    permissions: any[]; // Supports both legacy string arrays and new structured JSON
    userCount: number;
    color: string;
    is_system_role?: boolean;
}

export const roleAPI = {
    /**
     * Get all roles
     */
    async getAll(): Promise<Role[]> {
        try {
            const { rows } = await postgres.query(`
        SELECT r.*, 
        (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) as user_count
        FROM roles r
        ORDER BY r.name ASC
      `);

            return rows.map(r => {
                let perms = r.permissions;
                if (typeof perms === 'string') {
                    try { perms = JSON.parse(perms); } catch (e) { perms = []; }
                }
                if (!Array.isArray(perms)) perms = [];

                return {
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    permissions: perms,
                    userCount: parseInt(r.user_count) || 0,
                    color: r.color || '#3B82F6',
                    is_system_role: r.is_system_role
                };
            });
        } catch (error) {
            console.error('[RoleAPI] getAll failed:', error);
            return [];
        }
    },

    /**
     * Create new role
     */
    async create(role: Omit<Role, 'id' | 'userCount'>): Promise<Role | null> {
        try {
            const { rows } = await postgres.query(
                `INSERT INTO roles (name, description, permissions, color) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
                [role.name, role.description, JSON.stringify(role.permissions), role.color]
            );
            return rows[0];
        } catch (error) {
            console.error('[RoleAPI] create failed:', error);
            throw error;
        }
    },

    /**
     * Update role
     */
    async update(id: string, updates: Partial<Role>): Promise<Role | null> {
        try {
            const fields: string[] = [];
            const values: any[] = [];
            let i = 1;

            if (updates.name) { fields.push(`name = $${i++}`); values.push(updates.name); }
            if (updates.description) { fields.push(`description = $${i++}`); values.push(updates.description); }
            if (updates.permissions) { fields.push(`permissions = $${i++}`); values.push(JSON.stringify(updates.permissions)); }
            if (updates.color) { fields.push(`color = $${i++}`); values.push(updates.color); }

            if (fields.length === 0) return null;

            values.push(id);
            const { rows } = await postgres.query(
                `UPDATE roles SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
                values
            );
            return rows[0];
        } catch (error) {
            console.error('[RoleAPI] update failed:', error);
            throw error;
        }
    },

    /**
     * Delete role
     */
    async delete(id: string): Promise<boolean> {
        try {
            const { rowCount } = await postgres.query(
                `DELETE FROM roles WHERE id = $1 AND is_system_role = false`,
                [id]
            );
            return rowCount > 0;
        } catch (error) {
            console.error('[RoleAPI] delete failed:', error);
            return false;
        }
    }
};
