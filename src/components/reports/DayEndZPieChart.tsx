import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatNumber } from '../../utils/formatNumber';
import {
  buildDayEndZPieSlices,
  DAY_END_Z_PIE_COLORS,
  type DayEndZPieSliceKey,
} from '../../utils/posZReport';
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
}

/**
 * Gün sonu Z ekranı. Yazdırma şablonu bu grafiği kullanmaz.
 * Sıfır dilim pastada yer kaplamaz; lejant tutarı listeden gelir.
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
      fill: DAY_END_Z_PIE_COLORS[slice.key],
    }));
  const summary = slices
    .map((slice) => `${labels[slice.key]} ${formatNumber(slice.amount, 2, false)}`)
    .join(', ');
  const netCashText = formatNumber(netCash, 2, false);
  const track = darkMode ? '#334155' : '#e2e8f0';

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
                innerRadius={68}
                outerRadius={96}
                startAngle={90}
                endAngle={-270}
                paddingAngle={chartRows.length > 1 ? 1.6 : 0}
                stroke={darkMode ? '#0f172a' : '#ffffff'}
                strokeWidth={2}
                isAnimationActive={false}
              >
                {chartRows.map((row) => (
                  <Cell key={row.key} fill={row.fill} />
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
        {slices.map((slice) => (
          <li
            key={slice.key}
            data-testid={`z-report-pie-slice-${slice.key}`}
            data-in-chart={slice.inChart ? '1' : '0'}
            data-amount={String(slice.amount)}
            className="z-day-legend-row"
          >
            <span
              className="z-day-swatch"
              style={{ backgroundColor: DAY_END_Z_PIE_COLORS[slice.key] }}
              aria-hidden
            />
            <span className="z-day-legend-name">{labels[slice.key]}</span>
            <span className="z-day-legend-amount">{formatNumber(slice.amount, 2, false)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
