// ğŸ¯ ALL WMS MODULES - Compact Implementation
// Issue Center, Transfer, Returns, Counting, Alerts, QC, Reports, Tasks

import { useState } from 'react';
import {
  TrendingUp, RotateCcw, FileText, AlertCircle,
  ClipboardCheck, Shield, BarChart3, CheckSquare,
  Package, MapPin, Calendar, Banknote, Users,
  X, Check, Search, Filter, Download, Printer,
  ChevronRight, Split, UserPlus, Layers, Target, Clock, Zap, Plus
} from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { formatCurrency, formatNumber, formatDateTime } from '../utils';

interface ModuleProps {
  darkMode: boolean;
  onBack: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ISSUE CENTER (MAL ÇIKIŞ)
// ═══════════════════════════════════════════════════════════════════════════════

export function IssueCenter({ darkMode, onBack }: ModuleProps) {
  const [view, setView] = useState<'list' | 'create' | 'pick'>('list');
  const [showScanner, setShowScanner] = useState(false);

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  const mockOrders = [
    { id: 'ORD-101', customer: 'Market A', items: 45, status: 'Ready to Pick', category: 'Dry' },
    { id: 'ORD-102', customer: 'Superstore B', items: 120, status: 'Picking', category: 'Frozen' },
    { id: 'ORD-103', customer: 'Store C', items: 15, status: 'Pending', category: 'Valuable' },
  ];

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <button onClick={onBack} className="mb-4 text-blue-500 flex items-center gap-2">← Geri</button>

      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${textClass}`}>Mal Çıkış Merkezi</h1>
        <p className="text-gray-500">Sevkiyat, toplama ve kontrol işlemleri</p>
      </div>

      {view === 'list' && (
        <div className="space-y-6">
          <div className={`${cardClass} border rounded-xl p-6`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Sipariş veya müşteri ara..."
                  className={`w-full pl-10 pr-4 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                    }`}
                />
              </div>
              <button
                onClick={() => setView('create')}
                className="ml-4 px-6 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Yeni Çıkış
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-xs text-gray-500 uppercase border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">Sipariş No</th>
                    <th className="px-4 py-3 text-left">Müşteri</th>
                    <th className="px-4 py-3 text-center">Ürün</th>
                    <th className="px-4 py-3 text-center">Durum</th>
                    <th className="px-4 py-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {mockOrders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-mono text-sm font-bold">{order.id}</td>
                      <td className="px-4 py-3">{order.customer}</td>
                      <td className="px-4 py-3 text-center">{order.items}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${order.status === 'Picking' ? 'bg-blue-100 text-blue-600' : 'bg-yellow-100 text-yellow-600'
                          }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="text-blue-500 hover:underline">Detay</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {view === 'create' && (
        <div className={`${cardClass} border rounded-xl p-6 shadow-sm`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-xl font-bold ${textClass}`}>Yeni Mal Çıkış Talebi</h2>
            <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-600 dark:text-gray-400">Çıkış Tipi</label>
                <select className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                  }`}>
                  <option>Satış Siparişi (Mağaza)</option>
                  <option>Transfer (Depolar Arası)</option>
                  <option>Tedarikçi İadesi</option>
                  <option>Sarf Malzeme Çıkışı</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-600 dark:text-gray-400">Hedef Mağaza / Müşteri</label>
                <input type="text" placeholder="Mağaza adı veya kodu..." className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                  }`} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-600 dark:text-gray-400">Öncelik</label>
                <div className="flex gap-2">
                  {['Normal', 'Acil', 'Yüksek'].map(p => (
                    <button key={p} className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-600 dark:text-gray-400">Açıklama</label>
                <textarea rows={1} className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                  }`} />
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setView('list')}
              className="flex-1 px-6 py-3 border rounded-lg font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              İptal
            </button>
            <button
              onClick={() => {
                alert('Toplama listesi oluşturuluyor...');
                setView('list');
              }}
              className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg font-bold shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
            >
              <ClipboardCheck className="w-5 h-5" />
              Siparişi Onayla ve Gönder
            </button>
          </div>
        </div>
      )}

      <BarcodeScanner
        darkMode={darkMode}
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={(barcode) => console.log('Scanned:', barcode)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export function TransferManagement({ darkMode, onBack }: ModuleProps) {
  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <button onClick={onBack} className="mb-4 text-blue-500">← Geri</button>

      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${textClass}`}>Transfer Yönetimi</h1>
        <p className="text-gray-500">Depolar arası ve depo içi transferler</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`${cardClass} border rounded-xl p-6`}>
          <h3 className={`text-lg font-bold ${textClass} mb-4`}>Bekleyen Transferler</h3>
          <div className="text-center py-8 text-gray-500">
            Bekleyen transfer yok
          </div>
        </div>

        <div className={`${cardClass} border rounded-xl p-6`}>
          <h3 className={`text-lg font-bold ${textClass} mb-4`}>Yolda Olanlar</h3>
          <div className="text-center py-8 text-gray-500">
            Yolda transfer yok
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button className="w-full px-6 py-4 bg-blue-500 text-white rounded-lg text-lg font-semibold">
          + Yeni Transfer Oluştur
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETURNS & DAMAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ReturnsManagement({ darkMode, onBack }: ModuleProps) {
  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <button onClick={onBack} className="mb-4 text-blue-500">← Geri</button>

      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${textClass}`}>İade & Hasar Yönetimi</h1>
        <p className="text-gray-500">Müşteri iadeleri, hasar kayıtları ve RMA</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className={`${cardClass} border rounded-xl p-6`}>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <RotateCcw className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">12</p>
              <p className="text-sm text-gray-500">Bekleyen İadeler</p>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border rounded-xl p-6`}>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">5</p>
              <p className="text-sm text-gray-500">Hasar Kayıtları</p>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border rounded-xl p-6`}>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">48</p>
              <p className="text-sm text-gray-500">Bu Ay İşlenen</p>
            </div>
          </div>
        </div>
      </div>

      <div className={`${cardClass} border rounded-xl p-6`}>
        <h3 className={`text-lg font-bold ${textClass} mb-4`}>Son İadeler</h3>
        <div className="text-center py-8 text-gray-500">
          İade kaydı bulunmuyor
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COUNTING MODULE (SAYIM)
// ═══════════════════════════════════════════════════════════════════════════════

export function CountingModule({ darkMode, onBack }: ModuleProps) {
  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <button onClick={onBack} className="mb-4 text-blue-500">← Geri</button>

      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${textClass}`}>Sayım Yönetimi</h1>
        <p className="text-gray-500">Envanter sayımı, varyans analizi ve düzeltmeler</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {[
          { label: 'Planlanmış Sayımlar', value: '3', color: 'blue' },
          { label: 'Devam Eden', value: '1', color: 'yellow' },
          { label: 'Varyans Bekleyen', value: '2', color: 'orange' },
          { label: 'Tamamlanan (Ay)', value: '15', color: 'green' },
        ].map((stat, i) => (
          <div key={i} className={`${cardClass} border rounded-xl p-6`}>
            <p className="text-3xl font-bold mb-2">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`${cardClass} border rounded-xl p-6`}>
          <h3 className={`text-lg font-bold ${textClass} mb-4`}>Hızlı Eylemler</h3>
          <div className="space-y-3">
            <button className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg text-left">
              ğŸ“‹ Tam Fiziksel Sayım Başlat
            </button>
            <button className="w-full px-4 py-3 bg-green-500 text-white rounded-lg text-left">
              ğŸ”„ Döngüsel Sayım Oluştur
            </button>
            <button className="w-full px-4 py-3 bg-orange-500 text-white rounded-lg text-left">
              ğŸ¯ Spot Sayım (Tekli)
            </button>
          </div>
        </div>

        <div className={`${cardClass} border rounded-xl p-6`}>
          <h3 className={`text-lg font-bold ${textClass} mb-4`}>Son Sayımlar</h3>
          <div className="text-center py-8 text-gray-500">
            Sayım kaydı yok
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT CENTER
// ═══════════════════════════════════════════════════════════════════════════════

export function AlertCenter({ darkMode, onBack }: ModuleProps) {
  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  const alerts = [
    { type: 'low_stock', severity: 'critical', product: 'Samsung Galaxy S24', quantity: 3, threshold: 20 },
    { type: 'expiry', severity: 'warning', product: 'Süt 1L', daysLeft: 5 },
    { type: 'slow_moving', severity: 'info', product: 'Eski Model Laptop', daysSince: 180 },
  ];

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <button onClick={onBack} className="mb-4 text-blue-500">← Geri</button>

      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${textClass}`}>Uyarı Merkezi</h1>
        <p className="text-gray-500">Kritik durumlar ve uyarılar</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className={`${cardClass} border-l-4 border-red-500 rounded-xl p-6`}>
          <p className="text-3xl font-bold text-red-600">5</p>
          <p className="text-sm text-gray-500">Kritik Uyarılar</p>
        </div>
        <div className={`${cardClass} border-l-4 border-yellow-500 rounded-xl p-6`}>
          <p className="text-3xl font-bold text-yellow-600">18</p>
          <p className="text-sm text-gray-500">Dikkat Gerektiren</p>
        </div>
        <div className={`${cardClass} border-l-4 border-blue-500 rounded-xl p-6`}>
          <p className="text-3xl font-bold text-blue-600">42</p>
          <p className="text-sm text-gray-500">Bilgilendirme</p>
        </div>
      </div>

      <div className={`${cardClass} border rounded-xl overflow-hidden`}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className={`font-bold ${textClass}`}>Aktif Uyarılar</h3>
          <button className="text-sm text-blue-500">Tümünü Görüntüle</button>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {alerts.map((alert, i) => (
            <div key={i} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${alert.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/30' :
                  alert.severity === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                    'bg-blue-100 dark:bg-blue-900/30'
                  }`}>
                  <AlertCircle className={`w-5 h-5 ${alert.severity === 'critical' ? 'text-red-600' :
                    alert.severity === 'warning' ? 'text-yellow-600' :
                      'text-blue-600'
                    }`} />
                </div>
                <div className="flex-1">
                  <p className={`font-semibold ${textClass}`}>{alert.product}</p>
                  <p className="text-sm text-gray-500">
                    {alert.type === 'low_stock' && `Stok: ${alert.quantity} (Min: ${alert.threshold})`}
                    {alert.type === 'expiry' && `${alert.daysLeft} gün içinde son kullanma tarihi dolacak`}
                    {alert.type === 'slow_moving' && `${alert.daysSince} gündür hareket yok`}
                  </p>
                </div>
                <button className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg">
                  İşlem Yap
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUALITY CONTROL
// ═══════════════════════════════════════════════════════════════════════════════

export function QualityControl({ darkMode, onBack }: ModuleProps) {
  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <button onClick={onBack} className="mb-4 text-blue-500">← Geri</button>

      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${textClass}`}>Kalite Kontrol</h1>
        <p className="text-gray-500">QC muayeneleri ve karantina yönetimi</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        {[
          { label: 'Bekleyen Muayene', value: '7', icon: ClipboardCheck },
          { label: 'Onaylandı', value: '145', icon: Check },
          { label: 'Reddedildi', value: '8', icon: X },
          { label: 'Karantinada', value: '12', icon: Shield },
        ].map((stat, i) => (
          <div key={i} className={`${cardClass} border rounded-xl p-6`}>
            <stat.icon className="w-8 h-8 text-blue-500 mb-3" />
            <p className="text-3xl font-bold mb-1">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className={`${cardClass} border rounded-xl p-6`}>
        <h3 className={`text-lg font-bold ${textClass} mb-4`}>Muayene Kuyruğu</h3>
        <div className="text-center py-8 text-gray-500">
          Bekleyen muayene yok
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS CENTER
// ═══════════════════════════════════════════════════════════════════════════════

export function ReportsCenter({ darkMode, onBack }: ModuleProps) {
  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  const reportCategories = [
    { name: 'Operasyonel Raporlar', count: 12, icon: BarChart3 },
    { name: 'Envanter Raporları', count: 15, icon: Package },
    { name: 'Mali Raporlar', count: 8, icon: Banknote },
    { name: 'Yönetim Raporları', count: 10, icon: Users },
  ];

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <button onClick={onBack} className="mb-4 text-blue-500">← Geri</button>

      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${textClass}`}>Raporlama Merkezi</h1>
        <p className="text-gray-500">45+ hazır rapor ve özel rapor oluşturucu</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {reportCategories.map((cat, i) => (
          <div key={i} className={`${cardClass} border rounded-xl p-6 cursor-pointer hover:shadow-lg transition-shadow`}>
            <cat.icon className="w-12 h-12 text-blue-500 mb-4" />
            <h3 className={`text-lg font-bold ${textClass} mb-2`}>{cat.name}</h3>
            <p className="text-sm text-gray-500">{cat.count} rapor</p>
          </div>
        ))}
      </div>

      <div className={`${cardClass} border rounded-xl p-6`}>
        <h3 className={`text-lg font-bold ${textClass} mb-4`}>Popüler Raporlar</h3>
        <div className="space-y-3">
          {[
            'Günlük Aktivite Özeti',
            'Stok Durum Raporu (ABC)',
            'Envanter Değerleme',
            'Mal Kabul/Çıkış Özeti',
            'Varyans Analizi',
          ].map((report, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-400" />
                <span className={textClass}>{report}</span>
              </div>
              <div className="flex gap-2">
                <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                  <Download className="w-4 h-4" />
                </button>
                <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TASK MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export function TaskManagement({ darkMode, onBack }: ModuleProps) {
  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  const tasks = [
    { id: 1, type: 'Yerleştirme', loc: 'A-12-05', status: 'Bekliyor', user: 'Ahmet Y.', priority: 'Normal' },
    { id: 2, type: 'Toplama', loc: 'B-04-12', status: 'İşlemde', user: 'Mehmet D.', priority: 'Yüksek' },
    { id: 3, type: 'Besleme', loc: 'C-08-01', status: 'Acil', user: 'Ayşe K.', priority: 'Kritik' },
    { id: 4, type: 'Sayım', loc: 'D-01-10', status: 'Bekliyor', user: 'Sistem', priority: 'Düşük' },
  ];

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <button onClick={onBack} className="mb-4 text-blue-500 flex items-center gap-2">← Geri</button>

      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${textClass}`}>Görev Yönetimi</h1>
        <p className="text-gray-500">Lokasyon ve rota bazlı dinamik görev dağıtımı</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Bekleyen', value: '34', color: 'text-yellow-500' },
          { label: 'Devam Eden', value: '12', color: 'text-blue-500' },
          { label: 'Bugün Tamamlanan', value: '156', color: 'text-green-500' },
          { label: 'Geciken', value: '3', color: 'text-red-500' },
        ].map((stat, i) => (
          <div key={i} className={`${cardClass} border rounded-xl p-6`}>
            <p className={`text-3xl font-bold mb-2 ${stat.color}`}>{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className={`${cardClass} border rounded-xl overflow-hidden`}>
        <div className="p-4 border-b flex items-center justify-between bg-gray-50 dark:bg-gray-800">
          <h3 className={`font-bold ${textClass}`}>Anlık Görev Kuyruğu</h3>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-blue-500 text-white rounded text-sm">Filtrele</button>
            <button className="px-3 py-1 bg-green-500 text-white rounded text-sm flex items-center gap-1">
              <Zap className="w-4 h-4" />
              Rota Optimize Et
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {tasks.map(task => (
            <div key={task.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${task.type === 'Toplama' ? 'bg-blue-500' : task.type === 'Yerleştirme' ? 'bg-green-500' : task.type === 'Besleme' ? 'bg-orange-500' : 'bg-gray-500'
                  }`}>
                  {task.type[0]}
                </div>
                <div>
                  <div className={`font-semibold ${textClass}`}>{task.type} - {task.loc}</div>
                  <div className="text-sm text-gray-500">Sorumlu: {task.user}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${task.priority === 'Kritik' ? 'bg-red-100 text-red-600' :
                  task.priority === 'Yüksek' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                  {task.priority}
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
