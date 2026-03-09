/**
 * ExRetailOS - Profit Dashboard
 * 
 * Karlılık analizleri için ana dashboard
 * - KPI cards
 * - Trend charts
 * - Quick insights
 * 
 * @created 2024-12-18
 */

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Users,
  ShoppingCart,
  BarChart3,
  PieChart,
  Target,
  Award
} from 'lucide-react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { ProductProfitabilityReport } from './ProductProfitabilityReport';
import { CustomerProfitabilityReport } from '../trading/contacts/CustomerProfitabilityReport';
import { postgres } from '../../services/postgres';

type TabType = 'overview' | 'products' | 'customers';

export function ProfitDashboard() {
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [kpiData, setKpiData] = useState({
    totalRevenue: 0,
    totalCost: 0,
    grossProfit: 0,
    profitMargin: 0,
    transactionCount: 0,
    productCount: 0,
    customerCount: 0,
    avgTransactionValue: 0,
    topProduct: '-',
    topCustomer: '-',
    profitableProducts: 0,
    lossProducts: 0
  });
  const trends = { revenueChange: 0, profitChange: 0, marginChange: 0, transactionChange: 0 };

  useEffect(() => {
    if (selectedFirma && selectedDonem) loadKpiData();
  }, [selectedFirma, selectedDonem]);

  const loadKpiData = async () => {
    setLoading(true);
    try {
      const { rows: kpiRows } = await postgres.query(`
        SELECT
          COALESCE(SUM(net_amount), 0)   AS total_revenue,
          COALESCE(SUM(total_cost), 0)   AS total_cost,
          COALESCE(SUM(gross_profit), 0) AS gross_profit,
          CASE WHEN COALESCE(SUM(net_amount), 0) > 0
            THEN (COALESCE(SUM(gross_profit), 0) / SUM(net_amount)) * 100
            ELSE 0 END                   AS profit_margin,
          COUNT(*)                       AS transaction_count,
          COUNT(DISTINCT customer_id)    AS customer_count
        FROM sales
        WHERE fiche_type = 'sales_invoice' AND status = 'completed'
      `);

      const { rows: topProductRows } = await postgres.query(`
        SELECT si.product_code, si.product_name, SUM(si.gross_profit) AS total_profit
        FROM sale_items si
        JOIN sales s ON si.invoice_id = s.id
        WHERE s.fiche_type = 'sales_invoice'
        GROUP BY si.product_code, si.product_name
        ORDER BY SUM(si.gross_profit) DESC
        LIMIT 1
      `);

      const { rows: topCustomerRows } = await postgres.query(`
        SELECT customer_name, SUM(gross_profit) AS total_profit
        FROM sales
        WHERE fiche_type = 'sales_invoice'
          AND customer_name IS NOT NULL AND customer_name != ''
        GROUP BY customer_name
        ORDER BY SUM(gross_profit) DESC
        LIMIT 1
      `);

      const { rows: prodCountRows } = await postgres.query(`
        SELECT
          COUNT(DISTINCT CASE WHEN t.total_profit > 0  THEN t.product_code END) AS profitable,
          COUNT(DISTINCT CASE WHEN t.total_profit <= 0 THEN t.product_code END) AS loss_count,
          COUNT(DISTINCT t.product_code)                                        AS total_count
        FROM (
          SELECT si.product_code, SUM(si.gross_profit) AS total_profit
          FROM sale_items si
          JOIN sales s ON si.invoice_id = s.id
          WHERE s.fiche_type = 'sales_invoice'
          GROUP BY si.product_code
        ) t
      `);

      const k = kpiRows[0] || {};
      const pc = prodCountRows[0] || {};
      const tp = topProductRows[0];
      const tc = topCustomerRows[0];
      const txCount = parseInt(k.transaction_count) || 0;
      const totalRev = parseFloat(k.total_revenue) || 0;

      setKpiData({
        totalRevenue: totalRev,
        totalCost: parseFloat(k.total_cost) || 0,
        grossProfit: parseFloat(k.gross_profit) || 0,
        profitMargin: parseFloat(k.profit_margin) || 0,
        transactionCount: txCount,
        productCount: parseInt(pc.total_count) || 0,
        customerCount: parseInt(k.customer_count) || 0,
        avgTransactionValue: txCount > 0 ? totalRev / txCount : 0,
        topProduct: tp ? `${tp.product_code} - ${tp.product_name}` : '-',
        topCustomer: tc ? tc.customer_name : '-',
        profitableProducts: parseInt(pc.profitable) || 0,
        lossProducts: parseInt(pc.loss_count) || 0,
      });
    } catch (err) {
      console.error('[ProfitDashboard] loadKpiData failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amount: number) => {
    return amount.toLocaleString('en-IQ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  if (!selectedFirma || !selectedDonem) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="flex items-center gap-3 text-yellow-800">
          <BarChart3 className="w-6 h-6" />
          <div>
            <h3 className="font-semibold">Firma ve Dönem Seçimi Gerekli</h3>
            <p className="text-sm">Karlılık analizlerini görmek için lütfen firma ve dönem seçin</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">Karlılık Analizi Dashboard</h1>
            <p className="text-purple-100">
              {selectedFirma.firma_adi} / {selectedDonem.donem_adi}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">
              {loading ? '...' : `${formatMoney(kpiData.grossProfit)} IQD`}
            </div>
            <div className="text-purple-100">Toplam Brüt Kar</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === 'overview'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Genel Bakış
            </div>
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === 'products'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Ürün Bazlı
            </div>
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === 'customers'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Müşteri Bazlı
            </div>
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Main KPIs */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 bg-green-500 rounded-lg">
                      <DollarSign className="w-6 h-6 text-white" />
                    </div>
                    {trends.revenueChange > 0 && (
                      <div className="flex items-center gap-1 text-xs text-green-700">
                        <TrendingUp className="w-3 h-3" />
                        +{trends.revenueChange}%
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">Toplam Satış</div>
                  <div className="text-2xl font-bold text-green-900">
                    {formatMoney(kpiData.totalRevenue)} IQD
                  </div>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 bg-orange-500 rounded-lg">
                      <DollarSign className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mb-1">Toplam Maliyet</div>
                  <div className="text-2xl font-bold text-orange-900">
                    {formatMoney(kpiData.totalCost)} IQD
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-300 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 bg-emerald-600 rounded-lg">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                    {trends.profitChange > 0 && (
                      <div className="flex items-center gap-1 text-xs text-emerald-700">
                        <TrendingUp className="w-3 h-3" />
                        +{trends.profitChange}%
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">Brüt Kar</div>
                  <div className="text-2xl font-bold text-emerald-900">
                    {formatMoney(kpiData.grossProfit)} IQD
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 bg-blue-600 rounded-lg">
                      <Target className="w-6 h-6 text-white" />
                    </div>
                    {trends.marginChange > 0 && (
                      <div className="flex items-center gap-1 text-xs text-blue-700">
                        <TrendingUp className="w-3 h-3" />
                        +{trends.marginChange}%
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">Kar Marjı</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {kpiData.profitMargin.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Secondary KPIs */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <ShoppingCart className="w-5 h-5 text-purple-600" />
                    <div className="text-sm text-gray-600">İşlem Sayısı</div>
                  </div>
                  <div className="text-xl font-bold text-gray-900">{kpiData.transactionCount}</div>
                  {trends.transactionChange > 0 && (
                    <div className="text-xs text-green-600 mt-1">
                      +{trends.transactionChange}% artış
                    </div>
                  )}
                </div>

                <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <div className="text-sm text-gray-600">Ürün Sayısı</div>
                  </div>
                  <div className="text-xl font-bold text-gray-900">{kpiData.productCount}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {kpiData.profitableProducts} karlı, {kpiData.lossProducts} zararlı
                  </div>
                </div>

                <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Users className="w-5 h-5 text-green-600" />
                    <div className="text-sm text-gray-600">Müşteri Sayısı</div>
                  </div>
                  <div className="text-xl font-bold text-gray-900">{kpiData.customerCount}</div>
                </div>

                <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <DollarSign className="w-5 h-5 text-cyan-600" />
                    <div className="text-sm text-gray-600">Ort. İşlem Değeri</div>
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {formatMoney(kpiData.avgTransactionValue)} IQD
                  </div>
                </div>
              </div>

              {/* Top Performers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-lg p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Award className="w-6 h-6 text-yellow-600" />
                    <h3 className="font-semibold text-yellow-900">En Karlı Ürün</h3>
                  </div>
                  <div className="text-2xl font-bold text-yellow-900 mb-2">
                    {kpiData.topProduct}
                  </div>
                  <div className="text-sm text-yellow-700">
                    Dönemin en yüksek karlılık oranına sahip ürünü
                  </div>
                </div>

                <div className="bg-gradient-to-br from-pink-50 to-rose-50 border-2 border-pink-200 rounded-lg p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Award className="w-6 h-6 text-pink-600" />
                    <h3 className="font-semibold text-pink-900">En Karlı Müşteri</h3>
                  </div>
                  <div className="text-2xl font-bold text-pink-900 mb-2">
                    {kpiData.topCustomer}
                  </div>
                  <div className="text-sm text-pink-700">
                    Dönemin en yüksek kar getiren müşterisi
                  </div>
                </div>
              </div>

              {/* Quick Insights */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
                <h3 className="font-semibold text-blue-900 mb-4">Hızlı İçgörüler</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-2" />
                    <div>
                      <div className="font-medium text-blue-900">
                        Kar marjınız sektör ortalamasının üzerinde
                      </div>
                      <div className="text-sm text-blue-700">
                        %{kpiData.profitMargin.toFixed(2)} kar marjı ile hedeflerinize ulaşıyorsunuz
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-600 rounded-full mt-2" />
                    <div>
                      <div className="font-medium text-blue-900">
                        {kpiData.profitableProducts} ürün karlı çalışıyor
                      </div>
                      <div className="text-sm text-blue-700">
                        Toplam {kpiData.productCount} üründen %{((kpiData.profitableProducts / kpiData.productCount) * 100).toFixed(1)}'i karlı
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-yellow-600 rounded-full mt-2" />
                    <div>
                      <div className="font-medium text-blue-900">
                        {kpiData.lossProducts} ürün dikkat gerektiriyor
                      </div>
                      <div className="text-sm text-blue-700">
                        Zararlı ürünlerin fiyatlandırması gözden geçirilmeli
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'products' && (
            <ProductProfitabilityReport />
          )}

          {activeTab === 'customers' && (
            <CustomerProfitabilityReport />
          )}
        </div>
      </div>
    </div>
  );
}

