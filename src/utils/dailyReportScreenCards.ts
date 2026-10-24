/**
 * Günlük Rapor ekranında görünen KPI kartları.
 * Tutar formülleri burada yok; sıra ve hangi kutunun çizileceği burada.
 *
 * Kaldırılanlar (menü parametresi açık olsa da bu ekranda yok):
 * kart, veresiye, belge/tahsil/veresiye şeridi, kasa giriş, kasa çıkış, nakit gider.
 */

export const DAILY_REPORT_SCREEN_CARD_KEYS = [
  'total-sales',
  'reservation-amount',
  'total-revenue',
  'total-discount',
  'cash',
  'sales-return',
  'total-expense',
  'net-gross',
  'net-cash',
] as const;

export type DailyReportScreenCardKey = (typeof DAILY_REPORT_SCREEN_CARD_KEYS)[number];

/** Ekrandaki kart yazısı. İndirim açık cari değildir; rezervasyon ciro anahtarı değildir. */
export const DAILY_REPORT_SCREEN_CARD_LABEL_KEY: Record<DailyReportScreenCardKey, string> = {
  'total-sales': 'totalSales',
  'reservation-amount': 'dailyDepositCollected',
  'total-revenue': 'totalRevenueLabel',
  'total-discount': 'reportsTotalDiscount',
  cash: 'cashLabel',
  'sales-return': 'reportsSalesReturnLabel',
  'total-expense': 'totalExpense',
  'net-gross': 'dailyNetAfterExpenseBrut',
  'net-cash': 'dailyNetAfterExpenseNakit',
};

export const DAILY_REPORT_REMOVED_CARD_KEYS = [
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

/** Bu raporun kendi pastel tonları. Menü veya ödeme renklerinden ayrı. */
export const DAILY_REPORT_SCREEN_CARD_TONES: Record<
  DailyReportScreenCardKey,
  { background: string; border: string; accent: string }
> = {
  'total-sales': { background: '#F8EEF1', border: '#E7D0D8', accent: '#7A4E5C' },
  'reservation-amount': { background: '#F1F6F1', border: '#D3E2D4', accent: '#4F6B54' },
  'total-revenue': { background: '#F8F4EC', border: '#E6D9C4', accent: '#7A6844' },
  'total-discount': { background: '#F4F1F8', border: '#DDD4EA', accent: '#65567A' },
  cash: { background: '#F2F5F8', border: '#D5DEE8', accent: '#546578' },
  'sales-return': { background: '#F8F2EE', border: '#E6D5CC', accent: '#7A5C50' },
  'total-expense': { background: '#F8F3EE', border: '#E6D6C6', accent: '#7A6248' },
  'net-gross': { background: '#F0F6F3', border: '#D0E0D8', accent: '#4E6B5E' },
  'net-cash': { background: '#F3F4F8', border: '#D6DAE8', accent: '#555E78' },
};

export type DailyReportScreenCardFlags = {
  totalSales: boolean;
  totalRevenue: boolean;
  totalDiscount: boolean;
  cash: boolean;
  salesReturn: boolean;
  totalExpense: boolean;
  net: boolean;
};

const SCREEN_KEY_SET = new Set<string>(DAILY_REPORT_SCREEN_CARD_KEYS);

export function dailyReportScreenShowsCard(key: string): boolean {
  return SCREEN_KEY_SET.has(key);
}

/** Görünen kartlar, sabit sırada. Kaldırılan anahtar hiç dönmez. */
export function visibleDailyReportScreenCardKeys(
  flags: DailyReportScreenCardFlags,
): DailyReportScreenCardKey[] {
  return DAILY_REPORT_SCREEN_CARD_KEYS.filter((key) => {
    switch (key) {
      case 'total-sales':
        return flags.totalSales;
      case 'reservation-amount':
        return true;
      case 'total-revenue':
        return flags.totalRevenue;
      case 'total-discount':
        return flags.totalDiscount;
      case 'cash':
        return flags.cash;
      case 'sales-return':
        return flags.salesReturn;
      case 'total-expense':
        return flags.totalExpense;
      case 'net-gross':
      case 'net-cash':
        return flags.net;
      default:
        return false;
    }
  });
}
