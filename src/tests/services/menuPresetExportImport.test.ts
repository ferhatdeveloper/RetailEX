import { describe, expect, it } from 'vitest';
import {
  buildMenuPresetExport,
  parseMenuPresetImportJson,
  MENU_PRESET_EXPORT_FORMAT,
  MENU_PRESETS_BUNDLE_FORMAT,
} from '../../services/menuPreferencesService';

describe('menuPreferences export/import', () => {
  it('tek profil export → parse round-trip', () => {
    const exported = buildMenuPresetExport({
      id: 'x',
      name: 'guzel',
      saved_by: 'admin',
      saved_at: '2026-09-20T12:00:00.000Z',
      hidden_modules: ['pos', 'wms'],
      item_orders: { a: 1 },
    });
    expect(exported.format).toBe(MENU_PRESET_EXPORT_FORMAT);
    const parsed = parseMenuPresetImportJson(exported);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('guzel');
    expect(parsed[0].hidden_modules).toEqual(['pos', 'wms']);
    expect(parsed[0].item_orders).toEqual({ a: 1 });
  });

  it('bundle parse eder', () => {
    const parsed = parseMenuPresetImportJson({
      format: MENU_PRESETS_BUNDLE_FORMAT,
      version: 1,
      exported_at: new Date().toISOString(),
      presets: [
        { name: 'A', hidden_modules: ['x'] },
        { name: 'B', hidden_modules: [] },
      ],
    });
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('A');
  });
});
