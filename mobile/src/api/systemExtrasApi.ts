import { pgQuery } from './pgClient';
import { newUuid } from './erpTables';

export type {
  CallerIdConfig,
  CallerIdMode,
} from './callerIdApi';
export {
  loadCallerIdConfig,
  saveCallerIdConfig,
  DEFAULT_CALLER_ID_CONFIG,
} from './callerIdApi';

export type BarcodeTemplateRow = {
  id: string;
  name: string;
  prefix: string | null;
  current_value: number;
  length: number;
  is_active: boolean;
};

export type BarcodeTemplateInput = {
  name: string;
  prefix?: string;
  currentValue?: number;
  length?: number;
};

async function tryQueries<T>(queries: { sql: string; params?: unknown[] }[]): Promise<T[]> {
  for (const q of queries) {
    try {
      const res = await pgQuery<T>(q.sql, q.params ?? []);
      return res.rows;
    } catch {
      /* next */
    }
  }
  return [];
}

export async function fetchBarcodeTemplates(limit = 50): Promise<BarcodeTemplateRow[]> {
  return tryQueries<BarcodeTemplateRow>([
    {
      sql: `SELECT id::text AS id, name, prefix,
                   COALESCE(current_value, 0)::float8 AS current_value,
                   COALESCE(length, 13)::int AS length,
                   COALESCE(is_active, true) AS is_active
            FROM public.barcode_templates
            ORDER BY created_at ASC NULLS LAST, name ASC
            LIMIT $1`,
      params: [limit],
    },
    {
      sql: `SELECT id::text AS id, name, prefix,
                   COALESCE(current_value, 0)::float8 AS current_value,
                   COALESCE(length, 13)::int AS length,
                   COALESCE(is_active, true) AS is_active
            FROM barcode_templates
            ORDER BY name ASC
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function createBarcodeTemplate(input: BarcodeTemplateInput): Promise<string> {
  const id = newUuid();
  const name = input.name.trim() || 'Yeni şablon';
  const prefix = input.prefix?.trim() || '869';
  const current = Math.max(0, Math.floor(Number(input.currentValue) || 1000000));
  const length = Math.max(8, Math.min(20, Math.floor(Number(input.length) || 13)));
  await pgQuery(
    `INSERT INTO public.barcode_templates (id, name, prefix, current_value, length, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [id, name, prefix, current, length],
  );
  return id;
}
