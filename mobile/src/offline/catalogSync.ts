import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { fetchProducts } from '../api/productsApi';
import { fetchCustomers } from '../api/customersApi';
import { shouldUseLiveData } from './policy';

const META_KEY = 'retailex_catalog_sync_meta';
const DEFAULT_INTERVAL_MS = 60_000;
/** Boş arama snapshot’ı — periyodik katalog yenileme üst sınırı */
const DEFAULT_PULL_LIMIT = 1500;

export type CatalogSyncMeta = {
  lastPullAt: string;
  productsCount?: number;
  customersCount?: number;
};

export type PullCatalogResult = {
  productsOk: boolean;
  customersOk: boolean;
  at: string;
};

let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let currentAppState: AppStateStatus = AppState.currentState;
let pullInProgress = false;

async function readMeta(): Promise<CatalogSyncMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CatalogSyncMeta;
  } catch {
    return null;
  }
}

async function writeMeta(patch: Partial<CatalogSyncMeta> & { lastPullAt: string }): Promise<void> {
  try {
    const prev = (await readMeta()) ?? {};
    const next: CatalogSyncMeta = { ...prev, ...patch };
    await AsyncStorage.setItem(META_KEY, JSON.stringify(next));
  } catch {
    /* AsyncStorage hatası — offline akışı bozma */
  }
}

/** Ürün + cari snapshot’larını canlı kaynaktan çeker (boş arama → cache güncellenir). */
export async function pullCatalogSnapshots(opts?: { limit?: number }): Promise<PullCatalogResult> {
  const at = new Date().toISOString();
  const limit = opts?.limit ?? DEFAULT_PULL_LIMIT;

  if (!shouldUseLiveData()) {
    return { productsOk: false, customersOk: false, at };
  }

  if (pullInProgress) {
    return { productsOk: false, customersOk: false, at };
  }

  pullInProgress = true;
  let productsOk = false;
  let customersOk = false;
  let productsCount: number | undefined;
  let customersCount: number | undefined;

  try {
    const [prodRes, custRes] = await Promise.allSettled([
      fetchProducts('', limit),
      fetchCustomers('', limit),
    ]);

    if (prodRes.status === 'fulfilled') {
      productsOk = true;
      productsCount = prodRes.value.length;
    }
    if (custRes.status === 'fulfilled') {
      customersOk = true;
      customersCount = custRes.value.length;
    }

    if (productsOk || customersOk) {
      const patch: Partial<CatalogSyncMeta> & { lastPullAt: string } = { lastPullAt: at };
      if (productsOk) patch.productsCount = productsCount;
      if (customersOk) patch.customersCount = customersCount;
      await writeMeta(patch);
    }
  } finally {
    pullInProgress = false;
  }

  return { productsOk, customersOk, at };
}

async function tickCatalogSync(): Promise<void> {
  if (currentAppState !== 'active') return;
  if (!shouldUseLiveData()) return;
  if (pullInProgress) return;
  await pullCatalogSnapshots();
}

/** Periyodik katalog çekimi — yalnızca uygulama ön planda ve canlı veri politikası açıkken. */
export function startCatalogAutoSync(intervalMs = DEFAULT_INTERVAL_MS): void {
  stopCatalogAutoSync();
  currentAppState = AppState.currentState;
  appStateSubscription = AppState.addEventListener('change', (next) => {
    currentAppState = next;
  });
  intervalId = setInterval(() => void tickCatalogSync(), intervalMs);
}

export function stopCatalogAutoSync(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  appStateSubscription?.remove();
  appStateSubscription = null;
}
