import { UUID_RE } from './customerDisplay';

/**
 * Rapor satırındaki cari adı.
 * Randevu veya peşinat kaydındaki ad yazılır.
 * Kimlik tek başına ad değildir. Kayıt yoksa uydurma ad üretilmez.
 */
export function recordedCustomerName(
  ...candidates: Array<string | null | undefined>
): string {
  for (const raw of candidates) {
    const text = String(raw ?? '').trim();
    if (!text || text === '—' || text === '-' || text === '–') continue;
    if (UUID_RE.test(text)) continue;
    return text;
  }
  return '—';
}
