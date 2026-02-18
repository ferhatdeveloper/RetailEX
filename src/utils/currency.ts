/**
 * Currency Utilities - Dynamic Currency Support
 * 
 * Provides global currency formatting using firma settings from context
 */

import { formatNumber as baseFormatNumber, formatCurrency as baseFormatCurrency } from './formatNumber';

// Global currencies - will be updated by context
let globalCurrency = 'IQD'; // Ana para birimi (işlemler)
let globalReportingCurrency = 'IQD'; // Raporlama para birimi

/**
 * Set global currency codes (called from context)
 */
export const setGlobalCurrency = (currency: string, reportingCurrency?: string) => {
  globalCurrency = currency;
  globalReportingCurrency = reportingCurrency || currency;
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
 * Format currency using global currency from firma context
 * Uses Turkish formatting: 20.000,50 IQD
 */
export const formatCurrency = (value: number, decimals: number = 2, useReportingCurrency: boolean = false): string => {
  const currency = useReportingCurrency ? globalReportingCurrency : globalCurrency;
  return baseFormatCurrency(value, currency, decimals);
};

/**
 * Parse Turkish formatted string to number
 * Converts "20.000,50" to 20000.5
 */
export const parseNumber = (value: string): number => {
  const normalized = value.replace(/\./g, '').replace(/,/g, '.');
  return parseFloat(normalized) || 0;
};
