/**
 * Personel / cihaz sütunlarında sıra modu: saat ızgarası yerine üst üste kart listesi.
 */
import React from 'react';
import { Plus } from 'lucide-react';
import type { BeautyAppointment } from '../../../types/beauty';
import { AppointmentStatus } from '../../../types/beauty';
import {
    groupBeautyQueueByCustomer,
    mergeQueueGroupForCardDisplay,
} from '../../../utils/beautyQueueOrder';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';
import {
    beautySchedulerResourceDragOverAllowDrop,
    beautySchedulerResourceDragStartHandler,
} from '../../../utils/beautySchedulerDragDrop';

export interface QueueModeResourceListProps {
    appointments: BeautyAppointment[];
    accent: string;
    onAppointmentClick: (apt: BeautyAppointment) => void;
    onAddClick: () => void;
    /** Tamamlanmış randevu için yeşil ton (cihaz görünümü ile uyumlu) */
    useStatusTint?: boolean;
    /** Sürükleyerek başka cihaz / personel sütununa taşıma */
    resourceDragKind?: 'device' | 'staff';
    /** Sürükle-bırak ipucu (ör. çeviri metni) */
    dragResourceTitle?: string;
}

export function QueueModeResourceList({
    appointments,
    accent,
    onAppointmentClick,
    onAddClick,
    useStatusTint = false,
    resourceDragKind,
    dragResourceTitle,
}: QueueModeResourceListProps) {
    const visible = appointments.filter(beautyAptVisibleOnSchedule);
    const groups = groupBeautyQueueByCustomer(visible);
    const allowDropProps = resourceDragKind ? beautySchedulerResourceDragOverAllowDrop() : {};
    return (
        <div
            style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}
            {...allowDropProps}
        >
            {groups.map((group, idx) => {
                const display = mergeQueueGroupForCardDisplay(group);
                const primary = group[0];
                const timeLabel = (display.appointment_time ?? display.time ?? '').trim().slice(0, 5);
                const done =
                    useStatusTint &&
                    group.every(a => a.status === AppointmentStatus.COMPLETED || a.status === 'completed');
                const bar = done ? '#059669' : (display.service_color ?? primary.service_color ?? accent);
                const bg = done ? '#ecfdf5' : '#faf9fd';
                const cardStyle: React.CSSProperties = {
                    textAlign: 'left',
                    border: `1px solid ${done ? '#bbf7d0' : '#e8e4f0'}`,
                    borderLeft: `3px solid ${bar}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                    background: bg,
                    cursor: resourceDragKind ? 'grab' : 'pointer',
                    font: 'inherit',
                    width: '100%',
                    boxSizing: 'border-box',
                };
                const dragIds = group.map(g => g.id);
                const onDragStart = resourceDragKind
                    ? beautySchedulerResourceDragStartHandler(resourceDragKind, dragIds)
                    : undefined;
                const activateCard = () => onAppointmentClick(primary);
                const keyNav: React.KeyboardEventHandler = e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        activateCard();
                    }
                };
                return resourceDragKind ? (
                    <div
                        key={primary.id}
                        role="button"
                        tabIndex={0}
                        title={dragResourceTitle}
                        draggable
                        {...beautySchedulerResourceDragOverAllowDrop()}
                        onDragStart={onDragStart}
                        onKeyDown={keyNav}
                        onClick={activateCard}
                        style={cardStyle}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                justifyContent: 'space-between',
                                gap: 8,
                                marginBottom: 2,
                            }}
                        >
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af' }}>#{idx + 1}</span>
                            {timeLabel ? (
                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: '#6b7280',
                                        fontVariantNumeric: 'tabular-nums',
                                        flexShrink: 0,
                                    }}
                                >
                                    {timeLabel}
                                </span>
                            ) : null}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{display.customer_name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.35 }}>{display.service_name ?? '—'}</div>
                    </div>
                ) : (
                    <button
                        key={primary.id}
                        type="button"
                        onClick={activateCard}
                        style={cardStyle}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                justifyContent: 'space-between',
                                gap: 8,
                                marginBottom: 2,
                            }}
                        >
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af' }}>#{idx + 1}</span>
                            {timeLabel ? (
                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: '#6b7280',
                                        fontVariantNumeric: 'tabular-nums',
                                        flexShrink: 0,
                                    }}
                                >
                                    {timeLabel}
                                </span>
                            ) : null}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{display.customer_name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.35 }}>{display.service_name ?? '—'}</div>
                    </button>
                );
            })}
            <div
                role="button"
                tabIndex={0}
                onClick={onAddClick}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onAddClick(); }}
                style={{
                    border: '1px dashed #e5e7eb',
                    borderRadius: 6,
                    padding: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#d1d5db',
                }}
            >
                <Plus size={14} />
            </div>
        </div>
    );
}
