import type { DragEvent, DragEventHandler, HTMLAttributes } from 'react';
import type { BeautyAppointment } from '../types/beauty';
import { beautyAppointmentDateKey } from './dateLocal';

/** Takvim sütunlarında randevuyu başka cihaz/personel hücresine taşımak için HTML5 DnD veri tipi */
export const BEAUTY_SCHEDULER_RESOURCE_DRAG_MIME = 'application/x-retailex-beauty-resource';

export type BeautySchedulerResourceDragKind = 'device' | 'staff';

export interface BeautySchedulerResourceDragPayload {
    v: 1;
    kind: BeautySchedulerResourceDragKind;
    appointmentIds: string[];
}

export function stringifyBeautySchedulerResourceDrag(p: BeautySchedulerResourceDragPayload): string {
    return JSON.stringify(p);
}

export function parseBeautySchedulerResourceDrag(raw: string): BeautySchedulerResourceDragPayload | null {
    try {
        const o = JSON.parse(raw) as Partial<BeautySchedulerResourceDragPayload>;
        if (o?.v !== 1) return null;
        if (o.kind !== 'device' && o.kind !== 'staff') return null;
        if (!Array.isArray(o.appointmentIds)) return null;
        const appointmentIds = o.appointmentIds.map(String).filter(Boolean);
        if (!appointmentIds.length) return null;
        return { v: 1, kind: o.kind, appointmentIds };
    } catch {
        return null;
    }
}

function payloadString(kind: BeautySchedulerResourceDragKind, appointmentIds: string[]): string {
    return stringifyBeautySchedulerResourceDrag({ v: 1, kind, appointmentIds });
}

export function beautySchedulerResourceDragStartHandler(
    kind: BeautySchedulerResourceDragKind,
    appointmentIds: string[],
): DragEventHandler {
    return (e) => {
        const ids = [...new Set(appointmentIds.map(String).filter(Boolean))];
        if (!ids.length) return;
        const json = payloadString(kind, ids);
        e.dataTransfer.setData(BEAUTY_SCHEDULER_RESOURCE_DRAG_MIME, json);
        /** Chromium / WebView2: özel MIME bazen drop’ta boş döner; text/plain yedek */
        try {
            e.dataTransfer.setData('text/plain', json);
        } catch {
            /* bazı ortamlar ikinci setData’yı kısıtlayabilir */
        }
        e.dataTransfer.effectAllowed = 'move';
    };
}

const allowDropMove = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

/** Bırakma hedefinin geçerli “drop zone” sayılması için; capture alt metin/çocuklarda da gerekli */
export function beautySchedulerResourceDragOverAllowDrop(): Pick<
    HTMLAttributes<HTMLElement>,
    'onDragOver' | 'onDragEnter' | 'onDragOverCapture' | 'onDragEnterCapture'
> {
    return {
        onDragOver: allowDropMove,
        onDragEnter: allowDropMove,
        onDragOverCapture: allowDropMove,
        onDragEnterCapture: allowDropMove,
    };
}

function readDragPayloadFromDataTransfer(dt: DataTransfer): BeautySchedulerResourceDragPayload | null {
    const raw =
        dt.getData(BEAUTY_SCHEDULER_RESOURCE_DRAG_MIME)?.trim() ||
        dt.getData('text/plain')?.trim();
    return parseBeautySchedulerResourceDrag(raw);
}

const UNASSIGNED = '__unassigned__';

/** Sütun / hücre üzerinde bırakmayı kabul et */
export function beautySchedulerResourceColumnDropHandlers(opts: {
    acceptKind: BeautySchedulerResourceDragKind;
    targetColumnId: string;
    onDrop: (appointmentIds: string[]) => void;
}): Pick<
    HTMLAttributes<HTMLElement>,
    'onDragOver' | 'onDragEnter' | 'onDragOverCapture' | 'onDragEnterCapture' | 'onDrop'
> {
    return {
        onDragOver: allowDropMove,
        onDragEnter: allowDropMove,
        onDragOverCapture: allowDropMove,
        onDragEnterCapture: allowDropMove,
        onDrop: (e) => {
            e.preventDefault();
            e.stopPropagation();
            const p = readDragPayloadFromDataTransfer(e.dataTransfer);
            if (!p || p.kind !== opts.acceptKind) return;
            opts.onDrop(p.appointmentIds);
        },
    };
}

export function buildBeautyResourceMovePatch(
    apt: BeautyAppointment,
    kind: BeautySchedulerResourceDragKind,
    targetColumnId: string,
    targetDateYmd?: string,
): Partial<BeautyAppointment> | null {
    const patch: Partial<BeautyAppointment> = {};
    if (kind === 'device') {
        const next = targetColumnId === UNASSIGNED ? '' : String(targetColumnId).trim();
        const cur = String(apt.device_id ?? '').trim();
        if (cur !== next) {
            patch.device_id = next;
        }
    } else {
        const next = targetColumnId === UNASSIGNED ? '' : String(targetColumnId).trim();
        const cur = String(apt.staff_id ?? apt.specialist_id ?? '').trim();
        if (cur !== next) {
            patch.staff_id = next;
            patch.specialist_id = next;
        }
    }
    const d = (targetDateYmd ?? '').trim();
    if (d && beautyAppointmentDateKey(apt) !== d) {
        patch.date = d;
        patch.appointment_date = d;
    }
    return Object.keys(patch).length ? patch : null;
}
