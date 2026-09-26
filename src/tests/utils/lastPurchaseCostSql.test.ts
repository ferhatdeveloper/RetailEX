import { describe, expect, it } from 'vitest';
import {
  buildProfitCostCtes,
  classifyProductHistoryType,
  displayItemCode,
  isPlSalesOrReturnFiche,
  isPurchaseFiche,
  isSalesReturnFiche,
  isServiceLineType,
  isUuidText,
  LINE_COST_EXPR,
  lineCostAmount,
  resolveLineProductId,
  restServiceUnitCost,
  scaleLineRevenueToInvoiceNet,
  unitCostFromPurchaseLine,
} from '../../utils/lastPurchaseCostSql';

describe('lastPurchaseCostSql — muhasebe yardımcıları', () => {
  it('LINE_COST_EXPR malzeme için alış CTE; hizmet için purchase_price/unit_cost', () => {
    expect(LINE_COST_EXPR).toContain('lpc_id.unit_cost');
    expect(LINE_COST_EXPR).toContain('lpc_code.unit_cost');
    expect(LINE_COST_EXPR).toContain('lpc_pcode.unit_cost');
    expect(LINE_COST_EXPR).toContain('svc.purchase_price');
    expect(LINE_COST_EXPR).toContain('bsvc.cost_price');
    expect(LINE_COST_EXPR).toContain('src.unit_recipe_cost');
    expect(LINE_COST_EXPR).toContain("IN ('hizmet', 'service', 'package', 'paket')");
    // Malzeme kolunda kart/satış cost yok; hizmet kolunda unit_cost / p.cost yedek
    expect(LINE_COST_EXPR).not.toContain('si.total_cost');
  });

  it('isServiceLineType paket/package kabul eder', () => {
    expect(isServiceLineType('package')).toBe(true);
    expect(isServiceLineType('paket')).toBe(true);
    expect(isServiceLineType('Hizmet')).toBe(true);
    expect(isServiceLineType('Malzeme')).toBe(false);
  });

  it('buildProfitCostCtes hizmet reçete CTE içerir', () => {
    expect(buildProfitCostCtes()).toContain('service_recipe_unit_cost');
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

  it('son alış yoksa malzeme maliyeti 0 (kart / satış satırı cost kullanılmaz)', () => {
    expect(lineCostAmount({ quantity: 2, lastPurchaseUnit: 0 })).toBe(0);
    expect(lineCostAmount({ quantity: 2 })).toBe(0);
    expect(lineCostAmount({ quantity: 5, lastPurchaseUnit: undefined })).toBe(0);
  });

  it('hizmet satırında purchase_price / unit_cost ile COGS hesaplar', () => {
    expect(
      lineCostAmount({
        quantity: 2,
        itemType: 'Hizmet',
        serviceUnitCost: 15000,
        lastPurchaseUnit: 999, // malzeme yolu yok sayılmalı
      }),
    ).toBe(30000);
    expect(lineCostAmount({ quantity: 1, itemType: 'service', serviceUnitCost: 0 })).toBe(0);
  });

  it('displayItemCode UUID item_code atlar, p.code / svc.code tercih eder', () => {
    const uuid = 'dbde53c4-a766-4506-b4d0-0938d3d1ff25';
    expect(isUuidText(uuid)).toBe(true);
    expect(isUuidText('PROD-1')).toBe(false);
    // UUID item_code ve boş / '—' atlanır; ilk insan kodu (p.code / svc.code)
    expect(displayItemCode(uuid, 'PROD-1')).toBe('PROD-1');
    expect(displayItemCode('', '—', uuid, 'SVC-10')).toBe('SVC-10');
    expect(displayItemCode('P-CODE', uuid)).toBe('P-CODE');
    // Yalnızca UUID → em dash
    expect(displayItemCode(uuid)).toBe('—');
    expect(displayItemCode(null, '', '—', uuid)).toBe('—');
  });

  it('restServiceUnitCost zinciri: 0 satır → purchase_price → beauty cost_price → reçete', () => {
    expect(
      restServiceUnitCost({
        lineUnitCost: 0,
        purchasePrice: 100,
        beautyCostPrice: 50,
        recipeUnitCost: 25,
      }),
    ).toBe(100);
    expect(
      restServiceUnitCost({
        lineUnitCost: 0,
        purchasePrice: 0,
        beautyCostPrice: 50,
        recipeUnitCost: 25,
      }),
    ).toBe(50);
    expect(
      restServiceUnitCost({
        lineUnitCost: 0,
        purchasePrice: 0,
        beautyCostPrice: 0,
        recipeUnitCost: 25,
      }),
    ).toBe(25);
  });

  it('isService true iken Malzeme satırında hizmet birim maliyeti kullanılır', () => {
    expect(
      lineCostAmount({
        quantity: 2,
        itemType: 'Malzeme',
        isService: true,
        serviceUnitCost: 8000,
        lastPurchaseUnit: 999,
      }),
    ).toBe(16000);
  });

  it('return_invoice + trcode 0 → satış iadesi (isSalesReturnFiche ile uyumlu)', () => {
    expect(classifyProductHistoryType('return_invoice', 0)).toBe('sales_return');
    expect(classifyProductHistoryType('return_invoice', 3)).toBe('sales_return');
    expect(classifyProductHistoryType('return_invoice', 2)).toBe('sales_return');
    expect(classifyProductHistoryType('return_invoice', 6)).toBe('purchase_return');
  });
});
