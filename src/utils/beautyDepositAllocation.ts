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

const DEPOSIT_LINE_NAMES = new Set(['deposit', 'depozito', 'peşinat', 'pesinat', 'rezervasyon']);
const DEPOSIT_PREFIXES = ['deposit', 'depozito', 'deposıt', 'peşinat', 'pesinat'];

/**
 * DEPOSIT içindeki I, Türkçe küçük harfte ı olur. Hem tr hem Unicode
 * katlaması bakılır. "Depozito (Peşinat Avansı)" gibi uzun adlar da satırdır.
 */
function isDepositToken(value: string | null | undefined): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const forms = [raw.toLocaleLowerCase('tr'), raw.toLowerCase()];
  return forms.some(
    (form) => DEPOSIT_LINE_NAMES.has(form) || DEPOSIT_PREFIXES.some((prefix) => form.startsWith(prefix)),
  );
}

/** Ürün karşılaştırmasında depozito kendi satırı değildir. */
export function isDepositProductLine(item: {
  productName?: string | null;
  productCode?: string | null;
  productId?: string | null;
  lineType?: string | null;
  item_type?: string | null;
}): boolean {
  return (
    isDepositToken(item.lineType) ||
    isDepositToken(item.item_type) ||
    isDepositToken(item.productName) ||
    isDepositToken(item.productCode) ||
    isDepositToken(item.productId)
  );
}

export interface DepositFoldSource {
  /** Fişte tek depozito tutarı (satır yoksa hizmetlere bölünür). */
  ficheDeposit?: number | null;
  /**
   * Aynı fişe bağlı randevu depozitoları. Hepsi aynıysa tutar bir kez bölünür;
   * farklıysa toplam, hizmet bedeline oranla dağıtılır.
   */
  ficheDeposits?: Array<number | null> | null;
  /** Fiş başlığı. Hizmetler bu tutara zaten eşitse depozito ikinci kez eklenmez. */
  invoiceNet?: number | null;
}

type DepositFoldItem = {
  productName?: string | null;
  productCode?: string | null;
  productId?: string | null;
  lineType?: string | null;
  item_type?: string | null;
  quantity?: number | null;
  total?: number | null;
  /** Hizmetin kendi depozitosu. Satır yoksa bu tutar kullanılır. */
  depositAmount?: number | null;
};

function serviceMoneySum(items: DepositFoldItem[]): number {
  return round2(items.reduce((sum, item) => sum + (Number(item.total) || 0), 0));
}

function depositFitsDocument(serviceSum: number, pool: number, invoiceNet?: number | null): boolean {
  if (!(Math.abs(pool) > 0.004)) return false;
  if (invoiceNet == null || !Number.isFinite(Number(invoiceNet))) return true;
  const net = Number(invoiceNet);
  const tol = Math.max(1, Math.abs(net) * 0.002);
  if (Math.abs(serviceSum - net) <= tol) return false;
  if (Math.abs(serviceSum - pool - net) <= tol) return false;
  return true;
}

/** Aynı tutar her hizmete kopyalandıysa bir kez döner; işaret korunur. */
function sameCopiedAmount(values: number[]): number | null {
  const list = values.filter((n) => Math.abs(n) > 0.004);
  if (list.length === 0) return null;
  const keys = [...new Set(list.map((n) => Math.abs(n).toFixed(2)))];
  if (keys.length !== 1) return null;
  const mag = Number(keys[0]);
  const neg = list.some((n) => n < 0);
  const pos = list.some((n) => n > 0);
  if (neg && pos) return null;
  return (neg ? -1 : 1) * mag;
}

function fichePoolAmount(source?: DepositFoldSource | null): number {
  const list = (source?.ficheDeposits || []).map((n) => Number(n) || 0);
  const copied = sameCopiedAmount(list);
  if (copied != null) return copied;
  const present = list.filter((n) => Math.abs(n) > 0.004);
  if (present.length > 0) return round2(present.reduce((sum, n) => sum + n, 0));
  return Number(source?.ficheDeposit) || 0;
}

function addDepositShares<T extends DepositFoldItem>(services: T[], pool: number, sign: number): T[] {
  const spread = spreadReservationAcrossLines(
    services.map((item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const total = Math.abs(Number(item.total) || 0);
      return { unitPrice: total / qty, qty };
    }),
    Math.abs(pool),
  );
  return services.map((item, idx) => ({
    ...item,
    total: round2((Number(item.total) || 0) + sign * (spread[idx]?.depositShare || 0)),
  }));
}

/**
 * Depozito satırını gizler. Tutar, satırdan, hizmetin kendi depozitosundan
 * veya fiş depozitosundan gelir ve randevu düşümüyle hizmetlere yazılır.
 * Hizmet satırı yoksa depozito raporda görünmez.
 */
export function foldDepositRevenueIntoServices<T extends DepositFoldItem>(
  items: T[],
  source?: DepositFoldSource | null,
): T[] {
  const services: T[] = [];
  let lineDeposit = 0;
  for (const item of items) {
    if (isDepositProductLine(item)) {
      lineDeposit += Number(item.total) || 0;
      continue;
    }
    services.push(item);
  }
  if (services.length === 0) return services;

  const serviceSum = serviceMoneySum(services);
  const invoiceNet = source?.invoiceNet;

  if (Math.abs(lineDeposit) > 0.004) {
    if (!depositFitsDocument(serviceSum, lineDeposit, invoiceNet)) return services;
    const sign = lineDeposit < 0 ? -1 : 1;
    return addDepositShares(services, lineDeposit, sign);
  }

  const owns = services.map((item) => Number(item.depositAmount) || 0);
  if (owns.some((n) => Math.abs(n) > 0.004)) {
    const everyLine = owns.every((n) => Math.abs(n) > 0.004);
    const copied = everyLine ? sameCopiedAmount(owns) : null;
    if (copied != null) {
      if (!depositFitsDocument(serviceSum, copied, invoiceNet)) return services;
      return addDepositShares(services, copied, copied < 0 ? -1 : 1);
    }
    const pool = round2(owns.reduce((sum, n) => sum + n, 0));
    if (!depositFitsDocument(serviceSum, pool, invoiceNet)) return services;
    return services.map((item) => ({
      ...item,
      total: round2((Number(item.total) || 0) + (Number(item.depositAmount) || 0)),
    }));
  }

  const fichePool = fichePoolAmount(source);
  if (Math.abs(fichePool) > 0.004 && depositFitsDocument(serviceSum, fichePool, invoiceNet)) {
    return addDepositShares(services, fichePool, fichePool < 0 ? -1 : 1);
  }
  return services;
}

export interface FicheDepositRef {
  id: string;
  deposit: number;
  serviceName?: string | null;
  saleId?: string | null;
  remainderSaleId?: string | null;
  depositSaleId?: string | null;
  saleGroupId?: string | null;
}

export function appointmentDepositRef(appointment: {
  id?: string | null;
  deposit_amount?: number | null;
  service_name?: string | null;
  remainder_sale_id?: string | null;
  deposit_sale_id?: string | null;
  sale_group_id?: string | null;
}): FicheDepositRef | null {
  const id = String(appointment.id || '').trim();
  const deposit = Number(appointment.deposit_amount) || 0;
  if (!id || Math.abs(deposit) <= 0.004) return null;
  return {
    id,
    deposit,
    serviceName: appointment.service_name ?? null,
    remainderSaleId: appointment.remainder_sale_id ? String(appointment.remainder_sale_id) : null,
    depositSaleId: appointment.deposit_sale_id ? String(appointment.deposit_sale_id) : null,
    saleGroupId: appointment.sale_group_id ? String(appointment.sale_group_id) : null,
  };
}

export function parseFicheDepositList(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map((n) => Number(n) || 0).filter((n) => Math.abs(n) > 0.004);
  }
  return String(raw || '')
    .split(',')
    .map((part) => Number(part.trim()) || 0)
    .filter((n) => Math.abs(n) > 0.004);
}

/**
 * Fişin satış satırlarına, bağlı randevu depozitosunu yazar.
 * Satır adı hizmet adıyla eşleşirse depozito o hizmete aittir.
 */
export function foldSaleItemsWithDeposits<T extends DepositFoldItem>(
  items: T[],
  sale: {
    id?: string | null;
    total?: number | null;
    linkedAppointmentId?: string | null;
    saleGroupId?: string | null;
  },
  refs: FicheDepositRef[],
): T[] {
  const saleId = String(sale.id || '').trim();
  const group = String(sale.saleGroupId || '').trim();
  const linked = String(sale.linkedAppointmentId || '').trim();
  const matched = (refs || []).filter((ref) => {
    if (linked && ref.id === linked) return true;
    if (saleId && (ref.saleId === saleId || ref.remainderSaleId === saleId || ref.depositSaleId === saleId)) return true;
    if (group && ref.saleGroupId && ref.saleGroupId === group) return true;
    return false;
  });
  const used = new Set<string>();
  const withOwn = (items || []).map((item) => {
    if (isDepositProductLine(item)) return item;
    const name = String(item.productName || '').trim().toLocaleLowerCase('tr');
    if (!name) return item;
    const hit = matched.find((ref) => {
      if (used.has(ref.id)) return false;
      const serviceName = String(ref.serviceName || '').trim().toLocaleLowerCase('tr');
      return !!serviceName && serviceName === name;
    });
    if (!hit) return item;
    used.add(hit.id);
    return { ...item, depositAmount: hit.deposit };
  });
  const unmatched = matched.filter((ref) => !used.has(ref.id));
  return foldDepositRevenueIntoServices(withOwn, {
    invoiceNet: sale.total,
    ficheDeposits: unmatched.map((ref) => ref.deposit),
  });
}

export function foldDepositLinesByInvoice<T extends DepositFoldItem & {
  invoiceId?: string | null;
  invoiceNet?: number | null;
  ficheDeposits?: Array<number | null> | null;
}>(lines: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const key = String(line.invoiceId || '');
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  }
  const out: T[] = [];
  for (const group of groups.values()) {
    const netLine = group.find((line) => line.invoiceNet != null && Number.isFinite(Number(line.invoiceNet)));
    out.push(...foldDepositRevenueIntoServices(group, {
      invoiceNet: netLine ? Number(netLine.invoiceNet) : null,
      ficheDeposits: group[0]?.ficheDeposits,
    }));
  }
  return out;
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
