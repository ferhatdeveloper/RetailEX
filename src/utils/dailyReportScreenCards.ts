/**
 * Günlük Rapor ekranında görünen KPI kartları.
 * Tutar formülleri burada yok; sıra, hangi kutunun çizileceği,
 * ciro altındaki miktar bilgisi ve seçili klinik paletinin tonları burada.
 *
 * Ekranda tam beş kart vardır, başka KPI kartı yoktur:
 * Toplam Ciro, Rezervasyon Tutarı, Toplam İndirim, Toplam Gider, Net (Nakit).
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

/** Seçili klinik menü paletinin kart boyası için gereken mürekkep. */
export interface DailyReportPaletteInk {
  tone?: 'dark' | 'light';
  accent: string;
  accentEdge: string;
  sidebar: string;
  sidebarLine: string;
}

export interface DailyReportCardTone {
  background: string;
  border: string;
  accent: string;
  value: string;
  label: string;
  hint: string;
}

type Rgb = [number, number, number];

const CARD_RECIPE: Record<
  DailyReportScreenCardKey,
  { a: keyof DailyReportPaletteInk; b: keyof DailyReportPaletteInk; blend: number; white: number; accent: number }
> = {
  'total-revenue': { a: 'accent', b: 'accentEdge', blend: 0.06, white: 0.84, accent: 0.05 },
  'reservation-amount': { a: 'accentEdge', b: 'sidebarLine', blend: 0.28, white: 0.78, accent: 0.16 },
  'total-discount': { a: 'sidebarLine', b: 'accent', blend: 0.52, white: 0.9, accent: 0.1 },
  'total-expense': { a: 'accentEdge', b: 'sidebar', blend: 0.4, white: 0.7, accent: 0.22 },
  'net-cash': { a: 'sidebar', b: 'accent', blend: 0.18, white: 0.62, accent: 0.14 },
};

const SCREEN_KEY_SET = new Set<string>(DAILY_REPORT_SCREEN_CARD_KEYS);

function parseHex(raw: string): Rgb | null {
  let body = raw.trim();
  if (body.startsWith('#')) body = body.slice(1);
  if (body.length !== 6) return null;
  const n = Number.parseInt(body, 16);
  if (!Number.isFinite(n) || n < 0 || n > 0xffffff) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbHex(rgb: Rgb): string {
  const part = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    const hex = clamped.toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function linearChannel(value: number): number {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function contrast(a: Rgb, b: Rgb): number {
  const lum = (rgb: Rgb) =>
    0.2126 * linearChannel(rgb[0]) + 0.7152 * linearChannel(rgb[1]) + 0.0722 * linearChannel(rgb[2]);
  const hi = Math.max(lum(a), lum(b));
  const lo = Math.min(lum(a), lum(b));
  return (hi + 0.05) / (lo + 0.05);
}

function ink(palette: DailyReportPaletteInk, key: keyof DailyReportPaletteInk, fallback: Rgb): Rgb {
  const raw = palette[key];
  if (typeof raw !== 'string') return fallback;
  return parseHex(raw) ?? fallback;
}

function readable(background: Rgb, preferred: Rgb): Rgb {
  if (contrast(background, preferred) >= 4.8) return preferred;
  const dark: Rgb = [15, 23, 42];
  let color = preferred;
  for (let step = 1; step <= 8; step += 1) {
    color = mixRgb(preferred, dark, step / 8);
    if (contrast(background, color) >= 4.8) return color;
  }
  return dark;
}

/** Kart zemini seçili paletin accent / kenar / şerit mürekkebinden açılır. */
export function dailyReportCardTone(
  palette: DailyReportPaletteInk,
  key: DailyReportScreenCardKey,
): DailyReportCardTone {
  const recipe = CARD_RECIPE[key];
  const accent = ink(palette, 'accent', [91, 33, 182]);
  const seed = mixRgb(
    ink(palette, recipe.a, accent),
    ink(palette, recipe.b, accent),
    recipe.blend,
  );
  const washed = mixRgb(seed, [255, 255, 255], recipe.white);
  const background = mixRgb(washed, accent, recipe.accent);
  const border = mixRgb(background, accent, 0.28);
  const icon = readable(background, accent);
  const value = readable(background, mixRgb(accent, [15, 23, 42], 0.42));
  const label = readable(background, mixRgb(accent, [51, 65, 85], 0.28));
  const hint = readable(background, mixRgb(accent, [71, 85, 105], 0.5));
  return {
    background: rgbHex(background),
    border: rgbHex(border),
    accent: rgbHex(icon),
    value: rgbHex(value),
    label: rgbHex(label),
    hint: rgbHex(hint),
  };
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
