import {
  TrendingUp, Banknote, Package, Users,
  AlertTriangle, Clock, Star, Wallet, X, LayoutGrid,
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { Product, Customer, Sale } from '../../core/types';
import { useState, useEffect, useMemo } from 'react';
import { formatNumber } from '../../utils/formatNumber';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import {
  fetchLayeredInventoryValuation,
  layeredCostForProduct,
  type LayeredInventoryValuation,
} from '../../services/layeredInventoryCost';
import { useMenuFavorites } from '../../hooks/useMenuFavorites';
import {
  flattenMenuLeaves,
  filterFavoriteIdsByAllowed,
  MAX_MENU_FAVORITES,
  type MenuFavoriteLeaf,
} from '../../services/menuFavoritesService';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';

const FAVORITE_TILE_COLORS = [
  'from-blue-500 to-blue-600',
  'from-green-500 to-green-600',
  'from-purple-500 to-purple-600',
  'from-pink-500 to-pink-600',
  'from-indigo-500 to-indigo-600',
  'from-teal-500 to-teal-600',
  'from-orange-500 to-orange-600',
  'from-cyan-500 to-cyan-600',
  'from-emerald-500 to-emerald-600',
  'from-violet-500 to-violet-600',
  'from-rose-500 to-rose-600',
  'from-amber-500 to-amber-600',
];

interface DashboardModuleProps {
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  setCurrentScreen: (screen: string) => void;
  menuMode?: number;
  /** RBAC ile filtrelenmiş menü — favori etiket/ikon ve düzenleme listesi */
  menuSections?: unknown[];
}

export function DashboardModule({
  products,
  customers,
  sales,
  setCurrentScreen,
  menuSections = [],
}: DashboardModuleProps) {
  const { t } = useLanguage();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const { favoriteIds, setFavorites, maxFavorites } = useMenuFavorites();
  /** Çeviri nesnesi bazen geniş JSON'dan `unknown`/`{}` gelebilir; metin çocuklarında güvenli metin */
  const tLabel = (v: unknown, fallback: string) =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;
  // Aktif firmanın ana para birimi — fallback olarak çeviri kodu, en sonda IQD.
  const currency = selectedFirm?.ana_para_birimi || t.currencyCode || 'IQD';
  const firmLabel =
    (selectedFirm?.firma_adi || selectedFirm?.title || selectedFirm?.name || '').trim() || '';
  const periodLabel =
    selectedPeriod != null
      ? (selectedPeriod.donem_adi || selectedPeriod.name || `Dönem ${selectedPeriod.nr}`).trim()
      : '';
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [draftFavoriteIds, setDraftFavoriteIds] = useState<string[]>([]);
  const [layeredValuation, setLayeredValuation] = useState<LayeredInventoryValuation | null>(null);

  const menuLeaves = useMemo(() => flattenMenuLeaves(menuSections), [menuSections]);
  const allowedIdSet = useMemo(() => new Set(menuLeaves.map((l) => l.id)), [menuLeaves]);
  const leafById = useMemo(() => {
    const map = new Map<string, MenuFavoriteLeaf>();
    for (const leaf of menuLeaves) map.set(leaf.id, leaf);
    return map;
  }, [menuLeaves]);

  const visibleFavoriteIds = useMemo(
    () => filterFavoriteIdsByAllowed(favoriteIds, allowedIdSet),
    [favoriteIds, allowedIdSet],
  );

  const favoriteTiles = useMemo(() => {
    return visibleFavoriteIds.map((id, index) => {
      const leaf = leafById.get(id);
      const IconComp = (leaf?.icon || LayoutGrid) as typeof LayoutGrid;
      return {
        id,
        label: leaf?.label || id,
        Icon: IconComp,
        color: FAVORITE_TILE_COLORS[index % FAVORITE_TILE_COLORS.length],
      };
    });
  }, [visibleFavoriteIds, leafById]);

  const groupedLeaves = useMemo(() => {
    return menuLeaves.reduce(
      (acc, leaf) => {
        const cat = leaf.sectionTitle || 'Menü';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(leaf);
        return acc;
      },
      {} as Record<string, MenuFavoriteLeaf[]>,
    );
  }, [menuLeaves]);

  const openCustomizeModal = () => {
    setDraftFavoriteIds([...visibleFavoriteIds]);
    setShowCustomizeModal(true);
  };

  const toggleDraftFavorite = (id: string) => {
    setDraftFavoriteIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxFavorites) return prev;
      return [...prev, id];
    });
  };

  const saveFavorites = () => {
    setFavorites(filterFavoriteIdsByAllowed(draftFavoriteIds, allowedIdSet));
    setShowCustomizeModal(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await fetchLayeredInventoryValuation({
          firmNr: selectedFirm?.firm_nr,
          periodNr: selectedPeriod?.nr,
          onHandProducts: products,
        });
        if (!cancelled) setLayeredValuation(v);
      } catch (err) {
        console.warn('[DashboardModule] layered inventory cost failed', err);
        if (!cancelled) setLayeredValuation(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [products, selectedFirm?.firm_nr, selectedPeriod?.nr]);

  // Today's sales
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysSales = sales.filter(s => new Date(s.date) >= today);
  const totalRevenue = todaysSales.reduce((sum, s) => sum + s.total, 0);
  const totalProfitToday = layeredValuation
    ? totalRevenue - layeredValuation.todayCogs
    : todaysSales.reduce((sum, s) => sum + (s.profit || 0), 0);

  // Yesterday's sales for comparison
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdaySales = sales.filter(s => {
    const saleDate = new Date(s.date);
    return saleDate >= yesterday && saleDate < today;
  });
  const yesterdayRevenue = yesterdaySales.reduce((sum, s) => sum + s.total, 0);
  const yesterdayProfit = yesterdaySales.reduce((sum, s) => sum + (s.profit || 0), 0);

  const revenueChange = yesterdayRevenue > 0
    ? ((totalRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
    : 0;

  const profitChange = yesterdayProfit > 0
    ? ((totalProfitToday - yesterdayProfit) / yesterdayProfit) * 100
    : 0;

  // This week's data
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekSales = sales.filter(s => new Date(s.date) >= weekAgo);
  const weekRevenue = weekSales.reduce((sum, s) => sum + s.total, 0);

  // Stock value — FIFO kalan katman (kart alış × miktar değil)
  const totalStockValue = products.reduce((sum, p) => sum + layeredCostForProduct(layeredValuation, p), 0);
  const totalStockSaleValue = products.reduce((sum, p) => sum + ((Number(p.stock) || 0) * (Number(p.price) || 0)), 0);
  const potentialProfit = totalStockSaleValue - totalStockValue;

  // Low stock products
  const lowStockProducts = products.filter(p => p.stock < 30);
  const criticalStockProducts = products.filter(p => p.stock < 10);

  // Top selling products (by revenue)
  const productSales = sales.reduce((acc, sale) => {
    sale.items.forEach((item: any) => {
      if (!acc[item.productId]) {
        acc[item.productId] = {
          name: item.productName,
          quantity: 0,
          revenue: 0
        };
      }
      acc[item.productId].quantity += item.quantity;
      acc[item.productId].revenue += item.total;
    });
    return acc;
  }, {} as Record<string, { name: string; quantity: number; revenue: number }>);

  const topProducts = Object.values(productSales)
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .slice(0, 5);

  // Sales by payment method
  const paymentData = sales.reduce((acc, sale) => {
    acc[sale.paymentMethod] = (acc[sale.paymentMethod] || 0) + sale.total;
    return acc;
  }, {} as Record<string, number>);

  const paymentChartData = Object.entries(paymentData).map(([name, value]) => ({
    name,
    value
  }));

  // Sales trend (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (6 - i));
    return {
      date: date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
      revenue: 0,
      count: 0
    };
  });

  sales.forEach(sale => {
    const saleDate = new Date(sale.date);
    const dayIndex = last7Days.findIndex(day => {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - (6 - last7Days.indexOf(day)));
      return saleDate.toDateString() === checkDate.toDateString();
    });
    if (dayIndex !== -1) {
      last7Days[dayIndex].revenue += sale.total;
      last7Days[dayIndex].count += 1;
    }
  });

  // Category distribution — count = ürün (SKU) adedi; value = stok×fiyat envanter değeri
  const categoryData = products.reduce((acc, product) => {
    if (!acc[product.category]) {
      acc[product.category] = {
        name: product.category,
        value: 0,
        count: 0
      };
    }
    acc[product.category].value += product.stock * product.price;
    acc[product.category].count += 1;
    return acc;
  }, {} as Record<string, { name: string; value: number; count: number }>);

  const categoryChartData = Object.values(categoryData);

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-gray-50 to-gray-100 scrollbar-thin scrollbar-thumb-gray-300">
      {/* Modern Minimal Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg text-white">{tLabel(t.dashboard, 'Dashboard')}</h2>
            <p className="text-blue-100 text-[10px] mt-0.5">{tLabel(t.welcomeDashboard, 'Hoş geldiniz, işletme performansınızı takip edin')}</p>
            {(firmLabel || periodLabel) ? (
              <p className="text-blue-200/95 text-[10px] mt-1 truncate max-w-[min(100%,28rem)]">
                {[firmLabel, periodLabel].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-blue-100 text-[10px]">{new Date().toLocaleDateString(t.locale || 'tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p className="text-blue-200 text-[9px] mt-0.5">{new Date().toLocaleTimeString(t.locale || 'tr-TR')}</p>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Favoriler — menüden yıldız ile veya Düzenle ile özelleştirilir */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <h3 className="text-sm text-gray-800">{tLabel(t.favorites, tLabel(t.quickAccess, 'Favoriler'))}</h3>
          </div>
          {favoriteTiles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {favoriteTiles.map((action) => {
                const Icon = action.Icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => setCurrentScreen(action.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gradient-to-br ${action.color} text-white`}
                      aria-hidden
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-medium pr-0.5">{String(action.label)}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white/70 px-4 py-6 text-center">
              <Star className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-gray-700">
                {tLabel(t.noFavoritesYet, 'Henüz favori eklenmedi')}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {tLabel(
                  t.noFavoritesHint,
                  'Menüdeki yıldız ile ekran ekleyin veya Düzenle’den seçin',
                )}
              </p>
            </div>
          )}
          <div className="text-right mt-1">
            <button
              type="button"
              className="text-[10px] text-blue-500 hover:text-blue-600 font-medium"
              onClick={openCustomizeModal}
            >
              {tLabel(t.editFavorites, tLabel(t.editQuickAccess, 'Düzenle'))}
            </button>
          </div>
        </div>

        {/* Kurumsal Özet Panel - Modern KPI Cards yerine */}
        <div className="bg-white border border-gray-300 rounded">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">{tLabel(t.dailySummary, 'Günlük Özet')}</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Banknote className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">{tLabel(t.todaysSales, 'Bugünkü Satış')}</span>
                {revenueChange !== 0 && (
                  <span className={`text-[9px] ${revenueChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {revenueChange > 0 ? '↑' : '↓'} {formatNumber(Math.abs(revenueChange), 1, false)}%
                  </span>
                )}
              </div>
              <div className="text-base text-gray-900">{formatNumber(totalRevenue, 2, false)} {currency}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{todaysSales.length} {tLabel(t.transaction, 'işlem')}</div>
            </div>

            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">{tLabel(t.weeklySales, 'Haftalık Satış')}</span>
              </div>
              <div className="text-base text-gray-900">{formatNumber(weekRevenue, 2, false)} {currency}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{weekSales.length} {tLabel(t.transaction, 'işlem')}</div>
            </div>

            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span className="text-[10px] text-gray-600">{tLabel(t.todaysProfit, 'Bugünkü Kâr')}</span>
                {profitChange !== 0 && (
                  <span className={`text-[9px] ${profitChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {profitChange > 0 ? '↑' : '↓'} {formatNumber(Math.abs(profitChange), 1, false)}%
                  </span>
                )}
              </div>
              <div className="text-base text-emerald-700 font-semibold">{formatNumber(totalProfitToday, 2, false)} {currency}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{tLabel(t.profitMargin, 'Kâr Marjı')}: {totalRevenue > 0 ? formatNumber((totalProfitToday / totalRevenue) * 100, 1, false) : 0}%</div>
            </div>

            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] text-gray-600">{tLabel(t.totalProductsDashboard, 'Toplam Ürün')}</span>
                {lowStockProducts.length > 0 && (
                  <span className="text-[9px] text-red-600">
                    ⚠ {lowStockProducts.length}
                  </span>
                )}
              </div>
              <div className="text-base text-gray-900">{products.length}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{tLabel(t.stockManagement, 'Stok')}: {formatNumber(totalStockSaleValue, 0, false)} {currency}</div>
            </div>

            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-orange-600" />
                <span className="text-[10px] text-gray-600">{tLabel(t.activeCustomers, 'Aktif Müşteri')}</span>
              </div>
              <div className="text-base text-gray-900">{customers.length}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{tLabel(t.registeredCustomers, 'Kayıtlı müşteri')}</div>
            </div>
          </div>
        </div>

        {/* Finansal Özet - Kurumsal Tablo */}
        <div className="bg-white border border-gray-300 rounded">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-600" />
              <h3 className="text-[11px] text-gray-700">{t.financialSummary || 'Finansal Özet'}</h3>
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">{t.stockValueCost || 'Stok Değeri (Maliyet)'}</div>
              <div className="text-sm text-gray-900">{formatNumber(totalStockValue, 2, false)} {currency}</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">{t.stockValueSales || 'Stok Değeri (Satış)'}</div>
              <div className="text-sm text-gray-900">{formatNumber(totalStockSaleValue, 2, false)} {currency}</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">{t.potentialProfit || 'Potansiyel Kar'}</div>
              <div className="text-sm text-green-600">{formatNumber(potentialProfit, 2, false)} {currency}</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">{t.profitMarginDashboard || 'Kar Marjı'}</div>
              <div className="text-sm text-blue-600">
                {totalStockValue > 0 ? formatNumber((potentialProfit / totalStockValue) * 100, 1, false) : 0}%
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Sales Trend */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-blue-100">
              <h3 className="text-sm text-gray-800">{t.last7DaysSalesTrend || 'Son 7 Gün Satış Trendi'}</h3>
              <p className="text-[10px] text-gray-600 mt-0.5">{t.dailySalesPerformance || 'Günlük satış performansı'}</p>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={last7Days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" stroke="#6B7280" style={{ fontSize: '10px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '10px' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-green-50 to-green-100">
              <h3 className="text-sm text-gray-800">{t.paymentMethodsChart || 'Ödeme Yöntemleri'}</h3>
              <p className="text-[10px] text-gray-600 mt-0.5">{t.customerPaymentPreferences || 'Müşteri ödeme tercihleri'}</p>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={paymentChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${formatNumber((percent * 100), 0, false)}%`}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Top Products */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-purple-50 to-purple-100">
              <h3 className="text-sm text-gray-800">{t.topSellingProductsInfo || 'En Çok Satan Ürünler'}</h3>
              <p className="text-[10px] text-gray-600 mt-0.5">{t.rankingByRevenue || 'Ciro bazında sıralama'}</p>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topProducts} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" stroke="#6B7280" style={{ fontSize: '10px' }} />
                  <YAxis type="category" dataKey="name" stroke="#6B7280" style={{ fontSize: '10px' }} width={80} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#10B981" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category Distribution */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-orange-50 to-orange-100">
              <h3 className="text-sm text-gray-800">{t.categoryBasedStock || 'Kategori Bazlı Stok'}</h3>
              <p className="text-[10px] text-gray-600 mt-0.5">{t.inventoryDistribution || 'Envanter dağılımı'}</p>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" stroke="#6B7280" style={{ fontSize: '10px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '10px' }} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === 'count') return [value, tLabel(t.productCount, 'Ürün')];
                      if (name === 'value') return [formatNumber(value, 0, false), tLabel(undefined, 'Envanter değeri')];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="value" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Alerts & Stock Warnings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Critical Stock Alerts */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-red-50 to-red-100">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <h3 className="text-sm text-gray-800">{t.criticalStockAlerts || 'Kritik Stok Uyarıları'}</h3>
              </div>
              <p className="text-[10px] text-gray-600 mt-0.5">{criticalStockProducts.length} {t.productsAtCriticalLevel || 'ürün kritik seviyede'}</p>
            </div>
            <div className="p-3 max-h-64 overflow-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
              {criticalStockProducts.length > 0 ? (
                <div className="space-y-2">
                  {criticalStockProducts.slice(0, 10).map(product => (
                    <div key={product.id} className="flex items-center justify-between p-2 bg-red-50 rounded hover:bg-red-100 transition-colors">
                      <div className="flex-1">
                        <p className="text-[11px] text-gray-800">{product.name}</p>
                        <p className="text-[9px] text-gray-500">{product.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-red-600">{t.remainingQty || 'Kalan:'} {product.stock}</p>
                        <p className="text-[9px] text-red-500">{t.urgentOrder || 'Acil sipariş!'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Package className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-[11px] text-gray-500">{t.noCriticalStock || 'Kritik stok seviyesinde ürün yok'}</p>
                </div>
              )}
            </div>
          </div>

          {/* Low Stock Warnings */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-yellow-50 to-yellow-100">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-yellow-600" />
                <h3 className="text-sm text-gray-800">{t.lowStockWarningsItem || 'Düşük Stok Uyarıları'}</h3>
              </div>
              <p className="text-[10px] text-gray-600 mt-0.5">{lowStockProducts.length} {t.productsAtLowLevel || 'ürün düşük seviyede'}</p>
            </div>
            <div className="p-3 max-h-64 overflow-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
              {lowStockProducts.length > 0 ? (
                <div className="space-y-2">
                  {lowStockProducts.slice(0, 10).map(product => (
                    <div key={product.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded hover:bg-yellow-100 transition-colors">
                      <div className="flex-1">
                        <p className="text-[11px] text-gray-800">{product.name}</p>
                        <p className="text-[9px] text-gray-500">{product.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-yellow-600">{t.remainingQty || 'Kalan:'} {product.stock}</p>
                        <p className="text-[9px] text-yellow-500">{t.orderRecommended || 'Sipariş önerilir'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Package className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-[11px] text-gray-500">{String(t.noLowStockInfo ?? 'Düşük stok seviyesinde ürün yok')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Favorileri düzenle */}
      {showCustomizeModal && (
        <PercentBodyModal
          onClose={() => setShowCustomizeModal(false)}
          size="wide"
          ariaLabel={tLabel(t.customizeFavorites, tLabel(t.customizeQuickAccess, 'Favorileri Düzenle'))}
        >
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between shrink-0 text-white">
            <div>
              <h3 className="text-xl">
                {tLabel(t.customizeFavorites, tLabel(t.customizeQuickAccess, 'Favorileri Düzenle'))}
              </h3>
              <p className="text-blue-100 text-sm mt-1">
                {tLabel(t.maxFavoritesHint, tLabel(t.max8Shortcuts, `En fazla ${MAX_MENU_FAVORITES} favori seçebilirsiniz`))}{' '}
                ({draftFavoriteIds.length}/{maxFavorites})
              </p>
            </div>
            <button
              type="button"
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              onClick={() => setShowCustomizeModal(false)}
              aria-label={tLabel(t.cancel, 'İptal')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <PercentBodyModalScrollBody className="p-6">
            {menuLeaves.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                {tLabel(t.noMenuItemsForFavorites, 'Favoriye eklenebilecek menü öğesi yok')}
              </p>
            ) : (
              <div className="space-y-6">
                {Object.keys(groupedLeaves).map((category) => (
                  <div key={category}>
                    <h4 className="text-sm text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <div className="w-8 h-0.5 bg-gradient-to-r from-blue-500 to-transparent" />
                      {category}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupedLeaves[category].map((leaf) => {
                        const Icon = (leaf.icon || LayoutGrid) as typeof LayoutGrid;
                        const isSelected = draftFavoriteIds.includes(leaf.id);
                        const isDisabled = !isSelected && draftFavoriteIds.length >= maxFavorites;
                        return (
                          <button
                            key={leaf.id}
                            type="button"
                            onClick={() => !isDisabled && toggleDraftFavorite(leaf.id)}
                            disabled={isDisabled}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-amber-500 bg-amber-50 shadow-md'
                                : isDisabled
                                  ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                  : 'border-gray-200 hover:border-amber-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <p className={`text-sm truncate ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                                {leaf.label}
                              </p>
                            </div>
                            <Star
                              className={`w-5 h-5 flex-shrink-0 ${
                                isSelected ? 'text-amber-500 fill-amber-500' : 'text-gray-300'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PercentBodyModalScrollBody>

          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between shrink-0">
            <p className="text-sm text-gray-600">
              {draftFavoriteIds.length}{' '}
              {tLabel(t.favoritesSelected, tLabel(t.shortcutsSelected, 'favori seçildi'))}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                onClick={() => setShowCustomizeModal(false)}
              >
                {tLabel(t.cancel, 'İptal')}
              </button>
              <button
                type="button"
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:shadow-lg transition-all"
                onClick={saveFavorites}
              >
                {tLabel(t.save, 'Kaydet')}
              </button>
            </div>
          </div>
        </PercentBodyModal>
      )}
    </div>
  );
}
