/**
 * Kasap üretim servisi — iş emri tamamlama, stok, parti, maliyet
 * Stok yalnızca stockMovementAPI.create ile güncellenir (çift yazım yok).
 *
 * Tamamlama sırası (kısmi stok yazımını önlemek için):
 * 1) Tüm ürünler ön doğrulama
 * 2) Çıktı girişleri → girdi sarf → fire
 * 3) Hata olursa uygulanan hareketler ters kayıtla geri alınır
 * 4) Fiş kaydı (completed)
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
  /**
   * true: yetersiz girdi stoğunda tamamlamaya izin (UI onay veya firma ayarı sonrası).
   * Servis ayrıca firma ayarını da kontrol eder.
   */
  allowInsufficientStock?: boolean;
};

export type ButcherStockLineSummary = {
  productId: string;
  productName: string;
  productCode?: string;
  materialType?: string;
  qtyKg: number;
  direction: 'in' | 'out';
  stockBefore: number;
  stockAfter: number;
  unitCost: number;
};

export type ButcherCompleteResult = {
  ok: boolean;
  orderId?: string;
  orderNo?: string;
  error?: string;
  stockSummary?: ButcherStockLineSummary[];
};

type AppliedStockMove = {
  productId: string;
  quantity: number;
  /** Uygulanan hareket yönü — geri alırken tersi yazılır */
  movementType: 'in' | 'out';
  unitPrice: number;
  costPrice: number;
  documentNo: string;
  description: string;
  warehouseId?: string | null;
};

function nextLotNo(): string {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `LOT-${y}${m}${day}-${String(Date.now()).slice(-5)}`;
}

/** stock_movements.document_no UNIQUE — her hareket için üretim no + sıra etiketi */
function stockDocNo(orderNo: string, seq: number, tag: string): string {
  return `${orderNo}-${tag}${String(seq).padStart(2, '0')}`.slice(0, 50);
}

function stockOf(product: { stock?: number | string | null } | null | undefined): number {
  return Number(product?.stock) || 0;
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

  static async saveDraft(input: CompleteButcherInput): Promise<ButcherCompleteResult> {
    return this.persist(input, input.status === 'open' ? 'open' : 'draft');
  }

  static async complete(input: CompleteButcherInput): Promise<ButcherCompleteResult> {
    return this.persist({ ...input, status: 'completed' }, 'completed');
  }

  private static async applyStockMove(
    applied: AppliedStockMove[],
    params: {
      orderNo: string;
      movSeq: number;
      tag: string;
      movementType: 'in' | 'out';
      trcode: number;
      warehouseId?: string | null;
      description: string;
      productId: string;
      quantity: number;
      unitPrice: number;
      costPrice: number;
      notes: string;
    },
  ): Promise<number> {
    const documentNo = stockDocNo(params.orderNo, params.movSeq, params.tag);
    await stockMovementAPI.create(
      {
        trcode: params.trcode,
        movement_type: params.movementType,
        warehouse_id: params.warehouseId || undefined,
        description: params.description,
        document_no: documentNo,
      },
      [
        {
          product_id: params.productId,
          quantity: params.quantity,
          unit_price: params.unitPrice,
          cost_price: params.costPrice,
          notes: params.notes,
        },
      ],
    );
    applied.push({
      productId: params.productId,
      quantity: params.quantity,
      movementType: params.movementType,
      unitPrice: params.unitPrice,
      costPrice: params.costPrice,
      documentNo,
      description: params.description,
      warehouseId: params.warehouseId,
    });
    return params.movSeq + 1;
  }

  /** Kısmi stok yazımını geri al (ters hareket) */
  private static async compensateStock(applied: AppliedStockMove[], orderNo: string): Promise<void> {
    for (let i = applied.length - 1; i >= 0; i--) {
      const m = applied[i];
      const reverseType: 'in' | 'out' = m.movementType === 'in' ? 'out' : 'in';
      try {
        await stockMovementAPI.create(
          {
            trcode:
              reverseType === 'in'
                ? STOCK_SLIP_TRCODES.PRODUCTION_IN
                : STOCK_SLIP_TRCODES.CONSUMPTION,
            movement_type: reverseType,
            warehouse_id: m.warehouseId || undefined,
            description: `${orderNo} geri alma — ${m.description}`.slice(0, 500),
            document_no: `${m.documentNo}-R`.slice(0, 50),
          },
          [
            {
              product_id: m.productId,
              quantity: m.quantity,
              unit_price: m.unitPrice,
              cost_price: m.costPrice,
              notes: 'Kasap üretim geri alma (kısmi hata)',
            },
          ],
        );
      } catch (e) {
        console.error('[ButcherProductionService] compensate failed:', m.documentNo, e);
      }
    }
  }

  private static async persist(
    input: CompleteButcherInput,
    status: 'draft' | 'open' | 'completed',
  ): Promise<ButcherCompleteResult> {
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
        const available = stockOf(inputProduct);
        if (available < preview.inputQtyKg - 0.001) {
          let firmAllows = false;
          try {
            const settings = await butcherProductionAPI.getSettings();
            firmAllows = settings.allowCompleteWithoutStock !== false;
          } catch {
            firmAllows = true;
          }
          if (!input.allowInsufficientStock && !firmAllows) {
            return {
              ok: false,
              error: `Yetersiz stok. Mevcut: ${available} ${inputProduct.unit || 'kg'}`,
            };
          }
        }
      }

      /** Tamamlamadan önce tüm çıktı ürünlerini doğrula — sessiz atlama yok */
      type ResolvedOut = {
        line: (typeof preview.lines)[number];
        product: NonNullable<Awaited<ReturnType<typeof productAPI.getById>>>;
        stockBefore: number;
      };
      const resolvedOutputs: ResolvedOut[] = [];
      if (status === 'completed') {
        for (const line of preview.lines) {
          if (!line.productId) {
            return { ok: false, error: 'Çıktı satırında ürün seçilmemiş.' };
          }
          const prod = await productAPI.getById(line.productId);
          if (!prod) {
            return {
              ok: false,
              error: `Çıktı ürünü bulunamadı (id: ${line.productId}). Stok yazılmadı.`,
            };
          }
          resolvedOutputs.push({
            line,
            product: prod,
            stockBefore: stockOf(prod),
          });
        }
        if (preview.wasteQtyKg > 0.001 && input.wasteProductId) {
          const wasteProd = await productAPI.getById(input.wasteProductId);
          if (!wasteProd) {
            return { ok: false, error: 'Fire stok kartı bulunamadı. Stok yazılmadı.' };
          }
        }
      }

      const lotNo = (input.lotNo || '').trim() || (status === 'completed' ? nextLotNo() : null);
      const orderNo = `KU-${Date.now()}`;
      const warehouseId = input.warehouseId ?? null;

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

      const stockSummary: ButcherStockLineSummary[] = [];
      const applied: AppliedStockMove[] = [];

      if (status === 'completed') {
        let movSeq = 1;
        const notesLot = lotNo ? `Parti: ${lotNo}` : undefined;

        try {
          // 1) Önce çıktılar — girdi düşmeden parçalar stoğa yazılsın
          for (const { line, product, stockBefore } of resolvedOutputs) {
            movSeq = await this.applyStockMove(applied, {
              orderNo,
              movSeq,
              tag: 'C',
              movementType: 'in',
              trcode: STOCK_SLIP_TRCODES.PRODUCTION_IN,
              warehouseId,
              description: `${orderNo} üretim — ${product.name}`,
              productId: product.id,
              quantity: line.outputKg,
              unitPrice: line.unitCost,
              costPrice: line.unitCost,
              notes: notesLot || 'Kasap üretim çıktısı',
            });
            try {
              await productAPI.update(product.id, { cost: line.unitCost });
            } catch {
              /* maliyet güncellemesi opsiyonel */
            }
            if (lotNo) {
              try {
                await createLot({
                  product_id: product.id,
                  lot_no: lotNo,
                  production_date: new Date().toISOString().slice(0, 10),
                  quantity: line.outputKg,
                });
              } catch (e) {
                console.warn('[ButcherService] lot create skipped:', e);
              }
            }
            stockSummary.push({
              productId: product.id,
              productName: product.name,
              productCode: (product as { code?: string }).code,
              materialType: (product as { materialType?: string }).materialType,
              qtyKg: line.outputKg,
              direction: 'in',
              stockBefore,
              stockAfter: stockBefore + line.outputKg,
              unitCost: line.unitCost,
            });
          }

          // 2) Girdi sarf
          const inputBefore = stockOf(inputProduct);
          movSeq = await this.applyStockMove(applied, {
            orderNo,
            movSeq,
            tag: 'S',
            movementType: 'out',
            trcode: STOCK_SLIP_TRCODES.CONSUMPTION,
            warehouseId,
            description: `${orderNo} kasap üretim — girdi`,
            productId: input.inputProductId,
            quantity: preview.inputQtyKg,
            unitPrice: preview.inputUnitCost,
            costPrice: preview.inputUnitCost,
            notes: notesLot || 'Kasap üretim girdisi',
          });
          stockSummary.push({
            productId: input.inputProductId,
            productName: inputProduct.name,
            productCode: (inputProduct as { code?: string }).code,
            materialType: (inputProduct as { materialType?: string }).materialType,
            qtyKg: preview.inputQtyKg,
            direction: 'out',
            stockBefore: inputBefore,
            stockAfter: inputBefore - preview.inputQtyKg,
            unitCost: preview.inputUnitCost,
          });

          // 3) Fire kartı
          if (preview.wasteQtyKg > 0.001 && input.wasteProductId) {
            const wasteProd = await productAPI.getById(input.wasteProductId);
            const wasteBefore = stockOf(wasteProd);
            movSeq = await this.applyStockMove(applied, {
              orderNo,
              movSeq,
              tag: 'F',
              movementType: 'in',
              trcode: STOCK_SLIP_TRCODES.PRODUCTION_IN,
              warehouseId,
              description: `${orderNo} fire stok kartı`,
              productId: input.wasteProductId,
              quantity: preview.wasteQtyKg,
              unitPrice: 0,
              costPrice: 0,
              notes: lotNo ? `Fire parti: ${lotNo}` : 'Üretim firesi',
            });
            if (wasteProd) {
              stockSummary.push({
                productId: wasteProd.id,
                productName: wasteProd.name,
                productCode: (wasteProd as { code?: string }).code,
                materialType: (wasteProd as { materialType?: string }).materialType,
                qtyKg: preview.wasteQtyKg,
                direction: 'in',
                stockBefore: wasteBefore,
                stockAfter: wasteBefore + preview.wasteQtyKg,
                unitCost: 0,
              });
            }
          }
        } catch (stockErr) {
          console.error('[ButcherProductionService] stock phase failed, compensating:', stockErr);
          await this.compensateStock(applied, orderNo);
          return {
            ok: false,
            error:
              stockErr instanceof Error
                ? `Stok yazımı başarısız (geri alındı): ${stockErr.message}`
                : `Stok yazımı başarısız (geri alındı): ${String(stockErr)}`,
          };
        }
      }

      let orderId: string;
      try {
        orderId = await butcherProductionAPI.saveOrder({
          id: input.existingOrderId,
          orderNo,
          recipeId: input.recipeId ?? null,
          animalType: input.animalType,
          inputProductId: input.inputProductId,
          inputQtyKg: preview.inputQtyKg,
          inputUnitCost: preview.inputUnitCost,
          inputTotalCost: preview.inputTotalCost,
          warehouseId,
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
      } catch (orderErr) {
        if (status === 'completed' && applied.length) {
          console.error('[ButcherProductionService] order save failed after stock, compensating:', orderErr);
          await this.compensateStock(applied, orderNo);
        }
        return {
          ok: false,
          error:
            orderErr instanceof Error
              ? `Fiş kaydı başarısız: ${orderErr.message}`
              : `Fiş kaydı başarısız: ${String(orderErr)}`,
        };
      }

      // Gerçek stokları DB'den doğrula (özet için)
      if (status === 'completed' && stockSummary.length) {
        for (const row of stockSummary) {
          try {
            const fresh = await productAPI.getById(row.productId);
            if (fresh) row.stockAfter = stockOf(fresh);
          } catch {
            /* özet tahmini kalsın */
          }
        }
      }

      return {
        ok: true,
        orderId,
        orderNo,
        stockSummary: status === 'completed' ? stockSummary : undefined,
      };
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
