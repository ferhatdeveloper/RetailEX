/**
 * Kasa (MPOS) otomatik kuyruk çekimi — merkezden master veri (ürün, promosyon vb.)
 * Tauri: Rust BackgroundSyncService + mpos_pull_master_now
 * Web: düşük frekanslı runHybridSync(receive) döngüsü
 */

import { IS_TAURI, safeInvoke } from '../utils/env';
import {
  buildSyncEndpoints,
  countPendingQueueEndpoint,
  runHybridSync,
  type HybridSyncResult,
} from './hybridSyncEngine';
import { buildKasaInboundFilter } from './hybridSyncService';
import {
  DB_SETTINGS,
  LOCAL_CONFIG,
  REMOTE_CONFIG,
  resolveHybridSyncConnectionProvider,
} from './postgres';

export type KasaPullContext = {
  storeId: string;
  terminalName: string;
};

export type MposPullResult = {
  synced: number;
  failed: number;
  pending_inbound: number;
  message?: string;
};

export async function resolveKasaPullContext(
  fallbackStoreId?: string | null,
): Promise<KasaPullContext | null> {
  if (IS_TAURI) {
    try {
      const cfg: Record<string, unknown> = await safeInvoke('get_app_config');
      const terminalName = String(cfg?.terminal_name ?? '').trim();
      const storeId = String(cfg?.store_id ?? fallbackStoreId ?? '').trim();
      if (!terminalName || !storeId) return null;
      return { storeId, terminalName };
    } catch {
      return null;
    }
  }

  let terminalName = '';
  let storeId = String(fallbackStoreId ?? '').trim();
  try {
    const raw = localStorage.getItem('retailex_web_config');
    if (raw) {
      const cfg = JSON.parse(raw) as Record<string, unknown>;
      terminalName = String(cfg?.terminal_name ?? '').trim();
      if (!storeId) storeId = String(cfg?.store_id ?? '').trim();
    }
  } catch {
    /* ignore */
  }
  if (!terminalName || !storeId) return null;
  return { storeId, terminalName };
}

export async function countInboundMasterPending(ctx: KasaPullContext): Promise<number> {
  if (DB_SETTINGS.activeMode !== 'hybrid') return 0;
  const filter = buildKasaInboundFilter(ctx);
  const { remote } = buildSyncEndpoints({
    local: LOCAL_CONFIG,
    remote: REMOTE_CONFIG,
    connectionProvider: resolveHybridSyncConnectionProvider(),
    remoteRestUrl: DB_SETTINGS.remoteRestUrl,
  });
  return countPendingQueueEndpoint(remote, filter);
}

export async function pullInboundMasterNow(
  ctx?: KasaPullContext | null,
): Promise<MposPullResult> {
  const resolved = ctx ?? (await resolveKasaPullContext());
  if (!resolved) {
    return { synced: 0, failed: 0, pending_inbound: 0, message: 'Kasa bağlamı tanımlı değil.' };
  }

  if (IS_TAURI) {
    const r = await safeInvoke<{ synced: number; failed: number; pending_inbound: number }>(
      'mpos_pull_master_now',
    );
    return {
      synced: Number(r?.synced ?? 0),
      failed: Number(r?.failed ?? 0),
      pending_inbound: Number(r?.pending_inbound ?? 0),
    };
  }

  const result: HybridSyncResult = await runHybridSync({
    flow: 'receive',
    scope: 'all',
    filter: buildKasaInboundFilter(resolved),
    local: LOCAL_CONFIG,
    remote: REMOTE_CONFIG,
    connectionProvider: resolveHybridSyncConnectionProvider(),
    remoteRestUrl: DB_SETTINGS.remoteRestUrl,
  });

  const pending = await countInboundMasterPending(resolved).catch(() => 0);
  return {
    synced: result.totalSynced,
    failed: result.failed,
    pending_inbound: pending,
    message: result.message,
  };
}

export type KasaAutoPullState = {
  pendingInbound: number;
  lastPullAt: string | null;
  isKasa: boolean;
};

/** Kasa terminalinde inbound bekleyen sayısı + otomatik çekim (web) */
export function startKasaAutoPullLoop(opts?: {
  storeId?: string | null;
  intervalSec?: number;
  onUpdate?: (state: KasaAutoPullState) => void;
}): () => void {
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
    } catch {
      opts.onUpdate({ pendingInbound: 0, lastPullAt, isKasa: true });
    }
  };

  const tick = async () => {
    if (cancelled || DB_SETTINGS.activeMode !== 'hybrid') return;
    const ctx = await resolveKasaPullContext(opts?.storeId);
    const isKasa = !!ctx;

    if (!IS_TAURI && isKasa && ctx) {
      try {
        await pullInboundMasterNow(ctx);
        lastPullAt = new Date().toISOString();
      } catch {
        /* ağ / PG geçici hata */
      }
    }

    await emit(ctx, isKasa);
  };

  void tick();
  const sec = opts?.intervalSec ?? DB_SETTINGS.hybridSyncIntervalSec ?? 30;
  const id = window.setInterval(() => void tick(), Math.max(5, sec) * 1000);
  return () => {
    cancelled = true;
    window.clearInterval(id);
  };
}
