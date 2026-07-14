import AsyncStorage from '@react-native-async-storage/async-storage';
import { firmNr } from '../api/erpTables';

const PRODUCTS_KEY = 'retailex_offline_products';
const CUSTOMERS_KEY = 'retailex_offline_customers';

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

export async function getSnapshotMeta(): Promise<{
  productsAt: string | null;
  customersAt: string | null;
  productCount: number;
  customerCount: number;
}> {
  const [p, c] = await Promise.all([loadProductsSnapshot(), loadCustomersSnapshot()]);
  return {
    productsAt: p?.savedAt ?? null,
    customersAt: c?.savedAt ?? null,
    productCount: p?.rows.length ?? 0,
    customerCount: c?.rows.length ?? 0,
  };
}
