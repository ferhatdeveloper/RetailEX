/**
 * Master Data API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS } from '../postgres';

// ============================================================================
// TYPES
// ============================================================================

export interface Currency {
    id: string;
    code: string;
    name: string;
    symbol: string;
    exchange_rate: number;
    is_active: boolean;
}

export interface Category {
    id: string;
    code: string;
    name: string;
    parent_id?: string;
    description?: string;
    is_active: boolean;
}

export interface Brand {
    id: string;
    code: string;
    name: string;
    description?: string;
    is_active: boolean;
}

export interface ProductGroup {
    id: string;
    code: string;
    name: string;
    parent_id?: string;
    description?: string;
    is_active: boolean;
}

export interface Unit {
    id: string;
    code: string;
    name: string;
    description?: string;
    is_active: boolean;
}

export interface TaxRate {
    id: string;
    rate: number;
    description?: string;
    is_active: boolean;
}

export interface SpecialCode {
    id: string;
    code: string;
    name: string;
    description?: string;
    module_type?: string;
    is_active: boolean;
}

// ============================================================================
// CURRENCY API
// ============================================================================

export const currencyAPI = {
    async getAll(): Promise<Currency[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM currencies WHERE is_active = true ORDER BY code ASC`
            );
            return rows;
        } catch (error) {
            console.error('[CurrencyAPI] getAll failed:', error);
            return [];
        }
    },

    async getByCode(code: string): Promise<Currency | null> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM currencies WHERE code = $1 AND is_active = true`,
                [code]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('[CurrencyAPI] getByCode failed:', error);
            return null;
        }
    },
};

// ============================================================================
// CATEGORY API
// ============================================================================

export const categoryAPI = {
    async getAll(): Promise<Category[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM categories WHERE is_active = true ORDER BY name ASC`
            );
            return rows;
        } catch (error) {
            console.error('[CategoryAPI] getAll failed:', error);
            return [];
        }
    },

    async getMainCategories(): Promise<Category[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM categories WHERE parent_id IS NULL AND is_active = true ORDER BY name ASC`
            );
            return rows;
        } catch (error) {
            console.error('[CategoryAPI] getMainCategories failed:', error);
            return [];
        }
    },

    async getSubCategories(parentId: string): Promise<Category[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM categories WHERE parent_id = $1 AND is_active = true ORDER BY name ASC`,
                [parentId]
            );
            return rows;
        } catch (error) {
            console.error('[CategoryAPI] getSubCategories failed:', error);
            return [];
        }
    },
};

// ============================================================================
// BRAND API
// ============================================================================

export const brandAPI = {
    async getAll(): Promise<Brand[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM brands WHERE is_active = true ORDER BY name ASC`
            );
            return rows;
        } catch (error) {
            console.error('[BrandAPI] getAll failed:', error);
            return [];
        }
    },
};

// ============================================================================
// PRODUCT GROUP API
// ============================================================================

export const productGroupAPI = {
    async getAll(): Promise<ProductGroup[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM product_groups WHERE is_active = true ORDER BY name ASC`
            );
            return rows;
        } catch (error) {
            console.error('[ProductGroupAPI] getAll failed:', error);
            return [];
        }
    },
};

// ============================================================================
// UNIT API
// ============================================================================

export const unitAPI = {
    async getAll(): Promise<Unit[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM units WHERE is_active = true ORDER BY code ASC`
            );
            return rows;
        } catch (error) {
            console.error('[UnitAPI] getAll failed:', error);
            return [];
        }
    },
};

// ============================================================================
// TAX RATE API
// ============================================================================

export const taxRateAPI = {
    async getAll(): Promise<TaxRate[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM tax_rates WHERE is_active = true ORDER BY rate ASC`
            );
            return rows;
        } catch (error) {
            console.error('[TaxRateAPI] getAll failed:', error);
            return [];
        }
    },
};

// ============================================================================
// SPECIAL CODE API
// ============================================================================

export const specialCodeAPI = {
    async getAll(): Promise<SpecialCode[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM special_codes WHERE is_active = true ORDER BY name ASC`
            );
            return rows;
        } catch (error) {
            console.error('[SpecialCodeAPI] getAll failed:', error);
            return [];
        }
    },

    async getByCategory(type: string): Promise<SpecialCode[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM special_codes WHERE module_type = $1 AND is_active = true ORDER BY name ASC`,
                [type]
            );
            return rows;
        } catch (error) {
            console.error('[SpecialCodeAPI] getByCategory failed:', error);
            return [];
        }
    }
};

// ============================================================================
// DEFINITION API (Generic)
// ============================================================================

export const definitionAPI = {
    async getAll(type: string): Promise<any[]> {
        console.warn('[DefinitionAPI] getAll not implemented for type:', type);
        return [];
    }
};
