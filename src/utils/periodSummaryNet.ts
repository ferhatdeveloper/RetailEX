/**
 * Aylık Gün Özeti / Yıllık Ay Özeti — brüt ciro, iade ve net kalan.
 *
 * Kök neden: satış listesi yalnız Satış kategorisidir. Müşteri iade fişi
 * (trcode 2/3 veya return_invoice) bu listeye girmez. İade kolonu 0 kalır,
 * net kalan brüt cirodan iadeyi düşmez.
 *
 * Muhasebe: satış geliri brüt kalır. İade ayrı tenzildir, bir kez düşülür.
 * Net kalan = brüt ciro − iade − masraf.
 * Peşinat kazanç değildir: ciroya eklenmez, netten düşülmez.
 * Satış adedi iade fişiyle artmaz ve iade için ikinci kez azalmaz.
 */
import type { Sale } from '../core/types';
import { isReturnSale } from './posZReport';
import { isDepositSale } from './reportDepositFilter';
import { saleCollectedSplit } from './saleCollectedAmounts';
import { reportNetCiroMinusGider } from '../services/reportMenuParamsService';

export type PeriodSaleBucket = {
  saleCount: number;
  revenue: number;
  cash: number;
  card: number;
  veresiye: number;
  discount: number;
  returnsCount: number;
  /** İade kolonu. Artı büyüklük. */
  returnsAmount: number;
  /**
   * Netten düşülen iade. Ayrı müşteri iade fişi.
   * Brüt ciroya yazılmadığı için bir kez düşülür.
   * Satış listesindeki refunded fiş burada yoktur: o fiş zaten ciroya
   * girmez, ikinci kez düşülmez.
   */
  returnDeduction: number;
  depositCount: number;
  depositAmount: number;
  reservationGross: number;
  reservationPending: number;
};

export type PeriodSaleInput = Sale & {
  /** getCustomerReturns ile gelen ayrı iade fişi. Peşinat değildir. */
  periodReturnDocument?: boolean;
};

export function emptyPeriodSaleBucket(): PeriodSaleBucket {
  return {
    saleCount: 0,
    revenue: 0,
    cash: 0,
    card: 0,
    veresiye: 0,
    discount: 0,
    returnsCount: 0,
    returnsAmount: 0,
    returnDeduction: 0,
    depositCount: 0,
    depositAmount: 0,
    reservationGross: 0,
    reservationPending: 0,
  };
}

function saleId(sale: { id?: string }): string {
  return String(sale.id || '').trim();
}

/**
 * Brüt satışlar ile müşteri iade fişlerini tekilleştirir.
 * Aynı kimlik iki listede varsa iade fişi kalır, satış adedine yazılmaz.
 */
export function mergeGrossSalesWithCustomerReturns(
  grossSales: Sale[],
  customerReturns: Sale[],
): PeriodSaleInput[] {
  const returnIds = new Set(
    customerReturns.map((row) => saleId(row)).filter(Boolean),
  );
  const seen = new Set<string>();
  const out: PeriodSaleInput[] = [];

  for (const sale of grossSales) {
    const id = saleId(sale);
    if (id && returnIds.has(id)) continue;
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(sale);
  }

  for (const row of customerReturns) {
    const id = saleId(row);
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push({ ...row, periodReturnDocument: true });
  }

  return out;
}

/**
 * Net kalan = brüt ciro − iade − masraf (+ ciroya yazılmamış avans).
 * `reservationDeposit` bilgi kolonudur; sonuca eklenmez ve düşülmez.
 */
export function periodSummaryNetRemaining(input: {
  revenue: number;
  returnDeduction: number;
  expenses: number;
  expenseEnabled: boolean;
  ciroDisiTahsilat?: number;
  reservationDeposit?: number;
}): number {
  const revenue = Number(input.revenue) || 0;
  const returns = Math.abs(Number(input.returnDeduction) || 0);
  const expenses = Number(input.expenses) || 0;
  const outside = Number(input.ciroDisiTahsilat) || 0;
  return reportNetCiroMinusGider(revenue, expenses, input.expenseEnabled) - returns + outside;
}

export function sumPeriodSaleBuckets(map: Map<string, PeriodSaleBucket>): PeriodSaleBucket {
  const total = emptyPeriodSaleBucket();
  for (const row of map.values()) {
    total.saleCount += row.saleCount;
    total.revenue += row.revenue;
    total.cash += row.cash;
    total.card += row.card;
    total.veresiye += row.veresiye;
    total.discount += row.discount;
    total.returnsCount += row.returnsCount;
    total.returnsAmount += row.returnsAmount;
    total.returnDeduction += row.returnDeduction;
    total.depositCount += row.depositCount;
    total.depositAmount += row.depositAmount;
    total.reservationGross += row.reservationGross;
    total.reservationPending += row.reservationPending;
  }
  return total;
}

/**
 * Gün / ay kovası. Brüt satış ciroya yazılır. Ayrı iade fişi ciroya
 * ve satış adedine yazılmaz; iade kolonuna ve net tenziline gider.
 */
export function aggregatePeriodSales(
  sales: PeriodSaleInput[],
  bucketKey: (sale: PeriodSaleInput) => string,
  completedAppointmentIds: Set<string> = new Set(),
  appliedAvansBySaleId: Map<string, number> = new Map(),
): Map<string, PeriodSaleBucket> {
  const map = new Map<string, PeriodSaleBucket>();

  const bump = (key: string) => {
    const row = map.get(key) || emptyPeriodSaleBucket();
    map.set(key, row);
    return row;
  };

  for (const sale of sales) {
    const st = String(sale.status ?? '').toLowerCase();
    if (st === 'cancelled' || st === 'canceled' || st === 'silindi' || st === 'iptal') continue;
    const ficheType = String((sale as { fiche_type?: string }).fiche_type ?? '');
    if (ficheType === 'opening_balance' || ficheType === 'purchase_invoice') continue;
    const key = bucketKey(sale);
    if (!key) continue;

    const row = bump(key);
    const total = Number(sale.total) || 0;
    const absTotal = Math.abs(total);
    const deposit = isDepositSale(sale);
    const separateReturn = Boolean(sale.periodReturnDocument) && !deposit;

    if (separateReturn) {
      if (absTotal > 0) {
        row.returnsCount += 1;
        row.returnsAmount += absTotal;
        row.returnDeduction += absTotal;
      }
      continue;
    }

    const isReturn = isReturnSale(sale);

    if (isReturn) {
      row.returnsCount += 1;
      row.returnsAmount += absTotal;
    }

    if (st === 'refunded') continue;

    if (deposit) {
      const linkedApt = String((sale as { linked_appointment_id?: string }).linked_appointment_id ?? '').trim();
      const isCompletedLinked = linkedApt && completedAppointmentIds.has(linkedApt);
      if (isCompletedLinked && !isReturn) {
        row.revenue += absTotal;
        row.saleCount += 1;
        const split = saleCollectedSplit(
          sale,
          appliedAvansBySaleId.get(String(sale.id)) || 0,
        );
        row.cash += split.cash;
        row.card += split.card;
        row.veresiye += Number(split.remaining) || 0;
      } else {
        row.depositCount += 1;
        row.depositAmount += absTotal;
      }
      continue;
    }

    if (!isReturn) {
      row.saleCount += 1;
      row.discount += Number(sale.discount) || 0;
    }

    row.revenue += absTotal;
    const split = saleCollectedSplit(
      sale,
      appliedAvansBySaleId.get(String(sale.id)) || 0,
    );
    row.cash += split.cash;
    row.card += split.card;
    if (!isReturn) {
      row.veresiye += Number(split.remaining) || 0;
    }
  }

  return map;
}

export function aggregatePeriodSalesAndReturns(
  grossSales: Sale[],
  customerReturns: Sale[],
  bucketKey: (sale: PeriodSaleInput) => string,
  completedAppointmentIds: Set<string> = new Set(),
  appliedAvansBySaleId: Map<string, number> = new Map(),
): Map<string, PeriodSaleBucket> {
  return aggregatePeriodSales(
    mergeGrossSalesWithCustomerReturns(grossSales, customerReturns),
    bucketKey,
    completedAppointmentIds,
    appliedAvansBySaleId,
  );
}
