/**
 * Ürün Bazlı Satış Raporu — net ciro ve ağırlıklı ortalama birim fiyat.
 *
 * İade kaleminin tutarı ve miktarı fişte çoğunlukla artı yazılır. Brüt ile
 * iadeyi toplamak iadeyi ciroya ekler (20.000 + 10.000 = 30.000).
 *
 * Muhasebe: net ciro = brüt satış − |iade|. Satış artı, iade eksi.
 * İade tutarı ve iade miktarı bilgi kolonunda artı büyüklük olarak kalır.
 * Aynı iade bir kez düşülür; işaretli iade ikinci kez çıkarılmaz
 * (20.000 − 10.000 − 10.000 = 0 olmaz).
 *
 * Ağırlıklı ortalama birim fiyat = net tutar / net miktar.
 * Net miktar = brüt miktar − |iade miktarı|.
 */

export type ProductPeriodSalesNetInput = {
  grossAmount: number;
  /** İade kovası. Artı veya eksi olabilir; büyüklük bir kez düşülür. */
  returnAmount: number;
  grossQuantity: number;
  /** İade miktarı. Artı veya eksi olabilir; büyüklük bir kez düşülür. */
  returnQuantity: number;
};

export type ProductPeriodSalesNet = {
  grossAmount: number;
  /** Bilgi kolonu: artı büyüklük. */
  returnAmount: number;
  grossQuantity: number;
  /** Bilgi kolonu: artı büyüklük. */
  returnQuantity: number;
  netAmount: number;
  netQuantity: number;
  avgUnitPrice: number;
};

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const QTY_EPS = 0.0001;

/**
 * Brüt ve iade kovalarından net satırı üretir.
 * Çıktı tekrar verilirse net değişmez: iade zaten büyüklük olarak durur,
 * brütten bir kez daha düşülür, ikinci bir eksi yazılmaz.
 */
export function settleProductPeriodSalesNet(
  input: ProductPeriodSalesNetInput,
): ProductPeriodSalesNet {
  const grossAmount = finite(input.grossAmount);
  const returnAmount = Math.abs(finite(input.returnAmount));
  const grossQuantity = finite(input.grossQuantity);
  const returnQuantity = Math.abs(finite(input.returnQuantity));
  const netAmount = grossAmount - returnAmount;
  const netQuantity = grossQuantity - returnQuantity;
  const avgUnitPrice =
    Math.abs(netQuantity) > QTY_EPS ? netAmount / netQuantity : 0;
  return {
    grossAmount,
    returnAmount,
    grossQuantity,
    returnQuantity,
    netAmount,
    netQuantity,
    avgUnitPrice,
  };
}
