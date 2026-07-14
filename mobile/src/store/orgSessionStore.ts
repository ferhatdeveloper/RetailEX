import { create } from 'zustand';

/**
 * Web `refreshFirmScopedStores` karşılığı.
 * Firma/dönem/mağaza değişince epoch artar; liste ekranları yeniden yükler.
 */
type OrgSessionState = {
  epoch: number;
  bump: () => void;
};

export const useOrgSessionStore = create<OrgSessionState>((set) => ({
  epoch: 0,
  bump: () => set((s) => ({ epoch: s.epoch + 1 })),
}));

export function bumpOrgSession(): void {
  useOrgSessionStore.getState().bump();
}
