/**
 * Güzellik / klinik modülü görsel dizayn sistemi (ClinicDashboard `T` ile uyumlu).
 * ClinicStyles.css --clinic-* değişkenleriyle aynı aile.
 */
export const CLINIC = {
    bg: '#f7f6fb',
    surface: '#ffffff',
    border: '#e8e4f0',
    borderHover: '#c4b5fd',
    borderMuted: '#e5e7eb',
    /** Üst şerit / başlık ayırıcı */
    borderHeader: '#e8e4f0',
    textPrimary: '#111827',
    textSub: '#6b7280',
    textMuted: '#9ca3af',
    violet: '#7c3aed',
    violetHover: '#6d28d9',
    violetLight: '#ede9fe',
    violetSurface: '#f5f3ff',
    /** Saat sütunu / ikincil yüzey */
    surfaceMuted: '#faf9fd',
    gridLine: '#f3f4f6',
    shadowSm: '0 1px 3px rgba(0,0,0,0.06)',
    shadowMd: '0 2px 8px rgba(0,0,0,0.08)',
} as const;

export type ClinicTheme = typeof CLINIC;
