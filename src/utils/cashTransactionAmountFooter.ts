/**
 * Kasa işlem listesi — Tutar kolonu dip toplamı.
 *
 * Satırdaki tutar hareket tutarı olarak kalır (25.000 A, 50.000 B).
 * Dip toplam, görünen satırların kümülatif netidir:
 * borç (B) kasa girişidir ve eklenir, alacak (A) kasa çıkışıdır ve çıkarılır.
 * Mutlak tutarlar toplanmaz.
 *
 * Virman şirket nakdini değiştirmez. Bu kasanın kendi satır yönü uygulanır:
 * bu kasadan çıkış alacak, bu kasaya giriş borç.
 * Gider çıkıştır. Rezervasyon peşinatı bu kasaya girdiyse bir kez eklenir.
 */
import {
  computeKasaIslemiSign,
  isKasaInvoiceIslemTipi,
  postedCashTypeForInvoiceIslem,
} from '../services/api/kasa';
import { cashVirmanDirection, type CashVirmanLine } from './cashVirman';

export interface CashTransactionFooterLine extends CashVirmanLine {
  islem_aciklamasi?: string | null;
  is_reservation_deposit?: boolean | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function movementAmount(line: CashTransactionFooterLine | null | undefined): number {
  const raw = line?.tutar != null ? line.tutar : line?.amount;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n);
}

function typeOf(line: CashTransactionFooterLine): string {
  return String(line.islem_tipi || line.transaction_type || line.transactionType || '')
    .trim()
    .toUpperCase();
}

/**
 * Bu satırın kasa yönü.
 * +1 borç / giriş, −1 alacak / çıkış, 0 bakiyeyi değiştirmez.
 */
export function cashTransactionFooterSign(
  line: CashTransactionFooterLine | null | undefined,
): -1 | 0 | 1 {
  if (!line) return 0;
  const virman = cashVirmanDirection(line);
  if (virman) return virman;

  const tip = typeOf(line);
  if (tip === 'KAPANIS') return -1;

  if (isKasaInvoiceIslemTipi(tip)) {
    const posted = computeKasaIslemiSign(postedCashTypeForInvoiceIslem(tip));
    if (posted < 0) return -1;
    if (posted > 0) return 1;
    return 0;
  }

  const stored = Number(line.sign);
  if (Number.isFinite(stored) && stored !== 0) {
    return stored < 0 ? -1 : 1;
  }

  const sign = computeKasaIslemiSign(tip);
  if (sign < 0) return -1;
  if (sign > 0) return 1;
  return 0;
}

/** Tutar kolonundaki (B). Hareket tutarını bakiyeye çevirmez. */
export function cashTransactionAmountIsInflow(
  line: CashTransactionFooterLine | null | undefined,
): boolean {
  return cashTransactionFooterSign(line) > 0;
}

/**
 * Dip toplama giren işaretli tutar.
 * Rezervasyon bayrağı tutarı ikinci kez eklemez; satır bir kez sayılır.
 */
export function cashTransactionFooterSignedAmount(
  line: CashTransactionFooterLine | null | undefined,
): number {
  const amount = movementAmount(line);
  if (!amount) return 0;
  return round2(amount * cashTransactionFooterSign(line));
}

/** Görünen satırların neti. Boş liste 0. Filtre, verilen dizi kadardır. */
export function cashTransactionFooterNet(
  lines: readonly CashTransactionFooterLine[] | null | undefined,
): number {
  if (!lines || lines.length === 0) return 0;
  let total = 0;
  for (const line of lines) {
    total += cashTransactionFooterSignedAmount(line);
  }
  return round2(total);
}

export function cashTransactionAmountFooterColumn<T extends CashTransactionFooterLine>(): {
  columnId: string;
  getValue: (row: T) => number;
} {
  return {
    columnId: 'tutar',
    getValue: (row) => cashTransactionFooterSignedAmount(row),
  };
}
