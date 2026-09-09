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
  Banknote,
  Package,
  Users,
  ShoppingCart,
  BarChart3,
  PieChart,
  Target,
  Award
} from 'lucide-react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ProductProfitabilityReport } from './ProductProfitabilityReport';
import { CustomerProfitabilityReport } from '../trading/contacts/CustomerProfitabilityReport';
import { postgres } from '../../services/postgres';
import { SQL_COUNTABLE_SALE_STATUS_PLAIN } from '../../utils/saleInvoiceStatus';

type TabType = 'overview' | 'products' | 'customers';

export function ProfitDashboard() {
  const { tm } = useLanguage();
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
        WHERE fiche_type = 'sales_invoice' AND ${SQL_COUNTABLE_SALE_STATUS_PLAIN}
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
            <h3 className="font-semibold">{tm('rptProfitDashNeedFirmTitle')}</h3>
            <p className="text-sm">{tm('rptProfitDashNeedFirmDesc')}</p>
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
            <h1 className="text-2xl font-bold mb-2">{tm('rptProfitDashTitle')}</h1>
            <p className="text-purple-100">
              {selectedFirma.firma_adi} / {selectedDonem.donem_adi}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">
              {loading ? '...' : `${formatMoney(kpiData.grossProfit)} IQD`}
            </div>
            <div className="text-purple-100">{tm('rptProfitDashTotalGross')}</div>
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
              {tm('rptProfitTabOverview')}
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
              {tm('rptProfitTabProducts')}
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
              {tm('rptProfitTabCustomers')}
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
                      <Banknote className="w-6 h-6 text-white" />
                    </div>
                    {trends.revenueChange > 0 && (
                      <div className="flex items-center gap-1 text-xs text-green-700">
                        <TrendingUp className="w-3 h-3" />
                        +{trends.revenueChange}%
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">{tm('rptProfitTotalSales')}</div>
                  <div className="text-2xl font-bold text-green-900">
                    {formatMoney(kpiData.totalRevenue)} IQD
                  </div>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 bg-orange-500 rounded-lg">
                      <Banknote className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mb-1">{tm('rptProfitTotalCost')}</div>
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
                  <div className="text-sm text-gray-600 mb-1">{tm('rptProfitGrossProfit')}</div>
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
                  <div className="text-sm text-gray-600 mb-1">{tm('rptProfitMargin')}</div>
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
                    <div className="text-sm text-gray-600">{tm('rptProfitTxnCount')}</div>
                  </div>
                  <div className="text-xl font-bold text-gray-900">{kpiData.transactionCount}</div>
                  {trends.transactionChange > 0 && (
                    <div className="text-xs text-green-600 mt-1">
                      {tm('rptProfitIncreasePct').replace('{n}', String(trends.transactionChange))}
                    </div>
                  )}
                </div>

                <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <div className="text-sm text-gray-600">{tm('rptProfitProductCount')}</div>
                  </div>
                  <div className="text-xl font-bold text-gray-900">{kpiData.productCount}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {tm('rptProfitProfitableLossCount')
                      .replace('{profitable}', String(kpiData.profitableProducts))
                      .replace('{loss}', String(kpiData.lossProducts))}
                  </div>
                </div>

                <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Users className="w-5 h-5 text-green-600" />
                    <div className="text-sm text-gray-600">{tm('rptProfitCustomerCount')}</div>
                  </div>
                  <div className="text-xl font-bold text-gray-900">{kpiData.customerCount}</div>
                </div>

                <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Banknote className="w-5 h-5 text-cyan-600" />
                    <div className="text-sm text-gray-600">{tm('rptProfitAvgTxnValue')}</div>
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
                    <h3 className="font-semibold text-yellow-900">{tm('rptProfitTopProduct')}</h3>
                  </div>
                  <div className="text-2xl font-bold text-yellow-900 mb-2">
                    {kpiData.topProduct}
                  </div>
                  <div className="text-sm text-yellow-700">
                    {tm('rptProfitTopProductHint')}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-pink-50 to-rose-50 border-2 border-pink-200 rounded-lg p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Award className="w-6 h-6 text-pink-600" />
                    <h3 className="font-semibold text-pink-900">{tm('rptProfitTopCustomer')}</h3>
                  </div>
                  <div className="text-2xl font-bold text-pink-900 mb-2">
                    {kpiData.topCustomer}
                  </div>
                  <div className="text-sm text-pink-700">
                    {tm('rptProfitTopCustomerHint')}
                  </div>
                </div>
              </div>

              {/* Quick Insights */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
                <h3 className="font-semibold text-blue-900 mb-4">{tm('rptProfitInsights')}</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-2" />
                    <div>
                      <div className="font-medium text-blue-900">
                        {tm('rptProfitInsightMarginAbove')}
                      </div>
                      <div className="text-sm text-blue-700">
                        {tm('rptProfitInsightMarginDetail').replace('{n}', kpiData.profitMargin.toFixed(2))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-600 rounded-full mt-2" />
                    <div>
                      <div className="font-medium text-blue-900">
                        {tm('rptProfitInsightProfitableProducts').replace('{n}', String(kpiData.profitableProducts))}
                      </div>
                      <div className="text-sm text-blue-700">
                        {tm('rptProfitInsightProfitableRatio')
                          .replace('{count}', String(kpiData.productCount))
                          .replace(
                            '{pct}',
                            kpiData.productCount > 0
                              ? ((kpiData.profitableProducts / kpiData.productCount) * 100).toFixed(1)
                              : '0'
                          )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-yellow-600 rounded-full mt-2" />
                    <div>
                      <div className="font-medium text-blue-900">
                        {tm('rptProfitInsightLossAttention').replace('{n}', String(kpiData.lossProducts))}
                      </div>
                      <div className="text-sm text-blue-700">
                        {tm('rptProfitInsightLossHint')}
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
