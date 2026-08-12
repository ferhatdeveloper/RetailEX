#!/usr/bin/env node
/**
 * Logo → yerel PG kısmi senkron testi (2 sayfa ürün + 1 sayfa cari)
 */
const BASE = 'http://185.206.80.132:32001/api/v1';
const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:3001';
const CLIENT_ID = 'ARZEN';
const CLIENT_SECRET = 'r1k1C+lyPK6BKFkrLdA3IFXawk2fiuFdCqbrMc5zQd8=';
const USER = 'LOGO';
const PASS = '2661';
const FIRM = Number(process.env.LOGO_FIRM || 2);
const PERIOD = Number(process.env.LOGO_PERIOD || 1);
const PAGE_SIZE = 15;

async function proxy(method, path, headers = {}, body = null, query = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BRIDGE}/api/logo/proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: BASE, method, path, headers, body, query }),
    signal: AbortSignal.timeout(300_000),
  });
  const json = await res.json();
  return { ms: Date.now() - t0, json };
}

function unwrapItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.Items)) return data.Items;
  return [];
}

async function main() {
  const tokenBody = new URLSearchParams({
    grant_type: 'password',
    username: USER,
    password: PASS,
    firmno: String(FIRM),
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }).toString();

  let r = await proxy('POST', '/token', { 'Content-Type': 'application/x-www-form-urlencoded' }, tokenBody);
  const token = r.json?.proxy?.data?.access_token;
  if (!token) throw new Error('Token yok: ' + JSON.stringify(r.json).slice(0, 300));
  console.log('✓ Token', r.ms, 'ms');

  const auth = { Authorization: `Bearer ${token}` };
  await proxy('GET', `/methods/CompanyLogin/${FIRM}/${PERIOD}`, auth).catch(() => {});

  const products = [];
  for (let offset = 0; offset < PAGE_SIZE * 2; offset += PAGE_SIZE) {
    const q = { limit: String(PAGE_SIZE), withCount: offset === 0 ? 'true' : 'false' };
    if (offset > 0) q.offset = String(offset);
    r = await proxy('GET', '/items', auth, null, q);
    if (!r.json?.proxy?.ok) throw new Error(`/items offset=${offset} fail: ${r.json?.proxy?.text?.slice(0, 200)}`);
    const batch = unwrapItems(r.json.proxy.data);
    products.push(...batch);
    console.log(`✓ /items offset=${offset}: ${batch.length} kayıt (${r.ms} ms), toplam=${products.length}`);
    if (batch.length < PAGE_SIZE) break;
  }

  r = await proxy('GET', '/Arps', auth, null, { limit: '10', withCount: 'true' });
  if (!r.json?.proxy?.ok) throw new Error('/Arps fail');
  const arps = unwrapItems(r.json.proxy.data);
  console.log(`✓ /Arps: ${arps.length} kayıt (${r.ms} ms)`);

  // Yerel PG'ye örnek yazım
  const { execSync } = await import('node:child_process');
  const sample = products[0];
  const rec = sample?.restRecord ?? sample ?? {};
  const code = String(rec.CODE ?? rec.code ?? 'LOGO_TEST').trim();
  const name = String(rec.NAME ?? rec.name ?? code).trim().replace(/'/g, "''");
  const sql = `INSERT INTO rex_001_products (firm_nr, code, name, barcode, vat_rate, price, unit, is_active)
    VALUES ('001', '${code.replace(/'/g, "''")}', '${name}', 'L${code.replace(/'/g, "''")}', 18, 0, 'Adet', true)
    ON CONFLICT (firm_nr, code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
    RETURNING code, name;`;
  const out = execSync(
    `sudo -u postgres psql -d retailex_local -t -A -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' }
  );
  console.log('✓ PG upsert örnek:', out.trim());

  const count = execSync(
    `sudo -u postgres psql -d retailex_local -t -A -c "SELECT COUNT(*) FROM rex_001_products WHERE code LIKE 'L%' OR source='logo_rest';"`,
    { encoding: 'utf8' }
  ).trim();
  console.log('\nÖzet: Logo ürün okundu=', products.length, '| cari okundu=', arps.length, '| PG ürün sayısı (L*/logo)=', count);
}

main().catch((e) => {
  console.error('HATA:', e.message || e);
  process.exit(1);
});
