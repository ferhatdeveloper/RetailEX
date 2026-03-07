import { postgres } from './postgres';

export interface DefinitionItem {
    id: string;
    code: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
    [key: string]: any;
}

export type CreateDefinitionInput = Omit<DefinitionItem, 'id' | 'created_at' | 'updated_at'>;
export type UpdateDefinitionInput = Partial<CreateDefinitionInput>;

class DefinitionAPI {
    /**
     * Get all items from a definition table
     */
    async getAll(tableName: string): Promise<DefinitionItem[]> {
        try {
            const { rows } = await postgres.query(`SELECT * FROM ${tableName} ORDER BY name ASC`);
            return rows;
        } catch (error) {
            console.error(`Error fetching ${tableName}:`, error);
            return [];
        }
    }

    /**
     * Get active items only
     */
    async getActive(tableName: string): Promise<DefinitionItem[]> {
        try {
            const { rows } = await postgres.query(`SELECT * FROM ${tableName} WHERE is_active = true ORDER BY name ASC`);
            return rows;
        } catch (error) {
            console.error(`Error fetching active ${tableName}:`, error);
            return [];
        }
    }

    /**
     * Create new item
     */
    async create(tableName: string, item: CreateDefinitionInput): Promise<DefinitionItem | null> {
        try {
            const keys = Object.keys(item);
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const values = Object.values(item);

            const { rows } = await postgres.query(
                `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
                values
            );

            return rows[0] || null;
        } catch (error) {
            console.error(`Error creating in ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Update item
     */
    async update(tableName: string, id: string, updates: UpdateDefinitionInput): Promise<DefinitionItem | null> {
        try {
            const keys = Object.keys(updates);
            if (keys.length === 0) return null;

            const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
            const values = [...Object.values(updates), id];

            const { rows } = await postgres.query(
                `UPDATE ${tableName} SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
                values
            );

            return rows[0] || null;
        } catch (error) {
            console.error(`Error updating in ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Delete item
     */
    async delete(tableName: string, id: string): Promise<void> {
        try {
            await postgres.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
        } catch (error) {
            console.error(`Error deleting from ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Toggle active status
     */
    async toggleActive(tableName: string, id: string, currentStatus: boolean): Promise<void> {
        try {
            await postgres.query(`UPDATE ${tableName} SET is_active = $1 WHERE id = $2`, [!currentStatus, id]);
        } catch (error) {
            console.error(`Error toggling status in ${tableName}:`, error);
            throw error;
        }
    }
}

export const definitionAPI = new DefinitionAPI();



