/**
 * Hazır rol yetki setleri.
 * Kasiyer: POS, kasa ve güzellik kasası. Memnuniyet anketi yönetimi yok.
 * Anket operatörü ve yönetici anket yetkisini korur.
 */
import type { Permission, PermissionAction } from './rbacService';

export const SURVEY_PERMISSION_MODULE = 'beauty.surveys';

const ALL_ACTIONS: PermissionAction[] = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE'];

const CASHIER_NAMES = new Set(['cashier', 'kasiyer']);

export type BuiltinRolePresetId = 'cashier' | 'survey' | 'admin';

export function normalizeRoleToken(value: string | null | undefined): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr');
}

export function isCashierRoleIdentity(name?: string | null, id?: string | null): boolean {
  const n = normalizeRoleToken(name);
  const i = normalizeRoleToken(id);
  if (n.includes('anket') || i.includes('anket')) return false;
  if (CASHIER_NAMES.has(n) || CASHIER_NAMES.has(i)) return true;
  return n.startsWith('kasiyer');
}

export function isSurveyOperatorRoleIdentity(name?: string | null, id?: string | null): boolean {
  const n = normalizeRoleToken(name);
  const i = normalizeRoleToken(id);
  return n === 'anket' || i === 'anket' || n === 'survey' || i === 'survey';
}

export function isAdminRoleIdentity(name?: string | null, id?: string | null): boolean {
  const n = normalizeRoleToken(name);
  const i = normalizeRoleToken(id);
  return n === 'admin' || i === 'admin' || n === 'sistem yöneticisi';
}

export function permissionEntryIsSurvey(entry: unknown): boolean {
  if (typeof entry === 'string') {
    const key = entry.trim();
    return key === SURVEY_PERMISSION_MODULE || key.startsWith(`${SURVEY_PERMISSION_MODULE}.`);
  }
  if (entry && typeof entry === 'object' && 'module' in entry) {
    return String((entry as { module?: string }).module || '') === SURVEY_PERMISSION_MODULE;
  }
  return false;
}

export function permissionsIncludeSurvey(permissions: readonly unknown[] | null | undefined): boolean {
  return (permissions || []).some((entry) => permissionEntryIsSurvey(entry));
}

export function withoutSurveyAdministration<T>(permissions: readonly T[] | null | undefined): T[] {
  return (permissions || []).filter((entry) => !permissionEntryIsSurvey(entry));
}

/** Kasiyer kaydından anket anahtarını düşürür. Yönetici ve anket rolüne dokunmaz. */
export function sanitizePermissionsForRole<T>(
  permissions: readonly T[] | null | undefined,
  role: { name?: string | null; id?: string | null },
): T[] {
  const list = [...(permissions || [])];
  if (isAdminRoleIdentity(role.name, role.id) || isSurveyOperatorRoleIdentity(role.name, role.id)) {
    return list;
  }
  if (isCashierRoleIdentity(role.name, role.id)) {
    return withoutSurveyAdministration(list);
  }
  return list;
}

/** POS, kasa ve güzellik kasası. Anket yönetimi yok. */
export function cashierPermissionPreset(): Permission[] {
  return [
    { module: 'dashboard', actions: ['READ'] },
    { module: 'pos', actions: ['READ', 'CREATE', 'EXECUTE'] },
    { module: 'finance.cash', actions: ['READ', 'CREATE', 'EXECUTE'] },
    { module: 'kasalar', actions: ['READ', 'CREATE', 'EXECUTE'] },
    { module: 'customers', actions: ['READ', 'CREATE', 'UPDATE'] },
    { module: 'beauty', actions: ['READ'] },
    { module: 'sales-invoices', actions: ['CREATE', 'READ'] },
    { module: 'campaigns', actions: ['READ', 'EXECUTE'] },
  ];
}

/** Yalnızca memnuniyet anketini uygulama. */
export function surveyOperatorPermissionPreset(): Permission[] {
  return [{ module: SURVEY_PERMISSION_MODULE, actions: ['READ', 'EXECUTE'] }];
}

/** Tüm modüller, anket dahil. */
export function adminPermissionPreset(): Permission[] {
  return [{ module: '*', actions: [...ALL_ACTIONS] }];
}

export function builtinRolePermissionPreset(id: BuiltinRolePresetId): Permission[] {
  if (id === 'cashier') return cashierPermissionPreset();
  if (id === 'survey') return surveyOperatorPermissionPreset();
  return adminPermissionPreset();
}
