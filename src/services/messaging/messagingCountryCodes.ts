/**
 * Mesajlaşma / WhatsApp — varsayılan ülke kodu tercih listesi.
 * Kodlar yalnızca rakam (normalizePhoneDigits ile uyumlu).
 */

export type MessagingCountryCodeOption = {
  code: string;
  /** module-translations anahtarı (ülke adı) */
  labelKey: string;
};

/** Sık kullanılan ülke kodları (select). */
export const MESSAGING_COUNTRY_CODE_OPTIONS: MessagingCountryCodeOption[] = [
  { code: '90', labelKey: 'msgNotifyCcTR' },
  { code: '964', labelKey: 'msgNotifyCcIQ' },
  { code: '971', labelKey: 'msgNotifyCcAE' },
  { code: '966', labelKey: 'msgNotifyCcSA' },
  { code: '1', labelKey: 'msgNotifyCcUS' },
  { code: '49', labelKey: 'msgNotifyCcDE' },
  { code: '44', labelKey: 'msgNotifyCcGB' },
];

/** Select’te “Diğer” özel giriş değeri. */
export const MESSAGING_COUNTRY_CODE_OTHER = '__other__';

export function sanitizeCountryCode(raw: string | null | undefined, fallback = '90'): string {
  const cc = String(raw ?? '').replace(/\D/g, '');
  return cc || fallback;
}

export function isPresetCountryCode(code: string): boolean {
  const cc = sanitizeCountryCode(code, '');
  return MESSAGING_COUNTRY_CODE_OPTIONS.some((o) => o.code === cc);
}
