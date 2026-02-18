/**
 * ExRetailOS - Waybill/İrsaliye Module
 * 
 * Comprehensive waybill management:
 * - Sales waybill (Sevk irsaliyesi)
 * - Return waybill (İade irsaliyesi)
 * - Transfer waybill (Transfer irsaliyesi)
 * - Waybill to invoice conversion
 * - Partial shipments
 * - Tracking and status updates
 * 
 * @created 2024-12-24
 */

import { useState, useEffect } from 'react';
import { 
  Truck, 
  Plus, 
  Search, 
  FileText, 
  Package,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  XCircle,
  Download,
  Printer,
  Eye,
  Edit,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { fetchWaybills, createWaybill, updateWaybill, deleteWaybill, convertWaybillToInvoice } from '../../../services/api/waybills';

// ===== TYPES =====

interface Waybill {
  id: string;
  firma_id: string;
  donem_id: string;
  irsaliye_no: string; // Waybill number
  irsaliye_tipi: 'SEVK' | 'IADE' | 'TRANSFER'; // Shipment, Return, Transfer
  tarih: string; // Date
  
  // Customer/Supplier info
  cari_id?: string;
  cari_adi?: string;
  cari_adres?: string;
  
  // Transfer info (for store transfers)
  kaynak_depo?: string; // Source warehouse
  hedef_depo?: string; // Target warehouse
  
  // Items
  satirlar: WaybillLine[];
  
  // Status
  durum: 'TASLAK' | 'ONAYLANDI' | 'SEVK_EDILDI' | 'TESLIM_EDILDI' | 'IPTAL';
  
  // Invoice conversion
  fatura_kesildi: boolean;
  fatura_no?: string;
  
  // Additional info
  aciklama: string;
  sevk_adresi?: string;
  tasiyici_firma?: string;
  arac_plaka?: string;
  
  created_at: string;
  updated_at: string;
  created_by: string;
}

interface WaybillLine {
  id: string;
  urun_id: string;
  urun_kodu: string;
  urun_adi: string;
  miktar: number;
  birim: string;
  
  // For partial shipments
  toplam_siparis_miktari?: number; // Total ordered quantity
  onceki_sevkiyatlar?: number; // Previously shipped quantity
  kalan_miktar?: number; // Remaining quantity
  
  // Lot/Serial tracking
  lot_no?: string;
  seri_no?: string;
  
  aciklama?: string;
}

type WaybillStatus = Waybill['durum'];
type WaybillType = Waybill['irsaliye_tipi'];

// ===== COMPONENT =====

export function WaybillModule() {
  const { t } = useLanguage();
  const { selectedFirma, selectedDonem } = useFirmaDonem();

  // State
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<WaybillType | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<WaybillStatus | 'ALL'>('ALL');
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);

  // Fetch waybills on component mount
  useEffect(() => {
    if (selectedFirma && selectedDonem) {
      fetchWaybills(selectedFirma.id, selectedDonem.id)
        .then(data => setWaybills(data))
        .catch(error => toast.error('İrsaliyeler yüklenirken hata oluştu'));
    }
  }, [selectedFirma, selectedDonem]);

  // Filter waybills
  const filteredWaybills = waybills.filter(waybill => {
    const matchesSearch = 
      waybill.irsaliye_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      waybill.cari_adi?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      waybill.kaynak_depo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      waybill.hedef_depo?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'ALL' || waybill.irsaliye_tipi === filterType;
    const matchesStatus = filterStatus === 'ALL' || waybill.durum === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Calculate summaries
  const summary = {
    toplamIrsaliye: waybills.length,
    sevkIrsaliyeleri: waybills.filter(w => w.irsaliye_tipi === 'SEVK').length,
    iadeIrsaliyeleri: waybills.filter(w => w.irsaliye_tipi === 'IADE').length,
    transferIrsaliyeleri: waybills.filter(w => w.irsaliye_tipi === 'TRANSFER').length,
    faturaKesilmemis: waybills.filter(w => !w.fatura_kesildi && w.irsaliye_tipi === 'SEVK').length
  };

  // Status color helper
  const getStatusColor = (status: WaybillStatus) => {
    switch (status) {
      case 'TASLAK': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'ONAYLANDI': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'SEVK_EDILDI': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'TESLIM_EDILDI': return 'bg-green-100 text-green-700 border-green-300';
      case 'IPTAL': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // Status label helper
  const getStatusLabel = (status: WaybillStatus) => {
    const labels = {
      'TASLAK': 'Taslak',
      'ONAYLANDI': 'Onaylandı',
      'SEVK_EDILDI': 'Sevk Edildi',
      'TESLIM_EDILDI': 'Teslim Edildi',
      'IPTAL': 'İptal'
    };
    return labels[status] || status;
  };

  // Type label helper
  const getTypeLabel = (type: WaybillType) => {
    const labels = {
      'SEVK': 'Sevk',
      'IADE': 'İade',
      'TRANSFER': 'Transfer'
    };
    return labels[type] || type;
  };

  // Handle convert to invoice
  const handleConvertToInvoice = (waybillId: string) => {
    if (confirm('Bu irsaliyeyi faturaya dönüştürmek istediğinizden emin misiniz?')) {
      convertWaybillToInvoice(waybillId)
        .then(() => {
          toast.success('İrsaliye faturaya dönüştürüldü');
          // Refresh waybills
          fetchWaybills(selectedFirma?.id || '', selectedDonem?.id || '')
            .then(data => setWaybills(data))
            .catch(error => toast.error('İrsaliyeler yüklenirken hata oluştu'));
        })
        .catch(error => toast.error('Fatura dönüştürülürken hata oluştu'));
    }
  };

  // Handle delete
  const handleDelete = (waybillId: string) => {
    if (confirm('Bu irsaliyeyi silmek istediğinizden emin misiniz?')) {
      deleteWaybill(waybillId)
        .then(() => {
          toast.success('İrsaliye silindi');
          // Refresh waybills
          fetchWaybills(selectedFirma?.id || '', selectedDonem?.id || '')
            .then(data => setWaybills(data))
            .catch(error => toast.error('İrsaliyeler yüklenirken hata oluştu'));
        })
        .catch(error => toast.error('İrsaliye silinirken hata oluştu'));
    }
  };

  if (view === 'create') {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 text-white px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('list')}
                className="p-2 hover:bg-teal-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl font-semibold">Yeni İrsaliye</h2>
                <p className="text-sm text-teal-100 mt-0.5">İrsaliye bilgilerini girin</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <Package className="w-16 h-16 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600">İrsaliye formu burada olacak</p>
              <p className="text-sm text-gray-500 mt-2">
                UniversalInvoiceModule benzeri bir form yapısı kullanılabilir
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 text-white px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-semibold">İrsaliye Yönetimi</h2>
              <p className="text-sm text-teal-100 mt-0.5">
                Sevk, iade ve transfer irsaliyeleri
              </p>
            </div>
          </div>
          <button
            onClick={() => setView('create')}
            className="flex items-center gap-2 px-4 py-2 bg-white text-teal-700 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Yeni İrsaliye
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 border-2 border-teal-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam İrsaliye</p>
              <p className="text-2xl font-semibold text-teal-600 mt-1">{summary.toplamIrsaliye}</p>
            </div>
            <FileText className="w-10 h-10 text-teal-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Sevk İrsaliyesi</p>
              <p className="text-2xl font-semibold text-blue-600 mt-1">{summary.sevkIrsaliyeleri}</p>
            </div>
            <Truck className="w-10 h-10 text-blue-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">İade İrsaliyesi</p>
              <p className="text-2xl font-semibold text-orange-600 mt-1">{summary.iadeIrsaliyeleri}</p>
            </div>
            <ArrowRightLeft className="w-10 h-10 text-orange-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Transfer İrsaliyesi</p>
              <p className="text-2xl font-semibold text-purple-600 mt-1">{summary.transferIrsaliyeleri}</p>
            </div>
            <Package className="w-10 h-10 text-purple-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Fatura Kesilmemiş</p>
              <p className="text-2xl font-semibold text-red-600 mt-1">{summary.faturaKesilmemis}</p>
            </div>
            <Clock className="w-10 h-10 text-red-600 opacity-20" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 bg-white border-b">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="İrsaliye no, müşteri adı veya depo ara..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
          >
            <option value="ALL">Tüm Tipler</option>
            <option value="SEVK">Sevk İrsaliyesi</option>
            <option value="IADE">İade İrsaliyesi</option>
            <option value="TRANSFER">Transfer İrsaliyesi</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="TASLAK">Taslak</option>
            <option value="ONAYLANDI">Onaylandı</option>
            <option value="SEVK_EDILDI">Sevk Edildi</option>
            <option value="TESLIM_EDILDI">Teslim Edildi</option>
            <option value="IPTAL">İptal</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">İrsaliye No</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Tip</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Tarih</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cari/Depo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Ürün Sayısı</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Durum</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Fatura</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredWaybills.map(waybill => (
                <tr key={waybill.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-mono font-medium">{waybill.irsaliye_no}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                      waybill.irsaliye_tipi === 'SEVK' ? 'bg-blue-100 text-blue-700' :
                      waybill.irsaliye_tipi === 'IADE' ? 'bg-orange-100 text-orange-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {getTypeLabel(waybill.irsaliye_tipi)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm">{new Date(waybill.tarih).toLocaleDateString('tr-TR')}</span>
                  </td>
                  <td className="px-4 py-3">
                    {waybill.cari_adi || `${waybill.kaynak_depo} → ${waybill.hedef_depo}`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400" />
                      <span className="text-sm">{waybill.satirlar.length} ürün</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-medium ${getStatusColor(waybill.durum)}`}>
                      {getStatusLabel(waybill.durum)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {waybill.fatura_kesildi ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-medium">{waybill.fatura_no}</span>
                      </span>
                    ) : waybill.irsaliye_tipi === 'SEVK' ? (
                      <button
                        onClick={() => handleConvertToInvoice(waybill.id)}
                        className="text-xs text-blue-600 hover:text-blue-700 underline"
                      >
                        Fatura Kes
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Detay"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                        title="Yazdır"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                        title="Düzenle"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(waybill.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredWaybills.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Kayıt bulunamadı</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
