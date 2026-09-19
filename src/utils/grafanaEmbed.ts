/**
 * Grafana gömme — aynı origin `/__grafana` (nginx → grafana:3000).
 * Katalog: docker/grafana/dashboards + Explore araçları.
 * Canlı liste: bridge GET /api/grafana/dashboards
 */

export type GrafanaReportCategory =
  | 'executive'
  | 'general'
  | 'sales'
  | 'stock'
  | 'materials'
  | 'finance'
  | 'payment'
  | 'purchase'
  | 'accounting'
  | 'customers'
  | 'wms'
  | 'restaurant'
  | 'beauty'
  | 'hr'
  | 'ops'
  | 'tools';

export type GrafanaReadyReport = {
  id: string;
  uid: string;
  titleTr: string;
  titleEn: string;
  descriptionTr: string;
  descriptionEn: string;
  category: GrafanaReportCategory;
  embedPath: (theme: 'light' | 'dark', vars?: { firm?: string; period?: string }) => string;
  isBuilder?: boolean;
};

export const GRAFANA_CATEGORY_LABELS: Record<
  GrafanaReportCategory,
  { tr: string; en: string; order: number }
> = {
  executive: { tr: 'Yönetim', en: 'Executive', order: 1 },
  general: { tr: 'Genel', en: 'General', order: 2 },
  sales: { tr: 'Satış & POS', en: 'Sales & POS', order: 3 },
  stock: { tr: 'Stok', en: 'Stock', order: 4 },
  materials: { tr: 'Malzeme raporları', en: 'Materials', order: 5 },
  finance: { tr: 'Kasa & Finans', en: 'Cash & Finance', order: 6 },
  payment: { tr: 'Ödeme ve işlemler', en: 'Payments', order: 7 },
  purchase: { tr: 'Satın alma', en: 'Purchasing', order: 8 },
  accounting: { tr: 'Muhasebe', en: 'Accounting', order: 9 },
  customers: { tr: 'Cari', en: 'AR/AP', order: 10 },
  wms: { tr: 'WMS / Depo', en: 'WMS', order: 11 },
  restaurant: { tr: 'Restoran', en: 'Restaurant', order: 12 },
  beauty: { tr: 'Güzellik', en: 'Beauty', order: 13 },
  hr: { tr: 'İK / Üretim', en: 'HR / Production', order: 14 },
  ops: { tr: 'Sistem', en: 'System', order: 90 },
  tools: { tr: 'Araçlar', en: 'Tools', order: 99 },
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

function varQs(vars?: { firm?: string; period?: string }): string {
  const parts: string[] = [];
  if (vars?.firm) parts.push(`var-firm=${encodeURIComponent(vars.firm)}`);
  if (vars?.period) parts.push(`var-period=${encodeURIComponent(vars.period)}`);
  return parts.length ? `&${parts.join('&')}` : '';
}

export function dashEmbed(
  uid: string,
  theme: string,
  extra = '&refresh=2m',
  vars?: { firm?: string; period?: string }
): string {
  // Slug opsiyonel — Grafana uid ile bulur; yanlış slug "Dashboard not found" vermesin
  return `/d/${encodeURIComponent(uid)}?orgId=1${extra}&kiosk&theme=${theme}${varQs(vars)}`;
}

function r(
  partial: Omit<GrafanaReadyReport, 'embedPath'> & { refresh?: string }
): GrafanaReadyReport {
  const refresh = partial.refresh ?? '&refresh=2m';
  const { refresh: _r, ...rest } = partial as typeof partial & { refresh?: string };
  void _r;
  return {
    ...rest,
    embedPath: (t, vars) => dashEmbed(rest.uid, t, refresh, vars),
  };
}

/** Statik katalog — API yoksa / birleşimde kullanılır */
export const GRAFANA_READY_REPORTS: GrafanaReadyReport[] = [
  // Yönetim
  r({
    id: 'executive',
    uid: 'retailex-executive',
    category: 'executive',
    titleTr: 'Yönetim panosu',
    titleEn: 'Executive dashboard',
    descriptionTr: 'Ciro, fiş, müşteri, ödeme özeti',
    descriptionEn: 'Revenue, fiches, customers, payments',
    refresh: '&refresh=1m',
  }),
  r({
    id: 'period-compare',
    uid: 'retailex-period-compare',
    category: 'executive',
    titleTr: 'Dönem karşılaştırması',
    titleEn: 'Period comparison',
    descriptionTr: 'Günlük fiş / ciro / kar',
    descriptionEn: 'Daily fiches, revenue, profit',
  }),
  r({
    id: 'store-performance',
    uid: 'retailex-store-performance',
    category: 'executive',
    titleTr: 'Mağaza performansı',
    titleEn: 'Store performance',
    descriptionTr: 'Mağaza bazlı satış',
    descriptionEn: 'Sales by store',
  }),
  r({
    id: 'stores',
    uid: 'retailex-stores',
    category: 'executive',
    titleTr: 'Mağazalar',
    titleEn: 'Stores',
    descriptionTr: 'Mağaza listesi ve adet',
    descriptionEn: 'Store list and count',
    refresh: '&refresh=10m',
  }),

  // Satış & POS
  r({
    id: 'sales',
    uid: 'retailex-sales',
    category: 'sales',
    titleTr: 'Satış özeti',
    titleEn: 'Sales overview',
    descriptionTr: 'Ciro, fiş, ödeme, günlük satış',
    descriptionEn: 'Revenue, fiches, payments, daily sales',
    refresh: '&refresh=1m',
  }),
  r({
    id: 'pos-z',
    uid: 'retailex-pos-z',
    category: 'sales',
    titleTr: 'POS / Z özeti',
    titleEn: 'POS / Z summary',
    descriptionTr: 'Bugünkü fiş, ciro, kasiyer',
    descriptionEn: 'Today fiches, revenue, cashiers',
    refresh: '&refresh=30s',
  }),
  r({
    id: 'payments',
    uid: 'retailex-payments',
    category: 'sales',
    titleTr: 'Ödeme dağılımı',
    titleEn: 'Payment mix',
    descriptionTr: 'Ödeme yöntemi adet / tutar',
    descriptionEn: 'Payment method count and amount',
  }),
  r({
    id: 'sales-trend',
    uid: 'retailex-sales-trend',
    category: 'sales',
    titleTr: 'Satış trend',
    titleEn: 'Sales trend',
    descriptionTr: 'Günlük / haftalık ciro',
    descriptionEn: 'Daily and weekly revenue',
  }),
  r({
    id: 'sales-returns',
    uid: 'retailex-sales-returns',
    category: 'sales',
    titleTr: 'İade / iptal',
    titleEn: 'Returns / voids',
    descriptionTr: 'İptal fiş ve tutarlar',
    descriptionEn: 'Cancelled fiches and amounts',
  }),
  r({
    id: 'cashiers',
    uid: 'retailex-cashiers',
    category: 'sales',
    titleTr: 'Kasiyer performansı',
    titleEn: 'Cashier performance',
    descriptionTr: 'Kasiyer fiş ve ciro',
    descriptionEn: 'Cashier fiches and revenue',
  }),
  r({
    id: 'category-profit',
    uid: 'retailex-category-profit',
    category: 'sales',
    titleTr: 'Ürün / kalem karlılık',
    titleEn: 'Line item profitability',
    descriptionTr: 'Brüt kar ve en karlı kalemler',
    descriptionEn: 'Gross profit and top lines',
  }),
  r({
    id: 'invoices',
    uid: 'retailex-invoices',
    category: 'sales',
    titleTr: 'Fatura / fiş tipleri',
    titleEn: 'Invoice / fiche types',
    descriptionTr: 'trcode dağılımı, aylık ciro',
    descriptionEn: 'trcode breakdown, monthly revenue',
  }),
  r({
    id: 'documents',
    uid: 'retailex-documents',
    category: 'sales',
    titleTr: 'Belge türü analizi',
    titleEn: 'Document type analytics',
    descriptionTr: 'trcode ve fiche_type',
    descriptionEn: 'trcode and fiche_type',
  }),
  r({
    id: 'invoice-lines',
    uid: 'retailex-invoice-lines',
    category: 'sales',
    titleTr: 'Fatura kalem detayı',
    titleEn: 'Invoice line detail',
    descriptionTr: 'Son satış kalemleri',
    descriptionEn: 'Recent sale lines',
  }),
  r({
    id: 'purchases',
    uid: 'retailex-purchases',
    category: 'sales',
    titleTr: 'Satın alma özeti',
    titleEn: 'Purchase summary',
    descriptionTr: 'Alış fişleri',
    descriptionEn: 'Purchase fiches',
  }),

  // Stok
  r({
    id: 'stock',
    uid: 'retailex-stock',
    category: 'stock',
    titleTr: 'Stok / malzeme',
    titleEn: 'Stock / materials',
    descriptionTr: 'Ürün kartı, kritik stok',
    descriptionEn: 'Products, critical stock',
    refresh: '&refresh=5m',
  }),
  r({
    id: 'inventory-value',
    uid: 'retailex-inventory-value',
    category: 'stock',
    titleTr: 'Stok değer',
    titleEn: 'Inventory value',
    descriptionTr: 'Maliyet değeri sıralı ürünler',
    descriptionEn: 'Products by cost value',
  }),
  r({
    id: 'stock-alerts',
    uid: 'retailex-stock-alerts',
    category: 'stock',
    titleTr: 'Kritik stok & SKT',
    titleEn: 'Critical stock & expiry',
    descriptionTr: 'Min stok ve SKT uyarıları',
    descriptionEn: 'Min stock and expiry alerts',
  }),
  r({
    id: 'stock-movements',
    uid: 'retailex-stock-movements',
    category: 'stock',
    titleTr: 'Stok hareket',
    titleEn: 'Stock movements',
    descriptionTr: 'En çok satılan kalemler',
    descriptionEn: 'Top sold items',
  }),
  r({
    id: 'warehouse-stock',
    uid: 'retailex-warehouse-stock',
    category: 'stock',
    titleTr: 'Ambar / stok durumu',
    titleEn: 'Warehouse stock status',
    descriptionTr: 'Sıfır / negatif stok',
    descriptionEn: 'Zero / negative stock',
  }),

  // Finans
  r({
    id: 'cash',
    uid: 'retailex-cash',
    category: 'finance',
    titleTr: 'Kasa hareketleri',
    titleEn: 'Cash movements',
    descriptionTr: 'Giriş/çıkış ve günlük net',
    descriptionEn: 'In/out and daily net',
  }),
  r({
    id: 'cash-flow',
    uid: 'retailex-cash-flow',
    category: 'finance',
    titleTr: 'Kasa defteri / nakit akış',
    titleEn: 'Cash ledger / cash flow',
    descriptionTr: 'Kasa giriş çıkış neti',
    descriptionEn: 'Cash in/out net',
  }),
  r({
    id: 'bank',
    uid: 'retailex-bank',
    category: 'finance',
    titleTr: 'Banka hareketleri',
    titleEn: 'Bank movements',
    descriptionTr: 'Banka satırları ve net',
    descriptionEn: 'Bank lines and net',
  }),
  r({
    id: 'registers',
    uid: 'retailex-registers',
    category: 'finance',
    titleTr: 'Kasa & banka kartları',
    titleEn: 'Cash & bank registers',
    descriptionTr: 'Kasa / banka bakiyeleri',
    descriptionEn: 'Register balances',
  }),
  r({
    id: 'expenses',
    uid: 'retailex-expenses',
    category: 'finance',
    titleTr: 'Gider özeti',
    titleEn: 'Expense summary',
    descriptionTr: 'Gider kategori ve listesi',
    descriptionEn: 'Expense categories and list',
  }),
  r({
    id: 'collections',
    uid: 'retailex-collections',
    category: 'finance',
    titleTr: 'Tahsilat & ödeme',
    titleEn: 'Collections & payments',
    descriptionTr: 'Kasa / banka / cari hareket',
    descriptionEn: 'Cash, bank and AR movements',
  }),
  r({
    id: 'cheques',
    uid: 'retailex-cheques',
    category: 'finance',
    titleTr: 'Çek / senet',
    titleEn: 'Cheques / promissory',
    descriptionTr: 'Çek kartları',
    descriptionEn: 'Cheque cards',
  }),
  r({
    id: 'campaigns',
    uid: 'retailex-campaigns',
    category: 'finance',
    titleTr: 'Kampanyalar',
    titleEn: 'Campaigns',
    descriptionTr: 'logic.campaigns listesi',
    descriptionEn: 'Campaign list',
  }),

  // Muhasebe
  r({
    id: 'mizan',
    uid: 'retailex-mizan',
    category: 'accounting',
    titleTr: 'Mizan (özet)',
    titleEn: 'Trial balance (summary)',
    descriptionTr: 'Kasa, banka, cari net',
    descriptionEn: 'Cash, bank, AR net',
  }),
  r({
    id: 'pnl',
    uid: 'retailex-pnl',
    category: 'accounting',
    titleTr: 'Kar / zarar',
    titleEn: 'P&L',
    descriptionTr: 'Satış, brüt kar, gider',
    descriptionEn: 'Sales, gross profit, expenses',
  }),
  r({
    id: 'gl',
    uid: 'retailex-gl',
    category: 'accounting',
    titleTr: 'Genel muhasebe aktivite',
    titleEn: 'GL activity',
    descriptionTr: 'Cari / kasa trcode',
    descriptionEn: 'AR and cash trcodes',
  }),

  // Cari
  r({
    id: 'customers',
    uid: 'retailex-customers',
    category: 'customers',
    titleTr: 'Cari / müşteri',
    titleEn: 'Customers / parties',
    descriptionTr: 'Müşteri ve tedarikçi kartları',
    descriptionEn: 'Customer and supplier cards',
    refresh: '&refresh=5m',
  }),
  r({
    id: 'cari-aging',
    uid: 'retailex-cari-aging',
    category: 'customers',
    titleTr: 'Cari yaşlandırma',
    titleEn: 'AR/AP aging',
    descriptionTr: 'Müşteri / tedarikçi bakiye',
    descriptionEn: 'Customer / supplier balances',
  }),
  r({
    id: 'cari-extract',
    uid: 'retailex-cari-extract',
    category: 'customers',
    titleTr: 'Cari ekstre özeti',
    titleEn: 'AR/AP statement',
    descriptionTr: 'Hesap hareketleri',
    descriptionEn: 'Account movements',
  }),
  r({
    id: 'customer-sales',
    uid: 'retailex-customer-sales',
    category: 'customers',
    titleTr: 'Müşteri satış analizi',
    titleEn: 'Customer sales analysis',
    descriptionTr: 'En çok satılan müşteriler',
    descriptionEn: 'Top customers by revenue',
  }),

  // WMS
  r({
    id: 'wms-ops',
    uid: 'retailex-wms-ops',
    category: 'wms',
    titleTr: 'WMS operasyon',
    titleEn: 'WMS operations',
    descriptionTr: 'Sayım, kabul, sevkiyat, görev',
    descriptionEn: 'Count, receive, dispatch, tasks',
  }),
  r({
    id: 'wms-inout',
    uid: 'retailex-wms-inout',
    category: 'wms',
    titleTr: 'WMS mal kabul & sevkiyat',
    titleEn: 'WMS receiving & dispatch',
    descriptionTr: 'Son kabul / sevkiyat fişleri',
    descriptionEn: 'Recent receive / dispatch slips',
  }),
  r({
    id: 'wms-inventory',
    uid: 'retailex-wms-inventory',
    category: 'wms',
    titleTr: 'WMS depo / bin',
    titleEn: 'WMS bins / warehouse',
    descriptionTr: 'Bin, personel, transfer',
    descriptionEn: 'Bins, personnel, transfers',
  }),

  // Restoran
  r({
    id: 'restaurant-revenue',
    uid: 'retailex-restaurant-revenue',
    category: 'restaurant',
    titleTr: 'Restoran ciro',
    titleEn: 'Restaurant revenue',
    descriptionTr: 'Satış + iade log',
    descriptionEn: 'Sales + return log',
  }),
  r({
    id: 'restaurant-voids',
    uid: 'retailex-restaurant-voids',
    category: 'restaurant',
    titleTr: 'Restoran iptal / iade',
    titleEn: 'Restaurant voids / returns',
    descriptionTr: 'İade nedenleri',
    descriptionEn: 'Return reasons',
  }),

  // Güzellik
  r({
    id: 'beauty-ops',
    uid: 'retailex-beauty-ops',
    category: 'beauty',
    titleTr: 'Güzellik operasyon',
    titleEn: 'Beauty operations',
    descriptionTr: 'Randevu, hizmet, satış',
    descriptionEn: 'Appointments, services, sales',
  }),
  r({
    id: 'beauty-services',
    uid: 'retailex-beauty-services',
    category: 'beauty',
    titleTr: 'Güzellik hizmet & komisyon',
    titleEn: 'Beauty services & commission',
    descriptionTr: 'Hizmet ve uzman kartları',
    descriptionEn: 'Service and specialist cards',
  }),

  // İK / üretim
  r({
    id: 'hr',
    uid: 'retailex-hr',
    category: 'hr',
    titleTr: 'Personel / satış elemanı',
    titleEn: 'Staff / sales reps',
    descriptionTr: 'Satış elemanı listesi',
    descriptionEn: 'Sales rep list',
  }),
  r({
    id: 'production',
    uid: 'retailex-production',
    category: 'hr',
    titleTr: 'Üretim siparişleri',
    titleEn: 'Production orders',
    descriptionTr: 'Üretim plan / gerçekleşen',
    descriptionEn: 'Planned vs produced',
  }),

  // Sistem (liste UI'da gizli tutulabilir)
  r({
    id: 'home',
    uid: 'retailex-home',
    category: 'ops',
    titleTr: 'Ana panel',
    titleEn: 'Home',
    descriptionTr: 'DB / bağlantı / konteyner özeti',
    descriptionEn: 'DB, connections and container summary',
    refresh: '&refresh=30s',
  }),
  r({
    id: 'ops-overview',
    uid: 'retailex-ops',
    category: 'ops',
    titleTr: 'Operasyon özeti',
    titleEn: 'Operations overview',
    descriptionTr: 'Konteyner + PostgreSQL',
    descriptionEn: 'Containers and Postgres',
    refresh: '&refresh=30s',
  }),
  r({
    id: 'containers',
    uid: 'retailex-containers',
    category: 'ops',
    titleTr: 'Konteyner durumu',
    titleEn: 'Container health',
    descriptionTr: 'CPU, RAM, ağ, disk',
    descriptionEn: 'CPU, RAM, network, disk',
    refresh: '&refresh=30s',
  }),
  r({
    id: 'postgres',
    uid: 'retailex-postgres',
    category: 'ops',
    titleTr: 'PostgreSQL sağlık',
    titleEn: 'PostgreSQL health',
    descriptionTr: 'Boyutlar, bağlantılar',
    descriptionEn: 'Sizes, connections',
    refresh: '&refresh=1m',
  }),
  r({
    id: 'schema',
    uid: 'retailex-schema',
    category: 'ops',
    titleTr: 'Şema / tablolar',
    titleEn: 'Schema / tables',
    descriptionTr: 'rex_ tabloları',
    descriptionEn: 'rex_ tables',
    refresh: '&refresh=10m',
  }),
  r({
    id: 'sync-health',
    uid: 'retailex-sync-health',
    category: 'ops',
    titleTr: 'Senkron & sağlık',
    titleEn: 'Sync & health',
    descriptionTr: 'sync_queue ve servis sağlık',
    descriptionEn: 'sync_queue and service health',
  }),

  // Araçlar
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
    embedPath: (theme) => getGrafanaExplorePostgresPath(theme),
  },
];

/** Explore PostgreSQL — isteğe bağlı ham SQL (API şema seçimi) */
export function getGrafanaExplorePostgresPath(theme: string, sql?: string): string {
  const query: Record<string, unknown> = {
    refId: 'A',
    datasource: { type: 'postgres', uid: 'postgres' },
    format: 'table',
    rawQuery: true,
  };
  if (sql && sql.trim()) {
    query.rawSql = sql.trim();
  }
  const left = {
    datasource: 'postgres',
    queries: [query],
    range: { from: 'now-6h', to: 'now' },
  };
  return `/explore?orgId=1&left=${encodeURIComponent(JSON.stringify(left))}&theme=${theme}`;
}

export function getGrafanaEmbedUrl(opts?: {
  dark?: boolean;
  reportId?: string;
  uid?: string;
  firm?: string;
  period?: string;
  sql?: string;
}): string {
  const base = getGrafanaBaseUrl();
  const theme = opts?.dark ? 'dark' : 'light';
  if (opts?.sql || opts?.reportId === 'builder-pg') {
    return `${base}${getGrafanaExplorePostgresPath(theme, opts.sql)}`;
  }
  const vars = { firm: opts?.firm, period: opts?.period };
  if (opts?.uid) {
    return `${base}${dashEmbed(opts.uid, theme, '&refresh=2m', vars)}`;
  }
  const report =
    GRAFANA_READY_REPORTS.find((r) => r.id === opts?.reportId) ||
    GRAFANA_READY_REPORTS.find((r) => r.category === 'executive') ||
    GRAFANA_READY_REPORTS[0];
  return `${base}${report.embedPath(theme, vars)}`;
}

export function getGrafanaSystemHealthEmbedUrl(opts?: { dark?: boolean }): string {
  return getGrafanaEmbedUrl({ ...opts, reportId: 'ops-overview' });
}

/** Grafana search tag → kategori */
export function categoryFromGrafanaTags(tags: string[] | undefined): GrafanaReportCategory {
  const t = (tags || []).map((x) => String(x).toLowerCase());
  if (t.includes('wms')) return 'wms';
  if (t.includes('beauty')) return 'beauty';
  if (t.includes('restaurant')) return 'restaurant';
  if (t.includes('accounting')) return 'accounting';
  if (t.includes('materials') || t.includes('material')) return 'materials';
  if (t.includes('purchase')) return 'purchase';
  if (t.includes('payment') || t.includes('discount')) return 'payment';
  if (t.includes('customers') || (t.includes('finance') && t.includes('aging'))) return 'customers';
  if (t.includes('stock') || t.includes('warehouse')) return 'stock';
  if (t.includes('sales') || t.includes('pos') || t.includes('payments') || t.includes('invoices'))
    return 'sales';
  if (t.includes('cash') || t.includes('finance') || t.includes('expenses') || t.includes('campaigns'))
    return 'finance';
  if (t.includes('hr') || t.includes('production')) return 'hr';
  if (t.includes('executive')) return 'executive';
  if (t.includes('general') || t.includes('app-report')) return 'general';
  if (t.includes('ops') || t.includes('system')) return 'ops';
  if (t.includes('erp')) return 'sales';
  return 'executive';
}
