/**
 * Envanter Listesi — BOYA 0000001
 * Toplam stok 19, alış fiyatı 5.500 IQD, satış 10.000 IQD.
 * Eski toplam, FIFO katman brütünü (105.000) yazıyordu; dip indirim
 * ağırlıklı ortalamada düşülmüş olduğu için birim 5.500 kalıyordu.
 * 19 × 5.500 = 104.500. Satış değeri 19 × 10.000 = 190.000.
 */
import { describe, expect, it } from 'vitest';
import {
  inventoryListSalesValue,
  inventoryListStockValue,
  inventoryListUnitPurchaseCost,
} from '../../utils/inventoryListValue';

describe('envanter listesi stok değeri', () => {
  it('19 adet × birim alış 5.500 = 104.500; satış 190.000', () => {
    const unit = inventoryListUnitPurchaseCost({
      weightedAvg: 5500,
      layeredAvg: 105000 / 19,
      cardUnit: 5500,
    });
    expect(unit).toBe(5500);
    expect(inventoryListStockValue(19, unit)).toBe(104500);
    expect(inventoryListSalesValue(19, 10000)).toBe(190000);
  });

  it('katman brütü 105.000 birim fiyatı 5.526 yapmaz ve toplamı şişirmez', () => {
    const grossLayerTotal = 105000;
    const shownUnit = inventoryListUnitPurchaseCost({
      weightedAvg: 5500,
      layeredAvg: grossLayerTotal / 19,
      cardUnit: 5500,
    });
    expect(shownUnit).toBe(5500);
    expect(Math.round(shownUnit)).not.toBe(5526);
    expect(inventoryListStockValue(19, shownUnit)).toBe(104500);
    expect(inventoryListStockValue(19, shownUnit)).not.toBe(grossLayerTotal);
    expect(19 * shownUnit).toBe(104500);
  });

  it('çok depo veya çok katman: görünen birim × eldeki miktar', () => {
    const unit = inventoryListUnitPurchaseCost({
      weightedAvg: 5500,
      layeredAvg: 5526.315789473684,
      cardUnit: 0,
    });
    const onHand = 19;
    expect(inventoryListStockValue(onHand, unit)).toBe(104500);
    expect(inventoryListSalesValue(onHand, 10000)).toBe(190000);
  });

  it('ağırlıklı ortalama yoksa katman ortalaması × miktar', () => {
    const unit = inventoryListUnitPurchaseCost({
      weightedAvg: 0,
      layeredAvg: 8000,
      cardUnit: 10000,
    });
    expect(unit).toBe(8000);
    expect(inventoryListStockValue(10, unit)).toBe(80000);
  });

  it('ortalama yoksa kart alış fiyatı', () => {
    const unit = inventoryListUnitPurchaseCost({
      weightedAvg: null,
      layeredAvg: 0,
      cardUnit: 5500,
    });
    expect(unit).toBe(5500);
    expect(inventoryListStockValue(19, unit)).toBe(104500);
  });

  it('satış fiyatı stok değerini değiştirmez', () => {
    expect(inventoryListStockValue(19, 5500)).toBe(104500);
    expect(inventoryListSalesValue(19, 10000)).toBe(190000);
    expect(inventoryListStockValue(19, 5500)).not.toBe(inventoryListSalesValue(19, 10000));
  });
});
