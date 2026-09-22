/**
 * VIVA SOLAR — `ALL PROJECY` sayfası karşılığı.
 * Fatura kalem detayı — fatura başına tüm satırları, müşteri + telefon + bakiye ile.
 * Mevcut `ErpCoreReports.tsx` mimarisiyle aynı kalıp.
 *
 * Mali denetim notu:
 *  - `lineTotal` = miktar × birimFiyat × (1 - iskonto/100).
 *  - `invoiceTotal` = faturadaki tüm kalemlerin `lineTotal` toplamı; (subtotal > 0 ise o, değilse net + indirim).
 *  - `balance` = invoiceTotal - collected; iade ise ters işaret.
 *  - Cari türü 'customer' olmalı; supplier verisi filtre dışı.
 *  - Telefon araması case-insensitive `ILIKE` benzeri içerir.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Input, InputNumber, Select } from 'antd';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useRegisterDatagridRefresh } from '../../hooks/useRegisterDatagridRefresh';
import { formatNumber } from '../../utils/formatNumber';
import { getReportingCurrency } from '../../utils/currency';
import {
  buildReportDateRangeChange,
  defaultReportDateRange,
  type ReportDateRangeValue,
} from '../../utils/reportDatePresets';
import { ReportDateRangePresets } from '../shared/ReportDateRangePresets';
import { erpReportsAPI } from '../../services/api/erpReports';
import { supplierAPI } from '../../services/api/suppliers';
import type { Supplier } from '../../core/types';
import { ReportColumnTable, type ReportColumnTableCol } from './shared/ReportDataGrid';

type SelectOption = { value: string; label: string };

export interface InvoiceItemsDetailRow {
  id: string;
  date: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  invoiceTotal: number;
  balance: number;
  phone: string;
}

function exportCsv(fileName: string, headers: string[], rows: string[][]): void {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportShell({
  title,
  subtitle,
  loading,
  onRefresh,
  onExport,
  filters,
  children,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  onRefresh: () => void;
  onExport?: () => void;
  filters?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { darkMode } = useTheme();
  const { tm } = useLanguage();
  useRegisterDatagridRefresh(onRefresh);
  const panel = darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const labelClass = darkMode ? 'text-gray-400' : 'text-slate-500';
  const actionBtnBase =
    'inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-bold whitespace-nowrap';

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border px-3 py-2 ${panel}`}>
        <div className="mb-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className={`text-xs ${muted}`}>{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {filters}
          <div className="flex flex-col gap-0.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${labelClass}`} aria-hidden>
              &nbsp;
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onRefresh}
                title={tm('refresh') || 'Yenile'}
                aria-label={tm('refresh') || 'Yenile'}
                className={`${actionBtnBase} ${
                  darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {tm('refresh') || 'Yenile'}
              </button>
              {onExport && (
                <button
                  type="button"
                  onClick={onExport}
                  title="Excel / CSV"
                  aria-label="Excel / CSV"
                  className={`${actionBtnBase} border-transparent bg-emerald-600 text-white hover:bg-emerald-700`}
                >
                  <Download className="h-3.5 w-3.5" />
                  Excel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function InvoiceItemsDetailReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();

  const [dateRange, setDateRange] = useState<ReportDateRangeValue>(() => defaultReportDateRange('month'));
  const [cariIds, setCariIds] = useState<string[]>([]);
  const [cariOptions, setCariOptions] = useState<SelectOption[]>([]);
  const [cariLoading, setCariLoading] = useState(false);
  const [search, setSearch] = useState<string>('');
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [rows, setRows] = useState<InvoiceItemsDetailRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCariLoading(true);
        const list: Supplier[] = await supplierAPI.getAll({ cardType: 'customer' });
        if (cancelled) return;
        const opts: SelectOption[] = (Array.isArray(list) ? list : []).map((c) => ({
          value: String(c.id),
          label: c.code ? `${c.code} — ${c.name}` : c.name,
        }));
        setCariOptions(opts);
      } catch (err) {
        console.error('[InvoiceItemsDetailReport] cari load failed', err);
        if (!cancelled) setCariOptions([]);
      } finally {
        if (!cancelled) setCariLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFirm?.firm_nr]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await erpReportsAPI.getInvoiceItemsDetail({
        from: dateRange.from,
        to: dateRange.to,
        cariIds: cariIds.length > 0 ? cariIds : undefined,
      });
      const data = (Array.isArray(raw) ? raw : []) as unknown as InvoiceItemsDetailRow[];
      setRows(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[InvoiceItemsDetailReport]', err);
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to, cariIds]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (cariIds.length > 0 && !cariIds.includes(r.customerId)) return false;
      if (q) {
        const blob = `${r.invoiceNo} ${r.customerName} ${r.productName} ${r.phone}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (priceMin != null && r.unitPrice < priceMin) return false;
      if (priceMax != null && r.unitPrice > priceMax) return false;
      return true;
    });
  }, [rows, cariIds, search, priceMin, priceMax]);

  const totals = useMemo(() => {
    let qty = 0;
    let lineTotal = 0;
    // A6: Footer'da "fatura toplamı" her satırda tekrar ettiği için 3-5× şişiyordu.
    // Burada yalnızca benzersiz faturaların `invoiceTotal` toplamı "gerçek fatura
    // toplamı" olarak hesaplanır; `lineTotal` ise kalem satırı toplamıdır.
    const seenInvoices = new Set<string>();
    let invoiceTotal = 0;
    let balance = 0;
    for (const r of filtered) {
      qty += r.quantity;
      lineTotal += r.lineTotal;
      balance += r.balance;
      const key = r.invoiceNo || r.id;
      if (!seenInvoices.has(key)) {
        seenInvoices.add(key);
        invoiceTotal += r.invoiceTotal;
      }
    }
    return {
      qty,
      lineTotal,
      invoiceTotal,
      balance,
      invoiceCount: seenInvoices.size,
    };
  }, [filtered]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const filterLabelClass = darkMode ? 'text-gray-400' : 'text-slate-500';

  const tableColumns = useMemo<ReportColumnTableCol<InvoiceItemsDetailRow>[]>(
    () => [
      {
        key: 'date',
        header: tm('rprColDate') || 'Tarih',
        type: 'date',
        size: 110,
      },
      {
        key: 'invoiceNo',
        header: tm('rprColInvoiceNo') || 'Fatura No',
        size: 150,
        cell: (r) => <span className="font-mono text-xs">{r.invoiceNo || '—'}</span>,
      },
      {
        key: 'customerName',
        header: tm('rprColCustomer') || 'Müşteri',
        size: 180,
      },
      {
        key: 'productName',
        header: tm('rprColProduct') || 'Ürün',
        size: 220,
        cell: (r) => (
          <span className="block max-w-[220px] truncate" title={r.productName}>
            {r.productName || '—'}
          </span>
        ),
      },
      {
        key: 'quantity',
        header: tm('rprColQuantity') || 'Miktar',
        type: 'number',
        align: 'right',
        size: 90,
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 2, false),
        cell: (r) => formatNumber(r.quantity, 2, false),
      },
      {
        key: 'unitPrice',
        header: tm('rprColUnitPrice') || 'Birim Fiyat',
        type: 'number',
        align: 'right',
        size: 110,
        cell: (r) => formatNumber(r.unitPrice, 2, false),
      },
      {
        key: 'discount',
        header: tm('rprColDiscount') || 'İskonto',
        type: 'number',
        align: 'right',
        size: 90,
        cell: (r) => formatNumber(r.discount, 2, false),
      },
      {
        key: 'lineTotal',
        header: tm('rprColLineTotal') || 'Satır Toplam',
        type: 'number',
        align: 'right',
        size: 120,
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 2, false),
        cell: (r) => <span className="font-semibold">{formatNumber(r.lineTotal, 2, false)}</span>,
      },
      {
        key: 'invoiceTotal',
        header: tm('rprColInvoiceTotal') || 'Fatura Toplam',
        type: 'number',
        align: 'right',
        size: 130,
        footerSum: true,
        footerFormat: (_sum, rows) => {
          const seen = new Set<string>();
          let total = 0;
          for (const r of rows) {
            const key = r.invoiceNo || r.id;
            if (seen.has(key)) continue;
            seen.add(key);
            total += r.invoiceTotal;
          }
          return `${formatNumber(total, 2, false)} ${currency}`;
        },
        cell: (r) => (
          <span className={`font-semibold ${r.invoiceTotal < 0 ? 'text-red-500' : ''}`}>
            {formatNumber(r.invoiceTotal, 2, false)} {currency}
          </span>
        ),
      },
      {
        key: 'balance',
        header: tm('rprColBalance') || 'Bakiye',
        type: 'number',
        align: 'right',
        size: 120,
        footerSum: true,
        footerFormat: (n) => (
          <span className={n > 0 ? 'text-red-500' : 'text-emerald-600'}>
            {formatNumber(n, 2, false)} {currency}
          </span>
        ),
        cell: (r) => (
          <span
            className={`font-bold ${
              r.balance > 0 ? 'text-red-500' : r.balance < 0 ? 'text-emerald-600' : ''
            }`}
          >
            {formatNumber(r.balance, 2, false)} {currency}
          </span>
        ),
      },
      {
        key: 'phone',
        header: tm('rprColPhone') || 'Telefon',
        size: 140,
        cell: (r) => <span className="font-mono text-xs">{r.phone || '—'}</span>,
      },
    ],
    [tm, currency],
  );

  return (
    <ReportShell
      title={tm('rprInvoiceItemsDetailTitle') || 'Fatura Kalem Detayı'}
      subtitle={tm('rprInvoiceItemsDetailSubtitle') || 'Tüm projeler — VIVA SOLAR ALL PROJECY'}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'fatura_kalem_detay',
          [
            'No', 'Tarih', 'Fatura No', 'Müşteri', 'Ürün', 'Miktar', 'Birim Fiyat',
            'İskonto', 'Satır Toplam', 'Fatura Toplam', 'Bakiye', 'Telefon',
          ],
          filtered.map((r, i) => [
            String(i + 1),
            r.date,
            r.invoiceNo,
            r.customerName,
            r.productName,
            String(r.quantity),
            String(r.unitPrice),
            String(r.discount),
            String(r.lineTotal),
            String(r.invoiceTotal),
            String(r.balance),
            r.phone,
          ]),
        )
      }
      filters={
        <>
          <ReportDateRangePresets
            className="gap-2"
            value={dateRange}
            onChange={(next) =>
              setDateRange(buildReportDateRangeChange(next.preset, next.monthOffset, next.from, next.to))
            }
            tm={tm}
          />
          <label className="flex flex-col gap-0.5 min-w-[10rem]">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${filterLabelClass}`}>
              {tm('rprFilterCustomer') || 'Müşteri'}
            </span>
            <Select
              mode="multiple"
              allowClear
              showSearch
              size="small"
              optionFilterProp="label"
              loading={cariLoading}
              className="w-full min-w-[10rem] max-w-[14rem]"
              placeholder={tm('rprFilterCustomer') || 'Müşteri'}
              value={cariIds}
              onChange={(v) => setCariIds(v as string[])}
              options={cariOptions}
              maxTagCount="responsive"
            />
          </label>
          <label className="flex flex-col gap-0.5 min-w-[9rem]">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${filterLabelClass}`}>
              {tm('search') || 'Ara'}
            </span>
            <Input
              allowClear
              size="small"
              placeholder={tm('rprFilterInvoiceSearch') || 'Fatura / ürün / telefon'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[11rem]"
            />
          </label>
          <div className="flex flex-col gap-0.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${filterLabelClass}`}>
              {tm('rprColUnitPrice') || 'Birim Fiyat'}
            </span>
            <div className="flex items-center gap-1">
              <InputNumber
                size="small"
                value={priceMin ?? undefined}
                onChange={(v) => setPriceMin(v == null ? null : Number(v))}
                placeholder={tm('rprFilterPriceMin') || 'Min'}
                min={0}
                className="w-[5.5rem]"
              />
              <span className={`text-xs ${filterLabelClass}`} aria-hidden>
                –
              </span>
              <InputNumber
                size="small"
                value={priceMax ?? undefined}
                onChange={(v) => setPriceMax(v == null ? null : Number(v))}
                placeholder={tm('rprFilterPriceMax') || 'Max'}
                min={0}
                className="w-[5.5rem]"
              />
            </div>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprInvoiceCount') || 'Fatura Sayısı'}</p>
          <p className="text-xl font-bold">{totals.invoiceCount}</p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColQuantity') || 'Miktar'}</p>
          <p className="text-xl font-bold">{formatNumber(totals.qty, 2, false)}</p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColLineTotal') || 'Satır Toplam'}</p>
          <p className="text-xl font-bold text-blue-600">
            {formatNumber(totals.lineTotal, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColInvoiceTotal') || 'Fatura Toplam'}</p>
          <p className="text-xl font-bold">{formatNumber(totals.invoiceTotal, 2, false)} {currency}</p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColBalance') || 'Bakiye'}</p>
          <p className={`text-xl font-bold ${totals.balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {formatNumber(totals.balance, 2, false)} {currency}
          </p>
        </div>
      </div>
      <div className={`rounded-lg border p-2 ${tableCls}`}>
        {filtered.length === 0 && !loading ? (
          <div className="px-3 py-8 text-center opacity-60">{tm('erpNoRows') || 'Veri yok'}</div>
        ) : (
          <ReportColumnTable
            data={filtered}
            columns={tableColumns}
            height={560}
            footerLabel={
              <>
                {tm('rprTotal') || 'TOPLAM'}
                <span className="ml-2 text-xs font-normal opacity-70">
                  {`(${filtered.length} ${tm('rprRowCount') || 'satır'} · ${totals.invoiceCount} ${tm('rprInvoiceCount') || 'fatura'})`}
                </span>
              </>
            }
          />
        )}
      </div>
    </ReportShell>
  );
}
