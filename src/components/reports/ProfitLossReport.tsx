import React, { useState } from 'react';
import { TrendingUp, DollarSign, Package, ShoppingCart, Calendar, Filter } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';

interface SalesData {
  productCode: string;
  productName: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
}

export function ProfitLossReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportType, setReportType] = useState<'product' | 'category' | 'daily' | 'monthly'>('product');

  // Demo data
  const salesData: SalesData[] = [
    {
      productCode: 'PRD-001',
      productName: 'Laptop HP EliteBook',
      quantity: 15,
      revenue: 300000,
      cost: 225000,
      profit: 75000,
      profitMargin: 25
    },
    {
      productCode: 'PRD-002',
      productName: 'Mouse Logitech MX',
      quantity: 45,
      revenue: 54000,
      cost: 36000,
      profit: 18000,
      profitMargin: 33.33
    },
    {
      productCode: 'PRD-003',
      productName: 'Klavye Mechanical RGB',
      quantity: 30,
      revenue: 90000,
      cost: 60000,
      profit: 30000,
      profitMargin: 33.33
    },
    {
      productCode: 'PRD-004',
      productName: 'Monitor Dell 27"',
      quantity: 12,
      revenue: 168000,
      cost: 120000,
      profit: 48000,
      profitMargin: 28.57
    },
    {
      productCode: 'PRD-005',
      productName: 'Kulaklık Sony WH-1000XM4',
      quantity: 20,
      revenue: 60000,
      cost: 40000,
      profit: 20000,
      profitMargin: 33.33
    },
  ];

  const totalRevenue = salesData.reduce((sum, item) => sum + item.revenue, 0);
  const totalCost = salesData.reduce((sum, item) => sum + item.cost, 0);
  const totalProfit = salesData.reduce((sum, item) => sum + item.profit, 0);
  const averageMargin = (totalProfit / totalRevenue) * 100;

  // Sabit giderler
  const expenses = {
    rent: 50000,
    salaries: 120000,
    utilities: 15000,
    marketing: 25000,
    other: 10000
  };

  const totalExpenses = Object.values(expenses).reduce((sum, exp) => sum + exp, 0);
  const netProfit = totalProfit - totalExpenses;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Bitiş Tarihi
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-1" />
              Rapor Türü
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="product">Ürün Bazlı</option>
              <option value="category">Kategori Bazlı</option>
              <option value="daily">Günlük</option>
              <option value="monthly">Aylık</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Gelir</p>
              <p className="text-2xl font-bold text-blue-600">{formatNumber(totalRevenue, 2, false)} IQD</p>
            </div>
            <div className="bg-blue-100 rounded-full p-3">
              <ShoppingCart className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Maliyet</p>
              <p className="text-2xl font-bold text-orange-600">{formatNumber(totalCost, 2, false)} IQD</p>
            </div>
            <div className="bg-orange-100 rounded-full p-3">
              <Package className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border-2 border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Brüt Kar</p>
              <p className="text-2xl font-bold text-green-600">{formatNumber(totalProfit, 2, false)} IQD</p>
              <p className="text-xs text-gray-500 mt-1">Marj: %{formatNumber(averageMargin, 2, false)}</p>
            </div>
            <div className="bg-green-100 rounded-full p-3">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border-2 border-emerald-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Net Kar</p>
              <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatNumber(netProfit, 2, false)} IQD
              </p>
              <p className="text-xs text-gray-500 mt-1">Giderler Sonrası</p>
            </div>
            <div className={`${netProfit >= 0 ? 'bg-emerald-100' : 'bg-red-100'} rounded-full p-3`}>
              <DollarSign className={`w-6 h-6 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Sales Breakdown */}
        <div className="col-span-2 bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h3 className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Ürün Bazlı Kar Analizi
            </h3>
          </div>
          <div className="overflow-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm">Ürün</th>
                  <th className="px-4 py-3 text-right text-sm">Miktar</th>
                  <th className="px-4 py-3 text-right text-sm">Gelir</th>
                  <th className="px-4 py-3 text-right text-sm">Maliyet</th>
                  <th className="px-4 py-3 text-right text-sm">Kar</th>
                  <th className="px-4 py-3 text-right text-sm">Marj</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {salesData.map((item) => (
                  <tr key={item.productCode} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                        <p className="text-xs text-gray-500">{item.productCode}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">
                      {formatNumber(item.revenue, 2, false)} IQD
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">
                      {formatNumber(item.cost, 2, false)} IQD
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-medium text-green-600">
                        {formatNumber(item.profit, 2, false)} IQD
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        item.profitMargin >= 30 
                          ? 'bg-green-100 text-green-700'
                          : item.profitMargin >= 20
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        %{formatNumber(item.profitMargin, 2, false)}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-4 py-3 text-sm">TOPLAM</td>
                  <td className="px-4 py-3 text-right text-sm">
                    {salesData.reduce((sum, item) => sum + item.quantity, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-blue-600">
                    {formatNumber(totalRevenue, 2, false)} IQD
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-orange-600">
                    {formatNumber(totalCost, 2, false)} IQD
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-green-600">
                    {formatNumber(totalProfit, 2, false)} IQD
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    %{formatNumber(averageMargin, 2, false)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Expenses Breakdown */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h3 className="text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-orange-600" />
              Gider Dağılımı
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Kira</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatNumber(expenses.rent, 2, false)} IQD
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Maaşlar</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatNumber(expenses.salaries, 2, false)} IQD
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Faturalar</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatNumber(expenses.utilities, 2, false)} IQD
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Pazarlama</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatNumber(expenses.marketing, 2, false)} IQD
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Diğer</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatNumber(expenses.other, 2, false)} IQD
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-medium text-gray-900">Toplam Gider</span>
                <span className="text-lg font-bold text-red-600">
                  {formatNumber(totalExpenses, 2, false)} IQD
                </span>
              </div>
            </div>

            <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border-2 border-emerald-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-emerald-900">Brüt Kar</span>
                <span className="text-lg font-bold text-emerald-700">
                  {formatNumber(totalProfit, 2, false)} IQD
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-red-900">Toplam Gider</span>
                <span className="text-sm font-medium text-red-700">
                  -{formatNumber(totalExpenses, 2, false)} IQD
                </span>
              </div>
              <div className="pt-2 border-t-2 border-emerald-300">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900">NET KAR</span>
                  <span className={`text-xl font-bold ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatNumber(netProfit, 2, false)} IQD
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Net Kar Marjı: %{formatNumber((netProfit / totalRevenue) * 100, 2, false)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

