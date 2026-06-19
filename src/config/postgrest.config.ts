/**
 * PostgREST API yapılandırması
 * PostgREST: PostgreSQL'i doğrudan REST API'ye dönüştürür.
 * @see database/README_POSTGREST.md
 */

import { DB_SETTINGS } from '../services/postgres';
import { rewriteRetailexAppUrlForViteDev } from '../utils/retailexDevProxy';

const defaultPort = 3002;

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
  schemas: ['public', 'logic', 'wms', 'rest', 'beauty', 'pos'] as const,
};

/** Kiracı PostgREST ile okuma (rest_api veya hibritte remote_rest_url) */
export function shouldUseTenantPostgrestApi(): boolean {
  if (DB_SETTINGS.connectionProvider === 'rest_api') return true;
  if (DB_SETTINGS.activeMode === 'offline') return false;
  // Hibrit + yerel PG (Tauri/masaüstü): okuma/yazım pg_query; PostgREST yalnızca senkron motoru.
  if (DB_SETTINGS.activeMode === 'hybrid' && DB_SETTINGS.connectionProvider === 'db') return false;
  return String(DB_SETTINGS.remoteRestUrl || '').trim().length > 0;
}

export function getPostgrestBaseUrl(): string {
  // Kiracı PostgREST URL’si (remote_rest_url) varken çevrimdışı değilse doğrudan tenant API.
  // Böylece db + hybrid (pg_query köprüsü zayıf/502) senaryosunda da PostgREST okumaları çalışır.
  const remote = normalizeBaseUrl(String(DB_SETTINGS.remoteRestUrl || '').trim());
  const offline = DB_SETTINGS.activeMode === 'offline';
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
