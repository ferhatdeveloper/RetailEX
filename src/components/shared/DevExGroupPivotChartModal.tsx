import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  ExternalLink,
  LineChart as LineChartIcon,
  Loader2,
  PieChart as PieChartIcon,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PercentBodyModal } from './PercentBodyModal';
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
  MAX_COMPARE_METRICS,
  normalizePivotMetricIds,
  pickBestPivotMetricId,
  pivotMetricDataKey,
  pivotMetricsHaveData,
  resolveSnapshotMetricIds,
  saveDevExPivotDashboard,
  type DevExPivotChartKind,
  type DevExPivotDashboardSnapshot,
} from '../../utils/devExPivotDashboardStore';
import {
  createGrafanaDashboardFromPivot,
} from '../../services/grafanaClientApi';
import {
  buildGrafanaDashboardEmbedUrl,
  isGrafanaClientReady,
} from '../../services/grafanaClientConfig';
import { IS_TAURI } from '../../utils/env';
import { OpenRouterApiSettingsModal } from '../integrations/OpenRouterApiSettingsModal';
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
  const [metricIds, setMetricIds] = useState<string[]>(() =>
    normalizePivotMetricIds([
      pickBestPivotMetricId(initialRows, initialMetrics, defaultMetricId),
    ]),
  );
  const [metricsMenuOpen, setMetricsMenuOpen] = useState(false);
  const [dashTitle, setDashTitle] = useState(
    () => `${reportTitle || tm('gridPivotChartTitle') || 'Dashboard'} — ${groupColumnLabel}`.slice(0, 80),
  );
  const [saved, setSaved] = useState<DevExPivotDashboardSnapshot[]>(() => listDevExPivotDashboards(scope));
  const [activeDashId, setActiveDashId] = useState<string | null>(null);
  const [grafanaBusy, setGrafanaBusy] = useState(false);
  const [grafanaSettingsOpen, setGrafanaSettingsOpen] = useState(false);

  useEffect(() => {
    setRows(initialRows);
    setMetrics(initialMetrics);
    setGroupLabel(groupColumnLabel);
    setMetricIds(
      normalizePivotMetricIds([
        pickBestPivotMetricId(initialRows, initialMetrics, defaultMetricId),
      ]),
    );
  }, [initialRows, initialMetrics, groupColumnLabel, defaultMetricId]);

  const chartPoints = useMemo(() => toDevExPivotChartPoints(rows), [rows]);
  const metricOptions = useMemo(
    () => [{ id: '__count__', label: tm('gridPivotRowCount') || 'Kayıt adedi' }, ...metrics],
    [metrics, tm],
  );
  const selectedSeries = useMemo(() => {
    const ids =
      chartKind === 'pie'
        ? normalizePivotMetricIds(metricIds.slice(0, 1))
        : normalizePivotMetricIds(metricIds);
    return ids.map((id, i) => {
      const opt = metricOptions.find((m) => m.id === id);
      return {
        id,
        dataKey: pivotMetricDataKey(id),
        label: opt?.label || id,
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    });
  }, [metricIds, metricOptions, chartKind]);
  const hasChartData = pivotMetricsHaveData(
    rows,
    selectedSeries.map((s) => s.id),
  );

  const toggleMetricId = (id: string) => {
    setMetricIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return normalizePivotMetricIds(prev.filter((x) => x !== id));
      }
      if (chartKind === 'pie') {
        return [id];
      }
      if (prev.length >= MAX_COMPARE_METRICS) {
        toast.message(
          tm('gridPivotMetricsMax') ||
            `En fazla ${MAX_COMPARE_METRICS} metrik karşılaştırılabilir.`,
        );
        return prev;
      }
      return normalizePivotMetricIds([...prev, id]);
    });
  };

  const shell = darkMode ? 'bg-gray-800 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
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
      metricId: metricIds[0] || '__count__',
      metricIds,
      rows,
      metrics,
    });
    setActiveDashId(snap.id);
    refreshSaved();
    toast.success(tm('gridPivotDashSaved') || 'Dashboard kaydedildi');
  };

  const handleGrafanaPublish = async () => {
    if (rows.length === 0) {
      toast.error(tm('gridPivotNoData') || 'Grafik için grup verisi yok.');
      return;
    }
    // Web/Dokploy: bridge → POST /api/grafana/dashboards/import (admin auth, token gerekmez).
    // Tauri: yalnızca istemci URL + token.
    if (IS_TAURI && !isGrafanaClientReady()) {
      toast.message(
        tm('gridPivotGrafanaNeedConfig') ||
          'Masaüstünde Grafana URL + API token gerekli. Açılan pencerede Grafana sekmesine girin.',
      );
      setGrafanaSettingsOpen(true);
      return;
    }
    setGrafanaBusy(true);
    try {
      const result = await createGrafanaDashboardFromPivot({
        title: dashTitle || `${reportTitle || 'RetailEX'} — ${groupLabel}`,
        groupColumnLabel: groupLabel,
        rows,
        metrics,
        metricId: metricIds[0] || '__count__',
        metricIds,
        chartKind,
      });
      if (!result.ok) {
        if (result.needsClientConfig || (IS_TAURI && !isGrafanaClientReady())) {
          toast.message(
            tm('gridPivotGrafanaNeedConfig') ||
              'Grafana URL + API token gerekli. Açılan pencerede Grafana sekmesine girin.',
          );
          setGrafanaSettingsOpen(true);
          return;
        }
        toast.error(result.error || tm('gridPivotGrafanaFail') || 'Grafana panosu oluşturulamadı');
        return;
      }
      toast.success(tm('gridPivotGrafanaOk') || 'Grafana panosu oluşturuldu');
      const theme = darkMode ? 'dark' : 'light';
      const openUrl =
        result.url ||
        (result.uid ? buildGrafanaDashboardEmbedUrl(result.uid, theme) : '');
      if (openUrl) {
        let abs = openUrl;
        if (abs.startsWith('/')) {
          abs = `${window.location.origin}${abs}`;
        }
        // Yeni sekmede tam Grafana UI (kiosk kapalı)
        abs = abs.replace('&kiosk', '').replace('?kiosk&', '?').replace('?kiosk', '');
        window.open(abs, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setGrafanaBusy(false);
    }
  };

  const handleLoad = (dash: DevExPivotDashboardSnapshot) => {
    setActiveDashId(dash.id);
    setDashTitle(dash.title);
    setGroupLabel(dash.groupColumnLabel);
    setRows(dash.rows);
    setMetrics(dash.metrics);
    setChartKind(dash.chartKind);
    setMetricIds(resolveSnapshotMetricIds(dash));
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
        <div className={`flex h-full w-full items-center justify-center ${card}`}>
          <p className={`text-sm px-6 text-center max-w-md ${muted}`}>
            {tm('gridPivotMetricEmpty') ||
              'Seçili metrikte değer yok. Başka bir metrik seçin (ör. Çıkış tutar veya Kayıt adedi).'}
          </p>
        </div>
      );
    }

    const commonMargin = { top: 16, right: 20, left: 8, bottom: 8 };

    const wrap = (node: ReactNode) => (
      <div className={`relative h-full w-full min-h-[280px] rounded-xl border ${card}`}>
        <div className="absolute inset-0 p-2">{node}</div>
      </div>
    );

    if (chartKind === 'pie') {
      const pie = selectedSeries[0];
      return wrap(
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartPoints}
              dataKey={pie?.dataKey || 'count'}
              nameKey="name"
              cx="50%"
              cy="48%"
              innerRadius="28%"
              outerRadius="70%"
              paddingAngle={2}
            >
              {chartPoints.map((_, i) => (
                <Cell key={`c-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>,
      );
    }

    if (chartKind === 'hbar') {
      return wrap(
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartPoints} layout="vertical" margin={{ ...commonMargin, left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis type="number" tick={{ fontSize: 11, fill: tickFill }} />
            <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 11, fill: tickFill }} />
            <Tooltip />
            <Legend />
            {selectedSeries.map((s) => (
              <Bar
                key={s.id}
                dataKey={s.dataKey}
                name={s.label}
                fill={s.color}
                radius={[0, 4, 4, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>,
      );
    }

    if (chartKind === 'line') {
      return wrap(
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartPoints} margin={{ ...commonMargin, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="name" angle={-22} textAnchor="end" height={58} tick={{ fontSize: 11, fill: tickFill }} />
            <YAxis tick={{ fontSize: 11, fill: tickFill }} />
            <Tooltip />
            <Legend />
            {selectedSeries.map((s) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.dataKey}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.5}
                dot
              />
            ))}
          </LineChart>
        </ResponsiveContainer>,
      );
    }

    if (chartKind === 'area') {
      return wrap(
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartPoints} margin={{ ...commonMargin, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="name" angle={-22} textAnchor="end" height={58} tick={{ fontSize: 11, fill: tickFill }} />
            <YAxis tick={{ fontSize: 11, fill: tickFill }} />
            <Tooltip />
            <Legend />
            {selectedSeries.map((s) => (
              <Area
                key={s.id}
                type="monotone"
                dataKey={s.dataKey}
                name={s.label}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.35}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>,
      );
    }

    return wrap(
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartPoints} margin={{ ...commonMargin, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="name" angle={-22} textAnchor="end" height={58} tick={{ fontSize: 11, fill: tickFill }} />
          <YAxis tick={{ fontSize: 11, fill: tickFill }} />
          <Tooltip />
          <Legend />
          {selectedSeries.map((s) => (
            <Bar
              key={s.id}
              dataKey={s.dataKey}
              name={s.label}
              fill={s.color}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>,
    );
  };

  return (
    <>
    <PercentBodyModal
      onClose={onClose}
      size="full"
      shellClassName={darkMode ? '!bg-gray-900 text-gray-100' : ''}
      ariaLabel={tm('gridPivotChartTitle') || 'Grup pivot / grafik'}
    >
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0 ${shell}`}>
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight truncate">
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

      {/* Kompakt toolbar — alan grafik için kalsın */}
      <div
        className={`flex flex-wrap items-center gap-2 px-3 py-2 border-b shrink-0 ${
          darkMode ? 'bg-gray-800/80 border-gray-700' : 'bg-white border-gray-200'
        }`}
      >
        <div className="flex flex-wrap gap-1">
          {CHART_KINDS.map(({ id, icon: Icon, labelKey, fallback }) => {
            const active = chartKind === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setChartKind(id)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-semibold ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : darkMode
                      ? 'border-gray-600 bg-gray-800 text-gray-200 hover:border-indigo-400'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tm(labelKey) || fallback}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <button
            type="button"
            disabled={chartKind === 'pivot'}
            onClick={() => setMetricsMenuOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${
              darkMode
                ? 'border-gray-600 bg-gray-800 text-gray-100 hover:border-indigo-400'
                : 'border-gray-200 bg-white text-gray-800 hover:border-indigo-300'
            }`}
          >
            <span className="uppercase tracking-wide text-[9px] opacity-70">
              {tm('gridPivotMetrics') || 'Metrikler'}
            </span>
            <span className="tabular-nums">
              {selectedSeries.length}/{metricOptions.length}
            </span>
          </button>
          {metricsMenuOpen && chartKind !== 'pivot' && (
            <div
              className={`absolute left-0 top-full z-20 mt-1 w-64 max-h-64 overflow-y-auto rounded-lg border shadow-lg p-2 space-y-1 ${
                darkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-200'
              }`}
            >
              <p className={`px-1 pb-1 text-[10px] ${muted}`}>
                {chartKind === 'pie'
                  ? tm('gridPivotMetricsPieHint') || 'Pasta: tek metrik'
                  : tm('gridPivotMetricsCompareHint') ||
                    `Karşılaştırma için birden fazla seçin (max ${MAX_COMPARE_METRICS})`}
              </p>
              {metricOptions.map((m) => {
                const checked = metricIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer ${
                      darkMode ? 'hover:bg-gray-800' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-400"
                      checked={checked}
                      onChange={() => toggleMetricId(m.id)}
                    />
                    <span className="truncate">{m.label}</span>
                  </label>
                );
              })}
              <button
                type="button"
                className={`w-full mt-1 rounded-md px-2 py-1 text-[10px] font-bold ${
                  darkMode ? 'bg-gray-800 text-gray-300' : 'bg-slate-100 text-slate-600'
                }`}
                onClick={() => setMetricsMenuOpen(false)}
              >
                {tm('close') || 'Kapat'}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1" />

        <input
          className={`rounded-md border px-2 py-1.5 text-xs w-44 max-w-full ${inputCls}`}
          value={dashTitle}
          onChange={(e) => setDashTitle(e.target.value)}
          placeholder={tm('gridPivotDashTitlePh') || 'Dashboard adı'}
        />
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700"
        >
          <BookmarkPlus className="w-3.5 h-3.5" />
          {activeDashId ? tm('gridPivotDashUpdate') || 'Güncelle' : tm('gridPivotDashSaveBtn') || 'Kaydet'}
        </button>
        <button
          type="button"
          disabled={grafanaBusy || rows.length === 0}
          onClick={() => void handleGrafanaPublish()}
          className="inline-flex items-center gap-1 rounded-md border border-orange-500 bg-orange-50 px-3 py-1.5 text-[11px] font-bold text-orange-800 hover:bg-orange-100 disabled:opacity-50 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-600"
          title={
            tm('gridPivotGrafanaHint') ||
            'Sistem Grafana’ya gönder (web: /api/grafana bridge; masaüstü: URL + token)'
          }
        >
          {grafanaBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          {tm('gridPivotGrafanaSend') || 'Grafana’ya gönder'}
        </button>
      </div>

      {/* Ana alan: grafik/pivot + kayıtlı liste */}
      <div className={`flex-1 min-h-0 flex gap-0 overflow-hidden ${darkMode ? 'bg-gray-950' : 'bg-slate-100'}`}>
        <div className="flex-1 min-w-0 min-h-0 p-3 flex flex-col">
          {rows.length === 0 ? (
            <div className={`flex-1 flex items-center justify-center rounded-xl border ${card}`}>
              <p className={`text-sm ${muted}`}>{tm('gridPivotNoData') || 'Grafik için grup verisi yok.'}</p>
            </div>
          ) : chartKind === 'pivot' ? (
            <div className={`flex-1 min-h-0 overflow-auto rounded-xl border shadow-sm ${card}`}>
              <table className="min-w-full text-xs">
                <thead className={darkMode ? 'bg-indigo-950/80 sticky top-0 z-[1]' : 'bg-indigo-50 sticky top-0 z-[1]'}>
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
            <div className="flex-1 min-h-0 w-full">{renderChart()}</div>
          )}
        </div>

        <aside
          className={`w-52 shrink-0 border-l flex flex-col min-h-0 ${
            darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}
        >
          <p className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 border-b ${muted} ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <Bookmark className="w-3 h-3" />
            {tm('gridPivotDashList') || 'Kayıtlı'}
          </p>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {saved.length === 0 ? (
              <p className={`text-[11px] px-1 ${muted}`}>
                {tm('gridPivotDashEmpty') || 'Henüz kayıt yok.'}
              </p>
            ) : (
              saved.map((d) => (
                <div
                  key={d.id}
                  className={`rounded-lg border px-2 py-1.5 ${
                    activeDashId === d.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                      : darkMode
                        ? 'border-gray-600 bg-gray-800'
                        : 'border-gray-200 bg-slate-50'
                  }`}
                >
                  <button type="button" className="w-full text-left" onClick={() => handleLoad(d)}>
                    <div className="text-[11px] font-semibold truncate">{d.title}</div>
                    <div className={`text-[10px] ${muted} truncate`}>
                      {d.groupColumnLabel} · {d.chartKind}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-red-600 hover:underline"
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

      <div className={`flex justify-end px-4 py-2 border-t shrink-0 ${shell}`}>
        <button
          type="button"
          onClick={onClose}
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg border ${
            darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'
          }`}
        >
          {tm('close') || 'Kapat'}
        </button>
      </div>
    </PercentBodyModal>
    {grafanaSettingsOpen && (
      <OpenRouterApiSettingsModal
        initialTab="grafana"
        onClose={() => {
          setGrafanaSettingsOpen(false);
          if (isGrafanaClientReady()) {
            toast.message(tm('gridPivotGrafanaReadyRetry') || 'Grafana ayarı kaydedildi. Tekrar «Grafana’ya gönder»e basın.');
          }
        }}
      />
    )}
    </>
  );
}
