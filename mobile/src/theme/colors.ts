/**
 * RetailEX mobil tema — web Login / Dashboard / ManagementModule ile uyumlu.
 * darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
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
};

export const lightColors: ThemeColors = {
  background: palette.gray50,
  backgroundAlt: '#f3f4f6',
  card: palette.white,
  cardBorder: palette.gray200,
  text: palette.gray900,
  textMuted: palette.gray500,
  textSubtle: palette.gray400,
  inputBg: palette.gray50,
  inputBorder: palette.gray200,
  headerFrom: palette.blue600,
  headerVia: palette.indigo600,
  headerTo: palette.blue700,
  primary: palette.blue600,
  primaryPressed: palette.blue700,
  danger: palette.red500,
  overlay: 'rgba(0,0,0,0.30)',
  tabBar: palette.white,
  tabInactive: palette.gray400,
  iconOnMuted: palette.gray400,
};

export const darkColors: ThemeColors = {
  background: palette.gray900,
  backgroundAlt: palette.gray800,
  card: palette.gray800,
  cardBorder: palette.gray700,
  text: palette.white,
  textMuted: palette.gray400,
  textSubtle: palette.gray500,
  inputBg: 'rgba(31,41,55,0.5)',
  inputBorder: palette.gray700,
  headerFrom: palette.blue600,
  headerVia: palette.indigo600,
  headerTo: palette.blue700,
  primary: palette.blue600,
  primaryPressed: palette.blue700,
  danger: palette.red500,
  overlay: 'rgba(0,0,0,0.50)',
  tabBar: palette.gray800,
  tabInactive: palette.gray500,
  iconOnMuted: palette.blue400,
};

/** Dashboard hızlı erişim kartları — web DashboardModule gradient’leri */
export const shortcutGradients: Record<string, [string, string]> = {
  newsale: ['#3b82f6', '#2563eb'],
  products: ['#4ade80', '#22c55e'],
  addproduct: ['#22c55e', '#16a34a'],
  reports: ['#6366f1', '#4f46e5'],
  customers: ['#c084fc', '#a855f7'],
  stock: ['#16a34a', '#15803d'],
  invoices: ['#ec4899', '#db2777'],
  finance: ['#f97316', '#ea580c'],
};
