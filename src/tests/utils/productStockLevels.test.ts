import { describe, expect, it } from 'vitest';
import {
  classifyCriticalStockLevel,
  isCriticalStockReportRow,
  validateProductStockLevels,
} from '../../utils/productStockLevels';

describe('malzeme stok seviyeleri', () => {
  it('üç alan kayda min_stock, max_stock ve safe_stock olarak yazılır', () => {
    const saved = validateProductStockLevels({
      minStock: 4,
      maxStock: 20,
      safeStock: 8,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.columns).toEqual({
      min_stock: 4,
      max_stock: 20,
      safe_stock: 8,
    });
    expect(saved.columns).not.toHaveProperty('price');
    expect(saved.columns).not.toHaveProperty('cost');
    expect(saved.columns).not.toHaveProperty('stock');
    expect(saved.columns).not.toHaveProperty('vat_rate');
  });

  it('boş ve sıfır seviye kabul edilir', () => {
    const saved = validateProductStockLevels({
      minStock: '',
      maxStock: 0,
      safeStock: null,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.columns).toEqual({
      min_stock: 0,
      max_stock: 0,
      safe_stock: 0,
    });
  });

  it('negatif stok seviyesi kaydı reddeder', () => {
    const saved = validateProductStockLevels({
      minStock: -1,
      maxStock: 10,
      safeStock: 2,
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.message).toBe('Stok seviyesi negatif olamaz.');
  });

  it('maksimum minimumdan küçükse kaydı reddeder', () => {
    const saved = validateProductStockLevels({
      minStock: 12,
      maxStock: 5,
      safeStock: 8,
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.message).toBe('Maksimum stok, minimum stoktan küçük olamaz.');
  });

  it('maksimum boşsa minimumdan küçük sayılmaz', () => {
    const saved = validateProductStockLevels({
      minStock: 12,
      maxStock: 0,
      safeStock: '',
    });
    expect(saved.ok).toBe(true);
  });

  it('kritik rapor eşiği minimumun altını seçer', () => {
    const below = { stock: 4, minStock: 10, maxStock: 30, safeStock: 0 };
    const atMin = { stock: 10, minStock: 10, maxStock: 30, safeStock: 0 };
    const aboveMin = { stock: 11, minStock: 10, maxStock: 30, safeStock: 0 };

    expect(isCriticalStockReportRow(below)).toBe(true);
    expect(classifyCriticalStockLevel(below)).toBe('below_min');
    expect(classifyCriticalStockLevel(atMin)).toBe('below_min');
    expect(isCriticalStockReportRow(aboveMin)).toBe(false);
    expect(classifyCriticalStockLevel(aboveMin)).toBe('ok');
  });

  it('güvenli stok altı kritik, maksimum üstü ayrı seviye', () => {
    expect(classifyCriticalStockLevel({
      stock: 6,
      minStock: 4,
      maxStock: 20,
      safeStock: 8,
    })).toBe('below_safe');
    expect(isCriticalStockReportRow({
      stock: 6,
      minStock: 4,
      maxStock: 20,
      safeStock: 8,
    })).toBe(true);
    expect(classifyCriticalStockLevel({
      stock: 25,
      minStock: 4,
      maxStock: 20,
      safeStock: 8,
    })).toBe('above_max');
    expect(classifyCriticalStockLevel({
      stock: 12,
      minStock: 4,
      maxStock: 20,
      safeStock: 8,
    })).toBe('ok');
  });

  it('güvenli stok boşsa eski kritik seviye eşiği kullanılır', () => {
    expect(classifyCriticalStockLevel({
      stock: 3,
      minStock: 0,
      maxStock: 0,
      safeStock: 0,
      criticalStock: 5,
    })).toBe('below_safe');
  });

  it('eşik yokken sıfır stok rapora düşmez', () => {
    expect(isCriticalStockReportRow({
      stock: 0,
      minStock: 0,
      maxStock: 0,
      safeStock: 0,
    })).toBe(false);
  });
});
