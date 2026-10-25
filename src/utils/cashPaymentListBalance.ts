/**
 * Cari Hesap Ödeme — cari seçim listesi, yalnız gösterim.
 *
 * Bakiye formülü cari hesap listesi ile aynıdır (`cariListBalanceForDisplay`).
 * Üçüncü argüman, peşinat toplamına tamamlanan hizmetin kalan tahsilatını da
 * ekler. Bu tahsilat müşteri alacağı değildir; geri ödeme tutarı türetmez.
 * Veresiye borç (artı bakiye) büyütülmez ve silinmez. Tedarikçi ticari
 * alacağı, peşinat fişi değilse durur. Kasa satırı ve defter yazılmaz.
 */
import {
  cariListBalanceForDisplay,
  type CariListCardType,
} from './cariListBalance';
import { isReservationDepositCollection } from './invoiceHeaderBalance';
import {
  reservationDepositAccountId,
  sumReservationDepositsByAccount,
  type ReservationDepositAccountRow,
} from './reservationDepositByAccount';
import { isCariCreditorBalance } from './cariAccountStatement';

export type PaymentListCashRow = ReservationDepositAccountRow & {
  fiche_no?: unknown;
};

/**
 * Tamamlanan hizmetin kalan tahsilatı (BEAUTY-REMAINDER / randevu kalan ödeme).
 * Peşinat satırı burada sayılmaz; o satır rezervasyon kimliğindedir.
 */
export function isSettledServiceCollection(row: PaymentListCashRow): boolean {
  if (isReservationDepositCollection(row)) return false;
  const tt = String(row.transaction_type ?? '').trim().toUpperCase();
  if (tt !== 'CH_TAHSILAT') return false;
  const absAmt = Math.abs(Number(row.amount) || 0);
  if (!(absAmt > 0)) return false;
  const text = `${row.fiche_no ?? ''} ${row.definition ?? ''}`;
  if (/BEAUTY-REMAINDER-/i.test(text)) return true;
  return /randevu\s+kalan\s+[öo]deme/i.test(text);
}

/**
 * Ödeme listesinin `cariListBalanceForDisplay` üçüncü argümanı.
 * Rezervasyon peşinatı + tamamlanan hizmet tahsilatı. Aynı satır iki kez yazılmaz.
 */
export function sumCashPaymentBalanceOffsets(
  rows: PaymentListCashRow[],
): Record<string, number> {
  const map = sumReservationDepositsByAccount(rows);
  for (const row of rows) {
    if (!isSettledServiceCollection(row)) continue;
    const id = reservationDepositAccountId(row);
    if (!id) continue;
    const amt = Math.abs(Number(row.amount) || 0);
    if (!(amt > 0)) continue;
    map[id] = (map[id] || 0) + amt;
  }
  return map;
}

export function cashPaymentListBalanceForDisplay(
  cardType: CariListCardType,
  ledgerBalance: number | null | undefined,
  balanceOffset: number | null | undefined,
): number {
  return cariListBalanceForDisplay(cardType, ledgerBalance, balanceOffset);
}

/** Düzeltilmiş bakiyenin alacak (A) tarafı. Borç ve sıfır ödeme tutarı değildir. */
export function cashPaymentSuggestedAmount(
  cardType: CariListCardType,
  displayBalance: number,
): number {
  const sideType =
    cardType === 'supplier' ? 'supplier' : cardType === 'employee' ? 'employee' : 'customer';
  if (!isCariCreditorBalance(sideType, displayBalance)) return 0;
  const abs = Math.abs(Number(displayBalance) || 0);
  return abs > 0.009 ? abs : 0;
}
