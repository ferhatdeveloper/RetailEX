/**
 * DeskApp siyah SetupWizard kapısı — App.tsx gate ile Login arasında köprü.
 * localStorage legacy bayrakları tek başına wizard’ı atlamamalı.
 */

export const SETUP_WIZARD_EVENT = 'retailex-open-setup-wizard';
export const SETUP_WIZARD_FORCE_KEY = 'retailex_force_setup_wizard';

export function clearSetupWizardLocalFlags(): void {
  try {
    localStorage.removeItem('exretail_firma_donem_configured');
  } catch {
    /* ignore */
  }
}

/** Yenileme sonrası App’in SetupWizard göstermesi için (fabrika sıfırlama vb.) */
export function markForceSetupWizard(): void {
  try {
    sessionStorage.setItem(SETUP_WIZARD_FORCE_KEY, '1');
  } catch {
    /* ignore */
  }
  clearSetupWizardLocalFlags();
}

export function peekForceSetupWizard(): boolean {
  try {
    return sessionStorage.getItem(SETUP_WIZARD_FORCE_KEY) === '1';
  } catch {
    return false;
  }
}

export function consumeForceSetupWizard(): boolean {
  if (!peekForceSetupWizard()) return false;
  try {
    sessionStorage.removeItem(SETUP_WIZARD_FORCE_KEY);
  } catch {
    /* ignore */
  }
  return true;
}

/** Aynı oturumda App.isConfigured=false — reload gerekmez */
export function requestOpenSetupWizard(): void {
  clearSetupWizardLocalFlags();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SETUP_WIZARD_EVENT));
  }
}
