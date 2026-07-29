/**
 * Logo Tiger REST periyodik senkron — Entegrasyonlar (REST Servis modu).
 */

import { loadLogoErpIntegrationParams } from './logoErpIntegrationParams';
import { loadLogoRestConfig } from './logoRestApi';
import { loadLogoErpMode } from './logoErpMode';
import {
  syncLogoAllFromRest,
  type LogoSyncLogEntry,
  type LogoRestSyncModules,
} from './logoRestSync';
import type { LogoPullWatermarks } from './logoRestIncremental';

const STORAGE_KEY = 'retailex_logo_rest_sync';

export type LogoPushModules = {
  products: boolean;
  customers: boolean;
  suppliers: boolean;
  invoices: boolean;
};

export type LogoRestSyncSettings = {
  enabled: boolean;
  intervalMinutes: number;
  modules: LogoRestSyncModules;
  /** Artımlı (önerilen) veya tam çekim */
  pullMode: 'incremental' | 'full';
  /** Logo'ya gönderilecek kuyruk türleri */
  pushModules: LogoPushModules;
  /** Kaynak bazlı son başarılı çekim */
  lastSyncByModule: LogoPullWatermarks;
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
  salesOrders: true,
  purchaseOrders: true,
  salesDispatches: false,
  purchaseDispatches: false,
};

const DEFAULT_PUSH: LogoPushModules = {
  products: true,
  customers: true,
  suppliers: true,
  invoices: true,
};

const DEFAULT_SETTINGS: LogoRestSyncSettings = {
  enabled: false,
  intervalMinutes: 30,
  modules: DEFAULT_MODULES,
  pullMode: 'incremental',
  pushModules: DEFAULT_PUSH,
  lastSyncByModule: {},
  lastSyncAt: null,
  lastStatus: 'idle',
  lastMessage: null,
};

export function loadLogoRestSyncSettings(): LogoRestSyncSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS, modules: { ...DEFAULT_MODULES }, pushModules: { ...DEFAULT_PUSH }, lastSyncByModule: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, modules: { ...DEFAULT_MODULES }, pushModules: { ...DEFAULT_PUSH }, lastSyncByModule: {} };
    const parsed = JSON.parse(raw) as Partial<LogoRestSyncSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      modules: { ...DEFAULT_MODULES, ...(parsed.modules || {}) },
      pushModules: { ...DEFAULT_PUSH, ...(parsed.pushModules || {}) },
      lastSyncByModule: { ...(parsed.lastSyncByModule || {}) },
      pullMode: parsed.pullMode === 'full' ? 'full' : 'incremental',
      intervalMinutes: Math.min(1440, Math.max(5, Number(parsed.intervalMinutes) || 30)),
    };
  } catch {
    return { ...DEFAULT_SETTINGS, modules: { ...DEFAULT_MODULES }, pushModules: { ...DEFAULT_PUSH }, lastSyncByModule: {} };
  }
}

export function saveLogoRestSyncSettings(patch: Partial<LogoRestSyncSettings>): LogoRestSyncSettings {
  const prev = loadLogoRestSyncSettings();
  const next: LogoRestSyncSettings = {
    ...prev,
    ...patch,
    modules: patch.modules ? { ...prev.modules, ...patch.modules } : prev.modules,
    pushModules: patch.pushModules ? { ...prev.pushModules, ...patch.pushModules } : prev.pushModules,
    lastSyncByModule: patch.lastSyncByModule
      ? { ...prev.lastSyncByModule, ...patch.lastSyncByModule }
      : prev.lastSyncByModule,
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('retailex:logo-rest-sync-settings'));
    // enabled / interval / modules değişince köprü cron’unu güncelle (uygulama kapalıyken de çalışsın)
    const structural =
      patch.enabled !== undefined ||
      patch.intervalMinutes !== undefined ||
      patch.modules !== undefined ||
      patch.pullMode !== undefined;
    if (structural) {
      void import('./logoRestBridgeAutosync').then((m) =>
        m.pushLogoAutosyncJobToBridge(next).then((r) => {
          if (!r.ok) console.warn('[LogoAutosync]', r.message);
        }),
      );
    }
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

export type LogoRestSyncNowOpts = {
  /** Modül seçimini geçici override (modal) */
  modules?: Partial<LogoRestSyncModules>;
  pullMode?: 'incremental' | 'full';
};

export async function runLogoRestSyncNow(
  opts: LogoRestSyncNowOpts = {},
): Promise<{ ok: boolean; message: string }> {
  if (loadLogoErpMode() !== 'rest') {
    return { ok: false, message: 'Logo REST senkronu için Entegrasyonlar sayfasında REST Servis seçilmelidir.' };
  }
  if (running) {
    return { ok: false, message: 'REST senkron zaten çalışıyor.' };
  }

  running = true;
  const settings = loadLogoRestSyncSettings();
  const pullMode = opts.pullMode ?? settings.pullMode;
  const modules: LogoRestSyncModules = { ...settings.modules, ...(opts.modules || {}) };
  const params = loadLogoErpIntegrationParams();

  saveLogoRestSyncSettings({ lastStatus: 'running', lastMessage: 'Başlatılıyor…' });
  emitLog(
    `[${new Date().toLocaleTimeString('tr-TR')}] Logo REST senkron başladı` +
      ` (${pullMode === 'full' ? 'tam çekim' : 'artımlı'})`,
  );

  const onLog = (entry: LogoSyncLogEntry) => {
    const detail = entry.detail ? ` (${entry.detail})` : '';
    emitLog(
      `[${new Date().toLocaleTimeString('tr-TR')}] ${entry.entity} ${entry.action} ${entry.code}${detail}`,
    );
  };

  try {
    const cfg = loadLogoRestConfig();
    const result = await syncLogoAllFromRest(
      cfg,
      {
        products: modules.masterData,
        customers: modules.customers,
        suppliers: modules.suppliers,
        salesInvoices: modules.salesInvoices,
        purchaseInvoices: modules.purchaseInvoices,
        itemSlips: modules.itemSlips,
        banks: modules.banks,
        salesOrders: modules.salesOrders,
        purchaseOrders: modules.purchaseOrders,
        salesDispatches: modules.salesDispatches,
        purchaseDispatches: modules.purchaseDispatches,
        fullSync: pullMode === 'full',
        lastSyncByModule: settings.lastSyncByModule,
        documentTransferDays: params.documentTransferDays,
        onLog,
      },
      (p) => {
        if (p.message) emitLog(`[${new Date().toLocaleTimeString('tr-TR')}] ${p.message}`);
      },
    );

    const message = result.ok
      ? result.messages.join(' · ') || 'REST senkron tamamlandı.'
      : result.error || 'REST senkron başarısız.';

    const nowIso = new Date().toISOString();
    const wm: LogoPullWatermarks = { ...settings.lastSyncByModule };
    if (result.ok) {
      wm['*'] = nowIso;
      if (modules.masterData && result.products.errors === 0) wm.items = nowIso;
      if ((modules.customers || modules.suppliers) && result.customers.errors + result.suppliers.errors === 0) {
        wm.Arps = nowIso;
      }
      if (modules.salesInvoices && result.salesInvoices.errors === 0) wm.salesInvoices = nowIso;
      if (modules.purchaseInvoices && result.purchaseInvoices.errors === 0) wm.purchaseInvoices = nowIso;
      if (modules.itemSlips && result.itemSlips.errors === 0) wm.itemSlips = nowIso;
      if (modules.banks && result.banks.errors === 0) wm.banks = nowIso;
    }

    saveLogoRestSyncSettings({
      lastStatus: result.ok ? 'ok' : 'error',
      lastSyncAt: nowIso,
      lastMessage: message,
      lastSyncByModule: wm,
      ...(opts.modules ? { modules } : {}),
      ...(opts.pullMode ? { pullMode } : {}),
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

  /** Köprü cron başarılıysa tarayıcı interval’ı açma (çift çekim olmasın) */
  let bridgeCronOk = false;

  const tick = () => {
    if (bridgeCronOk) return;
    const s = loadLogoRestSyncSettings();
    if (!s.enabled || running) return;
    void runLogoRestSyncNow({ pullMode: s.pullMode });
  };

  const schedule = () => {
    if (timerId) clearInterval(timerId);
    const s = loadLogoRestSyncSettings();
    if (!s.enabled || bridgeCronOk) return;
    timerId = setInterval(tick, s.intervalMinutes * 60 * 1000);
  };

  const syncBridgeJob = () => {
    const s = loadLogoRestSyncSettings();
    if (typeof window === 'undefined') return;
    void import('./logoRestBridgeAutosync').then((m) =>
      m.pushLogoAutosyncJobToBridge(s).then((r) => {
        if (r.ok && s.enabled) {
          bridgeCronOk = true;
          stopLogoRestAutoSync();
          emitLog(
            `[${new Date().toLocaleTimeString('tr-TR')}] Otomatik senkron köprüye devredildi (uygulama kapalıyken de çalışır).`,
          );
        } else {
          bridgeCronOk = false;
          if (s.enabled) {
            if (!r.ok) console.warn('[LogoAutosync]', r.message);
            schedule();
          }
        }
      }),
    );
  };

  syncBridgeJob();
  schedule();

  const onStorage = (ev: StorageEvent) => {
    if (ev.key === STORAGE_KEY) {
      syncBridgeJob();
      schedule();
    }
  };
  const onCustom = () => {
    syncBridgeJob();
    schedule();
  };
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
export { DEFAULT_MODULES as LOGO_REST_DEFAULT_PULL_MODULES, DEFAULT_PUSH as LOGO_REST_DEFAULT_PUSH_MODULES };
