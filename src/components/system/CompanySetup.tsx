import { useState, useEffect } from 'react';
import {
  Building2,
  Store,
  Warehouse,
  Calendar,
  ChevronRight,
  ChevronDown,
  Plus,
  Settings,
  Save,
  Trash2,
  FolderOpen,
  Copy,
  CheckSquare,
  Square,
  X
} from 'lucide-react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { organizationAPI, storeApiService, warehouseAPI, fetchCurrentAccounts, createCurrentAccount, Store as StoreType, Warehouse as WarehouseType, Period as PeriodType } from '../../services/api';
import { logger } from '../../services/loggingService';

// ===== TYPES =====
interface Company {
  id: string;
  firma_adi: string;
  firma_kodu: string;
  vergi_no: string;
  vergi_dairesi: string;
  adres: string;
  il: string;
  ilce: string;
  telefon: string;
  email: string;
  ana_para_birimi: string;
  raporlama_para_birimi: string;
  created_at: string;
}

const CURRENCIES = [
  { value: 'IQD', label: 'IQD — Irak Dinarı' },
  { value: 'USD', label: 'USD — Amerikan Doları' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'TRY', label: 'TRY — Türk Lirası' },
  { value: 'SAR', label: 'SAR — Suudi Riyali' },
  { value: 'AED', label: 'AED — BAE Dirhemi' },
  { value: 'KWD', label: 'KWD — Kuveyt Dinarı' },
  { value: 'GBP', label: 'GBP — İngiliz Sterlini' },
];

interface Period {
  id: string;
  firma_id: string;
  donem_adi: string;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  durum: 'acik' | 'kapali';
}

type TreeNodeType = 'root' | 'company' | 'folder-branch' | 'folder-warehouse' | 'folder-period' | 'branch' | 'warehouse' | 'period';

interface TreeNode {
  id: string;
  label: string;
  type: TreeNodeType;
  icon?: React.ElementType;
  data?: any;
  children?: TreeNode[];
  isExpanded?: boolean;
  parentId?: string;
}

// ===== COMPONENTS =====

const TreeItem = ({ node, level = 0, onToggle, onSelect, onAdd, selectedId, activeId }: {
  node: TreeNode,
  level?: number,
  onToggle: (id: string) => void,
  onSelect: (node: TreeNode) => void,
  onAdd: (node: TreeNode) => void,
  selectedId: string | null,
  activeId?: string | null
}) => {
  const Icon = node.icon || Building2;
  const isSelected = selectedId === node.id;
  const isActive = activeId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'
          }`}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node);
          if (hasChildren && (node.type.startsWith('folder') || node.type === 'company')) {
            onToggle(node.id);
          }
        }}
      >
        <div
          className={`p-0.5 rounded-md hover:bg-gray-200 ${hasChildren ? 'visible' : 'invisible'}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
        >
          {node.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`} />
        <span className="text-sm truncate flex-1">{node.label}</span>
        {isActive && (
          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">AKTİF</span>
        )}
        {node.type.startsWith('folder') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd(node);
            }}
            className="p-1 hover:bg-blue-100 rounded text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Yeni Ekle"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {node.isExpanded && node.children && (
        <div className="ml-1">
          {node.children.map(child => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              onToggle={onToggle}
              onSelect={onSelect}
              onAdd={onAdd}
              selectedId={selectedId}
              activeId={activeId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function CompanySetup() {
  const { selectedFirm, selectedPeriod, setSelectedFirm, setSelectedPeriod, setFirmAsDefault, setPeriodAsDefault } = useFirmaDonem();

  // Data State
  const [companies, setCompanies] = useState<Company[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [loading, setLoading] = useState(true);

  // Tree State
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  // Form State
  const [formData, setFormData] = useState<any>({});
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>('view');

  // Copy Logic State
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyOptions, setCopyOptions] = useState({
    materials: false,
    accounts: false,
    settings: true
  });
  const [copySourceId, setCopySourceId] = useState<string | null>(null);

  const handleCopyCompany = async () => {
    if (!copySourceId) return;
    try {
      setLoading(true);
      const sourceCompany = companies.find(c => c.id === copySourceId);
      if (!sourceCompany) throw new Error('Kaynak firma bulunamadı');

      // 1. Create New Firm
      const newFirmData = {
        ...sourceCompany,
        id: undefined,
        firma_adi: sourceCompany.firma_adi + ' (Kopya)',
        firma_kodu: sourceCompany.firma_kodu + '-CPY',
        created_at: undefined
      };

      const newFirmRes = await organizationAPI.saveFirm(newFirmData);
      const newFirmId = newFirmRes?.id;

      // 2. Copy Accounts if selected
      if (copyOptions.accounts && newFirmId) {
        try {
          const accounts = await fetchCurrentAccounts(copySourceId);
          for (const acc of accounts) {
            await createCurrentAccount({
              ...acc,
              id: undefined,
              firma_id: newFirmId,
              created_at: undefined
            });
          }
          toast.success('Cari hesaplar kopyalandı');
        } catch (e) {
          logger.crudError('CompanySetup', 'copyAccounts', e);
          toast.error('Cari hesaplar kopyalanırken hata oluştu');
        }
      }

      toast.success('Firma başarıyla kopyalandı');
      setShowCopyModal(false);
      loadAllData();

    } catch (e: any) {
      logger.crudError('CompanySetup', 'copyFirm', e);
      toast.error('Kopyalama hatası: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    buildTree();
  }, [companies, periods, stores, warehouses, expandedNodes]);

  const loadAllData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Companies
      const compData = await organizationAPI.getFirms();
      setCompanies(compData || []);

      // 2. Fetch Stores
      const storesRes = await storeApiService.fetchStores(0, 500);
      setStores(storesRes.data);

      // 3. Fetch Warehouses
      const whRes = await warehouseAPI.getAll();
      setWarehouses(whRes);

      // 4. Fetch Periods for all companies
      if (compData) {
        let allPeriods: Period[] = [];
        for (const comp of compData) {
          try {
            const pData = await organizationAPI.getPeriods(comp.id);
            if (pData) allPeriods = [...allPeriods, ...pData];
          } catch (e) { console.warn('Failed to load periods for ' + comp.firma_adi); }
        }
        setPeriods(allPeriods);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Veriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (id: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedNodes(newExpanded);
  };

  const buildTree = () => {
    const nodes: TreeNode[] = companies.map(comp => {
      const compPeriods = periods.filter(p => p.firma_id === comp.id);
      const compStores = stores; // Simplified, in a real scenario we'd filter stores by firm_nr

      return {
        id: comp.id,
        label: comp.firma_adi,
        type: 'company',
        icon: Building2,
        data: comp,
        isExpanded: expandedNodes.has(comp.id),
        children: [
          {
            id: `folder-branch-${comp.id}`,
            label: 'Şubeler',
            type: 'folder-branch',
            icon: Store,
            parentId: comp.id,
            isExpanded: expandedNodes.has(`folder-branch-${comp.id}`),
            children: compStores.map(store => ({
              id: store.id,
              label: store.name,
              type: 'branch',
              icon: Store,
              parentId: comp.id,
              data: store,
              children: [
                {
                  id: `folder-wh-${store.id}`,
                  label: 'Depolar / Ambarlar',
                  type: 'folder-warehouse',
                  icon: Warehouse,
                  isExpanded: expandedNodes.has(`folder-wh-${store.id}`),
                  children: warehouses.map(wh => ({
                    id: wh.id,
                    label: wh.name,
                    type: 'warehouse',
                    icon: Warehouse,
                    data: wh
                  }))
                }
              ]
            }))
          },
          {
            id: `folder-period-${comp.id}`,
            label: 'Dönemler',
            type: 'folder-period',
            icon: Calendar,
            parentId: comp.id,
            isExpanded: expandedNodes.has(`folder-period-${comp.id}`),
            children: compPeriods.map(p => ({
              id: p.id,
              label: p.donem_adi,
              type: 'period',
              icon: Calendar,
              data: p
            }))
          }
        ]
      };
    });

    setTreeData(nodes);
  };

  const handleSelectNode = (node: TreeNode) => {
    setSelectedNode(node);
    setMode('view');
    setFormData(node.data || {});
  };

  const handleAddNode = (node: TreeNode) => {
    setSelectedNode(node);
    setMode('create');

    const initialData: any = {};
    if (node.type === 'folder-period') {
      initialData.donem_adi = '';
      initialData.durum = 'acik';
    } else if (node.type === 'folder-warehouse') {
      initialData.name = '';
      initialData.code = '';
    } else if (node.type === 'folder-branch') {
      initialData.name = '';
      initialData.code = '';
      initialData.status = 'active';
    }

    setFormData(initialData);
  };

  // --- CRUD Handlers ---

  const handleSave = async () => {
    try {
      setLoading(true);

      if (selectedNode?.type === 'company' || (selectedNode?.type === 'root' && mode === 'create')) {
        await organizationAPI.saveFirm(formData);
        toast.success('Firma başarıyla kaydedildi');
      }
      else if (selectedNode?.type === 'branch' || (selectedNode?.type === 'folder-branch' && mode === 'create')) {
        if (mode === 'create') {
          await storeApiService.createStore(formData);
        } else {
          await storeApiService.updateStore(selectedNode!.id, formData);
        }
        toast.success('Şube başarıyla kaydedildi');
      }
      else if (selectedNode?.type === 'warehouse' || (selectedNode?.type === 'folder-warehouse' && mode === 'create')) {
        if (mode === 'create') {
          await warehouseAPI.create(formData);
        } else {
          await warehouseAPI.update(selectedNode!.id, formData);
        }
        toast.success('Depo başarıyla kaydedildi');
      }
      else if (selectedNode?.type === 'period' || (selectedNode?.type === 'folder-period' && mode === 'create')) {
        await organizationAPI.savePeriod({
          ...formData,
          firma_id: mode === 'create' ? selectedNode?.parentId : formData.firma_id
        });
        toast.success('Dönem başarıyla kaydedildi');
      }

      setMode('view');
      loadAllData();
    } catch (error: any) {
      logger.crudError('CompanySetup', 'save', error);
      toast.error('İşlem başarısız: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;

    try {
      if (selectedNode?.type === 'company') {
        await organizationAPI.deleteFirm(selectedNode.id);
      }
      else if (selectedNode?.type === 'branch') {
        await storeApiService.deleteStore(selectedNode.id);
      }
      else if (selectedNode?.type === 'warehouse') {
        await warehouseAPI.delete(selectedNode.id);
      }
      else {
        toast.info('Bu öğe için silme işlemi henüz PostgreSQL tarafında desteklenmiyor.');
        return;
      }

      toast.success('Başarıyla silindi');
      setMode('view');
      loadAllData();
      setSelectedNode(null);
    } catch (e) {
      logger.crudError('CompanySetup', 'delete', e);
      toast.error('Silme hatası');
    }
  };

  const renderContent = () => {
    if (!selectedNode) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-gray-400">
          <Building2 className="w-16 h-16 mb-4 opacity-20" />
          <p>İşlem yapmak için soldaki ağaçtan bir öğe seçin</p>
        </div>
      );
    }

    if (selectedNode.type.startsWith('folder') && mode === 'view') {
      const isPeriodFolder = selectedNode.type === 'folder-period';

      return (
        <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FolderOpen className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{selectedNode.label}</h2>
              <p className="text-gray-500">Bu klasör altındaki öğeleri yönetebilirsiniz.</p>
            </div>
          </div>

          <button
            onClick={() => {
              setMode('create');
              setFormData({});
              if (isPeriodFolder) {
                setFormData({
                  donem_adi: '2026',
                  baslangic_tarihi: '2026-01-01',
                  bitis_tarihi: '2026-12-31',
                  durum: 'acik'
                });
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Yeni Ekle
          </button>
        </div>
      );
    }

    const renderFields = () => {
      if (selectedNode.type === 'company' || (selectedNode.label === 'Yeni Firma')) {
        return (
          <>
            <div className="col-span-2"><h3 className="text-sm font-bold text-gray-500 border-b pb-1 mb-2">Temel Bilgiler</h3></div>
            <div><label className="block text-sm mb-1">Firma Adı</label><input className="w-full border p-2 rounded" value={formData.firma_adi || ''} onChange={e => setFormData({ ...formData, firma_adi: e.target.value })} disabled={mode === 'view'} /></div>
            <div><label className="block text-sm mb-1">Firma Kodu</label><input className="w-full border p-2 rounded" value={formData.firma_kodu || ''} onChange={e => setFormData({ ...formData, firma_kodu: e.target.value })} disabled={mode === 'view'} /></div>

            <div className="col-span-2 mt-4"><h3 className="text-sm font-bold text-gray-500 border-b pb-1 mb-2">Vergi Bilgileri</h3></div>
            <div><label className="block text-sm mb-1">Vergi No</label><input className="w-full border p-2 rounded" value={formData.vergi_no || ''} onChange={e => setFormData({ ...formData, vergi_no: e.target.value })} disabled={mode === 'view'} /></div>
            <div><label className="block text-sm mb-1">Vergi Dairesi</label><input className="w-full border p-2 rounded" value={formData.vergi_dairesi || ''} onChange={e => setFormData({ ...formData, vergi_dairesi: e.target.value })} disabled={mode === 'view'} /></div>

            <div className="col-span-2 mt-4"><h3 className="text-sm font-bold text-gray-500 border-b pb-1 mb-2">İletişim</h3></div>
            <div className="col-span-2"><label className="block text-sm mb-1">Adres</label><input className="w-full border p-2 rounded" value={formData.adres || ''} onChange={e => setFormData({ ...formData, adres: e.target.value })} disabled={mode === 'view'} /></div>
            <div><label className="block text-sm mb-1">Şehir</label><input className="w-full border p-2 rounded" value={formData.il || ''} onChange={e => setFormData({ ...formData, il: e.target.value })} disabled={mode === 'view'} /></div>
            <div><label className="block text-sm mb-1">İlçe</label><input className="w-full border p-2 rounded" value={formData.ilce || ''} onChange={e => setFormData({ ...formData, ilce: e.target.value })} disabled={mode === 'view'} /></div>

            <div className="col-span-2 mt-4"><h3 className="text-sm font-bold text-gray-500 border-b pb-1 mb-2">Para Birimi</h3></div>
            <div>
              <label className="block text-sm mb-1">Ana Para Birimi</label>
              <select
                className="w-full border p-2 rounded bg-white"
                value={formData.ana_para_birimi || 'IQD'}
                onChange={e => setFormData({ ...formData, ana_para_birimi: e.target.value })}
                disabled={mode === 'view'}
              >
                {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Fatura ve işlem para birimi</p>
            </div>
            <div>
              <label className="block text-sm mb-1">Raporlama Para Birimi</label>
              <select
                className="w-full border p-2 rounded bg-white"
                value={formData.raporlama_para_birimi || 'IQD'}
                onChange={e => setFormData({ ...formData, raporlama_para_birimi: e.target.value })}
                disabled={mode === 'view'}
              >
                {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Konsolide raporlarda kullanılır</p>
            </div>
          </>
        );
      }

      if (selectedNode.type === 'period' || selectedNode.type === 'folder-period') {
        return (
          <>
            <div><label className="block text-sm mb-1">Dönem Adı</label><input className="w-full border p-2 rounded" value={formData.donem_adi || ''} onChange={e => setFormData({ ...formData, donem_adi: e.target.value })} disabled={mode === 'view'} /></div>
            <div><label className="block text-sm mb-1">Durum</label>
              <select className="w-full border p-2 rounded" value={formData.durum || 'acik'} onChange={e => setFormData({ ...formData, durum: e.target.value })} disabled={mode === 'view'}>
                <option value="acik">Açık</option>
                <option value="kapali">Kapalı</option>
              </select>
            </div>
            <div><label className="block text-sm mb-1">Başlangıç</label><input type="date" className="w-full border p-2 rounded" value={formData.baslangic_tarihi || ''} onChange={e => setFormData({ ...formData, baslangic_tarihi: e.target.value })} disabled={mode === 'view'} /></div>
            <div><label className="block text-sm mb-1">Bitiş</label><input type="date" className="w-full border p-2 rounded" value={formData.bitis_tarihi || ''} onChange={e => setFormData({ ...formData, bitis_tarihi: e.target.value })} disabled={mode === 'view'} /></div>
          </>
        )
      }

      if (selectedNode.type === 'warehouse' || selectedNode.type === 'folder-warehouse') {
        return (
          <>
            <div><label className="block text-sm mb-1">Depo Adı</label><input className="w-full border p-2 rounded" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} disabled={mode === 'view'} /></div>
            <div><label className="block text-sm mb-1">Kod</label><input className="w-full border p-2 rounded" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} disabled={mode === 'view'} /></div>
            <div className="col-span-2"><label className="block text-sm mb-1">Şehir</label><input className="w-full border p-2 rounded" value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} disabled={mode === 'view'} /></div>
          </>
        )
      }

      if (selectedNode.type === 'branch' || selectedNode.type === 'folder-branch') {
        return (
          <>
            <div><label className="block text-sm mb-1">Şube Adı</label><input className="w-full border p-2 rounded" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} disabled={mode === 'view'} /></div>
            <div><label className="block text-sm mb-1">Şube Kodu</label><input className="w-full border p-2 rounded" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} disabled={mode === 'view'} /></div>
            <div><label className="block text-sm mb-1">Şehir</label><input className="w-full border p-2 rounded" value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} disabled={mode === 'view'} /></div>
            <div><label className="block text-sm mb-1">Durum</label>
              <select className="w-full border p-2 rounded" value={formData.status || 'active'} onChange={e => setFormData({ ...formData, status: e.target.value })} disabled={mode === 'view'}>
                <option value="active">Aktif</option>
                <option value="inactive">Pasif</option>
              </select>
            </div>
          </>
        )
      }

      return null;
    };

    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            {selectedNode.icon && <selectedNode.icon className="w-6 h-6 text-gray-400" />}
            <h2 className="text-xl font-bold text-gray-800">
              {mode === 'create' ? (`Yeni ${selectedNode.type.replace('folder-', '')} Kaydı`) : (formData.name || formData.title || formData.firma_adi || selectedNode.label)}
            </h2>
          </div>
          <div className="flex gap-2">
            {mode === 'view' && selectedNode.type.startsWith('folder') && (
              <button onClick={() => handleAddNode(selectedNode)} className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Yeni Ekle
              </button>
            )}
            {mode === 'view' && !selectedNode.type.startsWith('folder') ? (
              <>
                <button onClick={() => setMode('edit')} className="px-3 py-1.5 border hover:bg-gray-50 rounded-lg flex items-center gap-2 text-sm">
                  <Settings className="w-4 h-4" /> Düzenle
                </button>
                <button onClick={handleDelete} className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 text-sm">
                  <Trash2 className="w-4 h-4" /> Sil
                </button>
                {selectedNode?.type === 'company' && (
                  <>
                    <button onClick={() => { setCopySourceId(selectedNode.id); setShowCopyModal(true); }} className="px-3 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg flex items-center gap-2 text-sm">
                      <Copy className="w-4 h-4" /> Kopyala
                    </button>
                    {(selectedFirm?.id !== selectedNode.id) && (
                      <button onClick={() => { const firm = companies.find(c => c.id === selectedNode.id); if (firm) { setFirmAsDefault(firm.id); toast.success('Çalışma firması olarak ayarlandı'); } }} className="px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg flex items-center gap-2 text-sm font-medium">
                        <Settings className="w-4 h-4" /> Çalışma Firması Yap
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <button onClick={() => setMode('view')} className="px-3 py-1.5 border hover:bg-gray-50 rounded-lg text-sm">İptal</button>
                <button onClick={handleSave} className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center gap-2 text-sm">
                  <Save className="w-4 h-4" /> Kaydet
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {renderFields()}
        </div>

        {showCopyModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Copy className="w-5 h-5 text-blue-600" /> Firma Kopyala</h3>
              <div className="space-y-3 mb-6">
                <p className="text-sm text-gray-500 mb-2">Verileri aktar:</p>
                <div className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded" onClick={() => setCopyOptions({ ...copyOptions, accounts: !copyOptions.accounts })}>
                  {copyOptions.accounts ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-400" />}
                  <span className="text-sm">Cari Hesaplar</span>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCopyModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">İptal</button>
                <button onClick={handleCopyCompany} className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded">Kopyala</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full bg-white">
      <div className="w-80 border-r bg-gray-50 flex flex-col">
        <div className="p-4 border-b bg-white">
          <h2 className="font-bold text-gray-800 flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-600" /> Organizasyon</h2>
        </div>
        <div className="flex-1 overflow-auto py-2">
          {loading ? (
            <div className="p-4 text-center text-gray-500 text-sm">Yükleniyor...</div>
          ) : treeData.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">Kayıt bulunamadı.</div>
          ) : (
            treeData.map(node => (
              <TreeItem key={node.id} node={node} onToggle={toggleNode} onSelect={handleSelectNode} onAdd={handleAddNode} selectedId={selectedNode?.id || null} activeId={selectedFirm?.id || null} />
            ))
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-white">
        {renderContent()}
      </div>
    </div>
  );
}
