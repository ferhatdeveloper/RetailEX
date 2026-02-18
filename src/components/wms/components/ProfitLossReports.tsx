// ğŸ“Š Profit & Loss Reports - Kar-Zarar Raporları
// Detailed financial reports with discounts, returns, damages

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Package, RotateCcw,
  AlertCircle, Download, Calendar, BarChart3, PieChart,
  Filter, X, ChevronRight, Eye
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

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

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  useEffect(() => {
    loadReports();
  }, [timeRange]);

  const loadReports = async () => {
    // Mock data - Product level
    const mockProductPL: ProductPL[] = [
      {
        product_name: 'Zeytinyağı 1L',
        category: 'Yağlar',
        sales_quantity: 450,
        sales_revenue: 15750000,
        total_cost: 11250000,
        gross_profit: 4500000,
        discounts: 787500,
        returns: 225000,
        damages: 112500,
        total_deductions: 1125000,
        net_profit: 3375000,
        profit_margin_percent: 21.4
      },
      {
        product_name: 'Un 1kg',
        category: 'Unlar',
        sales_quantity: 820,
        sales_revenue: 9840000,
        total_cost: 6970000,
        gross_profit: 2870000,
        discounts: 984000,
        returns: 164000,
        damages: 82000,
        total_deductions: 1230000,
        net_profit: 1640000,
        profit_margin_percent: 16.7
      },
      {
        product_name: 'Makarna 500g',
        category: 'Bakliyat',
        sales_quantity: 650,
        sales_revenue: 4225000,
        total_cost: 2730000,
        gross_profit: 1495000,
        discounts: 211250,
        returns: 84500,
        damages: 42250,
        total_deductions: 338000,
        net_profit: 1157000,
        profit_margin_percent: 27.4
      },
    ];
    setProductPL(mockProductPL);

    // Mock data - Category level
    const categoryMap = new Map<string, CategoryPL>();
    mockProductPL.forEach(p => {
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
      cat.profit_percent = (cat.net_profit / cat.total_revenue) * 100;
    });

    setCategoryPL(Array.from(categoryMap.values()));
  };

  // Calculate totals
  const totalRevenue = productPL.reduce((sum, p) => sum + p.sales_revenue, 0);
  const totalCost = productPL.reduce((sum, p) => sum + p.total_cost, 0);
  const totalGrossProfit = productPL.reduce((sum, p) => sum + p.gross_profit, 0);
  const totalDeductions = productPL.reduce((sum, p) => sum + p.total_deductions, 0);
  const totalNetProfit = productPL.reduce((sum, p) => sum + p.net_profit, 0);
  const avgProfitMargin = (totalNetProfit / totalRevenue) * 100;

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
          <button className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg">
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-blue-500" />
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
                label={(entry) => `${entry.name}: ${((entry.value / totalRevenue) * 100).toFixed(1)}%`}
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
              {/* Revenue */}
              <div className={`p-4 rounded-xl ${darkMode ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
                <div className="text-sm text-gray-500 mb-2">Satış Geliri</div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${textClass}`}>{(selectedItem.sales_revenue / 1000).toFixed(0)}K</span>
                  <span className="text-sm text-gray-500">IQD</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{selectedItem.sales_quantity} adet</div>
              </div>

              {/* Cost */}
              <div className={`p-4 rounded-xl ${darkMode ? 'bg-red-900/20' : 'bg-red-50'}`}>
                <div className="text-sm text-gray-500 mb-2">Toplam Maliyet</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-red-600">{(selectedItem.total_cost / 1000).toFixed(0)}K</span>
                  <span className="text-sm text-gray-500">IQD</span>
                </div>
              </div>

              {/* Gross Profit */}
              <div className={`p-4 rounded-xl ${darkMode ? 'bg-green-900/20' : 'bg-green-50'}`}>
                <div className="text-sm text-gray-500 mb-2">Brüt Kar</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-green-600">{(selectedItem.gross_profit / 1000).toFixed(0)}K</span>
                  <span className="text-sm text-gray-500">IQD</span>
                </div>
              </div>

              {/* Deductions Breakdown */}
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

              {/* Net Profit */}
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

