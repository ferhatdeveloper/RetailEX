// Sale Store with SQL Integration
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Sale } from '../core/types';
import { salesAPI } from '../services/api/index';

interface SaleState {
  sales: Sale[];
  isLoading: boolean;
  error: string | null;
  lastSync: number | null;

  // Actions
  setSales: (sales: Sale[]) => void;
  /** Fatura silindikten sonra yerel listeyi anında güncelle (persist ile uyumlu) */
  removeSaleById: (id: string) => void;
  loadSales: (limit?: number) => Promise<void>;
  addSale: (sale: Sale) => Promise<void>;
  getSaleById: (id: string) => Promise<Sale | null>;
  getSalesByDateRange: (startDate: string, endDate: string) => Promise<Sale[]>;
  getSummary: (startDate?: string, endDate?: string) => Promise<any>;
  syncWithServer: () => Promise<void>;
}

export const useSaleStore = create<SaleState>()(
  persist(
    (set, get) => ({
      sales: [],
      isLoading: false,
      error: null,
      lastSync: null,

      setSales: (sales) => set({ sales, lastSync: Date.now() }),

      removeSaleById: (id) => {
        const sid = String(id || '').trim();
        if (!sid) return;
        set((state) => ({
          sales: state.sales.filter((s) => String(s.id) !== sid),
          lastSync: Date.now(),
        }));
      },

      loadSales: async (limit?: number) => {
        set({ isLoading: true, error: null });
        try {
          const sales = await salesAPI.getAll(limit);
          set({ sales, isLoading: false, lastSync: Date.now() });
        } catch (error) {
          console.error('[SaleStore] Error loading sales:', error);
          set({ isLoading: false, error: 'Failed to load sales' });
        }
      },

      addSale: async (sale) => {
        console.log('[SaleStore] addSale called:', sale);
        set({ isLoading: true, error: null });
        try {
          const newSale = await salesAPI.create(sale);
          if (newSale) {
            set((state) => ({
              sales: [newSale, ...state.sales],
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Failed to create sale');
          }
        } catch (error) {
          console.error('[SaleStore] Error adding sale:', error);
          set({ isLoading: false, error: 'Failed to add sale' });
          throw error;
        }
      },

      getSaleById: async (id) => {
        try {
          return await salesAPI.getById(id);
        } catch (error) {
          console.error('[SaleStore] Error getting sale by ID:', error);
          return null;
        }
      },

      getSalesByDateRange: async (startDate, endDate) => {
        set({ isLoading: true, error: null });
        try {
          const sales = await salesAPI.getByDateRange(startDate, endDate);
          set({ isLoading: false });
          return sales;
        } catch (error) {
          console.error('[SaleStore] Error getting sales by date range:', error);
          set({ isLoading: false, error: 'Failed to get sales' });
          return [];
        }
      },

      getSummary: async (startDate?, endDate?) => {
        try {
          return await salesAPI.getSummary(startDate, endDate);
        } catch (error) {
          console.error('[SaleStore] Error getting summary:', error);
          return {
            totalSales: 0,
            totalRevenue: 0,
            totalDiscount: 0,
            totalTax: 0,
            paymentMethods: {}
          };
        }
      },

      syncWithServer: async () => {
        const { lastSync } = get();
        const now = Date.now();

        // Sync only if last sync was more than 5 minutes ago
        if (lastSync && (now - lastSync) < 5 * 60 * 1000) {
          console.log('[SaleStore] Skipping sync - too recent');
          return;
        }

        console.log('[SaleStore] Syncing with server...');
        await get().loadSales(100); // Load last 100 sales
      }
    }),
    {
      name: 'retailos-sales-storage',
      partialize: (state) => ({
        sales: state.sales.slice(0, 100), // Only persist last 100 sales
        lastSync: state.lastSync
      })
    }
  )
);

// Auto-load sales on first mount
if (typeof window !== 'undefined') {
  const store = useSaleStore.getState();
  if (store.sales.length === 0) {
    store.loadSales(100);
  }
}

