import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './locales/tr.json';
import en from './locales/en.json';
import ar from './locales/ar.json';
import ku from './locales/ku.json';

void i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    tr: { translation: tr },
    en: { translation: en },
    ar: { translation: ar },
    ku: { translation: ku },
  },
  lng: 'tr',
  fallbackLng: 'tr',
  supportedLngs: ['tr', 'en', 'ar', 'ku'],
  interpolation: { escapeValue: false },
  // RN'de Suspense boundary yok → blank/reload takılması
  react: { useSuspense: false },
});

export default i18n;
export {
  APP_LANGUAGES,
  LANGUAGE_LABEL_KEYS,
  applyLayoutDirection,
  isAppLanguage,
  isRtlLanguage,
  localeTagForLanguage,
  reloadAppForRtl,
  type AppLanguage,
} from './languages';
