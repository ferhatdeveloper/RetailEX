import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd, getWeekRangeLocal } from '../../../utils/dateLocal';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { buildClinicV2View, type ClinicV2DayBlock, type ClinicV2ViewModel } from '../../../utils/clinicV2Charts';
import { beautyService } from '../../../services/beautyService';
import {
    CLINIC_V2_PALETTE as P,
    readClinicV2CrmPanel,
    readClinicV2SurveyPanel,
    writeClinicV2CrmPanel,
    writeClinicV2SurveyPanel,
} from '../clinicShellV2';

type Props = {
    /** Bugünün tahsilatı. Formül bu bileşende yeniden hesaplanmaz. */
    revenue: number;
    appointmentCount: number;
    cancelledCount: number;
    appointments: BeautyAppointment[];
    specialists: BeautySpecialist[];
    todayStr: string;
};

type Mode = 'day' | 'week';

const ROW_PX = 28;

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
    const [anchorYmd, setAnchorYmd] = useState(todayStr);
    const [mode, setMode] = useState<Mode>('day');
    const [staffFilter, setStaffFilter] = useState('');
    const [surveyOn, setSurveyOn] = useState(readClinicV2SurveyPanel);
    const [crmOn, setCrmOn] = useState(readClinicV2CrmPanel);
    const [fetched, setFetched] = useState<BeautyAppointment[] | null>(null);

    const range = useMemo(() => {
        if (mode === 'week') return getWeekRangeLocal(ymdToDate(anchorYmd));
        return { start: anchorYmd, end: anchorYmd };
    }, [mode, anchorYmd]);

    useEffect(() => {
        let cancel = false;
        beautyService
            .getAppointmentsInRange(range.start, range.end)
            .then((rows) => {
                if (!cancel) setFetched(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!cancel) setFetched(null);
            });
        return () => {
            cancel = true;
        };
    }, [range.start, range.end]);

    const source = fetched !== null ? fetched : appointments;
    const specs = staffFilter
        ? specialists.filter((s) => s.id === staffFilter)
        : specialists;
    const dayKeys = mode === 'week' ? eachYmd(range.start, range.end) : [anchorYmd];

    const views = useMemo(
        () =>
            dayKeys.map((key) =>
                buildClinicV2View({
                    appointments: source,
                    specialists: specs,
                    todayStr: key,
                    dateKeyOf: beautyAppointmentDateKey,
                    unassignedLabel: tm('bClinicV2Unassigned'),
                }),
            ),
        [dayKeys, source, specs, tm],
    );

    const statusLabels = useMemo(
        () => ({
            completed: tm('bKpiCompletedLabel'),
            pending: tm('bKpiPendingLabel'),
            cancelled: tm('bKpiCancelledLabel'),
        }),
        [tm],
    );
    const summary = useMemo(() => mergeViews(views, mode, statusLabels), [views, mode, statusLabels]);
    const showTahsilat = mode === 'day' && anchorYmd === todayStr;
    const locale = tm('localeCode') || 'tr-TR';
    const dateLabel = ymdToDate(anchorYmd).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
    });

    const step = mode === 'week' ? 7 : 1;
    const dayView = views[0];
    const dayColumns = boardColumns(dayView, tm('bClinicV2Unassigned'), tm('bClinicV2ApptCount'), tm('bClinicV2EmptySlots'));

    const toggleSurvey = () => {
        const next = !surveyOn;
        setSurveyOn(next);
        writeClinicV2SurveyPanel(next);
    };
    const toggleCrm = () => {
        const next = !crmOn;
        setCrmOn(next);
        writeClinicV2CrmPanel(next);
    };

    const surveyRows = surveyOn ? summary.completedBlocks : [];
    const crmRows = crmOn ? uniqueCustomers(summary.allBlocks) : [];

    return (
        <div className="flex h-full min-h-0 flex-col" style={{ background: P.bg, color: P.text }}>
            <div
                className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-white px-3 py-2"
                style={{ borderColor: P.line }}
            >
                <div className="flex items-center gap-1">
                    <IconButton label={tm('bClinicV2Prev')} onClick={() => setAnchorYmd((d) => addDaysYmd(d, -step))}>
                        <ChevronLeft size={16} />
                    </IconButton>
                    <span
                        className="rounded-md border bg-white px-3 py-1 text-sm font-semibold"
                        style={{ borderColor: P.line, color: P.text }}
                    >
                        {dateLabel}
                    </span>
                    <IconButton label={tm('bClinicV2Next')} onClick={() => setAnchorYmd((d) => addDaysYmd(d, step))}>
                        <ChevronRight size={16} />
                    </IconButton>
                </div>
                <button
                    type="button"
                    onClick={() => setAnchorYmd(todayStr)}
                    className="rounded-md px-3 py-1 text-xs font-bold text-white"
                    style={{ background: anchorYmd === todayStr ? P.accent : '#9ca3af' }}
                >
                    {tm('bClinicV2Today')}
                </button>
                <select
                    aria-label={tm('bClinicV2AllStaff')}
                    value={staffFilter}
                    onChange={(e) => setStaffFilter(e.target.value)}
                    className="h-8 max-w-[12rem] rounded-md border bg-white px-2 text-xs font-semibold"
                    style={{ borderColor: P.line, color: P.text }}
                >
                    <option value="">{tm('bClinicV2AllStaff')}</option>
                    {specialists
                        .filter((s) => s.is_active)
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
                        .map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                </select>
                <div className="ml-auto flex flex-wrap items-center gap-1">
                    <ToggleChip on={surveyOn} label={tm('bClinicV2SurveyToggle')} onClick={toggleSurvey} />
                    <ToggleChip on={crmOn} label={tm('bClinicV2CrmToggle')} onClick={toggleCrm} />
                    <div className="ml-1 flex overflow-hidden rounded-md border" style={{ borderColor: P.line }}>
                        <Seg active={mode === 'day'} label={tm('bClinicV2Day')} onClick={() => setMode('day')} />
                        <Seg active={mode === 'week'} label={tm('bClinicV2Week')} onClick={() => setMode('week')} />
                    </div>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
                {mode === 'day' ? (
                    <TimeBoard
                        startMin={dayView?.dayStartMin ?? 8 * 60}
                        endMin={dayView?.dayEndMin ?? 20 * 60}
                        columns={dayColumns}
                        locale={locale}
                        timeLabel={tm('time')}
                        customerFallback={tm('bCustomerFallbackName')}
                    />
                ) : (
                    <TimeBoard
                        startMin={8 * 60}
                        endMin={20 * 60}
                        timeLabel={tm('time')}
                        customerFallback={tm('bCustomerFallbackName')}
                        locale={locale}
                        columns={dayKeys.map((key, i) => {
                            const view = views[i];
                            const blocks = view?.blocks ?? [];
                            return {
                                id: key,
                                title: ymdToDate(key).toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }),
                                subtitle: tm('bClinicV2ApptCount').replace('{n}', String(blocks.length)),
                                selected: key === anchorYmd,
                                blocks,
                            };
                        })}
                    />
                )}
            </div>

            <div className="grid shrink-0 grid-cols-1 gap-2 border-t bg-white px-3 py-2 md:grid-cols-3" style={{ borderColor: P.line }}>
                <MiniStat
                    title={tm('bClinicV2KpiAppointments')}
                    value={String(mode === 'day' && anchorYmd === todayStr ? appointmentCount : summary.appointmentCount)}
                    extra={`${tm('bKpiCancelledLabel')}: ${mode === 'day' && anchorYmd === todayStr ? cancelledCount : summary.cancelled}`}
                />
                <MiniStat
                    title={tm('cebeGirenNakit')}
                    value={showTahsilat ? money(revenue) : '0'}
                />
                <MiniStat
                    title={tm('bClinicV2KpiOccupancy')}
                    value={`${summary.occupancyRate}%`}
                />
            </div>
            <div className="grid shrink-0 grid-cols-1 gap-2 px-3 pb-3 md:grid-cols-3">
                <ChartCard title={tm('bClinicV2StatusChart')}>
                    {summary.statusSum === 0 ? (
                        <ZeroLine />
                    ) : (
                        <div className="flex h-24 items-center gap-2">
                            <div className="h-24 w-24 shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={summary.pie} dataKey="value" nameKey="name" innerRadius={22} outerRadius={36} stroke="none">
                                            {summary.pie.map((entry) => (
                                                <Cell key={entry.name} fill={entry.fill} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <ul className="min-w-0 flex-1 text-[11px] font-semibold">
                                {summary.status.map((row) => (
                                    <li key={row.key} className="flex justify-between gap-2">
                                        <span>{row.label}</span>
                                        <span>{row.count}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </ChartCard>
                <ChartCard title={tm('bClinicV2ServiceRevenue')}>
                    {summary.serviceRevenue.length === 0 ? (
                        <ZeroLine />
                    ) : (
                        <div className="h-24">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={summary.serviceRevenue} layout="vertical" margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10, fill: P.text }} />
                                    <Tooltip formatter={(value) => money(Number(value ?? 0))} />
                                    <Bar dataKey="amount" fill="#64748b" radius={[0, 3, 3, 0]} maxBarSize={12} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </ChartCard>
                <ChartCard title={tm('bClinicV2StaffOccupancy')}>
                    {summary.staffOccupancy.length === 0 ? (
                        <ZeroLine />
                    ) : (
                        <div className="h-24">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={summary.staffOccupancy} layout="vertical" margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10, fill: P.text }} />
                                    <Tooltip formatter={(value) => `${Number(value ?? 0)}%`} />
                                    <Bar dataKey="rate" fill="#94a3b8" radius={[0, 3, 3, 0]} maxBarSize={12} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </ChartCard>
            </div>

            {surveyOn ? (
                <div className="shrink-0 border-t bg-white px-3 py-2 text-xs" style={{ borderColor: P.line }}>
                    <div className="mb-1 font-bold">{tm('bClinicV2SurveyToggle')}</div>
                    {surveyRows.length === 0 ? (
                        <ZeroLine />
                    ) : (
                        surveyRows.map((b) => (
                            <div key={b.id} className="flex gap-3 border-t py-1" style={{ borderColor: P.lineSoft }}>
                                <span className="w-12 font-semibold">{formatHour(b.startMin)}</span>
                                <span className="min-w-0 flex-1 truncate">{b.customerName || tm('bCustomerFallbackName')}</span>
                                <span className="truncate" style={{ color: P.muted }}>{b.serviceName}</span>
                            </div>
                        ))
                    )}
                </div>
            ) : null}

            {crmOn ? (
                <div className="shrink-0 border-t bg-white px-3 py-2 text-xs" style={{ borderColor: P.line }}>
                    <div className="mb-1 font-bold">{tm('bClinicV2CrmToggle')}</div>
                    {crmRows.length === 0 ? (
                        <ZeroLine />
                    ) : (
                        crmRows.map((name) => (
                            <div key={name} className="border-t py-1" style={{ borderColor: P.lineSoft }}>{name}</div>
                        ))
                    )}
                </div>
            ) : null}
        </div>
    );
}

type BoardColumn = {
    id: string;
    title: string;
    subtitle: string;
    selected?: boolean;
    blocks: ClinicV2DayBlock[];
};

function TimeBoard({
    startMin,
    endMin,
    columns,
    timeLabel,
    customerFallback,
    locale,
}: {
    startMin: number;
    endMin: number;
    columns: BoardColumn[];
    timeLabel: string;
    customerFallback: string;
    locale: string;
}) {
    const slots: number[] = [];
    for (let t = startMin; t < endMin; t += 30) slots.push(t);
    const height = Math.max(ROW_PX, slots.length * ROW_PX);
    void locale;
    return (
        <div className="overflow-x-auto rounded-md border bg-white" style={{ borderColor: P.line }}>
            <div
                className="grid"
                style={{
                    gridTemplateColumns: `56px repeat(${Math.max(1, columns.length)}, minmax(140px, 1fr))`,
                    minWidth: 56 + Math.max(1, columns.length) * 140,
                }}
            >
                <div className="sticky top-0 z-10 border-b border-r bg-white px-1 py-2 text-[10px] font-semibold" style={{ borderColor: P.line, color: P.muted }}>
                    {timeLabel}
                </div>
                {columns.map((col) => (
                    <div
                        key={col.id}
                        className="sticky top-0 z-10 border-b bg-white px-2 py-1.5"
                        style={{ borderColor: P.line }}
                    >
                        <div className="truncate text-center text-xs font-bold" style={{ color: col.selected ? P.accent : P.text }}>
                            {col.title}
                        </div>
                        <div className="truncate text-center text-[10px] font-medium" style={{ color: P.muted }}>{col.subtitle}</div>
                    </div>
                ))}
                <div className="relative border-r" style={{ height, borderColor: P.line }}>
                    {slots.map((t, i) => (
                        <div
                            key={t}
                            className="absolute left-0 right-0 border-t px-1 text-[10px] font-medium leading-none"
                            style={{ top: i * ROW_PX, height: ROW_PX, borderColor: P.lineSoft, color: P.muted, paddingTop: 2 }}
                        >
                            {formatHour(t)}
                        </div>
                    ))}
                </div>
                {columns.map((col) => (
                    <div key={`${col.id}-body`} className="relative border-l" style={{ height, borderColor: P.lineSoft, background: '#f8fafc' }}>
                        {slots.map((t, i) => (
                            <div key={t} className="absolute left-0 right-0 border-t" style={{ top: i * ROW_PX, borderColor: P.lineSoft }} />
                        ))}
                        {col.blocks.map((b) => {
                            const top = ((b.startMin - startMin) / 30) * ROW_PX;
                            const span = Math.max(ROW_PX - 1, ((Math.max(b.durationMin, 30)) / 30) * ROW_PX - 1);
                            return (
                                <div
                                    key={b.id}
                                    className="absolute overflow-hidden px-1.5 py-0.5 text-[11px] leading-tight"
                                    style={{
                                        top: Math.max(0, top),
                                        height: span,
                                        left: 2,
                                        right: 2,
                                        background: P.block,
                                        border: `1px solid ${P.line}`,
                                        borderLeft: `3px solid ${statusColor(b.status)}`,
                                        color: P.text,
                                    }}
                                    title={`${formatHour(b.startMin)} ${b.customerName} ${b.serviceName} ${money(b.price)}`}
                                >
                                    <div className="truncate font-semibold">{formatHour(b.startMin)}</div>
                                    <div className="truncate">{b.customerName || customerFallback}</div>
                                    <div className="truncate" style={{ color: P.muted }}>{b.serviceName}</div>
                                    <div className="truncate font-semibold">{money(b.price)}</div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

function boardColumns(
    view: ClinicV2ViewModel | undefined,
    unassigned: string,
    apptTpl: string,
    emptyTpl: string,
): BoardColumn[] {
    const staff = view?.dayStaff?.length
        ? view.dayStaff
        : [{ id: 'unassigned', name: unassigned, color: '#94a3b8' }];
    const start = view?.dayStartMin ?? 8 * 60;
    const end = view?.dayEndMin ?? 20 * 60;
    return staff.map((col) => {
        const blocks = (view?.blocks ?? []).filter((b) => b.staffId === col.id);
        const count = blocks.length;
        const open = emptySlotCount(blocks, start, end);
        return {
            id: col.id,
            title: col.name,
            subtitle: `${apptTpl.replace('{n}', String(count))} · ${emptyTpl.replace('{n}', String(open))}`,
            blocks,
        };
    });
}

function emptySlotCount(blocks: ClinicV2DayBlock[], start: number, end: number): number {
    let open = 0;
    for (let t = start; t < end; t += 30) {
        const hit = blocks.some((b) => b.startMin < t + 30 && b.startMin + Math.max(b.durationMin, 30) > t);
        if (!hit) open += 1;
    }
    return open;
}

function mergeViews(
    views: ClinicV2ViewModel[],
    mode: Mode,
    labels: { completed: string; pending: string; cancelled: string },
) {
    const statusKeys = ['completed', 'pending', 'cancelled'] as const;
    const status = statusKeys.map((key) => ({
        key,
        label: labels[key],
        count: views.reduce((sum, view) => sum + (view.status.find((s) => s.key === key)?.count ?? 0), 0),
    }));
    const revenue = new Map<string, number>();
    const occ = new Map<string, { name: string; sum: number; n: number }>();
    const allBlocks: ClinicV2DayBlock[] = [];
    for (const view of views) {
        for (const row of view.serviceRevenue) revenue.set(row.name, (revenue.get(row.name) ?? 0) + row.amount);
        for (const row of view.staffOccupancy) {
            const prev = occ.get(row.id);
            occ.set(row.id, {
                name: row.name,
                sum: (prev?.sum ?? 0) + row.rate,
                n: (prev?.n ?? 0) + 1,
            });
        }
        allBlocks.push(...view.blocks);
    }
    const pieColors: Record<string, string> = {
        completed: P.completed,
        pending: P.pending,
        cancelled: P.cancelled,
    };
    const named = status;
    return {
        status: named,
        statusSum: named.reduce((s, row) => s + row.count, 0),
        pie: named.filter((row) => row.count > 0).map((row) => ({
            name: row.key,
            value: row.count,
            fill: pieColors[row.key] ?? '#64748b',
        })),
        serviceRevenue: Array.from(revenue.entries())
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'tr')),
        staffOccupancy: Array.from(occ.values()).map((row) => ({
            name: row.name,
            rate: row.n > 0 ? Math.round(row.sum / row.n) : 0,
        })),
        occupancyRate: mode === 'day' ? (views[0]?.occupancyRate ?? 0) : averageRate(views),
        appointmentCount: named.find((s) => s.key === 'completed')!.count + named.find((s) => s.key === 'pending')!.count,
        cancelled: named.find((s) => s.key === 'cancelled')?.count ?? 0,
        allBlocks,
        completedBlocks: allBlocks.filter((b) => b.status === 'completed'),
    };
}

function averageRate(views: ClinicV2ViewModel[]): number {
    if (!views.length) return 0;
    const sum = views.reduce((s, view) => s + view.occupancyRate, 0);
    return Math.round(sum / views.length);
}

function uniqueCustomers(blocks: ClinicV2DayBlock[]): string[] {
    const names = new Set<string>();
    for (const b of blocks) {
        const name = b.customerName.trim();
        if (name) names.add(name);
    }
    return Array.from(names);
}

function statusColor(status: string): string {
    if (status === 'completed') return P.completed;
    if (status === 'cancelled' || status === 'canceled' || status === 'no_show') return P.cancelled;
    return P.pending;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            className="flex h-8 w-8 items-center justify-center rounded-md border bg-white"
            style={{ borderColor: P.line, color: P.text }}
        >
            {children}
        </button>
    );
}

function Seg({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="px-3 py-1 text-xs font-bold"
            style={{
                background: active ? '#fff' : '#f9fafb',
                color: active ? P.accent : P.muted,
            }}
        >
            {label}
        </button>
    );
}

function ToggleChip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className="rounded-md border px-2 py-1 text-xs font-bold"
            style={{
                borderColor: on ? P.accent : P.line,
                color: on ? P.accent : P.muted,
                background: '#fff',
            }}
        >
            {label}
        </button>
    );
}

function MiniStat({ title, value, extra }: { title: string; value: string; extra?: string }) {
    return (
        <div className="rounded-md border bg-white px-2 py-1.5" style={{ borderColor: P.line }}>
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: P.muted }}>{title}</div>
            <div className="text-sm font-bold">{value}{extra ? <span className="ml-2 text-[11px] font-medium" style={{ color: P.muted }}>{extra}</span> : null}</div>
        </div>
    );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="rounded-md border bg-white px-2 py-1.5" style={{ borderColor: P.line }}>
            <h2 className="text-[11px] font-bold" style={{ color: P.text }}>{title}</h2>
            {children}
        </section>
    );
}

function ZeroLine() {
    return <div className="py-1 text-sm font-semibold" style={{ color: P.muted }}>0</div>;
}

function formatHour(totalMin: number): string {
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}

function ymdToDate(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map((n) => Number(n));
    return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function addDaysYmd(ymd: string, days: number): string {
    const dt = ymdToDate(ymd);
    dt.setDate(dt.getDate() + days);
    return formatLocalYmd(dt);
}

function eachYmd(start: string, end: string): string[] {
    const out: string[] = [];
    let cur = start;
    while (cur <= end && out.length < 14) {
        out.push(cur);
        cur = addDaysYmd(cur, 1);
    }
    return out;
}
