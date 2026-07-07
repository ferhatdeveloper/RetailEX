import { isInvoiceStockLineType, isInvoiceSupplierPayableLineType } from './invoiceLineType';

export interface PurchaseLineCostInput {
  id?: string;
  code?: string;
  type?: string;
  quantity: number;
  baseQuantity?: number;
  multiplier?: number;
  unitPrice: number;
  netAmount: number;
  discountAmount?: number;
}

export interface PurchaseLineCostResult {
  unitCost: number;
  totalCost: number;
}

function lineBaseQty(item: PurchaseLineCostInput): number {
  return item.baseQuantity ?? item.quantity * (item.multiplier || 1);
}

function lineKey(item: PurchaseLineCostInput, index: number): string {
  return String(item.id || item.code || `line-${index}`);
}

/**
 * Alış faturasında ücretli satırların toplam tutarını, stok alan (malzeme + promosyon)
 * miktarına orantılı dağıtarak birim maliyet hesaplar.
 */
export function allocatePurchaseInvoiceLineCosts(
  items: PurchaseLineCostInput[],
  rateToLocal = 1,
): Map<string, PurchaseLineCostResult> {
  const results = new Map<string, PurchaseLineCostResult>();
  let totalPaidLocal = 0;
  let totalStockQty = 0;

  for (const item of items) {
    const baseQty = lineBaseQty(item);
    if (isInvoiceStockLineType(item.type, 'Alis') && baseQty > 0) {
      totalStockQty += baseQty;
    }
    if (isInvoiceSupplierPayableLineType(item.type)) {
      totalPaidLocal += Number(item.netAmount ?? 0) * rateToLocal;
    }
  }

  const blendedUnit = totalStockQty > 0 ? totalPaidLocal / totalStockQty : 0;

  items.forEach((item, index) => {
    const key = lineKey(item, index);
    const baseQty = lineBaseQty(item);
    if (!isInvoiceStockLineType(item.type, 'Alis') || baseQty <= 0) {
      results.set(key, { unitCost: 0, totalCost: 0 });
      return;
    }
    const totalCost = blendedUnit * baseQty;
    results.set(key, {
      unitCost: baseQty > 0 ? totalCost / baseQty : 0,
      totalCost,
    });
  });

  return results;
}
