/**
 * VIVA SOLAR — `TOTAL EXPENDITURE PER` + `total incoming` sayfaları karşılığı.
 * Kasa kümülatif bakiye (defter) — gelen/giden ve kümülatif.
 * Mevcut `ErpCoreReports.tsx` mimarisiyle aynı kalıp.
 *
 * Mali denetim notu:
 *  - `incoming` = kasa/banka giriş (cash_lines/bank_lines net pozitif).
 *  - `outgoing` = kasa/banka çıkış (cash_lines/bank_lines net negatif).
 *  - Kümülatif bakiye `vorperiode` (dönem başı) ile başlatılmalı; iade çıkışları ve
 *    düzeltme satırları çift yönlü yazılmaz.
 *  - Kategori (GASOLINE / OFFICE / PERSONEL / WAREHOUSE / INCOMING / OUT) çapraz tablo
 *    (group/subGroup) ile gruplanır; alt grup boş = ana gruptaki tüm alt gruplar.
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
import { erpReportsAPI, type CashLedgerRow, type CashLedgerGroup } from '../../services/api/erpReports';
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

const GROUP_OPTIONS: { value: CashLedgerGroup; labelKey: string }[] = [
  { value: 'GASOLINE', labelKey: 'rprCashGroupGasoline' },
  { value: 'OFFICE', labelKey: 'rprCashGroupOffice' },
  { value: 'PERSONEL', labelKey: 'rprCashGroupPersonel' },
  { value: 'WAREHOUSE', labelKey: 'rprCashGroupWarehouse' },
  { value: 'INCOMING', labelKey: 'rprCashGroupIncoming' },
  { value: 'OUT', labelKey: 'rprCashGroupOut' },
];

const MOCK_SUBGROUPS: string[] = [
  'YAKIT',
  'KIRTASIYE',
  'ELEKTRIK',
  'PERSONEL MAAS',
  'SGK',
  'DEPO',
  'NAKLIYE',
  'MUSTERI TAHSILAT',
  'TEDARIK ODEME',
];

export function CashLedgerReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();

  const [dateRange, setDateRange] = useState<ReportDateRangeValue>(() => defaultReportDateRange('month'));
  const [groups, setGroups] = useState<CashLedgerGroup[]>([]);
  const [subGroups, setSubGroups] = useState<string[]>([]);
  const [cariId, setCariId] = useState<string | undefined>(undefined);
  const [cariOptions, setCariOptions] = useState<SelectOption[]>([]);
  const [cariLoading, setCariLoading] = useState(false);
  const [rows, setRows] = useState<CashLedgerRow[]>([]);
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
        console.error('[CashLedgerReport] cari load failed', err);
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
      const data = await erpReportsAPI.getCashLedger({
        from: dateRange.from,
        to: dateRange.to,
        groups: groups.length > 0 ? groups : undefined,
        subGroups: subGroups.length > 0 ? subGroups : undefined,
        cariId: cariId || undefined,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[CashLedgerReport]', err);
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to, groups, subGroups, cariId]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (groups.length > 0 && !groups.includes(r.group)) return false;
      if (subGroups.length > 0 && !subGroups.includes(r.subGroup)) return false;
      if (cariId && r.cariId !== cariId) return false;
      return true;
    });
  }, [rows, groups, subGroups, cariId]);

  // Kümülatif bakiye, filtre uygulandıktan sonra yeniden hesaplanır.
  const recalculated = useMemo(() => {
    let running = 0;
    return filtered.map((r) => {
      running += r.incoming - r.outgoing;
      return { ...r, cumulative: running };
    });
  }, [filtered]);

  const totals = useMemo(() => {
    let incoming = 0;
    let outgoing = 0;
    for (const r of recalculated) {
      incoming += r.incoming;
      outgoing += r.outgoing;
    }
    return {
      incoming,
      outgoing,
      net: incoming - outgoing,
      finalBalance: recalculated.length > 0 ? recalculated[recalculated.length - 1].cumulative : 0,
    };
  }, [recalculated]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const tfootCls = darkMode ? 'bg-gray-900/80 text-gray-100' : 'bg-gray-100 text-gray-900';

  return (
    <ReportShell
      title={tm('rprCashLedgerTitle') || 'Kasa Defteri (Kümülatif Bakiye)'}
      subtitle={tm('rprCashLedgerSubtitle') || 'Kümülatif kasa hareketleri — VIVA SOLAR TOTAL EXPENDITURE'}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'kasa_defteri',
          ['Tarih', 'Fiş No', 'Sıra', 'Grup', 'Alt Grup', 'Açıklama', 'Cari', 'Gelen', 'Giden', 'Kümülatif'],
          recalculated.map((r) => [
            r.date,
            r.ficheNo,
            String(r.sequence),
            r.group,
            r.subGroup,
            r.description,
            r.cariName ?? '',
            String(r.incoming),
            String(r.outgoing),
            String(r.cumulative),
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
            style={{ minWidth: 200 }}
            placeholder={tm('rprFilterGroup') || 'Grup'}
            value={groups}
            onChange={(v) => setGroups(v as CashLedgerGroup[])}
            options={GROUP_OPTIONS.map((g) => ({ label: tm(g.labelKey) || g.value, value: g.value }))}
            maxTagCount="responsive"
          />
          <Select
            mode="multiple"
            allowClear
            style={{ minWidth: 200 }}
            placeholder={tm('rprFilterSubGroup') || 'Alt Grup'}
            value={subGroups}
            onChange={(v) => setSubGroups(v as string[])}
            options={MOCK_SUBGROUPS.map((s) => ({ label: s, value: s }))}
            maxTagCount="responsive"
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            loading={cariLoading}
            style={{ minWidth: 200 }}
            placeholder={tm('rprFilterCustomer') || 'Cari'}
            value={cariId}
            onChange={(v) => setCariId(v as string | undefined)}
            options={cariOptions}
          />
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColIncoming') || 'Gelen'}</p>
          <p className="text-xl font-bold text-emerald-500">
            {formatNumber(totals.incoming, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColOutgoing') || 'Giden'}</p>
          <p className="text-xl font-bold text-red-500">
            {formatNumber(totals.outgoing, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColNet') || 'Net'}</p>
          <p className={`text-xl font-bold ${totals.net < 0 ? 'text-red-500' : ''}`}>
            {formatNumber(totals.net, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('rprColFinalBalance') || 'Son Bakiye'}</p>
          <p className={`text-xl font-bold ${totals.finalBalance < 0 ? 'text-red-500' : 'text-blue-600'}`}>
            {formatNumber(totals.finalBalance, 2, false)} {currency}
          </p>
        </div>
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[600px] ${tableCls}`}>
        <table className="w-full min-w-[1000px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('rprColDate') || 'Tarih'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColFicheNo') || 'Fiş No'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColSequence') || 'Sıra'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColGroup') || 'Grup'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColSubGroup') || 'Alt Grup'}</th>
              <th className="px-3 py-2 text-left">{tm('rprColDescription') || 'Açıklama'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColIncoming') || 'Gelen'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColOutgoing') || 'Giden'}</th>
              <th className="px-3 py-2 text-right">{tm('rprColCumulative') || 'Kümülatif'}</th>
            </tr>
          </thead>
          <tbody>
            {recalculated.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center opacity-60">
                  {tm('erpNoRows') || 'Veri yok'}
                </td>
              </tr>
            )}
            {recalculated.map((r) => (
              <tr key={r.id} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.ficheNo}</td>
                <td className="px-3 py-2 text-right">{r.sequence}</td>
                <td className="px-3 py-2">
                  <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {r.group}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{r.subGroup}</td>
                <td className="px-3 py-2 max-w-[280px] truncate" title={r.description}>
                  <div>{r.description}</div>
                  {r.cariName && <div className="text-xs opacity-60">{r.cariName}</div>}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-emerald-600">
                  {r.incoming > 0 ? formatNumber(r.incoming, 2, false) : '—'}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-red-500">
                  {r.outgoing > 0 ? formatNumber(r.outgoing, 2, false) : '—'}
                </td>
                <td className={`px-3 py-2 text-right font-bold ${r.cumulative < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                  {formatNumber(r.cumulative, 2, false)} {currency}
                </td>
              </tr>
            ))}
          </tbody>
          {recalculated.length > 0 && (
            <tfoot>
              <tr className={`font-bold ${tfootCls}`}>
                <td className="px-3 py-2" colSpan={6}>
                  {tm('rprTotal') || 'TOPLAM'}
                </td>
                <td className="px-3 py-2 text-right text-emerald-600">
                  {formatNumber(totals.incoming, 2, false)}
                </td>
                <td className="px-3 py-2 text-right text-red-500">
                  {formatNumber(totals.outgoing, 2, false)}
                </td>
                <td className={`px-3 py-2 text-right ${totals.finalBalance < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                  {formatNumber(totals.finalBalance, 2, false)} {currency}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportShell>
  );
}
