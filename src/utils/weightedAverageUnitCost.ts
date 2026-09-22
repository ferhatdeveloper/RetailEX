/**
 * Dönem / hareket ağırlıklı ortalama birim maliyet:
 *   Ortalama = Toplam Maliyet / Toplam Miktar
 *
 * Örnek: 100×100 + 150×120 = 28.000 / 250 = 112
 * Alış iadesi miktar ve tutardan düşülür. Satış satırları ortalamaya girmez.
 */

export type WeightedAvgAccumulator = {
  amountSum: number;
  qtySum: number;
};

export function emptyWeightedAvg(): WeightedAvgAccumulator {
  return { amountSum: 0, qtySum: 0 };
}

/** Alış: +, alış iadesi: − (qtyAbs ve tutar). */
export function addWeightedAvgLine(
  acc: WeightedAvgAccumulator,
  opts: { quantity: number; unitCost: number; amount?: number; isReturn?: boolean },
): void {
  const qtyAbs = Math.abs(Number(opts.quantity) || 0);
  if (qtyAbs <= 0.0000001) return;
  const unit = Number(opts.unitCost) || 0;
  let amount = Number(opts.amount);
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.0000001) {
    amount = unit * qtyAbs;
  } else {
    amount = Math.abs(amount);
  }
  if (!(amount > 0) && !(unit > 0)) return;
  const sign = opts.isReturn ? -1 : 1;
  acc.qtySum += sign * qtyAbs;
  acc.amountSum += sign * amount;
}

export function finalizeWeightedAvgUnitCost(acc: WeightedAvgAccumulator): number {
  if (Math.abs(acc.qtySum) <= 0.0000001) return 0;
  const avg = acc.amountSum / acc.qtySum;
  return Number.isFinite(avg) && avg > 0 ? avg : 0;
}

export function mergeWeightedAvgMaps(
  into: Map<string, WeightedAvgAccumulator>,
  key: string,
  line: { quantity: number; unitCost: number; amount?: number; isReturn?: boolean },
): void {
  if (!key) return;
  let acc = into.get(key);
  if (!acc) {
    acc = emptyWeightedAvg();
    into.set(key, acc);
  }
  addWeightedAvgLine(acc, line);
}
