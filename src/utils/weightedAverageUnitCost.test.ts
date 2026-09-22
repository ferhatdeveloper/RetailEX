import { describe, expect, it } from 'vitest';
import {
  emptyWeightedAvg,
  addWeightedAvgLine,
  finalizeWeightedAvgUnitCost,
} from './weightedAverageUnitCost';

describe('weightedAverageUnitCost', () => {
  it('örnek: 100×100 + 150×120 = 112', () => {
    const acc = emptyWeightedAvg();
    addWeightedAvgLine(acc, { quantity: 100, unitCost: 100, amount: 10000 });
    addWeightedAvgLine(acc, { quantity: 150, unitCost: 120, amount: 18000 });
    expect(finalizeWeightedAvgUnitCost(acc)).toBeCloseTo(112, 6);
  });

  it('alış iadesi tutar ve miktardan düşer', () => {
    const acc = emptyWeightedAvg();
    addWeightedAvgLine(acc, { quantity: 100, unitCost: 100, amount: 10000 });
    addWeightedAvgLine(acc, { quantity: 20, unitCost: 100, amount: 2000, isReturn: true });
    // 8000 / 80 = 100
    expect(finalizeWeightedAvgUnitCost(acc)).toBeCloseTo(100, 6);
  });
});
