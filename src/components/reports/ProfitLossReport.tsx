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
  SERVICE_COST_JOINS,
  SIGNED_LINE_COST_EXPR,
  SIGNED_LINE_PROFIT_EXPR,
  SIGNED_LINE_QTY_EXPR,
  SIGNED_LINE_REVENUE_EXPR,
  SQL_DISPLAY_ITEM_CODE,
  SQL_LINE_KIND_EXPR,
  SQL_LINE_RESOLVED_PRODUCT_ID,
  SQL_PL_SALES_OR_RETURN,
  SQL_SERVICE_CATEGORY_EXPR,
  displayItemCode,
  sqlLineKindFilter,
} from '../../utils/lastPurchaseCostSql';
import {
  ProductMovementHistoryModal,
  type ProductMovementTarget,
} from './ProductMovementHistoryModal';
import { ReportColumnTable, type ReportColumnTableCol } from './shared/ReportDataGrid';

interface SalesData {
  rowKey: string;
  productId: string;
  productCode: string;
  productName: string;
  lineKind: 'product' | 'service';
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
}

type LineKindFilter = 'all' | 'product' | 'service';

const PROFIT_CTES = buildProfitCostCtes('$1');

const SALES_FILTER = `
  s.firm_nr = $1
  AND COALESCE(s.is_cancelled, false) = false
  AND ${SQL_COUNTABLE_SALE_STATUS}
  AND ${SQL_PL_SALES_OR_RETURN}
  AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
  AND (s.date::timestamptz AT TIME ZONE 'UTC')::date >= $2::date
  AND (s.date::timestamptz AT TIME ZONE 'UTC')::date <= $3::date
`.trim();

const CATEGORY_NAME_EXPR = `
COALESCE(
  leaf_cat.name,
  NULLIF(TRIM(COALESCE(p.category_code, '')), ''),
  CASE WHEN (${SQL_LINE_KIND_EXPR}) = 'service' THEN ${SQL_SERVICE_CATEGORY_EXPR} ELSE 'Diğer' END
)
`.trim();

const CATEGORY_CODE_EXPR = `
COALESCE(
  leaf_cat.id::text,
  NULLIF(TRIM(COALESCE(p.category_code, '')), ''),
  CASE WHEN (${SQL_LINE_KIND_EXPR}) = 'service' THEN ${SQL_SERVICE_CATEGORY_EXPR} ELSE 'diger' END
)
`.trim();

function normalizeLineKind(raw: unknown): 'product' | 'service' {
  return String(raw || '').trim() === 'service' ? 'service' : 'product';
}

export function ProfitLossReport() {
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  const { tm, language } = useLanguage();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportType, setReportType] = useState<'product' | 'category' | 'daily' | 'monthly'>('product');
  const [lineKind, setLineKind] = useState<LineKindFilter>('all');
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
    const kindFilter = sqlLineKindFilter(lineKind);

    setLoading(true);
    try {
      let sql: string;
      switch (reportType) {
        case 'category':
          sql = `
            WITH ${PROFIT_CTES}
            SELECT
              ''::text AS product_id,
              ${CATEGORY_CODE_EXPR} AS product_code,
              ${CATEGORY_NAME_EXPR} AS product_name,
              ${SQL_LINE_KIND_EXPR} AS line_kind,
              SUM(${SIGNED_LINE_QTY_EXPR}) AS quantity,
              SUM(${SIGNED_LINE_REVENUE_EXPR}) AS revenue,
              SUM(${SIGNED_LINE_COST_EXPR}) AS cost,
              SUM(${SIGNED_LINE_PROFIT_EXPR}) AS profit
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.invoice_id
            ${PRODUCTS_JOIN}
            ${SERVICE_COST_JOINS}
            LEFT JOIN categories leaf_cat ON leaf_cat.id = p.category_id
            ${LAST_PURCHASE_JOIN}
            ${INVOICE_LINE_SCALE_JOIN}
            WHERE ${SALES_FILTER}
            ${kindFilter}
            GROUP BY
              ${SQL_LINE_KIND_EXPR},
              ${CATEGORY_CODE_EXPR},
              ${CATEGORY_NAME_EXPR}
            HAVING SUM(ABS(si.quantity)) > 0
            ORDER BY SUM(${SIGNED_LINE_PROFIT_EXPR}) DESC
          `;
          break;
        case 'daily':
          sql = `
            WITH ${PROFIT_CTES}
            SELECT
              ''::text AS product_id,
              to_char((s.date::timestamptz AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS product_code,
              to_char((s.date::timestamptz AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS product_name,
              ${SQL_LINE_KIND_EXPR} AS line_kind,
              SUM(${SIGNED_LINE_QTY_EXPR}) AS quantity,
              SUM(${SIGNED_LINE_REVENUE_EXPR}) AS revenue,
              SUM(${SIGNED_LINE_COST_EXPR}) AS cost,
              SUM(${SIGNED_LINE_PROFIT_EXPR}) AS profit
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.invoice_id
            ${PRODUCTS_JOIN}
            ${SERVICE_COST_JOINS}
            ${LAST_PURCHASE_JOIN}
            ${INVOICE_LINE_SCALE_JOIN}
            WHERE ${SALES_FILTER}
            ${kindFilter}
            GROUP BY (s.date::timestamptz AT TIME ZONE 'UTC')::date, ${SQL_LINE_KIND_EXPR}
            HAVING SUM(ABS(si.quantity)) > 0
            ORDER BY (s.date::timestamptz AT TIME ZONE 'UTC')::date DESC, ${SQL_LINE_KIND_EXPR}
          `;
          break;
        case 'monthly':
          sql = `
            WITH ${PROFIT_CTES}
            SELECT
              ''::text AS product_id,
              to_char(date_trunc('month', s.date::timestamptz AT TIME ZONE 'UTC'), 'YYYY-MM') AS product_code,
              to_char(date_trunc('month', s.date::timestamptz AT TIME ZONE 'UTC'), 'YYYY-MM') AS product_name,
              ${SQL_LINE_KIND_EXPR} AS line_kind,
              SUM(${SIGNED_LINE_QTY_EXPR}) AS quantity,
              SUM(${SIGNED_LINE_REVENUE_EXPR}) AS revenue,
              SUM(${SIGNED_LINE_COST_EXPR}) AS cost,
              SUM(${SIGNED_LINE_PROFIT_EXPR}) AS profit
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.invoice_id
            ${PRODUCTS_JOIN}
            ${SERVICE_COST_JOINS}
            ${LAST_PURCHASE_JOIN}
            ${INVOICE_LINE_SCALE_JOIN}
            WHERE ${SALES_FILTER}
            ${kindFilter}
            GROUP BY date_trunc('month', s.date::timestamptz AT TIME ZONE 'UTC'), ${SQL_LINE_KIND_EXPR}
            HAVING SUM(ABS(si.quantity)) > 0
            ORDER BY date_trunc('month', s.date::timestamptz AT TIME ZONE 'UTC') DESC, ${SQL_LINE_KIND_EXPR}
          `;
          break;
        default:
          sql = `
            WITH ${PROFIT_CTES}
            SELECT
              MAX(COALESCE((${SQL_LINE_RESOLVED_PRODUCT_ID})::text, '')) AS product_id,
              ${SQL_DISPLAY_ITEM_CODE} AS product_code,
              COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, svc.name, bsvc.name, 'Bilinmeyen') AS product_name,
              ${SQL_LINE_KIND_EXPR} AS line_kind,
              SUM(${SIGNED_LINE_QTY_EXPR}) AS quantity,
              SUM(${SIGNED_LINE_REVENUE_EXPR}) AS revenue,
              SUM(${SIGNED_LINE_COST_EXPR}) AS cost,
              SUM(${SIGNED_LINE_PROFIT_EXPR}) AS profit
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.invoice_id
            ${PRODUCTS_JOIN}
            ${SERVICE_COST_JOINS}
            ${LAST_PURCHASE_JOIN}
            ${INVOICE_LINE_SCALE_JOIN}
            WHERE ${SALES_FILTER}
            ${kindFilter}
            GROUP BY
              ${SQL_LINE_KIND_EXPR},
              ${SQL_DISPLAY_ITEM_CODE},
              COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, svc.name, bsvc.name, 'Bilinmeyen')
            HAVING SUM(ABS(si.quantity)) > 0
            ORDER BY SUM(${SIGNED_LINE_PROFIT_EXPR}) DESC
          `;
      }

      const { rows } = await postgres.query<{
        product_id?: string;
        product_code: string;
        product_name: string;
        line_kind?: string;
        quantity: string | number;
        revenue: string | number;
        cost: string | number;
        profit: string | number;
      }>(sql, [firmNr, dateFrom, dateTo], { firmNr, periodNr });

      const mapped: SalesData[] = rows.map((r, idx) => {
        const revenue = parseFloat(String(r.revenue)) || 0;
        const cost = parseFloat(String(r.cost)) || 0;
        const profit = r.profit != null ? parseFloat(String(r.profit)) : revenue - cost;
        const code = displayItemCode(r.product_code);
        const name = r.product_name || '';
        const productId = String(r.product_id || '').trim();
        const kind = normalizeLineKind(r.line_kind);
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
          rowKey: `${reportType}|${kind}|${productId}|${code}|${name}|${idx}`,
          productId,
          productCode: code,
          productName: displayName,
          lineKind: kind,
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
  }, [selectedFirma, selectedDonem, startDate, endDate, reportType, lineKind, language, tm]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalRevenue = salesData.reduce((sum, item) => sum + item.revenue, 0);
  const totalCost = salesData.reduce((sum, item) => sum + item.cost, 0);
  const totalProfit = salesData.reduce((sum, item) => sum + item.profit, 0);
  const averageMargin = Math.abs(totalRevenue) > 0.009 ? (totalProfit / totalRevenue) * 100 : 0;
  const productCost = salesData
    .filter((item) => item.lineKind === 'product')
    .reduce((sum, item) => sum + item.cost, 0);
  const serviceCost = salesData
    .filter((item) => item.lineKind === 'service')
    .reduce((sum, item) => sum + item.cost, 0);

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

  const showKindColumn =
    lineKind === 'all' ||
    reportType === 'product' ||
    reportType === 'category' ||
    reportType === 'daily';

  const tableColumns = useMemo<ReportColumnTableCol<SalesData>[]>(() => {
    const cols: ReportColumnTableCol<SalesData>[] = [];
    if (showKindColumn) {
      cols.push({
        key: 'lineKind',
        header: tm('reportsDailyKindLabel'),
        size: 110,
        cell: (row) =>
          row.lineKind === 'service' ? tm('reportsDailyKindService') : tm('reportsDailyKindProduct'),
      });
    }
    cols.push(
      {
        key: 'productName',
        header: firstColLabel,
        size: 260,
        cell: (row) => (
          <div>
            <p className="text-sm font-medium text-gray-900">{row.productName}</p>
            {reportType === 'product' && row.productCode && row.productCode !== '—' ? (
              <p className="text-xs text-gray-500">{row.productCode}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'quantity',
        header: tm('reportsPlQty'),
        type: 'number',
        align: 'right',
        size: 100,
        footerSum: true,
        footerFormat: (n) => formatNumber(n, 2, false),
        cell: (row) => formatNumber(row.quantity, 2, false),
      },
      {
        key: 'revenue',
        header: tm('reportsPlRevenue'),
        type: 'number',
        align: 'right',
        size: 150,
        footerSum: true,
        footerFormat: (n) => `${formatNumber(n, 2, false)} ${reportCurrency}`,
        cell: (row) => `${formatNumber(row.revenue, 2, false)} ${reportCurrency}`,
      },
      {
        key: 'cost',
        header: tm('reportsPlCost'),
        type: 'number',
        align: 'right',
        size: 150,
        footerSum: true,
        footerFormat: (n) => `${formatNumber(n, 2, false)} ${reportCurrency}`,
        cell: (row) => `${formatNumber(row.cost, 2, false)} ${reportCurrency}`,
      },
      {
        key: 'profit',
        header: tm('reportsPlProfit'),
        type: 'number',
        align: 'right',
        size: 150,
        footerSum: true,
        footerFormat: (n) => `${formatNumber(n, 2, false)} ${reportCurrency}`,
        cell: (row) => (
          <span className={`font-medium ${row.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatNumber(row.profit, 2, false)} {reportCurrency}
          </span>
        ),
      },
      {
        key: 'profitMargin',
        header: tm('reportsPlMarginCol'),
        type: 'number',
        align: 'right',
        size: 110,
        footerSum: true,
        footerFormat: (_sum, rows) => {
          const rev = rows.reduce((s, r) => s + r.revenue, 0);
          const prof = rows.reduce((s, r) => s + r.profit, 0);
          const m = Math.abs(rev) > 0.009 ? (prof / rev) * 100 : 0;
          return `%${formatNumber(m, 2, false)}`;
        },
        cell: (row) => (
          <span
            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
              row.profitMargin >= 30
                ? 'bg-green-100 text-green-700'
                : row.profitMargin >= 20
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
            }`}
          >
            %{formatNumber(row.profitMargin, 2, false)}
          </span>
        ),
      },
    );
    return cols;
  }, [showKindColumn, firstColLabel, reportType, reportCurrency, tm]);

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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {tm('reportsDailyKindLabel')}
            </label>
            <div className="inline-flex w-full rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {([
                ['all', tm('reportsDailyKindAll')],
                ['service', tm('reportsDailyKindService')],
                ['product', tm('reportsDailyKindProduct')],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLineKind(key)}
                  className={`flex-1 px-3 py-2 ${lineKind === key ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500 leading-relaxed">
          {tm('reportsPlCostSourceNote')}
          {reportType === 'product' && lineKind !== 'service' ? (
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
              {lineKind === 'all' ? (
                <div className="mt-1 space-y-0.5">
                  <p className="text-xs text-gray-500">
                    {tm('reportsPlProductCost')}: {formatNumber(productCost, 2, false)} {reportCurrency}
                  </p>
                  <p className="text-xs text-gray-500">
                    {tm('reportsPlServiceCost')}: {formatNumber(serviceCost, 2, false)} {reportCurrency}
                  </p>
                </div>
              ) : null}
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
        <div className="p-2">
          {salesData.length === 0 && !loading ? (
            <div className="p-8 text-center text-gray-400">
              {tm('reportsPlNoData')}
            </div>
          ) : (
            <ReportColumnTable
              data={salesData}
              columns={tableColumns}
              height={560}
              footerLabel={tm('reportsTotalUpper')}
              onRowClick={(item) => {
                if (reportType !== 'product' || item.lineKind === 'service') return;
                if (!item.productCode && !item.productId) return;
                setMovementTarget({
                  productId: item.productId || undefined,
                  productCode: item.productCode,
                  productName: item.productName,
                  startDate: toSqlDateInputString(startDate) || undefined,
                  endDate: toSqlDateInputString(endDate) || undefined,
                });
              }}
            />
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
