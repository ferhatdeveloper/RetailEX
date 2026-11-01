import { describe, expect, it } from 'vitest';
import { hasPermission, type Role } from '../../services/rbacService';
import {
  adminPermissionPreset,
  CASHIER_EXCLUDED_CLINIC_NAV_MODULE_IDS,
  cashierPermissionPreset,
  cashierPostLoginModule,
  cashierPostLoginModuleFromUser,
  clinicCashierPermissionPreset,
  landingRouteForCashierRole,
  MANAGEMENT_ENTRY_MODULE_IDS,
  permissionModuleKey,
  permissionsIncludeSurvey,
  sanitizePermissionsForRole,
  SURVEY_PERMISSION_MODULE,
  surveyOperatorPermissionPreset,
  withoutSurveyAdministration,
} from '../../services/rbacRolePresets';
import { isRbacParentModule } from '../../utils/rbacPermissionMap';
import {
  BEAUTY_CASHIER_POS_TAB,
  CASHIER_EXCLUDED_CLINIC_NAV_TABS,
  CLINIC_OPERATIONAL_MENU_TABS,
  canAccessBeautyTab,
  getLandingTabForBeautyAccess,
  nextBeautyTabWhenDenied,
} from '../../components/beauty/clinicShellNavConfig';

function role(partial: Pick<Role, 'id' | 'name' | 'permissions'>): Role {
  return {
    description: '',
    isSystemRole: true,
    isActive: true,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

const marketShell = {
  tenantModule: 'market',
  systemType: 'market',
  enabledModules: ['pos', 'management'],
};

const clinicShell = {
  tenantModule: 'clinic',
  systemType: 'beauty',
  enabledModules: ['beauty', 'management'],
};

describe('kasiyer hazır rolü', () => {
  it('market kasiyerinde anket yoktur; güzellik kasası ve kasa kalır', () => {
    const preset = cashierPermissionPreset(marketShell);
    expect(permissionsIncludeSurvey(preset)).toBe(false);
    expect(preset.some((entry) => entry.module === SURVEY_PERMISSION_MODULE)).toBe(false);
    expect(preset.some((entry) => entry.module === 'beauty' && entry.actions.includes('READ'))).toBe(true);
    expect(preset.some((entry) => entry.module === 'pos' && entry.actions.includes('EXECUTE'))).toBe(true);
    expect(preset.some((entry) => entry.module === 'finance.cash' && entry.actions.includes('CREATE'))).toBe(true);
    expect(preset.some((entry) => entry.module === 'kasalar')).toBe(true);
  });

  it('anket rolü ve yönetici anket yetkisini kullanabilir', () => {
    const survey = surveyOperatorPermissionPreset();
    expect(permissionsIncludeSurvey(survey)).toBe(true);
    expect(survey[0]?.actions).toEqual(['READ', 'EXECUTE']);

    const admin = role({ id: 'admin', name: 'admin', permissions: adminPermissionPreset() });
    expect(hasPermission([admin], SURVEY_PERMISSION_MODULE, 'DELETE')).toBe(true);

    const operator = role({ id: 'anket', name: 'anket', permissions: survey });
    expect(hasPermission([operator], SURVEY_PERMISSION_MODULE, 'EXECUTE')).toBe(true);
    expect(hasPermission([operator], SURVEY_PERMISSION_MODULE, 'DELETE')).toBe(false);
  });

  it('kasiyer kaydından anket satırını siler; beauty ve diğer anahtarlar durur', () => {
    const mixed = [
      { module: 'beauty', actions: ['READ'] },
      { module: SURVEY_PERMISSION_MODULE, actions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
      'beauty.surveys',
      'beauty.surveys.READ',
      { module: 'pos', actions: ['EXECUTE'] },
    ];
    const cleaned = withoutSurveyAdministration(mixed);
    expect(cleaned).toEqual([
      { module: 'beauty', actions: ['READ'] },
      { module: 'pos', actions: ['EXECUTE'] },
    ]);
    expect(
      sanitizePermissionsForRole(mixed, { name: 'Kasiyer', id: 'cashier' }, marketShell).some((entry) =>
        permissionsIncludeSurvey([entry]),
      ),
    ).toBe(false);
  });

  it('klinik kasiyerinde anket menüde kalır; sistem yönetimi girişi düşer', () => {
    const mixed = [
      { module: 'beauty', actions: ['READ'] },
      { module: SURVEY_PERMISSION_MODULE, actions: ['READ', 'CREATE', 'UPDATE', 'EXECUTE'] },
      { module: 'management', actions: ['READ'] },
      { module: 'users.roles', actions: ['READ', 'UPDATE'] },
      'menumanagement',
      'firm-period-definitions',
    ];
    expect(sanitizePermissionsForRole(mixed, { name: 'Kasiyer', id: 'cashier' }, clinicShell)).toEqual([
      { module: 'beauty', actions: ['READ'] },
      { module: SURVEY_PERMISSION_MODULE, actions: ['READ', 'CREATE', 'UPDATE', 'EXECUTE'] },
    ]);
    expect(sanitizePermissionsForRole(mixed, { name: 'admin', id: 'admin' }, clinicShell)).toEqual(mixed);
  });

  it('yönetici ve anket rolünden anket yetkisini düşürmez', () => {
    const survey = surveyOperatorPermissionPreset();
    expect(sanitizePermissionsForRole(survey, { name: 'anket', id: 'anket' })).toEqual(survey);
    const adminPerms = [
      { module: '*', actions: ['READ'] },
      { module: SURVEY_PERMISSION_MODULE, actions: ['READ', 'EXECUTE'] },
    ];
    expect(sanitizePermissionsForRole(adminPerms, { name: 'Sistem Yöneticisi', id: 'admin' })).toEqual(
      adminPerms,
    );
  });

  it('güzellik kasası anket yönetimini kapsamaz', () => {
    expect(isRbacParentModule('pos', 'pos.discount')).toBe(true);
    expect(isRbacParentModule('beauty', SURVEY_PERMISSION_MODULE)).toBe(false);

    const cashier = role({
      id: 'cashier',
      name: 'cashier',
      permissions: [{ module: 'beauty', actions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] }],
    });
    expect(hasPermission([cashier], 'beauty', 'READ')).toBe(true);
    expect(hasPermission([cashier], SURVEY_PERMISSION_MODULE, 'READ')).toBe(false);
    expect(hasPermission([cashier], SURVEY_PERMISSION_MODULE, 'EXECUTE')).toBe(false);
    expect(hasPermission([cashier], SURVEY_PERMISSION_MODULE, 'UPDATE')).toBe(false);

    const posParent = role({
      id: 'cashier',
      name: 'cashier',
      permissions: [{ module: 'pos', actions: ['EXECUTE'] }],
    });
    expect(hasPermission([posParent], 'pos.discount', 'EXECUTE')).toBe(true);

    const beautyOnly = (module: string, action?: string) => module === 'beauty' && (!action || action === 'READ');
    expect(canAccessBeautyTab(beautyOnly, 'dashboard')).toBe(true);
    expect(canAccessBeautyTab(beautyOnly, 'surveys')).toBe(false);

    const surveyOnly = (module: string, action?: string) =>
      module === SURVEY_PERMISSION_MODULE && (!action || action === 'READ' || action === 'EXECUTE');
    expect(canAccessBeautyTab(surveyOnly, 'surveys')).toBe(true);
  });

  it('kasiyer inişi anket ve ürün satışı değildir; klinik kabuğunda özet açılır', () => {
    const clinic = {
      tenantModule: 'clinic',
      systemType: 'beauty',
      enabledModules: ['beauty', 'management'],
    };
    const market = {
      tenantModule: 'market',
      systemType: 'market',
      enabledModules: ['pos', 'management'],
    };

    expect(permissionsIncludeSurvey(cashierPermissionPreset(marketShell))).toBe(false);
    expect(cashierPermissionPreset(marketShell).some((entry) => entry.module === SURVEY_PERMISSION_MODULE)).toBe(false);
    expect(permissionsIncludeSurvey(cashierPermissionPreset(clinicShell))).toBe(true);
    expect(clinicCashierPermissionPreset()).toEqual(cashierPermissionPreset(clinicShell));
    expect(landingRouteForCashierRole('cashier', 'cashier', 'pos', clinic)).toBe('beauty');
    expect(landingRouteForCashierRole('cashier', 'cashier', 'beauty', clinic)).toBe('beauty');
    expect(landingRouteForCashierRole('cashier', 'cashier', '', clinic)).toBe('beauty');
    expect(landingRouteForCashierRole('cashier', 'cashier', 'pos', market)).toBe('pos');
    expect(landingRouteForCashierRole('cashier', 'cashier', 'beauty', market)).toBe('pos');
    expect(landingRouteForCashierRole('cashier', 'cashier', '', null)).toBe('pos');
    expect(landingRouteForCashierRole('anket', 'anket', 'beauty', clinic)).toBe('beauty');
    expect(landingRouteForCashierRole('admin', 'admin', '', clinic)).toBe('');

    expect(cashierPostLoginModule({
      name: 'cashier',
      id: '00000000-0000-0000-0000-000000000003',
      landingRoute: 'pos',
      shell: clinic,
    })).toBe('beauty');
    expect(cashierPostLoginModule({
      name: 'cashier',
      id: '00000000-0000-0000-0000-000000000003',
      landingRoute: 'pos',
      shell: clinic,
    })).not.toBe('pos');
    expect(cashierPostLoginModule({
      name: 'Kasiyer',
      id: 'cashier',
      landingRoute: 'pos',
      shell: market,
    })).toBe('pos');
    expect(cashierPostLoginModule({
      name: 'Kasiyer',
      id: 'cashier',
      landingRoute: 'beauty',
      shell: market,
    })).toBe('pos');
    expect(cashierPostLoginModule({
      name: 'cashier',
      id: 'cashier',
      landingRoute: 'restaurant',
      shell: clinic,
    })).toBe('restaurant');
    expect(cashierPostLoginModule({ name: 'anket', id: 'anket', landingRoute: 'beauty', shell: clinic })).toBeNull();
    expect(cashierPostLoginModule({ name: 'admin', id: 'admin', landingRoute: null, shell: clinic })).toBeNull();
    expect(cashierPostLoginModuleFromUser({
      role: 'cashier',
      roles: [{ name: 'cashier', id: 'cashier', landing_route: 'pos' }],
    }, clinic)).toBe('beauty');
    expect(cashierPostLoginModuleFromUser({
      role: 'cashier',
      roles: [{ name: 'cashier', id: 'cashier', landingRoute: 'pos' }],
    }, market)).toBe('pos');

    localStorage.setItem('retailex_web_config', JSON.stringify({
      tenant_module: 'clinic',
      system_type: 'beauty',
      enabled_modules: ['beauty', 'management'],
    }));
    localStorage.setItem('retailex_enabled_modules', JSON.stringify(['beauty', 'management']));
    expect(cashierPostLoginModuleFromUser({
      role: 'cashier',
      roles: [{ name: 'cashier', id: 'cashier', landing_route: 'pos' }],
    })).toBe('beauty');
    localStorage.clear();

    const duhaPos = (module: string, action?: string) =>
      module === 'pos' && (!action || action === 'READ' || action === 'EXECUTE');
    const cashierRole = { name: 'cashier', id: 'cashier' };
    expect(getLandingTabForBeautyAccess(duhaPos, 'beauty_default', cashierRole)).toBe('dashboard');
    expect(BEAUTY_CASHIER_POS_TAB).toBe('product_sales');
    expect(getLandingTabForBeautyAccess(duhaPos, 'beauty_default', cashierRole)).not.toBe('surveys');
    expect(getLandingTabForBeautyAccess(duhaPos, 'beauty_default', cashierRole)).not.toBe(BEAUTY_CASHIER_POS_TAB);
    expect(canAccessBeautyTab(duhaPos, 'surveys', cashierRole)).toBe(false);
    expect(canAccessBeautyTab(duhaPos, 'dashboard', cashierRole)).toBe(true);
    expect(canAccessBeautyTab(duhaPos, 'calendar', cashierRole)).toBe(true);
    expect(canAccessBeautyTab(duhaPos, BEAUTY_CASHIER_POS_TAB)).toBe(true);
    expect(nextBeautyTabWhenDenied(duhaPos, 'dashboard', ['dashboard', 'surveys', BEAUTY_CASHIER_POS_TAB], cashierRole))
      .toBeNull();
    expect(nextBeautyTabWhenDenied(duhaPos, 'surveys', ['dashboard', 'surveys'], cashierRole)).toBe('dashboard');

    const aquaHp = (module: string, action?: string) =>
      hasPermission([role({
        id: '00000000-0000-0000-0000-000000000003',
        name: 'cashier',
        permissions: [
          { module: 'pos.view', actions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
          { module: 'pos.sell', actions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
          { module: 'beauty', actions: ['READ'] },
          { module: 'beauty.surveys', actions: ['READ', 'CREATE', 'UPDATE', 'EXECUTE'] },
        ],
      })], module, action || 'READ');
    expect(getLandingTabForBeautyAccess(aquaHp, 'beauty_default', cashierRole)).toBe('dashboard');
    expect(canAccessBeautyTab(aquaHp, 'surveys', cashierRole)).toBe(true);
    expect(canAccessBeautyTab(aquaHp, 'dashboard', cashierRole)).toBe(true);

    const clinicHp = (module: string, action?: string) =>
      hasPermission([role({
        id: '00000000-0000-0000-0000-000000000003',
        name: 'cashier',
        permissions: clinicCashierPermissionPreset(),
      })], module, action || 'READ');
    expect(getLandingTabForBeautyAccess(clinicHp, 'beauty_default', cashierRole)).toBe('dashboard');
    expect(getLandingTabForBeautyAccess(clinicHp, 'beauty_default', cashierRole)).not.toBe('surveys');
    expect(getLandingTabForBeautyAccess(clinicHp, 'beauty_default', cashierRole)).not.toBe(BEAUTY_CASHIER_POS_TAB);
    expect(getLandingTabForBeautyAccess(clinicHp, 'beauty_default', cashierRole)).not.toBe('leads');
    expect(getLandingTabForBeautyAccess(clinicHp, 'beauty_default', cashierRole)).not.toBe('clinic_ops');
    for (const tab of CLINIC_OPERATIONAL_MENU_TABS) {
      expect(canAccessBeautyTab(clinicHp, tab, cashierRole)).toBe(true);
    }
    expect(CLINIC_OPERATIONAL_MENU_TABS).not.toEqual(expect.arrayContaining(['leads', 'clinic_ops']));
    for (const tab of CASHIER_EXCLUDED_CLINIC_NAV_TABS) {
      expect(canAccessBeautyTab(clinicHp, tab, cashierRole)).toBe(false);
    }
    expect(nextBeautyTabWhenDenied(clinicHp, 'leads', ['dashboard', 'leads', 'clinic_ops'], cashierRole)).toBe('dashboard');
    expect(nextBeautyTabWhenDenied(clinicHp, 'clinic_ops', ['dashboard', 'clinic_ops'], cashierRole)).toBe('dashboard');
    for (const key of MANAGEMENT_ENTRY_MODULE_IDS) {
      expect(clinicHp(key, 'READ')).toBe(false);
    }
    expect(clinicHp('pos', 'READ')).toBe(false);
    expect(landingRouteForCashierRole('cashier', 'cashier', 'pos', marketShell)).toBe('pos');
    expect(permissionsIncludeSurvey([
      { module: 'pos.view', actions: ['READ'] },
      { module: 'pos.sell', actions: ['EXECUTE'] },
    ])).toBe(false);

    const surveyOnly = (module: string, action?: string) =>
      module === SURVEY_PERMISSION_MODULE && (!action || action === 'READ' || action === 'EXECUTE');
    expect(getLandingTabForBeautyAccess(surveyOnly, 'beauty_default', { name: 'anket', id: 'anket' }))
      .toBe('surveys');

    const adminAll = () => true;
    expect(getLandingTabForBeautyAccess(adminAll, 'beauty_default', { name: 'admin', id: 'admin' }))
      .toBe('dashboard');
    expect(canAccessBeautyTab(adminAll, 'leads', { name: 'admin', id: 'admin' })).toBe(true);
    expect(canAccessBeautyTab(adminAll, 'clinic_ops', { name: 'admin', id: 'admin' })).toBe(true);
    expect(canAccessBeautyTab(adminAll, 'leads', { name: 'Sistem Yöneticisi', id: 'admin' })).toBe(true);
    expect(canAccessBeautyTab(adminAll, 'clinic_ops', { name: 'Sistem Yöneticisi', id: 'admin' })).toBe(true);
  });

  it('klinik kasiyer menüsünde Leads & CRM ve Klinik operasyon yoktur; yönetici görür', () => {
    const cashierRole = { name: 'Kasiyer', id: 'cashier' };
    const adminRole = { name: 'admin', id: 'admin' };
    const clinicHp = (module: string, action?: string) =>
      hasPermission([role({
        id: 'cashier',
        name: 'Kasiyer',
        permissions: clinicCashierPermissionPreset(),
      })], module, action || 'READ');
    const adminHp = (module: string, action?: string) =>
      hasPermission([role({
        id: 'admin',
        name: 'admin',
        permissions: adminPermissionPreset(),
      })], module, action || 'READ');

    expect(clinicCashierPermissionPreset().map((entry) => entry.module)).not.toEqual(
      expect.arrayContaining(['leads', 'clinic_ops', 'beauty.leads', 'beauty.clinic_ops']),
    );
    for (const tab of CASHIER_EXCLUDED_CLINIC_NAV_TABS) {
      expect(tab === 'leads' || tab === 'clinic_ops').toBe(true);
      expect(canAccessBeautyTab(clinicHp, tab, cashierRole)).toBe(false);
      expect(canAccessBeautyTab(adminHp, tab, adminRole)).toBe(true);
    }
    expect(getLandingTabForBeautyAccess(clinicHp, 'beauty_default', cashierRole)).toBe('dashboard');
    for (const tab of ['dashboard', 'calendar', 'clients', 'services', 'staff', 'expenses', 'reports', 'surveys'] as const) {
      expect(canAccessBeautyTab(clinicHp, tab, cashierRole)).toBe(true);
    }

    const withNavKeys = [
      ...clinicCashierPermissionPreset(),
      { module: 'leads', actions: ['READ'] },
      { module: 'clinic_ops', actions: ['READ', 'UPDATE'] },
      'beauty.leads',
      'beauty.clinic_ops.READ',
      { module: 'beauty', actions: ['READ'] },
    ];
    const cleaned = sanitizePermissionsForRole(withNavKeys, cashierRole, clinicShell);
    expect(cleaned.some((entry) => {
      const key = permissionModuleKey(entry);
      return (CASHIER_EXCLUDED_CLINIC_NAV_MODULE_IDS as readonly string[]).some(
        (id) => key === id || key.startsWith(`${id}.`),
      );
    })).toBe(false);
    expect(cleaned.some((entry) => permissionModuleKey(entry) === 'beauty')).toBe(true);
    expect(cleaned.some((entry) => permissionModuleKey(entry) === SURVEY_PERMISSION_MODULE)).toBe(true);
    expect(sanitizePermissionsForRole(withNavKeys, adminRole, clinicShell)).toEqual(withNavKeys);
  });
});
