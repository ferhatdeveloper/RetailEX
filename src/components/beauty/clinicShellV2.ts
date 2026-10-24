import { useEffect, useState } from 'react';
import { CLINIC_MENU_PALETTE_PLUM } from './clinicMenuPalette';

/** Klinik panosu V2 açık/kapalı. Kabuk rengi değişmez. */
export const CLINIC_V2_STORAGE_KEY = 'retailex_clinic_shell_v2';
export const CLINIC_V2_EVENT = 'retailex-clinic-shell-v2';
export const CLINIC_V2_SURVEY_PANEL_KEY = 'retailex_clinic_v2_survey_panel';
export const CLINIC_V2_CRM_PANEL_KEY = 'retailex_clinic_v2_crm_panel';

/** CRM liste parametresi: tümü / aktif / pasif. */
export const CRM_ACTIVITY_PARAM_KEY = 'retailex_beauty_crm_activity_param';
/** Anket gün kuyruğu parametresi (YYYY-MM-DD). */
export const SURVEY_DAY_PARAM_KEY = 'retailex_beauty_survey_day_param';

export type CrmActivityParam = 'all' | 'active' | 'passive';

/** Açık tahta. Pembe yalnız seçili gün ve birincil düğme. */
export const CLINIC_V2_PALETTE = {
    bg: '#f3f4f6',
    surface: '#ffffff',
    line: '#e5e7eb',
    lineSoft: '#eef0f3',
    text: '#111827',
    muted: '#6b7280',
    accent: '#db2777',
    completed: '#059669',
    pending: '#d97706',
    cancelled: '#e11d48',
    block: '#f8fafc',
} as const;

/** Varsayılan mor kabuk. Seçilen palet `clinicMenuPalette` içindedir. */
export const CLINIC_CLASSIC_SHELL = {
    sidebar: CLINIC_MENU_PALETTE_PLUM.sidebar,
    sidebarLine: CLINIC_MENU_PALETTE_PLUM.sidebarLine,
    accent: CLINIC_MENU_PALETTE_PLUM.accent,
    accentEdge: CLINIC_MENU_PALETTE_PLUM.accentEdge,
    focusRing: CLINIC_MENU_PALETTE_PLUM.focusRing,
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

function readPanelFlag(key: string): boolean {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

function writePanelFlag(key: string, on: boolean): void {
    try {
        localStorage.setItem(key, on ? '1' : '0');
    } catch {
        /* yoksay */
    }
}

export function readClinicV2SurveyPanel(): boolean {
    return readPanelFlag(CLINIC_V2_SURVEY_PANEL_KEY);
}

export function writeClinicV2SurveyPanel(on: boolean): void {
    writePanelFlag(CLINIC_V2_SURVEY_PANEL_KEY, on);
}

export function readClinicV2CrmPanel(): boolean {
    return readPanelFlag(CLINIC_V2_CRM_PANEL_KEY);
}

export function writeClinicV2CrmPanel(on: boolean): void {
    writePanelFlag(CLINIC_V2_CRM_PANEL_KEY, on);
}

/**
 * V2 sol menü, dar şerit ve pano kısayolunda Leads & CRM.
 * Anahtar yoksa veya `0` ise gizli. Pano içi CRM şeridi ayrı anahtardadır.
 */
export const CLINIC_V2_CRM_MENU_KEY = 'retailex_clinic_v2_crm_menu';
export const CLINIC_V2_CRM_MENU_EVENT = 'retailex-clinic-v2-crm-menu';
export const CLINIC_V2_CRM_TAB_ID = 'leads';

export function readClinicV2CrmMenu(): boolean {
    return readPanelFlag(CLINIC_V2_CRM_MENU_KEY);
}

export function writeClinicV2CrmMenu(on: boolean): void {
    writePanelFlag(CLINIC_V2_CRM_MENU_KEY, on);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CLINIC_V2_CRM_MENU_EVENT, { detail: { on } }));
    }
}

export function useClinicV2CrmMenu(): boolean {
    const [on, setOn] = useState(readClinicV2CrmMenu);
    useEffect(() => {
        const sync = () => setOn(readClinicV2CrmMenu());
        window.addEventListener(CLINIC_V2_CRM_MENU_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(CLINIC_V2_CRM_MENU_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);
    return on;
}

/** V2 kabuğunda CRM kapalıyken leads sekmesi anasayfaya döner. V1 bu sonucu uygulamaz. */
export function clinicV2TabAfterCrmMenu(activeTab: string, crmMenuOn: boolean): string {
    if (!crmMenuOn && activeTab === CLINIC_V2_CRM_TAB_ID) return 'dashboard';
    return activeTab;
}

export function writeSurveyDayParam(ymd: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    try {
        localStorage.setItem(SURVEY_DAY_PARAM_KEY, ymd);
    } catch {
        /* yoksay */
    }
}
