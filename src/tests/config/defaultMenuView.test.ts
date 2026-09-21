import { describe, expect, it } from 'vitest';
import { defaultMenuPreferences, applyMenuHiddenUpgrades } from '../../services/menuPreferencesService';
import {
  DEFAULT_MENU_HIDDEN_MODULES,
  FACTORY_MENU_PRESET_ID,
  MENU_HIDDEN_UPGRADE_VERSION,
  hiddenModulesForUpgradeVersion,
} from '../../config/defaultMenuView';
import { mergePendingHiddenUpgrades } from '../../services/menuPreferencesRuntime';

describe('defaultMenuView', () => {
  it('fabrika varsayılanı guzel gizli listesini kullanır', () => {
    const prefs = defaultMenuPreferences();
    expect(prefs.hidden_modules).toEqual([...DEFAULT_MENU_HIDDEN_MODULES]);
    expect(prefs.hidden_modules.length).toBeGreaterThan(20);
    expect(prefs.item_orders?.dashboard).toBe(1);
    expect(FACTORY_MENU_PRESET_ID).toBe('retailex-factory-default');
    expect(prefs.hidden_modules).toContain('payment-plans');
    expect(prefs.hidden_modules).toContain('cost-centers');
  });

  it('upgrade v1 Ödeme Planları + Masraf Merkezleri ekler', () => {
    expect(MENU_HIDDEN_UPGRADE_VERSION).toBe(1);
    expect(hiddenModulesForUpgradeVersion(0, 1)).toEqual(['payment-plans', 'cost-centers']);
    expect(hiddenModulesForUpgradeVersion(1, 1)).toEqual([]);
  });

  it('applyMenuHiddenUpgrades eski custom preset’e bir kerelik ekler', () => {
    const { store, changed } = applyMenuHiddenUpgrades({
      version: 2,
      hidden_upgrade_version: 0,
      active_preset_id: 'custom-1',
      presets: [
        {
          id: 'custom-1',
          name: 'Özel',
          saved_by: 'admin',
          saved_at: '2026-01-01T00:00:00.000Z',
          hidden_modules: ['logaudit'],
        },
      ],
    });
    expect(changed).toBe(true);
    expect(store.hidden_upgrade_version).toBe(MENU_HIDDEN_UPGRADE_VERSION);
    expect(store.presets[0].hidden_modules).toContain('payment-plans');
    expect(store.presets[0].hidden_modules).toContain('cost-centers');
    expect(store.presets[0].hidden_modules).toContain('logaudit');
  });

  it('applyMenuHiddenUpgrades fabrika preset’i güncel DEFAULT ile değiştirir', () => {
    const { store, changed } = applyMenuHiddenUpgrades({
      version: 2,
      hidden_upgrade_version: 0,
      active_preset_id: FACTORY_MENU_PRESET_ID,
      presets: [
        {
          id: FACTORY_MENU_PRESET_ID,
          name: 'Varsayılan',
          saved_by: 'sistem',
          saved_at: '2026-01-01T00:00:00.000Z',
          hidden_modules: ['logaudit'],
        },
      ],
    });
    expect(changed).toBe(true);
    expect(store.presets[0].hidden_modules).toEqual([...DEFAULT_MENU_HIDDEN_MODULES]);
  });

  it('upgrade sürümü güncelken custom listesine tekrar eklemez', () => {
    const { store, changed } = applyMenuHiddenUpgrades({
      version: 2,
      hidden_upgrade_version: MENU_HIDDEN_UPGRADE_VERSION,
      active_preset_id: 'custom-1',
      presets: [
        {
          id: 'custom-1',
          name: 'Özel',
          saved_by: 'admin',
          saved_at: '2026-01-01T00:00:00.000Z',
          hidden_modules: ['logaudit'],
        },
      ],
    });
    expect(changed).toBe(false);
    expect(store.presets[0].hidden_modules).toEqual(['logaudit']);
  });

  it('mergePendingHiddenUpgrades sync öncesi localStorage yolunda gizler', () => {
    const merged = mergePendingHiddenUpgrades(['logaudit'], {
      version: 2,
      presets: [],
      hidden_upgrade_version: 0,
    });
    expect(merged).toContain('payment-plans');
    expect(merged).toContain('cost-centers');
  });
});
