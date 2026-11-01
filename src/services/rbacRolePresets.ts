/**
 * Hazır rol yetki setleri.
 * Market kasiyeri: Market POS ve kasa. Memnuniyet anketi yok.
 * Klinik kasiyeri: güzellik kabuğunun operasyon menüsü (özet iniş). Anket satırı menüde durur.
 * Leads & CRM ve Klinik operasyon klinik kabuk menüsünde hiçbir rolde yoktur.
 * Sistem yönetimi, kullanıcı, rol, firma/dönem ve menü yönetimi kasiyerde yoktur.
 * Anket operatörü ve yönetici kendi yetkilerini korur.
 */
import type { Permission, PermissionAction } from './rbacService';

export const SURVEY_PERMISSION_MODULE = 'beauty.surveys';

/**
 * Leads & CRM ve Klinik operasyon. Yalnız bu iki menü için duran anahtarlar.
 * Klinik kabuk menüsünde kasiyer ve yönetici dahil herkes için kapalıdır.
 * Kasiyer yetki kaydından düşer. Yönetici yetki kaydına dokunulmaz. Ekranlar silinmez.
 */
export const CASHIER_EXCLUDED_CLINIC_NAV_MODULE_IDS = [
  'leads',
  'clinic_ops',
  'beauty.leads',
  'beauty.clinic_ops',
] as const;

/** Sistem yönetimi giriş anahtarları. Klinik operasyon sekmeleri bu listeye girmez. */
export const MANAGEMENT_ENTRY_MODULE_IDS = [
  'management',
  'users',
  'users.roles',
  'roles',
  'roleauth',
  'usermanagement',
  'settings.system',
  'settings',
  'system',
  'firms',
  'firm',
  'firm-period-definitions',
  'menumanagement',
  'menu-management',
  'generalsettings',
] as const;

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

export function permissionModuleKey(entry: unknown): string {
  if (typeof entry === 'string') {
    const key = entry.trim();
    if (key.endsWith('.*')) return key.slice(0, -2);
    return key;
  }
  if (entry && typeof entry === 'object' && 'module' in entry) {
    return String((entry as { module?: string }).module || '').trim();
  }
  return '';
}

export function permissionEntryIsSurvey(entry: unknown): boolean {
  const key = permissionModuleKey(entry);
  return key === SURVEY_PERMISSION_MODULE || key.startsWith(`${SURVEY_PERMISSION_MODULE}.`);
}

export function permissionEntryIsManagementEntry(entry: unknown): boolean {
  const key = permissionModuleKey(entry);
  if (!key || key === '*') return false;
  if ((MANAGEMENT_ENTRY_MODULE_IDS as readonly string[]).includes(key)) return true;
  if (key.startsWith('management.')) return true;
  if (key.startsWith('users.')) return true;
  return false;
}

/** Yalnız Leads & CRM / Klinik operasyon menüsünü açmak için konmuş anahtar. */
export function permissionEntryIsCashierExcludedClinicNav(entry: unknown): boolean {
  const key = permissionModuleKey(entry);
  if (!key || key === '*') return false;
  return (CASHIER_EXCLUDED_CLINIC_NAV_MODULE_IDS as readonly string[]).some(
    (id) => key === id || key.startsWith(`${id}.`),
  );
}

export function permissionsIncludeSurvey(permissions: readonly unknown[] | null | undefined): boolean {
  return (permissions || []).some((entry) => permissionEntryIsSurvey(entry));
}

export function withoutSurveyAdministration<T>(permissions: readonly T[] | null | undefined): T[] {
  return (permissions || []).filter((entry) => !permissionEntryIsSurvey(entry));
}

export function withoutManagementEntries<T>(permissions: readonly T[] | null | undefined): T[] {
  return (permissions || []).filter((entry) => !permissionEntryIsManagementEntry(entry));
}

export function withoutCashierExcludedClinicNav<T>(permissions: readonly T[] | null | undefined): T[] {
  return (permissions || []).filter((entry) => !permissionEntryIsCashierExcludedClinicNav(entry));
}

/**
 * Kasiyer kaydından sistem yönetimi girişini düşürür.
 * Leads & CRM ve Klinik operasyon anahtarlarını da düşürür.
 * Market kasiyerinden anket satırını da düşürür. Klinik kasiyerinde anket menüde kalır.
 * Yönetici ve anket rolüne dokunmaz.
 */
export function sanitizePermissionsForRole<T>(
  permissions: readonly T[] | null | undefined,
  role: { name?: string | null; id?: string | null },
  shell?: CashierShellHint | null,
): T[] {
  const list = [...(permissions || [])];
  if (isAdminRoleIdentity(role.name, role.id) || isSurveyOperatorRoleIdentity(role.name, role.id)) {
    return list;
  }
  if (isCashierRoleIdentity(role.name, role.id)) {
    const operational = withoutCashierExcludedClinicNav(withoutManagementEntries(list));
    const hint = shell === undefined ? readCashierShellHintFromStorage() : (shell ?? {});
    if (cashierShellHasClinic(hint)) return operational;
    return withoutSurveyAdministration(operational);
  }
  return list;
}

/** Market kasiyeri: Market POS ve kasa. Anket ve sistem yönetimi yok. */
export function marketCashierPermissionPreset(): Permission[] {
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

/**
 * Klinik kasiyeri. İniş özet sekmesidir; anket menüde durur, ilk sayfa değildir.
 * Leads & CRM ve Klinik operasyon yoktur. Sistem yönetimi, kullanıcı, rol, firma ve menü yönetimi yoktur.
 */
export function clinicCashierPermissionPreset(): Permission[] {
  return [
    { module: 'pos.view', actions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
    { module: 'pos.sell', actions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
    { module: 'beauty', actions: ['READ'] },
    { module: SURVEY_PERMISSION_MODULE, actions: ['READ', 'CREATE', 'UPDATE', 'EXECUTE'] },
  ];
}

/**
 * Hazır rol → Kasiyer.
 * Klinik kabuğunda klinik kasiyer seti, yalnız markette Market POS seti.
 */
export function cashierPermissionPreset(shell?: CashierShellHint | null): Permission[] {
  const hint = shell === undefined ? readCashierShellHintFromStorage() : (shell ?? {});
  if (cashierShellHasClinic(hint)) return clinicCashierPermissionPreset();
  return marketCashierPermissionPreset();
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

export type CashierHomeModule = 'pos' | 'beauty' | 'restaurant' | 'management' | 'wms';

/** Kabuk: klinik modülü varsa güzellik, yalnız market ise Market POS. */
export type CashierShellHint = {
  enabledModules?: readonly string[] | null;
  tenantModule?: string | null;
  systemType?: string | null;
};

function shellTokens(raw: readonly string[] | null | undefined): string[] {
  return (raw || []).map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

/** Klinik / güzellik kiracısı. Market POS listede kalsa bile tenant klinikse klinik sayılır. */
export function cashierShellHasClinic(hint: CashierShellHint | null | undefined): boolean {
  const tenant = String(hint?.tenantModule || '').trim().toLowerCase();
  const system = String(hint?.systemType || '').trim().toLowerCase();
  if (tenant === 'clinic' || tenant === 'beauty') return true;
  if (system === 'beauty' || system === 'clinic') return true;
  const mods = shellTokens(hint?.enabledModules);
  return mods.includes('beauty') && !mods.includes('pos');
}

/** Yalnız market / perakende kabuğu. Klinik sinyali varsa market sayılmaz. */
export function cashierShellHasMarket(hint: CashierShellHint | null | undefined): boolean {
  if (cashierShellHasClinic(hint)) return false;
  const tenant = String(hint?.tenantModule || '').trim().toLowerCase();
  const system = String(hint?.systemType || '').trim().toLowerCase();
  if (tenant === 'market' || tenant === 'retail') return true;
  if (system === 'market' || system === 'retail') return true;
  const mods = shellTokens(hint?.enabledModules);
  return mods.includes('pos') && !mods.includes('beauty');
}

export function readCashierShellHintFromStorage(): CashierShellHint {
  if (typeof localStorage === 'undefined') return {};
  try {
    const rawCfg = localStorage.getItem('retailex_web_config');
    const cfg = rawCfg
      ? (JSON.parse(rawCfg) as {
          tenant_module?: string;
          system_type?: string;
          enabled_modules?: unknown;
        })
      : {};
    const stored = JSON.parse(localStorage.getItem('retailex_enabled_modules') || '[]') as unknown;
    const fromStore = Array.isArray(stored) ? stored.map((item) => String(item)) : [];
    const fromCfg = Array.isArray(cfg.enabled_modules)
      ? cfg.enabled_modules.map((item) => String(item))
      : [];
    return {
      enabledModules: fromStore.length > 0 ? fromStore : fromCfg,
      tenantModule: cfg.tenant_module ?? null,
      systemType: cfg.system_type ?? null,
    };
  } catch {
    return {};
  }
}

function resolveShellHint(shell: CashierShellHint | null | undefined): CashierShellHint {
  if (shell === undefined) return readCashierShellHintFromStorage();
  return shell ?? {};
}

/**
 * Kasiyer kabuğu.
 * Klinik modülü → güzellik ekranı (kayıt `pos` olsa bile).
 * Yalnız market modülü → Market POS.
 * Restoran, yönetim ve depo inişi olduğu gibi kalır.
 */
export function cashierHomeModuleForShell(
  landing: string | null | undefined,
  hint: CashierShellHint | null | undefined,
): CashierHomeModule {
  const value = String(landing ?? '').trim();
  if (value === 'restaurant' || value === 'management' || value === 'wms') return value;
  if (cashierShellHasClinic(hint)) return 'beauty';
  if (cashierShellHasMarket(hint)) return 'pos';
  if (value === 'beauty') return 'beauty';
  return 'pos';
}

/**
 * Kasiyer hazır rolünün kayıtlı iniş modülü.
 * `shell` verilmezse oturum kabuğu okunur. `null` belirsiz kabuk demektir.
 * Anket rolüne dokunmaz.
 */
export function landingRouteForCashierRole(
  name?: string | null,
  id?: string | null,
  landing?: string | null,
  shell?: CashierShellHint | null,
): string {
  const value = String(landing ?? '').trim();
  if (!isCashierRoleIdentity(name, id)) return value;
  return cashierHomeModuleForShell(value, resolveShellHint(shell));
}

/**
 * Girişten sonra açılacak kabuk.
 * Klinik kasiyer Market POS yerine güzellik kabuğunun ana sayfasına düşer. Anket sekmesine düşmez.
 * Anket operatörü ve yönetici buradan geçmez.
 */
export function cashierPostLoginModule(input: {
  name?: string | null;
  id?: string | null;
  landingRoute?: string | null;
  shell?: CashierShellHint | null;
}): CashierHomeModule | null {
  if (!isCashierRoleIdentity(input.name, input.id)) return null;
  return cashierHomeModuleForShell(input.landingRoute, resolveShellHint(input.shell));
}

export function cashierPostLoginModuleFromUser(
  user: {
    role?: string | null;
    roles?: Array<{
      name?: string | null;
      id?: string | null;
      landingRoute?: string | null;
      landing_route?: string | null;
    }> | null;
  } | null | undefined,
  shell?: CashierShellHint | null,
): CashierHomeModule | null {
  const role = user?.roles?.[0];
  return cashierPostLoginModule({
    name: role?.name || user?.role,
    id: role?.id,
    landingRoute: role?.landingRoute ?? role?.landing_route ?? null,
    shell,
  });
}
