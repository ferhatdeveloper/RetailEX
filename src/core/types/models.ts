// Core Business Models

export interface BranchStock {
  branchId: string;
  branchName: string;
  stock: number;
}

export interface BranchVariantStock {
  branchId: string;
  branchName: string;
  variants: {
    variantId: string;
    color?: string;
    size?: string;
    stock: number;
  }[];
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  price: number;
  cost: number;
  stock: number;
  category: string;
  categoryId?: string;
  unit: string;
  taxRate: number;
  variants?: ProductVariant[];
  branchStocks?: BranchStock[];
  branchVariantStocks?: BranchVariantStock[];
  hasVariants?: boolean;
  totalPurchased?: number;
  totalSales?: number;
  // Missing fields fixed for linting
  code?: string;
  minStock?: number;
  min_stock?: number;
  max_stock?: number;
  image_url?: string;
  sku?: string;
  description?: string;
  // Multilingual descriptions
  description_tr?: string;
  description_en?: string;
  description_ar?: string;
  description_ku?: string;
  is_active?: boolean;
  isActive?: boolean;
  created_at?: string;
  updated_at?: string;
  materialType?: 'commercial_goods' | 'mixed_parcel' | 'deposit_goods' | 'fixed_asset' | 'raw_material' | 'semi_finished' | 'consumable';
  // Additional fields for professional ERP
  categoryCode?: string;
  groupCode?: string;
  subGroupCode?: string;
  brand?: string;
  model?: string;
  manufacturer?: string;
  supplier?: string;
  origin?: string;
  specialCode1?: string;
  specialCode2?: string;
  specialCode3?: string;
  specialCode4?: string;
  specialCode5?: string;
  specialCode6?: string;
  unit2?: string;
  unit3?: string;
  taxType?: string;
  withholdingRate?: number;
  currency?: string;
  purchasePriceUSD?: number;
  purchasePriceEUR?: number;
  salePriceUSD?: number;
  salePriceEUR?: number;
  criticalStock?: number;
  shelfLocation?: string;
  warehouseCode?: string;
  priceList1?: number;
  priceList2?: number;
  priceList3?: number;
  priceList4?: number;
  priceList5?: number;
  priceList6?: number;
}

export interface ProductVariant {
  id: string;
  code: string;
  size?: string;
  color?: string;
  stock: number;
  barcode: string;
  price?: number;
  cost?: number;  // Alış fiyatı (her varyantın kendi alış fiyatı olabilir)
  colorHex?: string;
}

export interface Customer {
  id: string;
  code?: string;        // Müşteri kodu (MUS-001, MUS-002, vb.)
  title?: string;       // Müşteri ünvanı (iş unvanı)
  company?: string;     // Şirket adı
  name: string;
  phone: string;
  phone2?: string;      // İkinci telefon
  email: string;
  address: string;
  district?: string;    // İlçe
  city?: string;        // Şehir bilgisi
  postal_code?: string; // Posta kodu
  country?: string;     // Ülke
  balance?: number;     // Bakiye
  totalPurchases: number;
  lastPurchase?: string;
  points?: number;
  totalSpent?: number;
  discount_rate?: number;
  customer_group?: string;
  tax_number?: string;
  taxNumber?: string;
  tax_office?: string;
  taxOffice?: string;
  notes?: string;
  is_active?: boolean;
  firma_id?: string;
  created_at?: string;
  updated_at?: string;
  cardType?: 'customer' | 'supplier';
}

export interface Supplier {
  id: string;
  code?: string;        // Tedarikçi kodu (TED-001, vb.)
  name: string;
  phone?: string;
  phone2?: string;
  email?: string;
  address?: string;
  district?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  contact_person?: string;
  contact_person_phone?: string;
  payment_terms?: number; // Ödeme vadesi (gün)
  credit_limit?: number;
  balance?: number;
  tax_number?: string;
  taxNumber?: string;
  tax_office?: string;
  taxOffice?: string;
  is_active?: boolean;
  notes?: string;
  firma_id?: string;
  created_at?: string;
  updated_at?: string;
  cardType?: 'customer' | 'supplier';
}

export interface Sale {
  id: string;
  receiptNumber: string;
  date: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  tax?: number;
  total: number;
  paymentMethod: string;
  paymentStatus?: 'pending' | 'paid' | 'refunded';
  status?: string;  // 'completed' | 'refunded' | 'cancelled'
  notes?: string;
  campaignId?: string;
  campaignName?: string;      // Kampanya adı
  campaignDiscount?: number;  // Kampanya indirimi
  cashier: string;
  table?: string;
  discountReason?: string;
  cashAmount?: number;
  change?: number;
  storeId?: string;
  userId?: string;
  firmNr?: string;
  periodNr?: string;
  created_at?: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  barcode?: string;
  quantity: number;
  price: number;
  discount: number;
  tax?: number;
  total: number;
  variant?: ProductVariant;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  type: 'percentage' | 'fixed' | 'buy-x-get-y' | 'category';
  discountType?: 'percentage' | 'fixed' | 'buyXgetY' | 'priceOverride';
  discountValue: number;
  startDate: string;
  endDate: string;
  campaignUnit?: string;
  active: boolean;
  autoApply?: boolean;
  minPurchase?: number;
  categoryId?: string;
  productIds?: string[];
  // Extended fields from CreateCampaignPage
  campaignType?: 'product' | 'category' | 'cart' | 'customer';
  maxDiscountAmount?: number;
  minPurchaseAmount?: number;
  startTime?: string;
  endTime?: string;
  selectedCategories?: string[];
  customerSegments?: string[];
  applyToAllCustomers?: boolean;
  usageLimit?: number;
  usageLimitPerCustomer?: number;
  stackable?: boolean;
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  buyQuantity?: number;
  getQuantity?: number;
  createdAt?: string;
  updatedAt?: string;
  priority?: number;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: 'cashier' | 'manager' | 'admin';
  discountLimit?: number; // Maksimum indirim yüzdesi (cashier için 10%, manager için 25%, admin sınırsız)
  storeId?: string;
  storeName?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  discount: number;
  subtotal: number;
  variant?: ProductVariant;
}

export type Module = 'pos' | 'management';
export type ManagementScreen = 'products' | 'customers' | 'reports' | 'settings';

export type PaymentMethod = 'cash' | 'card' | 'online' | 'veresiye';
export type DiscountType = 'percentage' | 'fixed';

export interface PurchaseRequestItem {
  id: string;
  productId?: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  requestedDeliveryDate: string;
  estimatedBudget?: number;
  projectCode?: string;
  costCenter?: string;
  description?: string;
  status: 'draft' | 'pending' | 'approved' | 'transferred' | 'purchased' | 'partially_fulfilled' | 'completed' | 'cancelled';
}

export interface PurchaseRequest {
  id: string;
  requestNo: string;
  date: string;
  department: string;
  requesterPerson: string;
  priority: 'normal' | 'urgent' | 'critical';
  description: string;
  status: 'draft' | 'pending' | 'approved' | 'transferred' | 'purchased' | 'partially_fulfilled' | 'completed' | 'cancelled';
  items: PurchaseRequestItem[];
  totalBudget?: number;
  projectCode?: string;
  costCenter?: string;
  branchId?: string;
  paymentMethod?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Invoice {
  id?: string;
  invoice_no: string;
  invoice_date: string;
  invoice_type: number;
  invoice_category: 'Satis' | 'Alis' | 'Iade' | 'Irsaliye' | 'Siparis' | 'Teklif' | 'Hizmet';
  customer_id?: string;
  customer_name?: string;
  supplier_id?: string;
  supplier_name?: string;
  total_amount: number;
  total?: number;
  total_cost?: number;
  gross_profit?: number;
  profit_margin?: number;
  subtotal: number;
  discount: number;
  tax: number;
  items: any[];
  firma_id: string;
  firma_name: string;
  donem_id: string;
  donem_name: string;
  cashier?: string;
  cashier_id?: string;
  cash_register_id?: string;
  payment_method?: string;
  status?: string;
  notes?: string;
  created_at?: string;
  campaign_id?: string;
  campaign_name?: string;
  campaign_discount?: number;
  currency?: string;
  currency_rate?: number;
  source?: 'pos' | 'invoice';
}

