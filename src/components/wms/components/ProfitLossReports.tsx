// 📊 Profit & Loss Reports - Kar-Zarar Raporları
// Detaylı finansal raporlar (gerçek `stock_movements` verisinden hesaplanır).

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Banknote, Package,
  Download, Calendar, BarChart3,
  X, Eye, AlertCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';
import { postgres } from '../../../services/postgres';

interface ProfitLossReportsProps {
  darkMode: boolean;
  onBack: () => void;
}

interface ProductPL {
  product_name: string;
  category: string;
  sales_quantity: number;
  sales_revenue: number;
  total_cost: number;
  gross_profit: number;

  // Deductions
  discounts: number;
  returns: number;
  damages: number;
  total_deductions: number;

  // Net
  net_profit: number;
  profit_margin_percent: number;
}

interface CategoryPL {
  category: string;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  net_profit: number;
  profit_percent: number;
}

export function ProfitLossReports({ darkMode, onBack }: ProfitLossReportsProps) {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'year'>('month');
  const [viewMode, setViewMode] = useState<'product' | 'category'>('product');
  const [productPL, setProductPL] = useState<ProductPL[]>([]);
  const [categoryPL, setCategoryPL] = useState<CategoryPL[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ProductPL | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  useEffect(() => {
    loadReports();
  }, [timeRange]);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = (() => {
        const now = new Date();
        if (timeRange === 'today') {
          return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        }
        if (timeRange === 'week') {
          const d = new Date(now);
          d.setDate(d.getDate() - 7);
          return d.toISOString();
        }
        if (timeRange === 'year') {
          return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();
        }
        // month default
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      })();

// 1) Ürün bazlı: 'out' hareketlerini (satış) ürün ve kategoriye göre topla.
//    Maliyet kolonu stock_movement_items.cost_price varsa oradan; yoksa 0.
// Ürün tablosu firmNr-prefixli (`rex_001_products`) — postgres.getCardTableName firma prefix'ini otomatik ekler.
const productsTable = postgres.getCardTableName('products');

// 1a) Satış (movement_type='out') — gelir + maliyet
const productRes = await postgres.query(
  `SELECT
      p.name::text           AS product_name,
      COALESCE(p.category, p.category_code, 'Diğer') AS category,
      COALESCE(SUM(mi.quantity), 0)::float AS sales_quantity,
      COALESCE(SUM(mi.quantity * COALESCE(mi.unit_price, 0)), 0)::float AS sales_revenue,
      COALESCE(SUM(mi.quantity * COALESCE(mi.cost_price, 0)), 0)::float AS total_cost
   FROM stock_movement_items mi
   JOIN stock_movements m ON mi.movement_id = m.id
   JOIN ${productsTable} p ON mi.product_id = p.id
   WHERE m.movement_type = 'out'
     AND m.movement_date >= $1::timestamptz
   GROUP BY p.name, COALESCE(p.category, p.category_code, 'Diğer')
   ORDER BY sales_revenue DESC
   LIMIT 100`,
  [since]
);

// Toplam gelir — kesinti paylaştırma oranı için (ürün bazlı).
const rawRows = productRes.rows as any[];
const totalSalesRevenueRaw = rawRows.reduce(
  (sum, r) => sum + (Number(r.sales_revenue) || 0),
  0,
);

// 1b) İadeler — sales_returns tablosundan (periodNr-prefixli hareket tablosu).
// Tablo yoksa 0 döner (geriye uyumlu).
let totalReturnsValue = 0;
try {
  const salesReturnsTable = postgres.getMovementTableName('sales_returns');
  const r = await postgres.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS total
       FROM ${salesReturnsTable}
      WHERE return_date >= $1::timestamptz`,
    [since]
  );
  totalReturnsValue = Number((r.rows[0] as any)?.total || 0);
} catch {
  totalReturnsValue = 0;
}

// 1c) Hasar — movement_type='adjustment' (düzeltme/hasar kayıtları).
// amount = quantity * unit_price olarak hesaplanır; ürün satış fiyatı üzerinden değer.
const damagesRes = await postgres.query(
  `SELECT COALESCE(SUM(mi.quantity * COALESCE(mi.unit_price, 0)), 0)::float AS damages_value
     FROM stock_movement_items mi
     JOIN stock_movements m ON mi.movement_id = m.id
    WHERE m.movement_type = 'adjustment'
      AND m.movement_date >= $1::timestamptz`,
  [since]
);
const totalDamagesValue = Number((damagesRes.rows[0] as any)?.damages_value || 0);

// 1d) İndirimler — RetailEX'te indirim genelde fatura kaleminde tutulur;
// product bazlı birebir eşleşmediğinden şimdilik 0 (fatura indirimi ayrı raporda).
const totalDiscounts = 0;

const products: ProductPL[] = rawRows.map((r) => {
  const salesQty = Number(r.sales_quantity) || 0;
  const salesRev = Number(r.sales_revenue) || 0;
  const totalCost = Number(r.total_cost) || 0;
  const grossProfit = salesRev - totalCost;
  // Ürün bazlı dağıtım: iade/hasar/indirim tek satır toplamıdır.
  // Oran (sales_revenue / totalSalesRevenue) ile paylaştırılır.
  const ratio = totalSalesRevenueRaw > 0 ? salesRev / totalSalesRevenueRaw : 0;
  const damages = totalDamagesValue * ratio;
  const returns = totalReturnsValue * ratio;
  const discounts = totalDiscounts * ratio;
  const totalDeductions = damages + returns + discounts;
  const netProfit = grossProfit - totalDeductions;
  const margin = salesRev > 0 ? (netProfit / salesRev) * 100 : 0;
  return {
    product_name: String(r.product_name ?? ''),
    category: String(r.category ?? 'Diğer'),
    sales_quantity: salesQty,
    sales_revenue: salesRev,
    total_cost: totalCost,
    gross_profit: grossProfit,
    discounts,
    returns,
    damages,
    total_deductions: totalDeductions,
    net_profit: netProfit,
    profit_margin_percent: margin,
  };
});

      setProductPL(products);

      // 2) Kategori bazlı
      const categoryMap = new Map<string, CategoryPL>();
      products.forEach(p => {
        if (!categoryMap.has(p.category)) {
          categoryMap.set(p.category, {
            category: p.category,
            total_revenue: 0,
            total_cost: 0,
            gross_profit: 0,
            net_profit: 0,
            profit_percent: 0
          });
        }
        const cat = categoryMap.get(p.category)!;
        cat.total_revenue += p.sales_revenue;
        cat.total_cost += p.total_cost;
        cat.gross_profit += p.gross_profit;
        cat.net_profit += p.net_profit;
      });

      categoryMap.forEach(cat => {
        cat.profit_percent = cat.total_revenue > 0 ? (cat.net_profit / cat.total_revenue) * 100 : 0;
      });

      setCategoryPL(Array.from(categoryMap.values()));
    } catch (err: unknown) {
      console.error('[ProfitLossReports] load error:', err);
      setError('Rapor verisi yüklenemedi. Satış hareketleri henüz oluşmamış olabilir.');
      setProductPL([]);
      setCategoryPL([]);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const totalRevenue = productPL.reduce((sum, p) => sum + p.sales_revenue, 0);
  const totalCost = productPL.reduce((sum, p) => sum + p.total_cost, 0);
  const totalGrossProfit = productPL.reduce((sum, p) => sum + p.gross_profit, 0);
  const totalDeductions = productPL.reduce((sum, p) => sum + p.total_deductions, 0);
  const totalNetProfit = productPL.reduce((sum, p) => sum + p.net_profit, 0);
  const avgProfitMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

  // Chart data
  const categoryChartData = categoryPL.map(c => ({
    name: c.category,
    Gelir: c.total_revenue / 1000000,
    Maliyet: c.total_cost / 1000000,
    'Net Kar': c.net_profit / 1000000
  }));

  const pieChartData = [
    { name: 'Maliyet', value: totalCost },
    { name: 'İndirimler', value: productPL.reduce((sum, p) => sum + p.discounts, 0) },
    { name: 'İadeler', value: productPL.reduce((sum, p) => sum + p.returns, 0) },
    { name: 'Hasarlar', value: productPL.reduce((sum, p) => sum + p.damages, 0) },
    { name: 'Net Kar', value: totalNetProfit },
  ];

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#f59e0b', '#10b981'];

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
              <BarChart3 className="w-8 h-8 text-green-500" />
              Kar-Zarar Raporları
            </h1>
            <p className="text-gray-500">İndirim, iade ve hasar dahil detaylı finansal analiz</p>
          </div>
          <button
            disabled={productPL.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg disabled:opacity-50"
          >
            <Download className="w-5 h-5" />
            Excel İndir
          </button>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-4 mb-6">
        {['today', 'week', 'month', 'year'].map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              timeRange === range
                ? 'bg-blue-500 text-white shadow-lg'
                : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {range === 'today' && 'Bugün'}
            {range === 'week' && 'Bu Hafta'}
            {range === 'month' && 'Bu Ay'}
            {range === 'year' && 'Bu Yıl'}
          </button>
        ))}
      </div>

      {error && (
        <div className={`${cardClass} border rounded-xl p-4 mb-6 flex items-start gap-3`}>
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <div className={`font-semibold ${textClass}`}>Veri bulunamadı</div>
            <div className="text-sm text-gray-500">{error}</div>
          </div>
        </div>
      )}

      {!loading && productPL.length === 0 && !error && (
        <div className={`${cardClass} border rounded-xl p-12 text-center`}>
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className={`text-lg font-bold ${textClass} mb-2`}>Henüz satış verisi yok</h3>
          <p className="text-sm text-gray-500">
            Bu rapor <code className="font-mono">stock_movements</code> tablosundaki <code className="font-mono">movement_type = 'out'</code> kayıtlarından hesaplanır.
            Seçili tarih aralığında satış fişi oluştuğunda burada görüntülenecektir.
          </p>
          <p className="text-xs text-gray-400 mt-3">TODO: iade/hasar kesintileri için ayrı SQL sorguları eklenmeli.</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-gray-500">Toplam Gelir</span>
          </div>
          <div className={`text-2xl font-bold ${textClass}`}>
            {(totalRevenue / 1000000).toFixed(2)}M
          </div>
          <div className="text-xs text-gray-500 mt-1">IQD</div>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-red-500" />
            <span className="text-sm text-gray-500">Toplam Maliyet</span>
          </div>
          <div className={`text-2xl font-bold ${textClass}`}>
            {(totalCost / 1000000).toFixed(2)}M
          </div>
          <div className="text-xs text-gray-500 mt-1">IQD</div>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <span className="text-sm text-gray-500">Brüt Kar</span>
          </div>
          <div className={`text-2xl font-bold text-green-600`}>
            {(totalGrossProfit / 1000000).toFixed(2)}M
          </div>
          <div className="text-xs text-gray-500 mt-1">IQD</div>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-orange-500" />
            <span className="text-sm text-gray-500">Kesintiler</span>
          </div>
          <div className={`text-2xl font-bold text-orange-600`}>
            {(totalDeductions / 1000000).toFixed(2)}M
          </div>
          <div className="text-xs text-gray-500 mt-1">İndirim + İade + Hasar</div>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            <span className="text-sm text-gray-500">Net Kar</span>
          </div>
          <div className={`text-2xl font-bold text-purple-600`}>
            {(totalNetProfit / 1000000).toFixed(2)}M
          </div>
          <div className="text-xs text-green-600 mt-1">Marj: {avgProfitMargin.toFixed(1)}%</div>
        </div>
      </div>

      {/* Charts */}
      {categoryPL.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Bar Chart */}
          <div className={`${cardClass} border rounded-xl p-6`}>
            <h3 className={`text-lg font-bold ${textClass} mb-4`}>Kategori Bazlı Analiz</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
                <XAxis dataKey="name" stroke={darkMode ? '#9ca3af' : '#6b7280'} />
                <YAxis stroke={darkMode ? '#9ca3af' : '#6b7280'} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                    border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="Gelir" fill="#3b82f6" />
                <Bar dataKey="Maliyet" fill="#ef4444" />
                <Bar dataKey="Net Kar" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className={`${cardClass} border rounded-xl p-6`}>
            <h3 className={`text-lg font-bold ${textClass} mb-4`}>Gelir Dağılımı</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${((entry.value / Math.max(totalRevenue, 1)) * 100).toFixed(1)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                    border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                    borderRadius: '8px'
                  }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setViewMode('product')}
          className={`px-4 py-2 rounded-lg font-medium ${
            viewMode === 'product' ? 'bg-blue-500 text-white' : darkMode ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-700'
          }`}
        >
          Ürün Bazlı
        </button>
        <button
          onClick={() => setViewMode('category')}
          className={`px-4 py-2 rounded-lg font-medium ${
            viewMode === 'category' ? 'bg-blue-500 text-white' : darkMode ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-700'
          }`}
        >
          Kategori Bazlı
        </button>
      </div>

      {/* Product View */}
      {viewMode === 'product' && (
        <div className={`${cardClass} border rounded-xl overflow-hidden`}>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className={`text-lg font-bold ${textClass}`}>Ürün Bazlı Kar-Zarar</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ürün</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Satış</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Gelir</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Maliyet</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Brüt Kar</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Kesintiler</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Net Kar</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Marj %</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {productPL.map((product, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-4">
                      <div className={`font-medium ${textClass}`}>{product.product_name}</div>
                      <div className="text-xs text-gray-500">{product.category}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-bold ${textClass}`}>{product.sales_quantity}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm">{(product.sales_revenue / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-red-600">{(product.total_cost / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-green-600">{(product.gross_profit / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-orange-600">-{(product.total_deductions / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`text-lg font-bold ${product.net_profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(product.net_profit / 1000).toFixed(0)}K
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-bold ${product.profit_margin_percent >= 20 ? 'text-green-600' : product.profit_margin_percent >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {product.profit_margin_percent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedItem(product);
                          setShowDetailModal(true);
                        }}
                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded text-blue-600"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Category View */}
      {viewMode === 'category' && (
        <div className={`${cardClass} border rounded-xl overflow-hidden`}>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className={`text-lg font-bold ${textClass}`}>Kategori Bazlı Kar-Zarar</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Toplam Gelir</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Toplam Maliyet</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Brüt Kar</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Net Kar</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Kar %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {categoryPL.map((category, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <span className={`text-lg font-bold ${textClass}`}>{category.category}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-lg font-bold ${textClass}`}>{(category.total_revenue / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-lg font-bold text-red-600">{(category.total_cost / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-lg font-bold text-green-600">{(category.gross_profit / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-xl font-bold text-purple-600">{(category.net_profit / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-xl font-bold ${category.profit_percent >= 20 ? 'text-green-600' : category.profit_percent >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {category.profit_percent.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${cardClass} border rounded-2xl max-w-2xl w-full p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${textClass}`}>{selectedItem.product_name} - Detaylı Rapor</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className={`p-4 rounded-xl ${darkMode ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
                <div className="text-sm text-gray-500 mb-2">Satış Geliri</div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${textClass}`}>{(selectedItem.sales_revenue / 1000).toFixed(0)}K</span>
                  <span className="text-sm text-gray-500">IQD</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{selectedItem.sales_quantity} adet</div>
              </div>

              <div className={`p-4 rounded-xl ${darkMode ? 'bg-red-900/20' : 'bg-red-50'}`}>
                <div className="text-sm text-gray-500 mb-2">Toplam Maliyet</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-red-600">{(selectedItem.total_cost / 1000).toFixed(0)}K</span>
                  <span className="text-sm text-gray-500">IQD</span>
                </div>
              </div>

              <div className={`p-4 rounded-xl ${darkMode ? 'bg-green-900/20' : 'bg-green-50'}`}>
                <div className="text-sm text-gray-500 mb-2">Brüt Kar</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-green-600">{(selectedItem.gross_profit / 1000).toFixed(0)}K</span>
                  <span className="text-sm text-gray-500">IQD</span>
                </div>
              </div>

              <div className={`p-4 rounded-xl ${darkMode ? 'bg-orange-900/20' : 'bg-orange-50'}`}>
                <div className="text-sm text-gray-500 mb-3">Kesintiler Detayı</div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">İndirimler:</span>
                    <span className="font-bold text-orange-600">-{(selectedItem.discounts / 1000).toFixed(0)}K IQD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">İadeler:</span>
                    <span className="font-bold text-orange-600">-{(selectedItem.returns / 1000).toFixed(0)}K IQD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Hasarlar:</span>
                    <span className="font-bold text-orange-600">-{(selectedItem.damages / 1000).toFixed(0)}K IQD</span>
                  </div>
                  <div className="pt-2 border-t border-orange-200 dark:border-orange-800 flex justify-between">
                    <span className="font-semibold">Toplam Kesinti:</span>
                    <span className="font-bold text-orange-600">-{(selectedItem.total_deductions / 1000).toFixed(0)}K IQD</span>
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-xl ${darkMode ? 'bg-purple-900/20' : 'bg-purple-50'}`}>
                <div className="text-sm text-gray-500 mb-2">Net Kar</div>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-black text-purple-600">{(selectedItem.net_profit / 1000).toFixed(0)}K</span>
                  <span className="text-2xl font-bold text-purple-600">{selectedItem.profit_margin_percent.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowDetailModal(false)}
              className="w-full mt-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

