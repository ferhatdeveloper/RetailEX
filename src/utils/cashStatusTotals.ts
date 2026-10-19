/**
 * Kasa Durumu — rezervasyon nakdi kasaya dahildir.
 *
 * Rezervasyon peşinatı çekmecedeki gerçek nakittir. Günlük nakit ve
 * kapanış bu tutarı bir kez içerir. Ödeme dağılımındaki ayrı rezervasyon
 * satırı bilgi amaçlıdır; genel toplama ikinci kez eklenmez.
 * Ciroya eklenmez (hizmet 50.000 ise +15.000 ciro yazılmaz).
 *
 * Örnek: hizmet nakdi 35.000 + rezervasyon nakdi 15.000
 *   günlük nakit 50.000, kapanış 50.000, genel toplam 50.000 (65.000 değil).
 */

import { computeKasaIslemiSign, type KasaIslemi } from '../services/api/kasa';
import { computeCashBalanceForRegister } from './cashBalance';
import { dbPaymentMethodToFormCode, type PaymentFormCode } from './paymentMethodUtils';

const CASH_CODE = 'NAKIT';
const RESERVATION_CODE = 'REZERVASYON_AVANS';
const SKIP_DISTRIBUTION = new Set<PaymentFormCode>(['CEK', 'SENET']);

const CASH_OUT_TYPES = new Set([
  'CH_ODEME',
  'KASA_CIKIS',
  'BANKA_YATIRILAN',
  'ACILIS_BORC',
  'GIDER_PUSULASI',
  'VERILEN_SERBEST_MESLEK',
  'ALIS_FATURASI',
  'MAAS_ODEME',
  'AVANS_ODEME',
  'ORTAK_SERMAYE_ODEME',
  'ORTAK_PARA_CIKIS',
  'KUR_FARKI_BORC',
  'MUSTAHSIL_MAKBUZU',
]);

export const CASH_REGISTER_UNASSIGNED_ID = '__unassigned__';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export interface CashStatusPaymentLine {
  code: string;
  amount: number;
  count?: number;
  percentage?: number;
  /** Bilgi satırı — genel toplama katılmaz (rezervasyon zaten nakittedir). */
  informational?: boolean;
  label?: string;
  color?: string;
  nameKey?: string;
}

export interface CashStatusFoldInput {
  openingCash: number;
  /** Hizmet / satış nakdi. Rezervasyon bu tutarın içinde değildir. */
  serviceCash: number;
  cardAmount?: number;
  transferAmount?: number;
  /** Henüz hizmet verilmemiş rezervasyon peşinatı (nakit). */
  reservationCash: number;
  /** Nakit çıkışlar (gider, kasa çıkış). */
  cashOut: number;
  /**
   * Dağılım satırları. NAKIT satırı hizmet nakdidir (rezervasyon hariç).
   * REZERVASYON_AVANS satırı bilgi olarak kalır.
   */
  paymentTypes: CashStatusPaymentLine[];
}

export interface CashStatusFoldResult {
  todayCash: number;
  closingCash: number;
  reservationDeposit: number;
  paymentTypes: CashStatusPaymentLine[];
  /** NAKIT (rezervasyon dahil) + kart + açık cari + havale. Rezervasyon satırı yok. */
  grandTotal: number;
}

/**
 * Rezervasyon nakdini günlük nakde ve kapanışa ekler.
 * Dağılımdaki nakit satırı aynı tutarı alır. Rezervasyon satırı
 * informational kalır ve grandTotal dışında tutulur.
 */
export function foldReservationIntoCashStatus(input: CashStatusFoldInput): CashStatusFoldResult {
  const opening = num(input.openingCash);
  const serviceCash = num(input.serviceCash);
  const reservation = Math.max(0, num(input.reservationCash));
  const cashOut = Math.max(0, num(input.cashOut));
  const todayCash = round2(serviceCash + reservation);
  const closingCash = round2(opening + todayCash - cashOut);

  let sawCash = false;
  const paymentTypes: CashStatusPaymentLine[] = input.paymentTypes.map((row) => {
    if (row.code === CASH_CODE) {
      sawCash = true;
      return {
        ...row,
        amount: round2(num(row.amount) + reservation),
        informational: false,
      };
    }
    if (row.code === RESERVATION_CODE) {
      return {
        ...row,
        amount: round2(num(row.amount)),
        informational: true,
      };
    }
    if (SKIP_DISTRIBUTION.has(row.code as PaymentFormCode)) {
      return { ...row, informational: true };
    }
    return { ...row, informational: row.informational === true };
  });

  if (!sawCash && reservation > 0.004) {
    paymentTypes.unshift({
      code: CASH_CODE,
      amount: reservation,
      informational: false,
    });
  }

  const grandTotal = round2(
    paymentTypes.reduce((sum, row) => {
      if (row.informational) return sum;
      if (SKIP_DISTRIBUTION.has(row.code as PaymentFormCode)) return sum;
      return sum + num(row.amount);
    }, 0),
  );

  const withPct = paymentTypes.map((row) => ({
    ...row,
    percentage:
      row.informational || grandTotal === 0 ? 0 : (num(row.amount) / grandTotal) * 100,
  }));

  return {
    todayCash,
    closingCash,
    reservationDeposit: reservation,
    paymentTypes: withPct,
    grandTotal,
  };
}

export interface CompanyCashSnapshot {
  openingCash: number;
  serviceCash: number;
  card: number;
  transfer: number;
  openAccount: number;
  reservationCash: number;
  cashOut: number;
}

export interface CashRegisterSeed {
  id: string;
  code?: string;
  name?: string;
  serviceCash?: number;
  card?: number;
  transfer?: number;
  openAccount?: number;
  reservationCash?: number;
  cashOut?: number;
  openingCash?: number;
}

export interface CashRegisterStatusRow {
  id: string;
  code: string;
  name: string;
  openingCash: number;
  todayCash: number;
  reservationDeposit: number;
  todayCard: number;
  closingCash: number;
  payCash: number;
  payCard: number;
  payOpen: number;
  payTransfer: number;
  grandTotal: number;
}

interface Bucket {
  serviceCash: number;
  card: number;
  transfer: number;
  openAccount: number;
  reservationCash: number;
  cashOut: number;
  openingCash: number;
}

function emptyBucket(): Bucket {
  return {
    serviceCash: 0,
    card: 0,
    transfer: 0,
    openAccount: 0,
    reservationCash: 0,
    cashOut: 0,
    openingCash: 0,
  };
}

function addBucket(target: Bucket, extra: Partial<Bucket>): void {
  target.serviceCash = round2(target.serviceCash + num(extra.serviceCash));
  target.card = round2(target.card + num(extra.card));
  target.transfer = round2(target.transfer + num(extra.transfer));
  target.openAccount = round2(target.openAccount + num(extra.openAccount));
  target.reservationCash = round2(target.reservationCash + num(extra.reservationCash));
  target.cashOut = round2(target.cashOut + num(extra.cashOut));
  target.openingCash = round2(target.openingCash + num(extra.openingCash));
}

const BUCKET_KEYS = [
  'serviceCash',
  'card',
  'transfer',
  'openAccount',
  'reservationCash',
  'cashOut',
  'openingCash',
] as const;

function bucketToRow(
  id: string,
  code: string,
  name: string,
  bucket: Bucket,
): CashRegisterStatusRow {
  const payCash = round2(bucket.serviceCash + Math.max(0, bucket.reservationCash));
  const payCard = round2(bucket.card);
  const payOpen = round2(bucket.openAccount);
  const payTransfer = round2(bucket.transfer);
  const openingCash = round2(bucket.openingCash);
  const cashOut = Math.max(0, round2(bucket.cashOut));
  return {
    id,
    code,
    name,
    openingCash,
    todayCash: payCash,
    reservationDeposit: round2(Math.max(0, bucket.reservationCash)),
    todayCard: payCard,
    closingCash: round2(openingCash + payCash - cashOut),
    payCash,
    payCard,
    payOpen,
    payTransfer,
    grandTotal: round2(payCash + payCard + payOpen + payTransfer),
  };
}

function hasMovement(bucket: Bucket): boolean {
  return BUCKET_KEYS.some((key) => Math.abs(bucket[key]) > 0.004);
}

/**
 * Şirket özetini kasa tohumlarına yayar (eski dağıtım).
 * Kasalar sekmesi bunu kullanmaz. Sekme `cashRegisterStatusFromLedger`
 * ile her kasanın kendi kasa kartı hareketini okur.
 * Çek ve senet dağılıma girmez.
 */
export function listCashRegisterStatus(args: {
  registers: Array<{ id: string; code?: string | null; name?: string | null }>;
  seeds?: CashRegisterSeed[];
  company: CompanyCashSnapshot;
  unassignedLabel: string;
}): CashRegisterStatusRow[] {
  const byId = new Map<string, { code: string; name: string; bucket: Bucket }>();
  const ensure = (id: string, code: string, name: string) => {
    const key = id || CASH_REGISTER_UNASSIGNED_ID;
    if (!byId.has(key)) {
      byId.set(key, {
        code,
        name: name || code || key,
        bucket: emptyBucket(),
      });
    }
    return byId.get(key)!;
  };

  for (const register of args.registers) {
    const id = String(register.id || '').trim();
    if (!id) continue;
    ensure(id, String(register.code || '').trim(), String(register.name || register.code || id));
  }

  for (const seed of args.seeds || []) {
    const id = String(seed.id || '').trim() || CASH_REGISTER_UNASSIGNED_ID;
    const row = ensure(id, String(seed.code || '').trim(), String(seed.name || seed.code || id));
    addBucket(row.bucket, seed);
  }

  const company: Bucket = {
    serviceCash: num(args.company.serviceCash),
    card: num(args.company.card),
    transfer: num(args.company.transfer),
    openAccount: num(args.company.openAccount),
    reservationCash: Math.max(0, num(args.company.reservationCash)),
    cashOut: Math.max(0, num(args.company.cashOut)),
    openingCash: num(args.company.openingCash),
  };

  const sum = emptyBucket();
  for (const row of byId.values()) addBucket(sum, row.bucket);

  for (const key of BUCKET_KEYS) {
    const companyValue = company[key];
    const seedValue = sum[key];
    if (seedValue > companyValue + 0.004 && seedValue > 0.004) {
      const factor = companyValue > 0.004 ? companyValue / seedValue : 0;
      for (const row of byId.values()) {
        row.bucket[key] = round2(row.bucket[key] * factor);
      }
    }
  }

  const sumAfter = emptyBucket();
  for (const row of byId.values()) addBucket(sumAfter, row.bucket);
  const remainder = emptyBucket();
  for (const key of BUCKET_KEYS) {
    remainder[key] = round2(company[key] - sumAfter[key]);
    if (remainder[key] < 0) remainder[key] = 0;
  }

  const registerIds = args.registers
    .map((register) => String(register.id || '').trim())
    .filter(Boolean);
  const soleId = registerIds.length === 1 ? registerIds[0] : '';
  if (hasMovement(remainder)) {
    const targetId = soleId || CASH_REGISTER_UNASSIGNED_ID;
    const target = ensure(
      targetId,
      '',
      targetId === CASH_REGISTER_UNASSIGNED_ID ? args.unassignedLabel : (byId.get(targetId)?.name || targetId),
    );
    addBucket(target.bucket, remainder);
  }

  const rows = Array.from(byId.entries())
    .map(([id, row]) => bucketToRow(id, row.code, row.name, row.bucket))
    .filter((row) => {
      if (row.id === CASH_REGISTER_UNASSIGNED_ID) {
        return Math.abs(row.todayCash) + Math.abs(row.todayCard) + Math.abs(row.payOpen)
          + Math.abs(row.payTransfer) + Math.abs(row.reservationDeposit) + Math.abs(row.openingCash) > 0.004;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  if (rows.length === 0 && hasMovement(company)) {
    return [bucketToRow(CASH_REGISTER_UNASSIGNED_ID, '', args.unassignedLabel, company)];
  }
  return rows;
}

export interface CashStatusSaleSlice {
  total: number;
  paymentMethod?: unknown;
  payments?: Array<{ method?: unknown; amount?: number; cash_register_id?: string | null }> | null;
  cashRegisterId?: string | null;
  isDeposit?: boolean;
  notes?: string | null;
}

export interface CashStatusRegisterLine {
  id?: string | null;
  kasa_id?: string | null;
  islem_tipi?: string | null;
  tutar?: number | null;
  ozel_kod?: string | null;
  special_code?: string | null;
  is_reservation_deposit?: boolean | null;
  /** cash_lines.payment_method — nakit / kart ayrımı */
  payment_method?: string | null;
  islem_tarihi?: string | null;
}

function formCodeOf(raw: unknown): PaymentFormCode | '' {
  return dbPaymentMethodToFormCode(raw);
}

function addFormAmount(bucket: Bucket, code: PaymentFormCode | '', amount: number): void {
  if (!(Math.abs(amount) > 0.004)) return;
  if (!code || SKIP_DISTRIBUTION.has(code)) return;
  if (code === 'NAKIT') bucket.serviceCash = round2(bucket.serviceCash + amount);
  else if (code === 'KREDIKARTI') bucket.card = round2(bucket.card + amount);
  else if (code === 'HAVAL') bucket.transfer = round2(bucket.transfer + amount);
  else if (code === 'ACIK_CARI') bucket.openAccount = round2(bucket.openAccount + amount);
}

/** Satış tahsilatını kasalara böler. Çek/senet yazılmaz. Depozito fişi atlanır. */
export function seedsFromCashStatusSales(sales: CashStatusSaleSlice[]): CashRegisterSeed[] {
  const map = new Map<string, Bucket>();
  const touch = (id: string) => {
    const key = id.trim();
    if (!map.has(key)) map.set(key, emptyBucket());
    return map.get(key)!;
  };

  for (const sale of sales) {
    if (sale.isDeposit === true) continue;
    if (/parent_sale:|sale_group:|deposit:1/.test(String(sale.notes ?? ''))) continue;
    const signed = num(sale.total);
    if (signed === 0) continue;
    const sign = signed < 0 ? -1 : 1;
    const absDoc = Math.abs(signed);
    const fallback = String(sale.cashRegisterId || '').trim();
    const rows = Array.isArray(sale.payments) ? sale.payments.filter((row) => row != null) : [];
    if (rows.length > 0) {
      let allocated = 0;
      for (const row of rows) {
        const amt = Math.abs(num(row.amount));
        if (!(amt > 0)) continue;
        const code = formCodeOf(row.method) || 'ACIK_CARI';
        const reg = String(row.cash_register_id || fallback).trim();
        addFormAmount(touch(reg), code, amt * sign);
        allocated += amt;
      }
      const gap = absDoc - allocated;
      if (gap > 0.004) addFormAmount(touch(fallback), 'ACIK_CARI', gap * sign);
      continue;
    }
    const code = formCodeOf(sale.paymentMethod) || 'ACIK_CARI';
    addFormAmount(touch(fallback), code, signed);
  }

  const seeds: CashRegisterSeed[] = [];
  for (const [id, bucket] of map) {
    if (!id) continue;
    if (!hasMovement(bucket)) continue;
    seeds.push({ id, ...bucket });
  }
  return seeds;
}

export function isReservationCashLine(
  line: CashStatusRegisterLine,
  appliedCashLineIds?: ReadonlySet<string> | null,
): boolean {
  const tip = String(line.islem_tipi || '').trim().toUpperCase();
  if (tip !== 'CH_TAHSILAT') return false;
  const lineId = String(line.id || '').trim();
  if (appliedCashLineIds && lineId && appliedCashLineIds.has(lineId)) return false;
  if (line.is_reservation_deposit === true) return true;
  const code = String(line.ozel_kod || line.special_code || '').trim().toUpperCase();
  return code === 'REZERVASYON' || code === 'AVANS';
}

export function seedsFromRegisterCashLines(
  lines: CashStatusRegisterLine[],
  appliedCashLineIds?: ReadonlySet<string> | null,
): CashRegisterSeed[] {
  const map = new Map<string, Bucket>();
  const touch = (id: string) => {
    const key = id.trim();
    if (!map.has(key)) map.set(key, emptyBucket());
    return map.get(key)!;
  };

  for (const line of lines) {
    const amount = Math.abs(num(line.tutar));
    if (!(amount > 0.004)) continue;
    const reg = String(line.kasa_id || '').trim();
    if (!reg) continue;
    const tip = String(line.islem_tipi || '').trim().toUpperCase();
    if (isReservationCashLine(line, appliedCashLineIds)) {
      touch(reg).reservationCash = round2(touch(reg).reservationCash + amount);
      continue;
    }
    if (CASH_OUT_TYPES.has(tip)) {
      touch(reg).cashOut = round2(touch(reg).cashOut + amount);
    }
  }

  return Array.from(map.entries())
    .filter(([, bucket]) => hasMovement(bucket))
    .map(([id, bucket]) => ({ id, ...bucket }));
}

export function mergeRegisterSeeds(groups: CashRegisterSeed[][]): CashRegisterSeed[] {
  const map = new Map<string, CashRegisterSeed>();
  for (const group of groups) {
    for (const seed of group) {
      const id = String(seed.id || '').trim();
      if (!id) continue;
      const current = map.get(id) || { id };
      map.set(id, {
        id,
        code: current.code || seed.code,
        name: current.name || seed.name,
        serviceCash: round2(num(current.serviceCash) + num(seed.serviceCash)),
        card: round2(num(current.card) + num(seed.card)),
        transfer: round2(num(current.transfer) + num(seed.transfer)),
        openAccount: round2(num(current.openAccount) + num(seed.openAccount)),
        reservationCash: round2(num(current.reservationCash) + num(seed.reservationCash)),
        cashOut: round2(num(current.cashOut) + num(seed.cashOut)),
        openingCash: round2(num(current.openingCash) + num(seed.openingCash)),
      });
    }
  }
  return Array.from(map.values());
}

type DrawerKind = 'cash' | 'card' | 'transfer' | 'open' | 'skip';

/** Kasa kartı satırının nakit / kart ayrımı. Boş yöntem nakittir; kart ayrıca yazılır. */
function drawerKind(line: CashStatusRegisterLine): DrawerKind {
  const raw = String(line.payment_method ?? '').trim().toLowerCase();
  if (raw === 'gateway' || raw.includes('sanal')) return 'card';
  const code = formCodeOf(line.payment_method);
  if (code === 'CEK' || code === 'SENET') return 'skip';
  if (code === 'KREDIKARTI') return 'card';
  if (code === 'HAVAL') return 'transfer';
  if (code === 'ACIK_CARI') return 'open';
  if (code === 'NAKIT') return 'cash';
  if (!raw || raw === 'cash' || raw === 'nakit') return 'cash';
  if (raw === 'credit' || raw === 'veresiye' || raw === 'open' || raw === 'open_account') return 'open';
  return 'cash';
}

function signedLedgerAmount(line: CashStatusRegisterLine): number {
  const amount = Math.abs(num(line.tutar));
  if (!(amount > 0)) return 0;
  const sign = computeKasaIslemiSign(String(line.islem_tipi || ''));
  if (!sign) return 0;
  return amount * sign;
}

function formatLocalDay(value: Date): string {
  if (Number.isNaN(value.getTime())) return '';
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/**
 * Kasa satırının takvim günü.
 * `YYYY-MM-DD` olduğu gibi kalır. Date nesnesi ve saatli dizge yerel güne çevrilir
 * (Kasa Yönetimi bugün hesabı ile aynı yerel takvim).
 */
function ledgerDay(value: unknown): string {
  if (value instanceof Date) return formatLocalDay(value);
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return '';
  if (raw.length === 10) return match[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return match[1];
  return formatLocalDay(parsed);
}

function balanceOf(registerId: string, lines: CashStatusRegisterLine[]): number {
  if (registerId === CASH_REGISTER_UNASSIGNED_ID) {
    return round2(lines.reduce((sum, line) => sum + signedLedgerAmount(line), 0));
  }
  return round2(computeCashBalanceForRegister(registerId, lines as unknown as KasaIslemi[]));
}

/**
 * Kasalar sekmesi — her kasanın kendi kasa kartı hareketi.
 *
 * Günlük nakit / kart, Kasa Yönetimi tahsilatı ile aynı işaret kuralından
 * (`computeKasaIslemiSign`) ve ödeme yönteminden ayrılır. Aynı satır hem
 * nakde hem karta yazılmaz. Kapanış, aynı formülle kasa bakiyesidir
 * (KALAN). Çıkış bakiyeden düşer. Rezervasyon bilgi tutarı genel toplama
 * ikinci kez eklenmez. Çek ve senet dağılım satırı değildir.
 * Kasaya bağlanmayan satır ayrı kalır; şirket satış özeti kasaya yapıştırılmaz.
 */
export function cashRegisterStatusFromLedger(args: {
  registers: Array<{ id: string; code?: string | null; name?: string | null }>;
  lines: CashStatusRegisterLine[];
  dateFrom: string;
  dateTo: string;
  unassignedLabel: string;
}): CashRegisterStatusRow[] {
  const dateFrom = String(args.dateFrom || '').slice(0, 10);
  const dateTo = String(args.dateTo || '').slice(0, 10);
  const known = new Set<string>();
  const byId = new Map<string, { code: string; name: string; lines: CashStatusRegisterLine[] }>();

  const ensure = (id: string, code: string, name: string) => {
    const key = id || CASH_REGISTER_UNASSIGNED_ID;
    if (!byId.has(key)) {
      byId.set(key, { code, name: name || code || key, lines: [] });
    }
    return byId.get(key)!;
  };

  for (const register of args.registers) {
    const id = String(register.id || '').trim();
    if (!id) continue;
    known.add(id);
    ensure(id, String(register.code || '').trim(), String(register.name || register.code || id));
  }

  for (const line of args.lines || []) {
    const id = String(line.kasa_id || '').trim() || CASH_REGISTER_UNASSIGNED_ID;
    const row = ensure(
      id,
      '',
      id === CASH_REGISTER_UNASSIGNED_ID ? args.unassignedLabel : id,
    );
    row.lines.push(line);
  }

  const rows: CashRegisterStatusRow[] = [];
  for (const [id, bucket] of byId) {
    const before: CashStatusRegisterLine[] = [];
    const through: CashStatusRegisterLine[] = [];
    let cashIn = 0;
    let cardIn = 0;
    let transferIn = 0;
    let openIn = 0;
    let reservationCash = 0;

    for (const line of bucket.lines) {
      const day = ledgerDay(line.islem_tarihi);
      if (day && dateTo && day > dateTo) continue;
      through.push(line);
      if (day && dateFrom && day < dateFrom) {
        before.push(line);
        continue;
      }
      const signed = signedLedgerAmount(line);
      if (!(signed > 0.004)) continue;
      const kind = drawerKind(line);
      if (kind === 'skip') continue;
      if (kind === 'card') {
        cardIn = round2(cardIn + signed);
        continue;
      }
      if (kind === 'transfer') {
        transferIn = round2(transferIn + signed);
        continue;
      }
      if (kind === 'open') {
        openIn = round2(openIn + signed);
        continue;
      }
      cashIn = round2(cashIn + signed);
      if (isReservationCashLine(line)) reservationCash = round2(reservationCash + signed);
    }

    const openingCash = balanceOf(id, before);
    const closingCash = balanceOf(id, through);
    const moved = Math.abs(openingCash) + Math.abs(closingCash) + cashIn + cardIn
      + transferIn + openIn + reservationCash > 0.004;
    if (id === CASH_REGISTER_UNASSIGNED_ID && !moved) continue;
    if (!known.has(id) && id !== CASH_REGISTER_UNASSIGNED_ID && !moved) continue;

    rows.push({
      id,
      code: bucket.code,
      name: bucket.name,
      openingCash,
      todayCash: cashIn,
      reservationDeposit: reservationCash,
      todayCard: cardIn,
      closingCash,
      payCash: cashIn,
      payCard: cardIn,
      payOpen: openIn,
      payTransfer: transferIn,
      grandTotal: round2(cashIn + cardIn + openIn + transferIn),
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return rows;
}

/** Kasa Yönetimi kartı: `KASA.001 — MERKEZ KASA`. */
export function formatCashRegisterDistributionLabel(code: string, name: string): string {
  const registerCode = String(code || '').trim();
  const registerName = String(name || '').trim();
  if (registerCode && registerName && registerCode !== registerName) {
    return `${registerCode} — ${registerName}`;
  }
  return registerName || registerCode;
}

export interface CashRegisterDistributionLine {
  id: string;
  code: string;
  name: string;
  /** `KASA.001 — MERKEZ KASA` */
  label: string;
  /**
   * Kasanın içindeki tutar: dönem sonu bakiyesi
   * (`computeCashBalanceForRegister`, dateTo'ya kadar).
   * Nakit ve kart aynı hareketi iki kez saymaz. Rezervasyon bu bakiyenin
   * içindedir; satır tutarına ikinci kez eklenmez.
   */
  amount: number;
}

/**
 * Ödeme dağılımı bloğundaki kasa listesi.
 * Her kasa kartı ayrı satırdır. Kasaya bağlanmayan tutar, defter satırı varsa
 * ayrı satırda kalır. Boş defter boş dizi döner.
 */
export function cashRegisterDistributionLines(
  rows: CashRegisterStatusRow[],
): CashRegisterDistributionLine[] {
  return (rows || []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    label: formatCashRegisterDistributionLabel(row.code, row.name),
    amount: round2(row.closingCash),
  }));
}

export function sumCashRegisterDistribution(lines: CashRegisterDistributionLine[]): number {
  return round2((lines || []).reduce((sum, line) => sum + num(line.amount), 0));
}

export interface CashRegisterDrawerLine {
  id: string;
  code: string;
  name: string;
  label: string;
  /** Dönem içi nakit tahsilatı. Rezervasyon nakdi bunun içindedir. */
  cash: number;
  /** Dönem içi kart. Nakit satırına yazılmaz. */
  card: number;
  openAccount: number;
  transfer: number;
  /** Bilgi — nakde dahildir, genel toplama eklenmez. */
  reservation: number;
  /** Kapanış / kalan. Dağılım listesindeki tutarla aynı bakiyedir. */
  balance: number;
}

/**
 * Kasalar sekmesi — kasanın içindeki ödeme kırılımı.
 * Satış fişi özeti değil; `cashRegisterStatusFromLedger` çıktısı.
 * Çek ve senet kolon değildir.
 */
export function cashRegisterDrawerLines(rows: CashRegisterStatusRow[]): CashRegisterDrawerLine[] {
  return (rows || []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    label: formatCashRegisterDistributionLabel(row.code, row.name),
    cash: round2(row.payCash),
    card: round2(row.payCard),
    openAccount: round2(row.payOpen),
    transfer: round2(row.payTransfer),
    reservation: round2(row.reservationDeposit),
    balance: round2(row.closingCash),
  }));
}

/**
 * Yeşil genel toplam ödeme dağılımıdır. Kasa listesi aynı paranın kasa
 * bakiyesidir; genel toplama ikinci kez eklenmez. Rezervasyon bilgi
 * tutarı `paymentGrand` dışında tutulmuş olmalıdır.
 */
export function cashStatusBlockTotals(
  paymentGrand: number,
  registerRows: CashRegisterStatusRow[],
): { grandTotal: number; registerTotal: number } {
  return {
    grandTotal: round2(num(paymentGrand)),
    registerTotal: sumCashRegisterDistribution(cashRegisterDistributionLines(registerRows)),
  };
}
