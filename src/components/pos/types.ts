import type { Product, Customer, Campaign, ProductVariant } from '../../App';
export type { Product, Customer, Campaign, ProductVariant };

export interface CartItem {
  product: Product;
  quantity: number;
  discount: number;
  subtotal: number;
  variant?: ProductVariant;
  unit?: string;
  multiplier?: number;
  price?: number; // Overridden price
  /** Mutfak durumu — sadece Restoran POS'unda kullanılır */
  kitchenStatus?: 'pending' | 'cooking' | 'ready' | 'served';
}

export interface ParkedReceipt {
  id: string;
  receiptNumber: string;
  cart: CartItem[];
  customerName?: string;
  campaignName?: string;
  parkedAt: string;
  parkedBy: string;
}

export interface CompletedSale {
  id: string;
  items: CartItem[];
  customer: Customer | null;
  campaign: Campaign | null;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: 'cash' | 'card';
  cashAmount?: number;
  change?: number;
  discountReason?: string;
  timestamp: number;
  staff: string;
}

// Get unique colors for a product
export const getProductColors = (product: Product | null) => {
  if (!product || !product.variants) return [];
  return Array.from(new Set(product.variants.map(v => v.color).filter(Boolean))) as string[];
};

// Get unique sizes for a product (optionally filtered by color)
export const getProductSizes = (product: Product | null, color?: string | null) => {
  if (!product || !product.variants) return [];
  const filtered = color
    ? product.variants.filter(v => v.color === color)
    : product.variants;
  return Array.from(new Set(filtered.map(v => v.size).filter(Boolean))) as string[];
};

// Get stock for a specific variant
export const getVariantStock = (product: Product | null, color?: string | null, size?: string | null) => {
  if (!product || !product.variants) return 0;
  const variant = product.variants.find(v =>
    (!color || v.color === color) && (!size || v.size === size)
  );
  return variant?.stock || 0;
};

// Sale record type for POS history
export type SaleRecord = {
  id: string;
  receiptNumber: string;
  date: string;
  customerName?: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    discount: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  cashier: string;
};

// Payment type for POS
export type PaymentType = 'cash' | 'card' | 'gateway';


