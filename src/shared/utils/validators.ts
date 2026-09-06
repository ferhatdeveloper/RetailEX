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
 * Telefon numarasını arama için normalleştirir.
 * Boşluk, tire, parantez, nokta, slash, + işareti gibi tüm rakam dışı karakterleri
 * kaldırır. Ülke kodu (örn. +90, 90, 0090) kaldırılmaz; eşleşme için
 * `phoneMatchesQuery` yardımcısını kullanın.
 */
export const normalizePhoneDigits = (phone: unknown): string => {
  return String(phone ?? '').replace(/\D/g, '');
};

/**
 * Sorgu terimini rakam dışı karakterlerden arındırır (kullanıcı "0555 123 45 67"
 * veya "+90 (555)" gibi yazabilir). Tüm rakam dışı karakterler atılır.
 */
export const phoneQueryDigits = (query: unknown): string => {
  return String(query ?? '').replace(/\D/g, '');
};

/**
 * Telefon esnek araması: sorgu teriminin rakamlarını, telefon(lar)ın
 * rakamları içinde sıralı olarak arar. Tek başına ülke kodu (örn. "90" veya
 * "090") yazılırsa yanlışlıkla tüm numaralarla eşleşmesin diye sorgu en az
 * 3 hane olmalıdır (aksi takdirde `false` döner).
 *
 * Örnekler:
 *   - DB: "+90 555 123 4567", sorgu: "5551234" → eşleşir
 *   - DB: "0555 123 45 67", sorgu: "555 123 45" → eşleşir
 *   - DB: "5551234567", sorgu: "555" → eşleşir
 */
export const phoneMatchesQuery = (phone: unknown, query: unknown): boolean => {
  const digits = phoneQueryDigits(query);
  if (digits.length < 3) return false;
  if (!digits) return false;
  const target = normalizePhoneDigits(phone);
  if (!target) return false;
  return target.includes(digits);
};

/**
 * Birden fazla telefon alanını sorguyla eşleştirir (phone + phone2).
 * Boş/eksik alanlar görmezden gelinir.
 */
export const phonesMatchQuery = (
  phones: Array<unknown>,
  query: unknown,
): boolean => {
  const digits = phoneQueryDigits(query);
  if (digits.length < 3) return false;
  return phones.some((p) => normalizePhoneDigits(p).includes(digits));
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


