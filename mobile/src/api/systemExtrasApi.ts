import AsyncStorage from '@react-native-async-storage/async-storage';
import { pgQuery } from './pgClient';
import { newUuid } from './erpTables';

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

export type CallerIdMode = 'off' | 'virtual_pbx' | 'physical_device' | 'physical_serial';

export type CallerIdConfig = {
  mode: CallerIdMode;
  pollUrl: string;
  pollIntervalSec: number;
  deviceHint: string;
};

const CALLER_ID_KEY = 'retailex_mobile_caller_id_config';

const DEFAULT_CALLER: CallerIdConfig = {
  mode: 'off',
  pollUrl: '',
  pollIntervalSec: 3,
  deviceHint: '',
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

export async function loadCallerIdConfig(): Promise<CallerIdConfig> {
  try {
    const raw = await AsyncStorage.getItem(CALLER_ID_KEY);
    if (!raw) return { ...DEFAULT_CALLER };
    const parsed = JSON.parse(raw) as Partial<CallerIdConfig>;
    return {
      mode: parsed.mode ?? DEFAULT_CALLER.mode,
      pollUrl: parsed.pollUrl ?? '',
      pollIntervalSec: Math.max(1, Number(parsed.pollIntervalSec) || 3),
      deviceHint: parsed.deviceHint ?? '',
    };
  } catch {
    return { ...DEFAULT_CALLER };
  }
}

export async function saveCallerIdConfig(cfg: CallerIdConfig): Promise<void> {
  await AsyncStorage.setItem(
    CALLER_ID_KEY,
    JSON.stringify({
      mode: cfg.mode,
      pollUrl: cfg.pollUrl.trim(),
      pollIntervalSec: Math.max(1, Number(cfg.pollIntervalSec) || 3),
      deviceHint: cfg.deviceHint.trim(),
    }),
  );
}
