/**
 * Satış Detayları ızgarası — Net tutar kolonu.
 *
 * Net = indirim öncesi − indirim. İade eksi işaretli kalır.
 * İndirim 0 iken net, indirim öncesi tutara eşittir.
 * Dip toplam bu neti toplar. Brüt `total` net diye yazılmaz.
 * İndirim satır netindeyse ikinci kez düşülmez.
 *
 * Pozitif satışta brüt `total` (fiş total_net, iskonto hariç) esas alınır;
 * indirim bu brütten düşülür. İndirim brütü aşarsa net 0'da kalır.
 *
 * İade dalında `Math.max(0, işaretli tutar)` kullanılmaz. O ifade
 * −10.000 iadeyi 0 yapar (veya mutlak brüt +10.000 ise hücreyi artı yazar)
 * ve dip toplam iadeyi düşmez: 110.000 + 20.000 = 130.000.
 * Doğrusu iade bir kez eksi: 110.000 + 20.000 − 10.000 = 120.000.
 */

import { isDepositSale } from './reportDepositFilter';

export interface DailySalesDetailNetInput {
  beforeDiscount?: number | null;
  total?: number | null;
  discount?: number | null;
  /** İptal edilmiş, iade edilmemiş peşinat. Net nakde bir kez girer. */
  isForfeitedDeposit?: boolean;
}

const EPS = 1e-9;

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Tek satır net tutarı. İade eksi, satış artı. */
export function dailySalesDetailNetAmount(row: DailySalesDetailNetInput): number {
  const discount = Math.abs(finite(row.discount) ?? 0);
  const total = finite(row.total) ?? 0;
  const beforeRaw = finite(row.beforeDiscount);
  const before = beforeRaw != null
    ? beforeRaw
    : total + (total < 0 ? -discount : discount);

  if (before < -EPS || total < -EPS) {
    const signedGross = before < -EPS ? before : total;
    return -Math.max(0, Math.abs(signedGross) - discount);
  }

  const gross = total !== 0 ? total : before;
  return Math.max(0, gross - discount);
}

/**
 * Dip toplam. Depozito satırları ve `skip` true dönenler katılmaz.
 * Vazgeçilmiş iptal peşinatı depozito olsa da bir kez girer.
 */
export function sumDailySalesDetailNet<T extends DailySalesDetailNetInput & { isDeposit?: boolean }>(
  rows: readonly T[],
  skip?: (row: T) => boolean,
): number {
  return rows.reduce((acc, row) => {
    if (row.isForfeitedDeposit === true) return acc + dailySalesDetailNetAmount(row);
    if (row.isDeposit === true) return acc;
    if (skip?.(row)) return acc;
    return acc + dailySalesDetailNetAmount(row);
  }, 0);
}

export interface DisplayedDailySalesDetailNetRow extends DailySalesDetailNetInput {
  isExpense?: boolean;
  isDeposit?: boolean;
  isAvans?: boolean;
  settledDeposit?: boolean;
  erpSale?: Parameters<typeof isDepositSale>[0];
}

/**
 * Ekranda görünen net tutar.
 * Satış: brüt − indirim (14.000). İndirim bir kez düşülür.
 * Açık avans ve iptal peşinatı kendi tutarıyla bir kez girer.
 * Kapanmış peşinat ve depozito hücresi boştur, 0 yazılır.
 * Gider ve iade eksi kalır.
 */
export function displayedDailySalesDetailNet(row: DisplayedDailySalesDetailNetRow): number {
  if (row.isExpense === true) return dailySalesDetailNetAmount(row);
  if (row.isForfeitedDeposit === true) {
    const amount = finite(row.total) ?? 0;
    return amount;
  }
  if (row.isDeposit === true || isDepositSale(row.erpSale)) return 0;
  if (row.isAvans === true && row.settledDeposit === true) return 0;
  if (row.isAvans === true) return finite(row.total) ?? 0;
  return dailySalesDetailNetAmount(row);
}

/** Görünen satırların net tutar toplamı. Brüt kolon toplanmaz. */
export function sumDisplayedDailySalesDetailNet(
  rows: readonly DisplayedDailySalesDetailNetRow[],
): number {
  return rows.reduce((acc, row) => acc + displayedDailySalesDetailNet(row), 0);
}
