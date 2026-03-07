import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Users, Package, ShoppingCart, AlertCircle, TrendingDown, ArrowUpCircle, ArrowDownCircle, Zap, Clock, Loader2, Map, Store as StoreIcon, Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../../utils/logger';
import { useTheme } from '../../contexts/ThemeContext';

// Mock data
const stores = [
  { id: '1', name: 'Baghdad Merkez', code: 'BGD-01', region: 'Baghdad', district: 'Karrada', manager: 'Ahmed Hassan', status: 'active' },
  { id: '2', name: 'Erbil AVM', code: 'ERB-01', region: 'Kurdistan', district: 'Downtown', manager: 'Layla Ali', status: 'active' },
  { id: '3', name: 'Basra Liman', code: 'BAS-01', region: 'Basra', district: 'Port Area', manager: 'Hussein Karim', status: 'active' },
];

const todayStats = [
  { storeId: '1', revenue: 45000000, transactionCount: 234, avgBasket: 192307, cashBalance: 12500000 },
  { storeId: '2', revenue: 38000000, transactionCount: 198, avgBasket: 191919, cashBalance: 9800000 },
  { storeId: '3', revenue: 29000000, transactionCount: 145, avgBasket: 200000, cashBalance: 7200000 },
];

const getTotalStats = () => ({
  revenue: 112000000,
  transactions: 577,
  totalStores: 3,
  avgBasket: 194111
});

const getActiveStores = () => stores.filter(s => s.status === 'active');

const getCriticalAlerts = () => [
  { id: '1', storeName: 'Baghdad Merkez', message: 'Kasa limiti aşıldı', severity: 'critical' }
];

const getUnresolvedAlerts = () => [
  { id: '1', storeName: 'Baghdad Merkez', message: 'Kasa limiti aşıldı', severity: 'critical' }
];

interface CentralDashboardProps {
  products: any[];
  customers: any[];
  sales: any[];
  onStoreSelect?: (storeId: string) => void;
}

export function CentralDashboard({ onStoreSelect }: CentralDashboardProps) {
  const [selectedRegion, setSelectedRegion] = useState<string>('Tümü');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(''); // YYYY-MM-DD
  const { darkMode } = useTheme();

  useEffect(() => {
    const fetchLastSync = async () => {
      try {
        const config = await invoke('get_app_config');
        const info: any = await invoke('get_last_sync_info', { config });
        if (info.last_sync_date) {
          setLastSyncDate(new Date(info.last_sync_date).toLocaleString('tr-TR'));
        }
      } catch (err) {
        console.error('Failed to fetch last sync info:', err);
      }
    };
    fetchLastSync();
  }, [refreshKey]);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      const config = await invoke('get_app_config');
      await invoke('sync_logo_delta', {
        config,
        startDate: startDate || null
      });
      setRefreshKey(prev => prev + 1);
      logger.info('Incremental sync completed successfully');
      setStartDate(''); // Clear after success
    } catch (error) {
      console.error('Sync failed:', error);
      logger.error('Senkronizasyon başarısız oldu', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const totalStats = getTotalStats();
  const activeStores = getActiveStores();
  const criticalAlerts = getCriticalAlerts();
  const unresolvedAlerts = getUnresolvedAlerts();

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      setRefreshKey(prev => prev + 1);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Clock update
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const regions = ['Tümü', ...Array.from(new Set(stores.map(s => s.region)))];

  const filteredStores = selectedRegion === 'Tümü'
    ? stores
    : stores.filter(s => s.region === selectedRegion);

  const filteredStats = todayStats.filter(stat =>
    filteredStores.some(s => s.id === stat.storeId)
  );

  const regionRevenue = filteredStats.reduce((sum, stat) => sum + stat.revenue, 0);
  const regionTransactions = filteredStats.reduce((sum, stat) => sum + stat.transactionCount, 0);

  // Top performing stores
  const topStores = [...todayStats]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(stat => ({
      ...stat,
      store: stores.find(s => s.id === stat.storeId)!
    }));

  // Bottom performing stores
  const bottomStores = [...todayStats]
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, 5)
    .map(stat => ({
      ...stat,
      store: stores.find(s => s.id === stat.storeId)!
    }));

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl text-gray-900">Merkezi Kontrol Paneli</h1>
              <p className="text-sm text-gray-600 mt-1">{stores.length} Mağaza - Anlık Durum İzleme</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Last Sync Display */}
              {lastSyncDate && (
                <div className="flex flex-col items-end mr-2">
                  <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Son Senkronizasyon</span>
                  <span className="text-xs font-bold text-blue-600">{lastSyncDate}</span>
                </div>
              )}

              {/* Date Selection */}
              <div className="relative group">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all hover:bg-white"
                  title="Başlangıç Tarihi Seçin (Opsiyonel)"
                />
                {startDate && (
                  <button
                    onClick={() => setStartDate('')}
                    className="absolute -top-2 -right-2 bg-gray-200 text-gray-600 rounded-full p-0.5 hover:bg-gray-300 transition-colors"
                  >
                    <XCircle className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Sync Button */}
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-premium active:scale-95 ${isSyncing
                    ? 'bg-blue-100 text-blue-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg'
                  }`}
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Senkronize Ediliyor...' : startDate ? 'Seçili Tarihten Çek' : 'Kaldığı Yerden Devam Et'}</span>
              </button>

              {/* Last Update */}
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-lg">
                <Clock className="w-4 h-4" />
                <span>{currentTime.toLocaleTimeString('tr-TR')}</span>
              </div>

              {/* Auto Refresh Indicator */}
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                <Zap className="w-4 h-4" />
                <span>Otomatik Güncelleme</span>
              </div>
            </div>
          </div>

          {/* Region Filter */}
          <div className="flex gap-2">
            {regions.map(region => (
              <button
                key={region}
                onClick={() => setSelectedRegion(region)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${selectedRegion === region
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {region}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-[1600px] mx-auto space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-5 gap-4">
            {/* Total Revenue */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {(selectedRegion === 'Tümü' ? totalStats.revenue : regionRevenue).toLocaleString('tr-TR')} IQD
              </div>
              <div className="text-sm text-gray-600">Bugün Ciro</div>
              <div className="text-xs text-green-600 mt-2">+12.5% dünle karşılaştırıldığında</div>
            </div>

            {/* Transactions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-green-600" />
                </div>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {(selectedRegion === 'Tümü' ? totalStats.transactions : regionTransactions).toLocaleString('tr-TR')}
              </div>
              <div className="text-sm text-gray-600">İşlem Sayısı</div>
              <div className="text-xs text-green-600 mt-2">+8.3% ortalama artış</div>
            </div>

            {/* Active Stores */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <StoreIcon className="w-5 h-5 text-purple-600" />
                </div>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {activeStores.length}/{totalStats.totalStores}
              </div>
              <div className="text-sm text-gray-600">Aktif Mağaza</div>
              <div className="text-xs text-gray-500 mt-2">{totalStats.totalStores - activeStores.length} bakımda</div>
            </div>

            {/* Avg Basket */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Activity className="w-5 h-5 text-orange-600" />
                </div>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {totalStats.avgBasket.toLocaleString('tr-TR')} IQD
              </div>
              <div className="text-sm text-gray-600">Ortalama Sepet</div>
              <div className="text-xs text-green-600 mt-2">+5.7% artış</div>
            </div>

            {/* Alerts */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                {criticalAlerts.length > 0 && (
                  <div className="w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-xs">
                    {criticalAlerts.length}
                  </div>
                )}
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {unresolvedAlerts.length}
              </div>
              <div className="text-sm text-gray-600">Açık Uyarı</div>
              <div className="text-xs text-red-600 mt-2">{criticalAlerts.length} kritik</div>
            </div>
          </div>

          {/* Critical Alerts Banner */}
          {criticalAlerts.length > 0 && (
            <div className="bg-red-50 border-l-4 border-red-600 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-red-900 font-medium mb-2">Kritik Uyarılar</div>
                  <div className="space-y-2">
                    {criticalAlerts.slice(0, 3).map(alert => (
                      <div key={alert.id} className="flex items-center justify-between bg-white rounded p-2">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">{alert.storeName}</span>
                          <span className="text-sm text-gray-700">{alert.message}</span>
                        </div>
                        <button className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700">
                          İncele
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Top Performing Stores */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-gray-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  En İyi Performans (Bugün)
                </h3>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  {topStores.map((item, index) => (
                    <div key={item.storeId} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center text-sm">
                        #{index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-gray-900">{item.store.name}</div>
                        <div className="text-xs text-gray-600">{item.store.district}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {item.revenue.toLocaleString('tr-TR')} IQD
                        </div>
                        <div className="text-xs text-gray-600">{item.transactionCount} işlem</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Performing Stores */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-gray-900 flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-orange-600" />
                  Düşük Performans (Bugün)
                </h3>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  {bottomStores.map((item, index) => (
                    <div key={item.storeId} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-100 text-orange-700 rounded-lg flex items-center justify-center text-sm">
                        #{index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-gray-900">{item.store.name}</div>
                        <div className="text-xs text-gray-600">{item.store.district}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {item.revenue.toLocaleString('tr-TR')} IQD
                        </div>
                        <div className="text-xs text-gray-600">{item.transactionCount} işlem</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* All Stores Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-gray-900">Tüm Mağazalar - Anlık Durum</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs text-gray-600">Kod</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-600">Mağaza</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-600">Bölge</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-600">Müdür</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-600">Bugün Ciro</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-600">İşlem</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-600">Ort. Sepet</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-600">Kasa</th>
                    <th className="px-4 py-3 text-center text-xs text-gray-600">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStores.map(store => {
                    const stats = todayStats.find(s => s.storeId === store.id);
                    return (
                      <tr
                        key={store.id}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => onStoreSelect?.(store.id)}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900">{store.code}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">{store.name}</div>
                          <div className="text-xs text-gray-600">{store.district}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{store.region}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{store.manager}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {stats?.revenue.toLocaleString('tr-TR')} IQD
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">
                          {stats?.transactionCount}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">
                          {stats?.avgBasket.toLocaleString('tr-TR')} IQD
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">
                          {stats?.cashBalance.toLocaleString('tr-TR')} IQD
                        </td>
                        <td className="px-4 py-3 text-center">
                          {store.status === 'active' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                              <CheckCircle className="w-3 h-3" />
                              Aktif
                            </span>
                          )}
                          {store.status === 'inactive' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                              <XCircle className="w-3 h-3" />
                              Kapalı
                            </span>
                          )}
                          {store.status === 'maintenance' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                              <AlertCircle className="w-3 h-3" />
                              Bakım
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
