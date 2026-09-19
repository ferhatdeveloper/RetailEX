import type { CSSProperties } from 'react';

/** MainLayout / ScreenSettings ile aynı anahtar ve sınırlar */
export const APP_ZOOM_STORAGE_KEY = 'retailos_zoom_level';
export const APP_ZOOM_MIN = 50;
export const APP_ZOOM_MAX = 200;
export const APP_ZOOM_STEP = 10;
export const APP_ZOOM_DEFAULT = 100;

export function normalizeAppZoomLevel(rawValue: unknown): number {
    const parsed = Number.parseInt(String(rawValue ?? ''), 10);
    if (!Number.isFinite(parsed)) return APP_ZOOM_DEFAULT;
    const stepped = Math.round(parsed / APP_ZOOM_STEP) * APP_ZOOM_STEP;
    return Math.min(APP_ZOOM_MAX, Math.max(APP_ZOOM_MIN, stepped));
}

export function readAppZoomLevel(): number {
    try {
        if (typeof localStorage === 'undefined') return APP_ZOOM_DEFAULT;
        return normalizeAppZoomLevel(localStorage.getItem(APP_ZOOM_STORAGE_KEY));
    } catch {
        return APP_ZOOM_DEFAULT;
    }
}

/** html.style.zoom sonrası fiziksel ekranı doldurmak için (MainLayout formülü) */
export function getZoomCompensationRatio(zoomLevel = readAppZoomLevel()): number {
    const z = zoomLevel > 0 ? zoomLevel : APP_ZOOM_DEFAULT;
    return 100 / z;
}

/**
 * body portal’lı tam ekran kabuk stilleri.
 * `inset: 0` + düz `100vw` kullanma — zoom < 100 iken sağda/altta boşluk kalır.
 */
export function getZoomCompensatedFullscreenStyle(
    overrides: CSSProperties = {},
): CSSProperties {
    const ratio = getZoomCompensationRatio();
    return {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 'auto',
        bottom: 'auto',
        width: `${ratio * 100}vw`,
        height: `${ratio * 100}dvh`,
        maxWidth: 'none',
        maxHeight: 'none',
        boxSizing: 'border-box',
        ...overrides,
    };
}
