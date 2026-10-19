/**
 * Günlük raporda rezervasyon tutarı veresiye değildir.
 * Rezervasyon kartındaki tutar, satış kalanından düşülür. Tahsilat ve
 * kasa toplamına eklenmez. Satış kırılımına zaten yazılmış avans ikinci
 * kez düşülmez.
 *
 * 50.000 belge, 35.000 nakit, kalan 15.000, rezervasyon kartı 15.000
 * ve avans satışa yazılmamış → veresiye 0.
 */

export interface SaleRemainingRow {
  id: string;
  customerId: string;
  remaining: number;
}

export interface ReservationAvansRow {
  customerId: string;
  amount: number;
  status?: string | null;
  appliedSaleId?: string | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Günlük kart: rezervasyon tutarı veresiye değildir.
 * Satış kalanlarının toplamından rezervasyon kartındaki tutar düşülür.
 * 50.000 belge, 35.000 nakit, kalan 15.000 ve rezervasyon 15.000 → veresiye 0.
 */
export function dailyVeresiyeAfterReservation(rawRemaining: number, reservationAmount: number): number {
  return Math.max(0, round2(Math.max(0, rawRemaining) - Math.max(0, reservationAmount)));
}

/**
 * Rezervasyon kartından, satış kalanına zaten işlenmiş avans çıkarılır.
 * Kalan tutar veresiyeden düşülür; tahsilata eklenmez.
 */
export function reservationOutsideSaleSplit(
  reservationShown: number,
  appliedAlreadyCredited: number,
): number {
  return Math.max(
    0,
    round2(Math.max(0, Number(reservationShown) || 0) - Math.max(0, Number(appliedAlreadyCredited) || 0)),
  );
}

/** Satır kalanlarından rezervasyon tutarını sırayla düşer. Toplam, kart ile aynıdır. */
export function absorbReservationFromRemainings(
  rows: Array<{ id: string; remaining: number; appliedCredited?: number }>,
  reservationAmount: number,
): Map<string, number> {
  const alreadyInSplit = rows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.appliedCredited) || 0),
    0,
  );
  let left = reservationOutsideSaleSplit(reservationAmount, alreadyInSplit);
  const out = new Map<string, number>();
  for (const row of rows) {
    const remaining = Math.max(0, Number(row.remaining) || 0);
    const used = Math.min(remaining, left);
    left = round2(left - used);
    out.set(String(row.id), round2(remaining - used));
  }
  return out;
}

/**
 * Ödeme dağılımındaki açık cariden, satış kırılımına girmemiş rezervasyonu çıkarır.
 * Dağılım toplamı aynı tutarda azalır; nakit / kart değişmez.
 */
/**
 * Kasaya giren rezervasyon, nakit / kasa girişine eklenir.
 * Satış kırılımına işlenmiş avans tekrar eklenmez.
 * 35.000 hizmet tahsilatı + 15.000 rezervasyon → kasa 50.000.
 * Kasa satırı ile avans kartı aynı tutarsa bir kez yazılır.
 */
export function reservationRegisterTopUp(args: {
  avansCashShown: number;
  avansCardShown: number;
  appliedCashIncrease: number;
  cashLineReservation: number;
}): { cash: number; card: number } {
  const avansCash = Math.max(0, Number(args.avansCashShown) || 0);
  const avansCard = Math.max(0, Number(args.avansCardShown) || 0);
  const applied = Math.max(0, Number(args.appliedCashIncrease) || 0);
  const lines = Math.max(0, Number(args.cashLineReservation) || 0);
  const cashFromAvans = Math.max(0, round2(avansCash - applied));
  const orphanLines = Math.max(0, round2(lines - avansCash - avansCard));
  return {
    cash: round2(cashFromAvans + orphanLines),
    card: round2(avansCard),
  };
}

/**
 * Kasaya giren rezervasyon, satış kırılımında yoksa kasiyerin nakdine yazılır.
 * Ciro ve işlem sayısı değişmez. Günlük kasa kimliği (topUp) aşılmaz.
 * Tek kasiyer varsa tutarın tamamı ona yazılır.
 */
export function reservationCashByCashier(args: {
  cashierNames: string[];
  avans: Array<{
    amount: number;
    method?: string | null;
    appliedSaleId?: string | null;
    status?: string | null;
  }>;
  saleCashierById: ReadonlyMap<string, string>;
  appliedCashBySaleId: ReadonlyMap<string, number>;
  topUp: { cash: number; card: number };
  isCard?: (method: string | null | undefined) => boolean;
}): Map<string, { cash: number; card: number }> {
  const out = new Map<string, { cash: number; card: number }>();
  const add = (name: string, cash: number, card: number) => {
    if (!name || (cash <= 0.004 && card <= 0.004)) return;
    const cur = out.get(name) || { cash: 0, card: 0 };
    cur.cash = round2(cur.cash + cash);
    cur.card = round2(cur.card + card);
    out.set(name, cur);
  };
  const names = args.cashierNames.map((n) => String(n || '').trim()).filter(Boolean);
  const only = names.length === 1 ? names[0] : '';
  const cardOf = args.isCard || ((method) => {
    const m = String(method || '').trim().toLowerCase();
    return m === 'card' || m === 'kart' || m === 'pos' || m.includes('kredi');
  });
  let assignedCash = 0;
  let assignedCard = 0;
  for (const row of args.avans) {
    const amount = Math.abs(Number(row.amount) || 0);
    if (amount <= 0.004) continue;
    const saleId = String(row.appliedSaleId || '').trim();
    const status = String(row.status || '').trim().toLowerCase();
    const applied = saleId ? Number(args.appliedCashBySaleId.get(saleId) || 0) : 0;
    if (status === 'applied' && applied > 0.004) continue;
    const name = (saleId && args.saleCashierById.get(saleId)) || only;
    if (!name) continue;
    if (cardOf(row.method)) {
      add(name, 0, amount);
      assignedCard += amount;
    } else {
      add(name, amount, 0);
      assignedCash += amount;
    }
  }
  const topCash = Math.max(0, Number(args.topUp.cash) || 0);
  const topCard = Math.max(0, Number(args.topUp.card) || 0);
  if (assignedCash > topCash + 0.004 && assignedCash > 0) {
    const factor = topCash / assignedCash;
    for (const value of out.values()) value.cash = round2(value.cash * factor);
    assignedCash = topCash;
  }
  if (assignedCard > topCard + 0.004 && assignedCard > 0) {
    const factor = topCard / assignedCard;
    for (const value of out.values()) value.card = round2(value.card * factor);
    assignedCard = topCard;
  }
  const cashLeft = round2(topCash - Math.min(assignedCash, topCash));
  const cardLeft = round2(topCard - Math.min(assignedCard, topCard));
  if (only) add(only, cashLeft, cardLeft);
  return out;
}

export function detachReservationFromOpenAccount(args: {
  openAccount: number;
  distributionTotal: number;
  reservationOutsideSplit: number;
}): { openAccount: number; distributionTotal: number; removed: number } {
  const openAccount = Math.max(0, Number(args.openAccount) || 0);
  const total = Number(args.distributionTotal) || 0;
  const cut = Math.min(openAccount, Math.max(0, Number(args.reservationOutsideSplit) || 0));
  return {
    openAccount: round2(openAccount - cut),
    distributionTotal: round2(total - cut),
    removed: round2(cut),
  };
}

export function offsetSaleRemainingWithReservation(
  sales: SaleRemainingRow[],
  avans: ReservationAvansRow[],
  appliedBySaleId: ReadonlyMap<string, number>,
): Map<string, number> {
  const credited = new Set<string>();
  for (const [saleId, amt] of appliedBySaleId) {
    if (Math.abs(Number(amt) || 0) > 0.004) credited.add(String(saleId));
  }

  const pool = new Map<string, number>();
  let unassigned = 0;
  for (const row of avans) {
    const amount = Math.abs(Number(row.amount) || 0);
    if (amount <= 0.004) continue;
    const appliedId = String(row.appliedSaleId || '').trim();
    const status = String(row.status || '').trim().toLowerCase();
    if (status === 'applied' && appliedId && credited.has(appliedId)) continue;
    const customerId = String(row.customerId || '').trim();
    if (!customerId) {
      unassigned += amount;
      continue;
    }
    pool.set(customerId, (pool.get(customerId) || 0) + amount);
  }

  const out = new Map<string, number>();
  for (const sale of sales) {
    let remaining = Math.max(0, Number(sale.remaining) || 0);
    const customerId = String(sale.customerId || '').trim();
    if (remaining > 0 && customerId) {
      const available = pool.get(customerId) || 0;
      const used = Math.min(remaining, available);
      remaining = round2(remaining - used);
      pool.set(customerId, round2(available - used));
    }
    out.set(String(sale.id), remaining);
  }

  const stillOpen = sales.filter((sale) => (out.get(String(sale.id)) || 0) > 0.004);
  if (sales.length === 1 && stillOpen.length === 1) {
    let leftover = unassigned;
    for (const value of pool.values()) leftover += Math.max(0, value);
    const only = stillOpen[0];
    const remaining = out.get(String(only.id)) || 0;
    out.set(String(only.id), round2(remaining - Math.min(remaining, leftover)));
  }
  return out;
}
