import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Plus, Edit2, Trash2, Shield, X, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Role {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  permissions: string[];
  is_system: boolean;
}

export function RoleManagement() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: [] as string[]
  });

  useEffect(() => {
    fetchRoles();
    fetchPermissions();
  }, []);

  const fetchRoles = async () => {
    try {
      const data = await invoke<Role[]>('get_roles');
      setRoles(data);
    } catch (error) {
      console.error('Failed to fetch roles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const data = await invoke<string[]>('get_permissions');
      setPermissions(data);
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await invoke('update_role', {
          roleId: editingRole.id,
          permissions: formData.permissions
        });
      } else {
        await invoke('create_role', {
          name: formData.name.toUpperCase().replace(/\s+/g, '_'),
          displayName: formData.name,
          permissions: formData.permissions,
          description: formData.description
        });
      }
      setShowModal(false);
      resetForm();
      fetchRoles();
    } catch (error) {
      console.error('Operation failed:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete', 'Bu rolü silmek istediğinize emin misiniz?'))) return;
    try {
      await invoke('delete_role', { roleId: id });
      fetchRoles();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Silme işlemi başarısız: ' + error);
    }
  };

  const openEditModal = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.display_name, // Display name for UI
      description: role.description || '',
      permissions: role.permissions
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingRole(null);
    setFormData({ name: '', description: '', permissions: [] });
  };

  const togglePermission = (perm: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }));
  };

  if (isLoading) return <div className="p-8 text-center">Yükleniyor...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Rol Yönetimi</h2>
          <p className="text-gray-600">Sistem rollerini ve izinlerini yapılandırın</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          Yeni Rol Ekle
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles.map(role => (
          <div key={role.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition">
            <div className="flex justify-between items-start mb-3">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Shield size={24} />
              </div>
              <div className="flex gap-1">
                {!role.is_system && (
                  <>
                    <button
                      onClick={() => openEditModal(role)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(role.id)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <h3 className="font-semibold text-lg mb-1">{role.display_name}</h3>
            <p className="text-sm text-gray-500 mb-4 h-10 line-clamp-2">
              {role.description || 'Açıklama yok'}
            </p>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`px-2 py-1 rounded-md ${role.is_system ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                {role.is_system ? 'Sistem Rolü' : 'Özel Rol'}
              </span>
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md">
                {role.permissions.length} İzin
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Edit/Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-bold">
                {editingRole ? 'Rolü Düzenle' : 'Yeni Rol Oluştur'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol Adı</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  disabled={!!editingRole} // Can't rename existing roles easily
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                  placeholder="Örn: Satış Yöneticisi"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                  placeholder="Bu rolün yetkilerini ve kapsamını açıklayın..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">İzinler</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto border p-4 rounded-lg">
                  {permissions.map(perm => (
                    <label key={perm} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(perm)}
                        onChange={() => togglePermission(perm)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        {t(`permissions.${perm}`, perm)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </form>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition"
              >
                İptal
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Save size={18} />
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoleManagement;

