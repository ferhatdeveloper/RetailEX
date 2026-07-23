/**
 * PostgREST API yapılandırması
 * PostgREST: PostgreSQL'i doğrudan REST API'ye dönüştürür.
 * @see database/README_POSTGREST.md
 */

import { DEFAULT_POSTGREST_PORT } from '../core/postgrestDefaults';
import { DB_SETTINGS, normalizeCustomPostgrestUrl } from '../services/postgres';
import { IS_TAURI } from '../utils/env';
import { rewriteRetailexAppUrlForViteDev } from '../utils/retailexDevProxy';
import { resolveEffectiveRemoteRestUrl } from '../services/merkezTenantRegistry';

const defaultPort = DEFAULT_POSTGREST_PORT;

function normalizeBaseUrl(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function getBaseUrlFallback(): string {
  if (typeof window === 'undefined') return `http://localhost:${defaultPort}`;
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  return isLocal ? `http://localhost:${defaultPort}` : `${window.location.protocol}//${host}:${defaultPort}`;
}

export const postgrestConfig = {
  /** Varsayılan şema (Accept-Profile, Content-Profile header) */
  defaultSchema: 'public' as const,
  /** Kullanılacak şemalar */
  schemas: ['public', 'logic', 'wms', 'rest', 'beauty', 'pos', 'logistics'] as const,
};

/** Kiracı PostgREST ile okuma/yazım (Tauri hibrit hariç — yerel PG) */
export function shouldUseTenantPostgrestApi(): boolean {
  if (DB_SETTINGS.activeMode === 'offline') return false;
  // Tauri hibrit: ürün/cari/fatura CRUD yerel PG; PostgREST yalnızca senkron motoru.
  if (IS_TAURI && DB_SETTINGS.activeMode === 'hybrid') return false;
  if (DB_SETTINGS.connectionProvider === 'rest_api') return true;
  if (DB_SETTINGS.activeMode === 'hybrid' && DB_SETTINGS.connectionProvider === 'db') return false;
  return String(DB_SETTINGS.remoteRestUrl || '').trim().length > 0;
}

/** INSERT/UPDATE/DELETE: Tauri hibritte asla PostgREST (merkez); yerel PG kullan. */
export function shouldUsePostgrestForCrud(): boolean {
  if (IS_TAURI && DB_SETTINGS.activeMode === 'hybrid') return false;
  return DB_SETTINGS.connectionProvider === 'rest_api';
}

export function getPostgrestBaseUrl(): string {
  // Kiracı PostgREST URL’si (remote_rest_url) varken çevrimdışı değilse doğrudan tenant API.
  // Böylece db + hybrid (pg_query köprüsü zayıf/502) senaryosunda da PostgREST okumaları çalışır.
  const remote = normalizeCustomPostgrestUrl(
    normalizeBaseUrl(
      resolveEffectiveRemoteRestUrl(DB_SETTINGS.remoteRestUrl, DB_SETTINGS.merkezTenantCode),
    ),
  );
  // rest_api + URL varsa offline bayrağı login’i localhost:3002’ye düşürmesin
  const forceRest =
    DB_SETTINGS.connectionProvider === 'rest_api' && Boolean(remote);
  const offline = DB_SETTINGS.activeMode === 'offline' && !forceRest;
  if (remote && !offline) {
    return rewriteRetailexAppUrlForViteDev(remote);
  }
  return getBaseUrlFallback();
}

export const getPostgrestUrl = (path: string, _schema?: string): string => {
  const base = getPostgrestBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
};

/** PostgREST yapılandırılmış mı / kullanılabilir mi (baseUrl erişilebilir) */
export const isPostgrestConfigured = (): boolean => true;

export default postgrestConfig;
