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
    is_base_currency: boolean;
    is_active: boolean;
}

export interface ExchangeRate {
    id: string;
    currency_code: string;
    date: string;
    buy_rate: number;
    sell_rate: number;
    effective_buy?: number;
    effective_sell?: number;
    source: string;
    is_active: boolean;
    created_at?: string;
}

// ============================================================================
// CURRENCY API
// ============================================================================

export const currencyAPI = {
    async getAll(): Promise<Currency[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM currencies ORDER BY sort_order ASC, code ASC`
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
                `SELECT * FROM currencies WHERE code = $1`,
                [code]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('[CurrencyAPI] getByCode failed:', error);
            return null;
        }
    },

    async create(currency: Omit<Currency, 'id'>): Promise<Currency | null> {
        try {
            const { rows } = await postgres.query(
                `INSERT INTO currencies (code, name, symbol, is_base_currency, is_active)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [currency.code, currency.name, currency.symbol, currency.is_base_currency ?? false, currency.is_active ?? true]
            );
            return rows[0];
        } catch (error) {
            console.error('[CurrencyAPI] create failed:', error);
            return null;
        }
    },

    async update(id: string, currency: Partial<Currency>): Promise<Currency | null> {
        try {
            const { rows } = await postgres.query(
                `UPDATE currencies 
                 SET name = COALESCE($1, name), 
                     symbol = COALESCE($2, symbol), 
                     is_active = COALESCE($3, is_active),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4
                 RETURNING *`,
                [currency.name, currency.symbol, currency.is_active, id]
            );
            return rows[0];
        } catch (error) {
            console.error('[CurrencyAPI] update failed:', error);
            return null;
        }
    },

    async delete(id: string): Promise<boolean> {
        try {
            await postgres.query(`DELETE FROM currencies WHERE id = $1`, [id]);
            return true;
        } catch (error) {
            console.error('[CurrencyAPI] delete failed:', error);
            return false;
        }
    }
};

// ============================================================================
// EXCHANGE RATE API
// ============================================================================

export const exchangeRateAPI = {
    async getAll(): Promise<ExchangeRate[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM exchange_rates ORDER BY date DESC, created_at DESC LIMIT 100`
            );
            return rows;
        } catch (error) {
            console.error('[ExchangeRateAPI] getAll failed:', error);
            return [];
        }
    },

    async getLatestRates(): Promise<ExchangeRate[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT DISTINCT ON (currency_code) * 
                 FROM exchange_rates 
                 WHERE is_active = true 
                 ORDER BY currency_code, date DESC, created_at DESC`
            );
            return rows;
        } catch (error) {
            console.error('[ExchangeRateAPI] getLatestRates failed:', error);
            return [];
        }
    },

    async save(rate: Omit<ExchangeRate, 'id'>): Promise<ExchangeRate | null> {
        try {
            const { rows } = await postgres.query(
                `INSERT INTO exchange_rates (currency_code, date, buy_rate, sell_rate, source, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (currency_code, date, source) 
                 DO UPDATE SET 
                    buy_rate = EXCLUDED.buy_rate,
                    sell_rate = EXCLUDED.sell_rate,
                    updated_at = CURRENT_TIMESTAMP
                 RETURNING *`,
                [rate.currency_code, rate.date, rate.buy_rate, rate.sell_rate, rate.source || 'manual', rate.is_active ?? true]
            );
            return rows[0];
        } catch (error) {
            console.error('[ExchangeRateAPI] save failed:', error);
            return null;
        }
    },

    async update(id: string, rate: Partial<ExchangeRate>): Promise<ExchangeRate | null> {
        try {
            const { rows } = await postgres.query(
                `UPDATE exchange_rates 
                 SET buy_rate = COALESCE($1, buy_rate), 
                     sell_rate = COALESCE($2, sell_rate),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3
                 RETURNING *`,
                [rate.buy_rate, rate.sell_rate, id]
            );
            return rows[0];
        } catch (error) {
            console.error('[ExchangeRateAPI] update failed:', error);
            return null;
        }
    },

    async delete(id: string): Promise<boolean> {
        try {
            await postgres.query(`DELETE FROM exchange_rates WHERE id = $1`, [id]);
            return true;
        } catch (error) {
            console.error('[ExchangeRateAPI] delete failed:', error);
            return false;
        }
    }
};

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

