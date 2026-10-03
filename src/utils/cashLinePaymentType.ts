/**
 * Kasa İşlemleri — Ödeme Tipi çözümleyici.
 *
 * Senaryo:
 *   Kasa İşlemleri modülünde kullanıcı, peşinat mı normal satış mı ayrımını
 *   kolayca görmek istiyor. Bunun için tabloda "Ödeme Tipi" kolonu gösterilir.
 *
 * Tespit sırası (öncelikli → ikincil):
 *   1) `is_reservation_deposit === true`  → Rezervasyon Peşinatı (turkuaz)
 *   2) `payment_method` ham değerinden normalize edilerek "bucket" çıkarılır:
 *      - cash   → Nakit (yeşil)
 *      - card   → Kart (mavi)
 *      - credit → Veresiye (amber)
 *      - transfer → Banka Havalesi (mor)
 *   3) DB ham değerini güzellik fiş öneki ile bağlamak için yardımcılar.
 *
 * Renkler:
 *   - Nakit  = yeşil (bg-emerald-100/text-emerald-700)
 *   - Kart   = mavi  (bg-blue-100/text-blue-700)
 *   - Veresiye = amber (bg-amber-100/text-amber-800)
 *   - Rezervasyon Peşinatı = turkuaz (bg-cyan-100/text-cyan-800)
 *   - Banka Havalesi = mor (bg-purple-100/text-purple-700)
 *   - Diğer  = gri (bg-gray-100/text-gray-600)
 *
 * Tasarım notu:
 *   `paymentMethodUtils.normalizePaymentMethodBucket` zaten POS/reports
 *   listesinde "cash/card/credit/transfer/pesinatli/other" gruplarını
 *   çıkarıyor. Bu modül onu yeniden kullanır; tek doğruluk kaynağı.
 *
 * @example
 *   const pt = resolvePaymentType({ payment_method: 'cash' }, false);
 *   // pt.code === 'cash', pt.labelKey === 'paymentCash', pt.tone === 'cash'
 */

import { normalizePaymentMethodBucket, type PaymentMethodBucket } from './paymentMethodUtils';

export type PaymentTypeTone = 'cash' | 'card' | 'credit' | 'transfer' | 'reservation' | 'other';

export interface ResolvedPaymentType {
  /** Dahili kod (cash/card/credit/transfer/reservation/other) */
  code: PaymentTypeTone;
  /** tm() anahtarı */
  labelKey: string;
  /** Renk tonu — className üretmek için */
  tone: PaymentTypeTone;
  /** Ham DB payment_method (debug/log için) */
  raw?: string | null;
}

/** Bucket → labelKey + tone eşlemesi. */
const BUCKET_META: Record<
  PaymentMethodBucket,
  { labelKey: string; tone: PaymentTypeTone }
> = {
  cash: { labelKey: 'paymentCash', tone: 'cash' },
  card: { labelKey: 'paymentCreditCard', tone: 'card' },
  credit: { labelKey: 'paymentCredit', tone: 'credit' },
  transfer: { labelKey: 'cashLinePaymentTypeTransfer', tone: 'transfer' },
  pesinatli: { labelKey: 'paymentMethodPesinatli', tone: 'reservation' },
  other: { labelKey: 'cashLinePaymentTypeOther', tone: 'other' },
};

/** Tüm "Ödeme Tipi" rozetleri için Tailwind class üretir (dark mode dahil). */
export function paymentTypeBadgeClass(tone: PaymentTypeTone): string {
  switch (tone) {
    case 'cash':
      return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200';
    case 'card':
      return 'bg-blue-100 text-blue-800 ring-1 ring-blue-200';
    case 'credit':
      return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200';
    case 'transfer':
      return 'bg-purple-100 text-purple-800 ring-1 ring-purple-200';
    case 'reservation':
      return 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200';
    case 'other':
    default:
      return 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
  }
}

/** Raw payment_method → labelKey (tm() için). Yedek tablo, çeviri eksikse buradan düşer. */
function rawMethodLabelKey(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'cash' || s === 'nakit') return 'paymentCash';
  if (s === 'card' || s === 'kart' || s === 'kredi kartı' || s === 'kredi karti') {
    return 'paymentCreditCard';
  }
  if (s === 'veresiye' || s === 'credit' || s === 'cari' || s.includes('borç') || s.includes('borc')) {
    return 'paymentCredit';
  }
  if (s === 'havale' || s === 'eft' || s === 'transfer' || s === 'haval') {
    return 'cashLinePaymentTypeTransfer';
  }
  if (s === 'çek' || s === 'cek') return 'paymentCheck';
  if (s === 'senet') return 'paymentPromissory';
  if (s.includes('peşinat') || s.includes('pesinat')) {
    return 'paymentMethodPesinatli';
  }
  return null;
}

/**
 * Kasa satırı + rezervasyon peşinatı bayrağı → ResolvedPaymentType.
 *
 * Öncelik sırası:
 *   1) `isReservationDeposit === true` → reservation (turkuaz) — Bug 22 ile uyumlu.
 *   2) `paymentMethod` normalize edilir → cash/card/credit/transfer/other.
 *   3) Bulunamazsa null döner (UI'da "—" gösterilir).
 *
 * @param input.paymentMethod  cash_lines.payment_method ham değeri
 * @param input.isReservationDeposit  sales.is_deposit tespit bayrağı
 * @param isReservationDeposit  (geriye dönük) 2. argüman olarak bayrak
 */
export function resolvePaymentType(
  input:
    | string
    | null
    | undefined
    | { paymentMethod?: string | null; payment_method?: string | null; isReservationDeposit?: boolean },
  isReservationDeposit?: boolean,
): ResolvedPaymentType | null {
  // 1) Rezervasyon peşinatı — en yüksek öncelik
  //    Hem `input.isReservationDeposit` hem 2. parametre kabul edilir;
  //    ikisinden biri true ise reservation kazanır.
  const fromInput =
    typeof input === 'object' && input !== null
      ? (input as { isReservationDeposit?: boolean }).isReservationDeposit === true
      : false;
  if (fromInput || isReservationDeposit === true) {
    return {
      code: 'reservation',
      labelKey: 'cashTransactionTypeReservationDeposit',
      tone: 'reservation',
      raw: 'is_deposit=true',
    };
  }

  // 2) payment_method normalize
  const raw =
    typeof input === 'string'
      ? input
      : input && typeof input === 'object'
        ? String(
            (input as { paymentMethod?: string | null; payment_method?: string | null })
              .paymentMethod ??
              (input as { payment_method?: string | null }).payment_method ??
              '',
          )
        : '';

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // `normalizePaymentMethodBucket` "transfer" için 'credit' döndürür (formCode
  // boş olduğu için). Bu helper için transfer doğrudan transfer olmalı —
  // bilinen transfer kelimelerini önce kontrol et.
  const lower = trimmed.toLowerCase();
  if (
    lower === 'havale' ||
    lower === 'eft' ||
    lower === 'transfer' ||
    lower === 'haval' ||
    lower === 'wire'
  ) {
    return {
      code: 'transfer',
      labelKey: 'cashLinePaymentTypeTransfer',
      tone: 'transfer',
      raw: trimmed,
    };
  }

  const bucket = normalizePaymentMethodBucket(trimmed);
  const meta = BUCKET_META[bucket];
  return {
    code: meta.tone,
    labelKey: meta.labelKey,
    tone: meta.tone,
    raw: trimmed,
  };
}

/**
 * Ham `payment_method` string'i için UI etiketi (badge tonu olmadan).
 * Tablo hücresinde doğrudan kullanılacak etiketi döner.
 */
export function paymentTypeLabelKey(paymentMethod: string | null | undefined): string {
  if (!String(paymentMethod ?? '').trim()) return 'openTerms';
  const key = rawMethodLabelKey(paymentMethod);
  if (key) return key;
  return 'openTerms';
}
