/**
 * Ödeme tipi dağılımı — Kasa Durumu / Ödeme Dağılımı raporları.
 * Kaynak: InvoicePaymentInfoModal ile aynı form kodları (SYSTEM_PAYMENT_FORM_CODES).
 */
import type { Sale } from '../core/types';
import {
  dbPaymentMethodToFormCode,
  PAYMENT_FORM_CODE_META,
  SYSTEM_PAYMENT_FORM_CODES,
  type PaymentFormCode,
} from './paymentMethodUtils';
import type { SalePaymentRow } from './saleCollectedAmounts';

export type PaymentTypeDistItem = {
  code: PaymentFormCode;
  nameKey: string;
  color: string;
  amount: number;
  count: number;
  percentage: number;
};

export type PaymentTypeMovement = {
  id: string;
  date: string;
  receiptNumber: string;
  description: string;
  amount: number;
  cashier: string;
  customerName: string;
  methodCode: PaymentFormCode;
};

export type PaymentTypeSaleInput = {
  id?: string;
  total: number;
  paymentMethod?: unknown;
  payments?: SalePaymentRow[] | null;
  receiptNumber?: string;
  date?: string;
  cashier?: string;
  customerName?: string;
  description?: string;
};

function emptyAmounts(): Record<PaymentFormCode, number> {
  return {
    NAKIT: 0,
    KREDIKARTI: 0,
    ACIK_CARI: 0,
    HAVAL: 0,
    CEK: 0,
    SENET: 0,
  };
}

function resolveFormCode(raw: unknown): PaymentFormCode {
  const code = dbPaymentMethodToFormCode(raw);
  return code || 'ACIK_CARI';
}

/** Belge tutarını yapıdaki form kodlarına böler (çoklu ödeme satırları dahil). */
export function allocateSaleAmountsByFormCode(
  documentTotal: number,
  payments?: SalePaymentRow[] | null,
  paymentMethod?: unknown,
): Record<PaymentFormCode, number> {
  const out = emptyAmounts();
  const signedDoc = Number(documentTotal) || 0;
  if (signedDoc === 0) return out;
  const sign = signedDoc < 0 ? -1 : 1;
  const absDoc = Math.abs(signedDoc);

  const rows = Array.isArray(payments) ? payments.filter((p) => p != null) : [];
  if (rows.length > 0) {
    let allocated = 0;
    for (const row of rows) {
      const amt = Math.abs(Number(row.amount) || 0);
      if (!(amt > 0)) continue;
      const code = resolveFormCode(row.method);
      out[code] += amt * sign;
      allocated += amt;
    }
    const gap = absDoc - allocated;
    if (gap > 1e-6) {
      // Eksik kısım cari / açık hesap (veresiye kalan)
      out.ACIK_CARI += gap * sign;
    }
    return out;
  }

  const code = resolveFormCode(paymentMethod);
  out[code] = signedDoc;
  return out;
}

export function allocateErpSaleByFormCode(
  sale: Pick<Sale, 'total' | 'paymentMethod' | 'payments'>,
): Record<PaymentFormCode, number> {
  return allocateSaleAmountsByFormCode(
    Number(sale.total) || 0,
    sale.payments,
    sale.paymentMethod,
  );
}

export type BuildPaymentTypeDistributionOpts = {
  /** CH_TAHSILAT vb. satışa yazılmamış ekstra nakit */
  extraCash?: number;
  /** Tutar 0 olan yapı tiplerini de listele (varsayılan true) */
  includeZero?: boolean;
};

export function buildPaymentTypeDistribution(
  sales: PaymentTypeSaleInput[],
  opts?: BuildPaymentTypeDistributionOpts,
): {
  types: PaymentTypeDistItem[];
  byCode: Record<PaymentFormCode, PaymentTypeDistItem>;
  chartData: Array<{ code: PaymentFormCode; nameKey: string; value: number; count: number; color: string }>;
  totalAmount: number;
} {
  const amounts = emptyAmounts();
  const counts = emptyAmounts();

  for (const sale of sales) {
    const split = allocateSaleAmountsByFormCode(sale.total, sale.payments, sale.paymentMethod);
    for (const code of SYSTEM_PAYMENT_FORM_CODES) {
      const amt = split[code];
      if (Math.abs(amt) > 1e-9) {
        amounts[code] += amt;
        counts[code] += 1;
      }
    }
  }

  const extra = Number(opts?.extraCash) || 0;
  if (Math.abs(extra) > 1e-9) {
    amounts.NAKIT += extra;
    counts.NAKIT += 1;
  }

  const totalAmount = SYSTEM_PAYMENT_FORM_CODES.reduce((s, c) => s + amounts[c], 0);
  const includeZero = opts?.includeZero !== false;

  const types: PaymentTypeDistItem[] = SYSTEM_PAYMENT_FORM_CODES.map((code) => {
    const meta = PAYMENT_FORM_CODE_META[code];
    const amount = amounts[code];
    return {
      code,
      nameKey: meta.nameKey,
      color: meta.color,
      amount,
      count: counts[code],
      percentage: totalAmount !== 0 ? (amount / totalAmount) * 100 : 0,
    };
  }).filter((t) => includeZero || Math.abs(t.amount) > 1e-9);

  const byCode = {} as Record<PaymentFormCode, PaymentTypeDistItem>;
  for (const t of types) byCode[t.code] = t;
  // includeZero false iken eksik kodlar için sıfır stub
  for (const code of SYSTEM_PAYMENT_FORM_CODES) {
    if (!byCode[code]) {
      const meta = PAYMENT_FORM_CODE_META[code];
      byCode[code] = {
        code,
        nameKey: meta.nameKey,
        color: meta.color,
        amount: 0,
        count: 0,
        percentage: 0,
      };
    }
  }

  const chartData = types
    .filter((t) => Math.abs(t.amount) > 1e-9)
    .map((t) => ({
      code: t.code,
      nameKey: t.nameKey,
      value: t.amount,
      count: t.count,
      color: t.color,
    }));

  return { types, byCode, chartData, totalAmount };
}

export function buildPaymentTypeMovements(
  sales: PaymentTypeSaleInput[],
  methodCode: PaymentFormCode,
  opts?: { extraCash?: number; extraCashLabel?: string },
): PaymentTypeMovement[] {
  const out: PaymentTypeMovement[] = [];

  for (const sale of sales) {
    const split = allocateSaleAmountsByFormCode(sale.total, sale.payments, sale.paymentMethod);
    const amt = split[methodCode];
    if (!(Math.abs(amt) > 1e-9)) continue;
    const receipt = String(sale.receiptNumber || '').trim() || '—';
    out.push({
      id: String(sale.id || `${receipt}-${methodCode}-${sale.date || ''}`),
      date: String(sale.date || ''),
      receiptNumber: receipt,
      description: String(sale.description || sale.customerName || receipt || '—'),
      amount: amt,
      cashier: String(sale.cashier || '').trim() || '—',
      customerName: String(sale.customerName || '').trim() || '—',
      methodCode,
    });
  }

  const extra = Number(opts?.extraCash) || 0;
  if (methodCode === 'NAKIT' && Math.abs(extra) > 1e-9) {
    out.push({
      id: 'extra-cash-collections',
      date: '',
      receiptNumber: '—',
      description: opts?.extraCashLabel || 'Ek tahsilat',
      amount: extra,
      cashier: '—',
      customerName: '—',
      methodCode: 'NAKIT',
    });
  }

  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
