/**
 * Randevuları tarih sütunları (yatay kaydırma) + hizmet kartı kategorisi / hizmet hiyerarşisi ile gösterir.
 * Kategoriler `beauty_services.category` alanından; hizmetler aynı tablodan gelir.
 */
import React, { useMemo } from 'react';
import { Plus, Layers, Bell } from 'lucide-react';
import type { BeautyAppointment, BeautyFollowUpReminder, BeautyService } from '../../../types/beauty';
import { beautyAppointmentDateKey } from '../../../utils/dateLocal';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';
import { CLINIC } from '../clinicDesignTokens';

function parseHhmmToMinutes(raw: string | undefined): number | null {
    const s = String(raw ?? '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
}

function appointmentMatchesService(apt: BeautyAppointment, svc: BeautyService): boolean {
    if (apt.service_id && svc.id && String(apt.service_id).trim() === String(svc.id).trim()) return true;
    const sn = (apt.service_name ?? '').trim();
    const name = (svc.name ?? '').trim();
    return Boolean(sn && name && sn === name);
}

export interface ServiceCategoryDateBoardProps {
    services: BeautyService[];
    appointments: BeautyAppointment[];
    /** Tamamlanan işlem + hizmet `follow_up_reminder_days` ile hesaplanan hatırlatmalar */
    followUpReminders?: BeautyFollowUpReminder[];
    /** Artan sırada `YYYY-MM-DD` (ör. `enumerateLocalYmdInclusive`). */
    dateKeys: string[];
    categoryLabels: Record<string, string>;
    /** Gün başlığı için `toLocaleDateString` locale (örn. tr-TR). */
    dayHeaderLocale: string;
    renderAppointment: (apt: BeautyAppointment) => React.ReactNode;
    onAddClick: (dateYmd: string, serviceId: string) => void;
    followUpBadgeLabel: string;
    followUpBookCtaLabel: string;
    formatFollowUpLine: (r: BeautyFollowUpReminder) => string;
    noServicesLabel: string;
    noAppointmentsInSlotLabel: string;
    appointmentsCountTemplate: string;
}

const COL_WIDTH = 280;

export function ServiceCategoryDateBoard({
    services,
    appointments,
    followUpReminders = [],
    dateKeys,
    categoryLabels,
    dayHeaderLocale,
    renderAppointment,
    onAddClick,
    followUpBadgeLabel,
    followUpBookCtaLabel,
    formatFollowUpLine,
    noServicesLabel,
    noAppointmentsInSlotLabel,
    appointmentsCountTemplate,
}: ServiceCategoryDateBoardProps) {
    const visibleApts = useMemo(
        () => appointments.filter(beautyAptVisibleOnSchedule),
        [appointments],
    );

    const grouped = useMemo(() => {
        const active = services.filter(s => s.is_active);
        const byCat = new Map<string, BeautyService[]>();
        for (const s of active) {
            const raw = String(s.category ?? 'beauty').trim() || 'beauty';
            const list = byCat.get(raw) ?? [];
            list.push(s);
            byCat.set(raw, list);
        }
        for (const [, list] of byCat) {
            list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr', { sensitivity: 'base' }));
        }
        const catKeys = [...byCat.keys()].sort((a, b) => {
            const la = categoryLabels[a] ?? a;
            const lb = categoryLabels[b] ?? b;
            return la.localeCompare(lb, 'tr', { sensitivity: 'base' });
        });
        return { byCat, catKeys };
    }, [services, categoryLabels]);

    if (grouped.catKeys.length === 0) {
        return (
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: CLINIC.textMuted,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: 24,
                }}
            >
                {noServicesLabel}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, flex: 1 }}>
            <div
                style={{
                    display: 'flex',
                    gap: 12,
                    overflowX: 'auto',
                    paddingBottom: 8,
                    flex: 1,
                    minHeight: 320,
                }}
                className="custom-scrollbar"
            >
                {dateKeys.map(dayStr => {
                    const [y, mo, da] = dayStr.split('-').map(Number);
                    const header = new Date(y, mo - 1, da).toLocaleDateString(dayHeaderLocale, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                    });
                    const dayApts = visibleApts.filter(a => beautyAppointmentDateKey(a) === dayStr);

                    return (
                        <div
                            key={dayStr}
                            style={{
                                flex: `0 0 ${COL_WIDTH}px`,
                                width: COL_WIDTH,
                                minWidth: COL_WIDTH,
                                background: CLINIC.surface,
                                border: `1px solid ${CLINIC.border}`,
                                borderRadius: 8,
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <div
                                style={{
                                    padding: '10px 12px',
                                    borderBottom: `1px solid ${CLINIC.border}`,
                                    background: CLINIC.bg,
                                }}
                            >
                                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: CLINIC.textPrimary, lineHeight: 1.35 }}>
                                    {header}
                                </p>
                                <p style={{ margin: '4px 0 0', fontSize: 10, fontWeight: 600, color: CLINIC.textSub, fontFamily: 'monospace' }}>
                                    {dayStr}
                                </p>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                                {grouped.catKeys.map(catKey => {
                                    const svcs = grouped.byCat.get(catKey) ?? [];
                                    const catTitle = categoryLabels[catKey] ?? catKey;
                                    return (
                                        <div key={`${dayStr}-${catKey}`} style={{ borderBottom: `1px solid ${CLINIC.borderMuted}` }}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    padding: '8px 10px',
                                                    background: '#faf9fd',
                                                }}
                                            >
                                                <Layers size={14} color={CLINIC.violet} style={{ flexShrink: 0 }} />
                                                <span style={{ fontSize: 11, fontWeight: 800, color: CLINIC.violet }}>{catTitle}</span>
                                            </div>
                                            {svcs.map(svc => {
                                                const svcApts = dayApts
                                                    .filter(a => appointmentMatchesService(a, svc))
                                                    .sort((a, b) => {
                                                        const ma = parseHhmmToMinutes(a.appointment_time ?? a.time) ?? 0;
                                                        const mb = parseHhmmToMinutes(b.appointment_time ?? b.time) ?? 0;
                                                        if (ma !== mb) return ma - mb;
                                                        return String(a.id).localeCompare(String(b.id));
                                                    });
                                                const svcFollowUps = followUpReminders.filter(
                                                    r => r.due_date === dayStr && r.service_id === String(svc.id),
                                                );
                                                const countLabel = appointmentsCountTemplate.replace(
                                                    '{n}',
                                                    String(svcApts.length),
                                                );
                                                return (
                                                    <div key={`${dayStr}-${svc.id}`} style={{ padding: '6px 8px 10px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                                            <span style={{ fontSize: 11, fontWeight: 700, color: CLINIC.textPrimary }}>{svc.name}</span>
                                                            <span style={{ fontSize: 9, fontWeight: 600, color: CLINIC.textSub, flexShrink: 0 }}>{countLabel}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            {svcFollowUps.map(fu => (
                                                                <div
                                                                    key={`fu-${fu.customer_id}-${fu.service_id}-${fu.due_date}`}
                                                                    style={{
                                                                        borderRadius: 6,
                                                                        border: '1px solid #fbcfe8',
                                                                        borderLeft: '3px solid #db2777',
                                                                        background: '#fdf2f8',
                                                                        padding: '8px 10px',
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                                        <Bell size={12} color="#db2777" style={{ flexShrink: 0 }} />
                                                                        <span style={{ fontSize: 9, fontWeight: 800, color: '#be185d' }}>
                                                                            {followUpBadgeLabel}
                                                                        </span>
                                                                    </div>
                                                                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#831843' }}>
                                                                        {fu.customer_name?.trim() ? fu.customer_name : '—'}
                                                                    </p>
                                                                    <p style={{ margin: '4px 0 0', fontSize: 10, fontWeight: 600, color: '#9d174d', lineHeight: 1.35 }}>
                                                                        {formatFollowUpLine(fu)}
                                                                    </p>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => onAddClick(dayStr, String(svc.id))}
                                                                        style={{
                                                                            marginTop: 8,
                                                                            width: '100%',
                                                                            height: 30,
                                                                            borderRadius: 5,
                                                                            border: '1px dashed #f472b6',
                                                                            background: '#fff',
                                                                            fontSize: 10,
                                                                            fontWeight: 700,
                                                                            color: '#be185d',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            gap: 6,
                                                                        }}
                                                                    >
                                                                        <Plus size={12} />
                                                                        {followUpBookCtaLabel}
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            {svcApts.length === 0 && svcFollowUps.length === 0 ? (
                                                                <div
                                                                    style={{
                                                                        fontSize: 10,
                                                                        fontWeight: 600,
                                                                        color: CLINIC.textMuted,
                                                                        padding: '4px 0',
                                                                    }}
                                                                >
                                                                    {noAppointmentsInSlotLabel}
                                                                </div>
                                                            ) : (
                                                                svcApts.map((apt, idx) => (
                                                                    <div key={apt.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                        <span style={{ fontSize: 9, fontWeight: 800, color: '#9ca3af' }}>
                                                                            #{idx + 1}
                                                                        </span>
                                                                        {renderAppointment(apt)}
                                                                    </div>
                                                                ))
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => onAddClick(dayStr, String(svc.id))}
                                                                style={{
                                                                    marginTop: 2,
                                                                    height: 36,
                                                                    borderRadius: 6,
                                                                    border: `1px dashed ${CLINIC.border}`,
                                                                    background: '#fff',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: 6,
                                                                    cursor: 'pointer',
                                                                    color: CLINIC.textMuted,
                                                                    fontSize: 11,
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                <Plus size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
