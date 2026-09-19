/**
 * Genel Rapor / malzeme / muhasebe — Grafana karşılıkları
 * Üretir: node scripts/generate-grafana-app-reports.mjs
 */
import { dashEmbed, type GrafanaReadyReport, type GrafanaReportCategory } from './grafanaEmbed';

export type GrafanaAppReportMeta = {
  id: string;
  uid: string;
  category: GrafanaReportCategory | string;
  titleTr: string;
  titleEn: string;
  descriptionTr: string;
  descriptionEn: string;
};

export const GRAFANA_APP_REPORTS_META: GrafanaAppReportMeta[] = [
  {
    "id": "daily",
    "uid": "retailex-rpt-daily",
    "category": "general",
    "titleTr": "Günlük Rapor",
    "titleEn": "Daily Report",
    "descriptionTr": "Bugünkü fiş, ciro, ödeme",
    "descriptionEn": "Today fiches, revenue, payments"
  },
  {
    "id": "z-report",
    "uid": "retailex-rpt-z",
    "category": "general",
    "titleTr": "Z Raporu",
    "titleEn": "Z Report",
    "descriptionTr": "Gün sonu / kasa kapanış özeti",
    "descriptionEn": "End of day / cash close summary"
  },
  {
    "id": "monthly-days-summary",
    "uid": "retailex-rpt-monthly-days",
    "category": "general",
    "titleTr": "Aylık Gün Özeti",
    "titleEn": "Monthly Day Summary",
    "descriptionTr": "Seçili dönemde günlük ciro",
    "descriptionEn": "Daily revenue in period"
  },
  {
    "id": "yearly-months-summary",
    "uid": "retailex-rpt-yearly-months",
    "category": "general",
    "titleTr": "Yıllık Ay Özeti",
    "titleEn": "Yearly Month Summary",
    "descriptionTr": "Aylık ciro özeti",
    "descriptionEn": "Monthly revenue summary"
  },
  {
    "id": "end-of-day",
    "uid": "retailex-rpt-eod",
    "category": "general",
    "titleTr": "Gün Sonu Raporu",
    "titleEn": "End of Day Report",
    "descriptionTr": "Gün sonu satış ve kasa",
    "descriptionEn": "End of day sales and cash"
  },
  {
    "id": "top-products",
    "uid": "retailex-rpt-top-products",
    "category": "sales",
    "titleTr": "En Çok Satanlar",
    "titleEn": "Top Sellers",
    "descriptionTr": "Ürün adet / tutar sıralaması",
    "descriptionEn": "Products by qty and amount"
  },
  {
    "id": "category-analysis",
    "uid": "retailex-rpt-category",
    "category": "sales",
    "titleTr": "Kategori Analizi",
    "titleEn": "Category Analysis",
    "descriptionTr": "Kalem bazlı satış özeti",
    "descriptionEn": "Line-item sales summary"
  },
  {
    "id": "hourly-analysis",
    "uid": "retailex-rpt-hourly",
    "category": "sales",
    "titleTr": "Saatlik Analiz",
    "titleEn": "Hourly Analysis",
    "descriptionTr": "Saat dilimine göre satış",
    "descriptionEn": "Sales by hour of day"
  },
  {
    "id": "detailed-sales",
    "uid": "retailex-rpt-detailed-sales",
    "category": "sales",
    "titleTr": "Detaylı Satış Raporu",
    "titleEn": "Detailed Sales Report",
    "descriptionTr": "Fiş listesi detay",
    "descriptionEn": "Detailed fiche list"
  },
  {
    "id": "sales-target",
    "uid": "retailex-rpt-sales-target",
    "category": "sales",
    "titleTr": "Hedef vs Gerçekleşen",
    "titleEn": "Target vs Actual",
    "descriptionTr": "Mağaza / günlük gerçekleşen",
    "descriptionEn": "Store / daily actuals"
  },
  {
    "id": "discount-report",
    "uid": "retailex-rpt-discount",
    "category": "payment",
    "titleTr": "İndirim Raporu",
    "titleEn": "Discount Report",
    "descriptionTr": "Fiş ve kalem indirimleri",
    "descriptionEn": "Fiche and line discounts"
  },
  {
    "id": "collection-due",
    "uid": "retailex-rpt-collection-due",
    "category": "finance",
    "titleTr": "Vade / Tahsilat",
    "titleEn": "Collection Due",
    "descriptionTr": "Cari hareket ve bakiyeler",
    "descriptionEn": "AR movements and balances"
  },
  {
    "id": "cash-status",
    "uid": "retailex-rpt-cash-status",
    "category": "payment",
    "titleTr": "Kasa Durumu",
    "titleEn": "Cash Status",
    "descriptionTr": "Kasa kart bakiyeleri",
    "descriptionEn": "Cash register balances"
  },
  {
    "id": "commission",
    "uid": "retailex-rpt-commission",
    "category": "payment",
    "titleTr": "Komisyon Raporu",
    "titleEn": "Commission Report",
    "descriptionTr": "Kasiyer / satış elemanı ciro",
    "descriptionEn": "Cashier / sales rep revenue"
  },
  {
    "id": "supplier-purchase-returns",
    "uid": "retailex-rpt-purchase-returns",
    "category": "purchase",
    "titleTr": "Tedarikçi Alış İadeleri",
    "titleEn": "Supplier Purchase Returns",
    "descriptionTr": "Alış iade fişleri",
    "descriptionEn": "Purchase return fiches"
  },
  {
    "id": "purchase-promotion-report",
    "uid": "retailex-rpt-purchase-promo",
    "category": "purchase",
    "titleTr": "Alış Promosyon Raporu",
    "titleEn": "Purchase Promotion",
    "descriptionTr": "İndirimli alış kalemleri",
    "descriptionEn": "Discounted purchase lines"
  },
  {
    "id": "stock-status",
    "uid": "retailex-rpt-stock-status",
    "category": "stock",
    "titleTr": "Stok Durumu",
    "titleEn": "Stock Status",
    "descriptionTr": "Ürün stok listesi",
    "descriptionEn": "Product stock list"
  },
  {
    "id": "stock-turnover",
    "uid": "retailex-rpt-stock-turnover",
    "category": "stock",
    "titleTr": "Stok Dönüş Hızı",
    "titleEn": "Stock Turnover",
    "descriptionTr": "Satış miktarına göre ürünler",
    "descriptionEn": "Products by sold qty"
  },
  {
    "id": "stock-abc",
    "uid": "retailex-rpt-stock-abc",
    "category": "stock",
    "titleTr": "Stok ABC Analizi",
    "titleEn": "Stock ABC Analysis",
    "descriptionTr": "Ciro payına göre ABC",
    "descriptionEn": "ABC by revenue share"
  },
  {
    "id": "materials",
    "uid": "retailex-rpt-material-move",
    "category": "stock",
    "titleTr": "Mal Hareket Raporu",
    "titleEn": "Material Movement",
    "descriptionTr": "Satış kalemi hareketleri",
    "descriptionEn": "Sale line movements"
  },
  {
    "id": "report-material-extract",
    "uid": "retailex-rpt-material-extract",
    "category": "materials",
    "titleTr": "Malzeme Ekstresi",
    "titleEn": "Material Extract",
    "descriptionTr": "Ürün satış ekstresi",
    "descriptionEn": "Product sales extract"
  },
  {
    "id": "report-material-value",
    "uid": "retailex-rpt-material-value",
    "category": "materials",
    "titleTr": "Malzeme Değer",
    "titleEn": "Material Value",
    "descriptionTr": "Stok maliyet değeri",
    "descriptionEn": "Inventory cost value"
  },
  {
    "id": "report-in-out-totals",
    "uid": "retailex-rpt-in-out",
    "category": "materials",
    "titleTr": "Giriş / Çıkış Toplamları",
    "titleEn": "In/Out Totals",
    "descriptionTr": "Satış çıkış özeti",
    "descriptionEn": "Sales outflow summary"
  },
  {
    "id": "report-min-max",
    "uid": "retailex-rpt-min-max",
    "category": "materials",
    "titleTr": "Min / Max Stok",
    "titleEn": "Min/Max Stock",
    "descriptionTr": "Min-max dışı stoklar",
    "descriptionEn": "Stock outside min/max"
  },
  {
    "id": "report-slip-list",
    "uid": "retailex-rpt-slip-list",
    "category": "materials",
    "titleTr": "Fiş Listesi",
    "titleEn": "Slip List",
    "descriptionTr": "Satış / belge fiş listesi",
    "descriptionEn": "Sales / document slip list"
  },
  {
    "id": "report-warehouse-status",
    "uid": "retailex-rpt-warehouse-status",
    "category": "materials",
    "titleTr": "Malzeme Ambar Durum",
    "titleEn": "Warehouse Status",
    "descriptionTr": "Ambar / stok durumu",
    "descriptionEn": "Warehouse stock status"
  },
  {
    "id": "purchase-expiry-report",
    "uid": "retailex-rpt-expiry",
    "category": "materials",
    "titleTr": "Son Kullanma Tarihi",
    "titleEn": "Expiry Date Report",
    "descriptionTr": "SKT yaklaşan kalemler",
    "descriptionEn": "Near-expiry lines"
  },
  {
    "id": "income-statement",
    "uid": "retailex-rpt-income",
    "category": "accounting",
    "titleTr": "Gelir Tablosu",
    "titleEn": "Income Statement",
    "descriptionTr": "Satış − maliyet − gider",
    "descriptionEn": "Sales − cost − expenses"
  },
  {
    "id": "balance-sheet",
    "uid": "retailex-rpt-balance",
    "category": "accounting",
    "titleTr": "Bilanço",
    "titleEn": "Balance Sheet",
    "descriptionTr": "Kasa, banka, cari özeti",
    "descriptionEn": "Cash, bank, AR summary"
  },
  {
    "id": "mizan",
    "uid": "retailex-rpt-mizan",
    "category": "accounting",
    "titleTr": "Mizan Raporu",
    "titleEn": "Trial Balance",
    "descriptionTr": "Kasa / banka / cari mizan",
    "descriptionEn": "Cash / bank / AR trial"
  },
  {
    "id": "beauty-cancelled-report",
    "uid": "retailex-rpt-beauty-cancelled",
    "category": "beauty",
    "titleTr": "Güzellik İptaller",
    "titleEn": "Beauty Cancelled",
    "descriptionTr": "İptal randevular",
    "descriptionEn": "Cancelled appointments"
  },
  {
    "id": "beauty-commission-report",
    "uid": "retailex-rpt-beauty-commission",
    "category": "beauty",
    "titleTr": "Güzellik Prim Raporu",
    "titleEn": "Beauty Commission",
    "descriptionTr": "Uzman komisyonları",
    "descriptionEn": "Specialist commissions"
  },
  {
    "id": "beauty-survey-report",
    "uid": "retailex-rpt-beauty-survey",
    "category": "beauty",
    "titleTr": "Güzellik Anket",
    "titleEn": "Beauty Survey",
    "descriptionTr": "Müşteri geri bildirimi",
    "descriptionEn": "Customer feedback"
  },
  {
    "id": "beauty-appointment-product-report",
    "uid": "retailex-rpt-beauty-appt-product",
    "category": "beauty",
    "titleTr": "Randevu Ürün Satışları",
    "titleEn": "Appointment Product Sales",
    "descriptionTr": "Güzellik satış kalemleri",
    "descriptionEn": "Beauty sale lines"
  },
  {
    "id": "product-reports",
    "uid": "retailex-rpt-rest-product-qty",
    "category": "restaurant",
    "titleTr": "Ürün Adet Raporu",
    "titleEn": "Product Qty Report",
    "descriptionTr": "Satılan ürün adetleri",
    "descriptionEn": "Sold product quantities"
  },
  {
    "id": "table-reports",
    "uid": "retailex-rpt-rest-tables",
    "category": "restaurant",
    "titleTr": "Masa Raporları",
    "titleEn": "Table Reports",
    "descriptionTr": "Restoran iade / masa özeti",
    "descriptionEn": "Restaurant voids / table summary"
  },
  {
    "id": "courier-reports",
    "uid": "retailex-rpt-rest-courier",
    "category": "restaurant",
    "titleTr": "Kurye Raporları",
    "titleEn": "Courier Reports",
    "descriptionTr": "Paket / not alanı satışlar",
    "descriptionEn": "Delivery-ish sales via notes"
  }
];

export const GRAFANA_APP_CATEGORY_LABELS: Record<string, { tr: string; en: string; order: number }> = {
  general: { tr: 'Genel', en: 'General', order: 1 },
  sales: { tr: 'Satış analizleri', en: 'Sales analytics', order: 2 },
  finance: { tr: 'Finansal raporlar', en: 'Financial', order: 3 },
  payment: { tr: 'Ödeme ve işlemler', en: 'Payments', order: 4 },
  purchase: { tr: 'Satın alma', en: 'Purchasing', order: 5 },
  stock: { tr: 'Stok raporları', en: 'Stock', order: 6 },
  materials: { tr: 'Malzeme raporları', en: 'Materials', order: 7 },
  accounting: { tr: 'Muhasebe', en: 'Accounting', order: 8 },
  beauty: { tr: 'Güzellik', en: 'Beauty', order: 9 },
  restaurant: { tr: 'Restoran', en: 'Restaurant', order: 10 },
};

export function grafanaAppReportsAsReady(): GrafanaReadyReport[] {
  return GRAFANA_APP_REPORTS_META.map((m) => ({
    id: m.id,
    uid: m.uid,
    category: (m.category as GrafanaReportCategory) || 'sales',
    titleTr: m.titleTr,
    titleEn: m.titleEn,
    descriptionTr: m.descriptionTr,
    descriptionEn: m.descriptionEn,
    embedPath: (theme, vars) => dashEmbed(m.uid, theme, '&refresh=2m', vars),
  }));
}
