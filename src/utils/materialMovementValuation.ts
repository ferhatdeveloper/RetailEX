/**
 * Malzeme Hareket Raporu — stok maliyeti.
 *
 * Alış satırı fatura birim maliyetinde kalır (5.000 / 6.000).
 * Satış ve satış iadesi, envanter listesi ile aynı ağırlıklı ortalama
 * birim maliyeti kullanır. Satış fiyatı bu kolona yazılmaz.
 *
 * KPI:
 *   Alış girişi  = alışlar (alış iadesi işaretli, satış iadesi hariç)
 *   Satış çıkışı = satışın stoktan çıkardığı maliyet
 *   İade         = satış iadesinin stoğa geri koyduğu maliyet (bir kez)
 *   Net          = alış girişi − satış çıkışı + iade + diğer
 * Satış iadesi hem girişe eklenip hem çıkıştan düşülmez.
 */
import { productCogsFromUnitPurchase } from './productSaleCogs';

const SELLING_PRICE_EPS = 0.02;
const PURCHASE_RETURN_TRCODE = 6;

export type MaterialMovementUiType = 'purchase' | 'sale' | 'transfer' | 'adjustment' | 'return';

/** Alış / satış / satış iadesi / diğer — KPI kovası. */
export type MaterialCostBucket = 'purchase' | 'sale' | 'sales_return' | 'other';

export type MaterialMovementCostInput = {
  unitPrice?: number;
  costPrice?: number;
  /** Envanter ağırlıklı ortalama birim alış. Satış fiyatı değil. */
  avgUnitCost?: number;
  uiType: MaterialMovementUiType;
  ficheType?: string;
  trcode?: number;
  sourceType?: string;
};

export function dbTypeToMaterialUiType(
  dbType: string,
  ficheType?: string,
): MaterialMovementUiType {
  const fiche = String(ficheType || '').trim().toLowerCase();
  if (fiche === 'return_invoice') return 'return';
  switch (String(dbType || '').toLowerCase()) {
    case 'in':
    case 'purchase':
      return 'purchase';
    case 'out':
    case 'sale':
      return 'sale';
    case 'transfer':
      return 'transfer';
    case 'adjustment':
      return 'adjustment';
    default:
      return 'purchase';
  }
}

export function isPurchaseReturnMovement(opts: {
  uiType?: string;
  ficheType?: string;
  trcode?: number;
}): boolean {
  return (Number(opts.trcode) || 0) === PURCHASE_RETURN_TRCODE;
}

/** Satış iadesi stoğa maliyet geri koyar. Alış iadesi (trcode 6) değildir. */
export function isSalesReturnMovement(opts: {
  uiType?: string;
  ficheType?: string;
  trcode?: number;
}): boolean {
  if (isPurchaseReturnMovement(opts)) return false;
  const tr = Number(opts.trcode) || 0;
  const fiche = String(opts.ficheType || '').trim().toLowerCase();
  if (tr === 2 || tr === 3) return true;
  if (fiche === 'return_invoice') return true;
  return String(opts.uiType || '') === 'return';
}

export function materialMovementCostBucket(opts: {
  uiType: MaterialMovementUiType;
  ficheType?: string;
  trcode?: number;
}): MaterialCostBucket {
  if (isSalesReturnMovement(opts)) return 'sales_return';
  if (isPurchaseReturnMovement(opts) || opts.uiType === 'purchase') return 'purchase';
  if (opts.uiType === 'sale') return 'sale';
  return 'other';
}

/**
 * Giriş +, çıkış −. Satış iadesi (trcode 2 dahil) her zaman stoğa girer;
 * alış iadesi stoktan çıkar.
 */
export function signedMaterialMovementQuantity(opts: {
  qty: number;
  movementType: string;
  ficheType?: string;
  trcode?: number;
  selectedWarehouse?: string;
  sourceWh?: string;
  targetWh?: string;
}): number {
  const absQty = Math.abs(Number(opts.qty) || 0);
  const dbType = String(opts.movementType || '').toLowerCase();
  const fiche = String(opts.ficheType || '').trim().toLowerCase();
  const tr = Number(opts.trcode) || 0;

  if (tr === PURCHASE_RETURN_TRCODE) return -absQty;
  if (tr === 2 || tr === 3 || fiche === 'return_invoice') return absQty;

  if (dbType === 'in' || dbType === 'purchase') return absQty;
  if (dbType === 'out' || dbType === 'sale') return -absQty;
  if (dbType === 'transfer') {
    const selected = opts.selectedWarehouse ?? 'all';
    if (selected === 'all') return -absQty;
    if (opts.sourceWh && opts.sourceWh === selected) return -absQty;
    if (opts.targetWh && opts.targetWh === selected) return absQty;
    return -absQty;
  }
  if (dbType === 'adjustment') return Number(opts.qty) || 0;
  return Number(opts.qty) || 0;
}

function looksLikeSellingPrice(cost: number, unitPrice: number): boolean {
  return unitPrice > 0 && cost > 0 && Math.abs(cost - unitPrice) < SELLING_PRICE_EPS;
}

/**
 * Birim maliyet.
 * Satış / satış iadesi: ağırlıklı ortalama. Satış fiyatı kullanılmaz.
 * Alış faturası: belgedeki alış birim fiyatı (ortalamayla ezilmez).
 */
export function resolveMaterialMovementUnitCost(input: MaterialMovementCostInput): number {
  const unitPrice = Math.abs(Number(input.unitPrice) || 0);
  const costPrice = Math.abs(Number(input.costPrice) || 0);
  const avg = Number(input.avgUnitCost) || 0;
  const bucket = materialMovementCostBucket(input);

  if (bucket === 'sale' || bucket === 'sales_return') {
    if (avg > 0) return avg;
    if (costPrice > 0 && !looksLikeSellingPrice(costPrice, unitPrice)) return costPrice;
    return 0;
  }

  if (bucket === 'purchase') {
    const source = String(input.sourceType || '').toLowerCase();
    if (source === 'slip') {
      if (costPrice > 0) return costPrice;
      return unitPrice;
    }
    if (unitPrice > 0) return unitPrice;
    return costPrice;
  }

  if (costPrice > 0) return costPrice;
  return unitPrice;
}

export type ValuedMaterialMovement = {
  uiType: MaterialMovementUiType;
  bucket: MaterialCostBucket;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

export function valueMaterialMovementLine(raw: {
  quantity: number;
  unitPrice?: number;
  costPrice?: number;
  avgUnitCost?: number;
  movementType: string;
  ficheType?: string;
  trcode?: number;
  sourceType?: string;
  selectedWarehouse?: string;
  sourceWh?: string;
  targetWh?: string;
}): ValuedMaterialMovement {
  const uiType = dbTypeToMaterialUiType(raw.movementType, raw.ficheType);
  const quantity = signedMaterialMovementQuantity({
    qty: raw.quantity,
    movementType: raw.movementType,
    ficheType: raw.ficheType,
    trcode: raw.trcode,
    selectedWarehouse: raw.selectedWarehouse,
    sourceWh: raw.sourceWh,
    targetWh: raw.targetWh,
  });
  const bucket = materialMovementCostBucket({
    uiType,
    ficheType: raw.ficheType,
    trcode: raw.trcode,
  });
  const unitCost = resolveMaterialMovementUnitCost({
    unitPrice: raw.unitPrice,
    costPrice: raw.costPrice,
    avgUnitCost: raw.avgUnitCost,
    uiType,
    ficheType: raw.ficheType,
    trcode: raw.trcode,
    sourceType: raw.sourceType,
  });
  const totalCost =
    bucket === 'sale' || bucket === 'sales_return'
      ? productCogsFromUnitPurchase(quantity, unitCost)
      : quantity * unitCost;
  return { uiType, bucket, quantity, unitCost, totalCost };
}

export type MaterialMovementKpis = {
  /** Alışlar, alış iadesi düşülmüş. Satış iadesi burada yok. */
  purchaseIn: number;
  /** Satışın stoktan çıkardığı maliyet (pozitif). */
  saleOut: number;
  /** Satış iadesinin stoğa geri koyduğu maliyet (pozitif, bir kez). */
  salesReturn: number;
  net: number;
  netQty: number;
};

export function summarizeMaterialMovementKpis(
  lines: Array<Pick<ValuedMaterialMovement, 'bucket' | 'quantity' | 'totalCost'>>,
): MaterialMovementKpis {
  let purchaseIn = 0;
  let saleOut = 0;
  let salesReturn = 0;
  let otherSigned = 0;
  let netQty = 0;
  for (const line of lines) {
    const total = Number(line.totalCost) || 0;
    const qty = Number(line.quantity) || 0;
    netQty += qty;
    if (line.bucket === 'sale') saleOut += Math.abs(total);
    else if (line.bucket === 'sales_return') salesReturn += Math.abs(total);
    else if (line.bucket === 'purchase') purchaseIn += total;
    else otherSigned += total;
  }
  return {
    purchaseIn,
    saleOut,
    salesReturn,
    net: purchaseIn - saleOut + salesReturn + otherSigned,
    netQty,
  };
}
