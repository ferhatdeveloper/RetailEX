import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Menü / dashboard görünümü — mobil-only (web’de eşdeğer ayar yok). */
export type MenuViewMode = 'cards' | 'list';

/** Restoran sipariş menü kataloğu — ızgara (resimli) / liste. */
export type RestMenuCatalogView = 'grid' | 'list';

/** Resimli menü ızgara sütun sayısı (2–6). */
export type RestMenuCatalogGridCols = 2 | 3 | 4 | 5 | 6;

/** Raporlar (ERP + restoran) — liste / grafik. */
export type ReportsView = 'list' | 'chart';

/** @deprecated reportsView kullanın */
export type RestReportsView = ReportsView;

/**
 * Kurulum / giriş tipi.
 * `retail` eski kayıt; okununca `market` olur.
 * `general` dikey yapı listesini açmaz.
 */
export type BusinessProfile =
  | 'general'
  | 'restaurant'
  | 'retail'
  | 'market'
  | 'wms'
  | 'beauty'
  | 'clinic';

type PreferencesState = {
  menuViewMode: MenuViewMode;
  setMenuViewMode: (mode: MenuViewMode) => void;
  toggleMenuViewMode: () => void;
  restMenuCatalogView: RestMenuCatalogView;
  setRestMenuCatalogView: (mode: RestMenuCatalogView) => void;
  restMenuCatalogGridCols: RestMenuCatalogGridCols;
  setRestMenuCatalogGridCols: (cols: RestMenuCatalogGridCols) => void;
  reportsView: ReportsView;
  setReportsView: (mode: ReportsView) => void;
  /** RestaurantReportsScreen uyumluluğu — setReportsView alias */
  restReportsView: ReportsView;
  setRestReportsView: (mode: ReportsView) => void;
  businessProfile: BusinessProfile;
  setBusinessProfile: (profile: BusinessProfile) => void;
  /** Firma veya kiracı kaydı tipi belirlediyse seçim kapalı. */
  businessProfileLocked: boolean;
  setBusinessProfileLocked: (locked: boolean) => void;
};

type PersistedPreferences = {
  menuViewMode?: MenuViewMode;
  restMenuCatalogView?: RestMenuCatalogView;
  restMenuCatalogGridCols?: number;
  reportsView?: ReportsView;
  restReportsView?: ReportsView;
  businessProfile?: BusinessProfile;
  businessProfileLocked?: boolean;
};

function normalizeReportsView(v: unknown): ReportsView {
  return v === 'chart' ? 'chart' : 'list';
}

function normalizeGridCols(v: unknown): RestMenuCatalogGridCols {
  const n = Number(v);
  if (n === 2 || n === 3 || n === 4 || n === 5 || n === 6) return n;
  return 3;
}

function normalizeBusinessProfile(v: unknown): BusinessProfile {
  if (v === 'retail') return 'market';
  if (
    v === 'restaurant' ||
    v === 'market' ||
    v === 'wms' ||
    v === 'beauty' ||
    v === 'clinic' ||
    v === 'general'
  ) {
    return v;
  }
  return 'general';
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
      restMenuCatalogGridCols: 3,
      setRestMenuCatalogGridCols: (cols) =>
        set({ restMenuCatalogGridCols: normalizeGridCols(cols) }),
      reportsView: 'list',
      setReportsView: (mode) => set({ reportsView: mode, restReportsView: mode }),
      restReportsView: 'list',
      setRestReportsView: (mode) => set({ reportsView: mode, restReportsView: mode }),
      businessProfile: 'general',
      setBusinessProfile: (profile) =>
        set({ businessProfile: normalizeBusinessProfile(profile) }),
      businessProfileLocked: false,
      setBusinessProfileLocked: (locked) => set({ businessProfileLocked: locked }),
    }),
    {
      name: 'retailex_mobile_preferences',
      version: 6,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        menuViewMode: s.menuViewMode,
        restMenuCatalogView: s.restMenuCatalogView,
        restMenuCatalogGridCols: s.restMenuCatalogGridCols,
        reportsView: s.reportsView,
        businessProfile: s.businessProfile,
        businessProfileLocked: s.businessProfileLocked,
      }),
      migrate: (persisted, fromVersion) => {
        const prev = (persisted ?? {}) as PersistedPreferences;
        // v0 varsayılanı cards’tı ve “ikili” şikayetine yol açtı → tek sefer listeye al.
        if (fromVersion === 0) {
          return {
            menuViewMode: 'list' as MenuViewMode,
            restMenuCatalogView: 'grid' as RestMenuCatalogView,
            restMenuCatalogGridCols: 3 as RestMenuCatalogGridCols,
            reportsView: 'list' as ReportsView,
            businessProfile: 'general' as BusinessProfile,
            businessProfileLocked: false,
          };
        }
        const reportsView = normalizeReportsView(
          prev.reportsView ?? prev.restReportsView,
        );
        return {
          menuViewMode: prev.menuViewMode === 'cards' ? 'cards' : 'list',
          restMenuCatalogView: prev.restMenuCatalogView === 'list' ? 'list' : 'grid',
          restMenuCatalogGridCols: normalizeGridCols(prev.restMenuCatalogGridCols),
          reportsView,
          businessProfile: normalizeBusinessProfile(prev.businessProfile),
          businessProfileLocked: prev.businessProfileLocked === true,
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
          restMenuCatalogGridCols: normalizeGridCols(
            p.restMenuCatalogGridCols ?? current.restMenuCatalogGridCols,
          ),
          businessProfile: normalizeBusinessProfile(
            p.businessProfile ?? current.businessProfile,
          ),
          businessProfileLocked: p.businessProfileLocked === true,
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
