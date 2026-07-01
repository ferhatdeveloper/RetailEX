/**
 * Karkas parçalama — stok hareketleri ve maliyet güncelleme
 */

import { disassemblyAPI, type DisassemblyOrderOutput, type AnimalType } from './api/disassemblyAPI';
import { productAPI } from './api/products';
import { stockMovementAPI, STOCK_SLIP_TRCODES } from './stockMovementAPI';
import { previewDisassemblyCost, type DisassemblyOutputDraft } from '../utils/disassemblyCost';

export type CompleteDisassemblyInput = {
    animalType: AnimalType;
    templateId?: string | null;
    inputProductId: string;
    inputQtyKg: number;
    inputUnitCost: number;
    outputs: DisassemblyOutputDraft[];
    note?: string;
};

export class DisassemblyService {
    static preview(input: CompleteDisassemblyInput) {
        return previewDisassemblyCost(input.inputQtyKg, input.inputUnitCost, input.outputs);
    }

    static async complete(input: CompleteDisassemblyInput): Promise<{ ok: boolean; orderId?: string; error?: string }> {
        try {
            const preview = previewDisassemblyCost(input.inputQtyKg, input.inputUnitCost, input.outputs);
            if (!preview.isBalanced) {
                return { ok: false, error: `Çıktı toplamı (${preview.outputQtyKg} kg) karkas ağırlığını (${preview.inputQtyKg} kg) aşıyor.` };
            }
            if (preview.outputQtyKg <= 0) {
                return { ok: false, error: 'En az bir parça çıktısı girin.' };
            }
            if (!input.inputProductId) {
                return { ok: false, error: 'Karkas ürünü seçin.' };
            }

            const inputProduct = await productAPI.getById(input.inputProductId);
            if (!inputProduct) {
                return { ok: false, error: 'Karkas ürünü bulunamadı.' };
            }
            if ((Number(inputProduct.stock) || 0) < preview.inputQtyKg - 0.001) {
                return { ok: false, error: `Yetersiz karkas stoku. Mevcut: ${inputProduct.stock} ${inputProduct.unit || 'kg'}` };
            }

            const orderNo = `KP-${Date.now()}`;
            const outputs: DisassemblyOrderOutput[] = preview.lines.map((line, idx) => ({
                productId: line.productId,
                outputKg: line.outputKg,
                unitCost: line.unitCost,
                totalCost: line.totalCost,
                costSharePercent: line.costSharePercent,
                sortOrder: idx,
            }));

            await productAPI.updateStock(inputProduct.id, (Number(inputProduct.stock) || 0) - preview.inputQtyKg);
            await stockMovementAPI.create(
                {
                    trcode: STOCK_SLIP_TRCODES.CONSUMPTION,
                    movement_type: 'out',
                    description: `${orderNo} karkas parçalama — girdi`,
                    document_no: orderNo,
                },
                [{
                    product_id: inputProduct.id,
                    quantity: preview.inputQtyKg,
                    unit_price: preview.inputUnitCost,
                    notes: 'Karkas parçalama girdisi',
                }],
            );

            for (const line of preview.lines) {
                const prod = await productAPI.getById(line.productId);
                if (!prod) continue;
                const newStock = (Number(prod.stock) || 0) + line.outputKg;
                await productAPI.updateStock(prod.id, newStock);
                await productAPI.update(prod.id, { cost: line.unitCost });
                await stockMovementAPI.create(
                    {
                        trcode: STOCK_SLIP_TRCODES.PRODUCTION_IN,
                        movement_type: 'in',
                        description: `${orderNo} parçalama — ${prod.name}`,
                        document_no: orderNo,
                    },
                    [{
                        product_id: prod.id,
                        quantity: line.outputKg,
                        unit_price: line.unitCost,
                        notes: 'Fire maliyeti dahil birim maliyet',
                    }],
                );
            }

            if (preview.wasteQtyKg > 0.001) {
                await stockMovementAPI.create(
                    {
                        trcode: STOCK_SLIP_TRCODES.WASTAGE,
                        movement_type: 'out',
                        description: `${orderNo} parçalama fire — ${preview.wasteQtyKg} kg (maliyet parçalara yansıtıldı)`,
                        document_no: orderNo,
                    },
                    [{
                        product_id: inputProduct.id,
                        quantity: preview.wasteQtyKg,
                        unit_price: 0,
                        notes: 'Parçalama fire kaydı',
                    }],
                );
            }

            const orderId = await disassemblyAPI.saveOrder({
                templateId: input.templateId ?? null,
                animalType: input.animalType,
                inputProductId: input.inputProductId,
                inputQtyKg: preview.inputQtyKg,
                inputUnitCost: preview.inputUnitCost,
                inputTotalCost: preview.inputTotalCost,
                outputQtyKg: preview.outputQtyKg,
                wasteQtyKg: preview.wasteQtyKg,
                wasteCostAllocated: preview.wasteCostAllocated,
                costPerKgSalable: preview.costPerKgSalable,
                status: 'completed',
                note: input.note,
                outputs,
            });

            return { ok: true, orderId };
        } catch (e: unknown) {
            console.error('[DisassemblyService] complete failed:', e);
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }
}
