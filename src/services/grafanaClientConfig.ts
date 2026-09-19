/**
 * Grafana istemci ayarları (localStorage).
 * URL + API token — secret commit edilmez; yalnızca tarayıcıda saklanır.
 */

import { getGrafanaBaseUrl as getEmbedBaseUrl } from '../utils/grafanaEmbed';

export const GRAFANA_CLIENT_CONFIG_KEY = 'retailex_grafana_client_config_v1';

export interface GrafanaClientConfig {
  /** Örn. https://grafana.example.com veya /__grafana */
  baseUrl: string;
  /** Grafana service account / API token (Bearer) */
  apiToken: string;
  /** İstemci token ile doğrudan API kullanılsın mı */
  useClientApi: boolean;
}

export const DEFAULT_GRAFANA_CLIENT_CONFIG: GrafanaClientConfig = {
  baseUrl: '',
  apiToken: '',
  useClientApi: false,
};

export function loadGrafanaClientConfig(): GrafanaClientConfig {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_GRAFANA_CLIENT_CONFIG };
  }
  try {
    const raw = localStorage.getItem(GRAFANA_CLIENT_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_GRAFANA_CLIENT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<GrafanaClientConfig>;
    return {
      baseUrl: String(parsed.baseUrl ?? '').trim().replace(/\/+$/, ''),
      apiToken: String(parsed.apiToken ?? '').trim(),
      useClientApi: Boolean(parsed.useClientApi),
    };
  } catch {
    return { ...DEFAULT_GRAFANA_CLIENT_CONFIG };
  }
}

export function saveGrafanaClientConfig(patch: Partial<GrafanaClientConfig>): GrafanaClientConfig {
  const next: GrafanaClientConfig = {
    ...loadGrafanaClientConfig(),
    ...patch,
  };
  next.baseUrl = String(next.baseUrl || '').trim().replace(/\/+$/, '');
  next.apiToken = String(next.apiToken || '').trim();
  next.useClientApi = Boolean(next.useClientApi);
  if (typeof window !== 'undefined') {
    localStorage.setItem(GRAFANA_CLIENT_CONFIG_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('retailex:grafana-client-config', { detail: next }));
  }
  return next;
}

export function isGrafanaClientReady(cfg?: GrafanaClientConfig): boolean {
  const c = cfg ?? loadGrafanaClientConfig();
  return Boolean(c.useClientApi && c.baseUrl && c.apiToken);
}

/**
 * Embed / iframe tabanı: istemci URL > VITE_GRAFANA_URL > /__grafana
 */
export function resolveGrafanaEmbedBaseUrl(cfg?: GrafanaClientConfig): string {
  const c = cfg ?? loadGrafanaClientConfig();
  if (c.baseUrl) return c.baseUrl.replace(/\/+$/, '');
  return getEmbedBaseUrl().replace(/\/+$/, '');
}

export function buildGrafanaDashboardEmbedUrl(
  uid: string,
  theme: 'light' | 'dark' = 'light',
  cfg?: GrafanaClientConfig,
): string {
  const base = resolveGrafanaEmbedBaseUrl(cfg);
  const path = `/d/${encodeURIComponent(uid)}?orgId=1&kiosk&theme=${theme}&refresh=2m`;
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base}${path}`;
  }
  // relative (/__grafana)
  return `${base}${path}`;
}
