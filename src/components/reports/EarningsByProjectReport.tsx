/**
 * VIVA SOLAR — `earnings` sayfası karşılığı.
 * Fatura bazında kâr-zarar: iskonto, tahsilat, fatura tutarı, yükleme gideri,
 * harcanan, günlük gider ve kâr.
 * Mevcut `ErpCoreReports.tsx` mimarisiyle aynı kalıp (ReportShell + ReportDateRangePresets + exportCsv).
 * Mock data gerçekçi (VIVA SOLAR örneklerinden); gerçek API bağlandığında
 * `erpReportsAPI.earningsByProject` dönüş kaynağı değişecek.
 *
 * Mali denetim notu (cari türü + bakiye yönü):
 *  - `incoming` = müşteriden tahsilat (cash/bank), cari türü 'customer' olmalı.
 *  - `spent` / `dailyExpense` / `loadingExpense` = gider, kasa-banka çıkışı.
 *  - `profit = invoiceAmount - spent - loadingExpense - dailyExpense` (iade ise ters işaret).
 *  - İade faturaları (return_invoice) için `invoiceAmount` < 0 olarak gelmeli; rapor bunu ayrı göstermeli.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Select } from 'antd';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { formatNumber } from '../../utils/formatNumber';
import { getReportingCurrency } from '../../utils/currency';
import {
  buildReportDateRangeChange,
  defaultReportDateRange,
  type ReportDateRangeValue,
} from '../../utils/reportDatePresets';
import { ReportDateRangePresets } from '../shared/ReportDateRangePresets';
import { erpReportsAPI, type EarningsByProjectRow } from '../../services/api/erpReports';
import { supplierAPI } from '../../services/api/suppliers';
import type { Supplier } from '../../core/types';
import { ReportColumnTable, type ReportColumnTableCol } from './shared/ReportDataGrid';

type SelectOption = { value: string; label: string };

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
  const panel = darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 ${panel}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className={`text-sm ${muted}`}>{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filters}
            <button
              type="button"
              onClick={onRefresh}
              title={tm('refresh') || 'Yenile'}
              aria-label={tm('refresh') || 'Yenile'}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <Download className="h-3.5 w-3.5" />
                Excel / CSV
              </button>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function EarningsByProjectReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();

  const [dateRange, setDateRange] = useState<ReportDateRangeValue>(() => defaultReportDateRange('month'));
  const [cariIds, setCariIds] = useState<string[]>([]);
  const [cariOptions, setCariOptions] = useState<SelectOption[]>([]);
  const [cariLoading, setCariLoading] = useState(false);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<EarningsByProjectRow[]>([]);
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
        console.error('[EarningsByProjectReport] cari load failed', err);
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
      const data = await erpReportsAPI.getEarningsByProject({
        from: dateRange.from,
        to: dateRange.to,
        cariIds: cariIds.length > 0 ? cariIds : undefined,
        projectId: projectId || undefined,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[EarningsByProjectReport]', err);
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to, cariIds, projectId]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (projectId && r.projectId !== projectId) return false;
      if (category && r.category !== category) return false;
      if (cariIds.length > 0 && !cariIds.includes(r.customerId)) return false;
      return true;
    });
  }, [rows, cariIds, projectId, category]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  const tableColumns = useMemo<ReportColumnTableCol<EarningsByProjectRow>[]>(
    () => [
      { key: 'date', header: tm('rprColDate') || 'Tarih', type: 'date', size: 110 },
      {
        key: 'invoiceNo',
        header: tm('rprColInvoiceNo') || 'Fatura No',
        size: 140,
        cell: (r) => <span className="font-mono text-xs">{r.invoiceNo || '—'}</span>,
      },
      { key: 'customerName', header: tm('rprColCustomer') || 'Müşteri', size: 160 },
      {
        key: 'projectName',
        header: tm('rprColProject') || 'Proje',
        size: 140,
        cell: (r) => r.projectName ?? '—',
      },
      {
        key: 'category',
        header: tm('rprColCategory') || 'Kategori',
        size: 120,
        cell: (r) => (
          <span
            className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
              r.isReturn
                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            }`}
          >
            {r.category}
          </span>
        ),
      },
      {
        key: 'description',
        header: tm('rprColDescription') || 'Açıklama',
        size: 200,
        cell: (r) => (
          <span className="block max-w-[200px] truncate" title={r.description}>
            {r.description || '—'}
          </span>
        ),
      },
      {
        key: 'discount',
        header: tm('rprColDiscount') || 'İskonto',
        type: 'number',
        align: 'right',
        size: 100,
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 2, false),
        cell: (r) => formatNumber(r.discount, 2, false),
      },
      {
        key: 'collected',
        header: tm('rprColCollected') || 'Tahsil Edilen',
        type: 'number',
        align: 'right',
        size: 120,
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 2, false),
        cell: (r) => formatNumber(r.collected, 2, false),
      },
      {
        key: 'invoiceAmount',
        header: tm('rprColInvoiceAmount') || 'Fatura Tutarı',
        type: 'number',
        align: 'right',
        size: 130,
        footerSum: true,
        footerFormat: (n) => `${formatNumber(n, 2, false)} ${currency}`,
        cell: (r) => (
          <span className={`font-semibold ${r.invoiceAmount < 0 ? 'text-red-500' : ''}`}>
            {formatNumber(r.invoiceAmount, 2, false)} {currency}
          </span>
        ),
      },
      {
        key: 'loadingExpense',
        header: tm('rprColLoadingExpense') || 'Yükleme Gideri',
        type: 'number',
        align: 'right',
        size: 120,
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 2, false),
        cell: (r) => formatNumber(r.loadingExpense, 2, false),
      },
      {
        key: 'spent',
        header: tm('rprColSpent') || 'Harcanan',
        type: 'number',
        align: 'right',
        size: 110,
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 2, false),
        cell: (r) => formatNumber(r.spent, 2, false),
      },
      {
        key: 'dailyExpense',
        header: tm('rprColDailyExpense') || 'Günlük Gider',
        type: 'number',
        align: 'right',
        size: 120,
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 2, false),
        cell: (r) => formatNumber(r.dailyExpense, 2, false),
      },
      {
        key: 'profit',
        header: tm('rprColProfit') || 'Kâr',
        type: 'number',
        align: 'right',
        size: 120,
        footerSum: true,
        footerFormat: (n) => (
          <span className={n < 0 ? 'text-red-500' : 'text-emerald-600'}>
            {formatNumber(n, 2, false)} {currency}
          </span>
        ),
        cell: (r) => (
          <span className={`font-bold ${r.profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {formatNumber(r.profit, 2, false)} {currency}
          </span>
        ),
      },
    ],
    [tm, currency],
  );

  return (
    <ReportShell
      title={tm('rprEarningsByProjectTitle') || 'Kâr / Zarar (Proje Bazlı)'}
      subtitle={tm('rprEarningsByProjectSubtitle') || 'Fatura bazında kâr-zarar — VIVA SOLAR earnings'}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'kazanc_proje',
          [
            'Tarih',
            'Fatura No',
            'Müşteri',
            'Proje',
            'Kategori',
            'Açıklama',
            'İskonto',
            'Tahsil Edilen',
            'Fatura Tutarı',
            'Yükleme Gideri',
            'Harcanan',
            'Günlük Gider',
            'Kâr',
            'İade',
          ],
          filtered.map((r) => [
            r.date,
            r.invoiceNo,
            r.customerName,
            r.projectName ?? '',
            r.category,
            r.description,
            String(r.discount),
            String(r.collected),
            String(r.invoiceAmount),
            String(r.loadingExpense),
            String(r.spent),
            String(r.dailyExpense),
            String(r.profit),
            r.isReturn ? '1' : '0',
          ]),
        )
      }
      filters={
        <div className="flex flex-wrap items-end gap-2">
          <ReportDateRangePresets
            value={dateRange}
            onChange={(next) => setDateRange(buildReportDateRangeChange(next.preset, next.monthOffset, next.from, next.to))}
            tm={tm}
          />
          <Select
            mode="multiple"
            allowClear
            style={{ minWidth: 220 }}
            placeholder={tm('rprFilterCustomer') || 'Müşteri'}
            value={cariIds}
            onChange={(v) => setCariIds(v as string[])}
            loading={cariLoading}
            options={cariOptions}
            maxTagCount="responsive"
          />
          <Select
            allowClear
            style={{ minWidth: 160 }}
            placeholder={tm('rprFilterCategory') || 'Kategori'}
            value={category}
            onChange={(v) => setCategory(v as string | undefined)}
            options={categories.map((c) => ({ label: c, value: c }))}
          />
        </div>
      }
    >
      <div className={`rounded-lg border p-2 ${tableCls}`}>
        {filtered.length === 0 && !loading ? (
          <div className="px-3 py-8 text-center opacity-60">{tm('erpNoRows') || 'Veri yok'}</div>
        ) : (
          <ReportColumnTable
            data={filtered}
            columns={tableColumns}
            height={560}
            footerLabel={tm('rprTotal') || 'TOPLAM'}
          />
        )}
      </div>
    </ReportShell>
  );
}
