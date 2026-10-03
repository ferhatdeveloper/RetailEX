import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileSearch, Loader2, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatNumber } from '../../utils/formatNumber';
import { expenseAPI, type Expense } from '../../services/api/expenses';
import { salesAPI } from '../../services/api/sales';
import { beautyService } from '../../services/beautyService';
import { invoicesAPI } from '../../services/api/invoices';
import { supplierAPI } from '../../services/api/suppliers';
import { fetchKasaIslemleri } from '../../services/api/kasa';
import { isReturnSale } from '../../utils/posZReport';
import { isDepositSale } from '../../utils/reportDepositFilter';
import { saleCollectedSplit } from '../../utils/saleCollectedAmounts';
import {
  mergeExpensesWithCashOuts,
  mergeExpensesWithCashIns,
  aggregateCashIns,
  PERIOD_SUMMARY_CASH_OUT_TYPES,
} from '../../utils/reportUnifiedExpenses';
import type { Sale } from '../../App';
import type { Invoice, Supplier } from '../../core/types/models';
import { localCalendarDateKey, localTodayDateKey, formatIsoDateTr, toSqlDateInputString } from '../../utils/localCalendarDate';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useLanguage } from '../../contexts/LanguageContext';

import { partnerAPI } from '../../services/api/partiesPartners';
import type { PartyPartner } from '../../core/types/models';
import {
  getMonthlyProfitDistribution,
  type MonthlyProfitDistributionSummary,
} from '../../services/api/partnerDistribution';
import {
  getRuntimeReportMenuParams,
  isReportMenuParamEnabled,
  loadReportMenuParams,
  reportNetAfterOptionalExpenseAndPurchases,
  subscribeReportMenuParams,
  type ReportMenuParams,
} from '../../services/reportMenuParamsService';
import {
  loadPeriodSummaryPartnerSplitPrefs,
  normalizePartnerSplitPrefs,
  savePeriodSummaryPartnerSplitPrefs,
  splitAmountByPartners,
  type PeriodSummaryPartnerSplitPrefs,
} from '../../utils/periodSummaryPartnerSplit';
import { PeriodExpenseShareDetailModal } from './PeriodExpenseShareDetailModal';
import { PeriodSupplierPayablesDetailModal } from './PeriodSupplierPayablesDetailModal';
import { PartnerDetailReportModal } from './PartnerDetailReportModal';
import { PeriodCashInDetailModal } from './PeriodCashInDetailModal';
import { PeriodSummaryDayDetailModal } from './PeriodSummaryDayDetailModal';
import { ReportColumnTable, type ReportColumnTableCol } from './shared/ReportDataGrid';
import { ReportKpiStrip, type ReportKpiItem } from './shared/ReportKpiStrip';

export type PeriodSummaryMode = 'monthly-days' | 'yearly-months';

interface PeriodSummaryRow {
  key: string;
  periodKey: string;
  periodLabel: string;
  saleCount: number;
  revenue: number;
  cash: number;
  card: number;
  /** Satışta cariye yazılan / tahsil edilmeyen tutar (veresiye verilen) */
  veresiye: number;
  discount: number;
  returnsCount: number;
  returnsAmount: number;
  /** Bug 28 — Rezervasyona bağlı peşinat (henüz hizmet verilmemiş avanslar). */
  depositCount: number;
  depositAmount: number;
  expenses: number;
  cashIn: number;
  // cariTahsilat alanı kullanıcı talebi ile 2026-10-03'te rapordan kaldırıldı.
  // Ciro/Gider/Alış formülü ve CH_TAHSILAT modal bağlantısı (PeriodCashInDetailModal)
  // korunuyor; yalnızca grid'de ayrı kolon gösterimi iptal edildi.
  purchases: number;
  netRemaining: number;
  partnerShares: Record<string, number>;
  expenseShares: Record<string, number>;
}

function hasPeriodActivity(row: Pick<PeriodSummaryRow, 'saleCount' | 'revenue' | 'expenses' | 'cashIn' | 'purchases'>): boolean {
  return row.saleCount > 0 || row.revenue > 0 || row.expenses > 0 || row.cashIn > 0 || row.purchases > 0;
}

function isRemovedSaleStatus(status: unknown): boolean {
  const st = String(status ?? '').toLowerCase();
  return st === 'cancelled' || st === 'canceled' || st === 'refunded';
}

function daysInMonthKeys(year: number, month: number): string[] {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return Array.from({ length: lastDay }, (_, i) => {
    const dd = String(i + 1).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  });
}

function monthsInYearKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

function monthRangeFromPicker(value: string): { start: string; end: string } | null {
  const m = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const start = `${m[1]}-${m[2]}-01`;
  const endDay = new Date(year, month, 0).getDate();
  const end = `${m[1]}-${m[2]}-${String(endDay).padStart(2, '0')}`;
  return { start, end };
}

function yearRangeFromPicker(year: number): { start: string; end: string } | null {
  if (!Number.isFinite(year) || year < 1990 || year > 2100) return null;
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function saleMonthKey(date: string | Date | undefined): string {
  const k = localCalendarDateKey(date);
  return k ? k.slice(0, 7) : '';
}

function expenseDayKey(raw: string | undefined | null): string {
  return toSqlDateInputString(raw || '') || '';
}

/**
 * Günlük Rapor ile aynı satış özeti:
 * - cancelled / refunded aktif satışa girmez
 * - refunded yalnızca iade sayacında
 * - aktif ciro = Σ total − Σ |iade satırı| (status=return / negatif total aktifteyse)
 * - nakit / kart ayrı kovalar; iade peşin satırı abs ile şişirmez
 */
function aggregateSales(
  sales: Sale[],
  bucketKey: (s: Sale) => string,
  completedAppointmentIds: Set<string> = new Set(),
) {
  const map = new Map<string, {
    saleCount: number; revenue: number; cash: number; card: number; veresiye: number; discount: number;
    returnsCount: number; returnsAmount: number;
    // Bug 28 — Rezervasyon peşinatı ayrı toplanır (henüz hizmet verilmemiş avanslar)
    depositCount: number; depositAmount: number;
  }>();

  const bump = (key: string) => {
    const row = map.get(key) || {
      saleCount: 0, revenue: 0, cash: 0, card: 0, veresiye: 0, discount: 0,
      returnsCount: 0, returnsAmount: 0,
      depositCount: 0, depositAmount: 0,
    };
    map.set(key, row);
    return row;
  };

  for (const s of sales) {
    const st = String(s.status ?? '').toLowerCase();
    if (st === 'cancelled' || st === 'canceled' || st === 'silindi' || st === 'iptal') continue;
    const ft = String((s as any).fiche_type ?? '');
    if (ft === 'opening_balance' || ft === 'purchase_invoice') continue;
    const key = bucketKey(s);
    if (!key) continue;

    const row = bump(key);
    const total = Number(s.total) || 0;
    const absTotal = Math.abs(total);
    const isReturn = isReturnSale(s);

    // Bug 29 follow-up: Ciro kök neden. Önceki kod Ciro'dan iade için iki
    // kez düşüyordu (`row.revenue += total` ile negatifi ekle, sonra
    // `if (isReturn) row.revenue -= absTotal` ile tekrar düş) — bu
    // double-counting Ciro'yu hatalı azaltıyordu. Şimdi:
    // - Normal satış: total pozitif, Ciro'ya eklenir.
    // - İade: total negatif (signedTotal); Ciro'ya yalnızca negatifi
    //   eklenir (toplam = Ciro − iade amount). İade bug yok; returnsCount/
    //   returnsAmount ayrıca takip edilir.
    if (isReturn) {
      row.returnsCount += 1;
      row.returnsAmount += absTotal;
    }

    // Günlük: refunded `isRemovedSaleStatus` ile aktif dışı
    if (st === 'refunded') continue;

    // Bug 28 — Peşinat: tamamlanmış randevuya bağlı avans Ciro'ya
    // eklenir (Toplam Ciro = avans + kalan); depositLabel'dan çıkar.
    // Tamamlanmamış randevuya bağlı avans hâlâ depositLabel'da görünür.
    if (isDepositSale(s)) {
      const linkedApt = String((s as any).linked_appointment_id ?? '').trim();
      const isCompletedLinked = linkedApt && completedAppointmentIds.has(linkedApt);
      if (isCompletedLinked && !isReturn) {
        row.revenue += absTotal;
        row.saleCount += 1;
        const split = saleCollectedSplit(s);
        row.cash += split.cash;
        row.card += split.card;
        row.veresiye += Number(split.remaining) || 0;
      } else {
        row.depositCount += 1;
        row.depositAmount += absTotal;
      }
      continue;
    }

    if (!isReturn) {
      row.saleCount += 1;
      row.discount += Number(s.discount) || 0;
    }

    row.revenue += total;
    const split = saleCollectedSplit(s);
    row.cash += split.cash;
    row.card += split.card;
    // Veresiye verilen = cariye kalan (iade satırında şişirmemek için yalnız satış)
    if (!isReturn) {
      row.veresiye += Number(split.remaining) || 0;
    }
  }
  return map;
}

function aggregateExpenses(
  expenses: Awaited<ReturnType<typeof expenseAPI.getAll>>,
  bucketKey: (e: (typeof expenses)[number]) => string
) {
  const map = new Map<string, number>();
  for (const e of expenses) {
    const key = bucketKey(e);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(e.amount) || 0));
  }
  return map;
}

function aggregatePurchases(invoices: Invoice[], bucketKey: (inv: Invoice) => string) {
  const map = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.is_cancelled || isRemovedSaleStatus(inv.status)) continue;
    const key = bucketKey(inv);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(inv.total_amount ?? inv.total) || 0));
  }
  return map;
}

async function fetchPeriodPurchases(start: string, end: string): Promise<Invoice[]> {
  const all: Invoice[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const result = await invoicesAPI.getPaginated({
      page,
      pageSize: 5000,
      startDate: start,
      endDate: end,
      invoiceCategory: 'Alis',
      includeCancelled: false,
    });
    all.push(...(result.data || []));
    totalPages = Math.max(1, result.totalPages || 1);
    if (!result.data?.length) break;
    page += 1;
  }
  return all;
}

interface PeriodSummaryReportProps {
  mode: PeriodSummaryMode;
  currency: string;
}

export function PeriodSummaryReport({ mode, currency }: PeriodSummaryReportProps) {
  const { tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const todayKey = localTodayDateKey();
  const defaultMonth = todayKey.slice(0, 7);
  const defaultYear = parseInt(todayKey.slice(0, 4), 10);

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [supplierDetailOpen, setSupplierDetailOpen] = useState(false);
  const [partnerSplit, setPartnerSplit] = useState<PeriodSummaryPartnerSplitPrefs>(() =>
    loadPeriodSummaryPartnerSplitPrefs(),
  );
  const [partners, setPartners] = useState<PartyPartner[]>([]);
  const [expenseDetail, setExpenseDetail] = useState<{ title: string; periodKey: string | null } | null>(null);
  const [partnerDetail, setPartnerDetail] = useState<PartyPartner | null>(null);
  const [cashInDetail, setCashInDetail] = useState<{ title: string; periodKey: string | null } | null>(null);
  const [dayDetail, setDayDetail] = useState<{ title: string; date: string } | null>(null);
  // Çift tıklama flash'ını önlemek için tek-tıklamayı 220ms geciktir.
  const dayClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (dayClickTimerRef.current) {
        clearTimeout(dayClickTimerRef.current);
        dayClickTimerRef.current = null;
      }
    };
  }, []);
  const [reportMenuParams, setReportMenuParams] = useState<ReportMenuParams>(() =>
    getRuntimeReportMenuParams(),
  );

  useEffect(() => {
    void loadReportMenuParams().then((p) => setReportMenuParams(p));
    return subscribeReportMenuParams((p) => setReportMenuParams(p));
  }, []);

  const showPeriodCardRevenue = isReportMenuParamEnabled(
    'period-summary-card-total-revenue',
    reportMenuParams,
  );
  const showPeriodCardExpenses = isReportMenuParamEnabled(
    'period-summary-card-total-expenses',
    reportMenuParams,
  );
  const showPeriodCardPurchases = isReportMenuParamEnabled(
    'period-summary-card-period-purchases',
    reportMenuParams,
  );
  const showPeriodCardSupplierPayables = isReportMenuParamEnabled(
    'period-summary-card-supplier-payables',
    reportMenuParams,
  );
  const showPeriodCardNet = isReportMenuParamEnabled('period-summary-card-net', reportMenuParams);
  const showPeriodCardPaymentSplit = isReportMenuParamEnabled(
    'period-summary-card-payment-split',
    reportMenuParams,
  );
  const showPeriodCardCashIn = isReportMenuParamEnabled(
    'period-summary-card-cash-in',
    reportMenuParams,
  );

  const partnerSlices = useMemo(
    () =>
      partners.map((p) => ({
        id: p.id,
        name: p.name || p.code || p.id,
        sharePct: Number(p.share_pct) || 0,
      })),
    [partners],
  );
  const partnerPctTotal = useMemo(
    () => Math.round(partnerSlices.reduce((s, p) => s + p.sharePct, 0) * 100) / 100,
    [partnerSlices],
  );

  const updatePartnerSplit = useCallback((patch: Partial<PeriodSummaryPartnerSplitPrefs>) => {
    setPartnerSplit((prev) => {
      let majorPct = patch.majorPct ?? prev.majorPct;
      let minorPct = patch.minorPct ?? prev.minorPct;
      if (patch.majorPct != null && patch.minorPct == null) {
        minorPct = 100 - majorPct;
      } else if (patch.minorPct != null && patch.majorPct == null) {
        majorPct = 100 - minorPct;
      }
      const next = normalizePartnerSplitPrefs(
        {
          enabled: patch.enabled ?? prev.enabled,
          majorPct,
          minorPct,
        },
        { defaultEnabled: false },
      );
      savePeriodSummaryPartnerSplitPrefs(next);
      return next;
    });
  }, []);

  const periodRange = useMemo(() => {
    if (mode === 'monthly-days') return monthRangeFromPicker(selectedMonth);
    return yearRangeFromPicker(selectedYear);
  }, [mode, selectedMonth, selectedYear]);

  const queryClient = useQueryClient();

  // Ortak sorgu parametreleri — ledger snapshot değişmez, sorgu tazelenir.
  const queryCommon = useMemo(
    () => ({
      staleTime: 0,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    }),
    [],
  );

  const firmKey = selectedFirm?.firm_nr ?? null;
  const targetYear = mode === 'monthly-days' ? parseInt(selectedMonth.slice(0, 4), 10) : selectedYear;
  const targetMonth = mode === 'monthly-days' ? parseInt(selectedMonth.slice(5, 7), 10) : 0;
  const isMonthlyProfitEligible =
    mode === 'monthly-days' && Number.isFinite(targetYear) && Number.isFinite(targetMonth) && targetMonth >= 1 && targetMonth <= 12;

  // sales referansı useQuery.data üzerinden geliyor (aşağıdaki salesQuery) — refactor 7a34520d sonrası
  // Ciro satışları — iade Hariç (Bug 29 follow-up). İade Ciro'da negatifti ve
  // aggregateSales çift düşme uyguladığı için Ciro hatalı azalıyordu
  // (3.315.370 → 2.173.250). `getSalesOnlyByDateRange` iade Hariç Satis döner.
  const salesQuery = useQuery({
    queryKey: ['periodSummary', 'sales', firmKey, periodRange?.start, periodRange?.end],
    queryFn: async () => {
      const rows = await salesAPI.getSalesOnlyByDateRange(periodRange!.start, periodRange!.end);
      return Array.isArray(rows) ? (rows as Sale[]) : [];
    },
    enabled: !!periodRange,
    ...queryCommon,
  });

  // Tamamlanmış randevular — deposit satırlar Ciro'ya eklensin.
  const appointmentsQuery = useQuery({
    queryKey: ['periodSummary', 'appointments', firmKey, periodRange?.start, periodRange?.end],
    queryFn: async () => {
      try {
        const rows = await beautyService.getAppointmentsInRange(
          periodRange!.start,
          periodRange!.end,
        );
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },
    enabled: !!periodRange,
    ...queryCommon,
  });
  const appointments = appointmentsQuery.data ?? [];

  // Gider kartı — tarih aralığı
  const expensesBaseQuery = useQuery({
    queryKey: ['periodSummary', 'expenses', firmKey, periodRange?.start, periodRange?.end],
    queryFn: async () => {
      const rows = await expenseAPI.getAll({
        startDate: periodRange!.start,
        endDate: periodRange!.end,
      });
      return Array.isArray(rows) ? (rows as Expense[]) : [];
    },
    enabled: !!periodRange,
    ...queryCommon,
  });

  // Kasa çıkışları — bağlanmamış cash-out merge için
  const cashLinesQuery = useQuery({
    queryKey: ['periodSummary', 'cashLines', firmKey, periodRange?.start, periodRange?.end],
    queryFn: async () => {
      const rows = await fetchKasaIslemleri({
        baslangic_tarihi: periodRange!.start,
        bitis_tarihi: `${periodRange!.end}T23:59:59`,
      }).catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    enabled: !!periodRange,
    ...queryCommon,
  });

  const expenses = useMemo(
    () =>
      mergeExpensesWithCashOuts(
        expensesBaseQuery.data ?? [],
        cashLinesQuery.data ?? [],
        // Ferhat datası 72M geri-çevrimi (2026-10-04): Gider kolonuna
        // Gider Yönetimi satırları + tüm kasa çıkışları (CH_ODEME,
        // MAAS_ODEME, AVANS_ODEME, ORTAK_SERMAYE_ODEME, ORTAK_DAGITIM_KAR,
        // GIDER_PUSULASI, KASA_CIKIS) dahil — 780965d6 öncesi 7-kalem
        // davranışına geri dönüldü. CH_TAHSILAT hariç (kasa +, cari -).
        { allowedCashOutTypes: PERIOD_SUMMARY_CASH_OUT_TYPES },
      ),
    [expensesBaseQuery.data, cashLinesQuery.data],
  );

  /** Kasa para girişleri (sign=+1): REPORT_CASH_IN_TYPES — day/month map. */
  const cashInsRows = useMemo(
    () => mergeExpensesWithCashIns(cashLinesQuery.data ?? []),
    [cashLinesQuery.data],
  );
  /**
   * CH_TAHSILAT (cari tahsilatları) — ayrı liste. PeriodCashInDetailModal bunları
   * ana tablonun altında "Cari Tahsilatlar" bölümünde gösterir. REPORT_CASH_IN_TYPES'a
   * eklenmez; ana tablonun toplamı ve cashInMap davranışı değişmez.
   */
  const cariTahsilatRows = useMemo(() => {
    const list = Array.isArray(cashLinesQuery.data) ? cashLinesQuery.data : [];
    const unified: KasaIslemi[] = [];
    for (const cl of list) {
      const type = String(cl.islem_tipi || '').trim().toUpperCase();
      if (type !== 'CH_TAHSILAT') continue;
      const amt = Math.abs(Number(cl.tutar) || 0);
      if (!amt) continue;
      unified.push({ ...cl, tutar: amt, islem_tipi: type });
    }
    return unified;
  }, [cashLinesQuery.data]);
  const cashInMap = useMemo(() => {
    return aggregateCashIns(cashInsRows, mode === 'monthly-days' ? 'day' : 'month');
  }, [cashInsRows, mode]);

  // cariTahsilatMap (gün/ay bazında CH_TAHSILAT toplamı) kullanıcı talebi ile
  // 2026-10-03'te rapor grid'inden kaldırıldı. Modal bağlantısı için
  // cariTahsilatRows hâlâ PeriodCashInDetailModal'a geçiriliyor; sadece
  // tablo kolonu + satır toplamı iptal edildi.
  // const cariTahsilatMap = useMemo(() => {
  //   const map = new Map<string, number>();
  //   for (const cl of Array.isArray(cariTahsilatRows) ? cariTahsilatRows : []) {
  //     const day =
  //       toSqlDateInputString(cl.islem_tarihi || '') ||
  //       localCalendarDateKey(cl.islem_tarihi) ||
  //       '';
  //     if (!day) continue;
  //     const key = mode === 'monthly-days' ? day : day.slice(0, 7);
  //     map.set(key, (map.get(key) || 0) + (Number(cl.tutar) || 0));
  //   }
  //   return map;
  // }, [cariTahsilatRows, mode]);

  // Alış faturaları — sayfalı, hepsi birleştirilir
  const purchasesQuery = useQuery({
    queryKey: ['periodSummary', 'purchases', firmKey, periodRange?.start, periodRange?.end],
    queryFn: () => fetchPeriodPurchases(periodRange!.start, periodRange!.end),
    enabled: !!periodRange,
    ...queryCommon,
  });

  // Tedarikçiler — bakiye listesi
  const suppliersQuery = useQuery({
    queryKey: ['periodSummary', 'suppliers', firmKey],
    queryFn: async () => {
      const rows = await supplierAPI.getAll({ cardType: 'supplier' });
      return Array.isArray(rows) ? (rows as Supplier[]) : [];
    },
    enabled: !!firmKey,
    ...queryCommon,
  });

  // Kâr dağıtımı — "anlık hesap (cache yok)" kartı; refetchInterval ile her dakika tazelenir.
  const monthlyProfitQuery = useQuery({
    queryKey: [
      'periodSummary',
      'monthlyProfit',
      firmKey,
      mode,
      isMonthlyProfitEligible ? targetYear : null,
      isMonthlyProfitEligible ? targetMonth : null,
    ],
    queryFn: async () => {
      try {
        const summary = await getMonthlyProfitDistribution(targetYear, targetMonth);
        return summary;
      } catch (err) {
        console.warn('[PeriodSummaryReport] kâr dağıtımı özeti alınamadı:', err);
        return null;
      }
    },
    enabled: !!firmKey && isMonthlyProfitEligible,
    ...queryCommon,
  });

  const sales = salesQuery.data ?? [];
  const purchases = purchasesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const profitDistribution = monthlyProfitQuery.data ?? null;

  const isAnyFetching =
    salesQuery.isFetching ||
    expensesBaseQuery.isFetching ||
    cashLinesQuery.isFetching ||
    purchasesQuery.isFetching ||
    suppliersQuery.isFetching ||
    (isMonthlyProfitEligible ? monthlyProfitQuery.isFetching : false);

  // Yenile — tüm periodSummary sorgularını invalidate et.
  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['periodSummary'] });
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await partnerAPI.getActive();
        if (!cancelled) setPartners(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error('[PeriodSummaryReport] ortak listesi:', err);
        if (!cancelled) setPartners([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFirm?.firm_nr]);

  const rows = useMemo((): PeriodSummaryRow[] => {
    if (!periodRange) return [];

    // Tamamlanmış randevu id'leri — deposit satırları Ciro'ya eklemek için.
    // İlgili firm/dönem kapsamındaki beauty_appointments.status = 'completed'
    // id'leri.
    const completedAppointmentIds = new Set<string>();
    for (const apt of (appointments as Array<{ id?: string; status?: string }>) || []) {
      if (String(apt?.status ?? '').toLowerCase() === 'completed' && apt.id) {
        completedAppointmentIds.add(String(apt.id));
      }
    }

    const saleMap =
      mode === 'monthly-days'
        ? aggregateSales(sales, (s) => localCalendarDateKey(s.date), completedAppointmentIds)
        : aggregateSales(sales, (s) => saleMonthKey(s.date), completedAppointmentIds);

    const expenseMap =
      mode === 'monthly-days'
        ? aggregateExpenses(expenses, (e) => expenseDayKey(e.expense_date))
        : aggregateExpenses(expenses, (e) => expenseDayKey(e.expense_date).slice(0, 7));

    // cashInMap anahtarı zaten mode'a göre day/month üretildi
    const purchaseMap =
      mode === 'monthly-days'
        ? aggregatePurchases(purchases, (inv) => localCalendarDateKey(inv.invoice_date))
        : aggregatePurchases(purchases, (inv) => saleMonthKey(inv.invoice_date));

    const periodKeys =
      mode === 'monthly-days'
        ? daysInMonthKeys(parseInt(selectedMonth.slice(0, 4), 10), parseInt(selectedMonth.slice(5, 7), 10))
        : monthsInYearKeys(selectedYear);

    const locale = tm('localeCode') || 'tr-TR';

    return periodKeys.map((periodKey) => {
      const sale = saleMap.get(periodKey) || {
        saleCount: 0, revenue: 0, cash: 0, card: 0, veresiye: 0, discount: 0,
        returnsCount: 0, returnsAmount: 0,
      };
      const exp = expenseMap.get(periodKey) || 0;
      const cashIn = cashInMap.get(periodKey) || 0;
      // cariTahsilat satır başına toplamı 2026-10-03 kullanıcı talebi ile kaldırıldı
      // (grid'de Cari Tahsilat kolonu yok). Modal bağlantısı korunuyor.
      const purch = purchaseMap.get(periodKey) || 0;
      const periodLabel =
        mode === 'monthly-days'
          ? formatIsoDateTr(periodKey)
          : new Date(`${periodKey}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

      // Dönem özeti neti: ciro − gider − alışlar.
      // Gider kartı/parametresi kapalıysa gider düşülmez; alış kartı/parametresi
      // kapalıysa alış düşülmez. CH_TAHSILAT (cari tahsilatları) **hariç** —
      // ledger simetrisi (kasa + / cari -) Net Kalan'da nötrdür; PeriodCashInDetailModal
      // alt bölümünde izlenir.
      const netRemaining = reportNetAfterOptionalExpenseAndPurchases(
        sale.revenue,
        exp,
        showPeriodCardExpenses,
        purch,
        showPeriodCardPurchases,
      );

      const shareList = splitAmountByPartners(netRemaining, partnerSlices);
      const partnerShareMap: Record<string, number> = {};
      for (const s of shareList) partnerShareMap[s.id] = s.amount;
      const expForShare = showPeriodCardExpenses ? exp : 0;
      const expShareList = splitAmountByPartners(expForShare, partnerSlices);
      const expenseShareMap: Record<string, number> = {};
      for (const s of expShareList) expenseShareMap[s.id] = s.amount;
      return {
        key: periodKey,
        periodKey,
        periodLabel,
        saleCount: sale.saleCount,
        revenue: sale.revenue,
        cash: sale.cash,
        card: sale.card,
        veresiye: sale.veresiye,
        discount: sale.discount,
        returnsCount: sale.returnsCount,
        returnsAmount: sale.returnsAmount,
        // Bug 28 — Rezervasyon peşinat (klon kolon olarak grid'de gösterilecek)
        depositCount: sale.depositCount,
        depositAmount: sale.depositAmount,
        expenses: exp,
        cashIn,
        // cariTahsilat satır alanı 2026-10-03 kullanıcı talebi ile kaldırıldı.
        purchases: purch,
        netRemaining,
        partnerShares: partnerShareMap,
        expenseShares: expenseShareMap,
      };
    });
  }, [
    mode,
    periodRange,
    sales,
    expenses,
    purchases,
    cashInMap,
    // cariTahsilatMap 2026-10-03 kullanıcı talebi ile kaldırıldı.
    selectedMonth,
    selectedYear,
    tm,
    partnerSlices,
    showPeriodCardExpenses,
    showPeriodCardPurchases,
  ]);

  const totals = useMemo(() => {
    const base = rows.reduce(
      (acc, r) => ({
        saleCount: acc.saleCount + r.saleCount,
        revenue: acc.revenue + r.revenue,
        cash: acc.cash + r.cash,
        card: acc.card + r.card,
        veresiye: acc.veresiye + r.veresiye,
        discount: acc.discount + r.discount,
        returnsCount: acc.returnsCount + r.returnsCount,
        returnsAmount: acc.returnsAmount + r.returnsAmount,
        depositCount: acc.depositCount + r.depositCount,
        depositAmount: acc.depositAmount + r.depositAmount,
        expenses: acc.expenses + r.expenses,
        cashIn: acc.cashIn + r.cashIn,
        // cariTahsilat toplamı 2026-10-03 kullanıcı talebi ile kaldırıldı.
        purchases: acc.purchases + r.purchases,
        netRemaining: acc.netRemaining + r.netRemaining,
      }),
      {
        saleCount: 0, revenue: 0, cash: 0, card: 0, veresiye: 0, discount: 0,
        returnsCount: 0, returnsAmount: 0,
        depositCount: 0, depositAmount: 0,
        expenses: 0, cashIn: 0, purchases: 0, netRemaining: 0,
      }
    );
    const shareList = splitAmountByPartners(base.netRemaining, partnerSlices);
    const partnerShares: Record<string, number> = {};
    for (const s of shareList) partnerShares[s.id] = s.amount;
    const expShareList = splitAmountByPartners(base.expenses, partnerSlices);
    const expenseShares: Record<string, number> = {};
    for (const s of expShareList) expenseShares[s.id] = s.amount;
    return {
      ...base,
      partnerShares,
      expenseShares,
    };
  }, [rows, partnerSlices, showPeriodCardExpenses, showPeriodCardPurchases]);

  const supplierPayables = useMemo(() => {
    const payable = suppliers.reduce((s, r) => s + Math.max(Number(r.balance) || 0, 0), 0);
    const shares = splitAmountByPartners(payable, partnerSlices);
    const byId: Record<string, number> = {};
    for (const sh of shares) byId[sh.id] = sh.amount;
    return {
      payable,
      byId,
      count: suppliers.filter((s) => Number(s.balance) > 0).length,
    };
  }, [suppliers, partnerSlices]);

  const money = (v: number) => `${formatNumber(v, 0, false)} ${currency}`;
  const showPartnerCols = partnerSplit.enabled && partnerSlices.length > 0;
  const partnerColColors = ['text-blue-700', 'text-indigo-700', 'text-violet-700', 'text-cyan-700', 'text-teal-700'];

  type PeriodSummaryGridRow = PeriodSummaryRow & Record<string, number | string | Record<string, number>>;

  const gridRows = useMemo((): PeriodSummaryGridRow[] => {
    return rows.map((r) => ({
      ...r,
      ...Object.fromEntries(
        partnerSlices.map((p) => [`partner-${p.id}`, r.partnerShares[p.id] ?? 0] as const),
      ),
    }));
  }, [rows, partnerSlices]);

  const tableColumns = useMemo((): ReportColumnTableCol<PeriodSummaryGridRow>[] => {
    const base: ReportColumnTableCol<PeriodSummaryGridRow>[] = [
      {
        key: 'periodLabel',
        header: mode === 'monthly-days' ? tm('rptPeriodColDay') : tm('rptPeriodColMonth'),
        size: 160,
      },
      {
        key: 'dayDetailAction',
        header: tm('rptPeriodDayDetailOpen') || 'Detay',
        size: 88,
        cell: (row) => {
          if (!hasPeriodActivity(row)) return '—';
          return (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
              title={tm('rptPeriodDayDetailOpen')}
              onClick={(e) => {
                e.stopPropagation();
                setDayDetail({
                  title: `${row.periodLabel} · ${tm('rptPeriodDayDetailTitle')}`,
                  date: row.periodKey,
                });
              }}
            >
              <FileSearch className="w-3 h-3" aria-hidden />
              {tm('rptPeriodDayDetailOpen')}
            </button>
          );
        },
      },
      {
        key: 'saleCount',
        header: tm('rptPeriodColSaleCount'),
        type: 'number',
        align: 'right',
        size: 90,
        footerSum: true,
        footerFormat: (n) => String(Math.round(n)),
        cell: (row) => (row.saleCount > 0 ? row.saleCount : '—'),
      },
      {
        key: 'revenue',
        header: `${tm('rptPeriodColRevenue')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => (row.revenue > 0 ? money(row.revenue) : '—'),
      },
      {
        key: 'cash',
        header: `${tm('rptPeriodColCash')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => (row.cash > 0 ? money(row.cash) : '—'),
      },
      {
        key: 'card',
        header: `${tm('rptPeriodColCard')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => (row.card > 0 ? money(row.card) : '—'),
      },
      {
        key: 'veresiye',
        header: `${tm('rptPeriodColVeresiye')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => (
          <span className="text-amber-700" title={tm('veresiyeVerilen')}>
            {money(n)}
          </span>
        ),
        cell: (row) =>
          row.veresiye > 0 ? (
            <span className="text-amber-700 font-medium" title={tm('veresiyeVerilen')}>
              {money(row.veresiye)}
            </span>
          ) : (
            '—'
          ),
      },
      // Bug 28 — Rezervasyon peşinatı (varsayılan AÇIK). Veresiye
      // kolonunun yanında yer alır; alt toplam satırında ayın toplamı görünür.
      {
        key: 'deposit',
        header: `${tm('dailyDepositCollected') || 'Peşinat'} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) =>
          n > 0 ? (
            <span className="text-cyan-700">{money(n)}</span>
          ) : (
            '—'
          ),
        cell: (row) =>
          row.depositAmount > 0 ? (
            <span
              className="text-cyan-700 font-medium"
              title={`${tm('dailyDepositCountShort') || 'adet'}: ${row.depositCount}`}
            >
              {money(row.depositAmount)}
            </span>
          ) : (
            '—'
          ),
        meta: { defaultVisible: true },
      },
      // Bug 28 follow-up — Avans/Peşinat Ödemeleri (adet) kolonu.
      // Tutarın yanında kaç adet peşinat alındığını gösterir; alt toplam
      // satırında ayın toplam adedi görünür.
      {
        key: 'depositCount',
        header: tm('avansPesinatPayments') || 'Avans Peşinat Ödemeleri',
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) =>
          n > 0 ? (
            <span className="text-cyan-700">{Math.round(n)}</span>
          ) : (
            '—'
          ),
        cell: (row) =>
          row.depositCount > 0 ? (
            <span className="text-cyan-700 font-medium">{row.depositCount}</span>
          ) : (
            '—'
          ),
        meta: { defaultVisible: true },
      },
      {
        key: 'discount',
        header: `${tm('rptPeriodColDiscount')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => (row.discount > 0 ? money(row.discount) : '—'),
      },
      {
        key: 'returnsAmount',
        header: `${tm('rptPeriodColReturns') || 'İade'} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) =>
          n > 0 ? (
            <span className="text-orange-600" title={`${totals.returnsCount} ${tm('rptPeriodColReturnsCount') || 'iade adedi'}`}>
              {money(n)}
            </span>
          ) : (
            '—'
          ),
        cell: (row) => {
          if (!hasPeriodActivity(row)) return '—';
          return row.returnsAmount > 0 ? (
            <span
              className="text-orange-600"
              title={`${row.returnsCount} ${tm('rptPeriodColReturnsCount') || 'iade adedi'}`}
            >
              {money(row.returnsAmount)}
            </span>
          ) : (
            '—'
          );
        },
      },
      {
        key: 'expenses',
        header: `${tm('rptPeriodColExpenses')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => <span className="text-red-600">{money(n)}</span>,
        cell: (row) => {
          if (!hasPeriodActivity(row)) return '—';
          return (
            <button
              type="button"
              className="text-red-600 underline-offset-2 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setExpenseDetail({
                  title: `${tm('rptPeriodExpenseDetailTitle')} · ${row.periodLabel}`,
                  periodKey: row.periodKey,
                });
              }}
            >
              {money(row.expenses)}
            </button>
          );
        },
      },
      {
        key: 'cashIn',
        header: `${tm('rptPeriodColCashIn')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => (
          <span className="text-emerald-700">{money(n)}</span>
        ),
        cell: (row) => {
          if (!hasPeriodActivity(row) || !(row.cashIn > 0)) return '—';
          return (
            <button
              type="button"
              className="text-emerald-700 font-semibold underline-offset-2 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setCashInDetail({
                  title: `${tm('rptPeriodCashInDetailTitle')} · ${row.periodLabel}`,
                  periodKey: row.periodKey,
                });
              }}
            >
              {money(row.cashIn)}
            </button>
          );
        },
      },
      // Bug 29 — Cari Tahsilat (CH_TAHSILAT) kolonu kullanıcı talebi ile
      // 2026-10-03'te grid'den kaldırıldı. Modal bağlantısı (PeriodCashInDetailModal
      // alt bölümü) ve CH_TAHSILAT veri akışı korunuyor; sadece grid kolonu iptal.
      // {
      //   key: 'cariTahsilat',
      //   header: `${tm('rptPeriodColCariTahsilat') || 'Cari Tahsilat'} (${currency})`,
      //   type: 'number',
      //   align: 'right',
      //   footerSum: true,
      //   footerFormat: (n) =>
      //     n > 0 ? (
      //       <span className="text-cyan-700">{money(n)}</span>
      //     ) : (
      //       '—'
      //     ),
      //   cell: (row) =>
      //     row.cariTahsilat > 0 ? (
      //       <span className="text-cyan-700 font-medium" title={tm('rptPeriodCashInCariTahsilatTitle')}>
      //         {money(row.cariTahsilat)}
      //       </span>
      //     ) : (
      //       '—'
      //     ),
      //   meta: { defaultVisible: true },
      // },
      {
        key: 'purchases',
        header: `${tm('rptPeriodColPurchases')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => <span className="text-amber-700">{money(n)}</span>,
        cell: (row) => {
          if (!hasPeriodActivity(row)) return '—';
          return row.purchases > 0 ? <span className="text-amber-700">{money(row.purchases)}</span> : '—';
        },
      },
      {
        key: 'netRemaining',
        header: `${tm('rptPeriodColNet')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        // Bug 29 follow-up — Footer Net Kalan = Ciro − Gider − Alış.
        // 2026-10-03 kullanıcı talebi: footer etiketi ("Cari Tahsilat Hariç")
        // ve tooltip kaldırıldı; sadece düz Ciro − Gider − Alış sonucu görünür.
        footerFormat: (n) => (
          <span className={n >= 0 ? 'text-emerald-700' : 'text-red-600'}>
            {money(n)}
          </span>
        ),
        cell: (row) => {
          if (!hasPeriodActivity(row)) return '—';
          const cls = row.netRemaining >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold';
          return (
            <span className={cls}>
              {money(row.netRemaining)}
            </span>
          );
        },
      },
    ];

    const filtered = base.filter((col) => {
      const key = col.key;
      if (key === 'revenue') return showPeriodCardRevenue;
      if (key === 'cash' || key === 'card' || key === 'veresiye') return showPeriodCardPaymentSplit;
      if (key === 'expenses') return showPeriodCardExpenses;
      if (key === 'cashIn') return showPeriodCardCashIn;
      if (key === 'purchases') return showPeriodCardPurchases;
      if (key === 'netRemaining') return showPeriodCardNet;
      return true;
    });

    if (!showPartnerCols) return filtered;

    return [
      ...filtered,
      ...partnerSlices.map((p, idx) => {
        const partnerKey = `partner-${p.id}`;
        return {
          key: partnerKey,
          header: `${p.name} (%${p.sharePct}) (${currency})`,
          type: 'number' as const,
          align: 'right' as const,
          footerSum: true,
          footerFormat: (n: number) => (
            <div className="leading-tight">
              <span className={partnerColColors[idx % partnerColColors.length]}>{money(n)}</span>
              <div className="text-[10px] font-semibold text-red-600">
                {tm('rptPeriodExpenseShare')}: {money(totals.expenseShares[p.id] ?? 0)}
              </div>
            </div>
          ),
          cell: (row: PeriodSummaryGridRow) => {
            if (!hasPeriodActivity(row)) return '—';
            const v = row.partnerShares[p.id] ?? 0;
            const expShare = row.expenseShares[p.id] ?? 0;
            const cls = partnerColColors[idx % partnerColColors.length];
            return (
              <div className="leading-tight">
                <span className={`${cls} font-medium`}>{money(v)}</span>
                {expShare ? (
                  <div className="text-[10px] font-semibold text-red-600">
                    {tm('rptPeriodExpenseShare')}: {money(expShare)}
                  </div>
                ) : null}
              </div>
            );
          },
        } satisfies ReportColumnTableCol<PeriodSummaryGridRow>;
      }),
    ];
  }, [
    mode,
    currency,
    tm,
    money,
    showPartnerCols,
    partnerSlices,
    showPeriodCardRevenue,
    showPeriodCardPaymentSplit,
    showPeriodCardExpenses,
    showPeriodCardCashIn,
    showPeriodCardPurchases,
    showPeriodCardNet,
    totals.returnsCount,
    totals.expenseShares,
    partnerColColors,
  ]);

  const title = mode === 'monthly-days' ? tm('aylikGunOzeti') : tm('yillikAyOzeti');

  const kpiItems = useMemo((): ReportKpiItem[] => {
    const items: ReportKpiItem[] = [];

    if (showPeriodCardRevenue) {
      items.push({
        key: 'revenue',
        label: tm('rptPeriodTotalRevenue'),
        value: money(totals.revenue),
        valueClassName: 'text-emerald-700 dark:text-emerald-400',
        hint: `${totals.saleCount} ${tm('rptPeriodColSaleCount').toLowerCase()}`,
      });
    }

    if (showPeriodCardExpenses) {
      items.push({
        key: 'expenses',
        label: tm('rptPeriodTotalExpenses'),
        value: money(totals.expenses),
        valueClassName: 'text-red-600 dark:text-red-400',
        hint: (
          <button
            type="button"
            className="font-semibold text-rose-700 hover:underline dark:text-rose-400"
            onClick={() =>
              setExpenseDetail({ title: tm('rptPeriodExpenseDetailTitle'), periodKey: null })
            }
          >
            {tm('rptPeriodOpenExpenseDetail')}
          </button>
        ),
      });
    }

    if (showPeriodCardCashIn) {
      items.push({
        key: 'cashIn',
        label: tm('rptPeriodCardCashIn'),
        value: money(totals.cashIn),
        valueClassName: 'text-emerald-700 dark:text-emerald-400',
        hint: (
          <button
            type="button"
            className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            onClick={() =>
              setCashInDetail({
                title: tm('rptPeriodCashInDetailTitle'),
                periodKey: null,
              })
            }
          >
            {tm('rptPeriodOpenCashInDetail')}
          </button>
        ),
      });
    }

    if (showPeriodCardPurchases) {
      items.push({
        key: 'purchases',
        label: tm('rptPeriodTotalPurchases'),
        value: money(totals.purchases),
        valueClassName: 'text-amber-700 dark:text-amber-400',
      });
    }

    if (showPeriodCardSupplierPayables) {
      const partnerHints = showPartnerCols
        ? partnerSlices
            .map((p) => `${p.name}: ${money(supplierPayables.byId[p.id] ?? 0)}`)
            .join(' · ')
        : '';
      items.push({
        key: 'supplier-payables',
        label: tm('rptPeriodSupplierOpenDebt'),
        value: money(supplierPayables.payable),
        valueClassName: 'text-amber-800 dark:text-amber-300',
        hint: (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>
              {supplierPayables.count}{' '}
              {tm('rptPeriodSupplierDetailKicker').toLocaleLowerCase('tr-TR')}
            </span>
            {partnerHints ? <span className="text-amber-800 dark:text-amber-300">{partnerHints}</span> : null}
            <button
              type="button"
              className="font-semibold text-amber-800 hover:underline dark:text-amber-300"
              onClick={() => setSupplierDetailOpen(true)}
            >
              {tm('rptPeriodOpenSupplierDetail')}
            </button>
          </span>
        ),
      });
    }

    if (showPeriodCardNet) {
      items.push({
        key: 'net',
        label: tm('rptPeriodColNet'),
        value: money(totals.netRemaining),
        valueClassName:
          totals.netRemaining >= 0
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400',
      });
    }

    // Kâr Dağıtımı — anlık hesap (cache yok)
    if (mode === 'monthly-days' && profitDistribution) {
      const pd = profitDistribution;
      const cls =
        pd.netDistribution >= 0
          ? 'text-violet-700 dark:text-violet-300'
          : 'text-orange-700 dark:text-orange-400';
      const modeLabelKey = pd.autoMode
        ? 'rptPeriodProfitDistributionAuto'
        : 'rptPeriodProfitDistributionManual';
      const modeBadgeCls = pd.autoMode
        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
      items.push({
        key: 'profit-distribution',
        label: tm('rptPeriodProfitDistribution'),
        value: money(pd.netDistribution),
        valueClassName: cls,
        className: 'border-violet-200 bg-violet-50/40 dark:border-violet-800 dark:bg-violet-950/20',
        hint: (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${modeBadgeCls}`}>
              {tm(modeLabelKey)}
            </span>
            <span className="text-emerald-700 dark:text-emerald-400">
              +{money(pd.karTotal)}
            </span>
            <span className="text-orange-700 dark:text-orange-400">
              −{money(pd.zararTotal)}
            </span>
            {pd.lastRun ? (
              <span className="text-slate-500 dark:text-slate-400">
                {tm('rptPeriodProfitDistributionLastRun').replace('{date}', pd.lastRun)}
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                {tm('rptPeriodProfitDistributionZero')}
              </span>
            )}
          </span>
        ),
      });
    }

    if (showPartnerCols) {
      partnerSlices.forEach((p, idx) => {
        const fullPartner = partners.find((x) => x.id === p.id);
        const partnerBalance = Number(fullPartner?.balance || 0);
        const isNeg = partnerBalance < 0;
        items.push({
          key: `partner-${p.id}`,
          label: `${p.name} (%${p.sharePct})`,
          value: money(totals.partnerShares[p.id] ?? 0),
          valueClassName: partnerColColors[idx % partnerColColors.length],
          className: 'border-blue-100 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/30',
          hint: (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-red-600 dark:text-red-400">
                {tm('rptPeriodExpenseShare')}: {money(totals.expenseShares[p.id] ?? 0)}
              </span>
              {fullPartner ? (
                <>
                  <span className={`font-mono font-bold ${isNeg ? 'text-red-700' : 'text-emerald-700'}`}>
                    DB: {money(partnerBalance)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPartnerDetail(fullPartner)}
                    className="inline-flex items-center gap-0.5 font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                  >
                    <Eye className="w-3 h-3" />
                    Detay
                  </button>
                </>
              ) : null}
            </span>
          ),
        });
      });
    }

    if (showPeriodCardPaymentSplit) {
      items.push({
        key: 'payment-split',
        label: tm('rptPeriodPaymentSplit'),
        value: (
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {tm('rptPeriodColCash')}: {money(totals.cash)}
          </span>
        ),
        hint: `${tm('rptPeriodColCard')}: ${money(totals.card)} · ${tm('rptPeriodColVeresiye')}: ${money(totals.veresiye)}`,
      });
    }

    return items;
  }, [
    showPeriodCardRevenue,
    showPeriodCardExpenses,
    showPeriodCardPurchases,
    showPeriodCardSupplierPayables,
    showPeriodCardNet,
    showPeriodCardPaymentSplit,
    showPeriodCardCashIn,
    showPartnerCols,
    partnerSlices,
    partners,
    supplierPayables,
    totals,
    money,
    tm,
    partnerColColors,
    mode,
    profitDistribution,
  ]);

  const kpiColumns = Math.min(Math.max(kpiItems.length, 2), 6) as 2 | 3 | 4 | 5 | 6;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-white px-3 py-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <button
              type="button"
              onClick={refreshAll}
              title={tm('rptPeriodRefresh') || 'Yenile'}
              aria-label={tm('rptPeriodRefresh') || 'Yenile'}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={isAnyFetching}
            >
              <RefreshCw className={`h-3 w-3 ${isAnyFetching ? 'animate-spin' : ''}`} aria-hidden />
              {tm('rptPeriodRefresh') || 'Yenile'}
            </button>
          </div>
          <label className="flex flex-col gap-0.5 min-w-[9rem]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {mode === 'monthly-days' ? tm('rptPeriodSelectMonth') : tm('rptPeriodSelectYear')}
            </span>
            {mode === 'monthly-days' ? (
              <input
                type="month"
                min="1990-01"
                max="2100-12"
                value={selectedMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setSelectedMonth(v);
                }}
                className="h-8 px-2 text-sm rounded border outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            ) : (
              <input
                type="number"
                min={1990}
                max={2100}
                value={selectedYear}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  if (Number.isFinite(y)) setSelectedYear(y);
                }}
                className="h-8 w-28 px-2 text-sm rounded border outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            )}
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none font-medium text-slate-700">
          <input
            type="checkbox"
            checked={partnerSplit.enabled}
            onChange={(e) => updatePartnerSplit({ enabled: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          {tm('rptPeriodPartnerSplitEnable')}
        </label>
        {partnerSplit.enabled ? (
          partnerSlices.length > 0 ? (
            <span>
              {tm('rptPeriodPartnerSplitFromCards')}
              {Math.abs(partnerPctTotal - 100) > 0.01
                ? ` ${tm('rptPeriodPartnerPctWarn').replace('{total}', String(partnerPctTotal))}`
                : ''}
            </span>
          ) : (
            <span className="text-amber-700">{tm('rptPeriodPartnerNoPartners')}</span>
          )
        ) : null}
      </div>

      {kpiItems.length > 0 ? (
        <ReportKpiStrip columns={kpiColumns} items={kpiItems} itemClassName="shadow-none" />
      ) : null}

      <div className="relative rounded-lg border bg-white p-2">
        {isAnyFetching ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/70">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden />
          </div>
        ) : null}
        <ReportColumnTable
          data={gridRows}
          columns={tableColumns}
          height={560}
          footerLabel={tm('rptPeriodTotalRow')}
          storageNamespace="period-summary"
          onRowClick={(row) => {
            // Gün satırına TEK tıklayınca açılan ana drill-down:
            // CH_TAHSILAT + Nakit Giriş + CH_ODEME listesi.
            // Çift tıklama flash'ı önlemek için 220ms gecikme.
            if (!hasPeriodActivity(row)) return;
            if (dayClickTimerRef.current) {
              clearTimeout(dayClickTimerRef.current);
            }
            const captured = row;
            dayClickTimerRef.current = setTimeout(() => {
              setDayDetail({
                title: `${captured.periodLabel} · ${tm('rptPeriodDayDetailTitle')}`,
                date: captured.periodKey,
              });
              dayClickTimerRef.current = null;
            }, 220);
          }}
          onRowDoubleClick={(row) => {
            // Çift tıklayınca eski masraf paylaşımı detayı (ortak oranları).
            if (dayClickTimerRef.current) {
              clearTimeout(dayClickTimerRef.current);
              dayClickTimerRef.current = null;
            }
            if (!hasPeriodActivity(row) || !(row.expenses > 0) || !partnerSlices.length) return;
            setExpenseDetail({
              title: `${tm('rptPeriodExpenseDetailTitle')} · ${row.periodLabel}`,
              periodKey: row.periodKey,
            });
          }}
        />
      </div>

      {expenseDetail ? (
        <PeriodExpenseShareDetailModal
          expenses={expenses}
          partners={partnerSlices}
          periodKey={expenseDetail.periodKey}
          title={expenseDetail.title}
          currency={currency}
          onClose={() => setExpenseDetail(null)}
        />
      ) : null}
      {supplierDetailOpen ? (
        <PeriodSupplierPayablesDetailModal
          suppliers={suppliers}
          partners={partnerSlices}
          currency={currency}
          onClose={() => setSupplierDetailOpen(false)}
        />
      ) : null}
      {partnerDetail && periodRange ? (
        <PartnerDetailReportModal
          partner={partnerDetail}
          periodStart={periodRange.start}
          periodEnd={periodRange.end}
          currency={currency}
          onClose={() => setPartnerDetail(null)}
        />
      ) : null}
      {cashInDetail ? (
        <PeriodCashInDetailModal
          cashLines={cashInsRows}
          cariTahsilatlar={cariTahsilatRows}
          periodKey={cashInDetail.periodKey}
          title={cashInDetail.title}
          currency={currency}
          onClose={() => setCashInDetail(null)}
        />
      ) : null}
      {dayDetail ? (
        <PeriodSummaryDayDetailModal
          date={dayDetail.date}
          title={dayDetail.title}
          currency={currency}
          cashLines={cashLinesQuery.data ?? []}
          onClose={() => setDayDetail(null)}
        />
      ) : null}
    </div>
  );
}
