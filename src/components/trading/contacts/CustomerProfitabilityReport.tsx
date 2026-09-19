/**
 * RetailEX — Müşteri Karlılık Raporu
 *
 * Gerçek satış + SMM (getCustomerCostProfitAnalysis = ürün sekmesi ile aynı zincir).
 * Brüt kâr = satış − maliyet; FIFO dönem SMM müşteri payına orantılı.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, Users, Banknote, ShoppingCart, Download, Search } from 'lucide-react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  getCustomerCostProfitAnalysis,
  type CustomerCostProfitRow,
} from '../../../services/layeredInventoryCost';
import { toSqlDateInputString, localTodayDateKey } from '../../../utils/localCalendarDate';
import {
  ReportDataGrid,
  REPORT_GRID_DEFAULTS,
  buildReportGridColumns,
} from '../../reports/shared/ReportDataGrid';
import { toast } from 'sonner';

function defaultMonthRange(): { start: string; end: string } {
  const end = localTodayDateKey();
  const d = new Date();
  d.setDate(1);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, end };
}

export function CustomerProfitabilityReport() {
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
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CustomerCostProfitRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'profit' | 'revenue' | 'transactions'>('profit');

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
      const rows = await getCustomerCostProfitAnalysis({
        startDate: start,
        endDate: end,
        firmNr: firm.firm_nr,
        periodNr: period?.nr,
      });
      setData(rows);
    } catch (error) {
      console.error('[CustomerProfitabilityReport] Error:', error);
      toast.error(tm('rptProfitLoadError'));
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [firm, period?.nr, startDate, endDate, tm]);

  useEffect(() => {
    if (firm) void loadData();
  }, [firm, loadData]);

  const formatMoney = (amount: number) => {
    return amount.toLocaleString('en-IQ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    let rows = data.filter((c) => {
      if (!q) return true;
      return (
        c.customerId.toLocaleLowerCase('tr-TR').includes(q) ||
        c.customerCode.toLocaleLowerCase('tr-TR').includes(q) ||
        c.customerName.toLocaleLowerCase('tr-TR').includes(q)
      );
    });
    rows = [...rows].sort((a, b) => {
      if (sortBy === 'profit') return b.grossProfit - a.grossProfit;
      if (sortBy === 'revenue') return b.totalRevenue - a.totalRevenue;
      if (sortBy === 'transactions') return b.transactionCount - a.transactionCount;
      return 0;
    });
    return rows;
  }, [data, searchQuery, sortBy]);

  const summary = useMemo(() => {
    const totalCustomers = filteredData.length;
    const totalTransactions = filteredData.reduce((sum, c) => sum + c.transactionCount, 0);
    const totalRevenue = filteredData.reduce((sum, c) => sum + c.totalRevenue, 0);
    const totalCost = filteredData.reduce((sum, c) => sum + c.totalCost, 0);
    const totalProfit = filteredData.reduce((sum, c) => sum + c.grossProfit, 0);
    return {
      totalCustomers,
      totalTransactions,
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      avgTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
    };
  }, [filteredData]);

  const currency = firm?.ana_para_birimi || 'IQD';

  const columns = useMemo(
    () =>
      buildReportGridColumns<CustomerCostProfitRow>([
        {
          id: 'customerCode',
          header: tm('rptProfitColCustomerCode'),
          accessor: (r) => r.customerCode || r.customerId,
          size: 120,
        },
        {
          id: 'customerName',
          header: tm('rptProfitColCustomerName'),
          accessor: (r) => r.customerName,
          size: 220,
        },
        {
          id: 'transactionCount',
          header: tm('rptProfitTxnCount'),
          accessor: (r) => r.transactionCount,
          filterKind: 'number',
          align: 'right',
          size: 100,
        },
        {
          id: 'avgTransactionValue',
          header: tm('rptProfitAvgTxnValue'),
          accessor: (r) => r.avgTransactionValue,
          cell: (r) => `${formatMoney(r.avgTransactionValue)} ${currency}`,
          filterKind: 'number',
          align: 'right',
          size: 140,
        },
        {
          id: 'totalRevenue',
          header: tm('rptProfitColSalesAmount'),
          accessor: (r) => r.totalRevenue,
          cell: (r) => (
            <span className="font-semibold text-blue-700">
              {formatMoney(r.totalRevenue)} {currency}
            </span>
          ),
          filterKind: 'number',
          align: 'right',
          size: 140,
        },
        {
          id: 'totalCost',
          header: tm('rptProfitColCost'),
          accessor: (r) => r.totalCost,
          cell: (r) => (
            <span className="font-semibold text-orange-700">
              {formatMoney(r.totalCost)} {currency}
            </span>
          ),
          filterKind: 'number',
          align: 'right',
          size: 140,
        },
        {
          id: 'grossProfit',
          header: tm('rptProfitColGrossProfit'),
          accessor: (r) => r.grossProfit,
          cell: (r) => {
            const ok = r.grossProfit >= 0;
            return (
              <span className={`inline-flex items-center justify-end gap-1 font-bold ${ok ? 'text-green-700' : 'text-red-700'}`}>
                {ok ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {r.grossProfit < 0 ? '-' : ''}
                {formatMoney(Math.abs(r.grossProfit))} {currency}
              </span>
            );
          },
          filterKind: 'number',
          align: 'right',
          size: 150,
        },
        {
          id: 'profitMargin',
          header: tm('rptProfitColMarginPct'),
          accessor: (r) => r.profitMargin,
          cell: (r) => (
            <span className={`font-bold ${r.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {r.profitMargin.toFixed(2)}%
            </span>
          ),
          filterKind: 'number',
          align: 'right',
          size: 90,
        },
      ]),
    [tm, currency],
  );

  const exportToExcel = () => {
    let csv =
      'Müşteri Kodu,Müşteri Adı,İşlem Sayısı,Satış Tutarı,Maliyet,Brüt Kar,Kar Marjı %,Ort. İşlem Değeri\n';
    filteredData.forEach((c) => {
      csv += `${c.customerCode || c.customerId},${c.customerName},${c.transactionCount},${c.totalRevenue},${c.totalCost},${c.grossProfit},${c.profitMargin.toFixed(2)},${c.avgTransactionValue}\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-profitability-${period?.donem_adi ?? period?.name ?? 'donem'}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success(tm('rptProfitExportOk'));
  };

  if (!firm || !period) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-yellow-800">
          <Users className="w-5 h-5" />
          <span>{tm('rptProfitSelectFirmPeriod')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-purple-600" />
            <div>
              <h2 className="text-xl font-semibold">{tm('rptProfitCustomerTitle')}</h2>
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
              placeholder={tm('rptProfitCustomerSearch')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'profit' | 'revenue' | 'transactions')}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="profit">{tm('rptProfitSortByProfit')}</option>
            <option value="revenue">{tm('rptProfitSortByRevenue')}</option>
            <option value="transactions">{tm('rptProfitSortByTransactions')}</option>
          </select>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          {tm('rptProfitCustomerCogsNote') ||
            'Brüt kâr = satış − SMM. Malzeme SMM: FIFO katman (müşteri payına orantılı). Hizmet: kart/reçete maliyeti.'}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-purple-600" />
            <div className="text-sm text-purple-700">{tm('rptProfitCustomerCount')}</div>
          </div>
          <div className="text-2xl font-bold text-purple-900">{summary.totalCustomers}</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            <div className="text-sm text-blue-700">{tm('rptProfitTxnCount')}</div>
          </div>
          <div className="text-2xl font-bold text-blue-900">{summary.totalTransactions}</div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-green-600" />
            <div className="text-sm text-green-700">{tm('rptProfitTotalSales')}</div>
          </div>
          <div className="text-xl font-bold text-green-900">
            {formatMoney(summary.totalRevenue)} {currency}
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
            className={`text-xl font-bold ${
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

        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-2 border-cyan-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-cyan-600" />
            <div className="text-sm text-cyan-700">{tm('rptProfitAvgTxnValue')}</div>
          </div>
          <div className="text-xl font-bold text-cyan-900">
            {formatMoney(summary.avgTransactionValue)} {currency}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <div className="mt-2 text-gray-600">{tm('rptProfitLoading')}</div>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{tm('rptProfitNoData')}</div>
        ) : (
          <div className="h-[560px]">
            <ReportDataGrid
              data={filteredData}
              columns={columns}
              {...REPORT_GRID_DEFAULTS}
              height="100%"
              excelFileName={`customer-profitability-${period.donem_adi ?? period.name ?? 'donem'}`}
              footerLabel={tm('rptPeriodTotalRow')}
              footerSumColumns={[
                {
                  columnId: 'transactionCount',
                  getValue: (r) => Number(r.transactionCount) || 0,
                },
                {
                  columnId: 'totalRevenue',
                  getValue: (r) => Number(r.totalRevenue) || 0,
                  format: (sum) => (
                    <span className="text-blue-700 font-bold">
                      {formatMoney(sum)} {currency}
                    </span>
                  ),
                },
                {
                  columnId: 'totalCost',
                  getValue: (r) => Number(r.totalCost) || 0,
                  format: (sum) => (
                    <span className="text-orange-700 font-bold">
                      {formatMoney(sum)} {currency}
                    </span>
                  ),
                },
                {
                  columnId: 'grossProfit',
                  getValue: (r) => Number(r.grossProfit) || 0,
                  format: (sum) => (
                    <span className={`font-bold ${sum >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {sum < 0 ? '-' : ''}
                      {formatMoney(Math.abs(sum))} {currency}
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
