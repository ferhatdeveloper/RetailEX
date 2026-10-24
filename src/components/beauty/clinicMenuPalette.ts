import { useEffect, useState } from 'react';

/**
 * Klinik V1 sol menü paleti. Anahtar yoksa veya değer boşsa lavanta döner.
 * Kayıtlı seçim (mor, gül, özel palet) olduğu gibi kalır.
 * V2 beyaz şerit bu paleti kullanmaz.
 * Ödeme penceresi de `useClinicMenuPalette` ile aynı tokenı okur.
 * Özel paletler ve yazı ayarı ayrı anahtarlarda durur; seçim hazır palet anahtarına yazılır.
 */
export const CLINIC_MENU_PALETTE_KEY = 'retailex_clinic_menu_palette';
export const CLINIC_MENU_PALETTE_EVENT = 'retailex-clinic-menu-palette';
export const CLINIC_CUSTOM_PALETTES_KEY = 'retailex_clinic_custom_palettes';
export const CLINIC_FONT_KEY = 'retailex_clinic_font';
export const CLINIC_FONT_EVENT = 'retailex-clinic-font';
export const CLINIC_CUSTOM_PALETTE_LIMIT = 16;
const CLINIC_CUSTOM_NAME_MAX = 40;
const CLINIC_CONTRAST_MIN = 4.5;

export const CLINIC_MENU_PALETTE_IDS = [
    'plum',
    'rose',
    'lavender',
    'sage',
    'champagne',
    'navy',
    'powder',
    'coral',
    'olive',
    'pearl',
] as const;

export type ClinicMenuPaletteId = (typeof CLINIC_MENU_PALETTE_IDS)[number];

/** Anahtar yokken veya değer boşken. Kayıtlı seçimi ezmez. */
export const CLINIC_MENU_PALETTE_DEFAULT_ID: ClinicMenuPaletteId = 'lavender';

export type ClinicMenuPalette = {
    id: string;
    nameKey: string;
    /** Kullanıcının verdiği ad. Hazır paletlerde yoktur. */
    customName?: string;
    /** Koyu zeminde açık yazı, açık zeminde koyu yazı. */
    tone: 'dark' | 'light';
    sidebar: string;
    sidebarLine: string;
    accent: string;
    accentEdge: string;
    focusRing: string;
    text: string;
    muted: string;
    group: string;
    item: string;
    itemHover: string;
    icon: string;
    iconHover: string;
    onAccent: string;
};

/** Bugünkü mor menü. Opaklıklar birebir durur. */
const PLUM: ClinicMenuPalette = {
    id: 'plum',
    nameKey: 'bClinicMenuPalette_plum',
    tone: 'dark',
    sidebar: '#12082a',
    sidebarLine: '#1f0f3a',
    accent: '#7c3aed',
    accentEdge: '#a78bfa',
    focusRing: 'rgba(124,58,237,0.12)',
    text: '#ffffff',
    muted: 'rgba(167,139,250,0.5)',
    group: 'rgba(167,139,250,0.35)',
    item: 'rgba(196,181,253,0.65)',
    itemHover: 'rgba(221,214,254,0.9)',
    icon: 'rgba(167,139,250,0.4)',
    iconHover: 'rgba(196,181,253,0.8)',
    onAccent: '#ffffff',
};

export const CLINIC_MENU_PALETTES: readonly ClinicMenuPalette[] = [
    PLUM,
    {
        id: 'rose',
        nameKey: 'bClinicMenuPalette_rose',
        tone: 'light',
        sidebar: '#fff5f7',
        sidebarLine: '#f3d5dc',
        accent: '#9f1239',
        accentEdge: '#fb7185',
        focusRing: 'rgba(159,18,57,0.10)',
        text: '#3f0d1a',
        muted: '#7a3048',
        group: '#8a3a52',
        item: '#5c1a30',
        itemHover: '#3f0d1a',
        icon: '#7a3048',
        iconHover: '#3f0d1a',
        onAccent: '#ffffff',
    },
    {
        id: 'lavender',
        nameKey: 'bClinicMenuPalette_lavender',
        tone: 'light',
        sidebar: '#f6f3ff',
        sidebarLine: '#e4dcf8',
        accent: '#5b21b6',
        accentEdge: '#c4b5fd',
        focusRing: 'rgba(91,33,182,0.10)',
        text: '#2e1065',
        muted: '#5b4d86',
        group: '#6a5a96',
        item: '#3b0764',
        itemHover: '#2e1065',
        icon: '#5b4d86',
        iconHover: '#2e1065',
        onAccent: '#ffffff',
    },
    {
        id: 'sage',
        nameKey: 'bClinicMenuPalette_sage',
        tone: 'light',
        sidebar: '#f3f7f4',
        sidebarLine: '#d5e4da',
        accent: '#1f5c40',
        accentEdge: '#86b89a',
        focusRing: 'rgba(31,92,64,0.12)',
        text: '#13261c',
        muted: '#3d5c4c',
        group: '#4a6b58',
        item: '#1c3d2c',
        itemHover: '#13261c',
        icon: '#3d5c4c',
        iconHover: '#1c3d2c',
        onAccent: '#ffffff',
    },
    {
        id: 'champagne',
        nameKey: 'bClinicMenuPalette_champagne',
        tone: 'light',
        sidebar: '#faf6ef',
        sidebarLine: '#eadfce',
        accent: '#5c4324',
        accentEdge: '#d4b483',
        focusRing: 'rgba(92,67,36,0.12)',
        text: '#2a2116',
        muted: '#6a5642',
        group: '#7a6450',
        item: '#3f3224',
        itemHover: '#2a2116',
        icon: '#6a5642',
        iconHover: '#2a2116',
        onAccent: '#fffaf3',
    },
    {
        id: 'navy',
        nameKey: 'bClinicMenuPalette_navy',
        tone: 'dark',
        sidebar: '#0c1428',
        sidebarLine: '#1a2744',
        accent: '#1d4ed8',
        accentEdge: '#93c5fd',
        focusRing: 'rgba(37,99,235,0.18)',
        text: '#f8fafc',
        muted: '#c5d4ee',
        group: '#9eb0d0',
        item: '#e2e8f0',
        itemHover: '#ffffff',
        icon: '#b7c6e2',
        iconHover: '#f1f5f9',
        onAccent: '#ffffff',
    },
    {
        id: 'powder',
        nameKey: 'bClinicMenuPalette_powder',
        tone: 'light',
        sidebar: '#f7ebe6',
        sidebarLine: '#e8d4cc',
        accent: '#8d4e5b',
        accentEdge: '#e4b8c0',
        focusRing: 'rgba(141,78,91,0.12)',
        text: '#3b2428',
        muted: '#6d4650',
        group: '#7a5160',
        item: '#4e333a',
        itemHover: '#3b2428',
        icon: '#6d4650',
        iconHover: '#3b2428',
        onAccent: '#ffffff',
    },
    {
        id: 'coral',
        nameKey: 'bClinicMenuPalette_coral',
        tone: 'light',
        sidebar: '#fff3ec',
        sidebarLine: '#f5d5c4',
        accent: '#c2410c',
        accentEdge: '#fdba74',
        focusRing: 'rgba(194,65,12,0.12)',
        text: '#431407',
        muted: '#9a3412',
        group: '#7c2d12',
        item: '#5c2a12',
        itemHover: '#431407',
        icon: '#9a3412',
        iconHover: '#431407',
        onAccent: '#ffffff',
    },
    {
        id: 'olive',
        nameKey: 'bClinicMenuPalette_olive',
        tone: 'light',
        sidebar: '#f4f3e8',
        sidebarLine: '#e0dcc4',
        accent: '#3f4c1c',
        accentEdge: '#b5c07a',
        focusRing: 'rgba(63,76,28,0.12)',
        text: '#1c220e',
        muted: '#4d572e',
        group: '#5a6536',
        item: '#2f3818',
        itemHover: '#1c220e',
        icon: '#4d572e',
        iconHover: '#1c220e',
        onAccent: '#f7f6ef',
    },
    {
        id: 'pearl',
        nameKey: 'bClinicMenuPalette_pearl',
        tone: 'light',
        sidebar: '#f2f4f6',
        sidebarLine: '#d9e0e6',
        accent: '#3e4c5e',
        accentEdge: '#b7c3d0',
        focusRing: 'rgba(62,76,94,0.12)',
        text: '#1a2330',
        muted: '#4e5d70',
        group: '#5a6a7e',
        item: '#2c3a4c',
        itemHover: '#1a2330',
        icon: '#4e5d70',
        iconHover: '#1a2330',
        onAccent: '#ffffff',
    },
];

export const CLINIC_MENU_PALETTE_PLUM = PLUM;

export const CLINIC_FONT_FAMILY_IDS = ['system', 'inter', 'serif', 'mono'] as const;
export type ClinicFontFamilyId = (typeof CLINIC_FONT_FAMILY_IDS)[number];
export const CLINIC_FONT_SIZE_IDS = ['sm', 'md', 'lg', 'xl'] as const;
export type ClinicFontSizeId = (typeof CLINIC_FONT_SIZE_IDS)[number];

/** Varsayılan `system` bugünkü devralınan yazıdır. Inter gövde yığınında durur. */
export const CLINIC_FONT_STACK: Record<ClinicFontFamilyId, string> = {
    system: 'inherit',
    inter: 'Inter, "Noto Sans Arabic", ui-sans-serif, system-ui, sans-serif',
    serif: 'Georgia, "Times New Roman", Times, serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

export const CLINIC_FONT_SCALE: Record<ClinicFontSizeId, number> = {
    sm: 0.875,
    md: 1,
    lg: 1.125,
    xl: 1.25,
};

export const CLINIC_FONT_FAMILY_NAME_KEY: Record<ClinicFontFamilyId, string> = {
    system: 'bClinicFontFamily_system',
    inter: 'bClinicFontFamily_inter',
    serif: 'bClinicFontFamily_serif',
    mono: 'bClinicFontFamily_mono',
};

export const CLINIC_FONT_SIZE_NAME_KEY: Record<ClinicFontSizeId, string> = {
    sm: 'bClinicFontSize_sm',
    md: 'bClinicFontSize_md',
    lg: 'bClinicFontSize_lg',
    xl: 'bClinicFontSize_xl',
};

export type ClinicFontSettings = {
    family: ClinicFontFamilyId;
    size: ClinicFontSizeId;
    stack: string;
    scale: number;
};

export type ClinicCustomPaletteRecord = {
    id: string;
    name: string;
    background: string;
    accent: string;
    text: string;
};

export type ClinicCustomPaletteDraft = {
    name: string;
    background: string;
    accent: string;
    text: string;
};

export type ClinicCustomPaletteFailure = 'name' | 'color' | 'contrast' | 'accent' | 'limit' | 'store';

export type ClinicCustomPaletteSaveResult =
    | { ok: true; id: string; palette: ClinicMenuPalette }
    | { ok: false; reason: ClinicCustomPaletteFailure };

const DEFAULT_FONT: ClinicFontSettings = {
    family: 'system',
    size: 'md',
    stack: CLINIC_FONT_STACK.system,
    scale: CLINIC_FONT_SCALE.md,
};

export function isClinicMenuPaletteId(value: string): value is ClinicMenuPaletteId {
    return (CLINIC_MENU_PALETTE_IDS as readonly string[]).includes(value);
}

export function isClinicFontFamilyId(value: string): value is ClinicFontFamilyId {
    return (CLINIC_FONT_FAMILY_IDS as readonly string[]).includes(value);
}

export function isClinicFontSizeId(value: string): value is ClinicFontSizeId {
    return (CLINIC_FONT_SIZE_IDS as readonly string[]).includes(value);
}

function foldHexLetters(value: string): string {
    let out = '';
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        if (code >= 65 && code <= 70) out += String.fromCharCode(code + 32);
        else out += value.charAt(i);
    }
    return out;
}

export function normalizeClinicHex(raw: string): string | null {
    const trimmed = raw.trim();
    const body = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    const folded = foldHexLetters(body);
    if (!/^[0-9a-f]{3}$/.test(folded) && !/^[0-9a-f]{6}$/.test(folded)) return null;
    const full = folded.length === 3
        ? `${folded.charAt(0)}${folded.charAt(0)}${folded.charAt(1)}${folded.charAt(1)}${folded.charAt(2)}${folded.charAt(2)}`
        : folded;
    return `#${full}`;
}

function hexRgb(hex: string): [number, number, number] {
    const body = hex.slice(1);
    return [
        parseInt(body.slice(0, 2), 16),
        parseInt(body.slice(2, 4), 16),
        parseInt(body.slice(4, 6), 16),
    ];
}

function rgbHex(r: number, g: number, b: number): string {
    const part = (n: number) => {
        const clamped = Math.max(0, Math.min(255, Math.round(n)));
        const hex = clamped.toString(16);
        return hex.length === 1 ? `0${hex}` : hex;
    };
    return `#${part(r)}${part(g)}${part(b)}`;
}

function linearChannel(value: number): number {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function clinicHexContrast(a: string, b: string): number {
    const lum = (hex: string) => {
        const [r, g, bch] = hexRgb(hex);
        return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(bch);
    };
    const hi = Math.max(lum(a), lum(b));
    const lo = Math.min(lum(a), lum(b));
    return (hi + 0.05) / (lo + 0.05);
}

function mixHex(from: string, to: string, amount: number): string {
    const a = hexRgb(from);
    const b = hexRgb(to);
    return rgbHex(
        a[0] + (b[0] - a[0]) * amount,
        a[1] + (b[1] - a[1]) * amount,
        a[2] + (b[2] - a[2]) * amount,
    );
}

function readableMix(background: string, text: string, blend: number): string {
    let amount = blend;
    for (let step = 0; step < 6; step += 1) {
        const mixed = mixHex(text, background, amount);
        if (clinicHexContrast(background, mixed) >= CLINIC_CONTRAST_MIN) return mixed;
        amount /= 2;
    }
    return text;
}

function readableOnAccent(accent: string): string | null {
    const light = '#ffffff';
    const dark = '#1c1917';
    const lightContrast = clinicHexContrast(accent, light);
    const darkContrast = clinicHexContrast(accent, dark);
    if (lightContrast >= CLINIC_CONTRAST_MIN && lightContrast >= darkContrast) return light;
    if (darkContrast >= CLINIC_CONTRAST_MIN) return dark;
    if (lightContrast >= CLINIC_CONTRAST_MIN) return light;
    return null;
}

export function isClinicCustomPaletteId(value: string): boolean {
    if (isClinicMenuPaletteId(value) || !value.startsWith('custom-')) return false;
    const body = value.slice('custom-'.length);
    if (body.length < 6 || body.length > 16) return false;
    for (let i = 0; i < body.length; i += 1) {
        const code = body.charCodeAt(i);
        const hex = (code >= 48 && code <= 57) || (code >= 97 && code <= 102);
        if (!hex) return false;
    }
    return true;
}

function cleanPaletteName(raw: string): string {
    let out = '';
    for (const ch of raw.trim()) {
        const code = ch.codePointAt(0) ?? 0;
        if (code < 32) continue;
        out += ch;
    }
    const chars = Array.from(out);
    if (chars.length <= CLINIC_CUSTOM_NAME_MAX) return out;
    return chars.slice(0, CLINIC_CUSTOM_NAME_MAX).join('');
}

function paletteTone(background: string): 'dark' | 'light' {
    const onLight = clinicHexContrast(background, '#ffffff');
    const onDark = clinicHexContrast(background, '#111827');
    return onLight >= onDark ? 'dark' : 'light';
}

export function materializeClinicCustomPalette(record: ClinicCustomPaletteRecord): ClinicMenuPalette {
    const background = normalizeClinicHex(record.background) ?? PLUM.sidebar;
    const accent = normalizeClinicHex(record.accent) ?? PLUM.accent;
    const text = normalizeClinicHex(record.text) ?? PLUM.text;
    const onAccent = readableOnAccent(accent) ?? '#ffffff';
    return {
        id: record.id,
        nameKey: 'bClinicCustomPaletteTitle',
        customName: record.name,
        tone: paletteTone(background),
        sidebar: background,
        sidebarLine: mixHex(background, text, 0.16),
        accent,
        accentEdge: mixHex(accent, onAccent, 0.42),
        focusRing: `rgba(${hexRgb(accent).join(',')},0.12)`,
        text,
        muted: readableMix(background, text, 0.28),
        group: readableMix(background, text, 0.2),
        item: readableMix(background, text, 0.12),
        itemHover: text,
        icon: readableMix(background, text, 0.28),
        iconHover: text,
        onAccent,
    };
}

function readCustomRecords(): ClinicCustomPaletteRecord[] {
    try {
        if (typeof localStorage === 'undefined') return [];
        const raw = localStorage.getItem(CLINIC_CUSTOM_PALETTES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        const records: ClinicCustomPaletteRecord[] = [];
        for (const row of parsed) {
            if (!row || typeof row !== 'object') continue;
            const item = row as Partial<ClinicCustomPaletteRecord>;
            if (typeof item.id !== 'string' || !isClinicCustomPaletteId(item.id)) continue;
            if (typeof item.name !== 'string') continue;
            const name = cleanPaletteName(item.name);
            const background = typeof item.background === 'string' ? normalizeClinicHex(item.background) : null;
            const accent = typeof item.accent === 'string' ? normalizeClinicHex(item.accent) : null;
            const text = typeof item.text === 'string' ? normalizeClinicHex(item.text) : null;
            if (!name || !background || !accent || !text) continue;
            if (clinicHexContrast(background, text) < CLINIC_CONTRAST_MIN) continue;
            if (!readableOnAccent(accent)) continue;
            records.push({ id: item.id, name, background, accent, text });
        }
        return records;
    } catch {
        return [];
    }
}

export function readClinicCustomPalettes(): ClinicCustomPaletteRecord[] {
    return readCustomRecords();
}

function findCustomRecord(id: string): ClinicCustomPaletteRecord | null {
    return readCustomRecords().find((record) => record.id === id) ?? null;
}

function dispatchPalette(id: string): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(CLINIC_MENU_PALETTE_EVENT, { detail: { id } }));
}

function createCustomPaletteId(existing: ReadonlySet<string>): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const bytes = new Uint8Array(4);
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
        }
        let hex = '';
        for (const byte of bytes) {
            const part = byte.toString(16);
            hex += part.length === 1 ? `0${part}` : part;
        }
        const id = `custom-${hex}`;
        if (!existing.has(id) && isClinicCustomPaletteId(id)) return id;
    }
    const fallback = `custom-${Date.now().toString(16)}`;
    return isClinicCustomPaletteId(fallback) ? fallback : 'custom-abcdef';
}

export function clinicMenuPaletteById(id: string): ClinicMenuPalette {
    const found = CLINIC_MENU_PALETTES.find((palette) => palette.id === id);
    if (found) return found;
    const custom = findCustomRecord(id);
    if (custom) return materializeClinicCustomPalette(custom);
    return CLINIC_MENU_PALETTES.find((palette) => palette.id === CLINIC_MENU_PALETTE_DEFAULT_ID) ?? PLUM;
}

export function listClinicMenuPalettes(): ClinicMenuPalette[] {
    return [
        ...CLINIC_MENU_PALETTES,
        ...readCustomRecords().map((record) => materializeClinicCustomPalette(record)),
    ];
}

function isSelectablePaletteId(id: string): boolean {
    return isClinicMenuPaletteId(id) || findCustomRecord(id) !== null;
}

export function readClinicMenuPaletteId(): string {
    try {
        if (typeof localStorage === 'undefined') return CLINIC_MENU_PALETTE_DEFAULT_ID;
        const raw = localStorage.getItem(CLINIC_MENU_PALETTE_KEY);
        if (raw == null || raw.trim() === '') return CLINIC_MENU_PALETTE_DEFAULT_ID;
        if (isSelectablePaletteId(raw)) return raw;
    } catch {
        /* depolama kapalı */
    }
    return CLINIC_MENU_PALETTE_DEFAULT_ID;
}

export function readClinicMenuPalette(): ClinicMenuPalette {
    return clinicMenuPaletteById(readClinicMenuPaletteId());
}

export function writeClinicMenuPalette(id: string): void {
    if (!isSelectablePaletteId(id)) return;
    try {
        localStorage.setItem(CLINIC_MENU_PALETTE_KEY, id);
    } catch {
        /* depolama kapalı */
    }
    dispatchPalette(id);
}

export function saveClinicCustomPalette(draft: ClinicCustomPaletteDraft): ClinicCustomPaletteSaveResult {
    const name = cleanPaletteName(draft.name);
    if (!name) return { ok: false, reason: 'name' };
    const background = normalizeClinicHex(draft.background);
    const accent = normalizeClinicHex(draft.accent);
    const text = normalizeClinicHex(draft.text);
    if (!background || !accent || !text) return { ok: false, reason: 'color' };
    if (clinicHexContrast(background, text) < CLINIC_CONTRAST_MIN) return { ok: false, reason: 'contrast' };
    if (!readableOnAccent(accent)) return { ok: false, reason: 'accent' };
    const existing = readCustomRecords();
    if (existing.length >= CLINIC_CUSTOM_PALETTE_LIMIT) return { ok: false, reason: 'limit' };
    const record: ClinicCustomPaletteRecord = {
        id: createCustomPaletteId(new Set(existing.map((item) => item.id))),
        name,
        background,
        accent,
        text,
    };
    try {
        localStorage.setItem(CLINIC_CUSTOM_PALETTES_KEY, JSON.stringify([...existing, record]));
    } catch {
        return { ok: false, reason: 'store' };
    }
    writeClinicMenuPalette(record.id);
    return { ok: true, id: record.id, palette: materializeClinicCustomPalette(record) };
}

export function removeClinicCustomPalette(id: string): void {
    if (!isClinicCustomPaletteId(id)) return;
    const next = readCustomRecords().filter((record) => record.id !== id);
    try {
        localStorage.setItem(CLINIC_CUSTOM_PALETTES_KEY, JSON.stringify(next));
    } catch {
        return;
    }
    let raw = '';
    try {
        raw = localStorage.getItem(CLINIC_MENU_PALETTE_KEY) ?? '';
    } catch {
        raw = '';
    }
    if (raw === id) {
        try {
            localStorage.setItem(CLINIC_MENU_PALETTE_KEY, CLINIC_MENU_PALETTE_DEFAULT_ID);
        } catch {
            /* depolama kapalı */
        }
        dispatchPalette(CLINIC_MENU_PALETTE_DEFAULT_ID);
        return;
    }
    dispatchPalette(readClinicMenuPaletteId());
}

export function readClinicFont(): ClinicFontSettings {
    try {
        if (typeof localStorage === 'undefined') return DEFAULT_FONT;
        const raw = localStorage.getItem(CLINIC_FONT_KEY);
        if (!raw) return DEFAULT_FONT;
        const parsed = JSON.parse(raw) as { family?: unknown; size?: unknown };
        const family = typeof parsed.family === 'string' && isClinicFontFamilyId(parsed.family)
            ? parsed.family
            : DEFAULT_FONT.family;
        const size = typeof parsed.size === 'string' && isClinicFontSizeId(parsed.size)
            ? parsed.size
            : DEFAULT_FONT.size;
        return {
            family,
            size,
            stack: CLINIC_FONT_STACK[family],
            scale: CLINIC_FONT_SCALE[size],
        };
    } catch {
        return DEFAULT_FONT;
    }
}

export function writeClinicFont(next: { family?: ClinicFontFamilyId; size?: ClinicFontSizeId }): void {
    const current = readClinicFont();
    const family = next.family && isClinicFontFamilyId(next.family) ? next.family : current.family;
    const size = next.size && isClinicFontSizeId(next.size) ? next.size : current.size;
    try {
        localStorage.setItem(CLINIC_FONT_KEY, JSON.stringify({ family, size }));
    } catch {
        /* depolama kapalı */
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CLINIC_FONT_EVENT, { detail: { family, size } }));
    }
}

export function clinicFontPx(base: number, size: ClinicFontSizeId = 'md'): number {
    return Math.max(8, Math.round(base * CLINIC_FONT_SCALE[size]));
}

export function useClinicMenuPalette(): ClinicMenuPalette {
    const [id, setId] = useState(readClinicMenuPaletteId);
    useEffect(() => {
        const sync = () => setId(readClinicMenuPaletteId());
        window.addEventListener(CLINIC_MENU_PALETTE_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(CLINIC_MENU_PALETTE_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);
    return clinicMenuPaletteById(id);
}

export function useClinicMenuFont(): ClinicFontSettings {
    const [font, setFont] = useState(readClinicFont);
    useEffect(() => {
        const sync = () => setFont(readClinicFont());
        window.addEventListener(CLINIC_FONT_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(CLINIC_FONT_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);
    return font;
}
