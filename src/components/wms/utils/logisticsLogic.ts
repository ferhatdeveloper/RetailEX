/**
 * Logistics & Load Optimization Utilities
 * Handles vehicle load planning and route grouping.
 */

export interface LoadItem {
    id: string;
    volume_m3: number;
    weight_kg: number;
    pallets: number;
    priority: number; // 1 = High, 3 = Low
}

export interface VehicleCapacity {
    max_volume_m3: number;
    max_weight_kg: number;
    max_pallets: number;
}

export interface OptimizationResult {
    fittedItems: LoadItem[];
    remainingItems: LoadItem[];
    utilization: {
        volume: number;
        weight: number;
        pallets: number;
    };
}

/**
 * Optimizes vehicle loading using a greedy approach based on Priority first, then Size.
 * Attempts to fit as many high-priority items as possible.
 */
export function optimizeVehicleLoad(
    items: LoadItem[],
    capacity: VehicleCapacity
): OptimizationResult {
    // Sort by Priority (asc, 1 is high), then by Volume (desc, fit big rocks first? or small? usually big first efficiently)
    // Actually for knapsack-ish, greedy by value density is better, but here Priority is key.
    const sortedItems = [...items].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.volume_m3 - a.volume_m3; // Descending volume for same priority
    });

    const fittedItems: LoadItem[] = [];
    const remainingItems: LoadItem[] = [];

    let currentVol = 0;
    let currentWeight = 0;
    let currentPallets = 0;

    for (const item of sortedItems) {
        if (
            currentVol + item.volume_m3 <= capacity.max_volume_m3 &&
            currentWeight + item.weight_kg <= capacity.max_weight_kg &&
            currentPallets + item.pallets <= capacity.max_pallets
        ) {
            fittedItems.push(item);
            currentVol += item.volume_m3;
            currentWeight += item.weight_kg;
            currentPallets += item.pallets;
        } else {
            remainingItems.push(item);
        }
    }

    return {
        fittedItems,
        remainingItems,
        utilization: {
            volume: (currentVol / capacity.max_volume_m3) * 100,
            weight: (currentWeight / capacity.max_weight_kg) * 100,
            pallets: (currentPallets / capacity.max_pallets) * 100
        }
    };
}

/**
 * Optimizes the loading sequence based on LIFO (Last In, First Out) for delivery route.
 * Assumes the input 'items' are already sorted by delivery order (1st delivery, 2nd delivery...).
 * Returns items in LOADING order (Reverse of delivery order).
 */
export function optimizeRouteSequence(items: LoadItem[]): LoadItem[] {
    // If priority represents drop-off order (1 = First Drop), then we load Priority 1 LAST.
    // Sort by Priority Descending (Highest Priority aka First Drop gets loaded last? Wait.)
    // Drop 1 (Pri 1) -> Must be near door.
    // Drop 2 (Pri 2) -> Behind Drop 1.
    // ...
    // Drop N (Pri N) -> Deepest in truck (First Loaded).

    // So Loading Order = Reverse of Drop Order.
    // If Priority is Drop Order:
    // Sort by Priority descending (N, N-1, ... 2, 1). This is the loading sequence.

    return [...items].sort((a, b) => b.priority - a.priority);
}



