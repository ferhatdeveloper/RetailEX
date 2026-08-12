import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  APP_LANGUAGES,
  applyLayoutDirection,
  isAppLanguage,
  type AppLanguage,
} from '../i18n/languages';
import i18n from '../i18n';

type LanguageState = {
  language: AppLanguage;
  /** Persist + i18n + RTL. RTL yön değişirse true döner (yeniden başlatma öner). */
  setLanguage: (lang: AppLanguage) => boolean;
  cycleLanguage: () => boolean;
};

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'tr',
      setLanguage: (lang) => {
        const rtlChanged = applyLayoutDirection(lang);
        void i18n.changeLanguage(lang);
        set({ language: lang });
        return rtlChanged;
      },
      cycleLanguage: () => {
        const idx = APP_LANGUAGES.indexOf(get().language);
        const next = APP_LANGUAGES[(idx + 1) % APP_LANGUAGES.length] ?? 'tr';
        return get().setLanguage(next);
      },
    }),
    {
      name: 'retailex_mobile_language',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ language: s.language }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[languageStore] rehydrate failed', error);
          return;
        }
        if (!state) return;
        const lang = isAppLanguage(state.language) ? state.language : 'tr';
        state.language = lang;
        applyLayoutDirection(lang);
        void i18n.changeLanguage(lang);
      },
    },
  ),
);
