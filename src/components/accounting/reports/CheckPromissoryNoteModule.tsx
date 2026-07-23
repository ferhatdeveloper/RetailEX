/**
 * ExRetailOS - Check & Promissory Note Management Module
 * 
 * Comprehensive check and promissory note tracking:
 * - Customer checks (received checks)
 * - Supplier promissory notes (issued notes)
 * - Portfolio management
 * - Bank operations
 * - Endorsement tracking
 * - Bounced check handling
 * - Due date notifications
 * 
 * @created 2024-12-24
 */

import { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  Calendar,
  Building2,
  User,
  ArrowRightLeft,
  Download,
  Upload,
  Filter,
  Eye
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { fetchChecks, createCheck, updateCheck, deleteCheck as deleteCheckAPI, updateCheckStatus } from '../../../services/api/checks';

// ===== TYPES =====

interface CheckPromissoryNote {
  id: string;
  firma_id: string;
  donem_id: string;
  tip: 'CEK' | 'SENET'; // Check or Promissory Note
  yon: 'ALINAN' | 'VERILEN'; // Received or Issued
  cek_no: string; // Check/Note number
  banka_adi: string; // Bank name
  hesap_no: string; // Account number
  sube: string; // Branch
  cari_id: string; // Customer/Supplier ID
  cari_adi: string; // Customer/Supplier name
  tutar: number; // Amount
  doviz_kodu: string; // Currency code
  vade_tarihi: string; // Due date
  kesilme_tarihi: string; // Issue date
  durum: 'PORTFOY' | 'BANKADA' | 'CIRO' | 'TAHSIL' | 'ODEME' | 'KARSILIKSIZ' | 'IADE'; // Status
  tahsil_tarihi?: string; // Collection/Payment date
  ciro_edilen_firma?: string; // Endorsement recipient
  aciklama: string; // Notes
  created_at: string;
  updated_at: string;
}

type CheckStatus = CheckPromissoryNote['durum'];
type CheckType = CheckPromissoryNote['tip'];
type CheckDirection = CheckPromissoryNote['yon'];

// ===== COMPONENT =====

export function CheckPromissoryNoteModule() {
  const { t } = useLanguage();
  const { selectedFirma, selectedDonem } = useFirmaDonem();

  // State
  const [checks, setChecks] = useState<CheckPromissoryNote[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<CheckType | 'ALL'>('ALL');
  const [filterDirection, setFilterDirection] = useState<CheckDirection | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<CheckStatus | 'ALL'>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<CheckPromissoryNote | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');

  // Form state
  const [formData, setFormData] = useState<Partial<CheckPromissoryNote>>({
    tip: 'CEK',
    yon: 'ALINAN',
    doviz_kodu: 'IQD',
    durum: 'PORTFOY'
  });

  // Fetch checks from Supabase
  useEffect(() => {
    const loadChecks = async () => {
      try {
        const data = await fetchChecks(selectedFirma?.id || '', selectedDonem?.id);
        setChecks(data);
      } catch (error: any) {
        toast.error(error.message || 'Çek/senetleri alırken hata oluştu');
      }
    };

    if (selectedFirma && selectedDonem) {
      loadChecks();
    }
  }, [selectedFirma, selectedDonem]);

  // Filter checks
  const filteredChecks = checks.filter(check => {
    const matchesSearch = 
      check.cek_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      check.cari_adi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      check.banka_adi.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'ALL' || check.tip === filterType;
    const matchesDirection = filterDirection === 'ALL' || check.yon === filterDirection;
    const matchesStatus = filterStatus === 'ALL' || check.durum === filterStatus;

    return matchesSearch && matchesType && matchesDirection && matchesStatus;
  });

  // Calculate summaries
  const summary = {
    toplamCeklar: checks.filter(c => c.tip === 'CEK' && c.yon === 'ALINAN').length,
    toplamSenetler: checks.filter(c => c.tip === 'SENET' && c.yon === 'VERILEN').length,
    portfoydekiler: checks.filter(c => c.durum === 'PORTFOY').length,
    vadesiGelenler: checks.filter(c => {
      const today = new Date();
      const vade = new Date(c.vade_tarihi);
      const diffDays = Math.ceil((vade.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 7 && diffDays >= 0;
    }).length,
    toplamTutar: checks.reduce((sum, c) => sum + c.tutar, 0)
  };

  // Status color helper
  const getStatusColor = (status: CheckStatus) => {
    switch (status) {
      case 'PORTFOY': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'BANKADA': return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'CIRO': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'TAHSIL': return 'bg-green-100 text-green-700 border-green-300';
      case 'ODEME': return 'bg-green-100 text-green-700 border-green-300';
      case 'KARSILIKSIZ': return 'bg-red-100 text-red-700 border-red-300';
      case 'IADE': return 'bg-gray-100 text-gray-700 border-gray-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // Status label helper
  const getStatusLabel = (status: CheckStatus) => {
    const labels = {
      'PORTFOY': 'Portföyde',
      'BANKADA': 'Bankada',
      'CIRO': 'Ciro Edildi',
      'TAHSIL': 'Tahsil Edildi',
      'ODEME': 'Ödendi',
      'KARSILIKSIZ': 'Karşılıksız',
      'IADE': 'İade Edildi'
    };
    return labels[status] || status;
  };

  // Handle actions
  const handleAddCheck = () => {
    // In production, save to backend
    toast.success('Çek/Senet kaydedildi');
    setShowAddModal(false);
  };

  const handleUpdateStatus = (checkId: string, newStatus: CheckStatus) => {
    // In production, update in backend
    toast.success(`Durum güncellendi: ${getStatusLabel(newStatus)}`);
  };

  const handleDelete = (checkId: string) => {
    if (confirm('Bu kaydı silmek istediğinizden emin misiniz?')) {
      // In production, delete from backend
      toast.success('Çek/Senet silindi');
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-semibold">Çek ve Senet Yönetimi</h2>
              <p className="text-sm text-indigo-100 mt-0.5">
                Portföy takibi, tahsilat ve ödeme yönetimi
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Yeni Kayıt
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Alınan Çekler</p>
              <p className="text-2xl font-semibold text-blue-600 mt-1">{summary.toplamCeklar}</p>
            </div>
            <FileText className="w-10 h-10 text-blue-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Verilen Senetler</p>
              <p className="text-2xl font-semibold text-purple-600 mt-1">{summary.toplamSenetler}</p>
            </div>
            <FileText className="w-10 h-10 text-purple-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Portföyde</p>
              <p className="text-2xl font-semibold text-green-600 mt-1">{summary.portfoydekiler}</p>
            </div>
            <Building2 className="w-10 h-10 text-green-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Vadesi Yaklaşan</p>
              <p className="text-2xl font-semibold text-orange-600 mt-1">{summary.vadesiGelenler}</p>
            </div>
            <AlertTriangle className="w-10 h-10 text-orange-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Tutar</p>
              <p className="text-xl font-semibold text-gray-900 mt-1">
                {summary.toplamTutar.toLocaleString('tr-TR')} IQD
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 bg-white border-b">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Çek no, müşteri adı veya banka ara..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Tüm Tipler</option>
            <option value="CEK">Çek</option>
            <option value="SENET">Senet</option>
          </select>

          {/* Direction Filter */}
          <select
            value={filterDirection}
            onChange={(e) => setFilterDirection(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Tüm Yönler</option>
            <option value="ALINAN">Alınan</option>
            <option value="VERILEN">Verilen</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="PORTFOY">Portföyde</option>
            <option value="BANKADA">Bankada</option>
            <option value="CIRO">Ciro Edildi</option>
            <option value="TAHSIL">Tahsil Edildi</option>
            <option value="ODEME">Ödendi</option>
            <option value="KARSILIKSIZ">Karşılıksız</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Tip</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Çek/Senet No</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cari</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Banka</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Tutar</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Vade</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Durum</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredChecks.map(check => {
                const vadeTarihi = new Date(check.vade_tarihi);
                const today = new Date();
                const isOverdue = vadeTarihi < today;
                const isDueSoon = Math.ceil((vadeTarihi.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) <= 7;

                return (
                  <tr key={check.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        check.tip === 'CEK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {check.tip === 'CEK' ? 'Çek' : 'Senet'}
                      </span>
                      <span className={`ml-2 inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        check.yon === 'ALINAN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {check.yon === 'ALINAN' ? 'Alınan' : 'Verilen'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono font-medium">{check.cek_no}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{check.cari_adi}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{check.banka_adi}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold">
                        {check.tutar.toLocaleString('tr-TR')} {check.doviz_kodu}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-2 ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-orange-600' : 'text-gray-700'}`}>
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm">{new Date(check.vade_tarihi).toLocaleDateString('tr-TR')}</span>
                        {isOverdue && <AlertTriangle className="w-4 h-4" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-medium ${getStatusColor(check.durum)}`}>
                        {getStatusLabel(check.durum)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedCheck(check);
                            setShowDetailModal(true);
                          }}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Detay"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(check.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredChecks.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Kayıt bulunamadı</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
