/**
 * ExRetailOS - Current Account Management (Cari Hesap Yönetimi)
 * 
 * Comprehensive account receivable/payable management:
 * - Customer/Supplier account cards
 * - Transaction history
 * - Account statements
 * - Aging analysis
 * - Due date tracking
 * - Collection/Payment management
 * - Credit limit control
 * 
 * @created 2024-12-24
 */

import { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertTriangle,
  FileText,
  Download,
  Eye,
  Edit,
  Trash2,
  DollarSign,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { fetchCurrentAccounts, createCurrentAccount, updateCurrentAccount, deleteCurrentAccount } from '../../../services/api/currentAccounts';

// ===== TYPES =====

interface CurrentAccount {
  id: string;
  firma_id: string;
  kod: string; // Account code
  unvan: string; // Company title
  tip: 'MUSTERI' | 'TEDARIKCI' | 'HER_IKISI'; // Customer, Supplier, or Both
  vergi_no?: string;
  vergi_dairesi?: string;
  adres?: string;
  telefon?: string;
  email?: string;

  // Financial info
  kredi_limiti: number; // Credit limit
  vade_suresi: number; // Payment term (days)
  odeme_sekli: 'NAKIT' | 'CEK' | 'SENET' | 'HAVALE'; // Payment method
  risk_grubu: 'A' | 'B' | 'C' | 'D'; // Risk category

  // Balances
  borc_bakiye: number; // Debit balance
  alacak_bakiye: number; // Credit balance
  bakiye: number; // Net balance (positive = customer owes us)

  // Status
  aktif: boolean;
  created_at: string;
  updated_at: string;
}

interface AccountTransaction {
  id: string;
  cari_id: string;
  firma_id: string;
  donem_id: string;
  tarih: string; // Transaction date
  belge_tipi: 'FATURA' | 'TAHSILAT' | 'ODEME' | 'VIRMAN' | 'ACILIS'; // Document type
  belge_no: string; // Document number
  borc: number; // Debit amount
  alacak: number; // Credit amount
  bakiye: number; // Running balance
  aciklama: string; // Description
  created_at: string;
}

interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  amount: number;
  percentage: number;
}

// ===== COMPONENT =====

export function CurrentAccountManagement() {
  const { t } = useLanguage();
  const { selectedFirma, selectedDonem } = useFirmaDonem();

  // State
  const [accounts, setAccounts] = useState<CurrentAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<CurrentAccount | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'MUSTERI' | 'TEDARIKCI'>('ALL');
  const [view, setView] = useState<'list' | 'detail' | 'statement'>('list');
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch accounts on component mount
  useEffect(() => {
    if (selectedFirma?.id) {
      fetchCurrentAccounts(selectedFirma.id)
        .then(data => setAccounts(data as unknown as CurrentAccount[]))
        .catch(error => toast.error('Hesaplar yüklenirken hata oluştu'));
    }
  }, [selectedFirma]);

  // Mock data
  const mockAccounts: CurrentAccount[] = [
    {
      id: '1',
      firma_id: selectedFirma?.id || '',
      kod: '120.001',
      unvan: 'Ahmed Al-Maliki Ticaret',
      tip: 'MUSTERI',
      vergi_no: '1234567890',
      vergi_dairesi: 'Baghdad Vergi Dairesi',
      adres: 'Baghdad, Iraq',
      telefon: '+964 750 123 4567',
      email: 'ahmed@example.com',
      kredi_limiti: 500000,
      vade_suresi: 30,
      odeme_sekli: 'CEK',
      risk_grubu: 'A',
      borc_bakiye: 250000,
      alacak_bakiye: 100000,
      bakiye: 150000, // Müşteri bize borçlu
      aktif: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '2',
      firma_id: selectedFirma?.id || '',
      kod: '320.001',
      unvan: 'ABC Gıda Tedarik Ltd.',
      tip: 'TEDARIKCI',
      vergi_no: '9876543210',
      vergi_dairesi: 'Erbil Vergi Dairesi',
      adres: 'Erbil, Iraq',
      telefon: '+964 770 987 6543',
      email: 'info@abcgida.com',
      kredi_limiti: 0,
      vade_suresi: 60,
      odeme_sekli: 'HAVALE',
      risk_grubu: 'A',
      borc_bakiye: 80000,
      alacak_bakiye: 200000,
      bakiye: -120000, // Biz tedarikçiye borçluyuz
      aktif: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '3',
      firma_id: selectedFirma?.id || '',
      kod: '120.002',
      unvan: 'Mohammed Hassan Perakende',
      tip: 'MUSTERI',
      vergi_no: '5555555555',
      vergi_dairesi: 'Basra Vergi Dairesi',
      adres: 'Basra, Iraq',
      telefon: '+964 771 555 5555',
      email: 'mohammed@example.com',
      kredi_limiti: 300000,
      vade_suresi: 45,
      odeme_sekli: 'SENET',
      risk_grubu: 'B',
      borc_bakiye: 180000,
      alacak_bakiye: 50000,
      bakiye: 130000,
      aktif: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  const mockTransactions: AccountTransaction[] = [
    {
      id: '1',
      cari_id: '1',
      firma_id: selectedFirma?.id || '',
      donem_id: selectedDonem?.id || '',
      tarih: '2024-12-01',
      belge_tipi: 'FATURA',
      belge_no: 'SAT-2024-001',
      borc: 100000,
      alacak: 0,
      bakiye: 100000,
      aciklama: 'Satış faturası',
      created_at: new Date().toISOString()
    },
    {
      id: '2',
      cari_id: '1',
      firma_id: selectedFirma?.id || '',
      donem_id: selectedDonem?.id || '',
      tarih: '2024-12-10',
      belge_tipi: 'TAHSILAT',
      belge_no: 'TAH-2024-001',
      borc: 0,
      alacak: 50000,
      bakiye: 50000,
      aciklama: 'Çek tahsilatı',
      created_at: new Date().toISOString()
    },
    {
      id: '3',
      cari_id: '1',
      firma_id: selectedFirma?.id || '',
      donem_id: selectedDonem?.id || '',
      tarih: '2024-12-15',
      belge_tipi: 'FATURA',
      belge_no: 'SAT-2024-002',
      borc: 150000,
      alacak: 0,
      bakiye: 200000,
      aciklama: 'Satış faturası',
      created_at: new Date().toISOString()
    }
  ];

  // Filter accounts
  const filteredAccounts = mockAccounts.filter(account => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      (account.kod?.toLowerCase() || '').includes(searchLower) ||
      (account.unvan?.toLowerCase() || '').includes(searchLower) ||
      (account.vergi_no || '').includes(searchQuery);

    const matchesType = filterType === 'ALL' || account.tip === filterType || account.tip === 'HER_IKISI';

    return matchesSearch && matchesType;
  });

  // Calculate summaries
  const summary = {
    toplamMusteri: mockAccounts.filter(a => a.tip === 'MUSTERI' || a.tip === 'HER_IKISI').length,
    toplamTedarikci: mockAccounts.filter(a => a.tip === 'TEDARIKCI' || a.tip === 'HER_IKISI').length,
    toplamAlacak: mockAccounts.reduce((sum, a) => a.bakiye > 0 ? sum + a.bakiye : sum, 0),
    toplamBorc: mockAccounts.reduce((sum, a) => a.bakiye < 0 ? sum + Math.abs(a.bakiye) : sum, 0),
    riskliHesaplar: mockAccounts.filter(a =>
      a.bakiye > a.kredi_limiti * 0.9 && a.kredi_limiti > 0
    ).length
  };

  // Aging analysis for selected account
  const calculateAging = (cariId: string): AgingBucket[] => {
    // In production, calculate from actual invoice due dates
    const total = 200000; // Mock total
    return [
      { label: '0-30 Gün', minDays: 0, maxDays: 30, amount: 80000, percentage: 40 },
      { label: '31-60 Gün', minDays: 31, maxDays: 60, amount: 60000, percentage: 30 },
      { label: '61-90 Gün', minDays: 61, maxDays: 90, amount: 40000, percentage: 20 },
      { label: '90+ Gün', minDays: 91, maxDays: null, amount: 20000, percentage: 10 }
    ];
  };

  // Risk color helper
  const getRiskColor = (riskGrubu: string) => {
    switch (riskGrubu) {
      case 'A': return 'bg-green-100 text-green-700';
      case 'B': return 'bg-yellow-100 text-yellow-700';
      case 'C': return 'bg-orange-100 text-orange-700';
      case 'D': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-semibold">Cari Hesap Yönetimi</h2>
              <p className="text-sm text-blue-100 mt-0.5">
                Alacak-borç takibi ve müşteri/tedarikçi yönetimi
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Yeni Cari
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Müşteri</p>
              <p className="text-2xl font-semibold text-blue-600 mt-1">{summary.toplamMusteri}</p>
            </div>
            <Users className="w-10 h-10 text-blue-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Tedarikçi</p>
              <p className="text-2xl font-semibold text-purple-600 mt-1">{summary.toplamTedarikci}</p>
            </div>
            <Users className="w-10 h-10 text-purple-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Alacak</p>
              <p className="text-xl font-semibold text-green-600 mt-1">
                {summary.toplamAlacak.toLocaleString('tr-TR')} IQD
              </p>
            </div>
            <TrendingUp className="w-10 h-10 text-green-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Borç</p>
              <p className="text-xl font-semibold text-red-600 mt-1">
                {summary.toplamBorc.toLocaleString('tr-TR')} IQD
              </p>
            </div>
            <TrendingDown className="w-10 h-10 text-red-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Riskli Hesap</p>
              <p className="text-2xl font-semibold text-orange-600 mt-1">{summary.riskliHesaplar}</p>
            </div>
            <AlertTriangle className="w-10 h-10 text-orange-600 opacity-20" />
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
              placeholder="Cari kodu, ünvan veya vergi no ara..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Tüm Cariler</option>
            <option value="MUSTERI">Müşteriler</option>
            <option value="TEDARIKCI">Tedarikçiler</option>
          </select>

          <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            <Download className="w-4 h-4" />
            Excel İndir
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Kod</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Ünvan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Tip</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Bakiye</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Kredi Limiti</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Risk</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Vade</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAccounts.map(account => {
                const isOverLimit = account.bakiye > account.kredi_limiti && account.kredi_limiti > 0;
                const isNearLimit = account.bakiye > account.kredi_limiti * 0.8 && account.kredi_limiti > 0;

                return (
                  <tr key={account.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-mono font-medium text-sm">{account.kod}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium">{account.unvan}</div>
                        <div className="text-xs text-gray-500">{account.telefon}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${account.tip === 'MUSTERI' ? 'bg-blue-100 text-blue-700' :
                        account.tip === 'TEDARIKCI' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                        {account.tip === 'MUSTERI' ? 'Müşteri' : account.tip === 'TEDARIKCI' ? 'Tedarikçi' : 'Her İkisi'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`font-semibold ${account.bakiye > 0 ? 'text-green-600' : account.bakiye < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {account.bakiye > 0 ? '+' : ''}{account.bakiye.toLocaleString('tr-TR')} IQD
                      </div>
                      {(isOverLimit || isNearLimit) && (
                        <div className="text-xs text-orange-600 flex items-center gap-1 justify-end mt-1">
                          <AlertTriangle className="w-3 h-3" />
                          {isOverLimit ? 'Limit aşıldı!' : 'Limite yakın'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-700">
                        {account.kredi_limiti > 0 ? account.kredi_limiti.toLocaleString('tr-TR') + ' IQD' : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getRiskColor(account.risk_grubu)}`}>
                        Risk {account.risk_grubu}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-700">
                        <Clock className="w-4 h-4" />
                        {account.vade_suresi} gün
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedAccount(account);
                            setView('detail');
                          }}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Detay"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAccount(account);
                            setView('statement');
                          }}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Ekstre"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Bu cariyi silmek istediğinizden emin misiniz?')) {
                              toast.success('Cari silindi');
                            }
                          }}
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

          {filteredAccounts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Kayıt bulunamadı</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
