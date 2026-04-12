/**
 * DevExpress WPF Scheduler "Group by Resource" benzeri: üstte kaynak başlıkları, günde sütun başına zaman çizgisi.
 */
import React, { useMemo } from 'react';
import { AppointmentStatus, BeautyAppointment, BeautyDevice, BeautySpecialist } from '../../../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd } from '../../../utils/dateLocal';
import { CLINIC } from '../clinicDesignTokens';

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
    const dayApts = appointments.filter(a => beautyAppointmentDateKey(a) === dayStr);
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
    const dayApts = appointments.filter(a => beautyAppointmentDateKey(a) === dayStr);
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
}: ResourceGroupedDayViewProps) {
    const dayStr = formatLocalYmd(currentDate);
    const columns = useMemo(() => {
        if (mode === 'staff') {
            return buildStaffColumns(specialists, appointments, dayStr, unassignedLabel);
        }
        return buildDeviceColumns(devices, appointments, dayStr, unassignedLabel);
    }, [mode, specialists, devices, appointments, dayStr, unassignedLabel]);

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
            const apts = appointments.filter(
                a => beautyAppointmentDateKey(a) === dayStr && filterAptForColumn(a, col.id, mode)
            );
            m.set(col.id, layoutDayColumn(apts, dayStartHour, dayEndHour));
        }
        return m;
    }, [columns, appointments, dayStr, mode, dayStartHour, dayEndHour]);

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
                                                <div style={{ height: '100%', minHeight: 40, overflow: 'hidden', fontSize: 10 }}>
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
}: ResourceGroupedWeekMatrixProps) {
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
                return appointments.some(
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
                return appointments.some(a => beautyAppointmentDateKey(a) === ds && !a.device_id?.trim());
            });
            if (hasUnassigned) {
                rows.push({ id: UNASSIGNED, name: unassignedLabel, accent: CLINIC.textMuted });
            }
        }
        return rows;
    }, [mode, specialists, devices, appointments, weekDays, unassignedLabel]);

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
                                const cellApts = appointments.filter(a => {
                                    if (beautyAppointmentDateKey(a) !== dateStr) return false;
                                    return filterAptForColumn(a, row.id, mode);
                                }).sort((a, b) => aptTimeRaw(a).localeCompare(aptTimeRaw(b)));

                                return (
                                    <div
                                        key={dateStr}
                                        role="presentation"
                                        onClick={() => onCellNew?.(dateStr, row.id)}
                                        style={{
                                            padding: 6,
                                            borderRight: `1px solid ${CLINIC.gridLine}`,
                                            background: CLINIC.surface,
                                            verticalAlign: 'top',
                                            cursor: onCellNew ? 'pointer' : 'default',
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {cellApts.slice(0, 4).map(apt => {
                                                const done = apt.status === AppointmentStatus.COMPLETED || apt.status === 'completed';
                                                return (
                                                <button
                                                    key={apt.id}
                                                    type="button"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        onAppointmentClick(apt);
                                                    }}
                                                    style={{
                                                        textAlign: 'left',
                                                        padding: '4px 6px',
                                                        borderRadius: 6,
                                                        border: `1px solid ${done ? '#a7f3d0' : CLINIC.border}`,
                                                        borderLeft: `3px solid ${done ? '#059669' : (apt.service_color || CLINIC.violet)}`,
                                                        background: done ? 'rgba(5, 150, 105, 0.12)' : CLINIC.surfaceMuted,
                                                        fontSize: 10,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 700, color: CLINIC.textPrimary }}>{aptTimeRaw(apt).slice(0, 5)}</div>
                                                    <div style={{ color: CLINIC.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {apt.customer_name ?? '—'}
                                                    </div>
                                                </button>
                                                );
                                            })}
                                            {cellApts.length > 4 && (
                                                <div style={{ fontSize: 9, fontWeight: 700, color: CLINIC.textMuted, textAlign: 'center' }}>
                                                    +{cellApts.length - 4}
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
