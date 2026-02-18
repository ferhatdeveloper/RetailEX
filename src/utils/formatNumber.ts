/**
 * Format number with Turkish formatting (dot for thousands, comma for decimals)
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 2 for Turkish standard)
 * @param showDecimals - Force showing decimals (default: true for Turkish format)
 * @returns Formatted number string
 */
export const formatNumber = (value: number, decimals: number = 2, showDecimals: boolean = true): string => {
  // Handle null, undefined, NaN, or invalid values
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  // Turkish format: 20.000,50 (dot for thousands, comma for decimals)
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: showDecimals ? decimals : 0,
    maximumFractionDigits: decimals,
  };

  let formatted = value.toLocaleString('tr-TR', options);

  // Eğer ondalık kısım sıfırsa (örn: ,00), virgül ve sıfırları kaldır
  if (formatted.endsWith(',00') || formatted.endsWith(',0')) {
    formatted = formatted.replace(/[,]0+$/, '');
  }

  return formatted;
};

/**
 * Format currency with Turkish formatting and dynamic currency code
 * @param value - Number to format
 * @param currency - Currency code (default: IQD, will be overridden by firma settings)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string
 */
export const formatCurrency = (value: number, currency: string = 'IQD', decimals: number = 2): string => {
  const formatted = formatNumber(value, decimals, true);
  return `${formatted} ${currency}`;
};

/**
 * Parse Turkish formatted string to number (converts dots and commas)
 * @param value - String to parse (e.g., "20.000,50" or "20000.50")
 * @returns Parsed number
 */
export const parseNumber = (value: string): number => {
  // Remove dots (thousand separators) and replace comma with dot (decimal separator)
  const normalized = value.replace(/\./g, '').replace(/,/g, '.');
  return parseFloat(normalized) || 0;
};
