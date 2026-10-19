/**
 * Hizmet raporunda aynı fiş / aynı kayıt anındaki hizmetlere depozito payı.
 *
 * Kasa kaydı bölünmez. Pay, randevu sepetindeki düşümle aynıdır: hizmet
 * brütüne oran, 1.000'e yuvarlama, son satır kalanı alır.
 */
import type { BeautyAppointment } from '../types/beauty';
import { beautyAppointmentDateKey } from './dateLocal';

/** Aynı POS kaydından gelen kardeş randevular bu pencerede birlikte oluşur. */
const VISIT_WINDOW_MS = 3 * 60 * 1000;

export interface DepositShareInput {
  id: string;
  customerKey: string;
  dateKey: string;
  createdAtMs: number | null;
  price: number;
  deposit: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function customerKeyOf(a: BeautyAppointment): string {
  const id = String(a.client_id ?? a.customer_id ?? '').trim();
  if (id) return `id:${id}`;
  const name = String(a.customer_name ?? '').trim().toLowerCase();
  if (name) return `name:${name}`;
  return `solo:${a.id}`;
}

function createdAtMs(a: BeautyAppointment): number | null {
  const raw = String(a.created_at ?? '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Randevu sepetindeki rezervasyon düşümü ile aynı: en yakın 1.000. */
export function roundReservationMoney(n: number): number {
  return Math.round(n / 1000) * 1000;
}

export interface ReservationSpreadLine {
  unitPrice: number;
  qty: number;
  originalUnitPrice?: number;
}

/**
 * Randevu oluştururken sepete uygulanan orantılı düşüm.
 * Her satırın payı `orijinal birim × adet × (depozito / brüt)` ve 1.000'e
 * yuvarlanır. Son satır kalanı alır, sonra yine 1.000'e yuvarlanır.
 * Dönüş: yeni birim fiyat ve satırdan düşülen depozito payı.
 */
export function spreadReservationAcrossLines(
  lines: ReservationSpreadLine[],
  amount: number,
): Array<{ unitPrice: number; depositShare: number }> {
  if (lines.length === 0) return [];
  const qtyOf = (l: ReservationSpreadLine) => Math.max(1, Number(l.qty) || 1);
  const origOf = (l: ReservationSpreadLine) =>
    l.originalUnitPrice !== undefined && Number.isFinite(l.originalUnitPrice)
      ? l.originalUnitPrice
      : l.unitPrice;
  const totalGross = lines.reduce((s, l) => s + origOf(l) * qtyOf(l), 0);
  if (totalGross <= 0 || !(amount > 0)) {
    return lines.map((l) => ({ unitPrice: origOf(l), depositShare: 0 }));
  }
  const cap = Math.min(amount, totalGross);
  return lines.map((l, idx) => {
    const qty = qtyOf(l);
    const orig = origOf(l);
    let perUnit: number;
    if (idx === lines.length - 1) {
      const prevDeducted = lines.slice(0, -1).reduce((s, sl) => {
        const slQty = qtyOf(sl);
        const slOrig = origOf(sl);
        return s + Math.min(cap, roundReservationMoney(slOrig * slQty * (cap / totalGross))) / slQty;
      }, 0);
      perUnit = roundReservationMoney(Math.max(0, cap - prevDeducted) / qty);
    } else {
      const share = roundReservationMoney(orig * qty * (cap / totalGross));
      perUnit = roundReservationMoney(share / qty);
    }
    const unitPrice = roundReservationMoney(orig - perUnit);
    return { unitPrice, depositShare: round2((orig - unitPrice) * qty) };
  });
}

/**
 * Ağırlıklara göre tutarı böler. Kuruş artığı en büyük kesirden başlayarak
 * dağıtılır; sonuçların toplamı `total` ile aynıdır.
 */
export function splitAmountByWeight(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const target = round2(Math.max(0, total));
  if (target === 0) return weights.map(() => 0);

  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightSum = safeWeights.reduce((s, w) => s + w, 0);
  const effective = weightSum > 0 ? safeWeights : weights.map(() => 1);
  const effectiveSum = effective.reduce((s, w) => s + w, 0);

  const raw = effective.map((w) => (target * w) / effectiveSum);
  const cents = Math.round(target * 100);
  const floors = raw.map((x) => Math.floor(x * 100 + 1e-8));
  let used = floors.reduce((s, c) => s + c, 0);
  let remain = cents - used;
  const order = raw
    .map((x, i) => ({ i, frac: x * 100 - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (remain > 0 && order.length > 0) {
    floors[order[k % order.length].i] += 1;
    remain -= 1;
    k += 1;
  }
  return floors.map((c) => c / 100);
}

/**
 * Aynı müşteri, aynı gün ve aynı kayıt penceresindeki randevular bir ziyaret
 * sayılır. Depozito tek satırda toplanmışsa hizmet bedeline oranla paylaştırılır.
 * Her satırın kendi depozitosu varsa kayıtlar olduğu gibi kalır.
 */
export function allocateDepositShares(rows: DepositShareInput[]): Map<string, number> {
  const out = new Map<string, number>();
  const pending = rows.filter((r) => r.id);
  const used = new Set<string>();

  const withTime = pending
    .filter((r) => r.createdAtMs != null)
    .sort((a, b) => (a.createdAtMs! - b.createdAtMs!) || a.id.localeCompare(b.id));

  for (const row of withTime) {
    if (used.has(row.id)) continue;
    const anchor = row.createdAtMs!;
    const group = withTime.filter((other) => {
      if (used.has(other.id)) return false;
      if (other.customerKey !== row.customerKey || other.dateKey !== row.dateKey) return false;
      return Math.abs((other.createdAtMs ?? 0) - anchor) <= VISIT_WINDOW_MS;
    });
    applyGroup(group, out, used);
  }

  for (const row of pending) {
    if (used.has(row.id)) continue;
    out.set(row.id, round2(Math.max(0, row.deposit)));
    used.add(row.id);
  }
  return out;
}

function applyGroup(group: DepositShareInput[], out: Map<string, number>, used: Set<string>): void {
  for (const row of group) used.add(row.id);
  if (group.length <= 1) {
    const only = group[0];
    if (only) out.set(only.id, round2(Math.max(0, only.deposit)));
    return;
  }
  const positives = group
    .map((r) => round2(Math.max(0, r.deposit)))
    .filter((d) => d > 0.004);
  const unique = [...new Set(positives.map((d) => d.toFixed(2)))];
  if (positives.length === 0 || unique.length !== 1) {
    for (const row of group) out.set(row.id, round2(Math.max(0, row.deposit)));
    return;
  }
  const pool = Number(unique[0]);
  const spread = spreadReservationAcrossLines(
    group.map((r) => ({ unitPrice: r.price, qty: 1 })),
    pool,
  );
  group.forEach((row, i) => out.set(row.id, spread[i]?.depositShare ?? 0));
}

export function allocateBeautyVisitDeposits(appointments: BeautyAppointment[]): Map<string, number> {
  const rows: DepositShareInput[] = (appointments || []).map((a) => ({
    id: String(a.id ?? '').trim(),
    customerKey: customerKeyOf(a),
    dateKey: beautyAppointmentDateKey(a),
    createdAtMs: createdAtMs(a),
    price: Number(a.total_price) || 0,
    deposit: Number(a.deposit_amount) || 0,
  }));
  return allocateDepositShares(rows.filter((r) => r.id));
}
