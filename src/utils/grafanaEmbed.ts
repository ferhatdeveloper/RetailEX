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
  category: 'ops' | 'erp' | 'tools';
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

function dash(
  uid: string,
  slug: string,
  theme: string,
  extra = '&refresh=1m'
): string {
  return `/d/${uid}/${slug}?orgId=1${extra}&kiosk&theme=${theme}`;
}

/** Hazır panolar — provisioning `docker/grafana/dashboards` ile aynı uid */
export const GRAFANA_READY_REPORTS: GrafanaReadyReport[] = [
  {
    id: 'home',
    uid: 'retailex-home',
    category: 'ops',
    titleTr: 'Ana panel',
    titleEn: 'Home',
    descriptionTr: 'DB / bağlantı / konteyner özeti',
    descriptionEn: 'DB, connections and container summary',
    embedPath: (t) => dash('retailex-home', 'retailex-ana-panel', t, '&refresh=30s'),
  },
  {
    id: 'ops-overview',
    uid: 'retailex-ops',
    category: 'ops',
    titleTr: 'Operasyon özeti',
    titleEn: 'Operations overview',
    descriptionTr: 'Konteyner + PostgreSQL tek bakışta',
    descriptionEn: 'Containers and Postgres at a glance',
    embedPath: (t) => dash('retailex-ops', 'retailex-operasyon', t, '&refresh=30s'),
  },
  {
    id: 'containers',
    uid: 'retailex-containers',
    category: 'ops',
    titleTr: 'Konteyner durumu',
    titleEn: 'Container health',
    descriptionTr: 'CPU, RAM, ağ ve disk (Prometheus)',
    descriptionEn: 'CPU, RAM, network and disk (Prometheus)',
    embedPath: (t) => dash('retailex-containers', 'retailex-konteynerler', t, '&refresh=30s'),
  },
  {
    id: 'postgres',
    uid: 'retailex-postgres',
    category: 'ops',
    titleTr: 'PostgreSQL sağlık',
    titleEn: 'PostgreSQL health',
    descriptionTr: 'Boyutlar, bağlantılar, uzun sorgular',
    descriptionEn: 'Sizes, connections, long-running queries',
    embedPath: (t) => dash('retailex-postgres', 'retailex-postgresql', t, '&refresh=1m'),
  },
  {
    id: 'sales',
    uid: 'retailex-sales',
    category: 'erp',
    titleTr: 'Satış özeti',
    titleEn: 'Sales overview',
    descriptionTr: 'Ciro, fiş, ödeme, günlük satış (firma/dönem)',
    descriptionEn: 'Revenue, fiches, payments, daily sales',
    embedPath: (t) => dash('retailex-sales', 'retailex-satis-ozeti', t),
  },
  {
    id: 'invoices',
    uid: 'retailex-invoices',
    category: 'erp',
    titleTr: 'Fatura / fiş tipleri',
    titleEn: 'Invoice / fiche types',
    descriptionTr: 'trcode dağılımı, aylık ciro, çok satanlar',
    descriptionEn: 'trcode breakdown, monthly revenue, top items',
    embedPath: (t) => dash('retailex-invoices', 'retailex-fatura-fis', t, '&refresh=2m'),
  },
  {
    id: 'stock',
    uid: 'retailex-stock',
    category: 'erp',
    titleTr: 'Stok / malzeme',
    titleEn: 'Stock / materials',
    descriptionTr: 'Ürün kartı, kritik stok, kategori',
    descriptionEn: 'Products, critical stock, categories',
    embedPath: (t) => dash('retailex-stock', 'retailex-stok', t, '&refresh=5m'),
  },
  {
    id: 'cash',
    uid: 'retailex-cash',
    category: 'erp',
    titleTr: 'Kasa hareketleri',
    titleEn: 'Cash movements',
    descriptionTr: 'Giriş/çıkış ve günlük kasa neti',
    descriptionEn: 'In/out and daily cash net',
    embedPath: (t) => dash('retailex-cash', 'retailex-kasa', t),
  },
  {
    id: 'bank',
    uid: 'retailex-bank',
    category: 'erp',
    titleTr: 'Banka hareketleri',
    titleEn: 'Bank movements',
    descriptionTr: 'Banka satırları ve net tutar',
    descriptionEn: 'Bank lines and net amount',
    embedPath: (t) => dash('retailex-bank', 'retailex-banka', t),
  },
  {
    id: 'customers',
    uid: 'retailex-customers',
    category: 'erp',
    titleTr: 'Cari / müşteri',
    titleEn: 'Customers / parties',
    descriptionTr: 'Müşteri ve tedarikçi kartları',
    descriptionEn: 'Customer and supplier cards',
    embedPath: (t) => dash('retailex-customers', 'retailex-cari', t, '&refresh=5m'),
  },
  {
    id: 'stores',
    uid: 'retailex-stores',
    category: 'erp',
    titleTr: 'Mağazalar',
    titleEn: 'Stores',
    descriptionTr: 'Mağaza listesi ve adet',
    descriptionEn: 'Store list and count',
    embedPath: (t) => dash('retailex-stores', 'retailex-magazalar', t, '&refresh=10m'),
  },
  {
    id: 'schema',
    uid: 'retailex-schema',
    category: 'ops',
    titleTr: 'Şema / tablolar',
    titleEn: 'Schema / tables',
    descriptionTr: 'rex_ tabloları ve kolonlar',
    descriptionEn: 'rex_ tables and columns',
    embedPath: (t) => dash('retailex-schema', 'retailex-sema', t, '&refresh=10m'),
  },
  {
    id: 'builder-prom',
    uid: 'explore-prom',
    category: 'tools',
    titleTr: 'Explore (Prometheus)',
    titleEn: 'Explore (Prometheus)',
    descriptionTr: 'Metrik sorgusu oluştur',
    descriptionEn: 'Build metric queries',
    isBuilder: true,
    embedPath: (theme) =>
      `/explore?orgId=1&left=%7B%22datasource%22:%22prometheus%22,%22queries%22:%5B%7B%22refId%22:%22A%22%7D%5D%7D&theme=${theme}`,
  },
  {
    id: 'builder-pg',
    uid: 'explore-pg',
    category: 'tools',
    titleTr: 'Explore (PostgreSQL)',
    titleEn: 'Explore (PostgreSQL)',
    descriptionTr: 'SQL sorgusu oluştur',
    descriptionEn: 'Build SQL queries',
    isBuilder: true,
    embedPath: (theme) =>
      `/explore?orgId=1&left=%7B%22datasource%22:%22postgres%22,%22queries%22:%5B%7B%22refId%22:%22A%22%7D%5D%7D&theme=${theme}`,
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
  return getGrafanaEmbedUrl({ ...opts, reportId: 'ops-overview' });
}
