/**
 * Smart Picking Logic
 * Handles splitting orders based on Zones (category) and Volume (m3) capacity.
 */

export interface PickingItem {
    id: string;
    product_id: string;
    product_name: string;
    location_zone: 'dry' | 'cold' | 'frozen' | 'chemical' | 'secure'; // Aligned with DB zones
    volume_m3: number; // Unit volume
    quantity: number;
    weight_kg: number;
}

export interface PickingTask {
    id: string;
    zone: string;
    items: PickingItem[];
    total_volume: number;
    total_weight: number;
    estimated_time_mins: number;
    reason: string; // Why this split happened
}

export const PICKER_CART_CAPACITY_M3 = 1.5; // Standard picker cart capacity
export const MAX_WEIGHT_PER_TASK_KG = 500; // Max weight for safety

/**
 * Splits a list of items into optimized picking tasks.
 * 1. Groups by Zone (Dry, Cold, Frozen, etc. must be picked separately).
 * 2. Checks Volume/Weight limits and splits further if a zone task is too big.
 */
export function smartSplitOrder(items: PickingItem[]): PickingTask[] {
    const tasks: PickingTask[] = [];

    // 1. Group by Zone
    const zoneGroups: Record<string, PickingItem[]> = {};

    items.forEach(item => {
        const zone = item.location_zone || 'dry'; // Default to dry
        if (!zoneGroups[zone]) zoneGroups[zone] = [];
        zoneGroups[zone].push(item);
    });

    // 2. Process each zone grouping
    Object.entries(zoneGroups).forEach(([zone, zoneItems]) => {
        // Current task buffer
        let currentTaskItems: PickingItem[] = [];
        let currentVolume = 0;
        let currentWeight = 0;
        let splitCount = 1;

        zoneItems.forEach(item => {
            const itemTotalVol = item.volume_m3 * item.quantity;
            const itemTotalWeight = item.weight_kg * item.quantity;

            // Check if adding this item exceeds capacity
            if (
                (currentVolume + itemTotalVol > PICKER_CART_CAPACITY_M3) ||
                (currentWeight + itemTotalWeight > MAX_WEIGHT_PER_TASK_KG)
            ) {
                // Push current task and start new one
                if (currentTaskItems.length > 0) {
                    tasks.push(createTask(zone, currentTaskItems, currentVolume, currentWeight, splitCount));
                    splitCount++;
                    currentTaskItems = [];
                    currentVolume = 0;
                    currentWeight = 0;
                }
            }

            currentTaskItems.push(item);
            currentVolume += itemTotalVol;
            currentWeight += itemTotalWeight;
        });

        // Push remaining items
        if (currentTaskItems.length > 0) {
            tasks.push(createTask(zone, currentTaskItems, currentVolume, currentWeight, splitCount));
        }
    });

    return tasks;
}

function createTask(
    zone: string,
    items: PickingItem[],
    vol: number,
    weight: number,
    index: number
): PickingTask {
    // Simple time estimation: 2 mins base + 0.5 min per item line + 0.1 min per quantity unit
    const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
    const estimatedTime = Math.ceil(5 + (items.length * 0.5) + (totalQty * 0.1));

    return {
        id: `task-${Date.now()}-${zone}-${index}`,
        zone,
        items: [...items],
        total_volume: Number(vol.toFixed(3)),
        total_weight: Number(weight.toFixed(2)),
        estimated_time_mins: estimatedTime,
        reason: index > 1 ? `Split #${index} (Capacity Limit)` : `Zone: ${zone.toUpperCase()}`
    };
}

