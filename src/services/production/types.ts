/**
 * Üretim modülü — ortak tipler
 * Genel BOM (production_*) + Kasap (butcher_*) + alış faturası bağlantısı
 */

import type { ButcherCostMethod } from '../../utils/butcherCost';

/* ═══════════════════════════════════════════════════════════════════════
 * GENEL ÜRETİM — reçete + üretim emri
 * ═══════════════════════════════════════════════════════════════════════ */

export interface RecipeIngredient {
  id?: string;
  materialId: string;
  materialName?: string;
  /** Reçete içindeki miktar (1 birim mamul için) */
  quantity: number;
  /** Birim (KG / ADET / LT vb.) */
  unit: string;
  /** Bileşen birim maliyeti */
  cost: number;
}

export interface ProductionRecipe {
  id?: string;
  /** Üretilen mamul */
  productId: string;
  productName?: string;
  /** Reçete adı (UI'da görünen) */
  name: string;
  description?: string;
  /** Σ(cost × quantity) — otomatik hesap */
  totalCost: number;
  /** Yüzde (0–100) — tamamlama sırasında hammadde sarfına yansır */
  wastagePercent: number;
  isActive: boolean;
  ingredients: RecipeIngredient[];
}

export type ProductionOrderStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

export interface ProductionOrder {
  id?: string;
  orderNo: string;
  recipeId: string;
  recipeName?: string;
  productId: string;
  productName?: string;
  plannedQty: number;
  producedQty: number;
  status: ProductionOrderStatus;
  startDate?: string;
  endDate?: string;
  completedAt?: string;
  note?: string;
  /** Migration 104: alış faturası bağlantısı (çift belge engeli) */
  purchaseInvoiceId?: string | null;
  purchaseInvoiceNo?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

/* ═══════════════════════════════════════════════════════════════════════
 * KASAP — reçete + üretim fişi (mevcut API'den import edilir)
 * ═══════════════════════════════════════════════════════════════════════ */

export type AnimalType = 'cattle' | 'sheep' | 'goat' | 'other';

export type { ButcherCostMethod };

export interface ButcherRecipeOutputDraft {
  id?: string;
  productId: string;
  productName?: string;
  sortOrder: number;
  standardRatioPercent?: number | null;
  coefficient: number;
}

export interface ButcherRecipe {
  id?: string;
  code?: string | null;
  name: string;
  animalType: AnimalType;
  inputProductId?: string | null;
  inputProductName?: string;
  wasteProductId?: string | null;
  wasteProductName?: string;
  costMethod?: ButcherCostMethod | null;
  description?: string;
  isActive: boolean;
  outputs: ButcherRecipeOutputDraft[];
}

export interface ButcherOrderOutputDraft {
  id?: string;
  productId: string;
  productName?: string;
  outputKg: number;
  coefficient: number;
  salePrice: number;
  unitCost: number;
  totalCost: number;
  costSharePercent: number;
  sortOrder?: number;
}

export interface ButcherOrder {
  id?: string;
  orderNo: string;
  recipeId?: string | null;
  recipeName?: string;
  animalType: AnimalType;
  inputProductId: string;
  inputProductName?: string;
  inputQtyKg: number;
  inputUnitCost: number;
  inputTotalCost: number;
  warehouseId?: string | null;
  wasteProductId?: string | null;
  lotNo?: string | null;
  costMethod: ButcherCostMethod;
  outputQtyKg: number;
  wasteQtyKg: number;
  wastePercent: number;
  wasteCostAllocated: number;
  costPerKgSalable: number;
  status: 'draft' | 'open' | 'completed' | 'cancelled';
  note?: string;
  purchaseInvoiceId?: string | null;
  purchaseInvoiceNo?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  completedAt?: string;
  createdAt?: string;
  outputs: ButcherOrderOutputDraft[];
}

export interface ButcherSettings {
  defaultCostMethod: ButcherCostMethod;
  defaultWarehouseId?: string | null;
  /** true: yetersiz girdi stoğunda üretim tamamlanabilir */
  allowCompleteWithoutStock?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════
 * ÜRETİM MODU + TAMAMLAMA SONUÇLARI
 * ═══════════════════════════════════════════════════════════════════════ */

export type ProductionMode = 'general' | 'butcher';

export interface CompleteProductionInput {
  mode: ProductionMode;
  orderId: string;
  producedQty?: number;
  /** Stok yetersizse onay mekanizması (kasap tarafı) */
  allowInsufficientStock?: boolean;
}

export interface CompleteProductionResult {
  ok: boolean;
  mode: ProductionMode;
  orderId?: string;
  orderNo?: string;
  error?: string;
  /** Alış faturası bağlantı önerisi (kullanıcı onayına sunulur) */
  suggestPurchaseInvoice?: boolean;
}

export interface CreatePurchaseInvoiceForOrderInput {
  mode: ProductionMode;
  orderId: string;
  supplierId: string;
  supplierName: string;
  supplierCode?: string;
  firmaName?: string;
  donemName?: string;
}

export interface CreatePurchaseInvoiceForOrderResult {
  ok: boolean;
  invoiceId?: string;
  invoiceNo?: string;
  alreadyLinked?: boolean;
  error?: string;
}