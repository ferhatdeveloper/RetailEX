/**
 * Günlük rapor Satış Detayları — fiş kümesi.
 *
 * Seçilen gündeki her fiş bir kez durur. Yeni fiş eskisini düşürmez.
 * Müşteri adı harita anahtarı değildir. Sabit 4, son N ve LIMIT yoktur.
 *
 * İptal, fatura no / satış fişi / avans fişi kimliğine bağlıdır.
 * Aynı müşterinin diğer fişi iptal olmaz, gizlenmez, birleşmez.
 * İptal peşinatı yalnız o faturanın tutarıdır. Başka faturanın peşinatı eklenmez.
 * Kapanmış randevunun peşinat satırı listede görünmez. Tutar cirodadır;
 * rezervasyon kutusuna ve nete ikinci kez girmez.
 * Açık peşinat ve iptal peşinatı listede kalır. İptal tutarı kutuya bir kez girer.
 *
 * Net = ciro + rezervasyon − iade − gider. İade ve gider bir kez.
 * İndirim ciro netindedir, açık cari değildir.
 */
import { customerKeyIsCancelTarget } from './beautyAppointmentCancel';
import { assembleDailySalesDetailRows } from './dailySalesDetailRows';
import { reportDisplayNet } from './periodSummaryNet';

export interface DailyFicheIdentity {
  id?: string | null;
  receiptNumber?: string | null;
  saleGroupId?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  customerCode?: string | null;
}

export interface DailyScreenFiche extends DailyFicheIdentity {
  /** Hizmet veya ürün cirosu. İndirim düşülmüş net. Peşinat burada yoktur. */
  revenue?: number | null;
  /** Bu fişin kendi peşinatı. */
  depositAmount?: number | null;
  /** İade tutarı. Artı yazılır; netten bir kez düşülür. */
  returnAmount?: number | null;
  /** Gider. Artı yazılır; netten bir kez düşülür. */
  expenseAmount?: number | null;
  /** Bu fişin kendi kaydı iptal. Müşteri adından türemez. */
  ownCancelled?: boolean | null;
  /** Randevu kapandı. Peşinat hizmet cirosunun içindedir. */
  closed?: boolean | null;
  /** Peşinat henüz hizmete mahsup edilmedi. */
  openDeposit?: boolean | null;
}

export interface DailyScreenTotals {
  rows: DailyScreenFiche[];
  revenue: number;
  reservation: number;
  returns: number;
  expenses: number;
  net: number;
  footer: number;
}

function normId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function absMoney(value: unknown): number {
  return Math.abs(money(value));
}

/**
 * İptal hedefi fatura no, satış fişi veya avans fişi kimliğidir.
 * Müşteri adı eşleşmesi başka fişi iptal etmez.
 */
export function ficheIsCancelTarget(
  fiche: DailyFicheIdentity,
  cancelTargetIds: readonly string[] | null | undefined,
): boolean {
  const targets = new Set(
    (cancelTargetIds || [])
      .map(normId)
      .filter((id) => id && !customerKeyIsCancelTarget(id, fiche)),
  );
  if (targets.size === 0) return false;
  const id = normId(fiche.id);
  const receipt = normId(fiche.receiptNumber);
  const group = normId(fiche.saleGroupId);
  if (id && targets.has(id)) return true;
  if (receipt && targets.has(receipt)) return true;
  if (group && targets.has(group)) return true;
  return false;
}

/**
 * Listedeki fişler. Kimlik bir kez. İlk tutar kalır.
 * Müşteri adına göre ezme yoktur. Dilim yoktur.
 */
export function listDailyScreenFiches<T extends DailyFicheIdentity>(
  fiches: readonly T[],
): T[] {
  return assembleDailySalesDetailRows(fiches);
}

/**
 * İptal yalnız hedef fişe yazılır. Diğer fiş, aynı müşteri olsa da durur.
 * `ownCancelled` yalnız o fişin kendi kaydıdır.
 */
export function bindInvoiceCancellations<T extends DailyScreenFiche>(
  fiches: readonly T[],
  cancelTargetIds: readonly string[] | null | undefined,
): T[] {
  const listed = listDailyScreenFiches(fiches);
  return listed.map((fiche) => {
    const targeted = ficheIsCancelTarget(fiche, cancelTargetIds);
    return {
      ...fiche,
      ownCancelled: targeted || fiche.ownCancelled === true,
    };
  });
}

/** İptal edilen faturanın kendi peşinatı. Başka fişin tutarı eklenmez. */
export function cancelledInvoiceDeposit(
  fiches: readonly DailyScreenFiche[],
  cancelTargetId: string,
): number {
  const target = normId(cancelTargetId);
  if (!target) return 0;
  let amount = 0;
  for (const fiche of fiches) {
    if (!ficheIsCancelTarget(fiche, [target])) continue;
    if (fiche.closed === true) continue;
    amount += absMoney(fiche.depositAmount);
  }
  return money(amount);
}

function reservationOf(fiche: DailyScreenFiche): number {
  const deposit = absMoney(fiche.depositAmount);
  if (!(deposit > 0)) return 0;
  if (fiche.closed === true) return 0;
  if (fiche.ownCancelled === true || fiche.openDeposit === true) return deposit;
  return 0;
}

/**
 * Kapanmış randevunun peşinat satırı. Hizmet cirosu olan fiş durur.
 * İptal ve açık peşinat durur. Müşteri adı bu karara girmez.
 */
export function closedAppointmentDepositHiddenFromList(fiche: DailyScreenFiche): boolean {
  if (fiche.ownCancelled === true || fiche.openDeposit === true) return false;
  if (fiche.closed !== true) return false;
  if (!(absMoney(fiche.depositAmount) > 0)) return false;
  if (money(fiche.revenue) !== 0) return false;
  if (absMoney(fiche.returnAmount) > 0) return false;
  if (absMoney(fiche.expenseAmount) > 0) return false;
  return true;
}

/**
 * Tam kümenin kartları ve dip toplamı.
 * Dip toplam son N satır değil, listedeki bütün fişlerdir.
 * Kapanmış peşinat satırı listede yoktur ve ciroya ikinci kez eklenmez.
 */
export function summarizeDailyScreenFiches(
  fiches: readonly DailyScreenFiche[],
  cancelTargetIds?: readonly string[] | null,
): DailyScreenTotals {
  const bound = bindInvoiceCancellations(fiches, cancelTargetIds);
  const rows = bound.filter((row) => !closedAppointmentDepositHiddenFromList(row));
  let revenue = 0;
  let reservation = 0;
  let returns = 0;
  let expenses = 0;
  for (const row of rows) {
    revenue += money(row.revenue);
    reservation += reservationOf(row);
    returns += absMoney(row.returnAmount);
    expenses += absMoney(row.expenseAmount);
  }
  const net = reportDisplayNet({
    revenue,
    reservationAmount: reservation,
    returnDeduction: returns,
    expenses,
    expenseEnabled: true,
  });
  return {
    rows,
    revenue: money(revenue),
    reservation: money(reservation),
    returns: money(returns),
    expenses: money(expenses),
    net,
    footer: net,
  };
}
