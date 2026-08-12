/**
 * Firma para birimi — web `src/utils/currency.ts` ile uyumlu ondalık kurallar.
 * Kaynak: public.firms.ana_para_birimi (oturumda AuthUser.anaParaBirimi).
 */

import { useAuthStore } from '../store/authStore';

const ZERO_DECIMAL_CURRENCIES = new Set([
  'IQD',
  'JPY',
  'KRW',
  'VND',
  'CLP',
  'PYG',
  'UGX',
  'RWF',
  'XAF',
  'XOF',
  'XPF',
  'IDR',
]);

const THREE_DECIMAL_CURRENCIES = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND', 'LYD']);

/** Uygulama varsayılanı — web system_settings / FirmaDonem ile aynı */
export const APP_DEFAULT_CURRENCY = 'IQD';

export function normalizeCurrencyCode(currency?: string | null): string {
  const code = String(currency ?? '').trim().toUpperCase();
  return code.length >= 3 ? code.slice(0, 10) : APP_DEFAULT_CURRENCY;
}

export function getCurrencyDecimalPlaces(currency?: string | null): number {
  const code = normalizeCurrencyCode(currency);
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

export function roundMoneyAmount(value: number, currency?: string | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const decimals = getCurrencyDecimalPlaces(currency);
  if (decimals === 0) return Math.round(n);
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/** Oturumdaki firma ana para birimi (DB kaydı). */
export function firmCurrency(): string {
  const u = useAuthStore.getState().user;
  return normalizeCurrencyCode(u?.anaParaBirimi || APP_DEFAULT_CURRENCY);
}

export function reportingCurrency(): string {
  const u = useAuthStore.getState().user;
  return normalizeCurrencyCode(u?.raporlamaParaBirimi || u?.anaParaBirimi || APP_DEFAULT_CURRENCY);
}

/** Türkçe sayı + para kodu: `20.000 IQD` / `1.234,50 TRY` */
export function formatMoneyWithCode(
  value: number | null | undefined,
  currency?: string | null,
  locale = 'tr-TR',
): string {
  const code = normalizeCurrencyCode(currency ?? firmCurrency());
  const decimals = getCurrencyDecimalPlaces(code);
  const v = roundMoneyAmount(Number(value) || 0, code);
  let formatted: string;
  try {
    formatted = v.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    formatted = decimals === 0 ? String(Math.round(v)) : v.toFixed(decimals);
  }
  return `${formatted} ${code}`;
}
