/**
 * Etiket terazilerinde yaygın TCP portları (yazıcı portları hariç).
 * Test, probe ve tarama bu listeyi sırayla dener.
 */
export const SCALE_DISCOVERY_PORTS = [
  20304, // Rongta RLS (birincil)
  4001,  // Rongta alternatif (RLS1000 yazılımı)
  19204, // Rongta / üçüncü parti araçlar
  20104, // Bazı etiket terazisi keşif portları
  3001,  // Rongta / Bizerba
  3000,  // Digi
  4000,  // Genel etiket terazisi
  5000,  // CAS
  8000,  // Dibal
  8001,  // Toledo / Mettler
  8080,  // Gömülü HTTP/TCP
  9000,  // Bazı endüstriyel teraziler
  10001, // Alternatif PLU portu
];

/** Yazıcı ve sistem portları — asla terazi olarak taranmaz */
export const SCALE_PRINTER_PORTS = new Set([
  9100, 515, 631, 80, 443, 1024, 21, 22, 23, 25, 53, 110, 143,
]);

export const SCALE_PORTS_CSV = SCALE_DISCOVERY_PORTS.join(',');

export function buildScalePortTryList(preferredPort) {
  const preferred = Number(preferredPort);
  if (!Number.isInteger(preferred) || preferred <= 0 || preferred > 65535) {
    return [...SCALE_DISCOVERY_PORTS];
  }
  return [preferred, ...SCALE_DISCOVERY_PORTS.filter((p) => p !== preferred)];
}

export function parseScalePortsList(ports) {
  const fallback = [...SCALE_DISCOVERY_PORTS];
  const normalize = (list) => {
    const filtered = list.filter((p) => !SCALE_PRINTER_PORTS.has(p));
    return filtered.length ? [...new Set(filtered)] : fallback;
  };

  if (!ports || ports === 'all' || ports === '*') return fallback;

  if (Array.isArray(ports)) {
    const list = ports.map((p) => Number(p)).filter((p) => Number.isInteger(p) && p > 0 && p <= 65535);
    return list.length ? normalize(list) : fallback;
  }

  const list = String(ports)
    .split(/[,\s;]+/)
    .map((p) => parseInt(p, 10))
    .filter((p) => Number.isInteger(p) && p > 0 && p <= 65535);
  return list.length ? normalize(list) : fallback;
}
