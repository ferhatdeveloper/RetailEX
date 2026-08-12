import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, Package, ShoppingCart, Calendar, Filter, Loader2 } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import { postgres, ERP_SETTINGS, getAppDefaultCurrency } from '../../services/postgres';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { toSqlDateInputString } from '../../utils/localCalendarDate';
import { SQL_COUNTABLE_SALE_STATUS } from '../../utils/saleInvoiceStatus';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  buildProfitCostCtes,
  INVOICE_LINE_SCALE_JOIN,
  LAST_PURCHASE_JOIN,
  PRODUCTS_JOIN,
  SIGNED_LINE_COST_EXPR,
  SIGNED_LINE_PROFIT_EXPR,
  SIGNED_LINE_QTY_EXPR,
  SIGNED_LINE_REVENUE_EXPR,
  SQL_LINE_RESOLVED_PRODUCT_ID,
  SQL_PL_SALES_OR_RETURN,
} from '../../utils/lastPurchaseCostSql';
import {
  ProductMovementHistoryModal,
  type ProductMovementTarget,
} from './ProductMovementHistoryModal';
interface SalesData {
  rowKey: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
}

const PROFIT_CTES = buildProfitCostCtes('$1');

const SALES_FILTER = `
  s.firm_nr = $1
  AND COALESCE(s.is_cancelled, false) = false
  AND ${SQL_COUNTABLE_SALE_STATUS}
  AND ${SQL_PL_SALES_OR_RETURN}
  AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
  AND (s.date AT TIME ZONE 'UTC')::date >= $2::date
  AND (s.date AT TIME ZONE 'UTC')::date <= $3::date
`.trim();

export function ProfitLossReport() {
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  const { tm, language } = useLanguage();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportType, setReportType] = useState<'product' | 'category' | 'daily' | 'monthly'>('product');
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [movementTarget, setMovementTarget] = useState<ProductMovementTarget | null>(null);

  const reportCurrency = getAppDefaultCurrency();

  useEffect(() => {
    if (selectedDonem?.beg_date && selectedDonem?.end_date) {
      setStartDate(toSqlDateInputString(selectedDonem.beg_date) || '');
      setEndDate(toSqlDateInputString(selectedDonem.end_date) || '');
    }
  }, [selectedDonem?.beg_date, selectedDonem?.end_date]);

  const loadData = useCallback(async () => {
    const dateFrom = toSqlDateInputString(startDate);
    const dateTo = toSqlDateInputString(endDate);
    if (!selectedFirma || !selectedDonem || !dateFrom || !dateTo) {
      setSalesData([]);
      return;
    }

    const firmNr = String(selectedFirma.firm_nr || ERP_SETTINGS.firmNr || '001')
      .replace(/\D/g, '')
      .padStart(3, '0')
      .slice(0, 10);
    const periodNr = String(selectedDonem.nr ?? ERP_SETTINGS.periodNr).padStart(2, '0');

    setLoading(true);
    try {
      let sql: string;
      switch (reportType) {
        case 'category':
          sql = `
            WITH ${PROFIT_CTES}
            SELECT
              ''::text AS product_id,
              COALESCE(leaf_cat.id::text, NULLIF(TRIM(COALESCE(p.category_code, '')), ''), 'diger') AS product_code,
              COALESCE(leaf_cat.name, NULLIF(TRIM(COALESCE(p.category_code, '')), ''), 'Diğer') AS product_name,
              SUM(${SIGNED_LINE_QTY_EXPR}) AS quantity,
              SUM(${SIGNED_LINE_REVENUE_EXPR}) AS revenue,
              SUM(${SIGNED_LINE_COST_EXPR}) AS cost,
              SUM(${SIGNED_LINE_PROFIT_EXPR}) AS profit
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.invoice_id
            ${PRODUCTS_JOIN}
            LEFT JOIN categories leaf_cat ON leaf_cat.id = p.category_id
            ${LAST_PURCHASE_JOIN}
            ${INVOICE_LINE_SCALE_JOIN}
            WHERE ${SALES_FILTER}
            GROUP BY
              COALESCE(leaf_cat.id::text, NULLIF(TRIM(COALESCE(p.category_code, '')), ''), 'diger'),
              COALESCE(leaf_cat.name, NULLIF(TRIM(COALESCE(p.category_code, '')), ''), 'Diğer')
            HAVING SUM(ABS(si.quantity)) > 0
            ORDER BY SUM(${SIGNED_LINE_PROFIT_EXPR}) DESC
          `;
          break;
        case 'daily':
          sql = `
            WITH ${PROFIT_CTES}
            SELECT
              ''::text AS product_id,
              to_char((s.date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS product_code,
              to_char((s.date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS product_name,
              SUM(${SIGNED_LINE_QTY_EXPR}) AS quantity,
              SUM(${SIGNED_LINE_REVENUE_EXPR}) AS revenue,
              SUM(${SIGNED_LINE_COST_EXPR}) AS cost,
              SUM(${SIGNED_LINE_PROFIT_EXPR}) AS profit
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.invoice_id
            ${PRODUCTS_JOIN}
            ${LAST_PURCHASE_JOIN}
            ${INVOICE_LINE_SCALE_JOIN}
            WHERE ${SALES_FILTER}
            GROUP BY (s.date AT TIME ZONE 'UTC')::date
            HAVING SUM(ABS(si.quantity)) > 0
            ORDER BY (s.date AT TIME ZONE 'UTC')::date DESC
          `;
          break;
        case 'monthly':
          sql = `
            WITH ${PROFIT_CTES}
            SELECT
              ''::text AS product_id,
              to_char(date_trunc('month', s.date AT TIME ZONE 'UTC'), 'YYYY-MM') AS product_code,
              to_char(date_trunc('month', s.date AT TIME ZONE 'UTC'), 'YYYY-MM') AS product_name,
              SUM(${SIGNED_LINE_QTY_EXPR}) AS quantity,
              SUM(${SIGNED_LINE_REVENUE_EXPR}) AS revenue,
              SUM(${SIGNED_LINE_COST_EXPR}) AS cost,
              SUM(${SIGNED_LINE_PROFIT_EXPR}) AS profit
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.invoice_id
            ${PRODUCTS_JOIN}
            ${LAST_PURCHASE_JOIN}
            ${INVOICE_LINE_SCALE_JOIN}
            WHERE ${SALES_FILTER}
            GROUP BY date_trunc('month', s.date AT TIME ZONE 'UTC')
            HAVING SUM(ABS(si.quantity)) > 0
            ORDER BY date_trunc('month', s.date AT TIME ZONE 'UTC') DESC
          `;
          break;
        default:
          sql = `
            WITH ${PROFIT_CTES}
            SELECT
              MAX(COALESCE((${SQL_LINE_RESOLVED_PRODUCT_ID})::text, '')) AS product_id,
              COALESCE(NULLIF(TRIM(p.code), ''), NULLIF(TRIM(si.item_code), ''), '') AS product_code,
              COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, 'Bilinmeyen') AS product_name,
              SUM(${SIGNED_LINE_QTY_EXPR}) AS quantity,
              SUM(${SIGNED_LINE_REVENUE_EXPR}) AS revenue,
              SUM(${SIGNED_LINE_COST_EXPR}) AS cost,
              SUM(${SIGNED_LINE_PROFIT_EXPR}) AS profit
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.invoice_id
            ${PRODUCTS_JOIN}
            ${LAST_PURCHASE_JOIN}
            ${INVOICE_LINE_SCALE_JOIN}
            WHERE ${SALES_FILTER}
            GROUP BY
              COALESCE(NULLIF(TRIM(p.code), ''), NULLIF(TRIM(si.item_code), ''), ''),
              COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, 'Bilinmeyen')
            HAVING SUM(ABS(si.quantity)) > 0
            ORDER BY SUM(${SIGNED_LINE_PROFIT_EXPR}) DESC
          `;
      }

      const { rows } = await postgres.query<{
        product_id?: string;
        product_code: string;
        product_name: string;
        quantity: string | number;
        revenue: string | number;
        cost: string | number;
        profit: string | number;
      }>(sql, [firmNr, dateFrom, dateTo], { firmNr, periodNr });

      const mapped: SalesData[] = rows.map((r, idx) => {
        const revenue = parseFloat(String(r.revenue)) || 0;
        const cost = parseFloat(String(r.cost)) || 0;
        const profit = r.profit != null ? parseFloat(String(r.profit)) : revenue - cost;
        const code = r.product_code || '';
        const name = r.product_name || '';
        const productId = String(r.product_id || '').trim();
        let displayName = name;
        const loc =
          language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-IQ' : language === 'en' ? 'en-GB' : 'tr-TR';
        if (reportType === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(name)) {
          const [y, m, d] = name.split('-').map(Number);
          displayName = new Date(y, m - 1, d).toLocaleDateString(loc, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
        } else if (reportType === 'monthly' && /^\d{4}-\d{2}$/.test(name)) {
          const [y, mo] = name.split('-').map(Number);
          displayName = new Date(y, mo - 1, 1).toLocaleDateString(loc, {
            month: 'long',
            year: 'numeric',
          });
        }
        return {
          rowKey: `${reportType}|${productId}|${code}|${name}|${idx}`,
          productId,
          productCode: code,
          productName: displayName,
          quantity: parseFloat(String(r.quantity)) || 0,
          revenue,
          cost,
          profit,
          profitMargin: Math.abs(revenue) > 0.009 ? (profit / revenue) * 100 : 0,
        };
      });

      setSalesData(mapped);
    } catch (err: any) {
      console.error('[ProfitLossReport] loadData failed:', err);
      toast.error(err?.message || tm('reportsPlLoadError'));
      setSalesData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFirma, selectedDonem, startDate, endDate, reportType, language, tm]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalRevenue = salesData.reduce((sum, item) => sum + item.revenue, 0);
  const totalCost = salesData.reduce((sum, item) => sum + item.cost, 0);
  const totalProfit = salesData.reduce((sum, item) => sum + item.profit, 0);
  const averageMargin = Math.abs(totalRevenue) > 0.009 ? (totalProfit / totalRevenue) * 100 : 0;

  const sectionTitle = useMemo(() => {
    if (reportType === 'category') return tm('reportsPlSectionCategory');
    if (reportType === 'daily') return tm('reportsPlSectionDaily');
    if (reportType === 'monthly') return tm('reportsPlSectionMonthly');
    return tm('reportsPlSectionProduct');
  }, [reportType, tm]);

  const firstColLabel = useMemo(() => {
    if (reportType === 'category') return tm('reportsPlColCategory');
    if (reportType === 'daily' || reportType === 'monthly') return tm('reportsPlColPeriod');
    return tm('reportsPlColProduct');
  }, [reportType, tm]);

  if (!selectedFirma || !selectedDonem) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-amber-900 text-sm">
          {tm('reportsPlNeedFirmPeriod')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              {tm('reportsPlStartDate')}
            </label>
            <input
              type="date"
              value={toSqlDateInputString(startDate) || ''}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              {tm('reportsPlEndDate')}
            </label>
            <input
              type="date"
              value={toSqlDateInputString(endDate) || ''}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-1" />
              {tm('reportsPlReportType')}
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as typeof reportType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="product">{tm('reportsPlProductBased')}</option>
              <option value="category">{tm('reportsPlCategoryBased')}</option>
              <option value="daily">{tm('reportsPlDaily')}</option>
              <option value="monthly">{tm('reportsPlMonthly')}</option>
            </select>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500 leading-relaxed">
          {tm('reportsPlCostSourceNote')}
          {reportType === 'product' ? (
            <>
              {' '}
              {tm('reportsPlMovClickHint')}
            </>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{tm('reportsPlTotalRevenue')}</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatNumber(totalRevenue, 2, false)} {reportCurrency}
              </p>
            </div>
            <div className="bg-blue-100 rounded-full p-3">
              <ShoppingCart className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{tm('reportsPlTotalCost')}</p>
              <p className="text-2xl font-bold text-orange-600">
                {formatNumber(totalCost, 2, false)} {reportCurrency}
              </p>
            </div>
            <div className="bg-orange-100 rounded-full p-3">
              <Package className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border-2 border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{tm('reportsPlGrossProfit')}</p>
              <p className="text-2xl font-bold text-green-600">
                {formatNumber(totalProfit, 2, false)} {reportCurrency}
              </p>
              <p className="text-xs text-gray-500 mt-1">{tm('reportsPlMarginPct')}: %{formatNumber(averageMargin, 2, false)}</p>
            </div>
            <div className="bg-green-100 rounded-full p-3">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            {sectionTitle}
          </h3>
          {loading && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
        </div>
        <div className="overflow-auto">
          {salesData.length === 0 && !loading ? (
            <div className="p-8 text-center text-gray-400">
              {tm('reportsPlNoData')}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm">{firstColLabel}</th>
                  <th className="px-4 py-3 text-right text-sm">{tm('reportsPlQty')}</th>
                  <th className="px-4 py-3 text-right text-sm">{tm('reportsPlRevenue')}</th>
                  <th className="px-4 py-3 text-right text-sm">{tm('reportsPlCost')}</th>
                  <th className="px-4 py-3 text-right text-sm">{tm('reportsPlProfit')}</th>
                  <th className="px-4 py-3 text-right text-sm">{tm('reportsPlMarginCol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {salesData.map((item) => (
                  <tr
                    key={item.rowKey}
                    className={
                      reportType === 'product' && (item.productCode || item.productId)
                        ? 'hover:bg-emerald-50/80 cursor-pointer'
                        : 'hover:bg-gray-50'
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (reportType !== 'product' || (!item.productCode && !item.productId)) return;
                      setMovementTarget({
                        productId: item.productId || undefined,
                        productCode: item.productCode,
                        productName: item.productName,
                        startDate: toSqlDateInputString(startDate) || undefined,
                        endDate: toSqlDateInputString(endDate) || undefined,
                      });
                    }}
                    title={
                      reportType === 'product' && (item.productCode || item.productId)
                        ? tm('reportsPlMovClickHint')
                        : undefined
                    }
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                        {reportType === 'product' && item.productCode ? (
                          <p className="text-xs text-gray-500">{item.productCode}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">
                      {formatNumber(item.revenue, 2, false)} {reportCurrency}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">
                      {formatNumber(item.cost, 2, false)} {reportCurrency}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-sm font-medium ${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {formatNumber(item.profit, 2, false)} {reportCurrency}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          item.profitMargin >= 30
                            ? 'bg-green-100 text-green-700'
                            : item.profitMargin >= 20
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        %{formatNumber(item.profitMargin, 2, false)}
                      </span>
                    </td>
                  </tr>
                ))}
                {salesData.length > 0 && (
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-4 py-3 text-sm">{tm('reportsTotalUpper')}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      {salesData.reduce((sum, item) => sum + item.quantity, 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-blue-600">
                      {formatNumber(totalRevenue, 2, false)} {reportCurrency}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-orange-600">
                      {formatNumber(totalCost, 2, false)} {reportCurrency}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-green-600">
                      {formatNumber(totalProfit, 2, false)} {reportCurrency}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">%{formatNumber(averageMargin, 2, false)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {movementTarget ? (
        <ProductMovementHistoryModal
          key={`${movementTarget.productId || ''}|${movementTarget.productCode}`}
          target={movementTarget}
          onClose={() => setMovementTarget(null)}
        />
      ) : null}
    </div>
  );
}
