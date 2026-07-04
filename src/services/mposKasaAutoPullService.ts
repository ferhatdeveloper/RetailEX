/**
 * Kasa (MPOS) otomatik kuyruk çekimi — merkezden master veri (ürün, promosyon vb.)
 * Tauri: Rust BackgroundSyncService + mpos_pull_master_now
 * Web: birleşik hibrit otomatik senkron (startUnifiedHybridAutoSync)
 */

import { IS_TAURI, safeInvoke } from '../utils/env';
import {
  buildSyncEndpoints,
  countPendingQueueEndpoint,
  runHybridSync,
  type HybridSyncProgressEvent,
  type HybridSyncResult,
} from './hybridSyncEngine';
import { buildKasaInboundFilter, buildSyncFilter } from './hybridSyncService';
import { getHybridDeviceId } from './hybridDeviceSyncLogService';
import {
  DB_SETTINGS,
  LOCAL_CONFIG,
  REMOTE_CONFIG,
  getCentralRemotePgConfig,
  normalizeHybridSyncIntervalSec,
  resolveHybridSyncConnectionProvider,
  updateConfigs,
  type HybridSyncTransport,
} from './postgres';
import {
  applyTerminalRuntimeFromConfig,
  isKasaTerminalRuntime,
  isPosTerminalRole,
  readTerminalRuntimeFromWebStorage,
  TERMINAL_RUNTIME,
  type TerminalRuntime,
} from './terminalRuntimeService';
import {
  notifyKasaDataArrivalFailed,
  notifyKasaDataArrived,
  type KasaDataArrivalSource,
} from './kasaDataArrivalNotify';

export type KasaPullContext = {
  storeId: string;
  terminalName: string;
};

export type MposPullResult = {
  synced: number;
  failed: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  pending_inbound: number;
  message?: string;
};

export async function resolveKasaPullContext(
  fallbackStoreId?: string | null,
): Promise<KasaPullContext | null> {
  let runtime: TerminalRuntime = TERMINAL_RUNTIME;

  if (IS_TAURI) {
    try {
      const cfg: Record<string, unknown> = await safeInvoke('get_app_config');
      applyTerminalRuntimeFromConfig(cfg);
      runtime = TERMINAL_RUNTIME;

      if (!runtime.storeId.trim()) {
        try {
          const { collectDesktopDeviceMetadata, getDesktopTerminalStatus } = await import(
            './deviceRegistrationService'
          );
          const info = await collectDesktopDeviceMetadata();
          const status = await getDesktopTerminalStatus(info.deviceId);
          if (status.storeId?.trim()) {
            runtime = {
              ...runtime,
              storeId: status.storeId.trim(),
              terminalName: status.terminalName?.trim() || runtime.terminalName,
            };
            applyTerminalRuntimeFromConfig({
              store_id: runtime.storeId,
              terminal_name: runtime.terminalName,
            });
          }
        } catch {
          /* merkez store_id alınamadı */
        }
      }
    } catch {
      return null;
    }
  } else {
    runtime = readTerminalRuntimeFromWebStorage();
    if (!runtime.storeId && fallbackStoreId) {
      runtime = { ...runtime, storeId: String(fallbackStoreId).trim() };
    }
  }

  const isKasa =
    isPosTerminalRole(runtime.role) || runtime.terminalName.trim().length > 0;
  if (!isKasa) return null;

  const storeId = runtime.storeId.trim();
  if (!storeId) {
    console.warn('[KasaPull] store_id eksik — inbound atlandı (güvenlik)');
    return null;
  }

  return {
    storeId,
    terminalName: runtime.terminalName.trim(),
  };
}

export async function countInboundMasterPending(ctx: KasaPullContext): Promise<number> {
  if (DB_SETTINGS.activeMode !== 'hybrid') return 0;
  const filter = buildKasaInboundFilter(ctx);
  const { remote } = buildSyncEndpoints({
    local: LOCAL_CONFIG,
    remote: getCentralRemotePgConfig(),
    connectionProvider: resolveHybridSyncConnectionProvider(),
    remoteRestUrl: DB_SETTINGS.remoteRestUrl,
  });
  return countPendingQueueEndpoint(remote, filter);
}

export async function pullInboundMasterNow(
  ctx?: KasaPullContext | null,
  opts?: {
    notifySource?: KasaDataArrivalSource;
    silent?: boolean;
    onProgress?: (event: HybridSyncProgressEvent) => void;
  },
): Promise<MposPullResult> {
  const resolved = ctx ?? (await resolveKasaPullContext());
  if (!resolved) {
    return { synced: 0, failed: 0, pending_inbound: 0, message: 'Kasa bağlamı tanımlı değil.' };
  }

  if (IS_TAURI) {
    const r = await safeInvoke<{
      synced: number;
      failed: number;
      inserted?: number;
      updated?: number;
      skipped?: number;
      pending_inbound: number;
    }>('mpos_pull_master_now');
    const out: MposPullResult = {
      synced: Number(r?.synced ?? 0),
      failed: Number(r?.failed ?? 0),
      inserted: Number(r?.inserted ?? 0),
      updated: Number(r?.updated ?? 0),
      skipped: Number(r?.skipped ?? 0),
      pending_inbound: Number(r?.pending_inbound ?? 0),
    };
    if (!opts?.silent) {
      if (out.inserted + out.updated > 0 || out.synced > 0) {
        notifyKasaDataArrived({
          synced: out.synced,
          failed: out.failed,
          inserted: out.inserted,
          updated: out.updated,
          skipped: out.skipped,
          source: opts?.notifySource ?? 'manual',
        });
      } else if (out.failed > 0) {
        notifyKasaDataArrivalFailed('Kasa veri alımı başarısız.');
      }
    }
    return out;
  }

  const deviceId = await getHybridDeviceId();
  const result: HybridSyncResult = await runHybridSync({
    flow: 'receive',
    scope: 'all',
    filter: buildKasaInboundFilter(resolved),
    local: LOCAL_CONFIG,
    remote: getCentralRemotePgConfig(),
    connectionProvider: resolveHybridSyncConnectionProvider(),
    remoteRestUrl: DB_SETTINGS.remoteRestUrl,
    incremental: true,
    deviceId,
    storeId: resolved.storeId ?? null,
    terminalName: resolved.terminalName ?? null,
    onProgress: opts?.onProgress,
  });

  let pending = 0;
  try {
    pending = await countInboundMasterPending(resolved);
  } catch (e) {
    console.warn('[KasaPull] inbound pending sayımı başarısız:', e);
    pending = -1;
  }

  const out: MposPullResult = {
    synced: result.totalSynced,
    failed: result.failed,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped,
    pending_inbound: pending,
    message: result.message,
  };

  if (!opts?.silent) {
    if (out.inserted + out.updated > 0 || out.synced > 0) {
      notifyKasaDataArrived({
        synced: out.synced,
        failed: out.failed,
        inserted: out.inserted,
        updated: out.updated,
        skipped: out.skipped,
        source: opts?.notifySource ?? 'manual',
      });
    } else if (out.failed > 0) {
      notifyKasaDataArrivalFailed(out.message || 'Kasa veri alımı başarısız.');
    }
  }

  return out;
}

export type KasaAutoPullState = {
  pendingInbound: number;
  lastPullAt: string | null;
  isKasa: boolean;
};

let unifiedTimer: ReturnType<typeof setInterval> | null = null;
let unifiedInProgress = false;
let unifiedStopFn: (() => void) | null = null;

/** Web: tek orchestrator — kasa ise gönder+al, değilse klasik hibrit sync */
export function startUnifiedHybridAutoSync(opts?: {
  storeId?: string | null;
  intervalSec?: number;
  onUpdate?: (state: KasaAutoPullState) => void;
}): () => void {
  stopUnifiedHybridAutoSync();

  const transport = DB_SETTINGS.hybridSyncTransport;
  const pollingEnabled =
    DB_SETTINGS.activeMode === 'hybrid' &&
    (transport === 'polling' || transport === 'both');

  if (!pollingEnabled) {
    void import('./syncTransportDiagnostics').then(({ logSyncTransportDiagnostics }) => {
      logSyncTransportDiagnostics('UnifiedHybridSync');
    });
    return () => {
      /* periyodik senkron kapalı — WebSocket veya manuel senkron */
    };
  }

  let cancelled = false;
  let lastPullAt: string | null = null;

  const emit = async (ctx: KasaPullContext | null, isKasa: boolean) => {
    if (!opts?.onUpdate) return;
    if (!isKasa || !ctx) {
      opts.onUpdate({ pendingInbound: 0, lastPullAt: null, isKasa: false });
      return;
    }
    try {
      const pending = await countInboundMasterPending(ctx);
      opts.onUpdate({ pendingInbound: pending, lastPullAt, isKasa: true });
    } catch (e) {
      console.warn('[UnifiedHybridSync] pending sayım hatası:', e);
      opts.onUpdate({ pendingInbound: -1, lastPullAt, isKasa: true });
    }
  };

  const tick = async () => {
    if (cancelled || unifiedInProgress || DB_SETTINGS.activeMode !== 'hybrid') return;
    unifiedInProgress = true;
    try {
      const ctx = await resolveKasaPullContext(opts?.storeId);
      const isKasa = !!ctx;

      if (IS_TAURI) {
        await emit(ctx, isKasa);
        return;
      }

      if (isKasa && ctx) {
        await runHybridSync({
          flow: 'send',
          scope: 'pending',
          filter: buildSyncFilter({ storeId: ctx.storeId }),
          local: LOCAL_CONFIG,
          remote: getCentralRemotePgConfig(),
          connectionProvider: resolveHybridSyncConnectionProvider(),
          remoteRestUrl: DB_SETTINGS.remoteRestUrl,
        });
        await pullInboundMasterNow(ctx, { notifySource: 'auto' });
        lastPullAt = new Date().toISOString();
      } else if (!isKasaTerminalRuntime()) {
        const dir = DB_SETTINGS.hybridSyncDirection;
        const flow =
          dir === 'remote_to_local' ? 'receive' : dir === 'bidirectional' ? 'both' : 'send';
        await runHybridSync({
          flow,
          direction: dir,
          scope: 'pending',
          local: LOCAL_CONFIG,
          remote: getCentralRemotePgConfig(),
          connectionProvider: resolveHybridSyncConnectionProvider(),
          remoteRestUrl: DB_SETTINGS.remoteRestUrl,
          filter: buildSyncFilter({ storeId: opts?.storeId ?? null }),
        });
        lastPullAt = new Date().toISOString();
      }

      await emit(ctx, isKasa);
    } catch (e) {
      console.warn('[UnifiedHybridSync] tick hatası:', e);
    } finally {
      unifiedInProgress = false;
    }
  };

  void tick();
  const sec = opts?.intervalSec ?? DB_SETTINGS.hybridSyncIntervalSec ?? 30;
  unifiedTimer = window.setInterval(() => void tick(), Math.max(5, sec) * 1000);

  unifiedStopFn = () => {
    cancelled = true;
    if (unifiedTimer) {
      window.clearInterval(unifiedTimer);
      unifiedTimer = null;
    }
  };

  return unifiedStopFn;
}

export function stopUnifiedHybridAutoSync(): void {
  unifiedStopFn?.();
  unifiedStopFn = null;
  unifiedTimer = null;
}

/** Periyodik arka plan senkronu açık mı (polling veya WS+periyodik) */
export function isHybridPeriodicAutoSyncEnabled(): boolean {
  const t = DB_SETTINGS.hybridSyncTransport;
  return t === 'polling' || t === 'both';
}

const HYBRID_TRANSPORT_PREF_KEY = 'hybrid_sync_transport_pref';

export function readHybridTransportPreference(): HybridSyncTransport {
  if (typeof window === 'undefined') return 'both';
  try {
    const raw = localStorage.getItem(HYBRID_TRANSPORT_PREF_KEY);
    if (raw === 'polling' || raw === 'both') return raw;
  } catch {
    /* */
  }
  return 'both';
}

export function writeHybridTransportPreference(transport: HybridSyncTransport): void {
  if (transport === 'websocket') return;
  try {
    localStorage.setItem(HYBRID_TRANSPORT_PREF_KEY, transport);
  } catch {
    /* */
  }
}

/** Otomatik senkron ayarlarını kaydet ve web'de timer/WS'yi yeniden başlat */
export async function applyHybridAutoSyncSettings(opts?: {
  transport?: HybridSyncTransport;
  intervalSec?: number;
  userId?: string | null;
  storeId?: string | null;
}): Promise<void> {
  const settings: Partial<typeof DB_SETTINGS> = {};
  if (opts?.transport !== undefined) {
    settings.hybridSyncTransport = opts.transport;
    if (opts.transport !== 'websocket') {
      writeHybridTransportPreference(opts.transport);
    }
  }
  if (opts?.intervalSec !== undefined) {
    settings.hybridSyncIntervalSec = normalizeHybridSyncIntervalSec(opts.intervalSec);
  }
  if (Object.keys(settings).length > 0) {
    await updateConfigs({ settings });
  }

  const { logSyncTransportDiagnostics } = await import('./syncTransportDiagnostics');
  logSyncTransportDiagnostics('ApplyHybridAutoSync');

  if (IS_TAURI || typeof window === 'undefined') {
    return;
  }

  stopUnifiedHybridAutoSync();
  const transport = DB_SETTINGS.hybridSyncTransport;
  if (transport === 'polling' || transport === 'both') {
    startUnifiedHybridAutoSync({
      storeId: opts?.storeId ?? undefined,
      intervalSec: DB_SETTINGS.hybridSyncIntervalSec,
    });
  }

  if (!opts?.userId) return;
  const { wsService } = await import('./websocket');
  wsService.disconnect();
  if (transport === 'websocket' || transport === 'both') {
    void wsService.connect(opts.userId, opts.storeId || 'default_store').catch(() => {
      logSyncTransportDiagnostics('ApplyHybridAutoSyncWsFail');
    });
  }
}

/** @deprecated startUnifiedHybridAutoSync kullanın */
export function startKasaAutoPullLoop(opts?: {
  storeId?: string | null;
  intervalSec?: number;
  onUpdate?: (state: KasaAutoPullState) => void;
}): () => void {
  return startUnifiedHybridAutoSync(opts);
}

/** Merkez gönderim sonrası kasalara anlık çekim isteği (WS sunucusu relay ederse) */
export function requestMposSyncPullNotify(opts?: {
  storeId?: string;
  terminalName?: string;
}): void {
  void import('./syncTransportDiagnostics').then(({ syncTransportNeedsWebSocket }) => {
    if (!syncTransportNeedsWebSocket()) return;
    void import('./websocket').then(({ wsService }) => {
      if (!wsService.isConnected()) return;
      wsService.send('MPOS_SYNC_PULL', {
        storeId: opts?.storeId,
        terminalName: opts?.terminalName,
        at: new Date().toISOString(),
      });
    });
  });
}

/** Merkez WS / manuel tetik — tarayıcı kasa anlık çekim */
export async function triggerInstantKasaPull(fallbackStoreId?: string | null): Promise<MposPullResult> {
  const ctx = await resolveKasaPullContext(fallbackStoreId);
  if (!ctx) {
    return { synced: 0, failed: 0, pending_inbound: 0, message: 'Kasa bağlamı yok.' };
  }
  if (IS_TAURI) {
    return pullInboundMasterNow(ctx);
  }
  await runHybridSync({
    flow: 'send',
    scope: 'pending',
    filter: buildSyncFilter({ storeId: ctx.storeId }),
    local: LOCAL_CONFIG,
    remote: getCentralRemotePgConfig(),
    connectionProvider: resolveHybridSyncConnectionProvider(),
    remoteRestUrl: DB_SETTINGS.remoteRestUrl,
  });
  return pullInboundMasterNow(ctx, { notifySource: 'instant' });
}
