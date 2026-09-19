import React, { useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import { SearchOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import type { Sale, Customer } from '../../App';
import { formatNumber } from '../../utils/formatNumber';
import { isReturnSale } from '../../utils/posZReport';
import { useLanguage } from '../../contexts/LanguageContext';
import { localCalendarDateKey, localTodayDateKey } from '../../utils/localCalendarDate';
import { ReportColumnTable } from './shared/ReportDataGrid';

interface CustomerSalesReportProps {
  sales: Sale[];
  customers: Customer[];
}

function trNorm(value: string | undefined | null): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function isSaleInDateRange(sale: Sale, start: string, end: string): boolean {
  const key = localCalendarDateKey(sale.date);
  if (start && (!key || key < start)) return false;
  if (end && (!key || key > end)) return false;
  return true;
}

function matchesSearchBlob(term: string, fields: Array<string | undefined | null>): boolean {
  if (!term) return true;
  const blob = fields.map((f) => String(f ?? '').trim()).filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
  return blob.includes(term);
}

export function CustomerSalesReport({ sales, customers }: CustomerSalesReportProps) {
  const { tm } = useLanguage();
  const dateLocale = tm('localeCode');
  const [dateRange, setDateRange] = useState(() => {
    const end = localTodayDateKey();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    return { start: localCalendarDateKey(startDate), end };
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
      if (!isSaleInDateRange(sale, dateRange.start, dateRange.end)) return;

      const customerId = sale.customerId || sale.customerName || 'unknown';
      const customer = customers?.find((c) => c.id === customerId) || null;
      const customerName = sale.customerName || customer?.name || unknownCustomerLabel;
      const customerCode = sale.customerCode || customer?.code || '';
      const customerPhone = sale.customerPhone || customer?.phone || '';
      const customerPhone2 = sale.customerPhone2 || customer?.phone2 || '';
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
        const saleDate = localCalendarDateKey(sale.date);
        if (saleDate && saleDate > existing.lastSaleDate) {
          existing.lastSaleDate = saleDate;
        }
      } else {
        customerMap.set(customerId, {
          customer: {
            ...(customer || { id: customerId, name: customerName }),
            id: customer?.id || customerId,
            name: customerName,
            code: customerCode || customer?.code,
            phone: customerPhone || customer?.phone || '',
            phone2: customerPhone2 || customer?.phone2,
          } as Customer,
          salesCount: isReturn ? 0 : 1,
          totalRevenue: saleContribution,
          avgSale: saleContribution,
          lastSaleDate: localCalendarDateKey(sale.date),
        });
      }
    });

    return Array.from(customerMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [sales, customers, unknownCustomerLabel, dateRange.start, dateRange.end]);

  const filterTerm = trNorm(customerFilter);
  const filteredCustomerSales = useMemo(() => {
    if (!filterTerm) return customerSales;
    return customerSales.filter((item) =>
      matchesSearchBlob(filterTerm, [
        item.customer?.name || unknownCustomerLabel,
        item.customer?.code,
        item.customer?.id,
        item.customer?.phone,
        item.customer?.phone2,
      ]),
    );
  }, [customerSales, filterTerm, unknownCustomerLabel]);

  const detailRows = useMemo(
    () =>
      filteredCustomerSales.map((item, index) => {
        const customerName = item.customer?.name || unknownCustomerLabel;
        return {
          id: String(item.customer?.id ?? index),
          customerName,
          customerInitial: (item.customer?.name || unknownShort).charAt(0).toUpperCase(),
          salesCount: item.salesCount,
          totalRevenue: item.totalRevenue,
          avgSale: item.avgSale,
          lastSaleDate: item.lastSaleDate,
        };
      }),
    [filteredCustomerSales, unknownCustomerLabel, unknownShort],
  );

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (!isSaleInDateRange(sale, dateRange.start, dateRange.end)) return false;
      if (!filterTerm) return true;
      const matchedCustomer = customers?.find((c) => String(c.id) === String(sale.customerId ?? ''));
      return matchesSearchBlob(filterTerm, [
        sale.customerName,
        sale.customerId,
        sale.customerCode,
        sale.customerPhone,
        sale.customerPhone2,
        matchedCustomer?.name,
        matchedCustomer?.code,
        matchedCustomer?.phone,
        matchedCustomer?.phone2,
      ]);
    });
  }, [sales, customers, filterTerm, dateRange.start, dateRange.end]);

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
      </div>

      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h4 className="text-lg font-semibold">{tm('rptCustDetailsSection')}</h4>
          {filterTerm ? (
            <span className="text-xs text-slate-500">
              {tm('rptCustFilteredCount')}: {filteredCustomerSales.length}
            </span>
          ) : null}
        </div>
        <div className="p-2">
          <ReportColumnTable
            data={detailRows}
            height={600}
            footerLabel={tm('rprTotal') || 'Toplam'}
            columns={[
              {
                key: 'customerName',
                header: tm('customer'),
                size: 260,
                cell: (row) => (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white text-sm">
                      {row.customerInitial}
                    </div>
                    <span className="font-medium">{row.customerName}</span>
                  </div>
                ),
              },
              {
                key: 'salesCount',
                header: legendSalesCount,
                type: 'number',
                align: 'right',
                size: 120,
                footerSum: true,
                footerFormat: (n) => formatNumber(n, 0, false),
                cell: (row) => (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">{row.salesCount}</span>
                ),
              },
              {
                key: 'totalRevenue',
                header: legendRevenue,
                type: 'number',
                align: 'right',
                size: 150,
                footerSum: true,
                footerFormat: (n) => `${formatNumber(n, 2, false)} IQD`,
                cell: (row) => (
                  <span className="text-green-600 font-semibold">
                    {formatNumber(row.totalRevenue, 2, false)} IQD
                  </span>
                ),
              },
              {
                key: 'avgSale',
                header: tm('avgSaleLabel'),
                type: 'number',
                align: 'right',
                size: 140,
                cell: (row) => `${formatNumber(row.avgSale, 2, false)} IQD`,
              },
              {
                key: 'lastSaleDate',
                header: tm('rptCustLastSale'),
                type: 'date',
                size: 140,
                cell: (row) => new Date(row.lastSaleDate).toLocaleDateString(dateLocale),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
