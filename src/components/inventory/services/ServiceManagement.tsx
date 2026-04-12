import { useState, useEffect, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { serviceAPI, type Service } from '../../../services/serviceAPI';
import { ServiceFormPage } from './ServiceFormPage';
import { ContextMenu } from '../../shared/ContextMenu';
import { formatNumber } from '../../../utils/formatNumber';
import { toast } from 'sonner';
import { Briefcase, Edit, Trash2, RefreshCw, Plus, Search, Layers, Banknote } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

export function ServiceManagement() {
  const { tm } = useLanguage();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; service: Service } | null>(null);

  const loadServices = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const data = await serviceAPI.getAll();
      setServices(data);
    } catch (error) {
      console.error('Error loading services:', error);
      toast.error('Hizmetler yüklenirken hata oluştu');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const filteredServices = useMemo(() => {
    return services.filter(service => {
      const searchLower = searchQuery.toLowerCase();
      return searchQuery === '' ||
        (service.name?.toLowerCase() || '').includes(searchLower) ||
        (service.code?.toLowerCase() || '').includes(searchLower) ||
        (service.category?.toLowerCase() || '').includes(searchLower);
    });
  }, [services, searchQuery]);

  const openForm = (serviceId?: string) => {
    setEditingServiceId(serviceId);
    setShowForm(true);
  };

  const columnHelper = createColumnHelper<Service>();

  const columns = useMemo<ColumnDef<Service, any>[]>(() => [
    columnHelper.accessor('code', {
      header: tm('code') || 'HİZMET KODU',
      cell: info => (
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-indigo-500" />
           <span className="font-mono text-indigo-600 font-bold">{info.getValue() || '-'}</span>
        </div>
      ),
      size: 160
    }),
    columnHelper.accessor('name', {
      header: tm('productName') || 'HİZMET ADI',
      cell: info => (
        <div className="flex flex-col">
           <span className="font-bold text-slate-800">{info.getValue()}</span>
           <span className="text-[10px] text-slate-400 uppercase tracking-tighter">{info.row.original.category || 'GENEL'}</span>
        </div>
      ),
      size: 260
    }),
    columnHelper.accessor('brand', {
      header: tm('brand') || 'MARKA',
      cell: info => <span className="text-xs font-medium text-slate-600">{info.getValue() || '-'}</span>,
      size: 120
    }),
    columnHelper.accessor('unit_price', {
      header: tm('price') || 'BİRİM FİYAT (LOKAL)',
      cell: info => (
        <div className="flex flex-col items-end">
           <span className="font-black text-slate-900">{formatNumber(info.getValue(), 2, true)}</span>
           <span className="text-[10px] text-slate-500">{info.row.original.unit}</span>
        </div>
      ),
      size: 140
    }),
    columnHelper.accessor('unit_price_usd', {
      header: 'FİYAT (USD)',
      cell: info => (
        <div className="flex items-center justify-end font-bold text-blue-600">
          ${formatNumber(info.getValue(), 2, false)}
        </div>
      ),
      size: 120
    }),
    columnHelper.accessor('purchase_price_usd', {
      header: 'ALIŞ (USD)',
      cell: info => (
        <div className="flex items-center justify-end font-bold text-slate-500">
           ${formatNumber(info.getValue(), 2, false)}
        </div>
      ),
      size: 120
    }),
    columnHelper.accessor('tax_rate', {
      header: 'TAX',
      cell: info => (
        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold">%{info.getValue()}</span>
      ),
      size: 80
    }),
    columnHelper.accessor('is_active', {
      header: tm('status') || 'DURUM',
      cell: info => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${info.getValue() ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {info.getValue() ? (tm('active') || 'AKTİF') : (tm('passive') || 'PASİF')}
        </span>
      ),
      size: 100
    }),
    columnHelper.accessor('specialCode1', {
      header: tm('specialCode') || 'ÖZEL KOD',
      cell: info => <span className="text-[10px] font-mono text-slate-500">{info.getValue() || '-'}</span>,
      size: 100
    }),
  ], [tm]);

  const handleDelete = async (service: Service) => {
    if (window.confirm(`${service.name} silinecek. Emin misiniz?`)) {
      try {
        await serviceAPI.delete(service.id);
        toast.success('Hizmet silindi');
        loadServices(true);
      } catch (error) {
        toast.error('Silme işlemi başarısız');
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            <h2 className="text-sm">HİZMET KARTLARI</h2>
            <span className="text-blue-100 text-[10px] ml-2">• {services.length} toplam kayıt</span>
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={() => loadServices()}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]"
              title="Yenile"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>YENİLE</span>
            </button>
            <button
              onClick={() => openForm()}
              className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px]"
            >
              <Plus className="w-3 h-3" />
              <span>YENİ HİZMET EKLE</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table & Search */}
      <div className="flex-1 overflow-auto p-3 bg-gray-50">
        {/* Search Box */}
        <div className="mb-3 bg-white p-3 border border-gray-200 rounded">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Hizmet adı, kodu veya kategori ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="bg-white border border-gray-200">
          <DevExDataGrid
            data={filteredServices}
            columns={columns}
            onRowContextMenu={(e, service) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, service });
            }}
            onRowDoubleClick={(service) => openForm(service.id)}
            pageSize={50}
          />
        </div>
      </div>

      {/* Overlays */}
       {showForm && (
        <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm">
           <div className="w-full h-full bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
              <ServiceFormPage
                serviceId={editingServiceId}
                onSave={() => loadServices(true)}
                onClose={() => setShowForm(false)}
              />
           </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'edit',
              label: 'Düzenle',
              icon: Edit,
              onClick: () => openForm(contextMenu.service.id)
            },
            {
              id: 'delete',
              label: 'Sil',
              icon: Trash2,
              variant: 'danger',
              onClick: () => handleDelete(contextMenu.service)
            }
          ]}
        />
      )}
    </div>
  );
}
