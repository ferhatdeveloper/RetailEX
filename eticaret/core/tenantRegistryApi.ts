import { getMerkezRestBaseUrl } from '../../src/services/merkezTenantRegistry';
import { fetchRetailexAware } from '../../src/utils/retailexDevProxy';
import type { EticaretSettings } from './types';

export type TenantRegistryListItem = {
  code: string;
  display_name: string;
  module: string;
  eticaret_settings?: Partial<EticaretSettings> | null;
};

async function merkezFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getMerkezRestBaseUrl().replace(/\/+$/, '');
  const res = await fetchRetailexAware(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Merkez sorgusu başarısız (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Aktif perakende kiracıları — tema yönetimi listesi */
export async function listRetailTenantsForEticaret(): Promise<TenantRegistryListItem[]> {
  try {
    const rows = await merkezFetch<TenantRegistryListItem[]>(
      '/tenant_registry?is_active=eq.true&module=in.(retail,market)&select=code,display_name,module,eticaret_settings&order=display_name.asc',
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Kiracı vitrin ayarlarını merkez tenant_registry'ye yazar */
export async function saveTenantEticaretSettings(
  tenantCode: string,
  settings: Partial<EticaretSettings>,
): Promise<void> {
  const code = tenantCode.trim().toLowerCase();
  if (!code) throw new Error('Kiracı kodu boş olamaz.');

  await merkezFetch(
    `/tenant_registry?code=eq.${encodeURIComponent(code)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ eticaret_settings: settings, updated_at: new Date().toISOString() }),
    },
  );
}

/** Tek kiracının merkez kaydındaki eticaret ayarları */
export async function loadTenantEticaretSettingsFromRegistry(
  tenantCode: string,
): Promise<Partial<EticaretSettings> | null> {
  try {
    const rows = await merkezFetch<
      Array<{ eticaret_settings?: Partial<EticaretSettings> | null }>
    >(
      `/tenant_registry?code=eq.${encodeURIComponent(tenantCode)}&select=eticaret_settings&limit=1`,
    );
    const raw = rows?.[0]?.eticaret_settings;
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}
