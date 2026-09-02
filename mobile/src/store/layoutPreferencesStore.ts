import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type DeviceOrientationPref = 'landscape' | 'portrait' | 'auto';
export type RestaurantOrientationPref = 'auto' | 'landscape' | 'portrait';

export type LayoutPreferences = {
  defaultOrientationForTablet: DeviceOrientationPref;
  defaultOrientationForPhone: DeviceOrientationPref;
  restaurantLandscapeDefault: RestaurantOrientationPref;
};

export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferences = {
  defaultOrientationForTablet: 'landscape',
  defaultOrientationForPhone: 'portrait',
  restaurantLandscapeDefault: 'auto',
};

type LayoutPreferencesState = LayoutPreferences & {
  setTabletOrientation: (v: DeviceOrientationPref) => void;
  setPhoneOrientation: (v: DeviceOrientationPref) => void;
  setRestaurantOrientation: (v: RestaurantOrientationPref) => void;
  reset: () => void;
};

function mergeLayoutPreferences(
  base: LayoutPreferences,
  partial: Partial<LayoutPreferences>,
): LayoutPreferences {
  return { ...base, ...partial };
}

export const useLayoutPreferencesStore = create<LayoutPreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_LAYOUT_PREFERENCES,
      setTabletOrientation: (v) => set({ defaultOrientationForTablet: v }),
      setPhoneOrientation: (v) => set({ defaultOrientationForPhone: v }),
      setRestaurantOrientation: (v) => set({ restaurantLandscapeDefault: v }),
      reset: () => set({ ...DEFAULT_LAYOUT_PREFERENCES }),
    }),
    {
      name: 'retailex_mobile_layout_preferences',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        defaultOrientationForTablet: s.defaultOrientationForTablet,
        defaultOrientationForPhone: s.defaultOrientationForPhone,
        restaurantLandscapeDefault: s.restaurantLandscapeDefault,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<LayoutPreferences> | undefined;
        return {
          ...current,
          ...mergeLayoutPreferences(DEFAULT_LAYOUT_PREFERENCES, p ?? {}),
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn('[layoutPreferencesStore] rehydrate failed', error);
        }
      },
    },
  ),
);
