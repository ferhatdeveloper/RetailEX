import { useMemo, type ReactNode } from 'react';
import { Crown } from 'lucide-react';
import { Cell, Pie, PieChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { beautyAppointmentDateKey } from '../../../utils/dateLocal';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { buildClinicV2View } from '../../../utils/clinicV2Charts';
import { CLINIC_V2_PALETTE as P } from '../clinicShellV2';

type Props = {
    /** Mevcut tahsilat KPI'sı — formül bu bileşende yeniden hesaplanmaz. */
    revenue: number;
    appointmentCount: number;
    cancelledCount: number;
    appointments: BeautyAppointment[];
    specialists: BeautySpecialist[];
    todayStr: string;
};

function money(n: number): string {
    return formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });
}

export function ClinicDashboardV2({
    revenue,
    appointmentCount,
    cancelledCount,
    appointments,
    specialists,
    todayStr,
}: Props) {
    const { tm } = useLanguage();
    const view = useMemo(
        () =>
            buildClinicV2View({
                appointments,
                specialists,
                todayStr,
                dateKeyOf: beautyAppointmentDateKey,
                unassignedLabel: tm('bClinicV2Unassigned'),
            }),
        [appointments, specialists, todayStr, tm],
    );

    const statusLabel: Record<string, string> = {
        completed: tm('bKpiCompletedLabel'),
        pending: tm('bKpiPendingLabel'),
        cancelled: tm('bKpiCancelledLabel'),
    };
    const statusColor: Record<string, string> = {
        completed: P.completed,
        pending: P.pending,
        cancelled: P.cancelled,
    };
    const statusSum = view.status.reduce((s, row) => s + row.count, 0);
    const pieData = view.status
        .filter((row) => row.count > 0)
        .map((row) => ({
            name: statusLabel[row.key] ?? row.key,
            value: row.count,
            fill: statusColor[row.key] ?? P.pink,
        }));

    const hourCount = Math.max(1, Math.round((view.dayEndMin - view.dayStartMin) / 60));
    const hourPx = 52;
    const boardHeight = hourCount * hourPx;

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-3 sm:p-5" style={{ background: P.bg }}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h1 className="flex items-center gap-2 text-lg font-extrabold tracking-tight" style={{ color: P.text }}>
                        <Crown size={16} color={P.pink} aria-hidden />
                        {tm('bClinicPanelTitle')}
                        <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white"
                            style={{ background: P.pink }}
                        >
                            V2
                        </span>
                    </h1>
                    <p className="mt-0.5 text-xs font-medium" style={{ color: P.muted }}>
                        {new Date().toLocaleDateString(tm('localeCode'), {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                        })}
                    </p>
                </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Kpi label={tm('bClinicV2KpiAppointments')} value={String(appointmentCount)} />
                <Kpi label={tm('cebeGirenNakit')} value={money(revenue)} />
                <Kpi label={tm('bKpiCancelledLabel')} value={String(cancelledCount)} />
                <Kpi
                    label={tm('bClinicV2KpiOccupancy')}
                    value={`${view.occupancyRate}%`}
                    sub={tm('bClinicV2OccupancyHint')}
                />
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)]">
                <section
                    className="min-w-0 overflow-hidden rounded-lg border bg-white"
                    style={{ borderColor: P.border }}
                >
                    <header className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: P.border }}>
                        <span className="text-sm font-extrabold" style={{ color: P.text }}>
                            {tm('bClinicV2DayBoard')}
                        </span>
                        <span className="text-[11px] font-semibold" style={{ color: P.muted }}>
                            {tm('bClinicV2OccupancyHint')}
                        </span>
                    </header>
                    {view.dayStaff.length === 0 ? (
                        <EmptyFigure />
                    ) : (
                        <div className="overflow-x-auto">
                            <div
                                className="grid"
                                style={{
                                    gridTemplateColumns: `64px repeat(${view.dayStaff.length}, minmax(148px, 1fr))`,
                                    minWidth: 64 + view.dayStaff.length * 148,
                                }}
                            >
                                <div className="border-b border-r px-2 py-2 text-[10px] font-bold uppercase" style={{ borderColor: P.border, color: P.muted }}>
                                    {tm('time')}
                                </div>
                                {view.dayStaff.map((col) => (
                                    <div
                                        key={col.id}
                                        className="truncate border-b px-2 py-2 text-xs font-extrabold"
                                        style={{ borderColor: P.border, color: P.pinkDeep, borderTop: `3px solid ${col.color}` }}
                                    >
                                        {col.name}
                                    </div>
                                ))}
                                <div className="relative border-r" style={{ height: boardHeight, borderColor: P.border }}>
                                    {Array.from({ length: hourCount }, (_, i) => (
                                        <div
                                            key={i}
                                            className="absolute left-0 right-0 px-1 text-[10px] font-semibold"
                                            style={{ top: i * hourPx, color: P.muted, height: hourPx }}
                                        >
                                            {formatHour(view.dayStartMin + i * 60)}
                                        </div>
                                    ))}
                                </div>
                                {view.dayStaff.map((col) => (
                                    <div key={col.id} className="relative border-l" style={{ height: boardHeight, borderColor: P.border }}>
                                        {Array.from({ length: hourCount }, (_, i) => (
                                            <div
                                                key={i}
                                                className="absolute left-0 right-0 border-t"
                                                style={{ top: i * hourPx, borderColor: '#fce7f3' }}
                                            />
                                        ))}
                                        {view.blocks
                                            .filter((b) => b.staffId === col.id)
                                            .map((b) => {
                                                const top = ((b.startMin - view.dayStartMin) / 60) * hourPx;
                                                const height = Math.max(22, (Math.max(b.durationMin, 15) / 60) * hourPx - 4);
                                                return (
                                                    <div
                                                        key={b.id}
                                                        className="absolute overflow-hidden rounded px-1.5 py-1 text-[11px] leading-tight"
                                                        style={{
                                                            top: top + 2,
                                                            height,
                                                            left: 4,
                                                            right: 4,
                                                            background: P.pinkSoft,
                                                            borderLeft: `3px solid ${statusColor[blockStatusKey(b.status)] ?? P.pink}`,
                                                            color: P.text,
                                                        }}
                                                        title={`${b.customerName} · ${b.serviceName} · ${money(b.price)}`}
                                                    >
                                                        <div className="truncate font-extrabold">{b.customerName || tm('bCustomerFallbackName')}</div>
                                                        <div className="truncate font-semibold" style={{ color: P.pinkDeep }}>
                                                            {b.serviceName}
                                                        </div>
                                                        <div className="font-bold">{money(b.price)}</div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                <div className="flex min-w-0 flex-col gap-3">
                    <ChartCard title={tm('bClinicV2StatusChart')}>
                        {statusSum === 0 ? (
                            <EmptyFigure />
                        ) : (
                            <div className="flex items-center gap-2">
                                <div className="h-40 w-40 shrink-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={36} outerRadius={62} stroke="none">
                                                {pieData.map((entry) => (
                                                    <Cell key={entry.name} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <ul className="min-w-0 flex-1 space-y-1 text-xs font-semibold" style={{ color: P.text }}>
                                    {view.status.map((row) => (
                                        <li key={row.key} className="flex items-center justify-between gap-2">
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className="inline-block h-2 w-2 rounded-full" style={{ background: statusColor[row.key] }} />
                                                {statusLabel[row.key]}
                                            </span>
                                            <span>{row.count}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </ChartCard>

                    <ChartCard title={tm('bClinicV2ServiceRevenue')}>
                        {view.serviceRevenue.length === 0 ? (
                            <EmptyFigure />
                        ) : (
                            <div className="h-44">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={view.serviceRevenue} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: P.text }} />
                                        <Tooltip formatter={(value) => money(Number(value ?? 0))} />
                                        <Bar dataKey="amount" fill={P.pink} radius={[0, 4, 4, 0]} maxBarSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </ChartCard>

                    <ChartCard title={tm('bClinicV2StaffOccupancy')}>
                        {view.staffOccupancy.length === 0 ? (
                            <EmptyFigure />
                        ) : (
                            <div className="h-44">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={view.staffOccupancy} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: P.text }} />
                                        <Tooltip formatter={(value) => `${Number(value ?? 0)}%`} />
                                        <Bar dataKey="rate" fill={P.pinkDeep} radius={[0, 4, 4, 0]} maxBarSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </ChartCard>
                </div>
            </div>
        </div>
    );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-lg border bg-white px-3 py-3" style={{ borderColor: P.border, borderTop: `3px solid ${P.pink}` }}>
            <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: P.muted }}>
                {label}
            </div>
            <div className="mt-1 text-2xl font-extrabold leading-none" style={{ color: P.text }}>
                {value}
            </div>
            {sub ? (
                <div className="mt-1 text-[11px] font-semibold" style={{ color: P.muted }}>
                    {sub}
                </div>
            ) : null}
        </div>
    );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: P.border }}>
            <h2 className="mb-1 text-xs font-extrabold" style={{ color: P.pinkDeep }}>
                {title}
            </h2>
            {children}
        </section>
    );
}

function EmptyFigure() {
    return (
        <div className="flex h-36 items-center justify-center text-2xl font-extrabold" style={{ color: P.muted }}>
            0
        </div>
    );
}

function formatHour(totalMin: number): string {
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}

function blockStatusKey(status: string): 'completed' | 'pending' | 'cancelled' {
    if (status === 'completed') return 'completed';
    if (status === 'cancelled' || status === 'canceled' || status === 'no_show') return 'cancelled';
    return 'pending';
}
