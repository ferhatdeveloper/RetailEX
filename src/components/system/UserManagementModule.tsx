import { useState, useEffect } from 'react';
import { Users, Plus, Edit, Trash2, Search, UserCheck, UserX, Shield, Store, Mail, Phone, Lock } from 'lucide-react';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';

import { userAPI, roleAPI, User, Role } from '../../services/api';

export function UserManagementModule() {
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
    password: ''
  });

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
        password: ''
      });
    } else {
      setFormData({
        username: '',
        full_name: '',
        email: '',
        phone: '',
        role_id: roles.length > 0 ? roles[0].id : '',
        store_id: '',
        password: ''
      });
    }
  }, [editingUser, showUserModal, roles]);

  const handleSave = async () => {
    try {
      // Find role name for legacy support
      const selectedRole = roles.find(r => r.id === formData.role_id);
      const dataToSave = {
        ...formData,
        role: selectedRole?.name || 'cashier'
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
    } catch (error) {
      console.error('Error saving user:', error);
      alert('Kullanıcı kaydedilirken bir hata oluştu.');
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
      console.error('Error deleting user:', error);
    }
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      await userAPI.update(userId, { is_active: !currentStatus });
      await loadData();
    } catch (error) {
      console.error('Error toggling user status:', error);
    }
  };

  const columnHelper = createColumnHelper<User>();

  const columns: ColumnDef<User, any>[] = [
    columnHelper.accessor('username', {
      header: 'KULLANICI ADI',
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
      header: 'TAM AD',
      cell: (info: any) => info.getValue(),
      size: 200
    }),
    columnHelper.accessor('email', {
      header: 'E-POSTA',
      cell: (info: any) => info.getValue() || '-',
      size: 200
    }),
    columnHelper.accessor('role_name', {
      header: 'ROL',
      cell: (info: any) => {
        const roleName = info.getValue() || 'Kullanıcı';
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
      header: 'TELEFON',
      cell: (info: any) => info.getValue() || '-',
      size: 150
    }),
    columnHelper.accessor('is_active', {
      header: 'DURUM',
      cell: (info: any) => {
        const isActive = info.getValue();
        return (
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
            {isActive ? 'Aktif' : 'Pasif'}
          </span>
        );
      },
      size: 100
    }),
    columnHelper.accessor('last_login_at', {
      header: 'SON GİRİŞ',
      cell: (info: any) => {
        const date = info.getValue();
        return date ? new Date(date).toLocaleDateString('tr-TR') : '-';
      },
      size: 120
    }),
    columnHelper.display({
      id: 'actions',
      header: 'İŞLEMLER',
      cell: ({ row }: { row: { original: User } }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEditUser(row.original)}
            className="p-2 hover:bg-blue-50 rounded transition-colors"
            title="Düzenle"
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={() => handleToggleActive(row.original.id, row.original.is_active)}
            className="p-2 hover:bg-orange-50 rounded transition-colors"
            title={row.original.is_active ? 'Pasif Yap' : 'Aktif Yap'}
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
            title="Sil"
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
              <h1 className="text-2xl font-bold text-gray-900">Kullanıcı Yönetimi</h1>
              <p className="text-sm text-gray-600">Sistem kullanıcılarını yönetin</p>
            </div>
          </div>
          <button
            onClick={handleAddUser}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Yeni Kullanıcı
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Kullanıcı ara (isim, email, rol)..."
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
              <p className="text-sm text-blue-600 mb-1">Toplam Kullanıcı</p>
              <p className="text-3xl font-bold text-blue-900">{users.length}</p>
            </div>
            <Users className="w-10 h-10 text-blue-500 opacity-50" />
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 shadow-sm border border-green-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 mb-1">Aktif</p>
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
              <p className="text-sm text-red-600 mb-1">Pasif</p>
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
              <p className="text-sm text-purple-600 mb-1">Adminler</p>
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
              <p className="text-gray-600">Kullanıcılar yükleniyor...</p>
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

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl transform transition-all">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingUser ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı Oluştur'}
              </h2>
              <button
                onClick={() => setShowUserModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                title="Kapat"
              >
                <UserX className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Kullanıcı Adı *
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="kullanici123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Tam Ad *
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="Ahmet Yılmaz"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    E-posta
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="ahmet@example.com"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Rol *
                  </label>
                  <select
                    value={formData.role_id}
                    onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all appearance-none bg-no-repeat bg-[right_1rem_center]"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundSize: '1.5em' }}
                  >
                    <option value="">Rol Seçin</option>
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>{role.name.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Telefon
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="+964 750 123 4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Mağaza
                  </label>
                  <select
                    value={formData.store_id}
                    onChange={(e) => setFormData({ ...formData, store_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all appearance-none bg-no-repeat bg-[right_1rem_center]"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundSize: '1.5em' }}
                  >
                    <option value="">Mağaza Seçin</option>
                    <option value="1">Baghdad Merkez</option>
                    <option value="2">Erbil Şubesi</option>
                    <option value="3">Basra Şubesi</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {editingUser ? 'Yeni Şifre (Boş bırakılırsa değişmez)' : 'Şifre *'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="En az 8 karakter"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowUserModal(false)}
                className="flex-1 px-6 py-3 border-2 border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-all active:scale-95"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.username || !formData.full_name || !formData.role_id || (!editingUser && !formData.password)}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 transition-all active:scale-95"
              >
                {editingUser ? 'Güncelle' : 'Kullanıcıyı Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
