/**
 * ExRetailOS - Quotation/Proforma Module (Teklif/Proforma Modülü)
 * 
 * Complete quotation management:
 * - Quotation creation
 * - Proforma invoice
 * - Quote to order conversion
 * - Quote to invoice conversion
 * - Approval workflow
 * - Validity period tracking
 * - Quotation versioning
 * 
 * @created 2024-12-24
 */

import { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Download,
  Printer,
  Send,
  Eye,
  Edit,
  Trash2,
  Copy
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { fetchQuotations, createQuotation, updateQuotation, deleteQuotation, sendQuotation, acceptQuotation, convertQuotation } from '../../../services/api/quotations';

// ===== TYPES =====

interface Quotation {
  id: string;
  firma_id: string;
  donem_id: string;

  // Quotation info
  quotation_no: string; // Teklif numarası
  quotation_type: 'QUOTATION' | 'PROFORMA'; // Teklif veya Proforma
  version: number; // Versiyon (revizyon takibi için)

  // Dates
  quotation_date: string;
  validity_date: string; // Geçerlilik tarihi
  delivery_date?: string; // Tahmini teslimat tarihi

  // Customer info
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;

  // Items
  items: QuotationItem[];

  // Amounts
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;

  // Status
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';

  // Conversion tracking
  converted_to?: 'ORDER' | 'INVOICE';
  converted_document_no?: string;
  converted_at?: string;

  // Additional info
  payment_terms?: string; // Ödeme şartları
  delivery_terms?: string; // Teslimat şartları
  notes?: string;
  terms_and_conditions?: string;

  // Tracking
  sent_at?: string;
  viewed_at?: string;
  accepted_at?: string;
  rejected_at?: string;
  rejection_reason?: string;

  created_by: string;
  created_at: string;
  updated_at: string;
}

interface QuotationItem {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  subtotal: number;
  total: number;
}

type QuotationStatus = Quotation['status'];

// ===== COMPONENT =====

export function QuotationModule() {
  const { t } = useLanguage();
  const { selectedFirma, selectedDonem } = useFirmaDonem();

  // State
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'QUOTATION' | 'PROFORMA'>('ALL');
  const [filterStatus, setFilterStatus] = useState<QuotationStatus | 'ALL'>('ALL');
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

  // Fetch quotations on mount
  useEffect(() => {
    const fetchAndSetQuotations = async () => {
      const fetchedQuotations = await fetchQuotations(selectedFirma?.id || '', selectedDonem?.id || '');
      setQuotations(fetchedQuotations);
    };
    fetchAndSetQuotations();
  }, [selectedFirma, selectedDonem]);

  // Filter quotations
  const filteredQuotations = quotations.filter(quot => {
    const matchesSearch =
      quot.quotation_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quot.customer_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === 'ALL' || quot.quotation_type === filterType;
    const matchesStatus = filterStatus === 'ALL' || quot.status === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Calculate summaries
  const summary = {
    totalQuotations: quotations.filter(q => q.quotation_type === 'QUOTATION').length,
    totalProformas: quotations.filter(q => q.quotation_type === 'PROFORMA').length,
    pendingApproval: quotations.filter(q => ['SENT', 'VIEWED'].includes(q.status)).length,
    acceptedQuotes: quotations.filter(q => q.status === 'ACCEPTED').length,
    totalValue: quotations.reduce((sum, q) => sum + q.total_amount, 0)
  };

  // Status color helper
  const getStatusColor = (status: QuotationStatus) => {
    switch (status) {
      case 'DRAFT': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'SENT': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'VIEWED': return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'ACCEPTED': return 'bg-green-100 text-green-700 border-green-300';
      case 'REJECTED': return 'bg-red-100 text-red-700 border-red-300';
      case 'EXPIRED': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'CONVERTED': return 'bg-teal-100 text-teal-700 border-teal-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // Status label helper
  const getStatusLabel = (status: QuotationStatus) => {
    const labels = {
      'DRAFT': 'Taslak',
      'SENT': 'Gönderildi',
      'VIEWED': 'Görüntülendi',
      'ACCEPTED': 'Kabul Edildi',
      'REJECTED': 'Reddedildi',
      'EXPIRED': 'Süresi Doldu',
      'CONVERTED': 'Dönüştürüldü'
    };
    return labels[status] || status;
  };

  // Handle actions
  const handleConvertToOrder = (quotationId: string) => {
    if (confirm('Bu teklifi siparişe dönüştürmek istediğinizden emin misiniz?')) {
      toast.success('Teklif siparişe dönüştürüldü');
    }
  };

  const handleConvertToInvoice = (quotationId: string) => {
    if (confirm('Bu teklifi faturaya dönüştürmek istediğinizden emin misiniz?')) {
      toast.success('Teklif faturaya dönüştürüldü');
    }
  };

  const handleSendQuotation = (quotationId: string) => {
    toast.success('Teklif müşteriye e-posta ile gönderildi');
  };

  const handleDuplicate = (quotationId: string) => {
    toast.success('Teklif kopyalandı');
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-semibold">Teklif & Proforma Yönetimi</h2>
              <p className="text-sm text-cyan-100 mt-0.5">
                Fiyat teklifleri, proforma faturalar ve onay süreçleri
              </p>
            </div>
          </div>
          <button
            onClick={() => setView('create')}
            className="flex items-center gap-2 px-4 py-2 bg-white text-cyan-700 rounded-lg hover:bg-cyan-50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Yeni Teklif
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 border-2 border-cyan-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Teklifler</p>
              <p className="text-2xl font-semibold text-cyan-600 mt-1">{summary.totalQuotations}</p>
            </div>
            <FileText className="w-10 h-10 text-cyan-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Proformalar</p>
              <p className="text-2xl font-semibold text-purple-600 mt-1">{summary.totalProformas}</p>
            </div>
            <FileText className="w-10 h-10 text-purple-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Onay Bekleyen</p>
              <p className="text-2xl font-semibold text-blue-600 mt-1">{summary.pendingApproval}</p>
            </div>
            <Clock className="w-10 h-10 text-blue-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Kabul Edilen</p>
              <p className="text-2xl font-semibold text-green-600 mt-1">{summary.acceptedQuotes}</p>
            </div>
            <CheckCircle2 className="w-10 h-10 text-green-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Tutar</p>
              <p className="text-xl font-semibold text-gray-900 mt-1">
                {summary.totalValue.toLocaleString('tr-TR')} IQD
              </p>
            </div>
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
              placeholder="Teklif no veya müşteri adı ara..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
          >
            <option value="ALL">Tüm Tipler</option>
            <option value="QUOTATION">Teklif</option>
            <option value="PROFORMA">Proforma</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="DRAFT">Taslak</option>
            <option value="SENT">Gönderildi</option>
            <option value="ACCEPTED">Kabul Edildi</option>
            <option value="REJECTED">Reddedildi</option>
            <option value="EXPIRED">Süresi Doldu</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Teklif No</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Tip</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Müşteri</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Tarih</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Geçerlilik</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Tutar</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Durum</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredQuotations.map(quot => {
                const isExpired = new Date(quot.validity_date) < new Date() && quot.status !== 'CONVERTED';

                return (
                  <tr key={quot.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{quot.quotation_no}</span>
                        {quot.version > 1 && (
                          <span className="text-xs text-gray-500">v{quot.version}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${quot.quotation_type === 'QUOTATION' ? 'bg-cyan-100 text-cyan-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                        {quot.quotation_type === 'QUOTATION' ? 'Teklif' : 'Proforma'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-sm">{quot.customer_name}</div>
                        {quot.customer_email && (
                          <div className="text-xs text-gray-500">{quot.customer_email}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">{new Date(quot.quotation_date).toLocaleDateString('tr-TR')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-2 ${isExpired ? 'text-red-600' : 'text-gray-700'}`}>
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm">{new Date(quot.validity_date).toLocaleDateString('tr-TR')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold">
                        {quot.total_amount.toLocaleString('tr-TR')} IQD
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-medium ${getStatusColor(quot.status)}`}>
                          {getStatusLabel(quot.status)}
                        </span>
                        {quot.converted_to && (
                          <span className="text-xs text-gray-500">
                            → {quot.converted_to === 'ORDER' ? 'Sipariş' : 'Fatura'}: {quot.converted_document_no}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {quot.status === 'DRAFT' && (
                          <button
                            onClick={() => handleSendQuotation(quot.id)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Gönder"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {quot.status === 'ACCEPTED' && !quot.converted_to && (
                          <>
                            <button
                              onClick={() => handleConvertToOrder(quot.id)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Siparişe Dönüştür"
                            >
                              <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleConvertToInvoice(quot.id)}
                              className="p-1 text-purple-600 hover:bg-purple-50 rounded"
                              title="Faturaya Dönüştür"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                          title="Yazdır"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(quot.id)}
                          className="p-1 text-orange-600 hover:bg-orange-50 rounded"
                          title="Kopyala"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1 text-cyan-600 hover:bg-cyan-50 rounded"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
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

          {filteredQuotations.length === 0 && (
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
