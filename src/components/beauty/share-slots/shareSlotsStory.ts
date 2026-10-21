import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import {
    CLINIC_BOARD_DAY_END_MIN,
    CLINIC_BOARD_DAY_START_MIN,
    CLINIC_BOARD_SLOT_MIN,
    buildClinicBoardShareText,
    clinicBoardWhatsAppShareUrl,
    formatBoardMinutes,
    listClinicBoardOpenSlots,
    parseClinicBoardYmd,
    shiftClinicBoardYmd,
    type ClinicBoardShareSlot,
} from '../pages/clinicBoardModel';

/** Klinik kabuğu sekmesi. V1 sırasına eklenir, eski kimlikler değişmez. */
export const SHARE_OPEN_SLOTS_TAB_ID = 'share_open_slots';
export const SHARE_OPEN_SLOTS_LABEL_KEY = 'bShareOpenSlotsNav';

export const SHARE_STORY_WIDTH = 1080;
export const SHARE_STORY_HEIGHT = 1920;
export const SHARE_STORY_FRAME_MS = 320;
export const SHARE_STORY_FPS = 30;
export const SHARE_STORY_DURATION_MS = 4000;
export const SHARE_STORY_REVEAL_MS = 2600;
export const SHARE_SLOTS_BRAND = 'RetailEX';
export const SHARE_SLOTS_NAVY = '#071833';

export const SHARE_SLOTS_PRESETS = [
    { id: 'navy', from: '#071833', to: '#12315c' },
    { id: 'ink', from: '#0c1424', to: '#1a4060' },
    { id: 'plum', from: '#1b1233', to: '#3a215c' },
] as const;

export type ShareSlotsPresetId = (typeof SHARE_SLOTS_PRESETS)[number]['id'];
export type ShareSlotsDayPreset = 'today_tomorrow' | 'three' | 'seven';

export type ShareSlotsBackground =
    | { kind: 'solid'; color: string }
    | { kind: 'preset'; from: string; to: string };

export type ShareSlotsChip = {
    id: string;
    dayYmd: string;
    startMin: number;
    /** Boş dilimin başlangıcı, örn. 09:00. Dolu dilim buraya girmez. */
    label: string;
};

export type ShareSlotsStoryFrame = {
    width: number;
    height: number;
    firmName: string;
    initial: string;
    title: string;
    dayLabel: string;
    pills: string[];
    visiblePills: number;
    cta: string;
    linkLabel: string;
    brand: string;
    note?: string;
    /** Son görünen hapın beliriş oranı. Öncekiler tam görünür. */
    pillEnter?: number;
    background: ShareSlotsBackground;
    photo?: CanvasImageSource | null;
};

export type ShareSlotsAnimFrame = {
    index: number;
    progress: number;
    visible: number;
    enter: number;
};

export type ShareStoryContext = {
    fillStyle: string | CanvasGradient;
    font: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    fillRect(x: number, y: number, w: number, h: number): void;
    fillText(text: string, x: number, y: number, maxWidth?: number): void;
    measureText(text: string): { width: number };
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    closePath(): void;
    arc(x: number, y: number, r: number, start: number, end: number): void;
    fill(): void;
    drawImage?: CanvasRenderingContext2D['drawImage'];
    createLinearGradient?: CanvasRenderingContext2D['createLinearGradient'];
    globalAlpha?: number;
    save?: () => void;
    restore?: () => void;
    translate?: (x: number, y: number) => void;
    scale?: (x: number, y: number) => void;
};

export function shareSlotsPresetLength(preset: ShareSlotsDayPreset): number {
    if (preset === 'three') return 3;
    if (preset === 'seven') return 7;
    return 2;
}

export function shareSlotsDayYmds(todayYmd: string, preset: ShareSlotsDayPreset): string[] {
    const count = shareSlotsPresetLength(preset);
    const days: string[] = [];
    for (let offset = 0; offset < count; offset += 1) {
        days.push(shiftClinicBoardYmd(todayYmd, offset));
    }
    return days;
}

export function shareSlotsDayCaption(
    offset: number,
    labels: { today: string; tomorrow: string },
    ymd: string,
    locale: string,
): string {
    if (offset === 0) return labels.today;
    if (offset === 1) return labels.tomorrow;
    return parseClinicBoardYmd(ymd).toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    });
}

function activeShareStaff(staff: BeautySpecialist[], staffFilterId?: string): BeautySpecialist[] {
    return staff.filter((person) => person.is_active !== false && (!staffFilterId || person.id === staffFilterId));
}

/** Personel veya randevu verisi yoksa 08:00–19:30 çalışma dilimleri boş kabul edilir. */
function openWorkingChips(days: string[]): ShareSlotsChip[] {
    const chips: ShareSlotsChip[] = [];
    for (const dayYmd of days) {
        for (let startMin = CLINIC_BOARD_DAY_START_MIN; startMin < CLINIC_BOARD_DAY_END_MIN; startMin += CLINIC_BOARD_SLOT_MIN) {
            chips.push({
                id: `${dayYmd}|${startMin}`,
                dayYmd,
                startMin,
                label: formatBoardMinutes(startMin),
            });
        }
    }
    return chips;
}

/** Gün gün benzersiz boş başlangıç saatleri. Dolu dilim tahta ile aynı hesapla düşer. */
export function collectShareOpenSlotChips(input: {
    staff: BeautySpecialist[];
    appointments: BeautyAppointment[];
    days: string[];
    staffFilterId?: string;
    unassignedName: string;
}): ShareSlotsChip[] {
    if (activeShareStaff(input.staff, input.staffFilterId).length === 0) {
        return openWorkingChips(input.days);
    }
    const chips: ShareSlotsChip[] = [];
    for (const dayYmd of input.days) {
        const slots = listClinicBoardOpenSlots({
            staff: input.staff,
            appointments: input.appointments,
            dayYmd,
            staffFilterId: input.staffFilterId,
            unassignedName: input.unassignedName,
        });
        const starts = [...new Set(slots.map((slot) => slot.startMin))].sort((a, b) => a - b);
        for (const startMin of starts) {
            chips.push({
                id: `${dayYmd}|${startMin}`,
                dayYmd,
                startMin,
                label: formatBoardMinutes(startMin),
            });
        }
    }
    return chips;
}

export function shareSlotsForPickedDays(input: {
    staff: BeautySpecialist[];
    appointments: BeautyAppointment[];
    days: { ymd: string; label: string }[];
    staffFilterId?: string;
    unassignedName: string;
    picked: ReadonlySet<string>;
}): { dayLabel: string; slots: ClinicBoardShareSlot[] }[] {
    if (activeShareStaff(input.staff, input.staffFilterId).length === 0) {
        return input.days.map((day) => {
            const slots: ClinicBoardShareSlot[] = [];
            for (let startMin = CLINIC_BOARD_DAY_START_MIN; startMin < CLINIC_BOARD_DAY_END_MIN; startMin += CLINIC_BOARD_SLOT_MIN) {
                if (!input.picked.has(`${day.ymd}|${startMin}`)) continue;
                const endMin = startMin + CLINIC_BOARD_SLOT_MIN;
                slots.push({
                    id: `${day.ymd}|${startMin}`,
                    staffId: '',
                    staffName: '',
                    startMin,
                    endMin,
                    label: `${formatBoardMinutes(startMin)}-${formatBoardMinutes(endMin)}`,
                });
            }
            return { dayLabel: day.label, slots };
        });
    }
    return input.days.map((day) => {
        const slots = listClinicBoardOpenSlots({
            staff: input.staff,
            appointments: input.appointments,
            dayYmd: day.ymd,
            staffFilterId: input.staffFilterId,
            unassignedName: input.unassignedName,
        }).filter((slot) => input.picked.has(`${day.ymd}|${slot.startMin}`));
        return { dayLabel: day.label, slots };
    });
}

export function composeShareSlotsMessage(input: {
    firmName: string;
    heading: string;
    note: string;
    groups: { dayLabel: string; slots: ClinicBoardShareSlot[] }[];
    link: string;
    brand: string;
}): string {
    const lines = [input.firmName.trim(), input.heading.trim()];
    if (input.note.trim()) lines.push(input.note.trim());
    for (const group of input.groups) {
        if (!group.slots.length) continue;
        lines.push(buildClinicBoardShareText(group.dayLabel, group.slots, ''));
    }
    if (input.link.trim()) lines.push(input.link.trim());
    if (input.brand.trim()) lines.push(input.brand.trim());
    return lines.filter((line) => line.trim().length > 0).join('\n');
}

export function shareSlotsWhatsAppUrl(text: string): string {
    return clinicBoardWhatsAppShareUrl(text);
}

export function shareSlotsPublicLink(input: {
    origin: string;
    firmNr: string;
    periodNr: string;
    token?: string;
}): string {
    const origin = input.origin.replace(/\/$/, '');
    const firm = encodeURIComponent(input.firmNr.trim() || '001');
    const period = encodeURIComponent(input.periodNr.trim() || '01');
    const token = input.token?.trim();
    const query = token
        ? `period=${period}&token=${encodeURIComponent(token)}`
        : `period=${period}`;
    return `${origin}/book/${firm}?${query}`;
}

export function shareSlotsLinkCaption(link: string, firmName: string): string {
    let host = '';
    try {
        host = new URL(link).host;
    } catch {
        host = '';
    }
    const local = !host || host === 'localhost' || host.startsWith('127.0.0.1');
    const name = firmName.trim();
    if (local) return name ? `${name} · ${SHARE_SLOTS_BRAND}` : SHARE_SLOTS_BRAND;
    return host;
}

export function shareSlotsFirmInitial(firmName: string): string {
    const trimmed = firmName.trim();
    if (!trimmed) return 'R';
    const ch = Array.from(trimmed)[0] ?? 'R';
    if (ch === 'i') return 'İ';
    if (ch === 'ı') return 'I';
    return ch.toLocaleUpperCase('tr-TR');
}

export function shareSlotsRevealCounts(pillCount: number, steps: number): number[] {
    const count = Math.max(1, steps);
    const total = Math.max(0, pillCount);
    const counts: number[] = [];
    for (let index = 1; index <= count; index += 1) {
        if (total === 0) {
            counts.push(0);
            continue;
        }
        counts.push(Math.min(total, Math.ceil((index / count) * total)));
    }
    return counts;
}

/** Birkaç saniyelik video: haplar sırayla belirir, son karede hepsi durur. */
export function shareSlotsVideoPlan(pillCount: number): { counts: number[]; durationMs: number } {
    const steps = Math.min(12, Math.max(8, pillCount > 0 ? pillCount : 8));
    return {
        counts: shareSlotsRevealCounts(pillCount, steps),
        durationMs: steps * SHARE_STORY_FRAME_MS,
    };
}

/** Önizleme ve video için tek hapın opaklık / ölçek eğrisi. progress 0..1. */
export function shareSlotsPillMotion(index: number, count: number, progress: number): { opacity: number; scale: number } {
    const total = Math.max(1, count);
    const clamped = Math.min(1, Math.max(0, progress));
    const start = index / total;
    const end = (index + 1) / total;
    const span = end - start || 1;
    const t = clamped <= start ? 0 : clamped >= end ? 1 : (clamped - start) / span;
    return { opacity: t, scale: 0.84 + 0.16 * t };
}

/**
 * 30 kare/sn, yaklaşık 4 sn. Haplar ilk ~2.6 sn içinde sırayla açılır, sonra kısa duraklama.
 * En az 3 kare. Tuval 1080x1920.
 */
export function shareSlotsAnimationPlan(pillCount: number): {
    frames: ShareSlotsAnimFrame[];
    fps: number;
    durationMs: number;
    revealMs: number;
    width: number;
    height: number;
} {
    const fps = SHARE_STORY_FPS;
    const durationMs = SHARE_STORY_DURATION_MS;
    const revealMs = SHARE_STORY_REVEAL_MS;
    const frameCount = Math.max(3, Math.round((durationMs / 1000) * fps));
    const total = Math.max(0, pillCount);
    const frames: ShareSlotsAnimFrame[] = [];
    for (let index = 0; index < frameCount; index += 1) {
        const timeMs = (index / fps) * 1000;
        const progress = timeMs >= revealMs ? 1 : timeMs / revealMs;
        if (total === 0) {
            frames.push({ index, progress, visible: 0, enter: 1 });
            continue;
        }
        const scaled = progress * total;
        const visible = Math.min(total, Math.max(1, Math.ceil(scaled)));
        const enter = scaled <= 0 ? 0 : (Number.isInteger(scaled) ? 1 : scaled - Math.floor(scaled));
        frames.push({ index, progress, visible, enter });
    }
    return {
        frames,
        fps,
        durationMs,
        revealMs,
        width: SHARE_STORY_WIDTH,
        height: SHARE_STORY_HEIGHT,
    };
}

function textWidth(ctx: ShareStoryContext, text: string, fontSize: number): number {
    const measured = ctx.measureText(text).width;
    if (Number.isFinite(measured) && measured > 0) return measured;
    return Math.max(1, text.length) * fontSize * 0.56;
}

function fillRoundRect(ctx: ShareStoryContext, x: number, y: number, w: number, h: number, radius: number): void {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}

function paintBackground(ctx: ShareStoryContext, frame: ShareSlotsStoryFrame): void {
    const { width, height } = frame;
    if (frame.photo && ctx.drawImage) {
        ctx.drawImage(frame.photo, 0, 0, width, height);
        ctx.fillStyle = 'rgba(7, 24, 51, 0.55)';
        ctx.fillRect(0, 0, width, height);
        return;
    }
    if (frame.background.kind === 'preset' && ctx.createLinearGradient) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, frame.background.from);
        gradient.addColorStop(1, frame.background.to);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        return;
    }
    ctx.fillStyle = frame.background.kind === 'solid' ? frame.background.color : frame.background.from;
    ctx.fillRect(0, 0, width, height);
}

export function paintShareSlotsStory(ctx: ShareStoryContext, frame: ShareSlotsStoryFrame): void {
    const width = frame.width || SHARE_STORY_WIDTH;
    const height = frame.height || SHARE_STORY_HEIGHT;
    paintBackground(ctx, { ...frame, width, height });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(150, 210, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#071833';
    ctx.font = '700 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(frame.initial || 'R', 150, 212);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 36px sans-serif';
    ctx.fillText(frame.firmName || frame.brand, 214, 212, width - 280);

    ctx.font = '800 68px sans-serif';
    ctx.fillText(frame.title, 96, 360, width - 160);

    ctx.fillStyle = '#f0b429';
    ctx.font = '700 32px sans-serif';
    ctx.fillText(frame.dayLabel, 96, 450, width - 160);

    let pillsTop = 530;
    const note = frame.note?.trim() || '';
    if (note) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 28px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(note, 96, 510, width - 160);
        pillsTop = 590;
    }

    const shown = frame.pills.slice(0, Math.max(0, frame.visiblePills));
    const pillFont = 34;
    ctx.font = `700 ${pillFont}px sans-serif`;
    const gapX = 18;
    const gapY = 18;
    const pillH = 78;
    const perRow = 4;
    const maxRow = width - 160;
    const sizes = shown.map((label) => Math.max(168, textWidth(ctx, label, pillFont) + 64));
    const rows: { labels: string[]; widths: number[]; rowWidth: number }[] = [];
    let current: { labels: string[]; widths: number[]; rowWidth: number } = { labels: [], widths: [], rowWidth: 0 };
    shown.forEach((label, index) => {
        const pillW = sizes[index];
        const next = current.labels.length === 0 ? pillW : current.rowWidth + gapX + pillW;
        const rowFull = current.labels.length >= perRow;
        if (current.labels.length > 0 && (rowFull || next > maxRow)) {
            rows.push(current);
            current = { labels: [label], widths: [pillW], rowWidth: pillW };
            return;
        }
        current.labels.push(label);
        current.widths.push(pillW);
        current.rowWidth = next;
    });
    if (current.labels.length) rows.push(current);

    const enter = frame.pillEnter == null ? 1 : Math.min(1, Math.max(0, frame.pillEnter));
    let drawn = 0;
    let y = pillsTop;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const row of rows) {
        let x = (width - row.rowWidth) / 2;
        row.labels.forEach((label, index) => {
            const pillW = row.widths[index];
            const isLast = drawn === shown.length - 1;
            drawn += 1;
            const alpha = isLast ? enter : 1;
            const scale = isLast ? 0.84 + 0.16 * enter : 1;
            const canTransform = typeof ctx.save === 'function'
                && typeof ctx.restore === 'function'
                && typeof ctx.translate === 'function'
                && typeof ctx.scale === 'function';
            if (canTransform) {
                ctx.save?.();
                ctx.globalAlpha = alpha;
                const cx = x + pillW / 2;
                const cy = y + pillH / 2;
                ctx.translate?.(cx, cy);
                ctx.scale?.(scale, scale);
                ctx.translate?.(-cx, -cy);
            }
            ctx.fillStyle = '#ffffff';
            fillRoundRect(ctx, x, y, pillW, pillH, pillH / 2);
            ctx.fillStyle = '#0f172a';
            ctx.font = `700 ${pillFont}px sans-serif`;
            ctx.fillText(label, x + pillW / 2, y + pillH / 2 + 1);
            if (canTransform) {
                ctx.globalAlpha = 1;
                ctx.restore?.();
            }
            x += pillW + gapX;
        });
        y += pillH + gapY;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 32px sans-serif';
    ctx.fillText(frame.cta, width / 2, 1500, width - 160);
    ctx.font = '700 42px sans-serif';
    ctx.fillText('↓', width / 2, 1572);

    const caption = frame.linkLabel || frame.brand;
    ctx.font = '700 30px sans-serif';
    const linkW = Math.min(width - 180, Math.max(360, textWidth(ctx, caption, 30) + 80));
    const linkX = (width - linkW) / 2;
    ctx.fillStyle = '#ffffff';
    fillRoundRect(ctx, linkX, 1636, linkW, 84, 42);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(caption, width / 2, 1678);
    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    ctx.font = '600 24px sans-serif';
    ctx.fillText(frame.brand, width / 2, 1788);
}

export function renderShareSlotsPng(
    frame: ShareSlotsStoryFrame,
    createCanvas?: () => HTMLCanvasElement,
): Promise<Blob> {
    const canvas = createCanvas?.() ?? document.createElement('canvas');
    canvas.width = SHARE_STORY_WIDTH;
    canvas.height = SHARE_STORY_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.reject(new Error('canvas'));
    paintShareSlotsStory(ctx, {
        ...frame,
        width: SHARE_STORY_WIDTH,
        height: SHARE_STORY_HEIGHT,
        visiblePills: frame.pills.length,
    });
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) reject(new Error('png'));
            else resolve(blob);
        }, 'image/png');
    });
}

type StoryCanvas = HTMLCanvasElement & { captureStream?: (frameRate?: number) => MediaStream };

export async function recordShareSlotsVideo(
    frame: Omit<ShareSlotsStoryFrame, 'visiblePills' | 'width' | 'height'>,
    hooks?: {
        createCanvas?: () => StoryCanvas;
        MediaRecorder?: typeof MediaRecorder;
        sleep?: (ms: number) => Promise<void>;
    },
): Promise<Blob> {
    const canvas = hooks?.createCanvas?.() ?? (document.createElement('canvas') as StoryCanvas);
    canvas.width = SHARE_STORY_WIDTH;
    canvas.height = SHARE_STORY_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    const Recorder = hooks?.MediaRecorder ?? globalThis.MediaRecorder;
    if (typeof Recorder !== 'function') throw new Error('recorder');
    const plan = shareSlotsAnimationPlan(frame.pills.length);
    const stream = canvas.captureStream?.(plan.fps);
    if (!stream) throw new Error('stream');
    const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((item) =>
        Recorder.isTypeSupported(item),
    );
    const recorder = new Recorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: BlobPart[] = [];
    const stopped = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => reject(new Error('recorder'));
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'video/webm' });
            if (!blob.size) reject(new Error('empty'));
            else resolve(blob);
        };
    });
    const sleep = hooks?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const frameMs = Math.round(1000 / plan.fps);
    recorder.start(frameMs);
    for (const step of plan.frames) {
        paintShareSlotsStory(ctx, {
            ...frame,
            width: SHARE_STORY_WIDTH,
            height: SHARE_STORY_HEIGHT,
            visiblePills: step.visible,
            pillEnter: step.enter,
        });
        await sleep(frameMs);
    }
    const ask = recorder as MediaRecorder & { requestData?: () => void };
    ask.requestData?.();
    recorder.stop();
    return stopped;
}

export function downloadShareBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

/** Stüdyo modalının beklediği yüzey. Sayfa bu adları kullanmaz. */
export const SHARE_NAVY = SHARE_SLOTS_NAVY;
export const SHARE_BG_PRESETS = [
    { id: 'navy', color: '#071833', labelKey: 'bShareSlotsPresetNavy' },
    { id: 'teal', color: '#0f3d4c', labelKey: 'bShareSlotsPresetTeal' },
    { id: 'plum', color: '#2a1848', labelKey: 'bShareSlotsPresetPlum' },
] as const;
export type ShareBgPresetId = (typeof SHARE_BG_PRESETS)[number]['id'];
export type ShareDaySpan = 'todayTomorrow' | 'threeDays' | 'sevenDays';

export type ShareListedSlot = {
    id: string;
    dayYmd: string;
    startMin: number;
    label: string;
    dayLabel: string;
    staffName: string;
};

export type ShareStoryPlan = {
    width: typeof SHARE_STORY_WIDTH;
    height: typeof SHARE_STORY_HEIGHT;
    companyName: string;
    title: string;
    note: string;
    cta: string;
    footer: string;
    backgroundColor: string;
    hasPhoto: boolean;
    days: { label: string; times: string[] }[];
    selectedTimes: string[];
};

function spanLength(span: ShareDaySpan): number {
    if (span === 'sevenDays') return 7;
    if (span === 'threeDays') return 3;
    return 2;
}

function dayOffset(fromYmd: string, toYmd: string): number {
    const from = parseClinicBoardYmd(fromYmd).getTime();
    const to = parseClinicBoardYmd(toYmd).getTime();
    return Math.round((to - from) / 86400000);
}

export function shareSpanYmds(anchorYmd: string, span: ShareDaySpan): string[] {
    const count = spanLength(span);
    const days: string[] = [];
    for (let offset = 0; offset < count; offset += 1) {
        days.push(shiftClinicBoardYmd(anchorYmd, offset));
    }
    return days;
}

export function listShareOpenSlots(input: {
    staff: BeautySpecialist[];
    appointments: BeautyAppointment[];
    startYmd: string;
    span: ShareDaySpan;
    staffId?: string;
    todayYmd: string;
    labels: { today: string; tomorrow: string };
    labelFor?: (ymd: string) => string;
}): ShareListedSlot[] {
    const days = shareSpanYmds(input.startYmd, input.span);
    const chips = collectShareOpenSlotChips({
        staff: input.staff,
        appointments: input.appointments,
        days,
        staffFilterId: input.staffId,
        unassignedName: '',
    });
    return chips.map((chip) => {
        const offset = dayOffset(input.todayYmd, chip.dayYmd);
        const dayLabel = offset === 0
            ? input.labels.today
            : offset === 1
                ? input.labels.tomorrow
                : (input.labelFor ? input.labelFor(chip.dayYmd) : chip.dayYmd);
        return {
            id: chip.id,
            dayYmd: chip.dayYmd,
            startMin: chip.startMin,
            label: chip.label,
            dayLabel,
            staffName: '',
        };
    });
}

export function groupShareSlotsByDay<T extends { dayYmd: string; dayLabel?: string }>(
    slots: T[],
): { ymd: string; label: string; slots: T[] }[] {
    const order: string[] = [];
    const map = new Map<string, T[]>();
    for (const slot of slots) {
        if (!map.has(slot.dayYmd)) {
            map.set(slot.dayYmd, []);
            order.push(slot.dayYmd);
        }
        map.get(slot.dayYmd)!.push(slot);
    }
    return order.map((ymd) => {
        const group = map.get(ymd) ?? [];
        return { ymd, label: group[0]?.dayLabel || ymd, slots: group };
    });
}

export function buildShareStoryPlan(input: {
    companyName: string;
    title: string;
    note: string;
    cta: string;
    footer: string;
    backgroundColor: string;
    hasPhoto: boolean;
    slots: ShareListedSlot[];
    selectedIds: ReadonlySet<string>;
}): ShareStoryPlan {
    const chosen = input.slots.filter((slot) => input.selectedIds.has(slot.id));
    const days = groupShareSlotsByDay(chosen).map((group) => ({
        label: group.label,
        times: group.slots.map((slot) => slot.label),
    }));
    return {
        width: SHARE_STORY_WIDTH,
        height: SHARE_STORY_HEIGHT,
        companyName: input.companyName.trim() || 'RetailEX',
        title: input.title,
        note: input.note,
        cta: input.cta,
        footer: input.footer,
        backgroundColor: input.backgroundColor,
        hasPhoto: input.hasPhoto,
        days,
        selectedTimes: days.flatMap((day) => day.times),
    };
}

export function buildShareSlotsText(input: {
    title: string;
    days: { label: string; times: string[] }[];
    note: string;
    link: string;
    footer: string;
}): string {
    const lines = [input.title.trim()];
    if (input.note.trim()) lines.push(input.note.trim());
    for (const day of input.days) {
        if (!day.times.length) continue;
        lines.push(day.label);
        lines.push(day.times.join('  '));
    }
    if (input.link.trim()) lines.push(input.link.trim());
    if (input.footer.trim()) lines.push(input.footer.trim());
    return lines.filter((line) => line.trim().length > 0).join('\n');
}

export function shareCopyPayload(link: string, text: string): { kind: 'link' | 'text'; value: string } {
    const trimmed = link.trim();
    if (trimmed) return { kind: 'link', value: trimmed };
    return { kind: 'text', value: text };
}

export function paintShareStory(
    ctx: ShareStoryContext,
    plan: ShareStoryPlan,
    options: { revealCount: number; photo?: CanvasImageSource | null; pillEnter?: number },
): void {
    const activeDays = plan.days.filter((item) => item.times.length);
    paintShareSlotsStory(ctx, {
        width: SHARE_STORY_WIDTH,
        height: SHARE_STORY_HEIGHT,
        firmName: plan.companyName,
        initial: shareSlotsFirmInitial(plan.companyName),
        title: plan.title,
        dayLabel: activeDays.map((item) => item.label).join(' · '),
        pills: plan.selectedTimes,
        visiblePills: options.revealCount,
        cta: plan.cta,
        linkLabel: plan.companyName,
        brand: plan.footer || SHARE_SLOTS_BRAND,
        note: plan.note,
        pillEnter: options.pillEnter,
        background: { kind: 'solid', color: plan.backgroundColor || SHARE_NAVY },
        photo: options.photo ?? null,
    });
}

export async function recordShareStory(
    plan: ShareStoryPlan,
    photo?: CanvasImageSource | null,
): Promise<{ blob: Blob; extension: string } | null> {
    try {
        const activeDays = plan.days.filter((item) => item.times.length);
        const blob = await recordShareSlotsVideo({
            firmName: plan.companyName,
            initial: shareSlotsFirmInitial(plan.companyName),
            title: plan.title,
            dayLabel: activeDays.map((item) => item.label).join(' · '),
            pills: plan.selectedTimes,
            cta: plan.cta,
            linkLabel: plan.companyName,
            brand: plan.footer || SHARE_SLOTS_BRAND,
            note: plan.note,
            background: { kind: 'solid', color: plan.backgroundColor || SHARE_NAVY },
            photo: photo ?? null,
        });
        if (!blob.size) return null;
        const extension = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
        return { blob, extension };
    } catch {
        return null;
    }
}
