import React, { useState, useMemo, useEffect } from 'react';
import { Users } from 'lucide-react';
import { SearchOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import type { Sale, Customer } from '../../App';
import { formatNumber } from '../../utils/formatNumber';
import { formatLedgerAmount, getFirmLedgerCurrency, getGlobalCurrency } from '../../utils/currency';
import { getAppDefaultCurrency } from '../../services/postgres';
import { isReturnSale } from '../../utils/posZReport';
import { saleCollectedSplit } from '../../utils/saleCollectedAmounts';
import {
  aggregateCustomerSaleReceipts,
  type CustomerSaleReceiptInput,
} from '../../utils/customerSalesDeposit';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useReportFilters } from '../../contexts/ReportFiltersContext';
import { localCalendarDateKey, localTodayDateKey } from '../../utils/localCalendarDate';
import { formatReportDateCell } from '../../utils/dateLocale';
import { ReportYmdDatePicker } from '../shared/ReportDateRangePresets';
import { ReportColumnTable } from './shared/ReportDataGrid';
import { isDepositSale } from '../../utils/reportDepositFilter';
import {
  getCustomerSalesFromAppointments,
  type BeautyCustomerSalesRow,
} from '../../services/api/erpReports';

interface CustomerSalesReportProps {
  sales: Sale[];
  customers: Customer[];
  /**
   * İş kolu. `'beauty'` ise rapor `effectiveCatalogSales` (invoice fişleri)
   * yerine doğrudan `beauty_appointments` tablosundan beslenir; böylece
   * rezervasyon avansı (`deposit_amount`) ciroya doğru yansır. Diğer
   * iş kollarında (`market` / `restaurant`) mevcut davranış korunur.
   *
   * Varsayılan: `'market'` (geriye dönük uyumlu).
   */
  businessType?: 'market' | 'restaurant' | 'beauty' | string;
}

const COMPLETED_SALE_STATUSES = new Set([
  'completed',
  'complete',
  'done',
  'finished',
  'tamamlandi',
  'tamamlandı',
  'paid',
  'closed',
]);

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

function saleReceiptCollected(sale: Sale): { collected?: number; collectedKnown: boolean } {
  const hasPayments = Array.isArray(sale.payments) && sale.payments.length > 0;
  const method = String(sale.paymentMethod || '').trim();
  if (!hasPayments && !method) return { collectedKnown: false };
  return {
    collected: Math.abs(Number(saleCollectedSplit(sale).collected) || 0),
    collectedKnown: true,
  };
}

/** Satış fişi yedeği: satırlar varsa dağıtım motoru, yoksa fiş başlığı. */
function saleToCustomerReceipt(sale: Sale): CustomerSaleReceiptInput {
  const rawItems = (sale.items || []).map((item) => ({
    productName: item.productName,
    productCode: item.productCode,
    productId: item.productId,
    lineType: item.lineType,
    quantity: item.quantity,
    total: Number(item.total) || 0,
    depositAmount: (item as { depositAmount?: number | null }).depositAmount ?? null,
  }));
  const itemSum = rawItems.reduce((sum, item) => sum + item.total, 0);
  const items =
    Number(sale.total) < 0 && itemSum > 0.004
      ? rawItems.map((item) => ({
          ...item,
          total: -Math.abs(item.total),
          depositAmount:
            item.depositAmount == null ? null : -Math.abs(Number(item.depositAmount) || 0),
        }))
      : rawItems;
  const collected = saleReceiptCollected(sale);
  return {
    id: String(sale.id || ''),
    customerId: String(sale.customerId || sale.customerName || 'unknown'),
    customerName: sale.customerName,
    customerCode: sale.customerCode,
    phone: sale.customerPhone,
    date: localCalendarDateKey(sale.date),
    total: Number(sale.total) || 0,
    items,
    collected: collected.collected,
    collectedKnown: collected.collectedKnown,
    status: sale.status,
    isDeposit: isDepositSale(sale),
    linkedAppointmentId: sale.linkedAppointmentId,
    saleGroupId: sale.saleGroupId,
    depositSaleId: sale.depositSaleId,
    parentSaleId: sale.parentSaleId,
  };
}

export function CustomerSalesReport({ sales, customers, businessType = 'market' }: CustomerSalesReportProps) {
  const { tm } = useLanguage();
  const isBeauty = String(businessType ?? '').toLowerCase() === 'beauty';

  /**
   * Bug 32 — Beauty müşterileri için randevu bazlı veri kaynağı.
   * Invoice (sales_invoice) zinciri avansı (`deposit_amount`) kaçırıyordu;
   * burada `beauty_appointments` aggregate'inden doğrudan çekiyoruz.
   */
  const [beautyRows, setBeautyRows] = useState<BeautyCustomerSalesRow[]>([]);
  const [beautyLoading, setBeautyLoading] = useState(isBeauty);
  // Rapor filtreleri — diğer raporlarla paylaşılan ortak bağlam (Bug rapor bağlantı kopukluğu).
  const {
    dateStart,
    dateEnd,
    setDateRange,
    customerFilter,
    setCustomerFilter,
  } = useReportFilters();
  useEffect(() => {
    if (!isBeauty) return;
    if (!dateStart || !dateEnd) return;
    let cancelled = false;
    setBeautyLoading(true);
    void getCustomerSalesFromAppointments({ startDate: dateStart, endDate: dateEnd })
      .then((rows) => {
        if (!cancelled) setBeautyRows(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        console.error('[CustomerSalesReport] beauty appointments yüklenemedi:', err);
        if (!cancelled) setBeautyRows([]);
      })
      .finally(() => {
        if (!cancelled) setBeautyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBeauty, dateStart, dateEnd]);
  const { selectedFirm } = useFirmaDonem();
  const currency = getFirmLedgerCurrency(
    selectedFirm,
    getAppDefaultCurrency() || getGlobalCurrency(),
  );
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
        collectedAmount: number;
        /** Depozito payı hizmet tutarının içinde; toplama tekrar eklenmez. */
        depositInsideService: boolean;
      }
    >();

    // Bug 32 — Beauty müşterileri için randevu bazlı (appointment) veri
    // kaynağı. Invoice (sales_invoice) zinciri avansı kaçırıyordu; burada
    // `beauty_appointments` aggregate doğrudan kullanılıyor.
    // Randevu sorgusu boş veya hatalıysa satış fişleri listelenir.
    if (isBeauty && beautyRows.length > 0) {
      beautyRows.forEach((row) => {
        if (!row.customerId) return;
        const matchedCustomer =
          customers?.find((c) => String(c.id) === String(row.customerId)) || null;
        const customerName = row.customerName || matchedCustomer?.name || unknownCustomerLabel;
        customerMap.set(row.customerId, {
          customer: {
            ...(matchedCustomer || { id: row.customerId, name: customerName }),
            id: matchedCustomer?.id || row.customerId,
            name: customerName,
            code: row.customerCode || matchedCustomer?.code,
            phone: row.phone || matchedCustomer?.phone || '',
          } as Customer,
          salesCount: row.appointmentCount,
          serviceRevenue: row.serviceRevenue,
          depositRevenue: row.depositRevenue,
          returnsRevenue: 0,
          totalRevenue: row.totalRevenue,
          serviceCount: row.appointmentCount,
          depositCount: row.depositRevenue > 0.004 ? 1 : 0,
          avgSale: row.avgServiceRevenue,
          lastSaleDate: row.lastAppointmentDate || '',
          collectedAmount: row.collectedAmount,
          depositInsideService: true,
        });
      });
      return Array.from(customerMap.values()).sort(
        (a, b) => b.totalRevenue - a.totalRevenue,
      );
    }
    if (isBeauty && beautyLoading) return [];

    // Randevu satırı yoksa satış fişleri listelenir. Depozito ayrı ürün değildir;
    // aynı fişin hizmetlerine dağıtılır, ciroya ikinci kez eklenmez.
    if (isBeauty) {
      const receipts: CustomerSaleReceiptInput[] = [];
      for (const sale of sales) {
        if (!isSaleInDateRange(sale, dateRange.start, dateRange.end)) continue;
        const ps = (sale as Sale & { payment_status?: string }).payment_status;
        const st = String(sale.status ?? '').toLowerCase();
        if (st === 'cancelled' || st === 'canceled' || st === 'silindi' || st === 'iptal' || st === 'refunded') continue;
        if (ps === 'cancelled' || ps === 'canceled') continue;
        const deposit = isDepositSale(sale);
        const isPending = ps === 'pending' || ps === 'awaiting_service' || ps === 'partial';
        const linkedAppt = sale.linkedAppointmentId;
        const isLinkedOpen = Boolean(linkedAppt) && !COMPLETED_SALE_STATUSES.has(st);
        if (!deposit && (isPending || isLinkedOpen)) continue;
        receipts.push(saleToCustomerReceipt(sale));
      }
      const aggregated = aggregateCustomerSaleReceipts(receipts);
      aggregated.forEach((row) => {
        if (!row.customerId) return;
        const matchedCustomer =
          customers?.find((c) => String(c.id) === String(row.customerId)) || null;
        const customerName = row.customerName || matchedCustomer?.name || unknownCustomerLabel;
        customerMap.set(row.customerId, {
          customer: {
            ...(matchedCustomer || { id: row.customerId, name: customerName }),
            id: matchedCustomer?.id || row.customerId,
            name: customerName,
            code: row.customerCode || matchedCustomer?.code,
            phone: row.phone || matchedCustomer?.phone || '',
          } as Customer,
          salesCount: row.salesCount,
          serviceRevenue: row.serviceRevenue,
          depositRevenue: row.depositRevenue,
          returnsRevenue: 0,
          totalRevenue: row.totalRevenue,
          serviceCount: row.salesCount,
          depositCount: row.depositRevenue > 0.004 ? 1 : 0,
          avgSale: row.avgSale,
          lastSaleDate: row.lastSaleDate || '',
          collectedAmount: row.collectedAmount,
          depositInsideService: true,
        });
      });
      return Array.from(customerMap.values()).sort(
        (a, b) => b.totalRevenue - a.totalRevenue,
      );
    }

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
      const linkedAppt = (sale as Sale).linkedAppointmentId;
      const isLinkedOpen = Boolean(linkedAppt) && !COMPLETED_SALE_STATUSES.has(st);
      // 16.10.2026 — Deposit Ciro'ya HER ZAMAN katılır (kullanıcı
      // talebi: tamamlanmış randevuya bağlı avans da Ciro'da
      // görünmeli). Hizmet + Rezervasyon ayrı kolonlar olduğu için
      // çift sayım riski yok. Önceki `isDepositOfCompletedApt`
      // filtresi kaldırıldı.

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
        } else if (isDeposit) {
          // 16.10.2026 — Deposit Ciro'ya HER ZAMAN katılır (kullanıcı
          // talebi: tamamlanmış randevuya bağlı avans da Ciro'da
          // görünmeli). Hizmet + Rezervasyon ayrı kolonlar olduğu
          // için çift sayım riski yok.
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
        existing.collectedAmount = existing.serviceRevenue + existing.depositRevenue;
        existing.depositInsideService = false;
        const saleDate = localCalendarDateKey(sale.date);
        if (saleDate && saleDate > existing.lastSaleDate) {
          existing.lastSaleDate = saleDate;
        }
      } else {
        const serviceInit = !isReturn && !isDeposit && !isPending && !isLinkedOpen ? absTotal : 0;
        const depositInit = !isReturn && isDeposit ? absTotal : 0;
        const returnsInit = isReturn ? serviceContribution : 0;
        const serviceCountInit = !isReturn && !isDeposit && !isPending && !isLinkedOpen ? 1 : 0;
        const depositCountInit = !isReturn && isDeposit ? 1 : 0;
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
          collectedAmount: serviceInit + depositInit,
          depositInsideService: false,
        });
      }
    });

    return Array.from(customerMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [isBeauty, beautyLoading, beautyRows, sales, customers, unknownCustomerLabel, dateRange.start, dateRange.end]);

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
        // 16.10.2026 — "Alınan Tutar" = hizmet tahsilatı + rezervasyon
        // peşinatı (toplam gerçek tahsilat). Önceki sürüm yalnızca
        // hizmeti gösteriyordu, oysa müşteri 50k ödedi (40k hizmet +
        // 10k avans). "Rezervasyon Tutarı" ayrı kolon olarak da
        // gösterilir; burada toplam yansıtılır. Çift sayım değil çünkü
        // iki ayrı tahsilat (hizmet + avans).
        const collectedAmount = item.depositInsideService
          ? item.collectedAmount
          : item.serviceRevenue + item.depositRevenue;
        const totalRevenue = item.depositInsideService
          ? item.totalRevenue
          : item.serviceRevenue + item.depositRevenue;
        const avgSale = item.depositInsideService
          ? item.avgSale
          : item.salesCount > 0
            ? (item.serviceRevenue + item.depositRevenue) / item.salesCount
            : 0;
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
          // 16.10.2026 — Toplam Ciro = hizmet + rezervasyon (avans).
          // SQL'den gelen total_revenue SUM(total_price) yani sadece
          // hizmet; deposit ayrı kolon. UI'da toplamı birleştiriyoruz.
          totalRevenue,
          avgSale,
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
              onChange={(start) => setDateRange(start, dateRange.end)}
              className="min-w-[9.5rem]"
            />
            <ReportYmdDatePicker
              value={dateRange.end}
              onChange={(end) => setDateRange(dateRange.start, end)}
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
            height="auto"
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
