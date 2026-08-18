/**
 * VIVA SOLAR — `personel` sayfası karşılığı.
 * PDKS / Personel yoklama — ay içi günlere göre geliş tablosu (1=var, 0=yok, null=veri yok).
 * Mevcut `ErpCoreReports.tsx` mimarisiyle aynı kalıp.
 *
 * Mali denetim notu:
 *  - `salary` = aylık brüt maaş (sabit); Toplam Maaş = (totalDays / monthDays) * salary.
 *  - `extraPayment` = fazla mesai / prim / ikramiye; Brüt Hak = Toplam Maaş + extra.
 *  - Yıl/ay filtresi tek tablo gösterir; birden fazla ay seçilmez.
 *  - "1" (var) → maaş gün sayısına +1; "0" (yok) → hak kazanmaz.
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
import { erpReportsAPI } from '../../services/api/erpReports';

export type AttendanceStatus = 1 | 0 | null;

export interface StaffAttendanceRow {
  staffId: string;
  staffName: string;
  department: string;
  salary: number;
  /** index 0 = 1. gün, index 30 = 31. gün */
  days: AttendanceStatus[];
  extraPayment: number;
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

const MOCK_STAFF: { id: string; name: string; department: string; salary: number }[] = [
  { id: 's-01', name: 'AHMET YILMAZ', department: 'DEPO', salary: 850 },
  { id: 's-02', name: 'AYŞE KARACA', department: 'MUHASEBE', salary: 1100 },
  { id: 's-03', name: 'MAHMOOD RAMADAN', department: 'SAHA', salary: 950 },
  { id: 's-04', name: 'BERIVAN ALI', department: 'SAHA', salary: 900 },
  { id: 's-05', name: 'JOHN DOE', department: 'YÖNETİM', salary: 1500 },
  { id: 's-06', name: 'HAZAL ÇELİK', department: 'PAZARLAMA', salary: 980 },
];

const MOCK_DEPARTMENTS: string[] = ['DEPO', 'MUHASEBE', 'SAHA', 'YÖNETİM', 'PAZARLAMA'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildMockAttendance(year: number, month: number): StaffAttendanceRow[] {
  const days = getDaysInMonth(year, month);
  const pad = (n: number) => String(n).padStart(2, '0');

  const random = (seed: number) => {
    // deterministik mock: seed karıştırıcı
    let x = seed;
    return () => {
      x = (x * 9301 + 49297) % 233280;
      return x / 233280;
    };
  };

  return MOCK_STAFF.map((s, idx) => {
    const r = random(idx * 7 + month * 31 + year);
    const dayArr: AttendanceStatus[] = [];
    for (let d = 1; d <= 31; d++) {
      if (d > days) {
        dayArr.push(null);
      } else {
        const v = r();
        dayArr.push(v > 0.18 ? 1 : 0);
      }
    }
    return {
      staffId: s.id,
      staffName: s.name,
      department: s.department,
      salary: s.salary,
      days: dayArr,
      extraPayment: idx % 3 === 0 ? 50 : 0,
    };
  });
}

export function StaffAttendanceReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [department, setDepartment] = useState<string | undefined>(undefined);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [rows, setRows] = useState<StaffAttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: erpReportsAPI.staffAttendance
      const data = buildMockAttendance(year, month);
      setRows(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[StaffAttendanceReport]', err);
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (department && r.department !== department) return false;
      if (staffIds.length > 0 && !staffIds.includes(r.staffId)) return false;
      return true;
    });
  }, [rows, department, staffIds]);

  const enriched = useMemo(() => {
    return filtered.map((r) => {
      const totalDays = r.days.slice(0, daysInMonth).filter((d) => d === 1).length;
      const salaryPerDay = r.salary / daysInMonth;
      const totalSalary = totalDays * salaryPerDay;
      const gross = totalSalary + r.extraPayment;
      return { ...r, totalDays, totalSalary, gross };
    });
  }, [filtered, daysInMonth]);

  // Her gün için kaç kişi geldi
  const perDayCounts = useMemo(() => {
    const counts = new Array(31).fill(0);
    for (const r of filtered) {
      for (let d = 0; d < daysInMonth; d++) {
        if (r.days[d] === 1) counts[d] += 1;
      }
    }
    return counts;
  }, [filtered, daysInMonth]);

  const footer = useMemo(() => {
    let totalDays = 0;
    let totalSalary = 0;
    let totalExtra = 0;
    let totalGross = 0;
    for (const r of enriched) {
      totalDays += r.totalDays;
      totalSalary += r.totalSalary;
      totalExtra += r.extraPayment;
      totalGross += r.gross;
    }
    return { totalDays, totalSalary, totalExtra, totalGross };
  }, [enriched]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const tfootCls = darkMode ? 'bg-gray-900/80 text-gray-100' : 'bg-gray-100 text-gray-900';

  const cellCls = (status: AttendanceStatus): string => {
    if (status === 1) return 'bg-emerald-500 text-white';
    if (status === 0) return 'bg-red-500 text-white';
    return darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400';
  };

  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = cur - 5; y <= cur + 1; y++) arr.push(y);
    return arr;
  }, []);

  const monthOptions = useMemo(
    () => [
      { label: tm('rprMonthJan') || 'Ocak', value: 1 },
      { label: tm('rprMonthFeb') || 'Şubat', value: 2 },
      { label: tm('rprMonthMar') || 'Mart', value: 3 },
      { label: tm('rprMonthApr') || 'Nisan', value: 4 },
      { label: tm('rprMonthMay') || 'Mayıs', value: 5 },
      { label: tm('rprMonthJun') || 'Haziran', value: 6 },
      { label: tm('rprMonthJul') || 'Temmuz', value: 7 },
      { label: tm('rprMonthAug') || 'Ağustos', value: 8 },
      { label: tm('rprMonthSep') || 'Eylül', value: 9 },
      { label: tm('rprMonthOct') || 'Ekim', value: 10 },
      { label: tm('rprMonthNov') || 'Kasım', value: 11 },
      { label: tm('rprMonthDec') || 'Aralık', value: 12 },
    ],
    [tm],
  );

  return (
    <ReportShell
      title={tm('rprStaffAttendanceTitle') || 'PDKS — Personel Yoklama'}
      subtitle={tm('rprStaffAttendanceSubtitle') || 'Aylık geliş tablosu — VIVA SOLAR personel'}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() => {
        const header = ['No', 'İsim', 'Departman', 'Maaş'];
        for (let d = 1; d <= 31; d++) header.push(`Gün ${d}`);
        header.push('Toplam Gün', 'Toplam Maaş', 'Ek Ödeme', 'Brüt Hak');
        const out = enriched.map((r, i) => {
          const row: string[] = [String(i + 1), r.staffName, r.department, String(r.salary)];
          for (let d = 0; d < 31; d++) {
            row.push(r.days[d] == null ? '' : String(r.days[d]));
          }
          row.push(String(r.totalDays), String(r.totalSalary), String(r.extraPayment), String(r.gross));
          return row;
        });
        exportCsv(`pdks_${year}_${String(month).padStart(2, '0')}`, header, out);
      }}
      filters={
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">{tm('rprYear') || 'Yıl'}</span>
            <Select
              value={year}
              onChange={(v) => setYear(Number(v))}
              style={{ width: 110 }}
              options={yearOptions.map((y) => ({ label: String(y), value: y }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">{tm('rprMonth') || 'Ay'}</span>
            <Select
              value={month}
              onChange={(v) => setMonth(Number(v))}
              style={{ width: 130 }}
              options={monthOptions}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">{tm('rprDepartment') || 'Departman'}</span>
            <Select
              allowClear
              value={department}
              onChange={(v) => setDepartment(v as string | undefined)}
              style={{ width: 170 }}
              options={MOCK_DEPARTMENTS.map((d) => ({ label: d, value: d }))}
            />
          </div>
          <Select
            mode="multiple"
            allowClear
            style={{ minWidth: 220 }}
            placeholder={tm('rprFilterStaff') || 'Personel'}
            value={staffIds}
            onChange={(v) => setStaffIds(v as string[])}
            options={MOCK_STAFF.map((s) => ({ label: s.name, value: s.id }))}
            maxTagCount="responsive"
          />
        </div>
      }
    >
      <div className={`overflow-auto rounded-lg border max-h-[640px] ${tableCls}`}>
        <table className="w-full text-xs" style={{ minWidth: 1200 }}>
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-2 py-2 text-left">{tm('rprColNo') || 'No'}</th>
              <th className="px-2 py-2 text-left">{tm('rprColStaffName') || 'İsim'}</th>
              <th className="px-2 py-2 text-left">{tm('rprColDepartment') || 'Departman'}</th>
              <th className="px-2 py-2 text-right">{tm('rprColSalary') || 'Maaş'}</th>
              {Array.from({ length: 31 }).map((_, i) => (
                <th key={i} className="px-1 py-2 text-center w-7">
                  {i + 1}
                </th>
              ))}
              <th className="px-2 py-2 text-right">{tm('rprColTotalDays') || 'Toplam Gün'}</th>
              <th className="px-2 py-2 text-right">{tm('rprColTotalSalary') || 'Toplam Maaş'}</th>
              <th className="px-2 py-2 text-right">{tm('rprColExtraPayment') || 'Ek Ödemeler'}</th>
              <th className="px-2 py-2 text-right">{tm('rprColGross') || 'Brüt Hak'}</th>
            </tr>
          </thead>
          <tbody>
            {enriched.length === 0 && !loading && (
              <tr>
                <td colSpan={38} className="px-3 py-8 text-center opacity-60">
                  {tm('erpNoRows') || 'Veri yok'}
                </td>
              </tr>
            )}
            {enriched.map((r, idx) => (
              <tr key={r.staffId} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-2 py-2">{idx + 1}</td>
                <td className="px-2 py-2 font-medium whitespace-nowrap">{r.staffName}</td>
                <td className="px-2 py-2 text-xs">{r.department}</td>
                <td className="px-2 py-2 text-right">{formatNumber(r.salary, 2, false)}</td>
                {r.days.map((d, i) => (
                  <td key={i} className={`px-1 py-1 text-center w-7 ${cellCls(d)}`}>
                    {d == null ? '' : d}
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-bold">{r.totalDays}</td>
                <td className="px-2 py-2 text-right">{formatNumber(r.totalSalary, 2, false)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(r.extraPayment, 2, false)}</td>
                <td className="px-2 py-2 text-right font-bold text-blue-600">
                  {formatNumber(r.gross, 2, false)} {currency}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={`font-bold ${tfootCls}`}>
              <td className="px-2 py-2" colSpan={3}>
                {tm('rprDailyPresence') || 'Günlük Gelen'}
              </td>
              <td className="px-2 py-2 text-right">
                {enriched.length} {tm('rprPerson') || 'kişi'}
              </td>
              {perDayCounts.map((c, i) => (
                <td key={i} className="px-1 py-2 text-center w-7 text-[10px]">
                  {i < daysInMonth ? c : ''}
                </td>
              ))}
              <td className="px-2 py-2 text-right">{footer.totalDays}</td>
              <td className="px-2 py-2 text-right">{formatNumber(footer.totalSalary, 2, false)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(footer.totalExtra, 2, false)}</td>
              <td className="px-2 py-2 text-right text-blue-600">
                {formatNumber(footer.totalGross, 2, false)} {currency}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportShell>
  );
}
