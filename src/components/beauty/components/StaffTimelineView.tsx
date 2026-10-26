
import React, { useMemo } from 'react';
import { Plus, User } from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd } from '../../../utils/dateLocal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { buildBeautySpanPlacements, isBeautySpanContinuation } from '../../../utils/beautyScheduleGrid';
import '../ClinicStyles.css';
import { QueueModeResourceList } from './QueueModeResourceList';
import {
    groupBeautyQueueByCustomer,
    suggestQueuePrefillTime,
} from '../../../utils/beautyQueueOrder';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';
import {
    beautyStaffTimelineBoxTone,
    staffTimelineAppointmentCards,
    staffTimelineStatusLabel,
} from '../../../utils/beautyStaffTimelineStatus';
import {
    beautySchedulerResourceColumnDropHandlers,
    beautySchedulerResourceDragStartHandler,
} from '../../../utils/beautySchedulerDragDrop';

interface StaffTimelineViewProps {
    currentDate: Date;
    onAppointmentClick: (apt: BeautyAppointment) => void;
    timeSlots?: string[];
    /** Üçüncü argüman: sütun personel id'si; atanmamış sütun için `__unassigned__` */
    onNewAppointment?: (time?: string, date?: string, staffId?: string) => void;
    appointmentsOverride?: BeautyAppointment[];
    /** Saat ızgarası yerine sıra numarasına göre liste (kayıt / saat sırası) */
    queueMode?: boolean;
    queueSnapMinutes?: number;
    /** Açıkken aynı müşterinin ardışık satırlarını tek kartta birleştir */
    mergeConsecutiveByCustomer?: boolean;
    /** Personel sütunları arasında sürükleyip taşıma */
    resourceDragKind?: 'staff';
    dragResourceTitle?: string;
    onResourceColumnDrop?: (appointmentIds: string[], targetColumnId: string) => void;
    productLabelsByAppointmentId?: Map<string, string[]>;
    lastTreatmentByCustomerId?: Map<string, import('../../../types/beauty').BeautyCustomerLastTreatment>;
}

const UNASSIGNED_ID = '__unassigned__';

export function StaffTimelineView({
    currentDate,
    onAppointmentClick,
    timeSlots,
    onNewAppointment,
    appointmentsOverride,
    queueMode = false,
    queueSnapMinutes = 5,
    mergeConsecutiveByCustomer = true,
    resourceDragKind,
    dragResourceTitle,
    onResourceColumnDrop,
    productLabelsByAppointmentId,
    lastTreatmentByCustomerId,
}: StaffTimelineViewProps) {
    const { tm } = useLanguage();
    const { appointments: storeApts, specialists } = useBeautyStore();
    const appointments = appointmentsOverride ?? storeApts;

    const dateStr = formatLocalYmd(currentDate);
    const dayAppointments = appointments.filter(
        a => beautyAppointmentDateKey(a) === dateStr,
    );

    const slots = (timeSlots && timeSlots.length > 0)
        ? timeSlots
        : Array.from({ length: 16 }, (_, i) => {
            const totalMin = 9 * 60 + i * 60;
            const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
            const mm = (totalMin % 60).toString().padStart(2, '0');
            return `${hh}:${mm}`;
        });

    const slotBucket = (raw: string, interval: number): string => {
        const s = String(raw ?? '').trim();
        const m = s.match(/^(\d{1,2}):(\d{2})/);
        if (!m) return '';
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (Number.isNaN(hh) || Number.isNaN(mm)) return '';
        const total = hh * 60 + mm;
        const buck = Math.floor(total / interval) * interval;
        const bh = Math.floor(buck / 60).toString().padStart(2, '0');
        const bm = (buck % 60).toString().padStart(2, '0');
        return `${bh}:${bm}`;
    };

    const inferredInterval = useMemo(() => {
        if (!slots || slots.length < 2) return 60;
        const p = (t: string) => {
            const m = String(t).match(/^(\d{1,2}):(\d{2})/);
            return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
        };
        const a = p(slots[0]);
        const b = p(slots[1]);
        const d = b - a;
        return d > 0 ? d : 60;
    }, [slots]);
    const activeStaff = useMemo(
        () => specialists.filter(s => s.is_active),
        [specialists]
    );

    const columns: (BeautySpecialist | { id: string; name: string; is_active: boolean; specialty?: string; color?: string; commission_rate?: number })[] = useMemo(
        () => [
            ...activeStaff,
            {
                id: UNASSIGNED_ID,
                name: tm('bUnassignedResource'),
                is_active: true,
                specialty: undefined,
                color: '#9ca3af',
                commission_rate: 0,
            },
        ],
        [activeStaff, tm]
    );

    const columnData = useMemo(() => {
        return columns.map(col => {
            const isUnassigned = col.id === UNASSIGNED_ID;
            const colAll = dayAppointments.filter(a => {
                if (isUnassigned) return !(String(a.staff_id ?? a.specialist_id ?? '').trim());
                return String(a.staff_id ?? a.specialist_id ?? '') === String(col.id);
            });
            const colVisible = colAll.filter(beautyAptVisibleOnSchedule);
            const timelineCards = staffTimelineAppointmentCards(colAll, {
                mergeConsecutiveSameCustomer: mergeConsecutiveByCustomer,
            });
            const shown = queueMode ? colVisible : timelineCards;

            const revenue = isUnassigned
                ? 0
                : colVisible.reduce((sum, a) => sum + Number(a.total_price ?? 0), 0);
            const rate = !isUnassigned && 'commission_rate' in col ? Number(col.commission_rate ?? 0) : 0;
            const commission = (revenue * rate) / 100;

            return {
                col,
                isUnassigned,
                appointments: shown,
                revenue,
                commission,
                rate,
            };
        });
    }, [columns, dayAppointments, mergeConsecutiveByCustomer, queueMode]);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

    if (specialists.length === 0) {
        return (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 48, textAlign: 'center' }}>
                <User size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
                <p style={{ color: '#6b7280', fontSize: 14, fontWeight: 600 }}>{tm('bBookingModalTitleNoSpecialists')}</p>
            </div>
        );
    }

    return (
        <div
            style={{ display: 'flex', gap: 12, overflowX: 'auto', height: '100%', WebkitOverflowScrolling: 'touch' }}
            className="custom-scrollbar"
        >
            {columnData.map(({ col, isUnassigned, appointments: colApts, revenue, commission, rate }) => {
                const accent = (col as BeautySpecialist).color ?? '#7c3aed';
                const queueRowCount = queueMode ? groupBeautyQueueByCustomer(colApts).length : colApts.length;
                const colIdStr = String(col.id);
                const staffDropHandlers =
                    resourceDragKind === 'staff' && onResourceColumnDrop
                        ? beautySchedulerResourceColumnDropHandlers({
                            acceptKind: 'staff',
                            targetColumnId: colIdStr,
                            onDrop: ids => {
                                onResourceColumnDrop(ids, colIdStr);
                            },
                        })
                        : {};
                return (
                    <div
                        key={col.id}
                        style={{
                            flexShrink: 0,
                            width: 'min(260px, 88vw)',
                            background: '#fff',
                            border: '1px solid #e8e4f0',
                            borderRadius: 8,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        {/* Cihaz görünümü ile aynı başlık düzeni */}
                        <div
                            style={{
                                padding: '10px 14px',
                                borderBottom: '1px solid #e8e4f0',
                                background: '#f5f3ff',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                            }}
                        >
                            <div
                                style={{
                                    width: 28,
                                    height: 28,
                                    background: isUnassigned ? '#9ca3af' : accent,
                                    borderRadius: 5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <User size={13} color="#fff" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 12, fontWeight: 800, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {col.name}
                                </p>
                                <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, margin: 0 }}>
                                    {queueRowCount} {tm('bAppointmentWord')}
                                </p>
                                {!isUnassigned && (
                                    <p style={{ fontSize: 9, color: '#6b7280', fontWeight: 600, margin: '4px 0 0', lineHeight: 1.3 }}>
                                        {tm('bTotalRevenueShort')}: {formatCurrency(revenue)} · {tm('bCommissionShort')} (%{rate}): {formatCurrency(commission)}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar" {...staffDropHandlers}>
                            {queueMode ? (
                                <QueueModeResourceList
                                    appointments={colApts}
                                    accent={accent}
                                    resourceDragKind={resourceDragKind === 'staff' ? 'staff' : undefined}
                                    dragResourceTitle={dragResourceTitle}
                                    productLabelsByAppointmentId={productLabelsByAppointmentId}
                                    lastTreatmentByCustomerId={lastTreatmentByCustomerId}
                                    onAppointmentClick={onAppointmentClick}
                                    onAddClick={() => {
                                        const staffColumnId = isUnassigned ? UNASSIGNED_ID : String(col.id);
                                        const res = isUnassigned
                                            ? ({ kind: 'staff' as const, id: null })
                                            : ({ kind: 'staff' as const, id: String(col.id) });
                                        const t = suggestQueuePrefillTime(appointments, dateStr, {
                                            resource: res,
                                            snapMinutes: queueSnapMinutes,
                                        });
                                        onNewAppointment?.(t, dateStr, staffColumnId);
                                    }}
                                />
                            ) : (() => {
                                const SLOT_H = 52;
                                const spanPlacements = buildBeautySpanPlacements(colApts, slots, inferredInterval, slotBucket);
                                return (
                                    <div style={{ display: 'flex', minHeight: slots.length * SLOT_H }}>
                                        <div style={{ width: 44, flexShrink: 0, borderRight: '1px solid #f3f4f6' }}>
                                            {slots.map(time => (
                                                <div
                                                    key={time}
                                                    style={{
                                                        minHeight: SLOT_H,
                                                        borderBottom: '1px solid #f3f4f6',
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        justifyContent: 'center',
                                                        paddingTop: 8,
                                                    }}
                                                >
                                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', fontFamily: 'monospace' }}>{time}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div
                                            style={{
                                                flex: 1,
                                                display: 'grid',
                                                gridTemplateRows: `repeat(${slots.length}, minmax(${SLOT_H}px, auto))`,
                                                alignContent: 'start',
                                            }}
                                            {...staffDropHandlers}
                                        >
                                            {slots.map((time, i) => {
                                                const p = spanPlacements.find(pl => pl.startIdx === i);
                                                if (p) {
                                                    const tone = beautyStaffTimelineBoxTone(p.apt.status);
                                                    const statusLabel = staffTimelineStatusLabel(tone, tm);
                                                    const borderColor = tone.kind === 'waiting'
                                                        ? (p.apt.service_color ?? accent)
                                                        : tone.accent;
                                                    return (
                                                        <div
                                                            key={p.apt.id}
                                                            style={{
                                                                gridRow: `${i + 1} / span ${p.span}`,
                                                                padding: '2px 4px',
                                                                minHeight: 0,
                                                                boxSizing: 'border-box',
                                                            }}
                                                        >
                                                            <div
                                                                {...staffDropHandlers}
                                                                data-testid="staff-timeline-apt"
                                                                data-apt-id={p.apt.id}
                                                                data-tone={tone.kind}
                                                                data-bg={tone.background}
                                                                className={tone.className}
                                                                draggable={resourceDragKind === 'staff' && !!onResourceColumnDrop}
                                                                title={dragResourceTitle}
                                                                onDragStart={
                                                                    resourceDragKind === 'staff' && onResourceColumnDrop
                                                                        ? beautySchedulerResourceDragStartHandler('staff', [p.apt.id])
                                                                        : undefined
                                                                }
                                                                onClick={() => onAppointmentClick(p.apt)}
                                                                style={{
                                                                    height: '100%',
                                                                    minHeight: p.span * SLOT_H - 8,
                                                                    boxSizing: 'border-box',
                                                                    padding: '6px 8px',
                                                                    borderRadius: 4,
                                                                    background: tone.background,
                                                                    borderLeft: `3px solid ${borderColor}`,
                                                                    fontSize: 11,
                                                                    cursor:
                                                                        resourceDragKind === 'staff' && onResourceColumnDrop
                                                                            ? 'grab'
                                                                            : 'pointer',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    justifyContent: 'flex-start',
                                                                    overflow: 'hidden',
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
                                                                    <p style={{ flex: '1 1 auto', minWidth: 0, fontWeight: 700, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.apt.customer_name ?? '—'}</p>
                                                                    <span
                                                                        data-testid="staff-timeline-apt-status"
                                                                        title={statusLabel}
                                                                        style={{
                                                                            flex: '0 1 auto',
                                                                            maxWidth: '48%',
                                                                            margin: 0,
                                                                            fontSize: 9,
                                                                            fontWeight: 800,
                                                                            lineHeight: '12px',
                                                                            color: tone.accent,
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                            whiteSpace: 'nowrap',
                                                                        }}
                                                                    >
                                                                        {statusLabel}
                                                                    </span>
                                                                </div>
                                                                <p style={{ color: '#6b7280', margin: 0, flex: 1, minHeight: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.apt.service_name ?? '—'}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (isBeautySpanContinuation(i, spanPlacements)) return null;
                                                return (
                                                    <div
                                                        key={`add-${col.id}_${time}`}
                                                        style={{
                                                            gridRow: i + 1,
                                                            padding: '4px 6px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            borderBottom: '1px solid #f3f4f6',
                                                            boxSizing: 'border-box',
                                                        }}
                                                    >
                                                        <div
                                                            onClick={() =>
                                                                onNewAppointment?.(
                                                                    time,
                                                                    dateStr,
                                                                    isUnassigned ? UNASSIGNED_ID : String(col.id),
                                                                )
                                                            }
                                                            style={{
                                                                height: 36,
                                                                width: '100%',
                                                                borderRadius: 4,
                                                                border: '1px dashed #e5e7eb',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'pointer',
                                                                color: '#d1d5db',
                                                            }}
                                                        >
                                                            <Plus size={12} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
