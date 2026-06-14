/**
 * Rongta RLS1000/RLS1100 istemci SDK'sı.
 */
import {
  RONGTA_CMD,
  RONGTA_TEST_DISPLAY_TEXT,
  buildPacket,
  buildPluPacket,
  buildRequestSalesPacket,
  buildStartAckPacket,
  buildStartPacket,
  buildTestPluRecord,
  isRongtaAck,
  isRongtaFrame,
  parseAck,
  parsePacket,
  parseSalesRecord,
} from './protocol.mjs';
import {
  QUICK_CONNECT_TIMEOUT_MS,
  QUICK_PROBE_TIMEOUT_MS,
  buildPortList,
  errorCode,
  readOnce,
  resolveSocket,
  tcpConnectCheck,
  tryConnect,
  writePacket,
} from './transport.mjs';
import { SCALE_PRINTER_PORTS } from '../../scalePorts.mjs';

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

async function performHandshake(socket) {
  const initial = await Promise.race([
    readOnce(socket, 1500),
    new Promise((r) => setTimeout(() => r(''), 1500)),
  ]);
  if (String(initial).includes(RONGTA_CMD.START)) {
    await writePacket(socket, buildStartAckPacket());
  } else {
    await writePacket(socket, buildStartPacket());
    await readOnce(socket, 3000);
  }
}

export class RongtaScaleClient {
  constructor({ ipAddress, port } = {}) {
    this.ipAddress = String(ipAddress || '').trim();
    this.port = port ? Number(port) : undefined;
  }

  async tcpProbePorts() {
    const ports = buildPortList(this.port);
    return Promise.all(ports.map((p) => tcpConnectCheck(this.ipAddress, p)));
  }

  async discoverPort() {
    const ports = buildPortList(this.port);
    const checks = [];
    for (const p of ports) {
      const tcp = await tcpConnectCheck(this.ipAddress, p);
      checks.push({ ...tcp, protocolOk: false });
      if (!tcp.reachable) continue;
      const probe = await this.quickProbe(p);
      checks[checks.length - 1].protocolOk = !!probe.ok;
      if (probe.ok) {
        return { found: true, port: p, checks };
      }
    }
    return { found: false, checks };
  }

  async quickProbe(port = this.port) {
    const ports = buildPortList(port);
    for (const p of ports) {
      if (SCALE_PRINTER_PORTS.has(p)) continue;
      let socket;
      try {
        socket = await tryConnect(this.ipAddress, p, QUICK_CONNECT_TIMEOUT_MS);

        const initial = await Promise.race([
          readOnce(socket, 450),
          new Promise((resolve) => setTimeout(() => resolve(''), 450)),
        ]);
        if (isRongtaFrame(initial)) {
          const cmd = String(initial).slice(4, 8);
          if (cmd === RONGTA_CMD.START || cmd === RONGTA_CMD.ACK) {
            return { ok: true, port: p, response: initial };
          }
        }

        await writePacket(socket, buildStartPacket());
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

  async testConnection() {
    const testPlu = buildTestPluRecord();
    let socket;
    let usedPort = this.port || 20304;
    try {
      const resolved = await resolveSocket(this.ipAddress, this.port);
      socket = resolved.socket;
      usedPort = resolved.port;
    } catch (e) {
      const discovery = await this.discoverPort();
      return {
        ok: false,
        port: this.port || usedPort,
        displayText: RONGTA_TEST_DISPLAY_TEXT,
        message: buildScaleConnectionHelp(this.ipAddress, this.port, discovery),
        suggestedPort: discovery.found ? discovery.port : undefined,
        probe: discovery.checks,
      };
    }
    try {
      await performHandshake(socket);
      await writePacket(socket, buildPluPacket(testPlu));
      const ack = parseAck(await readOnce(socket, 5000));
      const displayOk = ack.ok;
      return {
        ok: displayOk,
        port: usedPort,
        displayText: RONGTA_TEST_DISPLAY_TEXT,
        message: displayOk
          ? `Test başarılı — terazi ekranında "${RONGTA_TEST_DISPLAY_TEXT}" görünmeli (PLU 99, port ${usedPort})`
          : `Bağlantı var ancak test PLU gönderilemedi (hata ${ack.errorCode}, port ${usedPort})`,
        suggestedPort: usedPort !== this.port ? usedPort : undefined,
      };
    } catch (e) {
      return {
        ok: false,
        port: usedPort,
        displayText: RONGTA_TEST_DISPLAY_TEXT,
        message: e instanceof Error ? e.message : 'Terazi test hatası',
      };
    } finally {
      socket.destroy();
    }
  }

  async sendPlu(records) {
    const { socket, port: usedPort } = await resolveSocket(this.ipAddress, this.port);
    const errors = [];
    let sentCount = 0;
    try {
      await performHandshake(socket);
      for (const rec of records) {
        await writePacket(socket, buildPluPacket(rec));
        const ack = parseAck(await readOnce(socket, 5000));
        if (ack.ok) sentCount += 1;
        else errors.push(`${rec.name}: hata ${ack.errorCode}`);
      }
      return {
        success: errors.length === 0,
        message: errors.length === 0
          ? `${sentCount} ürün teraziye gönderildi (port ${usedPort})`
          : `${sentCount} gönderildi, ${errors.length} hata`,
        sentCount,
        failedCount: records.length - sentCount,
        errors: errors.length ? errors : undefined,
        port: usedPort,
      };
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : 'Terazi iletişim hatası',
        sentCount,
        failedCount: records.length - sentCount,
        errors: [e instanceof Error ? e.message : String(e)],
      };
    } finally {
      socket.destroy();
    }
  }

  /** RLS manual: 0120 isteği → 0210 kayıtlar → 0220 son */
  async fetchSalesRecords({ maxRecords = 500, timeoutMs = 15000 } = {}) {
    const { socket, port: usedPort } = await resolveSocket(this.ipAddress, this.port);
    const records = [];
    try {
      await performHandshake(socket);
      await writePacket(socket, buildRequestSalesPacket());

      const deadline = Date.now() + timeoutMs;
      while (records.length < maxRecords && Date.now() < deadline) {
        const raw = await readOnce(socket, Math.min(3000, deadline - Date.now()));
        if (!raw || raw.length < 8) continue;
        const pkt = parsePacket(raw);
        if (!pkt) continue;

        if (pkt.command === RONGTA_CMD.SALES_END) break;
        if (pkt.command === RONGTA_CMD.SALES_RECORD) {
          const rec = parseSalesRecord(pkt.data);
          if (rec) records.push(rec);
        }
        if (pkt.command === RONGTA_CMD.ACK) {
          const err = parseAck(raw);
          if (!err.ok) break;
        }
      }

      return {
        success: true,
        port: usedPort,
        count: records.length,
        records,
        message: records.length
          ? `${records.length} satış kaydı alındı (port ${usedPort})`
          : `Satış kaydı yok veya terazi yanıt vermedi (port ${usedPort})`,
      };
    } catch (e) {
      return {
        success: false,
        port: usedPort,
        count: records.length,
        records,
        message: e instanceof Error ? e.message : 'Satış kaydı okuma hatası',
      };
    } finally {
      socket.destroy();
    }
  }
}

/** Geriye dönük uyumluluk — fonksiyon API */
export async function rongtaTcpQuickProbe(ipAddress, port) {
  return new RongtaScaleClient({ ipAddress, port }).quickProbe(port);
}

export async function discoverRongtaPort(ipAddress, preferredPort) {
  return new RongtaScaleClient({ ipAddress, port: preferredPort }).discoverPort();
}

export async function tcpProbePorts(ipAddress, preferredPort) {
  return new RongtaScaleClient({ ipAddress, port: preferredPort }).tcpProbePorts();
}

export async function rongtaTcpTest(ipAddress, port) {
  return new RongtaScaleClient({ ipAddress, port }).testConnection();
}

export async function rongtaTcpSendPlu(ipAddress, port, records) {
  return new RongtaScaleClient({ ipAddress, port }).sendPlu(records);
}

export async function rongtaTcpFetchSales(ipAddress, port, options) {
  return new RongtaScaleClient({ ipAddress, port }).fetchSalesRecords(options);
}

export { errorCode };
