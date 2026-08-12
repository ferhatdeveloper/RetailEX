import { create } from 'zustand';
import {
  DEFAULT_CALLER_ID_CONFIG,
  loadCallerIdConfig,
  saveCallerIdConfig,
  type CallerIdConfig,
  type CallerIdEvent,
} from '../api/callerIdApi';
import type { CustomerRow } from '../api/customersApi';

type CallerIdState = {
  hydrated: boolean;
  config: CallerIdConfig;
  incoming: CallerIdEvent | null;
  matchedCustomer: CustomerRow | null;
  pollError: string | null;
  hydrate: () => Promise<void>;
  setConfig: (cfg: CallerIdConfig) => Promise<void>;
  setIncoming: (ev: CallerIdEvent | null) => void;
  setMatchedCustomer: (c: CustomerRow | null) => void;
  setPollError: (e: string | null) => void;
  dismissIncoming: () => void;
};

export const useCallerIdStore = create<CallerIdState>((set) => ({
  hydrated: false,
  config: { ...DEFAULT_CALLER_ID_CONFIG },
  incoming: null,
  matchedCustomer: null,
  pollError: null,

  hydrate: async () => {
    const config = await loadCallerIdConfig();
    set({ config, hydrated: true });
  },

  setConfig: async (cfg) => {
    await saveCallerIdConfig(cfg);
    set({ config: cfg });
  },

  setIncoming: (ev) => set({ incoming: ev }),
  setMatchedCustomer: (c) => set({ matchedCustomer: c }),
  setPollError: (e) => set({ pollError: e }),
  dismissIncoming: () => set({ incoming: null, matchedCustomer: null }),
}));

export function isCallerIdListening(cfg: CallerIdConfig = useCallerIdStore.getState().config): boolean {
  return cfg.mode === 'virtual_pbx' || cfg.mode === 'physical_device';
}
