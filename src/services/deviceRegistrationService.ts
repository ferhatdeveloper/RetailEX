/**
 * Masaüstü kasa cihaz kaydı ve merkez onay akışı.
 * Web (merkez): dashboard'dan onay/red. Desktop: kurulumda kayıt, onaylanmadan giriş yok.
 */

import { APP_SEMVER } from '../core/version';
import { IS_TAURI } from '../utils/env';
import { postgrest } from './api/postgrestClient';
import { getPostgrestBaseUrl } from '../config/postgrest.config';
import { DB_SETTINGS, ERP_SETTINGS, LOCAL_CONFIG, postgres } from './postgres';

export type PosTerminalStatus = 'pending' | 'approved' | 'rejected' | 'blocked' | 'not_registered';

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

async function rpcCall<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  if (useRemotePostgrest()) {
    const res = await postgrest.post<T>(`/rpc/${fn}`, body, { schema: 'public' });
    const row = Array.isArray(res) ? res[0] : res;
    return row as T;
  }
  const keys = Object.keys(body);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT * FROM public.${fn}(${placeholders})`;
  const result = await postgres.query(sql, keys.map((k) => body[k]));
  return (result.rows[0] ?? {}) as T;
}

export async function resolveDesktopDeviceId(): Promise<string> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const cfg: { device_id?: string; terminal_name?: string } = await invoke('get_app_config');
      if (cfg.device_id?.trim()) return cfg.device_id.trim();
      if (cfg.terminal_name?.trim()) return cfg.terminal_name.trim();
    } catch {
      /* fallback */
    }
  }
  return postgres.getDeviceId();
}

export async function resolveDesktopRole(): Promise<string> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const cfg: { role?: string } = await invoke('get_app_config');
      return String(cfg.role || 'client').toLowerCase();
    } catch {
      return 'client';
    }
  }
  return 'client';
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
}): Promise<{ ok: boolean; status: PosTerminalStatus; message: string }> {
  const firm = String(opts.firmNr || firmPadded())
    .replace(/\D/g, '')
    .padStart(3, '0');
  const storeId =
    opts.storeId && opts.storeId !== 'all' && opts.storeId !== '001' ? opts.storeId : null;

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
      p_role: opts.role || 'client',
      p_hostname: opts.hostname || null,
      p_os_user: opts.osUser || null,
      p_app_version: APP_SEMVER,
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
}> {
  if (!IS_TAURI) {
    return { allowed: true, status: 'approved', message: 'Web oturumu — cihaz onayı gerekmez.' };
  }

  const role = await resolveDesktopRole();
  if (role === 'center' || role === 'server') {
    return { allowed: true, status: 'approved', message: 'Merkez sunucu — cihaz onayı atlandı.' };
  }

  const deviceId = await resolveDesktopDeviceId();
  let check = await getDesktopTerminalStatus(deviceId);

  if (check.status === 'not_registered') {
    let terminalName = deviceId;
    let storeId: string | null = null;
    let hostname: string | undefined;
    let osUser: string | undefined;
    let cfgRole = role;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const cfg: {
        terminal_name?: string;
        store_id?: string;
        role?: string;
      } = await invoke('get_app_config');
      terminalName = cfg.terminal_name?.trim() || deviceId;
      storeId = cfg.store_id?.trim() || null;
      cfgRole = cfg.role || role;
      try {
        hostname = await invoke<string>('get_system_id');
        osUser = await invoke<string>('get_os_username');
      } catch {
        /* optional */
      }
    } catch {
      /* config okunamadı */
    }

    const reg = await registerDesktopTerminal({
      deviceId,
      terminalName,
      storeId,
      role: cfgRole,
      hostname,
      osUser,
    });
    check = { status: reg.status, message: reg.message, terminalName };
  }

  if (check.status === 'approved') {
    return { allowed: true, status: 'approved', message: check.message };
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
    const result = await postgres.query(sql, params);
    return result.rows.map((row: Record<string, unknown>) => ({
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
      registeredAt: row.registered_at ? new Date(String(row.registered_at)).getTime() : Date.now(),
      lastSeenAt: row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : undefined,
      rejectedReason: row.rejected_reason ? String(row.rejected_reason) : undefined,
    }));
  } catch {
    if (useRemotePostgrest()) {
      try {
        const q: Record<string, string> = {
          select:
            'id,device_id,terminal_name,store_id,firm_nr,status,role,hostname,os_user,app_version,registered_at,last_seen_at,rejected_reason',
          firm_nr: `eq.${firm}`,
          order: 'registered_at.desc',
          limit: String(limit),
        };
        if (opts?.status && opts.status !== 'all') q.status = `eq.${opts.status}`;
        const rows = await postgrest.get<Record<string, unknown>[]>('/pos_terminal_registrations', q);
        return (rows || []).map((r) => ({
          id: String(r.id),
          deviceId: String(r.device_id),
          terminalName: String(r.terminal_name),
          storeId: r.store_id ? String(r.store_id) : undefined,
          firmNr: String(r.firm_nr),
          status: String(r.status) as PosTerminalStatus,
          role: String(r.role || 'client'),
          hostname: r.hostname ? String(r.hostname) : undefined,
          osUser: r.os_user ? String(r.os_user) : undefined,
          appVersion: r.app_version ? String(r.app_version) : undefined,
          registeredAt: r.registered_at ? new Date(String(r.registered_at)).getTime() : Date.now(),
          lastSeenAt: r.last_seen_at ? new Date(String(r.last_seen_at)).getTime() : undefined,
          rejectedReason: r.rejected_reason ? String(r.rejected_reason) : undefined,
        }));
      } catch {
        return [];
      }
    }
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
  return `${LOCAL_CONFIG.host}:${LOCAL_CONFIG.port}/${LOCAL_CONFIG.database}`;
}
