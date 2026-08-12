/**
 * Yerel ağ (LAN) merkez sunucu — PostgREST http://192.168.x.x:3002
 */

const PRIVATE_IPV4 =
  /^(127\.0\.0\.1|localhost|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/i;

export function isPrivateLanHost(hostname: string): boolean {
  const h = (hostname || '').trim().toLowerCase();
  if (!h) return false;
  return PRIVATE_IPV4.test(h);
}

/** Android / Capacitor / Tauri WebView: LAN PostgREST için native HTTP kullan */
export function shouldUseNativeHttpForUrl(url: string): boolean {
  try {
    const u = new URL((url || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return isPrivateLanHost(u.hostname);
  } catch {
    return false;
  }
}
