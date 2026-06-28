/**
 * Masaüstü kasa cihaz kaydı ve merkez onay akışı.
 * Web (merkez): dashboard'dan onay/red. Desktop: kurulumda kayıt, onaylanmadan giriş yok.
 */

import { APP_SEMVER } from '../core/version';
import { IS_TAURI, safeInvoke, getBridgeUrl } from '../utils/env';
import { postgrest } from './api/postgrestClient';
import { getPostgrestBaseUrl } from '../config/postgrest.config';
import { DB_SETTINGS, ERP_SETTINGS, LOCAL_CONFIG, REMOTE_CONFIG, postgres } from './postgres';

export type PosTerminalStatus = 'pending' | 'approved' | 'rejected' | 'blocked' | 'not_registered';

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

function firmPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

function useRemotePostgrest(): boolean {
  const remote = String(DB_SETTINGS.remoteRestUrl || '').trim();
  return (
    DB_SETTINGS.connectionProvider === 'rest_api' ||
    (DB_SETTINGS.activeMode === 'hybrid' && remote.length > 0)
  );
}

/** Cihaz kaydı/onay — hibrit kasada yerel PG değil, merkez uç (PostgREST veya remote_db). */
function resolveCentralPgConfig(): typeof REMOTE_CONFIG {
  if (DB_SETTINGS.activeMode === 'offline') {
    return LOCAL_CONFIG;
  }
  return REMOTE_CONFIG;
}

function centralPgConfigured(): boolean {
  const cfg = resolveCentralPgConfig();
  return Boolean(cfg.host?.trim() && cfg.database?.trim() && cfg.user?.trim());
}

async function queryCentralPgRows<T = Record<string, unknown>>(
  sql: string,
  params: unknown[],
): Promise<T[]> {
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
  if (useRemotePostgrest()) {
    const res = await postgrest.post<T>(`/rpc/${fn}`, body, { schema: 'public' });
    const row = Array.isArray(res) ? res[0] : res;
    return row as T;
  }

  const keys = Object.keys(body);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT * FROM public.${fn}(${placeholders})`;
  const params = keys.map((k) => body[k]);

  // Hibrit kasa: register_pos_terminal yerel DB'ye düşmesin (web dashboard merkezi okur).
  if (DB_SETTINGS.activeMode === 'hybrid' || DB_SETTINGS.activeMode === 'online') {
    const rows = await queryCentralPgRows<Record<string, unknown>>(sql, params);
    return (rows[0] ?? {}) as T;
  }

  const result = await postgres.query(sql, params);
  return (result.rows[0] ?? {}) as T;
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

/** Kurulum / kayıt: merkez PG veya PostgREST üzerinden pending kayıt */
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
  const firm = String(opts.firmNr || firmPadded())
    .replace(/\D/g, '')
    .padStart(3, '0');
  const storeId =
    opts.storeId && opts.storeId !== 'all' && opts.storeId !== '001' ? opts.storeId : null;

  const info: DesktopDeviceInfo = opts.deviceInfo ?? {
    deviceId: opts.deviceId,
    terminalName: opts.terminalName || opts.deviceId,
    firmNr: firm,
    role: opts.role || 'client',
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
      p_role: opts.role || info.role || 'client',
      p_hostname: opts.hostname || info.computerName || info.hostname || null,
      p_os_user: opts.osUser || info.osUser || null,
      p_app_version: info.appVersion || APP_SEMVER,
      p_metadata: metadata,
    });

    const status = (row.out_status || 'pending') as PosTerminalStatus;
    return {
      ok: true,
      status,
      message: row.out_message || 'Cihaz kaydı alındı.',
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
): Promise<{ status: PosTerminalStatus; message: string; terminalName?: string }> {
  if (!deviceId?.trim()) {
    return { status: 'not_registered', message: 'Cihaz kimliği yok.' };
  }

  try {
    const row = await rpcCall<{
      out_status?: string;
      out_terminal_name?: string;
      out_message?: string;
    }>('get_pos_terminal_status', { p_device_id: deviceId.trim() });

    return {
      status: (row.out_status || 'not_registered') as PosTerminalStatus,
      message: row.out_message || '',
      terminalName: row.out_terminal_name || undefined,
    };
  } catch {
    return { status: 'not_registered', message: 'Durum sorgulanamadı.' };
  }
}

/** Masaüstü giriş öncesi — merkez rolü ve web hariç */
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
    return { status: reg.status, message: reg.message, terminalName: deviceInfo.terminalName };
  };

  if (check.status === 'not_registered') {
    check = await registerOrRefresh();
  } else if (check.status === 'pending') {
    // Heartbeat: cihaz bilgilerini güncelle, last_seen yenile
    check = await registerOrRefresh();
  }

  if (check.status === 'approved') {
    return { allowed: true, status: 'approved', message: check.message, deviceInfo };
  }

  const messages: Record<string, string> = {
    pending:
      'Bu kasa henüz onaylanmadı. Merkez yöneticisi web panelinde Dashboard → Bekleyen Cihazlar bölümünden onaylamalı.',
    rejected: check.message || 'Cihaz kaydı reddedildi. Merkez ile iletişime geçin.',
    blocked: 'Bu cihaz engellenmiş. Merkez ile iletişime geçin.',
    not_registered: 'Cihaz kaydı oluşturulamadı. İnternet/PostgREST bağlantısını kontrol edin.',
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
  limit?: number;
}): Promise<PosTerminalRegistration[]> {
  const firm = String(opts?.firmNr || firmPadded())
    .replace(/\D/g, '')
    .padStart(3, '0');
  const limit = opts?.limit ?? 50;

  let statusFilter = '';
  const params: unknown[] = [firm, limit];
  if (opts?.status && opts.status !== 'all') {
    statusFilter = ` AND r.status = $3`;
    params.push(opts.status);
  }

  const sql = `
    SELECT r.id::text, r.device_id, r.terminal_name, r.store_id::text,
           s.name AS store_name, s.code AS store_code,
           r.firm_nr, r.status, r.role, r.hostname, r.os_user, r.app_version,
           r.computer_name, r.os_platform, r.os_arch, r.os_version,
           r.local_ip, r.timezone, r.locale, r.metadata,
           r.registered_at, r.last_seen_at, r.rejected_reason
    FROM pos_terminal_registrations r
    LEFT JOIN stores s ON s.id = r.store_id
    WHERE (r.firm_nr = $1 OR lpad(ltrim(r.firm_nr, '0'), 3, '0') = $1)
      ${statusFilter}
    ORDER BY
      CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
      r.registered_at DESC
    LIMIT $2`;

  try {
    if (useRemotePostgrest()) {
      const q: Record<string, string> = {
        select:
          'id,device_id,terminal_name,store_id,firm_nr,status,role,hostname,os_user,app_version,computer_name,os_platform,os_arch,os_version,local_ip,timezone,locale,metadata,registered_at,last_seen_at,rejected_reason',
        firm_nr: `eq.${firm}`,
        order: 'registered_at.desc',
        limit: String(limit),
      };
      if (opts?.status && opts.status !== 'all') q.status = `eq.${opts.status}`;
      const rows = await postgrest.get<Record<string, unknown>[]>('/pos_terminal_registrations', q);
      return (rows || []).map((r) => mapRegistrationRow(r));
    }

    if (DB_SETTINGS.activeMode === 'hybrid' || DB_SETTINGS.activeMode === 'online') {
      const rows = await queryCentralPgRows<Record<string, unknown>>(sql, params);
      return rows.map((row) => mapRegistrationRow(row));
    }

    const result = await postgres.query(sql, params);
    return result.rows.map((row: Record<string, unknown>) => mapRegistrationRow(row));
  } catch {
    return [];
  }
}

export async function approvePosTerminal(
  id: string,
  userId?: string | null,
): Promise<{ ok: boolean; message: string }> {
  try {
    const row = await rpcCall<{ ok?: boolean; message?: string }>('approve_pos_terminal', {
      p_id: id,
      p_user_id: userId || null,
    });
    return { ok: !!row.ok, message: row.message || (row.ok ? 'Onaylandı.' : 'İşlem başarısız.') };
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
  if (useRemotePostgrest()) return getPostgrestBaseUrl();
  const cfg = resolveCentralPgConfig();
  return `${cfg.host}:${cfg.port}/${cfg.database}`;
}
