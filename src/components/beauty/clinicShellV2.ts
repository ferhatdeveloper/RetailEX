import { useEffect, useState } from 'react';

/** Klinik kabuğu V2 (pembe taç paleti). Klasik panel `0`. */
export const CLINIC_V2_STORAGE_KEY = 'retailex_clinic_shell_v2';
export const CLINIC_V2_EVENT = 'retailex-clinic-shell-v2';

/** CRM liste parametresi: tümü / aktif / pasif. */
export const CRM_ACTIVITY_PARAM_KEY = 'retailex_beauty_crm_activity_param';
/** Anket gün kuyruğu parametresi (YYYY-MM-DD). */
export const SURVEY_DAY_PARAM_KEY = 'retailex_beauty_survey_day_param';

export type CrmActivityParam = 'all' | 'active' | 'passive';

export const CLINIC_V2_PALETTE = {
    bg: '#fff5f8',
    surface: '#ffffff',
    border: '#fbcfe8',
    pink: '#db2777',
    pinkDeep: '#9d174d',
    pinkSoft: '#fce7f3',
    text: '#1f2937',
    muted: '#6b7280',
    completed: '#059669',
    pending: '#d97706',
    cancelled: '#e11d48',
} as const;

export const CLINIC_CLASSIC_SHELL = {
    sidebar: '#12082a',
    sidebarLine: '#1f0f3a',
    accent: '#7c3aed',
    accentEdge: '#a78bfa',
    focusRing: 'rgba(124,58,237,0.12)',
} as const;

export const CLINIC_V2_SHELL = {
    sidebar: '#3b1024',
    sidebarLine: '#5b1a38',
    accent: '#db2777',
    accentEdge: '#f9a8d4',
    focusRing: 'rgba(219,39,119,0.16)',
} as const;

export function readClinicShellV2(): boolean {
    try {
        if (typeof localStorage === 'undefined') return false;
        return localStorage.getItem(CLINIC_V2_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function writeClinicShellV2(on: boolean): void {
    try {
        localStorage.setItem(CLINIC_V2_STORAGE_KEY, on ? '1' : '0');
    } catch {
        /* depolama kapalı */
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CLINIC_V2_EVENT, { detail: { on } }));
    }
}

export function useClinicShellV2(): boolean {
    const [on, setOn] = useState(readClinicShellV2);
    useEffect(() => {
        const sync = () => setOn(readClinicShellV2());
        window.addEventListener(CLINIC_V2_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(CLINIC_V2_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);
    return on;
}

export function readCrmActivityParam(): CrmActivityParam {
    try {
        const raw = localStorage.getItem(CRM_ACTIVITY_PARAM_KEY);
        if (raw === 'active' || raw === 'passive' || raw === 'all') return raw;
    } catch {
        /* yoksay */
    }
    return 'all';
}

export function writeCrmActivityParam(value: CrmActivityParam): void {
    try {
        localStorage.setItem(CRM_ACTIVITY_PARAM_KEY, value);
    } catch {
        /* yoksay */
    }
}

export function readSurveyDayParam(fallbackYmd: string): string {
    try {
        const raw = String(localStorage.getItem(SURVEY_DAY_PARAM_KEY) ?? '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    } catch {
        /* yoksay */
    }
    return fallbackYmd;
}

export function writeSurveyDayParam(ymd: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    try {
        localStorage.setItem(SURVEY_DAY_PARAM_KEY, ymd);
    } catch {
        /* yoksay */
    }
}
