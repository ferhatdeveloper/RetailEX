
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
    Calendar, CalendarRange, Users, CheckCircle2, Clock,
    Activity, TrendingUp,
    Phone,
    ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyAppointment } from '../../../types/beauty';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { beautyAppointmentDateKey, formatLocalYmd, getWeekRangeLocal, getMonthRangeLocal } from '../../../utils/dateLocal';
import { beautyService } from '../../../services/beautyService';
import { BeautyServiceReportCrmModal } from '../../reports/BeautyServiceReportCrmModal';
import '../ClinicStyles.css';

// ─── Design tokens (flat) ────────────────────────────────────────────────────
const T = {
    bg:          '#f7f6fb',
    surface:     '#ffffff',
    border:      '#e8e4f0',
    borderHover: '#c4b5fd',
    textPrimary: '#111827',
    textSub:     '#6b7280',
    textMuted:   '#9ca3af',
    violet:      '#7c3aed',
    violetLight: '#ede9fe',
    pink:        '#db2777',
    /** Hizmet Bazlı Rapor / gruplu görünüm başlığı (Güzellik raporları ile aynı ton) */
    reportPink:  '#ec4899',
    pinkLight:   '#fce7f3',
    green:       '#059669',
    greenLight:  '#d1fae5',
    amber:       '#d97706',
    amberLight:  '#fef3c7',
    blue:        '#2563eb',
    blueLight:   '#dbeafe',
};

// ─── Flat KPI card ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, icon: Icon }: {
    label: string; value: string | number; sub?: string;
    accent: string; accentBg?: string; icon: React.ElementType;
}) {
    return (
        <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderTop: `3px solid ${accent}`,
            borderRadius: 8, padding: '16px 18px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
                <Icon size={15} style={{ color: accent }} />
            </div>
            <p style={{ fontSize: 26, fontWeight: 800, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</p>
            {sub && <p style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginTop: 4 }}>{sub}</p>}
        </div>
    );
}

// ─── Component ───────────────────────────────────────────────────────────────
type CallTab = 'today' | 'tomorrow' | 'week' | 'month' | 'range';

export function ClinicDashboard() {
    const { tm, language } = useLanguage();
    const {
        appointments, services, specialists, devices,
        loadAppointments, loadServices, loadSpecialists, loadDevices, updateAppointment,
    } = useBeautyStore();
    const [callTab, setCallTab] = useState<CallTab>('today');
    /** Arama panosu «Bu ay» görünümünde takvim ayı (0 = içinde bulunulan ay). */
    const [callMonthOffset, setCallMonthOffset] = useState(0);
    const [callRowsRaw, setCallRowsRaw] = useState<BeautyAppointment[]>([]);
    const [callLoading, setCallLoading] = useState(false);
    const [callFilterServiceId, setCallFilterServiceId] = useState('');
    const [callFilterDeviceId, setCallFilterDeviceId] = useState('');
    const [callBoardRefreshTick, setCallBoardRefreshTick] = useState(0);
    const [callBoardCrmAppointment, setCallBoardCrmAppointment] = useState<BeautyAppointment | null>(null);
    /** İkinci görünüm: Hizmet Bazlı Rapor benzeri pembe başlık + alt tablo */
    const [callGroupByService, setCallGroupByService] = useState(false);
    const [callRangeFrom, setCallRangeFrom] = useState(() => formatLocalYmd(new Date()));
    const [callRangeTo, setCallRangeTo] = useState(() => {
        const x = new Date();
        x.setDate(x.getDate() + 14);
        return formatLocalYmd(x);
    });

    const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = useMemo(() => ({
        scheduled:   { label: tm('bAppointmentScheduled'), color: '#6366f1', bg: '#eef2ff' },
        confirmed:   { label: tm('bAppointmentConfirmed'), color: '#0284c7', bg: '#e0f2fe' },
        in_progress: { label: tm('bAppointmentStarted'), color: '#d97706', bg: '#fef3c7' },
        completed:   { label: tm('bAppointmentCompleted'), color: '#059669', bg: '#d1fae5' },
        cancelled:   { label: tm('bAppointmentCancelled'), color: '#dc2626', bg: '#fee2e2' },
        no_show:     { label: tm('bAppointmentNoShow'), color: '#6b7280', bg: '#f3f4f6' },
    }), [language]);

    const todayStr = formatLocalYmd(new Date());

    useEffect(() => {
        loadAppointments(todayStr);
        loadServices();
        loadSpecialists();
        void loadDevices();
    }, []);

    useEffect(() => {
        const now = new Date();
        const today = formatLocalYmd(now);
        let start = today;
        let end = today;
        if (callTab === 'tomorrow') {
            const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            start = formatLocalYmd(t);
            end = start;
        } else if (callTab === 'week') {
            const w = getWeekRangeLocal(now);
            start = w.start;
            end = w.end;
        } else if (callTab === 'month') {
            const anchor = new Date(now.getFullYear(), now.getMonth() + callMonthOffset, 1);
            const m = getMonthRangeLocal(anchor);
            start = m.start;
            end = m.end;
        } else if (callTab === 'range') {
            let a = (callRangeFrom || today).trim();
            let b = (callRangeTo || today).trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(a)) a = today;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) b = today;
            if (a > b) {
                const t = a;
                a = b;
                b = t;
            }
            start = a;
            end = b;
        }
        let cancelled = false;
        setCallLoading(true);
        beautyService
            .getAppointmentsInRange(start, end)
            .then((rows) => {
                if (cancelled) return;
                const need = rows.filter((a) =>
                    a.status === AppointmentStatus.SCHEDULED ||
                    a.status === AppointmentStatus.CONFIRMED ||
                    a.status === AppointmentStatus.IN_PROGRESS
                );
                need.sort((a, b) => {
                    const da = beautyAppointmentDateKey(a).localeCompare(beautyAppointmentDateKey(b));
                    if (da !== 0) return da;
                    return (a.appointment_time ?? a.time ?? '').localeCompare(b.appointment_time ?? b.time ?? '');
                });
                setCallRowsRaw(need);
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
    }, [callTab, callMonthOffset, callBoardRefreshTick, callRangeFrom, callRangeTo]);

    const callRows = useMemo(() => {
        return callRowsRaw.filter((a) => {
            if (callFilterServiceId && String(a.service_id ?? '') !== String(callFilterServiceId)) return false;
            if (callFilterDeviceId && String(a.device_id ?? '') !== String(callFilterDeviceId)) return false;
            return true;
        });
    }, [callRowsRaw, callFilterServiceId, callFilterDeviceId]);

    const callRowsGrouped = useMemo(() => {
        const map = new Map<string, BeautyAppointment[]>();
        for (const a of callRows) {
            const name = (a.service_name && String(a.service_name).trim()) || '—';
            if (!map.has(name)) map.set(name, []);
            map.get(name)!.push(a);
        }
        for (const arr of map.values()) {
            arr.sort((x, y) => {
                const dx = beautyAppointmentDateKey(x).localeCompare(beautyAppointmentDateKey(y));
                if (dx !== 0) return dx;
                return String(x.appointment_time ?? x.time ?? '').localeCompare(
                    String(y.appointment_time ?? y.time ?? '')
                );
            });
        }
        return Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
            .map(([serviceName, items]) => ({
                serviceName,
                items,
                sum: items.reduce((s, it) => s + Number(it.total_price ?? 0), 0),
            }));
    }, [callRows]);

    const markCallDone = useCallback(
        async (id: string) => {
            try {
                await updateAppointment(id, { confirmation_call_at: new Date().toISOString() });
                setCallRowsRaw((prev) =>
                    prev.map((r) =>
                        r.id === id ? { ...r, confirmation_call_at: new Date().toISOString() } : r
                    )
                );
            } catch {
                /* toast optional */
            }
        },
        [updateAppointment]
    );

    const markActivityDone = useCallback(
        async (id: string) => {
            try {
                await updateAppointment(id, { pre_visit_activity_at: new Date().toISOString() });
                setCallRowsRaw((prev) =>
                    prev.map((r) =>
                        r.id === id ? { ...r, pre_visit_activity_at: new Date().toISOString() } : r
                    )
                );
            } catch {
                /* ignore */
            }
        },
        [updateAppointment]
    );

    const renderCallActivityButtons = (apt: BeautyAppointment) => {
        const hasCall = Boolean(apt.confirmation_call_at);
        const hasAct = Boolean(apt.pre_visit_activity_at);
        return (
            <div style={{ display: 'flex', flexShrink: 0, gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    disabled={hasCall}
                    onClick={() => void markCallDone(apt.id)}
                    style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: 'none',
                        background: hasCall ? T.greenLight : T.amberLight,
                        color: hasCall ? T.green : T.amber,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: hasCall ? 'default' : 'pointer',
                        opacity: hasCall ? 0.85 : 1,
                    }}
                >
                    {tm('bCallMarked')}
                </button>
                <button
                    type="button"
                    disabled={hasAct}
                    onClick={() => void markActivityDone(apt.id)}
                    style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: 'none',
                        background: hasAct ? '#f3e8ff' : T.violetLight,
                        color: hasAct ? '#9333ea' : T.violet,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: hasAct ? 'default' : 'pointer',
                        opacity: hasAct ? 0.85 : 1,
                    }}
                >
                    {tm('bActivityMarked')}
                </button>
            </div>
        );
    };

    const stats = useMemo(() => {
        const todayApts = appointments.filter(a => beautyAppointmentDateKey(a) === todayStr);
        const completed = todayApts.filter(a => a.status === AppointmentStatus.COMPLETED);
        const pending   = todayApts.filter(a => a.status === AppointmentStatus.SCHEDULED || a.status === AppointmentStatus.CONFIRMED);
        const inProg    = todayApts.filter(a => a.status === AppointmentStatus.IN_PROGRESS);
        const revenue   = completed.reduce((s, a) => s + (a.total_price || 0), 0);
        const rate      = todayApts.length ? Math.round((completed.length / todayApts.length) * 100) : 0;

        const sorted = [...todayApts].sort((a, b) => {
            return (a.appointment_time ?? a.time ?? '').localeCompare(b.appointment_time ?? b.time ?? '');
        });

        return { todayApts: sorted, completed: completed.length, pending: pending.length, inProg: inProg.length, revenue, rate, total: todayApts.length };
    }, [appointments, todayStr]);

    const fmt = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });

    const activeStaff = specialists.filter(s => s.is_active);
    const topServices = services.slice(0, 6);

    return (
        <div style={{ height: '100%', overflowY: 'auto', background: T.bg, padding: 20 }} className="custom-scrollbar">

            {/* ── Date strip ──────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 18, fontWeight: 800, color: T.textPrimary, letterSpacing: '-0.02em' }}>
                        {tm('bClinicPanelTitle')}
                    </h1>
                    <p style={{ fontSize: 12, fontWeight: 500, color: T.textMuted, marginTop: 2 }}>
                        {new Date().toLocaleDateString(tm('localeCode'), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: 6, padding: '6px 12px',
                }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.green, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tm('bLiveBadge')}</span>
                    <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>·</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>{tm('bTodayNAppointments').replace('{n}', String(stats.total))}</span>
                </div>
            </div>

            {/* ── KPI Strip ───────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                <KpiCard label={tm('bKpiDailyRevenue')}       value={fmt(stats.revenue)}   accent={T.violet}  icon={TrendingUp} />
                <KpiCard label={tm('bKpiCompletedLabel')}         value={stats.completed}      sub={tm('bKpiCompletionRateSub').replace('{n}', String(stats.rate))} accent={T.green}   icon={CheckCircle2} />
                <KpiCard label={tm('bKpiPendingLabel')}           value={stats.pending}        sub={tm('bKpiInProgressSub').replace('{n}', String(stats.inProg))} accent={T.amber} icon={Clock} />
                <KpiCard label={tm('bKpiActiveStaff')}     value={activeStaff.length}   sub={tm('bKpiTotalStaffSub').replace('{n}', String(specialists.length))} accent={T.blue}  icon={Users} />
            </div>

            {/* ── Ön arama / aktivite (Bugün · Yarın · Hafta · Ay) ───────────── */}
            <div style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                marginBottom: 20,
                overflow: 'hidden',
            }}>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '12px 16px',
                    borderBottom: `1px solid ${T.border}`,
                    background: '#faf9fd',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Phone size={16} style={{ color: T.violet }} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>{tm('bCallBoardTitle')}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {([
                            ['today', 'bCallBoardToday'],
                            ['tomorrow', 'bCallBoardTomorrow'],
                            ['week', 'bCallBoardWeek'],
                            ['month', 'bCallBoardMonth'],
                        ] as const).map(([id, labelKey]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => {
                                    if (id === 'month') setCallMonthOffset(0);
                                    setCallTab(id);
                                }}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: callTab === id ? 'none' : `1px solid ${T.border}`,
                                    background: callTab === id ? T.violet : '#fff',
                                    color: callTab === id ? '#fff' : T.textSub,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                {tm(labelKey)}
                            </button>
                        ))}
                        {callTab === 'month' && (
                            <>
                                <button
                                    type="button"
                                    title={tm('bCallBoardPrevMonth')}
                                    aria-label={tm('bCallBoardPrevMonth')}
                                    onClick={() => setCallMonthOffset((o) => o - 1)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        border: `1px solid ${T.border}`,
                                        background: '#fff',
                                        color: T.textSub,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <ChevronLeft size={14} strokeWidth={2.25} />
                                    {tm('bCallBoardPrevMonth')}
                                </button>
                                <button
                                    type="button"
                                    title={tm('bCallBoardNextMonth')}
                                    aria-label={tm('bCallBoardNextMonth')}
                                    onClick={() => setCallMonthOffset((o) => o + 1)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        border: `1px solid ${T.border}`,
                                        background: '#fff',
                                        color: T.textSub,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {tm('bCallBoardNextMonth')}
                                    <ChevronRight size={14} strokeWidth={2.25} />
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            title={tm('bCallBoardDateRange')}
                            aria-label={tm('bCallBoardDateRange')}
                            onClick={() => setCallTab('range')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: callTab === 'range' ? 'none' : `1px solid ${T.border}`,
                                background: callTab === 'range' ? T.violet : '#fff',
                                color: callTab === 'range' ? '#fff' : T.textSub,
                                cursor: 'pointer',
                            }}
                        >
                            <CalendarRange size={15} strokeWidth={2.25} />
                        </button>
                        {callTab === 'range' && (
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'flex-end',
                                    gap: 8,
                                }}
                            >
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {tm('bCallBoardRangeFrom')}
                                    </span>
                                    <input
                                        type="date"
                                        value={callRangeFrom}
                                        onChange={(e) => setCallRangeFrom(e.target.value)}
                                        style={{
                                            padding: '6px 8px',
                                            borderRadius: 6,
                                            border: `1px solid ${T.border}`,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: T.textPrimary,
                                            background: '#fff',
                                        }}
                                    />
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {tm('bCallBoardRangeTo')}
                                    </span>
                                    <input
                                        type="date"
                                        value={callRangeTo}
                                        onChange={(e) => setCallRangeTo(e.target.value)}
                                        style={{
                                            padding: '6px 8px',
                                            borderRadius: 6,
                                            border: `1px solid ${T.border}`,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: T.textPrimary,
                                            background: '#fff',
                                        }}
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                </div>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    padding: '8px 16px 10px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: T.textMuted,
                    borderBottom: `1px solid ${T.border}`,
                }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: T.amber }} />
                        {tm('bCallBoardLegendCall')}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: '#9333ea' }} />
                        {tm('bCallBoardLegendActivity')}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: T.green }} />
                        {tm('bCallBoardLegendOk')}
                    </span>
                </div>
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 16px 12px',
                        borderBottom: `1px solid ${T.border}`,
                        background: '#fff',
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {tm('beautyServiceFilterLabel')}
                        </span>
                        <select
                            value={callFilterServiceId}
                            onChange={(e) => setCallFilterServiceId(e.target.value)}
                            style={{
                                padding: '8px 10px',
                                borderRadius: 6,
                                border: `1px solid ${T.border}`,
                                fontSize: 12,
                                fontWeight: 600,
                                color: T.textPrimary,
                                background: '#fff',
                                minWidth: 180,
                                maxWidth: 280,
                                cursor: 'pointer',
                            }}
                        >
                            <option value="">{tm('beautyServiceFilterPlaceholder')}</option>
                            {services
                                .filter((s) => s.is_active !== false)
                                .slice()
                                .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr'))
                                .map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {tm('bCallBoardFilterDevice')}
                        </span>
                        <select
                            value={callFilterDeviceId}
                            onChange={(e) => setCallFilterDeviceId(e.target.value)}
                            style={{
                                padding: '8px 10px',
                                borderRadius: 6,
                                border: `1px solid ${T.border}`,
                                fontSize: 12,
                                fontWeight: 600,
                                color: T.textPrimary,
                                background: '#fff',
                                minWidth: 180,
                                maxWidth: 280,
                                cursor: 'pointer',
                            }}
                        >
                            <option value="">{tm('bCallBoardAllDevices')}</option>
                            {devices
                                .filter((d) => d.is_active)
                                .slice()
                                .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr'))
                                .map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                        </select>
                    </div>
                    <label
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            marginLeft: 4,
                            paddingTop: 18,
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={callGroupByService}
                            onChange={(e) => setCallGroupByService(e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: T.violet }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>{tm('bCallBoardGroupByService')}</span>
                    </label>
                </div>
                <div style={{ maxHeight: callGroupByService ? 520 : 280, overflowY: 'auto' }} className="custom-scrollbar">
                    {callLoading ? (
                        <p style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.textMuted }}>…</p>
                    ) : callRows.length === 0 ? (
                        <p style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.textMuted }}>{tm('bCallBoardEmpty')}</p>
                    ) : callGroupByService ? (
                        <div style={{ padding: '10px 10px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {callRowsGrouped.map((g) => (
                                <div
                                    key={g.serviceName}
                                    style={{
                                        border: `1px solid ${T.border}`,
                                        borderRadius: 10,
                                        overflow: 'hidden',
                                        background: T.surface,
                                        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
                                    }}
                                >
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        title={tm('beautyServiceHeaderCrmHint')}
                                        onClick={() => {
                                            const first = g.items[0];
                                            if (first) setCallBoardCrmAppointment(first);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                const first = g.items[0];
                                                if (first) setCallBoardCrmAppointment(first);
                                            }
                                        }}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: 12,
                                            padding: '11px 14px',
                                            background: T.reportPink,
                                            color: '#fff',
                                            fontWeight: 800,
                                            fontSize: 14,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <span style={{ letterSpacing: '-0.02em' }}>{g.serviceName}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.95 }}>
                                            {tm('subTotal')}: {fmt(g.sum)}
                                        </span>
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${T.border}` }}>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('date')}</th>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('customer')}</th>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('bStaffView')}</th>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('bDeviceView')}</th>
                                                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('amount')}</th>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('status')}</th>
                                                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }} />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {g.items.map((apt) => {
                                                    const hasCall = Boolean(apt.confirmation_call_at);
                                                    const hasAct = Boolean(apt.pre_visit_activity_at);
                                                    const accent = hasCall && hasAct ? T.green : !hasCall ? T.amber : '#9333ea';
                                                    const dateLabel = beautyAppointmentDateKey(apt);
                                                    const time = (apt.appointment_time ?? apt.time ?? '--:--').slice(0, 5);
                                                    const st = String(apt.status ?? '');
                                                    const stCfg = STATUS_CFG[st] ?? STATUS_CFG.scheduled;
                                                    return (
                                                        <tr
                                                            key={apt.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => setCallBoardCrmAppointment(apt)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    setCallBoardCrmAppointment(apt);
                                                                }
                                                            }}
                                                            style={{
                                                                borderBottom: `1px solid ${T.border}`,
                                                                cursor: 'pointer',
                                                                background: '#fff',
                                                            }}
                                                        >
                                                            <td style={{ padding: '9px 10px', borderLeft: `4px solid ${accent}`, whiteSpace: 'nowrap', color: T.textPrimary, fontWeight: 600 }}>
                                                                {dateLabel} <span style={{ color: T.textMuted, fontWeight: 500 }}>{time}</span>
                                                            </td>
                                                            <td style={{ padding: '9px 10px', fontWeight: 700, color: T.textPrimary }}>
                                                                {apt.customer_name ?? tm('bCustomerFallbackName')}
                                                            </td>
                                                            <td style={{ padding: '9px 10px', color: T.textSub }}>
                                                                {String(apt.specialist_name ?? apt.staff_name ?? '').trim() || '—'}
                                                            </td>
                                                            <td style={{ padding: '9px 10px', color: T.textSub }}>
                                                                {String(apt.device_name ?? '').trim() || '—'}
                                                            </td>
                                                            <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: T.textPrimary, whiteSpace: 'nowrap' }}>
                                                                {fmt(Number(apt.total_price ?? 0))}
                                                            </td>
                                                            <td style={{ padding: '9px 10px' }}>
                                                                <span
                                                                    style={{
                                                                        display: 'inline-block',
                                                                        fontSize: 10,
                                                                        fontWeight: 700,
                                                                        padding: '2px 8px',
                                                                        borderRadius: 4,
                                                                        background: stCfg.bg,
                                                                        color: stCfg.color,
                                                                        textTransform: 'capitalize',
                                                                    }}
                                                                >
                                                                    {stCfg.label}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '9px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                                                                {renderCallActivityButtons(apt)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        callRows.map((apt) => {
                            const hasCall = Boolean(apt.confirmation_call_at);
                            const hasAct = Boolean(apt.pre_visit_activity_at);
                            const accent = hasCall && hasAct ? T.green : !hasCall ? T.amber : '#9333ea';
                            const dateLabel = beautyAppointmentDateKey(apt);
                            const time = (apt.appointment_time ?? apt.time ?? '--:--').slice(0, 5);
                            return (
                                <div
                                    key={apt.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '10px 16px',
                                        borderBottom: `1px solid ${T.border}`,
                                        borderLeft: `4px solid ${accent}`,
                                        background: '#fff',
                                    }}
                                >
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        title={tm('bCallBoardRowOpenCrm')}
                                        onClick={() => setCallBoardCrmAppointment(apt)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setCallBoardCrmAppointment(apt);
                                            }
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#faf9fd';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'transparent';
                                        }}
                                        style={{
                                            minWidth: 0,
                                            flex: 1,
                                            cursor: 'pointer',
                                            borderRadius: 8,
                                            padding: '4px 6px',
                                            margin: '-4px -6px',
                                            outline: 'none',
                                        }}
                                    >
                                        <p style={{ fontSize: 12, fontWeight: 800, color: T.textPrimary, margin: 0 }}>
                                            {apt.customer_name ?? tm('bCustomerFallbackName')}
                                        </p>
                                        <p style={{ fontSize: 11, color: T.violet, margin: '4px 0 0', fontWeight: 600 }}>
                                            {dateLabel} {time} · {apt.service_name ?? '—'}
                                            {apt.device_name ? ` · ${apt.device_name}` : ''}
                                            <span style={{ color: T.textMuted, fontWeight: 600, marginLeft: 8 }}>
                                                ({tm('bCallBoardCrmLinkHint')})
                                            </span>
                                        </p>
                                    </div>
                                    {renderCallActivityButtons(apt)}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <BeautyServiceReportCrmModal
                open={callBoardCrmAppointment != null}
                onClose={() => setCallBoardCrmAppointment(null)}
                appointment={callBoardCrmAppointment}
                accentColor={T.violet}
                onSaved={() => {
                    setCallBoardRefreshTick((t) => t + 1);
                }}
            />

            {/* ── Main Grid ───────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

                {/* Today's Appointments */}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 18px', borderBottom: `1px solid ${T.border}`,
                    }}>
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>{tm('bTodayAppointmentsTitle')}</p>
                            <p style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, marginTop: 1 }}>{tm('bRegisteredAppointmentsSub').replace('{n}', String(stats.total))}</p>
                        </div>
                        <Calendar size={16} style={{ color: T.violet }} />
                    </div>

                    {/* Column headers */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '56px 8px 1fr 72px 88px 80px',
                        gap: 8, padding: '8px 18px',
                        borderBottom: `1px solid ${T.border}`,
                        background: '#faf9fd',
                    }}>
                        {[tm('bTimeHeader'), '', tm('bCustomerServiceHeader'), tm('bDurationHeader'), tm('bStatus'), tm('bDashboardColAmount')].map((h, i) => (
                            <span key={i} style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    <div style={{ maxHeight: 400, overflowY: 'auto' }} className="custom-scrollbar">
                        {stats.todayApts.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: T.textMuted }}>
                                <Calendar size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                                <p style={{ fontSize: 12, fontWeight: 600 }}>{tm('bNoAppointmentsToday')}</p>
                            </div>
                        ) : stats.todayApts.map(apt => {
                            const cfg  = STATUS_CFG[apt.status] ?? STATUS_CFG.scheduled;
                            const time = (apt.appointment_time ?? apt.time ?? '--:--').slice(0, 5);
                            return (
                                <div
                                    key={apt.id}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '56px 8px 1fr 72px 88px 80px',
                                        gap: 8, padding: '11px 18px',
                                        borderBottom: `1px solid ${T.border}`,
                                        alignItems: 'center',
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#faf9fd')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {/* Time */}
                                    <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, fontFamily: 'monospace' }}>{time}</span>

                                    {/* Status dot */}
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block', boxShadow: `0 0 0 2px ${cfg.bg}` }} />

                                    {/* Info */}
                                    <div>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>{apt.customer_name ?? tm('bCustomerFallbackName')}</p>
                                        <p style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, marginTop: 1 }}>
                                            {apt.service_name ?? '—'}{apt.specialist_name ? ` · ${apt.specialist_name}` : ''}
                                        </p>
                                    </div>

                                    {/* Duration */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.textMuted }}>
                                        <Clock size={11} />
                                        <span style={{ fontSize: 11, fontWeight: 600 }}>{apt.duration ?? '?'}{tm('bDkSuffix')}</span>
                                    </div>

                                    {/* Status pill */}
                                    <span style={{
                                        display: 'inline-block', fontSize: 10, fontWeight: 700,
                                        padding: '2px 8px', borderRadius: 4,
                                        background: cfg.bg, color: cfg.color,
                                    }}>{cfg.label}</span>

                                    {/* Price */}
                                    <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, textAlign: 'right' }}>
                                        {(apt.total_price ?? 0) > 0 ? fmt(apt.total_price) : '—'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Services */}
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <p style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>{tm('bServicesSectionTitle')}</p>
                            <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>{tm('bServicesDefinedCount').replace('{n}', String(services.length))}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {topServices.length === 0 ? (
                                <p style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', padding: '12px 0' }}>{tm('bNoServicesDefined')}</p>
                            ) : topServices.map((svc, i) => (
                                <div key={svc.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{
                                        width: 22, height: 22, borderRadius: 4,
                                        background: svc.color ?? T.violet,
                                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 10, fontWeight: 800, flexShrink: 0,
                                    }}>{i + 1}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{svc.name}</span>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSub, flexShrink: 0, marginLeft: 6 }}>{fmt(svc.price)}</span>
                                        </div>
                                        <div style={{ height: 3, background: '#f0ecfc', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${100 - i * 14}%`, background: svc.color ?? T.violet, borderRadius: 2 }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Staff */}
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <p style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>{tm('bStaffSectionTitle')}</p>
                            <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>{tm('bStaffActiveShort').replace('{n}', String(activeStaff.length))}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {activeStaff.length === 0 ? (
                                <p style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', padding: '12px 0' }}>{tm('bNoStaffDefined')}</p>
                            ) : activeStaff.slice(0, 6).map((s, i) => {
                                const init = s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                                return (
                                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, background: '#faf9fd' }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, width: 14, textAlign: 'center' }}>{i + 1}</span>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: 6,
                                            background: s.color ?? T.violet,
                                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 10, fontWeight: 800, flexShrink: 0,
                                        }}>{init}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</p>
                                            <p style={{ fontSize: 10, fontWeight: 500, color: T.textMuted }}>{s.specialty ?? tm('bSpecialist')}</p>
                                        </div>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700,
                                            padding: '2px 6px', borderRadius: 4,
                                            background: `${s.color ?? T.violet}18`,
                                            color: s.color ?? T.violet,
                                        }}>%{s.commission_rate}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
