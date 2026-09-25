/**
 * Güzellik / klinik modülü görsel dizayn sistemi — web `clinicDesignTokens.ts` ile aynı.
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

/** Dark mode için klinik palet — ThemeColors ile uyumlu uyarlama */
export function clinicColorsForMode(darkMode: boolean, theme: {
  background: string;
  backgroundAlt: string;
  card: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  textSubtle: string;
}) {
  if (!darkMode) {
    return {
      bg: CLINIC.bg,
      surface: CLINIC.surface,
      surfaceMuted: CLINIC.surfaceMuted,
      border: CLINIC.border,
      borderMuted: CLINIC.borderMuted,
      gridLine: CLINIC.gridLine,
      textPrimary: CLINIC.textPrimary,
      textSub: CLINIC.textSub,
      textMuted: CLINIC.textMuted,
      violet: CLINIC.violet,
      violetLight: CLINIC.violetLight,
      violetSurface: CLINIC.violetSurface,
      segmentBg: '#f3f4f6',
    };
  }
  return {
    bg: theme.background,
    surface: theme.card,
    surfaceMuted: theme.backgroundAlt,
    border: theme.cardBorder,
    borderMuted: theme.cardBorder,
    gridLine: theme.cardBorder,
    textPrimary: theme.text,
    textSub: theme.textMuted,
    textMuted: theme.textSubtle,
    violet: CLINIC.violet,
    violetLight: '#2e1065',
    violetSurface: '#1e1b4b',
    segmentBg: theme.backgroundAlt,
  };
}
