/**
 * Satış Detayları dip toplamı — kasa bakiyesi.
 *
 * Satış neti indirimi bir kez düşmüş hâldedir (140.000 − 1.500 = 138.500).
 * İndirim açık cari değildir ve toplama geri eklenmez.
 * Rezervasyon / peşinat ciro değildir; satış gibi toplama yazılmaz.
 * Gider çıkıştır: satır eksi tutarla durur ve bakiyeden bir kez düşülür.
 * Aynı fiş numarası satışta varsa gider ikinci kez eklenmez.
 *
 * 138.500 − 5.000 = 133.500.
 * 135.000 (indirimi geri eklemek veya brüt − gider) ve
 * 132.000 (indirimi ikinci kez düşmek) yanlıştır.
 */
import { dailySalesDetailInvoiceDateRaw } from './dailySalesDetailInvoiceDate';
import { resolveCashierDisplayName } from './loginCashierName';
import { formatSaleWallClockTime, isBusinessDayClockAnchor } from './saleWallClock';
import {
  dailySalesDetailNetAmount,
  sumDailySalesDetailNet,
  type DailySalesDetailNetInput,
} from './dailySalesDetailNet';

export interface DailySalesDetailExpenseInput {
  key: string;
  ficheNo?: string | null;
  amount?: number | null;
  date?: string | null;
  /** Gider pusulası veya kasa çıkışının gerçek kayıt anı. İş günü sabiti saat değildir. */
  createdAt?: string | null;
  /** Kayıttaki kullanıcı kimliği. Ad yoksa harita ile çözülür; uydurulmaz. */
  enteredById?: string | null;
  /** Kayıtta yazılı ad. Yoksa boş kalır. */
  enteredByName?: string | null;
  description?: string | null;
  category?: string | null;
  partyName?: string | null;
  paymentMethod?: string | null;
  isCash?: boolean | null;
}

export interface DailySalesDetailExpenseGridRow extends DailySalesDetailNetInput {
  key: string;
  receiptNumber: string;
  date: string;
  /** Belge günü (`YYYY-MM-DD`). Duvar saati değil. */
  invoiceDate: string;
  /** Duvar saati. Kayıtta gerçek saat yoksa — */
  hour: string;
  /** Gideri ekleyen kişi. Kayıtta yoksa — */
  cashier: string;
  customerName: string;
  paymentMethod: string;
  isCash: boolean;
  isExpense: true;
  isDeposit: false;
  isAvans: false;
  status: 'outflow';
  kindLabel: string;
}

export interface DailySalesDetailCashRow extends DailySalesDetailNetInput {
  receiptNumber?: string | null;
  isDeposit?: boolean;
  isAvans?: boolean;
  isExpense?: boolean;
  /** İptal, iade yok, tamamlanmış tahsilata bağlı değil. Net nakde bir kez girer. */
  isForfeitedDeposit?: boolean;
}

const EPS = 0.004;

function receiptKey(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text || text === '—' || text === '-') return '';
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) out += String.fromCharCode(code + 32);
    else out += ch;
  }
  return out;
}

function expenseLabel(raw: DailySalesDetailExpenseInput): string {
  const description = String(raw.description ?? '').trim();
  if (description) return description;
  const category = String(raw.category ?? '').trim();
  if (category) return category;
  const party = String(raw.partyName ?? '').trim();
  return party || '—';
}

function blankFiche(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text || text === '—' || text === '-') return '';
  return text;
}

/** Kayıttaki gerçek saat. Tarih-only ve öğle/gece sabiti saat üretmez. */
export function dailyExpenseSourceHour(raw: {
  date?: string | null;
  createdAt?: string | null;
}): string {
  const created = String(raw.createdAt ?? '').trim();
  const clock = created && !isBusinessDayClockAnchor(created) ? created : '';
  return formatSaleWallClockTime({
    date: raw.date ?? '',
    created_at: clock || undefined,
  });
}

/** Gider pusulası ve kasa çıkışını eksi satıra çevirir. Çift fiş eklemez. */
export function buildDailySalesDetailExpenseRows(
  sales: readonly DailySalesDetailCashRow[],
  expenses: readonly DailySalesDetailExpenseInput[],
  kindLabel = 'Gider',
  userNameById?: Map<string, string>,
): DailySalesDetailExpenseGridRow[] {
  const booked = new Set<string>();
  for (const sale of sales) {
    const key = receiptKey(sale.receiptNumber);
    if (key) booked.add(key);
  }
  const out: DailySalesDetailExpenseGridRow[] = [];
  for (const expense of expenses) {
    const amount = Math.abs(Number(expense.amount) || 0);
    if (!(amount > EPS)) continue;
    const fiche = blankFiche(expense.ficheNo);
    const key = receiptKey(fiche);
    if (key && booked.has(key)) continue;
    if (key) booked.add(key);
    const method = String(expense.paymentMethod ?? '').trim() || 'cash';
    const names = userNameById ?? new Map<string, string>();
    const documentDate = expense.date == null ? '' : String(expense.date);
    out.push({
      key: `expense-${expense.key}`,
      receiptNumber: fiche || '—',
      date: documentDate,
      invoiceDate: dailySalesDetailInvoiceDateRaw({ date: documentDate }),
      hour: dailyExpenseSourceHour(expense),
      cashier: resolveCashierDisplayName(expense.enteredByName, expense.enteredById, names),
      customerName: expenseLabel(expense),
      beforeDiscount: 0,
      total: -amount,
      discount: 0,
      paymentMethod: method,
      isCash: expense.isCash !== false,
      isExpense: true,
      isDeposit: false,
      isAvans: false,
      status: 'outflow',
      kindLabel,
    });
  }
  return out;
}

/**
 * İndirim öncesi katkısı. Hizmet cirosudur.
 * Peşinat, vazgeçilmiş iptal peşinatı ve gider bu kolona girmez.
 */
export function dailySalesDetailBeforeDiscountContribution<T extends DailySalesDetailCashRow>(row: T): number {
  if (row.isExpense === true || row.isDeposit === true || row.isAvans === true || row.isForfeitedDeposit === true) {
    return 0;
  }
  if (row.beforeDiscount != null && Number.isFinite(Number(row.beforeDiscount))) {
    return Number(row.beforeDiscount) || 0;
  }
  return (Number(row.total) || 0) + (Number(row.discount) || 0);
}

/** İndirim katkısı. Peşinat ve gider indirim değildir. İndirim açık cari değildir. */
export function dailySalesDetailDiscountContribution<T extends DailySalesDetailCashRow>(row: T): number {
  if (row.isExpense === true || row.isDeposit === true || row.isAvans === true || row.isForfeitedDeposit === true) {
    return 0;
  }
  return Number(row.discount) || 0;
}

/**
 * Dip toplam kasa bakiyesi.
 * Hizmete mahsup edilmiş peşinat ve açık avans atlanır.
 * İade edilmemiş iptal peşinatı bir kez girer.
 * Gider satırının eksi neti bir kez girer.
 * İndirim kolonu bu toplama eklenmez; net zaten indirim sonrası tutardır.
 */
export function sumDailySalesDetailCashBalance<T extends DailySalesDetailCashRow>(
  rows: readonly T[],
  skip?: (row: T) => boolean,
): number {
  return sumDailySalesDetailNet(rows, (row) => {
    if (row.isForfeitedDeposit === true) return false;
    if (row.isDeposit === true || row.isAvans === true) return true;
    return skip?.(row) ?? false;
  });
}

/**
 * Günlük Rapor Net (Nakit). Dip toplamla aynı sayıdır.
 * Satış neti durur. Gider eksi satır olarak bir kez düşülür.
 * Hizmete mahsup edilmiş peşinat ikinci kez eklenmez.
 * İade edilmemiş iptal peşinatı bir kez eklenir.
 * İndirim açık cari değildir.
 *
 * 25.000 hizmet + 10.000 vazgeçilmiş peşinat = 35.000.
 * 5.000 mahsup peşinat 25.000'in içindedir.
 */
export function dailyReportScreenNetCash<T extends DailySalesDetailCashRow>(
  rows: readonly T[],
  skip?: (row: T) => boolean,
): number {
  return sumDailySalesDetailCashBalance(rows, skip);
}

/** Tek gider satırının neti. Çıkış eksi kalır; indirim eklenmez. */
export function dailySalesDetailExpenseNet(row: DailySalesDetailExpenseGridRow): number {
  return dailySalesDetailNetAmount(row);
}
