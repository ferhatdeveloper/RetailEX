/**
 * Randevuları tarih sütunları (yatay kaydırma) + hizmet kartı ana kategorisi ile gösterir.
 * Ana kategori: `parent_category` doluysa o, değilse `category` (beautyServiceMainKey).
 */
import React, { useMemo } from 'react';
import { Plus, Layers, Bell, Phone, CalendarClock, MessageCircle } from 'lucide-react';
import type { BeautyAppointment, BeautyFollowUpReminder, BeautyService } from '../../../types/beauty';
import { getFollowUpReminderCardTheme } from '../../../utils/beautyFollowUpReminderUtils';
import { beautyAppointmentDateKey } from '../../../utils/dateLocal';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';
import { beautyServiceMainKey, beautyServiceSubKey, beautyServiceActive } from '../beautyServiceCategoryUtils';
import { CLINIC } from '../clinicDesignTokens';

export type ServiceBoardMainLayout = 'stack' | 'row';

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

/** Aynı ana grup içinde alt başlık: en az bir kayıtta parent varsa `category` ile alt gruplar. */
function servicesToSubSections(
    services: BeautyService[],
    categoryLabels: Record<string, string>,
): { subKey: string; items: BeautyService[] }[] {
    const hasParent = services.some(s => String(s.parent_category ?? '').trim().length > 0);
    if (!hasParent) {
        return [{ subKey: '_flat', items: services }];
    }
    const m = new Map<string, BeautyService[]>();
    for (const s of services) {
        const sk = beautyServiceSubKey(s);
        const list = m.get(sk) ?? [];
        list.push(s);
        m.set(sk, list);
    }
    for (const [, list] of m) {
        list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr', { sensitivity: 'base' }));
    }
    const keys = [...m.keys()].sort((a, b) => {
        const la = categoryLabels[a] ?? a;
        const lb = categoryLabels[b] ?? b;
        return la.localeCompare(lb, 'tr', { sensitivity: 'base' });
    });
    return keys.map(subKey => ({ subKey, items: m.get(subKey) ?? [] }));
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
    onAddClick: (dateYmd: string, serviceId: string, opts?: { customerId?: string }) => void;
    followUpBadgeLabel: string;
    followUpBookCtaLabel: string;
    formatFollowUpLine: (r: BeautyFollowUpReminder) => string;
    onFollowUpManage?: (reminder: BeautyFollowUpReminder) => void;
    followUpManageLabel?: string;
    onFollowUpWhatsApp?: (reminder: BeautyFollowUpReminder) => void;
    followUpWhatsAppLabel?: string;
    followUpWhatsAppSendingId?: string | null;
    followUpStatusLabels?: Partial<Record<string, string>>;
    formatFollowUpPostponedLine?: (dueDate: string) => string;
    noServicesLabel: string;
    noAppointmentsInSlotLabel: string;
    appointmentsCountTemplate: string;
    /** Açıkken o günde randevusu veya hatırlatması olmayan hizmet satırları gösterilmez */
    showOnlyServicesWithBookings?: boolean;
    /** Filtre açık ve o gün hiç uygun hizmet yokken gösterilen kısa metin */
    emptyDayWhenFilteredLabel?: string;
    /** Ana kategori kutuları: alt alta (varsayılan) veya gün sütunu içinde yan yana */
    mainCategoryLayout?: ServiceBoardMainLayout;
}

const COL_WIDTH = 280;

function ServiceBoardServiceCell({
    svc,
    dayStr,
    dayApts,
    followUpReminders,
    renderAppointment,
    onAddClick,
    followUpBadgeLabel,
    followUpBookCtaLabel,
    formatFollowUpLine,
    onFollowUpManage,
    followUpManageLabel,
    onFollowUpWhatsApp,
    followUpWhatsAppLabel,
    followUpWhatsAppSendingId,
    followUpStatusLabels,
    formatFollowUpPostponedLine,
    noAppointmentsInSlotLabel,
    appointmentsCountTemplate,
}: {
    svc: BeautyService;
    dayStr: string;
    dayApts: BeautyAppointment[];
    followUpReminders: BeautyFollowUpReminder[];
    renderAppointment: (apt: BeautyAppointment) => React.ReactNode;
    onAddClick: (dateYmd: string, serviceId: string, opts?: { customerId?: string }) => void;
    followUpBadgeLabel: string;
    followUpBookCtaLabel: string;
    formatFollowUpLine: (r: BeautyFollowUpReminder) => string;
    onFollowUpManage?: (reminder: BeautyFollowUpReminder) => void;
    followUpManageLabel?: string;
    onFollowUpWhatsApp?: (reminder: BeautyFollowUpReminder) => void;
    followUpWhatsAppLabel?: string;
    followUpWhatsAppSendingId?: string | null;
    followUpStatusLabels?: Partial<Record<string, string>>;
    formatFollowUpPostponedLine?: (dueDate: string) => string;
    noAppointmentsInSlotLabel: string;
    appointmentsCountTemplate: string;
}) {
    const followUpPhoneLine = (phoneRaw: string | undefined) => String(phoneRaw ?? '').trim();
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
    const countLabel = appointmentsCountTemplate.replace('{n}', String(svcApts.length));
    return (
        <div style={{ padding: '6px 8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: CLINIC.textPrimary }}>{svc.name}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: CLINIC.textSub, flexShrink: 0 }}>{countLabel}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {svcFollowUps.map(fu => {
                    const followUpPhone = followUpPhoneLine(fu.customer_phone);
                    const hasNote = Boolean(fu.note?.trim());
                    const isShadow = Boolean(fu.is_natural_shadow);
                    const theme = getFollowUpReminderCardTheme(fu.follow_up_status, hasNote);
                    const statusKey = fu.follow_up_status ?? 'due';
                    const badgeText = isShadow
                        ? (followUpStatusLabels?.shadow ?? 'Ertelendi (orijinal)')
                        : hasNote && statusKey === 'due'
                            ? (followUpStatusLabels?.noted ?? 'Notlu')
                            : followUpStatusLabels?.[statusKey] ??
                              (statusKey === 'postponed'
                                  ? 'Ertelendi'
                                  : statusKey === 'contacted'
                                    ? 'Görüşüldü'
                                    : statusKey === 'other'
                                      ? 'Notlu'
                                      : followUpBadgeLabel);
                    const cardOpacity = isShadow ? 0.52 : 1;
                    return (
                        <div
                            key={`fu-${fu.customer_id}-${fu.service_id}-${fu.due_date}-${fu.product_id ?? 'svc'}${isShadow ? '-shadow' : ''}`}
                            style={{
                                borderRadius: 6,
                                border: isShadow ? '1px dashed #d1d5db' : theme.border,
                                borderLeft: isShadow ? '3px dashed #9ca3af' : theme.borderLeft,
                                background: isShadow ? '#f9fafb' : theme.background,
                                padding: '8px 10px',
                                opacity: cardOpacity,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <Bell size={12} color={theme.iconColor} style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: 9, fontWeight: 800, color: theme.badgeColor }}>{badgeText}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: theme.titleColor }}>
                                {fu.customer_name?.trim() ? fu.customer_name : '—'}
                            </p>
                            {followUpPhone ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, minWidth: 0 }}>
                                    <Phone size={10} color={theme.subColor} style={{ flexShrink: 0 }} />
                                    <span style={{ fontSize: 10, fontWeight: 600, color: theme.subColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {followUpPhone}
                                    </span>
                                </div>
                            ) : null}
                            <p style={{ margin: '4px 0 0', fontSize: 10, fontWeight: 600, color: theme.subColor, lineHeight: 1.35 }}>
                                {formatFollowUpLine(fu)}
                            </p>
                            {fu.follow_up_status === 'postponed' &&
                            !isShadow &&
                            fu.natural_due_date &&
                            fu.natural_due_date !== fu.due_date ? (
                                <p style={{ margin: '4px 0 0', fontSize: 9, fontWeight: 700, color: theme.badgeColor }}>
                                    {formatFollowUpPostponedLine
                                        ? formatFollowUpPostponedLine(fu.due_date)
                                        : `Yeni tarih: ${fu.due_date}`}
                                </p>
                            ) : null}
                            {isShadow && fu.postponed_due_date ? (
                                <p style={{ margin: '4px 0 0', fontSize: 9, fontWeight: 700, color: theme.badgeColor }}>
                                    {formatFollowUpPostponedLine
                                        ? formatFollowUpPostponedLine(fu.postponed_due_date)
                                        : `Yeni tarih: ${fu.postponed_due_date}`}
                                </p>
                            ) : null}
                            {fu.note?.trim() ? (
                                <p
                                    style={{
                                        margin: '6px 0 0',
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: theme.titleColor,
                                        lineHeight: 1.35,
                                        fontStyle: 'italic',
                                    }}
                                >
                                    {fu.note.trim()}
                                </p>
                            ) : null}
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                {onFollowUpManage ? (
                                    <button
                                        type="button"
                                        onClick={() => onFollowUpManage(fu)}
                                        style={{
                                            flex: 1,
                                            height: 30,
                                            borderRadius: 5,
                                            border: theme.buttonBorder,
                                            background: '#fff',
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: theme.buttonColor,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 4,
                                        }}
                                    >
                                        <CalendarClock size={12} />
                                        {followUpManageLabel ?? 'Not / ertele'}
                                    </button>
                                ) : null}
                                {onFollowUpWhatsApp && followUpPhone ? (
                                    <button
                                        type="button"
                                        onClick={() => onFollowUpWhatsApp(fu)}
                                        disabled={followUpWhatsAppSendingId === `${fu.customer_id}-${fu.service_id}-${fu.due_date}`}
                                        style={{
                                            height: 30,
                                            minWidth: 36,
                                            padding: '0 8px',
                                            borderRadius: 5,
                                            border: '1px solid #86efac',
                                            background: '#ecfdf5',
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: '#047857',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 4,
                                            opacity:
                                                followUpWhatsAppSendingId === `${fu.customer_id}-${fu.service_id}-${fu.due_date}`
                                                    ? 0.6
                                                    : 1,
                                        }}
                                        title={followUpWhatsAppLabel ?? 'Mesaj'}
                                    >
                                        <MessageCircle size={12} />
                                        {followUpWhatsAppLabel ?? 'Mesaj'}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => onAddClick(dayStr, String(svc.id), { customerId: fu.customer_id })}
                                    style={{
                                        flex: 1,
                                        height: 30,
                                        borderRadius: 5,
                                        border: theme.buttonBorder,
                                        background: '#fff',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: theme.buttonColor,
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
                        </div>
                    );
                })}
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
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#9ca3af' }}>#{idx + 1}</span>
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
}

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
    onFollowUpManage,
    followUpManageLabel,
    onFollowUpWhatsApp,
    followUpWhatsAppLabel,
    followUpWhatsAppSendingId,
    followUpStatusLabels,
    formatFollowUpPostponedLine,
    noServicesLabel,
    noAppointmentsInSlotLabel,
    appointmentsCountTemplate,
    showOnlyServicesWithBookings = false,
    emptyDayWhenFilteredLabel = '',
    mainCategoryLayout = 'stack',
}: ServiceCategoryDateBoardProps) {
    const visibleApts = useMemo(
        () => appointments.filter(beautyAptVisibleOnSchedule),
        [appointments],
    );

    const groupedMain = useMemo(() => {
        const active = services.filter(beautyServiceActive);
        const byMain = new Map<string, BeautyService[]>();
        for (const s of active) {
            const mk = beautyServiceMainKey(s);
            const list = byMain.get(mk) ?? [];
            list.push(s);
            byMain.set(mk, list);
        }
        for (const [, list] of byMain) {
            list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr', { sensitivity: 'base' }));
        }
        const mainKeys = [...byMain.keys()].sort((a, b) => {
            const la = categoryLabels[a] ?? a;
            const lb = categoryLabels[b] ?? b;
            return la.localeCompare(lb, 'tr', { sensitivity: 'base' });
        });
        return { byMain, mainKeys };
    }, [services, categoryLabels]);

    const singleDayStretch = dateKeys.length <= 1;

    if (groupedMain.mainKeys.length === 0) {
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

    const cellProps = {
        followUpReminders,
        renderAppointment,
        onAddClick,
        followUpBadgeLabel,
        followUpBookCtaLabel,
        formatFollowUpLine,
        onFollowUpManage,
        followUpManageLabel,
        followUpStatusLabels,
        formatFollowUpPostponedLine,
        noAppointmentsInSlotLabel,
        appointmentsCountTemplate,
    };

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

                    const mainBlocks = groupedMain.mainKeys.map(mainKey => {
                        const svcs = groupedMain.byMain.get(mainKey) ?? [];
                        const svcsForDay = showOnlyServicesWithBookings
                            ? svcs.filter(svc => {
                                  const hasApt = dayApts.some(a => appointmentMatchesService(a, svc));
                                  const hasFu = followUpReminders.some(
                                      r => r.due_date === dayStr && r.service_id === String(svc.id),
                                  );
                                  return hasApt || hasFu;
                              })
                            : svcs;
                        if (svcsForDay.length === 0) return null;
                        const mainTitle = categoryLabels[mainKey] ?? mainKey;
                        const subSections = servicesToSubSections(svcsForDay, categoryLabels);
                        const isRow = mainCategoryLayout === 'row';
                        return (
                            <div
                                key={`${dayStr}-${mainKey}`}
                                style={{
                                    borderBottom: isRow ? undefined : `1px solid ${CLINIC.borderMuted}`,
                                    border: isRow ? `1px solid ${CLINIC.borderMuted}` : undefined,
                                    borderRadius: isRow ? 8 : undefined,
                                    flex: isRow ? '1 1 200px' : undefined,
                                    minWidth: isRow ? 168 : undefined,
                                    maxWidth: isRow ? 320 : undefined,
                                    background: isRow ? '#faf9fd' : undefined,
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '8px 10px',
                                        background: isRow ? 'transparent' : '#faf9fd',
                                        borderBottom: isRow ? `1px solid ${CLINIC.borderMuted}` : undefined,
                                    }}
                                >
                                    <Layers size={14} color={CLINIC.violet} style={{ flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, fontWeight: 800, color: CLINIC.violet }}>{mainTitle}</span>
                                </div>
                                {subSections.map(({ subKey, items }) => (
                                    <div key={`${dayStr}-${mainKey}-${subKey}`}>
                                        {subKey !== '_flat' && (
                                            <div
                                                style={{
                                                    padding: '4px 10px 2px',
                                                    fontSize: 9,
                                                    fontWeight: 700,
                                                    color: CLINIC.textSub,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.06em',
                                                }}
                                            >
                                                {categoryLabels[subKey] ?? subKey}
                                            </div>
                                        )}
                                        {items.map(svc => (
                                            <ServiceBoardServiceCell key={svc.id} svc={svc} dayStr={dayStr} dayApts={dayApts} {...cellProps} />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        );
                    });

                    const hasAny = mainBlocks.some(Boolean);
                    const inner = !hasAny && showOnlyServicesWithBookings ? (
                        <div
                            style={{
                                padding: 20,
                                textAlign: 'center',
                                fontSize: 12,
                                fontWeight: 600,
                                color: CLINIC.textMuted,
                            }}
                        >
                            {emptyDayWhenFilteredLabel || noAppointmentsInSlotLabel}
                        </div>
                    ) : (
                        <div
                            style={{
                                display: mainCategoryLayout === 'row' ? 'flex' : 'block',
                                flexDirection: mainCategoryLayout === 'row' ? 'row' : undefined,
                                flexWrap: mainCategoryLayout === 'row' ? 'wrap' : undefined,
                                gap: mainCategoryLayout === 'row' ? 10 : undefined,
                                alignItems: mainCategoryLayout === 'row' ? 'flex-start' : undefined,
                                padding: mainCategoryLayout === 'row' ? '8px 6px' : undefined,
                            }}
                        >
                            {mainBlocks}
                        </div>
                    );

                    return (
                        <div
                            key={dayStr}
                            style={{
                                flex: singleDayStretch ? '1 1 320px' : `0 0 ${COL_WIDTH}px`,
                                width: singleDayStretch ? undefined : COL_WIDTH,
                                minWidth: singleDayStretch ? Math.min(360, COL_WIDTH + 80) : COL_WIDTH,
                                maxWidth: singleDayStretch ? '100%' : undefined,
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
                                <p
                                    style={{
                                        margin: '4px 0 0',
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: CLINIC.textSub,
                                        fontFamily: 'monospace',
                                    }}
                                >
                                    {dayStr}
                                </p>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: mainCategoryLayout === 'row' ? 'auto' : undefined }} className="custom-scrollbar">
                                {inner}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
