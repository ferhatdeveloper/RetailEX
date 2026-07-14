import type { TFunction } from 'i18next';

/** Menü öğesi / bölüm / hızlı erişim etiketi (fallback = menuConfig TR label) */
export function tMenuItem(t: TFunction, id: string, fallback: string): string {
  return String(t(`menu.items.${id}`, { defaultValue: fallback }));
}

export function tMenuSection(t: TFunction, id: string, fallback: string): string {
  return String(t(`menu.sections.${id}`, { defaultValue: fallback }));
}

export function tMenuQuick(t: TFunction, id: string, fallback: string): string {
  return String(t(`menu.quick.${id}`, { defaultValue: fallback }));
}

export function tMenuBadge(t: TFunction, badge: string | undefined): string | undefined {
  if (!badge) return undefined;
  const b = badge.trim();
  if (b === 'Yeni' || b === 'New' || b === 'جديد' || b === 'نوێ') {
    return String(t('menu.badgeNew', { defaultValue: badge }));
  }
  if (b === 'AI') return String(t('menu.badgeAi', { defaultValue: 'AI' }));
  return badge;
}
