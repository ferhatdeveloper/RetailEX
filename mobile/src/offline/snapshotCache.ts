import AsyncStorage from '@react-native-async-storage/async-storage';
import { firmNr } from '../api/erpTables';
import type { CountingSlipStatus } from './mutationQueue';

const PRODUCTS_KEY = 'retailex_offline_products';
const CUSTOMERS_KEY = 'retailex_offline_customers';
const COUNTING_SLIPS_KEY = 'retailex_offline_counting_slips';
const PENDING_INVOICES_KEY = 'retailex_offline_pending_invoices';
const COUNTING_FICHE_SEQ_KEY = 'retailex_offline_counting_fiche_seq';

/** Cache satırı — API row’larının alt kümesi (döngüsel import yok) */
export type CachedProduct = {
  id: string;
  code: string | null;
  barcode: string | null;
  name: string;
  unit: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number | null;
  brand: string | null;
  category_code: string | null;
  is_active: boolean;
  vat_rate?: number;
};

export type CachedCustomer = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  balance: number;
  is_active: boolean;
};

export type CachedCountingLine = {
  id: string;
  slip_id: string;
  product_id?: string | null;
  barcode?: string | null;
  product_name?: string | null;
  expected_qty: number;
  counted_qty?: number | null;
  variance?: number | null;
  unit?: string | null;
  counted_at?: string | null;
};

export type CachedCountingSlip = {
  id: string;
  firm_nr: string;
  store_id: string;
  fiche_no: string;
  date: string;
  count_type: 'full' | 'cycle' | 'location';
  location_code?: string | null;
  status: CountingSlipStatus;
  description?: string | null;
  created_by?: string | null;
  created_at: string;
  store_name?: string | null;
  line_count?: number;
  lines: CachedCountingLine[];
  /** Yerel oluşturuldu — henüz PG senkronu yok */
  pending?: boolean;
};

export type CachedPendingInvoice = {
  id: string;
  fiche_no: string;
  date: string;
  customer_name: string | null;
  net_amount: number;
  total_gross: number;
  status: string | null;
  fiche_type: string | null;
  trcode: number | null;
  payment_method: string | null;
  is_cancelled: boolean;
  notes: string | null;
  total_vat: number;
  total_discount: number;
  currency: string | null;
  lines: {
    id: string;
    item_code: string | null;
    item_name: string | null;
    quantity: number;
    unit_price: number;
    net_amount: number;
    unit: string | null;
  }[];
  pending: true;
};

export type ListSnapshot<T> = {
  firmNr: string;
  savedAt: string;
  rows: T[];
};

async function readSnapshot<T>(key: string): Promise<ListSnapshot<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListSnapshot<T>;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshot<T>(key: string, rows: T[]): Promise<void> {
  const snap: ListSnapshot<T> = {
    firmNr: firmNr(),
    savedAt: new Date().toISOString(),
    rows,
  };
  await AsyncStorage.setItem(key, JSON.stringify(snap));
}

function matchesSearch(haystacks: (string | null | undefined)[], q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  return haystacks.some((h) => (h || '').toLocaleLowerCase('tr-TR').includes(needle));
}

export async function saveProductsSnapshot(rows: CachedProduct[]): Promise<void> {
  await writeSnapshot(PRODUCTS_KEY, rows);
}

export async function saveCustomersSnapshot(rows: CachedCustomer[]): Promise<void> {
  await writeSnapshot(CUSTOMERS_KEY, rows);
}

export async function loadProductsSnapshot(): Promise<ListSnapshot<CachedProduct> | null> {
  const snap = await readSnapshot<CachedProduct>(PRODUCTS_KEY);
  if (!snap) return null;
  const fn = firmNr();
  if (snap.firmNr && fn && snap.firmNr !== fn) return null;
  return snap;
}

export async function loadCustomersSnapshot(): Promise<ListSnapshot<CachedCustomer> | null> {
  const snap = await readSnapshot<CachedCustomer>(CUSTOMERS_KEY);
  if (!snap) return null;
  const fn = firmNr();
  if (snap.firmNr && fn && snap.firmNr !== fn) return null;
  return snap;
}

export async function getCachedProducts(search = '', limit = 200): Promise<CachedProduct[]> {
  const snap = await loadProductsSnapshot();
  if (!snap) return [];
  const q = search.trim();
  const filtered = snap.rows.filter((r) =>
    matchesSearch([r.name, r.code, r.barcode, r.brand], q),
  );
  return filtered.slice(0, limit);
}

export async function getCachedCustomers(search = '', limit = 200): Promise<CachedCustomer[]> {
  const snap = await loadCustomersSnapshot();
  if (!snap) return [];
  const q = search.trim();
  const filtered = snap.rows.filter((r) =>
    matchesSearch([r.name, r.code, r.phone, r.email], q),
  );
  return filtered.slice(0, limit);
}

/** Offline POS satışında cache stok düşümü */
export async function adjustProductStockInCache(
  productId: string,
  delta: number,
): Promise<void> {
  const snap = await loadProductsSnapshot();
  if (!snap) return;
  const idx = snap.rows.findIndex((r) => String(r.id) === String(productId));
  if (idx < 0) return;
  const row = snap.rows[idx]!;
  snap.rows[idx] = {
    ...row,
    stock: Math.max(0, (Number(row.stock) || 0) + delta),
  };
  await writeSnapshot(PRODUCTS_KEY, snap.rows);
}

/** Sayım stok uygulamasında cache stok = sayılan miktar */
export async function setProductStockInCache(
  productId: string,
  stock: number,
): Promise<void> {
  const snap = await loadProductsSnapshot();
  if (!snap) return;
  const idx = snap.rows.findIndex((r) => String(r.id) === String(productId));
  if (idx < 0) return;
  const row = snap.rows[idx]!;
  snap.rows[idx] = {
    ...row,
    stock: Math.max(0, Number(stock) || 0),
  };
  await writeSnapshot(PRODUCTS_KEY, snap.rows);
}

export async function upsertCustomerInCache(row: CachedCustomer): Promise<void> {
  const snap = (await loadCustomersSnapshot()) ?? {
    firmNr: firmNr(),
    savedAt: new Date().toISOString(),
    rows: [] as CachedCustomer[],
  };
  const idx = snap.rows.findIndex((r) => String(r.id) === String(row.id));
  if (idx >= 0) snap.rows[idx] = { ...snap.rows[idx], ...row };
  else snap.rows.unshift(row);
  await writeSnapshot(CUSTOMERS_KEY, snap.rows);
}

async function loadCountingSlipsSnapshot(): Promise<ListSnapshot<CachedCountingSlip> | null> {
  const snap = await readSnapshot<CachedCountingSlip>(COUNTING_SLIPS_KEY);
  if (!snap) return null;
  const fn = firmNr();
  if (snap.firmNr && fn && snap.firmNr !== fn) return null;
  return snap;
}

async function saveCountingSlipsRows(rows: CachedCountingSlip[]): Promise<void> {
  await writeSnapshot(COUNTING_SLIPS_KEY, rows);
}

export async function getCachedCountingSlips(): Promise<CachedCountingSlip[]> {
  const snap = await loadCountingSlipsSnapshot();
  if (!snap) return [];
  return snap.rows
    .filter((s) => s.status !== 'cancelled')
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function getCachedSlipWithLines(
  slipId: string,
): Promise<{ slip: CachedCountingSlip | null; lines: CachedCountingLine[] }> {
  const snap = await loadCountingSlipsSnapshot();
  const slip = snap?.rows.find((s) => String(s.id) === String(slipId)) ?? null;
  return { slip, lines: slip?.lines ?? [] };
}

export async function getCachedLineByBarcode(
  slipId: string,
  barcode: string,
): Promise<CachedCountingLine | null> {
  const { lines } = await getCachedSlipWithLines(slipId);
  const bc = barcode.trim();
  return lines.find((l) => (l.barcode || '').trim() === bc) ?? null;
}

export async function upsertCountingSlipInCache(slip: CachedCountingSlip): Promise<void> {
  const snap = (await loadCountingSlipsSnapshot()) ?? {
    firmNr: firmNr(),
    savedAt: new Date().toISOString(),
    rows: [] as CachedCountingSlip[],
  };
  const idx = snap.rows.findIndex((s) => String(s.id) === String(slip.id));
  const row = { ...slip, line_count: slip.lines.length };
  if (idx >= 0) snap.rows[idx] = row;
  else snap.rows.unshift(row);
  await saveCountingSlipsRows(snap.rows);
}

export async function upsertCountingLineInCache(
  slipId: string,
  line: CachedCountingLine,
): Promise<void> {
  const { slip } = await getCachedSlipWithLines(slipId);
  if (!slip) return;
  const lines = [...slip.lines];
  const idx = lines.findIndex((l) => String(l.id) === String(line.id));
  if (idx >= 0) lines[idx] = line;
  else lines.unshift(line);
  await upsertCountingSlipInCache({ ...slip, lines });
}

export async function deleteCountingLineInCache(slipId: string, lineId: string): Promise<void> {
  const { slip } = await getCachedSlipWithLines(slipId);
  if (!slip) return;
  await upsertCountingSlipInCache({
    ...slip,
    lines: slip.lines.filter((l) => String(l.id) !== String(lineId)),
  });
}

export async function updateCountingSlipStatusInCache(
  slipId: string,
  status: CountingSlipStatus,
): Promise<void> {
  const { slip } = await getCachedSlipWithLines(slipId);
  if (!slip) return;
  await upsertCountingSlipInCache({ ...slip, status });
}

/** PG senkronu tamamlandı — yerel taslak bayrağını kaldır */
export async function markCountingSlipSynced(slipId: string): Promise<void> {
  const { slip } = await getCachedSlipWithLines(slipId);
  if (!slip) return;
  await upsertCountingSlipInCache({ ...slip, pending: false });
}

export async function saveCountingSlipsSnapshot(rows: CachedCountingSlip[]): Promise<void> {
  await saveCountingSlipsRows(rows);
}

/** Offline sayım fiş no — yerel sıra (SAY-{yıl}-{seq}) */
export async function nextOfflineCountingFicheNo(): Promise<string> {
  const fn = firmNr();
  const year = new Date().getFullYear();
  const key = `${COUNTING_FICHE_SEQ_KEY}_${fn}_${year}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const n = (parseInt(raw || '0', 10) || 0) + 1;
    await AsyncStorage.setItem(key, String(n));
    return `SAY-${year}-${String(n).padStart(4, '0')}`;
  } catch {
    const stamp = Date.now().toString().slice(-4);
    return `SAY-${year}-${stamp}`;
  }
}

async function loadPendingInvoicesSnapshot(): Promise<ListSnapshot<CachedPendingInvoice> | null> {
  const snap = await readSnapshot<CachedPendingInvoice>(PENDING_INVOICES_KEY);
  if (!snap) return null;
  const fn = firmNr();
  if (snap.firmNr && fn && snap.firmNr !== fn) return null;
  return snap;
}

export async function getPendingInvoices(): Promise<CachedPendingInvoice[]> {
  const snap = await loadPendingInvoicesSnapshot();
  return snap?.rows ?? [];
}

export async function getPendingInvoiceById(id: string): Promise<CachedPendingInvoice | null> {
  const rows = await getPendingInvoices();
  return rows.find((r) => String(r.id) === String(id)) ?? null;
}

export async function upsertPendingInvoiceInCache(row: CachedPendingInvoice): Promise<void> {
  const snap = (await loadPendingInvoicesSnapshot()) ?? {
    firmNr: firmNr(),
    savedAt: new Date().toISOString(),
    rows: [] as CachedPendingInvoice[],
  };
  const idx = snap.rows.findIndex((r) => String(r.id) === String(row.id));
  if (idx >= 0) snap.rows[idx] = row;
  else snap.rows.unshift(row);
  await writeSnapshot(PENDING_INVOICES_KEY, snap.rows);
}

export async function patchPendingInvoiceInCache(
  id: string,
  patch: { notes?: string; status?: string },
): Promise<void> {
  const row = await getPendingInvoiceById(id);
  if (!row) return;
  await upsertPendingInvoiceInCache({
    ...row,
    notes: patch.notes !== undefined ? patch.notes : row.notes,
    status: patch.status !== undefined ? patch.status : row.status,
  });
}

export async function removePendingInvoiceFromCache(id: string): Promise<void> {
  const snap = await loadPendingInvoicesSnapshot();
  if (!snap) return;
  await writeSnapshot(
    PENDING_INVOICES_KEY,
    snap.rows.filter((r) => String(r.id) !== String(id)),
  );
}

export async function getSnapshotMeta(): Promise<{
  productsAt: string | null;
  customersAt: string | null;
  productCount: number;
  customerCount: number;
  countingSlipsAt: string | null;
  countingSlipCount: number;
  pendingInvoiceCount: number;
}> {
  const [p, c, cs, inv] = await Promise.all([
    loadProductsSnapshot(),
    loadCustomersSnapshot(),
    loadCountingSlipsSnapshot(),
    loadPendingInvoicesSnapshot(),
  ]);
  return {
    productsAt: p?.savedAt ?? null,
    customersAt: c?.savedAt ?? null,
    productCount: p?.rows.length ?? 0,
    customerCount: c?.rows.length ?? 0,
    countingSlipsAt: cs?.savedAt ?? null,
    countingSlipCount: cs?.rows.length ?? 0,
    pendingInvoiceCount: inv?.rows.length ?? 0,
  };
}
