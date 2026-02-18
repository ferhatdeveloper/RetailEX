// ğŸ“ˆ Sales Velocity Analysis - Satış Hızı Analizi
// ABC Analysis, Fast/Slow Moving, Campaign Performance

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Activity, Zap, AlertCircle,
  Package, BarChart3, Clock, Target, Award, Filter,
  Calendar, Download, Star, Gift
} from 'lucide-react';

interface SalesVelocityAnalysisProps {
  darkMode: boolean;
  onBack: () => void;
}

interface ProductVelocity {
  id: string;
  product_name: string;
  category: string;
  abc_class: 'A' | 'B' | 'C';
  velocity_score: number;
  daily_sales_avg: number;
  weekly_sales: number;
  monthly_sales: number;
  stock_days: number;
  turnover_rate: number;
  trend: 'up' | 'down' | 'stable';
  is_campaign: boolean;
  campaign_impact: number;
  reorder_needed: boolean;
}

interface CampaignPerformance {
  campaign_name: string;
  start_date: string;
  end_date: string;
  products_count: number;
  total_sales_before: number;
  total_sales_during: number;
  sales_increase: number;
}

export function SalesVelocityAnalysis({ darkMode, onBack }: SalesVelocityAnalysisProps) {
  const [products, setProducts] = useState<ProductVelocity[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignPerformance[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'week' | 'month'>('week');

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  useEffect(() => {
    loadProducts();
    loadCampaigns();
  }, [timeRange]);

  const loadProducts = async () => {
    // Mock data
    const mockProducts: ProductVelocity[] = [
      {
        id: '1',
        product_name: 'Zeytinyağı 1L',
        category: 'Yağlar',
        abc_class: 'A',
        velocity_score: 95,
        daily_sales_avg: 45,
        weekly_sales: 315,
        monthly_sales: 1350,
        stock_days: 12,
        turnover_rate: 2.5,
        trend: 'up',
        is_campaign: false,
        campaign_impact: 0,
        reorder_needed: false
      },
      {
        id: '2',
        product_name: 'Un 1kg',
        category: 'Unlar',
        abc_class: 'A',
        velocity_score: 88,
        daily_sales_avg: 38,
        weekly_sales: 266,
        monthly_sales: 1140,
        stock_days: 18,
        turnover_rate: 1.8,
        trend: 'stable',
        is_campaign: true,
        campaign_impact: 35,
        reorder_needed: false
      },
      {
        id: '3',
        product_name: 'Makarna 500g',
        category: 'Bakliyat',
        abc_class: 'B',
        velocity_score: 62,
        daily_sales_avg: 22,
        weekly_sales: 154,
        monthly_sales: 660,
        stock_days: 25,
        turnover_rate: 1.2,
        trend: 'down',
        is_campaign: false,
        campaign_impact: 0,
        reorder_needed: false
      },
      {
        id: '4',
        product_name: 'Pirinç 2kg',
        category: 'Bakliyat',
        abc_class: 'C',
        velocity_score: 35,
        daily_sales_avg: 8,
        weekly_sales: 56,
        monthly_sales: 240,
        stock_days: 45,
        turnover_rate: 0.7,
        trend: 'down',
        is_campaign: false,
        campaign_impact: 0,
        reorder_needed: true
      },
    ];
    setProducts(mockProducts);
  };

  const loadCampaigns = async () => {
    // Mock data
    const mockCampaigns: CampaignPerformance[] = [
      {
        campaign_name: 'Ramazan Kampanyası',
        start_date: '2024-03-01',
        end_date: '2024-03-31',
        products_count: 45,
        total_sales_before: 12500,
        total_sales_during: 18750,
        sales_increase: 50
      },
      {
        campaign_name: 'Bahar İndirimleri',
        start_date: '2024-04-01',
        end_date: '2024-04-15',
        products_count: 32,
        total_sales_before: 8200,
        total_sales_during: 11480,
        sales_increase: 40
      },
    ];
    setCampaigns(mockCampaigns);
  };

  const getABCClassConfig = (abcClass: string) => {
    const configs: any = {
      A: { label: 'A Sınıfı', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30', desc: 'Çok Hızlı' },
      B: { label: 'B Sınıfı', color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900/30', desc: 'Orta' },
      C: { label: 'C Sınıfı', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', desc: 'Yavaş' },
    };
    return configs[abcClass] || configs.C;
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="w-5 h-5 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="w-5 h-5 text-red-500" />;
    return <Activity className="w-5 h-5 text-gray-400" />;
  };

  // ABC Distribution
  const abcDistribution = {
    A: products.filter(p => p.abc_class === 'A').length,
    B: products.filter(p => p.abc_class === 'B').length,
    C: products.filter(p => p.abc_class === 'C').length,
  };

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
              <BarChart3 className="w-8 h-8 text-blue-500" />
              Satış Hızı Analizi
            </h1>
            <p className="text-gray-500">ABC sınıflandırması ve hızlı/yavaş satışlar</p>
          </div>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className={`px-4 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="week">Bu Hafta</option>
            <option value="month">Bu Ay</option>
          </select>
        </div>
      </div>

      {/* ABC Distribution Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {['A', 'B', 'C'].map((abcClass) => {
          const config = getABCClassConfig(abcClass);
          const count = abcDistribution[abcClass as 'A' | 'B' | 'C'];
          const percentage = ((count / products.length) * 100).toFixed(1);

          return (
            <button
              key={abcClass}
              onClick={() => setSelectedClass(selectedClass === abcClass ? 'all' : abcClass)}
              className={`${cardClass} border-2 rounded-xl p-6 transition-all ${
                selectedClass === abcClass ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className={`text-2xl font-black ${config.color}`}>{config.label}</div>
                  <div className="text-sm text-gray-500">{config.desc}</div>
                </div>
                <div className={`w-16 h-16 ${config.bg} rounded-xl flex items-center justify-center`}>
                  <span className={`text-3xl font-black ${config.color}`}>{abcClass}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Ürün Sayısı:</span>
                  <span className={`text-lg font-bold ${textClass}`}>{count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Oran:</span>
                  <span className={`text-lg font-bold ${config.color}`}>{percentage}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Campaign Performance */}
      {campaigns.length > 0 && (
        <div className={`${cardClass} border rounded-xl p-6 mb-6`}>
          <div className="flex items-center gap-2 mb-4">
            <Gift className="w-6 h-6 text-purple-500" />
            <h3 className={`text-lg font-bold ${textClass}`}>Aktif Kampanyalar</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((campaign, index) => (
              <div key={index} className={`p-4 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`font-bold ${textClass} mb-2`}>{campaign.campaign_name}</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Ürün:</span>
                    <span className={`ml-2 font-bold ${textClass}`}>{campaign.products_count}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Artış:</span>
                    <span className="ml-2 font-bold text-green-600">+{campaign.sales_increase}%</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Satış:</span>
                    <span className={`ml-2 font-bold ${textClass}`}>
                      {campaign.total_sales_before} → {campaign.total_sales_during}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Products Table */}
      <div className={`${cardClass} border rounded-xl overflow-hidden`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className={`text-lg font-bold ${textClass}`}>Ürün Satış Hızları</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg">
              <Download className="w-4 h-4" />
              Rapor İndir
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ürün</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">ABC</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Günlük Ort.</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Haftalık</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Devir Hızı</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stok Günü</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Trend</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {products
                .filter(p => selectedClass === 'all' || p.abc_class === selectedClass)
                .map((product) => {
                  const abcConfig = getABCClassConfig(product.abc_class);
                  
                  return (
                    <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-4">
                        <div className={`font-medium ${textClass}`}>{product.product_name}</div>
                        <div className="text-xs text-gray-500">{product.category}</div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${abcConfig.bg} ${abcConfig.color}`}>
                          {product.abc_class}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-lg font-bold ${textClass}`}>{product.daily_sales_avg}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={textClass}>{product.weekly_sales}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-bold ${product.turnover_rate >= 2 ? 'text-green-600' : product.turnover_rate >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {product.turnover_rate.toFixed(1)}x
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={product.stock_days <= 15 ? 'text-red-600 font-bold' : textClass}>
                          {product.stock_days} gün
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {getTrendIcon(product.trend)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col gap-1">
                          {product.is_campaign && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              <Gift className="w-3 h-3" />
                              +{product.campaign_impact}%
                            </span>
                          )}
                          {product.reorder_needed && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                              <AlertCircle className="w-3 h-3" />
                              Sipariş
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${cardClass} border-l-4 border-green-500 rounded-xl p-4`}>
          <div className="flex items-start gap-3">
            <Star className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div>
              <div className={`font-bold ${textClass} mb-1`}>Hızlı Satanlar</div>
              <div className="text-sm text-gray-500">
                {products.filter(p => p.abc_class === 'A').length} ürün A sınıfında
              </div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border-l-4 border-yellow-500 rounded-xl p-4`}>
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <div>
              <div className={`font-bold ${textClass} mb-1`}>Stok Uyarısı</div>
              <div className="text-sm text-gray-500">
                {products.filter(p => p.stock_days <= 15).length} ürün kritik seviyede
              </div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border-l-4 border-red-500 rounded-xl p-4`}>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <div className={`font-bold ${textClass} mb-1`}>Yavaş Satanlar</div>
              <div className="text-sm text-gray-500">
                {products.filter(p => p.abc_class === 'C').length} ürün C sınıfında
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

