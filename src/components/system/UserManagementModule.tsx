import { useState, useEffect } from 'react';
import { Users, Plus, Edit, Trash2, Search, UserCheck, UserX, Shield, Lock, X, ChevronDown, Building2, Calendar, Store, Package, ChevronRight } from 'lucide-react';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { useLanguage } from '../../contexts/LanguageContext';

import { userAPI, roleAPI, User, Role, UserAllowedPeriod } from '../../services/api';
import { organizationAPI } from '../../services/api/organization';
import { logger } from '../../services/loggingService';

export function UserManagementModule() {
  const { tm } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    email: '',
    phone: '',
    role_id: '',
    store_id: '',
    password: '',
    allowed_firm_nrs: [] as string[],
    allowed_periods: [] as UserAllowedPeriod[],
    allowed_store_ids: [] as string[]
  });
  const [firmsWithPeriods, setFirmsWithPeriods] = useState<{
    firms: any[];
    periodsByFirmNr: Record<string, any[]>;
    storesByFirmNr: Record<string, { id: string; code: string; name: string; type?: string }[]>;
  }>({ firms: [], periodsByFirmNr: {}, storesByFirmNr: {} });
  const [expandedFirms, setExpandedFirms] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [userData, roleData] = await Promise.all([
        userAPI.getAll(),
        roleAPI.getAll()
      ]);
      setUsers(userData);
      setRoles(roleData);
    } catch (error) {
      console.error('Error loading management data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (editingUser) {
      setFormData({
        username: editingUser.username,
        full_name: editingUser.full_name,
        email: editingUser.email || '',
        phone: editingUser.phone || '',
        role_id: editingUser.role_id || '',
        store_id: editingUser.store_id || '',
        password: '',
        allowed_firm_nrs: editingUser.allowed_firm_nrs ?? [],
        allowed_periods: editingUser.allowed_periods ?? [],
        allowed_store_ids: editingUser.allowed_store_ids ?? []
      });
    } else {
      setFormData({
        username: '',
        full_name: '',
        email: '',
        phone: '',
        role_id: roles.length > 0 ? roles[0].id : '',
        store_id: '',
        password: '',
        allowed_firm_nrs: [],
        allowed_periods: [],
        allowed_store_ids: []
      });
    }
  }, [editingUser, showUserModal, roles]);

  useEffect(() => {
    if (showUserModal) {
      organizationAPI.getFirmsWithPeriodsAndStores().then(setFirmsWithPeriods).catch(() => {});
    }
  }, [showUserModal]);

  const toggleFirmExpanded = (firmNr: string) => {
    setExpandedFirms(prev => {
      const next = new Set(prev);
      if (next.has(firmNr)) next.delete(firmNr);
      else next.add(firmNr);
      return next;
    });
  };

  const handleSave = async () => {
    try {
      // Find role name for legacy support
      const selectedRole = roles.find(r => r.id === formData.role_id);
      const dataToSave = {
        ...formData,
        role: selectedRole?.name || 'cashier',
        allowed_firm_nrs: formData.allowed_firm_nrs ?? [],
        allowed_periods: formData.allowed_periods ?? [],
        allowed_store_ids: formData.allowed_store_ids ?? []
      };

      if (editingUser) {
        // Only send password if it's not empty
        const dataToUpdate = formData.password ? dataToSave : { ...dataToSave, password: undefined };
        await userAPI.update(editingUser.id, dataToUpdate);
      } else {
        await userAPI.create(dataToSave);
      }
      setShowUserModal(false);
      await loadData();
    } catch (error: any) {
      logger.crudError('UserManagement', 'saveUser', error);
      const msg = error?.message || error?.toString?.() || 'Kullanıcı kaydedilirken bir hata oluştu.';
      alert(msg.includes('Kullanıcı kaydedilirken') ? msg : `Kullanıcı kaydedilirken bir hata oluştu.\n\n${msg}`);
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setShowUserModal(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setShowUserModal(true);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?')) return;

    try {
      await userAPI.delete(userId);
      await loadData();
    } catch (error) {
      logger.crudError('UserManagement', 'deleteUser', error);
    }
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      await userAPI.update(userId, { is_active: !currentStatus });
      await loadData();
    } catch (error) {
      logger.crudError('UserManagement', 'toggleUserStatus', error);
    }
  };

  const columnHelper = createColumnHelper<User>();

  const columns: ColumnDef<User, any>[] = [
    columnHelper.accessor('username', {
      header: tm('colUsername'),
      cell: (info: any) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <span className="font-medium">{info.getValue() as string}</span>
        </div>
      ),
      size: 180
    }),
    columnHelper.accessor('full_name', {
      header: tm('colFullName'),
      cell: (info: any) => info.getValue(),
      size: 200
    }),
    columnHelper.accessor('email', {
      header: tm('colEmail'),
      cell: (info: any) => info.getValue() || '-',
      size: 200
    }),
    columnHelper.accessor('role_name', {
      header: tm('colRole'),
      cell: (info: any) => {
        const roleName = info.getValue() || tm('roleUser');
        const roleColors: Record<string, string> = {
          admin: 'bg-purple-100 text-purple-700',
          manager: 'bg-blue-100 text-blue-700',
          cashier: 'bg-green-100 text-green-700',
          stock: 'bg-orange-100 text-orange-700',
        };
        const baseRole = (roleName as string).toLowerCase();
        return (
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${roleColors[baseRole] || 'bg-gray-100 text-gray-700'}`}>
            {roleName.toUpperCase()}
          </span>
        );
      },
      size: 140
    }),
    columnHelper.accessor('phone', {
      header: tm('colPhone'),
      cell: (info: any) => info.getValue() || '-',
      size: 150
    }),
    columnHelper.accessor('is_active', {
      header: tm('colStatus'),
      cell: (info: any) => {
        const isActive = info.getValue();
        return (
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
            {isActive ? tm('statusActive') : tm('statusPassive')}
          </span>
        );
      },
      size: 100
    }),
    columnHelper.accessor('last_login_at', {
      header: tm('colLastLogin'),
      cell: (info: any) => {
        const date = info.getValue();
        return date ? new Date(date).toLocaleDateString('tr-TR') : '-';
      },
      size: 120
    }),
    columnHelper.display({
      id: 'actions',
      header: tm('actions'),
      cell: ({ row }: { row: { original: User } }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEditUser(row.original)}
            className="p-2 hover:bg-blue-50 rounded transition-colors"
            title={tm('edit')}
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={() => handleToggleActive(row.original.id, row.original.is_active)}
            className="p-2 hover:bg-orange-50 rounded transition-colors"
            title={row.original.is_active ? tm('makePassive') : tm('makeActive')}
          >
            {row.original.is_active ? (
              <UserX className="w-4 h-4 text-orange-600" />
            ) : (
              <UserCheck className="w-4 h-4 text-green-600" />
            )}
          </button>
          <button
            onClick={() => handleDeleteUser(row.original.id)}
            className="p-2 hover:bg-red-50 rounded transition-colors"
            title={tm('delete')}
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      ),
      size: 150
    }),
  ];

  const filteredUsers = users.filter((user: User) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (user.role_name && user.role_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 p-6 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{tm('userManagement')}</h1>
              <p className="text-sm text-gray-600">{tm('userManagementDesc')}</p>
            </div>
          </div>
          <button
            onClick={handleAddUser}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            {tm('newUser')}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={tm('searchUserPlaceholder')}
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex-shrink-0 p-6 grid grid-cols-4 gap-4 border-b border-gray-200">
        <div className="bg-blue-50 rounded-lg p-4 shadow-sm border border-blue-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 mb-1">{tm('totalUsers')}</p>
              <p className="text-3xl font-bold text-blue-900">{users.length}</p>
            </div>
            <Users className="w-10 h-10 text-blue-500 opacity-50" />
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 shadow-sm border border-green-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 mb-1">{tm('statusActive')}</p>
              <p className="text-3xl font-bold text-green-900">
                {users.filter((u: User) => u.is_active).length}
              </p>
            </div>
            <UserCheck className="w-10 h-10 text-green-500 opacity-50" />
          </div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 shadow-sm border border-red-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 mb-1">{tm('statusPassive')}</p>
              <p className="text-3xl font-bold text-red-900">
                {users.filter((u: User) => !u.is_active).length}
              </p>
            </div>
            <UserX className="w-10 h-10 text-red-500 opacity-50" />
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 shadow-sm border border-purple-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 mb-1">{tm('admins')}</p>
              <p className="text-3xl font-bold text-purple-900">
                {users.filter((u: User) => (u.role_name || u.role || '').toLowerCase() === 'admin').length}
              </p>
            </div>
            <Shield className="w-10 h-10 text-purple-500 opacity-50" />
          </div>
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-hidden p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">{tm('usersLoading')}</p>
            </div>
          </div>
        ) : (
          <DevExDataGrid
            data={filteredUsers}
            columns={columns}
            enablePagination={true}
            enableSorting={true}
            enableFiltering={false}
            pageSize={20}
          />
        )}
      </div>

      {/* User Modal — flat style (garson seçim / ödeme modalı gibi) */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-xl border border-slate-200/80 flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight">
                {editingUser ? tm('editUser') : tm('createUser')}
              </h2>
                  <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">
                    {editingUser ? 'Bilgileri güncelleyin' : 'Yeni kullanıcı ekleyin'}
                  </p>
                </div>
              <button
                  type="button"
                onClick={() => setShowUserModal(false)}
                  className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                title={tm('close')}
              >
                  <X className="w-5 h-5" />
              </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('usernameLabel')} *
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none transition-all text-slate-800 font-medium"
                    placeholder="kullanici123"
                  />
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('fullNameLabel')} *
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none transition-all text-slate-800 font-medium"
                    placeholder="Ahmet Yılmaz"
                  />
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('emailLabel')}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none transition-all text-slate-800 font-medium"
                    placeholder="ahmet@example.com"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('roleLabel')} *
                  </label>
                    <div className="relative">
                  <select
                    value={formData.role_id}
                    onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                        className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none transition-all text-slate-800 font-medium appearance-none bg-white"
                  >
                    <option value="">{tm('selectRole')}</option>
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>{role.name.toUpperCase()}</option>
                    ))}
                  </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" aria-hidden />
                    </div>
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('bPhone')}
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none transition-all text-slate-800 font-medium"
                    placeholder="+964 750 123 4567"
                  />
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {editingUser ? tm('passwordOptional') : `${tm('passwordLabel')} *`}
                </label>
                <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none transition-all text-slate-800 font-medium"
                    placeholder={tm('passwordPlaceholder')}
                  />
                </div>
              </div>
            </div>

                {/* Tree: Firma → Dönemler, Mağazalar/Depolar — tam genişlik */}
                <div className="col-span-2 w-full min-w-0 space-y-2 p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-4 h-4 text-slate-500" />
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Görebileceği firmalar, dönemler ve mağazalar/depolar</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-1">
                    {(firmsWithPeriods.firms || []).map((f: any) => {
                      const firmNr = f.firm_nr || f.firma_kodu || '';
                      const firmChecked = formData.allowed_firm_nrs?.includes(firmNr);
                      const expanded = expandedFirms.has(firmNr);
                      const periods = firmsWithPeriods.periodsByFirmNr?.[firmNr] || [];
                      const stores = firmsWithPeriods.storesByFirmNr?.[firmNr] || [];
                      return (
                        <div key={firmNr} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <div className="flex items-center gap-2 min-h-11">
                            <button
                              type="button"
                              onClick={() => toggleFirmExpanded(firmNr)}
                              className="p-2 text-slate-500 hover:bg-slate-100 transition-transform"
                              aria-expanded={expanded}
                            >
                              <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                            </button>
                            <label className="flex items-center gap-2 flex-1 py-2 pr-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!firmChecked}
                                onChange={() => {
                                  if (firmChecked) {
                                    setFormData({
                                      ...formData,
                                      allowed_firm_nrs: (formData.allowed_firm_nrs || []).filter((n: string) => n !== firmNr),
                                      allowed_periods: (formData.allowed_periods || []).filter((p: UserAllowedPeriod) => p.firm_nr !== firmNr),
                                      allowed_store_ids: (formData.allowed_store_ids || []).filter(id => {
                                        const s = stores.find((st: any) => st.id === id);
                                        return !s;
                                      })
                                    });
                                  } else {
                                    setFormData({ ...formData, allowed_firm_nrs: [...(formData.allowed_firm_nrs || []), firmNr] });
                                  }
                                }}
                                className="w-4 h-4 rounded accent-blue-600"
                              />
                              <span className="text-sm font-semibold text-slate-700">{f.name || f.firma_adi || firmNr}</span>
                            </label>
                          </div>
                          {expanded && (
                            <div className="border-t border-slate-100 bg-slate-50/50 pl-10 pr-3 pb-3 pt-2 space-y-3">
                              <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5" /> Dönemler
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {periods.map((p: any) => {
                                    const periodNr = p.nr ?? p.donem_no;
                                    const pChecked = (formData.allowed_periods || []).some(x => x.firm_nr === firmNr && x.period_nr === periodNr);
                                    return (
                                      <label key={`${firmNr}-${periodNr}`} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-blue-50/50">
                                        <input
                                          type="checkbox"
                                          checked={!!pChecked}
                                          onChange={() => {
                                            const current = formData.allowed_periods || [];
                                            if (pChecked) {
                                              setFormData({ ...formData, allowed_periods: current.filter(x => !(x.firm_nr === firmNr && x.period_nr === periodNr)) });
                                            } else {
                                              setFormData({ ...formData, allowed_periods: [...current, { firm_nr: firmNr, period_nr: periodNr }] });
                                            }
                                          }}
                                          className="w-3.5 h-3.5 rounded accent-blue-600"
                                        />
                                        <span className="text-[11px] font-medium text-slate-600">{periodNr}. Dönem</span>
                                      </label>
                                    );
                                  })}
                                  {periods.length === 0 && <span className="text-[11px] text-slate-400">Dönem yok</span>}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                  <Store className="w-3.5 h-3.5" /> Mağazalar / Depolar
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {stores.map((st: { id: string; code: string; name: string; type?: string }) => {
                                    const stChecked = (formData.allowed_store_ids || []).includes(st.id);
                                    const isDepo = (st.type || '').toLowerCase().includes('depo') || (st.name || '').toLowerCase().includes('depo');
                                    return (
                                      <label key={st.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-blue-50/50">
                                        <input
                                          type="checkbox"
                                          checked={!!stChecked}
                                          onChange={() => {
                                            const current = formData.allowed_store_ids || [];
                                            if (stChecked) {
                                              setFormData({ ...formData, allowed_store_ids: current.filter(id => id !== st.id) });
                                            } else {
                                              setFormData({ ...formData, allowed_store_ids: [...current, st.id] });
                                            }
                                          }}
                                          className="w-3.5 h-3.5 rounded accent-blue-600"
                                        />
                                        {isDepo ? <Package className="w-3.5 h-3.5 text-slate-400" /> : <Store className="w-3.5 h-3.5 text-slate-400" />}
                                        <span className="text-[11px] font-medium text-slate-600">{st.name || st.code || st.id}</span>
                                      </label>
                                    );
                                  })}
                                  {stores.length === 0 && <span className="text-[11px] text-slate-400">Mağaza/depo yok</span>}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {(!firmsWithPeriods.firms || firmsWithPeriods.firms.length === 0) && (
                      <p className="text-xs text-slate-400 py-2">Firma listesi yükleniyor...</p>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="flex-1 px-6 py-3.5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 transition-all active:scale-[0.98]"
              >
                {tm('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!formData.username || !formData.full_name || !formData.role_id || (!editingUser && !formData.password)}
                className="flex-1 px-6 py-3.5 rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {editingUser ? tm('update') : tm('saveUser')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
