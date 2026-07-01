/**
 * Karkas parçalama — fire maliyetini satılabilir çıktılara dağıtır.
 * Tüm girdi maliyeti (fire dahil) satılabilir kg oranında ürünlere yansır.
 */

export type DisassemblyOutputDraft = {
    productId: string;
    productName?: string;
    outputKg: number;
};

export type DisassemblyCostLine = DisassemblyOutputDraft & {
    unitCost: number;
    totalCost: number;
    costSharePercent: number;
};

export type DisassemblyCostPreview = {
    inputQtyKg: number;
    inputUnitCost: number;
    inputTotalCost: number;
    outputQtyKg: number;
    wasteQtyKg: number;
    wasteCostAllocated: number;
    costPerKgSalable: number;
    lines: DisassemblyCostLine[];
    isBalanced: boolean;
    overKg: number;
};

export function previewDisassemblyCost(
    inputQtyKg: number,
    inputUnitCost: number,
    outputs: DisassemblyOutputDraft[],
): DisassemblyCostPreview {
    const gross = Math.max(0, Number(inputQtyKg) || 0);
    const unitCost = Math.max(0, Number(inputUnitCost) || 0);
    const totalInputCost = gross * unitCost;

    const validOutputs = outputs.filter((o) => o.productId && (Number(o.outputKg) || 0) > 0);
    const outputQtyKg = validOutputs.reduce((s, o) => s + (Number(o.outputKg) || 0), 0);
    const wasteQtyKg = Math.max(0, gross - outputQtyKg);
    const overKg = Math.max(0, outputQtyKg - gross);
    const wasteCostAllocated = outputQtyKg > 0 ? totalInputCost : 0;
    const costPerKgSalable = outputQtyKg > 0 ? totalInputCost / outputQtyKg : 0;

    const lines: DisassemblyCostLine[] = validOutputs.map((o) => {
        const kg = Number(o.outputKg) || 0;
        const totalCost = totalInputCost * (kg / outputQtyKg);
        const share = outputQtyKg > 0 ? (kg / outputQtyKg) * 100 : 0;
        return {
            ...o,
            outputKg: kg,
            totalCost: Math.round(totalCost * 100) / 100,
            unitCost: kg > 0 ? Math.round((totalCost / kg) * 10000) / 10000 : 0,
            costSharePercent: Math.round(share * 10) / 10,
        };
    });

    return {
        inputQtyKg: gross,
        inputUnitCost: unitCost,
        inputTotalCost: Math.round(totalInputCost * 100) / 100,
        outputQtyKg: Math.round(outputQtyKg * 1000) / 1000,
        wasteQtyKg: Math.round(wasteQtyKg * 1000) / 1000,
        wasteCostAllocated: Math.round(wasteCostAllocated * 100) / 100,
        costPerKgSalable: Math.round(costPerKgSalable * 10000) / 10000,
        lines,
        isBalanced: overKg <= 0.001,
        overKg: Math.round(overKg * 1000) / 1000,
    };
}
