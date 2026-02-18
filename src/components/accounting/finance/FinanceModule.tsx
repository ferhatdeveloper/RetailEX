import { useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Banknote, Calendar, Download, Filter } from 'lucide-react';
import type { Sale } from '../../../App';
import { formatNumber } from '../../../utils/formatNumber';

interface FinanceModuleProps {
  sales: Sale[];
}

export function FinanceModule({ sales }: FinanceModuleProps) {
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [paymentFilter, setPaymentFilter] = useState<string>('Tümü');

  const filterSalesByDate = (sales: Sale[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateFilter) {
      case 'today':
        return sales.filter(sale => new Date(sale.date) >= today);
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return sales.filter(sale => new Date(sale.date) >= weekAgo);
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return sales.filter(sale => new Date(sale.date) >= monthAgo);
      default:
        return sales;
    }
  };

  let filteredSales = filterSalesByDate(sales);

  if (paymentFilter !== 'Tümü') {
    filteredSales = filteredSales.filter(s => s.paymentMethod === paymentFilter);
  }

  // Calculate totals
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalDiscount = filteredSales.reduce((sum, sale) => sum + sale.discount, 0);
  const totalTax = filteredSales.reduce((sum, sale) => sum + sale.tax, 0);
  const netRevenue = filteredSales.reduce((sum, sale) => sum + sale.subtotal, 0);
  const grossRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);

  // Payment method breakdown
  const paymentMethods = ['Tümü', ...Array.from(new Set(sales.map(s => s.paymentMethod)))];
  const paymentBreakdown = filteredSales.reduce((acc, sale) => {
    acc[sale.paymentMethod] = (acc[sale.paymentMethod] || 0) + sale.total;
    return acc;
  }, {} as Record<string, number>);

  // Hourly breakdown for today
  const hourlyData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    revenue: 0,
    count: 0
  }));

  if (dateFilter === 'today') {
    filteredSales.forEach(sale => {
      const hour = new Date(sale.date).getHours();
      hourlyData[hour].revenue += sale.total;
      hourlyData[hour].count += 1;
    });
  }

  // Z Report Data (End of Day)
  const zReportData = {
    openingTime: filteredSales.length > 0 ? new Date(filteredSales[filteredSales.length - 1].date) : new Date(),
    closingTime: filteredSales.length > 0 ? new Date(filteredSales[0].date) : new Date(),
    transactionCount: filteredSales.length,
    totalSales: totalRevenue,
    cash: paymentBreakdown['Nakit'] || 0,
    creditCard: paymentBreakdown['Kredi Kartı'] || 0,
    debitCard: paymentBreakdown['Banka Kartı'] || 0,
    mobile: paymentBreakdown['Mobil Ödeme'] || 0,
    returns: 0,
    voidSales: 0,
    netSales: totalRevenue,
    taxTotal: totalTax,
    discountTotal: totalDiscount
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            <h2 className="text-sm">Finans & Kasa Yönetimi</h2>
          </div>
          <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
            <Download className="w-3 h-3" />
            Z Raporu
          </button>
        </div>
      </div>

      {/* Filters - Kompakt */}
      <div className="bg-white border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-600">Tarih:</span>
            <div className="flex gap-1">
              {(['today', 'week', 'month', 'all'] as const).map(filter => (
                <button
                  key={filter}
                  onClick={() => setDateFilter(filter)}
                  className={`px-2 py-0.5 rounded text-[9px] transition-colors ${dateFilter === filter
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {filter === 'today' ? 'Bugün' :
                    filter === 'week' ? 'Bu Hafta' :
                      filter === 'month' ? 'Bu Ay' : 'Tümü'}
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-gray-300"></div>

          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-600">Ödeme:</span>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-2 py-0.5 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {paymentMethods.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Finansal Özet</h3>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Toplam Gelir</span>
              </div>
              <div className="text-base text-blue-600">{formatNumber(totalRevenue, 2, false)} IQD</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{filteredSales.length} işlem</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Net Satış</span>
              </div>
              <div className="text-base text-green-600">{formatNumber(netRevenue, 2, false)} IQD</div>
              <div className="text-[9px] text-gray-500 mt-0.5">TAX hariç</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Brüt Satış</span>
              </div>
              <div className="text-base text-blue-600">{formatNumber(grossRevenue, 2, false)} IQD</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] text-gray-600">TAX Toplamı</span>
              </div>
              <div className="text-base text-purple-600">{formatNumber(totalTax, 2, false)} IQD</div>
              <div className="text-[9px] text-gray-500 mt-0.5">Tahsil edilen</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-600" />
                <span className="text-[10px] text-gray-600">İndirim Toplamı</span>
              </div>
              <div className="text-base text-red-600">{formatNumber(totalDiscount, 2, false)} IQD</div>
              <div className="text-[9px] text-gray-500 mt-0.5">Verilen indirim</div>
            </div>
          </div>
        </div>

        {/* Payment Method Breakdown */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Ödeme Yöntemi Dağılımı</h3>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(paymentBreakdown).map(([method, amount]) => (
                <div key={method} className="p-2 bg-gray-50 rounded border border-gray-200">
                  <div className="flex items-center gap-1 mb-1">
                    {method === 'Nakit' ? <Banknote className="w-3 h-3 text-green-600" /> : <CreditCard className="w-3 h-3 text-blue-600" />}
                    <p className="text-[10px] text-gray-600">{method}</p>
                  </div>
                  <p className="text-sm text-gray-900">{formatNumber(amount, 2, false)} IQD</p>
                  <p className="text-[9px] text-gray-500 mt-0.5">
                    {formatNumber((amount / totalRevenue) * 100, 1, false)}% pay
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Z Report */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
            <h3 className="text-xl">Z Raporu - Kasa Kapama</h3>
            <p className="text-sm text-gray-600 mt-1">Günlük kasa özeti</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* General Info */}
              <div className="space-y-3">
                <h4 className="text-sm text-gray-600 uppercase tracking-wider mb-3">Genel Bilgiler</h4>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Açılış Saati:</span>
                  <span>{zReportData.openingTime.toLocaleTimeString('tr-TR')}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Kapanış Saati:</span>
                  <span>{zReportData.closingTime.toLocaleTimeString('tr-TR')}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">İşlem Sayısı:</span>
                  <span className="text-blue-600">{zReportData.transactionCount}</span>
                </div>
              </div>

              {/* Sales Summary */}
              <div className="space-y-3">
                <h4 className="text-sm text-gray-600 uppercase tracking-wider mb-3">Satış Özeti</h4>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Toplam Satış:</span>
                  <span className="text-green-600">{formatNumber(zReportData.totalSales, 2, false)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">İade:</span>
                  <span className="text-red-600">{formatNumber(zReportData.returns, 2, false)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">İptal:</span>
                  <span className="text-orange-600">{formatNumber(zReportData.voidSales, 2, false)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-400 bg-gray-50 px-2 rounded">
                  <span>Net Satış:</span>
                  <span className="text-blue-600">{formatNumber(zReportData.netSales, 2, false)}</span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-3">
                <h4 className="text-sm text-gray-600 uppercase tracking-wider mb-3">Tahsilat Detayı</h4>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Nakit:</span>
                  <span>{formatNumber(zReportData.cash, 2, false)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Kredi Kartı:</span>
                  <span>{formatNumber(zReportData.creditCard, 2, false)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Banka Kartı:</span>
                  <span>{formatNumber(zReportData.debitCard, 2, false)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Mobil:</span>
                  <span>{formatNumber(zReportData.mobile, 2, false)}</span>
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="mt-6 pt-6 border-t-2 border-gray-300">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">TAX Toplamı</p>
                  <p className="text-2xl text-blue-600">{formatNumber(zReportData.taxTotal, 2, false)}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">İndirim Toplamı</p>
                  <p className="text-2xl text-red-600">{formatNumber(zReportData.discountTotal, 2, false)}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Net Gelir</p>
                  <p className="text-2xl text-green-600">{formatNumber(zReportData.netSales, 2, false)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction List */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl">İşlem Detayları</h3>
            <p className="text-sm text-gray-600 mt-1">Tüm satış hareketleri</p>
          </div>
          <div className="overflow-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-300">
                <tr>
                  <th className="px-4 py-3 text-left text-sm text-gray-700">FİŞ NO</th>
                  <th className="px-4 py-3 text-left text-sm text-gray-700">TARİH/SAAT</th>
                  <th className="px-4 py-3 text-left text-sm text-gray-700">MÜŞTERİ</th>
                  <th className="px-4 py-3 text-center text-sm text-gray-700">ÜRÜN SAYISI</th>
                  <th className="px-4 py-3 text-left text-sm text-gray-700">ÖDEME</th>
                  <th className="px-4 py-3 text-right text-sm text-gray-700">ARA TOPLAM</th>
                  <th className="px-4 py-3 text-right text-sm text-gray-700">TAX</th>
                  <th className="px-4 py-3 text-right text-sm text-gray-700">İNDİRİM</th>
                  <th className="px-4 py-3 text-right text-sm text-gray-700">TOPLAM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSales.map(sale => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{sale.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(sale.date).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-4 py-3 text-sm">{sale.customerName || 'Misafir'}</td>
                    <td className="px-4 py-3 text-center text-sm">
                      {sale.items.reduce((sum, item) => sum + item.quantity, 0)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                        {sale.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">{formatNumber(sale.subtotal, 2, false)}</td>
                    <td className="px-4 py-3 text-right text-sm text-purple-600">{formatNumber(sale.tax || 0, 2, false)}</td>
                    <td className="px-4 py-3 text-right text-sm text-red-600">
                      {sale.discount > 0 ? `-${formatNumber(sale.discount, 2, false)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-600">{formatNumber(sale.total, 2, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
