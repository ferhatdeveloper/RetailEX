/**
 * RetailEX Terazi Köprüsü — Windows servisi / arka plan.
 * JSON yapılandırma + HTTP API; uygulama kapalıyken PLU gönderimi.
 *
 * Varsayılan config: C:\ProgramData\RetailEX\scale-bridge.json
 * Port: SCALE_BRIDGE_PORT (3012)
 */
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rongtaTcpSendPlu, rongtaTcpTest, rongtaTcpFetchSales, discoverRongtaPort, tcpProbePorts } from './rongtaTcp.mjs';
import { scanNetworkForScales, guessLocalSubnet } from './scan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADMIN_DIR = join(__dirname, 'admin');
const DEFAULT_CONFIG_PATH = process.env.SCALE_BRIDGE_CONFIG
  || 'C:\\ProgramData\\RetailEX\\scale-bridge.json';
const PORT = Number(process.env.SCALE_BRIDGE_PORT || 3012);
const HOST = process.env.SCALE_BRIDGE_HOST || '0.0.0.0';

const DEFAULT_CONFIG = {
  listenHost: HOST,
  listenPort: PORT,
  authToken: '',
  storeCode: '',
  storeName: '',
  scales: [],
};

let config = { ...DEFAULT_CONFIG };
let configPath = DEFAULT_CONFIG_PATH;

function json(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function authOk(req) {
  const token = (config.authToken || '').trim();
  if (!token) return true;
  const h = req.headers.authorization || '';
  return h === `Bearer ${token}`;
}

function isLocalRequest(req) {
  const ip = req.socket?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function requiresAuth(req, path) {
  if (path === '/status') return false;
  if (path.startsWith('/ui')) return false;
  if (isLocalRequest(req)) return false;
  return true;
}

async function loadConfig() {
  configPath = process.env.SCALE_BRIDGE_CONFIG || DEFAULT_CONFIG_PATH;
  try {
    if (!existsSync(configPath)) {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
      config = { ...DEFAULT_CONFIG };
      return;
    }
    const raw = await readFile(configPath, 'utf8');
    config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    if (!Array.isArray(config.scales)) config.scales = [];
  } catch (e) {
    console.error('[scale-bridge] config load error:', e);
    config = { ...DEFAULT_CONFIG };
  }
}

async function saveConfig() {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function findScale(id) {
  return config.scales.find((s) => s.id === id);
}

function scaleToDevice(scale) {
  return {
    id: scale.id,
    name: scale.name,
    brand: scale.brand || 'rongta',
    model: scale.model || 'RLS1100',
    connectionType: 'tcp',
    ipAddress: scale.ipAddress,
    port: scale.port || 20304,
    status: scale.enabled === false ? 'offline' : 'online',
    lastSync: scale.lastSync,
    productCount: scale.productCount,
  };
}

function recordsFromProducts(products, pluStart = 1) {
  return products.map((p, idx) => ({
    pluCode: String(p.pluCode || pluStart + idx).padStart(5, '0'),
    name: String(p.name || '').slice(0, 36),
    price: Number(p.price) || 0,
    unit: p.unit || 'KG',
    barcode: p.barcode,
    rank: pluStart + idx,
    lfCode: String(p.pluCode || pluStart + idx).replace(/\D/g, '').slice(-6).padStart(6, '0'),
    operate: 'I',
  }));
}

function serveAdminFile(res, relPath, contentType) {
  const filePath = join(ADMIN_DIR, relPath);
  if (!filePath.startsWith(ADMIN_DIR) || !existsSync(filePath)) {
    console.error('[scale-bridge] admin file missing:', filePath);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`admin dosyasi bulunamadi: ${relPath}\nADMIN_DIR=${ADMIN_DIR}`);
  }
  const body = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(body);
}

async function handle(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  if (req.method === 'GET' && path === '/') {
    res.writeHead(302, { Location: '/ui/' });
    return res.end();
  }

  if (req.method === 'GET' && (path === '/ui' || path === '/ui/')) {
    res.writeHead(302, { Location: '/ui/index.html' });
    return res.end();
  }

  if (req.method === 'GET' && path.startsWith('/ui/')) {
    const rel = path.slice('/ui/'.length) || 'index.html';
    if (rel === 'index.html' || rel.endsWith('.html')) {
      return serveAdminFile(res, rel === 'index.html' ? 'index.html' : rel, 'text/html; charset=utf-8');
    }
    return json(res, 404, { error: 'not_found' });
  }

  if (requiresAuth(req, path) && !authOk(req)) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET' && path === '/status') {
      return json(res, 200, {
        ok: true,
        service: 'retailex-scale-bridge',
        storeCode: config.storeCode,
        storeName: config.storeName,
        scaleCount: config.scales.length,
        configPath,
        port: PORT,
      });
    }

    if (req.method === 'GET' && path === '/config') {
      const maskToken = requiresAuth(req, path);
      return json(res, 200, {
        ...config,
        listenPort: config.listenPort || PORT,
        authToken: maskToken && config.authToken ? '***' : (config.authToken || ''),
      });
    }

    if (req.method === 'GET' && path === '/scan/defaults') {
      const d = guessLocalSubnet();
      return json(res, 200, d);
    }

    if (req.method === 'POST' && path === '/scan') {
      const body = await readBody(req);
      const result = await scanNetworkForScales({
        startIP: body.startIP,
        endIP: body.endIP,
        concurrency: body.concurrency,
        ports: body.ports,
      });
      return json(res, 200, result);
    }

    if (req.method === 'PUT' && path === '/config') {
      const body = await readBody(req);
      if (body.storeCode !== undefined) config.storeCode = String(body.storeCode);
      if (body.storeName !== undefined) config.storeName = String(body.storeName);
      if (body.authToken !== undefined && body.authToken !== '***') config.authToken = String(body.authToken);
      if (Array.isArray(body.scales)) config.scales = body.scales;
      await saveConfig();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && path === '/scales') {
      return json(res, 200, { scales: config.scales.map(scaleToDevice) });
    }

    if (req.method === 'POST' && path === '/scales') {
      const body = await readBody(req);
      const scale = {
        id: body.id || `scale-${Date.now()}`,
        name: body.name || 'Terazi',
        brand: body.brand || 'rongta',
        model: body.model || 'RLS1100',
        ipAddress: body.ipAddress,
        port: body.port || 20304,
        enabled: body.enabled !== false,
      };
      if (!scale.ipAddress) return json(res, 400, { error: 'ipAddress gerekli' });
      const idx = config.scales.findIndex((s) => s.id === scale.id);
      if (idx >= 0) config.scales[idx] = { ...config.scales[idx], ...scale };
      else config.scales.push(scale);
      await saveConfig();
      return json(res, 200, { ok: true, scale: scaleToDevice(scale) });
    }

    if (req.method === 'DELETE' && path.startsWith('/scales/')) {
      const id = decodeURIComponent(path.slice('/scales/'.length));
      config.scales = config.scales.filter((s) => s.id !== id);
      await saveConfig();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && path === '/scales/probe') {
      const body = await readBody(req);
      const ipAddress = String(body.ipAddress || '').trim();
      const port = Number(body.port) || 0;
      if (!ipAddress) return json(res, 400, { error: 'ipAddress gerekli' });
      const discovery = await discoverRongtaPort(ipAddress, port || undefined);
      const tcp = await tcpProbePorts(ipAddress, port || undefined);
      return json(res, 200, {
        ipAddress,
        found: discovery.found,
        suggestedPort: discovery.found ? discovery.port : null,
        checks: discovery.checks,
        tcpChecks: tcp,
      });
    }

    if (req.method === 'POST' && path.match(/^\/scales\/[^/]+\/test$/)) {
      const id = decodeURIComponent(path.split('/')[2]);
      const scale = findScale(id);
      if (!scale) return json(res, 404, { error: 'Terazi bulunamadı' });
      const result = await rongtaTcpTest(scale.ipAddress, scale.port);
      if (result.ok && result.suggestedPort && result.suggestedPort !== scale.port) {
        const idx = config.scales.findIndex((s) => s.id === scale.id);
        if (idx >= 0) {
          config.scales[idx].port = result.suggestedPort;
          await saveConfig();
        }
      }
      return json(res, 200, { ok: !!result.ok, ...result });
    }

    if (req.method === 'POST' && path === '/send-plu') {
      const body = await readBody(req);
      const scaleId = body.scaleId;
      const scale = findScale(scaleId);
      if (!scale) return json(res, 404, { success: false, message: 'Terazi bulunamadı' });
      const products = Array.isArray(body.products) ? body.products : [];
      const pluStart = Number(body.pluStartIndex) || 1;
      const records = Array.isArray(body.records) && body.records.length
        ? body.records
        : recordsFromProducts(products, pluStart);
      if (!records.length) return json(res, 400, { success: false, message: 'Ürün listesi boş' });

      const result = await rongtaTcpSendPlu(scale.ipAddress, scale.port, records);
      if (result.success) {
        scale.lastSync = new Date().toISOString();
        scale.productCount = (scale.productCount || 0) + (result.sentCount || 0);
        await saveConfig();
      }
      return json(res, result.success ? 200 : 502, result);
    }

    if (req.method === 'POST' && path.match(/^\/scales\/[^/]+\/sales$/)) {
      const id = decodeURIComponent(path.split('/')[2]);
      const scale = findScale(id);
      if (!scale) return json(res, 404, { success: false, message: 'Terazi bulunamadı' });
      const body = await readBody(req);
      const result = await rongtaTcpFetchSales(scale.ipAddress, scale.port, {
        maxRecords: Number(body.maxRecords) || 500,
        timeoutMs: Number(body.timeoutMs) || 15000,
      });
      return json(res, result.success ? 200 : 502, result);
    }

    return json(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error('[scale-bridge]', e);
    return json(res, 500, { error: e instanceof Error ? e.message : 'internal error' });
  }
}

await loadConfig();
const server = http.createServer((req, res) => { handle(req, res); });
server.listen(PORT, HOST, () => {
  console.log(`[scale-bridge] http://${HOST}:${PORT} config=${configPath}`);
  console.log(`[scale-bridge] Yönetim UI: http://127.0.0.1:${PORT}/ui/`);
});
