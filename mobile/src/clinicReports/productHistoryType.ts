/**
 * Web `lastPurchaseCostSql.classifyProductHistoryType` — aynı trcode ayrımı.
 * Alış iadesi 6, satış iadesi 2/3. Satış artı, iade eksi tarafta kalır.
 */

export const PURCHASE_ONLY_TRCODES = [1, 4, 5, 13, 26, 41, 42] as const;
export const PURCHASE_RETURN_TRCODE = 6;
export const SALES_RETURN_TRCODES = [2, 3] as const;

export type ProductHistoryMovementType =
  | 'purchase'
  | 'purchase_return'
  | 'sales'
  | 'sales_return';

export function classifyProductHistoryType(
  ficheType: string | null | undefined,
  trcode: number | null | undefined,
): ProductHistoryMovementType {
  const ft = String(ficheType || '').toLowerCase().trim();
  const tc = Number(trcode) || 0;

  if (tc === PURCHASE_RETURN_TRCODE) return 'purchase_return';
  if ((SALES_RETURN_TRCODES as readonly number[]).includes(tc)) return 'sales_return';

  if (ft === 'return_invoice') {
    if ((PURCHASE_ONLY_TRCODES as readonly number[]).includes(tc)) return 'purchase_return';
    return 'sales_return';
  }

  if (
    ft === 'purchase_invoice' ||
    ft === 'a' ||
    (PURCHASE_ONLY_TRCODES as readonly number[]).includes(tc)
  ) {
    return 'purchase';
  }

  return 'sales';
}
