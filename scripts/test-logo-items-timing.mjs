#!/usr/bin/env node
/**
 * Logo REST /items yanıt süresi ölçümü (köprü üzerinden)
 */
const BASE = 'http://185.206.80.132:32001/api/v1';
const BRIDGE = process.env.BRIDGE_URL || 'https://retailex.app';
const CLIENT_ID = 'ARZEN';
const CLIENT_SECRET = 'r1k1C+lyPK6BKFkrLdA3IFXawk2fiuFdCqbrMc5zQd8=';
const USER = 'LOGO';
const PASS = '2661';
const FIRM = Number(process.env.LOGO_FIRM || 2);
const PERIOD = Number(process.env.LOGO_PERIOD || 1);

async function proxy(method, path, headers = {}, body = null, query = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BRIDGE}/api/logo/proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: BASE, method, path, headers, body, query }),
    signal: AbortSignal.timeout(300_000),
  });
  const json = await res.json();
  const ms = Date.now() - t0;
  return { ms, json };
}

async function main() {
  console.log('Bridge:', BRIDGE);
  console.log('Logo:', BASE, 'firm', FIRM, 'period', PERIOD);

  const tokenBody = new URLSearchParams({
    grant_type: 'password',
    username: USER,
    password: PASS,
    firmno: String(FIRM),
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }).toString();

  let r = await proxy('POST', '/token', { 'Content-Type': 'application/x-www-form-urlencoded' }, tokenBody);
  console.log('token:', r.ms, 'ms', r.json?.proxy?.ok, r.json?.proxy?.status);
  const token = r.json?.proxy?.data?.access_token;
  if (!token) {
    console.error('Token alınamadı', JSON.stringify(r.json).slice(0, 500));
    process.exit(1);
  }

  const auth = { Authorization: `Bearer ${token}` };
  r = await proxy('GET', `/methods/CompanyLogin/${FIRM}/${PERIOD}`, auth);
  console.log('CompanyLogin:', r.ms, 'ms', r.json?.proxy?.ok, r.json?.proxy?.status);

  for (const limit of [1, 5, 25]) {
    r = await proxy('GET', '/items', auth, null, { limit: String(limit), withCount: 'true' });
    const count = r.json?.proxy?.data?.totalCount ?? r.json?.proxy?.data?.count ?? '?';
    const items = Array.isArray(r.json?.proxy?.data?.items)
      ? r.json.proxy.data.items.length
      : Array.isArray(r.json?.proxy?.data)
        ? r.json.proxy.data.length
        : '?';
    console.log(`/items limit=${limit}:`, r.ms, 'ms ok=', r.json?.proxy?.ok, 'count=', count, 'items=', items);
    if (!r.json?.proxy?.ok) {
      console.log('  err:', String(r.json?.proxy?.text || '').slice(0, 200));
    }
  }

  r = await proxy('GET', '/Arps', auth, null, { limit: '5', withCount: 'true' });
  console.log('/Arps limit=5:', r.ms, 'ms ok=', r.json?.proxy?.ok);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
