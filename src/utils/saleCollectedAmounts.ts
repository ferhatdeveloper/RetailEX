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
        // Kısmi peşin + üst bilgi veresiye: kalan = belge − tahsilat (cebe giren korunur)
        remaining = Math.max(0, gap);
      } else if (collected > 1e-9 && Math.abs(gap) <= 1e-6) {
        // Ödeme=Veresiye ama payments[] tam belgeyi nakit/kart yazmış — kasa şişmesin.
        // Yalnızca collected ≈ document iken; kısmi tahsilatı asla sıfırlama.
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

export type PosCheckoutPaymentRow = SalePaymentRow & {
  cash_register_id?: string | null;
  cash_register_name?: string | null;
  cash_register_code?: string | null;
};

export type PosCheckoutSettlement = SaleCollectedSplit & {
  /** Belge başlığı: kalan cari varsa her zaman veresiye (çoğunluk peşin olsa bile) */
  paymentMethod: 'cash' | 'card' | 'transfer' | 'veresiye';
  payments: PosCheckoutPaymentRow[];
};

/**
 * POS / güzellik ödeme onayı — peşin + kalan cari kırılımı.
 * Çoğunluk kuralı peşin yöntem seçiminde kullanılır; herhangi bir veresiye satırı
 * veya kalan > 0 ise belge payment_method = veresiye (cari borç + CH_TAHSILAT).
 */
export function resolvePosCheckoutSettlement(
  documentTotal: number,
  payments?: PosCheckoutPaymentRow[] | null,
): PosCheckoutSettlement {
  const rows = (Array.isArray(payments) ? payments : [])
    .filter((p) => p != null)
    .map((p) => {
      const methodRaw = String(p.method || 'cash').trim().toLowerCase();
      const method =
        methodRaw === 'gateway' || methodRaw === 'kart' ? 'card' : methodRaw;
      return {
        ...p,
        method,
        amount: Number(p.amount) || 0,
        currency: p.currency,
      };
    });

  let prepaidDominant: 'cash' | 'card' | 'transfer' = 'cash';
  let bestPrepaid = 0;
  let hasCredit = false;
  for (const row of rows) {
    const amt = toLocalAmount(Number(row.amount) || 0, row.currency);
    if (!(amt > 0)) continue;
    const bucket = normalizePaymentMethodBucket(row.method);
    if (bucket === 'credit') {
      hasCredit = true;
      continue;
    }
    if (bucket === 'card' || bucket === 'transfer' || bucket === 'cash') {
      if (amt > bestPrepaid) {
        bestPrepaid = amt;
        prepaidDominant = bucket;
      }
    }
  }

  const headerGuess = hasCredit ? 'veresiye' : prepaidDominant;
  const split = splitPaymentRows(documentTotal, rows, headerGuess);
  const paymentMethod: PosCheckoutSettlement['paymentMethod'] =
    hasCredit || Math.abs(split.remaining) > 1e-6 ? 'veresiye' : prepaidDominant;

  return {
    ...split,
    paymentMethod,
    payments: rows,
  };
}

export type KasaCollectionLine = {
  islem_tipi?: string;
  tutar?: number;
  islem_no?: string;
};

function receiptKey(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

/** Güzellik/klinik satış: kayıtlı tahsilat varsa o; yoksa belge kırılımı. */
export function beautySalePocketCollected(sale: {
  total?: number;
  payment_method?: string;
  paid_amount?: number;
  remaining_amount?: number;
  payments?: SalePaymentRow[] | null;
}): number {
  const paid = Number(sale.paid_amount);
  const rem = Number(sale.remaining_amount);
  // payments[] varsa her zaman kırılımdan (eski 0/0 + veresiye yanlış KPI’yı düzeltir)
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    return Math.max(
      0,
      saleCollectedSplit({
        total: Number(sale.total) || 0,
        paymentMethod: sale.payment_method,
        payments: sale.payments,
      }).collected,
    );
  }
  if (Number.isFinite(paid) && (Math.abs(paid) > 1e-9 || Math.abs(rem) > 1e-9)) {
    return Math.max(0, paid);
  }
  return Math.max(
    0,
    saleCollectedSplit({
      total: Number(sale.total) || 0,
      paymentMethod: sale.payment_method,
      payments: sale.payments,
    }).collected,
  );
}

export function beautySaleRemainingCari(sale: {
  total?: number;
  payment_method?: string;
  paid_amount?: number;
  remaining_amount?: number;
  payments?: SalePaymentRow[] | null;
}): number {
  const paid = Number(sale.paid_amount);
  const rem = Number(sale.remaining_amount);
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    return Math.max(
      0,
      saleCollectedSplit({
        total: Number(sale.total) || 0,
        paymentMethod: sale.payment_method,
        payments: sale.payments,
      }).remaining,
    );
  }
  if (Number.isFinite(rem) && (Math.abs(paid) > 1e-9 || Math.abs(rem) > 1e-9)) {
    return Math.max(0, rem);
  }
  return Math.max(
    0,
    saleCollectedSplit({
      total: Number(sale.total) || 0,
      paymentMethod: sale.payment_method,
      payments: sale.payments,
    }).remaining,
  );
}

/**
 * Aynı gün peşin satış / payments[] nakit satırı zaten KPI'da.
 * Buraya yalnızca:
 * - fişi o günün satışında olmayan CH_TAHSILAT (sonradan tahsilat)
 * - veresiye kaydı paid_amount/payments olmadan duran eski karma satışın CH_TAHSILAT'ı
 *
 * Güzellik checkout `paid_amount` yazar ve aynı anda CH_TAHSILAT üretir —
 * ikisini birden eklemek TAHSİLAT KPI'sını 2× şişirir (ör. 55k kasa → 110k dashboard).
 */
export type ExtraCollectionSaleRef = {
  total?: number;
  paymentMethod?: string | null;
  payments?: SalePaymentRow[] | null;
  receiptNumber?: string | null;
  paid_amount?: number | null;
  remaining_amount?: number | null;
};

export function extraCustomerCollectionsNotOnSales(
  cashLines: KasaCollectionLine[] | null | undefined,
  sales: Array<ExtraCollectionSaleRef | Pick<Sale, 'total' | 'paymentMethod' | 'payments' | 'receiptNumber'>>,
): number {
  if (!Array.isArray(cashLines) || cashLines.length === 0) return 0;
  const byReceipt = new Map<string, ExtraCollectionSaleRef>();
  for (const s of sales) {
    const k = receiptKey((s as ExtraCollectionSaleRef).receiptNumber ?? (s as Sale).receiptNumber);
    if (k) byReceipt.set(k, s as ExtraCollectionSaleRef);
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
    const pocketAlready = beautySalePocketCollected({
      total: Number(sale.total) || 0,
      payment_method: sale.paymentMethod ?? undefined,
      paid_amount: sale.paid_amount ?? undefined,
      remaining_amount: sale.remaining_amount ?? undefined,
      payments: sale.payments,
    });
    // Checkout peşin kısım + CH_TAHSILAT: paid_amount/payments KPI'da — ekleme.
    if (pocketAlready > 1e-9) continue;

    const split = saleCollectedSplit({
      total: Number(sale.total) || 0,
      paymentMethod: sale.paymentMethod ?? undefined,
      payments: sale.payments,
    });
    const hasPaymentRows = Array.isArray(sale.payments) && sale.payments.length > 0;
    if (!hasPaymentRows && Math.abs(split.remaining) > 1e-9 && Math.abs(split.cash) < 1e-9) {
      extra += amt;
    }
  }
  return extra;
}
