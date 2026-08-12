import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PurchaseInvoiceItem {
    productId: string;
    productName: string;
    productCode: string;
    variantId?: string;
    variantName?: string;
    variantCode?: string;
    quantity: number;
    purchasePrice: number;
    salePrice: number;
    totalCost: number;
    totalProfit: number;
    profitMargin: number;
}

export interface PendingPurchaseInvoice {
    items: PurchaseInvoiceItem[];
    totalCost: number;
    totalProfit: number;
    averageProfitMargin: number;
    createdAt: Date;
}

interface PendingPurchaseState {
    pendingInvoice: PendingPurchaseInvoice | null;

    // Actions
    addItems: (items: Omit<PurchaseInvoiceItem, 'totalCost' | 'totalProfit' | 'profitMargin'>[]) => void;
    removeItem: (index: number) => void;
    clearInvoice: () => void;
    hasItems: () => boolean;
}

// Helper functions
const calculateItemTotals = (
    quantity: number,
    purchasePrice: number,
    salePrice: number
): Pick<PurchaseInvoiceItem, 'totalCost' | 'totalProfit' | 'profitMargin'> => {
    const totalCost = quantity * purchasePrice;
    const totalProfit = quantity * (salePrice - purchasePrice);
    const profitMargin = purchasePrice > 0 ? ((salePrice - purchasePrice) / purchasePrice) * 100 : 0;

    return { totalCost, totalProfit, profitMargin };
};

const calculateInvoiceTotals = (items: PurchaseInvoiceItem[]) => {
    const totalCost = items.reduce((sum, item) => sum + item.totalCost, 0);
    const totalProfit = items.reduce((sum, item) => sum + item.totalProfit, 0);
    const averageProfitMargin = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    return { totalCost, totalProfit, averageProfitMargin };
};

export const usePendingPurchaseStore = create<PendingPurchaseState>()(
    persist(
        (set, get) => ({
            pendingInvoice: null,

            addItems: (newItems) => {
                const itemsWithTotals: PurchaseInvoiceItem[] = newItems.map(item => ({
                    ...item,
                    ...calculateItemTotals(item.quantity, item.purchasePrice, item.salePrice)
                }));

                set((state) => {
                    const existingItems = state.pendingInvoice?.items || [];
                    const allItems = [...existingItems, ...itemsWithTotals];
                    const totals = calculateInvoiceTotals(allItems);

                    return {
                        pendingInvoice: {
                            items: allItems,
                            ...totals,
                            createdAt: state.pendingInvoice?.createdAt || new Date()
                        }
                    };
                });
            },

            removeItem: (index) => {
                set((state) => {
                    if (!state.pendingInvoice) return state;

                    const items = state.pendingInvoice.items.filter((_, i) => i !== index);

                    if (items.length === 0) {
                        return { pendingInvoice: null };
                    }

                    const totals = calculateInvoiceTotals(items);

                    return {
                        pendingInvoice: {
                            items,
                            ...totals,
                            createdAt: state.pendingInvoice.createdAt
                        }
                    };
                });
            },

            clearInvoice: () => {
                set({ pendingInvoice: null });
            },

            hasItems: () => {
                const state = get();
                return state.pendingInvoice !== null && state.pendingInvoice.items.length > 0;
            }
        }),
        {
            name: 'retailos-pending-purchase',
            partialize: (state) => ({
                pendingInvoice: state.pendingInvoice
            })
        }
    )
);


