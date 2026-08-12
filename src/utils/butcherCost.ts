/**
 * Kasap üretim maliyet dağıtımı.
 * Fire = girdi kg − çıktı kg; fire maliyeti seçilen yönteme göre satılabilir parçalara yansır.
 */

export type ButcherCostMethod = 'by_weight' | 'by_sale_price' | 'by_coefficient' | 'manual';

export type ButcherOutputDraft = {
  productId: string;
  productName?: string;
  outputKg: number;
  /** by_coefficient */
  coefficient?: number;
  /** by_sale_price — birim satış fiyatı */
  salePrice?: number;
  /** manual — kullanıcı birim maliyeti */
  manualUnitCost?: number;
};

export type ButcherCostLine = ButcherOutputDraft & {
  outputKg: number;
  coefficient: number;
  salePrice: number;
  unitCost: number;
  totalCost: number;
  costSharePercent: number;
};

export type ButcherCostPreview = {
  costMethod: ButcherCostMethod;
  inputQtyKg: number;
  inputUnitCost: number;
  inputTotalCost: number;
  outputQtyKg: number;
  wasteQtyKg: number;
  wastePercent: number;
  wasteCostAllocated: number;
  costPerKgSalable: number;
  lines: ButcherCostLine[];
  isBalanced: boolean;
  overKg: number;
  costSum: number;
  costDiff: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function weightOf(line: ButcherOutputDraft, method: ButcherCostMethod): number {
  const kg = Math.max(0, Number(line.outputKg) || 0);
  if (kg <= 0) return 0;
  if (method === 'by_sale_price') {
    const sp = Math.max(0, Number(line.salePrice) || 0);
    return kg * sp;
  }
  if (method === 'by_coefficient') {
    const c = Math.max(0, Number(line.coefficient) || 0);
    return kg * (c > 0 ? c : 1);
  }
  return kg;
}

export function previewButcherCost(
  inputQtyKg: number,
  inputUnitCost: number,
  outputs: ButcherOutputDraft[],
  costMethod: ButcherCostMethod = 'by_weight',
): ButcherCostPreview {
  const gross = Math.max(0, Number(inputQtyKg) || 0);
  const unitCost = Math.max(0, Number(inputUnitCost) || 0);
  const totalInputCost = gross * unitCost;

  const validOutputs = outputs.filter((o) => o.productId && (Number(o.outputKg) || 0) > 0);
  const outputQtyKg = validOutputs.reduce((s, o) => s + (Number(o.outputKg) || 0), 0);
  const wasteQtyKg = Math.max(0, gross - outputQtyKg);
  const overKg = Math.max(0, outputQtyKg - gross);
  const wastePercent = gross > 0 ? (wasteQtyKg / gross) * 100 : 0;

  let lines: ButcherCostLine[] = [];

  if (costMethod === 'manual') {
    lines = validOutputs.map((o) => {
      const kg = Number(o.outputKg) || 0;
      const uc = Math.max(0, Number(o.manualUnitCost) || 0);
      const totalCost = kg * uc;
      return {
        ...o,
        outputKg: kg,
        coefficient: Number(o.coefficient) || 1,
        salePrice: Number(o.salePrice) || 0,
        unitCost: round4(uc),
        totalCost: round2(totalCost),
        costSharePercent: 0,
      };
    });
    const costSum = lines.reduce((s, l) => s + l.totalCost, 0);
    lines = lines.map((l) => ({
      ...l,
      costSharePercent: costSum > 0 ? round3((l.totalCost / costSum) * 100) : 0,
    }));
  } else {
    const weights = validOutputs.map((o) => weightOf(o, costMethod));
    const weightSum = weights.reduce((s, w) => s + w, 0);

    lines = validOutputs.map((o, idx) => {
      const kg = Number(o.outputKg) || 0;
      const w = weights[idx];
      const share = weightSum > 0 ? w / weightSum : 0;
      const totalCost = totalInputCost * share;
      return {
        ...o,
        outputKg: kg,
        coefficient: Number(o.coefficient) || 1,
        salePrice: Number(o.salePrice) || 0,
        unitCost: kg > 0 ? round4(totalCost / kg) : 0,
        totalCost: round2(totalCost),
        costSharePercent: round3(share * 100),
      };
    });
  }

  const costSum = round2(lines.reduce((s, l) => s + l.totalCost, 0));
  const costDiff = round2(totalInputCost - costSum);
  const wasteCostAllocated = costMethod === 'manual' ? Math.max(0, costDiff) : round2(totalInputCost);
  const costPerKgSalable = outputQtyKg > 0 ? round4(totalInputCost / outputQtyKg) : 0;

  return {
    costMethod,
    inputQtyKg: gross,
    inputUnitCost: unitCost,
    inputTotalCost: round2(totalInputCost),
    outputQtyKg: round3(outputQtyKg),
    wasteQtyKg: round3(wasteQtyKg),
    wastePercent: round3(wastePercent),
    wasteCostAllocated,
    costPerKgSalable,
    lines,
    isBalanced: overKg <= 0.001,
    overKg: round3(overKg),
    costSum,
    costDiff,
  };
}
