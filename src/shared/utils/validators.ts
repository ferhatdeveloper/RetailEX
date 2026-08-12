// Validation Utilities

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate Turkish phone number
 */
export const isValidPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10 || cleaned.length === 11;
};

/**
 * Validate barcode (basic check)
 */
export const isValidBarcode = (barcode: string): boolean => {
  return barcode.length >= 8 && /^\d+$/.test(barcode);
};

/**
 * Validate positive number
 */
export const isPositiveNumber = (value: number): boolean => {
  return !isNaN(value) && value > 0;
};

/**
 * Validate stock availability
 */
export const hasEnoughStock = (available: number, requested: number): boolean => {
  return available >= requested;
};

/**
 * Validate discount permission
 */
export const canApplyDiscount = (
  userRole: string,
  discountPercentage: number,
  maxAllowed: number
): boolean => {
  return discountPercentage <= maxAllowed;
};

/**
 * Validate date range
 */
export const isValidDateRange = (startDate: string, endDate: string): boolean => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return start <= end;
};

/**
 * Check if date is in range
 */
export const isDateInRange = (date: string, startDate: string, endDate: string): boolean => {
  const d = new Date(date);
  const start = new Date(startDate);
  const end = new Date(endDate);
  return d >= start && d <= end;
};

/**
 * Validate required field
 */
export const isRequired = (value: any): boolean => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
};


