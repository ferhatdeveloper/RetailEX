/**
 * Kasap üretim servisi — iş emri tamamlama, stok, parti, maliyet
 * Stok yalnızca stockMovementAPI.create ile güncellenir (çift yazım yok).
 */

import {
  butcherProductionAPI,
  type AnimalType,
  type ButcherOrderOutput,
} from './api/butcherProductionAPI';
import { productAPI } from './api/products';
import { invoicesAPI } from './api/invoices';
import { ERP_SETTINGS } from './postgres';
import { stockMovementAPI, STOCK_SLIP_TRCODES } from './stockMovementAPI';
import { createLot } from './api/lots';
import {
  previewButcherCost,
  type ButcherCostMethod,
  type ButcherOutputDraft,
} from '../utils/butcherCost';
import type { Invoice } from '../core/types';

export type CompleteButcherInput = {
  recipeId?: string | null;
  animalType: AnimalType;
  inputProductId: string;
  inputQtyKg: number;
  inputUnitCost: number;
  warehouseId?: string | null;
  wasteProductId?: string | null;
  lotNo?: string | null;
  costMethod: ButcherCostMethod;
  outputs: ButcherOutputDraft[];
  note?: string;
  /** draft | open kaydet; completed = stok + kapat */
  status?: 'draft' | 'open' | 'completed';
  existingOrderId?: string;
};

function nextLotNo(): string {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `LOT-${y}${m}${day}-${String(Date.now()).slice(-5)}`;
}

export class ButcherProductionService {
  static preview(input: CompleteButcherInput) {
    return previewButcherCost(
      input.inputQtyKg,
      input.inputUnitCost,
      input.outputs,
      input.costMethod,
    );
  }

  static async saveDraft(input: CompleteButcherInput): Promise<{ ok: boolean; orderId?: string; error?: string }> {
    return this.persist(input, input.status === 'open' ? 'open' : 'draft');
  }

  static async complete(input: CompleteButcherInput): Promise<{ ok: boolean; orderId?: string; error?: string }> {
    return this.persist({ ...input, status: 'completed' }, 'completed');
  }

  private static async persist(
    input: CompleteButcherInput,
    status: 'draft' | 'open' | 'completed',
  ): Promise<{ ok: boolean; orderId?: string; error?: string }> {
    try {
      const preview = previewButcherCost(
        input.inputQtyKg,
        input.inputUnitCost,
        input.outputs,
        input.costMethod,
      );

      if (!input.inputProductId) {
        return { ok: false, error: 'Girdi ürünü seçin.' };
      }
      if (preview.outputQtyKg <= 0 && status === 'completed') {
        return { ok: false, error: 'En az bir çıktı satırı girin.' };
      }
      if (!preview.isBalanced) {
        return {
          ok: false,
          error: `Çıktı toplamı (${preview.outputQtyKg} kg) girdi ağırlığını (${preview.inputQtyKg} kg) aşıyor.`,
        };
      }
      if (input.costMethod === 'manual' && status === 'completed') {
        const absDiff = Math.abs(preview.costDiff);
        if (absDiff > 1) {
          return {
            ok: false,
            error: `Manuel maliyet toplamı girdi maliyetinden sapıyor (fark: ${preview.costDiff.toFixed(2)} TL).`,
          };
        }
      }

      const inputProduct = await productAPI.getById(input.inputProductId);
      if (!inputProduct) {
        return { ok: false, error: 'Girdi ürünü bulunamadı.' };
      }

      if (status === 'completed') {
        if ((Number(inputProduct.stock) || 0) < preview.inputQtyKg - 0.001) {
          return {
            ok: false,
            error: `Yetersiz stok. Mevcut: ${inputProduct.stock} ${inputProduct.unit || 'kg'}`,
          };
        }
      }

      const lotNo = (input.lotNo || '').trim() || (status === 'completed' ? nextLotNo() : null);
      const orderNo = `KU-${Date.now()}`;

      const outputs: ButcherOrderOutput[] = preview.lines.map((line, idx) => ({
        productId: line.productId,
        outputKg: line.outputKg,
        coefficient: line.coefficient,
        salePrice: line.salePrice,
        unitCost: line.unitCost,
        totalCost: line.totalCost,
        costSharePercent: line.costSharePercent,
        sortOrder: idx,
      }));

      if (status === 'completed') {
        await stockMovementAPI.create(
          {
            trcode: STOCK_SLIP_TRCODES.CONSUMPTION,
            movement_type: 'out',
            warehouse_id: input.warehouseId || undefined,
            description: `${orderNo} kasap üretim — girdi`,
            document_no: orderNo,
          },
          [
            {
              product_id: input.inputProductId,
              quantity: preview.inputQtyKg,
              unit_price: preview.inputUnitCost,
              cost_price: preview.inputUnitCost,
              notes: lotNo ? `Parti: ${lotNo}` : 'Kasap üretim girdisi',
            },
          ],
        );

        for (const line of preview.lines) {
          const prod = await productAPI.getById(line.productId);
          if (!prod) continue;
          await stockMovementAPI.create(
            {
              trcode: STOCK_SLIP_TRCODES.PRODUCTION_IN,
              movement_type: 'in',
              warehouse_id: input.warehouseId || undefined,
              description: `${orderNo} üretim — ${prod.name}`,
              document_no: orderNo,
            },
            [
              {
                product_id: prod.id,
                quantity: line.outputKg,
                unit_price: line.unitCost,
                cost_price: line.unitCost,
                notes: lotNo ? `Parti: ${lotNo}` : 'Kasap üretim çıktısı',
              },
            ],
          );
          try {
            await productAPI.update(prod.id, { cost: line.unitCost });
          } catch {
            /* maliyet güncellemesi opsiyonel */
          }
          if (lotNo) {
            try {
              await createLot({
                product_id: prod.id,
                lot_no: lotNo,
                production_date: new Date().toISOString().slice(0, 10),
                quantity: line.outputKg,
              });
            } catch (e) {
              console.warn('[ButcherService] lot create skipped:', e);
            }
          }
        }

        if (preview.wasteQtyKg > 0.001 && input.wasteProductId) {
          await stockMovementAPI.create(
            {
              trcode: STOCK_SLIP_TRCODES.PRODUCTION_IN,
              movement_type: 'in',
              warehouse_id: input.warehouseId || undefined,
              description: `${orderNo} fire stok kartı`,
              document_no: orderNo,
            },
            [
              {
                product_id: input.wasteProductId,
                quantity: preview.wasteQtyKg,
                unit_price: 0,
                cost_price: 0,
                notes: lotNo ? `Fire parti: ${lotNo}` : 'Üretim firesi',
              },
            ],
          );
        }
      }

      const orderId = await butcherProductionAPI.saveOrder({
        id: input.existingOrderId,
        orderNo,
        recipeId: input.recipeId ?? null,
        animalType: input.animalType,
        inputProductId: input.inputProductId,
        inputQtyKg: preview.inputQtyKg,
        inputUnitCost: preview.inputUnitCost,
        inputTotalCost: preview.inputTotalCost,
        warehouseId: input.warehouseId ?? null,
        wasteProductId: input.wasteProductId ?? null,
        lotNo,
        costMethod: input.costMethod,
        outputQtyKg: preview.outputQtyKg,
        wasteQtyKg: preview.wasteQtyKg,
        wastePercent: preview.wastePercent,
        wasteCostAllocated: preview.wasteCostAllocated,
        costPerKgSalable: preview.costPerKgSalable,
        status,
        note: input.note,
        outputs,
      });

      return { ok: true, orderId };
    } catch (e: unknown) {
      console.error('[ButcherProductionService] persist failed:', e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Üretim fişi girdi satırından alış faturası oluşturur ve fişe bağlar.
   * Stok üretimde işlendiği için skipProductStockUpdate=true (çift stok yok).
   */
  static async createPurchaseInvoiceFromOrder(params: {
    orderId: string;
    supplierId: string;
    supplierName: string;
    supplierCode?: string;
    firmaName?: string;
    donemName?: string;
  }): Promise<{
    ok: boolean;
    invoiceId?: string;
    invoiceNo?: string;
    alreadyLinked?: boolean;
    error?: string;
  }> {
    try {
      const order = await butcherProductionAPI.getOrderById(params.orderId);
      if (!order?.id) {
        return { ok: false, error: 'Üretim fişi bulunamadı.' };
      }
      if (order.purchaseInvoiceId) {
        return {
          ok: true,
          alreadyLinked: true,
          invoiceId: order.purchaseInvoiceId,
          invoiceNo: order.purchaseInvoiceNo || undefined,
        };
      }
      if (!order.inputProductId || order.inputQtyKg <= 0) {
        return { ok: false, error: 'Girdi ürünü ve miktar gerekli.' };
      }
      if (!params.supplierId || !params.supplierName.trim()) {
        return { ok: false, error: 'Tedarikçi seçin.' };
      }

      const product = await productAPI.getById(order.inputProductId);
      if (!product) {
        return { ok: false, error: 'Girdi ürünü bulunamadı.' };
      }

      const qty = Number(order.inputQtyKg) || 0;
      const unitCost = Number(order.inputUnitCost) || 0;
      const total = Number(order.inputTotalCost) || qty * unitCost;
      const today = new Date().toISOString().slice(0, 10);
      const invoiceNo = `${today.replace(/-/g, '')}${Math.floor(Math.random() * 1000000)}`;
      const firmNr = String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0');
      const periodNr = String(ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0');
      const unit = String((product as { unit?: string }).unit || 'kg').trim() || 'kg';
      const code = String((product as { code?: string }).code || product.id).trim();

      const invoice: Invoice = {
        invoice_no: invoiceNo,
        invoice_date: today,
        invoice_type: 1,
        invoice_category: 'Alis',
        supplier_id: params.supplierId,
        supplier_name: params.supplierName.trim(),
        customer_id: params.supplierId,
        customer_name: params.supplierName.trim(),
        subtotal: total,
        discount: 0,
        tax: 0,
        total_amount: total,
        total_cost: total,
        payment_method: 'Veresiye',
        firma_id: firmNr,
        firma_name: params.firmaName || firmNr,
        donem_id: periodNr,
        donem_name: params.donemName || periodNr,
        notes: `Kaynak: Kasap üretim fişi ${order.orderNo} (id: ${order.id}). Stok üretim fişi ile işlendi; bu belge stok artırmaz.`,
        document_no: order.orderNo,
        header_fields: order.warehouseId
          ? { warehouse: String(order.warehouseId) }
          : undefined,
        items: [
          {
            type: 'Malzeme',
            productId: order.inputProductId,
            code,
            description: order.inputProductName || (product as { name?: string }).name || code,
            quantity: qty,
            unit,
            unitPrice: unitCost,
            unitCost,
            totalCost: total,
            netAmount: total,
            total,
            discountPercent: 0,
            discount: 0,
          },
        ],
      };

      const saved = await invoicesAPI.create(invoice, { skipProductStockUpdate: true });
      if (!saved?.id) {
        return { ok: false, error: 'Alış faturası oluşturulamadı.' };
      }

      const linked = await butcherProductionAPI.linkPurchaseInvoice({
        orderId: order.id,
        invoiceId: String(saved.id),
        invoiceNo: saved.invoice_no || invoiceNo,
        supplierId: params.supplierId,
        supplierName: params.supplierName.trim(),
      });

      if (!linked) {
        const fresh = await butcherProductionAPI.getOrderById(order.id);
        if (fresh?.purchaseInvoiceId) {
          return {
            ok: true,
            alreadyLinked: true,
            invoiceId: fresh.purchaseInvoiceId,
            invoiceNo: fresh.purchaseInvoiceNo || undefined,
          };
        }
      }

      return {
        ok: true,
        invoiceId: String(saved.id),
        invoiceNo: saved.invoice_no || invoiceNo,
      };
    } catch (e: unknown) {
      console.error('[ButcherProductionService] createPurchaseInvoiceFromOrder failed:', e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
