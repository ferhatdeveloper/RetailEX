import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Menü / dashboard görünümü — mobil-only (web’de eşdeğer ayar yok). */
export type MenuViewMode = 'cards' | 'list';

/** Restoran sipariş menü kataloğu — ızgara (resimli) / liste. */
export type RestMenuCatalogView = 'grid' | 'list';

/** Raporlar (ERP + restoran) — liste / grafik. */
export type ReportsView = 'list' | 'chart';

/** @deprecated reportsView kullanın */
export type RestReportsView = ReportsView;

type PreferencesState = {
  menuViewMode: MenuViewMode;
  setMenuViewMode: (mode: MenuViewMode) => void;
  toggleMenuViewMode: () => void;
  restMenuCatalogView: RestMenuCatalogView;
  setRestMenuCatalogView: (mode: RestMenuCatalogView) => void;
  reportsView: ReportsView;
  setReportsView: (mode: ReportsView) => void;
  /** RestaurantReportsScreen uyumluluğu — setReportsView alias */
  restReportsView: ReportsView;
  setRestReportsView: (mode: ReportsView) => void;
};

type PersistedPreferences = {
  menuViewMode?: MenuViewMode;
  restMenuCatalogView?: RestMenuCatalogView;
  reportsView?: ReportsView;
  restReportsView?: ReportsView;
};

function normalizeReportsView(v: unknown): ReportsView {
  return v === 'chart' ? 'chart' : 'list';
}

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
      reportsView: 'list',
      setReportsView: (mode) => set({ reportsView: mode, restReportsView: mode }),
      restReportsView: 'list',
      setRestReportsView: (mode) => set({ reportsView: mode, restReportsView: mode }),
    }),
    {
      name: 'retailex_mobile_preferences',
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        menuViewMode: s.menuViewMode,
        restMenuCatalogView: s.restMenuCatalogView,
        reportsView: s.reportsView,
      }),
      migrate: (persisted, fromVersion) => {
        const prev = (persisted ?? {}) as PersistedPreferences;
        // v0 varsayılanı cards’tı ve “ikili” şikayetine yol açtı → tek sefer listeye al.
        if (fromVersion === 0) {
          return {
            menuViewMode: 'list' as MenuViewMode,
            restMenuCatalogView: 'grid' as RestMenuCatalogView,
            reportsView: 'list' as ReportsView,
          };
        }
        const reportsView = normalizeReportsView(
          prev.reportsView ?? prev.restReportsView,
        );
        return {
          menuViewMode: prev.menuViewMode === 'cards' ? 'cards' : 'list',
          restMenuCatalogView: prev.restMenuCatalogView === 'list' ? 'list' : 'grid',
          reportsView,
        };
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as PersistedPreferences;
        const reportsView = normalizeReportsView(p.reportsView ?? p.restReportsView ?? current.reportsView);
        return {
          ...current,
          ...p,
          reportsView,
          restReportsView: reportsView,
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
