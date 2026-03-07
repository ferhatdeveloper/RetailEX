import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Shield, X, Save, ArrowLeft, Search, CheckCircle, Info, Lock } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { cn } from '@/components/ui/utils';

interface Role {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  permissions: string[];
  is_system: boolean;
}

interface RoleManagementProps {
  onBack?: () => void;
}

export function RoleManagement({ onBack }: RoleManagementProps) {
  const isTauri = !!(window as any).__TAURI_INTERNALS__;
  const { tm } = useLanguage();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const data = await invoke<Role[]>('get_roles');
        setRoles(data);
      } else {
        // Mock roles for Web
        setRoles([
          { id: '1', name: 'ADMIN', display_name: 'Yönetici', permissions: ['*'], is_system: true, description: 'Sistem yetkilerinin tamamına sahip üst düzey yönetici rolü.' },
          { id: '2', name: 'CASHIER', display_name: 'Kasiyer', permissions: ['sales'], is_system: true, description: 'Satış ve tahsilat işlemlerini gerçekleştiren personel rolü.' },
          { id: '3', name: 'WAITER', display_name: 'Garson', permissions: ['tables', 'orders'], is_system: false, description: 'Masa yönetimi ve sipariş alma yetkisine sahip personel.' }
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const data = await invoke<string[]>('get_permissions');
        setPermissions(data);
      } else {
        setPermissions(['sales', 'inventory', 'accounting', 'reports', 'tables', 'orders', 'users', 'settings', 'kitchen', 'delivery']);
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
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
      } else {
        console.log('Web limited: save simulation');
      }
      setShowModal(false);
      resetForm();
      fetchRoles();
    } catch (error) {
      console.error('Operation failed:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(tm('confirmDelete'))) return;
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_role', { roleId: id });
        fetchRoles();
      } else {
        alert(tm('deleteDisabledWeb'));
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const openEditModal = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.display_name,
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

  const filteredRoles = roles.filter(role =>
    role.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    role.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) return <div className="h-full flex items-center justify-center bg-[#f8f9fa] font-black uppercase tracking-widest text-slate-400">{tm('loading')}...</div>;

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa] animate-in fade-in duration-500 overflow-hidden">
      {/* Header */}
      <div className="border-b px-8 py-6 flex items-center justify-between z-20 shrink-0 gap-8 shadow-2xl"
        style={{ backgroundColor: '#2563eb', borderColor: 'rgba(96,165,250,0.4)' }}>
        <div className="flex items-center gap-6">
          <button onClick={onBack}
            className="flex items-center gap-2.5 px-6 py-3 bg-white/15 hover:bg-white/25 text-white rounded-2xl transition-all active:scale-95 border border-white/20 font-black uppercase text-[12px] group shrink-0 shadow-inner">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span>Geri</span>
          </button>
          <div className="flex items-center gap-5 ml-4">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 shadow-xl">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black italic tracking-tighter text-white uppercase leading-none">{tm('roleManagementTitle')}</h2>
              <p className="text-[11px] text-white/60 font-bold uppercase tracking-widest mt-1.5">{tm('configureRolesDesc')}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
            <input
              type="text"
              placeholder="Rol ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/20 border border-white/10 text-white placeholder-white/40 rounded-2xl pl-11 pr-6 py-2.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-white/20 focus:bg-black/30 transition-all font-bold"
            />
          </div>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-3 px-8 py-3.5 bg-white text-blue-600 rounded-[20px] hover:bg-white/90 transition-all active:scale-95 font-black uppercase text-[13px] shadow-xl shadow-blue-900/20"
          >
            <Plus size={20} strokeWidth={3} />
            {tm('addNewRole')}
          </button>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 overflow-auto p-8 scrollbar-hide">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 max-w-[2400px] mx-auto">
          {filteredRoles.map(role => (
            <div key={role.id} className={cn(
              "bg-white rounded-[2.5rem] overflow-hidden border-2 border-slate-100 shadow-sm hover:border-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 flex flex-col group",
              role.is_system && "border-slate-100/50"
            )}>
              {/* Card Header Style Icon */}
              <div className="px-8 pt-8 pb-4 flex justify-between items-start">
                <div className={cn(
                  "w-14 h-14 rounded-[1.25rem] flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 duration-300",
                  role.is_system ? "bg-purple-50 text-purple-600 shadow-purple-500/10" : "bg-blue-50 text-blue-600 shadow-blue-500/10"
                )}>
                  <Shield className="w-7 h-7" />
                </div>
                <div className="flex gap-2">
                  {!role.is_system && (
                    <>
                      <button
                        onClick={() => openEditModal(role)}
                        className="p-3 text-slate-400 hover:text-blue-600 rounded-2xl hover:bg-blue-50 transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(role.id)}
                        className="p-3 text-slate-400 hover:text-red-600 rounded-2xl hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                  {role.is_system && (
                    <div className="p-3 text-slate-300">
                      <Lock size={18} />
                    </div>
                  )}
                </div>
              </div>

              <div className="px-8 pb-4">
                <h3 className="text-xl font-black tracking-tight text-slate-800 uppercase group-hover:text-blue-600 transition-colors">{role.display_name}</h3>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1.5">{role.name}</p>
              </div>

              <div className="px-8 pb-8 flex-1 flex flex-col">
                <p className="text-sm text-slate-500 leading-relaxed h-12 line-clamp-2 italic">
                  {role.description || tm('noDescription')}
                </p>

                <div className="mt-8 flex flex-wrap gap-2">
                  <span className={cn(
                    "px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest border",
                    role.is_system ? "bg-purple-500/10 text-purple-600 border-purple-200" : "bg-blue-500/10 text-blue-600 border-blue-200"
                  )}>
                    {role.is_system ? tm('systemRole') : tm('customRole')}
                  </span>
                  <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 border border-emerald-200 rounded-xl font-black text-[10px] uppercase tracking-widest">
                    {role.permissions.length} {tm('permissionsLabel')}
                  </span>
                </div>
              </div>

              {/* Card Action Area */}
              <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 mt-auto flex items-center justify-between text-[11px] font-black text-slate-400 uppercase tracking-tighter">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  SON GÜNCELLEME: AKTİF
                </div>
                <button onClick={() => openEditModal(role)} className="text-blue-600 hover:underline">DETAYLAR</button>
              </div>
            </div>
          ))}

          {filteredRoles.length === 0 && (
            <div className="col-span-full h-[50vh] flex flex-col items-center justify-center text-slate-400">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-xl mb-6 border border-slate-100">
                <Search className="w-12 h-12 text-slate-200" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-[0.2em] italic text-slate-300">Rol Bulunamadı</h2>
              <p className="text-slate-400 font-bold mt-2">Farklı bir arama terimi deneyebilirsiniz.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit/Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-white/20 animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="px-8 py-8 flex justify-between items-center bg-blue-600 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">
                  {editingRole ? tm('editRole') : tm('createNewRole')}
                </h3>
                <p className="text-white/50 text-[11px] font-bold uppercase tracking-[0.2em] mt-2">ROL DETAYLARINI DÜZENLE</p>
              </div>
              <button onClick={() => setShowModal(false)} className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center justify-center transition-all active:scale-95 border border-white/10 relative z-10 shadow-inner">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-hide">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Info className="w-3.5 h-3.5" />
                  {tm('roleName')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  disabled={!!editingRole}
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none disabled:bg-slate-100 text-slate-800 font-bold transition-all"
                  placeholder={tm('roleNamePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Edit2 className="w-3.5 h-3.5" />
                  {tm('descriptionLabel')}
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none h-32 resize-none text-slate-800 font-bold transition-all"
                  placeholder={tm('roleDescPlaceholder')}
                />
              </div>

              <div className="space-y-4">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  {tm('permissionsLabel')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-6 bg-slate-50 rounded-[2rem] border-2 border-slate-100 max-h-80 overflow-y-auto scrollbar-hide">
                  {permissions.map(perm => (
                    <label key={perm} className={cn(
                      "flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border-2",
                      formData.permissions.includes(perm)
                        ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20"
                        : "bg-white border-white hover:border-slate-200 text-slate-600"
                    )}>
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(perm)}
                        onChange={() => togglePermission(perm)}
                        className="hidden"
                      />
                      <div className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center transition-colors border-2",
                        formData.permissions.includes(perm) ? "bg-white/20 border-white/20" : "bg-slate-50 border-slate-200"
                      )}>
                        {formData.permissions.includes(perm) && <CheckCircle className="w-4 h-4 text-white" />}
                      </div>
                      <span className="text-[13px] font-black uppercase tracking-tight italic">
                        {perm}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </form>

            {/* Modal Actions */}
            <div className="p-8 border-t border-slate-100 flex justify-end gap-4 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-8 py-4 text-slate-500 hover:bg-slate-100 rounded-[20px] transition-all font-black uppercase text-xs tracking-widest active:scale-95 border-2 border-transparent hover:border-slate-200"
              >
                {tm('cancel')}
              </button>
              <button
                onClick={handleSubmit}
                className="px-12 py-4 bg-blue-600 text-white rounded-[20px] hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-3 font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/25"
              >
                <Save size={20} />
                {tm('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoleManagement;
