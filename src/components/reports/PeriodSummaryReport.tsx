import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileSearch, Loader2, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatNumber } from '../../utils/formatNumber';
import { expenseAPI, type Expense } from '../../services/api/expenses';
import { salesAPI } from '../../services/api/sales';
import { beautyService } from '../../services/beautyService';
import { invoicesAPI } from '../../services/api/invoices';
import { supplierAPI } from '../../services/api/suppliers';
import { fetchKasaIslemleri, type KasaIslemi } from '../../services/api/kasa';
import { postgres, ERP_SETTINGS } from '../../services/postgres';
import { isReturnSale } from '../../utils/posZReport';
import { isDepositSale } from '../../utils/reportDepositFilter';
import { saleCollectedSplit } from '../../utils/saleCollectedAmounts';
// saleCollected kaldırıldı (2026-10-12 — Ciro = brüt belge tutarı;
// Ciro için `saleCollected` yerine doğrudan `Math.abs(s.total)` kullanılıyor).
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
  reportNetCiroMinusGider,
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
import { buildClosedAppointmentDepositMap, buildReservationMap } from '../../utils/reportReservationPending';
import { buildAvansDepositsMap, buildClosedReservationInfoMap } from '../../utils/avansReservationExclude';

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
  /**
   * 14.10.2026 — Rezervasyon hizmet brüt tutarı (henüz fişi kesilmemiş
   * randevuların toplam hizmet fiyatı). Ciro'ya yansımaz, sadece bilgi
   * kolonu olarak görünür.
   */
  reservationGross: number;
  /**
   * 14.10.2026 19:18 — Rezervasyon miktarı (adet). Brütten bağımsız,
   * ayrı kolon olarak gösterilir. Ciro'ya yansımaz.
   */
  reservationCount: number;
  /**
   * 14.10.2026 19:35 — Rezervasyon peşinatı (depozito). Brütten ayrı
   * kolon olarak gösterilir; Ciro'ya yansımaz (ayrı bilgi kolonu).
   */
  reservationDeposit: number;
  /** Rezervasyon kalan (brüt − peşinat). Ciro'ya yansımaz; bilgi kolonu. */
  reservationPending: number;
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

function hasPeriodActivity(row: Pick<PeriodSummaryRow,
  'saleCount' | 'revenue' | 'cash' | 'card' | 'veresiye' | 'discount' |
  'returnsAmount' | 'depositCount' | 'depositAmount' |
  'reservationGross' | 'reservationCount' | 'reservationDeposit' | 'reservationPending' |
  'expenses' | 'cashIn' | 'purchases' | 'netRemaining'
  >): boolean {
  // Bug 30 — Aylık Gün Özeti tablosu boş (hücreler "—") ama KPI dolu kök neden.
  // Önceki filtre yalnızca Ciro/Gider/Kasa Girişi/Alış'a bakıyordu:
  //   `saleCount || revenue || expenses || cashIn || purchases`
  // Oysa şu senaryolarda satır "etkinlik yok" olarak işaretleniyordu:
  //   - Sadece peşinat (avans) Ciro'ya yansımadan alındı → Ciro=0, satırda yalnız
  //     `depositAmount` ve/veya `cash`/`card` (toplam satırda görünür ama gün
  //     satırı boş kalırdı).
  //   - Sadece kart ödeme (Ciro başka fatura/avansla) → `card>0` ama Ciro=0.
  //   - Sadece iade → `returnsAmount>0` ama Ciro=0.
  //   - Yalnız veresiye (cariye kalan) → `veresiye>0` ama Ciro'ya yansımaz.
  // Şimdi: hücrelerin herhangi birinde finansal değer varsa satır "aktif" sayılır.
  return (
    row.saleCount > 0 ||
    row.revenue > 0 ||
    row.cash > 0 ||
    row.card > 0 ||
    row.veresiye > 0 ||
    row.discount > 0 ||
    row.returnsAmount > 0 ||
    row.depositCount > 0 ||
    row.depositAmount > 0 ||
    row.reservationGross > 0 ||
    row.reservationCount > 0 ||
    row.reservationDeposit > 0 ||
    row.reservationPending > 0 ||
    row.expenses > 0 ||
    row.cashIn > 0 ||
    row.purchases > 0
    // netRemaining türetilmiş; bilinçli olarak Hariç (gider/ciro 0 ise 0).
  );
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
 * - aktif ciro = Σ |sale.total| (brüt belge tutarı, 2026-10-12)
 * - iade Ciro'dan düşer (status=return veya negatif total Hariç tutulur)
 * - nakit / kart ayrı kovalar; iade peşin satırı abs ile şişirmez
 */
function aggregateSales(
  sales: Sale[],
  bucketKey: (s: Sale) => string,
  completedAppointmentIds: Set<string> = new Set(),
  /**
   * 16.10.2026 — `sale.id` → uygulanan avans toplamı (IQD, mutlak). Bu
   * faturaya bağlanmış `cari_avans.status='applied'` satırları toplamı.
   * saleCollectedSplit'e `appliedAvans` olarak geçirilir; DUBLE senaryosu
   * gibi kalan tutarın veresiye gibi görünmesini engeller.
   * Opsiyonel (default boş map) — geriye dönük uyumlu.
   */
  appliedAvansBySaleId: Map<string, number> = new Map(),
) {
  const map = new Map<string, {
    saleCount: number; revenue: number; cash: number; card: number; veresiye: number; discount: number;
    returnsCount: number; returnsAmount: number;
    // Bug 28 — Rezervasyon peşinatı ayrı toplanır (henüz hizmet verilmemiş avanslar)
    depositCount: number; depositAmount: number;
    // 14.10.2026 — Rezervasyon brüt/kalan (faturası kesilecek tutar)
    reservationGross: number; reservationPending: number;
  }>();

  const bump = (key: string) => {
    const row = map.get(key) || {
      saleCount: 0, revenue: 0, cash: 0, card: 0, veresiye: 0, discount: 0,
      returnsCount: 0, returnsAmount: 0,
      depositCount: 0, depositAmount: 0,
      reservationGross: 0, reservationPending: 0,
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
        // Ciro = brüt belge tutarı (2026-10-12 kullanıcı kararı). Deposit
        // fiş tamamlanmış randevuya bağlıysa Ciro'ya eklenir; avans zaten
        // tahsil edildiği için brüt = tahsilat ile aynı şey.
        row.revenue += absTotal;
        row.saleCount += 1;
        const split = saleCollectedSplit(
          s,
          appliedAvansBySaleId.get(String(s.id)) || 0,
        );
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

    // Bug-fix 2026-10-12 — Ciro = brüt belge tutarı (`sale.total`).
    // 2026-10-11 geri-çevrimi Ciro'yu tahsil edilen nakit olarak değiştirmişti
    // (veresiye kalan Ciro'ya girmiyordu). Kullanıcı yeni kararı: Ciro brüt
    // belge tutarı olmalı; veresiye kalan dahil edilir, "Net Kalan" kolonu
    // (Ciro − Gider) doğru olsun diye Ciro 65.000 → 100.000 olarak güncellenir.
    //
    // Trade-off (bilinçli):
    //  2026-10-04 geri-çevrimi: "Ciro = brüt belge tutarı veresiyeyi de dahil
    //  eder, Ciro'yu 26M'a şişirir". Bu biliniyor; Ciro brüt bilinçli olarak
    //  isteniyor (Net Kalan doğru olsun diye). Veresiye Kasa'ya henüz
    //  girmediyse Ciro yine de yansır, Net Kalan = Ciro − Gider.
    //  Tahsilat (nakit/kart/veresiye ayrımı) ayrı kolonlarda korunur.
    //
    // Günlük Rapor dailyTotal ile aynı semantik: brüt belge tutarı − iade.
    row.revenue += absTotal;
    const split = saleCollectedSplit(
      s,
      appliedAvansBySaleId.get(String(s.id)) || 0,
    );
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
  // 2026-10-12 kullanıcı talebi: Aylık/Yıllık Özet'te yalnızca 3 ana KPI
  // görünsün (Ciro, Masraf, Net Kalan). Diğer kartlar (Kasa Para Girişi,
  // Tedarikçi Açık Borç, Ödeme Dağılımı, Dönem Alışı) kaldırıldı.
  // Veri kaynakları (purchases, cashIn, supplierPayables, payment split)
  // hâlâ sorgulanıyor — sadece render/görünürlük kapatıldı; gerekirse
  // ileride menu parametresi ile yeniden açılabilir.
  const showPeriodCardPurchases = false;
  const showPeriodCardSupplierPayables = false;
  const showPeriodCardNet = isReportMenuParamEnabled('period-summary-card-net', reportMenuParams);
  const showPeriodCardPaymentSplit = false;
  const showPeriodCardCashIn = false;

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

  // AVANS → FATURA (Basit Model): skipInvoice modunda avans `cari_avans`
  // tablosuna yazılır (sales fişi yok). Dönem özeti "Peşinat" kolonu
  // yalnızca `sales.is_deposit=true` filtreliyordu → skipInvoice avansları
  // 0 görünüyordu. `cari_avans.status='open'` + `created_at` tarih
  // aralığında çekilen tutarlar `avansDepositsMap`'e eklenir;
  // `aggregateSales` çıktısındaki depositAmount + avansDepositsMap
  // toplamı = "Peşinat" kolonu.
  const avansDepositsQuery = useQuery({
    queryKey: ['periodSummary', 'avansDeposits', firmKey, periodRange?.start, periodRange?.end],
    queryFn: async () => {
      try {
        const firm = String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
        const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
        const table = `rex_${firm}_${period}_cari_avans`;
        // 16.10.2026 — `notes` kolonu da çekilir; "Randevu No <uuid>" içeren
        // avanslar için bağlı randevunun status='completed' olup olmadığına
        // bakılır (avansDepositsMap döngüsünde). Tamamlanmış randevuya bağlı
        // avans Ciro'ya yansımış sayılır → "Rezervasyon Tutarı" kolonundan
        // hariç tutulur (kullanıcı talebi 16.10.2026).
        const { rows } = await postgres.query<{
          amount: number | string;
          created_at: string;
          notes: string | null;
          status: string | null;
        }>(
          `SELECT amount, created_at, notes, status FROM ${table}
            WHERE status IN ('open', 'applied')
              AND created_at >= $1
              AND created_at <  $2`,
          [`${periodRange!.start}T00:00:00`, `${periodRange!.end}T23:59:59`],
        );
        return Array.isArray(rows) ? rows : [];
      } catch (e) {
        // Tablo yoksa veya kolon eksikse rapor bozulmasın — boş döner.
        console.warn('[PeriodSummaryReport] cari_avans skipInvoice deposit fetch failed:', e);
        return [];
      }
    },
    enabled: !!periodRange,
    ...queryCommon,
  });
  const avansDepositsRaw = avansDepositsQuery.data ?? [];

  // 16.10.2026 — Bu firm/dönem aralığında `status='applied'` ve
  // `applied_sale_id` dolu olan avansları çek → `sale.id → appliedAvans`
  // map. `aggregateSales` → `saleCollectedSplit` zincirinde bu değer
  // tahsil edilen nakit gibi davranır; DUBLE senaryosu gibi
  // peşinat ile ödenen kısmın "kalan" olarak görünmesini engeller.
  const appliedAvansQuery = useQuery({
    queryKey: ['periodSummary', 'appliedAvans', firmKey, periodRange?.start, periodRange?.end],
    queryFn: async () => {
      try {
        const firm = String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
        const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
        const table = `rex_${firm}_${period}_cari_avans`;
        const { rows } = await postgres.query<{
          applied_sale_id: string;
          amount: number | string;
        }>(
          `SELECT applied_sale_id, amount FROM ${table}
            WHERE status = 'applied'
              AND applied_sale_id IS NOT NULL
              AND created_at >= $1
              AND created_at <  $2`,
          [`${periodRange!.start}T00:00:00`, `${periodRange!.end}T23:59:59`],
        );
        const map = new Map<string, number>();
        for (const r of Array.isArray(rows) ? rows : []) {
          const sid = String(r.applied_sale_id || '').trim();
          if (!sid) continue;
          map.set(sid, (map.get(sid) || 0) + Math.abs(Number(r.amount) || 0));
        }
        return map;
      } catch (e) {
        console.warn('[PeriodSummaryReport] cari_avans applied fetch failed:', e);
        return new Map<string, number>();
      }
    },
    enabled: !!periodRange,
    ...queryCommon,
  });
  const appliedAvansBySaleId = appliedAvansQuery.data ?? new Map<string, number>();

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

  /** Kasa para girişleri (sign=+1): REPORT_CASH_IN_TYPES — day/month map.
   * Ciro = satış cirosu (CH_TAHSILAT Hariç). CH_TAHSILAT aşağıda ayrı liste
   * olarak PeriodCashInDetailModal'a geçirilir.
   */
  const cashInsRows = useMemo(
    () => mergeExpensesWithCashIns(cashLinesQuery.data ?? []),
    [cashLinesQuery.data],
  );
  /**
   * CH_TAHSILAT (cari tahsilatları) — Ciro'dan Hariç; ayrı liste.
   * PeriodCashInDetailModal bunları ana tablonun altında "Cari Tahsilatlar"
   * bölümünde gösterir. REPORT_CASH_IN_TYPES'a eklenmez; ana tablonun
   * toplamı ve cashInMap davranışı değişmez.
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
    const closedAppointmentIds = new Set<string>();
    for (const apt of (appointments as Array<{ id?: string; status?: string }>) || []) {
      const st = String(apt?.status ?? '').toLowerCase();
      if (!apt.id) continue;
      if (st === 'completed') completedAppointmentIds.add(String(apt.id));
      if (st === 'completed' || st === 'cancelled' || st === 'canceled') {
        closedAppointmentIds.add(String(apt.id));
      }
    }

    const saleMap =
      mode === 'monthly-days'
        ? aggregateSales(sales, (s) => localCalendarDateKey(s.date), completedAppointmentIds, appliedAvansBySaleId)
        : aggregateSales(sales, (s) => saleMonthKey(s.date), completedAppointmentIds, appliedAvansBySaleId);

    // AVANS → FATURA (Basit Model): skipInvoice avansları (`cari_avans`,
    // status='open') tarih (YYYY-MM-DD) veya ay (YYYY-MM) bazında
    // `saleMap` anahtar yapısıyla eşleşir. `aggregateSales` çıktısındaki
    // depositAmount'a eklenir → Peşinat kolonu skipInvoice modunda da
    // doğru toplam verir.
    const avansRows = avansDepositsRaw as Array<{
      amount: number | string;
      created_at: string;
      notes?: string | null;
      status?: string | null;
    }>;
    const avansDepositsMap = buildAvansDepositsMap(
      avansRows,
      completedAppointmentIds,
      mode,
    );
    const closedAppointmentDeposits = buildClosedAppointmentDepositMap(appointments, mode);
    const closedAvansInfoMap = buildClosedReservationInfoMap(
      avansRows,
      closedAppointmentIds,
      mode,
      closedAppointmentDeposits.appointmentIds,
    );

    const expenseMap =
      mode === 'monthly-days'
        ? aggregateExpenses(expenses, (e) => expenseDayKey(e.expense_date))
        : aggregateExpenses(expenses, (e) => expenseDayKey(e.expense_date).slice(0, 7));

    // cashInMap anahtarı zaten mode'a göre day/month üretildi
    const purchaseMap =
      mode === 'monthly-days'
        ? aggregatePurchases(purchases, (inv) => localCalendarDateKey(inv.invoice_date))
        : aggregatePurchases(purchases, (inv) => saleMonthKey(inv.invoice_date));

    // 14.10.2026 — Rezervasyon brüt/kalan (paylaşılan helper, tüm
    // raporlarda aynı mantık: status!=completed/cancelled). Henüz
    // hizmet verilmemiş randevuların brüt hizmet tutarı ve kalan
    // ödenecek miktarı toplanır; Net Kalan'a eklenir.
    const reservationMap = buildReservationMap(appointments, mode);

    const periodKeys =
      mode === 'monthly-days'
        ? daysInMonthKeys(parseInt(selectedMonth.slice(0, 4), 10), parseInt(selectedMonth.slice(5, 7), 10))
        : monthsInYearKeys(selectedYear);

    const locale = tm('localeCode') || 'tr-TR';

    return periodKeys.map((periodKey) => {
      const sale = saleMap.get(periodKey) || {
        saleCount: 0, revenue: 0, cash: 0, card: 0, veresiye: 0, discount: 0,
        returnsCount: 0, returnsAmount: 0,
        depositCount: 0, depositAmount: 0,
      };
      // AVANS → FATURA (Basit Model): cari_avans'tan gelen skipInvoice
      // avansları `sale.depositAmount` üzerine eklenir (satış cirosu
      // veya iade toplamına dokunmaz; sadece Peşinat kolonunu büyütür).
      const skipInvoiceAvans = avansDepositsMap.get(periodKey) || { count: 0, amount: 0 };
      const exp = expenseMap.get(periodKey) || 0;
      const cashIn = cashInMap.get(periodKey) || 0;
      // cariTahsilat satır başına toplamı 2026-10-03 kullanıcı talebi ile kaldırıldı
      // (grid'de Cari Tahsilat kolonu yok). Modal bağlantısı korunuyor.
      const purch = purchaseMap.get(periodKey) || 0;
      const periodLabel =
        mode === 'monthly-days'
          ? formatIsoDateTr(periodKey)
          : new Date(`${periodKey}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

      // Ciro = brüt belge tutarı (sale.total). 2026-10-12 kullanıcı kararı:
      // "Ciro = brüt belge tutarı (sale.total) → Ciro 65.000 → 100.000".
      // Daha önce Ciro = tahsil edilen nakit idi (2026-10-11 geri-çevrimi);
      // şimdi brüt Ciro isteniyor (veresiye dahil). Trade-off: brüt Ciro
      // veresiyeyi de dahil eder ve Ciro'yu olduğundan yüksek gösterebilir;
      // ancak "Net Kalan = Ciro − Gider" doğru olur. CH_TAHSILAT ayrı
      // "Kasa Para Girişi" kolonunda izlenir, Ciro'ya katılmaz.
      //
      // 14.10.2026 17:03 — kullanıcı kararı (Net Kalan formülü):
      //   Net Kalan = Ciro − Gider + Ciro Dışı Tahsilat
      // Ciro dışı tahsilat = Ciro'ya henüz yansımamış peşinatlar
      // (avanslı satışlar için fatura/randevu tamamlanmamış):
      //   - sale.depositAmount (Ciro'ya yansımamış avanslı satış)
      //   - skipInvoiceAvans (cari_avans'tan gelen skipInvoice avans)
      // Rezervasyon brüt/kalan henüz Ciro'ya yansımaz (fatura kesilmedi);
      // sadece bilgi kolonu olarak gösterilir, Net Kalan'a katılmaz.
      const reservation = reservationMap.get(periodKey) || { gross: 0, pending: 0, deposit: 0, count: 0 };
      const closedDeposit = closedAppointmentDeposits.map.get(periodKey) || { deposit: 0, count: 0 };
      const closedAvans = closedAvansInfoMap.get(periodKey) || { count: 0, amount: 0 };
      const reservationDepositInfo = reservation.deposit + closedDeposit.deposit + closedAvans.amount;
      const reservationCountInfo = reservation.count + closedDeposit.count + closedAvans.count;
      // 14.10.2026 19:18 — reservationCount = rezervasyon adedi (miktar);
      // brütten ayrı kolon olarak gösterilir. depositCount'tan
      // bağımsız olmalı (depositCount = Ciro'ya yansımamış peşinat adedi).
      // 14.10.2026 23:25 — DEBUG: Kullanıcı "Kalan Bakiye 0" şikâyeti;
      // gerçek değer 35.000 olmalı. Console'da ham bucket'ı görelim.
      if (periodKey === '2026-10-14' && reservation.count > 0) {
        // eslint-disable-next-line no-console
        console.log('[PeriodSummaryReport DEBUG 14.10.2026]', {
          periodKey,
          gross: reservation.gross,
          pending: reservation.pending,
          deposit: reservation.deposit,
          count: reservation.count,
          'Beklenen': 'gross=50000, deposit=15000, pending=35000',
        });
      }
      const ciroTotal = sale.revenue;
      // Ciro dışı tahsilat (satış kayıtlarından — Ciro'ya yansımamış
      // avanslı satışlar + cari_avans skipInvoice avanslar).
      // reservation.deposit burada KULLANILMAZ çünkü zaten
      // sale.depositAmount içinde aynı avanslanmış satışa bağlı olarak
      // sayılıyor; çift sayımı önlemek için Ciro dışı tahsilat = Ciro'ya
      // yansımamış satış depositleri olarak alınır.
      const ciroDisiTahsilat = sale.depositAmount + skipInvoiceAvans.amount;
      const netRemaining = reportNetCiroMinusGider(
        ciroTotal,
        exp,
        showPeriodCardExpenses,
      ) + ciroDisiTahsilat;
      // 14.10.2026 — DEBUG kaldırıldı
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
        depositCount: sale.depositCount + skipInvoiceAvans.count,
        depositAmount: sale.depositAmount + skipInvoiceAvans.amount,
        // 14.10.2026 — Rezervasyon brüt/kalan (henüz faturası kesilecek)
        // Ciro'ya yansımaz; sadece bilgi kolonu olarak gösterilir.
        // Ciro dışı tahsilat (peşinat) Ciro − Gider formülüne
        // skipInvoiceAvans + sale.depositAmount üzerinden eklenir
        // (çift sayım önlemek için reservation.deposit KULLANILMAZ).
        reservationGross: reservation.gross,
        reservationCount: reservationCountInfo,
        reservationDeposit: reservationDepositInfo,
        reservationPending: reservation.pending,
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
    // AVANS → FATURA (Basit Model): skipInvoice avansları cari_avans'tan
    // okunur; periodKey başına toplam eklenir (depositAmount + depositCount).
    avansDepositsRaw,
    // 14.10.2026 — Rezervasyon brüt/kalan (buildReservationMap) ve
    // tamamlanmış randevu id'leri (completedAppointmentIds) bu useMemo
    // içinde `appointments`'a bağlı. Dependency listesinde yoksa ilk
    // hesap (boş `appointments`) cache'lenir, useQuery dolduğunda
    // useMemo yeniden tetiklenmez → rezervasyon brüt/kalan ve dip
    // toplamlar (totals) boş kalır (satır render'ı useMemo'dan
    // geçmediği için etkilenmez, ama totals 0 gösterirdi).
    appointments,
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
        // 14.10.2026 — Rezervasyon brüt/miktar/depozito/kalan toplamları
        reservationGross: acc.reservationGross + r.reservationGross,
        reservationCount: acc.reservationCount + r.reservationCount,
        reservationDeposit: acc.reservationDeposit + r.reservationDeposit,
        reservationPending: acc.reservationPending + r.reservationPending,
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
        reservationGross: 0, reservationCount: 0, reservationDeposit: 0, reservationPending: 0,
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
  // 2026-10-12 kullanıcı talebi: Aylık/Yıllık Özet'te yalnızca 3 ana KPI
  // görünsün (Ciro, Masraf, Net Kalan). "Ortak paylaşımı göster" checkbox'ı
  // kaldırıldığı için ortak kolonları ve ortak KPI kartları da gizli.
  const showPartnerCols = false;
  const partnerColColors = ['text-blue-700', 'text-indigo-700', 'text-violet-700', 'text-cyan-700', 'text-teal-700'];

  type PeriodSummaryGridRow = PeriodSummaryRow & Record<string, number | string | Record<string, number>>;

  const gridRows = useMemo((): PeriodSummaryGridRow[] => {
    return rows.map((r) => ({
      // 14.10.2026 — DevExDataGrid `getRowId` `row.id` okur; index-key
      // kullanmak React 18 reconciliation'da "NotFoundError: removeChild"
      // hatasına yol açıyor (rows array yeniden hesaplandığında DOM node
      // eski referansını kaybediyor). periodKey (YYYY-MM-DD veya
      // YYYY-MM) satır için stable — TanStack Table doğru reconcile eder.
      id: r.periodKey,
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
      // 18.10.2026 — depositAmount ve depositCount kolonları KALDIRILDI.
      // reservationDeposit ve reservationCount ile mükerrer (aynı bilgi).
      // Kullanıcı şikayeti: "mükerrer kolonlar var". Artık sadece
      // reservationGross, reservationDeposit, reservationCount, reservationPending
      // kolonları kullanılıyor.
      // 14.10.2026 — Rezervasyon brüt hizmet tutarı (henüz faturası
      // kesilmemiş randevuların toplam hizmet fiyatı). "Net Kalan"a
      // dahil edilir: günü geldiğinde faturası kesilecek tutar.
      {
        key: 'reservationGross',
        header: `${tm('reservationGrossLabel') || 'Rezervasyon Brüt'} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => (
          <span className={n > 0 ? 'text-violet-700' : 'text-violet-900/60'}>
            {n > 0 ? money(n) : `${money(0)} (yok)`}
          </span>
        ),
        // 14.10.2026 19:18 — Brüt hücresinde yalnızca hizmet brütü
        // gösterilir (örn. 50.000). Rezervasyon adedi (miktar) ayrı
        // "Rezervasyon Miktarı" kolonunda görünür; burada miktar
        // gösterilmez. Brüt = hizmet brütü = her zaman tek tek brüt.
        cell: (row) =>
          row.reservationGross > 0 ? (
            <span className="text-violet-700 font-medium">{money(row.reservationGross)}</span>
          ) : (
            '—'
          ),
        meta: { defaultVisible: true },
      },
      // 14.10.2026 19:18 — Rezervasyon Miktarı (adet) — Rezervasyon
      // Brüt hücresinin yanında. Brütün altında kaç adet rezervasyon
      // olduğunu gösterir (örn. 1). Ciro'ya yansımaz; sadece bilgi.
      {
        key: 'reservationCount',
        header: `${tm('reservationCountLabel') || 'Rezervasyon Miktarı'}`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => (
          <span className={n > 0 ? 'text-violet-700' : 'text-violet-900/60'}>
            {n > 0 ? Math.round(n) : `${Math.round(n)} (yok)`}
          </span>
        ),
        cell: (row) =>
          row.reservationCount > 0 ? (
            <span className="text-violet-700 font-medium">{row.reservationCount}</span>
          ) : (
            '—'
          ),
        meta: { defaultVisible: true },
      },
      // Rezervasyon Tutarı (peşinat). Açık ve kapanmış rezervasyonun
      // alınan tutarı burada bilgi olarak durur. Kapanmış tutar ciroya
      // ve net kalana ikinci kez yazılmaz.
      {
        key: 'reservationDeposit',
        header: `${tm('dailyDepositCollected') || 'Rezervasyon Tutarı'} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => (
          <span className={n > 0 ? 'text-violet-700' : 'text-violet-900/60'}>
            {n > 0 ? money(n) : `${money(0)} (yok)`}
          </span>
        ),
        cell: (row) =>
          row.reservationDeposit > 0 ? (
            <span
              className="text-violet-700 font-medium"
              title={`${tm('dailyDepositCollected') || 'Rezervasyon Tutarı'} (${currency})`}
            >
              {money(row.reservationDeposit)}
            </span>
          ) : (
            '—'
          ),
        meta: { defaultVisible: true },
      },
      // 14.10.2026 — Rezervasyon kalan (brüt − peşinat). Fatura
      // kesilecek tutar. Net Kalan formülüne eklenir.
      {
        key: 'reservationPending',
        header: `${tm('reservationPendingLabel') || 'Rezervasyon Kalan'} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => (
          <span className={n > 0 ? 'text-violet-700' : 'text-violet-900/60'}>
            {n > 0 ? money(n) : `${money(0)} (yok)`}
          </span>
        ),
        cell: (row) =>
          row.reservationPending > 0 ? (
            <span className="text-violet-700 font-medium">
              {money(row.reservationPending)}
            </span>
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
        // Ciro = yalnızca satış cirosu (CH_TAHSILAT Hariç). Kasa Para
        // Girişi kolonu yalnız KASA_GIRIS / ORTAK_SERMAYE_TAHSILAT /
        // ORTAK_PARA_GIRIS satırlarını içerir; CH_TAHSILAT ayrı bölümde
        // (modal Cari Tahsilatlar) gösterilir.
        cell: (row) => {
          if (!hasPeriodActivity(row) || !(row.cashIn > 0)) return '—';
          return (
            <button
              type="button"
              title="Kasa Para Girişi (CH_TAHSILAT Hariç — Cari Tahsilat ayrı bölümde)"
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
      // 2026-10-03'te grid'den kaldırıldı. Ciro = yalnızca satış cirosu.
      // 2026-10-04 Ferhat datası: CH_TAHSILAT ana "Kasa Para Girişi"
      // kolonundan da çıkarıldı; sadece PeriodCashInDetailModal
      // "Cari Tahsilatlar" alt bölümünde gösterilir (24,5M).
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

    // 2026-10-12 kullanıcı talebi: "Kâr Dağılımı" KPI kartı tamamen kaldırıldı.
    // Kart bilgileri (Manuel/Otomatik mod, kâr/zarar tutarları) ileride
    // menü parametresi ile geri açılabilir; veri kaynağı (monthlyProfitQuery)
    // hâlâ çalışır durumda — sadece render/görünürlük kapatıldı.
    // if (mode === 'monthly-days' && profitDistribution) { ... items.push({ key: 'profit-distribution', ... }) }

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

      {/* 2026-10-12 kullanıcı talebi: "Ortak paylaşımı göster" checkbox'ı
          ve uyarı satırı tamamen kaldırıldı. Sadece 3 ana KPI
          (Ciro, Masraf, Net Kalan) görünsün. showPartnerCols = false ile
          ortak kolonları / KPI kartları da gizli. */}

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
