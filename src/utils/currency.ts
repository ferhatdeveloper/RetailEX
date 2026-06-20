/**
 * Currency Utilities - Dynamic Currency Support
 *
 * Provides global currency formatting using firma settings from context
 */

import { formatNumber as baseFormatNumber, formatCurrency as baseFormatCurrency } from './formatNumber';

// Global currencies - will be updated by context
let globalCurrency = 'IQD'; // Ana para birimi (işlemler)
let globalReportingCurrency = 'IQD'; // Raporlama para birimi

/** Perakende tam sayı birimli para birimleri (IQD dahil) */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'IQD', 'JPY', 'KRW', 'VND', 'CLP', 'PYG', 'UGX', 'RWF', 'XAF', 'XOF', 'XPF', 'IDR',
]);

/** Üç ondalıklı para birimleri */
const THREE_DECIMAL_CURRENCIES = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND', 'LYD']);

function normalizeCurrencyCode(currency?: string | null): string {
  const code = String(currency ?? globalCurrency ?? 'IQD').trim().toUpperCase();
  return code.length >= 3 ? code.slice(0, 10) : 'IQD';
}

/** Intl ondalık basamak aralığı (0–20); yanlış tip (örn. para birimi string) geçilince çökmez. */
function normalizeDecimalPlaces(decimals: unknown, fallback: number): number {
  if (typeof decimals !== 'number') return fallback;
  if (!Number.isFinite(decimals)) return fallback;
  const n = Math.trunc(decimals);
  if (n < 0 || n > 20) return fallback;
  return n;
}

/**
 * Set global currency codes (called from context)
 */
export const setGlobalCurrency = (currency: string, reportingCurrency?: string) => {
  globalCurrency = normalizeCurrencyCode(currency);
  globalReportingCurrency = normalizeCurrencyCode(reportingCurrency || currency);
};

/**
 * Get current global currency (base currency for transactions)
 */
export const getGlobalCurrency = (): string => {
  return globalCurrency;
};

/**
 * Get current reporting currency (for reports and analytics)
 */
export const getReportingCurrency = (): string => {
  return globalReportingCurrency;
};

/**
 * Para birimine göre gösterim ondalık basamağı (IQD → 0, USD/EUR → 2, KWD → 3).
 */
export function getCurrencyDecimalPlaces(currency?: string | null): number {
  const code = normalizeCurrencyCode(currency);
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

/**
 * Para birimine uygun yuvarlama (IQD tam sayı, USD 2 hane vb.).
 */
export function roundMoneyAmount(value: number, currency?: string | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const decimals = getCurrencyDecimalPlaces(currency);
  if (decimals === 0) return Math.round(n);
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * "Tam ödendi" kontrolü için tolerans (IQD: 0.5, USD: 0.005).
 */
export function moneyEpsilon(currency?: string | null): number {
  const decimals = getCurrencyDecimalPlaces(currency);
  if (decimals === 0) return 0.5;
  return 0.5 / 10 ** decimals;
}

/**
 * Format number with Turkish formatting
 * Wrapper for base formatNumber with Turkish locale
 */
export const formatNumber = (value: number, decimals: number = 2, showDecimals: boolean = true): string => {
  let formatted = baseFormatNumber(value, decimals, showDecimals);

  // Eğer ondalık kısım sıfırsa (örn: ,00), virgül ve sıfırları kaldır
  if (formatted.endsWith(',00') || formatted.endsWith(',0')) {
    formatted = formatted.replace(/[,]0+$/, '');
  }

  return formatted;
};

/**
 * Belirli bir para birimi kodu ile formatla (ödeme satırı USD vb.).
 */
export function formatMoneyWithCode(value: number, currencyCode: string): string {
  const code = normalizeCurrencyCode(currencyCode);
  const decimals = getCurrencyDecimalPlaces(code);
  const rounded = roundMoneyAmount(value, code);
  return baseFormatCurrency(rounded, code, decimals);
}

/**
 * Format currency using global currency from firma context
 * Uses Turkish formatting: 20.000,50 IQD
 */
export const formatCurrency = (
  value: number,
  decimals?: number,
  useReportingCurrency: boolean = false
): string => {
  const currency = useReportingCurrency ? globalReportingCurrency : globalCurrency;
  const defaultDecimals = getCurrencyDecimalPlaces(currency);
  const dec =
    decimals === undefined
      ? defaultDecimals
      : normalizeDecimalPlaces(decimals, defaultDecimals);
  const rounded = roundMoneyAmount(value, currency);
  return baseFormatCurrency(rounded, currency, dec);
};

/**
 * Parse Turkish formatted string to number
 * Converts "20.000,50" to 20000.5
 */
export const parseNumber = (value: string): number => {
  const normalized = value.replace(/\./g, '').replace(/,/g, '.');
  return parseFloat(normalized) || 0;
};
