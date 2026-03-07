import { postgres } from './postgres';

export interface UnitSetLine {
    id?: string;
    unitset_id?: string;
    code: string;
    name: string;
    main_unit: boolean;
    conv_fact1: number;
    conv_fact2: number;
}

export interface UnitSet {
    id: string;
    code: string;
    name: string;
    is_active: boolean;
    lines?: UnitSetLine[];
}

class UnitSetAPI {
    /**
     * Get all unit sets with their lines
     */
    async getAll(): Promise<UnitSet[]> {
        try {
            const { rows: sets } = await postgres.query('SELECT * FROM unitsets ORDER BY name ASC');

            const setsWithLines = await Promise.all(sets.map(async (set) => {
                const { rows: lines } = await postgres.query(
                    'SELECT * FROM unitsetl WHERE unitset_id = $1 ORDER BY main_unit DESC, code ASC',
                    [set.id]
                );
                return { ...set, lines };
            }));

            return setsWithLines;
        } catch (error) {
            console.error('Error fetching unit sets:', error);
            return [];
        }
    }

    /**
     * Save/Update unit set and its lines
     */
    async save(set: Partial<UnitSet>, lines: UnitSetLine[]): Promise<UnitSet | null> {
        try {
            let setId = set.id;
            let savedSet: UnitSet;

            if (setId) {
                // Update master
                const { rows } = await postgres.query(
                    'UPDATE unitsets SET code = $1, name = $2, is_active = $3 WHERE id = $4 RETURNING *',
                    [set.code, set.name, set.is_active, setId]
                );
                savedSet = rows[0];
            } else {
                // Insert master
                const { rows } = await postgres.query(
                    'INSERT INTO unitsets (code, name, is_active) VALUES ($1, $2, $3) RETURNING *',
                    [set.code, set.name, set.is_active ?? true]
                );
                savedSet = rows[0];
                setId = savedSet.id;
            }

            // Sync lines (delete all and re-insert for simplicity/consistency)
            await postgres.query('DELETE FROM unitsetl WHERE unitset_id = $1', [setId]);

            for (const line of lines) {
                await postgres.query(
                    'INSERT INTO unitsetl (unitset_id, code, name, main_unit, conv_fact1, conv_fact2) VALUES ($1, $2, $3, $4, $5, $6)',
                    [setId, line.code, line.name, line.main_unit, line.conv_fact1, line.conv_fact2]
                );
            }

            return { ...savedSet, lines };
        } catch (error) {
            console.error('Error saving unit set:', error);
            throw error;
        }
    }

    /**
     * Delete unit set
     */
    async delete(id: string): Promise<void> {
        try {
            // unitsetl records should be deleted via foreign key CASCADE if configured, 
            // but we'll do it manually just in case
            await postgres.query('DELETE FROM unitsetl WHERE unitset_id = $1', [id]);
            await postgres.query('DELETE FROM unitsets WHERE id = $1', [id]);
        } catch (error) {
            console.error('Error deleting unit set:', error);
            throw error;
        }
    }
}

export const unitSetAPI = new UnitSetAPI();

