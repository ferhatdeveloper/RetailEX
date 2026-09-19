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

import { useState, useEffect, useCallback } from 'react';
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
import { getCostProfitAnalysis } from '../../services/layeredInventoryCost';
import { postgres } from '../../services/postgres';
import { SQL_COUNTABLE_SALE_STATUS_PLAIN } from '../../utils/saleInvoiceStatus';
import { toSqlDateInputString, localTodayDateKey } from '../../utils/localCalendarDate';
import { displayItemCode } from '../../utils/lastPurchaseCostSql';

type TabType = 'overview' | 'products' | 'customers';

function periodOrMonthRange(period: { beg_date?: string; end_date?: string } | null | undefined): {
  start: string;
  end: string;
} {
  const start = toSqlDateInputString(period?.beg_date || '');
  const end = toSqlDateInputString(period?.end_date || '');
  if (start && end) return { start, end };
  const today = localTodayDateKey();
  const d = new Date();
  d.setDate(1);
  return {
    start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    end: today,
  };
}

export function ProfitDashboard() {
  const { tm } = useLanguage();
  const { selectedFirma, selectedDonem, selectedFirm, selectedPeriod } = useFirmaDonem();
  const firm = selectedFirm || selectedFirma;
  const period = selectedPeriod || selectedDonem;
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

  const loadKpiData = useCallback(async () => {
    if (!firm || !period) return;
    setLoading(true);
    try {
      const { start, end } = periodOrMonthRange(period);
      const profitRows = await getCostProfitAnalysis({
        startDate: start,
        endDate: end,
        firmNr: firm.firm_nr,
        periodNr: period.nr,
      });

      const totalRevenue = profitRows.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
      const totalCost = profitRows.reduce((s, r) => s + (Number(r.cogs) || 0), 0);
      const grossProfit = profitRows.reduce((s, r) => s + (Number(r.profit) || 0), 0);
      const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const profitableProducts = profitRows.filter((r) => (Number(r.profit) || 0) > 0).length;
      const lossProducts = profitRows.filter((r) => (Number(r.profit) || 0) < 0).length;
      const topByProfit = [...profitRows].sort(
        (a, b) => (Number(b.profit) || 0) - (Number(a.profit) || 0),
      )[0];
      const topProduct = topByProfit
        ? `${displayItemCode(topByProfit.productCode)} - ${topByProfit.productName}`
        : '-';

      let transactionCount = 0;
      let customerCount = 0;
      let topCustomer = '-';
      try {
        const { rows: kpiRows } = await postgres.query(
          `
          SELECT
            COUNT(*) AS transaction_count,
            COUNT(DISTINCT NULLIF(TRIM(COALESCE(customer_id::text, '')), '')) AS customer_count
          FROM sales
          WHERE ${SQL_COUNTABLE_SALE_STATUS_PLAIN}
            AND (date::timestamptz AT TIME ZONE 'UTC')::date >= $1::date
            AND (date::timestamptz AT TIME ZONE 'UTC')::date <= $2::date
          `,
          [start, end],
        );
        transactionCount = parseInt(String(kpiRows[0]?.transaction_count ?? 0), 10) || 0;
        customerCount = parseInt(String(kpiRows[0]?.customer_count ?? 0), 10) || 0;

        const { rows: topCustomerRows } = await postgres.query(
          `
          SELECT
            COALESCE(NULLIF(TRIM(customer_name), ''), '-') AS customer_name,
            COALESCE(SUM(net_amount), 0) AS total_rev
          FROM sales
          WHERE ${SQL_COUNTABLE_SALE_STATUS_PLAIN}
            AND (date::timestamptz AT TIME ZONE 'UTC')::date >= $1::date
            AND (date::timestamptz AT TIME ZONE 'UTC')::date <= $2::date
            AND NULLIF(TRIM(COALESCE(customer_name, '')), '') IS NOT NULL
          GROUP BY 1
          ORDER BY total_rev DESC
          LIMIT 1
          `,
          [start, end],
        );
        topCustomer = String(topCustomerRows[0]?.customer_name || '-');
      } catch (metaErr) {
        console.warn('[ProfitDashboard] sales meta KPI fallback', metaErr);
      }

      setKpiData({
        totalRevenue,
        totalCost,
        grossProfit,
        profitMargin,
        transactionCount,
        productCount: profitRows.length,
        customerCount,
        avgTransactionValue: transactionCount > 0 ? totalRevenue / transactionCount : 0,
        topProduct,
        topCustomer,
        profitableProducts,
        lossProducts,
      });
    } catch (err) {
      console.error('[ProfitDashboard] loadKpiData failed:', err);
    } finally {
      setLoading(false);
    }
  }, [firm, period]);

  useEffect(() => {
    if (firm && period) void loadKpiData();
  }, [firm, period, loadKpiData]);

  const formatMoney = (amount: number) => {
    return amount.toLocaleString('en-IQ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  if (!firm || !period) {
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
              {firm.firma_adi} / {period.donem_adi ?? period.name}
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
                          .replace(
                            '{count}',
                            String(
                              kpiData.profitableProducts + kpiData.lossProducts > 0
                                ? kpiData.profitableProducts + kpiData.lossProducts
                                : kpiData.productCount
                            )
                          )
                          .replace(
                            '{pct}',
                            (() => {
                              const denom =
                                kpiData.profitableProducts + kpiData.lossProducts > 0
                                  ? kpiData.profitableProducts + kpiData.lossProducts
                                  : kpiData.productCount;
                              return denom > 0
                                ? ((kpiData.profitableProducts / denom) * 100).toFixed(1)
                                : '0';
                            })()
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
