import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyLocaleEdits,
  assertSafeLocaleRelative,
  flattenLocale,
  foldLocaleSearch,
  localeKeyExists,
  localeTextMatches,
  parseLocaleJson,
  prepareLocaleSave,
} from '../../utils/localeJsonDocument';

const NESTED = `{
  "menu": {
    "cash": {
      "title": "Kasa",
      "hint": "İpucu"
    },
    "stock": {
      "title": "Stok"
    }
  },
  "greeting": "Çğüşöı İade"
}
`;

describe('dil JSON düzleştirme ve kayıt', () => {
  it('iç içe anahtar noktalı yola iner ve kayıtta eski şekle döner', () => {
    const tree = parseLocaleJson(NESTED);
    expect(flattenLocale(tree).map((row) => row.path)).toEqual([
      'menu.cash.title',
      'menu.cash.hint',
      'menu.stock.title',
      'greeting',
    ]);
    const saved = prepareLocaleSave(
      NESTED,
      [{ path: 'menu.cash.title', text: 'Kasa adı' }],
      [],
    );
    expect(JSON.parse(saved)).toEqual({
      menu: {
        cash: { title: 'Kasa adı', hint: 'İpucu' },
        stock: { title: 'Stok' },
      },
      greeting: 'Çğüşöı İade',
    });
    expect(Object.keys(JSON.parse(saved).menu.cash)).toEqual(['title', 'hint']);
  });

  it('bir anahtarın metni değişir, kardeş anahtar durur', () => {
    const saved = prepareLocaleSave(NESTED, [{ path: 'menu.cash.title', text: 'Yeni kasa' }], []);
    const parsed = JSON.parse(saved);
    expect(parsed.menu.cash.hint).toBe('İpucu');
    expect(parsed.menu.stock.title).toBe('Stok');
    expect(parsed.greeting).toBe('Çğüşöı İade');
  });

  it('boş metin anahtarı silmez; silmek ayrı listededir', () => {
    const emptied = prepareLocaleSave(
      NESTED,
      [
        { path: 'menu.cash.title', text: '' },
        { path: 'greeting', text: 'Çğüşöı İade' },
      ],
      [],
    );
    expect(JSON.parse(emptied).menu.cash.title).toBe('');
    expect(JSON.parse(emptied).menu.cash.hint).toBe('İpucu');

    const removed = prepareLocaleSave(NESTED, [], ['menu.cash.title']);
    expect(JSON.parse(removed).menu.cash).toEqual({ hint: 'İpucu' });
    expect(JSON.parse(removed).menu.stock.title).toBe('Stok');
  });

  it('yeni anahtar eklenir, var olanın üzerine yazılmaz', () => {
    const tree = parseLocaleJson(NESTED);
    expect(localeKeyExists(tree, 'menu.cash.title')).toBe(true);
    expect(localeKeyExists(tree, 'menu.cash.note')).toBe(false);
    expect(() => applyLocaleEdits(tree, [{ path: 'menu.cash', text: 'Yok' }], [])).toThrow(
      /üzerine yazılamaz/,
    );

    const added = prepareLocaleSave(NESTED, [{ path: 'menu.cash.note', text: 'Şube notu' }], []);
    expect(JSON.parse(added).menu.cash).toEqual({
      title: 'Kasa',
      hint: 'İpucu',
      note: 'Şube notu',
    });
  });

  it('Türkçe karakter ve İ/I katlaması anahtarı bozmaz', () => {
    const source = '{\n  "İade": "İade fişi",\n  "Işık": "Aydınlatma",\n  "şube": "Şube"\n}\n';
    const key = 'İade';
    expect(localeTextMatches('istanbul', 'İstanbul kapı')).toBe(true);
    expect(localeTextMatches('ışık', 'Işık')).toBe(true);
    expect(foldLocaleSearch('İSTANBUL')).toBe('istanbul');
    expect(foldLocaleSearch('IŞIK')).toBe('ışık');
    expect(key).toBe('İade');
    const saved = prepareLocaleSave(source, [{ path: 'İade', text: 'İptal' }], []);
    const parsed = JSON.parse(saved);
    expect(parsed['İade']).toBe('İptal');
    expect(parsed['Işık']).toBe('Aydınlatma');
    expect(parsed['şube']).toBe('Şube');
    expect(saved.charCodeAt(0)).not.toBe(0xfeff);
    expect(saved).toContain('İptal');
    expect(saved).toContain('Aydınlatma');
  });

  it('yol dil klasörü dışına çıkamaz', () => {
    expect(() => assertSafeLocaleRelative('../secret.json')).toThrow(/dışında/);
    expect(() => assertSafeLocaleRelative('..\\secret.json')).toThrow(/dışında/);
    expect(() => assertSafeLocaleRelative('/etc/passwd')).toThrow(/dışında/);
    expect(() => assertSafeLocaleRelative('C:/Windows/tr.json')).toThrow(/dışında/);
    expect(() => assertSafeLocaleRelative('tr/../../en.json')).toThrow(/dışında/);
    expect(() => assertSafeLocaleRelative('.env')).toThrow(/dışında/);
    expect(() => assertSafeLocaleRelative('config.json')).toThrow(/Geçersiz/);
    expect(() => assertSafeLocaleRelative('migration.json')).toThrow(/Geçersiz/);
    expect(assertSafeLocaleRelative('tr.json')).toBe('tr.json');
    expect(assertSafeLocaleRelative('ku.json')).toBe('ku.json');
    expect(assertSafeLocaleRelative('tr/common.json')).toBe('tr/common.json');
  });

  it('kaynak dosyada toLowerCase yok', () => {
    const src = readFileSync(new URL('../../utils/localeJsonDocument.ts', import.meta.url), 'utf8');
    expect(src.includes('toLowerCase')).toBe(false);
    expect(src.includes('toLocaleLowerCase')).toBe(false);
  });
});
