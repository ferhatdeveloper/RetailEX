/**
 * Malzeme Hareket Raporu — BOYA.
 * Alış 10×5.000 + 10×6.000 → ağırlıklı ortalama 5.500.
 * Satış 2 adet maliyet −11.000, satış iadesi 1 adet +5.500.
 * Net miktar 19, net stok değeri 104.500 (envanter ile aynı).
 * Satış fiyatı 10.000 birim maliyet değildir.
 */
import { describe, expect, it } from 'vitest';
import {
  summarizeMaterialMovementKpis,
  valueMaterialMovementLine,
} from '../../utils/materialMovementValuation';

const AVG = (10 * 5000 + 10 * 6000) / 20;

function valueBoya() {
  const sellingPrice = 10000;
  const lines = [
    valueMaterialMovementLine({
      quantity: 1,
      unitPrice: sellingPrice,
      costPrice: sellingPrice,
      avgUnitCost: AVG,
      movementType: 'in',
      ficheType: 'return_invoice',
      trcode: 3,
      sourceType: 'invoice',
    }),
    valueMaterialMovementLine({
      quantity: 2,
      unitPrice: sellingPrice,
      costPrice: sellingPrice,
      avgUnitCost: AVG,
      movementType: 'out',
      ficheType: 'sales_invoice',
      trcode: 8,
      sourceType: 'invoice',
    }),
    valueMaterialMovementLine({
      quantity: 10,
      unitPrice: 6000,
      costPrice: 0,
      avgUnitCost: AVG,
      movementType: 'in',
      ficheType: 'purchase_invoice',
      trcode: 1,
      sourceType: 'invoice',
    }),
    valueMaterialMovementLine({
      quantity: 10,
      unitPrice: 5000,
      costPrice: 0,
      avgUnitCost: AVG,
      movementType: 'in',
      ficheType: 'purchase_invoice',
      trcode: 1,
      sourceType: 'invoice',
    }),
  ];
  return { lines, kpis: summarizeMaterialMovementKpis(lines), sellingPrice };
}

describe('Malzeme hareket maliyeti — BOYA', () => {
  it('ağırlıklı ortalama 5.500; satış fiyatı birim maliyet olmaz', () => {
    expect(AVG).toBe(5500);
    const { lines, sellingPrice } = valueBoya();
    const sale = lines[1];
    const salesReturn = lines[0];
    expect(sale.uiType).toBe('sale');
    expect(sale.unitCost).toBe(5500);
    expect(sale.unitCost).not.toBe(sellingPrice);
    expect(salesReturn.uiType).toBe('return');
    expect(salesReturn.bucket).toBe('sales_return');
    expect(salesReturn.unitCost).toBe(5500);
    expect(salesReturn.unitCost).not.toBe(sellingPrice);
    for (const line of lines) {
      if (line.bucket === 'sale' || line.bucket === 'sales_return') {
        expect(line.unitCost).not.toBe(sellingPrice);
      }
    }
  });

  it('alış fatura maliyetinde kalır; satış −11.000, iade +5.500', () => {
    const { lines } = valueBoya();
    const [salesReturn, sale, purchase6k, purchase5k] = lines;
    expect(purchase5k.quantity).toBe(10);
    expect(purchase5k.unitCost).toBe(5000);
    expect(purchase5k.totalCost).toBe(50000);
    expect(purchase6k.quantity).toBe(10);
    expect(purchase6k.unitCost).toBe(6000);
    expect(purchase6k.totalCost).toBe(60000);
    expect(sale.quantity).toBe(-2);
    expect(sale.totalCost).toBe(-11000);
    expect(salesReturn.quantity).toBe(1);
    expect(salesReturn.totalCost).toBe(5500);
  });

  it('KPI: alış 110.000, satış çıkışı 11.000, iade 5.500 bir kez, net 104.500, adet 19', () => {
    const { kpis } = valueBoya();
    expect(kpis.purchaseIn).toBe(110000);
    expect(kpis.saleOut).toBe(11000);
    expect(kpis.salesReturn).toBe(5500);
    expect(kpis.netQty).toBe(19);
    expect(kpis.net).toBe(104500);
    expect(kpis.net).toBe(19 * AVG);
    expect(kpis.purchaseIn - kpis.saleOut + kpis.salesReturn).toBe(kpis.net);
    // İade ikinci kez düşülmez: 11.000 − 5.500 − 5.500 satış etkisini sıfırlamaz.
    const doubleDeducted = kpis.purchaseIn - kpis.saleOut - kpis.salesReturn;
    expect(doubleDeducted).toBe(93500);
    expect(doubleDeducted).not.toBe(kpis.net);
    expect(kpis.purchaseIn).not.toBe(120000);
    expect(kpis.saleOut).not.toBe(20000);
  });

  it('trcode 2 satış iadesi de stoğa maliyet olarak girer', () => {
    const line = valueMaterialMovementLine({
      quantity: 1,
      unitPrice: 10000,
      costPrice: 10000,
      avgUnitCost: 5500,
      movementType: 'out',
      ficheType: 'return_invoice',
      trcode: 2,
      sourceType: 'invoice',
    });
    expect(line.quantity).toBe(1);
    expect(line.bucket).toBe('sales_return');
    expect(line.unitCost).toBe(5500);
    expect(line.totalCost).toBe(5500);
  });

  it('ortalama yokken satış fiyatına eşit kayıtlı maliyet kullanılmaz', () => {
    const line = valueMaterialMovementLine({
      quantity: 2,
      unitPrice: 10000,
      costPrice: 10000,
      avgUnitCost: 0,
      movementType: 'out',
      ficheType: 'sales_invoice',
      trcode: 8,
      sourceType: 'invoice',
    });
    expect(line.unitCost).toBe(0);
    expect(line.totalCost).toBe(0);
    expect(line.unitCost).not.toBe(10000);
  });
});
