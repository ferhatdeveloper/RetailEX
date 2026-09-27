/**
 * Mesajlaşma / WhatsApp — varsayılan ülke kodu tercih listesi.
 * Kodlar yalnızca rakam (normalizePhoneDigits ile uyumlu).
 *
 * Yerel mobil örüntüleri (ülke kodu yokken):
 * - TR (90): 10 hane, genelde 5xxxxxxxxx
 * - IQ (964): 10 hane, genelde 7xxxxxxxxx
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

/** Bilinen uluslararası kodlar — zaten kodlu numaraya yeniden prefix eklenmez. */
export const KNOWN_MESSAGING_COUNTRY_CODES = [
  '90',
  '964',
  '971',
  '966',
  '1',
  '44',
  '49',
  '33',
  '39',
] as const;

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

/**
 * 10 haneli yerel mobil için ülke kodu.
 * TR mobiller genelde 5…, Irak mobiller genelde 7… — varsayılan ayar bunları ezmez.
 */
export function resolveCountryCodeForLocalDigits(
  local10: string,
  defaultCc: string,
): string {
  const local = String(local10 || '').replace(/\D/g, '');
  const fallback = sanitizeCountryCode(defaultCc, '90');
  if (local.length !== 10) return fallback;
  const lead = local.charAt(0);
  if (lead === '7') return '964';
  if (lead === '5') return '90';
  return fallback;
}

/**
 * TR varsayılanıyla yanlışlıkla 90+7xxxxxxxxx yazılmış Irak numaralarını düzelt.
 * Örn. 907508555646 → 9647508555646
 */
export function repairMisprefixedIraqiDigits(digits: string): string {
  const p = String(digits || '').replace(/\D/g, '');
  const m = /^90(7\d{9})$/.exec(p);
  return m ? `964${m[1]}` : p;
}

function startsWithKnownCountryCode(digits: string): boolean {
  return KNOWN_MESSAGING_COUNTRY_CODES.some(
    (code) => digits.startsWith(code) && digits.length >= code.length + 7,
  );
}

/**
 * Uluslararası rakam formatı.
 * @param defaultCountryCode — örüntü eşleşmezse eklenen kod (ör. 90, 964).
 */
export function normalizePhoneDigits(raw: string, defaultCountryCode = '90'): string {
  let p = String(raw || '').replace(/\D/g, '');
  if (!p) return '';

  p = repairMisprefixedIraqiDigits(p);

  const cc = sanitizeCountryCode(defaultCountryCode, '90');

  // Zaten bilinen ülke kodu ile başlıyorsa bırak (çift prefix yok)
  if (startsWithKnownCountryCode(p)) return p;

  // 0 ile başlayan yerel (05xx… / 07xx…)
  if (p.length === 11 && p.startsWith('0')) {
    p = p.slice(1);
  }

  // 10 haneli yerel — örüntüye göre TR/IQ, aksi halde varsayılan
  if (p.length === 10) {
    return resolveCountryCodeForLocalDigits(p, cc) + p;
  }

  return p;
}
