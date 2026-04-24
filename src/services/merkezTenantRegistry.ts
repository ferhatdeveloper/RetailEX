/**
 * merkez_db.tenant_registry üzerinden kiracı çözümleme (PostgREST).
 * Uygulama henüz hedef kiracıya bağlı değilken merkez URL'sine doğrudan fetch yapılır.
 */

export type TenantRegistryRow = {
  id: string;
  code: string;
  display_name: string;
  module: string;
  database_name: string;
  connection_provider: 'db' | 'rest_api';
  rest_base_url: string | null;
  db_host: string | null;
  db_port: number | null;
  db_user: string | null;
  db_pass: string | null;
  db_sslmode: string | null;
  notes?: string | null;
  is_active?: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBaseUrl(input: string): string {
  return (input || '').trim().replace(/\/+$/, '');
}

/**
 * Modal / .env satırı yanlış yapıştırıldığında: `VITE_MERKEZ_REST_URL=http://host:3002` → sadece URL.
 */
export function sanitizeMerkezRestUrlInput(input: string): string {
  let s = (input || '').trim();
  s = s.replace(/^['"]+|['"]+$/g, '');
  const m = s.match(/^VITE_MERKEZ_REST_URL\s*=\s*(.+)$/i);
  if (m) s = m[1].trim();
  s = s.replace(/^['"]+|['"]+$/g, '');
  return s.trim();
}

/**
 * Öncelik: VITE_MERKEZ_REST_URL → localStorage merkez_postgrest_base_url → localhost:3002
 * veya aynı hostname üzerinde :3002 (merkez varsayılan portu).
 */
export function getMerkezRestBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_MERKEZ_REST_URL;
  if (env && String(env).trim()) {
    return normalizeBaseUrl(sanitizeMerkezRestUrlInput(String(env)));
  }

  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('merkez_postgrest_base_url');
    if (stored?.trim()) return normalizeBaseUrl(sanitizeMerkezRestUrlInput(stored));

    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:3002';
    return `${window.location.protocol}//${host}:3002`;
  }

  return 'http://127.0.0.1:3002';
}

function moduleToSystemType(module: string): 'retail' | 'market' | 'wms' | 'restaurant' | 'beauty' | 'bayi' {
  switch (module) {
    case 'clinic':
      return 'beauty';
    case 'restaurant':
      return 'restaurant';
    case 'retail':
      return 'retail';
    case 'pdks':
    case 'hrm':
      return 'retail';
    default:
      return 'retail';
  }
}

export async function fetchTenantRegistryRow(tenantInput: string): Promise<TenantRegistryRow> {
  const base = getMerkezRestBaseUrl();
  const q = tenantInput.trim();
  if (!q) throw new Error('Kiracı kodu veya ID boş olamaz.');

  const filter = UUID_RE.test(q) ? `id=eq.${encodeURIComponent(q)}` : `code=eq.${encodeURIComponent(q)}`;
  const url = `${base}/tenant_registry?${filter}&select=*`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Profile': 'public',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      'Adres: ' +
      base +
      ' — Yerelde :3002 dinlemiyorsa veya CORS kapalıysa oluşur. Opsiyonel alana tam merkez PostgREST URL yazın veya .env ile VITE_MERKEZ_REST_URL tanımlayın.';
    throw new Error(`Merkeze erişilemedi (${msg}). ${hint}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Merkez sorgusu başarısız (${res.status}): ${text || res.statusText}`);
  }

  const rows = (await res.json()) as TenantRegistryRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Kiracı bulunamadı (tenant_registry). Kod veya UUID kontrol edin.');
  }

  const row = rows[0];
  if (row.is_active === false) {
    throw new Error('Bu kiracı kaydı pasif (is_active = false).');
  }

  const provider = row.connection_provider === 'db' ? 'db' : 'rest_api';
  if (provider === 'rest_api') {
    const ru = (row.rest_base_url || '').trim();
    if (!ru) {
      throw new Error(
        'Kiracı için rest_base_url tanımlı değil. merkez_db.tenant_registry satırında rest_base_url doldurun.'
      );
    }
  } else {
    if (!row.db_host?.trim() || !row.database_name?.trim()) {
      throw new Error('db modu için db_host ve database_name zorunludur.');
    }
  }

  return { ...row, connection_provider: provider };
}

/** Tauri + web localStorage ile uyumlu tam config parçası */
export function tenantRowToAppConfigPatch(
  row: TenantRegistryRow,
  options?: { preserveDbPassword?: string; forTauri?: boolean }
): Record<string, unknown> {
  const provider = row.connection_provider;
  const system_type = moduleToSystemType(row.module);
  const preserve = options?.preserveDbPassword ?? '';
  const forTauri = options?.forTauri === true;

  const patch: Record<string, unknown> = {
    is_configured: true,
    db_mode: 'online',
    system_type,
    connection_provider: provider,
    merkez_tenant_code: row.code,
    merkez_tenant_id: row.id,
    merkez_display_name: row.display_name,
  };

  const host = (row.db_host || '').trim() || '127.0.0.1';
  const port = row.db_port && row.db_port > 0 ? row.db_port : 5432;
  const dbn = row.database_name;
  const user = (row.db_user || '').trim() || 'postgres';
  const pass =
    row.db_pass != null && String(row.db_pass) !== '' ? String(row.db_pass) : preserve;

  if (provider === 'rest_api') {
    patch.remote_rest_url = normalizeBaseUrl(row.rest_base_url || '');
    patch.connection_provider = 'rest_api';
    patch.remote_host = host;
    patch.remote_port = port;
    patch.pg_remote_user = user;
    if (pass) patch.pg_remote_pass = pass;
    patch.remote_db = forTauri ? `${host}:${port}/${dbn}` : dbn;
  } else {
    patch.connection_provider = 'db';
    patch.remote_rest_url = '';
    patch.remote_host = (row.db_host || '').trim();
    patch.remote_port = port;
    patch.pg_remote_user = user;
    if (pass) patch.pg_remote_pass = pass;
    const h2 = String(patch.remote_host || '').trim();
    patch.remote_db = forTauri && h2 ? `${h2}:${port}/${row.database_name}` : row.database_name;
  }

  return patch;
}
