/**
 * Randevuları tarih sütunları (yatay kaydırma) + hizmet kartı ana kategorisi ile gösterir.
 * Ana kategori: `parent_category` doluysa o, değilse `category` (beautyServiceMainKey).
 */
import React, { useMemo } from 'react';
import { Plus, Layers, Bell, Phone, CalendarClock, MessageCircle } from 'lucide-react';
import type { BeautyAppointment, BeautyFollowUpReminder, BeautyService } from '../../../types/beauty';
import { getFollowUpReminderCardTheme } from '../../../utils/beautyFollowUpReminderUtils';
import { formatLongDate } from '../../../utils/dateLocale';
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

function followUpCustomerKey(r: BeautyFollowUpReminder): string {
    const id = String(r.customer_id ?? '').trim();
    if (id) return `id:${id}`;
    const phone = String(r.customer_phone ?? '').replace(/\D/g, '');
    const name = String(r.customer_name ?? '').trim().toLocaleLowerCase('tr');
    return `fb:${phone}|${name}`;
}

function followUpSendKey(fu: BeautyFollowUpReminder): string {
    return `${fu.customer_id}-${fu.service_id}-${fu.due_date}`;
}

function followUpOpTitle(r: BeautyFollowUpReminder): string {
    const svc = String(r.service_name ?? '').trim();
    const prod = String(r.product_name ?? '').trim();
    if (r.reminder_kind === 'product' && prod) {
        return svc ? `${svc} · ${prod}` : prod;
    }
    return svc || prod || '—';
}

function compareFollowUpsInGroup(a: BeautyFollowUpReminder, b: BeautyFollowUpReminder): number {
    const as = a.is_natural_shadow ? 1 : 0;
    const bs = b.is_natural_shadow ? 1 : 0;
    if (as !== bs) return as - bs;
    const sn = String(a.service_name ?? '').localeCompare(String(b.service_name ?? ''), 'tr', { sensitivity: 'base' });
    if (sn !== 0) return sn;
    const pn = String(a.product_name ?? '').localeCompare(String(b.product_name ?? ''), 'tr', { sensitivity: 'base' });
    if (pn !== 0) return pn;
    return String(a.last_completed_date).localeCompare(String(b.last_completed_date));
}

/** Aynı gün aynı müşteri tek grup; kart ev hizmeti ilk canlı hatırlatmanın service_id'si. */
function assignFollowUpGroupsToServices(
    dayReminders: BeautyFollowUpReminder[],
    groupByCustomer: boolean,
): Map<string, BeautyFollowUpReminder[][]> {
    const map = new Map<string, BeautyFollowUpReminder[][]>();
    const push = (serviceId: string, group: BeautyFollowUpReminder[]) => {
        const sid = String(serviceId || '').trim();
        if (!sid) return;
        const list = map.get(sid) ?? [];
        list.push(group);
        map.set(sid, list);
    };
    if (!groupByCustomer) {
        for (const r of dayReminders) {
            push(String(r.service_id), [r]);
        }
        return map;
    }
    const byCustomer = new Map<string, BeautyFollowUpReminder[]>();
    for (const r of dayReminders) {
        const k = followUpCustomerKey(r);
        const list = byCustomer.get(k) ?? [];
        list.push(r);
        byCustomer.set(k, list);
    }
    for (const group of byCustomer.values()) {
        const sorted = [...group].sort(compareFollowUpsInGroup);
        const home = sorted.find(r => !r.is_natural_shadow) ?? sorted[0];
        if (!home) continue;
        push(String(home.service_id), sorted);
    }
    return map;
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
    /** Aynı gün aynı müşteri tek kart (varsayılan); kapalıysa işlem başına kart */
    groupFollowUpsByCustomer?: boolean;
    /** Grup kartında işlem sayısı: `{n} işlem` */
    followUpOpsCountTemplate?: string;
}

const COL_WIDTH = 280;

function followUpStatusBadgeText(
    fu: BeautyFollowUpReminder,
    followUpBadgeLabel: string,
    followUpStatusLabels?: Partial<Record<string, string>>,
): string {
    const hasNote = Boolean(fu.note?.trim());
    const isShadow = Boolean(fu.is_natural_shadow);
    const statusKey = fu.follow_up_status ?? 'due';
    if (isShadow) return followUpStatusLabels?.shadow ?? 'Ertelendi (orijinal)';
    if (hasNote && statusKey === 'due') return followUpStatusLabels?.noted ?? 'Notlu';
    return (
        followUpStatusLabels?.[statusKey] ??
        (statusKey === 'postponed'
            ? 'Ertelendi'
            : statusKey === 'contacted'
              ? 'Görüşüldü'
              : statusKey === 'other'
                ? 'Notlu'
                : followUpBadgeLabel)
    );
}

function FollowUpBoardCard({
    reminders,
    dayStr,
    bookServiceId,
    followUpBadgeLabel,
    followUpBookCtaLabel,
    formatFollowUpLine,
    onAddClick,
    onFollowUpManage,
    followUpManageLabel,
    onFollowUpWhatsApp,
    followUpWhatsAppLabel,
    followUpWhatsAppSendingId,
    followUpStatusLabels,
    formatFollowUpPostponedLine,
    followUpOpsCountTemplate,
}: {
    reminders: BeautyFollowUpReminder[];
    dayStr: string;
    bookServiceId: string;
    followUpBadgeLabel: string;
    followUpBookCtaLabel: string;
    formatFollowUpLine: (r: BeautyFollowUpReminder) => string;
    onAddClick: (dateYmd: string, serviceId: string, opts?: { customerId?: string }) => void;
    onFollowUpManage?: (reminder: BeautyFollowUpReminder) => void;
    followUpManageLabel?: string;
    onFollowUpWhatsApp?: (reminder: BeautyFollowUpReminder) => void;
    followUpWhatsAppLabel?: string;
    followUpWhatsAppSendingId?: string | null;
    followUpStatusLabels?: Partial<Record<string, string>>;
    formatFollowUpPostponedLine?: (dueDate: string) => string;
    followUpOpsCountTemplate: string;
}) {
    const live = reminders.filter(r => !r.is_natural_shadow);
    const primary = live[0] ?? reminders[0];
    if (!primary) return null;
    const grouped = reminders.length > 1;
    const hasNote = reminders.some(r => Boolean(r.note?.trim()));
    const theme = getFollowUpReminderCardTheme(primary.follow_up_status, hasNote);
    const isShadowOnly = live.length === 0;
    const followUpPhone = String(primary.customer_phone ?? '').trim();
    const sending = reminders.some(r => followUpWhatsAppSendingId === followUpSendKey(r));
    const waTarget = reminders.find(r => !r.is_natural_shadow && String(r.customer_phone ?? '').trim()) ?? primary;
    const opsLabel = followUpOpsCountTemplate.replace('{n}', String(live.length || reminders.length));
    const badgeText = grouped
        ? hasNote
            ? `${opsLabel} · ${followUpStatusLabels?.other ?? followUpStatusLabels?.noted ?? 'Notlu'}`
            : opsLabel
        : followUpStatusBadgeText(primary, followUpBadgeLabel, followUpStatusLabels);

    const renderNoteAndPostpone = (fu: BeautyFollowUpReminder, compact: boolean) => (
        <>
            {fu.follow_up_status === 'postponed' &&
            !fu.is_natural_shadow &&
            fu.natural_due_date &&
            fu.natural_due_date !== fu.due_date ? (
                <p style={{ margin: '4px 0 0', fontSize: 9, fontWeight: 700, color: theme.badgeColor }}>
                    {formatFollowUpPostponedLine
                        ? formatFollowUpPostponedLine(fu.due_date)
                        : `Yeni tarih: ${fu.due_date}`}
                </p>
            ) : null}
            {fu.is_natural_shadow && fu.postponed_due_date ? (
                <p style={{ margin: '4px 0 0', fontSize: 9, fontWeight: 700, color: theme.badgeColor }}>
                    {formatFollowUpPostponedLine
                        ? formatFollowUpPostponedLine(fu.postponed_due_date)
                        : `Yeni tarih: ${fu.postponed_due_date}`}
                </p>
            ) : null}
            {fu.note?.trim() ? (
                <p
                    style={{
                        margin: compact ? '2px 0 0' : '6px 0 0',
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
        </>
    );

    return (
        <div
            style={{
                borderRadius: 6,
                border: isShadowOnly ? '1px dashed #d1d5db' : theme.border,
                borderLeft: isShadowOnly ? '3px dashed #9ca3af' : theme.borderLeft,
                background: isShadowOnly ? '#f9fafb' : theme.background,
                padding: '8px 10px',
                opacity: isShadowOnly ? 0.52 : 1,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Bell size={12} color={theme.iconColor} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: theme.badgeColor }}>{badgeText}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: theme.titleColor }}>
                {primary.customer_name?.trim() ? primary.customer_name : '—'}
            </p>
            {followUpPhone ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, minWidth: 0 }}>
                    <Phone size={10} color={theme.subColor} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: theme.subColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {followUpPhone}
                    </span>
                </div>
            ) : null}
            {grouped ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {reminders.map((fu, idx) => (
                        <div
                            key={`fu-op-${fu.customer_id}-${fu.service_id}-${fu.product_id ?? 'svc'}-${fu.due_date}-${idx}${fu.is_natural_shadow ? '-sh' : ''}`}
                            style={{
                                padding: '6px 8px',
                                borderRadius: 5,
                                background: 'rgba(255,255,255,0.55)',
                                border: '1px solid rgba(180,83,9,0.18)',
                            }}
                        >
                            <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: theme.titleColor }}>
                                {followUpOpTitle(fu)}
                            </p>
                            <p style={{ margin: '3px 0 0', fontSize: 10, fontWeight: 600, color: theme.subColor, lineHeight: 1.35 }}>
                                {formatFollowUpLine(fu)}
                            </p>
                            {renderNoteAndPostpone(fu, true)}
                            {onFollowUpManage ? (
                                <button
                                    type="button"
                                    onClick={() => onFollowUpManage(fu)}
                                    style={{
                                        marginTop: 6,
                                        height: 26,
                                        width: '100%',
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
                                    <CalendarClock size={11} />
                                    {followUpManageLabel ?? 'Not / ertele'}
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    <p style={{ margin: '4px 0 0', fontSize: 10, fontWeight: 600, color: theme.subColor, lineHeight: 1.35 }}>
                        {formatFollowUpLine(primary)}
                    </p>
                    {renderNoteAndPostpone(primary, false)}
                </>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {!grouped && onFollowUpManage ? (
                    <button
                        type="button"
                        onClick={() => onFollowUpManage(primary)}
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
                        onClick={() => onFollowUpWhatsApp(waTarget)}
                        disabled={sending}
                        style={{
                            height: 30,
                            minWidth: grouped ? undefined : 36,
                            flex: grouped ? 1 : undefined,
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
                            opacity: sending ? 0.6 : 1,
                        }}
                        title={followUpWhatsAppLabel ?? 'Mesaj'}
                    >
                        <MessageCircle size={12} />
                        {followUpWhatsAppLabel ?? 'Mesaj'}
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={() => onAddClick(dayStr, bookServiceId, { customerId: primary.customer_id })}
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
}

function ServiceBoardServiceCell({
    svc,
    dayStr,
    dayApts,
    followUpGroups,
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
    followUpOpsCountTemplate,
}: {
    svc: BeautyService;
    dayStr: string;
    dayApts: BeautyAppointment[];
    followUpGroups: BeautyFollowUpReminder[][];
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
    followUpOpsCountTemplate: string;
}) {
    const svcApts = dayApts
        .filter(a => appointmentMatchesService(a, svc))
        .sort((a, b) => {
            const ma = parseHhmmToMinutes(a.appointment_time ?? a.time) ?? 0;
            const mb = parseHhmmToMinutes(b.appointment_time ?? b.time) ?? 0;
            if (ma !== mb) return ma - mb;
            return String(a.id).localeCompare(String(b.id));
        });
    const countLabel = appointmentsCountTemplate.replace('{n}', String(svcApts.length + followUpGroups.length));
    return (
        <div style={{ padding: '6px 8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: CLINIC.textPrimary }}>{svc.name}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: CLINIC.textSub, flexShrink: 0 }}>{countLabel}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {followUpGroups.map((group, gIdx) => {
                    const head = group[0];
                    return (
                        <FollowUpBoardCard
                            key={`fu-g-${head?.customer_id ?? gIdx}-${head?.service_id ?? svc.id}-${dayStr}-${gIdx}`}
                            reminders={group}
                            dayStr={dayStr}
                            bookServiceId={String(svc.id)}
                            followUpBadgeLabel={followUpBadgeLabel}
                            followUpBookCtaLabel={followUpBookCtaLabel}
                            formatFollowUpLine={formatFollowUpLine}
                            onAddClick={onAddClick}
                            onFollowUpManage={onFollowUpManage}
                            followUpManageLabel={followUpManageLabel}
                            onFollowUpWhatsApp={onFollowUpWhatsApp}
                            followUpWhatsAppLabel={followUpWhatsAppLabel}
                            followUpWhatsAppSendingId={followUpWhatsAppSendingId}
                            followUpStatusLabels={followUpStatusLabels}
                            formatFollowUpPostponedLine={formatFollowUpPostponedLine}
                            followUpOpsCountTemplate={followUpOpsCountTemplate}
                        />
                    );
                })}
                {svcApts.length === 0 && followUpGroups.length === 0 ? (
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
    groupFollowUpsByCustomer = true,
    followUpOpsCountTemplate = '{n}',
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
        followUpOpsCountTemplate,
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
                    const header = formatLongDate(new Date(y, mo - 1, da), dayHeaderLocale);
                    const dayApts = visibleApts.filter(a => beautyAppointmentDateKey(a) === dayStr);
                    const dayFollowUpGroups = assignFollowUpGroupsToServices(
                        followUpReminders.filter(r => r.due_date === dayStr),
                        groupFollowUpsByCustomer,
                    );

                    const mainBlocks = groupedMain.mainKeys.map(mainKey => {
                        const svcs = groupedMain.byMain.get(mainKey) ?? [];
                        const svcsForDay = showOnlyServicesWithBookings
                            ? svcs.filter(svc => {
                                  const hasApt = dayApts.some(a => appointmentMatchesService(a, svc));
                                  const hasFu = (dayFollowUpGroups.get(String(svc.id))?.length ?? 0) > 0;
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
                                            <ServiceBoardServiceCell
                                                key={svc.id}
                                                svc={svc}
                                                dayStr={dayStr}
                                                dayApts={dayApts}
                                                followUpGroups={dayFollowUpGroups.get(String(svc.id)) ?? []}
                                                {...cellProps}
                                            />
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
