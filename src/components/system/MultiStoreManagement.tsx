// Multi-Store Management Module - Çoklu Mağaza Yönetimi

import { useState } from 'react';
import {
  Store,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Users,
  Package,
  DollarSign,
  Target,
  Calendar,
  MapPin,
  BarChart3,
  Download,
  Upload,
  RefreshCw,
  Settings,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight,
  Activity,
  PieChart,
  ShoppingCart,
  Search,
  X,
  Plus
} from 'lucide-react';
import { useAggregatedStats, useRegionStats, useTopStores } from '../../hooks/useInfiniteStores';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart as RePieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

import { formatCurrency as formatCurrencyUtil, formatNumber as formatNumberUtil } from '../../utils/formatNumber';

export function MultiStoreManagement() {
  const [selectedView, setSelectedView] = useState<'comparison' | 'targets' | 'analytics'>('comparison');
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [comparisonMetric, setComparisonMetric] = useState<'revenue' | 'transactions' | 'avgBasket' | 'growth'>('revenue');

  const { data: stats } = useAggregatedStats();
  const { data: regionStats } = useRegionStats();
  const { data: topStores } = useTopStores(20);

  const formatCurrency = (value: number) => {
    return formatNumberUtil(value, 0, false) + ' IQD';
  };

  const formatNumber = (value: number) => {
    return formatNumberUtil(value, 0, false);
  };

  const viewTabs = [
    { id: 'comparison' as const, label: 'Mağaza Karşılaştırma', icon: BarChart3, disabled: false },

    { id: 'targets' as const, label: 'Hedef Yönetimi', icon: Target, disabled: false },
    { id: 'analytics' as const, label: 'Detaylı Analitik', icon: TrendingUp, disabled: false },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl text-gray-900 flex items-center gap-2">
                <Store className="h-6 w-6 text-blue-600" />
                Çoklu Mağaza Yönetimi
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Merkezi mağaza karşılaştırma ve performans analizi
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span>Excel'e Aktar</span>
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span>Ayarlar</span>
              </button>
            </div>
          </div>

          {/* View Tabs */}
          <div className="flex gap-2">
            {viewTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => !tab.disabled && setSelectedView(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${tab.disabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                    : selectedView === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  disabled={tab.disabled}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {tab.disabled && (
                    <span className="ml-1 text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                      Yakında
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content Area - SCROLLABLE */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {selectedView === 'comparison' && <StoreComparisonView regionStats={regionStats} topStores={topStores} />}

          {selectedView === 'targets' && <TargetManagementView formatNumber={formatNumber} />}
          {selectedView === 'analytics' && <DetailedAnalyticsView />}
        </div>
      </div>
    </div>
  );
}

// Store Comparison View
function StoreComparisonView({ regionStats, topStores }: any) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value) + ' IQD';
  };

  return (
    <div className="space-y-6">
      {/* Regional Performance */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900">Bölgesel Performans Karşılaştırma</h3>
        </div>
        <div className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Bölge</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Mağaza Sayısı</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Toplam Ciro</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">İşlem Sayısı</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Ortalama Sepet</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Performans</th>
                </tr>
              </thead>
              <tbody>
                {regionStats?.map((region: any, index: number) => (
                  <tr key={region.regionId} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">{region.regionName}</span>
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 text-gray-900">{region.storeCount}</td>
                    <td className="text-right py-3 px-4 font-semibold text-green-600">
                      {formatCurrency(region.revenue)}
                    </td>
                    <td className="text-right py-3 px-4 text-gray-900">
                      {new Intl.NumberFormat('tr-TR').format(region.transactions)}
                    </td>
                    <td className="text-right py-3 px-4 text-gray-900">
                      {formatCurrency(region.avgBasket)}
                    </td>
                    <td className="text-right py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        {index % 2 === 0 ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                        <span className={index % 2 === 0 ? 'text-green-600' : 'text-red-600'}>
                          {index % 2 === 0 ? '+' : '-'}{(Math.random() * 10).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Top vs Bottom Performers */}
      <div className="grid grid-cols-2 gap-6">
        {/* Top Performers */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b bg-green-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              En İyi Performans (Top 10)
            </h3>
          </div>
          <div className="p-4 max-h-96 overflow-auto">
            {topStores?.slice(0, 10).map((store: any, index: number) => (
              <div key={store.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-green-50 mb-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{store.name}</div>
                  <div className="text-sm text-gray-600">{store.code}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-green-600">
                    {formatCurrency(store.stats.revenue)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Intl.NumberFormat('tr-TR').format(store.stats.transactionCount)} işlem
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Performers */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b bg-red-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              Düşük Performans (Bottom 10)
            </h3>
          </div>
          <div className="p-4 max-h-96 overflow-auto">
            {topStores?.slice(-10).reverse().map((store: any, index: number) => (
              <div key={store.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-red-50 mb-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{store.name}</div>
                  <div className="text-sm text-gray-600">{store.code}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-red-600">
                    {formatCurrency(store.stats.revenue)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Intl.NumberFormat('tr-TR').format(store.stats.transactionCount)} işlem
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}



// Target Management View
function TargetManagementView({ formatNumber }: { formatNumber: (value: number) => string }) {
  const { data: regionStats } = useRegionStats();
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState<any>(null);
  const [regionalTargets, setRegionalTargets] = useState<{ [key: string]: number }>({
    'baghdad': 2800000000,    // 2.8B IQD
    'erbil': 2600000000,      // 2.6B IQD
    'basra': 2300000000,      // 2.3B IQD
    'mosul': 1800000000,      // 1.8B IQD
    'najaf': 2100000000,      // 2.1B IQD
    'sulaymaniyah': 1700000000, // 1.7B IQD
    'duhok': 2000000000,      // 2.0B IQD
    'kirkuk': 1750000000,     // 1.75B IQD
  });

  const totalTarget = Object.values(regionalTargets).reduce((sum, val) => sum + val, 0);
  const totalRevenue = regionStats?.reduce((sum: number, r: any) => sum + r.revenue, 0) || 0;
  const totalAchievement = (totalRevenue / totalTarget) * 100;
  const storesReachedTarget = regionStats?.filter((r: any) => {
    const target = regionalTargets[r.regionId] || r.revenue * 1.2;
    return r.revenue >= target;
  }).length || 0;

  const handleEditTarget = (regionId: string, currentRevenue: number) => {
    setEditingTarget({
      regionId,
      regionName: regionStats?.find((r: any) => r.regionId === regionId)?.regionName,
      currentTarget: regionalTargets[regionId] || currentRevenue * 1.2,
      currentRevenue
    });
    setShowTargetModal(true);
  };

  const handleSaveTarget = (regionId: string, newTarget: number) => {
    setRegionalTargets({ ...regionalTargets, [regionId]: newTarget });
    setShowTargetModal(false);
    setEditingTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* Target Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Total Target */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Hedef</span>
            <Target className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatNumber(totalTarget)} IQD</div>
          <div className="text-sm text-gray-600 mt-1">Aylık hedef</div>
        </div>

        {/* Completed */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/80">Gerçekleşen</span>
            <CheckCircle className="h-5 w-5 text-white/80" />
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(totalRevenue)} IQD</div>
          <div className="text-sm text-white/80 mt-1">%{totalAchievement.toFixed(1)} tamamlandı</div>
        </div>

        {/* Remaining */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/80">Kalan</span>
            <Clock className="h-5 w-5 text-white/80" />
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(totalTarget - totalRevenue)} IQD</div>
          <div className="text-sm text-white/80 mt-1">15 gün kaldı</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Ulaşan Bölge</span>
            <Store className="h-5 w-5 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-600">{storesReachedTarget}</div>
          <div className="text-sm text-gray-600 mt-1">/ {regionStats?.length || 8} bölge</div>
        </div>
      </div>

      {/* Regional Targets */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Bölgesel Hedef Takibi</h3>
          <button
            onClick={() => {
              setEditingTarget(null);
              setShowTargetModal(true);
            }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1 text-sm"
          >
            <Plus className="h-4 w-4" />
            Hedef Güncelle
          </button>
        </div>
        <div className="p-4 max-h-96 overflow-auto">
          {regionStats?.map((region: any) => {
            const target = regionalTargets[region.regionId] || region.revenue * 1.2;
            const achievement = (region.revenue / target) * 100;

            return (
              <div key={region.regionId} className="mb-4 last:mb-0 p-4 border rounded-lg hover:bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{region.regionName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      {achievement.toFixed(1)}% tamamlandı
                    </span>
                    <button
                      onClick={() => handleEditTarget(region.regionId, region.revenue)}
                      className="p-1.5 hover:bg-blue-50 rounded text-blue-600"
                      title="Hedef Düzenle"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full ${achievement >= 100 ? 'bg-green-500' :
                      achievement >= 75 ? 'bg-blue-500' :
                        achievement >= 50 ? 'bg-yellow-500' :
                          'bg-red-500'
                      }`}
                    style={{ width: `${Math.min(achievement, 100)}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between mt-1 text-sm text-gray-600">
                  <span>{formatNumber(region.revenue)} IQD</span>
                  <span className="font-medium">{formatNumber(target)} IQD hedef</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Target Edit Modal */}
      {showTargetModal && (
        <TargetEditModal
          editingTarget={editingTarget}
          regionalTargets={regionalTargets}
          regionStats={regionStats}
          formatNumber={formatNumber}
          onSave={handleSaveTarget}
          onClose={() => {
            setShowTargetModal(false);
            setEditingTarget(null);
          }}
        />
      )}
    </div>
  );
}

// Target Edit Modal Component
function TargetEditModal({
  editingTarget,
  regionalTargets,
  regionStats,
  formatNumber,
  onSave,
  onClose
}: {
  editingTarget: any;
  regionalTargets: { [key: string]: number };
  regionStats: any;
  formatNumber: (value: number) => string;
  onSave: (regionId: string, newTarget: number) => void;
  onClose: () => void;
}) {
  const [selectedRegion, setSelectedRegion] = useState(editingTarget?.regionId || '');
  const [targetValue, setTargetValue] = useState(
    editingTarget?.currentTarget?.toString() || ''
  );

  const formatNumberInput = (value: string): string => {
    const cleanValue = value.replace(/[^\d]/g, '');
    return cleanValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const parseFormattedNumber = (value: string): number => {
    return parseFloat(value.replace(/,/g, '')) || 0;
  };

  const handleSave = () => {
    if (!selectedRegion || !targetValue) return;
    const numericValue = parseFormattedNumber(targetValue);
    if (numericValue <= 0) return;
    onSave(selectedRegion, numericValue);
  };

  const selectedRegionData = regionStats?.find((r: any) => r.regionId === selectedRegion);
  const currentRevenue = selectedRegionData?.revenue || 0;
  const targetNum = parseFormattedNumber(targetValue);
  const achievement = targetNum > 0 ? (currentRevenue / targetNum) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Target className="h-5 w-5" />
            Hedef Düzenle
          </h3>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Region Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bölge Seçin
            </label>
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                const region = regionStats?.find((r: any) => r.regionId === e.target.value);
                if (region) {
                  const existingTarget = regionalTargets[e.target.value] || region.revenue * 1.2;
                  setTargetValue(formatNumberInput(existingTarget.toString()));
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {!editingTarget && <option value="">Bir bölge seçin...</option>}
              {regionStats?.map((region: any) => (
                <option key={region.regionId} value={region.regionId}>
                  {region.regionName}
                </option>
              ))}
            </select>
          </div>

          {/* Target Value Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hedef Tutar (IQD)
            </label>
            <input
              type="text"
              value={targetValue}
              onChange={(e) => setTargetValue(formatNumberInput(e.target.value))}
              placeholder="Örn: 2,500,000,000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-mono"
            />
          </div>

          {/* Current Stats */}
          {selectedRegionData && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Mevcut Ciro:</span>
                <span className="font-semibold text-gray-900">
                  {formatNumber(currentRevenue)} IQD
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Yeni Hedef:</span>
                <span className="font-semibold text-blue-600">
                  {formatNumber(targetNum)} IQD
                </span>
              </div>
              <div className="pt-2 border-t border-blue-200">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Gerçekleşme:</span>
                  <span className={`font-semibold ${achievement >= 100 ? 'text-green-600' :
                    achievement >= 75 ? 'text-blue-600' :
                      achievement >= 50 ? 'text-yellow-600' :
                        'text-red-600'
                    }`}>
                    %{achievement.toFixed(1)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${achievement >= 100 ? 'bg-green-500' :
                      achievement >= 75 ? 'bg-blue-500' :
                        achievement >= 50 ? 'bg-yellow-500' :
                          'bg-red-500'
                      }`}
                    style={{ width: `${Math.min(achievement, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedRegion || !targetValue || parseFormattedNumber(targetValue) <= 0}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

// Detailed Analytics View
function DetailedAnalyticsView() {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [selectedMetric, setSelectedMetric] = useState<'revenue' | 'transactions' | 'customers'>('revenue');

  // Mock data for revenue trend (last 30 days)
  const revenueTrendData = Array.from({ length: 30 }, (_, i) => ({
    day: `${i + 1}`,
    revenue: Math.floor(Math.random() * 150000) + 80000,
    target: 120000,
    transactions: Math.floor(Math.random() * 500) + 300
  }));

  // Mock data for store performance comparison
  const storePerformanceData = [
    { name: 'İstanbul Kadıköy', revenue: 2450000, transactions: 12500, growth: 15.2 },
    { name: 'Ankara Çankaya', revenue: 1850000, transactions: 9800, growth: 8.5 },
    { name: 'İzmir Konak', revenue: 1650000, transactions: 8900, growth: -2.3 },
    { name: 'Bursa Nilüfer', revenue: 1450000, transactions: 7600, growth: 12.1 },
    { name: 'Antalya Muratpaşa', revenue: 1250000, transactions: 6800, growth: 5.7 },
    { name: 'Adana Seyhan', revenue: 980000, transactions: 5200, growth: -5.2 }
  ];

  // Mock data for hourly sales pattern
  const hourlySalesData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    sales: Math.floor(Math.random() * 50000) + 10000,
    customers: Math.floor(Math.random() * 200) + 50
  }));

  // Mock data for category distribution
  const categoryData = [
    { name: 'Giyim', value: 3500000, percentage: 35 },
    { name: 'Elektronik', value: 2800000, percentage: 28 },
    { name: 'Gıda', value: 1800000, percentage: 18 },
    { name: 'Kozmetik', value: 1200000, percentage: 12 },
    { name: 'Diğer', value: 700000, percentage: 7 }
  ];

  // Mock data for top products across stores
  const topProductsData = [
    { name: 'Ürün A', totalSales: 450000, storeCount: 28, avgPrice: 125 },
    { name: 'Ürün B', totalSales: 380000, storeCount: 25, avgPrice: 95 },
    { name: 'Ürün C', totalSales: 320000, storeCount: 22, avgPrice: 150 },
    { name: 'Ürün D', totalSales: 280000, storeCount: 20, avgPrice: 80 },
    { name: 'Ürün E', totalSales: 245000, storeCount: 18, avgPrice: 110 }
  ];

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-sm text-gray-600 block mb-2">Zaman Aralığı</label>
              <div className="flex gap-2">
                {[
                  { id: 'week', label: 'Son 7 Gün' },
                  { id: 'month', label: 'Son 30 Gün' },
                  { id: 'quarter', label: 'Son 3 Ay' },
                  { id: 'year', label: 'Son 1 Yıl' }
                ].map(range => (
                  <button
                    key={range.id}
                    onClick={() => setTimeRange(range.id as any)}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${timeRange === range.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600 block mb-2">Metrik</label>
              <div className="flex gap-2">
                {[
                  { id: 'revenue', label: 'Ciro', icon: DollarSign },
                  { id: 'transactions', label: 'İşlem', icon: ShoppingCart },
                  { id: 'customers', label: 'Müşteri', icon: Users }
                ].map(metric => {
                  const Icon = metric.icon;
                  return (
                    <button
                      key={metric.id}
                      onClick={() => setSelectedMetric(metric.id as any)}
                      className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors ${selectedMetric === metric.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                      <Icon className="h-4 w-4" />
                      {metric.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
            <Download className="h-4 w-4" />
            <span>Rapor İndir</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Ciro</span>
            <DollarSign className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-2xl text-gray-900">10,680,000</div>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-600">+12.5%</span>
            <span className="text-sm text-gray-500">önceki döneme göre</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam İşlem</span>
            <ShoppingCart className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-2xl text-gray-900">51,800</div>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-600">+8.3%</span>
            <span className="text-sm text-gray-500">önceki döneme göre</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Ort. Sepet Tutarı</span>
            <Activity className="h-5 w-5 text-purple-600" />
          </div>
          <div className="text-2xl text-gray-900">206</div>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-600">+3.8%</span>
            <span className="text-sm text-gray-500">önceki döneme göre</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Aktif Müşteri</span>
            <Users className="h-5 w-5 text-orange-600" />
          </div>
          <div className="text-2xl text-gray-900">38,450</div>
          <div className="flex items-center gap-1 mt-1">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <span className="text-sm text-red-600">-1.2%</span>
            <span className="text-sm text-gray-500">önceki döneme göre</span>
          </div>
        </div>
      </div>

      {/* Revenue Trend Chart */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Günlük Ciro Trendi (Son 30 Gün)
          </h3>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={revenueTrendData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="day" stroke="#6B7280" />
              <YAxis stroke="#6B7280" tickFormatter={(value) => formatNumber(value)} />
              <Tooltip
                formatter={(value: any) => formatNumber(value)}
                contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#3B82F6"
                fillOpacity={1}
                fill="url(#colorRevenue)"
                name="Gerçekleşen"
              />
              <Line
                type="monotone"
                dataKey="target"
                stroke="#EF4444"
                strokeDasharray="5 5"
                name="Hedef"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Store Performance & Hourly Pattern */}
      <div className="grid grid-cols-2 gap-6">
        {/* Store Performance */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h3 className="text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Mağaza Performans Karşılaştırması
            </h3>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={storePerformanceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" stroke="#6B7280" tickFormatter={(value) => formatNumber(value)} />
                <YAxis dataKey="name" type="category" stroke="#6B7280" width={120} />
                <Tooltip
                  formatter={(value: any) => formatNumber(value)}
                  contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                />
                <Legend />
                <Bar dataKey="revenue" fill="#3B82F6" name="Ciro" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly Sales Pattern */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h3 className="text-gray-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Saatlik Satış Dağılımı
            </h3>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={hourlySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="hour" stroke="#6B7280" />
                <YAxis stroke="#6B7280" tickFormatter={(value) => formatNumber(value)} />
                <Tooltip
                  formatter={(value: any) => formatNumber(value)}
                  contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  name="Satış"
                  dot={{ fill: '#3B82F6', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Category Distribution & Top Products */}
      <div className="grid grid-cols-2 gap-6">
        {/* Category Distribution */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h3 className="text-gray-900 flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Kategori Dağılımı
            </h3>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <ResponsiveContainer width="50%" height={250}>
                <RePieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatNumber(value)} />
                </RePieChart>
              </ResponsiveContainer>

              <div className="flex-1 space-y-2">
                {categoryData.map((cat, index) => (
                  <div key={cat.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      ></div>
                      <span className="text-sm text-gray-700">{cat.name}</span>
                    </div>
                    <span className="text-sm text-gray-900">{cat.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h3 className="text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              En Çok Satan Ürünler
            </h3>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {topProductsData.map((product, index) => (
                <div key={product.name} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-900 truncate">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.storeCount} mağazada</div>
                  </div>
                  <div className="text-right">
                    <div className="text-blue-600">{formatNumber(product.totalSales)}</div>
                    <div className="text-xs text-gray-500">Ort: {formatNumber(product.avgPrice)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Performance Table */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Detaylı Mağaza Performansı
          </h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 text-sm text-gray-700">Mağaza</th>
                <th className="text-right py-3 px-4 text-sm text-gray-700">Ciro</th>
                <th className="text-right py-3 px-4 text-sm text-gray-700">İşlem Sayısı</th>
                <th className="text-right py-3 px-4 text-sm text-gray-700">Ort. Sepet</th>
                <th className="text-right py-3 px-4 text-sm text-gray-700">Büyüme</th>
                <th className="text-right py-3 px-4 text-sm text-gray-700">Durum</th>
              </tr>
            </thead>
            <tbody>
              {storePerformanceData.map((store) => (
                <tr key={store.name} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-blue-600" />
                      <span className="text-gray-900">{store.name}</span>
                    </div>
                  </td>
                  <td className="text-right py-3 px-4 text-gray-900">
                    {formatNumber(store.revenue)}
                  </td>
                  <td className="text-right py-3 px-4 text-gray-900">
                    {formatNumber(store.transactions)}
                  </td>
                  <td className="text-right py-3 px-4 text-gray-900">
                    {formatNumber(Math.round(store.revenue / store.transactions))}
                  </td>
                  <td className="text-right py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      {store.growth >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                      <span className={store.growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {store.growth >= 0 ? '+' : ''}{store.growth.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="text-right py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${store.growth >= 10 ? 'bg-green-100 text-green-700' :
                      store.growth >= 0 ? 'bg-blue-100 text-blue-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                      {store.growth >= 10 ? 'Mükemmel' : store.growth >= 0 ? 'İyi' : 'Düşük'}
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
