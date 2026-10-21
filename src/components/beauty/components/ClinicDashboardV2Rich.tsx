import { ChartLine } from 'lucide-react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { ClinicMonthPoint } from '../../../utils/clinicDashboardRich';
import { ClinicV2GrafanaGrid } from './ClinicV2GrafanaGrid';

const LINE = '#e6ebf2';
const BLUE = '#2563eb';
const ORANGE = '#f59e0b';

export function ClinicDashboardV2Rich({ series }: { series: ClinicMonthPoint[] }) {
    const { tm } = useLanguage();
    const peak = series.reduce((max, row) => Math.max(max, row.appointments, row.newCustomers), 0);
    const yMax = peak > 0 ? peak : 1;

    return (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <section
                    data-testid="clinic-rich-chart"
                    className="min-w-0 flex-1 bg-white px-3 py-3"
                    style={{ borderRadius: 16, border: `1px solid ${LINE}` }}
                >
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="flex items-center gap-1.5 text-sm font-extrabold">
                            <ChartLine size={16} color={BLUE} aria-hidden />
                            {tm('bClinicV2MonthChart')}
                        </h2>
                        <span className="text-xs font-bold" style={{ color: BLUE }}>{tm('bClinicV2Last6Months')}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap justify-end gap-3 text-[11px] font-semibold text-slate-600">
                        <LegendDot color={BLUE} label={tm('bClinicV2SeriesAppointments')} />
                        <LegendDot color={ORANGE} label={tm('bClinicV2SeriesNewCustomers')} />
                    </div>
                    <div className="mt-1" style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid stroke={LINE} vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    domain={[0, yMax]}
                                    ticks={peak > 0 ? undefined : [0]}
                                    allowDecimals={false}
                                    width={28}
                                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip />
                                <Line
                                    type="monotone"
                                    dataKey="appointments"
                                    name={tm('bClinicV2SeriesAppointments')}
                                    stroke={BLUE}
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: BLUE, stroke: BLUE }}
                                    isAnimationActive={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="newCustomers"
                                    name={tm('bClinicV2SeriesNewCustomers')}
                                    stroke={ORANGE}
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: ORANGE, stroke: ORANGE }}
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <ol data-testid="clinic-month-series" className="sr-only">
                        {series.map((point) => (
                            <li
                                key={point.key}
                                data-testid="clinic-month-point"
                                data-key={point.key}
                                data-appointments={point.appointments}
                                data-customers={point.newCustomers}
                            >
                                {point.label}
                            </li>
                        ))}
                    </ol>
                </section>

                <ClinicV2GrafanaGrid />
            </div>
    );
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {label}
        </span>
    );
}
