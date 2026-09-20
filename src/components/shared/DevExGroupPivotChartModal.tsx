import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, PieChart as PieChartIcon, Table2, X } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from './PercentBodyModal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  toDevExPivotChartPoints,
  type DevExPivotMetricDef,
  type DevExPivotRow,
} from '../../utils/devExGroupPivot';
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

type ViewMode = 'pivot' | 'bar' | 'pie';

export interface DevExGroupPivotChartModalProps {
  onClose: () => void;
  groupColumnLabel: string;
  rows: DevExPivotRow[];
  metrics: DevExPivotMetricDef[];
  /** Grafikte varsayılan metrik (yoksa ilk metrik veya count) */
  defaultMetricId?: string | null;
}

/**
 * Gruplama sonrası pivot tablo + bar/pie grafik (Recharts).
 * Grafana bağımlılığı yok — tüm DevEx grid’lerde çalışır.
 */
export function DevExGroupPivotChartModal({
  onClose,
  groupColumnLabel,
  rows,
  metrics,
  defaultMetricId,
}: DevExGroupPivotChartModalProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const [view, setView] = useState<ViewMode>('pivot');
  const [metricId, setMetricId] = useState<string>(() => {
    if (defaultMetricId && metrics.some((m) => m.id === defaultMetricId)) return defaultMetricId;
    return metrics[0]?.id || '__count__';
  });

  const chartPoints = useMemo(() => toDevExPivotChartPoints(rows), [rows]);
  const metricOptions = useMemo(
    () => [{ id: '__count__', label: tm('gridPivotRowCount') || 'Kayıt adedi' }, ...metrics],
    [metrics, tm],
  );
  const activeMetric = metricOptions.find((m) => m.id === metricId) || metricOptions[0];
  const dataKey = activeMetric?.id === '__count__' ? 'count' : activeMetric?.id || 'count';

  const shell = darkMode ? 'bg-gray-800 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const tabActive = darkMode ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white';
  const tabIdle = darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200';

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('gridPivotChartTitle') || 'Grup pivot / grafik'}>
      <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0 ${shell}`}>
        <div className="min-w-0">
          <h2 className="text-sm font-bold truncate">
            {tm('gridPivotChartTitle') || 'Grup pivot / grafik'}
          </h2>
          <p className={`text-[11px] ${muted} truncate`}>
            {(tm('gridGroupedBy') || 'Grup:') + ' '}
            <span className="font-semibold">{groupColumnLabel}</span>
            {' · '}
            {rows.length} {tm('gridPivotGroups') || 'grup'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`p-1.5 rounded ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          aria-label={tm('close') || 'Kapat'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className={`flex flex-wrap items-center gap-2 px-4 py-2 border-b shrink-0 ${shell}`}>
        <div className="inline-flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
          <button
            type="button"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium ${view === 'pivot' ? tabActive : tabIdle}`}
            onClick={() => setView('pivot')}
          >
            <Table2 className="w-3.5 h-3.5" />
            {tm('gridPivotTab') || 'Pivot'}
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium ${view === 'bar' ? tabActive : tabIdle}`}
            onClick={() => setView('bar')}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            {tm('gridChartBarTab') || 'Sütun grafik'}
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium ${view === 'pie' ? tabActive : tabIdle}`}
            onClick={() => setView('pie')}
          >
            <PieChartIcon className="w-3.5 h-3.5" />
            {tm('gridChartPieTab') || 'Pasta grafik'}
          </button>
        </div>

        {view !== 'pivot' && (
          <label className={`inline-flex items-center gap-1.5 text-[11px] ${muted}`}>
            <span>{tm('gridPivotMetric') || 'Metrik'}</span>
            <select
              className={`rounded border px-2 py-1 text-[11px] ${
                darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
              }`}
              value={metricId}
              onChange={(e) => setMetricId(e.target.value)}
            >
              {metricOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <PercentBodyModalScrollBody className={`p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {rows.length === 0 ? (
          <p className={`text-sm ${muted}`}>{tm('gridPivotNoData') || 'Grafik için grup verisi yok.'}</p>
        ) : view === 'pivot' ? (
          <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <table className={`min-w-full text-[11px] ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <thead className={darkMode ? 'bg-gray-700' : 'bg-sky-50'}>
                <tr>
                  <th className="text-left px-3 py-2 font-semibold border-b">{groupColumnLabel}</th>
                  <th className="text-right px-3 py-2 font-semibold border-b">
                    {tm('gridPivotRowCount') || 'Kayıt adedi'}
                  </th>
                  {metrics.map((m) => (
                    <th key={m.id} className="text-right px-3 py-2 font-semibold border-b">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={darkMode ? 'border-gray-700' : 'border-gray-100'}>
                    <td className="px-3 py-1.5 border-b font-medium">{r.label}</td>
                    <td className="px-3 py-1.5 border-b text-right tabular-nums">{formatNumber(r.count, 0)}</td>
                    {metrics.map((m) => (
                      <td key={m.id} className="px-3 py-1.5 border-b text-right tabular-nums">
                        {formatNumber(r.values[m.id] ?? 0, 2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : view === 'bar' ? (
          <div className={`rounded-lg border p-3 h-[22rem] ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartPoints} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#4b5563' : '#e5e7eb'} />
                <XAxis dataKey="name" angle={-28} textAnchor="end" height={60} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey={dataKey} name={activeMetric?.label} fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className={`rounded-lg border p-3 h-[22rem] ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartPoints}
                  dataKey={dataKey}
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label={({ name }) => String(name)}
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
        )}
      </PercentBodyModalScrollBody>

      <div className={`flex justify-end px-4 py-3 border-t shrink-0 ${shell}`}>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          {tm('close') || 'Kapat'}
        </button>
      </div>
    </PercentBodyModal>
  );
}
