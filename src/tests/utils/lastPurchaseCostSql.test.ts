import { describe, expect, it } from 'vitest';
import {
  isPlSalesOrReturnFiche,
  isPurchaseFiche,
  isSalesReturnFiche,
  LINE_COST_EXPR,
  lineCostAmount,
  resolveLineProductId,
  scaleLineRevenueToInvoiceNet,
  unitCostFromPurchaseLine,
} from '../../utils/lastPurchaseCostSql';

describe('lastPurchaseCostSql — muhasebe yardımcıları', () => {
  it('LINE_COST_EXPR yalnızca alış CTE birimlerini kullanır (kart/satış cost yok)', () => {
    expect(LINE_COST_EXPR).toContain('lpc_id.unit_cost');
    expect(LINE_COST_EXPR).toContain('lpc_code.unit_cost');
    expect(LINE_COST_EXPR).toContain('lpc_pcode.unit_cost');
    expect(LINE_COST_EXPR).not.toMatch(/\bp\.cost\b/);
    expect(LINE_COST_EXPR).not.toContain('si.total_cost');
    expect(LINE_COST_EXPR).not.toContain('si.unit_cost');
  });
  it('alış iadesini (trcode 6) son alış saymaz', () => {
    expect(isPurchaseFiche({ fiche_type: 'purchase_invoice', trcode: 6 })).toBe(false);
    expect(isPurchaseFiche({ fiche_type: 'purchase_invoice', trcode: 1 })).toBe(true);
    expect(isPurchaseFiche({ fiche_type: 'return_invoice', trcode: 3 })).toBe(false);
  });

  it('satış iadesini işaretler', () => {
    expect(isSalesReturnFiche({ fiche_type: 'return_invoice', trcode: 3 })).toBe(true);
    expect(isSalesReturnFiche({ fiche_type: 'sales_invoice', trcode: 7 })).toBe(false);
    expect(isSalesReturnFiche({ fiche_type: 'purchase_invoice', trcode: 6 })).toBe(false);
  });

  it('kar-zarar filtresine satış ve satış iadesi girer', () => {
    expect(isPlSalesOrReturnFiche({ fiche_type: 'sales_invoice', trcode: 7 })).toBe(true);
    expect(isPlSalesOrReturnFiche({ fiche_type: 'return_invoice', trcode: 3 })).toBe(true);
    expect(isPlSalesOrReturnFiche({ fiche_type: 'purchase_invoice', trcode: 1 })).toBe(false);
    expect(isPlSalesOrReturnFiche({ fiche_type: 'purchase_invoice', trcode: 6 })).toBe(false);
  });

  it('dip indirimi satırlara oranlar', () => {
    // 50250 satır → 50000 fatura net (250 dip)
    expect(scaleLineRevenueToInvoiceNet(21000, 50250, 50000)).toBeCloseTo(20895.522, 2);
    expect(scaleLineRevenueToInvoiceNet(19500, 50250, 50000)).toBeCloseTo(19402.985, 2);
    expect(scaleLineRevenueToInvoiceNet(9750, 50250, 50000)).toBeCloseTo(9701.493, 2);
    const sum =
      scaleLineRevenueToInvoiceNet(21000, 50250, 50000) +
      scaleLineRevenueToInvoiceNet(19500, 50250, 50000) +
      scaleLineRevenueToInvoiceNet(9750, 50250, 50000);
    expect(sum).toBeCloseTo(50000, 2);
  });

  it('ölçek gerekmezse satırı olduğu gibi bırakır', () => {
    expect(scaleLineRevenueToInvoiceNet(1000, 1000, 1000)).toBe(1000);
  });

  it('alış satırından birim maliyet üretir', () => {
    expect(unitCostFromPurchaseLine({ quantity: 2, net_amount: 10000 })).toBe(5000);
    expect(unitCostFromPurchaseLine({ quantity: 0, unit_price: 12 })).toBe(12);
  });

  it('product_id boşken UUID item_code ile ürün çözer', () => {
    const id = 'dbde53c4-a766-4506-b4d0-0938d3d1ff25';
    expect(resolveLineProductId({ product_id: null, item_code: id })).toBe(id);
    expect(resolveLineProductId({ product_id: id, item_code: 'PROD-1' })).toBe(id);
    expect(resolveLineProductId({ item_code: 'PROD-20260622-6158' })).toBe('');
  });

  it('adet COGS = son alış birim × satılan adet (kart maliyetine düşmez)', () => {
    // Alış: 20 adet / 180000 → 9000; satış 3 adet
    const unit = unitCostFromPurchaseLine({ quantity: 20, net_amount: 180000, unit_price: 9000 });
    expect(unit).toBe(9000);
    expect(
      lineCostAmount({
        quantity: 3,
        lastPurchaseUnit: unit,
      }),
    ).toBe(27000);
  });

  it('son alış yoksa maliyet 0 (kart / satış satırı cost kullanılmaz)', () => {
    expect(lineCostAmount({ quantity: 2, lastPurchaseUnit: 0 })).toBe(0);
    expect(lineCostAmount({ quantity: 2 })).toBe(0);
    expect(lineCostAmount({ quantity: 5, lastPurchaseUnit: undefined })).toBe(0);
  });
});
