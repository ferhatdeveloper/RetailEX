import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Shield, Lock, Eye, Check, X, CheckCircle } from 'lucide-react';
import { roleAPI, Role as RoleType } from '../../services/api/roles';
import { DataTable, type Column } from '../shared/DataTable';
import { Permission, PermissionAction } from '../../services/rbacService';

// Module structure definition
interface ModuleConfig {
  id: string; // The permission module ID e.g. 'restaurant.pos'
  name: string;
  description: string;
  availableActions: PermissionAction[];
}

interface ModuleGroup {
  id: string;
  name: string;
  icon: string;
  color: string;
  modules: ModuleConfig[];
}

const ACTION_LABELS: Record<PermissionAction, string> = {
  READ: 'Görüntüle',
  CREATE: 'Oluştur',
  UPDATE: 'Güncelle',
  DELETE: 'Sil',
  EXECUTE: 'İşle / Onayla'
};

// We only need MODULE_GROUPS for the View Permissions Modal summary now
const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: 'rest',
    name: 'Restoran ve Ağırlama',
    icon: '🍽️',
    color: 'rose',
    modules: [
      { id: 'restaurant.pos', name: 'Masa Servis (POS)', description: 'Masa yönetimi, sipariş alımı ve adisyon', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
      { id: 'restaurant.delivery', name: 'Paket Servis', description: 'Çağrı merkezi ve kurye takibi', availableActions: ['READ', 'CREATE', 'UPDATE', 'EXECUTE'] },
      { id: 'restaurant.takeaway', name: 'Gel-Al Servis', description: 'Hızlı öde-geç işlemleri', availableActions: ['READ', 'CREATE', 'UPDATE', 'EXECUTE'] },
      { id: 'restaurant.kds', name: 'Mutfak Paneli (KDS)', description: 'Mutfak hazırlık ve bildirim ekranı', availableActions: ['READ', 'UPDATE', 'EXECUTE'] },
      { id: 'restaurant.recipes', name: 'Reçete ve Maliyet', description: 'Ürün içerikleri, reçeteler ve maliyet analizi', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE'] },
      { id: 'restaurant.reservations', name: 'Rezervasyon Yönetimi', description: 'Masa rezervasyonu ve müşteri yerleşimi', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE'] },
      { id: 'restaurant.reports', name: 'Restoran Analizleri', description: 'Restoran bazlı ciro ve verimlilik raporları', availableActions: ['READ', 'EXECUTE'] },
      { id: 'restaurant.settings', name: 'Restoran Parametreleri', description: 'Bölge, masa ve yazıcı tanımları', availableActions: ['READ', 'UPDATE'] },
    ]
  },
  {
    id: 'pos',
    name: 'Market ve Perakende Satış',
    icon: '🛒',
    color: 'emerald',
    modules: [
      { id: 'pos', name: 'Market POS', description: 'Hızlı barkodlu satış arayüzü', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
      { id: 'sales-returns', name: 'İade ve Değişim', description: 'Satış iade fişleri ve müşteri iadeleri', availableActions: ['READ', 'CREATE', 'EXECUTE'] },
      { id: 'campaigns', name: 'Kampanya Yönetimi', description: 'Promosyon, indirim ve kampanya kurguları', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE'] },
      { id: 'loyalty', name: 'Sadakat Sistemi', description: 'Müşteri puanları ve sadakat programları', availableActions: ['READ', 'CREATE', 'UPDATE'] },
      { id: 'gift-cards', name: 'Hediye Çekleri', description: 'Sanal ve fiziksel hediye çeki yönetimi', availableActions: ['READ', 'CREATE', 'UPDATE', 'EXECUTE'] }
    ]
  },
  {
    id: 'wms',
    name: 'Stok ve Depo Yönetimi (WMS)',
    icon: '📦',
    color: 'blue',
    modules: [
      { id: 'products', name: 'Ürün ve Malzeme Kartları', description: 'Malzeme, hizmet ve ticari mal tanımları', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE'] },
      { id: 'stock', name: 'Envanter Hareketleri', description: 'Giriş, çıkış, sarf ve fire fişleri', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
      { id: 'store-transfer', name: 'Depolar Arası Sevk', description: 'Şubeler arası transfer ve onay süreci', availableActions: ['READ', 'CREATE', 'UPDATE', 'EXECUTE'] },
      { id: 'purchase', name: 'Satınalma Yönetimi', description: 'Tedarikçi siparişleri ve alım süreci', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE'] },
      { id: 'inventory-check', name: 'Sayım ve Kontrol', description: 'Periyodik ve anlık envanter sayımları', availableActions: ['READ', 'CREATE', 'UPDATE', 'EXECUTE'] }
    ]
  },
  {
    id: 'finance',
    name: 'Finans ve Muhasebe',
    icon: '💰',
    color: 'orange',
    modules: [
      { id: 'finance.cash', name: 'Kasa Yönetimi', description: 'Nakit giriş/çıkış ve kasa bakiyeleri', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
      { id: 'finance.bank', name: 'Banka İşlemleri', description: 'Banka havale, eft ve pos işlemleri', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
      { id: 'accounting', name: 'Genel Muhasebe', description: 'Yevmiye fişleri ve hesap planı', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE'] },
      { id: 'customers', name: 'Müşteri (Cari) Hesapları', description: 'Müşteri bakiyeleri ve ekstreleri', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE'] },
      { id: 'suppliers', name: 'Tedarikçi Hesapları', description: 'Tedarikçi borç takibi ve ödemeler', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE'] },
      { id: 'invoices', name: 'Fatura Yönetimi', description: 'E-Fatura, E-Arşiv ve kağıt fatura takibi', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE'] },
      { id: 'mizan', name: 'Mali Tablolar', description: 'Mizan, bilanço ve kâr-zarar raporları', availableActions: ['READ', 'EXECUTE'] }
    ]
  },
  {
    id: 'backoffice',
    name: 'Yönetim ve Sistem Kuruluşu',
    icon: '🛡️',
    color: 'purple',
    modules: [
      { id: 'dashboard', name: 'Yönetici Dashboard', description: 'KPI göstergeleri ve canlı istatistikler', availableActions: ['READ'] },
      { id: 'management', name: 'Backoffice Ana Giriş', description: 'Yönetim modülüne genel erişim', availableActions: ['READ'] },
      { id: 'users.roles', name: 'Kullanıcı ve Yetki', description: 'Kullanıcı tanımları ve RBAC yetkilendirme', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE'] },
      { id: 'reports.advanced', name: 'Gelişmiş Raporlama', description: 'Dashboard ve dinamik rapor tasarlayıcı', availableActions: ['READ', 'EXECUTE'] },
      { id: 'settings.system', name: 'Sistem Yapılandırması', description: 'Şirket ayarları ve cihaz tanımları', availableActions: ['READ', 'UPDATE'] },
      { id: 'crm', name: 'Müşteri İlişkileri (CRM)', description: 'Aday müşteri ve satış fırsatı takibi', availableActions: ['READ', 'CREATE', 'UPDATE', 'DELETE'] }
    ]
  }
];

interface RoleManagementProps {
  onBack?: () => void;
}

export function RoleManagement({ onBack }: RoleManagementProps) {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<RoleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPermissionsModal, setShowPermissionsModal] = useState<RoleType | null>(null);

  useEffect(() => {
    loadRoles();
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

  const handleEdit = (role: RoleType) => {
    navigate(`/system/roles/${role.id}`);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Bu rolü silmek istediğinizden emin misiniz?')) {
      try {
        const success = await roleAPI.delete(id);
        if (success) {
          await loadRoles();
        } else {
          alert('Sistem rolleri silinemez.');
        }
      } catch (error) {
        console.error('Error deleting role:', error);
      }
    }
  };

  // DataTable columns
  const columns: Column<RoleType>[] = [
    {
      id: 'name',
      header: 'Rol Adı',
      accessor: 'name',
      minWidth: 200,
      sortable: true,
      filterable: true,
      cell: (value: any, row: RoleType) => (
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)] border border-white"
            style={{ backgroundColor: row.color || '#3B82F6' }}
          >
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900">{value} {row.is_system_role && <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Sistem Grubu</span>}</p>
            <p className="text-xs text-gray-500 font-medium mt-0.5">{row.description}</p>
          </div>
        </div>
      )
    },
    {
      id: 'permissions',
      header: 'YETKİ DETAYI',
      accessor: (row: RoleType) => row.permissions?.length || 0,
      width: 170,
      sortable: false,
      cell: (value: any, row: RoleType) => {
        // Advanced logic to count how many distinct modules this user has any access to
        const distinctModules = (row.permissions || []).length;

        return (
          <button
            onClick={() => {
              const normalizedPermissions: Permission[] = (row.permissions || []).map(p => {
                if (typeof p === 'string') return { module: p, actions: ['READ'] };
                return p as Permission;
              });
              setShowPermissionsModal({ ...row, permissions: normalizedPermissions });
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors group border border-blue-100/50"
          >
            <Lock className="h-3.5 w-3.5" />
            <span className="font-bold text-sm tracking-tight">{distinctModules} Hizmet</span>
            <Eye className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
          </button>
        )
      }
    },
    {
      id: 'actions',
      header: 'İşlemler',
      accessor: (row: RoleType) => row,
      width: 150,
      cell: (_: any, row: RoleType) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEdit(row)}
            className="p-2.5 text-blue-600 bg-blue-50/50 hover:bg-blue-100 rounded-xl transition-colors border border-transparent shadow-sm"
            title="Düzenle"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            disabled={row.is_system_role}
            className={`p-2.5 rounded-xl transition-all shadow-sm ${row.is_system_role ? 'text-slate-300 bg-slate-50 cursor-not-allowed border outline-none' : 'text-red-600 bg-red-50/50 hover:bg-red-500 hover:text-white hover:shadow-red-500/30 active:scale-95'}`}
            title={row.is_system_role ? "Sistem Rolü Silinemez" : "Sil"}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 z-10 shadow-sm relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute right-0 top-0 opacity-[0.03] transform scale-[3] translate-x-10 translate-y-10">
          <Shield className="w-64 h-64 text-blue-900" />
        </div>

        <div className="flex items-center justify-between relative z-10 w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center border border-white/20">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                ROL & YETKİLER
              </h2>
              <p className="text-sm text-slate-500 font-medium mt-1">
                Kullanıcı yetki profillerini düzenleyin ve güvenliği yönetin.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/system/roles/new')}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5 active:scale-95 transition-all font-black tracking-wide text-sm"
          >
            <Plus className="h-5 w-5" strokeWidth={3} />
            YENİ ROL EKLE
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8 w-full max-w-7xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-sm"></div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <DataTable
              data={roles}
              columns={columns}
              searchable={true}
              exportable={false}
              columnResizable={false}
              stickyHeader={true}
              maxHeight="calc(100vh - 280px)"
              emptyMessage="Sistemde henüz bir rol tanımlı değil."
            />
          </div>
        )}
      </div>

      {/* View Permissions Summary Modal */}
      {showPermissionsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-8 border-b relative overflow-hidden" style={{ backgroundColor: `${showPermissionsModal.color || '#3b82f6'}1a` }}>
              <div className="absolute right-0 top-0 opacity-10 transform scale-[3] translate-x-10 translate-y-10 border">
                <Shield className="w-64 h-64" style={{ color: showPermissionsModal.color || '#3b82f6' }} />
              </div>

              <div className="relative z-10 flex justify-between items-start">
                <div className="flex gap-6 items-center">
                  <div className="w-20 h-20 rounded-2xl bg-white shadow-xl flex items-center justify-center border border-white/50 relative">
                    <Shield className="h-10 w-10" style={{ color: showPermissionsModal.color || '#3b82f6' }} />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{showPermissionsModal.name}</h3>
                    <p className="text-sm font-bold text-slate-600 tracking-widest uppercase mt-1">{showPermissionsModal.description || 'Detaylı yetki profili dökümü'}</p>
                    <div className="mt-4 flex gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/70 backdrop-blur border text-xs font-bold text-slate-700 shadow-sm">
                        <Lock className="w-3.5 h-3.5 text-blue-600" />
                        {showPermissionsModal.permissions.reduce((acc: number, p: any) => acc + (p.actions?.length || 0), 0)} İşlem Yetkisi
                      </span>
                    </div>
                  </div>
                </div>

                <button onClick={() => setShowPermissionsModal(null)} className="scroll-mt-0 bg-white/50 hover:bg-white p-2.5 rounded-xl transition-all shadow-sm group active:scale-90">
                  <X className="w-6 h-6 text-slate-500 group-hover:text-slate-800" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-slate-50/50 text-slate-800">
              <div className="space-y-6">
                {MODULE_GROUPS.map(group => {
                  // Filter to see if this role has any permissions in this group
                  const activeModulesInGroup = group.modules.map(module => {
                    const rolePerm = showPermissionsModal.permissions.find((p: any) => p.module === module.id);
                    if (rolePerm && rolePerm.actions.length > 0) {
                      return { module, actions: rolePerm.actions as PermissionAction[] };
                    }
                    return null;
                  }).filter(Boolean) as { module: ModuleConfig; actions: PermissionAction[] }[];

                  if (activeModulesInGroup.length === 0) return null;

                  return (
                    <div key={group.id} className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 overflow-hidden">
                      <h4 className="flex items-center gap-3 text-lg font-black text-slate-900 tracking-tight mb-5 pb-4 border-b border-slate-100">
                        <span className="text-2xl">{group.icon}</span>
                        {group.name}
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeModulesInGroup.map(({ module, actions }) => (
                          <div key={module.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex gap-4 transition-all hover:border-slate-300 hover:shadow-md">
                            <div className="mt-1 flex-shrink-0">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-inner">
                                <CheckCircle className="w-5 h-5" />
                              </div>
                            </div>
                            <div>
                              <div className="font-extrabold text-slate-800 text-sm tracking-tight">{module.name}</div>
                              <div className="text-[11px] font-medium text-slate-500 mt-0.5 pr-2">{module.description}</div>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {actions.map(act => {
                                  const isDanger = act === 'DELETE';
                                  return (
                                    <span key={act} className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border ${isDanger ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white shadow-sm border-slate-200 text-slate-600'}`}>
                                      {ACTION_LABELS[act]}
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoleManagement;
