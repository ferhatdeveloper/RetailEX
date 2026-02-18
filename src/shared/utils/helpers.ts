// Helper Utilities
import type { Product, ProductVariant } from '../../core/types';

/**
 * Generate unique ID
 */
export const generateId = (prefix: string = ''): string => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}${timestamp}${random}`;
};

/**
 * Generate invoice number
 */
export const generateInvoiceNumber = (prefix: string = 'FIS'): string => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}${timestamp}${random}`;
};

/**
 * Get unique colors from product variants
 */
export const getProductColors = (product: Product | null): string[] => {
  if (!product || !product.variants) return [];
  return Array.from(new Set(product.variants.map(v => v.color).filter(Boolean))) as string[];
};

/**
 * Get unique sizes from product variants (optionally filtered by color)
 */
export const getProductSizes = (product: Product | null, color?: string | null): string[] => {
  if (!product || !product.variants) return [];
  const filtered = color 
    ? product.variants.filter(v => v.color === color)
    : product.variants;
  return Array.from(new Set(filtered.map(v => v.size).filter(Boolean))) as string[];
};

/**
 * Get variant stock
 */
export const getVariantStock = (
  product: Product | null, 
  color?: string | null, 
  size?: string | null
): number => {
  if (!product || !product.variants) return 0;
  const variant = product.variants.find(v => 
    (!color || v.color === color) && (!size || v.size === size)
  );
  return variant?.stock || 0;
};

/**
 * Find variant by barcode
 */
export const findVariantByBarcode = (
  product: Product,
  barcode: string
): ProductVariant | undefined => {
  return product.variants?.find(v => v.barcode === barcode);
};

/**
 * Debounce function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Deep clone object
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Check if object is empty
 */
export const isEmpty = (obj: any): boolean => {
  if (obj === null || obj === undefined) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  if (typeof obj === 'string') return obj.trim().length === 0;
  return false;
};

/**
 * Sleep/delay function
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Capitalize first letter
 */
export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Truncate string
 */
export const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
};

/**
 * Get current timestamp
 */
export const getCurrentTimestamp = (): string => {
  return new Date().toISOString();
};

/**
 * Group array by key
 */
export const groupBy = <T>(array: T[], key: keyof T): Record<string, T[]> => {
  return array.reduce((result, item) => {
    const groupKey = String(item[key]);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {} as Record<string, T[]>);
};

