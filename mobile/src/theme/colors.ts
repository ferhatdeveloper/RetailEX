/**
 * RetailEX mobil tema — web Login / Dashboard ile uyumlu.
 * Açık: soft gri + beyaz kart; koyu: slate (#0f172a) + mavi vurgu (monoton gri değil).
 */

export const palette = {
  blue50: '#eff6ff',
  blue100: '#dbeafe',
  blue200: '#bfdbfe',
  blue400: '#60a5fa',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  blue700: '#1d4ed8',
  indigo600: '#4f46e5',
  indigo700: '#4338ca',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
  slate950: '#020617',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',
  white: '#ffffff',
  black: '#000000',
  green500: '#22c55e',
  green600: '#16a34a',
  orange500: '#f97316',
  indigo500: '#6366f1',
  purple500: '#a855f7',
  pink500: '#ec4899',
  red500: '#ef4444',
  red600: '#dc2626',
  red100: '#fee2e2',
  amber500: '#f59e0b',
  amber600: '#d97706',
} as const;

export type ThemeColors = {
  background: string;
  backgroundAlt: string;
  card: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  inputBg: string;
  inputBorder: string;
  headerFrom: string;
  headerVia: string;
  headerTo: string;
  primary: string;
  primaryPressed: string;
  danger: string;
  overlay: string;
  tabBar: string;
  tabInactive: string;
  iconOnMuted: string;
  /** Hata / uyarı / başarı yüzeyleri (light + dark okunur) */
  errorBg: string;
  errorBorder: string;
  errorText: string;
  warningBg: string;
  warningBorder: string;
  warningText: string;
  warningTextMuted: string;
  successBg: string;
  successText: string;
  successMutedBg: string;
  warningMutedBg: string;
  divider: string;
  elevated: string;
};

export const lightColors: ThemeColors = {
  background: palette.slate50,
  backgroundAlt: palette.slate100,
  card: palette.white,
  cardBorder: palette.slate200,
  text: palette.slate900,
  textMuted: palette.slate500,
  textSubtle: palette.slate400,
  inputBg: palette.white,
  inputBorder: palette.slate200,
  headerFrom: palette.blue600,
  headerVia: palette.indigo600,
  headerTo: palette.blue700,
  primary: palette.blue600,
  primaryPressed: palette.blue700,
  danger: palette.red500,
  overlay: 'rgba(15,23,42,0.40)',
  tabBar: palette.white,
  tabInactive: palette.slate400,
  iconOnMuted: palette.slate400,
  errorBg: '#fef2f2',
  errorBorder: '#fecaca',
  errorText: palette.red600,
  warningBg: '#fffbeb',
  warningBorder: '#fcd34d',
  warningText: '#92400e',
  warningTextMuted: '#78350f',
  successBg: '#ecfdf5',
  successText: palette.green600,
  successMutedBg: '#dcfce7',
  warningMutedBg: '#ffedd5',
  divider: palette.slate200,
  elevated: palette.white,
};

export const darkColors: ThemeColors = {
  background: palette.slate900,
  backgroundAlt: palette.slate950,
  card: palette.slate800,
  cardBorder: '#334155',
  text: '#f8fafc',
  textMuted: palette.slate400,
  textSubtle: palette.slate500,
  inputBg: 'rgba(30,41,59,0.85)',
  inputBorder: '#475569',
  headerFrom: '#1d4ed8',
  headerVia: '#4338ca',
  headerTo: '#1e3a8a',
  primary: palette.blue500,
  primaryPressed: palette.blue400,
  danger: '#f87171',
  overlay: 'rgba(0,0,0,0.55)',
  tabBar: palette.slate800,
  tabInactive: palette.slate500,
  iconOnMuted: palette.blue400,
  errorBg: 'rgba(127,29,29,0.45)',
  errorBorder: 'rgba(248,113,113,0.35)',
  errorText: '#fca5a5',
  warningBg: 'rgba(120,53,15,0.45)',
  warningBorder: 'rgba(251,191,36,0.40)',
  warningText: '#fcd34d',
  warningTextMuted: '#fde68a',
  successBg: 'rgba(6,78,59,0.45)',
  successText: '#4ade80',
  successMutedBg: 'rgba(22,101,52,0.40)',
  warningMutedBg: 'rgba(154,52,18,0.40)',
  divider: '#334155',
  elevated: '#1e293b',
};

/** Dashboard hızlı erişim — ERP mavi / yeşil / turuncu (mor-pembe yok) */
export const shortcutGradients: Record<string, [string, string]> = {
  newsale: ['#3b82f6', '#2563eb'],
  products: ['#4ade80', '#22c55e'],
  addproduct: ['#22c55e', '#16a34a'],
  reports: ['#3b82f6', '#1d4ed8'],
  customers: ['#0ea5e9', '#0284c7'],
  stock: ['#16a34a', '#15803d'],
  invoices: ['#2563eb', '#1e40af'],
  finance: ['#f97316', '#ea580c'],
};
