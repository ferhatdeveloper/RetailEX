import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase/client';
import { Shield, Users, Key, Lock, Unlock, Check, X, Search, Filter } from 'lucide-react';

interface Permission {
  id: number;
  code: string;
  name: string;
  description: string;
  module: string;
  category: string;
  is_system: boolean;
}

interface Role {
  id: number;
  code: string;
  name: string;
  description: string;
  level: number;
  is_system: boolean;
  is_active: boolean;
}

interface RolePermission {
  role_id: number;
  role_code: string;
  role_name: string;
  permission_id: number;
  permission_code: string;
  permission_name: string;
  module: string;
}

interface UserRole {
  id: number;
  user_id: number;
  role_id: number;
  role_name: string;
  role_level: number;
  is_active: boolean;
}

export function AuthorizationManager() {
  const [activeTab, setActiveTab] = useState<'permissions' | 'roles' | 'users'>('permissions');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPermissions();
    loadRoles();
    loadRolePermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('module', { ascending: true })
        .order('category', { ascending: true });

      if (error) throw error;
      setPermissions(data || []);
    } catch (err: any) {
      console.error('Error loading permissions:', err.message);
    }
  };

  const loadRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('level', { ascending: false });

      if (error) throw error;
      setRoles(data || []);
    } catch (err: any) {
      console.error('Error loading roles:', err.message);
    }
  };

  const loadRolePermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('v_role_permissions_detail')
        .select('*');

      if (error) throw error;
      setRolePermissions(data || []);
    } catch (err: any) {
      console.error('Error loading role permissions:', err.message);
    }
  };

  const toggleRolePermission = async (roleId: number, permissionId: number, currentlyHas: boolean) => {
    try {
      if (currentlyHas) {
        // Remove permission
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId)
          .eq('permission_id', permissionId);

        if (error) throw error;
      } else {
        // Add permission
        const { error } = await supabase
          .from('role_permissions')
          .insert({ role_id: roleId, permission_id: permissionId });

        if (error) throw error;
      }

      await loadRolePermissions();
    } catch (err: any) {
      console.error('Error toggling permission:', err.message);
      alert('Hata: ' + err.message);
    }
  };

  const hasPermission = (roleId: number, permissionId: number): boolean => {
    return rolePermissions.some(
      rp => rp.role_id === roleId && rp.permission_id === permissionId
    );
  };

  const modules = ['ALL', ...Array.from(new Set(permissions.map(p => p.module)))];

  const filteredPermissions = permissions.filter(p => {
    const matchesModule = selectedModule === 'ALL' || p.module === selectedModule;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesModule && matchesSearch;
  });

  const getRolePermissionCount = (roleId: number): number => {
    return rolePermissions.filter(rp => rp.role_id === roleId).length;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-indigo-600" />
          <h1 className="text-3xl font-bold text-gray-900">Yetkilendirme Yönetimi</h1>
        </div>
        <p className="text-gray-600">Logo ERP tarzı detaylı yetkilendirme sistemi</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === 'permissions'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                İzinler
              </div>
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === 'roles'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Roller
              </div>
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === 'users'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Kullanıcılar
              </div>
            </button>
          </nav>
        </div>

        {/* Permissions Tab */}
        {activeTab === 'permissions' && (
          <div className="p-6">
            {/* Filters */}
            <div className="flex gap-4 mb-6">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="İzin ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                {modules.map(module => (
                  <option key={module} value={module}>{module}</option>
                ))}
              </select>
            </div>

            {/* Permissions Grid */}
            <div className="grid gap-4">
              {filteredPermissions.map(permission => (
                <div key={permission.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">
                          {permission.module}
                        </span>
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {permission.category}
                        </span>
                        {permission.is_system && (
                          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-700">
                            SYSTEM
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {permission.name}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">{permission.description}</p>
                      <p className="text-xs text-gray-500 font-mono">{permission.code}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredPermissions.length === 0 && (
              <div className="text-center py-12">
                <Key className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">İzin bulunamadı</p>
              </div>
            )}
          </div>
        )}

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <div className="p-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Roles List */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Roller</h3>
                <div className="space-y-3">
                  {roles.map(role => (
                    <button
                      key={role.id}
                      onClick={() => setSelectedRole(role.id)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedRole === role.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-900">{role.name}</span>
                        <span className="px-2 py-1 text-xs font-bold rounded bg-indigo-100 text-indigo-800">
                          Level {role.level}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{role.description}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {getRolePermissionCount(role.id)} izin
                        </span>
                        {role.is_system && (
                          <span className="px-2 py-0.5 text-xs rounded bg-gray-200 text-gray-700">
                            SYSTEM
                          </span>
                        )}
                        {role.is_active ? (
                          <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">
                            Aktif
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">
                            Pasif
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Role Permissions */}
              <div>
                {selectedRole ? (
                  <>
                    <h3 className="text-lg font-semibold mb-4">
                      {roles.find(r => r.id === selectedRole)?.name} - İzinler
                    </h3>
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {permissions.map(permission => {
                        const hasIt = hasPermission(selectedRole, permission.id);
                        return (
                          <label
                            key={permission.id}
                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={hasIt}
                              onChange={() => toggleRolePermission(selectedRole, permission.id, hasIt)}
                              className="w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-gray-900">
                                  {permission.name}
                                </span>
                                <span className="text-xs text-gray-500">({permission.module})</span>
                              </div>
                              <p className="text-xs text-gray-600">{permission.description}</p>
                            </div>
                            {hasIt ? (
                              <Check className="w-5 h-5 text-green-600" />
                            ) : (
                              <X className="w-5 h-5 text-gray-300" />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Bir rol seçin</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="p-6">
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Kullanıcı Yetkilendirme
              </h3>
              <p className="text-gray-600 mb-4">
                Kullanıcılara rol atama ve özel izin verme
              </p>
              <button className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Kullanıcı Seç
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Key className="w-8 h-8 text-indigo-600" />
            <span className="text-2xl font-bold text-gray-900">{permissions.length}</span>
          </div>
          <p className="text-sm text-gray-600">Toplam İzin</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">{roles.length}</span>
          </div>
          <p className="text-sm text-gray-600">Toplam Rol</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Lock className="w-8 h-8 text-green-600" />
            <span className="text-2xl font-bold text-gray-900">
              {rolePermissions.length}
            </span>
          </div>
          <p className="text-sm text-gray-600">Atanmış İzin</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-8 h-8 text-purple-600" />
            <span className="text-2xl font-bold text-gray-900">0</span>
          </div>
          <p className="text-sm text-gray-600">Aktif Kullanıcı</p>
        </div>
      </div>
    </div>
  );
}

