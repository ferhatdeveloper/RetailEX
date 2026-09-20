import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AreaChart as AreaChartIcon,
  BarChart3,
  Bookmark,
  BookmarkPlus,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PercentBodyModal, PercentBodyModalScrollBody } from './PercentBodyModal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  toDevExPivotChartPoints,
  type DevExPivotMetricDef,
  type DevExPivotRow,
} from '../../utils/devExGroupPivot';
import {
  deleteDevExPivotDashboard,
  listDevExPivotDashboards,
  pickBestPivotMetricId,
  pivotMetricHasData,
  saveDevExPivotDashboard,
  type DevExPivotChartKind,
  type DevExPivotDashboardSnapshot,
} from '../../utils/devExPivotDashboardStore';
import { formatNumber } from '../../utils/formatNumber';

const CHART_COLORS = [
  '#4f46e5',
  '#059669',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#7c3aed',
  '#db2777',
  '#65a30d',
];

const CHART_KINDS: Array<{
  id: DevExPivotChartKind;
  icon: typeof BarChart3;
  labelKey: string;
  fallback: string;
}> = [
  { id: 'pivot', icon: Table2, labelKey: 'gridPivotTab', fallback: 'Pivot' },
  { id: 'bar', icon: BarChart3, labelKey: 'gridChartBarTab', fallback: 'Sütun' },
  { id: 'hbar', icon: BarChart3, labelKey: 'gridChartHBarTab', fallback: 'Yatay sütun' },
  { id: 'line', icon: LineChartIcon, labelKey: 'gridChartLineTab', fallback: 'Çizgi' },
  { id: 'area', icon: AreaChartIcon, labelKey: 'gridChartAreaTab', fallback: 'Alan' },
  { id: 'pie', icon: PieChartIcon, labelKey: 'gridChartPieTab', fallback: 'Pasta' },
];

export interface DevExGroupPivotChartModalProps {
  onClose: () => void;
  groupColumnLabel: string;
  rows: DevExPivotRow[];
  metrics: DevExPivotMetricDef[];
  defaultMetricId?: string | null;
  /** Kaydedilen dashboard kapsamı (grid storageNamespace) */
  storageNamespace?: string;
  reportTitle?: string;
}

/**
 * Gruplama → pivot + seçilebilir grafik + kaydedilebilir dashboard.
 */
export function DevExGroupPivotChartModal({
  onClose,
  groupColumnLabel,
  rows: initialRows,
  metrics: initialMetrics,
  defaultMetricId,
  storageNamespace = 'default',
  reportTitle,
}: DevExGroupPivotChartModalProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const scope = storageNamespace.trim() || 'default';

  const [rows, setRows] = useState(initialRows);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [groupLabel, setGroupLabel] = useState(groupColumnLabel);
  const [chartKind, setChartKind] = useState<DevExPivotChartKind>('bar');
  const [metricId, setMetricId] = useState(() =>
    pickBestPivotMetricId(initialRows, initialMetrics, defaultMetricId),
  );
  const [dashTitle, setDashTitle] = useState(
    () => `${reportTitle || tm('gridPivotChartTitle') || 'Dashboard'} — ${groupColumnLabel}`.slice(0, 80),
  );
  const [saved, setSaved] = useState<DevExPivotDashboardSnapshot[]>(() => listDevExPivotDashboards(scope));
  const [activeDashId, setActiveDashId] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialRows);
    setMetrics(initialMetrics);
    setGroupLabel(groupColumnLabel);
    setMetricId(pickBestPivotMetricId(initialRows, initialMetrics, defaultMetricId));
  }, [initialRows, initialMetrics, groupColumnLabel, defaultMetricId]);

  const chartPoints = useMemo(() => toDevExPivotChartPoints(rows), [rows]);
  const metricOptions = useMemo(
    () => [{ id: '__count__', label: tm('gridPivotRowCount') || 'Kayıt adedi' }, ...metrics],
    [metrics, tm],
  );
  const activeMetric = metricOptions.find((m) => m.id === metricId) || metricOptions[0];
  const dataKey = activeMetric?.id === '__count__' ? 'count' : activeMetric?.id || 'count';
  const hasChartData = pivotMetricHasData(rows, dataKey === 'count' ? '__count__' : dataKey);

  const shell = darkMode ? 'bg-gray-800 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const panel = darkMode ? 'bg-gray-900/80 border-gray-700' : 'bg-slate-50 border-gray-200';
  const card = darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200';
  const inputCls = darkMode
    ? 'bg-gray-700 border-gray-600 text-gray-100'
    : 'bg-white border-gray-300 text-gray-900';

  const refreshSaved = () => setSaved(listDevExPivotDashboards(scope));

  const handleSave = () => {
    const snap = saveDevExPivotDashboard({
      id: activeDashId || undefined,
      title: dashTitle,
      scope,
      groupColumnLabel: groupLabel,
      chartKind,
      metricId,
      rows,
      metrics,
    });
    setActiveDashId(snap.id);
    refreshSaved();
    toast.success(tm('gridPivotDashSaved') || 'Dashboard kaydedildi');
  };

  const handleLoad = (dash: DevExPivotDashboardSnapshot) => {
    setActiveDashId(dash.id);
    setDashTitle(dash.title);
    setGroupLabel(dash.groupColumnLabel);
    setRows(dash.rows);
    setMetrics(dash.metrics);
    setChartKind(dash.chartKind);
    setMetricId(dash.metricId);
    toast.message(tm('gridPivotDashLoaded') || 'Dashboard yüklendi');
  };

  const handleDelete = (id: string) => {
    deleteDevExPivotDashboard(id);
    if (activeDashId === id) setActiveDashId(null);
    refreshSaved();
  };

  const tickFill = darkMode ? '#d1d5db' : '#374151';
  const gridStroke = darkMode ? '#4b5563' : '#e5e7eb';

  const renderChart = () => {
    if (!hasChartData) {
      return (
        <div className={`flex h-full min-h-[18rem] items-center justify-center rounded-xl border ${card}`}>
          <p className={`text-sm px-6 text-center ${muted}`}>
            {tm('gridPivotMetricEmpty') ||
              'Seçili metrikte değer yok. Başka bir metrik seçin (ör. Çıkış tutar veya Kayıt adedi).'}
          </p>
        </div>
      );
    }

    const commonMargin = { top: 12, right: 16, left: 8, bottom: 8 };

    if (chartKind === 'pie') {
      return (
        <div className={`h-[22rem] rounded-xl border p-3 ${card}`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartPoints}
                dataKey={dataKey}
                nameKey="name"
                cx="50%"
                cy="48%"
                innerRadius={48}
                outerRadius={100}
                paddingAngle={2}
              >
                {chartPoints.map((_, i) => (
                  <Cell key={`c-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (chartKind === 'hbar') {
      return (
        <div className={`h-[22rem] rounded-xl border p-3 ${card}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartPoints} layout="vertical" margin={{ ...commonMargin, left: 72 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis type="number" tick={{ fontSize: 10, fill: tickFill }} />
              <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10, fill: tickFill }} />
              <Tooltip />
              <Bar dataKey={dataKey} name={activeMetric?.label} fill="#4f46e5" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (chartKind === 'line') {
      return (
        <div className={`h-[22rem] rounded-xl border p-3 ${card}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartPoints} margin={{ ...commonMargin, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="name" angle={-25} textAnchor="end" height={56} tick={{ fontSize: 10, fill: tickFill }} />
              <YAxis tick={{ fontSize: 10, fill: tickFill }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={dataKey} name={activeMetric?.label} stroke="#4f46e5" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (chartKind === 'area') {
      return (
        <div className={`h-[22rem] rounded-xl border p-3 ${card}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartPoints} margin={{ ...commonMargin, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="name" angle={-25} textAnchor="end" height={56} tick={{ fontSize: 10, fill: tickFill }} />
              <YAxis tick={{ fontSize: 10, fill: tickFill }} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey={dataKey}
                name={activeMetric?.label}
                stroke="#4f46e5"
                fill="#6366f1"
                fillOpacity={0.35}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // bar
    return (
      <div className={`h-[22rem] rounded-xl border p-3 ${card}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartPoints} margin={{ ...commonMargin, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="name" angle={-25} textAnchor="end" height={56} tick={{ fontSize: 10, fill: tickFill }} />
            <YAxis tick={{ fontSize: 10, fill: tickFill }} />
            <Tooltip />
            <Legend />
            <Bar dataKey={dataKey} name={activeMetric?.label} fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <PercentBodyModal onClose={onClose} size="full" ariaLabel={tm('gridPivotChartTitle') || 'Grup pivot / grafik'}>
      <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0 ${shell}`}>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight truncate">
            {tm('gridPivotDashTitle') || 'Grup dashboard'}
          </h2>
          <p className={`text-[11px] ${muted} truncate`}>
            {groupLabel}
            {' · '}
            {rows.length} {tm('gridPivotGroups') || 'grup'}
            {activeDashId ? ` · ${tm('gridPivotDashSavedBadge') || 'Kayıtlı'}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          aria-label={tm('close') || 'Kapat'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <PercentBodyModalScrollBody className={`min-h-0 ${darkMode ? 'bg-gray-950' : 'bg-slate-100'}`}>
        <div className="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)_14rem] gap-3 p-3 h-full min-h-0">
          {/* Sol: grafik türü + metrik */}
          <aside className={`rounded-xl border p-3 space-y-3 ${panel}`}>
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${muted}`}>
                {tm('gridPivotChartType') || 'Grafik türü'}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {CHART_KINDS.map(({ id, icon: Icon, labelKey, fallback }) => {
                  const active = chartKind === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setChartKind(id)}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[10px] font-semibold transition-colors ${
                        active
                          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                          : darkMode
                            ? 'border-gray-600 bg-gray-800 text-gray-200 hover:border-indigo-400'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tm(labelKey) || fallback}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block space-y-1">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>
                {tm('gridPivotMetric') || 'Metrik'}
              </span>
              <select
                className={`w-full rounded-lg border px-2.5 py-2 text-xs ${inputCls}`}
                value={metricId}
                onChange={(e) => setMetricId(e.target.value)}
                disabled={chartKind === 'pivot'}
              >
                {metricOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1.5 pt-1 border-t border-dashed border-gray-300 dark:border-gray-600">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>
                {tm('gridPivotDashSave') || 'Dashboard kaydet'}
              </span>
              <input
                className={`w-full rounded-lg border px-2.5 py-2 text-xs ${inputCls}`}
                value={dashTitle}
                onChange={(e) => setDashTitle(e.target.value)}
                placeholder={tm('gridPivotDashTitlePh') || 'Dashboard adı'}
              />
              <button
                type="button"
                onClick={handleSave}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                {activeDashId ? tm('gridPivotDashUpdate') || 'Güncelle' : tm('gridPivotDashSaveBtn') || 'Kaydet'}
              </button>
            </div>
          </aside>

          {/* Orta: içerik */}
          <section className="min-w-0 min-h-0 flex flex-col gap-2">
            {chartKind === 'pivot' ? (
              <div className={`flex-1 overflow-auto rounded-xl border shadow-sm ${card}`}>
                <table className="min-w-full text-xs">
                  <thead className={darkMode ? 'bg-indigo-950/80 sticky top-0' : 'bg-indigo-50 sticky top-0'}>
                    <tr>
                      <th className="text-left px-3 py-2.5 font-bold border-b">{groupLabel}</th>
                      <th className="text-right px-3 py-2.5 font-bold border-b">
                        {tm('gridPivotRowCount') || 'Kayıt adedi'}
                      </th>
                      {metrics.map((m) => (
                        <th key={m.id} className="text-right px-3 py-2.5 font-bold border-b">
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr
                        key={r.key}
                        className={
                          idx % 2 === 0
                            ? darkMode
                              ? 'bg-gray-800'
                              : 'bg-white'
                            : darkMode
                              ? 'bg-gray-800/60'
                              : 'bg-slate-50'
                        }
                      >
                        <td className="px-3 py-2 border-b font-medium">{r.label}</td>
                        <td className="px-3 py-2 border-b text-right tabular-nums">{formatNumber(r.count, 0)}</td>
                        {metrics.map((m) => (
                          <td key={m.id} className="px-3 py-2 border-b text-right tabular-nums">
                            {formatNumber(r.values[m.id] ?? 0, 2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              renderChart()
            )}
          </section>

          {/* Sağ: kayıtlı dashboardlar */}
          <aside className={`rounded-xl border p-3 flex flex-col min-h-0 ${panel}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 flex items-center gap-1 ${muted}`}>
              <Bookmark className="w-3 h-3" />
              {tm('gridPivotDashList') || 'Kayıtlı dashboardlar'}
            </p>
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[8rem]">
              {saved.length === 0 ? (
                <p className={`text-[11px] ${muted}`}>
                  {tm('gridPivotDashEmpty') || 'Henüz kayıt yok. Soldan kaydedin.'}
                </p>
              ) : (
                saved.map((d) => (
                  <div
                    key={d.id}
                    className={`rounded-lg border px-2 py-2 ${
                      activeDashId === d.id
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                        : darkMode
                          ? 'border-gray-600 bg-gray-800'
                          : 'border-gray-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => handleLoad(d)}
                    >
                      <div className="text-[11px] font-semibold truncate">{d.title}</div>
                      <div className={`text-[10px] ${muted} truncate`}>
                        {d.groupColumnLabel} · {d.chartKind}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-red-600 hover:underline"
                      onClick={() => handleDelete(d.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                      {tm('delete') || 'Sil'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </PercentBodyModalScrollBody>

      <div className={`flex justify-end gap-2 px-4 py-3 border-t shrink-0 ${shell}`}>
        <button
          type="button"
          onClick={onClose}
          className={`px-4 py-2 text-sm font-semibold rounded-lg border ${
            darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'
          }`}
        >
          {tm('close') || 'Kapat'}
        </button>
      </div>
    </PercentBodyModal>
  );
}
