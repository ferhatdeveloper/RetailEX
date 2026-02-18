// Customer Store with SQL Integration
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Customer } from '../core/types';
import { customerAPI } from '../services/api/index';

interface CustomerState {
  customers: Customer[];
  isLoading: boolean;
  error: string | null;
  lastSync: number | null;

  // Actions
  setCustomers: (customers: Customer[]) => void;
  loadCustomers: () => Promise<void>;
  addCustomer: (customer: Customer) => Promise<void>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  updatePoints: (id: string, points: number) => Promise<void>;
  findByPhone: (phone: string) => Promise<Customer | null>;
  updatePurchaseHistory: (id: string, amount: number) => Promise<void>;
  syncWithServer: () => Promise<void>;
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set, get) => ({
      customers: [],
      isLoading: false,
      error: null,
      lastSync: null,

      setCustomers: (customers) => set({ customers, lastSync: Date.now() }),

      loadCustomers: async () => {
        set({ isLoading: true, error: null });
        try {
          const customers = await customerAPI.getAll();
          set({ customers, isLoading: false, lastSync: Date.now() });
        } catch (error) {
          console.error('[CustomerStore] Error loading customers:', error);
          set({ isLoading: false, error: 'Failed to load customers' });
        }
      },

      addCustomer: async (customer) => {
        set({ isLoading: true, error: null });
        try {
          const newCustomer = await customerAPI.create(customer);
          if (newCustomer) {
            set((state) => ({
              customers: [...state.customers, newCustomer],
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Failed to create customer');
          }
        } catch (error) {
          console.error('[CustomerStore] Error adding customer:', error);
          set({ isLoading: false, error: 'Failed to add customer' });
        }
      },

      updateCustomer: async (id, customerUpdate) => {
        set({ isLoading: true, error: null });
        try {
          const updatedCustomer = await customerAPI.update(id, customerUpdate);
          if (updatedCustomer) {
            set((state) => ({
              customers: state.customers.map(c =>
                c.id === id ? updatedCustomer : c
              ),
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Failed to update customer');
          }
        } catch (error) {
          console.error('[CustomerStore] Error updating customer:', error);
          set({ isLoading: false, error: 'Failed to update customer' });
        }
      },

      deleteCustomer: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const success = await customerAPI.delete(id);
          if (success) {
            set((state) => ({
              customers: state.customers.filter(c => c.id !== id),
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Failed to delete customer');
          }
        } catch (error) {
          console.error('[CustomerStore] Error deleting customer:', error);
          set({ isLoading: false, error: 'Failed to delete customer' });
        }
      },

      updatePoints: async (id, points) => {
        set({ isLoading: true, error: null });
        try {
          const success = await customerAPI.updatePoints(id, points);
          if (success) {
            set((state) => ({
              customers: state.customers.map(c =>
                c.id === id ? { ...c, points } : c
              ),
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Failed to update points');
          }
        } catch (error) {
          console.error('[CustomerStore] Error updating points:', error);
          set({ isLoading: false, error: 'Failed to update points' });
        }
      },

      findByPhone: async (phone) => {
        try {
          return await customerAPI.getByPhone(phone);
        } catch (error) {
          console.error('[CustomerStore] Error finding customer by phone:', error);
          return null;
        }
      },

      updatePurchaseHistory: async (id, amount) => {
        set((state) => ({
          customers: state.customers.map(c =>
            c.id === id ? { ...c, totalPurchases: (c.totalPurchases || 0) + amount, lastPurchase: new Date().toISOString() } : c
          )
        }));
      },

      syncWithServer: async () => {
        const { lastSync } = get();
        const now = Date.now();

        // Sync only if last sync was more than 5 minutes ago
        if (lastSync && (now - lastSync) < 5 * 60 * 1000) {
          console.log('[CustomerStore] Skipping sync - too recent');
          return;
        }

        console.log('[CustomerStore] Syncing with server...');
        await get().loadCustomers();
      }
    }),
    {
      name: 'retailos-customers-storage',
      partialize: (state) => ({
        customers: state.customers,
        lastSync: state.lastSync
      })
    }
  )
);

// Auto-load customers on first mount
if (typeof window !== 'undefined') {
  const store = useCustomerStore.getState();
  if (store.customers.length === 0) {
    store.loadCustomers();
  }
}
