/**
 * Günlük Rapor ekranında görünen KPI kartları.
 * Tutar formülleri burada yok; sıra, hangi kutunun çizileceği,
 * ciro altındaki miktar bilgisi ve beş kartın zemini burada.
 *
 * Ekranda tam beş kart vardır, başka KPI kartı yoktur:
 * Toplam Ciro, Rezervasyon Tutarı, Toplam İndirim, Toplam Gider, Net (Nakit).
 *
 * Zeminler klinik menü paletine bağlı değildir.
 * Ciro dolu mavi, rezervasyon dolu turuncu, gider dolu kırmızı, net nakit dolu yeşil;
 * yazı beyazdır. İndirim kartı açık lavanta zeminde kalır.
 *
 * Kaldırılanlar (menü parametresi açık olsa da bu ekranda yok):
 * Toplam Satış, Nakit, Satış iade, Net (Brüt), kart, veresiye,
 * belge/tahsil/veresiye şeridi, kasa giriş, kasa çıkış, nakit gider.
 *
 * İndirim açık cari değildir. Rezervasyon ve peşinat ciro değildir.
 * Ciro altındaki miktar bilgi satırıdır; tutara eklenmez.
 */

import { formatNumber } from './formatNumber';
import { detailedSalesLineMoney, type DetailedSalesReturnInput } from './detailedSalesLineSign';
import { isDepositSale, isRemovedSaleStatusLite } from './reportDepositFilter';
import type { Sale } from '../core/types';

export const DAILY_REPORT_SCREEN_CARD_KEYS = [
  'total-revenue',
  'reservation-amount',
  'total-discount',
  'total-expense',
  'net-cash',
] as const;

export type DailyReportScreenCardKey = (typeof DAILY_REPORT_SCREEN_CARD_KEYS)[number];

/** Ekrandaki kart yazısı. İndirim açık cari değildir; rezervasyon ciro anahtarı değildir. */
export const DAILY_REPORT_SCREEN_CARD_LABEL_KEY: Record<DailyReportScreenCardKey, string> = {
  'total-revenue': 'totalRevenueLabel',
  'reservation-amount': 'dailyDepositCollected',
  'total-discount': 'reportsTotalDiscount',
  'total-expense': 'totalExpense',
  'net-cash': 'dailyNetAfterExpenseNakit',
};

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
 * Dolu kart zeminleri. Mavi, kırmızı ve turuncu ikinci görseldeki kartlarla aynıdır.
 * Yeşil aynı doygunluk bandındadır; neon limon veya turkuaz değildir.
 * Klinik menü paleti bu dört rengi değiştirmez.
 */
export const DAILY_REPORT_SOLID_CARD_FILL = {
  'total-revenue': '#2563eb',
  'reservation-amount': '#f59e0b',
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

/** Beş kartın zemini. Dört kart dolu renktir; indirim lavanta paletindedir. */
export function dailyReportCardTone(key: DailyReportScreenCardKey): DailyReportCardTone {
  if (key === 'total-discount') return DAILY_REPORT_DISCOUNT_TONE;
  return solidCardTone(DAILY_REPORT_SOLID_CARD_FILL[key]);
}

export function dailyReportScreenShowsCard(key: string): boolean {
  return SCREEN_KEY_SET.has(key);
}

/** Görünen kartlar, sabit beşli sıra. Menü parametresi bu sırayı kısaltmaz. */
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
