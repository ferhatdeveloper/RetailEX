// Product Store with SQL Integration
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '../core/types';
import { productAPI } from '../services/api/index';

interface ProductState {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  lastSync: number | null;

  // Actions
  setProducts: (products: Product[]) => void;
  loadProducts: (silent?: boolean) => Promise<void>;
  addProduct: (product: Product) => Promise<Product | undefined>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<Product | undefined>;
  deleteProduct: (id: string, options?: { force?: boolean; adminPassword?: string }) => Promise<void>;
  updateStock: (id: string, quantity: number) => Promise<void>;
  /** POS satış sonrası: birden fazla ürün stokunu tek yükleme bayrağı + paralel API ile günceller */
  updateStocksBatch: (updates: { id: string; quantity: number }[]) => Promise<void>;
  findByBarcode: (barcode: string) => Product | undefined;
  syncWithServer: () => Promise<void>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const useProductStore = create<ProductState>()(
  persist(
    (set, get) => ({
      products: [],
      isLoading: false,
      error: null,
      lastSync: null,

      setProducts: (products) => set({ products, lastSync: Date.now() }),

      loadProducts: async (silent = false) => {
        if (!silent) set({ isLoading: true, error: null });
        try {
          const products = await productAPI.getAll();
          set({ products, isLoading: false, lastSync: Date.now() });
        } catch (error) {
          console.error('[ProductStore] Error loading products:', error);
          if (!silent) set({ isLoading: false, error: 'Failed to load products' });
        }
      },

      addProduct: async (product) => {
        const existingId = String(product.id || '').trim();
        if (UUID_RE.test(existingId)) {
          // onSave geri çağrısı veya eski sürüm çift INSERT — zaten kayıtlı ürünü tekrar oluşturma
          await get().loadProducts(true);
          return product;
        }

        set({ isLoading: true, error: null });
        try {
          console.log('[ProductStore] Adding product:', product);
          const newProduct = await productAPI.create(product);
          if (newProduct) {
            console.log('[ProductStore] Product created successfully:', newProduct);
            // Reload all products to get proper ordering from database
            await get().loadProducts();
            return newProduct;
          } else {
            throw new Error('Failed to create product');
          }
        } catch (error) {
          console.error('[ProductStore] Error adding product:', error);
          set({ isLoading: false, error: 'Failed to add product' });
          throw error; // Re-throw to allow UI to show error
        }
      },

      updateProduct: async (id, productUpdate) => {
        set({ isLoading: true, error: null });
        try {
          const updatedProduct = await productAPI.update(id, productUpdate);
          if (updatedProduct) {
            set((state) => ({
              products: state.products.map(p =>
                p.id === id ? updatedProduct : p
              ),
              isLoading: false,
              lastSync: Date.now()
            }));
            return updatedProduct;
          }
          throw new Error('Ürün güncellenemedi — kayıt bulunamadı veya firma eşleşmesi hatalı.');
        } catch (error) {
          console.error('[ProductStore] Error updating product:', error);
          const message = error instanceof Error ? error.message : 'Ürün güncellenemedi.';
          set({ isLoading: false, error: message });
          throw error instanceof Error ? error : new Error(message);
        }
      },

      deleteProduct: async (id, options) => {
        set({ isLoading: true, error: null });
        try {
          const success = await productAPI.delete(id, options);
          if (success) {
            set((state) => ({
              products: state.products.filter(p => p.id !== id),
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Ürün silinemedi.');
          }
        } catch (error) {
          console.error('[ProductStore] Error deleting product:', error);
          set({ isLoading: false, error: 'Failed to delete product' });
          throw error;
        }
      },

      updateStock: async (id, quantity) => {
        set({ isLoading: true, error: null });
        try {
          const success = await productAPI.updateStock(id, quantity);
          if (success) {
            set((state) => ({
              products: state.products.map(p =>
                p.id === id ? { ...p, stock: quantity } : p
              ),
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Failed to update stock');
          }
        } catch (error) {
          console.error('[ProductStore] Error updating stock:', error);
          set({ isLoading: false, error: 'Failed to update stock' });
        }
      },

      updateStocksBatch: async (updates) => {
        if (!updates.length) return;
        set({ isLoading: true, error: null });
        const normalizedById = new Map<string, number>();
        for (const update of updates) {
          const id = String(update.id || '').trim();
          const qty = Number(update.quantity);
          if (!UUID_RE.test(id) || !Number.isFinite(qty)) continue;
          normalizedById.set(id, Math.max(0, qty));
        }
        const safeUpdates = Array.from(normalizedById.entries()).map(([id, quantity]) => ({ id, quantity }));
        if (!safeUpdates.length) {
          set({ isLoading: false });
          return;
        }
        const existingIds = await productAPI.filterExistingProductIds(safeUpdates.map((u) => u.id));
        const existingUpdates = safeUpdates.filter((u) => existingIds.has(u.id));
        if (!existingUpdates.length) {
          set({ isLoading: false });
          return;
        }
        try {
          const results = await Promise.all(
            existingUpdates.map((u) => productAPI.updateStock(u.id, u.quantity))
          );
          let failedIds = existingUpdates
            .map((u, idx) => (!results[idx] ? u.id : null))
            .filter((x): x is string => typeof x === 'string');

          if (failedIds.length > 0) {
            const retryResults = await Promise.all(
              failedIds.map((id) => {
                const qty = normalizedById.get(id);
                return qty == null ? Promise.resolve(false) : productAPI.updateStock(id, qty);
              })
            );
            failedIds = failedIds.filter((_, idx) => !retryResults[idx]);
          }

          if (failedIds.length > 0) {
            throw new Error(`Bir veya daha fazla stok güncellenemedi (ürün: ${failedIds.slice(0, 3).join(', ')})`);
          }
          set((state) => ({
            products: state.products.map((p) => {
              const u = existingUpdates.find((x) => x.id === p.id);
              return u ? { ...p, stock: u.quantity } : p;
            }),
            isLoading: false,
            lastSync: Date.now(),
          }));
        } catch (error) {
          console.error('[ProductStore] Error batch updating stock:', error);
          set({ isLoading: false, error: 'Failed to update stock' });
          throw error;
        }
      },

      findByBarcode: (barcode) => {
        const { products } = get();
        return products.find(p => p.barcode === barcode);
      },

      syncWithServer: async () => {
        const { lastSync } = get();
        const now = Date.now();

        // Sync only if last sync was more than 5 minutes ago
        if (lastSync && (now - lastSync) < 5 * 60 * 1000) {
          console.log('[ProductStore] Skipping sync - too recent');
          return;
        }

        console.log('[ProductStore] Syncing with server...');
        await get().loadProducts();
      }
    }),
    {
      name: 'retailos-products-storage',
      /** Büyük ürün listesini localStorage'a yazma — tarayıcı kotası (QuotaExceededError) ve yavaşlık. */
      version: 2,
      partialize: (state) => ({ lastSync: state.lastSync }),
      migrate: (persisted: unknown) => {
        if (persisted && typeof persisted === 'object' && 'lastSync' in (persisted as object)) {
          return { lastSync: (persisted as { lastSync?: number | null }).lastSync ?? null };
        }
        return { lastSync: null as number | null };
      },
    }
  )
);

