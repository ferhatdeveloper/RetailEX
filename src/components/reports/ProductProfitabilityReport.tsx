/**
 * ExRetailOS - Product Profitability Report
 *
 * Ürün / hizmet bazlı karlılık analizi — gerçek satış + SMM
 * (CostReport ile aynı getCostProfitAnalysis zinciri).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, Package, Banknote, Download, Search } from 'lucide-react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getCostProfitAnalysis } from '../../services/layeredInventoryCost';
import { displayItemCode } from '../../utils/lastPurchaseCostSql';
import { toSqlDateInputString, localTodayDateKey } from '../../utils/localCalendarDate';
import { toast } from 'sonner';
import { ReportColumnTable } from './shared/ReportDataGrid';

interface ProductProfitData {
  productCode: string;
  productName: string;
  lineKind: 'product' | 'service';
  totalQuantitySold: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
  avgUnitPrice: number;
  avgUnitCost: number;
}

function defaultMonthRange(): { start: string; end: string } {
  const end = localTodayDateKey();
  const d = new Date();
  d.setDate(1);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, end };
}

export function ProductProfitabilityReport() {
  const { tm } = useLanguage();
  const { selectedFirma, selectedDonem, selectedFirm, selectedPeriod } = useFirmaDonem();
  const firm = selectedFirm || selectedFirma;
  const period = selectedPeriod || selectedDonem;

  const initialRange = useMemo(() => {
    const fromPeriodStart = toSqlDateInputString(period?.beg_date || '');
    const fromPeriodEnd = toSqlDateInputString(period?.end_date || '');
    if (fromPeriodStart && fromPeriodEnd) {
      return { start: fromPeriodStart, end: fromPeriodEnd };
    }
    return defaultMonthRange();
  }, [period?.beg_date, period?.end_date]);

  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [lineKindFilter, setLineKindFilter] = useState<'all' | 'product' | 'service'>('all');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProductProfitData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'profit' | 'revenue' | 'margin'>('profit');
  const [filterProfitable, setFilterProfitable] = useState<'all' | 'profitable' | 'loss'>('all');

  useEffect(() => {
    setStartDate(initialRange.start);
    setEndDate(initialRange.end);
  }, [initialRange.start, initialRange.end]);

  const loadData = useCallback(async () => {
    if (!firm) return;

    setLoading(true);
    try {
      const start = toSqlDateInputString(startDate) || startDate;
      const end = toSqlDateInputString(endDate) || endDate;
      const rows = await getCostProfitAnalysis({
        startDate: start,
        endDate: end,
        firmNr: firm.firm_nr,
        periodNr: period?.nr,
      });

      const results: ProductProfitData[] = rows.map((r) => {
        const qty = Number(r.quantity) || 0;
        const revenue = Number(r.revenue) || 0;
        const cost = Number(r.cogs) || 0;
        const grossProfit = Number(r.profit) || revenue - cost;
        const qtyAbs = Math.abs(qty);
        return {
          productCode: displayItemCode(r.productCode),
          productName: r.productName || '',
          lineKind: r.lineKind === 'service' ? 'service' : 'product',
          totalQuantitySold: qty,
          totalRevenue: revenue,
          totalCost: cost,
          grossProfit,
          profitMargin: Number(r.marginPercent) || (revenue > 0 ? (grossProfit / revenue) * 100 : 0),
          avgUnitPrice: qtyAbs > 0 ? revenue / qtyAbs : 0,
          avgUnitCost: qtyAbs > 0 ? cost / qtyAbs : 0,
        };
      });

      setData(results);
    } catch (error) {
      console.error('[ProductProfitabilityReport] Error:', error);
      toast.error(tm('rptProfitLoadError'));
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [firm, period?.nr, startDate, endDate, tm]);

  useEffect(() => {
    if (firm) {
      void loadData();
    }
  }, [firm, loadData]);

  const formatMoney = (amount: number) => {
    return amount.toLocaleString('en-IQ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  let filteredData = data.filter((p) => {
    const matchesKind =
      lineKindFilter === 'all' ||
      (lineKindFilter === 'product' && p.lineKind === 'product') ||
      (lineKindFilter === 'service' && p.lineKind === 'service');
    const matchesSearch =
      !searchQuery ||
      p.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.productName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filterProfitable === 'all' ||
      (filterProfitable === 'profitable' && p.grossProfit > 0) ||
      (filterProfitable === 'loss' && p.grossProfit < 0);
    return matchesKind && matchesSearch && matchesFilter;
  });

  filteredData.sort((a, b) => {
    if (sortBy === 'profit') return b.grossProfit - a.grossProfit;
    if (sortBy === 'revenue') return b.totalRevenue - a.totalRevenue;
    if (sortBy === 'margin') return b.profitMargin - a.profitMargin;
    return 0;
  });

  const totalRevenueSum = filteredData.reduce((sum, p) => sum + p.totalRevenue, 0);
  const totalCostSum = filteredData.reduce((sum, p) => sum + p.totalCost, 0);
  const totalProfitSum = filteredData.reduce((sum, p) => sum + p.grossProfit, 0);
  const summary = {
    totalProducts: filteredData.length,
    totalRevenue: totalRevenueSum,
    totalCost: totalCostSum,
    totalProfit: totalProfitSum,
    profitableProducts: filteredData.filter((p) => p.grossProfit > 0).length,
    lossProducts: filteredData.filter((p) => p.grossProfit < 0).length,
    profitMargin: totalRevenueSum > 0 ? (totalProfitSum / totalRevenueSum) * 100 : 0,
  };

  const exportToExcel = () => {
    let csv =
      'Tür,Ürün Kodu,Ürün Adı,Miktar,Satış Tutarı (KDV Hariç IQD),Maliyet (KDV Hariç IQD),Brüt Kar (KDV Hariç IQD),Kar Marjı %\n';
    filteredData.forEach((p) => {
      const kind =
        p.lineKind === 'service'
          ? tm('reportsDailyKindService')
          : tm('reportsDailyKindProduct');
      csv += `${kind},${displayItemCode(p.productCode)},${p.productName},${p.totalQuantitySold},${p.totalRevenue},${p.totalCost},${p.grossProfit},${p.profitMargin.toFixed(2)}\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-profitability-${period?.donem_adi ?? period?.name ?? 'donem'}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success(tm('rptProfitExportOk'));
  };

  if (!firm || !period) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-yellow-800">
          <Package className="w-5 h-5" />
          <span>{tm('rptProfitSelectFirmPeriod')}</span>
        </div>
      </div>
    );
  }

  const currency = firm.ana_para_birimi || 'IQD';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold">{tm('rptProfitProductTitle')}</h2>
              <div className="text-sm text-gray-600">
                {firm.firma_adi} / {period.donem_adi ?? period.name}
              </div>
            </div>
          </div>

          <button
            onClick={exportToExcel}
            disabled={filteredData.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {tm('rptProfitExportExcel')}
          </button>
        </div>

        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
              {tm('rptProfitDateFrom')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(toSqlDateInputString(e.target.value) || e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
              {tm('rptProfitDateTo')}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(toSqlDateInputString(e.target.value) || e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="flex-1 min-w-[12rem] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={tm('rptProfitSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>

          <select
            value={lineKindFilter}
            onChange={(e) => setLineKindFilter(e.target.value as 'all' | 'product' | 'service')}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="all">{tm('reportsDailyKindAll')}</option>
            <option value="product">{tm('reportsDailyKindProduct')}</option>
            <option value="service">{tm('reportsDailyKindService')}</option>
          </select>

          <select
            value={filterProfitable}
            onChange={(e) => setFilterProfitable(e.target.value as 'all' | 'profitable' | 'loss')}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="all">{tm('rptProfitFilterAll')}</option>
            <option value="profitable">{tm('rptProfitFilterProfitable')}</option>
            <option value="loss">{tm('rptProfitFilterLoss')}</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'profit' | 'revenue' | 'margin')}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="profit">{tm('rptProfitSortByProfit')}</option>
            <option value="revenue">{tm('rptProfitSortByRevenue')}</option>
            <option value="margin">{tm('rptProfitSortByMargin')}</option>
          </select>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          {tm('costProfitCogsMixedNote') ||
            'Malzeme SMM: FIFO katman. Hizmet SMM: kart cost_price / alış / reçete. Kâr = satış − SMM.'}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-blue-600" />
            <div className="text-sm text-blue-700">{tm('rptProfitTotalProducts')}</div>
          </div>
          <div className="text-2xl font-bold text-blue-900">{summary.totalProducts}</div>
          <div className="text-xs text-blue-600 mt-1">
            {tm('rptProfitProfitableLossCount')
              .replace('{profitable}', String(summary.profitableProducts))
              .replace('{loss}', String(summary.lossProducts))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-green-600" />
            <div className="text-sm text-green-700">{tm('rptProfitTotalSales')}</div>
          </div>
          <div className="text-2xl font-bold text-green-900">
            {formatMoney(summary.totalRevenue)} {currency}
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-orange-600" />
            <div className="text-sm text-orange-700">{tm('rptProfitTotalCost')}</div>
          </div>
          <div className="text-2xl font-bold text-orange-900">
            {formatMoney(summary.totalCost)} {currency}
          </div>
        </div>

        <div
          className={`bg-gradient-to-br rounded-lg p-4 border-2 ${
            summary.totalProfit >= 0
              ? 'from-emerald-50 to-emerald-100 border-emerald-200'
              : 'from-red-50 to-red-100 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {summary.totalProfit >= 0 ? (
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-600" />
            )}
            <div
              className={`text-sm ${
                summary.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {tm('rptProfitTotalProfit')}
            </div>
          </div>
          <div
            className={`text-2xl font-bold ${
              summary.totalProfit >= 0 ? 'text-emerald-900' : 'text-red-900'
            }`}
          >
            {summary.totalProfit < 0 ? '-' : ''}
            {formatMoney(Math.abs(summary.totalProfit))} {currency}
          </div>
          <div
            className={`text-xs mt-1 ${
              summary.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {tm('rptProfitMarginValue').replace('{n}', summary.profitMargin.toFixed(2))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <div className="mt-2 text-gray-600">{tm('rptProfitLoading')}</div>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{tm('rptProfitNoData')}</div>
        ) : (
          <div className="p-2">
            <ReportColumnTable
              data={filteredData}
              height={600}
              footerLabel={tm('rptPeriodTotalRow')}
              storageNamespace="product-profitability"
              columns={[
                {
                  key: 'lineKind',
                  header: tm('reportsDailyKindLabel'),
                  size: 100,
                  cell: (product) =>
                    product.lineKind === 'service'
                      ? tm('reportsDailyKindService')
                      : tm('reportsDailyKindProduct'),
                },
                {
                  key: 'productCode',
                  header: tm('rptProfitColProductCode'),
                  size: 120,
                  cell: (product) => (
                    <span className="font-mono text-blue-600">{displayItemCode(product.productCode)}</span>
                  ),
                },
                { key: 'productName', header: tm('rptProfitColProductName'), size: 200 },
                {
                  key: 'totalQuantitySold',
                  header: tm('rptProfitColQty'),
                  type: 'number',
                  align: 'right',
                  cell: (product) => product.totalQuantitySold.toFixed(2),
                },
                {
                  key: 'avgUnitPrice',
                  header: tm('rptProfitColAvgPrice'),
                  type: 'number',
                  align: 'right',
                  cell: (product) => `${formatMoney(product.avgUnitPrice)} ${currency}`,
                },
                {
                  key: 'totalRevenue',
                  header: tm('rptProfitColSalesAmount'),
                  type: 'number',
                  align: 'right',
                  footerSum: true,
                  footerFormat: (n) => (
                    <span className="text-blue-700 font-bold">
                      {formatMoney(n)} {currency}
                    </span>
                  ),
                  cell: (product) => (
                    <span className="font-semibold text-blue-700">
                      {formatMoney(product.totalRevenue)} {currency}
                    </span>
                  ),
                },
                {
                  key: 'totalCost',
                  header: tm('rptProfitColCost'),
                  type: 'number',
                  align: 'right',
                  footerSum: true,
                  footerFormat: (n) => (
                    <span className="text-orange-700 font-bold">
                      {formatMoney(n)} {currency}
                    </span>
                  ),
                  cell: (product) => (
                    <span className="font-semibold text-orange-700">
                      {formatMoney(product.totalCost)} {currency}
                    </span>
                  ),
                },
                {
                  key: 'grossProfit',
                  header: tm('rptProfitColGrossProfit'),
                  type: 'number',
                  align: 'right',
                  footerSum: true,
                  footerFormat: (n) => (
                    <span className={n >= 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                      {n < 0 ? '-' : ''}
                      {formatMoney(Math.abs(n))} {currency}
                    </span>
                  ),
                  cell: (product) => {
                    const isProfitable = product.grossProfit >= 0;
                    return (
                      <div
                        className={`flex items-center justify-end gap-1 font-bold ${
                          isProfitable ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {isProfitable ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {product.grossProfit < 0 ? '-' : ''}
                        {formatMoney(Math.abs(product.grossProfit))} {currency}
                      </div>
                    );
                  },
                },
                {
                  key: 'profitMargin',
                  header: tm('rptProfitColMarginPct'),
                  type: 'number',
                  align: 'right',
                  footerSum: true,
                  footerFormat: () => (
                    <span className={summary.totalProfit >= 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                      {summary.profitMargin.toFixed(2)}%
                    </span>
                  ),
                  cell: (product) => (
                    <span
                      className={`font-bold ${product.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}
                    >
                      {product.profitMargin.toFixed(2)}%
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
