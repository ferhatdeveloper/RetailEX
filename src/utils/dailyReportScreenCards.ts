/**
 * Günlük Rapor ekranında görünen KPI kartları.
 * Tutar formülleri burada yok; sıra, hangi kutunun çizileceği,
 * ciro altındaki miktar bilgisi ve kart zeminleri burada.
 *
 * Ekranda tam altı kart vardır:
 * Toplam Ciro, Rezervasyon Tutarı, İade, Toplam İndirim, Toplam Gider, Net (Nakit).
 *
 * Zeminler klinik menü paletine bağlı değildir.
 * Ciro dolu mavi, rezervasyon dolu turuncu, iade dolu gül kurusu,
 * gider dolu kırmızı, net nakit dolu yeşil; yazı beyazdır.
 * İndirim kartı açık lavanta zeminde kalır.
 * İade kutusu bilgi tutarıdır. Günlük ciro iadeyi bir kez düşmüştür;
 * Net (Nakit) bu tutarı tekrar düşmez.
 * Net (Nakit) = brüt ciro + rezervasyon tutarı − indirim − gider.
 *
 * Kaldırılanlar (menü parametresi açık olsa da bu ekranda yok):
 * Toplam Satış, Nakit, Satış iade, Net (Brüt), kart, veresiye,
 * belge/tahsil/veresiye şeridi, kasa giriş, kasa çıkış, nakit gider.
 *
 * İndirim açık cari değildir. Brüt cirodan bir kez düşülür.
 * Satır neti indirimi zaten düşmüşse ikinci kez düşülmez.
 * Rezervasyon ve peşinat ciro değildir. Açık ve iptal peşinatı
 * rezervasyon kutusundan nete bir kez eklenir.
 * Ciro altındaki miktar bilgi satırıdır; tutara eklenmez.
 */

import { formatNumber } from './formatNumber';
import { detailedSalesLineMoney, type DetailedSalesReturnInput } from './detailedSalesLineSign';
import { isDailySalesDetailReturn, type DailySalesDetailKindInput } from './dailySalesDetailKind';
import { dailySalesDetailNetAmount } from './dailySalesDetailNet';
import { isDepositSale, isRemovedSaleStatusLite } from './reportDepositFilter';
import type { Sale } from '../core/types';

export const DAILY_REPORT_SCREEN_CARD_KEYS = [
  'total-revenue',
  'reservation-amount',
  'return-amount',
  'total-discount',
  'total-expense',
  'net-cash',
] as const;

export type DailyReportScreenCardKey = (typeof DAILY_REPORT_SCREEN_CARD_KEYS)[number];

/** Ekrandaki kart yazısı. İndirim açık cari değildir; rezervasyon ciro anahtarı değildir. */
export const DAILY_REPORT_SCREEN_CARD_LABEL_KEY: Record<DailyReportScreenCardKey, string> = {
  'total-revenue': 'totalRevenueLabel',
  'reservation-amount': 'dailyDepositCollected',
  'return-amount': 'rptPeriodColReturns',
  'total-discount': 'reportsTotalDiscount',
  'total-expense': 'totalExpense',
  'net-cash': 'dailyNetAfterExpenseNakit',
};

/** İade kutusunun alt satırı. Adet bilgi olarak durur, netten tekrar düşülmez. */
export const DAILY_REPORT_RETURN_COUNT_LABEL_KEY = 'rptPeriodColReturnsCount';

/** Ciro kartının alt satırı. Miktar bilgi olarak durur, tutara yazılmaz. */
export const DAILY_REPORT_REVENUE_QTY_LABEL_KEY = 'reportsDailyRevenueQtyLabel';

export const DAILY_REPORT_REMOVED_CARD_KEYS = [
  'total-sales',
  'cash',
  'sales-return',
  'net-gross',
  'card',
  'credit-given',
  'veresiye',
  'document-amount',
  'belge',
  'amount-collected',
  'tahsil',
  'cash-in',
  'cash-out',
  'cash-expense',
  'nakit-gider',
  'daily-report-card-card',
  'daily-report-card-remaining-account',
  'daily-report-card-document-amount',
  'daily-report-card-amount-collected',
  'daily-report-card-cash-in',
  'daily-report-card-cash-out',
  'daily-report-card-cash-expenses',
] as const;

export type DailyReportRemovedCardKey = (typeof DAILY_REPORT_REMOVED_CARD_KEYS)[number];

export interface DailyReportCardTone {
  background: string;
  border: string;
  accent: string;
  value: string;
  label: string;
  hint: string;
}

const SOLID_INK = '#ffffff';

/**
 * Dolu kart zeminleri. Ciro mavisi, rezervasyon turuncusu, gider kırmızısı ve net yeşili durur.
 * İade kutusu gül kurusudur; gider kırmızısı ile aynı değildir.
 * Klinik menü paleti bu renkleri değiştirmez.
 */
export const DAILY_REPORT_SOLID_CARD_FILL = {
  'total-revenue': '#2563eb',
  'reservation-amount': '#f59e0b',
  'return-amount': '#e11d48',
  'total-expense': '#f04438',
  'net-cash': '#12b76a',
} as const;

/**
 * İndirim kartı açık lavanta paletinde kalır.
 * Zemin, kenar ve yazı önceki lavanta kartının aynısıdır; maviye veya kırmızıya çekilmez.
 */
export const DAILY_REPORT_DISCOUNT_TONE: DailyReportCardTone = {
  background: '#ede7f7',
  border: '#c4b0e5',
  accent: '#5b21b6',
  value: '#3b1d7b',
  label: '#502a9b',
  hint: '#513b90',
};

const SCREEN_KEY_SET = new Set<string>(DAILY_REPORT_SCREEN_CARD_KEYS);

function solidCardTone(background: string): DailyReportCardTone {
  return {
    background,
    border: background,
    accent: SOLID_INK,
    value: SOLID_INK,
    label: SOLID_INK,
    hint: SOLID_INK,
  };
}

/** Altı kartın zemini. İade gül kurusudur; indirim lavanta paletinde kalır. */
export function dailyReportCardTone(key: DailyReportScreenCardKey): DailyReportCardTone {
  if (key === 'total-discount') return DAILY_REPORT_DISCOUNT_TONE;
  return solidCardTone(DAILY_REPORT_SOLID_CARD_FILL[key]);
}

export function dailyReportScreenShowsCard(key: string): boolean {
  return SCREEN_KEY_SET.has(key);
}

/** Görünen kartlar, sabit altılı sıra. Menü parametresi bu sırayı kısaltmaz. */
export function visibleDailyReportScreenCardKeys(): DailyReportScreenCardKey[] {
  return [...DAILY_REPORT_SCREEN_CARD_KEYS];
}

export interface DailyReportQuantityLine {
  quantity?: number | null;
  qty?: number | null;
  total?: number | null;
  price?: number | null;
}

export interface DailyReportQuantitySale extends DetailedSalesReturnInput {
  items?: readonly DailyReportQuantityLine[] | null;
  isDeposit?: boolean | null;
  isAvans?: boolean | null;
  notes?: string | null;
}

/**
 * Satış satır miktarlarının toplamı. Ciro tutarına eklenmez.
 * Peşinat ve avans katılmaz. İptal katılmaz. İade miktarı bir kez eksidir.
 */
export function sumDailyReportLineQuantity(sales: readonly DailyReportQuantitySale[]): number {
  let sum = 0;
  for (const sale of sales) {
    if (sale.isAvans === true) continue;
    if (isRemovedSaleStatusLite(sale.status)) continue;
    if (sale.isDeposit === true || isDepositSale(sale as Partial<Sale>)) continue;
    const lines = Array.isArray(sale.items) ? sale.items : [];
    for (const line of lines) {
      sum += detailedSalesLineMoney(sale, {
        quantity: line.quantity ?? line.qty,
        total: line.total,
        price: line.price,
      }).qty;
    }
  }
  const rounded = Math.round(sum * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Ciro kartının alt yazısı. Yalnızca miktarı söyler. */
export function dailyReportRevenueQuantityHint(quantityLabel: string, quantity: number): string {
  const label = String(quantityLabel || '').trim();
  const shown = formatNumber(quantity, 3, false);
  return label ? `${label}: ${shown}` : shown;
}

export interface DailyReportReturnCardSummary {
  /** İade tutarının artı büyüklüğü. Kutuda görünür; nete tekrar yazılmaz. */
  amount: number;
  /** İade fişi adedi. */
  count: number;
}

/**
 * İade kutusunun tutarı ve adedi.
 * Avans, depozito, vazgeçilmiş peşinat ve gider iade değildir.
 * Tutar, satır netinin mutlak değeridir. Net (Nakit) bu fonksiyondan düşülmez.
 */
export function dailyReportReturnCardSummary(
  rows: readonly DailySalesDetailKindInput[],
): DailyReportReturnCardSummary {
  let amount = 0;
  let count = 0;
  for (const row of rows) {
    if (!isDailySalesDetailReturn(row)) continue;
    count += 1;
    amount += Math.abs(dailySalesDetailNetAmount(row));
  }
  const rounded = Math.round(amount * 100) / 100;
  return { amount: Object.is(rounded, -0) ? 0 : rounded, count };
}

/** İade kutusunun alt yazısı. Yalnızca adedi söyler. */
export function dailyReportReturnCountHint(countLabel: string, count: number): string {
  const label = String(countLabel || '').trim();
  return label ? `${count} ${label}` : String(count);
}
