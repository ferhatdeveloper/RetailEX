import { describe, expect, it } from 'vitest';
import { getStaticMenuSections } from '../../config/staticMenuConfig';
import { translations } from '../../locales/translations';
import { buildRbacModuleGroups } from '../../locales/rbacCatalog';

const LABELS = {
  tr: 'Dil dosyaları',
  en: 'Language files',
  ar: 'ملفات اللغة',
  ku: 'فایلەکانی زمان',
} as const;

describe('dil dosyaları menüsü', () => {
  it('sistem yönetimi altında dört dilde görünür', () => {
    for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
      const sections = getStaticMenuSections(translations[lang]) as Array<{
        id?: string;
        items: Array<{ screen?: string; label?: string }>;
      }>;
      const system = sections.find((section) => section.id === 'system-management');
      const item = system?.items.find((entry) => entry.screen === 'locale-files');
      expect(item?.label, lang).toBe(LABELS[lang]);
    }
  });

  it('yetki grubu yönetim kapısındadır', () => {
    const groups = buildRbacModuleGroups((key) => key);
    const admin = groups.find((group) => group.id === 'backoffice');
    expect(admin?.modules.some((mod) => mod.id === 'locale-files')).toBe(true);
  });
});
