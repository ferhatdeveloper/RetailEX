import { postgres, ERP_SETTINGS } from './postgres';
import { supabase } from '../utils/supabase/client'; // Keeping for backward compatibility if needed, but methods will use postgres

export interface Warehouse {
    id: string;
    code: string;
    name: string;
    description?: string;
    address?: string;
    city?: string;
    phone?: string;
    manager_name?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export type CreateWarehouseInput = Omit<Warehouse, 'id' | 'created_at' | 'updated_at'>;
export type UpdateWarehouseInput = Partial<CreateWarehouseInput>;

class WarehouseAPI {
    // Note: 'warehouses' conceptual model maps to 'stores' table in local DB.
    // 'stores' table is in public schema, not firm-specific prefixed (based on postgres.ts rules).

    /**
     * Get all warehouses (filtered by firm if stores table supports firm_nr, which it does)
     */
    async getAll(): Promise<Warehouse[]> {
        try {
            const { rows } = await postgres.query<Warehouse>(
                `SELECT 
                    id, code, name, type as description, address, city, phone, manager_name, is_active, created_at, updated_at 
                 FROM stores 
                 WHERE firm_nr = $1 
                 ORDER BY created_at DESC`,
                [ERP_SETTINGS.firmNr]
            );
            return rows;
        } catch (error) {
            console.error('Error fetching warehouses:', error);
            return [];
        }
    }

    /**
     * Get active warehouses only
     */
    async getActive(): Promise<Warehouse[]> {
        try {
            const { rows } = await postgres.query<Warehouse>(
                `SELECT 
                    id, code, name, type as description, address, city, phone, manager_name, is_active, created_at, updated_at 
                 FROM stores 
                 WHERE firm_nr = $1 AND is_active = true 
                 ORDER BY name ASC`,
                [ERP_SETTINGS.firmNr]
            );
            return rows;
        } catch (error) {
            console.error('Error fetching active warehouses:', error);
            return [];
        }
    }

    /**
     * Get warehouse by ID
     */
    async getById(id: string): Promise<Warehouse | null> {
        try {
            const { rows } = await postgres.query<Warehouse>(
                `SELECT 
                    id, code, name, type as description, address, city, phone, manager_name, is_active, created_at, updated_at 
                 FROM stores 
                 WHERE id = $1`,
                [id]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching warehouse:', error);
            return null;
        }
    }

    /**
     * Get warehouse by code
     */
    async getByCode(code: string): Promise<Warehouse | null> {
        try {
            const { rows } = await postgres.query<Warehouse>(
                `SELECT 
                    id, code, name, type as description, address, city, phone, manager_name, is_active, created_at, updated_at 
                 FROM stores 
                 WHERE code = $1 AND firm_nr = $2`,
                [code, ERP_SETTINGS.firmNr]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching warehouse by code:', error);
            return null;
        }
    }

    /**
     * Create new warehouse
     */
    async create(warehouse: CreateWarehouseInput): Promise<Warehouse> {
        try {
            const { rows } = await postgres.query<Warehouse>(
                `INSERT INTO stores (
                    code, name, type, address, city, phone, manager_name, is_active, firm_nr
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                 RETURNING id, code, name, type as description, address, city, phone, manager_name, is_active, created_at, updated_at`,
                [
                    warehouse.code,
                    warehouse.name,
                    warehouse.description || 'Depo', // Map description to type or keep standard
                    warehouse.address,
                    warehouse.city,
                    warehouse.phone,
                    warehouse.manager_name,
                    warehouse.is_active ?? true,
                    ERP_SETTINGS.firmNr
                ]
            );
            return rows[0];
        } catch (error) {
            console.error('Error creating warehouse:', error);
            throw error;
        }
    }

    /**
     * Update warehouse
     */
    async update(id: string, updates: UpdateWarehouseInput): Promise<Warehouse> {
        try {
            const fields: string[] = [];
            const values: any[] = [];
            let i = 1;

            if (updates.code) { fields.push(`code = $${i++}`); values.push(updates.code); }
            if (updates.name) { fields.push(`name = $${i++}`); values.push(updates.name); }
            if (updates.description) { fields.push(`type = $${i++}`); values.push(updates.description); }
            if (updates.address) { fields.push(`address = $${i++}`); values.push(updates.address); }
            if (updates.city) { fields.push(`city = $${i++}`); values.push(updates.city); }
            if (updates.phone) { fields.push(`phone = $${i++}`); values.push(updates.phone); }
            if (updates.manager_name) { fields.push(`manager_name = $${i++}`); values.push(updates.manager_name); }
            if (updates.is_active !== undefined) { fields.push(`is_active = $${i++}`); values.push(updates.is_active); }

            if (fields.length === 0) {
                const w = await this.getById(id);
                if (!w) throw new Error("Warehouse not found");
                return w;
            }

            values.push(id);
            const { rows } = await postgres.query<Warehouse>(
                `UPDATE stores SET ${fields.join(', ')}, updated_at = NOW() 
                 WHERE id = $${i} 
                 RETURNING id, code, name, type as description, address, city, phone, manager_name, is_active, created_at, updated_at`,
                values
            );
            return rows[0];
        } catch (error) {
            console.error('Error updating warehouse:', error);
            throw error;
        }
    }

    /**
     * Delete warehouse
     */
    async delete(id: string): Promise<void> {
        try {
            await postgres.query(`DELETE FROM stores WHERE id = $1`, [id]);
        } catch (error) {
            console.error('Error deleting warehouse:', error);
            throw error;
        }
    }

    /**
     * Toggle warehouse active status
     */
    async toggleActive(id: string): Promise<Warehouse> {
        const warehouse = await this.getById(id);
        if (!warehouse) {
            throw new Error('Warehouse not found');
        }

        return this.update(id, { is_active: !warehouse.is_active });
    }

    /**
     * Search warehouses
     */
    async search(query: string): Promise<Warehouse[]> {
        try {
            const { rows } = await postgres.query<Warehouse>(
                `SELECT 
                    id, code, name, type as description, address, city, phone, manager_name, is_active, created_at, updated_at 
                 FROM stores 
                 WHERE firm_nr = $1 AND (
                    code ILIKE $2 OR name ILIKE $2 OR city ILIKE $2
                 )
                 ORDER BY name ASC`,
                [ERP_SETTINGS.firmNr, `%${query}%`]
            );
            return rows;
        } catch (error) {
            console.error('Error searching warehouses:', error);
            return [];
        }
    }
}

export const warehouseAPI = new WarehouseAPI();

