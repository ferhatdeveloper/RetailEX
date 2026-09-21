import React, { useState, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import type { Sale } from '../../App';
import { formatNumber } from '../../utils/formatNumber';
import { isReturnSale } from '../../utils/posZReport';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { TooltipProps } from 'recharts';
import { useLanguage } from '../../contexts/LanguageContext';
import { ReportColumnTable } from './shared/ReportDataGrid';

interface SalesTrendReportProps {
  sales: Sale[];
}

export function SalesTrendReport({ sales }: SalesTrendReportProps) {
  const { tm } = useLanguage();
  const dateLocale = tm('localeCode');
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

  const legendRevenue = tm('rptTrendTurnoverIqd');
  const legendSalesCount = tm('rptSalesCount');

  const trendData = useMemo(() => {
    const today = new Date();
    const data: Array<{ date: string; sales: number; revenue: number; label: string }> = [];

    if (period === 'week') {
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const daySales = sales.filter((s) => {
          try {
            const saleDate = new Date(s.date).toISOString().split('T')[0];
            return saleDate === dateStr;
          } catch {
            return false;
          }
        });
        const positiveSales = daySales.filter((s) => !isReturnSale(s));
        data.push({
          date: dateStr,
          sales: positiveSales.length,
          revenue: positiveSales.reduce((sum, s) => sum + (s.total || 0), 0),
          label: date.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric' }),
        });
      }
    } else if (period === 'month') {
      const startDate = new Date(today);
      startDate.setDate(1);
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

      for (let i = 0; i < daysInMonth; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const daySales = sales.filter((s) => {
          try {
            const saleDate = new Date(s.date).toISOString().split('T')[0];
            return saleDate === dateStr;
          } catch {
            return false;
          }
        });
        const positiveSales = daySales.filter((s) => !isReturnSale(s));
        if (positiveSales.length > 0 || i % 3 === 0) {
          data.push({
            date: dateStr,
            sales: positiveSales.length,
            revenue: positiveSales.reduce((sum, s) => sum + s.total, 0),
            label: date.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }),
          });
        }
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const date = new Date(today);
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const monthSales = sales.filter((s) => {
          try {
            const saleDate = new Date(s.date);
            return saleDate >= monthStart && saleDate <= monthEnd;
          } catch {
            return false;
          }
        });
        const positiveSales = monthSales.filter((s) => !isReturnSale(s));
        data.push({
          date: monthStart.toISOString().split('T')[0],
          sales: positiveSales.length,
          revenue: positiveSales.reduce((sum, s) => sum + (s.total || 0), 0),
          label: date.toLocaleDateString(dateLocale, { month: 'short', year: 'numeric' }),
        });
      }
    }

    return data;
  }, [sales, period, dateLocale]);

  const totalRevenue = trendData.reduce((sum, d) => sum + d.revenue, 0);
  const avgDaily = trendData.length ? totalRevenue / trendData.length : 0;
  const maxDay = trendData.reduce(
    (max, d) => (d.revenue > max.revenue ? d : max),
    trendData[0] || { revenue: 0, label: '' }
  );

  const tooltipFormatter: TooltipProps<number, string>['formatter'] = (value, _name, item) => {
    const dataKey = item?.dataKey;
    if (String(dataKey) === 'revenue') {
      return `${formatNumber(Number(value), 2, false)} IQD`;
    }
    return value;
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-green-600" />
            <div>
              <h3 className="text-xl font-semibold">{tm('rptTrendTitle')}</h3>
              <p className="text-sm text-gray-600">{tm('rptTrendSubtitle')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPeriod('week')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                period === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tm('rptTrendWeekly')}
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                period === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tm('rptTrendMonthly')}
            </button>
            <button
              type="button"
              onClick={() => setPeriod('year')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                period === 'year' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tm('rptTrendYearly')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-gray-600">{tm('totalRevenueLabel')}</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatNumber(totalRevenue, 2, false)} IQD</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-gray-600">{tm('rptTrendAvgDaily')}</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{formatNumber(avgDaily, 2, false)} IQD</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-gray-600">{tm('rptTrendHighestDay')}</p>
            <p className="text-lg font-bold text-purple-600 mt-1">{maxDay.label}</p>
            <p className="text-sm text-gray-600">{formatNumber(maxDay.revenue, 2, false)} IQD</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h4 className="text-lg font-semibold mb-4">{tm('rptTrendChartTitle')}</h4>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
            <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
            <Tooltip
              formatter={tooltipFormatter}
            />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name={legendRevenue} />
            <Line yAxisId="right" type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2} name={legendSalesCount} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h4 className="text-lg font-semibold mb-3">{tm('rptTrendDailyDetails')}</h4>
        <ReportColumnTable
          data={trendData.map((day) => ({
            ...day,
            avgTicket: day.sales > 0 ? day.revenue / day.sales : 0,
          }))}
          height={400}
          footerLabel={tm('rprTotal') || 'Toplam'}
          storageNamespace="sales-trend-daily"
          columns={[
            { key: 'label', header: tm('rptTrendColDate'), size: 180 },
            {
              key: 'sales',
              header: legendSalesCount,
              type: 'number',
              align: 'right',
              footerSum: true,
              footerFormat: (n) => formatNumber(n, 0, false),
              cell: (row) => (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">{row.sales}</span>
              ),
            },
            {
              key: 'revenue',
              header: tm('totalRevenueLabel'),
              type: 'number',
              align: 'right',
              footerSum: true,
              footerFormat: (n) => `${formatNumber(n, 2, false)} IQD`,
              cell: (row) => (
                <span className="text-green-600 font-semibold">{formatNumber(row.revenue, 2, false)} IQD</span>
              ),
            },
            {
              key: 'avgTicket',
              header: tm('rptTrendColAvg'),
              type: 'number',
              align: 'right',
              cell: (row) => `${formatNumber(row.avgTicket, 2, false)} IQD`,
            },
          ]}
        />
      </div>
    </div>
  );
}
