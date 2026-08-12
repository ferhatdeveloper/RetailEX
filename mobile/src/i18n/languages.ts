import { DevSettings, I18nManager } from 'react-native';

/** Web LanguageContext ile aynı kodlar. */
export type AppLanguage = 'tr' | 'en' | 'ar' | 'ku';

export const APP_LANGUAGES: readonly AppLanguage[] = ['tr', 'en', 'ar', 'ku'] as const;

export function isAppLanguage(v: unknown): v is AppLanguage {
  return v === 'tr' || v === 'en' || v === 'ar' || v === 'ku';
}

/** Web: ar ve ku → RTL */
export function isRtlLanguage(lang: AppLanguage): boolean {
  return lang === 'ar' || lang === 'ku';
}

export function localeTagForLanguage(lang: string): string {
  switch (lang) {
    case 'en':
      return 'en-US';
    case 'ar':
      return 'ar-SA';
    case 'ku':
      return 'ku-IQ';
    case 'tr':
    default:
      return 'tr-TR';
  }
}

export const LANGUAGE_LABEL_KEYS: Record<AppLanguage, 'langTr' | 'langEn' | 'langAr' | 'langKu'> = {
  tr: 'langTr',
  en: 'langEn',
  ar: 'langAr',
  ku: 'langKu',
};

/**
 * I18nManager RTL ayarla.
 * @returns true = native layout yönü değişti (çoğu cihazda yeniden başlatma gerekir)
 */
export function applyLayoutDirection(lang: AppLanguage): boolean {
  const wantRtl = isRtlLanguage(lang);
  const changed = I18nManager.isRTL !== wantRtl;
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(wantRtl);
  return changed;
}

/** Mümkünse JS bundle’ı yeniden yükle (Expo Go / dev). */
export function reloadAppForRtl(): void {
  try {
    DevSettings.reload?.();
  } catch {
    // production’da kullanıcıya ipucu gösterilir
  }
}
