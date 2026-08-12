/**
 * Master Data API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';

function padFirmNr(): string {
    return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function isRestApi(): boolean {
    return DB_SETTINGS.connectionProvider === 'rest_api';
}

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

/** Kur türüne göre satırdan sayısal kur (fatura formu ile uyumlu). */
export function pickExchangeRateValue(row: ExchangeRate, rateType: string): number {
    const t = (rateType || 'Satış').trim();
    const num = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : NaN;
    };
    if (t === 'Alış') {
        return num(row.buy_rate) || num(row.sell_rate) || 1;
    }
    if (t === 'Efektif Satış') {
        return num(row.effective_sell) || num(row.sell_rate) || num(row.buy_rate) || 1;
    }
    if (t === 'Efektif Alış') {
        return num(row.effective_buy) || num(row.buy_rate) || num(row.sell_rate) || 1;
    }
    return num(row.sell_rate) || num(row.buy_rate) || 1;
}

/**
 * Fatura dövizi → firma ana para (ledger): 1 birim döviz = kaç birim ledger.
 * exchange_rates satırları aynı pivot cinsinden olmalı (örn. hepsi IQD karşılığı).
 */
export function crossRateDocumentToLedgerFromLatest(
    documentCurrency: string,
    ledgerCurrency: string,
    latestRates: ExchangeRate[],
    rateType: string
): number | null {
    const dc = documentCurrency.trim().toUpperCase();
    const lc = ledgerCurrency.trim().toUpperCase();
    if (!dc || !lc || dc === lc) return 1;
    const rowD = latestRates.find(r => String(r.currency_code).trim().toUpperCase() === dc);
    const rowL = latestRates.find(r => String(r.currency_code).trim().toUpperCase() === lc);
    const vD = rowD ? pickExchangeRateValue(rowD, rateType) : NaN;
    const vL = rowL ? pickExchangeRateValue(rowL, rateType) : NaN;
    const denom = Number.isFinite(vL) && vL > 0 ? vL : 1;
    if (!Number.isFinite(vD) || vD <= 0) return null;
    return vD / denom;
}

/**
 * Firma ana para birimindeki tutarı raporlama dövizine çevirir.
 * `exchange_rates` satırları fatura formu ile aynı pivotta olmalı (crossRate ile uyumlu).
 */
export function convertAmountMainToReporting(
    amountMain: number,
    mainCurrency: string,
    reportingCurrency: string,
    latestRates: ExchangeRate[],
    rateType = 'Satış'
): number | null {
    const m = (mainCurrency || '').trim().toUpperCase();
    const r = (reportingCurrency || '').trim().toUpperCase();
    if (!m || !r || m === r) return amountMain;
    const oneReportingInMain = crossRateDocumentToLedgerFromLatest(r, m, latestRates, rateType);
    if (oneReportingInMain != null && oneReportingInMain > 0) {
        return amountMain / oneReportingInMain;
    }
    const oneMainInReporting = crossRateDocumentToLedgerFromLatest(m, r, latestRates, rateType);
    if (oneMainInReporting != null && oneMainInReporting > 0) {
        return amountMain * oneMainInReporting;
    }
    return null;
}

// ============================================================================
// CURRENCY API
// ============================================================================

export const currencyAPI = {
    async getAll(): Promise<Currency[]> {
        try {
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const rows = await postgrest.get<Currency[]>(
                    '/currencies',
                    { select: '*', order: 'sort_order.asc,code.asc' },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const rows = await postgrest.get<Currency[]>(
                    '/currencies',
                    { select: '*', code: `eq.${code}`, limit: 1 },
                    { schema: 'public' }
                );
                return (Array.isArray(rows) ? rows[0] : null) || null;
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const rows = await postgrest.post<Currency[]>(
                    '/currencies',
                    {
                        code: currency.code,
                        name: currency.name,
                        symbol: currency.symbol,
                        is_base_currency: currency.is_base_currency ?? false,
                        is_active: currency.is_active ?? true,
                    },
                    { schema: 'public', prefer: 'return=representation' }
                );
                return Array.isArray(rows) ? rows[0] : (rows as unknown as Currency);
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const body: Record<string, unknown> = {};
                if (currency.name !== undefined) body.name = currency.name;
                if (currency.symbol !== undefined) body.symbol = currency.symbol;
                if (currency.is_active !== undefined) body.is_active = currency.is_active;
                const rows = await postgrest.patch<Currency[]>(
                    `/currencies?id=eq.${encodeURIComponent(id)}`,
                    body,
                    { schema: 'public', prefer: 'return=representation' }
                );
                return Array.isArray(rows) ? rows[0] : (rows as unknown as Currency);
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                await postgrest.delete(`/currencies?id=eq.${encodeURIComponent(id)}`, { schema: 'public' });
                return true;
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const rows = await postgrest.get<ExchangeRate[]>(
                    '/exchange_rates',
                    { select: '*', order: 'date.desc,created_at.desc', limit: 100 },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const rows = await postgrest.get<ExchangeRate[]>(
                    '/exchange_rates',
                    {
                        select: '*',
                        is_active: 'eq.true',
                        order: 'currency_code.asc,date.desc,created_at.desc',
                        limit: 2000,
                    },
                    { schema: 'public' }
                );
                const list = Array.isArray(rows) ? rows : [];
                const seen = new Set<string>();
                const out: ExchangeRate[] = [];
                for (const r of list) {
                    const k = String(r.currency_code ?? '').trim().toUpperCase();
                    if (seen.has(k)) continue;
                    seen.add(k);
                    out.push({ ...r, currency_code: k });
                }
                return out;
            }
            const { rows } = await postgres.query(
                `SELECT DISTINCT ON (UPPER(TRIM(currency_code::text))) *
                 FROM exchange_rates
                 WHERE is_active = true
                 ORDER BY UPPER(TRIM(currency_code::text)), date DESC, created_at DESC NULLS LAST`
            );
            return rows.map((r: ExchangeRate) => ({
                ...r,
                currency_code: String(r.currency_code ?? '').trim().toUpperCase()
            }));
        } catch (error) {
            console.error('[ExchangeRateAPI] getLatestRates failed:', error);
            return [];
        }
    },

    /**
     * İşlem tarihi için geçerli kur: o güne kadar (dahil) kayıtlı en son kur.
     * as_of_date: YYYY-MM-DD
     */
    async getRateAsOfDate(currency_code: string, as_of_date: string): Promise<ExchangeRate | null> {
        if (!currency_code?.trim() || !as_of_date?.trim()) return null;
        try {
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const code = currency_code.trim().toUpperCase();
                const d = as_of_date.trim().slice(0, 10);
                const rows = await postgrest.get<ExchangeRate[]>(
                    '/exchange_rates',
                    {
                        select: '*',
                        is_active: 'eq.true',
                        currency_code: `eq.${code}`,
                        date: `lte.${d}`,
                        order: 'date.desc,created_at.desc',
                        limit: 1,
                    },
                    { schema: 'public' }
                );
                const row = (Array.isArray(rows) ? rows[0] : null) as ExchangeRate | undefined;
                if (!row) return null;
                return {
                    ...row,
                    currency_code: String(row.currency_code ?? '').trim().toUpperCase()
                };
            }
            const { rows } = await postgres.query(
                `SELECT * FROM exchange_rates
                 WHERE is_active = true
                   AND UPPER(TRIM(currency_code::text)) = UPPER(TRIM($1::text))
                   AND date <= $2::date
                 ORDER BY date DESC, created_at DESC NULLS LAST
                 LIMIT 1`,
                [currency_code.trim(), as_of_date.trim().slice(0, 10)]
            );
            const row = rows[0] as ExchangeRate | undefined;
            if (!row) return null;
            return {
                ...row,
                currency_code: String(row.currency_code ?? '').trim().toUpperCase()
            };
        } catch (error) {
            console.error('[ExchangeRateAPI] getRateAsOfDate failed:', error);
            return null;
        }
    },

    /** Tarih aralığı ve isteğe bağlı para birimine göre tüm kur kayıtları (geçmiş). */
    async getHistory(filters: {
        currency_code?: string | null;
        date_from?: string | null;
        date_to?: string | null;
        limit?: number;
    }): Promise<ExchangeRate[]> {
        try {
            const limit = Math.min(Math.max(filters.limit ?? 500, 1), 2000);
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const q: Record<string, string | number> = {
                    select: '*',
                    is_active: 'eq.true',
                    order: 'date.desc,currency_code.asc,created_at.desc',
                    limit,
                };
                if (filters.currency_code) {
                    q.currency_code = `eq.${String(filters.currency_code).trim().toUpperCase()}`;
                }
                const df = filters.date_from ? String(filters.date_from).trim().slice(0, 10) : '';
                const dt = filters.date_to ? String(filters.date_to).trim().slice(0, 10) : '';
                if (df && dt) {
                    q.and = `(date.gte.${df},date.lte.${dt})`;
                } else if (df) {
                    q.date = `gte.${df}`;
                } else if (dt) {
                    q.date = `lte.${dt}`;
                }
                const rows = await postgrest.get<ExchangeRate[]>('/exchange_rates', q, { schema: 'public' });
                return (Array.isArray(rows) ? rows : []).map((r: ExchangeRate) => ({
                    ...r,
                    currency_code: String(r.currency_code ?? '').trim().toUpperCase()
                }));
            }
            const parts: string[] = ['is_active = true'];
            const params: unknown[] = [];
            let n = 1;
            if (filters.currency_code) {
                parts.push(`UPPER(TRIM(currency_code::text)) = UPPER(TRIM($${n++}::text))`);
                params.push(String(filters.currency_code));
            }
            if (filters.date_from) {
                parts.push(`date >= $${n++}::date`);
                params.push(filters.date_from);
            }
            if (filters.date_to) {
                parts.push(`date <= $${n++}::date`);
                params.push(filters.date_to);
            }
            params.push(limit);
            const sql = `
                SELECT * FROM exchange_rates
                WHERE ${parts.join(' AND ')}
                ORDER BY date DESC, currency_code ASC, created_at DESC NULLS LAST
                LIMIT $${n}`;
            const { rows } = await postgres.query(sql, params);
            return rows.map((r: ExchangeRate) => ({
                ...r,
                currency_code: String(r.currency_code ?? '').trim().toUpperCase()
            }));
        } catch (error) {
            console.error('[ExchangeRateAPI] getHistory failed:', error);
            return [];
        }
    },

    async save(rate: Omit<ExchangeRate, 'id'>): Promise<ExchangeRate | null> {
        const code = String(rate.currency_code ?? '').trim().toUpperCase();
        try {
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const src = rate.source || 'manual';
                const existing = await postgrest.get<ExchangeRate[]>(
                    '/exchange_rates',
                    {
                        select: '*',
                        currency_code: `eq.${code}`,
                        date: `eq.${String(rate.date).trim().slice(0, 10)}`,
                        source: `eq.${src}`,
                        limit: 1,
                    },
                    { schema: 'public' }
                );
                const hit = Array.isArray(existing) ? existing[0] : null;
                if (hit?.id) {
                    const rows = await postgrest.patch<ExchangeRate[]>(
                        `/exchange_rates?id=eq.${encodeURIComponent(hit.id)}`,
                        { buy_rate: rate.buy_rate, sell_rate: rate.sell_rate },
                        { schema: 'public', prefer: 'return=representation' }
                    );
                    const row = Array.isArray(rows) ? rows[0] : (rows as unknown as ExchangeRate);
                    if (!row) return null;
                    return { ...row, currency_code: String(row.currency_code ?? '').trim().toUpperCase() };
                }
                const rows = await postgrest.post<ExchangeRate[]>(
                    '/exchange_rates',
                    {
                        currency_code: code,
                        date: String(rate.date).trim().slice(0, 10),
                        buy_rate: rate.buy_rate,
                        sell_rate: rate.sell_rate,
                        source: src,
                        is_active: rate.is_active ?? true,
                    },
                    { schema: 'public', prefer: 'return=representation' }
                );
                const row = Array.isArray(rows) ? rows[0] : (rows as unknown as ExchangeRate);
                if (!row) return null;
                return { ...row, currency_code: String(row.currency_code ?? '').trim().toUpperCase() };
            }
            const { rows } = await postgres.query(
                `INSERT INTO exchange_rates (currency_code, date, buy_rate, sell_rate, source, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (currency_code, date, source) 
                 DO UPDATE SET 
                    buy_rate = EXCLUDED.buy_rate,
                    sell_rate = EXCLUDED.sell_rate,
                    updated_at = CURRENT_TIMESTAMP
                 RETURNING *`,
                [code, rate.date, rate.buy_rate, rate.sell_rate, rate.source || 'manual', rate.is_active ?? true]
            );
            const row = rows[0] as ExchangeRate | undefined;
            if (!row) return null;
            return { ...row, currency_code: String(row.currency_code ?? '').trim().toUpperCase() };
        } catch (error) {
            console.error('[ExchangeRateAPI] save failed:', error);
            return null;
        }
    },

    async update(id: string, rate: Partial<ExchangeRate>): Promise<ExchangeRate | null> {
        try {
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const body: Record<string, unknown> = {};
                if (rate.buy_rate !== undefined) body.buy_rate = rate.buy_rate;
                if (rate.sell_rate !== undefined) body.sell_rate = rate.sell_rate;
                const rows = await postgrest.patch<ExchangeRate[]>(
                    `/exchange_rates?id=eq.${encodeURIComponent(id)}`,
                    body,
                    { schema: 'public', prefer: 'return=representation' }
                );
                return Array.isArray(rows) ? rows[0] : (rows as unknown as ExchangeRate);
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                await postgrest.delete(`/exchange_rates?id=eq.${encodeURIComponent(id)}`, { schema: 'public' });
                return true;
            }
            await postgres.query(`DELETE FROM exchange_rates WHERE id = $1`, [id]);
            return true;
        } catch (error) {
            console.error('[ExchangeRateAPI] delete failed:', error);
            return false;
        }
    }
};

/** Tarih bazlı çapraz kur: 1 docCurrency = ? ledgerCurrency (pivot tablosu, örn. IQD). */
export async function resolveDocumentCurrencyRateToLedger(
    documentCurrency: string,
    ledgerCurrency: string,
    as_of_date: string,
    rateType: string
): Promise<number | null> {
    const dc = documentCurrency.trim().toUpperCase();
    const lc = ledgerCurrency.trim().toUpperCase();
    if (!dc || !lc || dc === lc) return 1;
    const [rowDoc, rowLed] = await Promise.all([
        exchangeRateAPI.getRateAsOfDate(dc, as_of_date),
        exchangeRateAPI.getRateAsOfDate(lc, as_of_date),
    ]);
    const vD = rowDoc ? pickExchangeRateValue(rowDoc, rateType) : NaN;
    const vL = rowLed ? pickExchangeRateValue(rowLed, rateType) : NaN;
    const denom = Number.isFinite(vL) && vL > 0 ? vL : 1;
    if (!Number.isFinite(vD) || vD <= 0) return null;
    return vD / denom;
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
// CATEGORY API
// ============================================================================

export const categoryAPI = {
    async getAll(): Promise<Category[]> {
        try {
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const rows = await postgrest.get<Category[]>(
                    `/rex_${fn}_categories`,
                    { select: '*', is_active: 'eq.true', order: 'name.asc' },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const rows = await postgrest.get<Category[]>(
                    `/rex_${fn}_categories`,
                    { select: '*', is_active: 'eq.true', parent_id: 'is.null', order: 'name.asc' },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const rows = await postgrest.get<Category[]>(
                    `/rex_${fn}_categories`,
                    {
                        select: '*',
                        is_active: 'eq.true',
                        parent_id: `eq.${parentId}`,
                        order: 'name.asc',
                    },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const rows = await postgrest.get<Brand[]>(
                    `/rex_${fn}_brands`,
                    { select: '*', is_active: 'eq.true', order: 'name.asc' },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const rows = await postgrest.get<ProductGroup[]>(
                    '/product_groups',
                    { select: '*', is_active: 'eq.true', order: 'name.asc' },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const rows = await postgrest.get<Unit[]>(
                    `/rex_${fn}_units`,
                    { select: '*', is_active: 'eq.true', order: 'code.asc' },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const rows = await postgrest.get<TaxRate[]>(
                    `/rex_${fn}_tax_rates`,
                    { select: '*', is_active: 'eq.true', order: 'rate.asc' },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const rows = await postgrest.get<SpecialCode[]>(
                    `/rex_${fn}_special_codes`,
                    { select: '*', is_active: 'eq.true', order: 'name.asc' },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const rows = await postgrest.get<SpecialCode[]>(
                    `/rex_${fn}_special_codes`,
                    {
                        select: '*',
                        is_active: 'eq.true',
                        module_type: `eq.${type}`,
                        order: 'name.asc',
                    },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
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

