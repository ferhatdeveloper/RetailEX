// ğŸ‘¤ Personnel Management - Personel Yönetim Sistemi
// Employee accounts, performance tracking, daily reports, shift management

import { useState, useEffect } from 'react';
import {
  Users, TrendingUp, DollarSign, Clock, Award, AlertCircle,
  Plus, Edit, X, Save, Eye, BarChart3, Download, Calendar,
  CheckCircle, XCircle, CreditCard, Smartphone, QrCode, MapPin,
  Navigation, Radio
} from 'lucide-react';

interface CashierManagementProps {
  darkMode: boolean;
  onBack: () => void;
}

interface Cashier {
  id: string;
  name: string;
  employee_code: string;
  shift: 'morning' | 'afternoon' | 'night';
  status: 'active' | 'inactive' | 'on_break';
  
  // Today's stats
  today_sales_count: number;
  today_sales_amount: number;
  today_transactions: number;
  today_errors: number;
  
  // Performance
  accuracy_rate: number;
  avg_transaction_time: number;
  customer_rating: number;
  
  // Payment methods
  cash_total: number;
  card_total: number;
  qr_total: number;
  ewallet_total: number;
  
  // GPS Location
  location?: {
    lat: number;
    lng: number;
    address: string;
    last_update: string;
    speed: number; // km/h
    battery: number; // percentage
    gps_enabled: boolean;
  };
}

interface ShiftReport {
  id: string;
  cashier_name: string;
  date: string;
  shift: string;
  start_time: string;
  end_time: string;
  opening_cash: number;
  closing_cash: number;
  total_sales: number;
  total_transactions: number;
  cash_difference: number;
  status: 'balanced' | 'over' | 'short';
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: any;
  color: string;
  enabled: boolean;
  total_today: number;
  transaction_count: number;
}

export function CashierManagement({ darkMode, onBack }: CashierManagementProps) {
  const [view, setView] = useState<'list' | 'performance' | 'shifts'>('list');
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [shiftReports, setShiftReports] = useState<ShiftReport[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedCashier, setSelectedCashier] = useState<Cashier | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const inputClass = darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900';

  useEffect(() => {
    loadCashiers();
    loadShiftReports();
    loadPaymentMethods();
  }, []);

  const loadCashiers = async () => {
    // Mock data
    const mockCashiers: Cashier[] = [
      {
        id: '1',
        name: 'Ayşe YILMAZ',
        employee_code: 'CSH-001',
        shift: 'morning',
        status: 'active',
        today_sales_count: 45,
        today_sales_amount: 3250000,
        today_transactions: 45,
        today_errors: 2,
        accuracy_rate: 95.6,
        avg_transaction_time: 3.2,
        customer_rating: 4.8,
        cash_total: 1800000,
        card_total: 1200000,
        qr_total: 150000,
        ewallet_total: 100000
      },
      {
        id: '2',
        name: 'Mehmet DEMİR',
        employee_code: 'CSH-002',
        shift: 'afternoon',
        status: 'active',
        today_sales_count: 38,
        today_sales_amount: 2890000,
        today_transactions: 38,
        today_errors: 1,
        accuracy_rate: 97.4,
        avg_transaction_time: 2.8,
        customer_rating: 4.9,
        cash_total: 1500000,
        card_total: 1100000,
        qr_total: 200000,
        ewallet_total: 90000
      },
      {
        id: '3',
        name: 'Fatma KAYA',
        employee_code: 'CSH-003',
        shift: 'night',
        status: 'on_break',
        today_sales_count: 12,
        today_sales_amount: 850000,
        today_transactions: 12,
        today_errors: 0,
        accuracy_rate: 100,
        avg_transaction_time: 3.5,
        customer_rating: 5.0,
        cash_total: 400000,
        card_total: 350000,
        qr_total: 80000,
        ewallet_total: 20000
      },
    ];
    setCashiers(mockCashiers);
  };

  const loadShiftReports = async () => {
    // Mock data
    const mockReports: ShiftReport[] = [
      {
        id: '1',
        cashier_name: 'Ayşe YILMAZ',
        date: '2024-12-28',
        shift: 'Sabah',
        start_time: '08:00',
        end_time: '16:00',
        opening_cash: 500000,
        closing_cash: 2300000,
        total_sales: 3250000,
        total_transactions: 45,
        cash_difference: 0,
        status: 'balanced'
      },
      {
        id: '2',
        cashier_name: 'Mehmet DEMİR',
        date: '2024-12-27',
        shift: 'Öğleden Sonra',
        start_time: '16:00',
        end_time: '00:00',
        opening_cash: 500000,
        closing_cash: 2000000,
        total_sales: 2890000,
        total_transactions: 38,
        cash_difference: -10000,
        status: 'short'
      },
    ];
    setShiftReports(mockReports);
  };

  const loadPaymentMethods = async () => {
    // Mock data
    const mockPaymentMethods: PaymentMethod[] = [
      {
        id: '1',
        name: 'Nakit',
        icon: DollarSign,
        color: 'text-green-600',
        enabled: true,
        total_today: 3700000,
        transaction_count: 65
      },
      {
        id: '2',
        name: 'Kredi/Banka Kartı',
        icon: CreditCard,
        color: 'text-blue-600',
        enabled: true,
        total_today: 2650000,
        transaction_count: 45
      },
      {
        id: '3',
        name: 'QR Kod',
        icon: QrCode,
        color: 'text-purple-600',
        enabled: true,
        total_today: 430000,
        transaction_count: 12
      },
      {
        id: '4',
        name: 'E-Cüzdan',
        icon: Smartphone,
        color: 'text-orange-600',
        enabled: true,
        total_today: 210000,
        transaction_count: 8
      },
    ];
    setPaymentMethods(mockPaymentMethods);
  };

  const getShiftBadge = (shift: string) => {
    const badges: any = {
      morning: { label: 'Sabah', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
      afternoon: { label: 'Öğleden Sonra', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
      night: { label: 'Gece', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    };
    return badges[shift] || badges.morning;
  };

  const getStatusBadge = (status: string) => {
    const badges: any = {
      active: { label: 'Aktif', icon: CheckCircle, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
      inactive: { label: 'Pasif', icon: XCircle, color: 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300' },
      on_break: { label: 'Molada', icon: Clock, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    };
    return badges[status] || badges.active;
  };

  // Calculate totals
  const totalSalesToday = cashiers.reduce((sum, c) => sum + c.today_sales_amount, 0);
  const totalTransactions = cashiers.reduce((sum, c) => sum + c.today_transactions, 0);
  const avgAccuracy = cashiers.reduce((sum, c) => sum + c.accuracy_rate, 0) / cashiers.length;
  const activeCashiers = cashiers.filter(c => c.status === 'active').length;

  // PERFORMANCE VIEW
  if (view === 'performance') {
    return (
      <div className={`min-h-screen ${bgClass} p-6`}>
        <div className="mb-6">
          <button onClick={() => setView('list')} className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600">
            ← Geri
          </button>
          <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Kasiyer Performansı</h1>
        </div>

        {/* Performance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cashiers.map((cashier) => (
            <div key={cashier.id} className={`${cardClass} border rounded-xl p-6`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className={`text-lg font-bold ${textClass} mb-1`}>{cashier.name}</div>
                  <div className="text-sm text-gray-500">{cashier.employee_code}</div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${getShiftBadge(cashier.shift).color}`}>
                  {getShiftBadge(cashier.shift).label}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Satış</span>
                    <span className={`font-bold ${textClass}`}>{(cashier.today_sales_amount / 1000).toFixed(0)}K IQD</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">İşlem Sayısı:</span>
                    <span className={textClass}>{cashier.today_transactions}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Doğruluk</span>
                    <span className={`font-bold ${cashier.accuracy_rate >= 95 ? 'text-green-600' : 'text-orange-600'}`}>
                      {cashier.accuracy_rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${cashier.accuracy_rate >= 95 ? 'bg-green-500' : 'bg-orange-500'}`}
                      style={{ width: `${cashier.accuracy_rate}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Ort. İşlem Süresi</span>
                    <span className={textClass}>{cashier.avg_transaction_time.toFixed(1)} dk</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Müşteri Puanı</span>
                    <span className={`font-bold ${cashier.customer_rating >= 4.5 ? 'text-yellow-600' : 'text-gray-600'}`}>
                      ⭐ {cashier.customer_rating.toFixed(1)}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-2">Ödeme Yöntemleri</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span>ğŸ’µ Nakit:</span>
                      <span className={textClass}>{(cashier.cash_total / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ğŸ’³ Kart:</span>
                      <span className={textClass}>{(cashier.card_total / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ğŸ“± QR:</span>
                      <span className={textClass}>{(cashier.qr_total / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ğŸ‘› E-Wallet:</span>
                      <span className={textClass}>{(cashier.ewallet_total / 1000).toFixed(0)}K</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // SHIFTS VIEW
  if (view === 'shifts') {
    return (
      <div className={`min-h-screen ${bgClass} p-6`}>
        <div className="mb-6">
          <button onClick={() => setView('list')} className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600">
            ← Geri
          </button>
          <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Vardiya Raporları</h1>
        </div>

        <div className={`${cardClass} border rounded-xl overflow-hidden`}>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className={`text-lg font-bold ${textClass}`}>Vardiya Geçmişi</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kasiyer</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tarih</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Vardiya</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Saat</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Açılış Kasası</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Satış</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Kapanış Kasası</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Fark</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {shiftReports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-4">
                      <div className={`font-medium ${textClass}`}>{report.cashier_name}</div>
                    </td>
                    <td className="px-4 py-4 text-center text-sm">{new Date(report.date).toLocaleDateString('tr-TR')}</td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm">{report.shift}</span>
                    </td>
                    <td className="px-4 py-4 text-center text-sm">{report.start_time} - {report.end_time}</td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm">{(report.opening_cash / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-bold ${textClass}`}>{(report.total_sales / 1000).toFixed(0)}K</span>
                      <div className="text-xs text-gray-500">{report.total_transactions} işlem</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm">{(report.closing_cash / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-bold ${
                        report.cash_difference === 0 ? 'text-green-600' :
                        report.cash_difference > 0 ? 'text-blue-600' :
                        'text-red-600'
                      }`}>
                        {report.cash_difference === 0 ? '0' : 
                         report.cash_difference > 0 ? `+${(report.cash_difference / 1000).toFixed(0)}K` :
                         `${(report.cash_difference / 1000).toFixed(0)}K`}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        report.status === 'balanced' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        report.status === 'over' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {report.status === 'balanced' ? 'Dengeli' : report.status === 'over' ? 'Fazla' : 'Eksik'}
                      </span>
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

  // LIST VIEW
  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      {/* Header */}
      <div className="mb-6">
        <button onClick={onBack} className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600">
          ← Geri
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-3xl font-bold ${textClass} mb-2 flex items-center gap-3`}>
              <Users className="w-8 h-8 text-blue-500" />
              Personel Yönetimi
            </h1>
            <p className="text-gray-500">Personel hesapları ve performans takibi</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('performance')}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg"
            >
              <BarChart3 className="w-5 h-5" />
              Performans
            </button>
            <button
              onClick={() => setView('shifts')}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg"
            >
              <Calendar className="w-5 h-5" />
              Vardiyalar
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
            >
              <Plus className="w-5 h-5" />
              Yeni Kasiyer
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Aktif Kasiyer</div>
              <div className={`text-2xl font-bold ${textClass}`}>{activeCashiers}</div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Bugünkü Satış</div>
              <div className={`text-2xl font-bold ${textClass}`}>{(totalSalesToday / 1000000).toFixed(1)}M</div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Ort. Doğruluk</div>
              <div className={`text-2xl font-bold ${textClass}`}>{avgAccuracy.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Toplam İşlem</div>
              <div className={`text-2xl font-bold ${textClass}`}>{totalTransactions}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className={`${cardClass} border rounded-xl p-6 mb-6`}>
        <h3 className={`text-lg font-bold ${textClass} mb-4`}>Ödeme Yöntemleri - Günlük Özet</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {paymentMethods.map((method) => {
            const Icon = method.icon;
            return (
              <div key={method.id} className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-5 h-5 ${method.color}`} />
                  <span className={`text-sm font-medium ${textClass}`}>{method.name}</span>
                </div>
                <div className={`text-2xl font-bold ${textClass} mb-1`}>
                  {(method.total_today / 1000).toFixed(0)}K
                </div>
                <div className="text-xs text-gray-500">{method.transaction_count} işlem</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cashiers Table */}
      <div className={`${cardClass} border rounded-xl overflow-hidden`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className={`text-lg font-bold ${textClass}`}>Kasiyer Listesi</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kasiyer</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Vardiya</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Durum</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Bugünkü Satış</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">İşlem</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Doğruluk</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Müşteri Puanı</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {cashiers.map((cashier) => {
                const shiftBadge = getShiftBadge(cashier.shift);
                const statusBadge = getStatusBadge(cashier.status);
                const StatusIcon = statusBadge.icon;

                return (
                  <tr key={cashier.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <div className={`font-medium ${textClass}`}>{cashier.name}</div>
                      <div className="text-xs text-gray-500">{cashier.employee_code}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${shiftBadge.color}`}>
                        {shiftBadge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${statusBadge.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className={`text-lg font-bold ${textClass}`}>
                        {(cashier.today_sales_amount / 1000).toFixed(0)}K
                      </div>
                      <div className="text-xs text-gray-500">{cashier.today_sales_count} satış</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`font-bold ${textClass}`}>{cashier.today_transactions}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className={`font-bold ${cashier.accuracy_rate >= 95 ? 'text-green-600' : 'text-orange-600'}`}>
                        {cashier.accuracy_rate.toFixed(1)}%
                      </div>
                      {cashier.today_errors > 0 && (
                        <div className="text-xs text-red-500">{cashier.today_errors} hata</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-yellow-500">⭐</span>
                        <span className={`font-bold ${textClass}`}>{cashier.customer_rating.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedCashier(cashier);
                          setView('performance');
                        }}
                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded text-blue-600"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
