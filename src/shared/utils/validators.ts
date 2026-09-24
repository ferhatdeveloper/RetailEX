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
 * kaldırır. Ülke kodu / baştaki 0 farkı için `phoneMatchesQuery` kullanın.
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

/** Sık kullanılan ülke kodları (IQ +964, TR +90). */
const PHONE_COUNTRY_CODES = ['964', '90'] as const;

/**
 * Biçim / ülke kodu / baştaki 0 farklarını yok saymak için rakam çekirdekleri.
 * Örn. "+964 750 123 4567", "07501234567", "7501234567" → ortak çekirdekler.
 */
export const phoneDigitCores = (digits: string): string[] => {
  const raw = String(digits ?? '').replace(/\D/g, '');
  if (!raw) return [];
  const out = new Set<string>();
  const seed = raw.replace(/^00+/, '');
  if (!seed) return [];

  const add = (v: string) => {
    const s = String(v ?? '').replace(/\D/g, '');
    if (s) out.add(s);
  };

  add(seed);
  add(seed.replace(/^0+/, '') || seed);

  for (const cc of PHONE_COUNTRY_CODES) {
    if (seed.startsWith(cc) && seed.length > cc.length + 2) {
      const rest = seed.slice(cc.length);
      add(rest);
      add(rest.replace(/^0+/, '') || rest);
      if (!rest.startsWith('0')) add(`0${rest}`);
    }
  }

  if (seed.startsWith('0') && seed.length > 1) {
    add(seed.slice(1));
  } else if (!seed.startsWith('0')) {
    add(`0${seed}`);
  }

  // Son 10 / 9 hane (ulusal mobil gövde)
  for (const v of [...out]) {
    if (v.length >= 10) add(v.slice(-10));
    if (v.length >= 9) add(v.slice(-9));
    if (v.startsWith('0') && v.length > 1) add(v.slice(1));
  }

  return [...out];
};

/**
 * Telefon esnek araması: boşluk/tire/+ /ülke kodu / baştaki 0 fark etmez.
 * Sorgu en az 3 hane (ülke kodu tek başına tümünü eşleştirmesin).
 *
 * Örnekler:
 *   - DB: "+964 750 123 4567", sorgu: "0750 123 4567" → eşleşir
 *   - DB: "07501234567", sorgu: "9647501234567" → eşleşir
 *   - DB: "+90 555 123 4567", sorgu: "5551234" → eşleşir
 *   - DB: "0555 123 45 67", sorgu: "555 123 45" → eşleşir
 */
export const phoneMatchesQuery = (phone: unknown, query: unknown): boolean => {
  const qDigits = phoneQueryDigits(query);
  if (qDigits.length < 3) return false;
  const target = normalizePhoneDigits(phone);
  if (!target) return false;

  // Hızlı yol: ham rakam alt dizesi
  if (target.includes(qDigits)) return true;

  const haystacks = phoneDigitCores(target);
  const needles = new Set<string>(
    [qDigits, ...phoneDigitCores(qDigits)].filter(n => n.length >= 3),
  );

  for (const needle of needles) {
    for (const hay of haystacks) {
      if (hay.includes(needle)) return true;
    }
  }

  // Kayıt kısa, sorgu ülke kodlu uzun: anlamlı çekirdek (7+) sorgu içinde
  for (const hay of haystacks) {
    if (hay.length < 7) continue;
    for (const needle of needles) {
      if (needle.includes(hay)) return true;
    }
  }

  return false;
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
  return phones.some(p => phoneMatchesQuery(p, query));
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


