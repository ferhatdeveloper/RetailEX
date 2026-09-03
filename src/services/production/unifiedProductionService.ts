/**
 * Birleşik Üretim Servisi — tamamlama + stok kontrolü + alış faturası bağlama.
 *
 * Genel üretim (production_*): sıkı stok kontrolü — yetersizse tamamlanamaz.
 * Kasap (butcher_*): mevcut `ButcherProductionService` üzerinden — `allow_complete_without_stock`
 * bayrağı ile yumuşak kontrol.
 *
 * Tamamlama sırası:
 *   1) Ön doğrulama (ürün, stok, reçete)
 *   2) Stok çıkışı (hammadde) + Stok girişi (mamul)
 *   3) Hata olursa uygulanan hareketleri ters kayıtla geri al
 *   4) Sipariş durumunu `completed` yap
 *   5) return.suggestPurchaseInvoice = true → UI alış faturası dialog'u açar
 */

import { productionAPI } from '../api/productionAPI';
import { productAPI } from '../api/products';
import { stockMovementAPI, STOCK_SLIP_TRCODES } from '../stockMovementAPI';
import { invoicesAPI } from '../api/invoices';
import { supplierAPI } from '../api/suppliers';
import { postgres, ERP_SETTINGS } from '../postgres';

import type { Invoice } from '../../core/types';

import type {
  CompleteProductionInput,
  CompleteProductionResult,
  CreatePurchaseInvoiceForOrderResult,
  ProductionMode,
} from './types';

function padFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function padPeriodNr(): string {
  return String(ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
}

function firmPrefix(): string {
  return `rex_${padFirmNr()}`;
}

function nextOrderNo(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

type AppliedMove = {
  productId: string;
  quantity: number;
  direction: 'in' | 'out';
  documentNo: string;
  description: string;
};

function stockOf(p: { stock?: number | string | null } | null | undefined): number {
  return Number(p?.stock) || 0;
}

/* ═══════════════════════════════════════════════════════════════════════
 * GENEL ÜRETİM — atomik tamamlama (sıkı stok kontrolü)
 * ═══════════════════════════════════════════════════════════════════════ */

async function completeGeneralOrder(input: {
  orderId: string;
  producedQty: number;
}): Promise<CompleteProductionResult> {
  const orders = await productionAPI.getOrders();
  const order = orders.find((o) => o.id === input.orderId);
  if (!order) return { ok: false, mode: 'general', error: 'Üretim emri bulunamadı.' };

  const recipes = await productionAPI.getRecipes();
  const recipe = recipes.find((r) => r.id === order.recipeId);
  if (!recipe) return { ok: false, mode: 'general', error: 'Reçete bulunamadı.' };

  // 1) Stok kontrolü
  const shortages: { materialName: string; have: number; need: number }[] = [];
  for (const ing of recipe.ingredients) {
    const product = await productAPI.getById(ing.materialId);
    const have = stockOf(product);
    const need = (Number(ing.quantity) || 0) * input.producedQty;
    if (have + 0.0001 < need) {
      shortages.push({
        materialName: ing.materialName || ing.materialId.slice(0, 8),
        have,
        need,
      });
    }
  }
  if (shortages.length > 0) {
    const msg = shortages
      .map((s) => `${s.materialName}: ${s.have.toFixed(2)} < ${s.need.toFixed(2)}`)
      .join(' | ');
    return {
      ok: false,
      mode: 'general',
      error: `Yetersiz stok. ${msg}`,
    };
  }

  // 2) Hammadde çıkışı (Sarf) + Mamul girişi (Üretimden Giriş)
  const applied: AppliedMove[] = [];
  const orderNo = order.orderNo || nextOrderNo('UR');
  try {
    // Hammadde sarfiyatı — her bileşen tek tek
    let seq = 1;
    for (const ing of recipe.ingredients) {
      const product = await productAPI.getById(ing.materialId);
      if (!product) continue;
      const totalNeeded = (Number(ing.quantity) || 0) * input.producedQty;
      const docNo = `${orderNo}-S${String(seq).padStart(2, '0')}`.slice(0, 50);
      await stockMovementAPI.create(
        {
          trcode: STOCK_SLIP_TRCODES.CONSUMPTION,
          movement_type: 'out',
          description: `${orderNo} üretim emri sarfiyatı`,
          document_no: docNo,
        },
        [
          {
            product_id: product.id,
            quantity: totalNeeded,
            unit_price: Number(ing.cost) || 0,
            notes: 'Reçete bileşeni',
          },
        ],
      );
      applied.push({
        productId: product.id,
        quantity: totalNeeded,
        direction: 'out',
        documentNo: docNo,
        description: 'Sarf',
      });
      seq += 1;
    }

    // Mamul girişi
    const finished = await productAPI.getById(order.productId);
    if (finished) {
      const docNo = `${orderNo}-G${String(seq).padStart(2, '0')}`.slice(0, 50);
      await stockMovementAPI.create(
        {
          trcode: STOCK_SLIP_TRCODES.PRODUCTION_IN,
          movement_type: 'in',
          description: `${orderNo} üretimden giriş`,
          document_no: docNo,
        },
        [
          {
            product_id: finished.id,
            quantity: input.producedQty,
            unit_price: Number(recipe.totalCost) || 0,
            notes: 'Üretim çıktısı',
          },
        ],
      );
      applied.push({
        productId: finished.id,
        quantity: input.producedQty,
        direction: 'in',
        documentNo: docNo,
        description: 'Üretimden giriş',
      });
    }
  } catch (stockErr) {
    console.error('[unifiedProductionService] general stock phase failed, compensating:', stockErr);
    await compensateMoves(applied, orderNo);
    return {
      ok: false,
      mode: 'general',
      error: stockErr instanceof Error ? stockErr.message : String(stockErr),
    };
  }

  // 3) Sipariş tamamlandı
  try {
    await productionAPI.saveOrder({
      id: order.id,
      status: 'completed',
      producedQty: input.producedQty,
    });
  } catch (orderErr) {
    console.error('[unifiedProductionService] order save failed after stock:', orderErr);
    await compensateMoves(applied, orderNo);
    return {
      ok: false,
      mode: 'general',
      error: orderErr instanceof Error ? orderErr.message : String(orderErr),
    };
  }

  return {
    ok: true,
    mode: 'general',
    orderId: order.id,
    orderNo,
    suggestPurchaseInvoice: false,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * KASAP — mevcut `ButcherProductionService` ile delege (gerisingering + fatura)
 * ═══════════════════════════════════════════════════════════════════════ */

async function completeButcherOrder(input: {
  orderId: string;
  producedQty: number;
  allowInsufficientStock?: boolean;
}): Promise<CompleteProductionResult> {
  const { ButcherProductionService } = await import('../butcherProductionService');
  const { butcherProductionAPI } = await import('../api/butcherProductionAPI');
  const existing = await butcherProductionAPI.getOrderById(input.orderId);
  if (!existing) {
    return { ok: false, mode: 'butcher', error: 'Üretim fişi bulunamadı.' };
  }

  const result = await ButcherProductionService.complete({
    recipeId: existing.recipeId ?? null,
    animalType: existing.animalType,
    inputProductId: existing.inputProductId,
    inputQtyKg: existing.inputQtyKg,
    inputUnitCost: existing.inputUnitCost,
    warehouseId: existing.warehouseId ?? null,
    wasteProductId: existing.wasteProductId ?? null,
    lotNo: existing.lotNo ?? null,
    costMethod: existing.costMethod,
    outputs: existing.outputs.map((o) => ({
      productId: o.productId,
      outputKg: o.outputKg,
      coefficient: o.coefficient,
      salePrice: o.salePrice,
      manualUnitCost: o.unitCost,
    })),
    note: existing.note,
    status: 'completed',
    existingOrderId: existing.id,
    allowInsufficientStock: input.allowInsufficientStock,
  });

  if (!result.ok) {
    return { ok: false, mode: 'butcher', error: result.error };
  }

  // Çift belge engeli: zaten bağlıysa yeniden önerme
  const fresh = await butcherProductionAPI.getOrderById(result.orderId!);
  const hasInvoice = Boolean(fresh?.purchaseInvoiceId);

  return {
    ok: true,
    mode: 'butcher',
    orderId: result.orderId,
    orderNo: result.orderNo,
    suggestPurchaseInvoice: !hasInvoice,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * Ters kayıt (kısmi hata telafisi)
 * ═══════════════════════════════════════════════════════════════════════ */

async function compensateMoves(applied: AppliedMove[], orderNo: string): Promise<void> {
  for (let i = applied.length - 1; i >= 0; i--) {
    const m = applied[i];
    const reverse: 'in' | 'out' = m.direction === 'in' ? 'out' : 'in';
    try {
      await stockMovementAPI.create(
        {
          trcode:
            reverse === 'in'
              ? STOCK_SLIP_TRCODES.PRODUCTION_IN
              : STOCK_SLIP_TRCODES.CONSUMPTION,
          movement_type: reverse,
          description: `${orderNo} geri alma — ${m.description}`.slice(0, 500),
          document_no: `${m.documentNo}-R`.slice(0, 50),
        },
        [
          {
            product_id: m.productId,
            quantity: m.quantity,
            notes: 'Üretim geri alma (kısmi hata)',
          },
        ],
      );
    } catch (e) {
      console.error('[unifiedProductionService] compensate failed:', m.documentNo, e);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * Genel üretim → alış faturası oluşturma (migration 104)
 * Stok etkisiz: üretim fişi zaten sarfiyatı yazdı.
 * ═══════════════════════════════════════════════════════════════════════ */

async function createGeneralPurchaseInvoice(params: {
  orderId: string;
  supplierId: string;
  supplierName: string;
  supplierCode?: string;
  firmaName?: string;
  donemName?: string;
}): Promise<CreatePurchaseInvoiceForOrderResult> {
  try {
    const { unifiedProductionAPI } = await import('./unifiedProductionAPI');
    const order = await unifiedProductionAPI.production.getOrderById(params.orderId);
    if (!order?.id) {
      return { ok: false, error: 'Üretim emri bulunamadı.' };
    }
    if (order.purchaseInvoiceId) {
      return {
        ok: true,
        alreadyLinked: true,
        invoiceId: order.purchaseInvoiceId,
        invoiceNo: order.purchaseInvoiceNo ?? undefined,
      };
    }

    // Hammadde maliyetini tahmini olarak reçeteden al
    const recipes = await productionAPI.getRecipes();
    const recipe = recipes.find((r) => r.id === order.recipeId);
    const recipeTotalCost = Number(recipe?.totalCost) || 0;
    const totalAmount = recipeTotalCost * (Number(order.producedQty) || 0);

    const today = new Date().toISOString().slice(0, 10);
    const invoiceNo = `${today.replace(/-/g, '')}${Math.floor(Math.random() * 1000000)}`;
    const firmNr = padFirmNr();
    const periodNr = padPeriodNr();
    const itemId = (recipe?.ingredients?.[0]?.materialId) || order.productId;

    const invoice = {
      invoice_no: invoiceNo,
      invoice_date: today,
      invoice_type: 1,
      invoice_category: 'Alis',
      supplier_id: params.supplierId,
      supplier_name: params.supplierName.trim(),
      customer_id: params.supplierId,
      customer_name: params.supplierName.trim(),
      subtotal: totalAmount,
      discount: 0,
      tax: 0,
      total_amount: totalAmount,
      total_cost: totalAmount,
      payment_method: 'Veresiye',
      firma_id: firmNr,
      firma_name: params.firmaName || firmNr,
      donem_id: periodNr,
      donem_name: params.donemName || periodNr,
      notes: `Kaynak: Üretim emri ${order.orderNo} (id: ${order.id}). Stok üretim emri ile işlendi; bu belge stok artırmaz.`,
      document_no: order.orderNo,
      items: recipe?.ingredients?.length
        ? recipe.ingredients.map((ing) => ({
            type: 'Malzeme',
            productId: ing.materialId,
            code: ing.materialId.slice(0, 8),
            description: ing.materialName || ing.materialId.slice(0, 8),
            quantity: (Number(ing.quantity) || 0) * (Number(order.producedQty) || 0),
            unit: ing.unit || 'ADET',
            unitPrice: Number(ing.cost) || 0,
            unitCost: Number(ing.cost) || 0,
            totalCost: (Number(ing.cost) || 0) * (Number(ing.quantity) || 0) * (Number(order.producedQty) || 0),
            netAmount: (Number(ing.cost) || 0) * (Number(ing.quantity) || 0) * (Number(order.producedQty) || 0),
            total: (Number(ing.cost) || 0) * (Number(ing.quantity) || 0) * (Number(order.producedQty) || 0),
            discountPercent: 0,
            discount: 0,
          }))
        : [
          {
            type: 'Malzeme',
            productId: itemId,
            code: itemId.slice(0, 8),
            description: order.productName || itemId.slice(0, 8),
            quantity: Number(order.producedQty) || 0,
            unit: 'ADET',
            unitPrice: 0,
            unitCost: 0,
            totalCost: totalAmount,
            netAmount: totalAmount,
            total: totalAmount,
            discountPercent: 0,
            discount: 0,
          },
        ],
    } as Invoice;

    const saved = await invoicesAPI.create(invoice, { skipProductStockUpdate: true });
    if (!saved?.id) {
      return { ok: false, error: 'Alış faturası oluşturulamadı.' };
    }

    const linked = await unifiedProductionAPI.production.linkPurchaseInvoice({
      orderId: order.id,
      invoiceId: String(saved.id),
      invoiceNo: saved.invoice_no || invoiceNo,
      supplierId: params.supplierId,
      supplierName: params.supplierName.trim(),
    });

    if (!linked) {
      const fresh = await unifiedProductionAPI.production.getOrderById(order.id);
      if (fresh?.purchaseInvoiceId) {
        return {
          ok: true,
          alreadyLinked: true,
          invoiceId: fresh.purchaseInvoiceId,
          invoiceNo: fresh.purchaseInvoiceNo ?? undefined,
        };
      }
    }

    return {
      ok: true,
      invoiceId: String(saved.id),
      invoiceNo: saved.invoice_no || invoiceNo,
    };
  } catch (e) {
    console.error('[unifiedProductionService] createGeneralPurchaseInvoice failed:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * Birleşik service yüzeyi
 * ═══════════════════════════════════════════════════════════════════════ */

export const unifiedProductionService = {
  /**
   * Üretim emrini / fişini tamamlar. Hata olursa uygulanan stok hareketlerini geri alır.
   * `result.suggestPurchaseInvoice` true ise UI alış faturası dialog'u açar.
   */
  async complete(input: CompleteProductionInput): Promise<CompleteProductionResult> {
    const producedQty = Number(input.producedQty) || 0;
    if (producedQty <= 0) {
      return { ok: false, mode: input.mode, error: 'Üretim miktarı 0 olamaz.' };
    }
    if (input.mode === 'butcher') {
      return completeButcherOrder({
        orderId: input.orderId,
        producedQty,
        allowInsufficientStock: input.allowInsufficientStock,
      });
    }
    return completeGeneralOrder({ orderId: input.orderId, producedQty });
  },

  /**
   * Tamamlanmış üretim emrinden alış faturası oluşturur + emre bağlar.
   * Mod'a göre kasap (maliyet + lot + çift belge) veya genel (basit) yolu kullanır.
   */
  async createPurchaseInvoiceFromOrder(
    input: { mode: ProductionMode; orderId: string; supplierId: string; supplierName: string; supplierCode?: string; firmaName?: string; donemName?: string },
  ): Promise<CreatePurchaseInvoiceForOrderResult> {
    if (input.mode === 'butcher') {
      const { ButcherProductionService } = await import('../butcherProductionService');
      return ButcherProductionService.createPurchaseInvoiceFromOrder({
        orderId: input.orderId,
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        supplierCode: input.supplierCode,
        firmaName: input.firmaName,
        donemName: input.donemName,
      });
    }
    return createGeneralPurchaseInvoice(input);
  },

  /** UI listeleri için: tedarikçi (cari) kısa listesi. */
  async listSuppliers(): Promise<{ id: string; code?: string; name: string }[]> {
    try {
      const list = await supplierAPI.getAll({ cardType: 'supplier' });
      return list.map((s) => ({ id: s.id, code: s.code, name: s.name }));
    } catch (e) {
      console.warn('[unifiedProductionService] listSuppliers:', e);
      return [];
    }
  },
};

export type {
  CompleteProductionInput,
  CompleteProductionResult,
  CreatePurchaseInvoiceForOrderResult,
};