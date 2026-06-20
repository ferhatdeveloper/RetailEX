/**
 * Number Formatting Utilities for ExRetailOS
 * Automatic formatting for number inputs across the system
 */

import { getCurrencyDecimalPlaces, roundMoneyAmount } from './currency';

/**
 * Format number with thousand separators as user types
 * @param value - Input value from user
 * @returns Formatted string with thousand separators
 */
export const formatNumberInput = (value: string, maxDecimalDigits = 2): string => {
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
    decimalPart = cleanValue.slice(commaIndex + 1).replace(/[^\d]/g, '').slice(0, maxDecimalDigits);
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
 * Virgül yokken nokta: TR'de çoğunlukla binlik (1.555 → 1555); tek nokta + 3 hane → binlik birleştir.
 * Tek/çift hane ondalık için nokta (1.54) veya virgül (1,54) kullanın.
 */
function parseDotsWithoutCommaAsTr(s: string): number {
  const parts = s.split('.');
  if (parts.some((p) => p === '' || !/^\d+$/.test(p))) return NaN;
  if (parts.length === 1) return parseFloat(parts[0]);
  if (parts.length === 2) {
    const [a, b] = parts;
    if (b.length === 3 && /^\d{3}$/.test(b)) {
      if (a === '0') return parseFloat(`${a}.${b}`);
      return parseFloat(a + b);
    }
    return parseFloat(`${a}.${b}`);
  }
  return parseFloat(parts.join(''));
}

/**
 * Kur / ondalık form alanı: "1,54", "1.234,56" (TR), "1.555" (TR binlik = 1555), "1.54" (ondalık nokta).
 * type="number" virgül kabul etmediği için text input ile kullanın.
 */
export function parseDecimalStringForInput(value: string): number {
  let s = String(value).trim().replace(/\s/g, '');
  /* Arapça / tam genişlik ondalık virgül → ASCII virgül */
  s = s.replace(/[\u060C\u066B\uFF0C\u201A]/g, ',');
  if (!s) return NaN;
  s = s.replace(/,$/, '').replace(/\.$/, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    const lastComma = s.lastIndexOf(',');
    const intPart = s.slice(0, lastComma).replace(/\./g, '');
    const fracPart = s.slice(lastComma + 1).replace(/[^\d]/g, '');
    const normalized = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : NaN;
  }
  if (s.includes('.')) {
    const n = parseDotsWithoutCommaAsTr(s);
    return Number.isFinite(n) ? n : NaN;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

const POS_QTY_MIN = 0.001;
const POS_QTY_MAX = 9999;

/** POS miktar: TR girişinden sayıya (örn. "1,250" → 1.25) ve 0,001–9999 aralığına sıkıştır */
export function parsePosQuantity(value: string | number): number {
  const raw = typeof value === 'number' ? value : parseDecimalStringForInput(value);
  if (!Number.isFinite(raw) || raw <= 0) return NaN;
  const clamped = Math.max(POS_QTY_MIN, Math.min(POS_QTY_MAX, raw));
  return Math.round(clamped * 1000) / 1000;
}

/** POS miktar alanı yazarken format (en fazla 3 ondalık, örn. 1,250) */
export function formatPosQuantityInput(value: string): string {
  return formatNumberInput(value, 3);
}

/** Gösterim: 1.54 → "1,54" (virgüllü ondalık, grup yok) */
export function formatDecimalForTrInput(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '';
  return String(n).replace('.', ',');
}

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
  const code = String(currency || 'IQD').trim().toUpperCase();
  const decimals = getCurrencyDecimalPlaces(code);
  const rounded = roundMoneyAmount(value, code);
  let formatted = rounded.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (decimals > 0 && (formatted.endsWith(',00') || formatted.endsWith(',0'))) {
    formatted = formatted.replace(/[,]0+$/, '');
  }

  return `${formatted} ${code}`;
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
