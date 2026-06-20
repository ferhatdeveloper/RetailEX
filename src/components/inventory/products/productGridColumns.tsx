import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import type { Product } from '../../../core/types';
import { formatCurrency as formatAmountWithCode } from '../../../utils/formatNumber';
import { formatCurrency } from '../../../utils/currency';

export const PRODUCT_COLUMN_VISIBILITY_KEY = 'retailex_productManagement_columnVisibility_v2';

export type ProductGridColumnId = keyof typeof PRODUCT_GRID_COLUMN_META;

type ColumnMeta = {
  /** DB / Product model alan adı */
  id: string;
  label: string;
  defaultVisible: boolean;
  purchaseOnly?: boolean;
  size?: number;
  format?: 'text' | 'currency' | 'currencyUsd' | 'currencyEur' | 'percent' | 'number' | 'date' | 'bool';
};

/** Kolon menüsünde seçilebilir tüm liste alanları (DB ile uyumlu) */
export const PRODUCT_GRID_COLUMN_META: Record<string, ColumnMeta> = {
  barcode: { id: 'barcode', label: 'Barkod', defaultVisible: true, size: 140 },
  code: { id: 'code', label: 'Ürün Kodu', defaultVisible: true, size: 130 },
  name: { id: 'name', label: 'Ürün Adı', defaultVisible: true, size: 250 },
  name2: { id: 'name2', label: 'Ad 2', defaultVisible: false, size: 180 },
  description_tr: { id: 'description_tr', label: 'Açıklama (TR)', defaultVisible: false, size: 200 },
  description_en: { id: 'description_en', label: 'Açıklama (EN)', defaultVisible: false, size: 200 },
  description_ar: { id: 'description_ar', label: 'Açıklama (AR)', defaultVisible: false, size: 200 },
  description_ku: { id: 'description_ku', label: 'Açıklama (KU)', defaultVisible: false, size: 200 },
  category: { id: 'category', label: 'Kategori', defaultVisible: true, size: 140 },
  groupCode: { id: 'groupCode', label: 'Grup Kodu', defaultVisible: false, size: 110 },
  subGroupCode: { id: 'subGroupCode', label: 'Alt Grup', defaultVisible: false, size: 110 },
  brand: { id: 'brand', label: 'Marka', defaultVisible: false, size: 120 },
  model: { id: 'model', label: 'Model', defaultVisible: false, size: 110 },
  manufacturer: { id: 'manufacturer', label: 'Üretici', defaultVisible: false, size: 120 },
  supplier: { id: 'supplier', label: 'Tedarikçi', defaultVisible: false, size: 130 },
  origin: { id: 'origin', label: 'Menşei', defaultVisible: false, size: 100 },
  materialType: { id: 'materialType', label: 'Malzeme Türü', defaultVisible: false, size: 130 },
  specialCode1: { id: 'specialCode1', label: 'Özel Kod 1', defaultVisible: false, size: 100 },
  specialCode2: { id: 'specialCode2', label: 'Özel Kod 2', defaultVisible: true, size: 110 },
  specialCode3: { id: 'specialCode3', label: 'Özel Kod 3', defaultVisible: false, size: 100 },
  specialCode4: { id: 'specialCode4', label: 'Özel Kod 4', defaultVisible: false, size: 100 },
  specialCode5: { id: 'specialCode5', label: 'Özel Kod 5', defaultVisible: false, size: 100 },
  specialCode6: { id: 'specialCode6', label: 'Özel Kod 6', defaultVisible: false, size: 100 },
  cost: { id: 'cost', label: 'Maliyet', defaultVisible: true, purchaseOnly: true, size: 120, format: 'currency' },
  price: { id: 'price', label: 'Birim Fiyat', defaultVisible: true, size: 140, format: 'currency' },
  salePriceUSD: { id: 'salePriceUSD', label: 'Fiyat (USD)', defaultVisible: true, size: 120, format: 'currencyUsd' },
  purchasePriceUSD: { id: 'purchasePriceUSD', label: 'Alış (USD)', defaultVisible: true, purchaseOnly: true, size: 120, format: 'currencyUsd' },
  salePriceEUR: { id: 'salePriceEUR', label: 'Fiyat (EUR)', defaultVisible: false, size: 120, format: 'currencyEur' },
  purchasePriceEUR: { id: 'purchasePriceEUR', label: 'Alış (EUR)', defaultVisible: false, purchaseOnly: true, size: 120, format: 'currencyEur' },
  currency: { id: 'currency', label: 'Para Birimi', defaultVisible: false, size: 90 },
  customExchangeRate: { id: 'customExchangeRate', label: 'Özel Kur', defaultVisible: false, size: 100, format: 'number' },
  taxRate: { id: 'taxRate', label: 'KDV', defaultVisible: true, size: 100, format: 'percent' },
  stock: { id: 'stock', label: 'Stok', defaultVisible: true, size: 100, format: 'number' },
  minStock: { id: 'minStock', label: 'Min Stok', defaultVisible: false, size: 90, format: 'number' },
  maxStock: { id: 'maxStock', label: 'Max Stok', defaultVisible: false, size: 90, format: 'number' },
  criticalStock: { id: 'criticalStock', label: 'Kritik Stok', defaultVisible: false, size: 100, format: 'number' },
  unit: { id: 'unit', label: 'Birim', defaultVisible: true, size: 100 },
  priceList1: { id: 'priceList1', label: 'Fiyat Listesi 1', defaultVisible: false, size: 110, format: 'currency' },
  priceList2: { id: 'priceList2', label: 'Fiyat Listesi 2', defaultVisible: false, size: 110, format: 'currency' },
  priceList3: { id: 'priceList3', label: 'Fiyat Listesi 3', defaultVisible: false, size: 110, format: 'currency' },
  priceList4: { id: 'priceList4', label: 'Fiyat Listesi 4', defaultVisible: false, size: 110, format: 'currency' },
  priceList5: { id: 'priceList5', label: 'Fiyat Listesi 5', defaultVisible: false, size: 110, format: 'currency' },
  priceList6: { id: 'priceList6', label: 'Fiyat Listesi 6', defaultVisible: false, size: 110, format: 'currency' },
  totalSales: { id: 'totalSales', label: 'Satış Toplam', defaultVisible: true, size: 120, format: 'number' },
  totalPurchased: { id: 'totalPurchased', label: 'Alış Toplam', defaultVisible: true, purchaseOnly: true, size: 120, format: 'number' },
  hasVariants: { id: 'hasVariants', label: 'Varyantlı', defaultVisible: false, size: 90, format: 'bool' },
  isScaleProduct: { id: 'isScaleProduct', label: 'Tartılı Ürün', defaultVisible: false, size: 100, format: 'bool' },
  followUpReminderDays: { id: 'followUpReminderDays', label: 'Takip Günü', defaultVisible: false, size: 100, format: 'number' },
  created_at: { id: 'created_at', label: 'Oluşturma Tarihi', defaultVisible: false, size: 150, format: 'date' },
  updated_at: { id: 'updated_at', label: 'Güncelleme Tarihi', defaultVisible: false, size: 150, format: 'date' },
};

export const PRODUCT_GRID_COLUMN_ORDER = Object.keys(PRODUCT_GRID_COLUMN_META);

export function defaultProductColumnVisibility(): Record<string, boolean> {
  return Object.fromEntries(
    PRODUCT_GRID_COLUMN_ORDER.map((id) => [id, PRODUCT_GRID_COLUMN_META[id].defaultVisible])
  );
}

/** localStorage: kayıtlı seçim + yeni kolonlar için varsayılan */
export function loadProductColumnVisibility(): Record<string, boolean> {
  const defaults = defaultProductColumnVisibility();
  try {
    const rawV2 = localStorage.getItem(PRODUCT_COLUMN_VISIBILITY_KEY);
    const rawV1 = localStorage.getItem('retailex_productManagement_columnVisibility');
    const raw = rawV2 ?? rawV1;
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Object.fromEntries(
      PRODUCT_GRID_COLUMN_ORDER.map((id) => [id, parsed[id] ?? defaults[id]])
    );
  } catch {
    return defaults;
  }
}

function formatCellValue(value: unknown, format: ColumnMeta['format']): string {
  if (value == null || String(value).trim() === '') return '—';
  switch (format) {
    case 'currency':
      return formatCurrency(Number(value), 2, false);
    case 'currencyUsd':
      return formatAmountWithCode(Number(value), 'USD', 2);
    case 'currencyEur':
      return formatAmountWithCode(Number(value), 'EUR', 2);
    case 'percent':
      return `%${value}`;
    case 'number':
      return String(Number(value));
    case 'bool':
      return value === true || value === 'true' || value === 1 ? 'Evet' : 'Hayır';
    case 'date': {
      const d = new Date(String(value));
      if (!Number.isFinite(d.getTime())) return '—';
      return d.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    default:
      return String(value);
  }
}

const columnHelper = createColumnHelper<Product>();

export function buildProductGridColumns(options: {
  columnVisibility: Record<string, boolean>;
  showPurchasePricing: boolean;
  labelOverrides?: Partial<Record<string, string>>;
}): ColumnDef<Product, unknown>[] {
  const { columnVisibility, showPurchasePricing, labelOverrides = {} } = options;

  return PRODUCT_GRID_COLUMN_ORDER.filter((id) => {
    const meta = PRODUCT_GRID_COLUMN_META[id];
    if (meta.purchaseOnly && !showPurchasePricing) return false;
    return columnVisibility[id] !== false;
  }).map((id) => {
    const meta = PRODUCT_GRID_COLUMN_META[id];
    const header = (labelOverrides[id] ?? meta.label).toUpperCase();

    return columnHelper.accessor(id as keyof Product, {
      id,
      header,
      size: meta.size,
      cell: (info) => {
        const raw = info.getValue();
        if (id === 'stock') {
          const stock = typeof raw === 'number' ? raw : Number(raw ?? 0);
          const safeStock = Number.isFinite(stock) ? stock : 0;
          return (
            <span className={safeStock < 10 ? 'text-red-600 font-medium' : 'text-gray-700'}>
              {safeStock}
            </span>
          );
        }
        if (id === 'totalSales') {
          return (
            <span className="text-green-600 font-medium font-bold">{raw || 0}</span>
          );
        }
        if (id === 'totalPurchased') {
          return (
            <span className="text-blue-600 font-medium font-bold">{raw || 0}</span>
          );
        }
        if (meta.format) {
          return formatCellValue(raw, meta.format);
        }
        return raw != null && String(raw).trim() !== '' ? String(raw) : '—';
      },
    });
  });
}

export function productColumnVisibilityMenuItems(options: {
  columnVisibility: Record<string, boolean>;
  showPurchasePricing: boolean;
}): { id: string; label: string; visible: boolean }[] {
  const { columnVisibility, showPurchasePricing } = options;
  return PRODUCT_GRID_COLUMN_ORDER.filter((id) => {
    const meta = PRODUCT_GRID_COLUMN_META[id];
    if (meta.purchaseOnly && !showPurchasePricing) return false;
    return true;
  }).map((id) => ({
    id,
    label: PRODUCT_GRID_COLUMN_META[id].label,
    visible: columnVisibility[id] !== false,
  }));
}
