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
  addReturn: (sale: Sale) => Promise<void>;
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

      addReturn: async (sale) => {
        set({ isLoading: true, error: null });
        try {
          set((state) => ({
            sales: [sale, ...state.sales],
            isLoading: false,
            lastSync: Date.now(),
          }));
        } catch (error) {
          console.error('[SaleStore] Error adding return:', error);
          set({ isLoading: false, error: 'Failed to add return' });
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
        // localStorage kotası (5-10 MB) taşmasın diye sadece "hafif" meta
        // veri saklanır. items/payments/müşteri detayları DB'de mevcut;
        // burada sadece liste ekranı için gerekli başlık bilgileri tutulur.
        // QuotaExceeded hatasının ana nedeni: items[] ve customerAddress
        // gibi büyük alanlar 100 satırla MB'ları buluyordu.
        sales: state.sales.slice(0, 50).map((s) => ({
          id: s.id,
          receiptNumber: s.receiptNumber,
          date: s.date,
          customerId: s.customerId,
          customerName: s.customerName,
          customerCode: s.customerCode,
          total: s.total,
          subtotal: s.subtotal,
          tax: s.tax,
          discount: s.discount,
          paymentMethod: s.paymentMethod,
          paymentStatus: s.paymentStatus,
          status: s.status,
          cashier: s.cashier,
          storeId: s.storeId,
          userId: s.userId,
          firmNr: s.firmNr,
          periodNr: s.periodNr,
          created_at: s.created_at,
          // items / payments / customerAddress / notes / campaign vb. ÇIKARILDI
          itemCount: Array.isArray(s.items) ? s.items.length : 0,
        })),
        lastSync: state.lastSync
      }),
      // localStorage QuotaExceeded hatası kullanıcı deneyimini bozmasın:
      // mevcut anahtarı sil ve yeniden dene. Eski şişmiş veri zaten DB'de
      // (sales tablosu + invoice API), kaybı risk değil.
      storage: {
        getItem: (name) => {
          try {
            const raw = localStorage.getItem(name);
            return raw ? JSON.parse(raw) : null;
          } catch (err) {
            console.warn('[SaleStore] storage.getItem başarısız, anahtar siliniyor:', err);
            try { localStorage.removeItem(name); } catch {}
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch (err: any) {
            const isQuota =
              err?.name === 'QuotaExceededError' ||
              /quota/i.test(String(err?.message || ''));
            if (isQuota) {
              console.warn(
                '[SaleStore] localStorage kotası aşıldı, eski anahtar siliniyor ve tekrar deneniyor:',
                name,
              );
              try { localStorage.removeItem(name); } catch {}
              try {
                localStorage.setItem(name, JSON.stringify(value));
              } catch (err2) {
                // ikinci deneme de başarısız (başka anahtarlar da kotası
                // dolduruyor olabilir) — sessizce yoksay, uygulama çalışmaya devam etsin
                console.warn('[SaleStore] localStorage yazımı ikinci denemede de başarısız:', err2);
              }
            } else {
              throw err;
            }
          }
        },
        removeItem: (name) => {
          try { localStorage.removeItem(name); } catch {}
        },
      },
    }
  )
);

