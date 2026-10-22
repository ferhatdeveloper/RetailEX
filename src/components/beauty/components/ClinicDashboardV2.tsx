import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Calendar, CheckCircle2, Users, Wallet } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd, getWeekRangeLocal } from '../../../utils/dateLocal';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';
import { buildClinicV2View } from '../../../utils/clinicV2Charts';
import { buildClinicMonthSeries, clinicChartFetchBounds } from '../../../utils/clinicDashboardRich';
import { ClinicDashboardV2Rich } from './ClinicDashboardV2Rich';
import { ClinicV2SearchGrafanaBar } from './ClinicV2SearchGrafanaBar';
import { ClinicV2ActivityPair } from './ClinicV2ActivityPair';
import { beautyService } from '../../../services/beautyService';
import { useBeautyStore } from '../store/useBeautyStore';
import {
    readClinicV2CrmPanel,
    readClinicV2SurveyPanel,
    useClinicV2CrmMenu,
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

const PAGE = '#f3f6fb';
const LINE = '#e6ebf2';
const BLUE = '#2563eb';
const RED = '#f04438';
const TEAL = '#14b8a6';
const ORANGE = '#f59e0b';

function money(n: number): string {
    return formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });
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
    while (cur <= end && out.length < 8) {
        out.push(cur);
        cur = addDaysYmd(cur, 1);
    }
    return out;
}

function sessionName(): string {
    try {
        const raw = localStorage.getItem('exretail_session');
        if (!raw) return '';
        const user = JSON.parse(raw)?.user;
        return String(user?.full_name || user?.username || '').trim();
    } catch {
        return '';
    }
}

function statusKind(status: string): 'new' | 'confirmed' | 'arrived' | 'noshow' | 'cancelled' {
    const s = status.toLowerCase();
    if (s === 'confirmed' || s === 'pre_paid') return 'confirmed';
    if (s === 'in_progress' || s === 'completed') return 'arrived';
    if (s === 'no_show') return 'noshow';
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    return 'new';
}

function openTab(tab: string) {
    window.dispatchEvent(new CustomEvent('retailex-beauty-open-tab', { detail: { tab } }));
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
    const customers = useBeautyStore((s) => s.customers);
    const loadCustomers = useBeautyStore((s) => s.loadCustomers);
    const [dayOffset, setDayOffset] = useState(0);
    const [clock, setClock] = useState(() => new Date());
    const [boardQuery, setBoardQuery] = useState('');
    const [surveyOn, setSurveyOn] = useState(readClinicV2SurveyPanel);
    const [crmOn, setCrmOn] = useState(readClinicV2CrmPanel);
    const crmMenu = useClinicV2CrmMenu();
    const [fetched, setFetched] = useState<BeautyAppointment[] | null>(null);
    const [name] = useState(sessionName);

    const selectedYmd = addDaysYmd(todayStr, dayOffset);
    const locale = tm('localeCode') || 'tr-TR';

    useEffect(() => {
        const id = window.setInterval(() => setClock(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        void loadCustomers().catch(() => {});
    }, [loadCustomers]);

    const range = useMemo(() => {
        const week = getWeekRangeLocal(ymdToDate(todayStr));
        const bounds = clinicChartFetchBounds(todayStr);
        const weekEnd = addDaysYmd(week.end, 1);
        const from180 = addDaysYmd(todayStr, -180);
        const start = [week.start, from180, bounds.start].reduce((a, b) => (a < b ? a : b));
        const end = bounds.end > weekEnd ? bounds.end : weekEnd;
        return { start, end };
    }, [todayStr]);

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
    const todayRows = source.filter((a) => beautyAppointmentDateKey(a) === todayStr);
    const selectedRows = source.filter((a) => beautyAppointmentDateKey(a) === selectedYmd);
    const selectedVisible = selectedRows
        .filter(beautyAptVisibleOnSchedule)
        .slice()
        .sort((a, b) => String(a.appointment_time || a.time || '').localeCompare(String(b.appointment_time || b.time || '')));
    const boardNeedle = boardQuery.trim().toLocaleLowerCase('tr-TR');
    const listedRows = boardNeedle
        ? selectedVisible.filter((apt) => {
            const blob = `${apt.customer_name || ''} ${apt.service_name || ''} ${apt.appointment_time || apt.time || ''}`;
            return blob.toLocaleLowerCase('tr-TR').includes(boardNeedle);
        })
        : selectedVisible;

    const buckets = useMemo(() => {
        const c = { scheduled: 0, confirmed: 0, arrived: 0, noshow: 0, cancelled: 0 };
        for (const row of todayRows) {
            const kind = statusKind(String(row.status || ''));
            if (kind === 'new') c.scheduled += 1;
            else if (kind === 'confirmed') c.confirmed += 1;
            else if (kind === 'arrived') c.arrived += 1;
            else if (kind === 'noshow') c.noshow += 1;
            else c.cancelled += 1;
        }
        return c;
    }, [todayRows]);

    const noShowRate = todayRows.length ? Math.round((buckets.noshow / todayRows.length) * 100) : 0;
    const occupancy = useMemo(
        () =>
            buildClinicV2View({
                appointments: source,
                specialists,
                todayStr,
                dateKeyOf: beautyAppointmentDateKey,
                unassignedLabel: tm('bClinicV2Unassigned'),
            }).occupancyRate,
        [source, specialists, todayStr, tm],
    );

    const week = useMemo(() => getWeekRangeLocal(ymdToDate(todayStr)), [todayStr]);
    const weekDays = eachYmd(week.start, week.end);
    const weekCounts = weekDays.map((day) => ({
        day,
        count: source.filter((a) => beautyAppointmentDateKey(a) === day && beautyAptVisibleOnSchedule(a)).length,
    }));
    const weekTotal = weekCounts.reduce((s, row) => s + row.count, 0);

    const monthSeries = useMemo(
        () =>
            buildClinicMonthSeries({
                anchorYmd: todayStr,
                locale,
                appointments: source.map((row) => ({ dateKey: beautyAppointmentDateKey(row) })),
                customers: customers.map((row) => ({ createdAt: row.created_at })),
            }),
        [todayStr, locale, source, customers],
    );

    const monthPrefix = todayStr.slice(0, 7);
    const datedCustomers = customers.filter((c) => String(c.created_at || '').startsWith(monthPrefix));
    const knowCreated = customers.some((c) => String(c.created_at || '').trim());
    const customerValue = knowCreated ? datedCustomers.length : customers.length;
    const customerLabel = knowCreated ? tm('bClinicV2NewThisMonth') : tm('bClinicV2RegisteredCustomers');

    const showSteps = customers.length === 0 && appointmentCount === 0 && selectedVisible.length === 0 && dayOffset === 0;
    const dateLabel = ymdToDate(todayStr).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
    });
    const clockLabel = clock.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const fill = (tpl: string, n: number) => tpl.replace('{n}', String(n));

    return (
        <div className="h-full min-h-0 overflow-y-auto" style={{ background: PAGE, color: '#0f172a' }}>
            <div className="mx-auto flex max-w-[1240px] flex-col gap-3 p-3">
                <section
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
                    style={{ borderRadius: 16, background: 'linear-gradient(90deg,#1e40af 0%,#2563eb 52%,#38bdf8 100%)' }}
                >
                    <div className="min-w-0">
                        <div className="text-[22px] font-extrabold leading-tight">
                            {tm('bClinicV2Hello')}{name ? `, ${name}` : ''}
                        </div>
                        <div className="mt-1 text-[13px] font-medium text-white/90">
                            {dateLabel}
                            <span className="mx-2 opacity-70">·</span>
                            {clockLabel}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-bold">
                            <Chip text={fill(tm('bClinicV2CustomerChip'), customers.length)} />
                            <Chip text={fill(tm('bClinicV2ApptCount'), appointmentCount)} />
                            <Chip text={`${tm('bClinicV2KpiOccupancy')} %${occupancy}`} />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <GhostButton label={tm('bClinicV2OpenCalendar')} onClick={() => openTab('calendar')} />
                        <GhostButton label={tm('bClinicV2OpenClients')} onClick={() => openTab('clients')} />
                        <GhostButton label={tm('bClinicV2OpenServices')} onClick={() => openTab('services')} />
                        <GhostButton
                            label={tm('bClinicV2SurveyToggle')}
                            pressed={surveyOn}
                            onClick={() => {
                                const next = !surveyOn;
                                setSurveyOn(next);
                                writeClinicV2SurveyPanel(next);
                            }}
                        />
                        {crmMenu ? (
                            <GhostButton
                                label={tm('bClinicV2CrmToggle')}
                                pressed={crmOn}
                                onClick={() => {
                                    const next = !crmOn;
                                    setCrmOn(next);
                                    writeClinicV2CrmPanel(next);
                                }}
                            />
                        ) : null}
                    </div>
                </section>

                {showSteps ? (
                    <section className="bg-white px-4 py-3" style={{ borderRadius: 16, border: `1px solid ${LINE}` }}>
                        <h2 className="text-[15px] font-extrabold">{tm('bClinicV2StepsTitle')}</h2>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                            <Step n={1} title={tm('bClinicV2StepServices')} action={tm('bClinicV2StepGo')} onClick={() => openTab('services')} />
                            <Step n={2} title={tm('bClinicV2StepClients')} action={tm('bClinicV2StepGo')} onClick={() => openTab('clients')} />
                            <Step n={3} title={tm('bClinicV2StepCalendar')} action={tm('bClinicV2StepGo')} onClick={() => openTab('calendar')} />
                        </div>
                    </section>
                ) : null}

                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                    <Metric
                        tint={BLUE}
                        title={tm('bClinicV2KpiAppointments')}
                        value={String(appointmentCount)}
                        icon={<Calendar size={18} />}
                        footer={`${tm('bClinicV2StatusNew')} ${buckets.scheduled} · ${tm('bClinicV2StatusConfirmed')} ${buckets.confirmed} · ${tm('bClinicV2StatusArrived')} ${buckets.arrived} · ${tm('bClinicV2StatusNoShow')} ${buckets.noshow} · ${tm('bKpiCancelledLabel')} ${cancelledCount || buckets.cancelled}`}
                    />
                    <Metric
                        tint={RED}
                        title={tm('bClinicV2NoShowRate')}
                        value={`%${noShowRate}`}
                        icon={<Users size={18} />}
                        footer={`${buckets.noshow} / ${todayRows.length || 0}`}
                    />
                    <Metric
                        tint={TEAL}
                        title={tm('cebeGirenNakit')}
                        value={money(revenue)}
                        icon={<Wallet size={18} />}
                        footer={tm('bClinicV2Today')}
                    />
                    <Metric
                        tint={ORANGE}
                        title={customerLabel}
                        value={String(customerValue)}
                        icon={<Users size={18} />}
                        footer={fill(tm('bClinicV2CustomerChip'), customers.length)}
                    />
                </section>

                <ClinicV2SearchGrafanaBar query={boardQuery} onQueryChange={setBoardQuery} />

                <ClinicV2ActivityPair appointments={source} todayStr={todayStr} />

                <section data-testid="clinic-v2-day" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.65fr) minmax(260px, 0.85fr)', gap: 12 }}>
                    <div className="bg-white" style={{ borderRadius: 16, border: `1px solid ${LINE}`, minHeight: 220 }}>
                        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: LINE }}>
                            <DaySwitch
                                active={dayOffset === -1}
                                label={tm('bClinicV2Yesterday')}
                                onClick={() => setDayOffset(-1)}
                            />
                            <DaySwitch
                                active={dayOffset === 0}
                                label={tm('bClinicV2Today')}
                                onClick={() => setDayOffset(0)}
                            />
                            <DaySwitch
                                active={dayOffset === 1}
                                label={tm('bClinicV2Tomorrow')}
                                onClick={() => setDayOffset(1)}
                            />
                            <button
                                type="button"
                                onClick={() => openTab('calendar')}
                                className="ml-auto rounded-lg border px-3 py-1 text-xs font-bold"
                                style={{ borderColor: LINE, color: BLUE }}
                            >
                                {tm('bClinicV2OpenCalendar')}
                            </button>
                        </div>
                        {selectedVisible.length === 0 ? (
                            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                                <CheckCircle2 size={42} color={BLUE} />
                                <div className="mt-3 text-[16px] font-extrabold">{tm('bClinicV2NoAppointments')}</div>
                                <button
                                    type="button"
                                    onClick={() => openTab('calendar')}
                                    className="mt-3 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                                    style={{ background: BLUE }}
                                >
                                    {tm('bClinicV2AddAppointment')}
                                </button>
                            </div>
                        ) : listedRows.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">{tm('bClinicV2SearchEmpty')}</div>
                        ) : (
                            <div>
                                {listedRows.map((apt) => (
                                    <div
                                        key={apt.id}
                                        className="grid items-center gap-2 border-b px-3 py-2"
                                        style={{
                                            gridTemplateColumns: '72px minmax(0,1fr) auto',
                                            borderColor: LINE,
                                            borderLeft: `4px solid ${kindColor(statusKind(String(apt.status || '')))}`,
                                        }}
                                    >
                                        <div className="text-sm font-extrabold">{String(apt.appointment_time || apt.time || '').slice(0, 5)}</div>
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-bold">{apt.customer_name || tm('bCustomerFallbackName')}</div>
                                            <div className="truncate text-xs font-semibold text-slate-500">{apt.service_name || '—'}</div>
                                        </div>
                                        <div className="text-sm font-extrabold">{money(Number(apt.total_price) || 0)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {surveyOn ? (
                            <aside className="border-t px-3 py-2 text-xs" style={{ borderColor: LINE }}>
                                <div className="font-extrabold">{tm('bClinicV2SurveyToggle')}</div>
                                {selectedVisible.filter((a) => String(a.status) === 'completed').length === 0 ? (
                                    <div className="py-1 font-semibold text-slate-400">0</div>
                                ) : (
                                    selectedVisible
                                        .filter((a) => String(a.status) === 'completed')
                                        .map((a) => (
                                            <div key={`s-${a.id}`} className="truncate py-0.5">
                                                {String(a.appointment_time || '').slice(0, 5)} {a.customer_name} {a.service_name}
                                            </div>
                                        ))
                                )}
                            </aside>
                        ) : null}
                        {crmMenu && crmOn ? (
                            <aside className="border-t px-3 py-2 text-xs" style={{ borderColor: LINE }}>
                                <div className="font-extrabold">{tm('bClinicV2CrmToggle')}</div>
                                {uniqueNames(selectedVisible).length === 0 ? (
                                    <div className="py-1 font-semibold text-slate-400">0</div>
                                ) : (
                                    uniqueNames(selectedVisible).map((n) => (
                                        <div key={n} className="truncate py-0.5">{n}</div>
                                    ))
                                )}
                            </aside>
                        ) : null}
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="bg-white px-3 py-3" style={{ borderRadius: 16, border: `1px solid ${LINE}` }}>
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-extrabold">{tm('bClinicV2WeekProgram')}</h2>
                                <span className="text-xs font-bold text-slate-500">{fill(tm('bClinicV2ApptCount'), weekTotal)}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-7 gap-1">
                                {weekCounts.map((row) => {
                                    const on = row.day === todayStr;
                                    return (
                                        <div
                                            key={row.day}
                                            className="rounded-md px-0.5 py-1 text-center"
                                            style={{ background: on ? '#eff6ff' : '#f8fafc', color: on ? BLUE : '#334155' }}
                                        >
                                            <div className="text-[10px] font-bold">
                                                {ymdToDate(row.day).toLocaleDateString(locale, { weekday: 'short' })}
                                            </div>
                                            <div className="text-sm font-extrabold">{row.count}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="bg-white px-3 py-4 text-center" style={{ borderRadius: 16, border: `1px solid ${LINE}` }}>
                            <h2 className="text-sm font-extrabold">{tm('cebeGirenNakit')}</h2>
                            {revenue > 0 ? (
                                <div className="mt-2 text-2xl font-extrabold" style={{ color: TEAL }}>{money(revenue)}</div>
                            ) : (
                                <div className="mt-3 flex flex-col items-center text-sm font-semibold text-slate-500">
                                    <CheckCircle2 size={28} color="#22c55e" />
                                    <span className="mt-1">{tm('bClinicV2NoPayment')}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <ClinicDashboardV2Rich series={monthSeries} />
            </div>
        </div>
    );
}

function uniqueNames(rows: BeautyAppointment[]): string[] {
    const names = new Set<string>();
    for (const row of rows) {
        const name = String(row.customer_name || '').trim();
        if (name) names.add(name);
    }
    return Array.from(names);
}

function kindColor(kind: ReturnType<typeof statusKind>): string {
    if (kind === 'arrived') return TEAL;
    if (kind === 'confirmed') return BLUE;
    if (kind === 'noshow' || kind === 'cancelled') return RED;
    return ORANGE;
}

function Chip({ text }: { text: string }) {
    return (
        <span className="rounded-md bg-white/20 px-2 py-0.5">{text}</span>
    );
}

function GhostButton({ label, onClick, pressed }: { label: string; onClick: () => void; pressed?: boolean }) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            onClick={onClick}
            className="rounded-lg px-3 py-1.5 text-xs font-bold"
            style={{ background: pressed ? '#fff' : 'rgba(255,255,255,0.18)', color: pressed ? BLUE : '#fff' }}
        >
            {label}
        </button>
    );
}

function Step({ n, title, action, onClick }: { n: number; title: string; action: string; onClick: () => void }) {
    return (
        <div className="flex items-center gap-2 rounded-xl px-2 py-2" style={{ background: '#f8fafc', border: `1px solid ${LINE}` }}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: BLUE }}>{n}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{title}</span>
            <button type="button" onClick={onClick} className="rounded-md px-2 py-1 text-xs font-bold text-white" style={{ background: BLUE }}>{action}</button>
        </div>
    );
}

function Metric({
    tint,
    title,
    value,
    footer,
    icon,
}: {
    tint: string;
    title: string;
    value: string;
    footer: string;
    icon: ReactNode;
}) {
    return (
        <article className="relative overflow-hidden px-3 py-3 text-white" style={{ borderRadius: 16, background: tint, minHeight: 108 }}>
            <div className="pr-10 text-[12px] font-bold uppercase tracking-wide text-white/90">{title}</div>
            <div className="mt-1 text-[30px] font-extrabold leading-none">{value}</div>
            <div className="mt-2 text-[11px] font-semibold text-white/90">{footer}</div>
            <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/20">{icon}</span>
        </article>
    );
}

function DaySwitch({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="rounded-lg px-3 py-1 text-xs font-extrabold"
            style={{ background: active ? BLUE : '#f8fafc', color: active ? '#fff' : '#334155' }}
        >
            {label}
        </button>
    );
}
