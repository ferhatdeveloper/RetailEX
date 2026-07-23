/**
 * Ortak giriş doğrulama — Login adım 1 (şifre) ve AuthContext.login (firma + oturum).
 * Öncelik: PostgREST logic.verify_login → SQL logic.verify_login → public.users fallback.
 */

import { DB_SETTINGS, ERP_SETTINGS, postgres, alignRemoteConfigWithRestUrl } from './postgres';
import { postgrest } from './api/postgrestClient';
import { logger } from './loggingService';

export interface LoginVerifyRow {
  id: string;
  username: string;
  email?: string | null;
  full_name?: string | null;
  firm_nr?: string | null;
  store_id?: string | null;
  role_id?: string | null;
  role_name?: string | null;
  role_permissions?: unknown;
  role_color?: string | null;
  role_landing_route?: string | null;
  allowed_firm_nrs?: unknown;
  allowed_periods?: unknown;
  created_at?: string | null;
}

/** firms.firm_nr ile aynı biçim (2 → 002) */
export function normalizeLoginFirmNr(v: string | number | undefined | null): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 3 ? d.padStart(3, '0') : d;
}

function parseRpcRow(rpcRes: unknown): LoginVerifyRow | null {
  const row = Array.isArray(rpcRes) ? rpcRes[0] : (rpcRes as { 0?: unknown })?.[0] ?? rpcRes;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (!r.id || !r.username) return null;
  return r as unknown as LoginVerifyRow;
}

/** Son PostgREST login hatası (UI için). */
let lastPostgrestLoginError: string | null = null;

export function getLastPostgrestLoginError(): string | null {
  return lastPostgrestLoginError;
}

async function verifyViaPostgrest(
  username: string,
  password: string,
  firmNr: string,
): Promise<LoginVerifyRow | null> {
  const restUrl = String(DB_SETTINGS.remoteRestUrl || '').trim();
  const useRest =
    DB_SETTINGS.connectionProvider === 'rest_api' ||
    (restUrl.length > 0 && DB_SETTINGS.activeMode !== 'offline');
  if (!useRest) return null;
  try {
    const rpcRes = await postgrest.post(
      '/rpc/verify_login',
      { username, password, firm_nr: firmNr },
      { schema: 'logic' },
    );
    lastPostgrestLoginError = null;
    return parseRpcRow(rpcRes);
  } catch (err: unknown) {
    const msg = (err as Error)?.message || String(err);
    lastPostgrestLoginError = msg;
    logger.warn('LoginVerify', 'PostgREST verify_login başarısız', {
      error: msg,
      restUrl: DB_SETTINGS.remoteRestUrl,
      provider: DB_SETTINGS.connectionProvider,
    });
    alignRemoteConfigWithRestUrl();
    return null;
  }
}

async function verifyViaSqlRpc(
  username: string,
  password: string,
  firmNr: string,
): Promise<LoginVerifyRow | null> {
  const sql = `SELECT * FROM logic.verify_login($1, $2, $3) LIMIT 1`;
  try {
    const result = await postgres.query<LoginVerifyRow>(sql, [username, password, firmNr]);
    if (result.rowCount > 0 && result.rows[0]?.id) return result.rows[0];
  } catch (err: unknown) {
    logger.warn('LoginVerify', 'logic.verify_login SQL başarısız', {
      error: (err as Error)?.message || String(err),
    });
  }
  return null;
}

async function verifyViaPublicUsers(
  username: string,
  password: string,
  firmNr: string,
): Promise<LoginVerifyRow | null> {
  const normalizedFirm = normalizeLoginFirmNr(firmNr);
  const firmClause = normalizedFirm
    ? `AND (
        u.firm_nr = $3::text
        OR (
          COALESCE(jsonb_array_length(u.allowed_firm_nrs), 0) > 0
          AND u.allowed_firm_nrs @> jsonb_build_array($3::text)
        )
      )`
    : '';
  const sql = `
    SELECT u.id, u.email, u.username, u.full_name, u.firm_nr, u.store_id, u.created_at,
           r.id AS role_id, r.name AS role_name, r.permissions AS role_permissions,
           r.color AS role_color, r.landing_route AS role_landing_route,
           u.allowed_firm_nrs, u.allowed_periods
    FROM public.users u
    LEFT JOIN public.roles r ON r.id = u.role_id
    WHERE LOWER(u.username) = LOWER($1) AND u.is_active = true
      AND u.password_hash IS NOT NULL
      AND u.password_hash = crypt($2, u.password_hash)
      ${firmClause}
    LIMIT 1
  `;
  const params = normalizedFirm ? [username, password, normalizedFirm] : [username, password];
  try {
    const result = await postgres.query<LoginVerifyRow>(sql, params);
    if (result.rowCount > 0) return result.rows[0];
  } catch (err: unknown) {
    logger.warn('LoginVerify', 'public.users fallback başarısız', {
      error: (err as Error)?.message || String(err),
    });
  }
  return null;
}

/** Şifre doğrulama (firma seçilmeden — login adım 1). */
export async function checkLoginPassword(username: string, password: string): Promise<boolean> {
  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();
  if (!trimmedUsername || !trimmedPassword) return false;
  const row = await verifyLoginUser(trimmedUsername, trimmedPassword, '');
  return row != null;
}

/**
 * Tam kullanıcı doğrulama. Önce seçili firma, olmazsa firmasız (kullanıcının kendi firması).
 */
export async function verifyLoginUser(
  username: string,
  password: string,
  firmNr?: string,
): Promise<LoginVerifyRow | null> {
  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();
  if (!trimmedUsername || !trimmedPassword) return null;

  const candidates = [
    normalizeLoginFirmNr(firmNr),
    normalizeLoginFirmNr(ERP_SETTINGS.firmNr),
    '',
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  for (const fn of candidates) {
    const viaRest = await verifyViaPostgrest(trimmedUsername, trimmedPassword, fn);
    if (viaRest) return viaRest;

    const viaSql = await verifyViaSqlRpc(trimmedUsername, trimmedPassword, fn);
    if (viaSql) return viaSql;

    const viaPublic = await verifyViaPublicUsers(trimmedUsername, trimmedPassword, fn);
    if (viaPublic) return viaPublic;
  }

  return null;
}

/** Kullanıcının erişebildiği firma numaraları (normalize). */
export function resolveAccessibleFirmNrs(row: LoginVerifyRow): string[] {
  const primary = normalizeLoginFirmNr(row.firm_nr);
  let allowed: string[] = [];
  if (row.allowed_firm_nrs != null) {
    const raw = row.allowed_firm_nrs;
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    if (Array.isArray(parsed)) {
      allowed = parsed.map((x) => normalizeLoginFirmNr(x)).filter(Boolean);
    }
  }
  const set = new Set<string>([...allowed, primary].filter(Boolean));
  return [...set];
}
