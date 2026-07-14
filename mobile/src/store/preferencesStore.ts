import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Menü / dashboard görünümü — mobil-only (web’de eşdeğer ayar yok). */
export type MenuViewMode = 'cards' | 'list';

type PreferencesState = {
  menuViewMode: MenuViewMode;
  setMenuViewMode: (mode: MenuViewMode) => void;
  toggleMenuViewMode: () => void;
};

type PersistedPreferences = {
  menuViewMode?: MenuViewMode;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      /** Varsayılan: grup başlıklı liste. Kart modu = telefon portrait’te 3 sütun. */
      menuViewMode: 'list',
      setMenuViewMode: (mode) => set({ menuViewMode: mode }),
      toggleMenuViewMode: () =>
        set({ menuViewMode: get().menuViewMode === 'cards' ? 'list' : 'cards' }),
    }),
    {
      name: 'retailex_mobile_preferences',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ menuViewMode: s.menuViewMode }),
      migrate: (persisted, fromVersion) => {
        const prev = (persisted ?? {}) as PersistedPreferences;
        // v0 varsayılanı cards’tı ve “ikili” şikayetine yol açtı → tek sefer listeye al.
        if (fromVersion === 0) {
          return { menuViewMode: 'list' as MenuViewMode };
        }
        return {
          menuViewMode: prev.menuViewMode === 'cards' ? 'cards' : 'list',
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn('[preferencesStore] rehydrate failed', error);
        }
      },
    },
  ),
);
