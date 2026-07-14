import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './locales/tr.json';
import en from './locales/en.json';

void i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: 'tr',
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
  // RN'de Suspense boundary yok → blank/reload takılması
  react: { useSuspense: false },
});

export default i18n;
