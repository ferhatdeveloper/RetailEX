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
  deleteProduct: (id: string) => Promise<void>;
  updateStock: (id: string, quantity: number) => Promise<void>;
  findByBarcode: (barcode: string) => Product | undefined;
  syncWithServer: () => Promise<void>;
}

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
          } else {
            throw new Error('Failed to update product');
          }
        } catch (error) {
          console.error('[ProductStore] Error updating product:', error);
          set({ isLoading: false, error: 'Failed to update product' });
          throw error;
        }
      },

      deleteProduct: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const success = await productAPI.delete(id);
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
      partialize: (state) => ({
        products: state.products,
        lastSync: state.lastSync
      })
    }
  )
);

// Auto-load products on first mount
if (typeof window !== 'undefined') {
  const store = useProductStore.getState();
  if (store.products.length === 0) {
    store.loadProducts();
  }
}

