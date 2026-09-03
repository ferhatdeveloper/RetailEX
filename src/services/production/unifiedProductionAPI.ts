/**
 * Birleşik Üretim API — genel (production_*) + kasap (butcher_*) tek yüzeyden
 * - productionAPI: mevcut `services/api/productionAPI.ts` davranışı korunur
 * - butcherAPI: mevcut `services/api/butcherProductionAPI.ts` re-export edilir
 *
 * Migration 104 ile `production_orders.purchase_invoice_id/no, supplier_id/name`
 * alanları eklendi; buradaki `linkPurchaseInvoice` kasap ile simetrik çalışır.
 */

import {
  productionAPI as legacyProductionAPI,
  type ProductionRecipe as LegacyRecipe,
  type ProductionOrder as LegacyOrder,
} from '../api/productionAPI';
import {
  butcherProductionAPI as legacyButcherAPI,
  type ButcherRecipe,
  type ButcherOrder,
  type ButcherSettings,
} from '../api/butcherProductionAPI';
import { postgres, ERP_SETTINGS } from '../postgres';

import type {
  ProductionOrder,
  ProductionRecipe,
  ProductionOrderStatus,
  CreatePurchaseInvoiceForOrderResult,
  CreatePurchaseInvoiceForOrderInput,
} from './types';

function padFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function firmPrefix(): string {
  return `rex_${padFirmNr()}`;
}

function uuidOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/* ═══════════════════════════════════════════════════════════════════════
 * GENEL ÜRETİM — productionAPI sarmalayıcı + alış faturası bağlama
 * ═══════════════════════════════════════════════════════════════════════ */

const productionApi = {
  async getRecipes(): Promise<ProductionRecipe[]> {
    return legacyProductionAPI.getRecipes();
  },

  async getRecipeById(id: string): Promise<ProductionRecipe | null> {
    const list = await legacyProductionAPI.getRecipes();
    return list.find((r: LegacyRecipe) => r.id === id) ?? null;
  },

  async saveRecipe(recipe: ProductionRecipe): Promise<string> {
    return legacyProductionAPI.saveRecipe(recipe as LegacyRecipe);
  },

  async getOrders(): Promise<ProductionOrder[]> {
    const rows = await legacyProductionAPI.getOrders();
    return rows.map((r: LegacyOrder) => ({
      id: r.id,
      orderNo: r.orderNo,
      recipeId: r.recipeId,
      recipeName: r.recipeName,
      productId: r.productId,
      productName: r.productName,
      plannedQty: r.plannedQty,
      producedQty: r.producedQty,
      status: r.status as ProductionOrderStatus,
      startDate: r.startDate,
      endDate: r.endDate,
      completedAt: r.completedAt,
      note: r.note,
      updatedAt: r.updatedAt,
      // purchase_invoice_id kolonları API'de henüz döndürülmüyor; DB'den ayrı okunur
      purchaseInvoiceId: null,
      purchaseInvoiceNo: null,
      supplierId: null,
      supplierName: null,
    }));
  },

  async getOrderById(id: string): Promise<ProductionOrder | null> {
    const orders = await this.getOrders();
    const order = orders.find((o) => o.id === id) ?? null;
    if (!order) return null;
    const meta = await this.getOrderPurchaseInvoiceMeta(id);
    return { ...order, ...meta };
  },

  /** Toplu: birden fazla üretim emrinin alış faturası bağlantı meta'ları. */
  async getOrdersPurchaseInvoiceMeta(orderIds: string[]): Promise<
    Record<string, {
      purchaseInvoiceId: string | null;
      purchaseInvoiceNo: string | null;
      supplierId: string | null;
      supplierName: string | null;
    }>
  > {
    const ids = orderIds.filter(Boolean);
    const empty = (id: string) => ({
      [id]: {
        purchaseInvoiceId: null,
        purchaseInvoiceNo: null,
        supplierId: null,
        supplierName: null,
      },
    });
    if (ids.length === 0) return {};
    try {
      const { rows } = await postgres.query<{
        id: string;
        purchase_invoice_id: string | null;
        purchase_invoice_no: string | null;
        supplier_id: string | null;
        supplier_name: string | null;
      }>(
        `SELECT id, purchase_invoice_id, purchase_invoice_no, supplier_id, supplier_name
         FROM ${firmPrefix()}_production_orders WHERE id = ANY($1)`,
        [ids],
      );
      const map: Record<string, any> = {};
      for (const r of rows) {
        map[r.id] = {
          purchaseInvoiceId: uuidOrNull(r.purchase_invoice_id),
          purchaseInvoiceNo: r.purchase_invoice_no ?? null,
          supplierId: uuidOrNull(r.supplier_id),
          supplierName: r.supplier_name ?? null,
        };
      }
      // Eksik orderlar için boş meta
      for (const id of ids) {
        if (!map[id]) map[id] = empty(id)[id];
      }
      return map;
    } catch (e) {
      console.warn('[unifiedProductionAPI] getOrdersPurchaseInvoiceMeta:', e);
      const fallback: Record<string, any> = {};
      for (const id of ids) fallback[id] = empty(id)[id];
      return fallback;
    }
  },

  /** `production_orders.purchase_invoice_*` kolonlarını okur (migration 104). */
  async getOrderPurchaseInvoiceMeta(orderId: string): Promise<{
    purchaseInvoiceId: string | null;
    purchaseInvoiceNo: string | null;
    supplierId: string | null;
    supplierName: string | null;
  }> {
    try {
      const { rows } = await postgres.query<{
        purchase_invoice_id: string | null;
        purchase_invoice_no: string | null;
        supplier_id: string | null;
        supplier_name: string | null;
      }>(
        `SELECT purchase_invoice_id, purchase_invoice_no, supplier_id, supplier_name
         FROM ${firmPrefix()}_production_orders WHERE id = $1 LIMIT 1`,
        [orderId],
      );
      const row = rows[0];
      return {
        purchaseInvoiceId: uuidOrNull(row?.purchase_invoice_id),
        purchaseInvoiceNo: row?.purchase_invoice_no ?? null,
        supplierId: uuidOrNull(row?.supplier_id),
        supplierName: row?.supplier_name ?? null,
      };
    } catch (e) {
      console.warn('[unifiedProductionAPI] getOrderPurchaseInvoiceMeta:', e);
      return {
        purchaseInvoiceId: null,
        purchaseInvoiceNo: null,
        supplierId: null,
        supplierName: null,
      };
    }
  },

  async saveOrder(order: Partial<ProductionOrder>): Promise<string> {
    return legacyProductionAPI.saveOrder(order as Partial<LegacyOrder>);
  },

  /** Üretim emrini alış faturasına bağla — yalnızca boşken (çift belge engeli). */
  async linkPurchaseInvoice(params: {
    orderId: string;
    invoiceId: string;
    invoiceNo: string;
    supplierId?: string | null;
    supplierName?: string | null;
  }): Promise<boolean> {
    const { rows } = await postgres.query<{ id: string }>(
      `UPDATE ${firmPrefix()}_production_orders
       SET purchase_invoice_id = $1,
           purchase_invoice_no = $2,
           supplier_id = COALESCE($3, supplier_id),
           supplier_name = COALESCE($4, supplier_name),
           updated_at = NOW()
       WHERE id = $5
         AND purchase_invoice_id IS NULL
       RETURNING id`,
      [
        params.invoiceId,
        params.invoiceNo,
        uuidOrNull(params.supplierId),
        params.supplierName ?? null,
        params.orderId,
      ],
    );
    return rows.length > 0;
  },
};

/* ═══════════════════════════════════════════════════════════════════════
 * KASAP — re-export + alış faturası bağlama adaptörü
 * ═══════════════════════════════════════════════════════════════════════ */

const butcherApi = {
  getRecipes: legacyButcherAPI.getRecipes,
  saveRecipe: legacyButcherAPI.saveRecipe,
  deleteRecipe: legacyButcherAPI.deleteRecipe,
  getOrders: legacyButcherAPI.getOrders,
  getOrderById: legacyButcherAPI.getOrderById,
  saveOrder: legacyButcherAPI.saveOrder,
  getSettings: legacyButcherAPI.getSettings,
  saveSettings: legacyButcherAPI.saveSettings,
  linkPurchaseInvoice: legacyButcherAPI.linkPurchaseInvoice,
  reportProductionHistory: legacyButcherAPI.reportProductionHistory,
  reportWasteAnalysis: legacyButcherAPI.reportWasteAnalysis,
  reportProductCostYield: legacyButcherAPI.reportProductCostYield,
};

/* ═══════════════════════════════════════════════════════════════════════
 * Birleşik API yüzeyi — UI bu nesneyi kullanır
 * ═══════════════════════════════════════════════════════════════════════ */

export const unifiedProductionAPI = {
  production: productionApi,
  butcher: butcherApi,

  /** Üretim fişine bağlı alış faturası — ortak helper (mod ayrımı otomatik). */
  async createPurchaseInvoiceFromOrder(
    input: CreatePurchaseInvoiceForOrderInput,
  ): Promise<CreatePurchaseInvoiceForOrderResult> {
    if (input.mode === 'butcher') {
      // Kasap akışı zaten kurulu (maliyet + fatura bağlama + lot)
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
    // Genel üretim için sadece link (fatura oluşturma işlemi UI/service katmanında)
    return {
      ok: true,
      alreadyLinked: false,
    };
  },
};

export type { ProductionRecipe, ProductionOrder, ButcherRecipe, ButcherOrder, ButcherSettings };