/**
 * PostgREST API yapılandırması
 * PostgREST: PostgreSQL'i doğrudan REST API'ye dönüştürür.
 * @see database/README_POSTGREST.md
 */

import { DB_SETTINGS } from '../services/postgres';

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

export function getPostgrestBaseUrl(): string {
  // Kullanıcı PostgREST kullanıyorsa override’i uygula.
  if (DB_SETTINGS.connectionProvider === 'rest_api' && DB_SETTINGS.remoteRestUrl) {
    return normalizeBaseUrl(DB_SETTINGS.remoteRestUrl) || getBaseUrlFallback();
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
