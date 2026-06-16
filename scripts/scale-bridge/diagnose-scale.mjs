#!/usr/bin/env node
/**
 * Terazi teşhis — tek IP veya ağ taraması (CLI).
 * Kullanım:
 *   node scripts/scale-bridge/diagnose-scale.mjs 192.168.1.87
 *   node scripts/scale-bridge/diagnose-scale.mjs --scan
 */
import { probeHost, scanNetworkForScales, guessLocalSubnet } from './scan.mjs';
import { getInboundScales } from './listen.mjs';
import { startScaleInboundListeners } from './listen.mjs';

const arg = process.argv[2];

async function main() {
  await startScaleInboundListeners({ enabled: true });
  console.log('[diagnose] Gelen TCP dinleme başlatıldı (10 sn bekleyin, terazi PLU göndersin)…');
  await new Promise((r) => setTimeout(r, 10_000));
  const inbound = getInboundScales();
  if (inbound.length) {
    console.log('[diagnose] Gelen bağlantı ile bulunan teraziler:');
    for (const d of inbound) console.log('  -', d.ipAddress, 'dinleme portu', d.listenPort);
  } else {
    console.log('[diagnose] Gelen bağlantı yok (terazi menüsünde PC IP doğru mu?)');
  }

  if (arg === '--scan' || !arg) {
    const sub = guessLocalSubnet();
    console.log('[diagnose] Ağ taraması:', sub.startIP, '-', sub.endIP);
    const result = await scanNetworkForScales({ allSubnets: true });
    console.log('[diagnose] Taranan IP:', result.scanned, '| Bulunan:', result.devices.length);
    for (const d of result.devices) {
      console.log(
        '  -',
        d.ipAddress + ':' + d.port,
        d.discoveryMethod,
        d.protocolVerified ? 'protokol OK' : 'TCP adayı'
      );
    }
    return;
  }

  const ip = arg.trim();
  console.log('[diagnose] Tek IP probe:', ip);
  const hit = await probeHost(ip);
  console.log(hit ? JSON.stringify(hit, null, 2) : 'Bulunamadı');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
