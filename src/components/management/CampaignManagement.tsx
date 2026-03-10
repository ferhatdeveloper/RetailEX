import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, Calendar, CheckCircle, Search, RefreshCw, Download, Settings } from 'lucide-react';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import type { Campaign, Product } from '../../App';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { CreateCampaignPage } from './CreateCampaignPage';
import { ContextMenu } from '../shared/ContextMenu';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';

interface CampaignManagementProps {
  campaigns: Campaign[];
  setCampaigns: (campaigns: Campaign[]) => void;
  products: Product[];
}

export function CampaignManagement({ campaigns, setCampaigns, products }: CampaignManagementProps) {
  const { t } = useLanguage();
  const [showCreatePage, setShowCreatePage] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; campaign: Campaign } | null>(null);

  // Load campaigns from database on mount
  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/campaigns`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error('Kampanyalar yüklenirken hata:', error);
      toast.error('Kampanyalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setShowCreatePage(true);
  };

  const handleSave = (campaign: Campaign) => {
    if (editingCampaign) {
      setCampaigns(campaigns.map(c => c.id === campaign.id ? campaign : c));
    } else {
      setCampaigns([...campaigns, campaign]);
    }
    setShowCreatePage(false);
    setEditingCampaign(null);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" kampanyasını silmek istediğinizden emin misiniz?`)) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/campaigns/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );

      if (response.ok) {
        setCampaigns(campaigns.filter(c => c.id !== id));
        toast.success('Kampanya silindi');
      } else {
        toast.error('Kampanya silinirken hata oluştu');
      }
    } catch (error) {
      console.error('Kampanya silme hatası:', error);
      toast.error('Bağlantı hatası oluştu');
    }
  };

  const handleToggleActive = async (id: string) => {
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/campaigns/${id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ...campaign, active: !campaign.active })
        }
      );

      if (response.ok) {
        setCampaigns(campaigns.map(c =>
          c.id === id ? { ...c, active: !c.active } : c
        ));
        toast.success(`Kampanya ${!campaign.active ? 'aktif' : 'pasif'} duruma getirildi`);
      }
    } catch (error) {
      console.error('Kampanya durum güncelleme hatası:', error);
    }
  };

  const filteredCampaigns = campaigns.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const columnHelper = createColumnHelper<Campaign>();

  const columns: ColumnDef<Campaign, any>[] = [
    columnHelper.accessor('name', {
      header: 'KAMPANYA ADI',
      cell: info => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-800">{info.getValue()}</span>
          {info.row.original.description && (
            <span className="text-[10px] text-gray-400 line-clamp-1">{info.row.original.description}</span>
          )}
        </div>
      ),
      size: 250
    }),
    columnHelper.accessor('discountValue', {
      header: 'İNDİRİM',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-1.5">
            {row.discountType === 'percentage' ? (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold border border-blue-100">
                %{info.getValue()}
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-bold border border-green-100">
                {info.getValue()?.toLocaleString()} IQD
              </span>
            )}
            {row.campaignUnit && row.campaignUnit !== 'NONE' && (
              <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded text-[9px] font-bold border border-orange-100 uppercase tracking-tighter">
                / {row.campaignUnit}
              </span>
            )}
          </div>
        );
      },
      size: 150
    }),
    columnHelper.accessor('startDate', {
      header: 'KAMPANYA DÖNEMİ',
      cell: info => {
        const row = info.row.original;
        const start = new Date(row.startDate).toLocaleDateString('tr-TR');
        const end = new Date(row.endDate).toLocaleDateString('tr-TR');
        const now = new Date();
        const isInPeriod = new Date(row.startDate) <= now && new Date(row.endDate) >= now;

        return (
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-gray-600">{start} - {end}</span>
            {isInPeriod ? (
              <span className="text-[9px] text-green-600 font-bold flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" /> AKTİF DÖNEM
              </span>
            ) : (
              <span className="text-[9px] text-gray-400 font-medium">PASİF DÖNEM</span>
            )}
          </div>
        );
      },
      size: 200
    }),
    columnHelper.accessor('productIds', {
      header: 'ÜRÜN SAYISI',
      cell: info => (
        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px] font-bold">
          {info.getValue()?.length || 0} Ürün
        </span>
      ),
      size: 120
    }),
    columnHelper.accessor('active', {
      header: 'DURUM',
      cell: info => (
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleActive(info.row.original.id); }}
          className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all shadow-sm ${info.getValue()
            ? 'bg-green-500 text-white hover:bg-green-600'
            : 'bg-gray-400 text-white hover:bg-gray-500'
            }`}
        >
          {info.getValue() ? 'AKTİF' : 'PASİF'}
        </button>
      ),
      size: 120
    }),
    columnHelper.display({
      id: 'actions',
      header: 'İŞLEMLER',
      cell: info => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleEdit(info.row.original); }}
            className="p-1.5 hover:bg-blue-100 rounded text-blue-600 transition-colors"
            title="Düzenle"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(info.row.original.id, info.row.original.name); }}
            className="p-1.5 hover:bg-red-100 rounded text-red-600 transition-colors"
            title="Sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
      size: 100
    })
  ];

  if (showCreatePage) {
    return (
      <CreateCampaignPage
        onBack={() => {
          setShowCreatePage(false);
          setEditingCampaign(null);
        }}
        onSave={handleSave}
        editingCampaign={editingCampaign ? { ...editingCampaign, type: editingCampaign.discountType === 'percentage' ? 'percentage' : 'fixed' } : null}
        products={products}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden" onClick={() => setContextMenu(null)}>
      {/* Premium Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 border-b border-blue-800/40 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-blue-100" />
            <h2 className="text-sm font-bold tracking-tight">Kampanya Yönetimi</h2>
            <span className="text-blue-200 text-[10px] ml-2">• {campaigns.length} Kampanya</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={loadCampaigns}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] font-medium rounded border border-white/10"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Yenile</span>
            </button>
            <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] font-medium rounded border border-white/10">
              <Download className="w-3 h-3" />
              <span>Dışa Aktar</span>
            </button>
            <button
              onClick={() => {
                setShowCreatePage(true);
                setEditingCampaign(null);
              }}
              className="flex items-center gap-1 px-3 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px] font-bold rounded shadow-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Kampanya</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-3 flex flex-col gap-3 overflow-hidden">
        {/* Search & Stats Bar */}
        <div className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Kampanya adına göre hızlı ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-blue-50 text-blue-700 rounded flex items-center gap-2 text-[11px] font-bold border border-blue-100">
              <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
              <span>{campaigns.filter(c => c.active).length} Aktif</span>
            </div>
            <button className="p-1.5 hover:bg-gray-100 rounded text-gray-400 transition-colors border border-gray-200">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Data Grid Section */}
        <div className="flex-1 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col relative">
          <DevExDataGrid
            data={filteredCampaigns}
            columns={columns}
            enableSorting
            enableFiltering={false}
            enableColumnResizing={true}
            height="calc(100vh - 180px)"
            pageSize={50}
            onRowContextMenu={(e, campaign) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, campaign });
            }}
            onRowDoubleClick={handleEdit}
          />
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'edit',
              label: t.editCampaign || 'Kampanyayı Düzenle',
              icon: Edit2,
              onClick: () => handleEdit(contextMenu.campaign)
            },
            {
              id: 'status',
              label: contextMenu.campaign.active ? (t.makePassive || 'Pasife Al') : (t.makeActive || 'Aktife Al'),
              icon: Calendar,
              onClick: () => handleToggleActive(contextMenu.campaign.id)
            },
            {
              id: 'delete',
              label: t.deleteCampaign || 'Kampanyayı Sil',
              icon: Trash2,
              variant: 'danger',
              divider: true,
              onClick: () => handleDelete(contextMenu.campaign.id, contextMenu.campaign.name)
            }
          ]}
        />
      )}
    </div>
  );
}

