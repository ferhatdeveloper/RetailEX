// 💰 Pricing & Cost Management - Fiyatlandırma ve Maliyet Yönetimi
// Product costing, pricing, profit margins, discount management

import { useState, useEffect } from 'react';
import {
  Banknote, TrendingUp, TrendingDown, AlertCircle, Package,
  Edit, Save, X, Plus, BarChart3, Percent, Calculator,
  Tag, Gift, Bell, Download, Filter, Search
} from 'lucide-react';

interface PricingCostManagementProps {
  darkMode: boolean;
  onBack: () => void;
}

interface ProductPrice {
  id: string;
  product_id: string;
  product_name: string;
  category: string;
  supplier_name: string;
  
  // Costs
  purchase_cost: number;
  last_purchase_cost: number;
  avg_cost: number;
  cost_trend: 'up' | 'down' | 'stable';
  cost_change_percent: number;
  
  // Pricing
  base_price: number;
  selling_price: number;
  discount_percent: number;
  final_price: number;
  
  // Margins
  profit_margin: number;
  profit_margin_percent: number;
  target_margin_percent: number;
  
  // Special discounts
  rent_discount: number;
  target_discount: number;
  campaign_discount: number;
  
  // Alerts
  price_increase_alert: boolean;
  low_margin_alert: boolean;
  last_updated: string;
}

interface DiscountRule {
  id: string;
  name: string;
  type: 'rent' | 'target' | 'campaign' | 'seasonal';
  discount_percent: number;
  start_date: string;
  end_date: string;
  applicable_categories: string[];
  is_active: boolean;
}

export function PricingCostManagement({ darkMode, onBack }: PricingCostManagementProps) {
  const [products, setProducts] = useState<ProductPrice[]>([]);
  const [discountRules, setDiscountRules] = useState<DiscountRule[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductPrice | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const inputClass = darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900';

  useEffect(() => {
    loadProducts();
    loadDiscountRules();
  }, []);

  const loadProducts = async () => {
    // Mock data
    const mockProducts: ProductPrice[] = [
      {
        id: '1',
        product_id: 'P1',
        product_name: 'Zeytinyağı 1L Premium',
        category: 'Yağlar',
        supplier_name: 'Komili A.Ş.',
        purchase_cost: 25000,
        last_purchase_cost: 23000,
        avg_cost: 24000,
        cost_trend: 'up',
        cost_change_percent: 8.7,
        base_price: 35000,
        selling_price: 33250,
        discount_percent: 5,
        final_price: 33250,
        profit_margin: 8250,
        profit_margin_percent: 24.8,
        target_margin_percent: 30,
        rent_discount: 0,
        target_discount: 5,
        campaign_discount: 0,
        price_increase_alert: true,
        low_margin_alert: true,
        last_updated: new Date().toISOString()
      },
      {
        id: '2',
        product_id: 'P2',
        product_name: 'Un 1kg',
        category: 'Unlar',
        supplier_name: 'Söke Un',
        purchase_cost: 8500,
        last_purchase_cost: 8500,
        avg_cost: 8500,
        cost_trend: 'stable',
        cost_change_percent: 0,
        base_price: 12000,
        selling_price: 10800,
        discount_percent: 10,
        final_price: 10800,
        profit_margin: 2300,
        profit_margin_percent: 21.3,
        target_margin_percent: 25,
        rent_discount: 2,
        target_discount: 8,
        campaign_discount: 0,
        price_increase_alert: false,
        low_margin_alert: false,
        last_updated: new Date().toISOString()
      },
      {
        id: '3',
        product_id: 'P3',
        product_name: 'Makarna 500g',
        category: 'Bakliyat',
        supplier_name: 'Piyale Gıda',
        purchase_cost: 4200,
        last_purchase_cost: 4500,
        avg_cost: 4350,
        cost_trend: 'down',
        cost_change_percent: -6.7,
        base_price: 6500,
        selling_price: 6175,
        discount_percent: 5,
        final_price: 6175,
        profit_margin: 1975,
        profit_margin_percent: 32.0,
        target_margin_percent: 30,
        rent_discount: 0,
        target_discount: 5,
        campaign_discount: 0,
        price_increase_alert: false,
        low_margin_alert: false,
        last_updated: new Date().toISOString()
      },
    ];
    setProducts(mockProducts);
  };

  const loadDiscountRules = async () => {
    // Mock data
    const mockRules: DiscountRule[] = [
      {
        id: '1',
        name: 'Kira İndirimi - Yağlar',
        type: 'rent',
        discount_percent: 2,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        applicable_categories: ['Yağlar'],
        is_active: true
      },
      {
        id: '2',
        name: 'Hedef İndirim - Unlar',
        type: 'target',
        discount_percent: 8,
        start_date: '2024-12-01',
        end_date: '2024-12-31',
        applicable_categories: ['Unlar'],
        is_active: true
      },
      {
        id: '3',
        name: 'Ramazan Kampanyası',
        type: 'campaign',
        discount_percent: 15,
        start_date: '2025-03-01',
        end_date: '2025-03-31',
        applicable_categories: ['Yağlar', 'Unlar', 'Bakliyat'],
        is_active: false
      },
    ];
    setDiscountRules(mockRules);
  };

  const updateProductPrice = (productId: string, updates: Partial<ProductPrice>) => {
    setProducts(products.map(p => {
      if (p.id === productId) {
        const updated = { ...p, ...updates };
        
        // Recalculate margins
        const totalDiscount = (updated.rent_discount || 0) + (updated.target_discount || 0) + (updated.campaign_discount || 0);
        updated.discount_percent = totalDiscount;
        updated.final_price = updated.base_price * (1 - totalDiscount / 100);
        updated.profit_margin = updated.final_price - updated.purchase_cost;
        updated.profit_margin_percent = (updated.profit_margin / updated.final_price) * 100;
        updated.low_margin_alert = updated.profit_margin_percent < updated.target_margin_percent;
        
        return updated;
      }
      return p;
    }));
  };

  const getCostTrendIcon = (trend: string, percent: number) => {
    if (trend === 'up') {
      return (
        <div className="flex items-center gap-1 text-red-500">
          <TrendingUp className="w-4 h-4" />
          <span className="text-sm font-semibold">+{percent.toFixed(1)}%</span>
        </div>
      );
    }
    if (trend === 'down') {
      return (
        <div className="flex items-center gap-1 text-green-500">
          <TrendingDown className="w-4 h-4" />
          <span className="text-sm font-semibold">{percent.toFixed(1)}%</span>
        </div>
      );
    }
    return <span className="text-sm text-gray-500">Stabil</span>;
  };

  // Summary stats
  const avgMargin = products.reduce((sum, p) => sum + p.profit_margin_percent, 0) / products.length;
  const totalProfit = products.reduce((sum, p) => sum + p.profit_margin, 0);
  const lowMarginCount = products.filter(p => p.low_margin_alert).length;
  const priceAlertCount = products.filter(p => p.price_increase_alert).length;

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
              <Banknote className="w-8 h-8 text-green-500" />
              Fiyatlandırma ve Maliyet Yönetimi
            </h1>
            <p className="text-gray-500">Maliyet takibi, kar marjı hesaplama ve indirim yönetimi</p>
          </div>
          <button
            onClick={() => setShowDiscountModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg"
          >
            <Gift className="w-5 h-5" />
            İndirim Kuralları
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <Percent className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Ort. Kar Marjı</div>
              <div className={`text-2xl font-bold ${textClass}`}>{avgMargin.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Banknote className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Toplam Kar</div>
              <div className={`text-2xl font-bold ${textClass}`}>{(totalProfit / 1000).toFixed(0)}K</div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Düşük Marj</div>
              <div className={`text-2xl font-bold ${textClass}`}>{lowMarginCount}</div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Fiyat Artışı</div>
              <div className={`text-2xl font-bold ${textClass}`}>{priceAlertCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardClass} border rounded-xl p-4 mb-6`}>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Ürün ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-lg border ${inputClass}`}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`px-4 py-2 rounded-lg border ${inputClass}`}
          >
            <option value="all">Tüm Kategoriler</option>
            <option value="Yağlar">Yağlar</option>
            <option value="Unlar">Unlar</option>
            <option value="Bakliyat">Bakliyat</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className={`${cardClass} border rounded-xl overflow-hidden`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className={`text-lg font-bold ${textClass}`}>Ürün Fiyatları ve Maliyetler</h3>
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
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Maliyet</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Trend</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Satış Fiyatı</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">İndirim</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Final</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Kar Marjı</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Uyarılar</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {products
                .filter(p => 
                  (categoryFilter === 'all' || p.category === categoryFilter) &&
                  (searchTerm === '' || p.product_name.toLowerCase().includes(searchTerm.toLowerCase()))
                )
                .map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-4">
                      <div className={`font-medium ${textClass}`}>{product.product_name}</div>
                      <div className="text-xs text-gray-500">{product.category} • {product.supplier_name}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className={`font-bold ${textClass}`}>
                        {(product.purchase_cost / 1000).toFixed(1)}K
                      </div>
                      <div className="text-xs text-gray-500">
                        Ort: {(product.avg_cost / 1000).toFixed(1)}K
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {getCostTrendIcon(product.cost_trend, product.cost_change_percent)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className={`font-bold ${textClass}`}>
                        {(product.base_price / 1000).toFixed(1)}K
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="text-sm">
                        {product.rent_discount > 0 && (
                          <div className="text-purple-600">Kira: {product.rent_discount}%</div>
                        )}
                        {product.target_discount > 0 && (
                          <div className="text-blue-600">Hedef: {product.target_discount}%</div>
                        )}
                        {product.campaign_discount > 0 && (
                          <div className="text-green-600">Kampanya: {product.campaign_discount}%</div>
                        )}
                        {product.discount_percent === 0 && (
                          <span className="text-gray-500">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className={`text-lg font-bold ${textClass}`}>
                        {(product.final_price / 1000).toFixed(1)}K
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className={`font-bold ${
                        product.profit_margin_percent >= product.target_margin_percent 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        {product.profit_margin_percent.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">
                        Hedef: {product.target_margin_percent}%
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col gap-1">
                        {product.price_increase_alert && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            <TrendingUp className="w-3 h-3" />
                            Fiyat Artışı
                          </span>
                        )}
                        {product.low_margin_alert && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                            <AlertCircle className="w-3 h-3" />
                            Düşük Marj
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedProduct(product);
                          setIsEditing(true);
                        }}
                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded text-blue-600"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Product Modal */}
      {isEditing && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${cardClass} border rounded-2xl max-w-2xl w-full p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${textClass}`}>Fiyat Düzenle - {selectedProduct.product_name}</h3>
              <button onClick={() => setIsEditing(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>Satış Fiyatı (IQD)</label>
                  <input
                    type="number"
                    value={selectedProduct.base_price}
                    onChange={(e) => updateProductPrice(selectedProduct.id, { base_price: parseFloat(e.target.value) })}
                    className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                    step="100"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>Hedef Marj (%)</label>
                  <input
                    type="number"
                    value={selectedProduct.target_margin_percent}
                    onChange={(e) => updateProductPrice(selectedProduct.id, { target_margin_percent: parseFloat(e.target.value) })}
                    className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                    step="1"
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium ${textClass} mb-2`}>İndirimler</label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-500">Kira İndirimi (%)</label>
                    <input
                      type="number"
                      value={selectedProduct.rent_discount}
                      onChange={(e) => updateProductPrice(selectedProduct.id, { rent_discount: parseFloat(e.target.value) || 0 })}
                      className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Hedef İndirim (%)</label>
                    <input
                      type="number"
                      value={selectedProduct.target_discount}
                      onChange={(e) => updateProductPrice(selectedProduct.id, { target_discount: parseFloat(e.target.value) || 0 })}
                      className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Kampanya (%)</label>
                    <input
                      type="number"
                      value={selectedProduct.campaign_discount}
                      onChange={(e) => updateProductPrice(selectedProduct.id, { campaign_discount: parseFloat(e.target.value) || 0 })}
                      className={`w-full px-3 py-2 rounded-lg border ${inputClass}`}
                      step="0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Maliyet:</span>
                    <span className={`ml-2 font-bold ${textClass}`}>{(selectedProduct.purchase_cost / 1000).toFixed(1)}K IQD</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Final Fiyat:</span>
                    <span className={`ml-2 font-bold ${textClass}`}>{(selectedProduct.final_price / 1000).toFixed(1)}K IQD</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Kar:</span>
                    <span className={`ml-2 font-bold text-green-600`}>{(selectedProduct.profit_margin / 1000).toFixed(1)}K IQD</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Kar Marjı:</span>
                    <span className={`ml-2 font-bold ${selectedProduct.profit_margin_percent >= selectedProduct.target_margin_percent ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedProduct.profit_margin_percent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsEditing(false)}
                className={`px-4 py-2 rounded-lg border ${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'}`}
              >
                İptal
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  alert('Fiyat güncellendi!');
                }}
                className="flex items-center gap-2 px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
              >
                <Save className="w-5 h-5" />
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Rules Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${cardClass} border rounded-2xl max-w-3xl w-full p-6 max-h-[80vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${textClass}`}>İndirim Kuralları</h3>
              <button onClick={() => setShowDiscountModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-3">
              {discountRules.map((rule) => (
                <div key={rule.id} className={`p-4 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className={`font-bold ${textClass} mb-1`}>{rule.name}</div>
                      <div className="text-sm text-gray-500">
                        {rule.type === 'rent' && 'ğŸ¢ Kira İndirimi'}
                        {rule.type === 'target' && 'ğŸ¯ Hedef İndirimi'}
                        {rule.type === 'campaign' && 'ğŸ Kampanya'}
                        {rule.type === 'seasonal' && 'ğŸŒŸ Sezonluk'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${textClass}`}>{rule.discount_percent}%</div>
                      <div className={`text-xs px-2 py-1 rounded ${rule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                        {rule.is_active ? 'Aktif' : 'Pasif'}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    ğŸ“… {new Date(rule.start_date).toLocaleDateString('tr-TR')} - {new Date(rule.end_date).toLocaleDateString('tr-TR')}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Kategoriler: {rule.applicable_categories.join(', ')}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowDiscountModal(false)}
              className="w-full mt-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

