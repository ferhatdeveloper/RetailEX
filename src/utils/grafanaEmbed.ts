/**
 * Grafana gömme URL — üretimde aynı origin `/__grafana` (nginx → grafana:3000).
 * İsteğe bağlı: VITE_GRAFANA_URL=https://grafana.ornek.app
 */
export function getGrafanaBaseUrl(): string {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? String((import.meta as ImportMeta & { env?: { VITE_GRAFANA_URL?: string } }).env?.VITE_GRAFANA_URL || '').trim()
      : '';
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/__grafana`;
  }
  return '/__grafana';
}

/** Kiosk pano — Sistem Sağlığı iframe */
export function getGrafanaEmbedUrl(opts?: { dark?: boolean }): string {
  const base = getGrafanaBaseUrl();
  const theme = opts?.dark ? 'dark' : 'light';
  const path =
    '/d/retailex-containers/retailex-konteynerler?orgId=1&refresh=30s&kiosk&theme=' + theme;
  return `${base}${path}`;
}
