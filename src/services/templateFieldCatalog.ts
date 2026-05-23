import type { TemplateType } from '../core/types/templates';
import { INVOICE_FIELDS, LABEL_FIELDS } from '../core/types/templates';
import { formatNumber } from '../utils/formatNumber';
import { loadCustomTemplateFields } from './templateCustomFieldsStorage';

export type TemplateFieldCategory =
  | 'store'
  | 'firm'
  | 'document'
  | 'customer'
  | 'totals'
  | 'payment'
  | 'items'
  | 'product'
  | 'database'
  | 'other';

export type TemplateFieldSource = 'builtin' | 'database' | 'custom';

export interface TemplateFieldDef {
  token: string;
  label: string;
  category: TemplateFieldCategory;
  sampleValue: string;
  description?: string;
  /** interpolateTemplateText için anahtar ({{ }} olmadan) */
  dataKey: string;
  source?: TemplateFieldSource;
  tableName?: string;
  columnName?: string;
  dataType?: string;
}

export const TEMPLATE_FIELD_CATEGORY_LABELS: Record<TemplateFieldCategory, string> = {
  store: 'Mağaza',
  firm: 'Firma / Dönem',
  document: 'Belge',
  customer: 'Cari / Müşteri',
  totals: 'Toplamlar',
  payment: 'Ödeme',
  items: 'Satır kalemleri',
  product: 'Ürün',
  database: 'Veritabanı',
  other: 'Diğer',
};

function tokenToDataKey(token: string): string {
  return token.replace(/^\{\{|\}\}$/g, '').trim();
}

function field(
  token: string,
  label: string,
  category: TemplateFieldCategory,
  sample: string,
  description?: string,
): TemplateFieldDef {
  return {
    token,
    label,
    category,
    sampleValue: sample,
    description,
    dataKey: tokenToDataKey(token),
    source: 'builtin',
  };
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

const INVOICE_EXTENDED: TemplateFieldDef[] = [
  field('{{ficheNo}}', 'Fiş no (fiche_no)', 'document', 'A00000042'),
  field('{{documentNo}}', 'Belge no', 'document', 'BLG-2026-12'),
  field('{{ficheType}}', 'Fiş tipi', 'document', 'sales_invoice'),
  field('{{trcode}}', 'İşlem kodu (trcode)', 'document', '8'),
  field('{{status}}', 'Belge durumu', 'document', 'completed'),
  field('{{notes}}', 'Notlar', 'document', 'Teslimat 14:00'),
  field('{{currency}}', 'Para birimi', 'document', 'TRY'),
  field('{{currencyRate}}', 'Kur', 'document', '1'),
  field('{{firmNr}}', 'Firma no', 'firm', '001'),
  field('{{periodNr}}', 'Dönem no', 'firm', '01'),
  field('{{totalNet}}', 'Net toplam (total_net)', 'totals', formatNumber(1180, 2, true)),
  field('{{totalVat}}', 'KDV toplam', 'totals', formatNumber(212.4, 2, true)),
  field('{{totalGross}}', 'Brüt toplam', 'totals', formatNumber(1392.4, 2, true)),
  field('{{totalDiscount}}', 'İndirim toplam', 'totals', formatNumber(80, 2, true)),
  field('{{netAmount}}', 'Net tahsilat', 'totals', formatNumber(1312.4, 2, true)),
  field('{{totalCost}}', 'Toplam maliyet', 'totals', formatNumber(900, 2, true)),
  field('{{grossProfit}}', 'Brüt kâr', 'totals', formatNumber(412.4, 2, true)),
  field('{{profitMargin}}', 'Kâr marjı %', 'totals', '26,2'),
  field('{{creditAmount}}', 'Veresiye tutarı', 'payment', formatNumber(0, 2, true)),
  field('{{isCancelled}}', 'İptal mi', 'document', 'Hayır'),
  field('{{logoSyncStatus}}', 'Logo senkron durumu', 'document', 'pending'),
  field('{{customerCode}}', 'Cari kodu', 'customer', 'C-001'),
  field('{{customerEmail}}', 'Cari e-posta', 'customer', 'info@ornek.com'),
  field('{{customerCity}}', 'Cari şehir', 'customer', 'İstanbul'),
  field('{{customerBalance}}', 'Cari bakiye', 'customer', formatNumber(0, 2, true)),
  field('{{supplierName}}', 'Tedarikçi adı', 'customer', 'Tedarikçi Ltd.'),
  field('{{storeCode}}', 'Mağaza kodu', 'store', 'MG-01'),
  field('{{sales.fiche_no}}', 'DB: sales.fiche_no', 'database', 'A00000042', 'Veritabanı satış başlığı'),
  field('{{sales.net_amount}}', 'DB: sales.net_amount', 'database', formatNumber(1312.4, 2, true)),
  field('{{invoice.fiche_no}}', 'DB: invoice.fiche_no', 'database', 'A00000042'),
];

const INVOICE_ITEM_FIELDS: TemplateFieldDef[] = [
  field('{{item.productName}}', 'Satır — Ürün adı', 'items', 'Örnek Ürün A', 'İlk satır; tabloda tüm satırlar'),
  field('{{item.quantity}}', 'Satır — Miktar', 'items', '2'),
  field('{{item.unit}}', 'Satır — Birim', 'items', 'Adet'),
  field('{{item.unitPrice}}', 'Satır — Birim fiyat', 'items', formatNumber(125.5, 2, true)),
  field('{{item.vatRate}}', 'Satır — KDV %', 'items', '20'),
  field('{{item.discountRate}}', 'Satır — İndirim %', 'items', '5'),
  field('{{item.discountAmount}}', 'Satır — İndirim tutarı', 'items', formatNumber(12.5, 2, true)),
  field('{{item.total}}', 'Satır — Tutar', 'items', formatNumber(251, 2, true)),
  field('{{item.itemCode}}', 'Satır — Stok kodu', 'items', 'URN-001'),
  field('{{item.itemName}}', 'Satır — Kalem adı (DB)', 'items', 'Kablosuz Mouse'),
  field('{{line.item_code}}', 'DB: line.item_code', 'items', 'URN-001'),
  field('{{line.net_amount}}', 'DB: line.net_amount', 'items', formatNumber(251, 2, true)),
  field('{{sale_items.quantity}}', 'DB: sale_items.quantity', 'database', '2'),
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

const LABEL_EXTENDED: TemplateFieldDef[] = [
  field('{{code}}', 'Ürün kodu', 'product', 'URN-00142'),
  field('{{name}}', 'Ürün adı (name)', 'product', 'Organik Zeytinyağı'),
  field('{{name2}}', 'Ürün adı 2', 'product', '500ml cam'),
  field('{{brand}}', 'Marka', 'product', 'Ege Naturals'),
  field('{{model}}', 'Model', 'product', '500-CAM'),
  field('{{manufacturer}}', 'Üretici', 'product', 'Ege Gıda'),
  field('{{categoryCode}}', 'Kategori kodu', 'product', 'GID-01'),
  field('{{groupCode}}', 'Grup kodu', 'product', 'YAG'),
  field('{{unit}}', 'Birim', 'product', 'Adet'),
  field('{{vatRate}}', 'KDV oranı', 'product', '20'),
  field('{{cost}}', 'Maliyet', 'product', formatNumber(95, 2, true)),
  field('{{minStock}}', 'Min stok', 'product', '5'),
  field('{{maxStock}}', 'Max stok', 'product', '200'),
  field('{{criticalStock}}', 'Kritik stok', 'product', '10'),
  field('{{purchasePrice}}', 'Alış fiyatı', 'product', formatNumber(95, 2, true)),
  field('{{priceList1}}', 'Fiyat listesi 1', 'product', formatNumber(149.9, 2, true)),
  field('{{priceList2}}', 'Fiyat listesi 2', 'product', formatNumber(139.9, 2, true)),
  field('{{specialCode1}}', 'Özel kod 1', 'product', 'OZ-1'),
  field('{{shelfLocation}}', 'Raf konumu', 'product', 'A3-2'),
  field('{{warehouseCode}}', 'Depo kodu', 'product', 'DEPO-1'),
  field('{{products.barcode}}', 'DB: products.barcode', 'database', '8690123456789'),
  field('{{products.price}}', 'DB: products.price', 'database', '149,90'),
  field('{{product.code}}', 'DB: product.code', 'database', 'URN-00142'),
];

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
      source: 'builtin',
    };
  });
}

function dedupeFields(fields: TemplateFieldDef[]): TemplateFieldDef[] {
  const seen = new Set<string>();
  const out: TemplateFieldDef[] = [];
  for (const f of fields) {
    if (seen.has(f.token)) continue;
    seen.add(f.token);
    out.push(f);
  }
  return out;
}

export function getBuiltinTemplateFieldCatalog(type: TemplateType): TemplateFieldDef[] {
  if (type === 'invoice') {
    return dedupeFields([
      ...buildFromLegacyMap(INVOICE_FIELDS, INVOICE_FIELD_META),
      ...INVOICE_EXTENDED,
      ...INVOICE_ITEM_FIELDS,
    ]);
  }
  return dedupeFields([
    ...buildFromLegacyMap(LABEL_FIELDS, LABEL_FIELD_META),
    ...LABEL_EXTENDED,
  ]);
}

/** Yerleşik + kullanıcının DB’den eklediği alanlar */
export function getTemplateFieldCatalog(type: TemplateType): TemplateFieldDef[] {
  return dedupeFields([...getBuiltinTemplateFieldCatalog(type), ...loadCustomTemplateFields(type)]);
}

export function buildDemoInvoicePreviewContext(): Record<string, unknown> {
  const items = [
    {
      productName: 'Kablosuz Mouse',
      itemName: 'Kablosuz Mouse',
      item_code: 'URN-M01',
      itemCode: 'URN-M01',
      quantity: 2,
      unit: 'Adet',
      unitPrice: 349.9,
      unit_price: 349.9,
      vatRate: 20,
      discountRate: 0,
      total: 699.8,
      net_amount: 699.8,
      code: 'URN-M01',
    },
    {
      productName: 'USB-C Hub',
      itemName: 'USB-C Hub',
      item_code: 'URN-H02',
      quantity: 1,
      unitPrice: 480.2,
      total: 480.2,
      net_amount: 480.2,
      code: 'URN-H02',
    },
  ];
  const first = items[0]!;
  const sales = {
    fiche_no: 'A00000042',
    document_no: 'BLG-2026-12',
    fiche_type: 'sales_invoice',
    trcode: 8,
    total_net: 1180,
    total_vat: 212.4,
    total_discount: 80,
    net_amount: 1312.4,
    currency: 'TRY',
    payment_method: 'Nakit',
    cashier: 'Admin',
    notes: 'Demo fatura',
    firm_nr: '001',
    period_nr: '01',
  };
  const customer = {
    code: 'C-001',
    name: 'Örnek Müşteri A.Ş.',
    phone: '+90 532 000 00 00',
    email: 'info@ornek.com',
    tax_nr: '9876543210',
    address: 'Sanayi Mah. 5. Sok. No:3',
    city: 'İstanbul',
    balance: 0,
  };
  return {
    storeName: 'RetailEX Demo Mağaza',
    storeAddress: 'Atatürk Cad. No:12, Kadıköy / İstanbul',
    storeTaxNo: '1234567890',
    storePhone: '+90 212 555 01 00',
    invoiceNo: 'FT-2026-0042',
    ficheNo: 'A00000042',
    documentNo: 'BLG-2026-12',
    receiptNumber: 'A00000042',
    date: new Date().toLocaleDateString('tr-TR'),
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    customerName: 'Örnek Müşteri A.Ş.',
    customerPhone: '+90 532 000 00 00',
    customerAddress: 'Sanayi Mah. 5. Sok. No:3, İstanbul',
    customerTaxNo: '9876543210',
    customerCode: 'C-001',
    customerEmail: 'info@ornek.com',
    customerCity: 'İstanbul',
    subtotal: formatNumber(1180, 2, true),
    discount: formatNumber(80, 2, true),
    tax: formatNumber(212.4, 2, true),
    total: formatNumber(1312.4, 2, true),
    totalNet: formatNumber(1180, 2, true),
    totalVat: formatNumber(212.4, 2, true),
    netAmount: formatNumber(1312.4, 2, true),
    paymentMethod: 'Nakit',
    cashier: 'Admin',
    currency: 'TRY',
    firmNr: '001',
    periodNr: '01',
    items,
    item: first,
    line: first,
    sales,
    invoice: sales,
    customer,
    barcode: '8690123456789',
    price: formatNumber(1312.4, 2, true),
    'sales.fiche_no': 'A00000042',
    'sales.net_amount': formatNumber(1312.4, 2, true),
    'line.item_code': 'URN-M01',
  };
}

export function buildDemoLabelPreviewContext(): Record<string, unknown> {
  const product = {
    code: 'URN-00142',
    barcode: '8690123456789',
    name: 'Organik Zeytinyağı 500ml',
    name2: 'Soğuk sıkım',
    price: 149.9,
    cost: 95,
    stock: 42,
    category_code: 'GID-01',
    brand: 'Ege',
    unit: 'Adet',
    special_code_2: 'RAF-A3',
  };
  return {
    productName: 'Organik Zeytinyağı 500ml',
    barcode: '8690123456789',
    price: '149,90 ₺',
    category: 'Gıda',
    stock: '42',
    sku: 'URN-00142',
    code: 'URN-00142',
    description: 'Soğuk sıkım, cam şişe',
    variantCode: 'V-500',
    specialCode2: 'RAF-A3',
    brand: 'Ege',
    product,
    products: product,
    'products.barcode': '8690123456789',
    'products.price': '149,90',
  };
}
