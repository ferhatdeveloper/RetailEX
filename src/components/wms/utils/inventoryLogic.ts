/**
 * Advanced Inventory Logic Utilities
 * FEFO (First Expired First Out) & FIFO (First In First Out)
 */

export interface InventoryItem {
    id: string;
    product_id: string;
    batch_no?: string;
    expiration_date?: string; // ISO Date string
    quantity: number;
    location_code: string;
    location_id: string;
    created_at: string; // Receipt date for FIFO
}

export interface PickingSuggestion {
    inventory_id: string;
    product_id: string;
    location_code: string;
    batch_no?: string;
    expiration_date?: string;
    quantity_to_pick: number;
    reason: 'FEFO_CRITICAL' | 'FEFO_warning' | 'FIFO' | 'standard';
}

/**
 * Sorts inventory items based on FEFO logic.
 * 1. Expiring soonest (but not expired) comes first.
 * 2. If no expiration, FIFO (oldest receipt) comes next.
 * 3. Expired items are excluded or flagged (here excluded for suggestion).
 */
export function suggestStockForPicking(
    inventory: InventoryItem[],
    quantityNeeded: number,
    allowExpired: boolean = false
): PickingSuggestion[] {
    const now = new Date();
    const suggestions: PickingSuggestion[] = [];
    let remainingQty = quantityNeeded;

    // Filter out zero qty
    let availableStock = inventory.filter(i => i.quantity > 0);

    // Sort Logic
    availableStock.sort((a, b) => {
        // 1. Expiration Date Comparison
        if (a.expiration_date && b.expiration_date) {
            return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
        }
        // If one has expiration and other doesn't, picking the one WITH expiration is usually safer for FEFO?
        // Or actually, explicit expiration dates usually imply perishables, which prioritize over non-perishables?
        // Let's assume having expiration date > no expiration date for FEFO priority.
        if (a.expiration_date && !b.expiration_date) return -1;
        if (!a.expiration_date && b.expiration_date) return 1;

        // 2. FIFO fallback (created_at)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    for (const item of availableStock) {
        if (remainingQty <= 0) break;

        // Check expiration
        if (item.expiration_date) {
            const expDate = new Date(item.expiration_date);
            if (!allowExpired && expDate < now) {
                // Skip expired items
                continue;
            }
        }

        const pickQty = Math.min(item.quantity, remainingQty);

        // Determine reason tag
        let reason: PickingSuggestion['reason'] = 'FIFO';
        if (item.expiration_date) {
            const daysUntilExpiry = Math.ceil((new Date(item.expiration_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry < 30) reason = 'FEFO_CRITICAL';
            else reason = 'FEFO_warning';
        }

        suggestions.push({
            inventory_id: item.id,
            product_id: item.product_id,
            location_code: item.location_code,
            batch_no: item.batch_no,
            expiration_date: item.expiration_date,
            quantity_to_pick: pickQty,
            reason
        });

        remainingQty -= pickQty;
    }

    // If we couldn't fulfill the full quantity, that's handled by the caller checking suggestions sum
    return suggestions;
}



