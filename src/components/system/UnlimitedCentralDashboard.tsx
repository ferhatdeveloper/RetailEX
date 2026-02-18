// Unlimited Store Central Dashboard - Enterprise Edition

import { useState, useEffect } from 'react';
import { useQuery, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Search, TrendingUp, AlertCircle, Store, Users, ShoppingCart, Package, DollarSign, Map as MapIcon, List, GitBranch, Clock, CheckCircle, XCircle, Loader2, Zap, Activity, BarChart3 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

// Types
interface SearchFilters {
  region?: string;
  status?: string;
  search?: string;
}

interface StoreStats {
  revenue: number;
  transactionCount: number;
  avgBasket?: number;
  cashBalance?: number;
}

interface StoreItem {
  id: string;
  name: string;
  code: string;
  region: string;
  district?: string;
  manager?: string;
  status: 'active' | 'inactive' | 'maintenance';
  stats: StoreStats;
}

interface Alert {
  id: string;
  storeName: string;
  message: string;
  timestamp: string;
  severity: string;
}

// Real Data Hooks
const useAggregatedStats = () => {
  return useQuery({
    queryKey: ['aggregatedStats'],
    queryFn: async () => {
      // Import dashboard API dynamically to avoid circular dependencies
      const { dashboardAPI } = await import('../../services/api/dashboard');
      return await dashboardAPI.getStats();
    },
    refetchInterval: 30000 // Her 30 saniyede bir güncelle
  });
};


const useTopStores = (limit: number) => {
  return useQuery({
    queryKey: ['topStores', limit],
    queryFn: async (): Promise<StoreItem[]> => {
      const { dashboardAPI } = await import('../../services/api/dashboard');
      const topStores = await dashboardAPI.getTopStores(limit);
      return topStores.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        region: s.region,
        district: s.district,
        manager: s.manager,
        status: s.status,
        stats: {
          revenue: s.revenue,
          transactionCount: s.transactionCount,
          avgBasket: s.avgBasket,
          cashBalance: s.cashBalance
        }
      }));
    }
  });
};

const useCriticalAlerts = (limit: number) => {
  return useQuery({
    queryKey: ['criticalAlerts', limit],
    queryFn: async (): Promise<Alert[]> => {
      const { dashboardAPI } = await import('../../services/api/dashboard');
      return await dashboardAPI.getCriticalAlerts(limit);
    }
  });
};

const useStoreList = () => {
  return useQuery({
    queryKey: ['storeList'],
    queryFn: async (): Promise<StoreItem[]> => {
      const { dashboardAPI } = await import('../../services/api/dashboard');
      const stores = await dashboardAPI.getStoreList();
      return stores.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        region: s.region,
        district: s.district,
        manager: s.manager,
        status: s.status,
        stats: {
          revenue: s.revenue,
          transactionCount: s.transactionCount,
          avgBasket: s.avgBasket,
          cashBalance: s.cashBalance
        }
      }));
    }
  });
};

// Mock Components
const AdvancedStoreSearch = ({ onSearch, onStoreSelect }: any) => (
  <div className="bg-white rounded-lg shadow-sm border p-4">
    <div className="flex items-center gap-2 mb-3">
      <Search className="w-5 h-5 text-gray-400" />
      <h3 className="font-semibold text-gray-900">Mağaza Ara</h3>
    </div>
    <input
      type="text"
      placeholder="Mağaza adı, kod veya bölge ara..."
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      onChange={(e) => onSearch({ search: e.target.value })}
    />
  </div>
);

const VirtualStoreList = ({ filters, onStoreSelect }: any) => {
  const { data: stores = [], isLoading } = useStoreList();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value) + ' IQD';
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('tr-TR').format(value);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Filter stores based on search
  const filteredStores = stores.filter(store => {
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      return (
        store.name.toLowerCase().includes(search) ||
        store.code.toLowerCase().includes(search) ||
        store.region.toLowerCase().includes(search) ||
        (store.district && store.district.toLowerCase().includes(search)) ||
        (store.manager && store.manager.toLowerCase().includes(search))
      );
    }
    return true;
  });

  // Calculate totals
  const totalRevenue = filteredStores.reduce((sum, s) => sum + s.stats.revenue, 0);
  const totalTransactions = filteredStores.reduce((sum, s) => sum + s.stats.transactionCount, 0);
  const totalCashBalance = filteredStores.reduce((sum, s) => sum + (s.stats.cashBalance || 0), 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-gray-900">
            Toplam {filteredStores.length} Mağaza
          </span>
        </div>
      </div>

      {/* Store List - Tablo Formatında */}
      <div className="flex-1 overflow-auto">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Kod</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Mağaza</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Bölge</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Müdür</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Bugün Ciro</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">İşlem</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Ort. Sepet</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Kasa</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Durum</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredStores.map((store) => (
                <tr
                  key={store.id}
                  onClick={() => onStoreSelect?.(store.id)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{store.code}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center font-bold text-xs">
                        {store.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{store.name}</div>
                        {store.district && (
                          <div className="text-xs text-gray-500">{store.district}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{store.region}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{store.manager || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right font-semibold">
                    {formatCurrency(store.stats.revenue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">
                    {formatNumber(store.stats.transactionCount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">
                    {formatCurrency(store.stats.avgBasket || 0)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">
                    {formatCurrency(store.stats.cashBalance || 0)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {store.status === 'active' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Aktif
                      </span>
                    )}
                    {store.status === 'inactive' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                        <XCircle className="w-3 h-3" />
                        Kapalı
                      </span>
                    )}
                    {store.status === 'maintenance' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                        <AlertCircle className="w-3 h-3" />
                        Bakım
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Footer - Totals */}
            <tfoot className="bg-blue-50 border-t-2 border-blue-200 sticky bottom-0">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-900">
                  TOPLAM ({filteredStores.length} Mağaza)
                </td>
                <td className="px-4 py-3 text-sm font-bold text-blue-600 text-right">
                  {formatCurrency(totalRevenue)}
                </td>
                <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                  {formatNumber(totalTransactions)}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">
                  {formatCurrency(totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0)}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">
                  {formatCurrency(totalCashBalance)}
                </td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

const HierarchicalStoreTree = ({ onStoreSelect }: any) => {
  const { data: stores = [], isLoading } = useStoreList();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value) + ' IQD';
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Group stores by region
  const storesByRegion = stores.reduce((acc, store) => {
    if (!acc[store.region]) {
      acc[store.region] = [];
    }
    acc[store.region].push(store);
    return acc;
  }, {} as Record<string, typeof stores>);

  const regions = Object.keys(storesByRegion);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-gray-900">
            Hiyerarşik Görünüm • {regions.length} Bölge
          </span>
        </div>
      </div>

      {/* Tree View */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          {regions.map((region) => (
            <div key={region} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              {/* Region Header */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-3 border-b border-blue-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapIcon className="h-5 w-5 text-blue-600" />
                    <span className="font-semibold text-gray-900">{region}</span>
                    <span className="text-sm text-gray-600">
                      ({storesByRegion[region].length} mağaza)
                    </span>
                  </div>
                  <div className="text-sm font-medium text-blue-600">
                    {formatCurrency(
                      storesByRegion[region].reduce((sum: number, s: StoreItem) => sum + s.stats.revenue, 0)
                    )}
                  </div>
                </div>
              </div>

              {/* Stores in Region */}
              <div className="p-2 space-y-1">
                {storesByRegion[region].map((store) => (
                  <button
                    key={store.id}
                    onClick={() => onStoreSelect?.(store.id)}
                    className="w-full p-3 rounded-lg hover:bg-blue-50 transition-colors text-left border border-transparent hover:border-blue-200"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
                          {store.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{store.name}</div>
                          <div className="text-xs text-gray-600">{store.code}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-blue-600 text-sm">
                          {formatCurrency(store.stats.revenue)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {store.stats.transactionCount} işlem
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Initialize React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

interface UnlimitedCentralDashboardProps {
  onStoreSelect?: (storeId: string) => void;
}

function UnlimitedCentralDashboardContent({ onStoreSelect }: UnlimitedCentralDashboardProps) {
  const [filters, setFilters] = useState<SearchFilters>({});
  const [viewMode, setViewMode] = useState<'list' | 'tree' | 'map'>('list');
  const [currentTime, setCurrentTime] = useState(new Date());
  const { darkMode } = useTheme();
  const queryClient = useQueryClient();

  // Fetch aggregated stats with error handling
  const { data: stats, isLoading: statsLoading, error: statsError } = useAggregatedStats();
  const { data: topStores, error: topStoresError } = useTopStores(5);
  const { data: alerts, error: alertsError } = useCriticalAlerts(50);

  // Log errors for debugging
  useEffect(() => {
    if (statsError) console.error('❌ Stats Error:', statsError);
    if (topStoresError) console.error('❌ Top Stores Error:', topStoresError);
    if (alertsError) console.error('❌ Alerts Error:', alertsError);
  }, [statsError, topStoresError, alertsError]);

  // Clock update
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto refresh stores data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate real-time data updates
      queryClient.invalidateQueries({ queryKey: ['aggregatedStats'] });
      queryClient.invalidateQueries({ queryKey: ['topStores'] });
    }, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value) + ' IQD';
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('tr-TR').format(value);
  };

  return (
    <div className={`h-full flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl">Merkezi Kontrol Paneli - Enterprise</h1>
              <p className="text-sm text-blue-100 mt-1">
                Sınırsız Mağaza Yönetim Sistemi • Real-time Monitoring
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* Current Time */}
              <div className="flex items-center gap-2 text-sm bg-blue-500 bg-opacity-30 px-4 py-2 rounded-lg backdrop-blur">
                <Clock className="w-4 h-4" />
                <span>{currentTime.toLocaleTimeString('tr-TR')}</span>
              </div>

              {/* Auto Refresh */}
              <div className="flex items-center gap-2 text-sm bg-green-500 bg-opacity-30 px-4 py-2 rounded-lg backdrop-blur">
                <Zap className="w-4 h-4" />
                <span>Live</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="grid grid-cols-5 gap-4">
            {/* Total Revenue */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Toplam Ciro</span>
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              {statsLoading ? (
                <div className="h-8 bg-blue-200 rounded animate-pulse"></div>
              ) : (
                <>
                  <div className="text-2xl text-gray-900 mb-1">
                    {formatCurrency(stats?.totalRevenue || 0)}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-green-600">
                    <TrendingUp className="w-4 h-4" />
                    <span>+12.5%</span>
                  </div>
                </>
              )}
            </div>

            {/* Total Transactions */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">İşlem Sayısı</span>
                <ShoppingCart className="w-5 h-5 text-green-600" />
              </div>
              {statsLoading ? (
                <div className="h-8 bg-green-200 rounded animate-pulse"></div>
              ) : (
                <>
                  <div className="text-2xl text-gray-900 mb-1">
                    {formatNumber(stats?.totalTransactions || 0)}
                  </div>
                  <div className="text-sm text-gray-600">
                    Bugün
                  </div>
                </>
              )}
            </div>

            {/* Average Basket */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Ortalama Sepet</span>
                <Activity className="w-5 h-5 text-purple-600" />
              </div>
              {statsLoading ? (
                <div className="h-8 bg-purple-200 rounded animate-pulse"></div>
              ) : (
                <>
                  <div className="text-2xl text-gray-900 mb-1">
                    {formatCurrency(stats?.avgBasket || 0)}
                  </div>
                  <div className="text-sm text-gray-600">
                    Müşteri başı
                  </div>
                </>
              )}
            </div>

            {/* Active Stores */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Aktif Mağaza</span>
                <Store className="w-5 h-5 text-orange-600" />
              </div>
              {statsLoading ? (
                <div className="h-8 bg-orange-200 rounded animate-pulse"></div>
              ) : (
                <>
                  <div className="text-2xl text-gray-900 mb-1">
                    {formatNumber(stats?.activeStores || 0)}
                  </div>
                  <div className="text-sm text-gray-600">
                    / {formatNumber(stats?.totalStores || 0)} toplam
                  </div>
                </>
              )}
            </div>

            {/* Critical Alerts */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Kritik Uyarı</span>
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {alerts?.length || 0}
              </div>
              <div className="text-sm text-red-600">
                Acil müdahale gerekli
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex gap-6 p-6 overflow-auto">
          {/* Left Panel - Search & Filters */}
          <div className="w-[500px] flex flex-col gap-4 flex-shrink-0">
            {/* Advanced Search */}
            <AdvancedStoreSearch
              onSearch={setFilters}
              onStoreSelect={(store: StoreItem) => onStoreSelect?.(store.id)}
            />

            {/* Top Performers */}
            <div className="bg-white rounded-lg shadow-sm border flex-1 overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-gradient-to-r from-green-50 to-green-100">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold text-gray-900">En Yüksek Performans</h3>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {topStores?.map((item, index) => {
                  return (
                    <button
                      key={item.id}
                      onClick={() => onStoreSelect?.(item.id)}
                      className="w-full p-3 rounded-lg hover:bg-green-50 transition-colors text-left mb-2 border border-transparent hover:border-green-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white flex items-center justify-center font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">{item.name}</div>
                          <div className="text-sm text-gray-600">{item.code}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-green-600">
                            {formatCurrency(item.stats.revenue)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatNumber(item.stats.transactionCount)} işlem
                          </div>
                          {item.stats.avgBasket && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              Ort: {formatCurrency(item.stats.avgBasket)}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Critical Alerts */}
            <div className="bg-white rounded-lg shadow-sm border max-h-[300px] overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-gradient-to-r from-red-50 to-red-100">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <h3 className="font-semibold text-gray-900">Kritik Uyarılar</h3>
                  <span className="ml-auto bg-red-600 text-white px-2 py-1 rounded-full text-xs">
                    {alerts?.length || 0}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {alerts?.slice(0, 10).map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 rounded-lg bg-red-50 border border-red-200 mb-2"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">{alert.storeName}</div>
                        <div className="text-xs text-gray-600 mt-1">{alert.message}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(alert.timestamp).toLocaleString('tr-TR')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel - Store List/Tree */}
          <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border overflow-hidden">
            {/* View Mode Selector */}
            <div className="p-4 border-b bg-gray-50">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border'
                    }`}
                >
                  <List className="h-4 w-4" />
                  <span>Liste Görünümü</span>
                </button>
                <button
                  onClick={() => setViewMode('tree')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${viewMode === 'tree'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border'
                    }`}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Hiyerarşi Görünümü</span>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {viewMode === 'list' ? (
                <VirtualStoreList
                  filters={filters}
                  onStoreSelect={onStoreSelect}
                />
              ) : (
                <HierarchicalStoreTree
                  onStoreSelect={onStoreSelect}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrapper with QueryClientProvider
export function UnlimitedCentralDashboard(props: UnlimitedCentralDashboardProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <UnlimitedCentralDashboardContent {...props} />
    </QueryClientProvider>
  );
}
