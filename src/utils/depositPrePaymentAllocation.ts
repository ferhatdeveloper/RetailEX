/**
 * Rezervasyon / Ön Ödeme Raporu — gösterim payı.
 *
 * Aynı fişin hizmetleri tek depozitoyu paylaşır. Pay
 * `spreadReservationAcrossLines` ile 1.000'e yuvarlanır.
 * Toplam tutar hizmet bedelidir; depozito üstüne eklenmez.
 * Kayıtlı randevu fiyatı ve fiş tutarı burada değişmez.
 */
import { spreadReservationAcrossLines } from './beautyDepositAllocation';

/** Aynı kayıt anındaki kardeş hizmetler. beautyDepositAllocation ile aynı pencere. */
const VISIT_WINDOW_MS = 3 * 60 * 1000;

export interface PrePaymentDepositSource {
  appointment_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  created_at?: string | null;
  total_price?: number | null;
  deposit_amount?: number | null;
  remainder_paid_amount?: number | null;
  payment_state?: string | null;
  status?: string | null;
  sale_group_id?: string | null;
  deposit_sale_id?: string | null;
  deposit_sale_fiche_no?: string | null;
  /** Müşteri avansı. Hizmet bedeline eklenmez; pay hesabına girmez. */
  avans_total?: number | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function createdMs(row: PrePaymentDepositSource): number | null {
  const raw = String(row.created_at ?? '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function customerKey(row: PrePaymentDepositSource): string {
  const id = String(row.customer_id ?? '').trim();
  if (id) return `id:${id}`;
  const name = String(row.customer_name ?? '').trim().toLocaleLowerCase('tr');
  if (name && name !== '—') return `name:${name}`;
  return `solo:${row.appointment_id}`;
}

function dateKey(row: PrePaymentDepositSource): string {
  return String(row.appointment_date ?? '').trim().slice(0, 10);
}

/** Fiş kimliği. Boşsa satır kardeş hizmet olabilir. */
function ficheKey(row: PrePaymentDepositSource): string {
  const group = String(row.sale_group_id ?? '').trim();
  if (group) return `g:${group}`;
  const fiche = String(row.deposit_sale_fiche_no ?? '').trim();
  if (fiche) return `f:${fiche}`;
  const sale = String(row.deposit_sale_id ?? '').trim();
  if (sale) return `d:${sale}`;
  return '';
}

/**
 * Aynı işaret ve aynı mutlak tutar bir kez döner.
 * Farklı tutarlar (iki ayrı fiş) null: her satır kendi depozitosunu korur.
 */
function singlePool(deposits: number[]): number | null {
  const present = deposits.map((n) => round2(n)).filter((n) => Math.abs(n) > 0.004);
  if (present.length === 0) return null;
  const keys = [...new Set(present.map((n) => Math.abs(n).toFixed(2)))];
  if (keys.length !== 1) return null;
  const neg = present.some((n) => n < 0);
  const pos = present.some((n) => n > 0);
  if (neg && pos) return null;
  return (neg ? -1 : 1) * Number(keys[0]);
}

function sortSiblings<T extends PrePaymentDepositSource>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ca = createdMs(a);
    const cb = createdMs(b);
    if (ca != null && cb != null && ca !== cb) return ca - cb;
    if (ca != null && cb == null) return -1;
    if (ca == null && cb != null) return 1;
    const ta = String(a.appointment_time ?? '');
    const tb = String(b.appointment_time ?? '');
    if (ta !== tb) return ta.localeCompare(tb);
    return String(a.appointment_id).localeCompare(String(b.appointment_id));
  });
}

function nearestAnchor<T extends PrePaymentDepositSource>(
  row: T,
  anchors: T[],
): T | null {
  const ms = createdMs(row);
  if (ms == null || anchors.length === 0) return anchors[0] ?? null;
  let best: T | null = null;
  let bestDist = Infinity;
  let bestCreated = Infinity;
  for (const anchor of anchors) {
    const created = createdMs(anchor);
    if (created == null) continue;
    const dist = Math.abs(created - ms);
    if (dist < bestDist - 0.5 || (Math.abs(dist - bestDist) <= 0.5 && created < bestCreated)) {
      best = anchor;
      bestDist = dist;
      bestCreated = created;
    }
  }
  return best ?? anchors[0] ?? null;
}

/** Aynı ziyarette birden fazla fiş varsa depozitolar karışmaz. */
function splitVisitByFiche<T extends PrePaymentDepositSource>(visit: T[]): T[][] {
  const keyed = visit.filter((row) => ficheKey(row));
  const distinct = [...new Set(keyed.map((row) => ficheKey(row)))];
  if (distinct.length <= 1) return [visit];

  const buckets = new Map<string, T[]>();
  for (const key of distinct) buckets.set(key, []);
  for (const row of visit) {
    const key = ficheKey(row);
    if (key && buckets.has(key)) {
      buckets.get(key)!.push(row);
      continue;
    }
    const anchor = nearestAnchor(row, keyed);
    const anchorKey = anchor ? ficheKey(anchor) : distinct[0];
    buckets.get(anchorKey)?.push(row);
  }
  return [...buckets.values()].filter((bucket) => bucket.length > 0);
}

function visitGroups<T extends PrePaymentDepositSource>(rows: T[]): T[][] {
  const used = new Set<string>();
  const visits: T[][] = [];
  const withTime = rows
    .filter((row) => row.appointment_id && createdMs(row) != null)
    .sort((a, b) => (createdMs(a)! - createdMs(b)!) || a.appointment_id.localeCompare(b.appointment_id));

  for (const row of withTime) {
    if (used.has(row.appointment_id)) continue;
    const anchor = createdMs(row)!;
    const ck = customerKey(row);
    const dk = dateKey(row);
    const group = withTime.filter((other) => {
      if (used.has(other.appointment_id)) return false;
      if (customerKey(other) !== ck || dateKey(other) !== dk) return false;
      return Math.abs((createdMs(other) ?? 0) - anchor) <= VISIT_WINDOW_MS;
    });
    for (const member of group) used.add(member.appointment_id);
    visits.push(group);
  }

  for (const row of rows) {
    if (!row.appointment_id || used.has(row.appointment_id)) continue;
    used.add(row.appointment_id);
    visits.push([row]);
  }

  const out: T[][] = [];
  for (const visit of visits) out.push(...splitVisitByFiche(visit));
  return out;
}

function openPaymentState(row: PrePaymentDepositSource, share: number): string {
  const status = String(row.status ?? '').trim().toLowerCase();
  if (status === 'completed' || status === 'closed' || status === 'cancelled' || status === 'no_show') {
    return String(row.payment_state || 'paid');
  }
  const current = String(row.payment_state || '');
  if (current === 'paid' || current === 'partial') return current;
  if (Math.abs(share) > 0.004) return 'deposit_only';
  if (current === 'deposit_only') return 'unpaid';
  return current || 'unpaid';
}

/**
 * Aynı fişteki hizmet satırlarına depozitoyu bir kez böler.
 * Satır sırası korunur. `total_price` hizmet bedeli olarak kalır.
 */
export function spreadPrePaymentDepositRows<T extends PrePaymentDepositSource>(rows: T[]): T[] {
  const shareById = new Map<string, { deposit: number; payment_state: string }>();

  for (const group of visitGroups(rows)) {
    const pool = singlePool(group.map((row) => Number(row.deposit_amount) || 0));
    if (pool == null || group.length <= 1) continue;
    const ordered = sortSiblings(group);
    const spread = spreadReservationAcrossLines(
      ordered.map((row) => ({
        unitPrice: Math.abs(Number(row.total_price) || 0),
        qty: 1,
      })),
      Math.abs(pool),
    );
    const sign = pool < 0 ? -1 : 1;
    ordered.forEach((row, idx) => {
      const deposit = round2(sign * (spread[idx]?.depositShare || 0));
      shareById.set(row.appointment_id, {
        deposit,
        payment_state: openPaymentState(row, deposit),
      });
    });
  }

  return rows.map((row) => {
    const hit = shareById.get(row.appointment_id);
    if (!hit) return row;
    if (
      Math.abs((Number(row.deposit_amount) || 0) - hit.deposit) <= 0.004
      && String(row.payment_state || '') === hit.payment_state
    ) {
      return row;
    }
    return {
      ...row,
      deposit_amount: hit.deposit,
      payment_state: hit.payment_state as T['payment_state'],
    };
  });
}

/** Toplam tutar = hizmet bedeli. Depozito ve müşteri avansı eklenmez. */
export function prePaymentServiceTotal(row: PrePaymentDepositSource): number {
  return round2(Number(row.total_price) || 0);
}

/**
 * Alınan ödeme. Açık randevuda satırın depozito payı.
 * Tamamlanan randevuda hizmet bedeli. İade eksi kalır.
 */
export function prePaymentReceived(row: PrePaymentDepositSource): number {
  const total = Number(row.total_price) || 0;
  const deposit = Number(row.deposit_amount) || 0;
  const status = String(row.status ?? '').trim().toLowerCase();
  if (status === 'completed' || status === 'closed') return round2(Math.max(0, total));
  if (deposit < -0.004) return round2(deposit);
  return round2(Math.max(0, deposit));
}

/**
 * Kalan = hizmet bedeli − satırın alınan payı.
 * Depozito ikinci kez düşülmez. İade eksi kalır.
 * Tamamlanan ve iptal satırda alacak kalmaz.
 */
export function prePaymentRemaining(row: PrePaymentDepositSource): number {
  const status = String(row.status ?? '').trim().toLowerCase();
  if (status === 'completed' || status === 'closed' || status === 'cancelled' || status === 'no_show') {
    return 0;
  }
  const total = Number(row.total_price) || 0;
  const deposit = Number(row.deposit_amount) || 0;
  const rem = round2(total - deposit);
  if (total < -0.004 || deposit < -0.004) return rem;
  return Math.max(0, rem);
}

export interface AppointmentDepositCardAmounts {
  /** Bu hizmetin fiyatı. Depozito ciroya eklenmez. */
  fee: number;
  /** Fişte tahsil edilen peşinat. Satır payı değildir. */
  prepaid: number;
  /**
   * Fiş kalanı: kardeş hizmet bedelleri − peşinat, bir kez.
   * Peşinat yok ve randevu kapanmadıysa null; ekran «henüz gerçekleşmedi» der.
   */
  remaining: number | null;
}

function appointmentClosed(row: PrePaymentDepositSource): boolean {
  const status = String(row.status ?? '').trim().toLowerCase();
  return status === 'completed' || status === 'closed' || status === 'cancelled' || status === 'no_show';
}

/**
 * Fişte tahsil edilen peşinat.
 * Aynı tutar kardeş satıra kopyalandıysa bir kez sayılır.
 * Paylar farklıysa toplanır. Müşteri avansı bu toplama girmez.
 */
function ficheCollectedDeposit(group: PrePaymentDepositSource[]): number {
  const present = group
    .map((row) => round2(Number(row.deposit_amount) || 0))
    .filter((amount) => Math.abs(amount) > 0.004);
  if (present.length === 0) return 0;
  const negative = present.some((amount) => amount < 0);
  const positive = present.some((amount) => amount > 0);
  if (negative && positive) return round2(present.reduce((sum, amount) => sum + amount, 0));
  const sign = negative ? -1 : 1;
  const magnitudes = present.map((amount) => Math.abs(amount));
  const keys = [...new Set(magnitudes.map((amount) => amount.toFixed(2)))];
  if (keys.length === 1) return round2(sign * Number(keys[0]));
  return round2(sign * magnitudes.reduce((sum, amount) => sum + amount, 0));
}

function ficheServiceGross(group: PrePaymentDepositSource[]): number {
  return round2(group.reduce((sum, row) => sum + (Number(row.total_price) || 0), 0));
}

/**
 * Randevu özet kartı. Büyük rakamlar fiş bakiyesidir.
 * Rapor payı (`spreadPrePaymentDepositRows`) bu tutarlara bağlanmaz.
 * Yalnızca gösterim döner; kayıtlı fiyat ve depozito değişmez.
 */
export function appointmentDepositCardAmounts<T extends PrePaymentDepositSource>(
  rows: T[],
  appointmentId: string,
): AppointmentDepositCardAmounts | null {
  const id = String(appointmentId ?? '').trim();
  if (!id) return null;
  const row = rows.find((item) => item.appointment_id === id);
  if (!row) return null;
  const group = visitGroups(rows).find((bucket) =>
    bucket.some((item) => item.appointment_id === id),
  ) ?? [row];
  const fee = prePaymentServiceTotal(row);
  const prepaid = ficheCollectedDeposit(group);
  if (appointmentClosed(row)) {
    return { fee, prepaid, remaining: 0 };
  }
  if (Math.abs(prepaid) <= 0.004) {
    return { fee, prepaid: 0, remaining: null };
  }
  const gross = ficheServiceGross(group);
  const remaining = round2(gross - prepaid);
  if (gross < -0.004 || prepaid < -0.004) {
    return { fee, prepaid, remaining };
  }
  return {
    fee,
    prepaid: round2(Math.max(0, prepaid)),
    remaining: Math.max(0, remaining),
  };
}
