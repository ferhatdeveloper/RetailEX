import { create } from 'zustand';
import { pendingMutationCount } from '../offline/mutationQueue';

type ConnectivityState = {
  /** NetInfo isConnected */
  isConnected: boolean | null;
  /** NetInfo isInternetReachable (null = bilinmiyor) */
  isInternetReachable: boolean | null;
  syncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  setNetState: (connected: boolean | null, reachable: boolean | null) => void;
  setSyncing: (v: boolean) => void;
  setPendingCount: (n: number) => void;
  setLastSyncedAt: (iso: string | null) => void;
  refreshPendingCount: () => Promise<void>;
};

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  isConnected: null,
  isInternetReachable: null,
  syncing: false,
  pendingCount: 0,
  lastSyncedAt: null,
  setNetState: (isConnected, isInternetReachable) =>
    set({ isConnected, isInternetReachable }),
  setSyncing: (syncing) => set({ syncing }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  refreshPendingCount: async () => {
    const n = await pendingMutationCount();
    set({ pendingCount: n });
  },
}));
