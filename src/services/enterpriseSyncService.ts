/**
 * Merkezi veri yönetimi ↔ PostgreSQL sync_queue + hibrit senkron köprüsü.
 * MPOS Kalem benzeri: merkezden şubelere gönder (master data), şubelerden merkeze al (satış/hareket).
 */

import {
  DB_SETTINGS,
  ERP_SETTINGS,
  LOCAL_CONFIG,
  REMOTE_CONFIG,
  getCentralRemotePgConfig,
  resolveHybridSyncConnectionProvider,
  shouldUseCentralApi,
} from './postgres';
import {
  prepareLocalSyncQueue,
  queryPgRows,
  runHybridSync,
  type PgEndpointConfig,
} from './hybridSyncEngine';
import { listPosTerminalRegistrations } from './deviceRegistrationService';
import { isCentralPgConfigured, queryCentralPgRows } from './centralRpcService';
import { postgrest } from './api/postgrestClient';
import {
  fetchStoreDevicesPresence,
  resolveDeviceOnlineStatus,
} from './deviceOnlineStatusService';

export type EnterpriseSyncDevice = {
  deviceId: string;
  deviceName: string;
  firmNr?: string;
  firmName?: string;
  storeId?: string;
  storeName?: string;
  computerName?: string;
  appVersion?: string;
  isOnline: boolean;
  /** WS canlı mı, yoksa 24s yedek mi */
  onlineSource?: 'websocket' | 'fallback' | 'none';
  onlineLabel?: string;
  lastSeen: number;
  pendingMessages: number;
  deliveredMessages?: number;
  failedMessages?: number;
};

export type EnterpriseSyncMessage = {
  id: string;
  type: string;
  action: string;
  status: 'pending' | 'completed' | 'failed' | 'processing';
  tableName: string;
  recordId: string;
  createdAt: number;
  syncedAt?: number;
  errorMessage?: string;
  data?: Record<string, unknown>;
  firmNr: string;
  targetDevices: string[];
  terminalName?: string;
  targetStoreId?: string;
};

export type EnterpriseSyncStats = {
  totalDevices: number;
  onlineDevices: number;
  pendingBroadcasts: number;
  deliveredBroadcasts: number;
  failedBroadcasts: number;
  successRate: number;
  last24hBroadcasts: number;
  last24hSuccess: number;
  last24hFailed: number;
  totalDataTransferred: number;
  scheduledBroadcasts: number;
};

function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

/** Senkron kuyruğunun yazılacağı PG uç noktası */
export function resolveSyncPgEndpoint(): PgEndpointConfig {
  if (DB_SETTINGS.activeMode === 'hybrid') return LOCAL_CONFIG;
  if (DB_SETTINGS.activeMode === 'online') {
    if (shouldUseCentralApi()) return LOCAL_CONFIG;
    if (REMOTE_CONFIG.isConfigured || isCentralPgConfigured()) {
      return getCentralRemotePgConfig();
    }
    return LOCAL_CONFIG;
  }
  return LOCAL_CONFIG;
}

function tableForBroadcastType(type: string): string | null {
  const f = firmNrPadded();
  switch (type) {
    case 'product':
    case 'price':
    case 'inventory':
      return `rex_${f}_products`;
    case 'customer':
      return `rex_${f}_customers`;
    case 'campaign':
      return `rex_${f}_campaigns`;
    default:
      return null;
  }
}

function inferTypeFromTable(tableName: string): string {
  if (tableName.includes('_products')) return 'product';
  if (tableName.includes('_customers')) return 'customer';
  if (tableName.includes('_suppliers')) return 'customer';
  if (tableName.includes('_campaigns')) return 'campaign';
  if (tableName.includes('_sales')) return 'sale';
  return 'custom';
}

function mapSyncAction(action: string): string {
  const a = action.toUpperCase();
  if (a === 'INSERT' || a === 'CREATE') return 'create';
  if (a === 'DELETE') return 'delete';
  if (a === 'UPDATE') return 'update';
  return 'sync';
}

type KasaQueueStats = {
  pending: number;
  delivered: number;
  failed: number;
  lastSyncMs: number;
};

async function queryEnterprisePgRows(
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  if (shouldUseCentralApi()) {
    throw new Error('Merkez SQL devre dışı; PostgREST/API kullanın.');
  }
  if (isCentralPgConfigured()) {
    try {
      return await queryCentralPgRows<Record<string, unknown>>(sql, params);
    } catch {
      /* merkez sorgusu başarısız — yerel sync PG dene */
    }
  }
  return queryPgRows(resolveSyncPgEndpoint(), sql, params);
}

async function fetchKasaQueueStatsMap(): Promise<Map<string, KasaQueueStats>> {
  const map = new Map<string, KasaQueueStats>();
  try {
    if (shouldUseCentralApi()) {
      const rows = await postgrest.get<Record<string, unknown>[]>(
        '/sync_queue',
        {
          select: 'terminal_name,target_store_id,status,retry_count,synced_at,created_at',
          limit: '5000',
        },
        { schema: 'public' },
      );
      for (const r of rows || []) {
        const tname = String(r.terminal_name ?? '');
        const sid = r.target_store_id != null ? String(r.target_store_id) : '';
        const key = `${tname}|${sid}`;
        const stats = map.get(key) ?? { pending: 0, delivered: 0, failed: 0, lastSyncMs: 0 };
        const status = String(r.status ?? '');
        const retry = Number(r.retry_count ?? 0);
        if (status === 'pending' && retry < 10) stats.pending += 1;
        else if (status === 'completed') {
          stats.delivered += 1;
          const ts = r.synced_at ?? r.created_at;
          if (ts) {
            const ms = new Date(String(ts)).getTime();
            if (Number.isFinite(ms) && ms > stats.lastSyncMs) stats.lastSyncMs = ms;
          }
        } else if (status === 'pending' && retry >= 10) stats.failed += 1;
        map.set(key, stats);
      }
      return map;
    }

    const rows = await queryEnterprisePgRows(
      `SELECT COALESCE(terminal_name, '') AS tname,
              target_store_id::text AS sid,
              COUNT(*) FILTER (WHERE status = 'pending' AND COALESCE(retry_count, 0) < 10)::text AS pending,
              COUNT(*) FILTER (WHERE status = 'completed')::text AS delivered,
              COUNT(*) FILTER (WHERE status = 'pending' AND COALESCE(retry_count, 0) >= 10)::text AS failed,
              MAX(COALESCE(synced_at, created_at)) FILTER (WHERE status = 'completed')::text AS last_sync
       FROM sync_queue
       GROUP BY COALESCE(terminal_name, ''), target_store_id`,
      [],
    );
    for (const r of rows) {
      const key = `${String(r.tname ?? '')}|${String(r.sid ?? '')}`;
      map.set(key, {
        pending: Number(r.pending ?? 0),
        delivered: Number(r.delivered ?? 0),
        failed: Number(r.failed ?? 0),
        lastSyncMs: r.last_sync ? new Date(String(r.last_sync)).getTime() : 0,
      });
    }
  } catch {
    /* sync_queue yok */
  }
  return map;
}

export async function loadEnterpriseDevices(): Promise<EnterpriseSyncDevice[]> {
  const terminals = await listPosTerminalRegistrations({
    status: 'approved',
    allFirms: true,
    limit: 500,
  });
  if (!terminals.length) return [];

  const [statsMap, wsPresenceList] = await Promise.all([
    fetchKasaQueueStatsMap(),
    fetchStoreDevicesPresence(),
  ]);
  const wsMap = new Map(wsPresenceList.map((p) => [p.deviceId, p]));

  return terminals.map((t) => {
    const key = `${t.terminalName || ''}|${t.storeId || ''}`;
    const q = statsMap.get(key);
    const regSeen = t.lastSeenAt ?? 0;
    const syncSeen = q?.lastSyncMs ?? 0;
    const fallbackMs = Math.max(regSeen, syncSeen);
    const online = resolveDeviceOnlineStatus({
      wsPresence: wsMap.get(t.deviceId) ?? null,
      fallbackLastSeenMs: fallbackMs > 0 ? fallbackMs : null,
    });
    return {
      deviceId: t.deviceId,
      deviceName: t.terminalName,
      firmNr: t.firmNr,
      firmName: t.firmName,
      storeId: t.storeId,
      storeName: t.storeName,
      computerName: t.computerName,
      appVersion: t.appVersion,
      isOnline: online.state === 'online',
      onlineSource: online.source,
      onlineLabel: online.label,
      lastSeen: online.lastSeenAt ? Date.parse(online.lastSeenAt) : fallbackMs || Date.now(),
      pendingMessages: q?.pending ?? 0,
      deliveredMessages: q?.delivered ?? 0,
      failedMessages: q?.failed ?? 0,
    };
  });
}

export async function getEnterpriseSyncStats(): Promise<EnterpriseSyncStats> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();

  let pending = 0;
  let completed = 0;
  let failed = 0;
  let last24h = 0;
  let last24hOk = 0;
  let last24hFail = 0;

  try {
    const rows = await queryPgRows(
      pg,
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
         COUNT(*) FILTER (WHERE status = 'completed')::text AS completed,
         COUNT(*) FILTER (WHERE status = 'pending' AND retry_count >= 10)::text AS failed,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS h24,
         COUNT(*) FILTER (WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '24 hours')::text AS h24ok,
         COUNT(*) FILTER (WHERE status = 'pending' AND retry_count >= 10 AND created_at >= NOW() - INTERVAL '24 hours')::text AS h24fail
       FROM sync_queue
       WHERE firm_nr = $1 OR lpad(ltrim(firm_nr, '0'), 3, '0') = $1`,
      [firm],
    );
    const r = rows[0] ?? {};
    pending = Number(r.pending ?? 0);
    completed = Number(r.completed ?? 0);
    failed = Number(r.failed ?? 0);
    last24h = Number(r.h24 ?? 0);
    last24hOk = Number(r.h24ok ?? 0);
    last24hFail = Number(r.h24fail ?? 0);
  } catch {
    /* sync_queue yok */
  }

  const devices = await loadEnterpriseDevices();
  const totalDone = completed + failed;
  const successRate = totalDone > 0 ? (completed / totalDone) * 100 : 100;

  return {
    totalDevices: devices.length,
    onlineDevices: devices.filter((d) => d.isOnline).length,
    pendingBroadcasts: pending,
    deliveredBroadcasts: completed,
    failedBroadcasts: failed,
    successRate: Math.round(successRate * 10) / 10,
    last24hBroadcasts: last24h,
    last24hSuccess: last24hOk,
    last24hFailed: last24hFail,
    totalDataTransferred: 0,
    scheduledBroadcasts: 0,
  };
}

export async function listEnterpriseSyncMessages(opts?: {
  limit?: number;
  status?: 'all' | 'pending' | 'completed' | 'error';
  terminalName?: string;
  targetStoreId?: string;
}): Promise<EnterpriseSyncMessage[]> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  const limit = opts?.limit ?? 50;

  let statusSql = '';
  if (opts?.status === 'pending') statusSql = ` AND status = 'pending'`;
  else if (opts?.status === 'completed') statusSql = ` AND status = 'completed'`;
  else if (opts?.status === 'error') statusSql = ` AND status = 'pending' AND retry_count >= 10`;

  let terminalSql = '';
  const params: unknown[] = [firm, limit];
  if (opts?.terminalName?.trim()) {
    params.push(opts.terminalName.trim());
    terminalSql = ` AND terminal_name = $${params.length}`;
  }
  if (opts?.targetStoreId) {
    params.push(opts.targetStoreId);
    terminalSql += ` AND (target_store_id = $${params.length}::uuid OR source_store_id = $${params.length}::uuid)`;
  }

  try {
    const rows = await queryPgRows(
      pg,
      `SELECT id::text, table_name, record_id::text, action, firm_nr, status,
              data, error_message, created_at, synced_at, retry_count,
              terminal_name, target_store_id::text
       FROM sync_queue
       WHERE (firm_nr = $1 OR lpad(ltrim(firm_nr, '0'), 3, '0') = $1)
         ${statusSql}${terminalSql}
       ORDER BY created_at DESC
       LIMIT $2`,
      params,
    );

    return rows.map((r: Record<string, unknown>) => {
      const tableName = String(r.table_name ?? '');
      const st = String(r.status ?? 'pending');
      const retryFail = st === 'pending' && Number(r.retry_count ?? 0) >= 10;
      return {
        id: String(r.id),
        type: inferTypeFromTable(tableName),
        action: mapSyncAction(String(r.action ?? 'UPDATE')),
        status: retryFail ? 'failed' : st === 'completed' ? 'completed' : st === 'processing' ? 'processing' : 'pending',
        tableName,
        recordId: String(r.record_id ?? ''),
        createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
        syncedAt: r.synced_at ? new Date(String(r.synced_at)).getTime() : undefined,
        errorMessage: r.error_message ? String(r.error_message) : undefined,
        data:
          r.data && typeof r.data === 'object'
            ? (r.data as Record<string, unknown>)
            : r.data
              ? JSON.parse(String(r.data))
              : undefined,
        firmNr: String(r.firm_nr ?? firm),
        targetDevices: ['all'],
        terminalName: r.terminal_name ? String(r.terminal_name) : undefined,
        targetStoreId: r.target_store_id ? String(r.target_store_id) : undefined,
      };
    });
  } catch {
    return [];
  }
}

/** Tek kaydı sync_queue'ya ekle (tam satır verisi PG'den). */
export async function enqueueEnterpriseRecord(opts: {
  type: string;
  recordId: string;
  action?: string;
  targetStoreId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const table = tableForBroadcastType(opts.type);
  if (!table) {
    return { ok: false, message: `Desteklenmeyen veri tipi: ${opts.type}` };
  }

  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  const recordId = opts.recordId;
  const action = (opts.action ?? 'UPDATE').toUpperCase();

  try {
    const rows = await queryPgRows(
      pg,
      `SELECT to_jsonb(t) AS data FROM ${table} t WHERE id = $1::uuid LIMIT 1`,
      [recordId],
    );
    if (!rows.length) {
      return { ok: false, message: 'Kayıt veritabanında bulunamadı.' };
    }

    const data = rows[0].data;
    const storeId = opts.targetStoreId && opts.targetStoreId !== 'all' ? opts.targetStoreId : null;

    await queryPgRows(
      pg,
      `INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data, target_store_id, status)
       VALUES ($1, $2::uuid, $3, $4, $5::jsonb, $6::uuid, 'pending')`,
      [table, recordId, action, firm, JSON.stringify(data), storeId],
    );

    return { ok: true, message: `${table} kuyruğa eklendi.` };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** MPOS: Merkez → şube master veri gönder */
export async function pushMasterDataToBranches(opts?: {
  type?: string;
  recordId?: string;
  targetStoreId?: string | null;
}): Promise<{ ok: boolean; message: string; synced: number }> {
  if (opts?.type && opts.recordId) {
    const enq = await enqueueEnterpriseRecord({
      type: opts.type,
      recordId: opts.recordId,
      targetStoreId: opts.targetStoreId,
    });
    if (!enq.ok) return { ok: false, message: enq.message, synced: 0 };
  } else {
    await prepareLocalSyncQueue(LOCAL_CONFIG, firmNrPadded());
  }

  if (DB_SETTINGS.activeMode !== 'hybrid') {
    const pending = (await getEnterpriseSyncStats()).pendingBroadcasts;
    return {
      ok: true,
      message: `Merkez kuyruğunda ${pending} kayıt bekliyor. Şubeler «Al» ile çekebilir.`,
      synced: 0,
    };
  }

  const result = await runHybridSync({
    flow: 'send',
    direction: 'local_to_remote',
    scope: 'all',
    local: LOCAL_CONFIG,
    remote: getCentralRemotePgConfig(),
    connectionProvider: resolveHybridSyncConnectionProvider(),
    remoteRestUrl: DB_SETTINGS.remoteRestUrl,
    filter: { firmNr: firmNrPadded() },
  });

  return {
    ok: result.success,
    message: result.message ?? (result.success ? 'Gönderim tamamlandı.' : 'Gönderim başarısız.'),
    synced: result.totalSynced,
  };
}

/** MPOS: Şube → merkez satış/hareket al */
export async function pullBranchDataFromCenter(): Promise<{ ok: boolean; message: string; synced: number }> {
  if (DB_SETTINGS.activeMode !== 'hybrid') {
    const msgs = await listEnterpriseSyncMessages({ limit: 100, status: 'pending' });
    return {
      ok: true,
      message: `Merkezde ${msgs.length} bekleyen kayıt (şubelerden gelen).`,
      synced: msgs.length,
    };
  }

  const result = await runHybridSync({
    flow: 'receive',
    direction: 'remote_to_local',
    scope: 'all',
    local: LOCAL_CONFIG,
    remote: getCentralRemotePgConfig(),
    connectionProvider: resolveHybridSyncConnectionProvider(),
    remoteRestUrl: DB_SETTINGS.remoteRestUrl,
    filter: { firmNr: firmNrPadded() },
  });

  return {
    ok: result.success,
    message: result.message ?? (result.success ? 'Alma tamamlandı.' : 'Alma başarısız.'),
    synced: result.totalSynced,
  };
}

/** Kuyruktaki bekleyenleri işle (hibrit modda gönder+al). */
export async function processEnterpriseSyncQueue(): Promise<{ ok: boolean; message: string }> {
  if (DB_SETTINGS.activeMode !== 'hybrid') {
    const stats = await getEnterpriseSyncStats();
    return {
      ok: true,
      message: `Kuyruk: ${stats.pendingBroadcasts} bekleyen, ${stats.deliveredBroadcasts} tamamlanan.`,
    };
  }

  const result = await runHybridSync({
    flow: 'both',
    direction: 'bidirectional',
    scope: 'all',
    local: LOCAL_CONFIG,
    remote: getCentralRemotePgConfig(),
    connectionProvider: resolveHybridSyncConnectionProvider(),
    remoteRestUrl: DB_SETTINGS.remoteRestUrl,
    filter: { firmNr: firmNrPadded() },
  });

  return {
    ok: result.success,
    message: result.message ?? 'Senkron tamamlandı.',
  };
}

export function resolveRecordIdFromForm(type: string, formData: Record<string, unknown>): string | null {
  switch (type) {
    case 'product':
      return formData.productId ? String(formData.productId) : null;
    case 'price':
    case 'inventory':
      return formData.priceProductId
        ? String(formData.priceProductId)
        : formData.inventoryProductId
          ? String(formData.inventoryProductId)
          : null;
    case 'customer':
      return formData.customerId ? String(formData.customerId) : null;
    case 'campaign':
      return formData.campaignId ? String(formData.campaignId) : null;
    default:
      return null;
  }
}

/** MPOS Kalem: malzeme/cari toplu gönderim filtresi (KLR-2234) */
export type EnterpriseBulkFilter = {
  type: 'product' | 'customer';
  search?: string;
  categoryCode?: string;
  changedSince?: string;
  /** Değişenler modu — üst tarih sınırı (YYYY-MM-DD, gün sonu dahil) */
  changedUntil?: string;
  onlyActive?: boolean;
  onlyChanged?: boolean;
  limit?: number;
  targetStoreId?: string | null;
};

function periodSalesTable(): string {
  const f = firmNrPadded();
  const p = String(ERP_SETTINGS.periodNr || '01')
    .replace(/\D/g, '')
    .padStart(2, '0');
  return `rex_${f}_${p}_sales`;
}

/** MPOS: Malzeme veya cari kayıtlarını filtreye göre kuyruğa ekle */
export async function enqueueEnterpriseBulk(
  filter: EnterpriseBulkFilter,
): Promise<{ ok: boolean; message: string; count: number }> {
  const table = tableForBroadcastType(filter.type);
  if (!table) {
    return { ok: false, message: `Desteklenmeyen tip: ${filter.type}`, count: 0 };
  }

  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  const limit = Math.min(Math.max(filter.limit ?? 500, 1), 5000);
  const search = filter.search?.trim() || null;
  const categoryCode = filter.categoryCode?.trim() || null;
  const onlyActive = filter.onlyActive !== false;
  const changedSince =
    filter.changedSince?.trim() ||
    (filter.onlyChanged ? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) : null);
  const changedUntil = filter.changedUntil?.trim() || null;
  const storeId =
    filter.targetStoreId && filter.targetStoreId !== 'all' ? filter.targetStoreId : null;

  try {
    const rows = await queryPgRows(
      pg,
      `SELECT t.id::text AS id, to_jsonb(t) AS data
       FROM ${table} t
       WHERE ($1::text IS NULL OR t.name ILIKE '%' || $1 || '%'
              OR COALESCE(t.barcode, '') ILIKE '%' || $1 || '%'
              OR COALESCE(t.code, '') ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR COALESCE(t.category_code, t.categorycode, '') = $2)
         AND ($3::boolean IS false OR COALESCE(t.is_active, true) = true)
         AND ($4::date IS NULL OR t.updated_at >= $4::date)
         AND ($6::date IS NULL OR t.updated_at < ($6::date + interval '1 day'))
       ORDER BY t.updated_at DESC NULLS LAST
       LIMIT $5`,
      [search, categoryCode, onlyActive, changedSince, limit, changedUntil],
    );

    if (!rows.length) {
      return { ok: false, message: 'Filtreye uyan kayıt bulunamadı.', count: 0 };
    }

    let inserted = 0;
    for (const row of rows) {
      try {
        await queryPgRows(
          pg,
          `INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data, target_store_id, status)
           SELECT $1, $2::uuid, 'UPDATE', $3, $4::jsonb, $5::uuid, 'pending'
           WHERE NOT EXISTS (
             SELECT 1 FROM sync_queue sq
             WHERE sq.table_name = $1 AND sq.record_id = $2::uuid AND sq.status = 'pending'
           )`,
          [table, row.id, firm, JSON.stringify(row.data), storeId],
        );
        inserted += 1;
      } catch {
        /* tek kayıt atla */
      }
    }

    return {
      ok: true,
      message: `${inserted} kayıt kuyruğa eklendi (${filter.type === 'product' ? 'malzeme' : 'cari'}).`,
      count: inserted,
    };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), count: 0 };
  }
}

/** MPOS: tüm master veriyi backfill ile kuyruğa al */
export async function enqueueAllMasterData(
  type: 'product' | 'customer' | 'all' = 'all',
  opts?: { targetStoreId?: string | null },
): Promise<{ ok: boolean; message: string; count: number }> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  const targetStoreId = opts?.targetStoreId ?? null;

  if (type === 'all' && !targetStoreId) {
    const prep = await prepareLocalSyncQueue(pg, firm);
    return {
      ok: true,
      message: `Backfill: ${prep.enqueued} kayıt kuyruğa eklendi, ${prep.reset} tükenmiş sıfırlandı.`,
      count: prep.enqueued,
    };
  }

  if (type === 'all') {
    const prod = await enqueueEnterpriseBulk({
      type: 'product',
      onlyActive: true,
      limit: 5000,
      targetStoreId,
    });
    const cust = await enqueueEnterpriseBulk({
      type: 'customer',
      onlyActive: true,
      limit: 5000,
      targetStoreId,
    });
    const count = prod.count + cust.count;
    return {
      ok: prod.ok || cust.ok,
      message: `Master veri: ${count} kayıt kuyruğa eklendi (malzeme ${prod.count}, cari ${cust.count}).`,
      count,
    };
  }

  return enqueueEnterpriseBulk({
    type,
    onlyActive: true,
    limit: 5000,
    targetStoreId,
  });
}

export async function clearEnterpriseSyncQueue(
  mode: 'completed' | 'all',
): Promise<{ ok: boolean; message: string; count: number }> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();

  try {
    const sql =
      mode === 'all'
        ? `DELETE FROM sync_queue
           WHERE firm_nr = $1 OR lpad(ltrim(firm_nr, '0'), 3, '0') = $1`
        : `DELETE FROM sync_queue
           WHERE status = 'completed'
             AND (firm_nr = $1 OR lpad(ltrim(firm_nr, '0'), 3, '0') = $1)`;
    const rows = await queryPgRows(pg, `${sql} RETURNING id::text AS id`, [firm]);
    return {
      ok: true,
      message: `${rows.length} kayıt silindi.`,
      count: rows.length,
    };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), count: 0 };
  }
}

export async function retryEnterpriseSyncMessage(id: string): Promise<{ ok: boolean; message: string }> {
  const pg = resolveSyncPgEndpoint();
  try {
    await queryPgRows(
      pg,
      `UPDATE sync_queue
       SET status = 'pending', retry_count = 0, error_message = NULL, created_at = NOW()
       WHERE id = $1::uuid`,
      [id],
    );
    return { ok: true, message: 'Kayıt yeniden kuyruğa alındı.' };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelEnterpriseSyncMessage(id: string): Promise<{ ok: boolean; message: string }> {
  const pg = resolveSyncPgEndpoint();
  try {
    await queryPgRows(pg, `DELETE FROM sync_queue WHERE id = $1::uuid AND status = 'pending'`, [id]);
    return { ok: true, message: 'Bekleyen kayıt iptal edildi.' };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export type DayEndStoreStatus = {
  storeId: string;
  storeName: string;
  storeCode: string;
  salesPending: number;
  salesSyncedToday: number;
  lastSyncAt?: number;
  isOnline: boolean;
};

/** Kasa bazlı günlük M-POS durumu (KLR-2273 — yalnızca bugünün verisi) */
export type MposTerminalDailyStatus = {
  deviceId: string;
  terminalName: string;
  storeId: string;
  storeName: string;
  storeCode: string;
  sendCompletedToday: number;
  receiveCompletedToday: number;
  salesPending: number;
  dayEndReceivedToday: boolean;
  lastReceiveAt?: number;
  status: 'ok' | 'not_received' | 'offline';
};

/** MPOS: günsonu / satış alma durumu — kasa bazında (KLR-2273 benzeri) */
export async function getMposTerminalDailyStatus(opts?: {
  storeId?: string;
}): Promise<MposTerminalDailyStatus[]> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  const salesTable = periodSalesTable();

  try {
    const params: unknown[] = [firm, salesTable];
    let storeFilter = '';
    if (opts?.storeId) {
      storeFilter = ' AND r.store_id = $3::uuid';
      params.push(opts.storeId);
    }

    const rows = await queryPgRows(
      pg,
      `SELECT
         r.device_id::text AS device_id,
         r.terminal_name,
         r.store_id::text AS store_id,
         s.code AS store_code,
         s.name AS store_name,
         COALESCE(send_cnt.cnt, 0)::text AS send_today,
         COALESCE(recv_cnt.cnt, 0)::text AS recv_today,
         COALESCE(pend.cnt, 0)::text AS sales_pending,
         COALESCE(day_end.cnt, 0)::text AS day_end_today,
         recv_last.last_at::text AS last_receive
       FROM pos_terminal_registrations r
       JOIN stores s ON s.id = r.store_id
       LEFT JOIN (
         SELECT terminal_name, target_store_id, COUNT(*) AS cnt
         FROM sync_queue
         WHERE status = 'completed'
           AND target_store_id IS NOT NULL
           AND synced_at >= CURRENT_DATE
           AND terminal_name IS NOT NULL
         GROUP BY terminal_name, target_store_id
       ) send_cnt ON send_cnt.terminal_name = r.terminal_name
         AND send_cnt.target_store_id = r.store_id
       LEFT JOIN (
         SELECT terminal_name, source_store_id, COUNT(*) AS cnt
         FROM sync_queue
         WHERE status = 'completed'
           AND source_store_id IS NOT NULL
           AND synced_at >= CURRENT_DATE
           AND table_name LIKE 'mpos_receive_%'
         GROUP BY terminal_name, source_store_id
       ) recv_cnt ON recv_cnt.terminal_name = r.terminal_name
         AND recv_cnt.source_store_id = r.store_id
       LEFT JOIN (
         SELECT source_store_id, COUNT(*) AS cnt
         FROM sync_queue
         WHERE status = 'pending' AND table_name = $2
         GROUP BY source_store_id
       ) pend ON pend.source_store_id = r.store_id
       LEFT JOIN (
         SELECT terminal_name, source_store_id, COUNT(*) AS cnt
         FROM sync_queue
         WHERE status = 'completed'
           AND table_name = 'mpos_receive_day_end'
           AND synced_at >= CURRENT_DATE
         GROUP BY terminal_name, source_store_id
       ) day_end ON day_end.terminal_name = r.terminal_name
         AND day_end.source_store_id = r.store_id
       LEFT JOIN (
         SELECT terminal_name, source_store_id, MAX(synced_at) AS last_at
         FROM sync_queue
         WHERE status = 'completed'
           AND source_store_id IS NOT NULL
           AND table_name LIKE 'mpos_receive_%'
         GROUP BY terminal_name, source_store_id
       ) recv_last ON recv_last.terminal_name = r.terminal_name
         AND recv_last.source_store_id = r.store_id
       WHERE r.firm_nr = $1 AND r.status = 'approved'${storeFilter}
       ORDER BY s.name, r.terminal_name`,
      params,
    );

    const dayMs = 86400000;
    return rows.map((r: Record<string, unknown>) => {
      const lastReceiveAt = r.last_receive
        ? new Date(String(r.last_receive)).getTime()
        : undefined;
      const dayEndToday = Number(r.day_end_today ?? 0) > 0;
      const recvToday = Number(r.recv_today ?? 0) > 0;
      const isRecent = lastReceiveAt ? Date.now() - lastReceiveAt < dayMs : false;

      let status: MposTerminalDailyStatus['status'] = 'not_received';
      if (dayEndToday || recvToday) status = 'ok';
      else if (isRecent) status = 'ok';
      else if (lastReceiveAt) status = 'offline';

      return {
        deviceId: String(r.device_id),
        terminalName: String(r.terminal_name ?? ''),
        storeId: String(r.store_id),
        storeName: String(r.store_name ?? ''),
        storeCode: String(r.store_code ?? ''),
        sendCompletedToday: Number(r.send_today ?? 0),
        receiveCompletedToday: Number(r.recv_today ?? 0),
        salesPending: Number(r.sales_pending ?? 0),
        dayEndReceivedToday: dayEndToday,
        lastReceiveAt,
        status,
      };
    });
  } catch {
    return [];
  }
}

/** MPOS: günsonu / satış alma durumu — mağaza bazında */
export async function getDayEndSyncStatus(): Promise<DayEndStoreStatus[]> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  const salesTable = periodSalesTable();

  try {
    const rows = await queryPgRows(
      pg,
      `SELECT s.id::text AS store_id, s.code, s.name,
              COALESCE(p.cnt, 0)::text AS sales_pending,
              COALESCE(d.cnt, 0)::text AS synced_today,
              ls.last_sync::text AS last_sync
       FROM stores s
       LEFT JOIN (
         SELECT source_store_id::text AS sid, COUNT(*) AS cnt
         FROM sync_queue
         WHERE status = 'pending' AND table_name = $2
         GROUP BY source_store_id
       ) p ON p.sid = s.id::text
       LEFT JOIN (
         SELECT source_store_id::text AS sid, COUNT(*) AS cnt
         FROM sync_queue
         WHERE status = 'completed' AND table_name = $2
           AND synced_at >= CURRENT_DATE
         GROUP BY source_store_id
       ) d ON d.sid = s.id::text
       LEFT JOIN (
         SELECT COALESCE(source_store_id, target_store_id)::text AS sid,
                MAX(synced_at) AS last_sync
         FROM sync_queue
         WHERE status = 'completed'
         GROUP BY COALESCE(source_store_id, target_store_id)
       ) ls ON ls.sid = s.id::text
       WHERE s.firm_nr = $1 AND COALESCE(s.is_active, true) = true
       ORDER BY s.name`,
      [firm, salesTable],
    );

    const dayMs = 86400000;
    return rows.map((r: Record<string, unknown>) => {
      const lastSyncAt = r.last_sync ? new Date(String(r.last_sync)).getTime() : undefined;
      return {
        storeId: String(r.store_id),
        storeName: String(r.name ?? ''),
        storeCode: String(r.code ?? ''),
        salesPending: Number(r.sales_pending ?? 0),
        salesSyncedToday: Number(r.synced_today ?? 0),
        lastSyncAt,
        isOnline: lastSyncAt ? Date.now() - lastSyncAt < dayMs : false,
      };
    });
  } catch {
    return [];
  }
}

/** MPOS: şubelerden satış/günsonu verisi al */
export async function pullSalesAndDayEndFromBranches(): Promise<{
  ok: boolean;
  message: string;
  synced: number;
}> {
  const result = await pullBranchDataFromCenter();
  const status = await getDayEndSyncStatus();
  const pendingTotal = status.reduce((s, x) => s + x.salesPending, 0);
  const offline = status.filter((s) => !s.isOnline).length;

  let msg = result.message;
  if (result.ok) {
    msg = `Satış/günsonu alındı: ${result.synced} kayıt. Bekleyen satış: ${pendingTotal}`;
    if (offline > 0) msg += ` · ${offline} kasa 24 saatten uzun süredir veri almamış.`;
  }

  return { ok: result.ok, message: msg, synced: result.synced };
}
