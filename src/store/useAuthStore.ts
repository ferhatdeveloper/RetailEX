// Authentication Store
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../core/types';
import { STORAGE_KEYS } from '../core/config/constants';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      
      login: (user: User) => {
        set({ user, isAuthenticated: true });
      },
      
      logout: () => {
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: STORAGE_KEYS.USER,
    }
  )
);


