// @refresh reset
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations, Translations } from '../locales/translations';
import { moduleTranslations, translate } from '../locales/module-translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  tm: (key: string) => string; // Module translations
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('retailos_language');
    return (saved as Language) || 'tr';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('retailos_language', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'ar' || lang === 'ku') ? 'rtl' : 'ltr';
  };

  // Set initial language and direction
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = (language === 'ar' || language === 'ku') ? 'rtl' : 'ltr';
  }, [language]);

  const translateModule = (key: string): string => {
    return translate(key, language);
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t: translations[language],
        tm: translateModule, // Module translation function
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}



