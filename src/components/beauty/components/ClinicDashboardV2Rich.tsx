import {
    BarChart3,
    Bell,
    BookOpen,
    Calendar,
    ChartLine,
    Globe,
    Headset,
    LayoutGrid,
    List,
    Package,
    Pipette,
    Settings,
    Users,
    Wallet,
} from 'lucide-react';
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
import {
    CLINIC_QUICK_LINKS,
    type ClinicMonthPoint,
    type ClinicQuickIcon,
    type ClinicQuickLink,
} from '../../../utils/clinicDashboardRich';

const LINE = '#e6ebf2';
const BLUE = '#2563eb';
const ORANGE = '#f59e0b';

const ICONS: Record<ClinicQuickIcon, typeof Calendar> = {
    calendar: Calendar,
    list: List,
    users: Users,
    package: Package,
    pipette: Pipette,
    chart: BarChart3,
    settings: Settings,
    globe: Globe,
    bell: Bell,
    wallet: Wallet,
    book: BookOpen,
    headset: Headset,
};

function openTab(tab: string) {
    window.dispatchEvent(new CustomEvent('retailex-beauty-open-tab', { detail: { tab } }));
}

export function ClinicDashboardV2Rich({ series }: { series: ClinicMonthPoint[] }) {
    const { tm } = useLanguage();
    const peak = series.reduce((max, row) => Math.max(max, row.appointments, row.newCustomers), 0);
    const yMax = peak > 0 ? peak : 1;

    const goesTo = (label: string, dest: string) =>
        tm('bClinicV2QaGoesTo').replace('{label}', label).replace('{dest}', dest);

    return (
            <div className="flex flex-col gap-3 lg:flex-row">
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

                <section
                    data-testid="clinic-rich-quick"
                    className="w-full shrink-0 bg-white px-3 py-3 lg:w-[340px]"
                    style={{ borderRadius: 16, border: `1px solid ${LINE}` }}
                >
                    <h2 className="flex items-center gap-1.5 text-sm font-extrabold">
                        <LayoutGrid size={16} color="#64748b" aria-hidden />
                        {tm('bClinicV2QuickAccess')}
                    </h2>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        {CLINIC_QUICK_LINKS.map((link) => (
                            <QuickLink key={link.id} link={link} label={tm(link.labelKey)} title={goesTo(tm(link.labelKey), tm(link.destKey))} />
                        ))}
                    </div>
                </section>
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

function QuickLink({ link, label, title }: { link: ClinicQuickLink; label: string; title: string }) {
    const Icon = ICONS[link.icon];
    return (
        <button
            type="button"
            data-testid="clinic-quick-link"
            data-tab={link.tab}
            data-proxy={link.proxy ? '1' : '0'}
            title={title}
            onClick={() => openTab(link.tab)}
            className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-lg bg-white px-1 py-2 text-center text-[11px] font-semibold leading-tight text-slate-700"
            style={{ border: `1.5px dashed ${link.color}` }}
        >
            <Icon size={18} color={link.color} aria-hidden />
            <span>{label}</span>
        </button>
    );
}
