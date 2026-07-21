/**
 * merkez_db.tenant_registry üzerinden kiracı çözümleme (PostgREST).
 * Web `src/services/merkezTenantRegistry.ts` ile aynı SaaS sözleşmesi — Expo uyumlu.
 */

export type TenantRegistryRow = {
  id: string;
  code: string;
  display_name: string;
  module: string;
  database_name: string;
  connection_provider: 'db' | 'rest_api';
  rest_base_url: string | null;
  is_active?: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** RetailEX SaaS kiracı PostgREST kökü */
export const DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN = 'https://api.retailex.app';

function normalizeBaseUrl(input: string): string {
  return (input || '').trim().replace(/\/+$/, '');
}

export function buildSaaSTenantPostgrestUrl(slug: string): string {
  const o = normalizeBaseUrl(DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN);
  const s = String(slug || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!s) return o;
  return `${o}/${s}`;
}

/** `https://api.retailex.app` → `…/merkez` */
export function finalizeMerkezRestBaseUrl(input: string): string {
  const sanitized = (input || '').trim().replace(/^['"]+|['"]+$/g, '');
  if (!sanitized) return '';
  try {
    const withProto = /^https?:\/\//i.test(sanitized) ? sanitized : `https://${sanitized}`;
    const u = new URL(withProto);
    const pathOnly = u.pathname.replace(/\/+$/, '') || '/';
    if (u.hostname === 'api.retailex.app' && pathOnly === '/') {
      u.pathname = '/merkez';
    }
    return normalizeBaseUrl(u.toString());
  } catch {
    return normalizeBaseUrl(sanitized);
  }
}

export function getMerkezRestBaseUrl(): string {
  const env = String(process.env.EXPO_PUBLIC_MERKEZ_REST_URL || '').trim();
  if (env) return finalizeMerkezRestBaseUrl(env);
  return finalizeMerkezRestBaseUrl(DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN);
}

function validateTenantRegistryRow(row: TenantRegistryRow): TenantRegistryRow {
  if (row.is_active === false) {
    throw new Error('Bu kiracı kaydı pasif (is_active = false).');
  }
  const provider = row.connection_provider === 'db' ? 'db' : 'rest_api';
  if (provider === 'rest_api') {
    const ru = (row.rest_base_url || '').trim();
    if (!ru) {
      throw new Error(
        'Kiracı için rest_base_url tanımlı değil. tenant_registry satırını kontrol edin.',
      );
    }
  }
  return row;
}

async function queryTenantRegistryRows(filter: string): Promise<TenantRegistryRow[]> {
  const base = normalizeBaseUrl(getMerkezRestBaseUrl());
  const url = `${base}/tenant_registry?${filter}&select=id,code,display_name,module,database_name,connection_provider,rest_base_url,is_active`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Merkeze erişilemedi (${msg}). Adres: ${base}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Merkez sorgusu başarısız (${res.status}): ${text || res.statusText}`);
  }
  const rows = (await res.json()) as TenantRegistryRow[];
  return Array.isArray(rows) ? rows : [];
}

export async function fetchTenantRegistryRow(tenantInput: string): Promise<TenantRegistryRow> {
  const q = tenantInput.trim();
  if (!q) throw new Error('Kiracı kodu boş olamaz.');
  const filter = UUID_RE.test(q)
    ? `id=eq.${encodeURIComponent(q)}`
    : `code=eq.${encodeURIComponent(q.toLowerCase())}`;
  const rows = await queryTenantRegistryRows(filter);
  if (rows.length === 0) {
    throw new Error('Kiracı bulunamadı. Kodu kontrol edin (örn. ozbek, lovan).');
  }
  return validateTenantRegistryRow(rows[0]!);
}

export type ResolvedTenantConnection = {
  code: string;
  displayName: string;
  remoteRestUrl: string;
  databaseName: string;
  fromRegistry: boolean;
  warning?: string;
};

/**
 * Kısa kiracı kodu → PostgREST tabanı.
 * Önce merkez tenant_registry; başarısızsa https://api.retailex.app/{kod} (uyarı ile).
 */
export async function resolveTenantByCode(rawCode: string): Promise<ResolvedTenantConnection> {
  const code = String(rawCode || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '');
  if (!code) throw new Error('Kiracı kodu boş olamaz.');
  if (code === 'merkez') {
    throw new Error('merkez kayıt servisidir; kiracı kodu girin (örn. ozbek).');
  }
  if (/^https?:\/\//i.test(code)) {
    throw new Error('Yalnızca kısa kiracı kodu girin; tam URL için Gelişmiş bölümünü kullanın.');
  }

  try {
    const row = await fetchTenantRegistryRow(code);
    const url = normalizeBaseUrl(row.rest_base_url || '') || buildSaaSTenantPostgrestUrl(row.code);
    return {
      code: row.code,
      displayName: row.display_name || row.code,
      remoteRestUrl: url,
      databaseName: row.database_name || '',
      fromRegistry: true,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const guessed = buildSaaSTenantPostgrestUrl(code);
    return {
      code,
      displayName: code,
      remoteRestUrl: guessed,
      databaseName: '',
      fromRegistry: false,
      warning: `Merkez kaydı okunamadı (${msg}). Tahmini adres kullanıldı: ${guessed}`,
    };
  }
}

/** Kayıtlı PostgREST URL’den SaaS slug çıkar (varsa) */
export function tenantCodeFromRemoteRestUrl(remoteRestUrl: string): string {
  const t = normalizeBaseUrl(remoteRestUrl);
  if (!t) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.hostname !== 'api.retailex.app') return '';
    const segs = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segs.length === 1 && segs[0] && segs[0] !== 'merkez') return segs[0];
  } catch {
    /* ignore */
  }
  return '';
}
