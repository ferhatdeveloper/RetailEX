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
import { DevExDataGrid } from '../shared/DevExDataGrid';
import { buildReportGridColumns, REPORT_GRID_DEFAULTS } from './shared/ReportDataGrid';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { formatNumber } from '../../utils/formatNumber';
import { getFirmLedgerCurrency, getGlobalCurrency } from '../../utils/currency';
import { getAppDefaultCurrency } from '../../services/postgres';
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
  const currency = getFirmLedgerCurrency(selectedFirm, getAppDefaultCurrency() || getGlobalCurrency());

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

  const gridColumns = useMemo(
    () =>
      buildReportGridColumns<(typeof recalculated)[number]>([
        { id: 'date', header: tm('rprColDate') || 'Tarih', filterKind: 'date', size: 110 },
        { id: 'ficheNo', header: tm('rprColFicheNo') || 'Fiş No', size: 120 },
        { id: 'sequence', header: tm('rprColSequence') || 'Sıra', align: 'right', size: 70 },
        { id: 'group', header: tm('rprColGroup') || 'Grup', size: 110 },
        { id: 'subGroup', header: tm('rprColSubGroup') || 'Alt Grup', size: 120 },
        {
          id: 'description',
          header: tm('rprColDescription') || 'Açıklama',
          size: 220,
          cell: (r) => (
            <div>
              <div className="truncate" title={r.description}>{r.description}</div>
              {r.cariName ? <div className="text-xs opacity-60">{r.cariName}</div> : null}
            </div>
          ),
        },
        {
          id: 'incoming',
          header: tm('rprColIncoming') || 'Gelen',
          align: 'right',
          size: 120,
          cell: (r) => (
            <span className="font-semibold text-emerald-600">
              {r.incoming > 0 ? formatNumber(r.incoming, 2, false) : '—'}
            </span>
          ),
        },
        {
          id: 'outgoing',
          header: tm('rprColOutgoing') || 'Giden',
          align: 'right',
          size: 120,
          cell: (r) => (
            <span className="font-semibold text-red-500">
              {r.outgoing > 0 ? formatNumber(r.outgoing, 2, false) : '—'}
            </span>
          ),
        },
        {
          id: 'cumulative',
          header: tm('rprColCumulative') || 'Kümülatif',
          align: 'right',
          size: 130,
          cell: (r) => (
            <span className={`font-bold ${r.cumulative < 0 ? 'text-red-500' : 'text-blue-600'}`}>
              {formatNumber(r.cumulative, 2, false)} {currency}
            </span>
          ),
        },
      ]),
    [tm, currency],
  );

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
      <div className="h-[560px]">
        <DevExDataGrid
          data={recalculated}
          columns={gridColumns}
          {...REPORT_GRID_DEFAULTS}
          height="100%"
          footerLabel={tm('rprTotal') || 'TOPLAM'}
          footerSumColumns={[
            {
              columnId: 'incoming',
              getValue: (r) => Number(r.incoming) || 0,
              format: (sum) => (
                <span className="text-emerald-600">{formatNumber(sum, 2, false)}</span>
              ),
            },
            {
              columnId: 'outgoing',
              getValue: (r) => Number(r.outgoing) || 0,
              format: (sum) => (
                <span className="text-red-500">{formatNumber(sum, 2, false)}</span>
              ),
            },
          ]}
        />
      </div>
    </ReportShell>
  );
}
