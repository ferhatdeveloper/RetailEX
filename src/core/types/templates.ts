// Template Types for Invoice & Label Designer

export type TemplateType = 'invoice' | 'label';
export type TemplateFormat =
  | '80mm'
  | '58mm'
  | 'A5'
  | 'A4'
  | 'A3'
  | 'Letter'
  | 'Legal'
  | 'label-small'
  | 'label-medium'
  | 'label-large'
  | 'custom';
export type TemplateEngine = 'fastreport-like' | 'simple';
export type TemplateUsageScope =
  | 'global'
  | 'pos_receipt'
  | 'invoice_sales'
  | 'invoice_purchase'
  | 'invoice_return'
  | 'invoice_waybill'
  | 'invoice_service'
  | 'invoice_order'
  | 'invoice_quote'
  | 'product_bulk_label'
  | 'shelf_label'
  | 'warehouse_label';

export const TEMPLATE_USAGE_SCOPES: TemplateUsageScope[] = [
  'global',
  'pos_receipt',
  'invoice_sales',
  'invoice_purchase',
  'invoice_return',
  'invoice_waybill',
  'invoice_service',
  'invoice_order',
  'invoice_quote',
  'product_bulk_label',
  'shelf_label',
  'warehouse_label',
];

export const TEMPLATE_USAGE_SCOPE_LABELS: Record<TemplateUsageScope, string> = {
  global: 'Genel',
  pos_receipt: 'POS Fiş',
  invoice_sales: 'Satış Fatura',
  invoice_purchase: 'Alış Fatura',
  invoice_return: 'İade Fatura',
  invoice_waybill: 'İrsaliye',
  invoice_service: 'Hizmet Fatura',
  invoice_order: 'Sipariş Belgesi',
  invoice_quote: 'Teklif Belgesi',
  product_bulk_label: 'Toplu Ürün Etiketi',
  shelf_label: 'Raf Etiketi',
  warehouse_label: 'Depo Etiketi',
};

export interface TemplateElement {
  id: string;
  type: 'text' | 'image' | 'barcode' | 'qr' | 'line' | 'box' | 'table';
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  backgroundColor?: string;
  borderWidth?: number;
  borderColor?: string;
  // Dynamic fields
  field?: string; // e.g., '{{storeName}}', '{{total}}', '{{barcode}}'
  // Table specific
  columns?: string[];
  rows?: string[][];
}

export interface Template {
  id: string;
  name: string;
  type: TemplateType;
  description?: string;
  format: TemplateFormat;
  width: number; // in mm
  height: number; // in mm
  orientation: 'portrait' | 'landscape';
  engine?: TemplateEngine;
  usageScopes?: TemplateUsageScope[];
  defaultScopes?: TemplateUsageScope[];
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  elements: TemplateElement[];
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Predefined template formats
export const TEMPLATE_FORMATS: Record<TemplateFormat, { width: number; height: number; name: string }> = {
  '80mm': { width: 80, height: 297, name: '80mm Termal Fiş' },
  '58mm': { width: 58, height: 297, name: '58mm Termal Fiş' },
  A5: { width: 148, height: 210, name: 'A5' },
  A4: { width: 210, height: 297, name: 'A4' },
  A3: { width: 297, height: 420, name: 'A3' },
  Letter: { width: 216, height: 279, name: 'Letter (ABD)' },
  Legal: { width: 216, height: 356, name: 'Legal (ABD)' },
  'label-small': { width: 40, height: 25, name: 'Küçük Etiket (40×25 mm)' },
  'label-medium': { width: 60, height: 40, name: 'Orta Etiket (60×40 mm)' },
  'label-large': { width: 100, height: 60, name: 'Büyük Etiket (100×60 mm)' },
  custom: { width: 210, height: 297, name: 'Özel ölçü' },
};

// Dynamic field definitions
export const INVOICE_FIELDS = {
  // Store info
  '{{storeName}}': 'Mağaza Adı',
  '{{storeAddress}}': 'Mağaza Adresi',
  '{{storeTaxNo}}': 'Vergi No',
  '{{storePhone}}': 'Telefon',
  
  // Invoice info
  '{{invoiceNo}}': 'Fiş/Fatura No',
  '{{receiptNumber}}': 'Fiş Seri No',
  '{{date}}': 'Tarih',
  '{{time}}': 'Saat',
  
  // Customer info
  '{{customerName}}': 'Müşteri Adı',
  '{{customerPhone}}': 'Müşteri Telefon',
  '{{customerAddress}}': 'Müşteri Adres',
  '{{customerTaxNo}}': 'Müşteri Vergi No',
  
  // Totals
  '{{subtotal}}': 'Ara Toplam',
  '{{discount}}': 'İndirim',
  '{{tax}}': 'TAX',
  '{{total}}': 'Toplam',
  
  // Payment
  '{{paymentMethod}}': 'Ödeme Yöntemi',
  '{{cashier}}': 'Kasiyer',
  
  // Items table
  '{{items}}': 'Ürün Listesi (Tablo)',
};

export const LABEL_FIELDS = {
  '{{productName}}': 'Ürün Adı',
  '{{barcode}}': 'Barkod',
  '{{price}}': 'Fiyat',
  '{{category}}': 'Kategori',
  '{{stock}}': 'Stok',
  '{{sku}}': 'Ürün Kodu',
  '{{description}}': 'Açıklama',
  '{{variantCode}}': 'Varyant Kodu',
  '{{specialCode2}}': 'Özel Kod 2',
};

// Default templates
export const DEFAULT_TEMPLATES: Template[] = [
  // 80mm Thermal Receipt
  {
    id: 'default-80mm',
    name: 'Standart 80mm Fiş',
    description: 'Hızlı perakende tahsilatı için kompakt POS fişi',
    type: 'invoice',
    format: '80mm',
    width: 80,
    height: 297,
    orientation: 'portrait',
    engine: 'fastreport-like',
    usageScopes: ['global', 'pos_receipt'],
    margin: { top: 5, right: 5, bottom: 5, left: 5 },
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    elements: [
      {
        id: 'store-name',
        type: 'text',
        x: 40,
        y: 10,
        width: 60,
        height: 10,
        content: '{{storeName}}',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center'
      },
      {
        id: 'store-address',
        type: 'text',
        x: 40,
        y: 22,
        width: 60,
        height: 6,
        content: '{{storeAddress}}',
        fontSize: 10,
        textAlign: 'center'
      },
      {
        id: 'line-1',
        type: 'line',
        x: 10,
        y: 32,
        width: 60,
        height: 1,
        borderWidth: 1,
        borderColor: '#000000'
      },
      {
        id: 'invoice-no',
        type: 'text',
        x: 10,
        y: 38,
        width: 60,
        height: 6,
        content: 'Fiş No: {{receiptNumber}}',
        fontSize: 10
      },
      {
        id: 'date',
        type: 'text',
        x: 10,
        y: 45,
        width: 60,
        height: 6,
        content: 'Tarih: {{date}} {{time}}',
        fontSize: 10
      },
      {
        id: 'items-table',
        type: 'table',
        x: 10,
        y: 55,
        width: 60,
        height: 100,
        field: '{{items}}'
      },
      {
        id: 'total',
        type: 'text',
        x: 10,
        y: 160,
        width: 60,
        height: 8,
        content: 'TOPLAM: {{total}}',
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'right'
      }
    ]
  },
  
  // A4 Invoice
  {
    id: 'default-a4',
    name: 'Standart A4 Fatura',
    description: 'Kurumsal satış faturası şablonu',
    type: 'invoice',
    format: 'A4',
    width: 210,
    height: 297,
    orientation: 'portrait',
    engine: 'fastreport-like',
    usageScopes: ['global', 'invoice_sales', 'invoice_service'],
    defaultScopes: ['invoice_sales'],
    margin: { top: 15, right: 15, bottom: 15, left: 15 },
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    elements: [
      {
        id: 'store-info',
        type: 'text',
        x: 20,
        y: 20,
        width: 80,
        height: 30,
        content: '{{storeName}}\n{{storeAddress}}\nVergi No: {{storeTaxNo}}',
        fontSize: 12,
        textAlign: 'left'
      },
      {
        id: 'invoice-title',
        type: 'text',
        x: 105,
        y: 30,
        width: 80,
        height: 12,
        content: 'FATURA',
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center'
      },
      {
        id: 'invoice-details',
        type: 'text',
        x: 130,
        y: 20,
        width: 60,
        height: 20,
        content: 'Fatura No: {{invoiceNo}}\nTarih: {{date}}',
        fontSize: 10,
        textAlign: 'right'
      },
      {
        id: 'customer-info',
        type: 'box',
        x: 20,
        y: 60,
        width: 80,
        height: 30,
        borderWidth: 1,
        borderColor: '#000000'
      },
      {
        id: 'customer-text',
        type: 'text',
        x: 25,
        y: 65,
        width: 70,
        height: 20,
        content: 'Müşteri:\n{{customerName}}\n{{customerAddress}}',
        fontSize: 10
      },
      {
        id: 'items-table',
        type: 'table',
        x: 20,
        y: 100,
        width: 170,
        height: 120,
        field: '{{items}}'
      },
      {
        id: 'totals-box',
        type: 'box',
        x: 140,
        y: 230,
        width: 50,
        height: 30,
        borderWidth: 1,
        borderColor: '#000000'
      },
      {
        id: 'totals-text',
        type: 'text',
        x: 145,
        y: 235,
        width: 40,
        height: 20,
        content: 'Ara Toplam: {{subtotal}}\nTAX: {{tax}}\nTOPLAM: {{total}}',
        fontSize: 10,
        fontWeight: 'bold',
        textAlign: 'right'
      }
    ]
  },
  
  // Product Label
  {
    id: 'default-label',
    name: 'Standart Ürün Etiketi',
    description: 'Ürün barkod ve fiyat etiketleri için genel şablon',
    type: 'label',
    format: 'label-medium',
    width: 60,
    height: 40,
    orientation: 'landscape',
    engine: 'fastreport-like',
    usageScopes: ['global', 'product_bulk_label', 'shelf_label', 'warehouse_label'],
    defaultScopes: ['product_bulk_label'],
    margin: { top: 2, right: 2, bottom: 2, left: 2 },
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    elements: [
      {
        id: 'product-name',
        type: 'text',
        x: 5,
        y: 5,
        width: 50,
        height: 8,
        content: '{{productName}}',
        fontSize: 12,
        fontWeight: 'bold',
        textAlign: 'center'
      },
      {
        id: 'barcode',
        type: 'barcode',
        x: 10,
        y: 15,
        width: 40,
        height: 15,
        content: '{{barcode}}'
      },
      {
        id: 'price',
        type: 'text',
        x: 5,
        y: 32,
        width: 50,
        height: 6,
        content: '{{price}}',
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center'
      }
    ]
  },
  {
    id: 'modern-sales-invoice',
    name: 'Modern Satış Faturası',
    description: 'Minimal ve yüksek okunabilirlikte satış faturası düzeni',
    type: 'invoice',
    format: 'A4',
    width: 210,
    height: 297,
    orientation: 'portrait',
    engine: 'fastreport-like',
    usageScopes: ['global', 'invoice_sales', 'invoice_service'],
    defaultScopes: ['invoice_service'],
    margin: { top: 12, right: 12, bottom: 12, left: 12 },
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    elements: [
      { id: 'msi-logo', type: 'image', x: 15, y: 12, width: 30, height: 16 },
      { id: 'msi-title', type: 'text', x: 130, y: 12, width: 65, height: 12, content: 'SATIŞ FATURASI', fontSize: 18, fontWeight: 'bold', textAlign: 'right' },
      { id: 'msi-headline', type: 'line', x: 15, y: 30, width: 180, height: 1, borderWidth: 1, borderColor: '#111827' },
      { id: 'msi-store', type: 'text', x: 15, y: 34, width: 90, height: 18, content: '{{storeName}}\n{{storeAddress}}\n{{storePhone}}', fontSize: 10 },
      { id: 'msi-meta', type: 'text', x: 120, y: 34, width: 75, height: 18, content: 'Belge No: {{invoiceNo}}\nTarih: {{date}} {{time}}\nKasiyer: {{cashier}}', fontSize: 10, textAlign: 'right' },
      { id: 'msi-customer-box', type: 'box', x: 15, y: 58, width: 180, height: 24, borderWidth: 1, borderColor: '#D1D5DB' },
      { id: 'msi-customer', type: 'text', x: 18, y: 62, width: 170, height: 16, content: 'Müşteri: {{customerName}}\nAdres: {{customerAddress}}', fontSize: 10 },
      { id: 'msi-items', type: 'table', x: 15, y: 88, width: 180, height: 130, field: '{{items}}' },
      { id: 'msi-totals-box', type: 'box', x: 118, y: 224, width: 77, height: 44, borderWidth: 1, borderColor: '#D1D5DB' },
      { id: 'msi-totals', type: 'text', x: 122, y: 228, width: 68, height: 36, content: 'Ara Toplam: {{subtotal}}\nİndirim: {{discount}}\nVergi: {{tax}}\nGenel Toplam: {{total}}', fontSize: 10, fontWeight: 'bold', textAlign: 'right' },
      { id: 'msi-footer', type: 'text', x: 15, y: 275, width: 180, height: 8, content: 'Bu belge RetailEX Dizayn Merkezi ile oluşturulmuştur.', fontSize: 9, textAlign: 'center' }
    ]
  },
  {
    id: 'purchase-vendor-invoice',
    name: 'Tedarikçi Alış Faturası',
    description: 'Alış faturaları için tedarikçi odaklı şablon',
    type: 'invoice',
    format: 'A4',
    width: 210,
    height: 297,
    orientation: 'portrait',
    engine: 'fastreport-like',
    usageScopes: ['global', 'invoice_purchase'],
    defaultScopes: ['invoice_purchase'],
    margin: { top: 12, right: 12, bottom: 12, left: 12 },
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    elements: [
      { id: 'pvi-title', type: 'text', x: 15, y: 12, width: 180, height: 12, content: 'ALIŞ FATURASI', fontSize: 18, fontWeight: 'bold', textAlign: 'left' },
      { id: 'pvi-doc', type: 'text', x: 15, y: 28, width: 180, height: 10, content: 'Belge: {{invoiceNo}} · Tarih: {{date}}', fontSize: 11 },
      { id: 'pvi-supplier-box', type: 'box', x: 15, y: 42, width: 180, height: 26, borderWidth: 1, borderColor: '#D1D5DB' },
      { id: 'pvi-supplier', type: 'text', x: 18, y: 46, width: 170, height: 16, content: 'Tedarikçi: {{customerName}}\nVergi No: {{customerTaxNo}}', fontSize: 10 },
      { id: 'pvi-items', type: 'table', x: 15, y: 74, width: 180, height: 146, field: '{{items}}' },
      { id: 'pvi-total-line', type: 'line', x: 120, y: 226, width: 75, height: 1, borderWidth: 1, borderColor: '#111827' },
      { id: 'pvi-total', type: 'text', x: 120, y: 230, width: 75, height: 24, content: 'Toplam: {{total}}\nÖdeme: {{paymentMethod}}', fontSize: 12, fontWeight: 'bold', textAlign: 'right' }
    ]
  },
  {
    id: 'dispatch-waybill-classic',
    name: 'İrsaliye Klasik',
    description: 'Sevk ve transfer belgeleri için çizgisel irsaliye',
    type: 'invoice',
    format: 'A5',
    width: 148,
    height: 210,
    orientation: 'portrait',
    engine: 'fastreport-like',
    usageScopes: ['global', 'invoice_waybill', 'invoice_return', 'invoice_order', 'invoice_quote'],
    defaultScopes: ['invoice_waybill', 'invoice_return', 'invoice_order', 'invoice_quote'],
    margin: { top: 8, right: 8, bottom: 8, left: 8 },
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    elements: [
      { id: 'dwc-title', type: 'text', x: 10, y: 8, width: 128, height: 10, content: 'SEVK / İRSALİYE BELGESİ', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
      { id: 'dwc-no', type: 'text', x: 10, y: 22, width: 128, height: 8, content: 'Belge No: {{invoiceNo}} · {{date}}', fontSize: 10, textAlign: 'center' },
      { id: 'dwc-customer', type: 'text', x: 10, y: 34, width: 128, height: 14, content: 'Firma: {{customerName}}\nAdres: {{customerAddress}}', fontSize: 9 },
      { id: 'dwc-items', type: 'table', x: 10, y: 52, width: 128, height: 110, field: '{{items}}' },
      { id: 'dwc-signature-line', type: 'line', x: 78, y: 182, width: 60, height: 1, borderWidth: 1, borderColor: '#111827' },
      { id: 'dwc-signature', type: 'text', x: 78, y: 185, width: 60, height: 8, content: 'Teslim Alan İmza', fontSize: 8, textAlign: 'center' }
    ]
  },
  {
    id: 'promo-badge-label',
    name: 'Promosyon Rozet Etiket',
    description: 'İndirimli ürünler için dikkat çekici fiyat etiketi',
    type: 'label',
    format: 'label-large',
    width: 100,
    height: 60,
    orientation: 'landscape',
    engine: 'fastreport-like',
    usageScopes: ['global', 'product_bulk_label', 'warehouse_label'],
    margin: { top: 2, right: 2, bottom: 2, left: 2 },
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    elements: [
      { id: 'pbl-badge', type: 'box', x: 2, y: 2, width: 26, height: 18, borderWidth: 1, borderColor: '#DC2626', backgroundColor: '#FEE2E2' },
      { id: 'pbl-badge-text', type: 'text', x: 3, y: 7, width: 24, height: 8, content: 'FIRSAT', fontSize: 11, fontWeight: 'bold', textAlign: 'center', color: '#991B1B' },
      { id: 'pbl-name', type: 'text', x: 30, y: 6, width: 66, height: 12, content: '{{productName}}', fontSize: 12, fontWeight: 'bold' },
      { id: 'pbl-barcode', type: 'barcode', x: 6, y: 24, width: 88, height: 20, field: '{{barcode}}' },
      { id: 'pbl-price', type: 'text', x: 6, y: 46, width: 88, height: 10, content: '{{price}}', fontSize: 18, fontWeight: 'bold', textAlign: 'right' }
    ]
  },
  {
    id: 'shelf-compact-label',
    name: 'Raf Kompakt Etiket',
    description: 'Raf önü hızlı okuma için kompakt etiket',
    type: 'label',
    format: 'label-small',
    width: 40,
    height: 25,
    orientation: 'landscape',
    engine: 'fastreport-like',
    usageScopes: ['global', 'shelf_label'],
    defaultScopes: ['shelf_label'],
    margin: { top: 1, right: 1, bottom: 1, left: 1 },
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    elements: [
      { id: 'scl-name', type: 'text', x: 1, y: 2, width: 38, height: 7, content: '{{productName}}', fontSize: 7, fontWeight: 'bold', textAlign: 'center' },
      { id: 'scl-barcode', type: 'barcode', x: 2, y: 10, width: 36, height: 9, field: '{{barcode}}' },
      { id: 'scl-price', type: 'text', x: 1, y: 20, width: 38, height: 4, content: '{{price}}', fontSize: 9, fontWeight: 'bold', textAlign: 'center' }
    ]
  }
];

