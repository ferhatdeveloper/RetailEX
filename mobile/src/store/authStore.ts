import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  email?: string | null;
  roleName?: string | null;
  firmNr: string;
  periodNr: string;
  storeId?: string | null;
  storeName?: string | null;
};

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  isHydrated: boolean;
  setHydrated: (v: boolean) => void;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateOrg: (partial: Partial<Pick<AuthUser, 'firmNr' | 'periodNr' | 'storeId' | 'storeName'>>) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isHydrated: false,
      setHydrated: (v) => set({ isHydrated: v }),
      login: (user) =>
        set({
          user,
          token: `mobile_${user.id}_${Date.now()}`,
        }),
      logout: () => set({ user: null, token: null }),
      updateOrg: (partial) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, ...partial } });
      },
    }),
    {
      name: 'retailex_mobile_session',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[authStore] rehydrate failed', error);
        }
        state?.setHydrated(true);
      },
      partialize: (s) => ({ user: s.user, token: s.token }),
    },
  ),
);
