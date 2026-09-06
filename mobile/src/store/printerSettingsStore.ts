import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_PRINTER_SETTINGS,
  type MobilePrinterSettings,
  type ReceiptLangCode,
  type ReceiptPaperSize,
  type PrinterInterface,
  type PrinterType,
} from '../types/printerSettings';

type PrinterSettingsState = {
  settings: MobilePrinterSettings;
  setSettings: (partial: Partial<MobilePrinterSettings>) => void;
  resetSettings: () => void;
  setEnabled: (enabled: boolean) => void;
  setInterface: (iface: PrinterInterface) => void;
  setType: (type: PrinterType) => void;
  setPaperSize: (paperSize: ReceiptPaperSize) => void;
  setDefaultLanguage: (lang: ReceiptLangCode) => void;
  setAutoPrint: (autoPrint: boolean) => void;
  setWindowsServiceUrl: (url: string) => void;
  setWindowsServiceApiKey: (key: string) => void;
  setWindowsPrinterName: (name: string) => void;
  /** Yönetim — Windows servisi genel geçişi ve fiş türü yönlendirmeleri */
  setUseWindowsServiceGlobal: (value: boolean) => void;
  setKitchenTicketWindowsService: (value: boolean) => void;
  setPosReceiptWindowsService: (value: boolean) => void;
  setAccountReceiptWindowsService: (value: boolean) => void;
  setInvoiceWindowsService: (value: boolean) => void;
};

function mergeSettings(
  base: MobilePrinterSettings,
  partial: Partial<MobilePrinterSettings>,
): MobilePrinterSettings {
  return { ...base, ...partial };
}

export const usePrinterSettingsStore = create<PrinterSettingsState>()(
  persist(
    (set, get) => ({
      settings: { ...DEFAULT_PRINTER_SETTINGS },
      setSettings: (partial) =>
        set((s) => ({ settings: mergeSettings(s.settings, partial) })),
      resetSettings: () => set({ settings: { ...DEFAULT_PRINTER_SETTINGS } }),
      setEnabled: (enabled) => get().setSettings({ enabled }),
      setInterface: (iface) => get().setSettings({ interface: iface }),
      setType: (type) => get().setSettings({ type }),
      setPaperSize: (paperSize) => get().setSettings({ paperSize }),
      setDefaultLanguage: (defaultLanguage) => get().setSettings({ defaultLanguage }),
      setAutoPrint: (autoPrint) => get().setSettings({ autoPrint }),
      setWindowsServiceUrl: (windowsServiceUrl) => get().setSettings({ windowsServiceUrl }),
      setWindowsServiceApiKey: (windowsServiceApiKey) =>
        get().setSettings({ windowsServiceApiKey }),
      setWindowsPrinterName: (windowsPrinterName) =>
        get().setSettings({ windowsPrinterName }),
      setUseWindowsServiceGlobal: (useWindowsServiceGlobal) =>
        get().setSettings({ useWindowsServiceGlobal }),
      setKitchenTicketWindowsService: (kitchenTicketWindowsService) =>
        get().setSettings({ kitchenTicketWindowsService }),
      setPosReceiptWindowsService: (posReceiptWindowsService) =>
        get().setSettings({ posReceiptWindowsService }),
      setAccountReceiptWindowsService: (accountReceiptWindowsService) =>
        get().setSettings({ accountReceiptWindowsService }),
      setInvoiceWindowsService: (invoiceWindowsService) =>
        get().setSettings({ invoiceWindowsService }),
    }),
    {
      name: 'retailex_mobile_printer_settings',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ settings: s.settings }),
      merge: (persisted, current) => {
        const p = persisted as { settings?: Partial<MobilePrinterSettings> } | undefined;
        return {
          ...current,
          settings: mergeSettings(DEFAULT_PRINTER_SETTINGS, p?.settings ?? {}),
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn('[printerSettingsStore] rehydrate failed', error);
        }
      },
    },
  ),
);
