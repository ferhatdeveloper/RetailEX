import React, { useState } from 'react';
import { TrendingUp, Calendar, Download } from 'lucide-react';
import type { Sale } from '../../App';
import { formatNumber } from '../../utils/formatNumber';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SalesTrendReportProps {
  sales: Sale[];
}

export function SalesTrendReport({ sales }: SalesTrendReportProps) {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

  // Tarih aralığına göre veri hazırla
  const getTrendData = () => {
    const today = new Date();
    const data: Array<{ date: string; sales: number; revenue: number; label: string }> = [];

    if (period === 'week') {
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const daySales = sales.filter(s => {
          try { const saleDate = new Date(s.date).toISOString().split('T')[0]; return saleDate === dateStr; } catch { return false; }
        });
        data.push({
          date: dateStr,
          sales: daySales.length,
          revenue: daySales.reduce((sum, s) => sum + (s.total || 0), 0),
          label: date.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })
        });
      }
    } else if (period === 'month') {
      const startDate = new Date(today);
      startDate.setDate(1); // Ayın başı
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

      for (let i = 0; i < daysInMonth; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const daySales = sales.filter(s => {
          try { const saleDate = new Date(s.date).toISOString().split('T')[0]; return saleDate === dateStr; } catch { return false; }
        });
        if (daySales.length > 0 || i % 3 === 0) { // Her 3 günde bir göster
          data.push({
            date: dateStr,
            sales: daySales.length,
            revenue: daySales.reduce((sum, s) => sum + s.total, 0),
            label: date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
          });
        }
      }
    } else {
      // Yıllık - aylık bazda
      for (let i = 11; i >= 0; i--) {
        const date = new Date(today);
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const monthSales = sales.filter(s => {
          try { const saleDate = new Date(s.date); return saleDate >= monthStart && saleDate <= monthEnd; } catch { return false; }
        });
        data.push({
          date: monthStart.toISOString().split('T')[0],
          sales: monthSales.length,
          revenue: monthSales.reduce((sum, s) => sum + (s.total || 0), 0),
          label: date.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })
        });
      }
    }

    return data;
  };

  const trendData = getTrendData();
  const totalRevenue = trendData.reduce((sum, d) => sum + d.revenue, 0);
  const avgDaily = totalRevenue / trendData.length;
  const maxDay = trendData.reduce((max, d) => d.revenue > max.revenue ? d : max, trendData[0] || { revenue: 0, label: '' });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-green-600" />
            <div>
              <h3 className="text-xl font-semibold">Satış Trend Analizi</h3>
              <p className="text-sm text-gray-600">Zaman içinde satış performansı ve trend analizi</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPeriod('week')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                period === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Haftalık
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                period === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Aylık
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                period === 'year' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Yıllık
            </button>
          </div>
        </div>

        {/* Özet */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-gray-600">Toplam Ciro</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatNumber(totalRevenue, 2, false)} IQD</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-gray-600">Ortalama Günlük</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{formatNumber(avgDaily, 2, false)} IQD</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-gray-600">En Yüksek Gün</p>
            <p className="text-lg font-bold text-purple-600 mt-1">{maxDay.label}</p>
            <p className="text-sm text-gray-600">{formatNumber(maxDay.revenue, 2, false)} IQD</p>
          </div>
        </div>
      </div>

      {/* Trend Grafiği */}
      <div className="bg-white rounded-lg border p-4">
        <h4 className="text-lg font-semibold mb-4">Satış Trend Grafiği</h4>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
            <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
            <Tooltip formatter={(value: number, name: string) => {
              if (name === 'Ciro') return formatNumber(value, 2, false) + ' IQD';
              return value;
            }} />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name="Ciro (IQD)" />
            <Line yAxisId="right" type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2} name="Satış Sayısı" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Detaylı Tablo */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-lg font-semibold">Günlük Detaylar</h4>
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[400px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-sm">Tarih</th>
                <th className="px-4 py-3 text-right text-sm">Satış Sayısı</th>
                <th className="px-4 py-3 text-right text-sm">Ciro</th>
                <th className="px-4 py-3 text-right text-sm">Ortalama</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {trendData.map((day, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{day.label}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                      {day.sales}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">
                    {formatNumber(day.revenue, 2, false)} IQD
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {day.sales > 0 ? formatNumber(day.revenue / day.sales, 2, false) : '0'} IQD
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



