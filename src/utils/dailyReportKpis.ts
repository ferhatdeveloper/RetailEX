/**
 * Günlük Rapor kartları — ciro, belge, tahsilat ve kasa çıkışı.
 *
 * 130.000 formülü (eski tahsil / net nakit): iade satırı tahsilata hiç
 * yazılmıyordu. Hizmet 110.000 (peşinat 20.000 bunun içinde) + ürün
 * 20.000 = 130.000 brüt giriş. Nakit iade 10.000 düşülmediği için
 * tahsil edilen ve net nakit 130.000 kalıyordu.
 *
 * Doğru kasa:
 * - Brüt kasa girişi 130.000 (yalnız giren para).
 * - Nakit iade kasa çıkışı 10.000. Veresiye iade çıkış değildir.
 * - Tahsil edilen ve net nakit = 130.000 − 10.000 = 120.000.
 * - Nakit kartı da bu net tutardır; üç rakam aynı kasayı gösterir.
 *
 * Ciro ve belge: hizmet 110.000 + ürün 20.000 − iade 10.000 = 120.000.
 * İade eksi tutarla listede duruyorsa ikinci kez düşülmez. Peşinat
 * kazanç değildir; ciroya ve belgeye eklenmez.
 */
import type { Sale } from '../core/types';
import { isReturnSale } from './posZReport';
import { isDepositSale } from './reportDepositFilter';
import { saleCollectedSplit } from './saleCollectedAmounts';

export type DailyKpiSale = Pick<Sale, 'total' | 'paymentMethod' | 'payments' | 'status'> & {
  id?: string;
  discount?: number | null;
  isDeposit?: boolean | null;
  notes?: string | null;
  receiptNumber?: string | null;
  date?: string | Date | null;
  customerName?: string | null;
};

export interface CashReturnOutflow {
  id: string;
  receiptNumber: string;
  date: string;
  customerName: string;
  /** Kasadan çıkan tutar. Artı. */
  amount: number;
}

function asSale(sale: DailyKpiSale): Sale {
  return sale as Sale;
}

function appliedFor(sale: DailyKpiSale, applied?: ReadonlyMap<string, number>): number {
  const id = String(sale.id || '').trim();
  if (!id || !applied) return 0;
  return Number(applied.get(id) || 0) || 0;
}

/** Nakit, kart ve havale. Eksi ise kasadan çıkmıştır. Veresiye 0 kalır. */
function registerMovement(sale: DailyKpiSale, applied?: ReadonlyMap<string, number>): number {
  const split = saleCollectedSplit(asSale(sale), appliedFor(sale, applied));
  return (Number(split.cash) || 0) + (Number(split.card) || 0) + (Number(split.transfer) || 0);
}

function receiptKey(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * Net ciro ve net belge. Peşinat fişi yok sayılır.
 * Brüt satışlar toplanır, iade bir kez düşülür.
 */
export function dailyNetSaleRevenue(sales: readonly DailyKpiSale[]): number {
  let gross = 0;
  let returns = 0;
  for (const sale of sales) {
    if (isDepositSale(asSale(sale))) continue;
    const absTotal = Math.abs(Number(sale.total) || 0);
    if (!(absTotal > 0)) continue;
    if (isReturnSale(asSale(sale))) returns += absTotal;
    else gross += absTotal;
  }
  return gross - returns;
}

/**
 * Kasadan fiilen çıkan iade. Ödeme tipi nakit, kart veya havale ise
 * eksi hareketin mutlak değeri. Veresiye iade 0 döner.
 * Gider fişine aynı fiş no ile yazılmış çıkış tekrar eklenmez.
 */
export function listCashReturnOutflows(
  sales: readonly DailyKpiSale[],
  appliedAvansBySaleId?: ReadonlyMap<string, number>,
  expenseReceiptKeys?: ReadonlySet<string>,
): CashReturnOutflow[] {
  const booked = expenseReceiptKeys ?? new Set<string>();
  const out: CashReturnOutflow[] = [];
  for (const sale of sales) {
    if (isDepositSale(asSale(sale))) continue;
    if (!isReturnSale(asSale(sale))) continue;
    const movement = registerMovement(sale, appliedAvansBySaleId);
    const left = movement < 0 ? -movement : 0;
    if (!(left > 0.004)) continue;
    const receipt = String(sale.receiptNumber || '').trim();
    if (receipt && booked.has(receiptKey(receipt))) continue;
    out.push({
      id: String(sale.id || receipt || `iade-${out.length + 1}`),
      receiptNumber: receipt,
      date: sale.date == null ? '' : String(sale.date),
      customerName: String(sale.customerName || '').trim(),
      amount: left,
    });
  }
  return out;
}

export function sumCashReturnOutflow(rows: readonly CashReturnOutflow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

/**
 * Tahsil edilen = kasada kalan para.
 * Brüt tahsilat (iade hariç) + peşinatın satışa girmemiş kısmı − nakit iade.
 * Peşinat hizmet tahsilatının içindeyse ikinci kez eklenmez; çağıran
 * `reservationCash` olarak yalnız eksik kalanı geçirir.
 */
export function dailyNetCollected(args: {
  sales: readonly DailyKpiSale[];
  appliedAvansBySaleId?: ReadonlyMap<string, number>;
  extraCollections?: number;
  reservationCash?: number;
  reservationCard?: number;
  expenseReceiptKeys?: ReadonlySet<string>;
}): number {
  const applied = args.appliedAvansBySaleId;
  let collected = 0;
  for (const sale of args.sales) {
    if (isReturnSale(asSale(sale))) continue;
    const split = saleCollectedSplit(asSale(sale), appliedFor(sale, applied));
    collected += Number(split.collected) || 0;
  }
  collected += Number(args.extraCollections) || 0;
  collected += Number(args.reservationCash) || 0;
  collected += Number(args.reservationCard) || 0;
  const returns = listCashReturnOutflows(args.sales, applied, args.expenseReceiptKeys);
  return collected - sumCashReturnOutflow(returns);
}
