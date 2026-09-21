import { describe, expect, it } from 'vitest';
import { defaultMenuPreferences } from '../../services/menuPreferencesService';
import {
  DEFAULT_MENU_HIDDEN_MODULES,
  FACTORY_MENU_PRESET_ID,
} from '../../config/defaultMenuView';

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
});
