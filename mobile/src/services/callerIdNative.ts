/**
 * EAS / dev-client native CallStateReceiver köprüsü.
 * Expo Go'da NativeModules yok → no-op (ayrı android-callerid-bridge APK kullanın).
 */

import { NativeModules, Platform } from 'react-native';

type NativeCallerIdModule = {
  setConfig?: (json: string) => Promise<boolean> | boolean | void;
  isAvailable?: () => Promise<boolean> | boolean;
};

function getMod(): NativeCallerIdModule | null {
  if (Platform.OS !== 'android') return null;
  const mod = NativeModules.RetailExCallerId as NativeCallerIdModule | undefined;
  return mod ?? null;
}

export function isCallerIdNativePushAvailable(): boolean {
  return Boolean(getMod()?.setConfig);
}

export async function syncCallerIdNativeConfig(input: {
  enabled: boolean;
  /** Tam push URL: http://host:3001/api/caller_id/push */
  endpoint: string;
  token: string;
  device: string;
}): Promise<boolean> {
  const mod = getMod();
  if (!mod?.setConfig) return false;
  try {
    const payload = JSON.stringify({
      enabled: input.enabled,
      endpoint: normalizePushEndpoint(input.endpoint),
      token: input.token || '',
      device: input.device || '',
    });
    const r = await Promise.resolve(mod.setConfig(payload));
    return Boolean(r);
  } catch {
    return false;
  }
}

function normalizePushEndpoint(raw: string): string {
  const s = raw.trim().replace(/\/+$/, '');
  if (!s) return '';
  if (/\/api\/caller_id\/push$/i.test(s)) return s;
  if (/\/api\/caller_id\/last$/i.test(s)) {
    return s.replace(/\/api\/caller_id\/last$/i, '/api/caller_id/push');
  }
  return `${s}/api/caller_id/push`;
}
