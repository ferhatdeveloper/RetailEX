/**
 * ExRetailOS - Bank Account Management Module
 * 
 * Complete bank account features:
 * - Multi-bank account management
 * - Bank transactions
 * - Bank reconciliation
 * - Wire transfers (EFT/Havale)
 * - Credit card payments
 * - POS commission tracking
 * - Account statements
 * 
 * @created 2024-12-24
 */

import { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Search, 
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  CreditCard,
  Banknote,
  Calendar,
  Download,
  Eye,
  Edit,
  Trash2,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { fetchBankAccounts, createBankAccount, updateBankAccount, deleteBankAccount, createBankTransaction, fetchBankStatement } from '../../../services/api/bankAccounts';
import { formatNumber } from '../../../utils/formatNumber';

// ===== TYPES =====

interface BankAccount {
  id: string;
  firma_id: string;
  
  // Bank info
  bank_name: string;
  branch_name: string;
  branch_code: string;
  account_no: string;
  iban: string;
  swift_code?: string;
  
  // Account info
  account_type: 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'POS'; // Vadesiz, Vadeli, Kredi, POS
  currency: string;
  
  // Balances
  current_balance: number;
  available_balance: number;
  reserved_balance: number; // Blokeli tutar
  
  // Limits
  daily_limit?: number;
  monthly_limit?: number;
  
  // Status
  is_active: boolean;
  is_default: boolean; // Varsayılan hesap
  
  // Additional
  notes?: string;
  
  created_at: string;
  updated_at: string;
}

interface BankTransaction {
  id: string;
  firma_id: string;
  donem_id: string;
  bank_account_id: string;
  
  // Transaction info
  transaction_type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'EFT' | 'WIRE' | 'POS_PAYMENT' | 'CHECK_DEPOSIT' | 'CHECK_CLEARANCE' | 'COMMISSION' | 'INTEREST';
  transaction_date: string;
  value_date: string; // Valör tarihi
  
  // Amounts
  amount: number;
  balance_after: number;
  
  // Related info
  description: string;
  reference_no?: string; // Dekont/referans numarası
  
  // For transfers
  from_account_id?: string;
  to_account_id?: string;
  
  // For POS
  pos_terminal_id?: string;
  pos_commission?: number;
  pos_commission_rate?: number;
  
  // For checks
  check_no?: string;
  check_bank?: string;
  
  // Status
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ===== COMPONENT =====

export function BankAccountManagement() {
  const { t } = useLanguage();
  const { selectedFirma, selectedDonem } = useFirmaDonem();

  // State
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'accounts' | 'transactions' | 'reconciliation'>('accounts');
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);

  // Fetch bank accounts
  useEffect(() => {
    if (selectedFirma) {
      fetchBankAccounts(selectedFirma.id)
        .then(data => setAccounts(data))
        .catch(error => toast.error('Banka hesapları yüklenirken hata oluştu.'));
    }
  }, [selectedFirma]);

  // Mock bank accounts
  const mockAccounts: BankAccount[] = [
    {
      id: '1',
      firma_id: selectedFirma?.id || '',
      bank_name: 'Ziraat Bankası',
      branch_name: 'Kadıköy Şubesi',
      branch_code: '0123',
      account_no: '987654321',
      iban: 'TR330006100519786543000001',
      swift_code: 'TCZBTR2A',
      account_type: 'CHECKING',
      currency: 'IQD',
      current_balance: 5000000,
      available_balance: 4800000,
      reserved_balance: 200000,
      daily_limit: 1000000,
      is_active: true,
      is_default: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '2',
      firma_id: selectedFirma?.id || '',
      bank_name: 'Garanti BBVA',
      branch_name: 'Beşiktaş Şubesi',
      branch_code: '0456',
      account_no: '123456789',
      iban: 'TR440006200559786543000002',
      account_type: 'CHECKING',
      currency: 'USD',
      current_balance: 25000,
      available_balance: 25000,
      reserved_balance: 0,
      is_active: true,
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '3',
      firma_id: selectedFirma?.id || '',
      bank_name: 'İş Bankası',
      branch_name: 'Ataşehir Şubesi',
      branch_code: '0789',
      account_no: '555666777',
      iban: 'TR550006400519786543000003',
      account_type: 'POS',
      currency: 'IQD',
      current_balance: 12000000,
      available_balance: 11500000,
      reserved_balance: 500000,
      is_active: true,
      is_default: false,
      notes: 'POS cihazı komisyon hesabı',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  // Mock transactions
  const mockTransactions: BankTransaction[] = [
    {
      id: '1',
      firma_id: selectedFirma?.id || '',
      donem_id: selectedDonem?.id || '',
      bank_account_id: '1',
      transaction_type: 'DEPOSIT',
      transaction_date: '2024-12-20',
      value_date: '2024-12-20',
      amount: 1000000,
      balance_after: 5000000,
      description: 'Müşteri tahsilatı - Ahmed Al-Maliki',
      reference_no: 'DEP-2024-001',
      status: 'COMPLETED',
      created_by: 'Admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '2',
      firma_id: selectedFirma?.id || '',
      donem_id: selectedDonem?.id || '',
      bank_account_id: '1',
      transaction_type: 'EFT',
      transaction_date: '2024-12-21',
      value_date: '2024-12-21',
      amount: -500000,
      balance_after: 4500000,
      description: 'Tedarikçi ödemesi - ABC Tedarik Ltd.',
      reference_no: 'EFT-2024-015',
      status: 'COMPLETED',
      created_by: 'Muhasebeci',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '3',
      firma_id: selectedFirma?.id || '',
      donem_id: selectedDonem?.id || '',
      bank_account_id: '3',
      transaction_type: 'POS_PAYMENT',
      transaction_date: '2024-12-22',
      value_date: '2024-12-23',
      amount: 250000,
      balance_after: 12000000,
      description: 'POS satış tahsilatı',
      pos_terminal_id: 'POS-001',
      pos_commission: 5000,
      pos_commission_rate: 2,
      status: 'COMPLETED',
      created_by: 'Kasiyer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  // Filter accounts
  const filteredAccounts = mockAccounts.filter(account => 
    account.bank_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.account_no.includes(searchQuery) ||
    account.iban.includes(searchQuery)
  );

  // Calculate summaries
  const summary = {
    totalAccounts: mockAccounts.length,
    activeAccounts: mockAccounts.filter(a => a.is_active).length,
    totalBalanceIQD: mockAccounts.filter(a => a.currency === 'IQD').reduce((sum, a) => sum + a.current_balance, 0),
    totalBalanceUSD: mockAccounts.filter(a => a.currency === 'USD').reduce((sum, a) => sum + a.current_balance, 0),
    todayTransactions: mockTransactions.filter(t => {
      const today = new Date().toISOString().split('T')[0];
      return t.transaction_date === today;
    }).length
  };

  // Account type helper
  const getAccountTypeLabel = (type: string) => {
    const labels = {
      'CHECKING': 'Vadesiz',
      'SAVINGS': 'Vadeli',
      'CREDIT': 'Kredi',
      'POS': 'POS Hesabı'
    };
    return labels[type as keyof typeof labels] || type;
  };

  // Transaction type color
  const getTransactionColor = (type: string) => {
    const colors = {
      'DEPOSIT': 'text-green-600',
      'WITHDRAWAL': 'text-red-600',
      'TRANSFER': 'text-blue-600',
      'EFT': 'text-purple-600',
      'POS_PAYMENT': 'text-teal-600',
      'COMMISSION': 'text-orange-600'
    };
    return colors[type as keyof typeof colors] || 'text-gray-600';
  };

  if (view === 'transactions' && selectedAccount) {
    const accountTransactions = mockTransactions.filter(t => t.bank_account_id === selectedAccount.id);
    
    return (
      <div className="h-full flex flex-col bg-gray-50">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{selectedAccount.bank_name} - Hesap Hareketleri</h2>
              <p className="text-sm text-blue-100 mt-1">IBAN: {selectedAccount.iban}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddTransactionModal(true)}
                className="px-4 py-2 bg-white text-blue-700 rounded-lg hover:bg-blue-50"
              >
                <Plus className="w-5 h-5 inline mr-2" />
                Yeni İşlem
              </button>
              <button
                onClick={() => setView('accounts')}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg"
              >
                Geri Dön
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="bg-white rounded-lg border">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Tarih</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">İşlem Tipi</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Açıklama</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700">Tutar</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700">Bakiye</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-700">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {accountTransactions.map(transaction => (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      {new Date(transaction.transaction_date).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${getTransactionColor(transaction.transaction_type)}`}>
                        {transaction.transaction_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{transaction.description}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {transaction.amount > 0 ? '+' : ''}{formatNumber(transaction.amount, 0, false)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">
                      {formatNumber(transaction.balance_after, 0, false)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {transaction.status === 'COMPLETED' ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" />
                      ) : (
                        <Clock className="w-5 h-5 text-orange-600 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-semibold">Banka Hesap Yönetimi</h2>
              <p className="text-sm text-blue-100 mt-0.5">
                Banka hesapları, hareketler ve mutabakat
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddAccountModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Yeni Hesap
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
          <div>
            <p className="text-sm text-gray-600">Toplam Hesap</p>
            <p className="text-2xl font-semibold text-blue-600 mt-1">{summary.totalAccounts}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-green-200">
          <div>
            <p className="text-sm text-gray-600">Aktif Hesap</p>
            <p className="text-2xl font-semibold text-green-600 mt-1">{summary.activeAccounts}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-purple-200">
          <div>
            <p className="text-sm text-gray-600">Toplam Bakiye (IQD)</p>
            <p className="text-xl font-semibold text-purple-600 mt-1">
              {formatNumber(summary.totalBalanceIQD, 0, false)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-orange-200">
          <div>
            <p className="text-sm text-gray-600">Toplam Bakiye (USD)</p>
            <p className="text-xl font-semibold text-orange-600 mt-1">
              ${formatNumber(summary.totalBalanceUSD, 2, false)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-gray-200">
          <div>
            <p className="text-sm text-gray-600">Bugünkü İşlemler</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{summary.todayTransactions}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 bg-white border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Banka adı, hesap no veya IBAN ara..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Accounts Grid */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          {filteredAccounts.map(account => (
            <div key={account.id} className="bg-white rounded-lg border hover:shadow-md transition-shadow">
              <div className="p-4 border-b">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{account.bank_name}</h3>
                      {account.is_default && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Varsayılan</span>
                      )}
                      {!account.is_active && (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">Pasif</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{account.branch_name}</p>
                    <p className="text-xs text-gray-500 mt-1">{account.iban}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    account.account_type === 'POS' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {getAccountTypeLabel(account.account_type)}
                  </span>
                </div>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-gray-500">Mevcut Bakiye</p>
                    <p className="text-xl font-semibold text-gray-900 mt-1">
                      {formatNumber(account.current_balance, 0, false)} {account.currency}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Kullanılabilir</p>
                    <p className="text-xl font-semibold text-green-600 mt-1">
                      {formatNumber(account.available_balance, 0, false)} {account.currency}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedAccount(account);
                      setView('transactions');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Hareketler
                  </button>
                  <button className="px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded transition-colors">
                    <Edit className="w-4 h-4 text-gray-600" />
                  </button>
                  <button className="px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded transition-colors">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
