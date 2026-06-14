/**
 * Rongta RLS TCP — scale-bridge servisi (Node, bağımsız).
 */
import net from 'node:net';
import {
  SCALE_DISCOVERY_PORTS,
  SCALE_PRINTER_PORTS,
  buildScalePortTryList,
} from './scalePorts.mjs';

const CMD = { START: '0201', ACK: '0102', PLU_SEND: '0110' };
const RONGTA_TEST_DISPLAY_TEXT = 'EXFIN RETAIL';
const FALLBACK_PORTS = SCALE_DISCOVERY_PORTS;
const PRINTER_PORTS = SCALE_PRINTER_PORTS;
const SOCKET_TIMEOUT_MS = 8000;
const QUICK_PROBE_TIMEOUT_MS = 1200;
const QUICK_CONNECT_TIMEOUT_MS = 500;

function padField(value, width) {
  const s = String(value ?? '').normalize('NFC');
  return s.length >= width ? s.slice(0, width) : s.padStart(width, ' ');
}

function padNum(value, width) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.slice(-width).padStart(width, '0');
}

function encodePrice(price) {
  const cents = Math.max(0, Math.round((Number(price) || 0) * 100));
  return padNum(cents, 8);
}

function mapWeightUnit(unit) {
  const u = String(unit ?? 'KG').toUpperCase().replace(/İ/g, 'I');
  if (u === 'KG' || u === 'LT' || u === 'LITRE' || u === 'L') return '4';
  if (u === 'GR' || u === 'GRAM' || u === 'G') return '1';
  return '4';
}

function buildPacket(command, data = '') {
  const cmd = String(command).padStart(4, '0').slice(-4);
  const body = cmd + data;
  return String(4 + body.length).padStart(4, '0') + body;
}

function buildPluBody(plu) {
  const lf = plu.lfCode ?? plu.pluCode;
  const artNo = String(plu.barcode ?? plu.pluCode).replace(/\D/g, '').slice(-10);
  return [
    plu.operate ?? 'I',
    padNum(plu.rank, 2),
    padField(plu.name, 36),
    padNum(lf, 6),
    padNum(artNo || lf, 10),
    padNum(plu.barcodeType ?? 27, 2),
    encodePrice(plu.price),
    mapWeightUnit(plu.unit),
    padNum(plu.department ?? 0, 2),
    padNum(plu.tareGrams ?? 0, 6),
    padNum(plu.shelfDays ?? 15, 3),
    '0', padNum(0, 6), padNum(5, 2),
    padNum(0, 3), padNum(0, 3), padNum(0, 3), padNum(0, 3), '0', '0',
  ].join('');
}

function parseAck(raw) {
  const s = String(raw).trim();
  if (s.length < 8) return { ok: false, errorCode: '????' };
  if (s.slice(4, 8) !== CMD.ACK) return { ok: true, errorCode: '0000' };
  const data = s.slice(8);
  const errorCode = data.length >= 14 ? data.slice(-4) : '0000';
  return { ok: errorCode === '0000', errorCode };
}

function readOnce(socket, timeoutMs = SOCKET_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => { cleanup(); resolve(buf); }, timeoutMs);
    const onData = (chunk) => {
      buf += chunk.toString('ascii');
      if (buf.length >= 8) {
        const len = parseInt(buf.slice(0, 4), 10);
        if (Number.isFinite(len) && buf.length >= len) { cleanup(); resolve(buf.slice(0, len)); }
      }
    };
    const cleanup = () => { clearTimeout(timer); socket.off('data', onData); socket.off('error', onError); };
    const onError = (err) => { cleanup(); reject(err); };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

function writePacket(socket, packet) {
  return new Promise((resolve, reject) => {
    socket.write(packet, 'ascii', (err) => (err ? reject(err) : resolve()));
  });
}

function tryConnect(ip, port, timeoutMs = SOCKET_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('error', reject);
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Bağlantı zaman aşımı')); });
    socket.connect(port, ip, () => { socket.setTimeout(0); resolve(socket); });
  });
}

function buildPortTryList(port) {
  return buildScalePortTryList(port).filter((p) => !PRINTER_PORTS.has(p));
}

function errorCode(err) {
  if (!err) return '';
  if (typeof err === 'object' && 'code' in err) return String(err.code);
  const m = String(err.message || err);
  const match = m.match(/\b(ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND)\b/);
  return match ? match[1] : '';
}

function tcpConnectCheck(ip, port, timeoutMs = QUICK_CONNECT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ port, reachable: true, refused: false }));
    socket.once('timeout', () => finish({ port, reachable: false, refused: false, timeout: true }));
    socket.once('error', (err) => {
      const code = errorCode(err);
      finish({
        port,
        reachable: false,
        refused: code === 'ECONNREFUSED',
        timeout: code === 'ETIMEDOUT',
        hostUnreachable: code === 'EHOSTUNREACH' || code === 'ENOTFOUND',
        error: err instanceof Error ? err.message : String(err),
        code,
      });
    });
    try {
      socket.connect(port, ip);
    } catch (err) {
      finish({ port, reachable: false, error: String(err), code: errorCode(err) });
    }
  });
}

export async function tcpProbePorts(ipAddress, preferredPort) {
  const ports = buildPortTryList(preferredPort).filter((p) => !PRINTER_PORTS.has(p));
  const checks = await Promise.all(ports.map((p) => tcpConnectCheck(ipAddress, p)));
  return checks;
}

export async function discoverRongtaPort(ipAddress, preferredPort) {
  const ports = buildPortTryList(preferredPort).filter((p) => !PRINTER_PORTS.has(p));
  const checks = [];
  for (const p of ports) {
    const tcp = await tcpConnectCheck(ipAddress, p);
    checks.push({ ...tcp, protocolOk: false });
    if (!tcp.reachable) continue;
    const probe = await rongtaTcpQuickProbe(ipAddress, p);
    checks[checks.length - 1].protocolOk = !!probe.ok;
    if (probe.ok) {
      return { found: true, port: p, checks };
    }
  }
  return { found: false, checks };
}

export function buildScaleConnectionHelp(ipAddress, preferredPort, discovery) {
  const checks = discovery?.checks || [];
  const refused = checks.filter((c) => c.refused);
  const timeout = checks.filter((c) => c.timeout || c.hostUnreachable);
  const reachableNoProto = checks.filter((c) => c.reachable && !c.protocolOk);

  if (discovery?.found) {
    return `Terazi bulundu: ${ipAddress}:${discovery.port}`;
  }

  const lines = [`${ipAddress}:${preferredPort || 20304} adresinde Rongta terazi yanıt vermiyor.`];

  if (refused.length === checks.length && checks.length > 0) {
    lines.push('');
    lines.push('ECONNREFUSED: IP erişilebilir ama terazi portu kapalı veya bu IP terazi değil.');
    lines.push('• Terazi menüsü → Ağ/Ethernet → IP ve “PLU aktarımı” açık mı?');
    lines.push('• Terazi fişinden veya RLS1000 yazılımından IP/port doğrulayın.');
    lines.push(`• Denenen portlar: ${checks.map((c) => c.port).join(', ')}`);
  } else if (timeout.length > 0 && refused.length === 0) {
    lines.push('');
    lines.push('Ağ zaman aşımı: PC ile terazi aynı alt ağda mı? Kablo/Wi‑Fi ve ping kontrol edin.');
  } else if (reachableNoProto.length > 0) {
    lines.push('');
    lines.push('TCP bağlantısı var ama Rongta protokolü yok — yazıcı veya farklı cihaz olabilir.');
  }

  lines.push('');
  lines.push(`Denenen terazi portları: ${checks.map((c) => c.port).join(', ')}`);
  lines.push('Öneri: RLS1000 yazılımında bağlantı testi yapın; terazi menüsünden IP kaydedin.');

  return lines.join('\n');
}

async function resolveSocket(ipAddress, port) {
  const ports = buildPortTryList(port).filter((p) => !PRINTER_PORTS.has(p));
  let lastErr = null;
  for (const p of ports) {
    try { return { socket: await tryConnect(ipAddress, p), port: p }; }
    catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('Teraziye bağlanılamadı');
}

function isRongtaFrame(raw) {
  const s = String(raw || '');
  if (s.length < 8) return false;
  const len = parseInt(s.slice(0, 4), 10);
  if (!Number.isFinite(len) || len < 8 || len > 8192) return false;
  const cmd = s.slice(4, 8);
  return cmd === CMD.START || cmd === CMD.ACK || cmd === CMD.PLU_SEND;
}

function isRongtaAck(raw) {
  return isRongtaFrame(raw) && String(raw).slice(4, 8) === CMD.ACK;
}

export async function rongtaTcpQuickProbe(ipAddress, port) {
  const ports = buildPortTryList(port);
  for (const p of ports) {
    if (PRINTER_PORTS.has(p)) continue;
    let socket;
    try {
      socket = await tryConnect(ipAddress, p, QUICK_CONNECT_TIMEOUT_MS);

      const initial = await Promise.race([
        readOnce(socket, 450),
        new Promise((resolve) => setTimeout(() => resolve(''), 450)),
      ]);
      if (isRongtaFrame(initial)) {
        const cmd = String(initial).slice(4, 8);
        if (cmd === CMD.START || cmd === CMD.ACK) {
          return { ok: true, port: p, response: initial };
        }
      }

      await writePacket(socket, buildPacket(CMD.START));
      const resp = await readOnce(socket, QUICK_PROBE_TIMEOUT_MS);
      if (isRongtaAck(resp)) {
        return { ok: true, port: p, response: resp };
      }
    } catch {
      /* sonraki port */
    } finally {
      socket?.destroy();
    }
  }
  return { ok: false };
}

export async function rongtaTcpTest(ipAddress, port) {
  const testPlu = {
    operate: 'I',
    rank: 99,
    name: RONGTA_TEST_DISPLAY_TEXT,
    pluCode: '99999',
    lfCode: '999999',
    barcode: '9999900001',
    barcodeType: 27,
    price: 0.01,
    unit: 'KG',
  };
  let socket;
  let usedPort = port || FALLBACK_PORTS[0];
  try {
    const resolved = await resolveSocket(ipAddress, port);
    socket = resolved.socket;
    usedPort = resolved.port;
  } catch (e) {
    const discovery = await discoverRongtaPort(ipAddress, port);
    return {
      ok: false,
      port: port || usedPort,
      displayText: RONGTA_TEST_DISPLAY_TEXT,
      message: buildScaleConnectionHelp(ipAddress, port, discovery),
      suggestedPort: discovery.found ? discovery.port : undefined,
      probe: discovery.checks,
    };
  }
  try {
    const initial = await Promise.race([readOnce(socket, 1500), new Promise((r) => setTimeout(() => r(''), 1500))]);
    if (String(initial).includes(CMD.START)) {
      await writePacket(socket, buildPacket(CMD.ACK, `${CMD.START}0000000000`));
    } else {
      await writePacket(socket, buildPacket(CMD.START));
      await readOnce(socket, 3000);
    }
    await writePacket(socket, buildPacket(CMD.PLU_SEND, buildPluBody(testPlu)));
    const ack = parseAck(await readOnce(socket, 5000));
    const displayOk = ack.ok;
    return {
      ok: displayOk,
      port: usedPort,
      displayText: RONGTA_TEST_DISPLAY_TEXT,
      message: displayOk
        ? `Test başarılı — terazi ekranında "${RONGTA_TEST_DISPLAY_TEXT}" görünmeli (PLU 99, port ${usedPort})`
        : `Bağlantı var ancak test PLU gönderilemedi (hata ${ack.errorCode}, port ${usedPort})`,
      suggestedPort: usedPort !== port ? usedPort : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      port: usedPort,
      displayText: RONGTA_TEST_DISPLAY_TEXT,
      message: e instanceof Error ? e.message : 'Terazi test hatası',
    };
  } finally { socket.destroy(); }
}

export async function rongtaTcpSendPlu(ipAddress, port, records) {
  const { socket, port: usedPort } = await resolveSocket(ipAddress, port);
  const errors = [];
  let sentCount = 0;
  try {
    const initial = await Promise.race([readOnce(socket, 1500), new Promise((r) => setTimeout(() => r(''), 1500))]);
    if (String(initial).includes(CMD.START)) {
      await writePacket(socket, buildPacket(CMD.ACK, `${CMD.START}0000000000`));
    } else {
      await writePacket(socket, buildPacket(CMD.START));
      await readOnce(socket, 3000);
    }
    for (const rec of records) {
      await writePacket(socket, buildPacket(CMD.PLU_SEND, buildPluBody(rec)));
      const ack = parseAck(await readOnce(socket, 5000));
      if (ack.ok) sentCount += 1;
      else errors.push(`${rec.name}: hata ${ack.errorCode}`);
    }
    return {
      success: errors.length === 0,
      message: errors.length === 0
        ? `${sentCount} ürün teraziye gönderildi (port ${usedPort})`
        : `${sentCount} gönderildi, ${errors.length} hata`,
      sentCount, failedCount: records.length - sentCount,
      errors: errors.length ? errors : undefined, port: usedPort,
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Terazi iletişim hatası',
      sentCount, failedCount: records.length - sentCount,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  } finally { socket.destroy(); }
}
