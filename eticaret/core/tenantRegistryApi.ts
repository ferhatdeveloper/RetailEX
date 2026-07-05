import { getMerkezRestBaseUrl } from '../../src/services/merkezTenantRegistry';
import { fetchRetailexAware } from '../../src/utils/retailexDevProxy';
import type { EticaretSettings } from './types';

export type TenantRegistryListItem = {
  code: string;
  display_name: string;
  module: string;
  eticaret_settings?: Partial<EticaretSettings> | null;
};

function bridgeUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function dedupeTenants(rows: TenantRegistryListItem[]): TenantRegistryListItem[] {
  const map = new Map<string, TenantRegistryListItem>();
  for (const row of rows) {
    const code = row.code.trim().toLowerCase();
    if (!code) continue;
    if (!map.has(code)) {
      map.set(code, { ...row, code });
    }
  }
  return [...map.values()].sort((a, b) =>
    (a.display_name || a.code).localeCompare(b.display_name || b.code, 'tr'),
  );
}

function listLocalTenantFallbacks(): TenantRegistryListItem[] {
  if (typeof window === 'undefined') return [];
  const out: TenantRegistryListItem[] = [];
  try {
    const raw = window.localStorage.getItem('retailex_web_config');
    if (raw) {
      const cfg = JSON.parse(raw) as Record<string, unknown>;
      const code = String(cfg.merkez_tenant_code ?? '').trim().toLowerCase();
      if (code) {
        out.push({
          code,
          display_name: String(cfg.merkez_display_name ?? code).trim() || code,
          module: 'retail',
        });
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const eticaretRaw = window.localStorage.getItem('retailex_eticaret_settings');
    if (eticaretRaw) {
      const parsed = JSON.parse(eticaretRaw) as { demoTenantCode?: string };
      const demo = String(parsed.demoTenantCode ?? '').trim().toLowerCase();
      if (demo) {
        out.push({ code: demo, display_name: `${demo} (demo)`, module: 'retail' });
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

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

async function fetchTenantsFromBridge(): Promise<TenantRegistryListItem[]> {
  if (typeof window === 'undefined') return [];
  try {
    const res = await fetch(bridgeUrl('/api/eticaret/tenants'), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { tenants?: TenantRegistryListItem[] };
    return Array.isArray(data.tenants) ? data.tenants : [];
  } catch {
    return [];
  }
}

/** Aktif perakende kiracıları — tema yönetimi listesi */
export async function listRetailTenantsForEticaret(): Promise<TenantRegistryListItem[]> {
  const fromBridge = await fetchTenantsFromBridge();
  if (fromBridge.length) return dedupeTenants(fromBridge);

  try {
    const rows = await merkezFetch<TenantRegistryListItem[]>(
      '/tenant_registry?is_active=eq.true&select=code,display_name,module,eticaret_settings&order=display_name.asc',
    );
    if (Array.isArray(rows) && rows.length) return dedupeTenants(rows);
  } catch {
    /* PostgREST yok */
  }

  const local = listLocalTenantFallbacks();
  if (local.length) return dedupeTenants(local);

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return [{ code: 'retailex_local', display_name: 'Yerel (retailex_local)', module: 'retail' }];
    }
  }

  return [];
}

/** Kiracı vitrin ayarlarını merkez tenant_registry'ye yazar */
export async function saveTenantEticaretSettings(
  tenantCode: string,
  settings: Partial<EticaretSettings>,
): Promise<void> {
  const code = tenantCode.trim().toLowerCase();
  if (!code) throw new Error('Kiracı kodu boş olamaz.');

  try {
    await merkezFetch(
      `/tenant_registry?code=eq.${encodeURIComponent(code)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ eticaret_settings: settings, updated_at: new Date().toISOString() }),
      },
    );
  } catch {
    /* Merkez yoksa yalnızca kiracı DB kaydı yeterli (saveTenantEticaretSettingsFull) */
  }
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
