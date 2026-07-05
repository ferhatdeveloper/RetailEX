import type { EticaretSettings } from './types';
import { DEFAULT_ETICARET_CONTENT, DEFAULT_STOREFRONT_FEATURES } from './contentTypes';

const STORAGE_KEY = 'retailex_eticaret_settings';

export const DEFAULT_ETICARET_SETTINGS: EticaretSettings = {
  activeThemeId: 'ella',
  activeVariantId: 'ella-classic',
  demoMode: false,
  demoTenantCode: '',
  storeTitle: 'Online Mağaza',
  announcementText: 'Online satış mağazamıza hoş geldiniz.',
  enabled: true,
  ...DEFAULT_ETICARET_CONTENT,
  storefrontFeatures: { ...DEFAULT_STOREFRONT_FEATURES },
  freeShippingThreshold: 500,
  searchSuggestions: [],
};

export function loadEticaretSettings(): EticaretSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_ETICARET_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ETICARET_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<EticaretSettings>;
    return { ...DEFAULT_ETICARET_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_ETICARET_SETTINGS };
  }
}

export function saveEticaretSettings(patch: Partial<EticaretSettings>): EticaretSettings {
  const next = { ...loadEticaretSettings(), ...patch };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('retailex:eticaret-settings-changed', { detail: next }));
  }
  return next;
}

export async function loadEticaretSettingsFromDb(): Promise<EticaretSettings> {
  try {
    const { organizationAPI } = await import('../../src/services/api/organization');
    const row = await organizationAPI.getSystemSettings();
    const raw = row?.eticaret_settings as Partial<EticaretSettings> | null | undefined;
    if (raw && typeof raw === 'object') {
      const merged = { ...DEFAULT_ETICARET_SETTINGS, ...raw };
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
      return merged;
    }
  } catch {
    /* PG yoksa localStorage */
  }
  return loadEticaretSettings();
}

export async function saveEticaretSettingsToDb(settings: EticaretSettings): Promise<void> {
  saveEticaretSettings(settings);
  try {
    const { organizationAPI } = await import('../../src/services/api/organization');
    const current = await organizationAPI.getSystemSettings();
    await organizationAPI.saveSystemSettings({
      default_currency: current?.default_currency ?? 'TRY',
      primary_firm_nr: current?.primary_firm_nr ?? null,
      primary_period_nr: current?.primary_period_nr ?? null,
      eticaret_settings: settings as unknown as Record<string, unknown>,
    });
  } catch {
    /* yalnızca localStorage */
  }
}

export type { EticaretSettings };
