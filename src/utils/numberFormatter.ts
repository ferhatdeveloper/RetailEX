/**
 * Number Formatting Utilities for ExRetailOS
 * Automatic formatting for number inputs across the system
 */

import { getCurrencyDecimalPlaces, roundMoneyAmount } from './currency';
import { productUsesDecimalQuantity } from './productUnits';
import { normalizeWeightProductQuantity } from './scaleQuantity';
import type { Product } from '../core/types';

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

  if (!integerPart) {
    if (commaIndex !== -1 && maxDecimalDigits > 0) return `0,${decimalPart}`;
    return decimalPart && decimalPart !== '00' ? `0,${decimalPart}` : '';
  }

  // Binlik ayırıcı olarak nokta ekle
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // Yazarken virgülü ve ara ondalığı koru ("77," / "77,0" / "77,46")
  if (commaIndex !== -1 && maxDecimalDigits > 0) {
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

/**
 * POS kg girişi: tek nokta + ondalık (1.415, 69.500) — tartı etiketi / klavye nokta ondalığı.
 * Aksi halde parseDecimalStringForInput "1.415" → 1415, "69.500" → 69500 (TR binlik) yapar.
 */
function parsePosScaleDotKg(value: string): number | null {
  const s = String(value).trim().replace(/\s/g, '');
  if (!/^\d{1,4}\.\d{1,3}$/.test(s)) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0 || n > POS_QTY_MAX) return null;
  return Math.round(n * 1000) / 1000;
}

/** POS miktar: TR girişinden sayıya (örn. "1,250" → 1,25 kg) ve 0,001–9999 aralığına sıkıştır */
export function parsePosQuantity(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return NaN;
    const clamped = Math.max(POS_QTY_MIN, Math.min(POS_QTY_MAX, value));
    return Math.round(clamped * 1000) / 1000;
  }
  const scaleDot = parsePosScaleDotKg(value);
  if (scaleDot != null) return scaleDot;
  const raw = parseDecimalStringForInput(value);
  if (!Number.isFinite(raw) || raw <= 0) return NaN;
  const clamped = Math.max(POS_QTY_MIN, Math.min(POS_QTY_MAX, raw));
  return Math.round(clamped * 1000) / 1000;
}

/** Ürün birimine göre miktar: KG/GR → ondalık; adet → tam sayı. */
export function parsePosQuantityForProduct(
  value: string | number,
  product?: Pick<Product, 'unit' | 'isScaleProduct'> | Record<string, unknown>
): number {
  const n = parsePosQuantity(value);
  if (!Number.isFinite(n)) return NaN;
  if (product && !productUsesDecimalQuantity(product)) {
    const rounded = Math.round(n);
    return rounded >= 1 ? Math.min(POS_QTY_MAX, rounded) : NaN;
  }
  return normalizeWeightProductQuantity(n, (product as Product)?.unit);
}

/** POS miktar alanı: nokta ondalığını virgüle çevir (numpad `.` → kg 1,415) */
function normalizePosQtyTyping(value: string): string {
  const clean = String(value ?? '').replace(/[^\d.,]/g, '');
  if (!clean.includes(',') && /^\d{1,4}\.\d{0,3}$/.test(clean)) {
    return clean.replace('.', ',');
  }
  return clean;
}

/** Fatura / alış satırı KG miktarı — binlik nokta yok, virgül yazılırken korunur (2, → 2,) */
export function formatWeightQuantityInput(value: string): string {
  let s = String(value ?? '').trim().replace(/[^\d.,]/g, '');
  if (!s) return '';
  if (!s.includes(',') && /^\d{1,4}\.\d{0,3}$/.test(s)) {
    s = s.replace('.', ',');
  }
  const commaIndex = s.lastIndexOf(',');
  if (commaIndex !== -1) {
    const intPart = s.slice(0, commaIndex).replace(/\./g, '').slice(0, 4);
    const fracPart = s.slice(commaIndex + 1).replace(/[^\d]/g, '').slice(0, 3);
    const intDisplay = intPart || '0';
    if (s.endsWith(',') && fracPart.length === 0) {
      return `${intDisplay},`;
    }
    return fracPart.length > 0 ? `${intDisplay},${fracPart}` : intDisplay;
  }
  return s.replace(/\./g, '').slice(0, 4);
}

/** Fatura miktar parse — yarım giriş (2,) için NaN, tam giriş 2,250 → 2.25 */
export function parseInvoiceWeightQuantity(value: string): number {
  const s = String(value ?? '').trim();
  if (!s || s.endsWith(',')) return NaN;
  return parseDecimalStringForInput(s);
}

/** POS miktar alanı yazarken format (en fazla 3 ondalık, örn. 1,250) */
export function formatPosQuantityInput(value: string, allowDecimals = true): string {
  const normalized = allowDecimals ? normalizePosQtyTyping(value) : value.replace(/[^\d]/g, '');
  return formatNumberInput(normalized, allowDecimals ? 3 : 0);
}

/** Gösterim: 1.25 → "1,25" / 1.25 → "1,250" (virgüllü ondalık) */
export function formatDecimalForTrInput(n: number, maxDecimals = 3): string {
  if (!Number.isFinite(n) || n === 0) return '';
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
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
