/**
 * v5/v6 upgrade — Malzeme Toplama (`materials-intake`) + Stok Devir / Açılış
 * fişleri (`stock-devir-slip`, `stock-opening-invoice-slip`) + Ana Kayıtlar
 * üst grubu (`material-definitions`) için garanti.
 *
 * Kök neden: eski bir custom preset bu ekranları yanlışlıkla gizli
 * listesine eklemiş olabilir (örn. kullanıcı eskiden Menu Yönetimi’nden
 * manuel gizledi veya localStorage stale kaldı). v5/v6 upgrade bu ekranları
 * zorla tekrar görünür yapar; `material-definitions` artık STATIC_MENU_SECTION_IDS
 * koruma katmanında.
 */
import { describe, expect, it } from 'vitest';
import { applyMenuHiddenUpgrades } from '../../services/menuPreferencesService';
import {
  DEFAULT_MENU_HIDDEN_MODULES,
  FACTORY_MENU_PRESET_ID,
  MENU_HIDDEN_UPGRADE_VERSION,
  hiddenModulesForUpgradeVersion,
  hiddenModulesRemovalsForUpgradeVersion,
} from '../../config/defaultMenuView';
import { STATIC_MENU_SECTION_ID_SET } from '../../services/menuPreferencesRuntime';

describe('v5/v6 upgrade — Malzeme Toplama + Stok Devir/Açılış + Ana Kayıtlar görünürlüğü', () => {
  it('MENU_HIDDEN_UPGRADE_VERSION 6', () => {
    expect(MENU_HIDDEN_UPGRADE_VERSION).toBe(6);
  });

  it('fabrika varsayılanı bu ekranları gizlemiyor', () => {
    expect(DEFAULT_MENU_HIDDEN_MODULES).not.toContain('materials-intake');
    expect(DEFAULT_MENU_HIDDEN_MODULES).not.toContain('stock-devir-slip');
    expect(DEFAULT_MENU_HIDDEN_MODULES).not.toContain('stock-opening-invoice-slip');
    // v6: Ana Kayıtlar üst grubu artık varsayılan görünür
    expect(DEFAULT_MENU_HIDDEN_MODULES).not.toContain('material-definitions');
  });

  it('material-definitions artık STATIC_MENU_SECTION_IDS koruma katmanında', () => {
    expect(STATIC_MENU_SECTION_ID_SET.has('material-definitions')).toBe(true);
  });

  it('v5/v6 eklemeleri boş (force-show için tasarım: sadece REMOVALS çalışır)', () => {
    expect(hiddenModulesForUpgradeVersion(4, 5)).toEqual([]);
    expect(hiddenModulesForUpgradeVersion(5, 6)).toEqual([]);
  });

  it('v5 kaldırma listesi materials-intake + yeni fişleri içerir', () => {
    expect(hiddenModulesRemovalsForUpgradeVersion(4, 5)).toEqual([
      'materials-intake',
      'stock-devir-slip',
      'stock-opening-invoice-slip',
    ]);
  });

  it('v6 kaldırma listesi material-definitions içerir', () => {
    expect(hiddenModulesRemovalsForUpgradeVersion(5, 6)).toEqual(['material-definitions']);
  });

  it('v5 → v6 custom preset: material-definitions gizlilikten çıkar', () => {
    const { store, changed } = applyMenuHiddenUpgrades({
      version: 2,
      hidden_upgrade_version: 5,
      active_preset_id: 'custom-1',
      presets: [
        {
          id: 'custom-1',
          name: 'Özel',
          saved_by: 'admin',
          saved_at: '2026-01-01T00:00:00.000Z',
          hidden_modules: ['logaudit', 'material-definitions'],
        },
      ],
    });
    expect(changed).toBe(true);
    expect(store.hidden_upgrade_version).toBe(6);
    expect(store.presets[0].hidden_modules).not.toContain('material-definitions');
    expect(store.presets[0].hidden_modules).toContain('logaudit');
  });

  it('v4 → v6 custom preset: materials-intake + yeni fişler gizlilikten çıkar', () => {
    const { store, changed } = applyMenuHiddenUpgrades({
      version: 2,
      hidden_upgrade_version: 4,
      active_preset_id: 'custom-1',
      presets: [
        {
          id: 'custom-1',
          name: 'Özel',
          saved_by: 'admin',
          saved_at: '2026-01-01T00:00:00.000Z',
          hidden_modules: [
            'logaudit',
            'materials-intake',
            'stock-devir-slip',
            'stock-opening-invoice-slip',
            'material-definitions',
          ],
        },
      ],
    });
    expect(changed).toBe(true);
    expect(store.hidden_upgrade_version).toBe(6);
    expect(store.presets[0].hidden_modules).not.toContain('materials-intake');
    expect(store.presets[0].hidden_modules).not.toContain('stock-devir-slip');
    expect(store.presets[0].hidden_modules).not.toContain('stock-opening-invoice-slip');
    expect(store.presets[0].hidden_modules).not.toContain('material-definitions');
    // logaudit kullanıcının manuel seçimi — upgrade dokunmamalı
    expect(store.presets[0].hidden_modules).toContain('logaudit');
  });

  it('v3 → v6 custom preset: v4/v5/v6 kaldırmaları birlikte uygulanır', () => {
    const { store, changed } = applyMenuHiddenUpgrades({
      version: 2,
      hidden_upgrade_version: 3,
      active_preset_id: 'custom-1',
      presets: [
        {
          id: 'custom-1',
          name: 'Özel',
          saved_by: 'admin',
          saved_at: '2026-01-01T00:00:00.000Z',
          hidden_modules: [
            'logaudit',
            'materials-intake',
            'stock-devir-slip',
            'stock-opening-invoice-slip',
            'material-definitions',
          ],
        },
      ],
    });
    expect(changed).toBe(true);
    expect(store.hidden_upgrade_version).toBe(6);
    const hidden = store.presets[0].hidden_modules;
    expect(hidden).not.toContain('materials-intake');
    expect(hidden).not.toContain('stock-devir-slip');
    expect(hidden).not.toContain('stock-opening-invoice-slip');
    expect(hidden).not.toContain('material-definitions');
    expect(hidden).toContain('logaudit');
  });

  it('fabrika preset: v6 sonrası DEFAULT_MENU_HIDDEN_MODULES ile senkronize', () => {
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
          hidden_modules: ['materials-intake', 'stock-devir-slip', 'material-definitions'],
        },
      ],
    });
    expect(changed).toBe(true);
    expect(store.presets[0].hidden_modules).toEqual([...DEFAULT_MENU_HIDDEN_MODULES]);
    expect(store.presets[0].hidden_modules).not.toContain('materials-intake');
    expect(store.presets[0].hidden_modules).not.toContain('stock-devir-slip');
    expect(store.presets[0].hidden_modules).not.toContain('stock-opening-invoice-slip');
    expect(store.presets[0].hidden_modules).not.toContain('material-definitions');
  });

  it('upgrade versiyonu güncelse tekrar çalışmaz', () => {
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
});

// v6 upgrade — Ana Kayıtlar (material-definitions) üst grubu görünürlüğü.
// Kök neden: önceki fabrika varsayılanı `material-definitions`'i gizli tutuyordu
// (10 çocuk: Malzeme Sınıfları / Malzemeler / Birim Setleri / …). v6 upgrade
// hem DEFAULT_MENU_HIDDEN_MODULES'tan çıkarır hem eski custom preset'leri de temizler.
describe('v6 upgrade — Ana Kayıtlar (material-definitions) görünürlüğü', () => {
  it('fabrika varsayılanı Ana Kayıtlar\'ı gizlemiyor', () => {
    expect(DEFAULT_MENU_HIDDEN_MODULES).not.toContain('material-definitions');
  });

  it('v6 eklemeleri boş (REMOVALS ile çalışır)', () => {
    expect(hiddenModulesForUpgradeVersion(5, 6)).toEqual([]);
  });

  it('v6 kaldırma listesi material-definitions içerir', () => {
    expect(hiddenModulesRemovalsForUpgradeVersion(5, 6)).toEqual(['material-definitions']);
  });

  it('v5 → v6 custom preset: material-definitions gizlilikten çıkar', () => {
    const { store, changed } = applyMenuHiddenUpgrades({
      version: 2,
      hidden_upgrade_version: 5,
      active_preset_id: 'custom-1',
      presets: [
        {
          id: 'custom-1',
          name: 'Özel',
          saved_by: 'admin',
          saved_at: '2026-01-01T00:00:00.000Z',
          hidden_modules: ['logaudit', 'material-definitions'],
        },
      ],
    });
    expect(changed).toBe(true);
    expect(store.hidden_upgrade_version).toBe(MENU_HIDDEN_UPGRADE_VERSION);
    expect(store.presets[0].hidden_modules).not.toContain('material-definitions');
    // kullanıcının manuel seçimi korunur
    expect(store.presets[0].hidden_modules).toContain('logaudit');
  });
});