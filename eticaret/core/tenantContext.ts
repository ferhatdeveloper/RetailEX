import {
  buildSaaSTenantPostgrestUrl,
  fetchTenantRegistryRow,
  type TenantRegistryRow,
} from '../../src/services/merkezTenantRegistry';
import { fetchRetailexAware } from '../../src/utils/retailexDevProxy';
import {
  DEFAULT_ETICARET_SETTINGS,
  loadEticaretSettings,
  loadEticaretSettingsFromDb,
} from './settings';
import { resolveEticaretTenant } from './tenantResolver';
import type { EticaretSettings, ResolvedEticaretTenant } from './types';

export type StorefrontContext = {
  tenant: ResolvedEticaretTenant;
  catalogTenantCode: string;
  registry: TenantRegistryRow | null;
  settings: EticaretSettings;
  restBase: string;
  firmNr: string;
  currency: string;
};

const PRODUCT_FIRM_CANDIDATES = ['001', '1', '01', '002', '2'];

function normalizeRestBase(tenantCode: string, registry: TenantRegistryRow | null): string {
  const fromRegistry = String(registry?.rest_base_url ?? '').trim().replace(/\/+$/, '');
  if (fromRegistry) return fromRegistry;
  return buildSaaSTenantPostgrestUrl(tenantCode);
}

async function fetchRegistrySafe(tenantCode: string): Promise<TenantRegistryRow | null> {
  try {
    return await fetchTenantRegistryRow(tenantCode);
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetchRetailexAware(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchTenantSystemSettings(
  restBase: string,
): Promise<{ firmNr: string; currency: string; eticaret?: Partial<EticaretSettings> }> {
  const rows = await fetchJson<
    Array<{
      primary_firm_nr?: string | null;
      default_currency?: string | null;
      eticaret_settings?: Partial<EticaretSettings> | null;
    }>
  >(`${restBase}/system_settings?id=eq.1&select=primary_firm_nr,default_currency,eticaret_settings&limit=1`);

  const row = rows?.[0];
  const firmRaw = String(row?.primary_firm_nr ?? '001').trim() || '001';
  const firmNr = firmRaw.padStart(3, '0').slice(0, 10);
  const currency = String(row?.default_currency ?? 'TRY').trim() || 'TRY';
  const eticaret =
    row?.eticaret_settings && typeof row.eticaret_settings === 'object'
      ? row.eticaret_settings
      : undefined;

  return { firmNr, currency, eticaret };
}

function mergeEticaretSettings(
  global: EticaretSettings,
  registry?: Partial<EticaretSettings> | null,
  tenantDb?: Partial<EticaretSettings> | null,
): EticaretSettings {
  return {
    ...DEFAULT_ETICARET_SETTINGS,
    ...global,
    ...(registry && typeof registry === 'object' ? registry : {}),
    ...(tenantDb && typeof tenantDb === 'object' ? tenantDb : {}),
  };
}

function resolveCatalogTenantCode(
  tenant: ResolvedEticaretTenant,
  globalSettings: EticaretSettings,
): string {
  if (tenant.source === 'demo' && globalSettings.demoTenantCode.trim()) {
    return globalSettings.demoTenantCode.trim().toLowerCase();
  }
  return tenant.tenantCode;
}

/**
 * Vitrin için kiracı bağlamı: registry, tema ayarları, PostgREST tabanı, firma no.
 */
export async function buildStorefrontContext(pathTenantCode?: string | null): Promise<StorefrontContext> {
  const tenant = resolveEticaretTenant({ pathTenantCode });
  let globalSettings = loadEticaretSettings();

  try {
    globalSettings = await loadEticaretSettingsFromDb();
  } catch {
    /* localStorage yeterli */
  }

  const catalogTenantCode = resolveCatalogTenantCode(tenant, globalSettings);
  const registry = await fetchRegistrySafe(catalogTenantCode);
  const restBase = normalizeRestBase(catalogTenantCode, registry);

  let firmNr = '001';
  let currency = 'TRY';
  let tenantDbSettings: Partial<EticaretSettings> | undefined;

  try {
    const sys = await fetchTenantSystemSettings(restBase);
    firmNr = sys.firmNr;
    currency = sys.currency;
    tenantDbSettings = sys.eticaret;
  } catch {
    /* PostgREST erişilemezse varsayılan */
  }

  const registrySettings = registry?.eticaret_settings as Partial<EticaretSettings> | null | undefined;

  const settings = mergeEticaretSettings(
    globalSettings,
    registrySettings ?? null,
    tenantDbSettings ?? null,
  );

  if (settings.catalogFirmNr?.trim()) {
    firmNr = settings.catalogFirmNr.trim().padStart(3, '0').slice(0, 10);
  }

  const displayName = registry?.display_name?.trim();
  const enrichedTenant: ResolvedEticaretTenant = {
    ...tenant,
    displayName: displayName || tenant.displayName || catalogTenantCode,
  };

  return {
    tenant: enrichedTenant,
    catalogTenantCode,
    registry,
    settings,
    restBase,
    firmNr,
    currency,
  };
}

export function productTableForFirm(firmNr: string): string {
  const padded = String(firmNr || '001').trim().padStart(3, '0').slice(0, 10);
  return `rex_${padded}_products`;
}

export function firmNrCandidates(primary: string): string[] {
  const raw = String(primary || '001').trim();
  const padded = raw.padStart(3, '0').slice(0, 10);
  const out = new Set<string>([padded, raw, raw.replace(/^0+/, '') || '0', ...PRODUCT_FIRM_CANDIDATES]);
  return [...out].filter(Boolean);
}
