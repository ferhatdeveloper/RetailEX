import React, { useState, useMemo } from 'react';
import { Target, CheckCircle, XCircle } from 'lucide-react';
import type { Sale } from '../../App';
import { formatNumber } from '../../utils/formatNumber';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { useLanguage } from '../../contexts/LanguageContext';

interface SalesTargetReportProps {
  sales: Sale[];
}

export function SalesTargetReport({ sales }: SalesTargetReportProps) {
  const { tm } = useLanguage();
  const dateLocale = tm('localeCode');
  const [targetAmount, setTargetAmount] = useState(100000);

  const monthlyData = useMemo(() => {
    const today = new Date();
    const months: Array<{
      month: string;
      target: number;
      actual: number;
      difference: number;
      percentage: number;
      status: 'success' | 'warning' | 'danger';
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(today);
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const monthSales = sales.filter((s) => {
        const saleDate = new Date(s.date);
        return saleDate >= monthStart && saleDate <= monthEnd;
      });

      const actual = monthSales.reduce((sum, s) => sum + s.total, 0);
      const target = targetAmount;
      const difference = actual - target;
      const percentage = target > 0 ? (actual / target) * 100 : 0;

      let status: 'success' | 'warning' | 'danger' = 'success';
      if (percentage < 80) status = 'danger';
      else if (percentage < 100) status = 'warning';

      months.push({
        month: date.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' }),
        target,
        actual,
        difference,
        percentage,
        status,
      });
    }

    return months;
  }, [sales, targetAmount, dateLocale]);

  const currentMonth = monthlyData[monthlyData.length - 1];
  const avgAchievement = monthlyData.length
    ? monthlyData.reduce((sum, m) => sum + m.percentage, 0) / monthlyData.length
    : 0;

  const COLORS = {
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
  };

  const legendTarget = tm('rptTargetLegendTarget');
  const legendActual = tm('rptTargetLegendActual');

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-orange-600" />
            <div>
              <h3 className="text-xl font-semibold">{tm('rptTargetTitle')}</h3>
              <p className="text-sm text-gray-600">{tm('rptTargetSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">{tm('rptTargetMonthlyInput')}</label>
            <input
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm w-32"
            />
            <span className="text-sm text-gray-600">IQD</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-gray-600">{tm('rptTargetThisMonthTarget')}</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{formatNumber(currentMonth?.target || 0, 2, false)} IQD</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-gray-600">{tm('rptTargetThisMonthActual')}</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatNumber(currentMonth?.actual || 0, 2, false)} IQD</p>
          </div>
          <div
            className={`rounded-lg p-4 border ${
              (currentMonth?.percentage || 0) >= 100
                ? 'bg-green-50 border-green-200'
                : (currentMonth?.percentage || 0) >= 80
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-red-50 border-red-200'
            }`}
          >
            <p className="text-sm text-gray-600">{tm('rptTargetAchievementRate')}</p>
            <p
              className={`text-2xl font-bold mt-1 ${
                (currentMonth?.percentage || 0) >= 100
                  ? 'text-green-600'
                  : (currentMonth?.percentage || 0) >= 80
                    ? 'text-orange-600'
                    : 'text-red-600'
              }`}
            >
              {currentMonth?.percentage.toFixed(1) || '0'}%
            </p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-gray-600">{tm('rptTargetAvgSuccess')}</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{avgAchievement.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h4 className="text-lg font-semibold mb-4">{tm('rptTargetChartTitle')}</h4>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip formatter={(value: number) => formatNumber(value, 2, false) + ' IQD'} />
            <Legend />
            <Bar dataKey="target" fill="#cbd5e1" name={legendTarget} />
            <Bar dataKey="actual" name={legendActual}>
              {monthlyData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.status]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-lg font-semibold">{tm('rptTargetMonthlyDetails')}</h4>
        </div>
        <div
          className="overflow-x-auto overflow-y-auto max-h-[500px]"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}
        >
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-sm">{tm('rptTargetColMonth')}</th>
                <th className="px-4 py-3 text-right text-sm">{tm('rptTargetColTarget')}</th>
                <th className="px-4 py-3 text-right text-sm">{tm('rptTargetColActual')}</th>
                <th className="px-4 py-3 text-right text-sm">{tm('rptTargetColDiff')}</th>
                <th className="px-4 py-3 text-right text-sm">{tm('rptTargetColAchievement')}</th>
                <th className="px-4 py-3 text-center text-sm">{tm('rptTargetColStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {monthlyData.map((month, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{month.month}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatNumber(month.target, 2, false)} IQD</td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">
                    {formatNumber(month.actual, 2, false)} IQD
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      month.difference >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {month.difference >= 0 ? '+' : ''}
                    {formatNumber(month.difference, 2, false)} IQD
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`px-2 py-1 rounded text-sm font-semibold ${
                        month.percentage >= 100
                          ? 'bg-green-100 text-green-700'
                          : month.percentage >= 80
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {month.percentage.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {month.percentage >= 100 ? (
                      <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
