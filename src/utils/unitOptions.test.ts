import { describe, expect, it } from 'vitest';
import { buildInvoiceLineUnitOptions, buildUnitSelectOptions, collectProductInvoiceUnits } from './unitOptions';

describe('buildInvoiceLineUnitOptions', () => {
  const sets = [
    {
      id: 'us-1',
      lines: [
        { id: 'l1', code: 'ADET', name: 'Adet' },
        { id: 'l2', code: 'KOLI', name: 'Koli' },
      ],
    },
  ];

  it('birim seti varsa yalnızca o setin satırları', () => {
    const opts = buildInvoiceLineUnitOptions({
      productUnit: 'Adet',
      unitsetId: 'us-1',
      unitSets: sets,
      currentUnit: 'Adet',
    });
    expect(opts.map((o) => o.name)).toEqual(['Adet', 'Koli']);
  });

  it('set yoksa yalnızca ürün kartı birimi — tüm katalog değil', () => {
    const opts = buildInvoiceLineUnitOptions({
      productUnit: 'Kg',
      unitsetId: '',
      unitSets: sets,
      currentUnit: 'Kg',
    });
    expect(opts.map((o) => o.name)).toEqual(['Kg']);
    expect(opts.some((o) => o.name === 'Adet')).toBe(false);
  });

  it('kayıtlı eski birim listede yoksa eklenir', () => {
    const opts = buildInvoiceLineUnitOptions({
      productUnit: 'Adet',
      unitsetId: 'us-1',
      unitSets: sets,
      currentUnit: 'Paket',
    });
    expect(opts.map((o) => o.name)).toContain('Paket');
  });

  it('ürün seçilmemiş satırda katalog yok (boş liste)', () => {
    const opts = buildInvoiceLineUnitOptions({
      hasProduct: false,
      productUnit: 'Brüt',
      currentUnit: 'Brüt',
      unitSets: sets,
    });
    expect(opts).toEqual([]);
  });

  it('çarpanlı alternatif birimler ürüne eklenir, katalog birimleri eklenmez', () => {
    const opts = buildInvoiceLineUnitOptions({
      hasProduct: true,
      productUnit: 'Adet',
      currentUnit: 'Adet',
      extraUnits: ['Koli'],
      unitSets: sets,
    });
    expect(opts.map((o) => o.name)).toEqual(['Adet', 'Koli']);
    expect(opts.some((o) => o.name === 'Gram')).toBe(false);
  });
});

describe('collectProductInvoiceUnits', () => {
  it('yalnızca baz + çevrim + set; çevrimsiz barkod birimi yok', () => {
    const { units, multipliers } = collectProductInvoiceUnits({
      baseUnit: 'Adet',
      unitsetLines: [{ name: 'Adet', conv_fact1: 1, main_unit: true }],
      conversions: [{ from_unit: 'Koli', to_unit: 'Adet', factor: 12 }],
      barcodeUnits: ['Koli', 'Saat'],
    });
    expect(units).toEqual(['Adet', 'Koli']);
    expect(multipliers.Adet).toBe(1);
    expect(multipliers.Koli).toBe(12);
  });
});

describe('buildUnitSelectOptions', () => {
  it('ürün kartı formu için katalog birleşir', () => {
    const opts = buildUnitSelectOptions(
      [{ id: '1', name: 'Kg', code: 'KG' }],
      [{ id: 'us', lines: [{ name: 'Adet', code: 'ADET' }] }],
    );
    expect(opts.map((o) => o.name).sort((a, b) => a.localeCompare(b, 'tr'))).toEqual(['Adet', 'Kg']);
  });
});
