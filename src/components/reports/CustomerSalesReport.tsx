import React, { useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import { SearchOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import type { Sale, Customer } from '../../App';
import { formatNumber } from '../../utils/formatNumber';
import { formatLedgerAmount, getFirmLedgerCurrency, getGlobalCurrency } from '../../utils/currency';
import { getAppDefaultCurrency } from '../../services/postgres';
import { isReturnSale } from '../../utils/posZReport';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useReportFilters } from '../../contexts/ReportFiltersContext';
import { localCalendarDateKey, localTodayDateKey } from '../../utils/localCalendarDate';
import { formatReportDateCell } from '../../utils/dateLocale';
import { ReportYmdDatePicker } from '../shared/ReportDateRangePresets';
import { ReportColumnTable } from './shared/ReportDataGrid';
import { isDepositSale } from '../../utils/reportDepositFilter';

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
  const { selectedFirm } = useFirmaDonem();
  const currency = getFirmLedgerCurrency(
    selectedFirm,
    getAppDefaultCurrency() || getGlobalCurrency(),
  );
  // Rapor filtreleri — diğer raporlarla paylaşılan ortak bağlam (Bug rapor bağlantı kopukluğu).
  const {
    dateStart,
    dateEnd,
    setDateRange,
    customerFilter,
    setCustomerFilter,
  } = useReportFilters();
  const dateRange = { start: dateStart, end: dateEnd };

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
        // Bug 28 — hizmet ve rezervasyon tutarı ayrıştırma (güzellik)
        serviceRevenue: number; // tamamlanmış hizmet satışı (ana ciro)
        depositRevenue: number; // rezervasyon peşinatı (henüz hizmet verilmemiş)
        returnsRevenue: number; // iade tutarı (negatif)
        totalRevenue: number; // service + deposit + returns (net brüt ciro)
        serviceCount: number;
        depositCount: number;
        avgSale: number;
        lastSaleDate: string;
      }
    >();

    sales.forEach((sale) => {
      if (!isSaleInDateRange(sale, dateRange.start, dateRange.end)) return;
      // iptal edilmiş kayıtları tamamen Hariç tut
      const ps = (sale as Sale & { payment_status?: string }).payment_status;
      const st = String(sale.status ?? '').toLowerCase();
      if (st === 'cancelled' || st === 'canceled' || st === 'silindi' || st === 'iptal' || st === 'refunded') return;
      if (ps === 'cancelled' || ps === 'canceled') return;
      // Bug 28 — pending (hizmet verilmedi) ana ciroya dahil etme, ama
      // rezervasyon peşinatı sütununa yaz.
      const isDeposit = isDepositSale(sale);
      const isPending = ps === 'pending' || ps === 'awaiting_service' || ps === 'partial';
      // Bug 26 follow-up — randevuya bağlı ana satış fişi `status` completed
      // değilse hizmet ciroya dahil edilmez (henüz hizmet verilmedi). Bu
      // sayede ROZA gibi "30.000 veresiye + 20.000 peşinat" senaryosunda
      // tamamlanmış ana satış doğru toplama katılır.
      const COMPLETED_STATUSES = new Set([
        'completed', 'complete', 'done', 'finished', 'tamamlandi', 'tamamlandı', 'paid', 'closed',
      ]);
      const linkedAppt = (sale as Sale).linkedAppointmentId;
      const isLinkedOpen = Boolean(linkedAppt) && !COMPLETED_STATUSES.has(st);
      // Bug 28 follow-up (tamamlanmış randevuya bağlı deposit) — eğer bu
      // deposit satırı tamamlanmış bir randevuya bağlıysa, ana hizmet
      // satışı zaten serviceRevenue'ya yazılmıştır (avans + kalan birleşik
      // olarak merge edilmiştir). Bu durumda deposit'i tekrar
      // depositRevenue'ya yazmak çift kayıt olur; atlanır.
      const isDepositOfCompletedApt = isDeposit && linkedAppt && COMPLETED_STATUSES.has(st);

      const customerId = sale.customerId || sale.customerName || 'unknown';
      const customer = customers?.find((c) => c.id === customerId) || null;
      const customerName = sale.customerName || customer?.name || unknownCustomerLabel;
      const customerCode = sale.customerCode || customer?.code || '';
      const customerPhone = sale.customerPhone || customer?.phone || '';
      const customerPhone2 = sale.customerPhone2 || customer?.phone2 || '';
      const existing = customerMap.get(customerId);

      // B1: Müşteri cirosu net (brüt − iade)
      const isReturn = isReturnSale(sale);
      const absTotal = Math.abs(Number(sale.total) || 0);
      const serviceContribution = isReturn ? -absTotal : absTotal;

        if (existing) {
        if (isReturn) {
          existing.returnsRevenue += serviceContribution;
        } else if (isDeposit && !isDepositOfCompletedApt) {
          existing.depositRevenue += absTotal;
          existing.depositCount += 1;
        } else if (!isDeposit && !isPending && !isLinkedOpen) {
          existing.serviceRevenue += absTotal;
          existing.serviceCount += 1;
        }
        // Bug 28 follow-up — Müşteri kartında "Satış Sayısı" sadece ana
        // (tamamlanmış) hizmet satışlarını sayar; rezervasyon peşinatı
        // ayrı bir kolon olarak gösterilir. "Toplam Ciro" = hizmet + rezervasyon
        // toplamıdır, "Alınan Tutar" = hizmetten tahsil edilen (peşinat Hariç).
        existing.salesCount = existing.serviceCount;
        existing.totalRevenue =
          existing.serviceRevenue + existing.depositRevenue + existing.returnsRevenue;
        existing.avgSale =
          existing.serviceCount > 0
            ? existing.serviceRevenue / existing.serviceCount
            : 0;
        const saleDate = localCalendarDateKey(sale.date);
        if (saleDate && saleDate > existing.lastSaleDate) {
          existing.lastSaleDate = saleDate;
        }
      } else {
        const serviceInit = isReturn ? 0 : absTotal;
        // Tamamlanmış randevuya bağlı deposit'i depositRevenue'ya yazma —
        // ana hizmet satışı zaten serviceInit'te birleşik olarak gelecek.
        const depositInit = isReturn || isDepositOfCompletedApt ? 0 : absTotal;
        const returnsInit = isReturn ? serviceContribution : 0;
        const serviceCountInit = !isReturn && !isDeposit && !isPending && !isLinkedOpen ? 1 : 0;
        const depositCountInit = !isReturn && isDeposit && !isDepositOfCompletedApt ? 1 : 0;
        customerMap.set(customerId, {
          customer: {
            ...(customer || { id: customerId, name: customerName }),
            id: customer?.id || customerId,
            name: customerName,
            code: customerCode || customer?.code,
            phone: customerPhone || customer?.phone || '',
            phone2: customerPhone2 || customer?.phone2,
          } as Customer,
          salesCount: serviceCountInit,
          serviceRevenue: serviceInit,
          depositRevenue: depositInit,
          returnsRevenue: returnsInit,
          totalRevenue: serviceInit + depositInit + returnsInit,
          serviceCount: serviceCountInit,
          depositCount: depositCountInit,
          avgSale: serviceCountInit > 0 ? serviceInit : 0,
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
        // Bug 28 follow-up — "Alınan Tutar" yalnızca hizmet satışından
        // (tamamlanmış ana fiş) tahsil edilen kısmı gösterir. Rezervasyon
        // peşinatı zaten ayrı bir kolonda gösterildiği için buraya katılmaz;
        // aksi halde "Hizmet + Rezervasyon" çift sayımı olur.
        const collectedAmount = item.serviceRevenue;
        return {
          id: String(item.customer?.id ?? index),
          customerName,
          customerInitial: (item.customer?.name || unknownShort).charAt(0).toUpperCase(),
          salesCount: item.salesCount,
          // Bug 28 — hizmet ve rezervasyon ayrı kolonlar
          serviceCount: item.serviceCount,
          depositCount: item.depositCount,
          serviceRevenue: item.serviceRevenue,
          depositRevenue: item.depositRevenue,
          collectedAmount,
          returnsRevenue: item.returnsRevenue,
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
            <ReportYmdDatePicker
              value={dateRange.start}
              onChange={(start) => setDateRange({ ...dateRange, start })}
              className="min-w-[9.5rem]"
            />
            <ReportYmdDatePicker
              value={dateRange.end}
              onChange={(end) => setDateRange({ ...dateRange, end })}
              className="min-w-[9.5rem]"
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
                // Bug 28 — hizmet tutarı (ana ciro, tamamlanmış satışlar)
                key: 'serviceRevenue',
                header: `${tm('rptCustColService') || 'Hizmet Tutarı'} (${currency})`,
                type: 'number',
                align: 'right',
                size: 150,
                footerSum: true,
                footerFormat: (n) => formatLedgerAmount(n, currency),
                cell: (row) =>
                  row.serviceRevenue > 0 ? (
                    <span className="text-green-600 font-semibold">
                      {formatLedgerAmount(row.serviceRevenue, currency)}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                // Bug 28 — rezervasyon peşinatı (hizmet verilmemiş avanslar)
                key: 'depositRevenue',
                header: `${tm('rptCustColDeposit') || 'Rezervasyon Tutarı'} (${currency})`,
                type: 'number',
                align: 'right',
                size: 160,
                footerSum: true,
                footerFormat: (n) => formatLedgerAmount(n, currency),
                cell: (row) =>
                  row.depositRevenue > 0 ? (
                    <span className="text-cyan-700 font-semibold">
                      {formatLedgerAmount(row.depositRevenue, currency)}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                // Bug 28 follow-up — Alınan Tutar = Hizmet + Rezervasyon.
                // Müşterinin şu ana kadar ödediği toplam tutar.
                key: 'collectedAmount',
                header: `${tm('rptCustColCollected') || 'Alınan Tutar'} (${currency})`,
                type: 'number',
                align: 'right',
                size: 150,
                footerSum: true,
                footerFormat: (n) => formatLedgerAmount(n, currency),
                cell: (row) =>
                  row.collectedAmount > 0 ? (
                    <span className="text-emerald-700 font-semibold">
                      {formatLedgerAmount(row.collectedAmount, currency)}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'totalRevenue',
                header: `${legendRevenue} (${currency})`,
                type: 'number',
                align: 'right',
                size: 150,
                footerSum: true,
                footerFormat: (n) => formatLedgerAmount(n, currency),
                cell: (row) => (
                  <span className="text-slate-800 font-semibold">
                    {formatLedgerAmount(row.totalRevenue, currency)}
                  </span>
                ),
              },
              {
                key: 'avgSale',
                header: tm('avgSaleLabel'),
                type: 'number',
                align: 'right',
                size: 140,
                cell: (row) => formatLedgerAmount(row.avgSale, currency),
              },
              {
                key: 'lastSaleDate',
                header: tm('rptCustLastSale'),
                type: 'date',
                size: 140,
                cell: (row) => formatReportDateCell(row.lastSaleDate),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
