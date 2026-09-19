import { describe, expect, it } from 'vitest';
import {
  applyFifoLayers,
  consumeFifoForQuantity,
  dedupeLayerMovements,
  buildCostProfitRows,
  type LayerMovement,
} from './layeredInventoryCost';

/** EL KREMİ senaryosu: 50@10.000, satış 2, 10@8.000 → elde 58. */
function elKremiMoves(): LayerMovement[] {
  return [
    {
      id: 'in-50',
      productId: 'el-kremi',
      date: '2026-09-16',
      createdAt: '2026-09-16T10:00:00',
      direction: 'in',
      quantity: 50,
      unitCost: 10000,
      source: 'invoice',
      documentNo: 'P1',
    },
    {
      id: 'out-2',
      productId: 'el-kremi',
      date: '2026-09-17',
      createdAt: '2026-09-17T12:00:00',
      direction: 'out',
      quantity: 2,
      unitCost: 0,
      source: 'invoice',
      documentNo: 'S1',
      cogsKind: 'sale',
    },
    {
      id: 'in-10',
      productId: 'el-kremi',
      date: '2026-09-18',
      createdAt: '2026-09-18T09:00:00',
      direction: 'in',
      quantity: 10,
      unitCost: 8000,
      source: 'invoice',
      documentNo: 'P2',
    },
  ];
}

describe('applyFifoLayers — stok maliyeti', () => {
  it('kart alış 10.000 ile 58×10.000=580.000 yapmaz; FIFO kalan 48×10k+10×8k=560.000', () => {
    const { byProductId, todayCogs } = applyFifoLayers(elKremiMoves(), {
      todayKey: '2026-09-17',
      onHandByProductId: new Map([['el-kremi', 58]]),
    });
    const row = byProductId.get('el-kremi')!;
    expect(row.quantity).toBe(58);
    expect(row.layeredCost).toBe(560000);
    expect(row.avgUnitCost).toBeCloseTo(560000 / 58, 6);
    expect(todayCogs).toBe(20000);
    expect(row.layeredCost).not.toBe(580000);
    expect(row.layeredCost).not.toBe(600000);
  });

  it('satış yokken 50×10k + 10×8k = 580.000 (60 adet); kart listedeki 10k×60=600.000 değil', () => {
    const { byProductId } = applyFifoLayers(
      elKremiMoves().filter((m) => m.direction === 'in'),
      { onHandByProductId: new Map([['el-kremi', 60]]) },
    );
    const row = byProductId.get('el-kremi')!;
    expect(row.layeredCost).toBe(580000);
    expect(row.avgUnitCost).toBeCloseTo(580000 / 60, 6);
  });

  it('satış katman COGS kullanır; ciroyu kâr saymaz', () => {
    const remaining = applyFifoLayers(elKremiMoves().filter((m) => m.id === 'in-50')).byProductId.get(
      'el-kremi',
    )!.layers;
    const sold = consumeFifoForQuantity(remaining, 2);
    expect(sold.totalCost).toBe(20000);
    expect(sold.unitCost).toBe(10000);
    expect(201000 - sold.totalCost).toBe(181000);
  });

  it('dönem SMM (09/01–09/18): satış 2 × 10.000 = 20.000; ciro boş kalmaz', () => {
    const { periodCogs, periodCogsByProductId } = applyFifoLayers(
      elKremiMoves().map((m) => (m.direction === 'out' ? { ...m, cogsKind: 'sale' as const } : m)),
      { cogsFromKey: '2026-09-01', cogsToKey: '2026-09-18' },
    );
    expect(periodCogs).toBe(20000);
    expect(periodCogsByProductId.get('el-kremi')).toBe(20000);
  });
});

describe('dedupeLayerMovements', () => {
  it('aynı belge+miktar için fiş satırını fatura lehine atar', () => {
    const invoice: LayerMovement = {
      id: 'inv-1',
      productId: 'p1',
      date: '2026-09-18',
      direction: 'in',
      quantity: 50,
      unitCost: 10000,
      source: 'invoice',
      documentNo: 'A-1',
    };
    const slip: LayerMovement = {
      id: 'slip-1',
      productId: 'p1',
      date: '2026-09-18',
      direction: 'in',
      quantity: 50,
      unitCost: 10000,
      source: 'slip',
      documentNo: 'A-1',
    };
    const out = dedupeLayerMovements([slip, invoice]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('invoice');
  });
});

describe('buildCostProfitRows — kâr = satış − SMM', () => {
  it('EL KREMİ: 2 satış, 201.000 gelir, katman SMM 20.000 → kâr 181.000', () => {
    const rows = buildCostProfitRows(
      [
        {
          productId: 'el-kremi',
          productCode: 'ELK',
          productName: 'EL KREMI',
          quantity: 2,
          revenue: 201000,
          fallbackCogs: 0,
        },
      ],
      new Map([['el-kremi', 20000]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cogs).toBe(20000);
    expect(rows[0].profit).toBe(181000);
    expect(rows[0].costSource).toBe('fifo_layers');
    expect(rows[0].revenue).toBe(201000);
  });

  it('katman yoksa geliri düşmez; SMM 0 ve kaynak none', () => {
    const rows = buildCostProfitRows(
      [
        {
          productId: 'el-kremi',
          productCode: 'ELK',
          productName: 'EL KREMI',
          quantity: 2,
          revenue: 201000,
          fallbackCogs: 0,
        },
      ],
      new Map(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cogs).toBe(0);
    expect(rows[0].profit).toBe(201000);
    expect(rows[0].costSource).toBe('none');
    expect(rows[0].lineKind).toBe('product');
  });

  it('hizmet: FIFO yok sayılır; kart/reçete fallback SMM kullanılır', () => {
    const rows = buildCostProfitRows(
      [
        {
          productId: 'svc-sac',
          productCode: 'SAC',
          productName: 'SAC BOYAMA',
          quantity: 1,
          revenue: 50000,
          fallbackCogs: 12000,
          lineKind: 'service',
        },
      ],
      new Map([['svc-sac', 999999]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cogs).toBe(12000);
    expect(rows[0].profit).toBe(38000);
    expect(rows[0].costSource).toBe('service_cost');
    expect(rows[0].lineKind).toBe('service');
  });

  it('hizmet maliyet yoksa SMM 0; gelir bozulmaz', () => {
    const rows = buildCostProfitRows(
      [
        {
          productId: 'svc-kas',
          productCode: 'KAS',
          productName: 'KAS ALMA',
          quantity: 2,
          revenue: 10000,
          fallbackCogs: 0,
          lineKind: 'service',
        },
      ],
      new Map(),
    );
    expect(rows[0].cogs).toBe(0);
    expect(rows[0].profit).toBe(10000);
    expect(rows[0].costSource).toBe('none');
  });
});
