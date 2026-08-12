/**
 * Masaüstü kasa cihaz kaydı ve merkez onay akışı.
 * Yalnızca hibrit mod + terminal (client) rolünde: merkeze kayıt → web onayı → giriş.
 */

import { APP_SEMVER } from '../core/version';
import { IS_TAURI, safeInvoke, getBridgeUrl } from '../utils/env';
import { postgrest } from './api/postgrestClient';
import { getPostgrestBaseUrl } from '../config/postgrest.config';
import { DB_SETTINGS, ERP_SETTINGS, REMOTE_CONFIG, getCentralRemotePgConfig, postgres, shouldUseCentralApi } from './postgres';
import { parseSaaSOrCustomPostgrestUrl, resolveEffectiveRemoteRestUrl } from './merkezTenantRegistry';

export type PosTerminalStatus = 'pending' | 'approved' | 'rejected' | 'blocked' | 'not_registered';

export type DevicePlacementOption = {
  id: string;
  code: string;
  name: string;
};

/** Tauri get_device_info + config birleşimi (ilsasupport destek paneli benzeri) */
export type DesktopDeviceInfo = {
  deviceId: string;
  terminalName: string;
  firmNr: string;
  role: string;
  storeId?: string | null;
  computerName?: string;
  hostname?: string;
  osUser?: string;
  osPlatform?: string;
  osArch?: string;
  osVersion?: string;
  appVersion?: string;
  localIp?: string;
  timezone?: string;
  locale?: string;
  cpuCores?: number;
  collectedAt?: string;
};

export type PosTerminalRegistration = {
  id: string;
  deviceId: string;
  terminalName: string;
  storeId?: string;
  storeName?: string;
  storeCode?: string;
  firmNr: string;
  firmName?: string;
  status: PosTerminalStatus;
  role: string;
  hostname?: string;
  osUser?: string;
  appVersion?: string;
  computerName?: string;
  osPlatform?: string;
  osArch?: string;
  osVersion?: string;
  localIp?: string;
  timezone?: string;
  locale?: string;
  metadata?: Record<string, unknown>;
  registeredAt: number;
  lastSeenAt?: number;
  rejectedReason?: string;
};

export type ApprovePosTerminalPlacement = {
  storeId?: string | null;
  terminalName?: string | null;
  firmNr?: string | null;
};

function firmPadded(nr?: string): string {
  return String(nr || ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

/** Cihaz kaydı yalnızca hibrit modda geçerlidir. */
export function isHybridDeviceRegistrationMode(): boolean {
  return DB_SETTINGS.activeMode === 'hybrid';
}

/** Merkez cihaz kaydı/onay — remote_rest_url varken her zaman PostgREST (web yönetici paneli dahil). */
function useCentralPostgrest(): boolean {
  return String(DB_SETTINGS.remoteRestUrl || '').trim().length > 0;
}

/** Cihaz kaydı/onay — merkez uç; PostgREST slug (lovan) ile remote_db DB adını hizala. */
function resolveCentralPgConfig() {
  return getCentralRemotePgConfig();
}

function centralPgConfigured(): boolean {
  const remoteUrl = String(DB_SETTINGS.remoteRestUrl || '').trim();
  if (remoteUrl) return true;
  const cfg = resolveCentralPgConfig();
  return Boolean(cfg.host?.trim() && cfg.database?.trim() && cfg.user?.trim());
}

function describeCentralTarget(): string {
  const rest = resolveEffectiveRemoteRestUrl(
    DB_SETTINGS.remoteRestUrl,
    DB_SETTINGS.merkezTenantCode,
  );
  if (rest) {
    const parsed = parseSaaSOrCustomPostgrestUrl(rest);
    if (parsed.kind === 'saas_single_slug') {
      return `${rest} (kiracı DB: ${parsed.slug})`;
    }
    return rest;
  }
  const cfg = resolveCentralPgConfig();
  return `${cfg.host}:${cfg.port}/${cfg.database}`;
}

async function queryCentralPgRows<T = Record<string, unknown>>(
  sql: string,
  params: unknown[],
): Promise<T[]> {
  if (shouldUseCentralApi()) {
    throw new Error(
      'Merkez doğrudan PostgreSQL devre dışı. remote_rest_url (PostgREST) kullanın.',
    );
  }
  const config = resolveCentralPgConfig();
  if (!centralPgConfigured()) {
    throw new Error(
      'Merkez veritabanı yapılandırılmamış. Kurulumda remote_db ve PostgREST URL (remote_rest_url) kontrol edin.',
    );
  }

  const normalizedParams = params.map((p) => {
    if (p === null || p === undefined) return null;
    if (typeof p === 'object' && !(p instanceof Date)) {
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    }
    return p;
  });

  const effectiveHost = config.host === 'localhost' ? '127.0.0.1' : config.host;
  const connStr = `postgresql://${config.user}:${config.password}@${effectiveHost}:${config.port}/${config.database}`;

  if (IS_TAURI) {
    const resultJson: string = await safeInvoke('pg_query', {
      connStr,
      sql,
      params: normalizedParams,
    });
    return JSON.parse(resultJson) as T[];
  }

  const response = await fetch(`${getBridgeUrl()}/api/pg_query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connStr, sql, params: normalizedParams }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(String((errData as { error?: string }).error || 'Merkez PG sorgusu başarısız'));
  }
  const res = (await response.json()) as { rows?: T[] };
  return res.rows ?? [];
}

async function rpcCall<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const rpcBody: Record<string, unknown> = { ...body };
  if (fn === 'register_pos_terminal' && rpcBody.p_metadata === undefined) {
    rpcBody.p_metadata = {};
  }

  if (useCentralPostgrest()) {
    try {
      const res = await postgrest.post<T>(`/rpc/${fn}`, rpcBody, { schema: 'public' });
      const row = Array.isArray(res) ? res[0] : res;
      return row as T;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('PGRST203') || msg.includes('Could not choose the best candidate function')) {
        throw new Error(
          `${msg} — Merkez veritabanında migration 069 (register_pos_terminal tek overload) uygulanmalı.`,
        );
      }
      throw e;
    }
  }

  if (shouldUseCentralApi()) {
    throw new Error(`Merkez RPC ${fn}: PostgREST URL (remote_rest_url) zorunlu.`);
  }

  const keys = Object.keys(rpcBody);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT * FROM public.${fn}(${placeholders})`;
  const params = keys.map((k) => rpcBody[k]);

  const rows = await queryCentralPgRows<Record<string, unknown>>(sql, params);
  return (rows[0] ?? {}) as T;
}

function deviceInfoToMetadata(info: DesktopDeviceInfo): Record<string, unknown> {
  return {
    device_id: info.deviceId,
    terminal_name: info.terminalName,
    firm_nr: info.firmNr,
    role: info.role,
    store_id: info.storeId ?? null,
    computer_name: info.computerName ?? info.hostname ?? null,
    hostname: info.hostname ?? info.computerName ?? null,
    os_user: info.osUser ?? null,
    os_platform: info.osPlatform ?? null,
    os_arch: info.osArch ?? null,
    os_version: info.osVersion ?? null,
    app_version: info.appVersion ?? APP_SEMVER,
    local_ip: info.localIp ?? null,
    timezone: info.timezone ?? null,
    locale: info.locale ?? null,
    cpu_cores: info.cpuCores ?? null,
    collected_at: info.collectedAt ?? new Date().toISOString(),
  };
}

function mapRegistrationRow(row: Record<string, unknown>): PosTerminalRegistration {
  const meta =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : undefined;

  return {
    id: String(row.id),
    deviceId: String(row.device_id),
    terminalName: String(row.terminal_name),
    storeId: row.store_id ? String(row.store_id) : undefined,
    storeName: row.store_name ? String(row.store_name) : undefined,
    storeCode: row.store_code ? String(row.store_code) : undefined,
    firmNr: String(row.firm_nr),
    firmName: row.firm_name ? String(row.firm_name) : undefined,
    status: String(row.status) as PosTerminalStatus,
    role: String(row.role || 'client'),
    hostname: row.hostname ? String(row.hostname) : undefined,
    osUser: row.os_user ? String(row.os_user) : undefined,
    appVersion: row.app_version ? String(row.app_version) : undefined,
    computerName: row.computer_name ? String(row.computer_name) : undefined,
    osPlatform: row.os_platform ? String(row.os_platform) : undefined,
    osArch: row.os_arch ? String(row.os_arch) : undefined,
    osVersion: row.os_version ? String(row.os_version) : undefined,
    localIp: row.local_ip ? String(row.local_ip) : undefined,
    timezone: row.timezone ? String(row.timezone) : undefined,
    locale: row.locale ? String(row.locale) : undefined,
    metadata: meta,
    registeredAt: row.registered_at ? new Date(String(row.registered_at)).getTime() : Date.now(),
    lastSeenAt: row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : undefined,
    rejectedReason: row.rejected_reason ? String(row.rejected_reason) : undefined,
  };
}

/** Masaüstünde donanım/OS profilini topla (Tauri get_device_info) */
export async function collectDesktopDeviceMetadata(): Promise<DesktopDeviceInfo> {
  const firm = firmPadded();
  let deviceId = await postgres.getDeviceId();
  let terminalName = deviceId;
  let storeId: string | null = null;
  let role = 'client';

  if (IS_TAURI) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const cfg: {
        device_id?: string;
        terminal_name?: string;
        store_id?: string;
        role?: string;
        firm_nr?: string;
      } = await invoke('get_app_config');

      if (cfg.device_id?.trim()) deviceId = cfg.device_id.trim();
      terminalName = cfg.terminal_name?.trim() || deviceId;
      storeId = cfg.store_id?.trim() || null;
      role = String(cfg.role || 'client').toLowerCase();

      try {
        const hw = await invoke<{
          device_id?: string;
          computer_name?: string;
          os_user?: string;
          os_platform?: string;
          os_arch?: string;
          os_version?: string;
          app_version?: string;
          local_ip?: string | null;
          timezone?: string;
          locale?: string;
          cpu_cores?: number | null;
          collected_at?: string;
        }>('get_device_info');

        return {
          deviceId: hw.device_id?.trim() || deviceId,
          terminalName,
          firmNr: String(cfg.firm_nr || firm)
            .replace(/\D/g, '')
            .padStart(3, '0'),
          role,
          storeId,
          computerName: hw.computer_name,
          hostname: hw.computer_name,
          osUser: hw.os_user,
          osPlatform: hw.os_platform,
          osArch: hw.os_arch,
          osVersion: hw.os_version,
          appVersion: hw.app_version || APP_SEMVER,
          localIp: hw.local_ip ?? undefined,
          timezone: hw.timezone,
          locale: hw.locale,
          cpuCores: hw.cpu_cores ?? undefined,
          collectedAt: hw.collected_at || new Date().toISOString(),
        };
      } catch {
        /* get_device_info yok — config ile devam */
      }
    } catch {
      /* config okunamadı */
    }
  }

  return {
    deviceId,
    terminalName,
    firmNr: firm,
    role,
    storeId,
    appVersion: APP_SEMVER,
    collectedAt: new Date().toISOString(),
  };
}

export async function resolveDesktopDeviceId(): Promise<string> {
  const info = await collectDesktopDeviceMetadata();
  return info.deviceId;
}

export async function resolveDesktopRole(): Promise<string> {
  const info = await collectDesktopDeviceMetadata();
  return info.role;
}

/** Hibrit terminal: merkez onayı gerekir mi? */
export async function requiresHybridDeviceApproval(): Promise<boolean> {
  if (!IS_TAURI) return false;
  if (!isHybridDeviceRegistrationMode()) return false;
  const role = await resolveDesktopRole();
  return role === 'client';
}

/** Merkez onay paneli: işyeri (şube) listesi */
export async function listCentralStoresForPlacement(firmNr?: string): Promise<DevicePlacementOption[]> {
  const firm = firmPadded(firmNr);
  const sql = `
    SELECT id::text, code, name
    FROM stores
    WHERE firm_nr = $1 AND COALESCE(is_active, true) = true
    ORDER BY name`;
  try {
    if (useCentralPostgrest()) {
      const rows = await postgrest.get<{ id: string; code: string; name: string }[]>(
        '/stores',
        {
          select: 'id,code,name',
          firm_nr: `eq.${firm}`,
          is_active: 'eq.true',
          order: 'name.asc',
        },
        { schema: 'public' },
      );
      return (rows || []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ''),
        name: String(r.name ?? ''),
      }));
    }
    const rows = await queryCentralPgRows<{ id: string; code: string; name: string }>(sql, [firm]);
    return rows.map((r) => ({
      id: String(r.id),
      code: String(r.code ?? ''),
      name: String(r.name ?? ''),
    }));
  } catch {
    try {
      const result = await postgres.query(sql, [firm]);
      return (result.rows as { id: string; code: string; name: string }[]).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ''),
        name: String(r.name ?? ''),
      }));
    } catch {
      return [];
    }
  }
}

/** Onaylanmış yerleştirmeyi Tauri config'e yaz */
async function syncApprovedPlacementToLocalConfig(
  terminalName?: string,
  storeId?: string | null,
): Promise<void> {
  if (!IS_TAURI) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const cfg = await invoke<Record<string, unknown>>('get_app_config');
    const next = { ...cfg };
    if (terminalName?.trim()) next.terminal_name = terminalName.trim();
    if (storeId?.trim() && storeId !== '001' && storeId !== 'all') {
      next.store_id = storeId.trim();
    }
    await invoke('save_app_config', { config: next });
  } catch {
    /* config güncellenemedi — giriş yine devam edebilir */
  }
}

/** Kurulum / kayıt: merkez PG veya PostgREST üzerinden pending kayıt (yalnızca hibrit) */
export async function registerDesktopTerminal(opts: {
  deviceId: string;
  terminalName: string;
  storeId?: string | null;
  firmNr?: string;
  role?: string;
  hostname?: string;
  osUser?: string;
  deviceInfo?: DesktopDeviceInfo;
}): Promise<{ ok: boolean; status: PosTerminalStatus; message: string }> {
  const role = String(opts.role || opts.deviceInfo?.role || 'client').toLowerCase();
  if (role !== 'client') {
    return {
      ok: true,
      status: 'approved',
      message: 'Merkez/sunucu rolü — cihaz kaydı gerekmez.',
    };
  }

  if (!isHybridDeviceRegistrationMode()) {
    return {
      ok: true,
      status: 'approved',
      message: 'Hibrit mod dışında cihaz kaydı zorunlu değil.',
    };
  }

  if (!centralPgConfigured()) {
    return {
      ok: false,
      status: 'not_registered',
      message: 'Merkez veritabanı yapılandırılmamış. remote_db ayarlarını kontrol edin.',
    };
  }

  const firm = firmPadded(opts.firmNr);
  const storeId =
    opts.storeId && opts.storeId !== 'all' && opts.storeId !== '001' ? opts.storeId : null;

  const info: DesktopDeviceInfo = opts.deviceInfo ?? {
    deviceId: opts.deviceId,
    terminalName: opts.terminalName || opts.deviceId,
    firmNr: firm,
    role,
    storeId,
    hostname: opts.hostname,
    computerName: opts.hostname,
    osUser: opts.osUser,
    appVersion: APP_SEMVER,
    collectedAt: new Date().toISOString(),
  };

  const metadata = deviceInfoToMetadata(info);

  try {
    const row = await rpcCall<{
      out_id?: string;
      out_status?: string;
      out_message?: string;
    }>('register_pos_terminal', {
      p_device_id: opts.deviceId,
      p_terminal_name: opts.terminalName || opts.deviceId,
      p_store_id: storeId,
      p_firm_nr: firm,
      p_role: role,
      p_hostname: opts.hostname || info.computerName || info.hostname || null,
      p_os_user: opts.osUser || info.osUser || null,
      p_app_version: info.appVersion || APP_SEMVER,
      p_metadata: metadata,
    });

    const status = (row.out_status || 'pending') as PosTerminalStatus;
    return {
      ok: true,
      status,
      message: row.out_message || 'Cihaz kaydı merkeze iletildi.',
    };
  } catch (e: unknown) {
    return {
      ok: false,
      status: 'not_registered',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function getDesktopTerminalStatus(
  deviceId: string,
): Promise<{
  status: PosTerminalStatus;
  message: string;
  terminalName?: string;
  storeId?: string;
}> {
  if (!deviceId?.trim()) {
    return { status: 'not_registered', message: 'Cihaz kimliği yok.' };
  }

  if (!isHybridDeviceRegistrationMode() || !centralPgConfigured()) {
    return { status: 'approved', message: 'Hibrit cihaz kaydı devre dışı.' };
  }

  try {
    const row = await rpcCall<{
      out_status?: string;
      out_terminal_name?: string;
      out_store_id?: string;
      out_message?: string;
    }>('get_pos_terminal_status', { p_device_id: deviceId.trim() });

    return {
      status: (row.out_status || 'not_registered') as PosTerminalStatus,
      message: row.out_message || '',
      terminalName: row.out_terminal_name || undefined,
      storeId: row.out_store_id ? String(row.out_store_id) : undefined,
    };
  } catch {
    return { status: 'not_registered', message: 'Durum sorgulanamadı.' };
  }
}

/** Masaüstü giriş öncesi — hibrit terminal (client) için merkez onayı zorunlu */
export async function assertDesktopTerminalApproved(): Promise<{
  allowed: boolean;
  status: PosTerminalStatus;
  message: string;
  deviceInfo?: DesktopDeviceInfo;
}> {
  if (!IS_TAURI) {
    return { allowed: true, status: 'approved', message: 'Web oturumu — cihaz onayı gerekmez.' };
  }

  const deviceInfo = await collectDesktopDeviceMetadata();
  const role = deviceInfo.role;

  if (role === 'center' || role === 'server') {
    return {
      allowed: true,
      status: 'approved',
      message: 'Merkez sunucu — cihaz onayı atlandı.',
      deviceInfo,
    };
  }

  if (!isHybridDeviceRegistrationMode()) {
    return {
      allowed: true,
      status: 'approved',
      message: 'Hibrit mod dışında cihaz onayı gerekmez.',
      deviceInfo,
    };
  }

  if (!centralPgConfigured()) {
    return {
      allowed: false,
      status: 'not_registered',
      message:
        'Hibrit kasa için merkez veritabanı (remote_db) yapılandırılmamış. Kurulum ayarlarını kontrol edin.',
      deviceInfo,
    };
  }

  const deviceId = deviceInfo.deviceId;
  let check = await getDesktopTerminalStatus(deviceId);

  const registerOrRefresh = async () => {
    const reg = await registerDesktopTerminal({
      deviceId,
      terminalName: deviceInfo.terminalName,
      storeId: deviceInfo.storeId,
      firmNr: deviceInfo.firmNr,
      role: deviceInfo.role,
      hostname: deviceInfo.computerName || deviceInfo.hostname,
      osUser: deviceInfo.osUser,
      deviceInfo,
    });
    const refreshed = await getDesktopTerminalStatus(deviceId);
    return {
      status: refreshed.status !== 'not_registered' ? refreshed.status : reg.status,
      message: reg.message || refreshed.message,
      terminalName: refreshed.terminalName || deviceInfo.terminalName,
      storeId: refreshed.storeId,
    };
  };

  if (check.status === 'not_registered') {
    check = await registerOrRefresh();
  } else if (check.status === 'pending') {
    check = await registerOrRefresh();
  }

  if (check.status === 'approved') {
    await syncApprovedPlacementToLocalConfig(check.terminalName, check.storeId);
    if (check.storeId?.trim()) {
      const { applyTerminalRuntimeFromConfig } = await import('./terminalRuntimeService');
      applyTerminalRuntimeFromConfig({
        store_id: check.storeId,
        terminal_name: check.terminalName,
      });
    }
    return { allowed: true, status: 'approved', message: check.message, deviceInfo };
  }

  const messages: Record<string, string> = {
    pending:
      'Bu kasa henüz onaylanmadı. Merkez yöneticisi web panelinde Sistem Yönetimi → Kasa Cihazları bölümünden işyeri ve kasa tanımını yaparak onaylamalı.',
    rejected: check.message || 'Cihaz kaydı reddedildi. Merkez ile iletişime geçin.',
    blocked: 'Bu cihaz engellenmiş. Merkez ile iletişime geçin.',
    not_registered: `Cihaz kaydı merkeze iletilemedi (${describeCentralTarget()}). ${check.message || 'PostgREST URL ve remote_db aynı kiracıyı göstermeli (ör. /lovan → lovan DB).'}`,
  };

  return {
    allowed: false,
    status: check.status,
    message: messages[check.status] || check.message,
    deviceInfo,
  };
}

export async function listPosTerminalRegistrations(opts?: {
  status?: PosTerminalStatus | 'all';
  firmNr?: string;
  /** Merkez yönetici: tüm firmalardaki kayıtlar (firma filtresi yok) */
  allFirms?: boolean;
  limit?: number;
}): Promise<PosTerminalRegistration[]> {
  const allFirms = opts?.allFirms === true;
  const firm = allFirms ? null : firmPadded(opts?.firmNr);
  const limit = opts?.limit ?? 50;

  let statusFilter = '';
  const params: unknown[] = [];
  if (firm) params.push(firm);
  params.push(limit);

  let paramIdx = firm ? 3 : 2;
  if (opts?.status && opts.status !== 'all') {
    statusFilter = ` AND r.status = $${paramIdx}`;
    params.push(opts.status);
  }

  const firmWhere = firm
    ? `(r.firm_nr = $1 OR lpad(ltrim(r.firm_nr, '0'), 3, '0') = $1)`
    : 'TRUE';
  const limitParam = firm ? '$2' : '$1';

  const sql = `
    SELECT r.id::text, r.device_id, r.terminal_name, r.store_id::text,
           s.name AS store_name, s.code AS store_code,
           f.name AS firm_name,
           r.firm_nr, r.status, r.role, r.hostname, r.os_user, r.app_version,
           r.computer_name, r.os_platform, r.os_arch, r.os_version,
           r.local_ip, r.timezone, r.locale, r.metadata,
           r.registered_at, r.last_seen_at, r.rejected_reason
    FROM pos_terminal_registrations r
    LEFT JOIN stores s ON s.id = r.store_id
    LEFT JOIN firms f ON lpad(ltrim(f.firm_nr, '0'), 3, '0') = lpad(ltrim(r.firm_nr, '0'), 3, '0')
    WHERE ${firmWhere}
      ${statusFilter}
    ORDER BY
      CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
      r.registered_at DESC
    LIMIT ${limitParam}`;

  try {
    if (useCentralPostgrest()) {
      const q: Record<string, string> = {
        select:
          'id,device_id,terminal_name,store_id,firm_nr,status,role,hostname,os_user,app_version,computer_name,os_platform,os_arch,os_version,local_ip,timezone,locale,metadata,registered_at,last_seen_at,rejected_reason',
        order: 'registered_at.desc',
        limit: String(limit),
      };
      if (!allFirms && firm) q.firm_nr = `eq.${firm}`;
      if (opts?.status && opts.status !== 'all') q.status = `eq.${opts.status}`;
      const rows = await postgrest.get<Record<string, unknown>[]>('/pos_terminal_registrations', q);
      return (rows || []).map((r) => mapRegistrationRow(r));
    }

    const rows = await queryCentralPgRows<Record<string, unknown>>(sql, params);
    return rows.map((row) => mapRegistrationRow(row));
  } catch (e) {
    if (allFirms || useCentralPostgrest()) {
      console.warn('[listPosTerminalRegistrations] merkez sorgusu başarısız:', e);
      return [];
    }
    try {
      const result = await postgres.query(sql, params);
      return result.rows.map((row: Record<string, unknown>) => mapRegistrationRow(row));
    } catch {
      return [];
    }
  }
}

export async function approvePosTerminal(
  id: string,
  userId?: string | null,
  placement?: ApprovePosTerminalPlacement,
): Promise<{ ok: boolean; message: string }> {
  try {
    const storeId =
      placement?.storeId && placement.storeId !== 'all' && placement.storeId !== '001'
        ? placement.storeId
        : null;

    const row = await rpcCall<{ ok?: boolean; message?: string }>('approve_pos_terminal', {
      p_id: id,
      p_user_id: userId || null,
      p_store_id: storeId,
      p_terminal_name: placement?.terminalName?.trim() || null,
      p_firm_nr: placement?.firmNr ? firmPadded(placement.firmNr) : null,
    });
    return { ok: !!row.ok, message: row.message || (row.ok ? 'Onaylandı.' : 'İşlem başarısız.') };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function updatePosTerminalPlacement(
  id: string,
  userId?: string | null,
  placement?: ApprovePosTerminalPlacement,
): Promise<{ ok: boolean; message: string }> {
  try {
    const storeId =
      placement?.storeId && placement.storeId !== 'all' && placement.storeId !== '001'
        ? placement.storeId
        : null;

    const row = await rpcCall<{ ok?: boolean; message?: string }>('update_pos_terminal_placement', {
      p_id: id,
      p_user_id: userId || null,
      p_store_id: storeId,
      p_terminal_name: placement?.terminalName?.trim() || null,
      p_firm_nr: placement?.firmNr ? firmPadded(placement.firmNr) : null,
    });
    return {
      ok: !!row.ok,
      message: row.message || (row.ok ? 'Yerleştirme güncellendi.' : 'İşlem başarısız.'),
    };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function rejectPosTerminal(
  id: string,
  userId?: string | null,
  reason?: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const row = await rpcCall<{ ok?: boolean; message?: string }>('reject_pos_terminal', {
      p_id: id,
      p_user_id: userId || null,
      p_reason: reason || null,
    });
    return { ok: !!row.ok, message: row.message || (row.ok ? 'Reddedildi.' : 'İşlem başarısız.') };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export function describeRegistrationTarget(): string {
  return describeCentralTarget();
}
