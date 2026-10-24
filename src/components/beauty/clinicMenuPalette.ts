import { useEffect, useState } from 'react';

/**
 * Klinik V1 sol menü paleti. Anahtar yoksa bugünkü mor kabuk kalır.
 * V2 beyaz şerit bu paleti kullanmaz.
 */
export const CLINIC_MENU_PALETTE_KEY = 'retailex_clinic_menu_palette';
export const CLINIC_MENU_PALETTE_EVENT = 'retailex-clinic-menu-palette';

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

export type ClinicMenuPalette = {
    id: ClinicMenuPaletteId;
    nameKey: string;
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

export function isClinicMenuPaletteId(value: string): value is ClinicMenuPaletteId {
    return (CLINIC_MENU_PALETTE_IDS as readonly string[]).includes(value);
}

export function clinicMenuPaletteById(id: string): ClinicMenuPalette {
    const found = CLINIC_MENU_PALETTES.find((palette) => palette.id === id);
    return found ?? PLUM;
}

export function readClinicMenuPaletteId(): ClinicMenuPaletteId {
    try {
        if (typeof localStorage === 'undefined') return PLUM.id;
        const raw = localStorage.getItem(CLINIC_MENU_PALETTE_KEY);
        if (raw && isClinicMenuPaletteId(raw)) return raw;
    } catch {
        /* depolama kapalı */
    }
    return PLUM.id;
}

export function readClinicMenuPalette(): ClinicMenuPalette {
    return clinicMenuPaletteById(readClinicMenuPaletteId());
}

export function writeClinicMenuPalette(id: ClinicMenuPaletteId): void {
    try {
        localStorage.setItem(CLINIC_MENU_PALETTE_KEY, id);
    } catch {
        /* depolama kapalı */
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CLINIC_MENU_PALETTE_EVENT, { detail: { id } }));
    }
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
