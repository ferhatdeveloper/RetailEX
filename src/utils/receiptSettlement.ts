/**
 * Fiş tutar sırası: brüt, iskonto, net, ödenen, kalan.
 * Net = brüt − iskonto. Kalan = net − ödenen.
 * İskonto açık cari değildir; kalan borca eklenmez.
 * Ödenen (kasa çıkışı) olduğu gibi kalır; brüte çekilmez.
 */
import { moneyEpsilon } from './currency';
import { receiptUnpaidBalance } from './receiptUnpaidBalance';

export type ReceiptMoneyLine = {
  quantity?: number;
  price?: number;
  total?: number;
};

export type ReceiptSettlementInput = {
  items?: ReceiptMoneyLine[] | null;
  discount?: number;
  tax?: number;
  total?: number;
  subtotal?: number;
  paid?: number;
};

export type ReceiptSettlement = {
  gross: number;
  discount: number;
  net: number;
  paid: number;
  remaining: number;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function near(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Satır brütü: adet × birim liste fiyatı.
 * Kayıtlı satır tutarı indirim sonrası net kaldıysa liste fiyatı yazılır.
 */
export function receiptLineGross(item: ReceiptMoneyLine): number {
  const list = num(item.quantity) * num(item.price);
  const stored = num(item.total);
  if (!(Math.abs(list) > 0)) return stored;
  if (Math.abs(list) + 1e-9 >= Math.abs(stored)) return list;
  return stored;
}

export function receiptSettlement(
  input: ReceiptSettlementInput,
  currency?: string | null,
): ReceiptSettlement {
  const eps = Math.max(moneyEpsilon(currency), 0.5);
  const items = input.items ?? [];
  const grossFromLines = items.reduce((sum, item) => sum + receiptLineGross(item), 0);
  const discount = Math.abs(num(input.discount));
  const tax = Math.max(0, num(input.tax));
  const saleTotal = num(input.total);
  const paid = Math.max(0, num(input.paid));

  const gross = Math.abs(grossFromLines) > eps
    ? grossFromLines
    : (Math.abs(num(input.subtotal)) > eps ? num(input.subtotal) : saleTotal);

  if (saleTotal < -eps) {
    return {
      gross: saleTotal,
      discount,
      net: saleTotal,
      paid,
      remaining: 0,
    };
  }

  const computedNet = Math.max(0, Math.abs(gross) - discount + tax);
  const saleMag = Math.abs(saleTotal);
  const grossMag = Math.abs(gross);

  let net = computedNet;
  if (discount <= eps) {
    net = saleMag > eps ? saleMag : grossMag;
  } else if (saleMag > eps && near(saleMag, computedNet, eps)) {
    // Belge toplamı zaten net (brüt − iskonto). İkinci kez düşülmez.
    net = saleMag;
  } else if (saleMag > eps && near(saleMag, grossMag, eps)) {
    // Belge toplamı brüt kaydolmuş. İskonto kalan borç değildir.
    net = computedNet;
  } else if (saleMag > eps && saleMag + eps < grossMag) {
    net = saleMag;
  }

  return {
    gross: grossMag,
    discount,
    net,
    paid,
    remaining: receiptUnpaidBalance(net, paid),
  };
}
