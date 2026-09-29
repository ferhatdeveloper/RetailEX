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
    expect(prefs.hidden_modules).toContain('finance-definitions');
    expect(prefs.hidden_modules).toContain('payment-plans');
    expect(prefs.hidden_modules).toContain('cost-centers');
    // v4: ana Malzeme Yönetimi bölümü ve ürün listesi tekrar görünür.
    expect(prefs.hidden_modules).not.toContain('material-management');
    expect(prefs.hidden_modules).not.toContain('products');
    expect(prefs.hidden_modules).not.toContain('stockmovements');
    expect(prefs.hidden_modules).not.toContain('inventory');
  });

  it('upgrade v1–v3: finans tanımları + malzeme/stok gizlemeleri', () => {
    expect(MENU_HIDDEN_UPGRADE_VERSION).toBe(4);
    expect(hiddenModulesForUpgradeVersion(0, 1)).toEqual(['payment-plans', 'cost-centers']);
    expect(hiddenModulesForUpgradeVersion(1, 2)).toEqual(['finance-definitions']);
    expect(hiddenModulesForUpgradeVersion(2, 3)).toEqual([
      'material-management',
      'products',
      'material-definitions',
      'material-movements',
      'stockmovements',
      'stock-price-change-slips',
      'material-reports',
      'inventory',
      'excel',
    ]);
    expect(hiddenModulesForUpgradeVersion(0, 3)).toEqual([
      'payment-plans',
      'cost-centers',
      'finance-definitions',
      'material-management',
      'products',
      'material-definitions',
      'material-movements',
      'stockmovements',
      'stock-price-change-slips',
      'material-reports',
      'inventory',
      'excel',
    ]);
    expect(hiddenModulesForUpgradeVersion(3, 3)).toEqual([]);
    // v4 eklemesi yok
    expect(hiddenModulesForUpgradeVersion(3, 4)).toEqual([]);
    expect(hiddenModulesForUpgradeVersion(0, 4)).toEqual([
      'payment-plans',
      'cost-centers',
      'finance-definitions',
      'material-management',
      'products',
      'material-definitions',
      'material-movements',
      'stockmovements',
      'stock-price-change-slips',
      'material-reports',
      'inventory',
      'excel',
    ]);
  });

  it('applyMenuHiddenUpgrades eski custom preset\'e bir kerelik ekler ve v4 kaldırma listesi uygular', () => {
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
    expect(store.presets[0].hidden_modules).toContain('finance-definitions');
    expect(store.presets[0].hidden_modules).toContain('logaudit');
    // v4 kaldırma listesi: ana Malzeme Yönetimi bölümü ve ürün listesi geri açık.
    expect(store.presets[0].hidden_modules).not.toContain('material-management');
    expect(store.presets[0].hidden_modules).not.toContain('products');
    expect(store.presets[0].hidden_modules).not.toContain('stockmovements');
    expect(store.presets[0].hidden_modules).not.toContain('inventory');
  });

  it('applyMenuHiddenUpgrades v2→v4 malzeme/stok ekleyip v4 kaldırmasını uygular', () => {
    const { store, changed } = applyMenuHiddenUpgrades({
      version: 2,
      hidden_upgrade_version: 2,
      active_preset_id: 'custom-1',
      presets: [
        {
          id: 'custom-1',
          name: 'Özel',
          saved_by: 'admin',
          saved_at: '2026-01-01T00:00:00.000Z',
          hidden_modules: ['logaudit', 'payment-plans', 'cost-centers', 'finance-definitions'],
        },
      ],
    });
    expect(changed).toBe(true);
    expect(store.hidden_upgrade_version).toBe(4);
    // v3 eklemeleri uygulandıktan sonra v4 kaldırma listesi tekrar çıkarır:
    // ana Malzeme Yönetimi + ürün listesi tekrar görünür.
    expect(store.presets[0].hidden_modules).not.toContain('material-management');
    expect(store.presets[0].hidden_modules).not.toContain('products');
    expect(store.presets[0].hidden_modules).toContain('logaudit');
    expect(store.presets[0].hidden_modules).toContain('payment-plans');
    expect(store.presets[0].hidden_modules).toContain('cost-centers');
    expect(store.presets[0].hidden_modules).toContain('finance-definitions');
    expect(store.presets[0].hidden_modules).toEqual(
      expect.arrayContaining([
        'logaudit',
        'payment-plans',
        'cost-centers',
        'finance-definitions',
      ]),
    );
  });

  it('applyMenuHiddenUpgrades v1→v4 yalnızca finance-definitions ekler, malzeme bölümü tekrar açık', () => {
    const { store, changed } = applyMenuHiddenUpgrades({
      version: 2,
      hidden_upgrade_version: 1,
      active_preset_id: 'custom-1',
      presets: [
        {
          id: 'custom-1',
          name: 'Özel',
          saved_by: 'admin',
          saved_at: '2026-01-01T00:00:00.000Z',
          hidden_modules: ['logaudit', 'payment-plans', 'cost-centers'],
        },
      ],
    });
    expect(changed).toBe(true);
    expect(store.hidden_upgrade_version).toBe(4);
    expect(store.presets[0].hidden_modules).toContain('finance-definitions');
    // v3 ile eklenen ana malzeme bölümü v4 kaldırma listesi ile tekrar görünür.
    expect(store.presets[0].hidden_modules).not.toContain('material-management');
    expect(store.presets[0].hidden_modules).not.toContain('products');
    expect(store.presets[0].hidden_modules).toEqual(
      expect.arrayContaining([
        'logaudit',
        'payment-plans',
        'cost-centers',
        'finance-definitions',
      ]),
    );
  });

  it('applyMenuHiddenUpgrades fabrika preset\'i güncel DEFAULT ile değiştirir', () => {
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
    // Fabrika preset güncel DEFAULT ile hizalanır — ana Malzeme bölümü açık.
    expect(store.presets[0].hidden_modules).not.toContain('material-management');
    expect(store.presets[0].hidden_modules).not.toContain('products');
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

  it('mergePendingHiddenUpgrades sync öncesi localStorage yolunda v3 eklemeleri uygular, v4 kaldırması ile geri alır', () => {
    const merged = mergePendingHiddenUpgrades(['logaudit'], {
      version: 2,
      presets: [],
      hidden_upgrade_version: 0,
    });
    expect(merged).toContain('payment-plans');
    expect(merged).toContain('cost-centers');
    expect(merged).toContain('finance-definitions');
    expect(merged).toContain('logaudit');
    // v4 kaldırma listesi uygulanır: ana Malzeme bölümü ve ürün listesi tekrar görünür.
    expect(merged).not.toContain('material-management');
    expect(merged).not.toContain('products');
    expect(merged).not.toContain('stockmovements');
    expect(merged).not.toContain('inventory');
  });
});