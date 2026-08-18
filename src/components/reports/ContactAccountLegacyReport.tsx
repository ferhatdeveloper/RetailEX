/**
 * VIVA SOLAR — `OLD CUSTOMER` sayfası karşılığı.
 * Eski müşteriler / devam eden alacaklar — cari bazında geçmiş fatura hareketleri.
 * Mevcut `ErpCoreReports.tsx` mimarisiyle aynı kalıp.
 *
 * Mali denetim notu:
 *  - `totalAmount` = miktar × alış fiyatı düzeltmeli; Excel dosyasındaki "counter money"
 *    (Karşılık Parası) müşterinin ödediği / bakiyeye aktarılan tutarı temsil eder.
 *  - `remainingBalance` = totalAmount - collected (iade ise ters işaret).
 *  - Cari türü 'customer' olmalı; supplier verisi bu rapora dahil edilmemeli.
 *  - Fiyat aralığı (priceMin/Max) alış fiyatı üzerinden uygulanır, satış fiyatı değil.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { InputNumber, Select } from 'antd';
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
import { erpReportsAPI } from '../../services/api/erpReports';
import { supplierAPI } from '../../services/api/suppliers';
import type { Supplier } from '../../core/types';

type SelectOption = { value: string; label: string };

export interface ContactAccountLegacyRow {
  id: string;
  date: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  group: string;
  subGroup: string;
  productName: string;
  exitQuantity: number;
  purchasePrice: number;
  discount: number;
  counterMoney: number;
  totalAmount: number;
  remainingBalance: number;
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

const MOCK_GROUPS: string[] = ['SOLAR', 'INVERTER', 'BATTERY', 'MOUNTING', 'CABLE'];

export function ContactAccountLegacyReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();

  const [dateRange, setDateRange] = useState<ReportDateRangeValue>(() => defaultReportDateRange('lastMonth'));
  const [cariIds, setCariIds] = useState<string[]>([]);
  const [cariOptions, setCariOptions] = useState<SelectOption[]>([]);
  const [cariLoading, setCariLoading] = useState(false);
  const [productGroup, setProductGroup] = useState<string | undefined>(undefined);
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [rows, setRows] = useState<ContactAccountLegacyRow[]>([]);
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
        console.error('[ContactAccountLegacyReport] cari load failed', err);
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
      const raw = await erpReportsAPI.getContactAccountLegacy({
        from: dateRange.from,
        to: dateRange.to,
        cariIds: cariIds.length > 0 ? cariIds : undefined,
      });
      const data = (Array.isArray(raw) ? raw : []) as unknown as ContactAccountLegacyRow[];
      setRows(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ContactAccountLegacyReport]', err);
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
    return rows.filter((r) => {
      if (cariIds.length > 0 && !cariIds.includes(r.customerId)) return false;
      if (productGroup && r.group !== productGroup) return false;
      if (priceMin != null && r.purchasePrice < priceMin) return false;
      if (priceMax != null && r.purchasePrice > priceMax) return false;
      return true;
    });
  }, [rows, cariIds, productGroup, priceMin, priceMax]);

  const totals = useMemo(() => {
    let total = 0;
    let remaining = 0;
    let qty = 0;
    for (const r of filtered) {
      total += r.totalAmount;
      remaining += r.remainingBalance;
      qty += r.exitQuantity;
    }
    return { total, remaining, qty };
  }, [filtered]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const tfootCls = darkMode ? 'bg-gray-900/80 text-gray-100' : 'bg-gray-100 text-gray-900';

  return (
    <ReportShell
      title={tm('rprContactLegacyTitle') || 'Eski Müşteriler / Devam Eden Alacaklar'}
      subtitle={tm('rprContactLegacySubtitle') || 'VIVA SOLAR OLD CUSTOMER — kalan bakiye listesi'}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'eski_musteri_alacak',
          [
            'Tarih', 'ID', 'Cari', 'Grup', 'Alt Grup', 'Ürün', 'Çıkış Miktar',
            'Alış Fiyatı', 'İskonto', 'Karşılık Parası', 'Toplam', 'Kalan Bakiye',
          ],
          filtered.map((r) => [
            r.date,
            r.invoiceNo,
            r.customerName,
            r.group,
            r.subGroup,
            r.productName,
            String(r.exitQuantity),
            String(r.purchasePrice),
            String(r.discount),
            String(r.counterMoney),
            String(r.totalAmount),
            String(r.remainingBalance),
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
            showSearch
            optionFilterProp="label"
            loading={cariLoading}
            style={{ minWidth: 220 }}
            placeholder={tm('rprFilterCustomer') || 'Cari'}
            value={cariIds}
            onChange={(v) => setCariIds(v as string[])}
            options={cariOptions}
            maxTagCount="responsive"
          />
          <Select
            allowClear
            style={{ minWidth: 160 }}
            placeholder={tm('rprFilterProductGroup') || 'Ürün Grubu'}
            value={productGroup}
            onChange={(v) => setProductGroup(v as string | undefined)}
            options={MOCK_GROUPS.map((g) => ({ label: g, value: g }))}
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">
              {tm('rprFilterPriceMin') || 'Min Fiyat'}
            </span>
            <InputNumber
              value={priceMin ?? undefined}
              onChange={(v) => setPriceMin(v == null ? null : Number(v))}
              placeholder="0"
              min={0}
              style={{ width: 130 }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">
              {tm('rprFilterPriceMax') || 'Max Fiyat'}
            </span>
            <InputNumber
              value={priceMax ?? undefined}
              onChange={(v) => setPriceMax(v == null ? null : Number(v))}
              placeholder="∞"
              min={0}
              style={{ width: 130 }}
            />
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColTotalAmount') || 'Toplam Tutar'}</p>
          <p className="text-xl font-bold text-blue-600">
            {formatNumber(totals.total, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColRemainingBalance') || 'Kalan Bakiye'}</p>
          <p className={`text-xl font-bold ${totals.remaining > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {formatNumber(totals.remaining, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColExitQuantity') || 'Çıkış Miktar'}</p>
          <p className="text-xl font-bold">{formatNumber(totals.qty, 2, false)}</p>
        </div>
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[600px] ${tableCls}`}>
        <table className="w-full min-w-[1100px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('rprColDate') || 'Tarih'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColInvoiceNo') || 'ID'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColCustomer') || 'Cari'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColGroup') || 'Grup'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColSubGroup') || 'Alt Grup'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColProduct') || 'Ürün'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColExitQuantity') || 'Çıkış Miktar'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColPurchasePrice') || 'Alış Fiyatı'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColDiscount') || 'İskonto'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColCounterMoney') || 'Karşılık Parası'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColTotal') || 'Toplam'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColRemainingBalance') || 'Kalan Bakiye'}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center opacity-60">
                  {tm('erpNoRows') || 'Veri yok'}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.invoiceNo}</td>
                <td className="px-3 py-2">{r.customerName}</td>
                <td className="px-3 py-2">
                  <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {r.group}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{r.subGroup}</td>
                <td className="px-3 py-2 max-w-[260px] truncate" title={r.productName}>
                  {r.productName}
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(r.exitQuantity, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.purchasePrice, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.discount, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.counterMoney, 2, false)}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatNumber(r.totalAmount, 2, false)} {currency}
                </td>
                <td className={`px-3 py-2 text-right font-bold ${r.remainingBalance > 0 ? 'text-red-500' : ''}`}>
                  {formatNumber(r.remainingBalance, 2, false)} {currency}
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
                <td className="px-3 py-2 text-right">{formatNumber(totals.qty, 2, false)}</td>
                <td className="px-3 py-2" colSpan={3} />
                <td className="px-3 py-2 text-right">{formatNumber(totals.total, 2, false)}</td>
                <td className={`px-3 py-2 text-right ${totals.remaining > 0 ? 'text-red-500' : ''}`}>
                  {formatNumber(totals.remaining, 2, false)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportShell>
  );
}
