import { create } from 'zustand';

/**
 * POS / kabuk satış tarihi override.
 * Oturum belleği (persist yok): sayfa yenilenince sistem saatine döner.
 * `resetAfterSale` açıksa bir başarılı satış sonrası override temizlenir.
 */
interface PosDateOverrideState {
  /** Kullanıcının seçtiği baz tarih-saat (ISO) */
  overrideIso: string | null;
  /** Override uygulandığı an (Date.now) — saat kayması için */
  appliedAtMs: number | null;
  /** Modal checkbox tercihi; varsayılan true (güvenli) */
  resetAfterSale: boolean;
  setOverride: (iso: string, resetAfterSale: boolean) => void;
  /** Yalnızca checkbox tercihini güncelle (override yokken) */
  setResetAfterSalePreference: (value: boolean) => void;
  clearOverride: () => void;
  /** Başarılı satış/fiş kaydı sonrası çağrılır */
  onSaleSuccess: () => void;
  getNow: () => Date;
  isActive: () => boolean;
}

export const usePosDateOverrideStore = create<PosDateOverrideState>((set, get) => ({
  overrideIso: null,
  appliedAtMs: null,
  resetAfterSale: true,

  setOverride: (iso, resetAfterSale) =>
    set({
      overrideIso: iso,
      appliedAtMs: Date.now(),
      resetAfterSale,
    }),

  setResetAfterSalePreference: (value) => set({ resetAfterSale: value }),

  clearOverride: () => set({ overrideIso: null, appliedAtMs: null }),

  onSaleSuccess: () => {
    const { resetAfterSale, overrideIso } = get();
    if (resetAfterSale && overrideIso) {
      set({ overrideIso: null, appliedAtMs: null });
    }
  },

  getNow: () => {
    const { overrideIso, appliedAtMs } = get();
    if (!overrideIso || appliedAtMs == null) return new Date();
    const base = new Date(overrideIso).getTime();
    if (Number.isNaN(base)) return new Date();
    return new Date(base + (Date.now() - appliedAtMs));
  },

  isActive: () => Boolean(get().overrideIso),
}));

/** React dışı satış kaydı için */
export function getPosNow(): Date {
  return usePosDateOverrideStore.getState().getNow();
}

/** Başarılı satış sonrası override temizleme (flag açıksa) */
export function notifyPosSaleSuccess(): void {
  usePosDateOverrideStore.getState().onSaleSuccess();
}

/** `<input type="date">` / `time` için yerel parçalar */
export function toLocalDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toLocalTimeInputValue(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}
