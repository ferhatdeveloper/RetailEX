// Role & Permission Management Module

import { useState } from 'react';
import { Plus, Edit2, Trash2, Shield, Users, Lock, CheckCircle, XCircle, Eye } from 'lucide-react';
import { DataTable, type Column } from '../shared/DataTable';

interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'pos' | 'management' | 'reports' | 'settings';
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  color: string;
}

interface RoleManagementProps {
  roles: Role[];
  setRoles: (roles: Role[]) => void;
}

const ALL_PERMISSIONS: Permission[] = [
  // POS Permissions
  { id: 'pos.view', name: 'POS Görüntüle', description: 'Satış ekranını görüntüleyebilir', category: 'pos' },
  { id: 'pos.sell', name: 'Satış Yap', description: 'Ürün satışı yapabilir', category: 'pos' },
  { id: 'pos.discount', name: 'İndirim Uygula', description: 'Ürünlere indirim uygulayabilir', category: 'pos' },
  { id: 'pos.return', name: 'İade İşlemi', description: 'Ürün iadesi yapabilir', category: 'pos' },
  { id: 'pos.cancel', name: 'Satış İptal', description: 'Satışı iptal edebilir', category: 'pos' },

  // Management Permissions
  { id: 'management.products', name: 'Ürün Yönetimi', description: 'Ürünleri yönetebilir', category: 'management' },
  { id: 'management.customers', name: 'Müşteri Yönetimi', description: 'Müşterileri yönetebilir', category: 'management' },
  { id: 'management.campaigns', name: 'Kampanya Yönetimi', description: 'Kampanyaları yönetebilir', category: 'management' },
  { id: 'management.stores', name: 'Mağaza Yönetimi', description: 'Mağazaları yönetebilir', category: 'management' },
  { id: 'management.users', name: 'Kullanıcı Yönetimi', description: 'Kullanıcıları yönetebilir', category: 'management' },

  // Reports Permissions
  { id: 'reports.sales', name: 'Satış Raporları', description: 'Satış raporlarını görüntüleyebilir', category: 'reports' },
  { id: 'reports.inventory', name: 'Stok Raporları', description: 'Stok raporlarını görüntüleyebilir', category: 'reports' },
  { id: 'reports.financial', name: 'Mali Raporlar', description: 'Mali raporları görüntüleyebilir', category: 'reports' },
  { id: 'reports.export', name: 'Rapor Export', description: 'Raporları dışa aktarabilir', category: 'reports' },

  // Settings Permissions
  { id: 'settings.system', name: 'Sistem Ayarları', description: 'Sistem ayarlarını değiştirebilir', category: 'settings' },
  { id: 'settings.roles', name: 'Rol Yönetimi', description: 'Rolleri yönetebilir', category: 'settings' },
  { id: 'settings.integrations', name: 'Entegrasyonlar', description: 'Entegrasyonları yönetebilir', category: 'settings' }
];

export function RoleManagement({ roles, setRoles }: RoleManagementProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState<Role | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: [] as string[],
    color: '#3B82F6'
  });

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      color: role.color
    });
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Bu rolü silmek istediğinizden emin misiniz?')) {
      setRoles(roles.filter(r => r.id !== id));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingRole) {
      // Update existing role
      setRoles(roles.map(r =>
        r.id === editingRole.id
          ? { ...r, ...formData }
          : r
      ));
    } else {
      // Create new role
      const newRole: Role = {
        id: `ROLE${Date.now()}`,
        ...formData,
        userCount: 0
      };
      setRoles([...roles, newRole]);
    }

    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      permissions: [],
      color: '#3B82F6'
    });
    setEditingRole(null);
    setShowModal(false);
  };

  const togglePermission = (permissionId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(id => id !== permissionId)
        : [...prev.permissions, permissionId]
    }));
  };

  const selectAllInCategory = (category: Permission['category']) => {
    const categoryPermissions = ALL_PERMISSIONS
      .filter(p => p.category === category)
      .map(p => p.id);

    const allSelected = categoryPermissions.every(id => formData.permissions.includes(id));

    if (allSelected) {
      setFormData(prev => ({
        ...prev,
        permissions: prev.permissions.filter(id => !categoryPermissions.includes(id))
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        permissions: [...new Set([...prev.permissions, ...categoryPermissions])]
      }));
    }
  };

  // DataTable columns
  const columns: Column<Role>[] = [
    {
      id: 'name',
      header: 'Rol Adı',
      accessor: 'name',
      minWidth: 200,
      sortable: true,
      filterable: true,
      cell: (value: any, row: Role) => (
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${row.color}20` }}
          >
            <Shield className="h-5 w-5" style={{ color: row.color }} />
          </div>
          <div>
            <p className="font-medium">{value}</p>
            <p className="text-xs text-gray-500">{row.description}</p>
          </div>
        </div>
      )
    },
    {
      id: 'permissions',
      header: 'Yetki Sayısı',
      accessor: (row: Role) => row.permissions.length,
      width: 150,
      sortable: true,
      cell: (value: any, row: Role) => (
        <button
          onClick={() => setShowPermissionsModal(row)}
          className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <Lock className="h-4 w-4" />
          <span>{value} Yetki</span>
        </button>
      )
    },
    {
      id: 'users',
      header: 'Kullanıcı Sayısı',
      accessor: 'userCount',
      width: 150,
      sortable: true,
      cell: (value: any) => (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-400" />
          <span className="text-sm">{value} Kullanıcı</span>
        </div>
      )
    },
    {
      id: 'actions',
      header: 'İşlemler',
      accessor: (row: Role) => row,
      width: 150,
      cell: (_: any, row: Role) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPermissionsModal(row)}
            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
            title="Yetkileri Görüntüle"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleEdit(row)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Düzenle"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Sil"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  const groupedPermissions = ALL_PERMISSIONS.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  const categoryLabels = {
    pos: { name: 'POS Yetkileri', icon: '🛒', color: 'blue' },
    management: { name: 'Yönetim Yetkileri', icon: '⚙️', color: 'green' },
    reports: { name: 'Rapor Yetkileri', icon: '📊', color: 'orange' },
    settings: { name: 'Ayar Yetkileri', icon: '🔧', color: 'purple' }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl flex items-center gap-3">
              <Shield className="h-7 w-7 text-blue-600" />
              Rol & Yetki Yönetimi
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Kullanıcı rollerini ve yetkilerini tanımlayın
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Yeni Rol
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <DataTable
          data={roles}
          columns={columns}
          searchable={true}
          exportable={true}
          columnResizable={true}
          stickyHeader={true}
          maxHeight="calc(100vh - 200px)"
          emptyMessage="Henüz rol tanımlanmamış"
        />
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
              <h3 className="text-xl text-white">
                {editingRole ? 'Rol Düzenle' : 'Yeni Rol Oluştur'}
              </h3>
              <button
                onClick={resetForm}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-auto">
              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-600" />
                    Temel Bilgiler
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Rol Adı *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Örn: Mağaza Müdürü"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Renk
                      </label>
                      <input
                        type="color"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="w-full h-10 px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Açıklama
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Rol detayları..."
                      rows={2}
                    />
                  </div>
                </div>

                {/* Permissions */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <Lock className="h-5 w-5 text-green-600" />
                      Yetkiler ({formData.permissions.length} seçili)
                    </h4>
                  </div>

                  <div className="space-y-4">
                    {Object.entries(groupedPermissions).map(([category, permissions]) => {
                      const categoryInfo = categoryLabels[category as keyof typeof categoryLabels];
                      const allSelected = permissions.every(p => formData.permissions.includes(p.id));

                      return (
                        <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                          {/* Category Header */}
                          <div
                            className={`px-4 py-3 bg-${categoryInfo.color}-50 border-b flex items-center justify-between`}
                            style={{ backgroundColor: `var(--${categoryInfo.color}-50, #f0f9ff)` }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{categoryInfo.icon}</span>
                              <span className="font-medium text-gray-900">{categoryInfo.name}</span>
                              <span className="text-xs text-gray-500">
                                ({permissions.filter(p => formData.permissions.includes(p.id)).length}/{permissions.length})
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => selectAllInCategory(category as Permission['category'])}
                              className={`text-sm px-3 py-1 rounded-lg transition-colors ${allSelected
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-white border border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                              {allSelected ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                            </button>
                          </div>

                          {/* Permissions List */}
                          <div className="p-2">
                            {permissions.map(permission => (
                              <label
                                key={permission.id}
                                className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={formData.permissions.includes(permission.id)}
                                  onChange={() => togglePermission(permission.id)}
                                  className="w-4 h-4 text-blue-600"
                                />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900">{permission.name}</p>
                                  <p className="text-xs text-gray-500">{permission.description}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="h-5 w-5" />
                  {editingRole ? 'Güncelle' : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Permissions Modal */}
      {showPermissionsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div
              className="px-6 py-4 border-b flex items-center justify-between"
              style={{ backgroundColor: `${showPermissionsModal.color}20` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${showPermissionsModal.color}40` }}
                >
                  <Shield className="h-6 w-6" style={{ color: showPermissionsModal.color }} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{showPermissionsModal.name}</h3>
                  <p className="text-sm text-gray-600">{showPermissionsModal.description}</p>
                </div>
              </div>
              <button
                onClick={() => setShowPermissionsModal(null)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-white/50 transition-colors"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                {Object.entries(groupedPermissions).map(([category, permissions]) => {
                  const categoryInfo = categoryLabels[category as keyof typeof categoryLabels];
                  const rolePermissions = permissions.filter(p =>
                    showPermissionsModal.permissions.includes(p.id)
                  );

                  if (rolePermissions.length === 0) return null;

                  return (
                    <div key={category}>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        <span>{categoryInfo.icon}</span>
                        {categoryInfo.name}
                      </h4>
                      <div className="space-y-2">
                        {rolePermissions.map(permission => (
                          <div
                            key={permission.id}
                            className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg"
                          >
                            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{permission.name}</p>
                              <p className="text-xs text-gray-600">{permission.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

