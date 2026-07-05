/** Entegrasyonlar modülü yetkili erişim şifresi (DeskApp / altyapı ile aynı). */
export const INTEGRATIONS_ACCESS_PASSWORD = '10021993';

const STORAGE_KEY = 'retailex_integrations_access_granted';

export function isIntegrationsAccessGranted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function grantIntegrationsAccess(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, '1');
  window.dispatchEvent(new CustomEvent('retailex:integrations-access-granted'));
}

export function revokeIntegrationsAccess(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('retailex:integrations-access-revoked'));
}

export function verifyIntegrationsPassword(password: string): boolean {
  return password.trim() === INTEGRATIONS_ACCESS_PASSWORD;
}
