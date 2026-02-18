// Template Types for Invoice & Label Designer

export type TemplateType = 'invoice' | 'label';
export type TemplateFormat = '80mm' | 'A5' | 'A4' | 'label-small' | 'label-medium' | 'label-large';

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
  format: TemplateFormat;
  width: number; // in mm
  height: number; // in mm
  orientation: 'portrait' | 'landscape';
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
  'A5': { width: 148, height: 210, name: 'A5 Fatura' },
  'A4': { width: 210, height: 297, name: 'A4 Fatura' },
  'label-small': { width: 40, height: 25, name: 'Küçük Etiket (40x25mm)' },
  'label-medium': { width: 60, height: 40, name: 'Orta Etiket (60x40mm)' },
  'label-large': { width: 100, height: 60, name: 'Büyük Etiket (100x60mm)' }
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
};

// Default templates
export const DEFAULT_TEMPLATES: Template[] = [
  // 80mm Thermal Receipt
  {
    id: 'default-80mm',
    name: 'Standart 80mm Fiş',
    type: 'invoice',
    format: '80mm',
    width: 80,
    height: 297,
    orientation: 'portrait',
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
        content: 'TOPLAM: {{total}} TL',
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
    type: 'invoice',
    format: 'A4',
    width: 210,
    height: 297,
    orientation: 'portrait',
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
        content: 'Ara Toplam: {{subtotal}}\nTAX: {{tax}}\nTOPLAM: {{total}} TL',
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
    type: 'label',
    format: 'label-medium',
    width: 60,
    height: 40,
    orientation: 'landscape',
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
        content: '{{price}} TL',
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center'
      }
    ]
  }
];

