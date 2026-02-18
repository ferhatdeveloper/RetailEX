/**
 * Number Formatting Utilities for ExRetailOS
 * Automatic formatting for number inputs across the system
 */

/**
 * Format number with thousand separators as user types
 * @param value - Input value from user
 * @returns Formatted string with thousand separators
 */
export const formatNumberInput = (value: string): string => {
  // Türkiye formatı: binlik ayırıcı nokta (.), ondalık ayırıcı virgül (,)
  // Kullanıcının yazdığı nokta ve virgülleri koru, sadece geçersiz karakterleri temizle
  const cleanValue = value.replace(/[^\d.,]/g, '');
  
  if (!cleanValue) return '';
  
  // Virgül varsa, ondan önce ve sonra ayır
  const commaIndex = cleanValue.lastIndexOf(',');
  
  let integerPart = '';
  let decimalPart = '';
  
  if (commaIndex !== -1) {
    // Virgül varsa, ondalık ayırıcı olarak kabul et
    integerPart = cleanValue.slice(0, commaIndex).replace(/\./g, '');
    decimalPart = cleanValue.slice(commaIndex + 1).replace(/[^\d]/g, '').slice(0, 2);
  } else {
    // Sadece rakamlar ve noktalar varsa, noktaları binlik ayırıcı olarak kabul et
    integerPart = cleanValue.replace(/\./g, '');
    decimalPart = '';
  }
  
  if (!integerPart) return decimalPart && decimalPart !== '00' ? `0,${decimalPart}` : '';
  
  // Binlik ayırıcı olarak nokta ekle
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  // Ondalık kısmı virgül ile birleştir (sadece sıfır değilse)
  if (decimalPart && decimalPart !== '00' && decimalPart !== '0') {
    return `${formattedInteger},${decimalPart}`;
  }
  
  return formattedInteger;
};

/**
 * Parse formatted number back to float
 * @param value - Formatted string with commas
 * @returns Parsed number
 */
export const parseFormattedNumber = (value: string): number => {
  // Türkiye formatından parse et: nokta binlik, virgül ondalık
  // Örnek: "1.800.000,50" -> 1800000.50
  const normalized = value
    .replace(/\./g, '') // Binlik noktaları kaldır
    .replace(/,/g, '.'); // Ondalık virgülü noktaya çevir
  return parseFloat(normalized) || 0;
};

/**
 * Format number for display with currency
 * @param value - Number to format
 * @param currency - Currency code (default: IQD)
 * @returns Formatted currency string
 */
export const formatCurrencyDisplay = (
  value: number, 
  currency: string = 'IQD'
): string => {
  // Türkiye formatı: binlik ayırıcı nokta (.), ondalık ayırıcı virgül (,)
  const decimals = currency === 'IQD' ? 2 : 2;
  let formatted = value.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  
  // Eğer ondalık kısım sıfırsa (örn: ,00), virgül ve sıfırları kaldır
  if (formatted.endsWith(',00') || formatted.endsWith(',0')) {
    formatted = formatted.replace(/[,]0+$/, '');
  }
  
  return `${formatted} ${currency}`;
};

/**
 * Format number on blur event (no decimals for IQD)
 * @param value - Input value
 * @returns Properly formatted number
 */
export const formatNumberOnBlur = (value: string): string => {
  const num = parseFormattedNumber(value);
  if (num === 0) return '';
  let formatted = num.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  // Eğer ondalık kısım sıfırsa (örn: ,00), virgül ve sıfırları kaldır
  if (formatted.endsWith(',00') || formatted.endsWith(',0')) {
    formatted = formatted.replace(/[,]0+$/, '');
  }
  
  return formatted;
};

/**
 * Auto-format number input React onChange handler
 * Usage: onChange={(e) => handleNumberInput(e, setValue)}
 */
export const handleNumberInput = (
  e: React.ChangeEvent<HTMLInputElement>,
  setValue: (value: string) => void
) => {
  const formatted = formatNumberInput(e.target.value);
  setValue(formatted);
};

/**
 * Auto-format number input React onBlur handler
 * Usage: onBlur={(e) => handleNumberBlur(e, setValue)}
 */
export const handleNumberBlur = (
  e: React.FocusEvent<HTMLInputElement>,
  setValue: (value: string) => void
) => {
  const formatted = formatNumberOnBlur(e.target.value);
  setValue(formatted);
};
