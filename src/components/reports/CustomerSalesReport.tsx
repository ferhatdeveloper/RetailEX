import React, { useState } from 'react';
import { Users, TrendingUp, Banknote, Calendar } from 'lucide-react';
import type { Sale, Customer } from '../../App';
import { formatNumber } from '../../utils/formatNumber';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface CustomerSalesReportProps {
  sales: Sale[];
  customers: Customer[];
}

export function CustomerSalesReport({ sales, customers }: CustomerSalesReportProps) {
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // Müşteri bazlı satış analizi
  const getCustomerSales = () => {
    const customerMap = new Map<string, {
      customer: Customer | null;
      salesCount: number;
      totalRevenue: number;
      avgSale: number;
      lastSaleDate: string;
    }>();

    sales.forEach(sale => {
      const customerId = sale.customerId || sale.customerName || 'unknown';
      const customer = customers?.find(c => c.id === customerId) || null;
      const customerName = sale.customerName || customer?.name || 'Bilinmeyen Müşteri';
      const existing = customerMap.get(customerId);

      if (existing) {
        existing.salesCount += 1;
        existing.totalRevenue += sale.total;
        existing.avgSale = existing.totalRevenue / existing.salesCount;
        const saleDate = new Date(sale.date).toISOString().split('T')[0];
        if (saleDate > existing.lastSaleDate) {
          existing.lastSaleDate = saleDate;
        }
      } else {
        customerMap.set(customerId, {
          customer: customer || { id: customerId, name: customerName } as Customer,
          salesCount: 1,
          totalRevenue: sale.total,
          avgSale: sale.total,
          lastSaleDate: new Date(sale.date).toISOString().split('T')[0]
        });
      }
    });

    return Array.from(customerMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 20);
  };

  const customerSales = getCustomerSales();
  const totalCustomers = new Set(sales.map(s => s.customerId)).size;
  const totalRevenue = customerSales.reduce((sum, c) => sum + c.totalRevenue, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="text-xl font-semibold">Müşteri Satış Analizi</h3>
              <p className="text-sm text-gray-600">Müşteri bazlı satış performansı ve analizi</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Özet Kartlar */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-gray-600">Toplam Müşteri</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{totalCustomers}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-gray-600">Toplam Ciro</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatNumber(totalRevenue, 2, false)} IQD</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-gray-600">Ortalama Satış</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">
              {totalCustomers > 0 ? formatNumber(totalRevenue / totalCustomers, 2, false) : '0'} IQD
            </p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <p className="text-sm text-gray-600">Aktif Müşteri</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">{customerSales.length}</p>
          </div>
        </div>
      </div>

      {/* Grafik */}
      <div className="bg-white rounded-lg border p-4">
        <h4 className="text-lg font-semibold mb-4">En Çok Satış Yapan Müşteriler (TOP 10)</h4>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={customerSales.slice(0, 10)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="customer.name" 
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis />
            <Tooltip formatter={(value: number) => formatNumber(value, 2, false) + ' IQD'} />
            <Legend />
            <Bar dataKey="totalRevenue" fill="#3b82f6" name="Toplam Ciro" />
            <Bar dataKey="salesCount" fill="#10b981" name="Satış Sayısı" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detaylı Liste */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-lg font-semibold">Müşteri Satış Detayları</h4>
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-sm">Müşteri</th>
                <th className="px-4 py-3 text-right text-sm">Satış Sayısı</th>
                <th className="px-4 py-3 text-right text-sm">Toplam Ciro</th>
                <th className="px-4 py-3 text-right text-sm">Ortalama Satış</th>
                <th className="px-4 py-3 text-left text-sm">Son Satış</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customerSales.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white text-sm">
                        {(item.customer?.name || 'Bilinmeyen').charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{item.customer?.name || 'Bilinmeyen Müşteri'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                      {item.salesCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">
                    {formatNumber(item.totalRevenue, 2, false)} IQD
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {formatNumber(item.avgSale, 2, false)} IQD
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(item.lastSaleDate).toLocaleDateString('tr-TR')}
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


