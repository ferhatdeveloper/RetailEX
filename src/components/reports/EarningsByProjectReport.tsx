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
import { localTodayDateKey } from '../../utils/localCalendarDate';
import {
  buildReportDateRangeChange,
  defaultReportDateRange,
  type ReportDateRangeValue,
} from '../../utils/reportDatePresets';
import { ReportDateRangePresets } from '../shared/ReportDateRangePresets';
import { erpReportsAPI, type EarningsByProjectRow } from '../../services/api/erpReports';
import { supplierAPI } from '../../services/api/suppliers';
import type { Supplier } from '../../core/types';

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

const MOCK_PROJECTS: { id: string; name: string }[] = [
  { id: 'p-100', name: 'SOLAR FARM ERBIL' },
  { id: 'p-101', name: 'DUHOK 500KW' },
  { id: 'p-102', name: 'SULAIMANI RESIDENTIAL' },
];

function buildMockEarnings(from: string, to: string): EarningsByProjectRow[] {
  // VIVA SOLAR'dan gerçekçi 5 satır.
  const today = localTodayDateKey();
  void from; void to; // TODO: gerçek API bağlandığında from/to filtreyi uygulayacak
  void today;
  return [
    {
      id: 'e-1',
      date: '2025-10-05',
      invoiceNo: 'INV-000009',
      customerId: 'c-001',
      customerName: 'MARWAN ARAM2',
      projectId: 'p-100',
      projectName: 'SOLAR FARM ERBIL',
      category: 'SOLAR',
      description: 'LONGE SOLAR PANEL 590W — 96 adet',
      discount: 150,
      collected: 12500,
      invoiceAmount: 14200,
      loadingExpense: 200,
      spent: 9050,
      dailyExpense: 180,
      profit: 14200 - 9050 - 200 - 180,
      isReturn: false,
    },
    {
      id: 'e-2',
      date: '2025-10-07',
      invoiceNo: 'INV-000011',
      customerId: 'c-002',
      customerName: 'BLACKOUT SOLAR',
      projectId: 'p-101',
      projectName: 'DUHOK 500KW',
      category: 'INVERTER',
      description: 'HUAWEI SUN2000-100KTL — 4 adet',
      discount: 0,
      collected: 8200,
      invoiceAmount: 8800,
      loadingExpense: 350,
      spent: 6200,
      dailyExpense: 220,
      profit: 8800 - 6200 - 350 - 220,
      isReturn: false,
    },
    {
      id: 'e-3',
      date: '2025-10-10',
      invoiceNo: 'INV-000012',
      customerId: 'c-003',
      customerName: 'KURDISTAN ELECTRIC',
      projectId: 'p-102',
      projectName: 'SULAIMANI RESIDENTIAL',
      category: 'BATTERY',
      description: 'LITHIUM 10KWH — 6 adet',
      discount: 250,
      collected: 0,
      invoiceAmount: 6900,
      loadingExpense: 150,
      spent: 4200,
      dailyExpense: 120,
      profit: 6900 - 4200 - 150 - 120,
      isReturn: false,
    },
    {
      id: 'e-4',
      date: '2025-10-14',
      invoiceNo: 'INV-000014',
      customerId: 'c-001',
      customerName: 'MARWAN ARAM2',
      projectId: 'p-100',
      projectName: 'SOLAR FARM ERBIL',
      category: 'MOUNTING',
      description: 'ALÜMİNYUM RAY 2.1M — 200 adet',
      discount: 0,
      collected: 4500,
      invoiceAmount: 4500,
      loadingExpense: 100,
      spent: 3100,
      dailyExpense: 90,
      profit: 4500 - 3100 - 100 - 90,
      isReturn: false,
    },
    {
      id: 'e-5',
      date: '2025-10-18',
      invoiceNo: 'INV-000017',
      customerId: 'c-004',
      customerName: 'ERBIL ENERGY',
      projectId: 'p-101',
      projectName: 'DUHOK 500KW',
      category: 'RETURN',
      description: 'JINKO PANEL — iade (hasarlı sevkiyat)',
      discount: 0,
      collected: 0,
      invoiceAmount: -2200,
      loadingExpense: 80,
      spent: 1850,
      dailyExpense: 0,
      profit: -2200 - 1850 - 80 - 0,
      isReturn: true,
    },
  ];
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
      // TODO: gerçek API bağlantısı
      // const data = await erpReportsAPI.earningsByProject({
      //   from: dateRange.from,
      //   to: dateRange.to,
      //   cariIds,
      //   projectId,
      //   category,
      // });
      const data = buildMockEarnings(dateRange.from, dateRange.to);
      setRows(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[EarningsByProjectReport]', err);
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to, cariIds, projectId, category]);

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

  const totals = useMemo(() => {
    let discount = 0;
    let collected = 0;
    let invoiceAmount = 0;
    let loadingExpense = 0;
    let spent = 0;
    let dailyExpense = 0;
    let profit = 0;
    for (const r of filtered) {
      discount += r.discount;
      collected += r.collected;
      invoiceAmount += r.invoiceAmount;
      loadingExpense += r.loadingExpense;
      spent += r.spent;
      dailyExpense += r.dailyExpense;
      profit += r.profit;
    }
    return { discount, collected, invoiceAmount, loadingExpense, spent, dailyExpense, profit };
  }, [filtered]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const tfootCls = darkMode ? 'bg-gray-900/80 text-gray-100' : 'bg-gray-100 text-gray-900';

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);

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
            style={{ minWidth: 200 }}
            placeholder={tm('rprFilterProject') || 'Proje'}
            value={projectId}
            onChange={(v) => setProjectId(v as string | undefined)}
            options={MOCK_PROJECTS.map((p) => ({ label: p.name, value: p.id }))}
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
      <div className={`overflow-auto rounded-lg border max-h-[600px] ${tableCls}`}>
        <table className="w-full min-w-[1100px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('rprColDate') || 'Tarih'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColInvoiceNo') || 'Fatura No'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColCustomer') || 'Müşteri'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColProject') || 'Proje'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColCategory') || 'Kategori'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColDescription') || 'Açıklama'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColDiscount') || 'İskonto'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColCollected') || 'Tahsil Edilen'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColInvoiceAmount') || 'Fatura Tutarı'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColLoadingExpense') || 'Yükleme Gideri'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColSpent') || 'Harcanan'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColDailyExpense') || 'Günlük Gider'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColProfit') || 'Kâr'}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center opacity-60">
                  {tm('erpNoRows') || 'Veri yok'}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr
                key={r.id}
                className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}
              >
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.invoiceNo}</td>
                <td className="px-3 py-2">{r.customerName}</td>
                <td className="px-3 py-2">{r.projectName ?? '—'}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded ${
                      r.isReturn
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    }`}
                  >
                    {r.category}
                  </span>
                </td>
                <td className="px-3 py-2 max-w-[260px] truncate" title={r.description}>
                  {r.description}
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(r.discount, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.collected, 2, false)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${r.invoiceAmount < 0 ? 'text-red-500' : ''}`}>
                  {formatNumber(r.invoiceAmount, 2, false)} {currency}
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(r.loadingExpense, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.spent, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.dailyExpense, 2, false)}</td>
                <td className={`px-3 py-2 text-right font-bold ${r.profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {formatNumber(r.profit, 2, false)} {currency}
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className={`font-bold ${tfootCls}`}>
                <td className="px-3 py-2" colSpan={6}>
                  {tm('rprTotal') || 'TOPLAM'}
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.discount, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.collected, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.invoiceAmount, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.loadingExpense, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.spent, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.dailyExpense, 2, false)}</td>
                <td className={`px-3 py-2 text-right ${totals.profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {formatNumber(totals.profit, 2, false)} {currency}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportShell>
  );
}
