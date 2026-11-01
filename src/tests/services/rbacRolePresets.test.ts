import { describe, expect, it } from 'vitest';
import { hasPermission, type Role } from '../../services/rbacService';
import {
  adminPermissionPreset,
  cashierPermissionPreset,
  permissionsIncludeSurvey,
  sanitizePermissionsForRole,
  SURVEY_PERMISSION_MODULE,
  surveyOperatorPermissionPreset,
  withoutSurveyAdministration,
} from '../../services/rbacRolePresets';
import { isRbacParentModule } from '../../utils/rbacPermissionMap';
import { canAccessBeautyTab } from '../../components/beauty/clinicShellNavConfig';

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

describe('kasiyer hazır rolü', () => {
  it('anket yetki anahtarını içermez; güzellik kasası ve kasa kalır', () => {
    const preset = cashierPermissionPreset();
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
      sanitizePermissionsForRole(mixed, { name: 'Kasiyer', id: 'cashier' }).some((entry) =>
        permissionsIncludeSurvey([entry]),
      ),
    ).toBe(false);
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
});
