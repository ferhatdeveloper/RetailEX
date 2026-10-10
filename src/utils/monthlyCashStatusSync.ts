/**
 * Aylık Özet (`PeriodSummaryReport`) ile Kasa Durumu (`ReportsModule.getCashStatus`)
 * arasındaki mutabakat sağlayan paylaşılan pure fonksiyon.
 *
 * Kök neden: iki rapor farklı veri kaynaklarından ve farklı semantikle
 * türetildiği için aynı dönem için farklı toplamlar üretiyordu. Bu helper,
 * tek bir tarih aralığı (veya ay) için tek "gerçek" tanımı paylaştırır:
 *
 *   Ciro              = sales cirosu (CH_TAHSILAT Hariç; iade Ciro'ya yansımaz)
 *   Nakit Tahsilat    = Ciro'daki nakit + sonradan ek nakit tahsilat (CH_TAHSILAT)
 *   Kart Tahsilat     = Ciro'daki kart tutarı
 *   Havale Tahsilat   = Ciro'daki havale tutarı
 *   Rezervasyon Avansı= satışa yansımamış peşinat (cash_lines REZERVASYON/AVANS)
 *   Gider             = Gider Yönetimi + PERIOD_SUMMARY_CASH_OUT_TYPES (kasa çıkışları)
 *   Alış              = Alış faturaları (iade Hariç)
 *   Kasa Para Girişi  = Ciro Hariç ek kasa girişleri (KASA_GIRIS, ortak sermaye…)
 *   Net Kalan         = Ciro − Gider − Alış
 *   Kapanış (Nakit)   = Açılış + Nakit Tahsilat − nakit giderler
 *   TOPLAM            = Ciro (Rezervasyon Hariç) — Kasa Durumu ile aynı semantik
 *
 * Aylık Özet raporu bu satırları zaten üretiyor; Kasa Durumu ile aynı
 * "Kapanış" mantığını uygulamak için `computeMonthKapanis` (tek-aylık)
 * ve `computeRangeKapanis` (tarih aralığı) fonksiyonları kullanılır.
 *
 * Mevcut düzeltmeler korunur:
 *   `b212c576` (hasPeriodActivity),
 *   `c18aa372` (Günlük Rapor avans),
 *   `94d8a7f5` (Kasa Durumu TOPLAM rezervasyon Hariç),
 *   `4e687eb2` (Klinik TAHŞİLAT).
 */

import type { Sale } from '../core/types';
import type { Expense } from '../services/api/expenses';
import type { Invoice } from '../core/types/models';
import type { KasaIslemi } from '../services/api/kasa';
import {
  mergeExpensesWithCashOuts,
  PERIOD_SUMMARY_CASH_OUT_TYPES,
  REPORT_CASH_IN_TYPES,
} from './reportUnifiedExpenses';

/** Kullanıcı şikâyeti senaryosu: 10 satış × 50k + 2 avans × 15k + 3 gider × 10k
 *  → Ciro=500k, Avans=30k, Gider=30k, Kasa (net nakit)=500-30=470k. */
export const MOCK_SYNC_SCENARIO = {
  saleCount: 10,
  saleAmountEach: 50_000,
  reservationDepositCount: 2,
  reservationDepositAmountEach: 15_000,
  expenseCount: 3,
  expenseAmountEach: 10_000,
  expectedRevenue: 500_000,
  expectedReservationDeposit: 30_000,
  expectedExpenses: 30_000,
  expectedKapanisFromCash: 470_000,
  expectedCardTransfer: 0,
};

export type MonthlyCashSummaryRow = {
  /** Ciro — yalnızca satış cirosu (CH_TAHSILAT Hariç). */
  ciro: number;
  /** Ciro içindeki nakit tahsilat (Ciro'nun parçası). */
  nakitCiro: number;
  /** Ciro içindeki kart tutarı. */
  kartCiro: number;
  /** Ciro içundaki havale tutarı. */
  havaleCiro: number;
  /** Ciro içindeki veresiye (cariye kalan). */
  veresiye: number;
  /** Ciro'dan bağımsız ek nakit tahsilatlar (CH_TAHSILAT, REZERVASYON Hariç). */
  extraNakit: number;
  /** Ciro'dan bağımsız ek kart tahsilatları. */
  extraKart: number;
  /** Ciro'dan bağımsız ek havale tahsilatları. */
  extraHavale: number;
  /** Rezervasyon avansı (CH_TAHSILAT + REZERVASYON/AVANS özel_kod). Ciro'ya dahil değil. */
  rezervasyonAvansi: number;
  /** Gider Yönetimi + kasa çıkışları (cari ödeme, maaş, avans ödeme vb.) */
  gider: number;
  /** Yalnız nakit giderler (Kapanış Nakit hesabı için). */
  nakitGider: number;
  /** Kasa Para Girişi — Ciro Hariç, yalnız REPORT_CASH_IN_TYPES */
  kasaGirisi: number;
  /** Tedarikçi alış faturaları (iade Hariç). */
  alis: number;
  /** Ciro − Gider − Alış. */
  netKalan: number;
  /** Ciro (Rezervasyon Hariç) — `ReportsModule.getCashStatus.todayTotal` ile aynı semantik. */
  kasaDurumuToplam: number;
  /** Veresiye Hariç tahsilat (nakit + kart + havale + ek tahsilatlar). */
  tahsilat: number;
  /** Açılış kasası (raporlar farklı günlerde sıfırlanır; mutabakat için caller verir). */
  acilis: number;
};

export type MonthlyCashSummaryInput = {
  sales: Sale[];
  /** Ciro'ya dahil edilen ama henüz sales'a yansımamış ekstra nakit/kart/havale (CH_TAHSILAT). */
  extraCash?: number;
  extraCard?: number;
  extraTransfer?: number;
  /** cash_lines REZERVASYON/AVANS satırları (Ciro Hariç). */
  rezervasyonAvansi: number;
  expenses: Expense[];
  cashLines: KasaIslemi[];
  /** Tedarikçi alış faturaları. */
  purchases: Invoice[];
  /** Açılış kasası (default 0). */
  acilis?: number;
};

function isRemovedSaleStatus(s: Sale): boolean {
  const st = String(s.status ?? '').toLowerCase();
  return (
    st === 'cancelled' ||
    st === 'canceled' ||
    st === 'refunded' ||
    st === 'silindi' ||
    st === 'iptal'
  );
}

function isReturnSale(s: Sale): boolean {
  const st = String(s.status ?? '').toLowerCase();
  if (st === 'return' || st === 'iade' || st === 'refunded') return true;
  return Number(s.total) < 0;
}

function salePaymentTotals(s: Sale): {
  cash: number;
  card: number;
  transfer: number;
  veresiye: number;
} {
  const payments = Array.isArray(s.payments) ? s.payments : [];
  let cash = 0;
  let card = 0;
  let transfer = 0;
  if (payments.length > 0) {
    for (const p of payments) {
      const amt = Math.abs(Number(p.amount) || 0);
      const m = String(p.method ?? '').toLowerCase();
      if (m === 'cash') cash += amt;
      else if (m === 'card' || m === 'gateway' || m === 'kreditkarte') card += amt;
      else if (m === 'transfer' || m === 'havale') transfer += amt;
    }
    const allocated = cash + card + transfer;
    const doc = Math.abs(Number(s.total) || 0);
    const remaining = Math.max(0, doc - allocated);
    return { cash, card, transfer, veresiye: remaining };
  }
  const m = String(s.paymentMethod ?? '').toLowerCase();
  const doc = Math.abs(Number(s.total) || 0);
  if (m === 'cash') return { cash: doc, card: 0, transfer: 0, veresiye: 0 };
  if (m === 'card' || m === 'gateway') return { cash: 0, card: doc, transfer: 0, veresiye: 0 };
  if (m === 'transfer' || m === 'havale') return { cash: 0, card: 0, transfer: doc, veresiye: 0 };
  if (m === 'credit' || m === 'veresiye')
    return { cash: 0, card: 0, transfer: 0, veresiye: doc };
  return { cash: 0, card: 0, transfer: 0, veresiye: doc };
}

/**
 * Tek veri setinden Ciro / Nakit / Gider / Alış / Kapanış değerlerini üretir.
 * ReportsModule.getCashStatus ile PeriodSummaryReport'un Ciro/Nakit/Gider
 * mantığını aynı formülde buluşturur.
 */
export function computeMonthlyCashSummary(
  input: MonthlyCashSummaryInput,
): MonthlyCashSummaryRow {
  const sales = Array.isArray(input.sales) ? input.sales : [];
  const purchases = Array.isArray(input.purchases) ? input.purchases : [];
  const cashLines = Array.isArray(input.cashLines) ? input.cashLines : [];

  // Ciro = sales cirosu (iade Ciro'ya yansımaz; Ciro negatife düşmez)
  // PeriodSummaryReport.aggregateSales ile aynı semantik.
  let ciro = 0;
  let nakitCiro = 0;
  let kartCiro = 0;
  let havaleCiro = 0;
  let veresiye = 0;
  for (const s of sales) {
    if (isRemovedSaleStatus(s)) continue;
    const ft = String((s as Sale & { fiche_type?: string }).fiche_type ?? '');
    if (ft === 'opening_balance' || ft === 'purchase_invoice') continue;
    const total = Number(s.total) || 0;
    if (isReturnSale(s)) continue; // Ciro'dan iade Hariç (negatif şişirmesin)
    const doc = Math.abs(total);
    if (doc === 0) continue;
    ciro += doc;
    const pt = salePaymentTotals(s);
    nakitCiro += pt.cash;
    kartCiro += pt.card;
    havaleCiro += pt.transfer;
    veresiye += pt.veresiye;
  }

  // Gider Yönetimi + kasa çıkışları birleşimi
  const unifiedExpenses = mergeExpensesWithCashOuts(
    Array.isArray(input.expenses) ? input.expenses : [],
    cashLines,
    { allowedCashOutTypes: PERIOD_SUMMARY_CASH_OUT_TYPES },
  );
  const gider = unifiedExpenses.reduce(
    (sum, e) => sum + (Math.abs(Number(e.amount) || 0)),
    0,
  );
  // Nakit gider (PaymentMethod='cash' veya kasa çıkışı) — Kapanış Nakit'ten düşülür.
  const nakitGider = unifiedExpenses
    .filter((e) => {
      const pm = String(e.payment_method ?? '').toLowerCase();
      return pm === 'cash' || pm === 'nakit';
    })
    .reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);

  // Alış faturaları (iade Hariç)
  const alis = purchases.reduce((sum, inv) => {
    if (inv.is_cancelled) return sum;
    const st = String(inv.status ?? '').toLowerCase();
    if (st === 'cancelled' || st === 'canceled' || st === 'refunded') return sum;
    return sum + Math.abs(Number(inv.total_amount ?? inv.total) || 0);
  }, 0);

  // Kasa Para Girişi — Ciro Hariç, yalnız REPORT_CASH_IN_TYPES
  let kasaGirisi = 0;
  for (const cl of cashLines) {
    const type = String(cl.islem_tipi || '').trim().toUpperCase();
    if (!REPORT_CASH_IN_TYPES.has(type)) continue;
    kasaGirisi += Math.abs(Number(cl.tutar) || 0);
  }

  const netKalan = ciro - gider - alis;

  // Ciro içinde nakit (nakitCiro) + Ciro dışı ek nakit (extraCash).
  // Kasa Durumu "todayCash" ile aynı semantik.
  const tahsilat = nakitCiro
    + kartCiro
    + havaleCiro
    + (Number(input.extraCash) || 0)
    + (Number(input.extraCard) || 0)
    + (Number(input.extraTransfer) || 0);

  // Kasa Durumu TOPLAM: Ciro (Rezervasyon Hariç). Avans Ciro'ya katılmaz.
  // Bkz. `ReportsModule.getCashStatus.todayTotal = dist.totalAmount - reservationDeposit`.
  const kasaDurumuToplam = ciro;

  const acilis = Number(input.acilis) || 0;
  return {
    ciro,
    nakitCiro,
    kartCiro,
    havaleCiro,
    veresiye,
    extraNakit: Number(input.extraCash) || 0,
    extraKart: Number(input.extraCard) || 0,
    extraHavale: Number(input.extraTransfer) || 0,
    rezervasyonAvansi: Number(input.rezervasyonAvansi) || 0,
    gider,
    nakitGider,
    kasaGirisi,
    alis,
    netKalan,
    kasaDurumuToplam,
    tahsilat,
    acilis,
  };
}

/**
 * Tek bir tarih aralığı için Ciro / Kapanış özetini Kasa Durumu şemasında üretir.
 * `ReportsModule.getCashStatus` ile bire bir aynı alanları döndürür.
 */
export function computeRangeKapanis(input: MonthlyCashSummaryInput) {
  const m = computeMonthlyCashSummary(input);
  const closingCash = m.acilis + m.nakitCiro - m.nakitGider;
  return {
    opening: m.acilis,
    todayCash: m.nakitCiro,
    todayCard: m.kartCiro,
    todayTransfer: m.havaleCiro,
    reservationDeposit: m.rezervasyonAvansi,
    expenses: m.nakitGider,
    closingCash,
    todayTotal: m.kasaDurumuToplam,
    ciro: m.ciro,
    netKalan: m.netKalan,
    alis: m.alis,
    gider: m.gider,
    kasaGirisi: m.kasaGirisi,
    tahsilat: m.tahsilat,
  };
}

/**
 * Bir aydaki Ciro / Gider / Avans / Net Kalan değerlerini Ciro+Gider+Alış
 * bakımından **Aylık Özet** tablosuyla birebir aynı verir.
 *
 * PeriodSummaryReport `rows` üretirken Ciro=sale.revenue, Gider=exp, Alış=purch,
 * Avans=skipInvoice + sale.depositAmount; cariTahsilat (CH_TAHSILAT) Ciro'ya YANSIMAZ.
 * Bu helper da aynı semantiği uygular; Ciro'dan avans Hariç tutulur ve
 * Ciro'nun Nakit+ Kart ayrımı tutulur.
 *
 * @param periodKey YYYY-MM (aylık) veya YYYY-MM-DD (günlük)
 */
export type PeriodSummaryBucket = {
  ciro: number;
  nakit: number;
  kart: number;
  havale: number;
  veresiye: number;
  gider: number;
  alis: number;
  netKalan: number;
  avans: number;
  kasaGirisi: number;
};

export function computePeriodSummaryBucket(input: MonthlyCashSummaryInput): PeriodSummaryBucket {
  const m = computeMonthlyCashSummary(input);
  return {
    ciro: m.ciro,
    nakit: m.nakitCiro,
    kart: m.kartCiro,
    havale: m.havaleCiro,
    veresiye: m.veresiye,
    gider: m.gider,
    alis: m.alis,
    netKalan: m.netKalan,
    avans: m.rezervasyonAvansi,
    kasaGirisi: m.kasaGirisi,
  };
}
