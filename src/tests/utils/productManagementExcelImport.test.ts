import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildProductGridColumns,
  getProductGridColumnLabels,
  PRODUCT_GRID_COLUMN_ORDER,
} from '../../components/inventory/products/productGridColumns';
import {
  applyProductExcelDrafts,
  excelBarcodeText,
  formatProductExcelImportSummary,
  importProductExcelBuffer,
  parseProductExcelMatrix,
  parseProductExcelNumber,
  type ProductExcelApi,
  type ProductExcelDraft,
} from '../../utils/productManagementExcelImport';

const here = dirname(fileURLToPath(import.meta.url));

function memoryApi(seed: Array<Record<string, unknown> & { id: string }> = []) {
  const rows = seed.map((row) => ({ ...row }));
  let seq = rows.length;
  const api: ProductExcelApi = {
    async getByCode(code) {
      return rows.find((row) => row.code === code) ?? null;
    },
    async getByBarcode(barcode) {
      return rows.find((row) => row.barcode === barcode) ?? null;
    },
    async create(payload) {
      seq += 1;
      const row = { ...payload, id: `id-${seq}` };
      rows.push(row);
      return row;
    },
    async update(id, payload) {
      const row = rows.find((item) => item.id === id);
      if (!row) return null;
      Object.assign(row, payload);
      return row;
    },
  };
  return { api, rows };
}

function workbookBuffer(matrix: unknown[][], bookType: 'xlsx' | 'xls'): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Veri');
  const out = XLSX.write(book, { bookType, type: 'array' }) as ArrayBuffer | Uint8Array | number[];
  if (out instanceof Uint8Array) return out;
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  return Uint8Array.from(out);
}

function gridExportSheet(): { headers: string[]; ids: string[] } {
  const labels: Record<string, string> = {
    barcode: 'Barkod',
    productGridColCode: 'Ürün Kodu',
    productName: 'Ürün Adı',
    category: 'Kategori',
    specialCode: 'Özel Kod',
    unitPrice: 'Birim Fiyat',
    stock: 'Stok',
    unit: 'Birim',
    salesTotal: 'Satış Toplamı',
    purchaseTotal: 'Alış Toplamı',
    avgUnitCost: 'Alış Ortalaması',
    avgUnitSalesPrice: 'Satış Ortalaması',
    gridBoolYes: 'Evet',
    gridBoolNo: 'Hayır',
  };
  const visibility = Object.fromEntries(PRODUCT_GRID_COLUMN_ORDER.map((id) => [id, false]));
  for (const id of ['barcode', 'code', 'name', 'stock', 'price', 'totalPurchased', 'totalSales', 'category', 'specialCode2']) {
    visibility[id] = true;
  }
  const columns = buildProductGridColumns({
    columnVisibility: visibility,
    showPurchasePricing: true,
    labelOverrides: getProductGridColumnLabels((key) => labels[key] ?? key),
    tm: (key) => labels[key] ?? key,
  });
  return {
    headers: columns.map((column) => String(column.header)),
    ids: columns.map((column) => String(column.id)),
  };
}

function cellsFor(ids: string[], record: Record<string, unknown>): unknown[] {
  return ids.map((id) => record[id] ?? '');
}

describe('parseProductExcelNumber', () => {
  it('TR ve EN sayı biçimlerini okur', () => {
    expect(parseProductExcelNumber(1250.5)).toBe(1250.5);
    expect(parseProductExcelNumber('1.250,50')).toBe(1250.5);
    expect(parseProductExcelNumber('12,5')).toBe(12.5);
    expect(parseProductExcelNumber('1,250.50')).toBe(1250.5);
    expect(parseProductExcelNumber('5.000')).toBe(5000);
    expect(parseProductExcelNumber('1.25')).toBe(1.25);
    expect(parseProductExcelNumber('0.250')).toBeCloseTo(0.25, 5);
  });
});

describe('ürün Excel içe aktarma', () => {
  it('Dışa Aktar başlıklarını ürün kartı alanlarına yazar, toplamları fiyata yazmaz', () => {
    const { headers, ids } = gridExportSheet();
    expect(headers).toContain('BARKOD');
    expect(headers).toContain('BIRIM FIYAT');
    expect(headers.some((header) => header.includes('TOPLAM'))).toBe(true);

    const parsed = parseProductExcelMatrix([
      headers,
      cellsFor(ids, {
        barcode: '8690000000001',
        code: 'URN-001',
        name: 'Şalgam Çöreği',
        category: 'İçecek',
        specialCode2: 'ÖZ-2',
        price: 1250.5,
        stock: 12,
        totalPurchased: 99999,
        totalSales: 88888,
      }),
      cellsFor(ids, {
        barcode: '8690000000002',
        code: 'URN-AR',
        name: 'شاي أخضر',
        category: 'مشروبات',
        specialCode2: 'كود',
        price: '1.250,50',
        stock: '4',
        totalPurchased: 1,
        totalSales: 2,
      }),
      cellsFor(ids, { barcode: 'Toplam (2)', price: 2501, stock: 16, totalPurchased: 100000, totalSales: 88890 }),
      ids.map(() => ''),
    ]);

    expect(parsed.fileError).toBeUndefined();
    expect(parsed.drafts).toHaveLength(2);
    expect(parsed.skipped).toBe(2);
    expect(parsed.errors).toHaveLength(0);

    const first = parsed.drafts[0];
    expect(first.code).toBe('URN-001');
    expect(first.name).toBe('Şalgam Çöreği');
    expect(first.barcode).toBe('8690000000001');
    expect(first.values.category).toBe('İçecek');
    expect(first.values.specialCode2).toBe('ÖZ-2');
    expect(first.values.price).toBe(1250.5);
    expect(first.values.stock).toBe(12);
    expect(first.values.cost).toBeUndefined();
    expect(first.values).not.toHaveProperty('totalSales');
    expect(first.values).not.toHaveProperty('totalPurchased');

    const arabic = parsed.drafts[1];
    expect(arabic.name).toBe('شاي أخضر');
    expect(arabic.values.category).toBe('مشروبات');
    expect(arabic.values.specialCode2).toBe('كود');
    expect(arabic.values.price).toBe(1250.5);
    expect(arabic.values.stock).toBe(4);
  });

  it('Türkçe büyük harf başlık, şablon ve İngilizce takma adları kabul eder', () => {
    const turkish = parseProductExcelMatrix([
      ['BİRİM FİYAT', 'KATEGORİ', 'ÜRÜN ADI', 'ÜRÜN KODU', 'BARKOD', 'STOK', 'ÖZEL KOD 2'],
      [10, 'Gıda', 'Çiğ Köfte', 'CK-01', '8691', 3, 'Ş-1'],
    ]);
    expect(turkish.drafts[0].values.price).toBe(10);
    expect(turkish.drafts[0].values.category).toBe('Gıda');
    expect(turkish.drafts[0].name).toBe('Çiğ Köfte');

    const template = parseProductExcelMatrix([
      ['Ürün Kodu*', 'Ürün Adı*', 'Barkod', 'Alış Fiyatı', 'Satış Fiyatı*', 'Mevcut Stok', 'Özel Kod 2', 'Birim'],
      ['URN-9', 'Örnek Ürün', '8.69001E+12', 50, 100, '', 'A1', 'Adet'],
    ]);
    expect(template.drafts).toHaveLength(1);
    expect(template.drafts[0].barcode).toBe(excelBarcodeText('8.69001E+12'));
    expect(template.drafts[0].barcode).toBe('8690010000000');
    expect(template.drafts[0].values.cost).toBe(50);
    expect(template.drafts[0].values.price).toBe(100);
    expect(template.drafts[0].values.stock).toBeUndefined();
    expect(template.drafts[0].values.unit).toBe('Adet');

    const english = parseProductExcelMatrix([
      ['Barcode', 'Product Code', 'Product Name', 'Unit Price', 'Purchase Price', 'Stock', 'Category', 'Special Code 2'],
      ['111', 'P-1', 'Green Tea', 7.5, 4, 2, 'Drinks', 'S2'],
    ]);
    expect(english.drafts[0].values.price).toBe(7.5);
    expect(english.drafts[0].values.cost).toBe(4);
    expect(english.drafts[0].values.stock).toBe(2);
  });

  it('bozuk satırı bırakır, geçerli satırı alır', () => {
    const parsed = parseProductExcelMatrix([
      ['Barkod', 'Ürün Kodu', 'Ürün Adı', 'Birim Fiyat', 'Stok'],
      ['1', 'KOD-1', '', 10, 1],
      ['2', 'KOD-2', 'Sağlam', -5, 1],
      ['3', 'KOD-3', 'Tamam', 15, 2],
    ]);
    expect(parsed.drafts.map((row) => row.code)).toEqual(['KOD-3']);
    expect(parsed.errors.map((error) => error.row)).toEqual([2, 3]);
    expect(parsed.errors[0].message).toContain('Ürün Adı');
    expect(parsed.errors[1].message).toContain('negatif');
  });

  it('kod ve ad kolonu yoksa dosyayı reddeder', () => {
    const parsed = parseProductExcelMatrix([
      ['Barkod', 'Stok'],
      ['1', 4],
    ]);
    expect(parsed.fileError).toContain('Ürün Kodu');
    expect(parsed.drafts).toHaveLength(0);
  });

  it('aynı kodu günceller, başka karttaki barkodu satır hatası yapar', async () => {
    const { api, rows } = memoryApi([
      { id: 'id-1', code: 'URN-001', barcode: '111', name: 'Eski', price: 1, stock: 5 },
    ]);
    const drafts: ProductExcelDraft[] = [
      {
        excelRow: 2,
        code: 'URN-001',
        name: 'Yeni Ad',
        barcode: '111',
        values: { price: 20, stock: 9, specialCode2: 'ÖZ' },
      },
      {
        excelRow: 3,
        code: 'URN-NEW',
        name: 'Çakışan',
        barcode: '111',
        values: { price: 3, stock: 1 },
      },
      {
        excelRow: 4,
        code: 'URN-OK',
        name: 'شاي',
        barcode: '222',
        values: { price: 4, stock: 6, category: 'İçecek' },
      },
    ];
    const result = await applyProductExcelDrafts(drafts, api);
    expect(result.updated).toBe(1);
    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toContain('Barkod başka üründe var');
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Yeni Ad');
    expect(rows[0].price).toBe(20);
    expect(rows[0].stock).toBe(9);
    expect(rows[0].specialCode2).toBe('ÖZ');
    expect(rows[1].name).toBe('شاي');
    expect(rows[1].stock).toBe(6);
    expect(rows[1]).not.toHaveProperty('totalSales');
    expect(JSON.stringify(rows)).not.toContain('movement');
  });

  it('xlsx tamponundan kart oluşturur ve stok alanını karta yazar', async () => {
    const matrix = [
      ['BARKOD', 'ÜRÜN KODU', 'ÜRÜN ADI', 'STOK', 'BIRIM FIYAT', 'KATEGORI', 'OZEL KOD 2'],
      ['555', 'EX-1', 'İçecek', 8, 15, 'Soğuk', 'K2'],
      ['555', 'EX-2', 'İkinci', 1, 2, 'Sıcak', 'K3'],
    ];
    const { api, rows } = memoryApi();
    const outcome = await importProductExcelBuffer(workbookBuffer(matrix, 'xlsx'), api);
    expect(outcome.fileError).toBeUndefined();
    expect(outcome.created).toBe(1);
    expect(outcome.failed).toBe(1);
    expect(rows[0].code).toBe('EX-1');
    expect(rows[0].name).toBe('İçecek');
    expect(rows[0].stock).toBe(8);
    expect(rows[0].price).toBe(15);
    expect(rows[0].barcode).toBe('555');
    expect(formatProductExcelImportSummary(outcome)).toContain('1 yeni');
  });

  it('xls tamponunu da okur', async () => {
    const matrix = [
      ['Product Code', 'Product Name', 'Barcode', 'Stock'],
      ['XLS-1', 'Kalem', '900', 2],
    ];
    const { api, rows } = memoryApi();
    const outcome = await importProductExcelBuffer(workbookBuffer(matrix, 'xls'), api);
    expect(outcome.created).toBe(1);
    expect(rows[0].name).toBe('Kalem');
    expect(rows[0].stock).toBe(2);
  });

  it('İçe Aktar düğmesi dosya seçici açar', () => {
    const source = readFileSync(
      resolve(here, '../../components/inventory/products/ProductManagement.tsx'),
      'utf8',
    );
    expect(source).toContain('excelImportInputRef.current?.click()');
    expect(source).toContain('importProductExcelBuffer');
    expect(source).toContain('type="file"');
    expect(source).toContain('PercentBodyModal');
    expect(source).not.toMatch(
      /<button className="flex items-center gap-1 px-2 py-1 bg-white\/10 hover:bg-white\/20 transition-colors text-\[10px\]">\s*<Upload/,
    );
  });
});
