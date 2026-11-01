import { describe, expect, it } from 'vitest';
import {
  beautyCategoryRowLabel,
  beautyServiceCategoryPathLabel,
  createBeautyCategoryRecord,
  resolveBeautyCategoryLabel,
} from '../../components/beauty/beautyServiceCategoryUtils';

describe('beauty category label', () => {
  it('returns the arabic name that was typed, not a generated code', () => {
    const arabic = 'حلاقة';
    const saved = createBeautyCategoryRecord(arabic);
    expect(saved.name).toBe(arabic);
    expect(saved.label).toBe(arabic);
    expect(saved.label).not.toMatch(/^cat_/i);
    expect(resolveBeautyCategoryLabel(saved.code, [saved])).toBe(arabic);
    expect(beautyServiceCategoryPathLabel({ category: saved.code }, [saved])).toBe(arabic);
  });

  it('keeps arabic letters and combining marks on the label', () => {
    const arabic = 'ح\u064Eل\u0627\u0642\u064E\u0629';
    const saved = createBeautyCategoryRecord(arabic);
    expect(saved.name).toBe(arabic);
    expect(saved.label).toBe(arabic);
    expect(saved.label.includes('\u064E')).toBe(true);
    expect(resolveBeautyCategoryLabel(saved.code, [saved])).toBe(arabic);
  });

  it('returns a turkish name unchanged', () => {
    const turkish = 'Saç Bakımı';
    const saved = createBeautyCategoryRecord(turkish);
    expect(saved.name).toBe(turkish);
    expect(saved.label).toBe(turkish);
    expect(resolveBeautyCategoryLabel(saved.code, [saved])).toBe(turkish);
    expect(createBeautyCategoryRecord('İğdır Kaşı').label).toBe('İğdır Kaşı');
  });

  it('returns an english name unchanged', () => {
    const english = 'Nail';
    const saved = createBeautyCategoryRecord(english);
    expect(saved.name).toBe(english);
    expect(saved.label).toBe(english);
    expect(resolveBeautyCategoryLabel(saved.code, [saved])).toBe(english);
    expect(beautyServiceCategoryPathLabel({ category: saved.code }, [saved])).toBe(english);
  });

  it('shows the stored name when the service key is a generated code', () => {
    const arabic = 'أظافر';
    const row = { code: 'CAT_MVXM7YX1', name: arabic };
    expect(resolveBeautyCategoryLabel('CAT_MVXM7YX1', [row])).toBe(arabic);
    expect(resolveBeautyCategoryLabel('cat_mvxm7yx1', [{ code: 'cat_mvxm7yx1', name: arabic }])).toBe(arabic);
    expect(beautyServiceCategoryPathLabel(
      { category: 'cat_mvxm7yx1' },
      [{ code: 'cat_mvxm7yx1', name: arabic }],
    )).toBe(arabic);
  });

  it('keeps the code when the row has no name', () => {
    const row = { code: 'CAT_MVXM7YX1', name: '' };
    expect(beautyCategoryRowLabel(row)).toBe('CAT_MVXM7YX1');
    expect(beautyCategoryRowLabel({ code: 'CAT_MVXM7YX1', name: '   ' })).toBe('CAT_MVXM7YX1');
    expect(resolveBeautyCategoryLabel('CAT_MVXM7YX1', [row])).toBe('CAT_MVXM7YX1');
    expect(resolveBeautyCategoryLabel('cat_mvxm7yx1', [{ code: 'cat_mvxm7yx1', name: null }])).toBe('cat_mvxm7yx1');
    expect(beautyServiceCategoryPathLabel({ category: 'CAT_MVXM7YX1' }, [row])).toBe('CAT_MVXM7YX1');
  });

  it('keeps built-in labels when no master name is stored', () => {
    expect(resolveBeautyCategoryLabel('beauty', [], { beauty: 'Güzellik' })).toBe('Güzellik');
    expect(resolveBeautyCategoryLabel('nails', [], { nails: 'Tırnak' })).toBe('Tırnak');
  });
});
