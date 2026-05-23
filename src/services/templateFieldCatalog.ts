import type { TemplateType } from '../core/types/templates';
import { INVOICE_FIELDS, LABEL_FIELDS } from '../core/types/templates';
import { formatNumber } from '../utils/formatNumber';

export type TemplateFieldCategory =
  | 'store'
  | 'document'
  | 'customer'
  | 'totals'
  | 'payment'
  | 'items'
  | 'product'
  | 'other';

export interface TemplateFieldDef {
  token: string;
  label: string;
  category: TemplateFieldCategory;
  sampleValue: string;
  description?: string;
  /** interpolateTemplateText için anahtar ({{ }} olmadan) */
  dataKey: string;
}

export const TEMPLATE_FIELD_CATEGORY_LABELS: Record<TemplateFieldCategory, string> = {
  store: 'Mağaza / Firma',
  document: 'Belge',
  customer: 'Cari / Müşteri',
  totals: 'Toplamlar',
  payment: 'Ödeme',
  items: 'Satır kalemleri',
  product: 'Ürün',
  other: 'Diğer',
};

function tokenToDataKey(token: string): string {
  return token.replace(/^\{\{|\}\}$/g, '').trim();
}

const INVOICE_FIELD_META: Record<string, { category: TemplateFieldCategory; sample: string; description?: string }> = {
  '{{storeName}}': { category: 'store', sample: 'RetailEX Demo Mağaza' },
  '{{storeAddress}}': { category: 'store', sample: 'Atatürk Cad. No:12, İstanbul' },
  '{{storeTaxNo}}': { category: 'store', sample: '1234567890' },
  '{{storePhone}}': { category: 'store', sample: '+90 212 555 01 00' },
  '{{invoiceNo}}': { category: 'document', sample: 'FT-2026-0042' },
  '{{receiptNumber}}': { category: 'document', sample: 'A00000042' },
  '{{date}}': { category: 'document', sample: new Date().toLocaleDateString('tr-TR') },
  '{{time}}': { category: 'document', sample: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
  '{{customerName}}': { category: 'customer', sample: 'Örnek Müşteri A.Ş.' },
  '{{customerPhone}}': { category: 'customer', sample: '+90 532 000 00 00' },
  '{{customerAddress}}': { category: 'customer', sample: 'Sanayi Mah. 5. Sok. No:3' },
  '{{customerTaxNo}}': { category: 'customer', sample: '9876543210' },
  '{{subtotal}}': { category: 'totals', sample: formatNumber(1180, 2, true) },
  '{{discount}}': { category: 'totals', sample: formatNumber(80, 2, true) },
  '{{tax}}': { category: 'totals', sample: formatNumber(212.4, 2, true) },
  '{{total}}': { category: 'totals', sample: formatNumber(1312.4, 2, true) },
  '{{paymentMethod}}': { category: 'payment', sample: 'Nakit' },
  '{{cashier}}': { category: 'payment', sample: 'Admin Kullanıcı' },
  '{{items}}': {
    category: 'items',
    sample: '(tablo)',
    description: 'Satır listesi — tablo öğesinde kullanın',
  },
};

const INVOICE_ITEM_FIELDS: TemplateFieldDef[] = [
  {
    token: '{{item.productName}}',
    label: 'Satır — Ürün adı',
    category: 'items',
    sampleValue: 'Örnek Ürün A',
    description: 'İlk satır için örnek; tabloda tüm satırlar listelenir',
    dataKey: 'item.productName',
  },
  {
    token: '{{item.quantity}}',
    label: 'Satır — Miktar',
    category: 'items',
    sampleValue: '2',
    dataKey: 'item.quantity',
  },
  {
    token: '{{item.unitPrice}}',
    label: 'Satır — Birim fiyat',
    category: 'items',
    sampleValue: formatNumber(125.5, 2, true),
    dataKey: 'item.unitPrice',
  },
  {
    token: '{{item.total}}',
    label: 'Satır — Satır tutarı',
    category: 'items',
    sampleValue: formatNumber(251, 2, true),
    dataKey: 'item.total',
  },
];

const LABEL_FIELD_META: Record<string, { category: TemplateFieldCategory; sample: string; description?: string }> = {
  '{{productName}}': { category: 'product', sample: 'Organik Zeytinyağı 500ml' },
  '{{barcode}}': { category: 'product', sample: '8690123456789' },
  '{{price}}': { category: 'product', sample: '149,90 ₺' },
  '{{category}}': { category: 'product', sample: 'Gıda' },
  '{{stock}}': { category: 'product', sample: '42' },
  '{{sku}}': { category: 'product', sample: 'URN-00142' },
  '{{description}}': { category: 'product', sample: 'Soğuk sıkım, cam şişe' },
  '{{variantCode}}': { category: 'product', sample: 'V-500' },
  '{{specialCode2}}': { category: 'product', sample: 'RAF-A3' },
};

function buildFromLegacyMap(
  legacy: Record<string, string>,
  meta: Record<string, { category: TemplateFieldCategory; sample: string; description?: string }>,
): TemplateFieldDef[] {
  return Object.entries(legacy).map(([token, label]) => {
    const m = meta[token] ?? { category: 'other' as TemplateFieldCategory, sample: label };
    return {
      token,
      label,
      category: m.category,
      sampleValue: m.sample,
      description: m.description,
      dataKey: tokenToDataKey(token),
    };
  });
}

export function getTemplateFieldCatalog(type: TemplateType): TemplateFieldDef[] {
  if (type === 'invoice') {
    return [...buildFromLegacyMap(INVOICE_FIELDS, INVOICE_FIELD_META), ...INVOICE_ITEM_FIELDS];
  }
  const base = buildFromLegacyMap(LABEL_FIELDS, LABEL_FIELD_META);
  const extra: TemplateFieldDef[] = [
    {
      token: '{{variantCode}}',
      label: 'Varyant kodu',
      category: 'product',
      sampleValue: 'V-500',
      dataKey: 'variantCode',
    },
    {
      token: '{{specialCode2}}',
      label: 'Özel kod 2',
      category: 'product',
      sampleValue: 'RAF-A3',
      dataKey: 'specialCode2',
    },
  ];
  const seen = new Set(base.map((f) => f.token));
  for (const e of extra) {
    if (!seen.has(e.token)) base.push(e);
  }
  return base;
}

export function buildDemoInvoicePreviewContext(): Record<string, unknown> {
  const items = [
    {
      productName: 'Kablosuz Mouse',
      quantity: 2,
      unitPrice: 349.9,
      total: 699.8,
      code: 'URN-M01',
    },
    {
      productName: 'USB-C Hub',
      quantity: 1,
      unitPrice: 480.2,
      total: 480.2,
      code: 'URN-H02',
    },
  ];
  const first = items[0]!;
  return {
    storeName: 'RetailEX Demo Mağaza',
    storeAddress: 'Atatürk Cad. No:12, Kadıköy / İstanbul',
    storeTaxNo: '1234567890',
    storePhone: '+90 212 555 01 00',
    invoiceNo: 'FT-2026-0042',
    receiptNumber: 'A00000042',
    date: new Date().toLocaleDateString('tr-TR'),
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    customerName: 'Örnek Müşteri A.Ş.',
    customerPhone: '+90 532 000 00 00',
    customerAddress: 'Sanayi Mah. 5. Sok. No:3, İstanbul',
    customerTaxNo: '9876543210',
    subtotal: formatNumber(1180, 2, true),
    discount: formatNumber(80, 2, true),
    tax: formatNumber(212.4, 2, true),
    total: formatNumber(1312.4, 2, true),
    paymentMethod: 'Nakit',
    cashier: 'Admin',
    items,
    item: first,
    barcode: '8690123456789',
    price: formatNumber(1312.4, 2, true),
  };
}

export function buildDemoLabelPreviewContext(): Record<string, unknown> {
  return {
    productName: 'Organik Zeytinyağı 500ml',
    barcode: '8690123456789',
    price: '149,90 ₺',
    category: 'Gıda',
    stock: '42',
    sku: 'URN-00142',
    description: 'Soğuk sıkım, cam şişe',
    variantCode: 'V-500',
    specialCode2: 'RAF-A3',
  };
}
