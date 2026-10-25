/**
 * Satış Detayları ızgarası — Net tutar kolonu.
 *
 * Net = indirim öncesi − indirim. İade eksi işaretli kalır.
 * İndirim 0 iken net, indirim öncesi tutara eşittir.
 *
 * Pozitif satışta brüt `total` (fiş total_net, iskonto hariç) esas alınır;
 * indirim bu brütten düşülür. İndirim brütü aşarsa net 0'da kalır.
 *
 * İade dalında `Math.max(0, işaretli tutar)` kullanılmaz. O ifade
 * −10.000 iadeyi 0 yapar (veya mutlak brüt +10.000 ise hücreyi artı yazar)
 * ve dip toplam iadeyi düşmez: 110.000 + 20.000 = 130.000.
 * Doğrusu iade bir kez eksi: 110.000 + 20.000 − 10.000 = 120.000.
 */

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
