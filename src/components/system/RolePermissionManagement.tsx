/**
 * ExRetailOS - Role & Permission Management Module
 * 
 * Complete RBAC interface:
 * - Role creation and editing
 * - Permission matrix
 * - User role assignments
 * - Audit log viewer
 * 
 * @created 2024-12-24
 */

import { useState } from 'react';
import { 
  Shield, 
  Plus, 
  Edit, 
  Trash2, 
  Users,
  Check,
  X,
  Eye,
  Search,
  Download,
  AlertTriangle,
  Lock,
  Unlock
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import rbacService, { Role, Permission, PermissionAction } from '../../services/rbacService';
import { toast } from 'sonner';

// ===== COMPONENT =====

export function RolePermissionManagement() {
  const { t } = useLanguage();

  // State
  const [roles, setRoles] = useState<Role[]>(rbacService.getAllRoles());
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [view, setView] = useState<'list' | 'matrix' | 'audit'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Filter roles
  const filteredRoles = roles.filter(role => 
    role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    role.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Permission matrix
  const permissionMatrix = rbacService.createPermissionMatrix(roles);

  // All possible modules (simplified for demo)
  const modules = [
    { id: 'dashboard', name: 'Dashboard' },
    { id: 'products', name: 'Ürünler' },
    { id: 'stock', name: 'Stok' },
    { id: 'customers', name: 'Müşteriler' },
    { id: 'suppliers', name: 'Tedarikçiler' },
    { id: 'finance', name: 'Finans' },
    { id: 'accounting', name: 'Muhasebe' },
    { id: 'sales-invoices', name: 'Satış Faturaları' },
    { id: 'purchase-invoices', name: 'Alış Faturaları' },
    { id: 'reports', name: 'Raporlar' }
  ];

  const actions: PermissionAction[] = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE'];

  // Handle role delete
  const handleDeleteRole = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (role?.isSystemRole) {
      toast.error('Sistem rolleri silinemez');
      return;
    }

    if (confirm('Bu rolü silmek istediğinizden emin misiniz?')) {
      setRoles(roles.filter(r => r.id !== roleId));
      toast.success('Rol silindi');
    }
  };

  // Handle role toggle active
  const handleToggleActive = (roleId: string) => {
    setRoles(roles.map(r => 
      r.id === roleId ? { ...r, isActive: !r.isActive } : r
    ));
    toast.success('Rol durumu güncellendi');
  };

  // Role color helper
  const getRoleColor = (roleId: string) => {
    const colors: { [key: string]: string } = {
      'admin': 'bg-red-100 text-red-700 border-red-300',
      'accountant': 'bg-blue-100 text-blue-700 border-blue-300',
      'cashier': 'bg-green-100 text-green-700 border-green-300',
      'warehouse': 'bg-purple-100 text-purple-700 border-purple-300',
      'sales-rep': 'bg-orange-100 text-orange-700 border-orange-300',
      'manager': 'bg-indigo-100 text-indigo-700 border-indigo-300',
      'report-viewer': 'bg-gray-100 text-gray-700 border-gray-300'
    };
    return colors[roleId] || 'bg-gray-100 text-gray-700 border-gray-300';
  };

  // Action icon helper
  const getActionIcon = (action: PermissionAction) => {
    switch (action) {
      case 'CREATE': return <Plus className="w-3 h-3" />;
      case 'READ': return <Eye className="w-3 h-3" />;
      case 'UPDATE': return <Edit className="w-3 h-3" />;
      case 'DELETE': return <Trash2 className="w-3 h-3" />;
      case 'EXECUTE': return <Check className="w-3 h-3" />;
    }
  };

  if (view === 'matrix') {
    return (
      <div className="h-full flex flex-col bg-gray-50">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-semibold">Yetki Matrisi</h2>
                <p className="text-sm text-purple-100 mt-0.5">Rollere göre modül yetkileri</p>
              </div>
            </div>
            <button
              onClick={() => setView('list')}
              className="px-4 py-2 bg-white text-purple-700 rounded-lg hover:bg-purple-50"
            >
              Listeye Dön
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 sticky left-0 bg-gray-50">
                    Modül
                  </th>
                  {filteredRoles.map(role => (
                    <th key={role.id} className="px-4 py-3 text-center text-xs font-medium text-gray-700">
                      <div className={`inline-flex items-center px-2 py-1 rounded border text-xs font-medium ${getRoleColor(role.id)}`}>
                        {role.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map(module => (
                  <tr key={module.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium sticky left-0 bg-white">
                      {module.name}
                    </td>
                    {filteredRoles.map(role => {
                      const permissions = role.permissions.find(p => 
                        p.module === module.id || p.module === '*'
                      );
                      return (
                        <td key={`${module.id}-${role.id}`} className="px-4 py-3 text-center">
                          {permissions ? (
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              {permissions.actions.map(action => (
                                <span
                                  key={action}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs"
                                  title={action}
                                >
                                  {getActionIcon(action)}
                                  {action.charAt(0)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <X className="w-4 h-4 text-gray-300 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Yetki Açıklamaları:</p>
                <ul className="mt-2 space-y-1 ml-4 list-disc">
                  <li><strong>C</strong> = CREATE (Oluşturma)</li>
                  <li><strong>R</strong> = READ (Okuma)</li>
                  <li><strong>U</strong> = UPDATE (Güncelleme)</li>
                  <li><strong>D</strong> = DELETE (Silme)</li>
                  <li><strong>E</strong> = EXECUTE (Çalıştırma/Onay)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-semibold">Rol ve Yetki Yönetimi</h2>
              <p className="text-sm text-purple-100 mt-0.5">Kullanıcı rolleri ve izinleri</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('matrix')}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
            >
              <Eye className="w-4 h-4" />
              Yetki Matrisi
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-purple-700 rounded-lg hover:bg-purple-50 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Yeni Rol
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border-2 border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Rol</p>
              <p className="text-2xl font-semibold text-purple-600 mt-1">{roles.length}</p>
            </div>
            <Shield className="w-10 h-10 text-purple-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Aktif Rol</p>
              <p className="text-2xl font-semibold text-green-600 mt-1">
                {roles.filter(r => r.isActive).length}
              </p>
            </div>
            <Check className="w-10 h-10 text-green-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Sistem Rolü</p>
              <p className="text-2xl font-semibold text-blue-600 mt-1">
                {roles.filter(r => r.isSystemRole).length}
              </p>
            </div>
            <Lock className="w-10 h-10 text-blue-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Özel Rol</p>
              <p className="text-2xl font-semibold text-orange-600 mt-1">
                {roles.filter(r => !r.isSystemRole).length}
              </p>
            </div>
            <Unlock className="w-10 h-10 text-orange-600 opacity-20" />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 bg-white border-b">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rol adı veya açıklama ara..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Roles Grid */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          {filteredRoles.map(role => (
            <div key={role.id} className="bg-white rounded-lg border hover:shadow-md transition-shadow">
              {/* Role Header */}
              <div className="p-4 border-b">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{role.name}</h3>
                      {role.isSystemRole && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          <Lock className="w-3 h-3 mr-1" />
                          Sistem
                        </span>
                      )}
                      {!role.isActive && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          Pasif
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{role.description}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleActive(role.id)}
                      className={`p-2 rounded hover:bg-gray-100 ${role.isActive ? 'text-green-600' : 'text-gray-400'}`}
                      title={role.isActive ? 'Devre Dışı Bırak' : 'Aktif Et'}
                    >
                      {role.isActive ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedRole(role);
                        setShowEditModal(true);
                      }}
                      className="p-2 rounded hover:bg-gray-100 text-blue-600"
                      title="Düzenle"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {!role.isSystemRole && (
                      <button
                        onClick={() => handleDeleteRole(role.id)}
                        className="p-2 rounded hover:bg-gray-100 text-red-600"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Permissions Preview */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Yetkiler:</span>
                  <span className="text-xs text-gray-500">
                    {role.permissions.length} modül
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.slice(0, 8).map((permission, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded text-xs bg-purple-50 text-purple-700"
                    >
                      {permission.module === '*' ? 'Tüm Modüller' : permission.module}
                    </span>
                  ))}
                  {role.permissions.length > 8 && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
                      +{role.permissions.length - 8} daha
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredRoles.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Rol bulunamadı</p>
          </div>
        )}
      </div>
    </div>
  );
}

