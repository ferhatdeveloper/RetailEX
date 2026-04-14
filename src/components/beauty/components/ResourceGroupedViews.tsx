/**
 * DevExpress WPF Scheduler "Group by Resource" benzeri: üstte kaynak başlıkları, günde sütun başına zaman çizgisi.
 */
import React, { useMemo, useRef } from 'react';
import { Plus } from 'lucide-react';
import { AppointmentStatus, BeautyAppointment, BeautyDevice, BeautySpecialist } from '../../../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd } from '../../../utils/dateLocal';
import {
    compareBeautyQueueOrder,
    groupBeautyQueueByCustomer,
    mergeQueueGroupForCardDisplay,
    sortBeautyAppointmentsQueue,
    suggestQueuePrefillTime,
} from '../../../utils/beautyQueueOrder';
import { CLINIC } from '../clinicDesignTokens';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';
import {
    beautySchedulerResourceColumnDropHandlers,
    beautySchedulerResourceDragOverAllowDrop,
    beautySchedulerResourceDragStartHandler,
} from '../../../utils/beautySchedulerDragDrop';

const PX_PER_HOUR = 52;
const UNASSIGNED = '__unassigned__';

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

function layoutDayColumn(
    apts: BeautyAppointment[],
    dayStartHour: number,
    dayEndHour: number
): { items: { apt: BeautyAppointment; start: number; end: number }[]; assign: Map<string, { col: number; cols: number }> } {
    const startMin = dayStartHour * 60;
    const endMin = dayEndHour * 60;
    const items: { apt: BeautyAppointment; start: number; end: number }[] = [];
    for (const apt of apts) {
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
}

export type ResourceGroupMode = 'staff' | 'device';

interface ColumnDef {
    id: string;
    name: string;
    accent?: string;
}

function buildStaffColumns(
    specialists: BeautySpecialist[],
    appointments: BeautyAppointment[],
    dayStr: string,
    unassignedLabel: string
): ColumnDef[] {
    const dayApts = appointments.filter(
        a => beautyAppointmentDateKey(a) === dayStr && beautyAptVisibleOnSchedule(a),
    );
    const hasUnassigned = dayApts.some(
        a => !(a.staff_id ?? a.specialist_id)?.trim()
    );
    /** DevExpress gibi: tüm aktif kaynaklar sütun olarak gösterilir */
    const cols: ColumnDef[] = specialists
        .filter(s => s.is_active)
        .map(s => ({ id: s.id, name: s.name, accent: s.color || CLINIC.violet }));
    if (hasUnassigned) {
        cols.push({ id: UNASSIGNED, name: unassignedLabel, accent: CLINIC.textMuted });
    }
    return cols;
}

function buildDeviceColumns(
    devices: BeautyDevice[],
    appointments: BeautyAppointment[],
    dayStr: string,
    unassignedLabel: string
): ColumnDef[] {
    const dayApts = appointments.filter(
        a => beautyAppointmentDateKey(a) === dayStr && beautyAptVisibleOnSchedule(a),
    );
    const hasUnassigned = dayApts.some(a => !a.device_id?.trim());
    const cols: ColumnDef[] = devices
        .filter(d => d.is_active)
        .map(d => ({ id: d.id, name: d.name, accent: CLINIC.violet }));
    if (hasUnassigned) {
        cols.push({ id: UNASSIGNED, name: unassignedLabel, accent: CLINIC.textMuted });
    }
    return cols;
}

function filterAptForColumn(apt: BeautyAppointment, colId: string, mode: ResourceGroupMode): boolean {
    if (mode === 'staff') {
        const sid = (apt.staff_id ?? apt.specialist_id ?? '').trim();
        if (colId === UNASSIGNED) return !sid;
        return sid === colId;
    }
    const did = (apt.device_id ?? '').trim();
    if (colId === UNASSIGNED) return !did;
    return did === colId;
}

export interface ResourceGroupedDayViewProps {
    currentDate: Date;
    appointments: BeautyAppointment[];
    specialists: BeautySpecialist[];
    devices: BeautyDevice[];
    mode: ResourceGroupMode;
    unassignedLabel: string;
    emptyResourcesMessage: string;
    /** Üst sol köşe (WPF "Time" hücresi) */
    timeColumnLabel: string;
    renderAppointment: (apt: BeautyAppointment) => React.ReactNode;
    onEmptySlotClick?: (timeHHmm: string, dateYmd: string, resourceColumnId: string) => void;
    dayStartHour?: number;
    dayEndHour?: number;
    queueMode?: boolean;
    queueSnapMinutes?: number;
    resourceDragKind?: 'device' | 'staff';
    dragResourceTitle?: string;
    onResourceColumnDrop?: (appointmentIds: string[], targetColumnId: string) => void;
}

export function ResourceGroupedDayView({
    currentDate,
    appointments,
    specialists,
    devices,
    mode,
    unassignedLabel,
    emptyResourcesMessage,
    timeColumnLabel,
    renderAppointment,
    onEmptySlotClick,
    dayStartHour = 9,
    dayEndHour = 21,
    queueMode = false,
    queueSnapMinutes = 5,
    resourceDragKind,
    dragResourceTitle,
    onResourceColumnDrop,
}: ResourceGroupedDayViewProps) {
    const dayStr = formatLocalYmd(currentDate);
    const scheduleApts = useMemo(
        () => appointments.filter(beautyAptVisibleOnSchedule),
        [appointments],
    );
    const columns = useMemo(() => {
        if (mode === 'staff') {
            return buildStaffColumns(specialists, scheduleApts, dayStr, unassignedLabel);
        }
        return buildDeviceColumns(devices, scheduleApts, dayStr, unassignedLabel);
    }, [mode, specialists, devices, scheduleApts, dayStr, unassignedLabel]);

    const totalMinutes = (dayEndHour - dayStartHour) * 60;
    const totalHeight = (dayEndHour - dayStartHour) * PX_PER_HOUR;
    const hours = useMemo(() => {
        const h: number[] = [];
        for (let i = dayStartHour; i <= dayEndHour; i++) h.push(i);
        return h;
    }, [dayStartHour, dayEndHour]);

    const colLayouts = useMemo(() => {
        const m = new Map<string, ReturnType<typeof layoutDayColumn>>();
        for (const col of columns) {
            const apts = scheduleApts.filter(
                a => beautyAppointmentDateKey(a) === dayStr && filterAptForColumn(a, col.id, mode)
            );
            m.set(col.id, layoutDayColumn(apts, dayStartHour, dayEndHour));
        }
        return m;
    }, [columns, scheduleApts, dayStr, mode, dayStartHour, dayEndHour]);

    if (columns.length === 0) {
        return (
            <div
                style={{
                    maxWidth: 1100,
                    margin: '0 auto',
                    padding: 48,
                    textAlign: 'center',
                    background: CLINIC.surface,
                    border: `1px solid ${CLINIC.border}`,
                    borderRadius: 10,
                    color: CLINIC.textMuted,
                    fontSize: 12,
                    fontWeight: 600,
                }}
            >
                {emptyResourcesMessage}
            </div>
        );
    }

    if (queueMode) {
        const minWQ = columns.length * Math.max(140, Math.min(220, 900 / Math.max(1, columns.length)));
        return (
            <div
                style={{
                    margin: '0 auto',
                    maxWidth: '100%',
                    background: CLINIC.surface,
                    border: `1px solid ${CLINIC.border}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    boxShadow: CLINIC.shadowSm,
                }}
            >
                <div style={{ overflowX: 'auto' }} className="custom-scrollbar">
                    <div style={{ minWidth: minWQ, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', borderBottom: `2px solid ${CLINIC.border}`, background: CLINIC.violetSurface }}>
                            {columns.map(col => (
                                <div
                                    key={col.id}
                                    style={{
                                        flex: '1 1 140px',
                                        minWidth: 120,
                                        padding: '10px 8px',
                                        borderRight: `1px solid ${CLINIC.border}`,
                                        textAlign: 'center',
                                        fontSize: 12,
                                        fontWeight: 800,
                                        color: CLINIC.textPrimary,
                                        background: CLINIC.surface,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        <span
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: 2,
                                                background: col.accent || CLINIC.textMuted,
                                                flexShrink: 0,
                                            }}
                                        />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'stretch' }}>
                            {columns.map(col => {
                                const colApts = sortBeautyAppointmentsQueue(
                                    scheduleApts.filter(
                                        a => beautyAppointmentDateKey(a) === dayStr && filterAptForColumn(a, col.id, mode)
                                    )
                                );
                                const colGroups = groupBeautyQueueByCustomer(colApts);
                                const columnDrop =
                                    resourceDragKind && onResourceColumnDrop
                                        ? beautySchedulerResourceColumnDropHandlers({
                                            acceptKind: resourceDragKind,
                                            targetColumnId: col.id,
                                            onDrop: ids => onResourceColumnDrop(ids, col.id),
                                        })
                                        : {};
                                return (
                                    <div
                                        key={col.id}
                                        {...columnDrop}
                                        style={{
                                            flex: '1 1 140px',
                                            minWidth: 120,
                                            borderRight: `1px solid ${CLINIC.border}`,
                                            background: CLINIC.surface,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 10,
                                            padding: 10,
                                        }}
                                    >
                                        {colGroups.map(group => {
                                            const merged = mergeQueueGroupForCardDisplay(group);
                                            return (
                                                <div
                                                    key={group[0].id}
                                                    {...columnDrop}
                                                    draggable={!!(resourceDragKind && onResourceColumnDrop)}
                                                    title={dragResourceTitle}
                                                    onDragStart={
                                                        resourceDragKind && onResourceColumnDrop
                                                            ? beautySchedulerResourceDragStartHandler(
                                                                resourceDragKind,
                                                                group.map(g => g.id),
                                                            )
                                                            : undefined
                                                    }
                                                    style={
                                                        resourceDragKind && onResourceColumnDrop
                                                            ? { cursor: 'grab' }
                                                            : undefined
                                                    }
                                                >
                                                    {renderAppointment(merged)}
                                                </div>
                                            );
                                        })}
                                        {onEmptySlotClick && (
                                            <div
                                                role="presentation"
                                                onClick={() =>
                                                    onEmptySlotClick(
                                                        suggestQueuePrefillTime(scheduleApts, dayStr, {
                                                            resource:
                                                                mode === 'staff'
                                                                    ? { kind: 'staff', id: col.id === UNASSIGNED ? null : String(col.id) }
                                                                    : { kind: 'device', id: col.id === UNASSIGNED ? null : String(col.id) },
                                                            dayStartHour,
                                                            dayEndHour,
                                                            snapMinutes: queueSnapMinutes,
                                                        }),
                                                        dayStr,
                                                        col.id
                                                    )
                                                }
                                                style={{
                                                    border: `1px dashed ${CLINIC.borderMuted}`,
                                                    borderRadius: 8,
                                                    padding: 10,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    color: CLINIC.textMuted,
                                                }}
                                            >
                                                <Plus size={16} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const minW = 52 + columns.length * Math.max(140, Math.min(220, 900 / Math.max(1, columns.length)));

    return (
        <div
            style={{
                margin: '0 auto',
                maxWidth: '100%',
                background: CLINIC.surface,
                border: `1px solid ${CLINIC.border}`,
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: CLINIC.shadowSm,
            }}
        >
            <div style={{ overflowX: 'auto' }} className="custom-scrollbar">
                <div style={{ minWidth: minW, display: 'flex', flexDirection: 'column' }}>
                    {/* Kaynak başlıkları — klinik yüzey tonları */}
                    <div style={{ display: 'flex', borderBottom: `2px solid ${CLINIC.border}`, background: CLINIC.violetSurface }}>
                        <div
                            style={{
                                width: 52,
                                flexShrink: 0,
                                borderRight: `1px solid ${CLINIC.border}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 10,
                                fontWeight: 800,
                                color: CLINIC.textSub,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                            }}
                        >
                            {timeColumnLabel}
                        </div>
                        {columns.map(col => (
                            <div
                                key={col.id}
                                style={{
                                    flex: '1 1 140px',
                                    minWidth: 120,
                                    padding: '10px 8px',
                                    borderRight: `1px solid ${CLINIC.border}`,
                                    textAlign: 'center',
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: CLINIC.textPrimary,
                                    background: CLINIC.surface,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <span
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: 2,
                                            background: col.accent || CLINIC.textMuted,
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', minHeight: totalHeight }}>
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
                                        paddingRight: 6,
                                        paddingTop: 2,
                                        textAlign: 'right',
                                        fontSize: 11,
                                        fontWeight: 600,
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

                        {columns.map(col => {
                            const layout = colLayouts.get(col.id)!;
                            const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
                                if (!onEmptySlotClick) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const y = e.clientY - rect.top;
                                const ratio = Math.max(0, Math.min(1, y / rect.height));
                                const minsFromStart = ratio * totalMinutes;
                                const snapped = Math.round(minsFromStart / 15) * 15;
                                const abs = dayStartHour * 60 + snapped;
                                const hh = Math.floor(abs / 60);
                                const mm = abs % 60;
                                if (hh > dayEndHour || (hh === dayEndHour && mm > 0)) return;
                                const timeHHmm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                                onEmptySlotClick(timeHHmm, dayStr, col.id);
                            };
                            const columnDrop =
                                resourceDragKind && onResourceColumnDrop
                                    ? beautySchedulerResourceColumnDropHandlers({
                                        acceptKind: resourceDragKind,
                                        targetColumnId: col.id,
                                        onDrop: ids => onResourceColumnDrop(ids, col.id),
                                    })
                                    : {};

                            return (
                                <div
                                    key={col.id}
                                    style={{
                                        flex: '1 1 140px',
                                        minWidth: 120,
                                        position: 'relative',
                                        borderRight: `1px solid ${CLINIC.border}`,
                                        minHeight: totalHeight,
                                        background: CLINIC.surface,
                                    }}
                                >
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
                                        onClick={handleClick}
                                        {...columnDrop}
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
                                        const cidx = meta?.col ?? 0;
                                        const widthPct = 100 / cols;
                                        const leftPct = cidx * widthPct;
                                        return (
                                            <div
                                                key={apt.id}
                                                style={{
                                                    position: 'absolute',
                                                    top: `${top}%`,
                                                    height: `${Math.max(height, 2.5)}%`,
                                                    left: `${leftPct}%`,
                                                    width: `${widthPct}%`,
                                                    padding: '1px 3px',
                                                    boxSizing: 'border-box',
                                                    pointerEvents: 'auto',
                                                    zIndex: 2,
                                                }}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <div
                                                    {...columnDrop}
                                                    draggable={!!(resourceDragKind && onResourceColumnDrop)}
                                                    title={dragResourceTitle}
                                                    onDragStart={
                                                        resourceDragKind && onResourceColumnDrop
                                                            ? beautySchedulerResourceDragStartHandler(resourceDragKind, [apt.id])
                                                            : undefined
                                                    }
                                                    style={{
                                                        height: '100%',
                                                        minHeight: 40,
                                                        overflow: 'hidden',
                                                        fontSize: 10,
                                                        cursor:
                                                            resourceDragKind && onResourceColumnDrop ? 'grab' : undefined,
                                                    }}
                                                >
                                                    {renderAppointment(apt)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function aptTimeRaw(apt: BeautyAppointment): string {
    return apt.appointment_time ?? apt.time ?? '';
}

export interface ResourceGroupedWeekMatrixProps {
    currentDate: Date;
    appointments: BeautyAppointment[];
    specialists: BeautySpecialist[];
    devices: BeautyDevice[];
    mode: ResourceGroupMode;
    workWeekOnly: boolean;
    unassignedLabel: string;
    resourceColumnLabel: string;
    emptyResourcesMessage: string;
    onAppointmentClick: (apt: BeautyAppointment) => void;
    onCellNew?: (dateYmd: string, resourceColumnId: string) => void;
    queueMode?: boolean;
    resourceDragKind?: 'device' | 'staff';
    dragResourceTitle?: string;
    onResourceCellDrop?: (appointmentIds: string[], targetResourceColumnId: string, targetDateYmd: string) => void;
}

export function ResourceGroupedWeekMatrix({
    currentDate,
    appointments,
    specialists,
    devices,
    mode,
    workWeekOnly,
    unassignedLabel,
    resourceColumnLabel,
    emptyResourcesMessage,
    onAppointmentClick,
    onCellNew,
    queueMode = false,
    resourceDragKind,
    dragResourceTitle,
    onResourceCellDrop,
}: ResourceGroupedWeekMatrixProps) {
    const suppressCellClickRef = useRef(0);
    const gridApts = useMemo(
        () => appointments.filter(beautyAptVisibleOnSchedule),
        [appointments],
    );
    const weekDays = useMemo(() => {
        const days: Date[] = [];
        const startOfWeek = new Date(currentDate);
        const dayOfWeek = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startOfWeek.setDate(diff);
        const n = workWeekOnly ? 5 : 7;
        for (let i = 0; i < n; i++) {
            const day = new Date(startOfWeek);
            day.setDate(startOfWeek.getDate() + i);
            days.push(day);
        }
        return days;
    }, [currentDate, workWeekOnly]);

    const rowDefs = useMemo((): ColumnDef[] => {
        let rows: ColumnDef[] = [];
        if (mode === 'staff') {
            rows = specialists.filter(s => s.is_active).map(s => ({ id: s.id, name: s.name, accent: s.color || CLINIC.violet }));
            const hasUnassigned = weekDays.some(d => {
                const ds = formatLocalYmd(d);
                return gridApts.some(
                    a => beautyAppointmentDateKey(a) === ds && !(a.staff_id ?? a.specialist_id)?.trim()
                );
            });
            if (hasUnassigned) {
                rows.push({ id: UNASSIGNED, name: unassignedLabel, accent: CLINIC.textMuted });
            }
        } else {
            rows = devices.filter(d => d.is_active).map(d => ({ id: d.id, name: d.name, accent: CLINIC.violet }));
            const hasUnassigned = weekDays.some(d => {
                const ds = formatLocalYmd(d);
                return gridApts.some(a => beautyAppointmentDateKey(a) === ds && !a.device_id?.trim());
            });
            if (hasUnassigned) {
                rows.push({ id: UNASSIGNED, name: unassignedLabel, accent: CLINIC.textMuted });
            }
        }
        return rows;
    }, [mode, specialists, devices, gridApts, weekDays, unassignedLabel]);

    if (rowDefs.length === 0) {
        return (
            <div
                style={{
                    padding: 48,
                    textAlign: 'center',
                    background: CLINIC.surface,
                    border: `1px solid ${CLINIC.border}`,
                    borderRadius: 10,
                    color: CLINIC.textMuted,
                    fontSize: 12,
                    fontWeight: 600,
                }}
            >
                {emptyResourcesMessage}
            </div>
        );
    }

    return (
        <div
            style={{
                background: CLINIC.surface,
                border: `1px solid ${CLINIC.border}`,
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: CLINIC.shadowSm,
            }}
        >
            <div style={{ overflowX: 'auto' }} className="custom-scrollbar">
                <div style={{ minWidth: 720 }}>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `160px repeat(${weekDays.length}, minmax(100px, 1fr))`,
                            borderBottom: `2px solid ${CLINIC.border}`,
                            background: CLINIC.violetSurface,
                        }}
                    >
                        <div
                            style={{
                                padding: '10px 12px',
                                borderRight: `1px solid ${CLINIC.border}`,
                                fontSize: 10,
                                fontWeight: 800,
                                color: CLINIC.textSub,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}
                        >
                            {resourceColumnLabel}
                        </div>
                        {weekDays.map((day, idx) => {
                            const isToday = day.toDateString() === new Date().toDateString();
                            return (
                                <div
                                    key={idx}
                                    style={{
                                        padding: '10px 8px',
                                        textAlign: 'center',
                                        borderRight: `1px solid ${CLINIC.border}`,
                                        background: isToday ? CLINIC.violetLight : undefined,
                                    }}
                                >
                                    <div style={{ fontSize: 10, fontWeight: 800, color: isToday ? CLINIC.violet : CLINIC.textSub }}>
                                        {day.toLocaleDateString('tr-TR', { weekday: 'short' })}
                                    </div>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: isToday ? CLINIC.violet : CLINIC.textPrimary }}>{day.getDate()}</div>
                                </div>
                            );
                        })}
                    </div>

                    {rowDefs.map(row => (
                        <div
                            key={row.id}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `160px repeat(${weekDays.length}, minmax(100px, 1fr))`,
                                borderBottom: `1px solid ${CLINIC.borderMuted}`,
                                minHeight: 72,
                            }}
                        >
                            <div
                                style={{
                                    padding: '10px 12px',
                                    borderRight: `1px solid ${CLINIC.border}`,
                                    background: CLINIC.surfaceMuted,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: CLINIC.textPrimary,
                                }}
                            >
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: row.accent, flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                            </div>
                            {weekDays.map(day => {
                                const dateStr = formatLocalYmd(day);
                                const cellApts = gridApts.filter(a => {
                                    if (beautyAppointmentDateKey(a) !== dateStr) return false;
                                    return filterAptForColumn(a, row.id, mode);
                                }).sort((a, b) =>
                                    queueMode
                                        ? compareBeautyQueueOrder(a, b)
                                        : aptTimeRaw(a).localeCompare(aptTimeRaw(b))
                                );
                                const cellGroups = queueMode
                                    ? groupBeautyQueueByCustomer(cellApts)
                                    : cellApts.map(a => [a]);
                                const shownGroups = cellGroups.slice(0, 4);
                                const cellDrop =
                                    resourceDragKind && onResourceCellDrop
                                        ? beautySchedulerResourceColumnDropHandlers({
                                            acceptKind: resourceDragKind,
                                            targetColumnId: row.id,
                                            onDrop: ids => {
                                                suppressCellClickRef.current = Date.now() + 500;
                                                onResourceCellDrop(ids, row.id, dateStr);
                                            },
                                        })
                                        : {};

                                return (
                                    <div
                                        key={dateStr}
                                        role="presentation"
                                        onClick={() => {
                                            if (Date.now() < suppressCellClickRef.current) return;
                                            onCellNew?.(dateStr, row.id);
                                        }}
                                        {...cellDrop}
                                        style={{
                                            padding: 6,
                                            borderRight: `1px solid ${CLINIC.gridLine}`,
                                            background: CLINIC.surface,
                                            verticalAlign: 'top',
                                            cursor: onCellNew ? 'pointer' : 'default',
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {shownGroups.map((group, gi) => {
                                                const apt = mergeQueueGroupForCardDisplay(group);
                                                const done = apt.status === AppointmentStatus.COMPLETED || apt.status === 'completed';
                                                return (
                                                <button
                                                    key={group[0].id}
                                                    type="button"
                                                    {...(resourceDragKind && onResourceCellDrop
                                                        ? beautySchedulerResourceDragOverAllowDrop()
                                                        : {})}
                                                    draggable={!!(resourceDragKind && onResourceCellDrop)}
                                                    title={dragResourceTitle}
                                                    onDragStart={
                                                        resourceDragKind && onResourceCellDrop
                                                            ? beautySchedulerResourceDragStartHandler(
                                                                resourceDragKind,
                                                                group.map(g => g.id),
                                                            )
                                                            : undefined
                                                    }
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        onAppointmentClick(group[0]);
                                                    }}
                                                    style={{
                                                        textAlign: 'left',
                                                        padding: '4px 6px',
                                                        borderRadius: 6,
                                                        border: `1px solid ${done ? '#a7f3d0' : CLINIC.border}`,
                                                        borderLeft: `3px solid ${done ? '#059669' : (apt.service_color || CLINIC.violet)}`,
                                                        background: done ? 'rgba(5, 150, 105, 0.12)' : CLINIC.surfaceMuted,
                                                        fontSize: 10,
                                                        cursor:
                                                            resourceDragKind && onResourceCellDrop ? 'grab' : 'pointer',
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 700, color: CLINIC.textPrimary }}>
                                                        {queueMode
                                                            ? `#${gi + 1}`
                                                            : aptTimeRaw(apt).slice(0, 5)}
                                                    </div>
                                                    <div style={{ color: CLINIC.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {apt.customer_name ?? '—'}
                                                    </div>
                                                    {queueMode && (apt.service_name ?? '').trim() ? (
                                                        <div style={{ color: CLINIC.textMuted, fontSize: 9, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {apt.service_name}
                                                        </div>
                                                    ) : null}
                                                </button>
                                                );
                                            })}
                                            {cellGroups.length > 4 && (
                                                <div style={{ fontSize: 9, fontWeight: 700, color: CLINIC.textMuted, textAlign: 'center' }}>
                                                    +{cellGroups.length - 4}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
