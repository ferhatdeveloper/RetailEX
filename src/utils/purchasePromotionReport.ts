export interface PurchasePromotionReportLine {
  id: string;
  invoiceId: string;
  invoiceNo: string;
  invoiceDate: string;
  supplierName: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  allocatedUnitCost: number;
  allocatedTotalCost: number;
  invoicePaidTotal: number;
}

export interface PurchasePromotionReportSummary {
  lineCount: number;
  totalQuantity: number;
  totalAllocatedCost: number;
  invoiceCount: number;
}

export function summarizePurchasePromotionReport(
  lines: PurchasePromotionReportLine[],
): PurchasePromotionReportSummary {
  const invoiceIds = new Set<string>();
  let totalQuantity = 0;
  let totalAllocatedCost = 0;
  for (const line of lines) {
    invoiceIds.add(line.invoiceId);
    totalQuantity += Number(line.quantity || 0);
    totalAllocatedCost += Number(line.allocatedTotalCost || 0);
  }
  return {
    lineCount: lines.length,
    totalQuantity,
    totalAllocatedCost,
    invoiceCount: invoiceIds.size,
  };
}
