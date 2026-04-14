/**
 * DevExpress Scheduler day view benzeri: dikey zaman ekseni, çakışan randevular yan yana.
 */
import React, { useMemo } from 'react';
import { BeautyAppointment } from '../../../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd } from '../../../utils/dateLocal';
import { CLINIC } from '../clinicDesignTokens';
import {
    groupBeautyQueueByCustomer,
    mergeQueueGroupForCardDisplay,
    suggestQueuePrefillTime,
} from '../../../utils/beautyQueueOrder';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';

const PX_PER_HOUR = 56;

function parseTimeToMinutes(t: string | undefined): number | null {
    if (!t || !t.trim()) return null;
    const p = t.trim().split(':');
    const h = Number(p[0]);
    const m = Number(p[1] ?? 0);
    if (Number.isNaN(h)) return null;
    return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
    return a.start < b.end && b.start < a.end;
}

/** Örtüşme grafiğinde bağlı bileşenler = aynı anda çözülmesi gereken kümeler. */
function clusterByOverlap(items: { apt: BeautyAppointment; start: number; end: number }[]) {
    const clusters: typeof items[] = [];
    const seen = new Set<string>();

    for (const seed of items) {
        if (seen.has(seed.apt.id)) continue;
        const cluster: typeof items = [seed];
        seen.add(seed.apt.id);
        let i = 0;
        while (i < cluster.length) {
            const cur = cluster[i];
            i++;
            for (const other of items) {
                if (seen.has(other.apt.id)) continue;
                if (cluster.some(c => overlaps(c, other))) {
                    cluster.push(other);
                    seen.add(other.apt.id);
                }
            }
        }
        clusters.push(cluster);
    }
    return clusters;
}

/** Küme içinde first-fit sütun ataması. */
function assignColumnsInCluster(cluster: { apt: BeautyAppointment; start: number; end: number }[]) {
    const sorted = [...cluster].sort((a, b) => a.start - b.start || a.end - b.end);
    const colEnds: number[] = [];
    const map = new Map<string, { col: number; cols: number }>();

    for (const it of sorted) {
        let col = -1;
        for (let c = 0; c < colEnds.length; c++) {
            if (it.start >= colEnds[c]) {
                col = c;
                colEnds[c] = it.end;
                break;
            }
        }
        if (col < 0) {
            col = colEnds.length;
            colEnds.push(it.end);
        }
        map.set(it.apt.id, { col, cols: colEnds.length });
    }
    const maxC = colEnds.length;
    for (const id of map.keys()) {
        map.get(id)!.cols = maxC;
    }
    return map;
}

export interface DaySchedulerGridProps {
    currentDate: Date;
    appointments: BeautyAppointment[];
    dayStartHour?: number;
    dayEndHour?: number;
    renderAppointment: (apt: BeautyAppointment) => React.ReactNode;
    onEmptySlotClick?: (timeHHmm: string, dateYmd: string) => void;
    /** Saat ekseni olmadan sıralı liste */
    queueMode?: boolean;
    /** Sıra modunda önerilen saat dilimi (toolbar dakika aralığı ile aynı) */
    queueSnapMinutes?: number;
}

export function DaySchedulerGrid({
    currentDate,
    appointments,
    dayStartHour = 9,
    dayEndHour = 21,
    renderAppointment,
    onEmptySlotClick,
    queueMode = false,
    queueSnapMinutes = 5,
}: DaySchedulerGridProps) {
    const dayStr = formatLocalYmd(currentDate);
    const dayApts = useMemo(
        () =>
            appointments.filter(
                a => beautyAppointmentDateKey(a) === dayStr && beautyAptVisibleOnSchedule(a),
            ),
        [appointments, dayStr]
    );

    const totalMinutes = (dayEndHour - dayStartHour) * 60;
    const totalHeight = (dayEndHour - dayStartHour) * PX_PER_HOUR;

    const layout = useMemo(() => {
        const startMin = dayStartHour * 60;
        const endMin = dayEndHour * 60;
        const items: { apt: BeautyAppointment; start: number; end: number }[] = [];

        for (const apt of dayApts) {
            const raw = parseTimeToMinutes(apt.appointment_time ?? apt.time ?? undefined);
            if (raw === null) continue;
            const dur = Math.max(15, apt.duration || 30);
            let s = raw;
            let e = s + dur;
            if (e <= startMin || s >= endMin) continue;
            s = Math.max(s, startMin);
            e = Math.min(e, endMin);
            items.push({ apt, start: s, end: e });
        }

        const assign = new Map<string, { col: number; cols: number }>();
        for (const cluster of clusterByOverlap(items)) {
            const sub = assignColumnsInCluster(cluster);
            for (const [id, v] of sub) assign.set(id, v);
        }
        return { items, assign };
    }, [dayApts, dayStartHour, dayEndHour]);

    const hours = useMemo(() => {
        const h: number[] = [];
        for (let i = dayStartHour; i <= dayEndHour; i++) h.push(i);
        return h;
    }, [dayStartHour, dayEndHour]);

    const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!onEmptySlotClick) return;
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const ratio = Math.max(0, Math.min(1, y / rect.height));
        const minsFromStart = ratio * totalMinutes;
        const snapped = Math.round(minsFromStart / 15) * 15;
        const abs = dayStartHour * 60 + snapped;
        const hh = Math.floor(abs / 60);
        const mm = abs % 60;
        if (hh > dayEndHour || (hh === dayEndHour && mm > 0)) return;
        const timeHHmm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        onEmptySlotClick(timeHHmm, dayStr);
    };

    if (queueMode) {
        const groups = groupBeautyQueueByCustomer(dayApts);
        return (
            <div
                style={{
                    maxWidth: 900,
                    margin: '0 auto',
                    background: CLINIC.surface,
                    border: `1px solid ${CLINIC.border}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    boxShadow: CLINIC.shadowSm,
                }}
            >
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {groups.map(group => (
                        <div key={group[0].id}>{renderAppointment(mergeQueueGroupForCardDisplay(group))}</div>
                    ))}
                    {onEmptySlotClick && (
                        <button
                            type="button"
                            onClick={() =>
                                onEmptySlotClick(
                                    suggestQueuePrefillTime(appointments, dayStr, {
                                        resource: 'none',
                                        dayStartHour,
                                        dayEndHour,
                                        snapMinutes: queueSnapMinutes,
                                    }),
                                    dayStr
                                )
                            }
                            style={{
                                padding: '12px 16px',
                                borderRadius: 8,
                                border: `1px dashed ${CLINIC.border}`,
                                background: CLINIC.surfaceMuted,
                                color: CLINIC.textSub,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            +
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                maxWidth: 900,
                margin: '0 auto',
                background: CLINIC.surface,
                border: `1px solid ${CLINIC.border}`,
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: CLINIC.shadowSm,
            }}
        >
            <div style={{ display: 'flex', minHeight: totalHeight + 24 }}>
                <div
                    style={{
                        width: 52,
                        flexShrink: 0,
                        borderRight: `1px solid ${CLINIC.border}`,
                        background: CLINIC.surfaceMuted,
                    }}
                >
                    {hours.slice(0, -1).map(h => (
                        <div
                            key={h}
                            style={{
                                height: PX_PER_HOUR,
                                paddingRight: 8,
                                paddingTop: 4,
                                textAlign: 'right',
                                fontSize: 11,
                                fontWeight: 700,
                                color: CLINIC.textMuted,
                                fontFamily: 'ui-monospace, monospace',
                                borderBottom: `1px solid ${CLINIC.gridLine}`,
                                boxSizing: 'border-box',
                            }}
                        >
                            {`${String(h).padStart(2, '0')}:00`}
                        </div>
                    ))}
                </div>
                <div style={{ flex: 1, position: 'relative', minHeight: totalHeight }}>
                    {hours.slice(0, -1).map(h => (
                        <div
                            key={h}
                            style={{
                                height: PX_PER_HOUR,
                                borderBottom: `1px solid ${CLINIC.gridLine}`,
                                boxSizing: 'border-box',
                            }}
                        />
                    ))}
                    <div
                        role="presentation"
                        onClick={handleGridClick}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            cursor: onEmptySlotClick ? 'pointer' : 'default',
                            zIndex: 1,
                        }}
                    />
                    {layout.items.map(({ apt, start, end }) => {
                        const top = ((start - dayStartHour * 60) / totalMinutes) * 100;
                        const height = ((end - start) / totalMinutes) * 100;
                        const meta = layout.assign.get(apt.id);
                        const cols = Math.max(1, meta?.cols ?? 1);
                        const col = meta?.col ?? 0;
                        const widthPct = 100 / cols;
                        const leftPct = col * widthPct;
                        return (
                            <div
                                key={apt.id}
                                style={{
                                    position: 'absolute',
                                    top: `${top}%`,
                                    height: `${Math.max(height, 2.5)}%`,
                                    left: `${leftPct}%`,
                                    width: `${widthPct}%`,
                                    padding: '2px 4px',
                                    boxSizing: 'border-box',
                                    pointerEvents: 'auto',
                                    zIndex: 2,
                                }}
                                onClick={e => e.stopPropagation()}
                            >
                                <div style={{ height: '100%', minHeight: 44, overflow: 'hidden' }}>{renderAppointment(apt)}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
