/**
 * Entegrasyonlar modülü erişim — web `src/utils/integrationsAccess.ts` ile aynı şifre.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const INTEGRATIONS_ACCESS_PASSWORD = '10021993';

const STORAGE_KEY = 'retailex_integrations_access_granted';

export async function isIntegrationsAccessGranted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function grantIntegrationsAccess(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, '1');
}

export async function revokeIntegrationsAccess(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function verifyIntegrationsPassword(password: string): boolean {
  return password.trim() === INTEGRATIONS_ACCESS_PASSWORD;
}
