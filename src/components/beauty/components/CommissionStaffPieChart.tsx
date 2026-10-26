import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatNumber } from '../../../utils/formatNumber';
import {
  buildCommissionStaffPieSlices,
  commissionPieColor,
  type CommissionPieSource,
} from '../../../utils/commissionStaffPie';
import { donutShareLabel } from '../../reports/donutShareLabel';
import '../../reports/DayEndZReportLayout.css';

export interface CommissionStaffPieChartProps {
  rows: readonly CommissionPieSource[];
  totalCommission: number;
  title: string;
  centerLabel: string;
  selectedId?: string | null;
  onToggle?: (specialistId: string) => void;
}

function readSpecialistId(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const row = data as { key?: unknown; payload?: { key?: unknown } };
  if (typeof row.key === 'string' && row.key.trim()) return row.key;
  if (typeof row.payload?.key === 'string' && row.payload.key.trim()) return row.payload.key;
  return '';
}

/**
 * Prim raporu halkası. Gün sonu Z grafiğiyle aynı halka, yüzde ve lejant dili.
 * Ortadaki tutar rapor toplamıdır; dilim seçimi bu tutarı değiştirmez.
 */
export function CommissionStaffPieChart({
  rows,
  totalCommission,
  title,
  centerLabel,
  selectedId = null,
  onToggle,
}: CommissionStaffPieChartProps) {
  const slices = buildCommissionStaffPieSlices(rows);
  const chartRows = slices.flatMap((slice, index) => (
    slice.inChart
      ? [{
          key: slice.specialist_id,
          name: slice.name,
          amount: slice.amount,
          sharePercent: slice.sharePercent,
          fill: commissionPieColor(index),
        }]
      : []
  ));
  const summary = slices
    .map((slice) => `${slice.name} ${formatNumber(slice.amount, 2, false)}`)
    .join(', ');
  const totalText = formatNumber(Number(totalCommission) || 0, 2, false);
  const track = '#e2e8f0';
  const stroke = '#ffffff';

  return (
    <figure
      data-testid="commission-pie"
      className="z-day-figure"
      aria-label={`${title}. ${summary}. ${centerLabel} ${totalText}`}
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
                  const id = readSpecialistId(data);
                  if (id) onToggle?.(id);
                }}
              >
                {chartRows.map((row) => (
                  <Cell
                    key={row.key}
                    fill={row.fill}
                    fillOpacity={!selectedId || selectedId === row.key ? 1 : 0.28}
                    stroke={selectedId === row.key ? '#0f172a' : stroke}
                    strokeWidth={selectedId === row.key ? 3 : 2}
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
        <div data-testid="commission-pie-center" className="z-day-center">
          <div className="z-day-center-copy">
            <p className="z-day-center-label">{centerLabel}</p>
            <p className="z-day-center-value">{totalText}</p>
          </div>
        </div>
      </div>
      <ul data-testid="commission-pie-legend" className="z-day-legend">
        {slices.map((slice, index) => {
          const selected = selectedId === slice.specialist_id;
          const dim = Boolean(selectedId) && !selected;
          return (
            <li key={slice.specialist_id}>
              <button
                type="button"
                data-testid={`commission-pie-slice-${slice.specialist_id}`}
                data-in-chart={slice.inChart ? '1' : '0'}
                data-amount={String(slice.amount)}
                data-share={String(slice.sharePercent)}
                aria-pressed={selected}
                className={[
                  'z-day-legend-row',
                  selected ? 'is-selected' : '',
                  dim ? 'is-dim' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onToggle?.(slice.specialist_id)}
              >
                <span
                  className="z-day-swatch"
                  style={{ backgroundColor: commissionPieColor(index) }}
                  aria-hidden
                />
                <span className="z-day-legend-name">{slice.name}</span>
                <span className="z-day-legend-amount">{formatNumber(slice.amount, 2, false)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
