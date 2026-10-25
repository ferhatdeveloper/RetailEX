import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Calendar, CalendarRange, ChevronLeft, ChevronRight, Clock, Phone } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useBeautyTimeFormat } from '../../../hooks/useBeautyTimeFormat';
import { beautyService } from '../../../services/beautyService';
import { BeautyServiceReportCrmModal } from '../../reports/BeautyServiceReportCrmModal';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import type { BeautyAppointment, BeautyDevice, BeautyService } from '../../../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd } from '../../../utils/dateLocal';
import {
    clinicCallBoardBounds,
    filterClinicCallBoardRows,
    groupClinicCallBoardByService,
    selectClinicCallBoardRows,
    type ClinicCallTab,
} from '../../../utils/clinicCallBoard';
import { computeClinicDayKpis, listClinicTodayAppointments } from '../../../utils/clinicDashboardStats';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { useBeautyStore } from '../store/useBeautyStore';

const LINE = '#e6ebf2';
const VIOLET = '#7c3aed';
const TEXT = '#111827';
const MUTED = '#9ca3af';
const AMBER = '#d97706';
const GREEN = '#059669';
const PURPLE = '#9333ea';

function money(n: number): string {
    return formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });
}

function statusView(status: string, tm: (key: string) => string): { label: string; color: string; bg: string } {
    const map: Record<string, { label: string; color: string; bg: string }> = {
        scheduled: { label: tm('bAppointmentScheduled'), color: '#6366f1', bg: '#eef2ff' },
        confirmed: { label: tm('bAppointmentConfirmed'), color: '#0284c7', bg: '#e0f2fe' },
        pre_paid: { label: tm('bAppointmentPrePaid') || 'Ön Ödeme Alındı', color: '#0d9488', bg: '#ccfbf1' },
        in_progress: { label: tm('bAppointmentStarted'), color: '#d97706', bg: '#fef3c7' },
        completed: { label: tm('bAppointmentCompleted'), color: '#059669', bg: '#d1fae5' },
        cancelled: { label: tm('bAppointmentCancelled'), color: '#dc2626', bg: '#fee2e2' },
        no_show: { label: tm('bAppointmentNoShow'), color: '#6b7280', bg: '#f3f4f6' },
    };
    return map[status] ?? map.scheduled;
}

export function ClinicV2ActivityPair({
    appointments,
    todayStr,
}: {
    appointments: BeautyAppointment[];
    todayStr: string;
}) {
    const { tm } = useLanguage();
    const { formatTime } = useBeautyTimeFormat();
    const services = useBeautyStore((s) => s.services);
    const devices = useBeautyStore((s) => s.devices);
    const loadServices = useBeautyStore((s) => s.loadServices);
    const loadDevices = useBeautyStore((s) => s.loadDevices);
    const updateAppointment = useBeautyStore((s) => s.updateAppointment);

    const [callTab, setCallTab] = useState<ClinicCallTab>('today');
    const [callMonthOffset, setCallMonthOffset] = useState(0);
    const [callRowsRaw, setCallRowsRaw] = useState<BeautyAppointment[]>([]);
    const [callLoading, setCallLoading] = useState(false);
    const [callFilterServiceId, setCallFilterServiceId] = useState('');
    const [callFilterDeviceId, setCallFilterDeviceId] = useState('');
    const [callGroupByService, setCallGroupByService] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    const [crmAppointment, setCrmAppointment] = useState<BeautyAppointment | null>(null);
    const [rangeFrom, setRangeFrom] = useState(() => formatLocalYmd(new Date()));
    const [rangeTo, setRangeTo] = useState(() => {
        const x = new Date();
        x.setDate(x.getDate() + 14);
        return formatLocalYmd(x);
    });

    useEffect(() => {
        void loadServices?.().catch(() => {});
        void loadDevices?.().catch(() => {});
    }, [loadServices, loadDevices]);

    useEffect(() => {
        const { start, end } = clinicCallBoardBounds({
            tab: callTab,
            now: new Date(),
            monthOffset: callMonthOffset,
            rangeFrom,
            rangeTo,
        });
        let cancelled = false;
        setCallLoading(true);
        beautyService
            .getAppointmentsInRange(start, end)
            .then((rows) => {
                if (!cancelled) setCallRowsRaw(selectClinicCallBoardRows(rows));
            })
            .catch(() => {
                if (!cancelled) setCallRowsRaw([]);
            })
            .finally(() => {
                if (!cancelled) setCallLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [callTab, callMonthOffset, rangeFrom, rangeTo, refreshTick]);

    const callRows = useMemo(
        () => filterClinicCallBoardRows(callRowsRaw, callFilterServiceId, callFilterDeviceId),
        [callRowsRaw, callFilterServiceId, callFilterDeviceId],
    );
    const callGroups = useMemo(() => groupClinicCallBoardByService(callRows), [callRows]);

    const todayKpis = useMemo(
        () => computeClinicDayKpis({
            appointments,
            todayStr,
            dateKeyOf: beautyAppointmentDateKey,
        }),
        [appointments, todayStr],
    );
    const todayApts = useMemo(
        () => listClinicTodayAppointments(todayKpis.todayApts),
        [todayKpis.todayApts],
    );

    const markCallDone = useCallback(async (id: string) => {
        const stamp = new Date().toISOString();
        try {
            await updateAppointment?.(id, { confirmation_call_at: stamp });
            setCallRowsRaw((prev) => prev.map((r) => (r.id === id ? { ...r, confirmation_call_at: stamp } : r)));
        } catch {
            /* V1 ile aynı: sessiz */
        }
    }, [updateAppointment]);

    const markActivityDone = useCallback(async (id: string) => {
        const stamp = new Date().toISOString();
        try {
            await updateAppointment?.(id, { pre_visit_activity_at: stamp });
            setCallRowsRaw((prev) => prev.map((r) => (r.id === id ? { ...r, pre_visit_activity_at: stamp } : r)));
        } catch {
            /* V1 ile aynı: sessiz */
        }
    }, [updateAppointment]);

    const serviceOptions = useMemo(
        () => (services ?? [])
            .filter((s) => s.is_active !== false)
            .slice()
            .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr')),
        [services],
    );
    const deviceOptions = useMemo(
        () => (devices ?? [])
            .filter((d) => d.is_active)
            .slice()
            .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr')),
        [devices],
    );

    const todayColumns = useMemo<ColumnDef<BeautyAppointment>[]>(() => [
        {
            id: 'clock',
            accessorFn: (row) => formatTime(row.appointment_time ?? row.time),
            header: tm('bTimeHeader'),
            cell: ({ row }) => (
                <span className="font-bold">{formatTime(row.original.appointment_time ?? row.original.time)}</span>
            ),
        },
        {
            id: 'customerService',
            accessorFn: (row) => `${row.customer_name || ''} ${row.service_name || ''}`,
            header: tm('bCustomerServiceHeader'),
            cell: ({ row }) => (
                <div className="min-w-0">
                    <div className="truncate font-bold">{row.original.customer_name || tm('bCustomerFallbackName')}</div>
                    <div className="truncate text-xs text-slate-500">
                        {row.original.service_name || '—'}
                        {row.original.specialist_name ? ` · ${row.original.specialist_name}` : ''}
                    </div>
                </div>
            ),
        },
        {
            id: 'lengthMin',
            accessorFn: (row) => Number(row.duration ?? 0),
            header: tm('bDurationHeader'),
            cell: ({ row }) => (
                <span className="inline-flex items-center gap-1 text-slate-500">
                    <Clock size={11} />
                    {row.original.duration ?? '?'}{tm('bDkSuffix')}
                </span>
            ),
        },
        {
            id: 'aptState',
            accessorFn: (row) => statusView(String(row.status ?? ''), tm).label,
            header: tm('bStatus'),
            meta: { defaultVisible: true },
            cell: ({ row }) => {
                const cfg = statusView(String(row.original.status ?? ''), tm);
                return (
                    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                    </span>
                );
            },
        },
        {
            id: 'amount',
            accessorFn: (row) => Number(row.total_price ?? 0),
            header: tm('bDashboardColAmount'),
            cell: ({ row }) => {
                const n = Number(row.original.total_price ?? 0);
                return <span className="font-bold">{n > 0 ? money(n) : '—'}</span>;
            },
        },
    ], [formatTime, tm]);

    const groupColumns = useMemo<ColumnDef<BeautyAppointment>[]>(() => [
        {
            id: 'when',
            accessorFn: (row) => `${beautyAppointmentDateKey(row)} ${row.appointment_time ?? row.time ?? ''}`,
            header: tm('date'),
            cell: ({ row }) => (
                <span>
                    {beautyAppointmentDateKey(row.original)}{' '}
                    <span className="text-slate-500">{formatTime(row.original.appointment_time ?? row.original.time)}</span>
                </span>
            ),
        },
        {
            id: 'customerName',
            accessorFn: (row) => row.customer_name || '',
            header: tm('customer'),
            cell: ({ row }) => row.original.customer_name || tm('bCustomerFallbackName'),
        },
        {
            id: 'staffName',
            accessorFn: (row) => String(row.specialist_name ?? row.staff_name ?? ''),
            header: tm('bStaffView'),
            cell: ({ row }) => String(row.original.specialist_name ?? row.original.staff_name ?? '').trim() || '—',
        },
        {
            id: 'deviceName',
            accessorFn: (row) => String(row.device_name ?? ''),
            header: tm('bDeviceView'),
            cell: ({ row }) => String(row.original.device_name ?? '').trim() || '—',
        },
        {
            id: 'amount',
            accessorFn: (row) => Number(row.total_price ?? 0),
            header: tm('amount'),
            cell: ({ row }) => money(Number(row.original.total_price ?? 0)),
        },
        {
            id: 'aptState',
            accessorFn: (row) => statusView(String(row.status ?? ''), tm).label,
            header: tm('status'),
            meta: { defaultVisible: true },
            cell: ({ row }) => {
                const cfg = statusView(String(row.original.status ?? ''), tm);
                return (
                    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                    </span>
                );
            },
        },
        {
            id: 'marks',
            header: '',
            enableColumnFilter: false,
            cell: ({ row }) => (
                <MarkButtons
                    apt={row.original}
                    calledLabel={tm('bCallMarked')}
                    activityLabel={tm('bActivityMarked')}
                    onCall={markCallDone}
                    onActivity={markActivityDone}
                />
            ),
        },
    ], [formatTime, markActivityDone, markCallDone, tm]);

    const tabs = [
        ['today', 'bCallBoardToday'],
        ['tomorrow', 'bCallBoardTomorrow'],
        ['week', 'bCallBoardWeek'],
        ['month', 'bCallBoardMonth'],
    ] as const;

    const cellClass = 'flex h-full min-h-0 min-w-0 flex-col overflow-y-auto bg-white';
    const cellStyle = { borderRadius: 16, border: `1px solid ${LINE}` } as const;

    return (
        <>
        <section
            data-testid="clinic-v2-activity-pair"
            className="grid grid-cols-2 gap-2 max-sm:grid-cols-1 sm:h-[26rem] sm:grid-rows-2"
        >
            <article data-testid="clinic-v2-activity-cell" className={cellClass} style={cellStyle}>
                <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: LINE, background: '#faf9fd' }}>
                    <div className="flex items-center gap-2">
                        <Phone size={16} color={VIOLET} />
                        <h2 className="text-[13px] font-extrabold" style={{ color: TEXT }}>{tm('bCallBoardTitle')}</h2>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {tabs.map(([id, labelKey]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => {
                                    if (id === 'month') setCallMonthOffset(0);
                                    setCallTab(id);
                                }}
                                className="rounded-md px-3 py-1 text-[11px] font-bold"
                                style={{
                                    border: callTab === id ? 'none' : `1px solid ${LINE}`,
                                    background: callTab === id ? VIOLET : '#fff',
                                    color: callTab === id ? '#fff' : '#6b7280',
                                }}
                            >
                                {tm(labelKey)}
                            </button>
                        ))}
                        {callTab === 'month' ? (
                            <>
                                <button type="button" title={tm('bCallBoardPrevMonth')} aria-label={tm('bCallBoardPrevMonth')} onClick={() => setCallMonthOffset((o) => o - 1)} className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[11px] font-bold text-slate-600" style={{ borderColor: LINE }}>
                                    <ChevronLeft size={14} />
                                    {tm('bCallBoardPrevMonth')}
                                </button>
                                <button type="button" title={tm('bCallBoardNextMonth')} aria-label={tm('bCallBoardNextMonth')} onClick={() => setCallMonthOffset((o) => o + 1)} className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[11px] font-bold text-slate-600" style={{ borderColor: LINE }}>
                                    {tm('bCallBoardNextMonth')}
                                    <ChevronRight size={14} />
                                </button>
                            </>
                        ) : null}
                        <button
                            type="button"
                            title={tm('bCallBoardDateRange')}
                            aria-label={tm('bCallBoardDateRange')}
                            onClick={() => setCallTab('range')}
                            className="inline-flex items-center rounded-md px-2 py-1"
                            style={{
                                border: callTab === 'range' ? 'none' : `1px solid ${LINE}`,
                                background: callTab === 'range' ? VIOLET : '#fff',
                                color: callTab === 'range' ? '#fff' : '#6b7280',
                            }}
                        >
                            <CalendarRange size={15} />
                        </button>
                    </div>
                </header>
                {callTab === 'range' ? (
                    <div className="flex flex-wrap gap-2 border-b px-3 py-2" style={{ borderColor: LINE }}>
                        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-slate-400">
                            {tm('bCallBoardRangeFrom')}
                            <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="rounded-md border px-2 py-1 text-xs font-semibold normal-case text-slate-800" style={{ borderColor: LINE }} />
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-slate-400">
                            {tm('bCallBoardRangeTo')}
                            <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="rounded-md border px-2 py-1 text-xs font-semibold normal-case text-slate-800" style={{ borderColor: LINE }} />
                        </label>
                    </div>
                ) : null}
                <div className="flex flex-wrap gap-3 border-b px-3 py-2 text-[10px] font-semibold text-slate-400" style={{ borderColor: LINE }}>
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: AMBER }} />{tm('bCallBoardLegendCall')}</span>
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PURPLE }} />{tm('bCallBoardLegendActivity')}</span>
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GREEN }} />{tm('bCallBoardLegendOk')}</span>
                </div>
                <div className="flex flex-wrap items-end gap-2 border-b px-3 py-2" style={{ borderColor: LINE }}>
                    <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{tm('beautyServiceFilterLabel')}</span>
                        <select
                            aria-label={tm('beautyServiceFilterLabel')}
                            value={callFilterServiceId}
                            onChange={(e) => setCallFilterServiceId(e.target.value)}
                            className="rounded-md border bg-white px-2 py-1.5 text-xs font-semibold"
                            style={{ borderColor: LINE }}
                        >
                            <option value="">{tm('beautyServiceFilterPlaceholder')}</option>
                            {serviceOptions.map((s: BeautyService) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{tm('bCallBoardFilterDevice')}</span>
                        <select
                            aria-label={tm('bCallBoardFilterDevice')}
                            value={callFilterDeviceId}
                            onChange={(e) => setCallFilterDeviceId(e.target.value)}
                            className="rounded-md border bg-white px-2 py-1.5 text-xs font-semibold"
                            style={{ borderColor: LINE }}
                        >
                            <option value="">{tm('bCallBoardAllDevices')}</option>
                            {deviceOptions.map((d: BeautyDevice) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className="inline-flex items-center gap-2 pb-1 text-xs font-bold" style={{ color: TEXT }}>
                        <input
                            type="checkbox"
                            checked={callGroupByService}
                            onChange={(e) => setCallGroupByService(e.target.checked)}
                            style={{ accentColor: VIOLET }}
                        />
                        {tm('bCallBoardGroupByService')}
                    </label>
                </div>
            </article>

            <article data-testid="clinic-v2-activity-cell" className={cellClass} style={cellStyle}>
                <header className="flex items-center justify-between px-3 py-3">
                    <div>
                        <h2 className="text-[13px] font-extrabold" style={{ color: TEXT }}>{tm('bTodayAppointmentsTitle')}</h2>
                        <p className="mt-0.5 text-[11px] font-medium" style={{ color: MUTED }}>
                            {tm('bRegisteredAppointmentsSub').replace('{n}', String(todayKpis.total))}
                        </p>
                    </div>
                    <Calendar size={16} color={VIOLET} />
                </header>
            </article>

            <article data-testid="clinic-v2-activity-cell" className={cellClass} style={cellStyle}>
                <div className="min-h-0 flex-1">
                    {callLoading ? (
                        <p className="px-4 py-6 text-center text-xs" style={{ color: MUTED }}>…</p>
                    ) : callRows.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs" style={{ color: MUTED }}>{tm('bCallBoardEmpty')}</p>
                    ) : callGroupByService ? (
                        <div className="flex flex-col gap-3 p-2">
                            {callGroups.map((g) => (
                                <div key={g.serviceName} className="overflow-hidden rounded-lg border" style={{ borderColor: LINE }}>
                                    <button
                                        type="button"
                                        title={tm('beautyServiceHeaderCrmHint')}
                                        onClick={() => {
                                            const first = g.items[0];
                                            if (first) setCrmAppointment(first);
                                        }}
                                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-extrabold text-white"
                                        style={{ background: '#ec4899' }}
                                    >
                                        <span>{g.serviceName}</span>
                                        <span className="text-xs font-bold">{tm('subTotal')}: {money(g.sum)}</span>
                                    </button>
                                    <DevExDataGrid
                                        data={g.items}
                                        columns={groupColumns}
                                        pageSize={50}
                                        enableExcelExport={false}
                                        enablePrint={false}
                                        enableRefresh={false}
                                        autoFooterSums={false}
                                        showColumnVisibilityToolbar={false}
                                        storageNamespace={`clinicV2CallGroup-${g.serviceName}`}
                                        onRowClick={(row) => setCrmAppointment(row)}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        callRows.map((apt) => {
                            const hasCall = Boolean(apt.confirmation_call_at);
                            const hasAct = Boolean(apt.pre_visit_activity_at);
                            const accent = hasCall && hasAct ? GREEN : !hasCall ? AMBER : PURPLE;
                            return (
                                <div key={apt.id} className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: LINE, borderLeft: `4px solid ${accent}` }}>
                                    <button
                                        type="button"
                                        title={tm('bCallBoardRowOpenCrm')}
                                        onClick={() => setCrmAppointment(apt)}
                                        className="min-w-0 flex-1 text-left"
                                    >
                                        <p className="text-xs font-extrabold" style={{ color: TEXT }}>{apt.customer_name ?? tm('bCustomerFallbackName')}</p>
                                        <p className="mt-0.5 text-[11px] font-semibold" style={{ color: VIOLET }}>
                                            {beautyAppointmentDateKey(apt)} {formatTime(apt.appointment_time ?? apt.time)} · {apt.service_name ?? '—'}
                                            {apt.device_name ? ` · ${apt.device_name}` : ''}
                                            <span className="ml-2 font-semibold text-slate-400">({tm('bCallBoardCrmLinkHint')})</span>
                                        </p>
                                    </button>
                                    <MarkButtons
                                        apt={apt}
                                        calledLabel={tm('bCallMarked')}
                                        activityLabel={tm('bActivityMarked')}
                                        onCall={markCallDone}
                                        onActivity={markActivityDone}
                                    />
                                </div>
                            );
                        })
                    )}
                </div>
            </article>

            <article data-testid="clinic-v2-activity-cell" className={cellClass} style={cellStyle}>
                {todayApts.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-4 py-6" style={{ color: MUTED }}>
                        <Calendar size={32} style={{ opacity: 0.3 }} />
                        <p className="mt-2 text-xs font-semibold">{tm('bNoAppointmentsToday')}</p>
                    </div>
                ) : (
                    <DevExDataGrid
                        data={todayApts}
                        columns={todayColumns}
                        pageSize={50}
                        enableExcelExport={false}
                        enablePrint={false}
                        enableRefresh={false}
                        autoFooterSums={false}
                        showColumnVisibilityToolbar={false}
                        storageNamespace="clinicV2TodayApts"
                    />
                )}
            </article>
        </section>
        {crmAppointment ? (
            <BeautyServiceReportCrmModal
                open
                onClose={() => setCrmAppointment(null)}
                appointment={crmAppointment}
                accentColor={VIOLET}
                onSaved={() => setRefreshTick((t) => t + 1)}
            />
        ) : null}
        </>
    );
}

function MarkButtons({
    apt,
    calledLabel,
    activityLabel,
    onCall,
    onActivity,
}: {
    apt: BeautyAppointment;
    calledLabel: string;
    activityLabel: string;
    onCall: (id: string) => void;
    onActivity: (id: string) => void;
}) {
    const hasCall = Boolean(apt.confirmation_call_at);
    const hasAct = Boolean(apt.pre_visit_activity_at);
    return (
        <div className="flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                disabled={hasCall}
                onClick={() => onCall(apt.id)}
                className="rounded-md px-2 py-1 text-[10px] font-extrabold"
                style={{ background: hasCall ? '#d1fae5' : '#fef3c7', color: hasCall ? GREEN : AMBER }}
            >
                {calledLabel}
            </button>
            <button
                type="button"
                disabled={hasAct}
                onClick={() => onActivity(apt.id)}
                className="rounded-md px-2 py-1 text-[10px] font-extrabold"
                style={{ background: hasAct ? '#f3e8ff' : '#ede9fe', color: hasAct ? PURPLE : VIOLET }}
            >
                {activityLabel}
            </button>
        </div>
    );
}
