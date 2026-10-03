/**
 * AVANS → FATURA yardımcı formatlama fonksiyonları.
 *
 * UI tarafında avans referans no, indirim notu ve liste etiketleri
 * için ortak formatlama.
 */

import { formatNumber } from './formatNumber';

/** Avans referans no: DB GENERATED kolonundan veya fallback UUID'den üretir. */
export function formatAvansReference(avansId: string, referenceNo?: string | null): string {
  if (referenceNo) return referenceNo;
  if (!avansId) return 'AVANS-?';
  const short = avansId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `AVANS-${short}`;
}

/** Fatura notuna yazılacak "avans uygulandı" bilgisi. */
export function formatAvansNote(avansId: string, amount: number): string {
  const ref = formatAvansReference(avansId);
  return `${ref} düşülmüştür (−${formatNumber(amount, 2, true)})`;
}

/** Avans listesi satırı: tutar + para birimi kodu. */
export function formatAvansAmount(amount: number, currency = 'IQD'): string {
  return `${formatNumber(amount, 2, true)} ${currency}`;
}
