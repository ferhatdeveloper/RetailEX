/**
 * Belge tutarı (ciro) ≠ cebe giren nakit.
 *
 * Veresiye 100 / tahsil 40 / kalan 60:
 * - Ciro / belge = 100 (müşteri borcu)
 * - Nakit KPI = 40 (CH_TAHSILAT veya nakit satır)
 * - Kalan cari = 60
 *
 * Peşin nakit satış zaten kasada (KASA_GIRIS); aynı fişe hayalet tahsilat eklenmez.
 */
import type { Sale } from '../core/types';
import { normalizePaymentMethodBucket, paymentMethodImpliesCustomerDebt } from './paymentMethodUtils';

const FX: Record<string, number> = { IQD: 1, USD: 1310, EUR: 1450 };

export type SaleCollectedSplit = {
  document: number;
  cash: number;
  card: number;
  transfer: number;
  credit: number;
  /** Nakit + kart + havale (cariye yazılmayan tahsilat) */
  collected: number;
  remaining: number;
};

export type SalePaymentRow = {
  method?: string;
  amount?: number;
  currency?: string;
};

function toLocalAmount(amount: number, currency?: string): number {
  const ccy = String(currency || 'IQD').trim().toUpperCase();
  const rate = FX[ccy] || 1;
  return Math.abs(Number(amount) || 0) * rate;
}

export function splitPaymentRows(
  documentTotal: number,
  payments?: SalePaymentRow[] | null,
  paymentMethod?: unknown,
): SaleCollectedSplit {
  const signedDoc = Number(documentTotal) || 0;
  const sign = signedDoc < 0 ? -1 : 1;
  const document = signedDoc;

  const rows = Array.isArray(payments) ? payments.filter((p) => p != null) : [];
  if (rows.length > 0) {
    let cash = 0;
    let card = 0;
    let transfer = 0;
    let credit = 0;
    for (const row of rows) {
      const amt = toLocalAmount(Number(row.amount) || 0, row.currency);
      if (!(amt > 0)) continue;
      const bucket = normalizePaymentMethodBucket(row.method);
      if (bucket === 'cash') cash += amt;
      else if (bucket === 'card') card += amt;
      else if (bucket === 'transfer') transfer += amt;
      else credit += amt;
    }
    let collected = cash + card + transfer;
    let remaining = credit;
    let cashOut = cash;
    let cardOut = card;
    let transferOut = transfer;
    const methodIsCredit =
      normalizePaymentMethodBucket(paymentMethod) === 'credit' ||
      paymentMethodImpliesCustomerDebt(String(paymentMethod ?? ''));

    if (methodIsCredit && remaining <= 1e-9) {
      const gap = Math.abs(document) - collected;
      if (gap > 1e-6) {
        remaining = Math.max(0, gap);
      } else if (collected > 1e-9) {
        // Ödeme=Veresiye ama payments[] tam belgeyi nakit/kart yazmış — kasa şişmesin
        cashOut = 0;
        cardOut = 0;
        transferOut = 0;
        collected = 0;
        remaining = Math.abs(document);
      }
    } else if (remaining <= 1e-9 && Math.abs(document) - collected > 1e-6) {
      remaining = Math.max(0, Math.abs(document) - collected);
    }
    return {
      document,
      cash: cashOut * sign,
      card: cardOut * sign,
      transfer: transferOut * sign,
      credit: remaining * sign,
      collected: collected * sign,
      remaining: remaining * sign,
    };
  }

  const bucket = normalizePaymentMethodBucket(paymentMethod);
  if (bucket === 'credit' || paymentMethodImpliesCustomerDebt(String(paymentMethod ?? ''))) {
    return {
      document,
      cash: 0,
      card: 0,
      transfer: 0,
      credit: document,
      collected: 0,
      remaining: document,
    };
  }
  if (bucket === 'cash') {
    return {
      document,
      cash: document,
      card: 0,
      transfer: 0,
      credit: 0,
      collected: document,
      remaining: 0,
    };
  }
  if (bucket === 'card') {
    return {
      document,
      cash: 0,
      card: document,
      transfer: 0,
      credit: 0,
      collected: document,
      remaining: 0,
    };
  }
  if (bucket === 'transfer') {
    return {
      document,
      cash: 0,
      card: 0,
      transfer: document,
      credit: 0,
      collected: document,
      remaining: 0,
    };
  }
  return {
    document,
    cash: 0,
    card: 0,
    transfer: 0,
    credit: document,
    collected: 0,
    remaining: document,
  };
}

export function saleCollectedSplit(sale: Pick<Sale, 'total' | 'paymentMethod' | 'payments'>): SaleCollectedSplit {
  return splitPaymentRows(Number(sale.total) || 0, sale.payments, sale.paymentMethod);
}

export type KasaCollectionLine = {
  islem_tipi?: string;
  tutar?: number;
  islem_no?: string;
};

function receiptKey(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * Aynı gün peşin satış / payments[] nakit satırı zaten KPI'da.
 * Buraya yalnızca:
 * - fişi o günün satışında olmayan CH_TAHSILAT (sonradan tahsilat)
 * - veresiye kaydı payments[] olmadan duran eski karma satışın CH_TAHSILAT'ı
 */
export function extraCustomerCollectionsNotOnSales(
  cashLines: KasaCollectionLine[] | null | undefined,
  sales: Array<Pick<Sale, 'total' | 'paymentMethod' | 'payments' | 'receiptNumber'>>,
): number {
  if (!Array.isArray(cashLines) || cashLines.length === 0) return 0;
  const byReceipt = new Map<string, (typeof sales)[number]>();
  for (const s of sales) {
    const k = receiptKey(s.receiptNumber);
    if (k) byReceipt.set(k, s);
  }
  let extra = 0;
  for (const line of cashLines) {
    const tip = String(line.islem_tipi || '').trim().toUpperCase();
    if (tip !== 'CH_TAHSILAT') continue;
    const amt = Math.abs(Number(line.tutar) || 0);
    if (!(amt > 0)) continue;
    const sale = byReceipt.get(receiptKey(line.islem_no));
    if (!sale) {
      extra += amt;
      continue;
    }
    const split = saleCollectedSplit(sale);
    const hasPaymentRows = Array.isArray(sale.payments) && sale.payments.length > 0;
    if (!hasPaymentRows && Math.abs(split.remaining) > 1e-9 && Math.abs(split.cash) < 1e-9) {
      extra += amt;
    }
  }
  return extra;
}
