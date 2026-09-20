import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Trash2, Shield, Lock, Eye, X, CheckCircle, Copy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { roleAPI, Role as RoleType } from '../../services/api/roles';
import { logger } from '../../services/loggingService';
import { DataTable, type Column } from '../shared/DataTable';
import { Permission, PermissionAction } from '../../services/rbacService';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { moduleTranslations } from '../../locales/module-translations';
import {
  buildRbacModuleGroups,
  RBAC_ACTION_TM_KEYS,
  type RbacModuleConfig,
} from '../../locales/rbacCatalog';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import { RoleForm } from './RoleForm';

interface RoleManagementProps {
  onBack?: () => void;
  /** Açılışta gösterilecek yetki matrisi grubu (ör. Sistem → backoffice, Restoran → rest) */
  defaultGroupId?: string;
}

type FormView = null | { mode: 'new' } | { mode: 'edit'; roleId: string };

export function RoleManagement({ onBack, defaultGroupId = 'backoffice' }: RoleManagementProps) {
  const { darkMode } = useTheme();
  const { language, tm: globalTm } = useLanguage();
  const tm = useCallback(
    (key: string) => moduleTranslations[key]?.[language as 'tr' | 'en' | 'ar' | 'ku'] || globalTm(key),
    [language, globalTm]
  );
  const moduleGroups = useMemo(() => buildRbacModuleGroups(tm), [tm]);
  const actionLabel = useCallback((a: PermissionAction) => tm(RBAC_ACTION_TM_KEYS[a]), [tm]);

  const [roles, setRoles] = useState<RoleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPermissionsModal, setShowPermissionsModal] = useState<RoleType | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [formView, setFormView] = useState<FormView>(null);

  useEffect(() => {
    void loadRoles();
  }, []);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await roleAPI.getAll();
      setRoles(data);
    } catch (error) {
      console.error('Error loading roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const closeForm = () => {
    setFormView(null);
    void loadRoles();
  };

  const handleEdit = (role: RoleType) => {
    setFormView({ mode: 'edit', roleId: role.id });
  };

  const handleCopy = async (role: RoleType) => {
    setCopyingId(role.id);
    try {
      const suffix = tm('roleMgmtCopySuffix');
      const created = await roleAPI.create({
        name: `${role.name} ${suffix}`.trim(),
        description: role.description || '',
        permissions: Array.isArray(role.permissions) ? structuredClone(role.permissions) : [],
        color: role.color || '#3B82F6',
        landing_route: role.landing_route ?? null,
      });
      if (created?.id) {
        toast.success(tm('roleMgmtCopySuccess'));
        await loadRoles();
        setFormView({ mode: 'edit', roleId: created.id });
      } else {
        toast.error(tm('roleMgmtCopyError'));
      }
    } catch (error) {
      logger.crudError('RoleManagement', 'copyRole', error);
      toast.error(tm('roleMgmtCopyError'));
    } finally {
      setCopyingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm(tm('roleMgmtConfirmDelete'))) {
      try {
        const success = await roleAPI.delete(id);
        if (success) {
          await loadRoles();
        } else {
          alert(tm('roleMgmtSystemDeleteBlocked'));
        }
      } catch (error) {
        logger.crudError('RoleManagement', 'deleteRole', error);
      }
    }
  };

  const btnFlat = (tone: 'blue' | 'emerald' | 'red' | 'muted') => {
    if (tone === 'muted') {
      return darkMode
        ? 'p-2 border border-gray-700 text-gray-600 cursor-not-allowed'
        : 'p-2 border border-gray-200 text-gray-300 cursor-not-allowed';
    }
    const map = {
      blue: darkMode
        ? 'p-2 border border-gray-600 text-blue-400 hover:bg-gray-700'
        : 'p-2 border border-gray-300 text-blue-600 hover:bg-gray-100',
      emerald: darkMode
        ? 'p-2 border border-gray-600 text-emerald-400 hover:bg-gray-700'
        : 'p-2 border border-gray-300 text-emerald-700 hover:bg-gray-100',
      red: darkMode
        ? 'p-2 border border-gray-600 text-red-400 hover:bg-gray-700'
        : 'p-2 border border-gray-300 text-red-600 hover:bg-gray-100',
    };
    return map[tone];
  };

  const columns: Column<RoleType>[] = useMemo(
    () => [
      {
        id: 'name',
        header: tm('roleMgmtColRoleName'),
        accessor: 'name',
        minWidth: 200,
        sortable: true,
        filterable: true,
        cell: (value: any, row: RoleType) => (
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 flex items-center justify-center border border-transparent"
              style={{ backgroundColor: row.color || '#3B82F6' }}
            >
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className={`font-semibold text-sm ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                {value}{' '}
                {row.is_system_role && (
                  <span
                    className={`ml-1.5 text-[10px] px-1.5 py-0.5 font-bold ${
                      darkMode ? 'bg-red-950/50 text-red-300' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {tm('roleMgmtSystemGroup')}
                  </span>
                )}
              </p>
              <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {row.description}
              </p>
              {row.landing_route ? (
                <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                  {tm('roleMgmtLandingLabel')}: {row.landing_route}
                </p>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: 'userCount',
        header: tm('roleMgmtColUsers'),
        accessor: (row: RoleType) => row.userCount || 0,
        width: 110,
        sortable: true,
        cell: (value: any) => (
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
              darkMode ? 'text-gray-200' : 'text-gray-700'
            }`}
          >
            <Users className="w-3.5 h-3.5 opacity-70" />
            {Number(value) || 0}
          </span>
        ),
      },
      {
        id: 'permissions',
        header: tm('roleMgmtColPermissions'),
        accessor: (row: RoleType) => row.permissions?.length || 0,
        width: 170,
        sortable: false,
        cell: (_value: any, row: RoleType) => {
          const distinctModules = (row.permissions || []).length;
          return (
            <button
              type="button"
              onClick={() => {
                const normalizedPermissions: Permission[] = (row.permissions || []).map((p) => {
                  if (typeof p === 'string') return { module: p, actions: ['READ'] };
                  return p as Permission;
                });
                setShowPermissionsModal({ ...row, permissions: normalizedPermissions });
              }}
              className={`flex items-center gap-2 px-2.5 py-1.5 text-sm border ${
                darkMode
                  ? 'bg-gray-900 border-gray-600 text-blue-300 hover:border-blue-500'
                  : 'bg-white border-gray-300 text-blue-700 hover:border-blue-400'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span className="font-semibold">
                {tm('roleMgmtServiceCount').replace('{n}', String(distinctModules))}
              </span>
              <Eye className="h-3.5 w-3.5 opacity-60" />
            </button>
          );
        },
      },
      {
        id: 'actions',
        header: tm('roleMgmtColActions'),
        accessor: (row: RoleType) => row,
        width: 160,
        cell: (_: any, row: RoleType) => (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleEdit(row)}
              className={btnFlat('blue')}
              title={tm('roleMgmtEditTitle')}
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleCopy(row)}
              disabled={copyingId === row.id}
              className={`${btnFlat('emerald')} disabled:opacity-50`}
              title={tm('roleMgmtCopyTitle')}
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(row.id)}
              disabled={row.is_system_role}
              className={row.is_system_role ? btnFlat('muted') : btnFlat('red')}
              title={row.is_system_role ? tm('roleMgmtDeleteDisabled') : tm('roleMgmtDeleteTitle')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [tm, darkMode, copyingId]
  );

  if (formView) {
    return (
      <RoleForm
        embeddedMode={formView.mode}
        embeddedRoleId={formView.mode === 'edit' ? formView.roleId : null}
        onEmbeddedClose={closeForm}
        defaultGroupId={defaultGroupId}
      />
    );
  }

  return (
    <div className={`h-full flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div
        className={`shrink-0 border-b px-5 py-4 flex items-center justify-between gap-3 ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className={`text-sm px-2.5 py-1.5 border ${
                darkMode
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              ←
            </button>
          ) : null}
          <div
            className={`w-10 h-10 flex items-center justify-center ${
              darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-600 text-white'
            }`}
          >
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className={`text-lg font-semibold truncate ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {tm('roleMgmtTitle')}
            </h2>
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{tm('roleMgmtSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFormView({ mode: 'new' })}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          {tm('roleMgmtAddRole')}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className={`border overflow-hidden ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
            <DataTable
              data={roles}
              columns={columns}
              searchable={true}
              exportable={false}
              columnResizable={false}
              stickyHeader={true}
              maxHeight="calc(100vh - 220px)"
              emptyMessage={tm('roleMgmtEmpty')}
            />
          </div>
        )}
      </div>

      {showPermissionsModal && (
        <PercentBodyModal
          onClose={() => setShowPermissionsModal(null)}
          size="wide"
          ariaLabel={showPermissionsModal.name}
        >
          <div
            className={`shrink-0 border-b px-5 py-4 flex items-start justify-between gap-3 ${
              darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            }`}
          >
            <div className="flex gap-3 items-center min-w-0">
              <div
                className="w-12 h-12 flex items-center justify-center shrink-0"
                style={{ backgroundColor: showPermissionsModal.color || '#3b82f6' }}
              >
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className={`text-lg font-semibold truncate ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  {showPermissionsModal.name}
                </h3>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {showPermissionsModal.description || tm('roleMgmtModalDefaultDesc')}
                </p>
                <span
                  className={`inline-flex items-center gap-1.5 mt-2 px-2 py-1 text-xs border ${
                    darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-700'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  {tm('roleMgmtModalPermCount').replace(
                    '{n}',
                    String(
                      showPermissionsModal.permissions.reduce(
                        (acc: number, p: any) => acc + (p.actions?.length || 0),
                        0
                      )
                    )
                  )}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPermissionsModal(null)}
              className={`p-2 border ${
                darkMode
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                  : 'border-gray-300 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <PercentBodyModalScrollBody
            className={`p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
          >
            <div className="space-y-4">
              {moduleGroups.map((group) => {
                const activeModulesInGroup = group.modules
                  .map((module) => {
                    const rolePerm = showPermissionsModal.permissions.find(
                      (p: any) => p.module === module.id
                    );
                    if (rolePerm && rolePerm.actions.length > 0) {
                      return { module, actions: rolePerm.actions as PermissionAction[] };
                    }
                    return null;
                  })
                  .filter(Boolean) as { module: RbacModuleConfig; actions: PermissionAction[] }[];

                if (activeModulesInGroup.length === 0) return null;

                return (
                  <div
                    key={group.id}
                    className={`border p-4 ${
                      darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <h4
                      className={`flex items-center gap-2 text-sm font-semibold mb-3 pb-2 border-b ${
                        darkMode
                          ? 'text-gray-100 border-gray-700'
                          : 'text-gray-900 border-gray-100'
                      }`}
                    >
                      <span className="text-lg">{group.icon}</span>
                      {group.name}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {activeModulesInGroup.map(({ module, actions }) => (
                        <div
                          key={module.id}
                          className={`p-3 border flex gap-3 ${
                            darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <CheckCircle
                            className={`w-4 h-4 mt-0.5 shrink-0 ${
                              darkMode ? 'text-blue-400' : 'text-blue-600'
                            }`}
                          />
                          <div>
                            <div
                              className={`font-semibold text-sm ${
                                darkMode ? 'text-gray-100' : 'text-gray-800'
                              }`}
                            >
                              {module.name}
                            </div>
                            <div className={`text-[11px] mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {module.description}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {actions.map((act) => {
                                const isDanger = act === 'DELETE';
                                return (
                                  <span
                                    key={act}
                                    className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${
                                      isDanger
                                        ? darkMode
                                          ? 'bg-red-950/40 text-red-300 border-red-800'
                                          : 'bg-red-50 text-red-600 border-red-200'
                                        : darkMode
                                          ? 'bg-gray-800 text-gray-300 border-gray-600'
                                          : 'bg-white text-gray-600 border-gray-200'
                                    }`}
                                  >
                                    {actionLabel(act)}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </PercentBodyModalScrollBody>
        </PercentBodyModal>
      )}
    </div>
  );
}

export default RoleManagement;
