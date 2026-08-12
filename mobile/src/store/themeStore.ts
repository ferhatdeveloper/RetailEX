import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { darkColors, lightColors, type ThemeColors } from '../theme/colors';

type ThemeState = {
  darkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (v: boolean) => void;
  colors: ThemeColors;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      darkMode: false,
      colors: lightColors,
      toggleDarkMode: () => {
        const next = !get().darkMode;
        set({ darkMode: next, colors: next ? darkColors : lightColors });
      },
      setDarkMode: (v) => set({ darkMode: v, colors: v ? darkColors : lightColors }),
    }),
    {
      name: 'retailex_mobile_theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ darkMode: s.darkMode }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[themeStore] rehydrate failed', error);
        }
        if (state) {
          state.colors = state.darkMode ? darkColors : lightColors;
        }
      },
    },
  ),
);
