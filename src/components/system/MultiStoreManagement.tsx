// Multi-Store Management Module - Çoklu Mağaza Yönetimi

import { useMemo, useState } from 'react';
import {
  Store,
  TrendingUp,
  TrendingDown,
  Users,
  Package,
  Banknote,
  Target,
  MapPin,
  BarChart3,
  Download,
  Settings,
  CheckCircle,
  Clock,
  Activity,
  ShoppingCart,
  X,
  Plus,
  Loader2,
} from 'lucide-react';
import {
  useRegionStats,
  useTopStores,
  useStoreAnalytics,
} from '../../hooks/useInfiniteStores';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart as RePieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatLedgerAmount, getFirmLedgerCurrency, getGlobalCurrency } from '../../utils/currency';
import { getAppDefaultCurrency } from '../../services/postgres';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import type { RegionStats } from '../../services/storeApiService';

function useFirmCurrency() {
  const { selectedFirm } = useFirmaDonem();
  return getFirmLedgerCurrency(selectedFirm, getAppDefaultCurrency() || getGlobalCurrency());
}

function formatGrowth(g: number | null | undefined): string {
  if (g == null || !Number.isFinite(g)) return '—';
  const sign = g > 0 ? '+' : '';
  return `${sign}${g.toFixed(1)}%`;
}

export function MultiStoreManagement() {
  const [selectedView, setSelectedView] = useState<'comparison' | 'targets' | 'analytics'>('comparison');
  const currency = useFirmCurrency();

  const { data: regionStats, isLoading: regionsLoading } = useRegionStats();
  const { data: topStores, isLoading: topLoading } = useTopStores(20);

  const formatCurrency = (value: number) => formatLedgerAmount(value, currency);

  const viewTabs = [
    { id: 'comparison' as const, label: 'Mağaza Karşılaştırma', icon: BarChart3 },
    { id: 'targets' as const, label: 'Hedef Yönetimi', icon: Target },
    { id: 'analytics' as const, label: 'Detaylı Analitik', icon: TrendingUp },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
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

          <div className="flex gap-2">
            {viewTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedView(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    selectedView === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {(regionsLoading || topLoading) && selectedView !== 'analytics' && (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Veriler yükleniyor…
            </div>
          )}
          {selectedView === 'comparison' && (
            <StoreComparisonView
              regionStats={regionStats}
              topStores={topStores}
              formatCurrency={formatCurrency}
            />
          )}
          {selectedView === 'targets' && (
            <TargetManagementView formatCurrency={formatCurrency} />
          )}
          {selectedView === 'analytics' && <DetailedAnalyticsView />}
        </div>
      </div>
    </div>
  );
}

function StoreComparisonView({
  regionStats,
  topStores,
  formatCurrency,
}: {
  regionStats?: RegionStats[];
  topStores?: Array<{ id: string; name: string; code: string; stats: { revenue: number; transactionCount: number } }>;
  formatCurrency: (n: number) => string;
}) {
  const sorted = useMemo(() => {
    const list = [...(topStores || [])];
    list.sort((a, b) => (a.stats?.revenue || 0) - (b.stats?.revenue || 0));
    return list;
  }, [topStores]);

  const bottom = sorted.slice(0, 10);
  const top = [...(topStores || [])].slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900">Bölgesel Performans Karşılaştırma</h3>
        </div>
        <div className="p-4">
          {!regionStats?.length ? (
            <p className="text-sm text-gray-500 py-6 text-center">Bölge verisi yok.</p>
          ) : (
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
                  {regionStats.map((region) => {
                    const g = region.growth;
                    const up = g != null && g >= 0;
                    return (
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
                          {g == null ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {up ? (
                                <TrendingUp className="h-4 w-4 text-green-600" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-red-600" />
                              )}
                              <span className={up ? 'text-green-600' : 'text-red-600'}>
                                {formatGrowth(g)}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b bg-green-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              En İyi Performans (Top 10)
            </h3>
          </div>
          <div className="p-4 max-h-96 overflow-auto">
            {!top.length ? (
              <p className="text-sm text-gray-500 text-center py-6">Mağaza verisi yok.</p>
            ) : (
              top.map((store, index) => (
                <div key={store.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-green-50 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{store.name}</div>
                    <div className="text-sm text-gray-600">{store.code}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-green-600">{formatCurrency(store.stats.revenue)}</div>
                    <div className="text-xs text-gray-500">
                      {new Intl.NumberFormat('tr-TR').format(store.stats.transactionCount)} işlem
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b bg-red-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              Düşük Performans (Bottom 10)
            </h3>
          </div>
          <div className="p-4 max-h-96 overflow-auto">
            {!bottom.length ? (
              <p className="text-sm text-gray-500 text-center py-6">Mağaza verisi yok.</p>
            ) : (
              bottom.map((store, index) => (
                <div key={store.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-red-50 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{store.name}</div>
                    <div className="text-sm text-gray-600">{store.code}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-red-600">{formatCurrency(store.stats.revenue)}</div>
                    <div className="text-xs text-gray-500">
                      {new Intl.NumberFormat('tr-TR').format(store.stats.transactionCount)} işlem
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TargetManagementView({
  formatCurrency,
}: {
  formatCurrency: (value: number) => string;
}) {
  const { data: regionStats } = useRegionStats();
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState<any>(null);
  /** Kullanıcı tanımlı hedefler — demo seed yok */
  const [regionalTargets, setRegionalTargets] = useState<Record<string, number>>({});

  const totalTarget = Object.values(regionalTargets).reduce((sum, val) => sum + val, 0);
  const totalRevenue = regionStats?.reduce((sum, r) => sum + r.revenue, 0) || 0;
  const totalAchievement = totalTarget > 0 ? (totalRevenue / totalTarget) * 100 : 0;
  const storesReachedTarget =
    regionStats?.filter((r) => {
      const target = regionalTargets[r.regionId];
      return target != null && target > 0 && r.revenue >= target;
    }).length || 0;

  const handleEditTarget = (regionId: string, currentRevenue: number) => {
    setEditingTarget({
      regionId,
      regionName: regionStats?.find((r) => r.regionId === regionId)?.regionName,
      currentTarget: regionalTargets[regionId] || currentRevenue || 0,
      currentRevenue,
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
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Hedef</span>
            <Target className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalTarget)}</div>
          <div className="text-sm text-gray-600 mt-1">Tanımlı hedefler</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/80">Gerçekleşen</span>
            <CheckCircle className="h-5 w-5 text-white/80" />
          </div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totalRevenue)}</div>
          <div className="text-sm text-white/80 mt-1">
            {totalTarget > 0 ? `%${totalAchievement.toFixed(1)} tamamlandı` : 'Hedef tanımlı değil'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/80">Kalan</span>
            <Clock className="h-5 w-5 text-white/80" />
          </div>
          <div className="text-2xl font-bold text-white">
            {formatCurrency(Math.max(0, totalTarget - totalRevenue))}
          </div>
          <div className="text-sm text-white/80 mt-1">Hedefe kalan</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Ulaşan Bölge</span>
            <Store className="h-5 w-5 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-600">{storesReachedTarget}</div>
          <div className="text-sm text-gray-600 mt-1">/ {regionStats?.length || 0} bölge</div>
        </div>
      </div>

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
          {!regionStats?.length ? (
            <p className="text-sm text-gray-500 text-center py-6">Bölge verisi yok.</p>
          ) : (
            regionStats.map((region) => {
              const target = regionalTargets[region.regionId];
              const hasTarget = target != null && target > 0;
              const achievement = hasTarget ? (region.revenue / target) * 100 : 0;

              return (
                <div key={region.regionId} className="mb-4 last:mb-0 p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{region.regionName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        {hasTarget ? `${achievement.toFixed(1)}% tamamlandı` : 'Hedef yok'}
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
                      className={`h-3 rounded-full ${
                        !hasTarget
                          ? 'bg-gray-300'
                          : achievement >= 100
                            ? 'bg-green-500'
                            : achievement >= 75
                              ? 'bg-blue-500'
                              : achievement >= 50
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                      }`}
                      style={{ width: `${hasTarget ? Math.min(achievement, 100) : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-sm text-gray-600">
                    <span>{formatCurrency(region.revenue)}</span>
                    <span className="font-medium">
                      {hasTarget ? `${formatCurrency(target)} hedef` : '—'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showTargetModal && (
        <TargetEditModal
          editingTarget={editingTarget}
          regionStats={regionStats}
          formatCurrency={formatCurrency}
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

function TargetEditModal({
  editingTarget,
  regionalTargets,
  regionStats,
  formatCurrency,
  onSave,
  onClose,
}: {
  editingTarget: any;
  regionalTargets: Record<string, number>;
  regionStats?: RegionStats[];
  formatCurrency: (value: number) => string;
  onSave: (regionId: string, newTarget: number) => void;
  onClose: () => void;
}) {
  const [selectedRegion, setSelectedRegion] = useState(editingTarget?.regionId || '');
  const [targetValue, setTargetValue] = useState(
    editingTarget?.currentTarget ? String(Math.round(editingTarget.currentTarget)) : '',
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

  const selectedRegionData = regionStats?.find((r) => r.regionId === selectedRegion);
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bölge Seçin</label>
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                const region = regionStats?.find((r) => r.regionId === e.target.value);
                if (region) {
                  const existingTarget = regionalTargets[e.target.value] || region.revenue || 0;
                  setTargetValue(formatNumberInput(String(Math.round(existingTarget))));
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {!editingTarget && <option value="">Bir bölge seçin...</option>}
              {regionStats?.map((region) => (
                <option key={region.regionId} value={region.regionId}>
                  {region.regionName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hedef Tutar</label>
            <input
              type="text"
              value={targetValue}
              onChange={(e) => setTargetValue(formatNumberInput(e.target.value))}
              placeholder="Örn: 2,500,000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-mono"
            />
          </div>

          {selectedRegionData && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Mevcut Ciro:</span>
                <span className="font-semibold text-gray-900">{formatCurrency(currentRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Yeni Hedef:</span>
                <span className="font-semibold text-blue-600">{formatCurrency(targetNum)}</span>
              </div>
              <div className="pt-2 border-t border-blue-200">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Gerçekleşme:</span>
                  <span className="font-semibold text-gray-900">%{achievement.toFixed(1)}</span>
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

function DetailedAnalyticsView() {
  const currency = useFirmCurrency();
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [selectedMetric, setSelectedMetric] = useState<'revenue' | 'transactions' | 'customers'>('revenue');

  const days = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : timeRange === 'quarter' ? 90 : 365;
  const { data: analytics, isLoading } = useStoreAnalytics(days);

  const fmt = (n: number) => formatLedgerAmount(n, currency);
  const formatNumber = (value: number) =>
    new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(value);

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  const growthBadge = (g: number | null | undefined) => {
    if (g == null) return <span className="text-sm text-gray-500">önceki dönem verisi yok</span>;
    const up = g >= 0;
    return (
      <div className="flex items-center gap-1 mt-1">
        {up ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
        <span className={`text-sm ${up ? 'text-green-600' : 'text-red-600'}`}>{formatGrowth(g)}</span>
        <span className="text-sm text-gray-500">önceki döneme göre</span>
      </div>
    );
  };

  const trendData = (analytics?.dailyTrend || []).map((d) => ({
    day: d.day,
    revenue: d.revenue,
    transactions: d.transactions,
    value:
      selectedMetric === 'revenue'
        ? d.revenue
        : selectedMetric === 'transactions'
          ? d.transactions
          : d.transactions,
  }));

  const storePerformanceData = analytics?.storePerformance || [];
  const hourlySalesData = analytics?.hourlySales || [];
  const categoryData = analytics?.categoryData || [];
  const topProductsData = analytics?.topProducts || [];

  return (
    <div className="space-y-6">
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
                  { id: 'year', label: 'Son 1 Yıl' },
                ].map((range) => (
                  <button
                    key={range.id}
                    onClick={() => setTimeRange(range.id as typeof timeRange)}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${
                      timeRange === range.id
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
                  { id: 'revenue', label: 'Ciro', icon: Banknote },
                  { id: 'transactions', label: 'İşlem', icon: ShoppingCart },
                  { id: 'customers', label: 'Müşteri', icon: Users },
                ].map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <button
                      key={metric.id}
                      onClick={() => setSelectedMetric(metric.id as typeof selectedMetric)}
                      className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors ${
                        selectedMetric === metric.id
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

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Yükleniyor…
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Ciro</span>
            <Banknote className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-2xl text-gray-900">{fmt(analytics?.totalRevenue || 0)}</div>
          {growthBadge(analytics?.revenueGrowth)}
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam İşlem</span>
            <ShoppingCart className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-2xl text-gray-900">{formatNumber(analytics?.totalTransactions || 0)}</div>
          {growthBadge(analytics?.transactionsGrowth)}
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Ort. Sepet Tutarı</span>
            <Activity className="h-5 w-5 text-purple-600" />
          </div>
          <div className="text-2xl text-gray-900">{fmt(analytics?.avgBasket || 0)}</div>
          {growthBadge(analytics?.avgBasketGrowth)}
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Aktif Müşteri</span>
            <Users className="h-5 w-5 text-orange-600" />
          </div>
          <div className="text-2xl text-gray-900">{formatNumber(analytics?.activeCustomers || 0)}</div>
          {growthBadge(analytics?.customersGrowth)}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Günlük Ciro Trendi (Son {days} Gün)
          </h3>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trendData}>
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
                formatter={(value: any) =>
                  selectedMetric === 'revenue' ? fmt(Number(value) || 0) : formatNumber(Number(value) || 0)
                }
                contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey={selectedMetric === 'transactions' ? 'transactions' : 'revenue'}
                stroke="#3B82F6"
                fillOpacity={1}
                fill="url(#colorRevenue)"
                name="Gerçekleşen"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h3 className="text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Mağaza Performans Karşılaştırması
            </h3>
          </div>
          <div className="p-4">
            {!storePerformanceData.length ? (
              <p className="text-sm text-gray-500 text-center py-16">Satış verisi yok.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={storePerformanceData.slice(0, 12)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" stroke="#6B7280" tickFormatter={(value) => formatNumber(value)} />
                  <YAxis dataKey="name" type="category" stroke="#6B7280" width={120} />
                  <Tooltip
                    formatter={(value: any) => fmt(Number(value) || 0)}
                    contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Bar dataKey="revenue" fill="#3B82F6" name="Ciro" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

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
                  formatter={(value: any) => fmt(Number(value) || 0)}
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

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h3 className="text-gray-900 flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Kategori Dağılımı
            </h3>
          </div>
          <div className="p-4">
            {!categoryData.length ? (
              <p className="text-sm text-gray-500 text-center py-16">Kategori verisi yok.</p>
            ) : (
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
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => fmt(Number(value) || 0)} />
                  </RePieChart>
                </ResponsiveContainer>

                <div className="flex-1 space-y-2">
                  {categoryData.map((cat, index) => (
                    <div key={cat.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-sm text-gray-700">{cat.name}</span>
                      </div>
                      <span className="text-sm text-gray-900">{cat.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h3 className="text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              En Çok Satan Ürünler
            </h3>
          </div>
          <div className="p-4">
            {!topProductsData.length ? (
              <p className="text-sm text-gray-500 text-center py-16">Ürün satış verisi yok.</p>
            ) : (
              <div className="space-y-3">
                {topProductsData.map((product, index) => (
                  <div key={`${product.name}-${index}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center flex-shrink-0">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 truncate">{product.name}</div>
                      <div className="text-xs text-gray-500">{product.storeCount} mağazada</div>
                    </div>
                    <div className="text-right">
                      <div className="text-blue-600">{fmt(product.totalSales)}</div>
                      <div className="text-xs text-gray-500">Ort: {fmt(product.avgPrice)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Detaylı Mağaza Performansı
          </h3>
        </div>
        <div className="overflow-auto">
          {!storePerformanceData.length ? (
            <p className="text-sm text-gray-500 text-center py-8">Mağaza performansı yok.</p>
          ) : (
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
                {storePerformanceData.map((store) => {
                  const avg = store.transactions > 0 ? store.revenue / store.transactions : 0;
                  const g = store.growth;
                  return (
                    <tr key={store.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-blue-600" />
                          <span className="text-gray-900">{store.name}</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 text-gray-900">{fmt(store.revenue)}</td>
                      <td className="text-right py-3 px-4 text-gray-900">{formatNumber(store.transactions)}</td>
                      <td className="text-right py-3 px-4 text-gray-900">{fmt(avg)}</td>
                      <td className="text-right py-3 px-4">
                        {g == null ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {g >= 0 ? (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            )}
                            <span className={g >= 0 ? 'text-green-600' : 'text-red-600'}>{formatGrowth(g)}</span>
                          </div>
                        )}
                      </td>
                      <td className="text-right py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            g == null
                              ? 'bg-gray-100 text-gray-600'
                              : g >= 10
                                ? 'bg-green-100 text-green-700'
                                : g >= 0
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {g == null ? '—' : g >= 10 ? 'Mükemmel' : g >= 0 ? 'İyi' : 'Düşük'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
