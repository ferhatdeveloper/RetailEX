import { postgres, DB_SETTINGS, ERP_SETTINGS } from './postgres';

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
            if (DB_SETTINGS.connectionProvider === 'rest_api') {
                const { postgrest } = await import('./api/postgrestClient');
                const unitsetsTable = `/rex_${ERP_SETTINGS.firmNr}_unitsets`;
                const unitsetLinesTable = `/rex_${ERP_SETTINGS.firmNr}_unitsetl`;
                const sets = await postgrest.get<any[]>(
                    unitsetsTable,
                    { select: '*', order: 'name.asc' },
                    { schema: 'public' }
                );

                const setsWithLines = await Promise.all((Array.isArray(sets) ? sets : []).map(async (set: any) => {
                    const dbLines = await postgrest.get<any[]>(
                        unitsetLinesTable,
                        {
                            select: '*',
                            unitset_id: `eq.${set.id}`,
                            order: 'main_unit.desc,code.asc',
                        },
                        { schema: 'public' }
                    );
                    const lines = (Array.isArray(dbLines) ? dbLines : []).map((l: any) => ({
                        ...l,
                        conv_fact1: Number(l.multiplier1 || l.conv_fact1 || 1),
                        conv_fact2: Number(l.multiplier2 || l.conv_fact2 || 1)
                    }));
                    return { ...set, lines };
                }));

                return setsWithLines;
            }
            const { rows: sets } = await postgres.query('SELECT * FROM unitsets ORDER BY name ASC');

            const setsWithLines = await Promise.all(sets.map(async (set) => {
                const { rows: dbLines } = await postgres.query(
                    'SELECT * FROM unitsetl WHERE unitset_id = $1 ORDER BY main_unit DESC, code ASC',
                    [set.id]
                );
                
                const lines = dbLines.map((l: any) => ({
                    ...l,
                    conv_fact1: Number(l.multiplier1 || 1),
                    conv_fact2: Number(l.multiplier2 || 1)
                }));
                
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
                    'INSERT INTO unitsetl (unitset_id, item_code, code, name, main_unit, multiplier1, multiplier2, conv_fact1, conv_fact2) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                    [setId, line.code, line.code, line.name, line.main_unit, line.conv_fact1, line.conv_fact2, line.conv_fact1, line.conv_fact2]
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

