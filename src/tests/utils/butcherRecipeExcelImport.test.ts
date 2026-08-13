import { describe, it, expect } from 'vitest';
import {
  parseButcherRecipeExcel,
  groupRowsByRecipe,
  detectAnimalType,
} from '../../utils/butcherRecipeExcelImport';

describe('detectAnimalType', () => {
  it.each([
    ['AMANJ KUZU', 'sheep'],
    ['Kuzu Pirzola', 'sheep'],
    ['BAFREN KUZU', 'sheep'],
    ['XOMALE KAL', 'sheep'],
    ['DANA STEAK', 'cattle'],
    ['Dana Antrikot', 'cattle'],
    ['Sığır Kıyma', 'cattle'],
    ['KECI', 'goat'],
    ['KEÇI', 'goat'],
    ['TEKE', 'goat'],
    ['AMANJ', 'other'],
    ['', 'other'],
  ])('"%s" → %s', (name, expected) => {
    expect(detectAnimalType(name)).toBe(expected);
  });
});

describe('parseButcherRecipeExcel', () => {
  it('boş workbook → hata', () => {
    const v = parseButcherRecipeExcel([]);
    expect(v.ok).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it('sadece başlık → hata', () => {
    const v = parseButcherRecipeExcel([
      ['ÜRÜN KODU*', 'ÜRÜN ADI*', 'RECETE ADI'],
    ]);
    expect(v.ok).toBe(false);
  });

  it('temel parse: 1 reçete 2 çıktı', () => {
    const v = parseButcherRecipeExcel([
      ['Ürün Kodu*', 'Ürün Adı*', 'Reçete Adı', 'Yüzde Bazı', 'Kaç Kg Çıkar', 'Birim'],
      ['KOD-1', 'Antrikot', 'DANA ANTRIKOT', 60, 6, 'KG'],
      ['KOD-2', 'Kıyma', 'DANA ANTRIKOT', 40, 4, 'KG'],
    ]);
    expect(v.ok).toBe(true);
    expect(v.rows).toHaveLength(2);
    expect(v.rows[0].outputProductCode).toBe('KOD-1');
    expect(v.rows[0].recipeName).toBe('DANA ANTRIKOT');
    expect(v.rows[0].standardRatioPercent).toBe(60);
    expect(v.rows[0].outputKg).toBe(6);
    expect(v.rows[0].animalType).toBe('cattle');
  });

  it('kodu/adı/reçete adı eksik satır atlanır, uyarı verir', () => {
    const v = parseButcherRecipeExcel([
      ['Ürün Kodu*', 'Ürün Adı*', 'Reçete Adı'],
      ['', '', ''],
      ['KOD-1', '', ''],
      ['', 'Ad', 'R'],
      ['KOD-2', 'Ad', 'R'],
    ]);
    expect(v.ok).toBe(true);
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0].outputProductCode).toBe('KOD-2');
    expect(v.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('virgüllü ondalık (TR sayı) doğru parse edilir', () => {
    const v = parseButcherRecipeExcel([
      ['Ürün Kodu*', 'Ürün Adı*', 'Reçete Adı', 'Yüzde Bazı', 'Kaç Kg Çıkar'],
      ['K1', 'Ad', 'REÇETE', '60,5', '1,250'],
    ]);
    expect(v.ok).toBe(true);
    expect(v.rows[0].standardRatioPercent).toBeCloseTo(60.5, 2);
    expect(v.rows[0].outputKg).toBeCloseTo(1.25, 2);
  });

  it('başlıklar case-insensitive + Türkçe normalize', () => {
    const v = parseButcherRecipeExcel([
      ['urun kodu*', 'urun adi*', 'recete adi'],
      ['K1', 'Ad', 'R'],
    ]);
    // normalizeHeader: 'urun kodu*' → 'URUN KODU*', 'recete adi' → 'RECETE ADI'
    // pickColumn ÜRÜN KODU → URUN KODU listesini eşleştirir; ad ve reçete adı eşleşir
    expect(v.ok).toBe(true);
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0].outputProductCode).toBe('K1');
  });

  it('başlık bulunamazsa hata döner', () => {
    const v = parseButcherRecipeExcel([
      ['A', 'B'],
      ['1', '2'],
    ]);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes('Ürün Kodu'))).toBe(true);
  });

  it('yüzdeler 90-110 dışı toplamda uyarı', () => {
    const v = parseButcherRecipeExcel([
      ['Ürün Kodu*', 'Ürün Adı*', 'Reçete Adı', 'Yüzde Bazı'],
      ['K1', 'A', 'T', 30],
      ['K2', 'B', 'T', 30],
    ]);
    expect(v.warnings.some((w) => w.includes('%'))).toBe(true);
  });

  it('100% dengeli reçete için % uyarısı yok', () => {
    const v = parseButcherRecipeExcel([
      ['Ürün Kodu*', 'Ürün Adı*', 'Reçete Adı', 'Yüzde Bazı'],
      ['K1', 'A', 'T', 60],
      ['K2', 'B', 'T', 40],
    ]);
    expect(v.warnings.some((w) => w.includes('%') && w.includes('60.00'))).toBe(false);
  });
});

describe('groupRowsByRecipe', () => {
  it('reçeteye göre gruplar + yüzde/kg toplar', () => {
    const v = parseButcherRecipeExcel([
      ['Ürün Kodu*', 'Ürün Adı*', 'Reçete Adı', 'Yüzde Bazı', 'Kaç Kg Çıkar'],
      ['K1', 'A', 'R1', 30, 3],
      ['K2', 'B', 'R1', 70, 7],
      ['K3', 'C', 'R2', 100, 10],
    ]);
    const groups = groupRowsByRecipe(v.rows);
    expect(groups).toHaveLength(2);
    const r1 = groups.find((g) => g.recipeName === 'R1')!;
    expect(r1.rows).toHaveLength(2);
    expect(r1.totalPercent).toBeCloseTo(100, 2);
    expect(r1.totalKg).toBeCloseTo(10, 2);
    const r2 = groups.find((g) => g.recipeName === 'R2')!;
    expect(r2.totalPercent).toBe(100);
  });
});