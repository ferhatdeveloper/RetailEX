/**
 * Logo MSSQL periyodik senkron — masaüstü (Tauri).
 * Ayarlar Entegrasyonlar panelinden; bağlantı config.db / kurulum ERP alanlarından okunur.
 */

import { IS_TAURI, safeInvoke } from '../utils/env';
import { ERP_SETTINGS } from './postgres';
import { loadLogoErpMode } from './logoErpMode';

const STORAGE_KEY = 'retailex_logo_mssql_sync';

export type LogoMssqlSyncModules = {
  masterData: boolean;
  customerMovements: boolean;
  invoices: boolean;
  cashMovements: boolean;
  stockMovements: boolean;
};

export type LogoMssqlSyncSettings = {
  enabled: boolean;
  intervalMinutes: number;
  /** Logo MSSQL veritabanı (boşsa config.db erp_db) */
  erpDb: string | null;
  modules: LogoMssqlSyncModules;
  lastSyncAt: string | null;
  lastStatus: 'idle' | 'running' | 'ok' | 'error';
  lastMessage: string | null;
};

const DEFAULT_MODULES: LogoMssqlSyncModules = {
  masterData: true,
  customerMovements: true,
  invoices: true,
  cashMovements: true,
  stockMovements: true,
};

const DEFAULT_SETTINGS: LogoMssqlSyncSettings = {
  enabled: false,
  intervalMinutes: 30,
  erpDb: null,
  modules: DEFAULT_MODULES,
  lastSyncAt: null,
  lastStatus: 'idle',
  lastMessage: null,
};

export type LogoMssqlConnectionOverride = {
  erp_host?: string;
  erp_user?: string;
  erp_pass?: string;
  erp_db?: string;
};

async function mergeLogoMssqlConfig(overrides?: {
  erpDb?: string | null;
  firmNr?: string;
  periodNr?: string;
  connection?: LogoMssqlConnectionOverride;
}): Promise<Record<string, unknown>> {
  const cfg = (await safeInvoke('get_app_config')) as Record<string, unknown>;
  const settings = loadLogoMssqlSyncSettings();
  const erpDb =
    overrides?.erpDb !== undefined
      ? overrides.erpDb
      : settings.erpDb ?? (typeof cfg.erp_db === 'string' ? cfg.erp_db : null);
  const erp_db = (erpDb && String(erpDb).trim()) || String(cfg.erp_db || 'LOGO').trim();
  const merged = {
    ...cfg,
    erp_db,
    erp_firm_nr: overrides?.firmNr ?? cfg.erp_firm_nr ?? ERP_SETTINGS.firmNr ?? '001',
    erp_period_nr: overrides?.periodNr ?? cfg.erp_period_nr ?? ERP_SETTINGS.periodNr ?? '01',
    logo_sync_modules: settings.modules,
  };
  if (overrides?.connection) {
    const c = overrides.connection;
    if (c.erp_host?.trim()) merged.erp_host = c.erp_host.trim();
    if (c.erp_user?.trim()) merged.erp_user = c.erp_user.trim();
    if (c.erp_pass !== undefined) merged.erp_pass = c.erp_pass;
    if (c.erp_db?.trim()) merged.erp_db = c.erp_db.trim();
  }
  return merged;
}

export async function getActiveLogoMssqlDatabase(): Promise<string> {
  const settings = loadLogoMssqlSyncSettings();
  if (settings.erpDb?.trim()) return settings.erpDb.trim();
  const cfg = (await safeInvoke('get_app_config')) as Record<string, unknown>;
  return String(cfg.erp_db || 'LOGO').trim();
}

export async function listLogoMssqlDatabases(
  connection?: LogoMssqlConnectionOverride,
): Promise<string[]> {
  if (!IS_TAURI) return [];
  const cfg = await mergeLogoMssqlConfig({ connection });
  const list = await safeInvoke<string[]>('list_mssql_databases', { config: cfg });
  return Array.isArray(list) ? list : [];
}

export function canListLogoMssqlDatabases(connection?: LogoMssqlConnectionOverride): boolean {
  if (!IS_TAURI) return false;
  const host = connection?.erp_host?.trim();
  const user = connection?.erp_user?.trim();
  return Boolean(host && user);
}

/** Seçilen Logo veritabanını kaydeder (localStorage + config.db). */
export async function setLogoMssqlDatabase(db: string): Promise<void> {
  const trimmed = db.trim();
  if (!trimmed) return;
  saveLogoMssqlSyncSettings({ erpDb: trimmed });
  if (!IS_TAURI) return;
  const cfg = (await safeInvoke('get_app_config')) as Record<string, unknown>;
  await safeInvoke('save_app_config', { config: { ...cfg, erp_db: trimmed } });
}

export function loadLogoMssqlSyncSettings(): LogoMssqlSyncSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<LogoMssqlSyncSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      modules: { ...DEFAULT_MODULES, ...(parsed.modules || {}) },
      intervalMinutes: Math.min(1440, Math.max(5, Number(parsed.intervalMinutes) || 30)),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveLogoMssqlSyncSettings(patch: Partial<LogoMssqlSyncSettings>): LogoMssqlSyncSettings {
  const next = { ...loadLogoMssqlSyncSettings(), ...patch };
  if (patch.modules) next.modules = { ...loadLogoMssqlSyncSettings().modules, ...patch.modules };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

let timerId: ReturnType<typeof setInterval> | null = null;
let running = false;
let logListeners: Array<(line: string) => void> = [];

export function subscribeLogoMssqlSyncLogs(fn: (line: string) => void): () => void {
  logListeners.push(fn);
  return () => {
    logListeners = logListeners.filter((x) => x !== fn);
  };
}

function emitLog(line: string): void {
  for (const fn of logListeners) fn(line);
}

export async function runLogoMssqlSyncNow(opts?: {
  firmNr?: string;
  periodNr?: string;
  erpDb?: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!IS_TAURI) {
    return { ok: false, message: 'Logo MSSQL senkron yalnızca masaüstü uygulamasında çalışır.' };
  }
  if (loadLogoErpMode() !== 'mssql') {
    return { ok: false, message: 'Logo MSSQL senkronu için Entegrasyonlar sayfasında bağlantı türü MSSQL seçilmelidir.' };
  }
  if (running) {
    return { ok: false, message: 'Senkron zaten çalışıyor.' };
  }
  running = true;
  saveLogoMssqlSyncSettings({ lastStatus: 'running', lastMessage: 'Başlatılıyor…' });
  emitLog(`[${new Date().toLocaleTimeString('tr-TR')}] Logo MSSQL senkron başladı`);

  try {
    const merged = await mergeLogoMssqlConfig({
      erpDb: opts?.erpDb,
      firmNr: opts?.firmNr,
      periodNr: opts?.periodNr,
    });
    if (merged.skip_integration) {
      throw new Error('Bağımsız mod: Logo entegrasyonu kapalı (skip_integration).');
    }
    const msg = await safeInvoke<string>('sync_logo_data', { config: merged });
    const message = String(msg || 'Senkron tamamlandı.');
    saveLogoMssqlSyncSettings({
      lastStatus: 'ok',
      lastSyncAt: new Date().toISOString(),
      lastMessage: message,
    });
    emitLog(`[${new Date().toLocaleTimeString('tr-TR')}] ${message}`);
    return { ok: true, message };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    saveLogoMssqlSyncSettings({
      lastStatus: 'error',
      lastMessage: message,
    });
    emitLog(`[${new Date().toLocaleTimeString('tr-TR')}] HATA: ${message}`);
    return { ok: false, message };
  } finally {
    running = false;
  }
}

export function startLogoMssqlAutoSync(): () => void {
  stopLogoMssqlAutoSync();
  if (!IS_TAURI) return () => undefined;

  const tick = () => {
    const s = loadLogoMssqlSyncSettings();
    if (!s.enabled || running || loadLogoErpMode() !== 'mssql') return;
    void runLogoMssqlSyncNow();
  };

  const schedule = () => {
    if (timerId) clearInterval(timerId);
    const s = loadLogoMssqlSyncSettings();
    if (!s.enabled) return;
    const ms = s.intervalMinutes * 60 * 1000;
    timerId = setInterval(tick, ms);
  };

  schedule();
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === STORAGE_KEY) schedule();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    stopLogoMssqlAutoSync();
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

export function stopLogoMssqlAutoSync(): void {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

export async function fetchLogoFirmsFromMssql(erpDb?: string): Promise<Array<{ id: string; name: string }>> {
  if (!IS_TAURI) return [];
  const cfg = await mergeLogoMssqlConfig({ erpDb });
  return safeInvoke<Array<{ id: string; name: string }>>('get_logo_firms', { config: cfg });
}

export async function fetchLogoPeriodsFromMssql(
  firmNr: string,
  erpDb?: string,
): Promise<Array<{ nr: number; start_date: string; end_date: string }>> {
  if (!IS_TAURI) return [];
  const cfg = await mergeLogoMssqlConfig({ erpDb });
  return safeInvoke('get_logo_periods', { config: cfg, firmNr });
}

export async function importLogoFirmData(
  firmNr: string,
  periodNr: string,
  erpDb?: string,
): Promise<{ ok: boolean; message: string }> {
  return runLogoMssqlSyncNow({ firmNr, periodNr, erpDb });
}
