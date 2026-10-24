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

/** Gider pusulası ve kasa çıkışını eksi satıra çevirir. Çift fiş eklemez. */
export function buildDailySalesDetailExpenseRows(
  sales: readonly DailySalesDetailCashRow[],
  expenses: readonly DailySalesDetailExpenseInput[],
  kindLabel = 'Gider',
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
    const fiche = String(expense.ficheNo ?? '').trim();
    const key = receiptKey(fiche);
    if (key && booked.has(key)) continue;
    if (key) booked.add(key);
    const method = String(expense.paymentMethod ?? '').trim() || 'cash';
    out.push({
      key: `expense-${expense.key}`,
      receiptNumber: fiche || '—',
      date: expense.date == null ? '' : String(expense.date),
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
 * Dip toplam kasa bakiyesi.
 * Depozito ve avans atlanır. Gider satırının eksi neti bir kez girer.
 * İndirim kolonu bu toplama eklenmez; net zaten indirim sonrası tutardır.
 */
export function sumDailySalesDetailCashBalance<T extends DailySalesDetailCashRow>(
  rows: readonly T[],
  skip?: (row: T) => boolean,
): number {
  return sumDailySalesDetailNet(rows, (row) => {
    if (row.isDeposit === true || row.isAvans === true) return true;
    return skip?.(row) ?? false;
  });
}

/** Tek gider satırının neti. Çıkış eksi kalır; indirim eklenmez. */
export function dailySalesDetailExpenseNet(row: DailySalesDetailExpenseGridRow): number {
  return dailySalesDetailNetAmount(row);
}
