/**
 * RetailEX WhatsApp köprüsü — Baileys tabanlı HTTP API.
 *
 *   GET  /status  → { status, qr? }
 *   POST /send    → { to, text }
 *   POST /reset   → oturumu sıfırla, yeni QR üret
 */
import http from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WA_BRIDGE_PORT || 3000);
const TOKEN = (process.env.WA_BRIDGE_TOKEN || '').trim();
const AUTH_DIR = resolve(__dirname, process.env.WA_BRIDGE_AUTH_DIR || '.wa-auth');

let sock = null;
let connectionStatus = 'disconnected';
let lastQrRaw = null;
let starting = false;
let resetInProgress = false;

function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function authOk(req) {
  if (!TOKEN) return true;
  const h = req.headers.authorization || '';
  return h === `Bearer ${TOKEN}`;
}

function normalizeDigits(raw) {
  let p = String(raw || '').replace(/\D/g, '');
  if (p.length === 10) p = `90${p}`;
  return p;
}

async function qrToDataUrl(raw) {
  if (!raw) return null;
  try {
    return await QRCode.toDataURL(raw, { margin: 1, width: 280 });
  } catch {
    return raw;
  }
}

function publicStatus() {
  if (lastQrRaw && connectionStatus !== 'connected') {
    return 'scanning';
  }
  return connectionStatus;
}

async function destroySocket() {
  if (sock) {
    try {
      sock.end(undefined);
    } catch {
      /* ignore */
    }
    sock = null;
  }
  starting = false;
}

async function clearAuthDir() {
  await destroySocket();
  connectionStatus = 'disconnected';
  lastQrRaw = null;
  await rm(AUTH_DIR, { recursive: true, force: true });
  await mkdir(AUTH_DIR, { recursive: true });
}

/** Bağlı oturumu WhatsApp tarafında kapat, dosyaları sil, yeni QR için hazırla. */
async function logoutAndClearSession() {
  if (sock && connectionStatus === 'connected') {
    try {
      await sock.logout();
      console.log('[wa-bridge] Oturum kapatıldı (logout)');
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      console.warn('[wa-bridge] logout hatası (yine de sıfırlanacak):', e?.message || e);
    }
  }
  await clearAuthDir();
}

async function startSocket() {
  if (sock || starting || resetInProgress) return;
  starting = true;
  try {
    await mkdir(AUTH_DIR, { recursive: true });
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const logger = pino({ level: 'silent' });

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      browser: Browsers.ubuntu('Chrome'),
      getMessage: async () => undefined,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        lastQrRaw = qr;
        connectionStatus = 'scanning';
        console.log('[wa-bridge] QR üretildi');
      }
      if (connection === 'open') {
        connectionStatus = 'connected';
        lastQrRaw = null;
        console.log('[wa-bridge] WhatsApp bağlandı');
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log('[wa-bridge] Bağlantı kapandı, kod:', code ?? '—');
        await destroySocket();
        connectionStatus = 'disconnected';
        if (code === DisconnectReason.loggedOut) {
          lastQrRaw = null;
          await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
          await mkdir(AUTH_DIR, { recursive: true }).catch(() => {});
        }
        if (!resetInProgress && code !== DisconnectReason.loggedOut) {
          setTimeout(() => void startSocket(), 2000);
        } else if (code === DisconnectReason.loggedOut) {
          setTimeout(() => void startSocket(), 1000);
        }
      }
    });
  } catch (e) {
    console.error('[wa-bridge] Başlatma hatası:', e);
    connectionStatus = 'disconnected';
    await destroySocket();
  } finally {
    starting = false;
  }
}

async function waitForQr(maxMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (lastQrRaw || connectionStatus === 'connected') return;
    if (!sock && !starting) await startSocket();
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function handleStatus(_req, res) {
  if (!sock && !starting) await startSocket();
  if (!lastQrRaw && connectionStatus !== 'connected') {
    await waitForQr(6000);
  }
  const qr = lastQrRaw ? await qrToDataUrl(lastQrRaw) : null;
  json(res, 200, { status: publicStatus(), qr });
}

async function handleReset(_req, res) {
  resetInProgress = true;
  try {
    await logoutAndClearSession();
    await startSocket();
    await waitForQr(10000);
    const qr = lastQrRaw ? await qrToDataUrl(lastQrRaw) : null;
    json(res, 200, {
      success: true,
      status: publicStatus(),
      qr,
      message: qr
        ? 'Oturum kapatıldı — yeni QR hazır'
        : 'Oturum sıfırlandı — QR için /status veya panelden yenileyin',
    });
  } catch (e) {
    json(res, 500, { success: false, error: e?.message || String(e) });
  } finally {
    resetInProgress = false;
  }
}

async function handleSend(req, res) {
  if (!sock) await startSocket();
  if (connectionStatus !== 'connected' || !sock) {
    json(res, 503, { success: false, error: 'WhatsApp bağlı değil. QR ile eşleştirin (/status).' });
    return;
  }
  let body;
  try {
    body = await readBody(req);
  } catch {
    json(res, 400, { success: false, error: 'Geçersiz JSON gövdesi.' });
    return;
  }
  const digits = normalizeDigits(body.to);
  const text = String(body.text || '').trim();
  if (!digits || digits.length < 10) {
    json(res, 400, { success: false, error: 'Geçerli telefon numarası gerekli (to).' });
    return;
  }
  if (!text) {
    json(res, 400, { success: false, error: 'Mesaj metni gerekli (text).' });
    return;
  }
  try {
    const jid = `${digits}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text });
    json(res, 200, { success: true });
  } catch (e) {
    json(res, 500, { success: false, error: e?.message || String(e) });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }
  if (!authOk(req)) {
    json(res, 401, { success: false, error: 'Yetkisiz (Bearer token).' });
    return;
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/status') {
    await handleStatus(req, res);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/reset') {
    await handleReset(req, res);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/send') {
    await handleSend(req, res);
    return;
  }
  json(res, 404, { success: false, error: 'Bilinmeyen uç nokta. GET /status, POST /send, POST /reset' });
});

void startSocket();
const BIND_HOST = process.env.WA_BRIDGE_BIND || '0.0.0.0';
server.listen(PORT, BIND_HOST, () => {
  console.log(`[wa-bridge] Baileys köprüsü http://${BIND_HOST}:${PORT} (auth: ${AUTH_DIR})`);
});
