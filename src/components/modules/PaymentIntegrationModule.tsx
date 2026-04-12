import React, { useState } from 'react';
import {
  CreditCard, Banknote, CheckCircle, XCircle, Clock, AlertCircle,
  Search, Filter, Download, Settings, RefreshCw, Eye, Send, Copy,
  TrendingUp, Shield, Zap, Globe, Link2, Activity, BarChart3,
  FileText, Plus, Edit2, Trash2, Phone, Mail, Key, Lock
} from 'lucide-react';

interface PaymentGateway {
  id: string;
  name: string;
  code: 'iyzico' | 'paytr' | 'sanal-pos' | 'paypal' | 'stripe' | 'fib' | 'fastpay' | 'nasswallet';
  logo: string;
  color: string;
  isActive: boolean;
  region?: 'turkey' | 'iraq' | 'global';
  credentials: {
    apiKey: string;
    secretKey: string;
    merchantId: string;
  };
  stats: {
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    totalAmount: number;
    commission: number;
  };
  commissionRate: number;
  lastSync: string;
}

interface PaymentTransaction {
  id: string;
  transactionId: string;
  gateway: 'iyzico' | 'paytr' | 'sanal-pos' | 'paypal' | 'stripe' | 'fib' | 'fastpay' | 'nasswallet';
  orderId: string;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  cardInfo: {
    type: string;
    lastDigits: string;
    bank: string;
  };
  amount: number;
  commission: number;
  netAmount: number;
  status: 'success' | 'failed' | 'pending' | 'refunded' | 'cancelled';
  paymentDate: string;
  installment: number;
  currency: string;
}

interface Refund {
  id: string;
  transactionId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
}

type ViewMode = 'dashboard' | 'transactions' | 'refunds' | 'analytics' | 'settings';

export function PaymentIntegrationModule() {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGateway, setSelectedGateway] = useState<string | null>(null);

  // Mock data - Payment Gateways
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([
    {
      id: '1',
      name: 'İyzico',
      code: 'iyzico',
      logo: 'ğŸ’³',
      color: 'blue',
      isActive: true,
      credentials: {
        apiKey: 'sandbox-****',
        secretKey: '••••••••',
        merchantId: 'IYZICO-123456'
      },
      stats: {
        totalTransactions: 1247,
        successfulTransactions: 1189,
        failedTransactions: 58,
        totalAmount: 345789.50,
        commission: 8644.74
      },
      commissionRate: 2.50,
      lastSync: '2024-12-10 16:30'
    },
    {
      id: '2',
      name: 'PayTR',
      code: 'paytr',
      logo: '💰',
      color: 'green',
      isActive: true,
      credentials: {
        apiKey: 'paytr-****',
        secretKey: '••••••••',
        merchantId: 'PAYTR-789012'
      },
      stats: {
        totalTransactions: 987,
        successfulTransactions: 945,
        failedTransactions: 42,
        totalAmount: 287456.20,
        commission: 5749.12
      },
      commissionRate: 2.00,
      lastSync: '2024-12-10 16:25'
    },
    {
      id: '3',
      name: 'Sanal POS',
      code: 'sanal-pos',
      logo: 'ğŸ¦',
      color: 'purple',
      isActive: true,
      credentials: {
        apiKey: 'vpos-****',
        secretKey: '••••••••',
        merchantId: 'VPOS-345678'
      },
      stats: {
        totalTransactions: 756,
        successfulTransactions: 728,
        failedTransactions: 28,
        totalAmount: 198765.80,
        commission: 3975.32
      },
      commissionRate: 2.00,
      lastSync: '2024-12-10 16:20'
    },
    {
      id: '4',
      name: 'PayPal',
      code: 'paypal',
      logo: 'ğŸŒ',
      color: 'indigo',
      isActive: false,
      credentials: {
        apiKey: 'paypal-****',
        secretKey: '••••••••',
        merchantId: 'PAYPAL-567890'
      },
      stats: {
        totalTransactions: 345,
        successfulTransactions: 332,
        failedTransactions: 13,
        totalAmount: 125890.40,
        commission: 3776.71
      },
      commissionRate: 3.00,
      lastSync: '2024-12-09 18:00'
    },
    {
      id: '5',
      name: 'Stripe',
      code: 'stripe',
      logo: 'ğŸ’',
      color: 'violet',
      isActive: false,
      region: 'global',
      credentials: {
        apiKey: 'stripe-****',
        secretKey: '••••••••',
        merchantId: 'STRIPE-234567'
      },
      stats: {
        totalTransactions: 234,
        successfulTransactions: 225,
        failedTransactions: 9,
        totalAmount: 98456.70,
        commission: 2756.79
      },
      commissionRate: 2.80,
      lastSync: '2024-12-08 14:30'
    },
    {
      id: '6',
      name: 'FIB (First Iraqi Bank)',
      code: 'fib',
      logo: 'ğŸ‡®ğŸ‡¶',
      color: 'emerald',
      isActive: true,
      region: 'iraq',
      credentials: {
        apiKey: 'fib-****',
        secretKey: '••••••••',
        merchantId: 'FIB-IQ-001234'
      },
      stats: {
        totalTransactions: 1589,
        successfulTransactions: 1532,
        failedTransactions: 57,
        totalAmount: 456789.50,
        commission: 9135.79
      },
      commissionRate: 2.00,
      lastSync: '2024-12-10 16:40'
    },
    {
      id: '7',
      name: 'FastPay',
      code: 'fastpay',
      logo: '⚡',
      color: 'amber',
      isActive: true,
      region: 'iraq',
      credentials: {
        apiKey: 'fastpay-****',
        secretKey: '••••••••',
        merchantId: 'FAST-IQ-567890'
      },
      stats: {
        totalTransactions: 2134,
        successfulTransactions: 2098,
        failedTransactions: 36,
        totalAmount: 678345.80,
        commission: 10175.19
      },
      commissionRate: 1.50,
      lastSync: '2024-12-10 16:35'
    },
    {
      id: '8',
      name: 'NassWallet',
      code: 'nasswallet',
      logo: '💰',
      color: 'teal',
      isActive: true,
      region: 'iraq',
      credentials: {
        apiKey: 'nass-****',
        secretKey: '••••••••',
        merchantId: 'NASS-IQ-345678'
      },
      stats: {
        totalTransactions: 1876,
        successfulTransactions: 1845,
        failedTransactions: 31,
        totalAmount: 534123.60,
        commission: 8011.85
      },
      commissionRate: 1.50,
      lastSync: '2024-12-10 16:32'
    }
  ]);

  // Mock data - Payment Transactions
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([
    {
      id: '1',
      transactionId: 'IYZ-2024-001234',
      gateway: 'iyzico',
      orderId: 'ORD-1234567',
      customer: {
        name: 'Ahmet Yılmaz',
        email: 'ahmet@example.com',
        phone: '+90 532 123 4567'
      },
      cardInfo: {
        type: 'Visa',
        lastDigits: '4321',
        bank: 'İş Bankası'
      },
      amount: 549.90,
      commission: 13.75,
      netAmount: 536.15,
      status: 'success',
      paymentDate: '2024-12-10 15:45',
      installment: 1,
      currency: 'IQD'
    },
    {
      id: '2',
      transactionId: 'PTR-2024-567890',
      gateway: 'paytr',
      orderId: 'ORD-2345678',
      customer: {
        name: 'Zeynep Kaya',
        email: 'zeynep@example.com',
        phone: '+90 543 987 6543'
      },
      cardInfo: {
        type: 'MasterCard',
        lastDigits: '8765',
        bank: 'Garanti BBVA'
      },
      amount: 1299.00,
      commission: 25.98,
      netAmount: 1273.02,
      status: 'success',
      paymentDate: '2024-12-10 14:20',
      installment: 3,
      currency: 'IQD'
    },
    {
      id: '3',
      transactionId: 'VPOS-2024-111222',
      gateway: 'sanal-pos',
      orderId: 'ORD-3456789',
      customer: {
        name: 'Mehmet Demir',
        email: 'mehmet@example.com',
        phone: '+90 555 321 9876'
      },
      cardInfo: {
        type: 'Visa',
        lastDigits: '1234',
        bank: 'Akbank'
      },
      amount: 2499.90,
      commission: 49.99,
      netAmount: 2449.91,
      status: 'pending',
      paymentDate: '2024-12-10 13:10',
      installment: 6,
      currency: 'IQD'
    },
    {
      id: '4',
      transactionId: 'IYZ-2024-999888',
      gateway: 'iyzico',
      orderId: 'ORD-4567890',
      customer: {
        name: 'Ayşe Yıldız',
        email: 'ayse@example.com',
        phone: '+90 533 111 2222'
      },
      cardInfo: {
        type: 'MasterCard',
        lastDigits: '5678',
        bank: 'Yapı Kredi'
      },
      amount: 899.00,
      commission: 22.48,
      netAmount: 876.52,
      status: 'failed',
      paymentDate: '2024-12-10 12:05',
      installment: 1,
      currency: 'IQD'
    },
    {
      id: '5',
      transactionId: 'FIB-2024-445566',
      gateway: 'fib',
      orderId: 'ORD-5678901',
      customer: {
        name: 'Ahmed Mohammed',
        email: 'ahmed@example.iq',
        phone: '+964 770 123 4567'
      },
      cardInfo: {
        type: 'Visa',
        lastDigits: '9876',
        bank: 'First Iraqi Bank'
      },
      amount: 125000,
      commission: 2500,
      netAmount: 122500,
      status: 'success',
      paymentDate: '2024-12-10 16:15',
      installment: 1,
      currency: 'IQD'
    },
    {
      id: '6',
      transactionId: 'FAST-2024-778899',
      gateway: 'fastpay',
      orderId: 'ORD-6789012',
      customer: {
        name: 'Sara Ali',
        email: 'sara@example.iq',
        phone: '+964 750 987 6543'
      },
      cardInfo: {
        type: 'MasterCard',
        lastDigits: '3456',
        bank: 'FastPay Wallet'
      },
      amount: 85000,
      commission: 1275,
      netAmount: 83725,
      status: 'success',
      paymentDate: '2024-12-10 15:30',
      installment: 1,
      currency: 'IQD'
    },
    {
      id: '7',
      transactionId: 'NASS-2024-334455',
      gateway: 'nasswallet',
      orderId: 'ORD-7890123',
      customer: {
        name: 'Omar Hassan',
        email: 'omar@example.iq',
        phone: '+964 760 555 7777'
      },
      cardInfo: {
        type: 'Wallet',
        lastDigits: '8888',
        bank: 'NassWallet'
      },
      amount: 450000,
      commission: 6750,
      netAmount: 443250,
      status: 'success',
      paymentDate: '2024-12-10 14:45',
      installment: 1,
      currency: 'IQD'
    }
  ]);

  // Stats
  const stats = {
    totalGateways: paymentGateways.filter(g => g.isActive).length,
    totalTransactions: transactions.length,
    successfulTransactions: transactions.filter(t => t.status === 'success').length,
    failedTransactions: transactions.filter(t => t.status === 'failed').length,
    totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
    totalCommission: transactions.reduce((sum, t) => sum + t.commission, 0),
    netAmount: transactions.reduce((sum, t) => sum + t.netAmount, 0),
    successRate: (transactions.filter(t => t.status === 'success').length / transactions.length * 100).toFixed(1)
  };

  const getStatusColor = (status: PaymentTransaction['status']) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'refunded': return 'bg-purple-100 text-purple-700';
      case 'cancelled': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: PaymentTransaction['status']) => {
    switch (status) {
      case 'success': return 'Başarılı';
      case 'failed': return 'Başarısız';
      case 'pending': return 'Beklemede';
      case 'refunded': return 'İade Edildi';
      case 'cancelled': return 'İptal';
      default: return status;
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam İşlem</p>
              <p className="text-2xl mt-2">{stats.totalTransactions}</p>
              <p className="text-xs text-green-600 mt-1">%{stats.successRate} başarılı</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Tutar</p>
              <p className="text-2xl mt-2">{stats.totalAmount.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.successfulTransactions} başarılı</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
              <Banknote className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Net Gelir</p>
              <p className="text-2xl mt-2">{stats.netAmount.toFixed(2)}</p>
              <p className="text-xs text-red-500 mt-1">-{stats.totalCommission.toFixed(2)} komisyon</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Başarısız</p>
              <p className="text-2xl mt-2">{stats.failedTransactions}</p>
              <p className="text-xs text-orange-600 mt-1">Hata oranı: %{(100 - parseFloat(stats.successRate)).toFixed(1)}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
              <XCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Payment Gateways */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {paymentGateways.map(gateway => (
          <div key={gateway.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{gateway.logo}</div>
                  <div>
                    <h3 className="text-sm">{gateway.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Merchant: {gateway.credentials.merchantId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    gateway.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {gateway.isActive ? 'Aktif' : 'Pasif'}
                  </span>
                  <button className="p-2 hover:bg-gray-100 rounded">
                    <Settings className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500">Toplam İşlem</p>
                  <p className="text-lg mt-1">{gateway.stats.totalTransactions}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Başarılı</p>
                  <p className="text-lg mt-1 text-green-600">{gateway.stats.successfulTransactions}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Başarısız</p>
                  <p className="text-lg mt-1 text-red-600">{gateway.stats.failedTransactions}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Başarı Oranı</p>
                  <p className="text-lg mt-1 text-blue-600">
                    %{((gateway.stats.successfulTransactions / gateway.stats.totalTransactions) * 100).toFixed(1)}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">Toplam Tutar</p>
                  <p className="text-sm">{gateway.stats.totalAmount.toFixed(2)}</p>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">Komisyon</p>
                  <p className="text-sm text-red-600">-{gateway.stats.commission.toFixed(2)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Komisyon Oranı</p>
                  <p className="text-sm">%{gateway.commissionRate}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Son Senkronizasyon</span>
                  <span className="text-gray-600">{gateway.lastSync}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <button className="text-sm text-blue-600 hover:text-blue-700">
                İşlemleri Görüntüle →
              </button>
              <button className="text-sm text-gray-600 hover:text-gray-700">
                Ayarlar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm">Son İşlemler</h3>
            <button 
              onClick={() => setViewMode('transactions')}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Tümünü Gör →
            </button>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {transactions.slice(0, 5).map(transaction => (
            <div key={transaction.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className="text-2xl">
                    {paymentGateways.find(g => g.code === transaction.gateway)?.logo}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{transaction.transactionId}</p>
                    <p className="text-xs text-gray-500 mt-1">{transaction.customer.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{transaction.amount.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">{transaction.cardInfo.type} •••• {transaction.cardInfo.lastDigits}</p>
                  </div>
                </div>
                <div className="ml-4">
                  <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusColor(transaction.status)}`}>
                    {getStatusLabel(transaction.status)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderTransactions = () => (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="İşlem ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-80"
            />
          </div>
          <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtrele
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
            <Download className="w-4 h-4" />
            Dışa Aktar
          </button>
          <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm hover:from-blue-700 hover:to-blue-800 flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Senkronize Et
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs text-gray-600">Ödeme Sistemi</th>
              <th className="px-6 py-3 text-left text-xs text-gray-600">İşlem No</th>
              <th className="px-6 py-3 text-left text-xs text-gray-600">Müşteri</th>
              <th className="px-6 py-3 text-left text-xs text-gray-600">Kart Bilgisi</th>
              <th className="px-6 py-3 text-right text-xs text-gray-600">Tutar</th>
              <th className="px-6 py-3 text-center text-xs text-gray-600">Taksit</th>
              <th className="px-6 py-3 text-center text-xs text-gray-600">Durum</th>
              <th className="px-6 py-3 text-right text-xs text-gray-600">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map(transaction => (
              <tr key={transaction.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {paymentGateways.find(g => g.code === transaction.gateway)?.logo}
                    </span>
                    <span className="text-sm">
                      {paymentGateways.find(g => g.code === transaction.gateway)?.name}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm">{transaction.transactionId}</p>
                    <p className="text-xs text-gray-500 mt-1">{transaction.paymentDate}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm">{transaction.customer.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{transaction.customer.email}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm">{transaction.cardInfo.type}</p>
                    <p className="text-xs text-gray-500 mt-1">•••• {transaction.cardInfo.lastDigits} - {transaction.cardInfo.bank}</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 text-right">
                  <div>
                    {transaction.amount.toFixed(2)}
                    <p className="text-xs text-red-500 mt-1">-{transaction.commission.toFixed(2)}</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-center text-sm">
                  {transaction.installment}x
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusColor(transaction.status)}`}>
                    {getStatusLabel(transaction.status)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-purple-600 hover:bg-purple-50 rounded">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-gray-600 hover:bg-gray-100 rounded">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (viewMode) {
      case 'dashboard':
        return renderDashboard();
      case 'transactions':
        return renderTransactions();
      case 'refunds':
        return <div className="text-center py-12 text-gray-500">İade Yönetimi (Yakında)</div>;
      case 'analytics':
        return <div className="text-center py-12 text-gray-500">Ödeme Analitiği (Yakında)</div>;
      case 'settings':
        return <div className="text-center py-12 text-gray-500">Ödeme Ayarları (Yakında)</div>;
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg text-gray-900">Ödeme Sistemleri Entegrasyonu</h1>
            <p className="text-sm text-gray-500 mt-1">İyzico, PayTR, Sanal POS ve diğer ödeme sistemleri</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Rapor Al
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Yeni Entegrasyon
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'transactions', label: 'İşlemler', icon: CreditCard, badge: stats.totalTransactions },
            { id: 'refunds', label: 'İadeler', icon: RefreshCw },
            { id: 'analytics', label: 'Analitik', icon: TrendingUp },
            { id: 'settings', label: 'Ayarlar', icon: Settings }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as ViewMode)}
                className={`px-4 py-3 text-sm flex items-center gap-2 border-b-2 transition-colors relative ${
                  viewMode === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.badge && (
                  <span className="ml-1 px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {renderContent()}
      </div>
    </div>
  );
}
