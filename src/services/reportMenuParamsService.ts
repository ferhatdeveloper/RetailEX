/**
 * Menü görünürlük parametreleri: güzellik/anket raporları + sanal santral + fiyat değişimi
 * + ürün listesi satış/alış dip toplamları + günlük rapor tedarikçi ödemeleri.
 * Kaynak: PostgreSQL `system_settings.report_menu_params` ↔ localStorage önbellek.
 * Varsayılan: çoğu menü/özellik kapalı; `daily-report-supplier-payments` varsayılan açık.
 */
import { postgres, DB_SETTINGS } from './postgres';

/** Menüde / özellikte parametre ile aç/kapa edilen ekran / rapor sekmeleri */
export const REPORT_MENU_PARAM_KEYS = [
  'beauty-overdue-uncalled-report',
  'beauty-survey-report',
  'beauty-survey-trend-report',
  'beauty-survey-staff-report',
  'beauty-survey-service-report',
  'beauty-survey-nps-report',
  'beauty-survey-comments-report',
  'virtual-pbx-caller-id',
  'stock-price-change-slips',
  /** Malzeme listesi Satış/Alış Toplam dip satırı (varsayılan kapalı) */
  'product-list-sales-purchase-totals',
  /** Günlük rapor — tedarikçiye ödenen (CH_ODEME) tutarlar (varsayılan açık) */
  'daily-report-supplier-payments',
] as const;

export type ReportMenuParamKey = (typeof REPORT_MENU_PARAM_KEYS)[number];

export type ReportMenuParams = Record<ReportMenuParamKey, boolean>;

const LS_KEY = 'retailex_report_menu_params';

const DEFAULT_PARAMS: ReportMenuParams = {
  'beauty-overdue-uncalled-report': false,
  'beauty-survey-report': false,
  'beauty-survey-trend-report': false,
  'beauty-survey-staff-report': false,
  'beauty-survey-service-report': false,
  'beauty-survey-nps-report': false,
  'beauty-survey-comments-report': false,
  'virtual-pbx-caller-id': false,
  'stock-price-change-slips': false,
  'product-list-sales-purchase-totals': false,
  'daily-report-supplier-payments': true,
};

type Listener = (params: ReportMenuParams) => void;
const listeners = new Set<Listener>();
let runtimeParams: ReportMenuParams | null = null;

function isRestApi(): boolean {
  return DB_SETTINGS.connectionProvider === 'rest_api';
}

export function defaultReportMenuParams(): ReportMenuParams {
  return { ...DEFAULT_PARAMS };
}

export function normalizeReportMenuParams(raw: unknown): ReportMenuParams {
  const base = defaultReportMenuParams();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  for (const key of REPORT_MENU_PARAM_KEYS) {
    if (typeof o[key] === 'boolean') base[key] = o[key];
  }
  return base;
}

export function isReportMenuParamKey(key: string): key is ReportMenuParamKey {
  return (REPORT_MENU_PARAM_KEYS as readonly string[]).includes(key);
}

/** Parametre kapalıysa menüden gizlenmeli (rapor sekmesi veya yönetim ekranı) */
export function isReportTabHiddenByParams(tabKey: string, params?: ReportMenuParams): boolean {
  if (!isReportMenuParamKey(tabKey)) return false;
  const p = params ?? getRuntimeReportMenuParams();
  return p[tabKey] !== true;
}

/** Alias — yönetim / stok menü öğeleri için */
export const isMenuItemHiddenByParams = isReportTabHiddenByParams;

/** Parametre açık mı? — menü dışı özellik bayrakları için (DEFAULT_PARAMS'a bakın) */
export function isReportMenuParamEnabled(
  key: ReportMenuParamKey,
  params?: ReportMenuParams,
): boolean {
  const p = params ?? getRuntimeReportMenuParams();
  return p[key] === true;
}

function notify(params: ReportMenuParams): void {
  listeners.forEach((fn) => {
    try {
      fn(params);
    } catch {
      /* ignore */
    }
  });
}

export function getRuntimeReportMenuParams(): ReportMenuParams {
  if (runtimeParams) return { ...runtimeParams };
  return readReportMenuParamsFromLocalStorage();
}

export function setRuntimeReportMenuParams(params: ReportMenuParams): void {
  runtimeParams = normalizeReportMenuParams(params);
  writeReportMenuParamsToLocalStorage(runtimeParams);
  notify(runtimeParams);
}

export function subscribeReportMenuParams(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readReportMenuParamsFromLocalStorage(): ReportMenuParams {
  if (typeof localStorage === 'undefined') return defaultReportMenuParams();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultReportMenuParams();
    return normalizeReportMenuParams(JSON.parse(raw));
  } catch {
    return defaultReportMenuParams();
  }
}

export function writeReportMenuParamsToLocalStorage(params: ReportMenuParams): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(normalizeReportMenuParams(params)));
  } catch {
    /* ignore quota */
  }
}

async function readFromDb(): Promise<unknown | null> {
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    try {
      const rows = await postgrest.get<{ report_menu_params?: unknown }[]>(
        '/system_settings',
        { select: 'report_menu_params', id: 'eq.1', limit: 1 },
        { schema: 'public' },
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      return row?.report_menu_params ?? null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('report_menu_params') || msg.includes('42703') || msg.includes('does not exist')) {
        return null;
      }
      throw e;
    }
  }
  try {
    const { rows } = await postgres.query(
      `SELECT report_menu_params FROM public.system_settings WHERE id = 1 LIMIT 1`,
      [],
    );
    const raw = rows[0]?.report_menu_params;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('report_menu_params') || msg.includes('42703') || msg.includes('does not exist')) {
      return null;
    }
    throw e;
  }
}

async function writeToDb(params: ReportMenuParams): Promise<void> {
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const existing = await postgrest.get<{ id?: number }[]>(
      '/system_settings',
      { select: 'id', id: 'eq.1', limit: 1 },
      { schema: 'public' },
    );
    const patchBody = { report_menu_params: params };
    try {
      if (Array.isArray(existing) && existing[0]) {
        await postgrest.patch('/system_settings?id=eq.1', patchBody, {
          schema: 'public',
          prefer: 'return=minimal',
        });
      } else {
        await postgrest.post(
          '/system_settings',
          { id: 1, report_menu_params: params },
          { schema: 'public', prefer: 'return=minimal' },
        );
      }
      return;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('report_menu_params') || msg.includes('42703') || msg.includes('does not exist')) {
        console.warn('[reportMenuParams] Kolon yok; yalnızca localStorage yazıldı. Migration 153 çalıştırın.');
        return;
      }
      throw e;
    }
  }
  try {
    await postgres.query(
      `INSERT INTO public.system_settings (id, default_currency, report_menu_params)
       VALUES (1, 'IQD', $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         report_menu_params = EXCLUDED.report_menu_params,
         updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(params)],
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('report_menu_params') || msg.includes('42703') || msg.includes('does not exist')) {
      console.warn('[reportMenuParams] Kolon yok; yalnızca localStorage yazıldı. Migration 153 çalıştırın.');
      return;
    }
    throw e;
  }
}

/** PG → localStorage → runtime; kolon yoksa varsayılan (hepsi kapalı). */
export async function loadReportMenuParams(): Promise<ReportMenuParams> {
  try {
    const raw = await readFromDb();
    if (raw != null) {
      const params = normalizeReportMenuParams(raw);
      setRuntimeReportMenuParams(params);
      return params;
    }
  } catch (e) {
    console.warn('[reportMenuParams] loadFromDb failed; localStorage kullanılıyor', e);
  }
  const local = readReportMenuParamsFromLocalStorage();
  runtimeParams = local;
  notify(local);
  return local;
}

export async function saveReportMenuParams(params: ReportMenuParams): Promise<ReportMenuParams> {
  const normalized = normalizeReportMenuParams(params);
  setRuntimeReportMenuParams(normalized);
  await writeToDb(normalized);
  return normalized;
}
