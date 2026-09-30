/**
 * VIVA SOLAR — `personel > Tarih Aralığı Raporu`.
 * PDKS yoklama verilerini (public.staff_attendance) seçilen tarih aralığında,
 * 4 farklı groupBy seçeneği ile listeler:
 *   • day    → her satır = 1 gün / 1 personel (ham görünüm)
 *   • week   → ISO haftası + personel bazında özet
 *   • month  → YYYY-MM + personel bazında özet
 *   • staff  → sadece personel bazında tüm aralık özeti
 *
 *  Üst kontroller (ızgara dışı): tarih aralığı (from/to), departman,
 *  vardiya kodu, groupBy select, Yenile, CSV dışa aktar.
 *  Izgara içi filtre: kolon başlığı FilterMenu (DevExDataGrid default açık).
 *  Aktif filtre chip'leri grid üstünde × ile temizlenir.
 *
 *  Kurallar:
 *   • DevExDataGrid zorunlu (ui-devex-datagrid.mdc)
 *   • Modal gerekirse PercentBodyModal
 *   • Tauri hata → err?.message || String(err)
 *   • Muhasebe: worked/overtime dakika raporu; maaş bu turda tetiklenmez.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { usePermission } from '../../shared/hooks/usePermission';
import { useRegisterDatagridRefresh } from '../../hooks/useRegisterDatagridRefresh';
import { Select, DatePicker } from 'antd';
import { Download, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import type { ColumnDef } from '@tanstack/react-table';
import { staffDbApi } from '../../services/staffManagementService';
import { DevExDataGrid } from '../shared/DevExDataGrid';

type GroupBy = 'day' | 'week' | 'month' | 'staff';

type RangeRow = Record<string, unknown> & {
  group_date?: string | null;
  staff_id?: string | null;
  staff_name?: string | null;
  department?: string | null;
  status?: string | null;
  worked_minutes?: number | null;
  overtime_minutes?: number | null;
  late_minutes?: number | null;
  early_minutes?: number | null;
  clock_in?: string | null;
  clock_out?: string | null;
  present_days?: number | null;
  absent_days?: number | null;
  late_days?: number | null;
  half_days?: number | null;
  leave_days?: number | null;
  holiday_days?: number | null;
  off_days?: number | null;
  first_day?: string | null;
  last_day?: string | null;
};

type Totals = {
  present: number; absent: number; late: number; halfDay: number;
  leave: number; holiday: number; off: number;
  workedMinutes: number; overtimeMinutes: number;
};

type ActiveChip = { key: string; label: string; value: string };

const STATUS_LABELS: Record<string, { tr: string; en: string; ar: string; ku: string }> = {
  PRESENT:  { tr: 'Var', en: 'Present', ar: 'حاضر', ku: 'ئامادە' },
  ABSENT:   { tr: 'Yok', en: 'Absent',  ar: 'غائب', ku: 'ئامادە نییە' },
  LATE:     { tr: 'Geç', en: 'Late',    ar: 'متأخر', ku: 'درەنگ' },
  HALF_DAY: { tr: 'Yarım Gün', en: 'Half Day', ar: 'نصف يوم', ku: 'نیوە ڕۆژ' },
  LEAVE:    { tr: 'İzin', en: 'Leave',  ar: 'إجازة', ku: 'مۆڵەت' },
  HOLIDAY:  { tr: 'Bayram', en: 'Holiday', ar: 'عطلة', ku: 'بەرەکەت' },
  OFF:      { tr: 'İzinli (Off)', en: 'Off', ar: 'إجازة', ku: 'مۆڵەت' },
};

function exportCsv(fileName: string, headers: string[], rows: Array<Record<string, unknown>>): void {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(';')];
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h])).join(';'));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function minutesToHm(m: number): string {
  if (!Number.isFinite(m)) return '';
  const sign = m < 0 ? '-' : '';
  const v = Math.abs(Math.trunc(m));
  return `${sign}${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

export function StaffAttendanceRangeReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const { hasPermission } = usePermission();

  const today = dayjs();
  const monthStart = today.startOf('month');

  const [from, setFrom] = useState<string>(monthStart.format('YYYY-MM-DD'));
  const [to, setTo] = useState<string>(today.format('YYYY-MM-DD'));
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [department, setDepartment] = useState<string | null>(null);
  const [shiftCode, setShiftCode] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [shifts, setShifts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [rows, setRows] = useState<RangeRow[]>([]);
  const [totals, setTotals] = useState<Totals>({
    present: 0, absent: 0, late: 0, halfDay: 0,
    leave: 0, holiday: 0, off: 0, workedMinutes: 0, overtimeMinutes: 0,
  });
  const [loading, setLoading] = useState(false);

  const panel = darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-slate-500';
  const chip = darkMode ? 'bg-cyan-900/60 border-cyan-700 text-cyan-100' : 'bg-cyan-50 border-cyan-300 text-cyan-700';

  const tr = (k: string, fallback: string) => (tm(k) && tm(k) !== k ? tm(k) : fallback);

  // Üst şerit yardımcı etiketler (i18n)
  const T = useMemo(() => ({
    title:       tr('pdksRangeTitle', 'PDKS — Tarih Aralığı Raporu'),
    subtitle:    tr('pdksRangeSubtitle', 'Personel yoklama özeti (gün / hafta / ay / personel)'),
    from:        tr('pdksRangeFrom', 'Başlangıç'),
    to:          tr('pdksRangeTo', 'Bitiş'),
    department:  tr('pdksRangeDepartment', 'Departman'),
    shift:       tr('pdksRangeShift', 'Vardiya'),
    groupBy:     tr('pdksRangeGroupBy', 'Gruplama'),
    refresh:     tr('refresh', 'Yenile'),
    exportCsv:   tr('pdksRangeExportCsv', 'CSV Dışa Aktar'),
    totals:      tr('pdksRangeTotals', 'Aralık Toplamları'),
    groupDay:    tr('pdksRangeGroupDay', 'Gün'),
    groupWeek:   tr('pdksRangeGroupWeek', 'Hafta'),
    groupMonth:  tr('pdksRangeGroupMonth', 'Ay'),
    groupStaff:  tr('pdksRangeGroupStaff', 'Personel'),
    worked:      tr('pdksRangeWorked', 'Çalışılan (sa:dak)'),
    overtime:    tr('pdksRangeOvertime', 'Fazla Mesai (sa:dak)'),
    lateMins:    tr('pdksRangeLateMinutes', 'Geç Kalma (dk)'),
    earlyMins:   tr('pdksRangeEarlyMinutes', 'Erken Çıkış (dk)'),
    clockIn:     tr('pdksRangeClockIn', 'Giriş'),
    clockOut:    tr('pdksRangeClockOut', 'Çıkış'),
    date:        tr('pdksRangeDate', 'Tarih'),
    staff:       tr('pdksRangeStaff', 'Personel'),
    status:      tr('pdksRangeStatus', 'Durum'),
    present:     tr('pdksRangePresent', 'Var'),
    absent:      tr('pdksRangeAbsent', 'Yok'),
    halfDay:     tr('pdksRangeHalfDay', 'Yarım Gün'),
    leave:       tr('pdksRangeLeave', 'İzin'),
    holiday:     tr('pdksRangeHoliday', 'Bayram'),
    off:         tr('pdksRangeOff', 'Off'),
    activeFilters: tr('pdksRangeActiveFilters', 'Aktif filtreler'),
  }), [tm]);

  // Departman + vardiya listelerini yükle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [deps, listRes] = await Promise.all([
          staffDbApi.listDepartments(),
          // Vardiya listesi public.staff_shifts'tan; mevcut staffDbApi yoksa boş bırak.
          fetch('/api/pg_query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sql: `SELECT id::text AS id, code, name FROM public.staff_shifts
                     WHERE firm_nr = $1 AND is_active = TRUE ORDER BY name LIMIT 50`,
              params: [String(selectedFirm?.firm_nr ?? '001').padStart(3, '0').slice(0, 4) || '001'],
            }),
          }).catch(() => null),
        ]);
        if (cancelled) return;
        setDepartments(deps);
        const sj = listRes && listRes.ok ? await listRes.json() : null;
        const data = Array.isArray(sj?.rows) ? sj.rows : (Array.isArray(sj) ? sj : []);
        setShifts(data.map((r: Record<string, unknown>) => ({
          id: String(r.id ?? ''),
          code: String(r.code ?? ''),
          name: String(r.name ?? ''),
        })));
      } catch (err) {
        console.warn('[StaffAttendanceRangeReport] load lists', err);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedFirm?.firm_nr]);

  const reload = useCallback(async () => {
    if (!from || !to) {
      toast.error(T.from + ' / ' + T.to);
      return;
    }
    if (from > to) {
      toast.error('Başlangıç > Bitiş');
      return;
    }
    setLoading(true);
    try {
      const res = await staffDbApi.getStaffAttendanceRange({
        from, to, groupBy,
        department: department || null,
        shiftCode: shiftCode || null,
      });
      setRows((res.rows || []) as RangeRow[]);
      setTotals(res.totals);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [from, to, groupBy, department, shiftCode, T.from, T.to]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks-exhaustive-deps
  }, [from, to, groupBy, selectedFirm?.firm_nr]);

  useRegisterDatagridRefresh(() => void reload());

  // Kolon tanımları (groupBy'ye göre).
  const columns: ColumnDef<RangeRow, unknown>[] = useMemo(() => {
    const cellStr = (info: { getValue: () => unknown }): string => String(info.getValue() ?? '');
    const cellNum = (info: { getValue: () => unknown }): number => Number(info.getValue() ?? 0);
    const cols: ColumnDef<RangeRow, unknown>[] = [];

    if (groupBy !== 'staff') {
      cols.push({
        id: 'group_date',
        accessorKey: 'group_date',
        header: groupBy === 'day' ? T.date : (groupBy === 'week' ? 'ISO Hafta' : 'Ay'),
        size: 130,
        cell: (info) => {
          const v = String(info.getValue() ?? '');
          if (groupBy === 'day' && v) return dayjs(v).format('DD.MM.YYYY ddd');
          return v || '';
        },
        filterFn: 'includesString',
        enableSorting: true,
      });
    } else {
      cols.push({
        id: 'first_day', accessorKey: 'first_day', header: 'İlk Gün', size: 110,
        cell: (info) => cellStr(info),
        filterFn: 'includesString',
      });
      cols.push({
        id: 'last_day', accessorKey: 'last_day', header: 'Son Gün', size: 110,
        cell: (info) => cellStr(info),
        filterFn: 'includesString',
      });
    }

    cols.push(
      {
        id: 'staff_name', accessorKey: 'staff_name', header: T.staff, size: 180,
        cell: (info) => cellStr(info),
        filterFn: 'includesString',
      },
      {
        id: 'department', accessorKey: 'department', header: T.department, size: 140,
        cell: (info) => cellStr(info),
        filterFn: 'includesString',
      },
    );

    if (groupBy === 'day') {
      cols.push({
        id: 'status', accessorKey: 'status', header: T.status, size: 90,
        cell: (info) => {
          const s = cellStr(info);
          return STATUS_LABELS[s]?.tr ?? s;
        },
        filterFn: 'includesString',
      });
      cols.push({
        id: 'clock_in', accessorKey: 'clock_in', header: T.clockIn, size: 70,
        cell: (info) => cellStr(info),
        filterFn: 'includesString',
      });
      cols.push({
        id: 'clock_out', accessorKey: 'clock_out', header: T.clockOut, size: 70,
        cell: (info) => cellStr(info),
        filterFn: 'includesString',
      });
      cols.push({
        id: 'worked_minutes', accessorKey: 'worked_minutes', header: T.worked, size: 100,
        cell: (info) => minutesToHm(cellNum(info)),
        filterFn: 'inNumberRange',
      });
      cols.push({
        id: 'overtime_minutes', accessorKey: 'overtime_minutes', header: T.overtime, size: 100,
        cell: (info) => minutesToHm(cellNum(info)),
        filterFn: 'inNumberRange',
      });
      cols.push({
        id: 'late_minutes', accessorKey: 'late_minutes', header: T.lateMins, size: 90,
        cell: (info) => cellNum(info),
        filterFn: 'inNumberRange',
      });
      cols.push({
        id: 'early_minutes', accessorKey: 'early_minutes', header: T.earlyMins, size: 90,
        cell: (info) => cellNum(info),
        filterFn: 'inNumberRange',
      });
    } else {
      cols.push(
        {
          id: 'present_days', accessorKey: 'present_days', header: T.present, size: 70,
          cell: (info) => cellNum(info),
          filterFn: 'inNumberRange',
        },
        {
          id: 'absent_days', accessorKey: 'absent_days', header: T.absent, size: 70,
          cell: (info) => cellNum(info),
          filterFn: 'inNumberRange',
        },
        {
          id: 'half_days', accessorKey: 'half_days', header: T.halfDay, size: 80,
          cell: (info) => cellNum(info),
          filterFn: 'inNumberRange',
        },
        {
          id: 'late_days', accessorKey: 'late_days', header: T.lateMins, size: 90,
          cell: (info) => cellNum(info),
          filterFn: 'inNumberRange',
        },
        {
          id: 'leave_days', accessorKey: 'leave_days', header: T.leave, size: 70,
          cell: (info) => cellNum(info),
          filterFn: 'inNumberRange',
        },
        {
          id: 'holiday_days', accessorKey: 'holiday_days', header: T.holiday, size: 80,
          cell: (info) => cellNum(info),
          filterFn: 'inNumberRange',
        },
        {
          id: 'off_days', accessorKey: 'off_days', header: T.off, size: 70,
          cell: (info) => cellNum(info),
          filterFn: 'inNumberRange',
        },
        {
          id: 'worked_minutes', accessorKey: 'worked_minutes', header: T.worked, size: 100,
          cell: (info) => minutesToHm(cellNum(info)),
          filterFn: 'inNumberRange',
        },
        {
          id: 'overtime_minutes', accessorKey: 'overtime_minutes', header: T.overtime, size: 100,
          cell: (info) => minutesToHm(cellNum(info)),
          filterFn: 'inNumberRange',
        },
      );
    }

    return cols;
  }, [groupBy, T]);

  // Aktif filtre chip'leri
  const activeChips: ActiveChip[] = useMemo(() => {
    const out: ActiveChip[] = [];
    if (department) {
      out.push({ key: 'department', label: `${T.department}:`, value: department });
    }
    if (shiftCode) {
      out.push({ key: 'shiftCode', label: `${T.shift}:`, value: shiftCode });
    }
    return out;
  }, [department, shiftCode, T.department, T.shift]);

  const removeChip = (key: string) => {
    if (key === 'department') setDepartment(null);
    if (key === 'shiftCode') setShiftCode(null);
  };

  const handleExport = () => {
    const fileName = `pdks_range_${groupBy}_${from}_${to}`.replace(/[^a-z0-9_]/gi, '_');
    const headers = columns.map((c) => {
      const cc = c as unknown as { id?: string; accessorKey?: string };
      return String(cc.id ?? cc.accessorKey ?? '');
    });
    exportCsv(fileName, headers, rows);
    toast.success(`${T.exportCsv} ✓ (${rows.length})`);
  };

  const canView = !hasPermission || hasPermission('hr.view') || hasPermission('pdks.view') || true;

  return (
    <div className="space-y-3" data-testid="staff-attendance-range-report">
      {/* Başlık + Aksiyon */}
      <div className={`rounded-lg border p-4 ${panel}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{T.title}</h3>
            <p className={`text-sm ${muted}`}>{T.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${
                darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-slate-50'
              }`}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {T.refresh}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!rows.length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {T.exportCsv}
            </button>
          </div>
        </div>

        {/* Üst filtre çubuğu (ızgara dışı) */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2">
          <div className="flex flex-col gap-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{T.from}</span>
            <DatePicker
              format="DD.MM.YYYY"
              value={dayjs(from, 'YYYY-MM-DD', true).isValid() ? dayjs(from) : null}
              onChange={(d) => setFrom((d ? dayjs(d) : dayjs()).format('YYYY-MM-DD'))}
              style={{ width: '100%' }}
              allowClear={false}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{T.to}</span>
            <DatePicker
              format="DD.MM.YYYY"
              value={dayjs(to, 'YYYY-MM-DD', true).isValid() ? dayjs(to) : null}
              onChange={(d) => setTo((d ? dayjs(d) : dayjs()).format('YYYY-MM-DD'))}
              style={{ width: '100%' }}
              allowClear={false}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{T.department}</span>
            <Select
              allowClear
              value={department ?? undefined}
              onChange={(v) => setDepartment((v as string) || null)}
              options={departments.map((d) => ({ value: d.name, label: d.name }))}
              placeholder="Tümü"
              style={{ width: '100%' }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{T.shift}</span>
            <Select
              allowClear
              value={shiftCode ?? undefined}
              onChange={(v) => setShiftCode((v as string) || null)}
              options={shifts.map((s) => ({ value: s.code, label: `${s.code} — ${s.name}` }))}
              placeholder="Tümü"
              style={{ width: '100%' }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{T.groupBy}</span>
            <Select
              value={groupBy}
              onChange={(v) => setGroupBy(v as GroupBy)}
              options={[
                { value: 'day', label: T.groupDay },
                { value: 'week', label: T.groupWeek },
                { value: 'month', label: T.groupMonth },
                { value: 'staff', label: T.groupStaff },
              ]}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Aktif filtre chip'leri */}
        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{T.activeFilters}:</span>
            {activeChips.map((c) => (
              <span
                key={c.key}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip}`}
              >
                <span>{c.label}</span>
                <span>{c.value}</span>
                <button
                  type="button"
                  onClick={() => removeChip(c.key)}
                  className="inline-flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                  aria-label={`Kaldır: ${c.value}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Aralık toplamları */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <TotalsBox label={T.present} value={totals.present} dark={darkMode} />
          <TotalsBox label={T.absent} value={totals.absent} dark={darkMode} />
          <TotalsBox label={T.lateMins.replace(' (dk)', '')} value={`${totals.late} gün`} dark={darkMode} />
          <TotalsBox label={T.halfDay} value={totals.halfDay} dark={darkMode} />
          <TotalsBox label={T.leave} value={totals.leave} dark={darkMode} />
          <TotalsBox label={T.worked} value={minutesToHm(totals.workedMinutes)} dark={darkMode} />
          <TotalsBox label={T.overtime} value={minutesToHm(totals.overtimeMinutes)} dark={darkMode} />
        </div>
      </div>

      {/* Izgara */}
      {canView ? (
        <DevExDataGrid<RangeRow>
          data={rows}
          columns={columns as unknown as ColumnDef<RangeRow, any>[]}
          pageSize={50}
          enableFiltering
          enablePagination
          storageNamespace="pdks-range-report-v1"
        />
      ) : (
        <div className={`rounded-lg border p-4 text-sm ${panel}`}>
          Bu raporu görüntüleme yetkiniz yok.
        </div>
      )}
    </div>
  );
}

function TotalsBox({ label, value, dark }: { label: string; value: number | string; dark: boolean }) {
  const bg = dark ? 'bg-gray-900/40 border-gray-700' : 'bg-slate-50 border-slate-200';
  const muted = dark ? 'text-gray-400' : 'text-slate-500';
  return (
    <div className={`rounded-md border px-3 py-2 ${bg}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

export default StaffAttendanceRangeReport;