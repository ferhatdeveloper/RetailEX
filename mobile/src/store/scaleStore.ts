import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_SCALE_DEVICE,
  type BluetoothScaleProfile,
  type ScaleDevice,
  type ScaleTransportKind,
} from '../types/scale';
import type { LabelSlot } from '../services/scale/labelSlotHelper';
import { USB_DEFAULT_BAUD } from '../services/scale/usbSerialScale';

export type ScaleUiSettings = {
  /** Tartılı satışta ağırlık kaynağı tercihi */
  preferSimulateWeigh: boolean;
  defaultPort: number;
  lastSelectedDeviceId: string | null;
  /** Senkron sonrası hotkey tablosu hazırla / gönder (DLL/SDK) */
  sendHotkeys: boolean;
  /** PLU göndermeden önce operate=D temizliği */
  clearBeforeSend: boolean;
  labelSlot: LabelSlot;
  sendLabelOnSync: boolean;
  usbBaudRate: number;
  bluetoothProfile: BluetoothScaleProfile;
};

type ScaleState = {
  devices: ScaleDevice[];
  settings: ScaleUiSettings;
  logs: string[];
  setDevices: (devices: ScaleDevice[]) => void;
  upsertDevice: (device: ScaleDevice) => void;
  removeDevice: (id: string) => void;
  toggleDeviceEnabled: (id: string) => void;
  selectDevice: (id: string | null) => void;
  updateSettings: (partial: Partial<ScaleUiSettings>) => void;
  pushLog: (line: string) => void;
  clearLogs: () => void;
  getSelectedDevice: () => ScaleDevice | null;
};

const DEFAULT_SETTINGS: ScaleUiSettings = {
  preferSimulateWeigh: true,
  defaultPort: 5001,
  lastSelectedDeviceId: null,
  sendHotkeys: false,
  clearBeforeSend: false,
  labelSlot: 'D0',
  sendLabelOnSync: false,
  usbBaudRate: USB_DEFAULT_BAUD,
  bluetoothProfile: 'ble',
};

function logTs(msg: string): string {
  const t = new Date().toLocaleTimeString('tr-TR');
  return `[${t}] ${msg}`;
}

export const useScaleStore = create<ScaleState>()(
  persist(
    (set, get) => ({
      devices: [],
      settings: { ...DEFAULT_SETTINGS },
      logs: [],
      setDevices: (devices) => set({ devices }),
      upsertDevice: (device) =>
        set((s) => {
          const i = s.devices.findIndex((d) => d.id === device.id);
          if (i < 0) return { devices: [...s.devices, device] };
          const next = [...s.devices];
          next[i] = device;
          return { devices: next };
        }),
      removeDevice: (id) =>
        set((s) => ({
          devices: s.devices.filter((d) => d.id !== id),
          settings:
            s.settings.lastSelectedDeviceId === id
              ? { ...s.settings, lastSelectedDeviceId: null }
              : s.settings,
        })),
      toggleDeviceEnabled: (id) =>
        set((s) => ({
          devices: s.devices.map((d) =>
            d.id === id ? { ...d, enabled: !d.enabled } : d,
          ),
        })),
      selectDevice: (id) =>
        set((s) => ({
          settings: { ...s.settings, lastSelectedDeviceId: id },
        })),
      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),
      pushLog: (line) =>
        set((s) => ({
          logs: [...s.logs.slice(-199), logTs(line)],
        })),
      clearLogs: () => set({ logs: [] }),
      getSelectedDevice: () => {
        const { devices, settings } = get();
        if (settings.lastSelectedDeviceId) {
          const found = devices.find((d) => d.id === settings.lastSelectedDeviceId);
          if (found) return found;
        }
        return devices.find((d) => d.enabled) ?? devices[0] ?? null;
      },
    }),
    {
      name: 'retailex_mobile_scale',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        devices: s.devices,
        settings: s.settings,
        logs: s.logs.slice(-80),
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<ScaleState> | undefined;
        return {
          ...current,
          devices: Array.isArray(p?.devices) ? p!.devices! : [],
          settings: { ...DEFAULT_SETTINGS, ...(p?.settings ?? {}) },
          logs: Array.isArray(p?.logs) ? p!.logs! : [],
        };
      },
    },
  ),
);

export function createManualNetworkDevice(
  name: string,
  ipAddress: string,
  port: number,
  transport: ScaleTransportKind = 'network',
  opts?: {
    bluetoothProfile?: BluetoothScaleProfile;
    usbDeviceId?: string | null;
    usbBaudRate?: number;
  },
): ScaleDevice {
  const base = DEFAULT_SCALE_DEVICE();
  const isBt = transport === 'bluetooth';
  return {
    ...base,
    name: name.trim() || `Terazi ${ipAddress || transport}`,
    ipAddress: transport === 'network' ? ipAddress.trim() : '',
    port: port || 5001,
    transport,
    bluetoothAddress: isBt ? ipAddress.trim() : null,
    bluetoothProfile: isBt ? opts?.bluetoothProfile ?? 'ble' : null,
    usbDeviceId: transport === 'usb' ? opts?.usbDeviceId ?? ipAddress.trim() : null,
    usbBaudRate: opts?.usbBaudRate ?? USB_DEFAULT_BAUD,
  };
}
