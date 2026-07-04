/**
 * Logo Tiger REST periyodik senkron — Entegrasyonlar (REST Servis modu).
 */

import { loadLogoRestConfig } from './logoRestApi';
import { loadLogoErpMode } from './logoErpMode';
import {
  syncLogoAllFromRest,
  type LogoSyncLogEntry,
  type LogoRestSyncModules,
} from './logoRestSync';

const STORAGE_KEY = 'retailex_logo_rest_sync';

export type LogoRestSyncSettings = {
  enabled: boolean;
  intervalMinutes: number;
  modules: LogoRestSyncModules;
  lastSyncAt: string | null;
  lastStatus: 'idle' | 'running' | 'ok' | 'error';
  lastMessage: string | null;
};

const DEFAULT_MODULES: LogoRestSyncModules = {
  masterData: true,
  customers: true,
  suppliers: true,
  salesInvoices: true,
  purchaseInvoices: true,
  itemSlips: true,
  banks: true,
  salesOrders: false,
  purchaseOrders: false,
};

const DEFAULT_SETTINGS: LogoRestSyncSettings = {
  enabled: false,
  intervalMinutes: 30,
  modules: DEFAULT_MODULES,
  lastSyncAt: null,
  lastStatus: 'idle',
  lastMessage: null,
};

export function loadLogoRestSyncSettings(): LogoRestSyncSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<LogoRestSyncSettings>;
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

export function saveLogoRestSyncSettings(patch: Partial<LogoRestSyncSettings>): LogoRestSyncSettings {
  const prev = loadLogoRestSyncSettings();
  const next = { ...prev, ...patch };
  if (patch.modules) next.modules = { ...prev.modules, ...patch.modules };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('retailex:logo-rest-sync-settings'));
  }
  return next;
}

let timerId: ReturnType<typeof setInterval> | null = null;
let running = false;
let logListeners: Array<(line: string) => void> = [];

export function subscribeLogoRestSyncLogs(fn: (line: string) => void): () => void {
  logListeners.push(fn);
  return () => {
    logListeners = logListeners.filter((x) => x !== fn);
  };
}

function emitLog(line: string): void {
  for (const fn of logListeners) fn(line);
}

export async function runLogoRestSyncNow(): Promise<{ ok: boolean; message: string }> {
  if (loadLogoErpMode() !== 'rest') {
    return { ok: false, message: 'Logo REST senkronu için Entegrasyonlar sayfasında REST Servis seçilmelidir.' };
  }
  if (running) {
    return { ok: false, message: 'REST senkron zaten çalışıyor.' };
  }

  running = true;
  const settings = loadLogoRestSyncSettings();
  saveLogoRestSyncSettings({ lastStatus: 'running', lastMessage: 'Başlatılıyor…' });
  emitLog(`[${new Date().toLocaleTimeString('tr-TR')}] Logo REST senkron başladı`);

  const onLog = (entry: LogoSyncLogEntry) => {
    const detail = entry.detail ? ` (${entry.detail})` : '';
    emitLog(
      `[${new Date().toLocaleTimeString('tr-TR')}] ${entry.entity} ${entry.action} ${entry.code}${detail}`,
    );
  };

  try {
    const cfg = loadLogoRestConfig();
    const m = settings.modules;
    const result = await syncLogoAllFromRest(
      cfg,
      {
        products: m.masterData,
        customers: m.customers,
        suppliers: m.suppliers,
        salesInvoices: m.salesInvoices,
        purchaseInvoices: m.purchaseInvoices,
        itemSlips: m.itemSlips,
        banks: m.banks,
        salesOrders: m.salesOrders,
        purchaseOrders: m.purchaseOrders,
        onLog,
      },
      (p) => {
        if (p.message) emitLog(`[${new Date().toLocaleTimeString('tr-TR')}] ${p.message}`);
      },
    );

    const message = result.ok
      ? result.messages.join(' · ') || 'REST senkron tamamlandı.'
      : result.error || 'REST senkron başarısız.';
    saveLogoRestSyncSettings({
      lastStatus: result.ok ? 'ok' : 'error',
      lastSyncAt: new Date().toISOString(),
      lastMessage: message,
    });
    emitLog(`[${new Date().toLocaleTimeString('tr-TR')}] ${message}`);
    return { ok: result.ok, message };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    saveLogoRestSyncSettings({
      lastStatus: 'error',
      lastMessage: message,
    });
    emitLog(`[${new Date().toLocaleTimeString('tr-TR')}] HATA: ${message}`);
    return { ok: false, message };
  } finally {
    running = false;
  }
}

export function startLogoRestAutoSync(): () => void {
  stopLogoRestAutoSync();
  if (loadLogoErpMode() !== 'rest') return () => undefined;

  const tick = () => {
    const s = loadLogoRestSyncSettings();
    if (!s.enabled || running) return;
    void runLogoRestSyncNow();
  };

  const schedule = () => {
    if (timerId) clearInterval(timerId);
    const s = loadLogoRestSyncSettings();
    if (!s.enabled) return;
    timerId = setInterval(tick, s.intervalMinutes * 60 * 1000);
  };

  schedule();

  const onStorage = (ev: StorageEvent) => {
    if (ev.key === STORAGE_KEY) schedule();
  };
  const onCustom = () => schedule();
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    window.addEventListener('retailex:logo-rest-sync-settings', onCustom);
    window.addEventListener('retailex:logo-erp-mode', onCustom);
  }

  return () => {
    stopLogoRestAutoSync();
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('retailex:logo-rest-sync-settings', onCustom);
      window.removeEventListener('retailex:logo-erp-mode', onCustom);
    }
  };
}

export function stopLogoRestAutoSync(): void {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

export type { LogoRestSyncModules };
