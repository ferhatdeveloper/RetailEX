
import React, { useEffect, useMemo } from 'react';
import {
    Calendar, Users, CheckCircle2, Clock,
    Activity, Zap, TrendingUp, Star,
    ArrowUpRight, Circle
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { AppointmentStatus } from '../../../types/beauty';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { beautyAppointmentDateKey, formatLocalYmd } from '../../../utils/dateLocal';
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
    pinkLight:   '#fce7f3',
    green:       '#059669',
    greenLight:  '#d1fae5',
    amber:       '#d97706',
    amberLight:  '#fef3c7',
    blue:        '#2563eb',
    blueLight:   '#dbeafe',
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
    scheduled:   { label: 'Planlandı',    color: '#6366f1', bg: '#eef2ff' },
    confirmed:   { label: 'Onaylandı',    color: '#0284c7', bg: '#e0f2fe' },
    in_progress: { label: 'Devam Ediyor', color: '#d97706', bg: '#fef3c7' },
    completed:   { label: 'Tamamlandı',   color: '#059669', bg: '#d1fae5' },
    cancelled:   { label: 'İptal',         color: '#dc2626', bg: '#fee2e2' },
    no_show:     { label: 'Gelmedi',       color: '#6b7280', bg: '#f3f4f6' },
};

const CATEGORY_TR: Record<string, string> = {
    laser: 'Lazer', hair_salon: 'Kuaför', beauty: 'Güzellik',
    botox: 'Botoks', filler: 'Dolgu', massage: 'Masaj',
    skincare: 'Cilt', makeup: 'Makyaj', nails: 'Tırnak', spa: 'Spa',
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
export function ClinicDashboard() {
    const { appointments, services, specialists, loadAppointments, loadServices, loadSpecialists } = useBeautyStore();

    const todayStr = formatLocalYmd(new Date());

    useEffect(() => {
        loadAppointments(todayStr);
        loadServices();
        loadSpecialists();
    }, []);

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
                        Klinik Paneli
                    </h1>
                    <p style={{ fontSize: 12, fontWeight: 500, color: T.textMuted, marginTop: 2 }}>
                        {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: 6, padding: '6px 12px',
                }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.green, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Canlı</span>
                    <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>·</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>Bugün {stats.total} randevu</span>
                </div>
            </div>

            {/* ── KPI Strip ───────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                <KpiCard label="Günlük Ciro"       value={fmt(stats.revenue)}   accent={T.violet}  icon={TrendingUp} />
                <KpiCard label="Tamamlanan"         value={stats.completed}      sub={`${stats.rate}% tamamlanma`} accent={T.green}   icon={CheckCircle2} />
                <KpiCard label="Bekleyen"           value={stats.pending}        sub={`${stats.inProg} devam ediyor`} accent={T.amber} icon={Clock} />
                <KpiCard label="Aktif Personel"     value={activeStaff.length}   sub={`${specialists.length} toplam`} accent={T.blue}  icon={Users} />
            </div>

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
                            <p style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>Bugünün Randevuları</p>
                            <p style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, marginTop: 1 }}>{stats.total} kayıtlı randevu</p>
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
                        {['Saat', '', 'Müşteri / Hizmet', 'Süre', 'Durum', 'Tutar'].map((h, i) => (
                            <span key={i} style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    <div style={{ maxHeight: 400, overflowY: 'auto' }} className="custom-scrollbar">
                        {stats.todayApts.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: T.textMuted }}>
                                <Calendar size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                                <p style={{ fontSize: 12, fontWeight: 600 }}>Bugün randevu bulunmuyor</p>
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
                                        <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>{apt.customer_name ?? 'Müşteri'}</p>
                                        <p style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, marginTop: 1 }}>
                                            {apt.service_name ?? '—'}{apt.specialist_name ? ` · ${apt.specialist_name}` : ''}
                                        </p>
                                    </div>

                                    {/* Duration */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.textMuted }}>
                                        <Clock size={11} />
                                        <span style={{ fontSize: 11, fontWeight: 600 }}>{apt.duration ?? '?'}dk</span>
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
                            <p style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>Hizmetler</p>
                            <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>{services.length} tanımlı</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {topServices.length === 0 ? (
                                <p style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', padding: '12px 0' }}>Hizmet tanımlanmamış</p>
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
                            <p style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>Personel</p>
                            <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>{activeStaff.length} aktif</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {activeStaff.length === 0 ? (
                                <p style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', padding: '12px 0' }}>Personel tanımlanmamış</p>
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
                                            <p style={{ fontSize: 10, fontWeight: 500, color: T.textMuted }}>{s.specialty ?? 'Uzman'}</p>
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
