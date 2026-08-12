/**
 * Logo REST otomatik senkron — pg_bridge üzerinde çalışır.
 * Tarayıcı / DeskApp kapalı olsa bile `npm run bridge` ayaktayken periyodik çekim sürer.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBridgeUrl } from '../utils/env';
import { loadLogoErpIntegrationParams } from './logoErpIntegrationParams';
import { loadLogoRestConfig, type LogoRestConfig } from './logoRestApi';
import {
  getLogoServerSyncJob,
  setLogoServerSyncJob,
  type LogoServerSyncJob,
} from './logoRestServerContext';
import { syncLogoAllFromRest, type LogoRestSyncModules } from './logoRestSync';
import { DB_SETTINGS, ERP_SETTINGS } from './postgres';

const JOB_FILE = path.join(os.tmpdir(), 'retailex-logo-rest-autosync.json');

export type LogoBridgeAutosyncStatus = {
  enabled: boolean;
  intervalMinutes: number;
  running: boolean;
  lastRunAt: string | null;
  lastStatus: 'idle' | 'running' | 'ok' | 'error';
  lastMessage: string | null;
  nextRunAt: string | null;
  firmNr?: string;
  periodNr?: string;
};

let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickRunning = false;
let lastRunAt: string | null = null;
let lastStatus: LogoBridgeAutosyncStatus['lastStatus'] = 'idle';
let lastMessage: string | null = null;
let nextRunAt: string | null = null;

function persistJob(job: LogoServerSyncJob | null): void {
  try {
    if (!job || !job.enabled) {
      if (fs.existsSync(JOB_FILE)) fs.unlinkSync(JOB_FILE);
      return;
    }
    fs.writeFileSync(JOB_FILE, JSON.stringify(job, null, 2), 'utf8');
  } catch (e) {
    console.warn('[LogoAutosync] job dosyası yazılamadı:', e);
  }
}

export function loadPersistedLogoAutosyncJob(): LogoServerSyncJob | null {
  try {
    if (!fs.existsSync(JOB_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(JOB_FILE, 'utf8')) as LogoServerSyncJob;
    if (!raw?.enabled || !raw?.logoConfig?.baseUrl) return null;
    return raw;
  } catch {
    return null;
  }
}

function applyServerDbContext(job: LogoServerSyncJob): void {
  const firm = String(job.firmNr || '001').replace(/\D/g, '') || '1';
  ERP_SETTINGS.firmNr = firm.length <= 3 ? firm.padStart(3, '0') : firm.slice(0, 10);
  ERP_SETTINGS.periodNr = String(job.periodNr || '01').replace(/\D/g, '').padStart(2, '0') || '01';

  const rest = String(job.postgrestUrl || '').trim();
  if (rest) {
    DB_SETTINGS.remoteRestUrl = rest.replace(/\/+$/, '');
    DB_SETTINGS.connectionProvider = 'rest_api';
    DB_SETTINGS.activeMode = 'online';
  } else {
    // Yerel PG: bridge içinden /api/pg_query ile yazım
    DB_SETTINGS.connectionProvider = 'db';
    DB_SETTINGS.activeMode = 'offline';
  }
}

export async function runLogoServerAutosyncTick(): Promise<{ ok: boolean; message: string }> {
  const job = getLogoServerSyncJob();
  if (!job?.enabled) {
    return { ok: false, message: 'Otomatik Logo senkron kaydı yok veya kapalı.' };
  }
  if (tickRunning) {
    return { ok: false, message: 'Logo otomatik senkron zaten çalışıyor.' };
  }

  tickRunning = true;
  lastStatus = 'running';
  lastMessage = 'Çalışıyor…';
  lastRunAt = new Date().toISOString();
  setLogoServerSyncJob(job);
  applyServerDbContext(job);

  try {
    const result = await syncLogoAllFromRest(
      job.logoConfig,
      {
        products: job.modules.masterData,
        customers: job.modules.customers,
        suppliers: job.modules.suppliers,
        salesInvoices: job.modules.salesInvoices,
        purchaseInvoices: job.modules.purchaseInvoices,
        itemSlips: job.modules.itemSlips,
        banks: job.modules.banks,
        salesOrders: job.modules.salesOrders,
        purchaseOrders: job.modules.purchaseOrders,
        salesDispatches: job.modules.salesDispatches,
        purchaseDispatches: job.modules.purchaseDispatches,
        fullSync: job.pullMode === 'full',
        lastSyncByModule: job.lastSyncByModule || {},
        documentTransferDays: job.documentTransferDays,
      },
      (p) => {
        if (p.message) console.log(`[LogoAutosync] ${p.message}`);
      },
    );

    const message = result.ok
      ? result.messages.join(' · ') || 'Köprü otomatik senkron tamamlandı.'
      : result.error || 'Köprü otomatik senkron başarısız.';

    const nowIso = new Date().toISOString();
    const wm = { ...(job.lastSyncByModule || {}) };
    if (result.ok) {
      wm['*'] = nowIso;
      if (job.modules.masterData && result.products.errors === 0) wm.items = nowIso;
      if (
        (job.modules.customers || job.modules.suppliers) &&
        result.customers.errors + result.suppliers.errors === 0
      ) {
        wm.Arps = nowIso;
      }
      if (job.modules.salesInvoices && result.salesInvoices.errors === 0) wm.salesInvoices = nowIso;
      if (job.modules.purchaseInvoices && result.purchaseInvoices.errors === 0) {
        wm.purchaseInvoices = nowIso;
      }
      if (job.modules.itemSlips && result.itemSlips.errors === 0) wm.itemSlips = nowIso;
      if (job.modules.banks && result.banks.errors === 0) wm.banks = nowIso;
    }

    const nextJob: LogoServerSyncJob = {
      ...job,
      lastSyncByModule: wm,
      updatedAt: nowIso,
    };
    setLogoServerSyncJob(nextJob);
    persistJob(nextJob);

    lastStatus = result.ok ? 'ok' : 'error';
    lastMessage = message;
    console.log(`[LogoAutosync] ${message}`);
    return { ok: result.ok, message };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    lastStatus = 'error';
    lastMessage = message;
    console.error('[LogoAutosync] HATA:', message);
    return { ok: false, message };
  } finally {
    tickRunning = false;
    const j = getLogoServerSyncJob();
    if (j?.enabled) {
      nextRunAt = new Date(Date.now() + j.intervalMinutes * 60 * 1000).toISOString();
    } else {
      nextRunAt = null;
    }
  }
}

function clearTickTimer(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

export function stopLogoBridgeAutosyncScheduler(): void {
  clearTickTimer();
  nextRunAt = null;
}

export function startLogoBridgeAutosyncScheduler(job: LogoServerSyncJob): void {
  clearTickTimer();
  setLogoServerSyncJob(job);
  persistJob(job);
  if (!job.enabled) {
    nextRunAt = null;
    return;
  }
  const ms = Math.max(5, job.intervalMinutes) * 60 * 1000;
  nextRunAt = new Date(Date.now() + ms).toISOString();
  tickTimer = setInterval(() => {
    void runLogoServerAutosyncTick();
  }, ms);
  console.log(
    `[LogoAutosync] Zamanlayıcı açık: her ${job.intervalMinutes} dk` +
      ` · firma ${job.firmNr}/${job.periodNr}`,
  );
}

const DEFAULT_PULL_MODULES: LogoRestSyncModules = {
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

export function registerLogoServerAutosyncJob(job: LogoServerSyncJob): LogoBridgeAutosyncStatus {
  const normalized: LogoServerSyncJob = {
    ...job,
    modules: { ...DEFAULT_PULL_MODULES, ...(job.modules || {}) },
    intervalMinutes: Math.min(1440, Math.max(5, Number(job.intervalMinutes) || 30)),
    updatedAt: new Date().toISOString(),
  };
  if (normalized.enabled) {
    if (!String(normalized.logoConfig?.baseUrl || '').trim()) {
      throw new Error('Logo REST adresi (baseUrl) olmadan otomatik senkron açılamaz.');
    }
    startLogoBridgeAutosyncScheduler(normalized);
    lastStatus = 'idle';
    lastMessage = 'Köprü otomatik senkron kaydı alındı.';
  } else {
    stopLogoBridgeAutosyncScheduler();
    setLogoServerSyncJob(null);
    persistJob(null);
    lastStatus = 'idle';
    lastMessage = 'Köprü otomatik senkron kapatıldı.';
  }
  return getLogoBridgeAutosyncStatus();
}

export function getLogoBridgeAutosyncStatus(): LogoBridgeAutosyncStatus {
  const job = getLogoServerSyncJob();
  return {
    enabled: Boolean(job?.enabled),
    intervalMinutes: job?.intervalMinutes ?? 30,
    running: tickRunning,
    lastRunAt,
    lastStatus,
    lastMessage,
    nextRunAt,
    firmNr: job?.firmNr,
    periodNr: job?.periodNr,
  };
}

export function restoreLogoBridgeAutosyncFromDisk(): void {
  const job = loadPersistedLogoAutosyncJob();
  if (!job) return;
  startLogoBridgeAutosyncScheduler(job);
  console.log('[LogoAutosync] Diskten kayıt geri yüklendi.');
}

/** Tarayıcı / DeskApp → bridge’e iş kaydı */
export async function pushLogoAutosyncJobToBridge(settings?: {
  enabled: boolean;
  intervalMinutes: number;
  pullMode: 'incremental' | 'full';
  modules: LogoRestSyncModules;
  lastSyncByModule?: LogoServerSyncJob['lastSyncByModule'];
}): Promise<{ ok: boolean; message: string; status?: LogoBridgeAutosyncStatus }> {
  if (typeof window === 'undefined') {
    return { ok: false, message: 'Yalnızca istemciden çağrılır.' };
  }
  const { loadLogoRestSyncSettings } = await import('./logoRestSyncService');
  const s = settings
    ? { ...loadLogoRestSyncSettings(), ...settings, modules: settings.modules }
    : loadLogoRestSyncSettings();
  const logoConfig = loadLogoRestConfig();
  const params = loadLogoErpIntegrationParams();
  const firmNr = String(ERP_SETTINGS.firmNr || '001');
  const periodNr = String(ERP_SETTINGS.periodNr || '01');
  const postgrestUrl = String(DB_SETTINGS.remoteRestUrl || '').trim() || undefined;

  const body: LogoServerSyncJob = {
    enabled: s.enabled,
    intervalMinutes: s.intervalMinutes,
    pullMode: s.pullMode,
    modules: s.modules as LogoRestSyncModules,
    logoConfig: logoConfig as LogoRestConfig,
    firmNr,
    periodNr,
    postgrestUrl,
    documentTransferDays: params.documentTransferDays,
    lastSyncByModule: s.lastSyncByModule,
    updatedAt: new Date().toISOString(),
  };

  try {
    const bridge = getBridgeUrl();
    const res = await fetch(`${bridge}/api/logo/autosync/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      status?: LogoBridgeAutosyncStatus;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        message: data.error || `Köprü kaydı başarısız (${res.status})`,
      };
    }
    return {
      ok: true,
      message:
        data.message ||
        (s.enabled
          ? 'Otomatik senkron köprüye kaydedildi — uygulama kapalıyken de çalışır (bridge açık kalmalı).'
          : 'Köprü otomatik senkron kapatıldı.'),
      status: data.status,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message:
        `Köprüye ulaşılamadı: ${msg}. ` +
        'Otomatik senkron için `npm run bridge` (veya retailex_bridge) çalışır durumda olmalı.',
    };
  }
}

export async function fetchLogoBridgeAutosyncStatus(): Promise<LogoBridgeAutosyncStatus | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch(`${getBridgeUrl()}/api/logo/autosync/status`);
    if (!res.ok) return null;
    return (await res.json()) as LogoBridgeAutosyncStatus;
  } catch {
    return null;
  }
}
