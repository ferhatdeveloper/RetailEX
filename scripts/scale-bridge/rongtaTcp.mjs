/**
 * Rongta RLS TCP — scale-bridge servisi (Node, bağımsız).
 */
import net from 'node:net';

const CMD = { START: '0201', ACK: '0102', PLU_SEND: '0110' };
const FALLBACK_PORTS = [20304, 4001, 9100, 1024];
const SOCKET_TIMEOUT_MS = 8000;

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

function tryConnect(ip, port) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(SOCKET_TIMEOUT_MS);
    socket.once('error', reject);
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Bağlantı zaman aşımı')); });
    socket.connect(port, ip, () => { socket.setTimeout(0); resolve(socket); });
  });
}

async function resolveSocket(ipAddress, port) {
  const ports = port ? [port] : FALLBACK_PORTS;
  let lastErr = null;
  for (const p of ports) {
    try { return { socket: await tryConnect(ipAddress, p), port: p }; }
    catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('Teraziye bağlanılamadı');
}

export async function rongtaTcpTest(ipAddress, port) {
  const { socket, port: usedPort } = await resolveSocket(ipAddress, port);
  try {
    await writePacket(socket, buildPacket(CMD.START));
    const resp = await readOnce(socket, 4000);
    return { ok: true, port: usedPort, response: resp };
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
