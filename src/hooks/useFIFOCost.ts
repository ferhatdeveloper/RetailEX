import {
  consumeFifoForQuantity,
  fetchLayeredInventoryValuation,
} from '../services/layeredInventoryCost';

export type FifoCostItem = {
  productId: string;
  productCode?: string;
  quantity: number;
};

export type FifoCostResult = {
  unitCost: number;
  totalCost: number;
  available: boolean;
};

/**
 * Satış satırları için FIFO birim maliyet (kalan alış katmanlarından).
 * Kart alış fiyatı kullanılmaz.
 */
export async function batchCalculateFIFOCost(params: {
  items: FifoCostItem[];
  firmaId?: string;
  donemId?: string;
}): Promise<Map<string, FifoCostResult>> {
  const results = new Map<string, FifoCostResult>();
  const items = (params.items || []).filter((i) => i.productId && Number(i.quantity) > 0);
  if (!items.length) return results;

  const valuation = await fetchLayeredInventoryValuation({
    firmNr: params.firmaId,
    periodNr: params.donemId,
  });

  for (const item of items) {
    const row =
      valuation.byProductId.get(String(item.productId)) ||
      (item.productCode
        ? valuation.byProductId.get(valuation.aliases.get(String(item.productCode)) || '')
        : undefined);
    const consumed = consumeFifoForQuantity(row?.layers, item.quantity);
    results.set(item.productId, consumed);
    if (item.productCode && item.productCode !== item.productId) {
      results.set(item.productCode, consumed);
    }
  }
  return results;
}
