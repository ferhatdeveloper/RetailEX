/**
 * Şablon dil filtreleme — "Mesaj" paneli "Hazır şablon" dropdown'ı.
 *
 * Davranış:
 *   - Aktif dil (Türkçe, English, العربية, Kurdî) seçildiğinde yalnızca o dil
 *     kolonu (`body_text_<lang>`) dolu olan şablonlar listelenir.
 *   - Tüm 4 dil kolonu boş + geriye uyumlu `body_text` dolu → fallback olarak
 *     her dilde görünür kabul edilir.
 *   - `is_active === false` olan taslaklar gizlenir.
 */
import { describe, it, expect } from 'vitest';
import {
  filterTemplatesByLang,
  hasTemplateBodyInLang,
  type MessageTemplateRow,
} from '../../services/messaging/messageTemplateService';

const TPLS: MessageTemplateRow[] = [
  {
    id: '1',
    name: 'Genel Karşılama',
    body_text: 'Merhaba {customer_name}',
    body_text_tr: 'Merhaba {customer_name}',
    body_text_en: 'Hello {customer_name}',
    category: 'general',
    is_active: true,
  },
  {
    id: '2',
    name: 'English Only',
    body_text: 'Hello {customer_name}',
    body_text_tr: null,
    body_text_en: 'Hello {customer_name}',
    category: 'general',
    is_active: true,
  },
  {
    id: '3',
    name: 'TR+AR',
    body_text: 'Merhaba',
    body_text_tr: 'Merhaba {customer_name}',
    body_text_ar: 'مرحبا {customer_name}',
    category: 'general',
    is_active: true,
  },
  {
    id: '4',
    name: 'KU Only',
    body_text: 'سڵاو',
    body_text_ku: 'سڵاو {customer_name}',
    category: 'general',
    is_active: true,
  },
  {
    id: '5',
    name: 'Eski tek kolon (geriye uyumlu)',
    body_text: 'Legacy {customer_name}',
    category: 'general',
    is_active: true,
  },
  {
    id: '6',
    name: 'Taslak (pasif)',
    body_text: '',
    body_text_tr: 'Taslak içerik',
    category: 'general',
    is_active: false,
  },
];

describe('Mesaj paneli — Mesaj dili: Türkçe', () => {
  it('yalnızca body_text_tr dolu olan şablonlar listelenir', () => {
    const filtered = filterTemplatesByLang(TPLS, 'tr');
    const ids = filtered.map((t) => t.id).sort();
    expect(ids).toEqual(['1', '3', '5']);
  });

  it('English-only şablonu Türkçe seçildiğinde görünmez', () => {
    const filtered = filterTemplatesByLang(TPLS, 'tr');
    expect(filtered.find((t) => t.id === '2')).toBeUndefined();
    expect(filtered.find((t) => t.id === '4')).toBeUndefined();
  });
});

describe('Mesaj paneli — Mesaj dili: English', () => {
  it('yalnızca body_text_en dolu olan şablonlar listelenir', () => {
    const filtered = filterTemplatesByLang(TPLS, 'en');
    const ids = filtered.map((t) => t.id).sort();
    expect(ids).toEqual(['1', '2', '5']);
  });
});

describe('Mesaj paneli — Mesaj dili: العربية', () => {
  it('yalnızca body_text_ar dolu olan şablonlar listelenir', () => {
    const filtered = filterTemplatesByLang(TPLS, 'ar');
    const ids = filtered.map((t) => t.id).sort();
    expect(ids).toEqual(['3', '5']);
  });
});

describe('Mesaj paneli — Mesaj dili: Kurdî', () => {
  it('yalnızca body_text_ku dolu olan şablonlar listelenir', () => {
    const filtered = filterTemplatesByLang(TPLS, 'ku');
    const ids = filtered.map((t) => t.id).sort();
    expect(ids).toEqual(['4', '5']);
  });
});

describe('Mesaj paneli — geriye uyumlu body_text fallback', () => {
  it('tüm dil kolonları boş ama body_text dolu → her dilde görünür', () => {
    const row: MessageTemplateRow = {
      id: 'legacy',
      name: 'Eski Şablon',
      body_text: 'Legacy template text',
      category: 'general',
    };
    for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
      expect(hasTemplateBodyInLang(row, lang)).toBe(true);
    }
  });
});

describe('Mesaj paneli — pasif taslaklar gizlenir', () => {
  it('is_active=false olan şablon hiçbir dilde listelenmez', () => {
    for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
      const filtered = filterTemplatesByLang(TPLS, lang);
      expect(filtered.find((t) => t.id === '6')).toBeUndefined();
    }
  });
});

describe('Mesaj paneli — uç durumlar', () => {
  it('boş şablon listesi → boş döner', () => {
    expect(filterTemplatesByLang([], 'tr')).toEqual([]);
  });

  it('null/undefined benzeri boş kolonlar patlama yapmaz', () => {
    const tpls: MessageTemplateRow[] = [
      {
        id: 'a',
        name: 'null-test',
        body_text: '',
        body_text_tr: null as unknown as string,
        body_text_en: undefined as unknown as string,
        category: 'general',
      },
    ];
    const filtered = filterTemplatesByLang(tpls, 'tr');
    expect(filtered).toEqual([]);
  });

  it('geçersiz dil → tr olarak normalize edilir', () => {
    const filtered = filterTemplatesByLang(TPLS, 'xx' as unknown as 'tr');
    // tr listesi ile aynı olmalı
    expect(filtered.map((t) => t.id).sort()).toEqual(
      filterTemplatesByLang(TPLS, 'tr').map((t) => t.id).sort(),
    );
  });
});
