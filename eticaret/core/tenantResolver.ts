import { loadEticaretSettings } from './settings';
import type { EticaretTenantSource, ResolvedEticaretTenant } from './types';

const TENANT_CODE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

function normalizeTenantCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? '').trim().toLowerCase();
  if (!code || !TENANT_CODE_RE.test(code)) return null;
  if (code === 'merkez' || code === 'www' || code === 'api') return null;
  return code;
}

/**
 * Alt alan adından kiracı kodu: `{kiracı}.magaza.retailex.app` veya `{kiracı}.shop.retailex.app`
 */
export function resolveTenantFromHostname(hostname: string): ResolvedEticaretTenant | null {
  const host = hostname.toLowerCase().split(':')[0]!;
  const parts = host.split('.').filter(Boolean);

  if (parts.length >= 4 && (parts[1] === 'magaza' || parts[1] === 'shop')) {
    const code = normalizeTenantCode(parts[0]);
    if (code) return { tenantCode: code, source: 'subdomain' };
  }

  if (parts.length >= 3 && parts[0] === 'magaza') {
    const code = normalizeTenantCode(parts[1]);
    if (code) return { tenantCode: code, source: 'subdomain' };
  }

  return null;
}

/**
 * URL yolu: `/magaza/:tenantCode` veya `/magaza/:tenantCode/...`
 */
export function resolveTenantFromPath(pathname: string): ResolvedEticaretTenant | null {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts[0] !== 'magaza' && parts[0] !== 'shop') return null;
  const code = normalizeTenantCode(parts[1]);
  if (!code) return null;
  return { tenantCode: code, source: 'path' };
}

/**
 * Demo önizleme: sistem ayarlarında demo açıksa kiracı kodu oradan gelir.
 */
export function resolveDemoTenant(): ResolvedEticaretTenant | null {
  const settings = loadEticaretSettings();
  if (!settings.demoMode) return null;
  const code = normalizeTenantCode(settings.demoTenantCode);
  if (!code) return null;
  return { tenantCode: code, source: 'demo' };
}

export function resolveEticaretTenant(input?: {
  hostname?: string;
  pathname?: string;
  pathTenantCode?: string | null;
}): ResolvedEticaretTenant {
  const demo = resolveDemoTenant();
  if (demo) return demo;

  const fromPathParam = normalizeTenantCode(input?.pathTenantCode);
  if (fromPathParam) {
    return { tenantCode: fromPathParam, source: 'path' };
  }

  if (typeof window !== 'undefined') {
    const fromHost = resolveTenantFromHostname(input?.hostname ?? window.location.hostname);
    if (fromHost) return fromHost;

    const fromPath = resolveTenantFromPath(input?.pathname ?? window.location.pathname);
    if (fromPath) return fromPath;
  }

  if (input?.hostname) {
    const fromHost = resolveTenantFromHostname(input.hostname);
    if (fromHost) return fromHost;
  }
  if (input?.pathname) {
    const fromPath = resolveTenantFromPath(input.pathname);
    if (fromPath) return fromPath;
  }

  return { tenantCode: 'demo', source: 'default' };
}

export function buildStorefrontBasePath(tenantCode: string): string {
  return `/magaza/${encodeURIComponent(tenantCode)}`;
}

export function buildStorefrontUrl(tenantCode: string, path = ''): string {
  const base = buildStorefrontBasePath(tenantCode);
  if (!path) return base;
  return `${base}/${path.replace(/^\/+/, '')}`;
}

export type { EticaretTenantSource };
