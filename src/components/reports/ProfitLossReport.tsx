import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Package, ShoppingCart, Calendar, Filter, Loader2 } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import { postgres } from '../../services/postgres';

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
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      let sql = `
        SELECT
          si.product_code,
          si.product_name,
          SUM(si.quantity)     AS quantity,
          SUM(si.total_amount) AS revenue,
          SUM(si.total_cost)   AS cost,
          SUM(si.gross_profit) AS profit
        FROM sale_items si
        JOIN sales s ON si.invoice_id = s.id
        WHERE s.fiche_type = 'sales_invoice'
      `;
      const params: any[] = [];

      if (startDate) {
        params.push(startDate);
        sql += ` AND s.date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        sql += ` AND s.date <= $${params.length}`;
      }

      sql += ` GROUP BY si.product_code, si.product_name ORDER BY SUM(si.gross_profit) DESC`;

      const { rows } = await postgres.query(sql, params);

      setSalesData(rows.map(r => {
        const revenue = parseFloat(r.revenue) || 0;
        const cost = parseFloat(r.cost) || 0;
        const profit = r.profit != null ? parseFloat(r.profit) : revenue - cost;
        return {
          productCode: r.product_code || '',
          productName: r.product_name || '',
          quantity: parseFloat(r.quantity) || 0,
          revenue,
          cost,
          profit,
          profitMargin: revenue > 0 ? (profit / revenue) * 100 : 0,
        };
      }));
    } catch (err) {
      console.error('[ProfitLossReport] loadData failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = salesData.reduce((sum, item) => sum + item.revenue, 0);
  const totalCost = salesData.reduce((sum, item) => sum + item.cost, 0);
  const totalProfit = salesData.reduce((sum, item) => sum + item.profit, 0);
  const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

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
      <div className="grid grid-cols-3 gap-4">
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
      </div>

      {/* Sales Breakdown */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            Ürün Bazlı Kar Analizi
          </h3>
          {loading && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
        </div>
        <div className="overflow-auto">
          {salesData.length === 0 && !loading ? (
            <div className="p-8 text-center text-gray-400">Kayıt bulunamadı</div>
          ) : (
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
                      <span className={`text-sm font-medium ${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
                {salesData.length > 0 && (
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
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}


