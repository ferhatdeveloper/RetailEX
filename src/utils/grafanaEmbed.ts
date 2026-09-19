/**
 * Grafana gömme — aynı origin `/__grafana` (nginx → grafana:3000).
 * İsteğe bağlı: VITE_GRAFANA_URL
 */

export type GrafanaReadyReport = {
  id: string;
  /** Grafana dashboard uid veya explore */
  uid: string;
  titleTr: string;
  titleEn: string;
  descriptionTr: string;
  descriptionEn: string;
  /** Embed path (kiosk) */
  embedPath: (theme: 'light' | 'dark') => string;
  /** Rapor oluşturucu / Explore */
  isBuilder?: boolean;
};

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

/** Hazır panolar — provisioning `docker/grafana/dashboards` ile aynı uid */
export const GRAFANA_READY_REPORTS: GrafanaReadyReport[] = [
  {
    id: 'containers',
    uid: 'retailex-containers',
    titleTr: 'Konteyner durumu',
    titleEn: 'Container health',
    descriptionTr: 'CPU, RAM ve aktif konteyner sayısı (Prometheus)',
    descriptionEn: 'CPU, RAM and active containers (Prometheus)',
    embedPath: (theme) =>
      `/d/retailex-containers/retailex-konteynerler?orgId=1&refresh=30s&kiosk&theme=${theme}`,
  },
  {
    id: 'postgres',
    uid: 'retailex-postgres',
    titleTr: 'PostgreSQL sağlık',
    titleEn: 'PostgreSQL health',
    descriptionTr: 'Veritabanı boyutları ve bağlantı özeti',
    descriptionEn: 'Database sizes and connection summary',
    embedPath: (theme) =>
      `/d/retailex-postgres/retailex-postgresql?orgId=1&refresh=1m&kiosk&theme=${theme}`,
  },
  {
    id: 'ops-overview',
    uid: 'retailex-ops',
    titleTr: 'Operasyon özeti',
    titleEn: 'Operations overview',
    descriptionTr: 'Konteyner + PG tek bakışta',
    descriptionEn: 'Containers and Postgres at a glance',
    embedPath: (theme) =>
      `/d/retailex-ops/retailex-operasyon?orgId=1&refresh=30s&kiosk&theme=${theme}`,
  },
  {
    id: 'builder',
    uid: 'explore',
    titleTr: 'Rapor oluşturucu',
    titleEn: 'Report builder',
    descriptionTr: 'Grafana Explore — sorgu ve grafik oluştur (giriş yok)',
    descriptionEn: 'Grafana Explore — build queries and charts (no login)',
    isBuilder: true,
    embedPath: (theme) =>
      `/explore?orgId=1&left=%7B%22datasource%22:%22prometheus%22,%22queries%22:%5B%7B%22refId%22:%22A%22%7D%5D%7D&theme=${theme}`,
  },
];

export function getGrafanaEmbedUrl(opts?: {
  dark?: boolean;
  reportId?: string;
}): string {
  const base = getGrafanaBaseUrl();
  const theme = opts?.dark ? 'dark' : 'light';
  const report =
    GRAFANA_READY_REPORTS.find((r) => r.id === opts?.reportId) ||
    GRAFANA_READY_REPORTS[0];
  return `${base}${report.embedPath(theme)}`;
}

/** Sistem Sağlığı varsayılanı */
export function getGrafanaSystemHealthEmbedUrl(opts?: { dark?: boolean }): string {
  return getGrafanaEmbedUrl({ ...opts, reportId: 'containers' });
}
