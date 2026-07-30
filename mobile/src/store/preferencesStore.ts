import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Menü / dashboard görünümü — mobil-only (web’de eşdeğer ayar yok). */
export type MenuViewMode = 'cards' | 'list';

/** Restoran sipariş menü kataloğu — ızgara (resimli) / liste. */
export type RestMenuCatalogView = 'grid' | 'list';

/** Restoran raporları — liste / grafik. */
export type RestReportsView = 'list' | 'chart';

type PreferencesState = {
  menuViewMode: MenuViewMode;
  setMenuViewMode: (mode: MenuViewMode) => void;
  toggleMenuViewMode: () => void;
  restMenuCatalogView: RestMenuCatalogView;
  setRestMenuCatalogView: (mode: RestMenuCatalogView) => void;
  restReportsView: RestReportsView;
  setRestReportsView: (mode: RestReportsView) => void;
};

type PersistedPreferences = {
  menuViewMode?: MenuViewMode;
  restMenuCatalogView?: RestMenuCatalogView;
  restReportsView?: RestReportsView;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      /** Varsayılan: grup başlıklı liste. Kart modu = telefon portrait’te 3 sütun. */
      menuViewMode: 'list',
      setMenuViewMode: (mode) => set({ menuViewMode: mode }),
      toggleMenuViewMode: () =>
        set({ menuViewMode: get().menuViewMode === 'cards' ? 'list' : 'cards' }),
      restMenuCatalogView: 'grid',
      setRestMenuCatalogView: (mode) => set({ restMenuCatalogView: mode }),
      restReportsView: 'list',
      setRestReportsView: (mode) => set({ restReportsView: mode }),
    }),
    {
      name: 'retailex_mobile_preferences',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        menuViewMode: s.menuViewMode,
        restMenuCatalogView: s.restMenuCatalogView,
        restReportsView: s.restReportsView,
      }),
      migrate: (persisted, fromVersion) => {
        const prev = (persisted ?? {}) as PersistedPreferences;
        // v0 varsayılanı cards’tı ve “ikili” şikayetine yol açtı → tek sefer listeye al.
        if (fromVersion === 0) {
          return {
            menuViewMode: 'list' as MenuViewMode,
            restMenuCatalogView: 'grid' as RestMenuCatalogView,
            restReportsView: 'list' as RestReportsView,
          };
        }
        return {
          menuViewMode: prev.menuViewMode === 'cards' ? 'cards' : 'list',
          restMenuCatalogView: prev.restMenuCatalogView === 'list' ? 'list' : 'grid',
          restReportsView: prev.restReportsView === 'chart' ? 'chart' : 'list',
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
