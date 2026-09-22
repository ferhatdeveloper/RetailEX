/**
 * Tablo (DevExDataGrid) yenileme veri yolu.
 * Sayfa/modül `useRegisterDatagridRefresh(load)` ile kaydolur;
 * grid toolbar «Yenile» görünür handler’ları çağırır (gizli keep-alive paneller atlanır).
 */

type RefreshHandler = {
  id: number;
  run: () => void | Promise<void>;
  /** Handler’ın bağlı olduğu DOM kökü — display:none iken atlanır */
  getRoot?: () => HTMLElement | null;
};

let nextId = 1;
const handlers = new Map<number, RefreshHandler>();
const refreshingListeners = new Set<(v: boolean) => void>();
let refreshingCount = 0;

function isElementVisible(el: HTMLElement | null | undefined): boolean {
  if (!el || typeof window === 'undefined') return true;
  if (!el.isConnected) return false;
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (node.classList.contains('hidden')) return false;
    node = node.parentElement;
  }
  return true;
}

function notifyRefreshing() {
  const v = refreshingCount > 0;
  refreshingListeners.forEach((cb) => {
    try {
      cb(v);
    } catch {
      /* ignore */
    }
  });
}

export function registerDatagridRefresh(
  run: () => void | Promise<void>,
  getRoot?: () => HTMLElement | null,
): () => void {
  const id = nextId++;
  handlers.set(id, { id, run, getRoot });
  return () => {
    handlers.delete(id);
  };
}

export function subscribeDatagridRefreshing(cb: (refreshing: boolean) => void): () => void {
  refreshingListeners.add(cb);
  cb(refreshingCount > 0);
  return () => {
    refreshingListeners.delete(cb);
  };
}

export function isDatagridRefreshing(): boolean {
  return refreshingCount > 0;
}

/** Görünür kayıtlı yükleyicileri çalıştır */
export async function requestDatagridRefresh(): Promise<void> {
  const jobs: Array<() => void | Promise<void>> = [];
  handlers.forEach((h) => {
    const root = h.getRoot?.();
    if (root != null && !isElementVisible(root)) return;
    // getRoot yoksa (ör. ReportToolbar) her zaman dahil — tek ekranlı raporlar
    jobs.push(h.run);
  });
  if (jobs.length === 0) return;

  refreshingCount += 1;
  notifyRefreshing();
  try {
    await Promise.all(
      jobs.map(async (run) => {
        try {
          await Promise.resolve(run());
        } catch (err) {
          console.warn('[datagridRefresh]', err);
        }
      }),
    );
  } finally {
    refreshingCount = Math.max(0, refreshingCount - 1);
    notifyRefreshing();
  }
}
