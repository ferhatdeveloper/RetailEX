/**
 * ExRetailOS - Chart of Accounts Management (Hesap Planı Yönetimi)
 * 
 * Comprehensive chart of accounts features:
 * - Turkish Uniform Chart of Accounts (TDHP) template
 * - Logo Accounting compatible structure
 * - Hierarchical account tree view
 * - Account balances calculation
 * - Multi-currency account support
 * - Custom account creation
 * 
 * @created 2024-12-24
 */

import { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  ChevronRight,
  ChevronDown,
  Banknote,
  TrendingUp,
  TrendingDown,
  Eye,
  Download,
  Upload
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { fetchChartOfAccounts, createAccount, updateAccount, deleteAccount, importTDHP, fetchAccountHierarchy } from '../../../services/api/chartOfAccounts';

// ===== TYPES =====

interface ChartOfAccount {
  id: string;
  firma_id: string;
  hesap_kodu: string; // Account code (e.g., "100", "100.01", "100.01.001")
  hesap_adi: string; // Account name
  ust_hesap_kodu: string | null; // Parent account code
  hesap_tipi: 'AKTIF' | 'PASIF' | 'GELIR' | 'GIDER' | 'SERMAYE'; // Account type
  borc_alacak_yonu: 'BORC' | 'ALACAK' | 'HER_IKISI'; // Debit/Credit direction
  doviz_cinsi: string; // Currency code
  
  // Balances
  borc_bakiye: number; // Debit balance
  alacak_bakiye: number; // Credit balance
  bakiye: number; // Net balance
  
  // Flags
  ana_hesap: boolean; // Is main account (has sub-accounts)
  detay_hesap: boolean; // Is detail account (can have transactions)
  aktif: boolean; // Is active
  
  // Additional info
  aciklama: string; // Description
  raporlama_grubu: string; // Reporting group
  
  created_at: string;
  updated_at: string;
}

// Turkish Uniform Chart of Accounts (Tek Düzen Hesap Planı) - Sample
const TDHP_TEMPLATE: Partial<ChartOfAccount>[] = [
  // 1XX - DÖNEN VARLIKLAR (Current Assets)
  { hesap_kodu: '100', hesap_adi: 'Kasa', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '101', hesap_adi: 'Alınan Çekler', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '102', hesap_adi: 'Bankalar', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: true, detay_hesap: false },
  { hesap_kodu: '102.01', hesap_adi: 'Ziraat Bankası', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true, ust_hesap_kodu: '102' },
  { hesap_kodu: '102.02', hesap_adi: 'Garanti BBVA', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true, ust_hesap_kodu: '102' },
  { hesap_kodu: '108', hesap_adi: 'Diğer Hazır Değerler', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  
  { hesap_kodu: '120', hesap_adi: 'Alıcılar', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: true, detay_hesap: false },
  { hesap_kodu: '121', hesap_adi: 'Alacak Senetleri', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '128', hesap_adi: 'Şüpheli Ticari Alacaklar', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  
  { hesap_kodu: '150', hesap_adi: 'İlk Madde ve Malzeme', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '153', hesap_adi: 'Ticari Mallar', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '157', hesap_adi: 'Diğer Stoklar', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  
  { hesap_kodu: '191', hesap_adi: 'İndirilecek TAX', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  
  // 2XX - DURAN VARLIKLAR (Fixed Assets)
  { hesap_kodu: '253', hesap_adi: 'Taşıtlar', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '254', hesap_adi: 'Demirbaşlar', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '257', hesap_adi: 'Birikmiş Amortismanlar', hesap_tipi: 'AKTIF', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  
  // 3XX - KISA VADELİ YABANCI KAYNAKLAR (Current Liabilities)
  { hesap_kodu: '300', hesap_adi: 'Banka Kredileri', hesap_tipi: 'PASIF', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '320', hesap_adi: 'Satıcılar', hesap_tipi: 'PASIF', borc_alacak_yonu: 'ALACAK', ana_hesap: true, detay_hesap: false },
  { hesap_kodu: '321', hesap_adi: 'Borç Senetleri', hesap_tipi: 'PASIF', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  
  { hesap_kodu: '360', hesap_adi: 'Ödenecek Vergi ve Fonlar', hesap_tipi: 'PASIF', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '361', hesap_adi: 'Ödenecek Sosyal Güvenlik Kesintileri', hesap_tipi: 'PASIF', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  
  { hesap_kodu: '391', hesap_adi: 'Hesaplanan TAX', hesap_tipi: 'PASIF', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  
  // 5XX - ÖZSERMAYE (Equity)
  { hesap_kodu: '500', hesap_adi: 'Sermaye', hesap_tipi: 'SERMAYE', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '570', hesap_adi: 'Geçmiş Yıl Karları', hesap_tipi: 'SERMAYE', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '580', hesap_adi: 'Geçmiş Yıl Zararları', hesap_tipi: 'SERMAYE', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '590', hesap_adi: 'Dönem Net Karı', hesap_tipi: 'SERMAYE', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '591', hesap_adi: 'Dönem Net Zararı', hesap_tipi: 'SERMAYE', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  
  // 6XX - GELİR HESAPLARI (Revenue Accounts)
  { hesap_kodu: '600', hesap_adi: 'Yurtiçi Satışlar', hesap_tipi: 'GELIR', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '601', hesap_adi: 'Yurtdışı Satışlar', hesap_tipi: 'GELIR', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '610', hesap_adi: 'Satıştan İadeler (-)', hesap_tipi: 'GELIR', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '611', hesap_adi: 'Satış İskontoları (-)', hesap_tipi: 'GELIR', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '646', hesap_adi: 'Kur Farkı Gelirleri', hesap_tipi: 'GELIR', borc_alacak_yonu: 'ALACAK', ana_hesap: false, detay_hesap: true },
  
  // 7XX - GİDER HESAPLARI (Expense Accounts)
  { hesap_kodu: '710', hesap_adi: 'Direkt İlk Madde ve Malzeme Giderleri', hesap_tipi: 'GIDER', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '720', hesap_adi: 'Satılan Ticari Mallar Maliyeti', hesap_tipi: 'GIDER', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '730', hesap_adi: 'Genel Üretim Giderleri', hesap_tipi: 'GIDER', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '760', hesap_adi: 'Pazarlama Satış ve Dağıtım Giderleri', hesap_tipi: 'GIDER', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '770', hesap_adi: 'Genel Yönetim Giderleri', hesap_tipi: 'GIDER', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '780', hesap_adi: 'Finansman Giderleri', hesap_tipi: 'GIDER', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true },
  { hesap_kodu: '796', hesap_adi: 'Kur Farkı Giderleri', hesap_tipi: 'GIDER', borc_alacak_yonu: 'BORC', ana_hesap: false, detay_hesap: true }
];

// ===== COMPONENT =====

export function ChartOfAccountsManagement() {
  const { t } = useLanguage();
  const { selectedFirma } = useFirmaDonem();

  // State
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'AKTIF' | 'PASIF' | 'GELIR' | 'GIDER' | 'SERMAYE'>('ALL');
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<ChartOfAccount | null>(null);

  // Fetch accounts on component mount
  useEffect(() => {
    if (selectedFirma) {
      fetchChartOfAccounts(selectedFirma.id)
        .then(data => setAccounts(data))
        .catch(error => toast.error('Hesap planı yüklenirken hata oluştu'));
    }
  }, [selectedFirma]);

  // Filter accounts
  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = 
      account.hesap_kodu.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.hesap_adi.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'ALL' || account.hesap_tipi === filterType;

    return matchesSearch && matchesType;
  });

  // Build account tree
  const buildTree = (accounts: ChartOfAccount[]) => {
    const tree: ChartOfAccount[] = [];
    const accountMap = new Map<string, ChartOfAccount & { children?: ChartOfAccount[] }>();

    // Create map
    accounts.forEach(account => {
      accountMap.set(account.hesap_kodu, { ...account, children: [] });
    });

    // Build hierarchy
    accounts.forEach(account => {
      const node = accountMap.get(account.hesap_kodu)!;
      if (account.ust_hesap_kodu) {
        const parent = accountMap.get(account.ust_hesap_kodu);
        if (parent) {
          parent.children!.push(node);
        }
      } else {
        tree.push(node);
      }
    });

    return tree;
  };

  const accountTree = buildTree(filteredAccounts);

  // Toggle expand/collapse
  const toggleExpand = (hesapKodu: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(hesapKodu)) {
      newExpanded.delete(hesapKodu);
    } else {
      newExpanded.add(hesapKodu);
    }
    setExpandedAccounts(newExpanded);
  };

  // Type color helper
  const getTypeColor = (tip: string) => {
    switch (tip) {
      case 'AKTIF': return 'bg-blue-100 text-blue-700';
      case 'PASIF': return 'bg-red-100 text-red-700';
      case 'GELIR': return 'bg-green-100 text-green-700';
      case 'GIDER': return 'bg-orange-100 text-orange-700';
      case 'SERMAYE': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Recursive tree renderer
  const renderAccountTree = (accounts: (ChartOfAccount & { children?: ChartOfAccount[] })[], level: number = 0) => {
    return accounts.map(account => {
      const hasChildren = account.children && account.children.length > 0;
      const isExpanded = expandedAccounts.has(account.hesap_kodu);
      const paddingLeft = `${level * 1.5 + 1}rem`;

      return (
        <div key={account.hesap_kodu}>
          <div className="flex items-center hover:bg-gray-50 border-b border-gray-100 py-2">
            <div className="px-4 flex items-center gap-2" style={{ paddingLeft }}>
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(account.hesap_kodu)}
                  className="p-0.5 hover:bg-gray-200 rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  )}
                </button>
              ) : (
                <div className="w-5" />
              )}
              <span className="font-mono text-sm font-medium w-32">{account.hesap_kodu}</span>
            </div>
            <div className="flex-1 px-4">
              <span className="text-sm">{account.hesap_adi}</span>
            </div>
            <div className="px-4 w-32">
              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getTypeColor(account.hesap_tipi)}`}>
                {account.hesap_tipi}
              </span>
            </div>
            <div className="px-4 w-32">
              <span className="text-sm">{account.borc_alacak_yonu}</span>
            </div>
            <div className="px-4 w-40 text-right">
              <span className={`text-sm font-medium ${account.bakiye > 0 ? 'text-green-600' : account.bakiye < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {account.bakiye.toLocaleString('tr-TR')} {account.doviz_cinsi}
              </span>
            </div>
            <div className="px-4 w-32">
              <div className="flex items-center justify-center gap-2">
                <button
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                  title="Düzenle"
                >
                  <Edit className="w-4 h-4" />
                </button>
                {account.detay_hesap && (
                  <button
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    title="Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          {hasChildren && isExpanded && renderAccountTree(account.children!, level + 1)}
        </div>
      );
    });
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-semibold">Hesap Planı Yönetimi</h2>
              <p className="text-sm text-indigo-100 mt-0.5">
                Tek Düzen Hesap Planı (TDHP) - Logo Uyumlu
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => importTDHP(selectedFirma?.id || '').then(() => toast.success('TDHP şablonu yüklendi')).catch(error => toast.error('TDHP şablonu yüklenirken hata oluştu'))}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              TDHP Şablonu
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Yeni Hesap
            </button>
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
              placeholder="Hesap kodu veya hesap adı ara..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Tüm Hesaplar</option>
            <option value="AKTIF">Aktif Hesaplar</option>
            <option value="PASIF">Pasif Hesaplar</option>
            <option value="GELIR">Gelir Hesapları</option>
            <option value="GIDER">Gider Hesapları</option>
            <option value="SERMAYE">Özsermaye</option>
          </select>

          <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            <Download className="w-4 h-4" />
            Excel İndir
          </button>
        </div>
      </div>

      {/* Account Tree */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-lg border overflow-hidden">
          {/* Header Row */}
          <div className="flex items-center bg-gray-50 border-b font-medium text-xs text-gray-700 uppercase">
            <div className="px-4 py-3 w-48">Hesap Kodu</div>
            <div className="flex-1 px-4 py-3">Hesap Adı</div>
            <div className="px-4 py-3 w-32">Tip</div>
            <div className="px-4 py-3 w-32">Yön</div>
            <div className="px-4 py-3 w-40 text-right">Bakiye</div>
            <div className="px-4 py-3 w-32 text-center">İşlemler</div>
          </div>

          {/* Account Tree */}
          {renderAccountTree(accountTree)}

          {accountTree.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Kayıt bulunamadı</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
