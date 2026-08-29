import { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Download, X, FileSpreadsheet, Users, Package, ListOrdered, Loader2 } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { toast } from 'sonner';
import type { ListInvoice } from './invoiceListColumns';
import {
  buildStyledWorksheet,
  type StyledWorksheetOptions,
} from '../../../utils/excelStyles';

export type InvoiceExcelGroupMode = 'line' | 'customer' | 'product';

interface InvoiceExcelExportModalProps {
  open: boolean;
  onClose: () => void;
  /** Mevcut sayfada görünen faturalar — başlangıç verisi olarak kullanılır */
  invoices: ListInvoice[];
  /** Liste başlığı — Excel sheet/filename için */
  title?: string;
  /** Çıktı dosyasının adı (.xlsx eklenir) */
  fileNameBase?: string;
}

interface ModeOption {
  id: InvoiceExcelGroupMode;
  icon: typeof ListOrdered;
  titleKey: string;
  descKey: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: 'line',
    icon: ListOrdered,
    titleKey: 'invoiceExcelModeLine',
    descKey: 'invoiceExcelModeLineDesc',
  },
  {
    id: 'customer',
    icon: Users,
    titleKey: 'invoiceExcelModeCustomer',
    descKey: 'invoiceExcelModeCustomerDesc',
  },
  {
    id: 'product',
    icon: Package,
    titleKey: 'invoiceExcelModeProduct',
    descKey: 'invoiceExcelModeProductDesc',
  },
];

function getRowCurrency(invoice: ListInvoice, fallback: string): string {
  const c = String(invoice.currency ?? '').trim().toUpperCase();
  if (c) return c;
  return fallback || 'IQD';
}

function safeText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDateOnly(value: string | undefined | null): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return safeText(value);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return safeText(value);
  }
}

function sanitizeSheetName(name: string): string {
  // Excel sheet name kuralları: max 31 karakter, :\\/?*[] yasak
  return (name || 'Sheet')
    .replace(/[:\\/?*[\]]/g, '_')
    .slice(0, 31)
    .trim() || 'Sheet';
}

/** Yeterince items yoksa items'ı API'den çekip doldurur. */
async function ensureInvoiceItems(invoices: ListInvoice[]): Promise<ListInvoice[]> {
  const missing = invoices.filter((inv) => !Array.isArray(inv.items) || inv.items.length === 0);
  if (missing.length === 0) return invoices;

  const { invoicesAPI } = await import('../../../services/api/invoices');
  const enriched = await Promise.all(
    invoices.map(async (inv) => {
      if (Array.isArray(inv.items) && inv.items.length > 0) return inv;
      if (!inv.id) return inv;
      try {
        const full = await invoicesAPI.getById(String(inv.id));
        if (full && Array.isArray(full.items)) {
          return { ...inv, items: full.items };
        }
      } catch (e) {
        // Sessiz — tek bir kayıt için diğerlerini bloklamayalım
      }
      return inv;
    }),
  );
  return enriched;
}

/** Mod 1: Fatura satır bazında (mevcut grid davranışı). */
function buildLineRows(invoices: ListInvoice[], fallbackCurrency: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const inv of invoices) {
    const items = Array.isArray(inv.items) ? inv.items : [];
    const cur = getRowCurrency(inv, fallbackCurrency);
    if (items.length === 0) {
      rows.push({
        'Fatura No': safeText(inv.invoice_no),
        'Tarih': formatDateOnly(inv.invoice_date || inv.date),
        'Müşteri/Tedarikçi': safeText(inv.customer_name || inv.supplier_name),
        'Ürün/Hizmet': '(kalem yok)',
        'Barkod/Kod': '',
        'Miktar': 0,
        'Birim': '',
        'Birim Fiyat': 0,
        'İndirim': 0,
        'Satır Toplam': 0,
        'Para Birimi': cur,
        'Fatura Toplam': Number(inv.total_amount ?? inv.total ?? 0),
        'Durum': safeText(inv.status),
      });
      continue;
    }
    for (const it of items as any[]) {
      const qty = Number(it.quantity ?? 0);
      const price = Number(it.price ?? 0);
      const discount = Number(it.discount ?? it.discount_amount ?? 0);
      const lineTotal = Number(it.total ?? qty * price - discount);
      rows.push({
        'Fatura No': safeText(inv.invoice_no),
        'Tarih': formatDateOnly(inv.invoice_date || inv.date),
        'Müşteri/Tedarikçi': safeText(inv.customer_name || inv.supplier_name),
        'Ürün/Hizmet': safeText(it.productName ?? it.product_name ?? it.name ?? ''),
        'Barkod/Kod': safeText(it.productCode ?? it.barcode ?? ''),
        'Miktar': qty,
        'Birim': safeText(it.unit ?? ''),
        'Birim Fiyat': price,
        'İndirim': discount,
        'Satır Toplam': lineTotal,
        'Para Birimi': cur,
        'Fatura Toplam': Number(inv.total_amount ?? inv.total ?? 0),
        'Durum': safeText(inv.status),
      });
    }
  }
  return rows;
}

/** Mod 2: Müşteri bazında — her müşteri için o müşterinin aldığı ürünler listelenir. */
function buildCustomerRows(invoices: ListInvoice[], fallbackCurrency: string): Record<string, unknown>[] {
  type Bucket = {
    customer: string;
    invoiceCount: number;
    invoiceNos: Set<string>;
    firstDate: string | null;
    lastDate: string | null;
    productTotals: Map<
      string,
      { name: string; code: string; qty: number; revenue: number; lines: number }
    >;
    grandTotal: number;
    currency: string;
  };

  const buckets = new Map<string, Bucket>();
  for (const inv of invoices) {
    const customer = String(inv.customer_name || inv.supplier_name || '').trim() || '(tanımsız)';
    const cur = getRowCurrency(inv, fallbackCurrency);
    const key = `${customer}__${cur}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        customer,
        invoiceCount: 0,
        invoiceNos: new Set<string>(),
        firstDate: null,
        lastDate: null,
        productTotals: new Map(),
        grandTotal: 0,
        currency: cur,
      };
      buckets.set(key, bucket);
    }
    const dStr = String(inv.invoice_date || inv.date || '');
    if (dStr) {
      if (!bucket.firstDate || dStr < bucket.firstDate) bucket.firstDate = dStr;
      if (!bucket.lastDate || dStr > bucket.lastDate) bucket.lastDate = dStr;
    }
    bucket.invoiceCount += 1;
    if (inv.invoice_no) bucket.invoiceNos.add(String(inv.invoice_no));
    const items = Array.isArray(inv.items) ? inv.items : [];
    for (const it of items as any[]) {
      const name = String(it.productName ?? it.product_name ?? it.name ?? '(tanımsız)');
      const code = String(it.productCode ?? it.barcode ?? '');
      const productKey = `${name}__${code}`;
      const qty = Number(it.quantity ?? 0);
      const lineTotal = Number(it.total ?? qty * Number(it.price ?? 0) - Number(it.discount ?? it.discount_amount ?? 0));
      const existing = bucket.productTotals.get(productKey);
      if (existing) {
        existing.qty += qty;
        existing.revenue += lineTotal;
        existing.lines += 1;
      } else {
        bucket.productTotals.set(productKey, { name, code, qty, revenue: lineTotal, lines: 1 });
      }
    }
    bucket.grandTotal += Number(inv.total_amount ?? inv.total ?? 0);
  }

  const rows: Record<string, unknown>[] = [];
  // Alfabetik sırala — müşteri adına göre
  const sortedBuckets = Array.from(buckets.values()).sort((a, b) =>
    a.customer.localeCompare(b.customer, 'tr'),
  );
  for (const bucket of sortedBuckets) {
    rows.push({
      'Müşteri/Tedarikçi': bucket.customer,
      'Fatura Sayısı': bucket.invoiceCount,
      'İlk Tarih': formatDateOnly(bucket.firstDate),
      'Son Tarih': formatDateOnly(bucket.lastDate),
      'Ürün/Hizmet': '',
      'Barkod/Kod': '',
      'Toplam Miktar': '',
      'Toplam Harcama': '',
      'Satır Sayısı': '',
      'Para Birimi': bucket.currency,
      'Müşteri Toplam': bucket.grandTotal,
    });
    const products = Array.from(bucket.productTotals.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'tr'),
    );
    for (const p of products) {
      rows.push({
        'Müşteri/Tedarikçi': '  � ' + bucket.customer,
        'Fatura Sayısı': '',
        'İlk Tarih': '',
        'Son Tarih': '',
        'Ürün/Hizmet': p.name,
        'Barkod/Kod': p.code,
        'Toplam Miktar': p.qty,
        'Toplam Harcama': p.revenue,
        'Satır Sayısı': p.lines,
        'Para Birimi': bucket.currency,
        'Müşteri Toplam': '',
      });
    }
  }
  return rows;
}

/** Mod 3: Ürün bazında — her ürün için o ürünü alan müşteriler listelenir. */
function buildProductRows(invoices: ListInvoice[], fallbackCurrency: string): Record<string, unknown>[] {
  type Bucket = {
    productName: string;
    productCode: string;
    unit: string;
    customerTotals: Map<
      string,
      { name: string; qty: number; revenue: number; lines: number }
    >;
    totalQty: number;
    totalRevenue: number;
    currency: string;
  };

  const buckets = new Map<string, Bucket>();
  for (const inv of invoices) {
    const cur = getRowCurrency(inv, fallbackCurrency);
    const items = Array.isArray(inv.items) ? inv.items : [];
    for (const it of items as any[]) {
      const name = String(it.productName ?? it.product_name ?? it.name ?? '(tanımsız)');
      const code = String(it.productCode ?? it.barcode ?? '');
      const unit = String(it.unit ?? '');
      const productKey = `${name}__${code}__${cur}`;
      const qty = Number(it.quantity ?? 0);
      const lineTotal = Number(it.total ?? qty * Number(it.price ?? 0) - Number(it.discount ?? it.discount_amount ?? 0));
      const customerName = String(inv.customer_name || inv.supplier_name || '').trim() || '(tanımsız)';
      const custKey = `${customerName}__${cur}`;

      let bucket = buckets.get(productKey);
      if (!bucket) {
        bucket = {
          productName: name,
          productCode: code,
          unit,
          customerTotals: new Map(),
          totalQty: 0,
          totalRevenue: 0,
          currency: cur,
        };
        buckets.set(productKey, bucket);
      }
      bucket.totalQty += qty;
      bucket.totalRevenue += lineTotal;
      const existingCust = bucket.customerTotals.get(custKey);
      if (existingCust) {
        existingCust.qty += qty;
        existingCust.revenue += lineTotal;
        existingCust.lines += 1;
      } else {
        bucket.customerTotals.set(custKey, {
          name: customerName,
          qty,
          revenue: lineTotal,
          lines: 1,
        });
      }
    }
  }

  const rows: Record<string, unknown>[] = [];
  const sortedBuckets = Array.from(buckets.values()).sort((a, b) =>
    a.productName.localeCompare(b.productName, 'tr'),
  );
  for (const bucket of sortedBuckets) {
    rows.push({
      'Ürün/Hizmet': bucket.productName,
      'Barkod/Kod': bucket.productCode,
      'Birim': bucket.unit,
      'Toplam Miktar': bucket.totalQty,
      'Toplam Harcama': bucket.totalRevenue,
      'Müşteri/Tedarikçi': '',
      'Müşteri Miktar': '',
      'Müşteri Harcama': '',
      'Satır Sayısı': '',
      'Para Birimi': bucket.currency,
    });
    const customers = Array.from(bucket.customerTotals.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'tr'),
    );
    for (const c of customers) {
      rows.push({
        'Ürün/Hizmet': '  ↳ ' + bucket.productName,
        'Barkod/Kod': '',
        'Birim': '',
        'Toplam Miktar': '',
        'Toplam Harcama': '',
        'Müşteri/Tedarikçi': c.name,
        'Müşteri Miktar': c.qty,
        'Müşteri Harcama': c.revenue,
        'Satır Sayısı': c.lines,
        'Para Birimi': bucket.currency,
      });
    }
  }
  return rows;
}

interface RowsToWorksheetOptions {
  /** Sheet başlığı (1. satırda merged olarak görünür) */
  title: string;
  /** Alt başlık (2. satırda merged olarak görünür — ör. "Satır Bazında Rapor") */
  subtitle: string;
  /** Müşteri/ürün modunda grup satırlarının indeksleri (0-indexed, AOA içinde) */
  groupRowIndices?: number[];
  /** Toplam satırı (en altta) */
  totalRow?: unknown[];
}

function rowsToWorksheet(
  rows: Record<string, unknown>[],
  options: RowsToWorksheetOptions,
): XLSX.WorkSheet {
  if (rows.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['Veri yok']]);
    ws['!cols'] = [{ wch: 30 }];
    return ws;
  }

  const headers = Object.keys(rows[0]);
  const aoa: unknown[][] = [headers];
  for (const row of rows) {
    aoa.push(headers.map((h) => row[h] ?? ''));
  }

  // Para birimi kolonları — başlık adına göre tespit
  const currencyColumns = headers.filter((h) =>
    /(tutar|fiyat|toplam|harcama|amount|price|total|borç|alacak|bakiye)/i.test(h),
  );

  const options2: StyledWorksheetOptions = {
    title: options.title,
    subtitle: options.subtitle,
    headerRowIndex: 1, // AOA'nın 1. satırı (0-indexed = 0) veri başlığı
    columnCount: headers.length,
    currencyColumns,
    totalRow: options.totalRow,
    groupRowIndices: options.groupRowIndices,
    dataStartIndex: 1, // AOA'nın 1. satırı (0-indexed = 1) veri başlangıcı
  };

  return buildStyledWorksheet(aoa, options2);
}

export function InvoiceExcelExportModal({
  open,
  onClose,
  invoices,
  title,
  fileNameBase,
}: InvoiceExcelExportModalProps) {
  const { tm } = useLanguage();
  const [mode, setMode] = useState<InvoiceExcelGroupMode>('line');
  const [loading, setLoading] = useState(false);
  const [fetchedCount, setFetchedCount] = useState(0);

  useEffect(() => {
    if (!open) {
      setMode('line');
      setLoading(false);
      setFetchedCount(0);
    }
  }, [open]);

  const fallbackCurrency = useMemo(() => {
    const codes = invoices
      .map((i) => String(i.currency ?? '').trim().toUpperCase())
      .filter(Boolean);
    const uniq = new Set(codes);
    if (uniq.size === 1) return [...uniq][0];
    return '';
  }, [invoices]);

  const rowCount = invoices.length;

  const handleExport = async () => {
    if (loading) return;
    if (rowCount === 0) {
      toast.error(tm('noDataFound') || 'Veri bulunamadı.');
      return;
    }
    setLoading(true);
    try {
      const enriched = await ensureInvoiceItems(invoices);
      setFetchedCount(enriched.filter((e, i) => e !== invoices[i]).length);

      let rows: Record<string, unknown>[] = [];
      let sheetName = 'Faturalar';
      let sheetTitle = title || tm('invoices') || 'Fatura Listesi';
      let sheetSubtitle = '';
      let totalRow: unknown[] | undefined = undefined;
      let groupRowIndices: number[] | undefined = undefined;

      if (mode === 'line') {
        rows = buildLineRows(enriched, fallbackCurrency);
        sheetName = 'Satır Bazında';
        sheetSubtitle = tm('invoiceExcelModeLine') || 'Satır Bazında Rapor';
        // Toplam: tüm satır toplamlarını topla
        const totalAmount = rows.reduce(
          (s, r) => s + Number(r['Satır Toplam'] || 0),
          0,
        );
        const totalQty = rows.reduce((s, r) => s + Number(r['Miktar'] || 0), 0);
        const totalInvoice = rows.reduce(
          (s, r) => s + Number(r['Fatura Toplam'] || 0),
          0,
        );
        if (rows.length > 0) {
          const headers = Object.keys(rows[0]);
          totalRow = headers.map((h) => {
            if (h === 'Fatura No') return 'TOPLAM';
            if (h === 'Satır Toplam') return totalAmount;
            if (h === 'Fatura Toplam') return totalInvoice;
            if (h === 'Miktar') return totalQty;
            return '';
          });
          // toplam satırı AOA'ya eklemek için push
          rows.push(
            Object.fromEntries(headers.map((h, i) => [h, totalRow![i] ?? ''])) as Record<string, unknown>,
          );
        }
      } else if (mode === 'customer') {
        rows = buildCustomerRows(enriched, fallbackCurrency);
        sheetName = 'Müşteri Bazında';
        sheetSubtitle = tm('invoiceExcelModeCustomer') || 'Müşteri Bazında Rapor';
        // Grup satırları: her müşteri grubu başlığı (ilk satırı "Müşteri Toplam" dolu, diğerleri ürün alt satırları)
        groupRowIndices = [];
        let i = 0;
        // Bucket yapısı korunmadığı için tekrar çıkarmamız gerekiyor
        // buildCustomerRows iç yapısını kullanmak yerine burada basit yaklaşım:
        // "Müşteri Toplam" alanı dolu olan ve "Fatura Sayısı" dolu olan satırlar grup başlığı
        for (const r of rows) {
          if (r['Müşteri Toplam'] !== '' && r['Fatura Sayısı'] !== '') {
            groupRowIndices.push(i);
          }
          i++;
        }
        // Toplam
        if (rows.length > 0) {
          const headers = Object.keys(rows[0]);
          const grandTotal = rows.reduce(
            (s, r) => s + (typeof r['Müşteri Toplam'] === 'number' ? Number(r['Müşteri Toplam']) : 0),
            0,
          );
          const totalQty = rows.reduce(
            (s, r) => s + (typeof r['Toplam Miktar'] === 'number' ? Number(r['Toplam Miktar']) : 0),
            0,
          );
          totalRow = headers.map((h) => {
            if (h === 'Müşteri/Tedarikçi') return 'GENEL TOPLAM';
            if (h === 'Müşteri Toplam') return grandTotal;
            if (h === 'Toplam Miktar') return totalQty;
            return '';
          });
          rows.push(
            Object.fromEntries(headers.map((h, idx) => [h, totalRow![idx] ?? ''])) as Record<string, unknown>,
          );
        }
      } else {
        rows = buildProductRows(enriched, fallbackCurrency);
        sheetName = 'Ürün Bazında';
        sheetSubtitle = tm('invoiceExcelModeProduct') || 'Ürün Bazında Rapor';
        groupRowIndices = [];
        let i = 0;
        for (const r of rows) {
          if (
            typeof r['Toplam Miktar'] === 'number' &&
            r['Müşteri/Tedarikçi'] === ''
          ) {
            groupRowIndices.push(i);
          }
          i++;
        }
        // Toplam
        if (rows.length > 0) {
          const headers = Object.keys(rows[0]);
          const grandRevenue = rows.reduce(
            (s, r) =>
              s + (typeof r['Toplam Harcama'] === 'number' ? Number(r['Toplam Harcama']) : 0),
            0,
          );
          const grandQty = rows.reduce(
            (s, r) =>
              s + (typeof r['Toplam Miktar'] === 'number' ? Number(r['Toplam Miktar']) : 0),
            0,
          );
          totalRow = headers.map((h) => {
            if (h === 'Ürün/Hizmet') return 'GENEL TOPLAM';
            if (h === 'Toplam Harcama') return grandRevenue;
            if (h === 'Toplam Miktar') return grandQty;
            return '';
          });
          rows.push(
            Object.fromEntries(headers.map((h, idx) => [h, totalRow![idx] ?? ''])) as Record<string, unknown>,
          );
        }
      }

      const ws = rowsToWorksheet(rows, {
        title: sheetTitle,
        subtitle: sheetSubtitle,
        groupRowIndices,
        totalRow,
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheetName));

      const base = (fileNameBase || title || 'invoices')
        .replace(/[^\w\-]+/g, '_')
        .slice(0, 60) || 'invoices';
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `${base}_${mode}_${stamp}.xlsx`);
      toast.success(tm('excelExportSuccess') || 'Excel dosyası indirildi.');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[InvoiceExcelExport] hata:', err);
      toast.error(`${tm('excelExportError') || 'Excel oluşturulamadı'}: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <PercentBodyModal
      onClose={onClose}
      size="list"
      ariaLabel={tm('invoiceExcelExportTitle') || 'Excel\'e Aktar'}
    >
      <div className="bg-gradient-to-r from-emerald-600 to-blue-600 px-8 py-6 text-white shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6" />
              {tm('invoiceExcelExportTitle') || 'Excel\'e Aktar'}
            </h2>
            <p className="text-emerald-50 text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">
              {title || tm('invoices')}
              <span className="ml-2 opacity-80">•</span>
              <span className="ml-2">
                {rowCount.toLocaleString(tm('localeCode'))} {tm('records')}
              </span>
              {fallbackCurrency ? (
                <>
                  <span className="ml-2 opacity-80">•</span>
                  <span className="ml-2">{fallbackCurrency}</span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            aria-label={tm('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-8 space-y-5">
        <p className="text-sm text-slate-600">
          {tm('invoiceExcelExportChooseMode') ||
            'Listeyi Excel olarak indirmek için bir gruplama tercihi seçin. İçerik ürün veya hizmet fark etmez — tüm fatura kalemleri dahil edilir.'}
        </p>

        <div className="space-y-3">
          {MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id)}
                disabled={loading}
                className={[
                  'w-full text-left rounded-2xl border-2 p-4 transition-all flex items-start gap-3',
                  selected
                    ? 'border-emerald-500 bg-emerald-50/60 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30',
                  loading ? 'opacity-60 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <div
                  className={[
                    'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
                    selected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600',
                  ].join(' ')}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                      {tm(opt.titleKey)}
                    </span>
                    {selected ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {tm('selected') || 'Seçili'}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {tm(opt.descKey)}
                  </p>
                </div>
                <div
                  className={[
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1',
                    selected ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white',
                  ].join(' ')}
                >
                  {selected ? (
                    <span className="w-2 h-2 rounded-full bg-white" aria-hidden />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            {tm('invoiceExcelExportInfoTitle') || 'Bilgi'}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            {tm('invoiceExcelExportInfoBody') ||
              'Ürün/hizmet kalemi bilgisi olmayan faturalar için arka planda detaylar yüklenir. Excel dosyası .xlsx formatında indirilir; Türkçe karakterler UTF-8 olarak korunur.'}
          </p>
          {fetchedCount > 0 ? (
            <p className="text-[11px] text-emerald-700 mt-2 font-semibold">
              {tm('invoiceExcelExportFetchedNote')?.replace(
                '{count}',
                String(fetchedCount),
              ) || `${fetchedCount} fatura için kalem bilgisi arka planda yüklendi.`}
            </p>
          ) : null}
        </div>
      </PercentBodyModalScrollBody>

      <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50"
        >
          {tm('cancel') || 'İptal'}
        </button>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={loading || rowCount === 0}
          className="flex-1 rounded-2xl bg-emerald-600 text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-emerald-200/50 hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {tm('loading') || 'Hazırlanıyor...'}
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              {tm('exportExcel') || 'Excel'} {tm('invoiceExcelExportDownload') || 'İndir'}
            </>
          )}
        </button>
      </div>
    </PercentBodyModal>
  );
}


