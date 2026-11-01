import { describe, expect, it } from 'vitest';
import { translate, type Language } from '../../locales/module-translations';
import { resolveExpenseCategoryLabel } from '../../utils/expenseCategoryLabel';

const LANGS: Language[] = ['tr', 'en', 'ar', 'ku'];

const SYSTEM_LABELS = [
  { code: 'rent', tr: 'Kira', en: 'Rent', ar: 'إيجار', ku: 'کرێ' },
  { code: 'salary', tr: 'Maaş', en: 'Salary', ar: 'راتب', ku: 'مووچە' },
  { code: 'electricity', tr: 'Elektrik', en: 'Electricity', ar: 'كهرباء', ku: 'کارەبا' },
  { code: 'water', tr: 'Su', en: 'Water', ar: 'ماء', ku: 'ئاو' },
  { code: 'internet', tr: 'İnternet', en: 'Internet', ar: 'إنترنت', ku: 'ئینتەرنێت' },
  { code: 'phone', tr: 'Telefon', en: 'Phone', ar: 'هاتف', ku: 'تەلەفۆن' },
  { code: 'maintenance', tr: 'Bakım-Onarım', en: 'Maintenance', ar: 'صيانة', ku: 'چاککردنەوە' },
  { code: 'cleaning', tr: 'Temizlik', en: 'Cleaning', ar: 'نظافة', ku: 'پاککردنەوە' },
] as const;

function t(lang: Language) {
  return (key: string) => translate(key, lang);
}

describe('sistem gider kategori etiketi', () => {
  it('aynı kod tr, en, ar ve ku dilinde doğru etiketi verir', () => {
    for (const row of SYSTEM_LABELS) {
      const stored = { id: row.code, code: row.code, name: row.tr };
      for (const lang of LANGS) {
        const translate = t(lang);
        expect(resolveExpenseCategoryLabel(row.code, { translate, categories: [stored] })).toBe(row[lang]);
        expect(resolveExpenseCategoryLabel(row.tr, { translate, categories: [stored] })).toBe(row[lang]);
        expect(stored.code).toBe(row.code);
        expect(stored.name).toBe(row.tr);
      }
    }
  });

  it('kullanıcı kategorisinin yazdığı ad değişmez', () => {
    const stored = { id: 'user-1', code: 'konaklama', name: 'KONAKLAMA' };
    for (const lang of LANGS) {
      expect(resolveExpenseCategoryLabel('KONAKLAMA', {
        translate: t(lang),
        categories: [stored],
      })).toBe('KONAKLAMA');
      expect(resolveExpenseCategoryLabel('Ofis Kirası', {
        translate: t(lang),
      })).toBe('Ofis Kirası');
    }
    expect(stored.name).toBe('KONAKLAMA');
    expect(stored.code).toBe('konaklama');
  });
});
