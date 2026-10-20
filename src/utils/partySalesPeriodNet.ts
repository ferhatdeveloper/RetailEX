/**
 * Müşteri / tedarikçi bazlı satış raporu — net ciro ve net miktar.
 *
 * İade fişinin tutarı ve miktarı çoğu kayıtta artı yazılır. Brüt ile iadeyi
 * toplamak iadeyi ciroya ekler (20.000 + 10.000 = 30.000; genel 140.000).
 *
 * Muhasebe: net ciro = brüt satış − |iade|. İade gelire eklenmez.
 * İade tutarı bilgi kolonunda artı büyüklük olarak kalır ve bir kez düşülür.
 * Eksi yazılmış iade ikinci kez çıkarılmaz (20.000 − 10.000 − 10.000 = 0 olmaz).
 *
 * Net miktar = brüt miktar − |iade miktarı|.
 * Hizmet satırında iade yoksa miktar olduğu gibi kalır.
 */

export type PartySalesPeriodNetInput = {
  grossAmount: number;
  /** İade kovası. Artı veya eksi olabilir; büyüklük bir kez düşülür. */
  returnAmount: number;
  grossQuantity: number;
  /** İade miktarı. Artı veya eksi olabilir; büyüklük bir kez düşülür. */
  returnQuantity: number;
};

export type PartySalesPeriodNet = {
  grossAmount: number;
  /** Bilgi kolonu: artı büyüklük. */
  returnAmount: number;
  grossQuantity: number;
  /** Bilgi kolonu: artı büyüklük. */
  returnQuantity: number;
  netAmount: number;
  netQuantity: number;
};

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Brüt ve iade kovalarından net satırı üretir.
 * Çıktı tekrar verilirse net değişmez: iade zaten büyüklük olarak durur.
 */
export function settlePartySalesPeriodNet(
  input: PartySalesPeriodNetInput,
): PartySalesPeriodNet {
  const grossAmount = finite(input.grossAmount);
  const returnAmount = Math.abs(finite(input.returnAmount));
  const grossQuantity = finite(input.grossQuantity);
  const returnQuantity = Math.abs(finite(input.returnQuantity));
  return {
    grossAmount,
    returnAmount,
    grossQuantity,
    returnQuantity,
    netAmount: grossAmount - returnAmount,
    netQuantity: grossQuantity - returnQuantity,
  };
}

/** Sorgu satırındaki brüt / iade kovalarını rapor kolonlarına çevirir. */
export function mapPartySalesPeriodAmounts(raw: {
  grossAmount: unknown;
  returnAmount: unknown;
  grossQuantity: unknown;
  returnQuantity: unknown;
}): {
  grossAmount: number;
  returnAmount: number;
  netAmount: number;
  totalQuantity: number;
} {
  const net = settlePartySalesPeriodNet({
    grossAmount: finite(raw.grossAmount),
    returnAmount: finite(raw.returnAmount),
    grossQuantity: finite(raw.grossQuantity),
    returnQuantity: finite(raw.returnQuantity),
  });
  return {
    grossAmount: net.grossAmount,
    returnAmount: net.returnAmount,
    netAmount: net.netAmount,
    totalQuantity: net.netQuantity,
  };
}
