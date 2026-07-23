import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Shield, CheckCircle, AlertCircle, Check } from 'lucide-react';
import { roleAPI, Role as RoleType } from '../../services/api/roles';
import { Permission, PermissionAction } from '../../services/rbacService';
import { useLanguage } from '../../contexts/LanguageContext';
import { logger } from '../../services/loggingService';
import { buildRbacModuleGroups, RBAC_ACTION_TM_KEYS } from '../../locales/rbacCatalog';

export function RoleForm() {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditing = Boolean(id);
    const { language, tm } = useLanguage();

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

    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [role, setRole] = useState<RoleType | null>(null);

    // Advanced form state
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

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        permissions: [] as Permission[],
        color: '#3B82F6',
        landing_route: '' as string
    });

    const [activeCategoryTab, setActiveCategoryTab] = useState(MODULE_GROUPS[0].id);

    useEffect(() => {
        if (isEditing && id) {
            loadRole(id);
        }
    }, [id]);

    const loadRole = async (roleId: string) => {
        try {
            const roles = await roleAPI.getAll();
            const existingRole = roles.find(r => r.id === roleId);

            if (existingRole) {
                setRole(existingRole);
                const rawPerms = existingRole.permissions || [];

                let normalizedPermissions: Permission[] = [];

                // Admin (full access) parsing
                const isSuperAdmin = rawPerms.some((p: any) => p === '*' || p.module === '*');

                if (isSuperAdmin) {
                    MODULE_GROUPS.forEach(g => {
                        g.modules.forEach(m => {
                            normalizedPermissions.push({ module: m.id, actions: [...m.availableActions] });
                        });
                    });
                } else {
                    normalizedPermissions = rawPerms.map((p: any) => {
                        if (typeof p === 'string') {
                            // Legacy string fallback handling
                            if (p.endsWith('.*')) {
                                const pureModule = p.replace('.*', '');
                                return { module: pureModule, actions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] };
                            }
                            return { module: p, actions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] };
                        }
                        return p as Permission;
                    });
                }

                setFormData({
                    name: existingRole.name,
                    description: existingRole.description || '',
                    permissions: normalizedPermissions,
                    color: existingRole.color || '#3B82F6',
                    landing_route: existingRole.landing_route ?? ''
                });
            } else {
                alert(tm('roleFormRoleNotFound'));
                navigate('/system/roles');
            }
        } catch (error) {
            console.error('Error loading role:', error);
            alert(tm('roleFormLoadError'));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            // Clean up empty modules 
            const cleanedData = {
                ...formData,
                permissions: formData.permissions.filter(p => p.actions.length > 0)
            };

            if (isEditing && id) {
                await roleAPI.update(id, cleanedData);
            } else {
                await roleAPI.create(cleanedData);
            }
            navigate(-1);
        } catch (error) {
            logger.crudError('RoleForm', isEditing ? 'updateRole' : 'createRole', error);
            alert(tm('roleFormSaveError'));
        } finally {
            setSaving(false);
        }
    };

    const toggleAction = (moduleId: string, action: PermissionAction) => {
        setFormData(prev => {
            const existingModuleIndex = prev.permissions.findIndex(p => p.module === moduleId);

            let newPermissions = [...prev.permissions];

            if (existingModuleIndex >= 0) {
                const existingActions = newPermissions[existingModuleIndex].actions;
                if (existingActions.includes(action)) {
                    newPermissions[existingModuleIndex].actions = existingActions.filter(a => a !== action);
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
        const modulePerm = formData.permissions.find(p => p.module === moduleId);
        return modulePerm?.actions.includes(action) || false;
    };

    const toggleAllInModule = (moduleId: string, availableActions: PermissionAction[]) => {
        setFormData(prev => {
            const existingModuleIndex = prev.permissions.findIndex(p => p.module === moduleId);
            let newPermissions = [...prev.permissions];

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
        const modulePerm = formData.permissions.find(p => p.module === moduleId);
        if (!modulePerm || modulePerm.actions.length === 0) return false;
        return availableActions.every(a => modulePerm.actions.includes(a));
    };


    if (loading) {
        return (
            <div className="flex h-full items-center justify-center bg-gray-50">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b px-8 py-4 flex-shrink-0 z-10 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        title={tm('goBack')}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            {isEditing ? tm('roleUpdateTitle') : tm('roleCreateTitle')}
                        </h2>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">
                            {tm('permissionMatrix')}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-xs font-bold text-slate-500 tracking-wide bg-slate-100 px-4 py-2 rounded-xl hidden md:block">
                        {tm('totalPermSelected').replace('{n}', String(formData.permissions.reduce((acc, p) => acc + p.actions.length, 0)))}
                    </div>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-200 hover:-translate-y-0.5 transition-all flex items-center gap-2 font-black uppercase text-sm tracking-wide disabled:opacity-50"
                    >
                        {saving ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <CheckCircle className="h-5 w-5" />
                        )}
                        {isEditing ? tm('saveChanges') : tm('createRole')}
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-row">

                {/* Left Sidebar - Settings */}
                <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full overflow-y-auto custom-scrollbar flex-shrink-0 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10">
                    <div className="p-6 space-y-8">
                        {/* Advanced Info */}
                        <div className="space-y-4">
                            <label className="flex items-center gap-2 text-[10px] font-black tracking-widest text-slate-400 uppercase">
                                <Shield className="w-3.5 h-3.5" /> {tm('roleInfo')}
                            </label>
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-bold text-slate-900 placeholder-slate-400 transition-all"
                                    placeholder={tm('roleNamePlaceholder')}
                                    required
                                />
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium text-sm text-slate-700 placeholder-slate-400 transition-all min-h-[100px] resize-none"
                                    placeholder={tm('roleDescPlaceholder')}
                                />
                                <div className="flex items-center gap-3 bg-white px-4 py-3 border border-slate-200 rounded-xl">
                                    <label className="text-sm font-bold text-slate-700 flex-1">{tm('roleColorLabel')}</label>
                                    <div className="w-10 h-10 p-1 bg-slate-100 rounded-lg border border-slate-200 overflow-hidden cursor-pointer relative hover:shadow-md transition-shadow">
                                        <input
                                            type="color"
                                            value={formData.color}
                                            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                            className="w-full h-full border-0 absolute -top-2 -left-2 w-[150%] h-[150%] cursor-pointer"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                        {tm('landingPage')}
                                    </label>
                                    <select
                                        value={formData.landing_route}
                                        onChange={(e) => setFormData({ ...formData, landing_route: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium text-slate-800"
                                    >
                                        {LANDING_OPTIONS.map(opt => (
                                            <option key={opt.value || 'default'} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {role?.is_system_role && (
                                    <div className="p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold flex gap-3 leading-relaxed shadow-sm">
                                        <AlertCircle className="w-6 h-6 shrink-0 mt-0.5 text-amber-500" />
                                        <div>{tm('systemRoleWarning')}</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Module Navigation */}
                        <div className="space-y-3 pb-8">
                            <label className="text-[10px] font-black tracking-widest text-slate-400 uppercase">{tm('permissionMatrices')}</label>
                            <ul className="space-y-1.5">
                                {MODULE_GROUPS.map(group => {
                                    const isActive = activeCategoryTab === group.id;
                                    const activeModulesCount = group.modules.filter(m =>
                                        formData.permissions.some(p => p.module === m.id && p.actions.length > 0)
                                    ).length;

                                    return (
                                        <li key={group.id}>
                                            <button
                                                type="button"
                                                onClick={() => setActiveCategoryTab(group.id)}
                                                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all font-semibold text-sm ${isActive ? 'bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]' : 'text-slate-600 hover:bg-slate-100'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl">{group.icon}</span>
                                                    <span className="tracking-tight">{group.name}</span>
                                                </div>
                                                {activeModulesCount > 0 && (
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isActive ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-500'}`}>
                                                        {activeModulesCount}
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Right Content - Matrix */}
                <div className="flex-1 bg-slate-50/50 p-10 overflow-y-auto custom-scrollbar">
                    {MODULE_GROUPS.map(group => {
                        if (activeCategoryTab !== group.id) return null;

                        return (
                            <div key={group.id} className="max-w-6xl mx-auto animate-in slide-in-from-bottom-4 duration-300">
                                <div className="mb-6">
                                    <h4 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-4">
                                        <span className="p-3 bg-white outline outline-1 outline-slate-200 shadow-sm rounded-2xl text-3xl">{group.icon}</span>
                                        {group.name}
                                        {tm('roleFormMatrixSuffix')}
                                    </h4>
                                    <p className="text-slate-500 mt-2 font-medium max-w-3xl leading-relaxed">
                                        {tm('roleFormMatrixIntroPrefix')}
                                        <strong className="text-slate-700">{group.name}</strong>
                                        {tm('roleFormMatrixIntroSuffix')}
                                    </p>
                                </div>

                                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl shadow-slate-200/50">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[800px]">
                                            <thead>
                                                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-black tracking-widest text-slate-400 uppercase">
                                                    <th className="p-5">{tm('roleFormThModule')}</th>
                                                    <th className="text-center p-3 w-20 bg-slate-100/50">{tm('roleFormThAll')}</th>
                                                    {['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'].map((act) => (
                                                        <th key={act} className="text-center p-3 w-24">
                                                            {ACTION_LABELS[act as PermissionAction]}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {group.modules.map(module => {
                                                    const allSelected = isModuleAllSelected(module.id, module.availableActions);

                                                    return (
                                                        <tr key={module.id} className="hover:bg-blue-50/30 transition-colors group/row">
                                                            <td className="p-5">
                                                                <p className="font-bold text-slate-900 text-sm">{module.name}</p>
                                                                <p className="text-xs text-slate-400 font-medium mt-1 pr-4">{module.description}</p>
                                                            </td>
                                                            <td className="p-3 text-center align-middle border-x border-slate-100 bg-slate-50/30 group-hover/row:bg-transparent">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleAllInModule(module.id, module.availableActions)}
                                                                    className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-all shadow-sm active:scale-90 ${allSelected ? 'bg-slate-800 text-white shadow-slate-800/20' : 'bg-white border border-slate-200 text-slate-300 hover:border-slate-400 hover:text-slate-500'}`}
                                                                >
                                                                    <Check className={`w-4 h-4 ${allSelected ? 'opacity-100' : 'opacity-0'}`} strokeWidth={3} />
                                                                </button>
                                                            </td>
                                                            {['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'].map((actStr) => {
                                                                const act = actStr as PermissionAction;
                                                                const isAvailable = module.availableActions.includes(act);
                                                                const isChecked = hasAction(module.id, act);

                                                                const activeColorClass = act === 'DELETE' ? 'bg-red-500 border-red-500 shadow-red-500/30' : 'bg-blue-600 border-blue-600 shadow-blue-500/30';
                                                                const hoverBorderClass = act === 'DELETE' ? 'hover:border-red-400' : 'hover:border-blue-400';

                                                                return (
                                                                    <td key={actStr} className="p-3 text-center align-middle">
                                                                        {isAvailable ? (
                                                                            <label className="cursor-pointer mx-auto block w-max mt-1 relative group/chk">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    className="sr-only"
                                                                                    checked={isChecked}
                                                                                    onChange={() => toggleAction(module.id, act)}
                                                                                />
                                                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border-2 active:scale-90 ${isChecked ? `${activeColorClass} text-white shadow-lg -translate-y-0.5` : `bg-white border-slate-200 text-slate-200 ${hoverBorderClass} shadow-sm group-hover/chk:text-slate-300`}`}>
                                                                                    <Check className={`w-5 h-5 transition-opacity duration-200 ${isChecked ? 'opacity-100' : 'opacity-0'}`} strokeWidth={4} />
                                                                                </div>
                                                                            </label>
                                                                        ) : (
                                                                            <div className="w-9 h-9 mt-1 rounded-xl bg-slate-50 mx-auto flex items-center justify-center">
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                )
                                                            })}
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}

export default RoleForm;
