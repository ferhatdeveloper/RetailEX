import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Shield, CheckCircle, AlertCircle, Check } from 'lucide-react';
import { roleAPI, Role as RoleType } from '../../services/api/roles';
import { Permission, PermissionAction } from '../../services/rbacService';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { logger } from '../../services/loggingService';
import { buildRbacModuleGroups, RBAC_ACTION_TM_KEYS } from '../../locales/rbacCatalog';

const ALL_ACTIONS: PermissionAction[] = ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'];

/** Landing route → yetki matrisi grubu */
function groupForLanding(landing: string): string {
  switch (String(landing || '').trim()) {
    case 'restaurant':
      return 'rest';
    case 'pos':
      return 'pos';
    case 'wms':
      return 'wms';
    case 'beauty':
      return 'beauty';
    case 'management':
    default:
      return 'backoffice';
  }
}

export type RoleFormProps = {
  /** Gömülü kullanım (ManagementModule içinde) */
  embeddedRoleId?: string | null;
  embeddedMode?: 'new' | 'edit';
  onEmbeddedClose?: () => void;
  /** Varsayılan yetki grubu — Sistem Yönetimi'nden gelince backoffice */
  defaultGroupId?: string;
};

export function RoleForm(props: RoleFormProps = {}) {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const { darkMode } = useTheme();
  const { language, tm } = useLanguage();

  const embedded = Boolean(props.onEmbeddedClose);
  const id = embedded
    ? props.embeddedMode === 'edit'
      ? props.embeddedRoleId || undefined
      : undefined
    : routeId;
  const isEditing = Boolean(id);

  const MODULE_GROUPS = useMemo(() => buildRbacModuleGroups(tm), [language, tm]);

  const ACTION_LABELS: Record<PermissionAction, string> = useMemo(
    () => ({
      READ: tm(RBAC_ACTION_TM_KEYS.READ),
      CREATE: tm(RBAC_ACTION_TM_KEYS.CREATE),
      UPDATE: tm(RBAC_ACTION_TM_KEYS.UPDATE),
      DELETE: tm(RBAC_ACTION_TM_KEYS.DELETE),
      EXECUTE: tm(RBAC_ACTION_TM_KEYS.EXECUTE),
    }),
    [language, tm]
  );

  const LANDING_OPTIONS: { value: string; label: string }[] = useMemo(
    () => [
      { value: '', label: tm('landingDefault') },
      { value: 'restaurant', label: tm('roleLandingRestaurant') },
      { value: 'pos', label: tm('roleLandingPos') },
      { value: 'management', label: tm('roleLandingManagement') },
      { value: 'wms', label: tm('roleLandingWms') },
      { value: 'beauty', label: tm('roleLandingBeauty') },
    ],
    [language, tm]
  );

  const initialGroup =
    props.defaultGroupId ||
    searchParams.get('group') ||
    'backoffice';

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<RoleType | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: [] as Permission[],
    color: '#3B82F6',
    landing_route: '' as string,
  });
  const [activeCategoryTab, setActiveCategoryTab] = useState(() => {
    const exists = MODULE_GROUPS.some((g) => g.id === initialGroup);
    return exists ? initialGroup : MODULE_GROUPS[0]?.id || 'backoffice';
  });

  useEffect(() => {
    if (isEditing && id) void loadRole(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const goBack = () => {
    if (props.onEmbeddedClose) {
      props.onEmbeddedClose();
      return;
    }
    navigate(-1);
  };

  const loadRole = async (roleId: string) => {
    try {
      const roles = await roleAPI.getAll();
      const existingRole = roles.find((r) => r.id === roleId);

      if (existingRole) {
        setRole(existingRole);
        const rawPerms = existingRole.permissions || [];
        let normalizedPermissions: Permission[] = [];
        const isSuperAdmin = rawPerms.some((p: any) => p === '*' || p.module === '*');

        if (isSuperAdmin) {
          MODULE_GROUPS.forEach((g) => {
            g.modules.forEach((m) => {
              normalizedPermissions.push({ module: m.id, actions: [...m.availableActions] });
            });
          });
        } else {
          normalizedPermissions = rawPerms.map((p: any) => {
            if (typeof p === 'string') {
              if (p.endsWith('.*')) {
                const pureModule = p.replace('.*', '');
                return {
                  module: pureModule,
                  actions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] as PermissionAction[],
                };
              }
              return {
                module: p,
                actions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] as PermissionAction[],
              };
            }
            return p as Permission;
          });
        }

        const landing = existingRole.landing_route ?? '';
        setFormData({
          name: existingRole.name,
          description: existingRole.description || '',
          permissions: normalizedPermissions,
          color: existingRole.color || '#3B82F6',
          landing_route: landing,
        });
        setActiveCategoryTab(groupForLanding(landing || 'management'));
      } else {
        alert(tm('roleFormRoleNotFound'));
        goBack();
      }
    } catch (error) {
      console.error('Error loading role:', error);
      alert(tm('roleFormLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formData.name.trim()) {
      alert(tm('roleNamePlaceholder'));
      return;
    }
    setSaving(true);
    try {
      const cleanedData = {
        ...formData,
        name: formData.name.trim(),
        permissions: formData.permissions.filter((p) => p.actions.length > 0),
      };
      if (isEditing && id) {
        await roleAPI.update(id, cleanedData);
      } else {
        await roleAPI.create(cleanedData);
      }
      goBack();
    } catch (error) {
      logger.crudError('RoleForm', isEditing ? 'updateRole' : 'createRole', error);
      alert(tm('roleFormSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const toggleAction = (moduleId: string, action: PermissionAction) => {
    setFormData((prev) => {
      const existingModuleIndex = prev.permissions.findIndex((p) => p.module === moduleId);
      const newPermissions = [...prev.permissions];
      if (existingModuleIndex >= 0) {
        const existingActions = newPermissions[existingModuleIndex].actions;
        if (existingActions.includes(action)) {
          newPermissions[existingModuleIndex].actions = existingActions.filter((a) => a !== action);
        } else {
          newPermissions[existingModuleIndex].actions = [...existingActions, action];
        }
      } else {
        newPermissions.push({ module: moduleId, actions: [action] });
      }
      return { ...prev, permissions: newPermissions };
    });
  };

  const hasAction = (moduleId: string, action: PermissionAction) => {
    const modulePerm = formData.permissions.find((p) => p.module === moduleId);
    return modulePerm?.actions.includes(action) || false;
  };

  const toggleAllInModule = (moduleId: string, availableActions: PermissionAction[]) => {
    setFormData((prev) => {
      const existingModuleIndex = prev.permissions.findIndex((p) => p.module === moduleId);
      const newPermissions = [...prev.permissions];
      if (existingModuleIndex >= 0) {
        const modulePerm = newPermissions[existingModuleIndex];
        if (modulePerm.actions.length === availableActions.length) {
          newPermissions[existingModuleIndex].actions = [];
        } else {
          newPermissions[existingModuleIndex].actions = [...availableActions];
        }
      } else {
        newPermissions.push({ module: moduleId, actions: [...availableActions] });
      }
      return { ...prev, permissions: newPermissions };
    });
  };

  const isModuleAllSelected = (moduleId: string, availableActions: PermissionAction[]) => {
    const modulePerm = formData.permissions.find((p) => p.module === moduleId);
    if (!modulePerm || modulePerm.actions.length === 0) return false;
    return availableActions.every((a) => modulePerm.actions.includes(a));
  };

  const totalSelected = formData.permissions.reduce((acc, p) => acc + p.actions.length, 0);
  const activeGroup = MODULE_GROUPS.find((g) => g.id === activeCategoryTab) || MODULE_GROUPS[0];

  const shell = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';
  const panel = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const inputCls = darkMode
    ? 'w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500'
    : 'w-full px-3 py-2 bg-white border border-gray-300 rounded text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const labelCls = `text-[10px] font-semibold tracking-wide uppercase ${muted}`;

  if (loading) {
    return (
      <div className={`flex h-full items-center justify-center ${shell}`}>
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col overflow-hidden ${shell}`}>
      {/* Flat header */}
      <div className={`shrink-0 border-b px-4 py-3 flex items-center justify-between gap-3 ${panel}`}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={goBack}
            className={`w-9 h-9 flex items-center justify-center border rounded ${
              darkMode
                ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-100'
            }`}
            title={tm('goBack')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <p className={`text-[10px] uppercase tracking-wide ${muted}`}>
              {tm('roleMgmtTitle')} · {tm('permissionMatrix')}
            </p>
            <h2 className={`text-base font-semibold truncate ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {isEditing ? tm('roleUpdateTitle') : tm('roleCreateTitle')}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`hidden sm:inline text-xs px-2.5 py-1.5 border rounded ${
              darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-600'
            }`}
          >
            {tm('totalPermSelected').replace('{n}', String(totalSelected))}
          </span>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {isEditing ? tm('saveChanges') : tm('createRole')}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: role info + module list */}
        <aside
          className={`w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r overflow-y-auto ${panel}`}
        >
          <div className="p-4 space-y-5">
            <div className="space-y-2">
              <div className={`flex items-center gap-1.5 ${labelCls}`}>
                <Shield className="w-3 h-3" />
                {tm('roleInfo')}
              </div>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={inputCls}
                placeholder={tm('roleNamePlaceholder')}
                required
              />
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className={`${inputCls} min-h-[72px] resize-none`}
                placeholder={tm('roleDescPlaceholder')}
              />
              <div
                className={`flex items-center gap-2 px-3 py-2 border rounded ${
                  darkMode ? 'border-gray-600' : 'border-gray-300'
                }`}
              >
                <span className={`flex-1 text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  {tm('roleColorLabel')}
                </span>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-8 h-8 border-0 bg-transparent cursor-pointer p-0"
                />
              </div>
              <div>
                <label className={`block mb-1 ${labelCls}`}>{tm('landingPage')}</label>
                <select
                  value={formData.landing_route}
                  onChange={(e) => {
                    const landing_route = e.target.value;
                    setFormData({ ...formData, landing_route });
                    setActiveCategoryTab(groupForLanding(landing_route || 'management'));
                  }}
                  className={inputCls}
                >
                  {LANDING_OPTIONS.map((opt) => (
                    <option key={opt.value || 'default'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {role?.is_system_role && (
                <div
                  className={`p-3 text-xs flex gap-2 border rounded ${
                    darkMode
                      ? 'bg-amber-950/40 text-amber-200 border-amber-800'
                      : 'bg-amber-50 text-amber-900 border-amber-200'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>{tm('systemRoleWarning')}</div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className={labelCls}>{tm('permissionMatrices')}</div>
              <ul className="space-y-0.5">
                {MODULE_GROUPS.map((group) => {
                  const isActive = activeCategoryTab === group.id;
                  const activeModulesCount = group.modules.filter((m) =>
                    formData.permissions.some((p) => p.module === m.id && p.actions.length > 0)
                  ).length;
                  return (
                    <li key={group.id}>
                      <button
                        type="button"
                        onClick={() => setActiveCategoryTab(group.id)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm border transition-colors ${
                          isActive
                            ? darkMode
                              ? 'bg-blue-950/50 border-blue-600 text-blue-200'
                              : 'bg-blue-50 border-blue-500 text-blue-800'
                            : darkMode
                              ? 'border-transparent text-gray-300 hover:bg-gray-700/60'
                              : 'border-transparent text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0">{group.icon}</span>
                          <span className="truncate font-medium">{group.name}</span>
                        </span>
                        {activeModulesCount > 0 && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              isActive
                                ? darkMode
                                  ? 'bg-blue-800 text-blue-100'
                                  : 'bg-blue-200 text-blue-900'
                                : darkMode
                                  ? 'bg-gray-700 text-gray-300'
                                  : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {activeModulesCount}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </aside>

        {/* Right: flat matrix for active module only */}
        <main className={`flex-1 min-h-0 overflow-y-auto p-4 ${shell}`}>
          {activeGroup && (
            <div className="max-w-5xl mx-auto space-y-3">
              <div
                className={`border px-3 py-2 flex items-center gap-2 ${
                  darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
                }`}
              >
                <span className="text-xl">{activeGroup.icon}</span>
                <div>
                  <h3 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {activeGroup.name}
                    {tm('roleFormMatrixSuffix')}
                  </h3>
                  <p className={`text-[11px] ${muted}`}>
                    {tm('roleFormMatrixIntroPrefix')}
                    <strong className={darkMode ? 'text-gray-200' : 'text-gray-700'}>{activeGroup.name}</strong>
                    {tm('roleFormMatrixIntroSuffix')}
                  </p>
                </div>
              </div>

              <div className={`border overflow-x-auto ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <table className="w-full text-left border-collapse min-w-[720px]">
                  <thead>
                    <tr
                      className={`text-[10px] font-semibold uppercase tracking-wide border-b ${
                        darkMode
                          ? 'bg-gray-800 text-gray-400 border-gray-700'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                    >
                      <th className="p-3 text-left">{tm('roleFormThModule')}</th>
                      <th className="p-2 text-center w-16">{tm('roleFormThAll')}</th>
                      {ALL_ACTIONS.map((act) => (
                        <th key={act} className="p-2 text-center w-20">
                          {ACTION_LABELS[act]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeGroup.modules.map((module) => {
                      const allSelected = isModuleAllSelected(module.id, module.availableActions);
                      return (
                        <tr
                          key={module.id}
                          className={`border-b last:border-b-0 ${
                            darkMode
                              ? 'border-gray-700/80 hover:bg-gray-800/80'
                              : 'border-gray-100 hover:bg-gray-50'
                          }`}
                        >
                          <td className="p-3 align-middle">
                            <p className={`text-sm font-medium ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                              {module.name}
                            </p>
                            <p className={`text-[11px] mt-0.5 ${muted}`}>{module.description}</p>
                            <p className={`text-[10px] font-mono mt-0.5 opacity-60`}>{module.id}</p>
                          </td>
                          <td className="p-2 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => toggleAllInModule(module.id, module.availableActions)}
                              className={`w-7 h-7 mx-auto flex items-center justify-center border rounded ${
                                allSelected
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : darkMode
                                    ? 'border-gray-600 text-gray-500 hover:border-gray-400'
                                    : 'border-gray-300 text-gray-300 hover:border-gray-500'
                              }`}
                              title={tm('roleFormThAll')}
                            >
                              <Check className="w-3.5 h-3.5" strokeWidth={3} />
                            </button>
                          </td>
                          {ALL_ACTIONS.map((act) => {
                            const isAvailable = module.availableActions.includes(act);
                            const isChecked = hasAction(module.id, act);
                            if (!isAvailable) {
                              return (
                                <td key={act} className="p-2 text-center align-middle">
                                  <span className={`inline-block w-2 h-2 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                                </td>
                              );
                            }
                            return (
                              <td key={act} className="p-2 text-center align-middle">
                                <button
                                  type="button"
                                  onClick={() => toggleAction(module.id, act)}
                                  className={`w-7 h-7 mx-auto flex items-center justify-center border rounded ${
                                    isChecked
                                      ? act === 'DELETE'
                                        ? 'bg-red-600 border-red-600 text-white'
                                        : 'bg-blue-600 border-blue-600 text-white'
                                      : darkMode
                                        ? 'border-gray-600 text-transparent hover:border-blue-500'
                                        : 'border-gray-300 text-transparent hover:border-blue-400'
                                  }`}
                                  aria-pressed={isChecked}
                                  aria-label={`${module.name} ${ACTION_LABELS[act]}`}
                                >
                                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default RoleForm;
