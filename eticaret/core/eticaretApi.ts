import type { EticaretSettings } from './types';
import type { StorefrontProduct } from './types';
import { DEFAULT_ETICARET_CONTENT } from './contentTypes';
import { mergeEticaretSettings } from './mergeSettings';
import { loadTenantEticaretSettingsFromRegistry, saveTenantEticaretSettings } from './tenantRegistryApi';

export type StorefrontConfigResponse = EticaretSettings & {
  providers: Array<{ id: string; label: string }>;
  catalogTenantCode?: string;
  catalogFirmNr?: string;
};

export type EticaretFirmOption = {
  firm_nr: string;
  name: string;
  is_active: boolean;
};

function bridgeUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
}

async function bridgeGet<T>(path: string): Promise<T> {
  const res = await fetch(bridgeUrl(path), { headers: { Accept: 'application/json' } });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(String((data as { error?: string }).error || res.statusText));
  return data;
}

async function bridgePut<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(bridgeUrl(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(String((data as { error?: string }).error || res.statusText));
  return data;
}

/** Vitrin + admin için birleşik ayar yükleme (kiracı DB + merkez registry) */
export async function loadTenantEticaretSettingsFull(tenantCode: string): Promise<EticaretSettings> {
  const code = tenantCode.trim().toLowerCase();
  let dbSettings: Partial<EticaretSettings> = {};
  try {
    dbSettings = await bridgeGet<Partial<EticaretSettings>>(
      `/api/eticaret/storefront-config?tenant=${encodeURIComponent(code)}`,
    );
  } catch {
    /* köprü yoksa registry */
  }
  const registry = await loadTenantEticaretSettingsFromRegistry(code);
  return mergeEticaretSettings(registry, dbSettings);
}

/** Kiracı DB + merkez registry'ye kaydet */
export async function saveTenantEticaretSettingsFull(
  tenantCode: string,
  settings: EticaretSettings,
): Promise<void> {
  const code = tenantCode.trim().toLowerCase();
  await bridgePut('/api/eticaret/settings', {
    tenant_code: code,
    settings,
  });
  await saveTenantEticaretSettings(code, settings);
}

export async function fetchFirmsForTenant(
  tenantCode: string,
): Promise<{ firms: EticaretFirmOption[]; primaryFirmNr: string }> {
  const q = new URLSearchParams({ tenant: tenantCode });
  return bridgeGet(`/api/eticaret/firms?${q.toString()}`);
}

export async function fetchStorefrontConfig(tenantCode: string): Promise<StorefrontConfigResponse> {
  return bridgeGet<StorefrontConfigResponse>(
    `/api/eticaret/storefront-config?tenant=${encodeURIComponent(tenantCode)}`,
  );
}

export async function fetchCatalogFromBridge(
  tenantCode: string,
  options?: { limit?: number; search?: string; catalogFirmNr?: string },
): Promise<{ products: StorefrontProduct[]; currency: string; demo: boolean }> {
  const q = new URLSearchParams({ tenant: tenantCode });
  if (options?.limit) q.set('limit', String(options.limit));
  if (options?.search) q.set('search', options.search);
  if (options?.catalogFirmNr?.trim()) q.set('catalog_firm_nr', options.catalogFirmNr.trim());
  return bridgeGet(`/api/eticaret/catalog?${q.toString()}`);
}

export async function fetchProductFromBridge(
  tenantCode: string,
  productCode: string,
): Promise<StorefrontProduct | null> {
  const q = new URLSearchParams({ tenant: tenantCode, code: productCode });
  const res = await bridgeGet<{ product: StorefrontProduct | null }>(`/api/eticaret/product?${q.toString()}`);
  return res.product ?? null;
}

export async function listWebOrdersForTenant(tenantCode: string): Promise<import('./types').EticaretWebOrder[]> {
  const q = new URLSearchParams({ tenant: tenantCode });
  const res = await bridgeGet<{ orders: import('./types').EticaretWebOrder[] }>(
    `/api/eticaret/orders?${q.toString()}`,
  );
  return Array.isArray(res.orders) ? res.orders : [];
}

export { DEFAULT_ETICARET_CONTENT };
