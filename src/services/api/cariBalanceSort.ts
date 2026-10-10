/**
 * Cari Hesap Özeti — liste sıralama komparatörü.
 *
 * 10.10.2026 — "Hizmet satırları gözükmüyor" düzeltmesi:
 * Bekleyen avansı / alacağı / borcu sıfır olan cariler (geçmiş hizmet almış ama
 * bakiyesi kapanmış) da listelenmeli; sıralama kullanıcı beklentisi:
 *
 *   1) bekleyen avans desc (rezervasyon avanslı cariler üstte)
 *   2) bakiye desc (alacaklı müşteri / borçlu tedarikçi üstte)
 *   3) unvan asc (aynı tutarda isme göre)
 *
 * `balanceSide` (borçlu / alacaklı alt raporları) sıralamayı değiştirmez —
 * kuralımız pendingDeposit → balance → name.
 *
 * Bu komparator 'transition' audit-friendly:
 * - `b.balance - a.balance` plain değer sıralaması; ledger tek kaynaktır
 *   (`computeCustomerBalanceFromLedger`), bu yüzden ayrıca ABS / yön
 *   override'ı gerekmez.
 * - Sıfır bakiye / sıfır avanslı cariler listede KALIR.
 * - Tedarikçi / partner / personel desteklenir (cardType bağımsız).
 */

import type { CariBalanceRow } from './erpReports';

export type SortableCariBalance = Pick<
  CariBalanceRow,
  'balance' | 'pendingDeposit' | 'accountName'
>;

export interface CariBalanceSortOpts {
  /**
   * Alt rapor (borçlu / alacaklı) aktifse bakiye mutlak değer ile sıralanır —
   * `Math.abs(b.balance) - Math.abs(a.balance)`. Default false.
   */
  balanceSide?: boolean;
}

export function compareCariBalanceForReport(
  a: SortableCariBalance,
  b: SortableCariBalance,
  opts: CariBalanceSortOpts = {},
): number {
  const pd = (b.pendingDeposit || 0) - (a.pendingDeposit || 0);
  if (pd !== 0) return pd;
  if (opts.balanceSide) {
    const ba = Math.abs(b.balance) - Math.abs(a.balance);
    if (ba !== 0) return ba;
  } else {
    const bd = b.balance - a.balance;
    if (bd !== 0) return bd;
  }
  return String(a.accountName || '').localeCompare(
    String(b.accountName || ''),
    'tr',
  );
}

/**
 * Liste halinde sırala; mutasyon yapmadan yeni dizi döner.
 */
export function sortCariBalanceForReport<T extends SortableCariBalance>(
  rows: T[],
  opts: CariBalanceSortOpts = {},
): T[] {
  return [...rows].sort((a, b) => compareCariBalanceForReport(a, b, opts));
}