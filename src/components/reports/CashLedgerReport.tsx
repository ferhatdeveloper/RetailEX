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

const MOCK_CARIS: { id: string; name: string }[] = [
  { id: 'c-001', name: 'MARWAN ARAM2' },
  { id: 'c-002', name: 'BLACKOUT SOLAR' },
  { id: 'c-003', name: 'KURDISTAN ELECTRIC' },
];

function buildMockCashLedger(): CashLedgerRow[] {
  const rows: Omit<CashLedgerRow, 'cumulative'>[] = [
    { id: 'cl-1', date: '2025-10-01', ficheNo: 'CSH-202510-001', sequence: 1, group: 'INCOMING', subGroup: 'MUSTERI TAHSILAT', description: 'MARWAN ARAM2 — fatura tahsilatı', incoming: 12500, outgoing: 0, cariId: 'c-001', cariName: 'MARWAN ARAM2' },
    { id: 'cl-2', date: '2025-10-03', ficheNo: 'CSH-202510-002', sequence: 2, group: 'GASOLINE', subGroup: 'YAKIT', description: 'SEYRAN — yakıt', incoming: 0, outgoing: 180 },
    { id: 'cl-3', date: '2025-10-05', ficheNo: 'CSH-202510-003', sequence: 3, group: 'OFFICE', subGroup: 'KIRTASIYE', description: 'Kırtasiye alımı', incoming: 0, outgoing: 95 },
    { id: 'cl-4', date: '2025-10-07', ficheNo: 'CSH-202510-004', sequence: 4, group: 'PERSONEL', subGroup: 'PERSONEL MAAS', description: 'AHMET — maaş avansı', incoming: 0, outgoing: 500 },
    { id: 'cl-5', date: '2025-10-09', ficheNo: 'CSH-202510-005', sequence: 5, group: 'INCOMING', subGroup: 'MUSTERI TAHSILAT', description: 'BLACKOUT SOLAR — banka havalesi', incoming: 8200, outgoing: 0, cariId: 'c-002', cariName: 'BLACKOUT SOLAR' },
    { id: 'cl-6', date: '2025-10-12', ficheNo: 'CSH-202510-006', sequence: 6, group: 'WAREHOUSE', subGroup: 'DEPO', description: 'Depo raf sistemi', incoming: 0, outgoing: 1200 },
    { id: 'cl-7', date: '2025-10-14', ficheNo: 'CSH-202510-007', sequence: 7, group: 'OUT', subGroup: 'TEDARIK ODEME', description: 'KURDISTAN ELECTRIC — tedarik ödeme', incoming: 0, outgoing: 4200, cariId: 'c-003', cariName: 'KURDISTAN ELECTRIC' },
    { id: 'cl-8', date: '2025-10-18', ficheNo: 'CSH-202510-008', sequence: 8, group: 'PERSONEL', subGroup: 'SGK', description: 'SGK primi', incoming: 0, outgoing: 650 },
  ];

  let running = 0;
  return rows.map((r) => {
    running += r.incoming - r.outgoing;
    return { ...r, cumulative: running };
  });
}

export function CashLedgerReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();

  const [dateRange, setDateRange] = useState<ReportDateRangeValue>(() => defaultReportDateRange('month'));
  const [groups, setGroups] = useState<CashLedgerGroup[]>([]);
  const [subGroups, setSubGroups] = useState<string[]>([]);
  const [cariId, setCariId] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<CashLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: gerçek API bağlandığında
      // const data = await erpReportsAPI.cashLedger({
      //   from: dateRange.from,
      //   to: dateRange.to,
      //   groups,
      //   subGroups,
      //   cariId,
      // });
      const data = buildMockCashLedger();
      setRows(data);
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
            style={{ minWidth: 200 }}
            placeholder={tm('rprFilterCustomer') || 'Cari'}
            value={cariId}
            onChange={(v) => setCariId(v as string | undefined)}
            options={MOCK_CARIS.map((c) => ({ label: c.name, value: c.id }))}
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
