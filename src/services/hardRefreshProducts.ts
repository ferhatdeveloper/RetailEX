/**
 * Ürün/stok hard refresh — Ctrl+R hissi (bellek cache temizle + DB’den çek).
 * Soft-delete / fatura mutasyonu sonrası store ve açık sekmeler güncel kalsın.
 */
import { productAPI } from './api/products';
import { useProductStore } from '../store/useProductStore';
import { emitInvalidate } from './retailexDataSync';

export type HardRefreshProductsResult = {
  recomputeUpdated: number;
  recomputeErrors: string[];
};

/**
 * Zustand productStore’u boşaltır, isteğe bağlı kart stoğunu aktif belgelerle hizalar,
 * DB’den yeniden yükler ve (varsayılan) `products` invalidate yayınlar.
 */
export async function hardRefreshProductsAndStock(opts?: {
  /** Varsayılan true — `recomputeStocksFromActiveDocuments` */
  recompute?: boolean;
  /** Varsayılan true — açık sekmelerdeki dinleyicileri tetikle */
  emit?: boolean;
}): Promise<HardRefreshProductsResult> {
  const recompute = opts?.recompute !== false;
  const shouldEmit = opts?.emit !== false;

  // Stale UI’ı hemen bırak (Ctrl+R: bellek sıfırlanır)
  useProductStore.setState({
    products: [],
    lastSync: null,
    error: null,
    isLoading: true,
  });

  let recomputeUpdated = 0;
  let recomputeErrors: string[] = [];

  if (recompute) {
    try {
      const align = await productAPI.recomputeStocksFromActiveDocuments();
      recomputeUpdated = Number(align?.updated) || 0;
      recomputeErrors = Array.isArray(align?.errors) ? align.errors.map(String) : [];
    } catch (e) {
      recomputeErrors = [e instanceof Error ? e.message : String(e)];
      console.warn('[hardRefreshProducts] recompute failed:', e);
    }
  }

  await useProductStore.getState().loadProducts(true);

  if (shouldEmit) {
    // Raporlar (local state) ve diğer sekmeler — store zaten yüklü; dinleyiciler kendi refetch’ini yapar
    emitInvalidate('products');
  }

  return { recomputeUpdated, recomputeErrors };
}

/** Yalnızca store’u DB’den yenile (recompute yok) — invalidate sonrası hafif yol */
export async function reloadProductStoreFromDb(opts?: { emit?: boolean }): Promise<void> {
  await useProductStore.getState().loadProducts(true);
  if (opts?.emit !== false) {
    emitInvalidate('products');
  }
}
