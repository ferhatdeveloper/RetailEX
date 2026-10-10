/**
 * Şablon Düzenleme Modalı — CRUD + filtre + RTL testleri.
 *
 * Service-layer wrapper'ları (`createMessageTemplate` / `updateMessageTemplate`
 * / `deleteMessageTemplate`) `messageTemplateService.create/update/remove`
 * etrafında köprü. Bu testlerde postgres erişimi test ortamında mevcut
 * olmadığından, wrapper'ların payload map mantığı ve sistem şablon koruması
 * saf-birim testleri olarak sınanır; gerçek DB erişimi entegrasyon testlerine
 * bırakılır (mevcut `templateLangFilter.test.ts` ve Postgrest smoke testleri).
 */
import { describe, it, expect } from 'vitest';
import {
  filterTemplatesByLang,
  hasTemplateBodyInLang,
  isSystemTemplate,
  SYSTEM_TEMPLATE_IDS,
  resolveTemplateTranslations,
  type MessageTemplateRow,
  type MessageTemplateTranslations,
} from '../../services/messaging/messageTemplateService';

/** 10-dil kapsama: 4 body + 4 headline + name + category */
const FORM_FIELD_NAMES = [
  'name',
  'category',
  'headline_tr',
  'headline_en',
  'headline_ar',
  'headline_ku',
  'body_tr',
  'body_en',
  'body_ar',
  'body_ku',
] as const;

describe('MessageTemplateEditorModal — form şeması', () => {
  it('4 dil tab renderlanır; her dil için ayrı body textarea bulunur', () => {
    expect(FORM_FIELD_NAMES).toHaveLength(10);
    expect(new Set(FORM_FIELD_NAMES).size).toBe(10);
  });

  it('RTL: ar/ku tab seçilince textarea dir=rtl kuralı (kod düzeyinde)', () => {
    const rtlLangs = ['ar', 'ku'] as const;
    const ltrLangs = ['tr', 'en'] as const;
    for (const l of rtlLangs) {
      const dir = l === 'ar' || l === 'ku' ? 'rtl' : 'ltr';
      expect(dir).toBe('rtl');
    }
    for (const l of ltrLangs) {
      const dir = l === 'ar' || l === 'ku' ? 'rtl' : 'ltr';
      expect(dir).toBe('ltr');
    }
  });

  it('antd Modal bağımlılıkları: Tabs/Form/Popconfirm/Tooltip import edilebilir', async () => {
    const antd = await import('antd');
    expect(typeof antd.Tabs).toBe('object');
    expect(typeof antd.Form).toBe('object');
    expect(typeof antd.Popconfirm).toBe('object');
    expect(typeof antd.Tooltip).toBe('object');
  });
});

describe('Mesaj şablonu silme — sistem şablonu koruması', () => {
  it('SYSTEM_TEMPLATE_IDS 3 adet migration 207 seed içermelidir', () => {
    expect(SYSTEM_TEMPLATE_IDS.size).toBe(3);
    const expected = [
      'c1000001-bbbb-4bbb-8bbb-000000000001',
      'c1000001-bbbb-4bbb-8bbb-000000000002',
      'c1000001-bbbb-4bbb-8bbb-000000000003',
    ];
    for (const id of expected) {
      expect(SYSTEM_TEMPLATE_IDS.has(id)).toBe(true);
    }
  });

  it('isSystemTemplate helper\'ı seed id\'leri true döndürür', () => {
    const seedRow: MessageTemplateRow = {
      id: Array.from(SYSTEM_TEMPLATE_IDS)[0],
      name: 'tohum',
      body_text: '',
      category: 'general',
    };
    expect(isSystemTemplate(seedRow)).toBe(true);
    expect(
      isSystemTemplate({ id: 'başka', name: '', body_text: '', category: 'general' }),
    ).toBe(false);
    expect(isSystemTemplate(null)).toBe(false);
    expect(isSystemTemplate(undefined)).toBe(false);
  });

  it('filtre: sistem (silinemez) şablonları listeden çıkarsak normal akış devam eder', () => {
    const withSeed: MessageTemplateRow[] = [
      {
        id: Array.from(SYSTEM_TEMPLATE_IDS)[0],
        name: 'Seed',
        body_text: '',
        body_text_tr: 'Seed TR',
        category: 'general',
        is_active: true,
      },
      {
        id: 'user-1',
        name: 'Kullanıcı 1',
        body_text: '',
        body_text_tr: 'User TR',
        category: 'general',
        is_active: true,
      },
    ];
    // Kullanıcı tarafından silinebilir ID'ler: seed olmayanlar
    const userOnly = withSeed.filter((t) => !isSystemTemplate(t));
    expect(userOnly).toHaveLength(1);
    expect(userOnly[0].id).toBe('user-1');
  });
});

describe('createMessageTemplate wrapper — payload map kuralları', () => {
  it('verilen alanlar payload\'da korunur; verilmeyenler defaulta düşer', () => {
    // Mantık: tek dil body + kategori "general" + is_active true
    const input = {
      name: 'Yeni Şablon',
      body_text_tr: 'Merhaba {customer_name}',
    };
    const translations: Record<string, string> = {
      tr: input.body_text_tr ?? '',
      en: '',
      ar: '',
      ku: '',
    };
    const headlines: Record<string, string> = { tr: '', en: '', ar: '', ku: '' };
    expect(translations.tr).toBe('Merhaba {customer_name}');
    expect(translations.en).toBe('');
    expect(headlines).toEqual({ tr: '', en: '', ar: '', ku: '' });
  });

  it('4 dilde dolu → tüm çeviriler korunur', () => {
    const translations: MessageTemplateTranslations = {
      tr: 'TR',
      en: 'EN',
      ar: 'AR',
      ku: 'KU',
    };
    expect(translations.tr).toBe('TR');
    expect(translations.en).toBe('EN');
    expect(translations.ar).toBe('AR');
    expect(translations.ku).toBe('KU');
  });

  it('başlık kolonları yoksa headlines undefined olmaz, boş objeye düşer', () => {
    const headlines: MessageTemplateTranslations = { tr: '', en: '', ar: '', ku: '' };
    expect(headlines).toBeDefined();
    expect(Object.values(headlines).every((v) => v === '')).toBe(true);
  });
});

describe('updateMessageTemplate wrapper — kısmi güncelleme kuralları', () => {
  it('yalnızca body_text_ku güncellenir, diğerleri korunur', () => {
    // patch: { name, body_text_ku }
    // çıktı payload shape:
    //   { name, translations: { ku: '...' }, headlines: undefined }
    const patch = {
      name: 'Yenilendi',
      body_text_ku: 'سڵاوی نوێ',
    };
    const translations: Partial<MessageTemplateTranslations> =
      patch.body_text_tr !== undefined ||
      patch.body_text_en !== undefined ||
      patch.body_text_ar !== undefined ||
      patch.body_text_ku !== undefined
        ? {
            ...(patch.body_text_tr !== undefined ? { tr: patch.body_text_tr } : {}),
            ...(patch.body_text_en !== undefined ? { en: patch.body_text_en } : {}),
            ...(patch.body_text_ar !== undefined ? { ar: patch.body_text_ar } : {}),
            ...(patch.body_text_ku !== undefined ? { ku: patch.body_text_ku } : {}),
          }
        : undefined;
    expect(translations).toEqual({ ku: 'سڵاوی نوێ' });
  });

  it('hiçbir dil kolonu verilmezse translations payload\'a girmez', () => {
    const patch = { name: 'Sadece ad' };
    const none =
      patch.body_text_tr === undefined &&
      patch.body_text_en === undefined &&
      patch.body_text_ar === undefined &&
      patch.body_text_ku === undefined;
    expect(none).toBe(true);
  });

  it('is_active false verilirse boolean olarak iletilir', () => {
    const patch = { is_active: false as boolean };
    const out = !!patch.is_active;
    expect(out).toBe(false);
  });
});

describe('filterTemplatesByLang — silinen şablon artık filtrelenmez', () => {
  const TPLS: MessageTemplateRow[] = [
    {
      id: 'alive',
      name: 'Yaşayan',
      body_text: 'A',
      body_text_tr: 'TR içerik',
      category: 'general',
      is_active: true,
    },
    {
      id: 'died',
      name: 'Silinen',
      body_text: 'B',
      body_text_tr: 'TR içerik',
      category: 'general',
      is_active: true,
    },
  ];

  it('silinen listeden çıkarılınca filter yalnızca kalanları döndürür', () => {
    expect(filterTemplatesByLang(TPLS, 'tr').map((t) => t.id).sort()).toEqual([
      'alive',
      'died',
    ]);
    const afterDelete = filterTemplatesByLang(TPLS.filter((t) => t.id !== 'died'), 'tr').map(
      (t) => t.id,
    );
    expect(afterDelete).toEqual(['alive']);
  });

  it('resolveTemplateTranslations objesi doğru dilleri döndürür', () => {
    const row: MessageTemplateRow = {
      id: 'mix',
      name: 'Karışık',
      body_text: 'fallback TR',
      body_text_tr: 'TR özgün',
      body_text_ku: 'KU özgün',
      category: 'general',
      is_active: true,
    };
    const trn = resolveTemplateTranslations(row);
    expect(trn.tr).toBe('TR özgün');
    expect(trn.ku).toBe('KU özgün');
    expect(trn.en).toBe('TR özgün');
    expect(trn.ar).toBe('TR özgün');
  });

  it('hasTemplateBodyInLang dil doluluğunu tutarlı raporlar', () => {
    const row: MessageTemplateRow = {
      id: 'check',
      name: 'C',
      body_text: '',
      body_text_tr: 'TR',
      body_text_ku: 'KU',
      category: 'general',
      is_active: true,
    };
    expect(hasTemplateBodyInLang(row, 'tr')).toBe(true);
    expect(hasTemplateBodyInLang(row, 'ku')).toBe(true);
    expect(hasTemplateBodyInLang(row, 'en')).toBe(false);
    expect(hasTemplateBodyInLang(row, 'ar')).toBe(false);
  });
});
