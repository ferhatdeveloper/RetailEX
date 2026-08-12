import { postgres, ERP_SETTINGS } from './postgres';
import { shouldUseTenantPostgrestApi } from '../config/postgrest.config';

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

function firmPadded(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').trim().padStart(3, '0').slice(0, 10);
}

/** Global şema (rex öneki yok) — PostgREST kök tablo */
const GLOBAL_DEFINITION_TABLES = new Set(['product_groups']);

/**
 * Tanım tabloları için PostgREST yolu.
 * - `stores`: public.stores (firm_nr ile kiracı)
 * - Diğer çoğu: CREATE_FIRM ile rex_{firma}_tablo
 */
function definitionPostgrestSpec(tableName: string): { path: string; listQuery: Record<string, string | number | undefined> } {
  const fn = firmPadded();
  if (GLOBAL_DEFINITION_TABLES.has(tableName)) {
    return { path: `/${tableName}`, listQuery: { order: 'name.asc' } };
  }
  if (tableName === 'stores') {
    return {
      path: '/stores',
      listQuery: { firm_nr: `eq.${fn}`, order: 'name.asc' },
    };
  }
  return {
    path: `/rex_${fn}_${tableName}`,
    listQuery: { order: 'name.asc' },
  };
}

async function postgrestList(tableName: string, activeOnly: boolean): Promise<DefinitionItem[]> {
  const { postgrest } = await import('./api/postgrestClient');
  const { path, listQuery } = definitionPostgrestSpec(tableName);
  const params: Record<string, string | number | undefined> = {
    select: '*',
    limit: 5000,
    ...listQuery,
  };
  if (activeOnly) {
    params.is_active = 'eq.true';
  }
  try {
    const rows = await postgrest.get<any[]>(path, params, { schema: 'public' });
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn(`[definitionAPI] PostgREST list ${tableName}:`, e);
    return [];
  }
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

class DefinitionAPI {
  /**
   * Get all items from a definition table
   */
  async getAll(tableName: string): Promise<DefinitionItem[]> {
    try {
      if (shouldUseTenantPostgrestApi()) {
        return postgrestList(tableName, false);
      }
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
      if (shouldUseTenantPostgrestApi()) {
        return postgrestList(tableName, true);
      }
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
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./api/postgrestClient');
        const { path } = definitionPostgrestSpec(tableName);
        const body: Record<string, unknown> = stripUndefined({ ...item });
        if (tableName === 'stores') {
          body.firm_nr = body.firm_nr ?? firmPadded();
        }
        const rows = await postgrest.post<any[]>(path, body, { schema: 'public', prefer: 'return=representation' });
        const row = Array.isArray(rows) ? rows[0] : rows;
        return (row as DefinitionItem) || null;
      }
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
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./api/postgrestClient');
        const { path } = definitionPostgrestSpec(tableName);
        const patchBody = stripUndefined({ ...updates });
        if (Object.keys(patchBody).length === 0) return null;
        const rows = await postgrest.patch<any[]>(
          `${path}?id=eq.${encodeURIComponent(id)}`,
          patchBody,
          { schema: 'public', prefer: 'return=representation' }
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return (row as DefinitionItem) || null;
      }
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
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./api/postgrestClient');
        const { path } = definitionPostgrestSpec(tableName);
        await postgrest.delete(`${path}?id=eq.${encodeURIComponent(id)}`, { schema: 'public' });
        return;
      }
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
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./api/postgrestClient');
        const { path } = definitionPostgrestSpec(tableName);
        await postgrest.patch(
          `${path}?id=eq.${encodeURIComponent(id)}`,
          { is_active: !currentStatus },
          { schema: 'public', prefer: 'return=minimal' }
        );
        return;
      }
      await postgres.query(`UPDATE ${tableName} SET is_active = $1 WHERE id = $2`, [!currentStatus, id]);
    } catch (error) {
      console.error(`Error toggling status in ${tableName}:`, error);
      throw error;
    }
  }
}

export const definitionAPI = new DefinitionAPI();
