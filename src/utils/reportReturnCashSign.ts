/**
 * Kasa defteri ve fatura kalem detayı — satış iadesi işareti.
 *
 * Kasa: brüt giren (tahsilat + peşinat) ayrı kalır. Nakit satış iadesi giden
 * satırdır. Peşinat / avans tahsilatı iade değildir, kasadan düşülmez.
 * Fatura kalemi: iade miktar ve tutarı bir kez eksidir. Kartlar satır
 * netlerinin toplamıdır; fatura başlığı satırlarda tekrar toplanmaz.
 */
import { dbPaymentMethodToFormCode } from './paymentMethodUtils';
import { isSalesReturnFiche } from './lastPurchaseCostSql';

export interface CashLedgerMovement {
  id: string;
  date: string;
  ficheNo: string;
  sequence: number;
  group: string;
  subGroup: string;
  description: string;
  incoming: number;
  outgoing: number;
  cumulative: number;
  cariId?: string;
  cariName?: string;
  cashRegisterId?: string;
  cashRegisterName?: string;
}

export interface SalesCashRefundSource {
  id: string;
  date: string;
  ficheNo: string;
  ficheType?: string | null;
  trcode?: number | null;
  paymentMethod?: string | null;
  netAmount?: number | null;
  totalNet?: number | null;
  isDeposit?: boolean | null;
  headerFields?: unknown;
  customerId?: string | null;
  customerName?: string | null;
}

/** Nakit (kasa) ödeme. Kart, veresiye, havale ve peşinat mahsubu kasa çıkışı değildir. */
export function isCashRefundPaymentMethod(raw: unknown): boolean {
  const text = String(raw ?? '').trim();
  if (!text) return false;
  const folded = text.toLocaleLowerCase('tr-TR');
  if (
    folded.includes('avans')
    || folded.includes('rezervasyon')
    || folded.includes('depozito')
    || folded.includes('peşinat')
    || folded.includes('pesinat')
  ) {
    return false;
  }
  if (dbPaymentMethodToFormCode(text) === 'NAKIT') return true;
  return folded === 'nakit' || folded === 'cash';
}

function parseHeaderFields(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

/**
 * header_fields.payments içindeki nakit payı.
 * Dizi yoksa null (başlık ödeme tipine düşülür). Nakit satır yoksa 0.
 */
export function cashPortionFromHeaderPayments(headerFields: unknown): number | null {
  const header = parseHeaderFields(headerFields);
  if (!header) return null;
  const payments = header.payments;
  if (!Array.isArray(payments) || payments.length === 0) return null;
  let cash = 0;
  let sawCash = false;
  for (const raw of payments) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as { method?: unknown; amount?: unknown };
    if (!isCashRefundPaymentMethod(row.method)) continue;
    sawCash = true;
    const amount = Math.abs(Number(row.amount) || 0);
    if (amount > 0) cash += amount;
  }
  if (!sawCash) return 0;
  return cash;
}

/**
 * Kasadan çıkacak nakit iade tutarı (giden kolonunda artı yazılır).
 * Peşinat fişi ve nakit olmayan iade 0 döner. Tutar bir kez alınır.
 */
export function cashRefundAmount(doc: SalesCashRefundSource): number {
  if (doc.isDeposit === true) return 0;
  if (!isSalesReturnFiche({ fiche_type: doc.ficheType, trcode: doc.trcode })) return 0;
  const fromPayments = cashPortionFromHeaderPayments(doc.headerFields);
  if (fromPayments != null) {
    if (fromPayments > 0) return fromPayments;
    if (!isCashRefundPaymentMethod(doc.paymentMethod)) return 0;
  } else if (!isCashRefundPaymentMethod(doc.paymentMethod)) {
    return 0;
  }
  const net = Number(doc.netAmount);
  const header = Number(doc.totalNet);
  const raw = Number.isFinite(net) && Math.abs(net) > 0
    ? net
    : (Number.isFinite(header) ? header : 0);
  return Math.abs(raw);
}

export function cashRefundAlreadyPosted(
  ficheNo: string,
  rows: Array<{ ficheNo?: string; description?: string; outgoing?: number }>,
): boolean {
  const no = String(ficheNo || '').trim();
  if (!no) return false;
  return rows.some((row) => {
    if (!((Number(row.outgoing) || 0) > 0)) return false;
    const fiche = String(row.ficheNo || '').trim();
    if (fiche === no) return true;
    const description = String(row.description || '');
    return description.includes(no);
  });
}

function refundDescription(ficheNo: string): string {
  const no = String(ficheNo || '').trim();
  return no ? `Nakit iade — ${no}` : 'Nakit iade';
}

/**
 * Kasa satırlarına, fişte olmayan nakit satış iadelerini giden olarak ekler.
 * Mevcut gelen satırlar (peşinat dahil) değiştirilmez.
 */
export function mergeCashLedgerRefunds(
  movements: CashLedgerMovement[],
  refunds: SalesCashRefundSource[],
): CashLedgerMovement[] {
  const rows = movements.map((row) => ({ ...row }));
  const seen = new Set<string>();
  for (const src of refunds) {
    const ficheNo = String(src.ficheNo || '').trim();
    const key = ficheNo || String(src.id || '');
    if (!key || seen.has(key)) continue;
    const amount = cashRefundAmount(src);
    if (!(amount > 0)) continue;
    if (ficheNo && cashRefundAlreadyPosted(ficheNo, rows)) {
      seen.add(key);
      continue;
    }
    seen.add(key);
    rows.push({
      id: `cash-refund-${String(src.id || ficheNo)}`,
      date: String(src.date || '').slice(0, 10),
      ficheNo,
      sequence: 1,
      group: 'KASA_CIKIS',
      subGroup: '',
      description: refundDescription(ficheNo),
      incoming: 0,
      outgoing: amount,
      cumulative: 0,
      cariId: String(src.customerId || ''),
      cariName: String(src.customerName || ''),
      cashRegisterId: '',
      cashRegisterName: '',
    });
  }
  rows.sort((a, b) => {
    const byDate = String(a.date).localeCompare(String(b.date));
    if (byDate !== 0) return byDate;
    const byFiche = String(a.ficheNo).localeCompare(String(b.ficheNo));
    if (byFiche !== 0) return byFiche;
    return (Number(a.sequence) || 0) - (Number(b.sequence) || 0);
  });
  return withCashLedgerCumulative(rows);
}

export function withCashLedgerCumulative<T extends { incoming: number; outgoing: number; cumulative: number }>(
  rows: T[],
): T[] {
  let running = 0;
  return rows.map((row) => {
    running += (Number(row.incoming) || 0) - (Number(row.outgoing) || 0);
    return { ...row, cumulative: running };
  });
}

export function cashLedgerTotals(
  rows: Array<{ incoming: number; outgoing: number; cumulative: number }>,
): { incoming: number; outgoing: number; net: number; finalBalance: number } {
  let incoming = 0;
  let outgoing = 0;
  for (const row of rows) {
    incoming += Number(row.incoming) || 0;
    outgoing += Number(row.outgoing) || 0;
  }
  const finalBalance = rows.length > 0 ? Number(rows[rows.length - 1]?.cumulative) || 0 : 0;
  return {
    incoming,
    outgoing,
    net: incoming - outgoing,
    finalBalance,
  };
}

/** Satış iadesinde tutar bir kez eksi. Zaten eksi ise tekrar çevrilmez. */
export function signSalesReturnOnce(isReturn: boolean, value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (!isReturn) return n;
  if (n < 0) return n;
  return -Math.abs(n);
}

export function signInvoiceDetailAmounts<T extends {
  quantity: number;
  lineGross: number;
  lineTotal: number;
  invoiceTotal: number;
}>(row: T, isReturn: boolean): T {
  return {
    ...row,
    quantity: signSalesReturnOnce(isReturn, row.quantity),
    lineGross: signSalesReturnOnce(isReturn, row.lineGross),
    lineTotal: signSalesReturnOnce(isReturn, row.lineTotal),
    invoiceTotal: signSalesReturnOnce(isReturn, row.invoiceTotal),
  };
}

/**
 * Kartlar: miktar ve her iki tutar kartı işaretli satır netlerinin toplamı.
 * Fatura başlığı satır başına tekrar edilse de karta bir daha eklenmez.
 */
export function invoiceItemsDetailCards(
  rows: Array<{ id?: string; invoiceNo?: string; quantity: number; lineTotal: number }>,
): { qty: number; lineTotal: number; invoiceTotal: number; invoiceCount: number } {
  const seen = new Set<string>();
  let qty = 0;
  let lineTotal = 0;
  for (const row of rows) {
    qty += Number(row.quantity) || 0;
    lineTotal += Number(row.lineTotal) || 0;
    const key = String(row.invoiceNo || row.id || '').trim();
    if (key) seen.add(key);
  }
  return {
    qty,
    lineTotal,
    invoiceTotal: lineTotal,
    invoiceCount: seen.size,
  };
}
