import React, { useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import { SearchOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import type { Sale, Customer } from '../../App';
import { formatNumber } from '../../utils/formatNumber';
import { isReturnSale } from '../../utils/posZReport';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguage } from '../../contexts/LanguageContext';

interface CustomerSalesReportProps {
  sales: Sale[];
  customers: Customer[];
}

export function CustomerSalesReport({ sales, customers }: CustomerSalesReportProps) {
  const { tm } = useLanguage();
  const dateLocale = tm('localeCode');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [customerFilter, setCustomerFilter] = useState('');

  const unknownCustomerLabel = tm('rptCustUnknown');
  const unknownShort = tm('rptCustUnknownShort');
  const legendRevenue = tm('totalRevenueLabel');
  const legendSalesCount = tm('rptSalesCount');

  const customerSales = useMemo(() => {
    const customerMap = new Map<
      string,
      {
        customer: Customer | null;
        salesCount: number;
        totalRevenue: number;
        avgSale: number;
        lastSaleDate: string;
      }
    >();

    sales.forEach((sale) => {
      const customerId = sale.customerId || sale.customerName || 'unknown';
      const customer = customers?.find((c) => c.id === customerId) || null;
      const customerName = sale.customerName || customer?.name || unknownCustomerLabel;
      const existing = customerMap.get(customerId);

      // B1: Müşteri cirosu net (brüt − iade)
      const isReturn = isReturnSale(sale);
      const saleContribution = isReturn
        ? -Math.abs(Number(sale.total) || 0)
        : Number(sale.total) || 0;

      if (existing) {
        if (!isReturn) existing.salesCount += 1;
        existing.totalRevenue += saleContribution;
        existing.avgSale = existing.totalRevenue / Math.max(1, existing.salesCount);
        const saleDate = new Date(sale.date).toISOString().split('T')[0];
        if (saleDate > existing.lastSaleDate) {
          existing.lastSaleDate = saleDate;
        }
      } else {
        customerMap.set(customerId, {
          customer: customer || ({ id: customerId, name: customerName } as Customer),
          salesCount: isReturn ? 0 : 1,
          totalRevenue: saleContribution,
          avgSale: saleContribution,
          lastSaleDate: new Date(sale.date).toISOString().split('T')[0],
        });
      }
    });

    return Array.from(customerMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 20);
  }, [sales, customers, unknownCustomerLabel]);

  const filterTerm = customerFilter.trim().toLowerCase();
  const filteredCustomerSales = useMemo(() => {
    if (!filterTerm) return customerSales;
    return customerSales.filter((item) => {
      const name = (item.customer?.name || unknownCustomerLabel).toLowerCase();
      const id = String(item.customer?.id ?? '').toLowerCase();
      return name.includes(filterTerm) || id.includes(filterTerm);
    });
  }, [customerSales, filterTerm, unknownCustomerLabel]);

  const filteredSales = useMemo(() => {
    if (!filterTerm) return sales;
    return sales.filter((sale) => {
      const cid = String(sale.customerId ?? '').toLowerCase();
      const cname = String(sale.customerName ?? '').toLowerCase();
      const matchedCustomer = customers?.find((c) => String(c.id).toLowerCase() === cid);
      const resolvedName = String(matchedCustomer?.name ?? cname).toLowerCase();
      return cid.includes(filterTerm) || cname.includes(filterTerm) || resolvedName.includes(filterTerm);
    });
  }, [sales, customers, filterTerm]);

  const totalCustomers = useMemo(() => new Set(filteredSales.map((s) => s.customerId)).size, [filteredSales]);
  const totalRevenue = useMemo(
    () => filteredCustomerSales.reduce((sum, c) => sum + c.totalRevenue, 0),
    [filteredCustomerSales],
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="text-xl font-semibold">{tm('rptCustTitle')}</h3>
              <p className="text-sm text-gray-600">{tm('rptCustSubtitle')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              allowClear
              size="middle"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              placeholder={tm('rptCustFilterPlaceholder')}
              prefix={<SearchOutlined className="text-slate-400" />}
              className="w-64"
              style={{ width: 260 }}
            />
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

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-gray-600">{tm('rptCustTotalCustomers')}</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{totalCustomers}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-gray-600">{legendRevenue}</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatNumber(totalRevenue, 2, false)} IQD</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-gray-600">{tm('avgSaleLabel')}</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">
              {totalCustomers > 0 ? formatNumber(totalRevenue / totalCustomers, 2, false) : '0'} IQD
            </p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <p className="text-sm text-gray-600">{tm('rptCustActiveCustomer')}</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">{customerSales.length}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold">{tm('rptCustTop10Chart')}</h4>
          <span className="text-xs text-slate-500">
            {filterTerm ? `${tm('rptCustFilteredCount')}: ${filteredCustomerSales.length}` : ''}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={filteredCustomerSales.slice(0, 10)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="customer.name" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip formatter={(value: number) => formatNumber(value, 2, false) + ' IQD'} />
            <Legend />
            <Bar dataKey="totalRevenue" fill="#3b82f6" name={legendRevenue} />
            <Bar dataKey="salesCount" fill="#10b981" name={legendSalesCount} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-lg font-semibold">{tm('rptCustDetailsSection')}</h4>
        </div>
        <div
          className="overflow-x-auto overflow-y-auto max-h-[600px]"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}
        >
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-sm">{tm('customer')}</th>
                <th className="px-4 py-3 text-right text-sm">{legendSalesCount}</th>
                <th className="px-4 py-3 text-right text-sm">{legendRevenue}</th>
                <th className="px-4 py-3 text-right text-sm">{tm('avgSaleLabel')}</th>
                <th className="px-4 py-3 text-left text-sm">{tm('rptCustLastSale')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCustomerSales.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500 text-sm">
                    {tm('noDataFound')}
                  </td>
                </tr>
              ) : (
                filteredCustomerSales.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white text-sm">
                          {(item.customer?.name || unknownShort).charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{item.customer?.name || unknownCustomerLabel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">{item.salesCount}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 font-semibold">
                      {formatNumber(item.totalRevenue, 2, false)} IQD
                    </td>
                    <td className="px-4 py-3 text-right text-sm">{formatNumber(item.avgSale, 2, false)} IQD</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(item.lastSaleDate).toLocaleDateString(dateLocale)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
