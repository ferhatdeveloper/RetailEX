import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatNumber } from '../../utils/formatNumber';
import {
  buildDayEndZPieSlices,
  DAY_END_Z_PIE_COLORS,
  DAY_END_Z_PIE_SLICE_ORDER,
  type DayEndZPieSliceKey,
} from '../../utils/posZReport';
import { donutShareLabel } from './donutShareLabel';
import './DayEndZReportLayout.css';

export interface DayEndZPieChartProps {
  netSales: number;
  reservationAmount: number;
  salesReturn: number;
  expense: number;
  discount: number;
  netCash: number;
  labels: Record<DayEndZPieSliceKey, string>;
  title: string;
  netCashLabel: string;
  darkMode?: boolean;
  selectedKey?: DayEndZPieSliceKey | null;
  onToggle?: (key: DayEndZPieSliceKey) => void;
}

function readSliceKey(data: unknown): DayEndZPieSliceKey | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as { key?: unknown; payload?: { key?: unknown } };
  const key = typeof row.key === 'string'
    ? row.key
    : typeof row.payload?.key === 'string'
      ? row.payload.key
      : '';
  return (DAY_END_Z_PIE_SLICE_ORDER as readonly string[]).includes(key)
    ? (key as DayEndZPieSliceKey)
    : null;
}

/**
 * Gün sonu Z ekranı. Yazdırma şablonu bu grafiği kullanmaz.
 * Sıfır dilim pastada yer kaplamaz; lejant tutarı listeden gelir.
 * Dilime veya lejanta basmak yalnız ekran süzgecidir.
 */
export function DayEndZPieChart({
  netSales,
  reservationAmount,
  salesReturn,
  expense,
  discount,
  netCash,
  labels,
  title,
  netCashLabel,
  darkMode = false,
  selectedKey = null,
  onToggle,
}: DayEndZPieChartProps) {
  const slices = buildDayEndZPieSlices({
    netSales,
    reservationAmount,
    salesReturn,
    expense,
    discount,
  });
  const chartRows = slices
    .filter((slice) => slice.inChart)
    .map((slice) => ({
      key: slice.key,
      name: labels[slice.key],
      amount: slice.amount,
      sharePercent: slice.sharePercent,
      fill: DAY_END_Z_PIE_COLORS[slice.key],
    }));
  const summary = slices
    .map((slice) => `${labels[slice.key]} ${formatNumber(slice.amount, 2, false)}`)
    .join(', ');
  const netCashText = formatNumber(netCash, 2, false);
  const track = darkMode ? '#334155' : '#e2e8f0';
  const stroke = darkMode ? '#0f172a' : '#ffffff';

  return (
    <figure
      data-testid="z-report-pie"
      className="z-day-figure"
      aria-label={`${title}. ${summary}. ${netCashLabel} ${netCashText}`}
    >
      <figcaption className="z-day-figure-title">{title}</figcaption>
      <div className="z-day-chart-box">
        {chartRows.length === 0 ? (
          <svg viewBox="0 0 200 200" aria-hidden>
            <circle cx="100" cy="100" r="72" fill="none" stroke={track} strokeWidth="28" />
          </svg>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart>
              <Pie
                data={chartRows}
                dataKey="amount"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="94%"
                startAngle={90}
                endAngle={-270}
                paddingAngle={chartRows.length > 1 ? 1.4 : 0}
                stroke={stroke}
                strokeWidth={2}
                isAnimationActive={false}
                label={donutShareLabel}
                labelLine={false}
                onClick={(data) => {
                  const key = readSliceKey(data);
                  if (key) onToggle?.(key);
                }}
              >
                {chartRows.map((row) => (
                  <Cell
                    key={row.key}
                    fill={row.fill}
                    fillOpacity={!selectedKey || selectedKey === row.key ? 1 : 0.28}
                    stroke={selectedKey === row.key ? '#0f172a' : stroke}
                    strokeWidth={selectedKey === row.key ? 3 : 2}
                    style={{ cursor: onToggle ? 'pointer' : 'default' }}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatNumber(Number(value) || 0, 2, false)}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
        <div data-testid="z-report-pie-center" className="z-day-center">
          <div className="z-day-center-copy">
            <p className="z-day-center-label">{netCashLabel}</p>
            <p className="z-day-center-value">{netCashText}</p>
          </div>
        </div>
      </div>
      <ul data-testid="z-report-pie-legend" className="z-day-legend">
        {slices.map((slice) => {
          const selected = selectedKey === slice.key;
          const dim = Boolean(selectedKey) && !selected;
          return (
            <li key={slice.key}>
              <button
                type="button"
                data-testid={`z-report-pie-slice-${slice.key}`}
                data-in-chart={slice.inChart ? '1' : '0'}
                data-amount={String(slice.amount)}
                data-share={String(slice.sharePercent)}
                aria-pressed={selected}
                className={[
                  'z-day-legend-row',
                  selected ? 'is-selected' : '',
                  dim ? 'is-dim' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onToggle?.(slice.key)}
              >
                <span
                  className="z-day-swatch"
                  style={{ backgroundColor: DAY_END_Z_PIE_COLORS[slice.key] }}
                  aria-hidden
                />
                <span className="z-day-legend-name">{labels[slice.key]}</span>
                <span className="z-day-legend-amount">{formatNumber(slice.amount, 2, false)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
