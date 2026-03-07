/**
 * Professional Unit Conversion Utility for F&B ERP
 * Handles mass, volume and count conversions.
 */

export const UNIT_CONVERSIONS: Record<string, { base: string; factor: number }> = {
    // Mass (Base: gr)
    'kg': { base: 'gr', factor: 1000 },
    'gr': { base: 'gr', factor: 1 },
    'mg': { base: 'gr', factor: 0.001 },

    // Volume (Base: ml)
    'lt': { base: 'ml', factor: 1000 },
    'l': { base: 'ml', factor: 1000 },
    'ml': { base: 'ml', factor: 1 },
    'cl': { base: 'ml', factor: 10 },

    // Count (Base: unit)
    'adet': { base: 'adet', factor: 1 },
    'porsiyon': { base: 'porsiyon', factor: 1 },
    'paket': { base: 'paket', factor: 1 },
};

export function convertUnit(amount: number, fromUnit: string, toUnit: string): number {
    const from = UNIT_CONVERSIONS[fromUnit.toLowerCase()];
    const to = UNIT_CONVERSIONS[toUnit.toLowerCase()];

    if (!from || !to || from.base !== to.base) {
        // If units are incompatible or unknown, return original amount (fallback)
        console.warn(`Incompatible or unknown units for conversion: ${fromUnit} -> ${toUnit}`);
        return amount;
    }

    // Convert to base, then to target
    const baseAmount = amount * from.factor;
    return baseAmount / to.factor;
}
