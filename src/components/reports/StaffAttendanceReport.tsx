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
 *  - Gün hücresine tıklayınca giriş/çıkış saatleri manuel kaydedilir (staff_attendance).
 */
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useRegisterDatagridRefresh } from '../../hooks/useRegisterDatagridRefresh';
import { usePermission } from '../../shared/hooks/usePermission';
import { formatNumber } from '../../utils/formatNumber';
import { getReportingCurrency } from '../../utils/currency';
import { erpReportsAPI } from '../../services/api/erpReports';
import {
  staffDbApi,
  type StaffAttendanceStatus,
} from '../../services/staffManagementService';
import { beautyService } from '../../services/beautyService';
import { toast } from 'sonner';
import { Select } from 'antd';
import { Download, Loader2, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReportColumnTable, type ReportColumnTableCol } from './shared/ReportDataGrid';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';

type SelectOption = { value: string; label: string };

export type AttendanceStatus = 1 | 0 | null;

export interface StaffAttendanceRow {
  staffId: string;
  staffName: string;
  department: string;
  salary: number;
  /** index 0 = 1. gün, index 30 = 31. gün */
  days: AttendanceStatus[];
  clockIns?: (string | null)[];
  clockOuts?: (string | null)[];
  extraPayment: number;
}

type DayEditTarget = {
  staffId: string;
  staffName: string;
  department: string;
  dayIndex: number;
  dateStr: string;
};

/** Gün kolonları: başlık 1–31 okunabilir; filtre/grup ikonu kapalı */
const DAY_COL_SIZE = 56;
const DAY_COL_MIN = 48;

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

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function attendanceDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function emptyClockArr(len: number): (string | null)[] {
  return Array.from({ length: len }, () => null);
}

type DayEditModalProps = {
  target: DayEditTarget;
  initialStatus: AttendanceStatus;
  initialClockIn: string | null;
  initialClockOut: string | null;
  onClose: () => void;
  onSaved: () => void;
};

function DayEditModal({
  target,
  initialStatus,
  initialClockIn,
  initialClockOut,
  onClose,
  onSaved,
}: DayEditModalProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const [status, setStatus] = useState<'PRESENT' | 'ABSENT' | 'clear'>(() => {
    if (initialStatus === 0) return 'ABSENT';
    if (initialStatus === 1) return 'PRESENT';
    return 'PRESENT';
  });
  const [clockIn, setClockIn] = useState(initialClockIn || '');
  const [clockOut, setClockOut] = useState(initialClockOut || '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingDay, setLoadingDay] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingDay(true);
      try {
        const day = await staffDbApi.getDayAttendance(target.staffId, target.dateStr);
        if (cancelled || !day) return;
        if (day.status === 'ABSENT') setStatus('ABSENT');
        else if (day.status) setStatus('PRESENT');
        if (day.clockIn) setClockIn(day.clockIn);
        if (day.clockOut) setClockOut(day.clockOut);
        if (day.notes) setNotes(day.notes);
      } finally {
        if (!cancelled) setLoadingDay(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target.staffId, target.dateStr]);

  const inputCls = darkMode
    ? 'w-full px-4 py-3 border border-gray-600 rounded-2xl bg-gray-900 text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-medium'
    : 'w-full px-4 py-3 border border-slate-200 rounded-2xl bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none font-medium';
  const labelCls = darkMode
    ? 'text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block'
    : 'text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block';

  const handleSave = async () => {
    setSaving(true);
    try {
      if (status === 'clear') {
        const res = await staffDbApi.deleteDayAttendance(target.staffId, target.dateStr);
        if (!res.ok) {
          toast.error(res.error || tm('rprAttendanceSaveFail') || 'Kayıt silinemedi');
          return;
        }
        toast.success(tm('rprAttendanceCleared') || 'Gün kaydı temizlendi');
        onSaved();
        onClose();
        return;
      }
      const attStatus: StaffAttendanceStatus = status === 'ABSENT' ? 'ABSENT' : 'PRESENT';
      const res = await staffDbApi.upsertDayAttendance({
        staffId: target.staffId,
        staffName: target.staffName,
        department: target.department || null,
        attendanceDate: target.dateStr,
        status: attStatus,
        clockIn: status === 'ABSENT' ? null : clockIn || null,
        clockOut: status === 'ABSENT' ? null : clockOut || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error || tm('rprAttendanceSaveFail') || 'Kayıt başarısız');
        return;
      }
      toast.success(tm('rprAttendanceSaved') || 'Yoklama kaydedildi');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PercentBodyModal
      onClose={onClose}
      size="compact"
      ariaLabel={tm('rprAttendanceEditTitle') || 'Günlük giriş / çıkış'}
    >
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white shrink-0 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{tm('rprAttendanceEditTitle') || 'Günlük giriş / çıkış'}</h3>
          <p className="text-sm text-blue-100 mt-1">
            {target.staffName} — {target.dateStr}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 hover:bg-white/20 transition-colors"
          aria-label={tm('close') || 'Kapat'}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <PercentBodyModalScrollBody className="p-6 space-y-4">
        {loadingDay ? (
          <div className="flex items-center justify-center py-8 text-sm opacity-60">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            {tm('loading') || 'Yükleniyor…'}
          </div>
        ) : (
          <>
            <div>
              <span className={labelCls}>{tm('rprAttendanceStatus') || 'Durum'}</span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { key: 'PRESENT' as const, label: tm('rprAttendancePresent') || 'Var' },
                    { key: 'ABSENT' as const, label: tm('rprAttendanceAbsent') || 'Yok' },
                    { key: 'clear' as const, label: tm('rprAttendanceClear') || 'Temizle' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setStatus(opt.key)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold border transition-colors ${
                      status === opt.key
                        ? opt.key === 'ABSENT'
                          ? 'bg-red-600 text-white border-red-600'
                          : opt.key === 'clear'
                            ? 'bg-slate-600 text-white border-slate-600'
                            : 'bg-emerald-600 text-white border-emerald-600'
                        : darkMode
                          ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {status === 'PRESENT' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="pdks-clock-in">
                    {tm('rprAttendanceClockIn') || 'Giriş saati'}
                  </label>
                  <input
                    id="pdks-clock-in"
                    type="time"
                    value={clockIn}
                    onChange={(e) => setClockIn(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pdks-clock-out">
                    {tm('rprAttendanceClockOut') || 'Çıkış saati'}
                  </label>
                  <input
                    id="pdks-clock-out"
                    type="time"
                    value={clockOut}
                    onChange={(e) => setClockOut(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            )}
            {status !== 'clear' && (
              <div>
                <label className={labelCls} htmlFor="pdks-notes">
                  {tm('rprAttendanceNotes') || 'Not'}
                </label>
                <input
                  id="pdks-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={tm('rprAttendanceNotesPh') || 'İsteğe bağlı'}
                  className={inputCls}
                />
              </div>
            )}
          </>
        )}
      </PercentBodyModalScrollBody>
      <div
        className={`p-5 border-t flex gap-3 shrink-0 ${
          darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-slate-100 bg-slate-50/50'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className={`flex-1 rounded-2xl border-2 py-3 font-bold uppercase text-sm tracking-wider active:scale-[0.98] ${
            darkMode
              ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
              : 'border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tm('cancel') || 'İptal'}
        </button>
        <button
          type="button"
          disabled={saving || loadingDay}
          onClick={() => void handleSave()}
          className="flex-1 rounded-2xl bg-blue-600 text-white py-3 font-bold uppercase text-sm tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98]"
        >
          {saving ? (
            <span className="inline-flex items-center gap-2 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tm('saving') || 'Kaydediliyor…'}
            </span>
          ) : (
            tm('save') || 'Kaydet'
          )}
        </button>
      </div>
    </PercentBodyModal>
  );
}

export function StaffAttendanceReport({
  excelAdminOnly = false,
}: {
  /** Güzellik kabuğu / güzellik raporlarında Excel yalnızca admin */
  excelAdminOnly?: boolean;
} = {}) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const { isAdmin } = usePermission();
  const currency = getReportingCurrency();
  const canExportExcel = !excelAdminOnly || isAdmin();

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [department, setDepartment] = useState<string | undefined>(undefined);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [staffOptions, setStaffOptions] = useState<SelectOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<SelectOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [rows, setRows] = useState<StaffAttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<DayEditTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStaffLoading(true);
        // Önce yeni PDKS tablosu (public.staff), bulamazsa beauty uzmanlarından düş.
        let list: Array<Record<string, unknown>> = [];
        try {
          const fn = (selectedFirm?.firm_nr ?? '001').toString().padStart(3, '0');
          const res = await fetch('/api/pg_query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sql:
                `SELECT id::text AS id, full_name, department, base_salary ` +
                `FROM staff WHERE firm_nr = $1 AND is_active = TRUE ORDER BY full_name LIMIT 500`,
              params: [fn],
            }),
          });
          if (res.ok) {
            const json = (await res.json()) as { rows?: Array<Record<string, unknown>> };
            if (Array.isArray(json?.rows)) list = json.rows;
          }
        } catch {
          /* bridge yoksa specialist fallback'e düş */
        }
        if (!list.length) {
          const fb = await beautyService.getSpecialists();
          list = Array.isArray(fb) ? (fb as unknown as Array<Record<string, unknown>>) : [];
        }
        if (cancelled) return;
        const staffOpts: SelectOption[] = list
          .map((s) => ({
            value: String(s.id ?? s.specialist_id ?? s.code ?? ''),
            label: String(s.full_name ?? s.name ?? s.title ?? s.id ?? ''),
          }))
          .filter((o) => o.value);
        setStaffOptions(staffOpts);
        const deptSet = new Set<string>();
        for (const s of list) {
          const d = s.department ?? (s as { dept?: unknown }).dept ?? null;
          if (typeof d === 'string' && d.trim()) deptSet.add(d.trim());
        }
        setDepartmentOptions(Array.from(deptSet).sort().map((d) => ({ value: d, label: d })));
      } catch (err) {
        console.error('[StaffAttendanceReport] staff load failed', err);
        if (!cancelled) {
          setStaffOptions([]);
          setDepartmentOptions([]);
        }
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFirm?.firm_nr]);

  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await erpReportsAPI.getStaffAttendance({
        year,
        month,
        staffIds: staffIds.length > 0 ? staffIds : undefined,
      });
      let data = (Array.isArray(raw) ? raw : []) as unknown as StaffAttendanceRow[];
      // Yoklama satırı yoksa bile personel listesini tabloya yaz (boş günler).
      if (data.length === 0 && staffOptions.length > 0) {
        const dim = getDaysInMonth(year, month);
        data = staffOptions
          .filter((o) => (staffIds.length === 0 ? true : staffIds.includes(o.value)))
          .map((o) => ({
            staffId: o.value,
            staffName: o.label,
            department: '',
            salary: 0,
            days: Array.from({ length: Math.max(dim, 31) }, () => null as AttendanceStatus),
            clockIns: emptyClockArr(Math.max(dim, 31)),
            clockOuts: emptyClockArr(Math.max(dim, 31)),
            extraPayment: 0,
          }));
      }
      setRows(
        data.map((r) => ({
          ...r,
          clockIns: r.clockIns ?? emptyClockArr(31),
          clockOuts: r.clockOuts ?? emptyClockArr(31),
        })),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[StaffAttendanceReport]', err);
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [year, month, staffIds, staffOptions]);

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

  const cellCls = useCallback(
    (status: AttendanceStatus): string => {
      if (status === 1) return 'bg-emerald-500 text-white';
      if (status === 0) return 'bg-red-500 text-white';
      return darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200';
    },
    [darkMode],
  );

  const openDayEdit = useCallback(
    (row: StaffAttendanceRow, dayIndex: number) => {
      setEditTarget({
        staffId: row.staffId,
        staffName: row.staffName,
        department: row.department,
        dayIndex,
        dateStr: attendanceDateStr(year, month, dayIndex + 1),
      });
    },
    [year, month],
  );

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

  type StaffGridRow = (typeof enriched)[number] & { rowNo: number; [key: string]: unknown };

  const gridRows = useMemo((): StaffGridRow[] => {
    return enriched.map((r, i) => {
      const dayFields: Record<string, number | null> = {};
      for (let d = 0; d < daysInMonth; d++) {
        const v = r.days[d];
        dayFields[`day_${d}`] = v === 1 ? 1 : v === 0 ? 0 : null;
      }
      return { ...r, rowNo: i + 1, ...dayFields };
    });
  }, [enriched, daysInMonth]);

  const editRow = editTarget
    ? enriched.find((r) => r.staffId === editTarget.staffId) ?? null
    : null;

  const attendanceColumns = useMemo((): ReportColumnTableCol<StaffGridRow>[] => {
    const cols: ReportColumnTableCol<StaffGridRow>[] = [
      { key: 'rowNo', header: tm('rprColNo') || 'No', size: 48, minSize: 40, enableColumnFilter: false },
      { key: 'staffName', header: tm('rprColStaffName') || 'İsim', size: 160, minSize: 120 },
      { key: 'department', header: tm('rprColDepartment') || 'Departman', size: 120, minSize: 90 },
      {
        key: 'salary',
        header: tm('rprColSalary') || 'Maaş',
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: () => `${enriched.length} ${tm('rprPerson') || 'kişi'}`,
        cell: (row) => formatNumber(row.salary, 2, false),
      },
    ];
    for (let d = 0; d < daysInMonth; d++) {
      const dayKey = `day_${d}`;
      const dayNum = d + 1;
      cols.push({
        key: dayKey,
        header: String(dayNum),
        align: 'center',
        size: DAY_COL_SIZE,
        minSize: DAY_COL_MIN,
        enableColumnFilter: false,
        footerSum: true,
        footerFormat: (sum) => (
          <span className="text-[10px] font-semibold">{sum > 0 ? String(Math.round(sum)) : ''}</span>
        ),
        cell: (row) => {
          const status = row.days[d] as AttendanceStatus;
          const cin = row.clockIns?.[d] ?? null;
          const cout = row.clockOuts?.[d] ?? null;
          const tipParts = [
            `${tm('rprDay') || 'Gün'} ${dayNum}`,
            cin ? `${tm('rprAttendanceClockIn') || 'Giriş'}: ${cin}` : null,
            cout ? `${tm('rprAttendanceClockOut') || 'Çıkış'}: ${cout}` : null,
            tm('rprAttendanceClickHint') || 'Düzenlemek için tıklayın',
          ].filter(Boolean);
          return (
            <button
              type="button"
              title={tipParts.join(' · ')}
              aria-label={`${row.staffName}, ${dayNum}`}
              onClick={(e) => {
                e.stopPropagation();
                openDayEdit(row, d);
              }}
              className={`mx-auto flex min-h-[1.75rem] w-full min-w-[2.5rem] flex-col items-center justify-center rounded px-0.5 py-0.5 text-[11px] font-bold leading-tight transition-colors ${cellCls(status)}`}
            >
              {status == null ? (
                <span className="opacity-50">+</span>
              ) : status === 1 && cin ? (
                <>
                  <span>{cin}</span>
                  {cout ? <span className="opacity-90 text-[9px] font-semibold">{cout}</span> : null}
                </>
              ) : (
                <span>{status}</span>
              )}
            </button>
          );
        },
      });
    }
    cols.push(
      {
        key: 'totalDays',
        header: tm('rprColTotalDays') || 'Toplam Gün',
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 0, false),
      },
      {
        key: 'totalSalary',
        header: tm('rprColTotalSalary') || 'Toplam Maaş',
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 2, false),
      },
      {
        key: 'extraPayment',
        header: tm('rprColExtraPayment') || 'Ek Ödemeler',
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 2, false),
      },
      {
        key: 'gross',
        header: tm('rprColGross') || 'Brüt Hak',
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => `${formatNumber(n, 2, false)} ${currency}`,
        cell: (row) => (
          <span className="font-bold text-blue-600">
            {formatNumber(row.gross, 2, false)} {currency}
          </span>
        ),
      },
    );
    return cols;
  }, [daysInMonth, tm, enriched.length, currency, cellCls, openDayEdit]);

  return (
    <>
      <ReportShell
        title={tm('rprStaffAttendanceTitle') || 'PDKS — Personel Yoklama'}
        subtitle={
          tm('rprStaffAttendanceSubtitleEdit') ||
          'Aylık geliş tablosu — güne tıklayarak giriş/çıkış ekleyin'
        }
        loading={loading}
        onRefresh={() => void load()}
        onExport={
          canExportExcel
            ? () => {
                const header = ['No', 'İsim', 'Departman', 'Maaş'];
                for (let d = 1; d <= daysInMonth; d++) header.push(`Gün ${d}`);
                header.push('Toplam Gün', 'Toplam Maaş', 'Ek Ödeme', 'Brüt Hak');
                const out = enriched.map((r, i) => {
                  const row: string[] = [String(i + 1), r.staffName, r.department, String(r.salary)];
                  for (let d = 0; d < daysInMonth; d++) {
                    const st = r.days[d];
                    const cin = r.clockIns?.[d];
                    const cout = r.clockOuts?.[d];
                    if (st == null) row.push('');
                    else if (cin || cout) row.push(`${st}${cin ? ` ${cin}` : ''}${cout ? `-${cout}` : ''}`);
                    else row.push(String(st));
                  }
                  row.push(String(r.totalDays), String(r.totalSalary), String(r.extraPayment), String(r.gross));
                  return row;
                });
                exportCsv(`pdks_${year}_${String(month).padStart(2, '0')}`, header, out);
              }
            : undefined
        }
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
                options={departmentOptions}
              />
            </div>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              loading={staffLoading}
              style={{ minWidth: 220 }}
              placeholder={tm('rprFilterStaff') || 'Personel'}
              value={staffIds}
              onChange={(v) => setStaffIds(v as string[])}
              options={staffOptions}
              maxTagCount="responsive"
            />
          </div>
        }
      >
        <div className={`rounded-lg border p-2 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          {enriched.length === 0 && !loading ? (
            <div className="px-3 py-8 text-center text-sm opacity-60">{tm('erpNoRows') || 'Veri yok'}</div>
          ) : (
            <ReportColumnTable
              data={gridRows}
              columns={attendanceColumns}
              height={640}
              footerLabel={tm('rprDailyPresence') || 'Günlük Gelen'}
              storageNamespace={`staff-attendance-v2-${year}-${month}`}
              enableGrouping={false}
            />
          )}
        </div>
      </ReportShell>

      {editTarget && (
        <DayEditModal
          target={editTarget}
          initialStatus={editRow?.days[editTarget.dayIndex] ?? null}
          initialClockIn={editRow?.clockIns?.[editTarget.dayIndex] ?? null}
          initialClockOut={editRow?.clockOuts?.[editTarget.dayIndex] ?? null}
          onClose={() => setEditTarget(null)}
          onSaved={() => void load()}
        />
      )}
    </>
  );
}
