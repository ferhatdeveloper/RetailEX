/**
 * Yeni dağıtımda eski önbellek / SW nedeniyle `Failed to fetch dynamically imported module`
 * oluştuğunda: kısa retry, ardından isteğe bağlı tam yenileme.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** `React.lazy` ile aynı gevşeklik — modül `default` export’u özel prop tipleri taşır */
export type LazyComponent = LazyExoticComponent<ComponentType<any>>;

const CHUNK_ERR_MARKERS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
  'ChunkLoadError',
  'Loading chunk',
  'Loading CSS chunk',
];

const CHUNK_AUTO_RECOVERY_KEY = 'retailex_chunk_auto_recovery';

export function isChunkLoadFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  return CHUNK_ERR_MARKERS.some((m) => msg.includes(m) || lower.includes(m.toLowerCase()));
}

async function clearAppCaches(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* yoksay */
  }
}

async function unregisterServiceWorkers(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* yoksay */
  }
}

/** SW + Cache Storage temizleyip tam sayfa yüklemesi (bir kez) */
export async function hardReloadClearingAppCaches(): Promise<void> {
  await unregisterServiceWorkers();
  await clearAppCaches();
  const base = window.location.pathname + window.location.search;
  const sep = base.includes('?') ? '&' : '?';
  window.location.replace(`${base}${sep}_rex_recover=${Date.now()}`);
}

export function hasAttemptedChunkAutoRecovery(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_AUTO_RECOVERY_KEY) === '1';
  } catch {
    return false;
  }
}

function markChunkAutoRecoveryAttempted(): void {
  try {
    sessionStorage.setItem(CHUNK_AUTO_RECOVERY_KEY, '1');
  } catch {
    /* yoksay */
  }
}

/** Bir oturumda en fazla bir kez SW + önbellek temizleyip yeniden yükler. */
export async function tryAutoRecoverFromChunkFailure(): Promise<boolean> {
  if (typeof window === 'undefined' || hasAttemptedChunkAutoRecovery()) return false;
  markChunkAutoRecoveryAttempted();
  await hardReloadClearingAppCaches();
  return true;
}

/** bootstrap / lazy chunk hatalarında otomatik kurtarma (main.tsx'te erken kurulur). */
export function installChunkLoadGlobalRecovery(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __retailexChunkRecoveryInstalled?: boolean };
  if (w.__retailexChunkRecoveryInstalled) return;
  w.__retailexChunkRecoveryInstalled = true;

  const handleChunkFailure = (err: unknown) => {
    if (!isChunkLoadFailure(err)) return;
    void tryAutoRecoverFromChunkFailure();
  };

  window.addEventListener('unhandledrejection', (e) => {
    handleChunkFailure(e.reason);
  });

  window.addEventListener('error', (e) => {
    if (e.message) handleChunkFailure(new Error(e.message));
  });

  window.addEventListener('vite:preloadError', ((e: Event) => {
    const ev = e as CustomEvent;
    handleChunkFailure(ev.detail);
    if (typeof ev.preventDefault === 'function') ev.preventDefault();
  }) as EventListener);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function importWithChunkRetry<T>(importer: () => Promise<T>, retries = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await importer();
    } catch (e) {
      last = e;
      if (!isChunkLoadFailure(e) || i === retries) break;
      await sleep(400 * (i + 1));
    }
  }
  if (isChunkLoadFailure(last)) {
    await tryAutoRecoverFromChunkFailure();
  }
  throw last;
}

export function lazyWithChunkRecovery(
  factory: () => Promise<{ default: ComponentType<any> }>
): LazyComponent {
  return lazy(async () => {
    const mod = await importWithChunkRetry(factory);
    if (!mod?.default) {
      throw new Error('Lazy modül default export döndürmedi');
    }
    return mod;
  });
}
