/**
 * Hizmet kartları — firma bazlı PostgreSQL tablosu `rex_{firm}_services`.
 * (Eski Supabase `services` tablosu yerine; yerel PG / köprü ile uyumlu.)
 */
import { postgres, ERP_SETTINGS } from './postgres';

export interface Service {
    id: string;
    code: string;
    name: string;
    description?: string;
    description_tr?: string;
    description_en?: string;
    description_ar?: string;
    description_ku?: string;
    category?: string;
    categoryId?: string;
    categoryCode?: string;
    brand?: string;
    model?: string;
    manufacturer?: string;
    supplier?: string;
    origin?: string;
    groupCode?: string;
    subGroupCode?: string;
    specialCode1?: string;
    specialCode2?: string;
    specialCode3?: string;
    specialCode4?: string;
    specialCode5?: string;
    specialCode6?: string;
    unit_price: number;
    unit_price_usd?: number;
    unit_price_eur?: number;
    purchase_price?: number;
    purchase_price_usd?: number;
    purchase_price_eur?: number;
    tax_rate: number;
    tax_type?: string;
    withholding_rate?: number;
    discount1?: number;
    discount2?: number;
    discount3?: number;
    unit: string;
    is_active: boolean;
    image_url?: string;
    priceList1?: number;
    priceList2?: number;
    priceList3?: number;
    priceList4?: number;
    priceList5?: number;
    priceList6?: number;
    created_at: string;
    updated_at: string;
}

export type CreateServiceInput = Omit<Service, 'id' | 'created_at' | 'updated_at'>;
export type UpdateServiceInput = Partial<CreateServiceInput>;

function tableName(): string {
    const fn = String(ERP_SETTINGS.firmNr ?? '001').trim().padStart(3, '0').slice(0, 10);
    return `rex_${fn}_services`;
}

function num(v: unknown, fallback = 0): number {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isNaN(n) ? fallback : n;
}

function mapRow(row: Record<string, unknown>): Service {
    return {
        id: String(row.id),
        code: String(row.code ?? ''),
        name: String(row.name ?? ''),
        description: row.description != null ? String(row.description) : undefined,
        description_tr: row.description_tr != null ? String(row.description_tr) : undefined,
        description_en: row.description_en != null ? String(row.description_en) : undefined,
        description_ar: row.description_ar != null ? String(row.description_ar) : undefined,
        description_ku: row.description_ku != null ? String(row.description_ku) : undefined,
        category: row.category != null ? String(row.category) : undefined,
        categoryId: row.category_id != null ? String(row.category_id) : undefined,
        categoryCode: row.category_code != null ? String(row.category_code) : undefined,
        brand: row.brand != null ? String(row.brand) : undefined,
        model: row.model != null ? String(row.model) : undefined,
        manufacturer: row.manufacturer != null ? String(row.manufacturer) : undefined,
        supplier: row.supplier != null ? String(row.supplier) : undefined,
        origin: row.origin != null ? String(row.origin) : undefined,
        groupCode: row.group_code != null ? String(row.group_code) : undefined,
        subGroupCode: row.sub_group_code != null ? String(row.sub_group_code) : undefined,
        specialCode1: row.special_code_1 != null ? String(row.special_code_1) : undefined,
        specialCode2: row.special_code_2 != null ? String(row.special_code_2) : undefined,
        specialCode3: row.special_code_3 != null ? String(row.special_code_3) : undefined,
        specialCode4: row.special_code_4 != null ? String(row.special_code_4) : undefined,
        specialCode5: row.special_code_5 != null ? String(row.special_code_5) : undefined,
        specialCode6: row.special_code_6 != null ? String(row.special_code_6) : undefined,
        unit_price: num(row.unit_price),
        unit_price_usd: row.unit_price_usd != null ? num(row.unit_price_usd) : undefined,
        unit_price_eur: row.unit_price_eur != null ? num(row.unit_price_eur) : undefined,
        purchase_price: row.purchase_price != null ? num(row.purchase_price) : undefined,
        purchase_price_usd: row.purchase_price_usd != null ? num(row.purchase_price_usd) : undefined,
        purchase_price_eur: row.purchase_price_eur != null ? num(row.purchase_price_eur) : undefined,
        tax_rate: num(row.tax_rate, 18),
        tax_type: row.tax_type != null ? String(row.tax_type) : undefined,
        withholding_rate: row.withholding_rate != null ? num(row.withholding_rate) : undefined,
        discount1: row.discount1 != null ? num(row.discount1) : undefined,
        discount2: row.discount2 != null ? num(row.discount2) : undefined,
        discount3: row.discount3 != null ? num(row.discount3) : undefined,
        unit: String(row.unit ?? 'Adet'),
        is_active: row.is_active !== false,
        image_url: row.image_url != null ? String(row.image_url) : undefined,
        priceList1: row.price_list_1 != null ? num(row.price_list_1) : undefined,
        priceList2: row.price_list_2 != null ? num(row.price_list_2) : undefined,
        priceList3: row.price_list_3 != null ? num(row.price_list_3) : undefined,
        priceList4: row.price_list_4 != null ? num(row.price_list_4) : undefined,
        priceList5: row.price_list_5 != null ? num(row.price_list_5) : undefined,
        priceList6: row.price_list_6 != null ? num(row.price_list_6) : undefined,
        created_at: row.created_at != null ? String(row.created_at) : '',
        updated_at: row.updated_at != null ? String(row.updated_at) : '',
    };
}

/** Form / API camelCase → DB snake_case */
function inputToDbRow(input: Record<string, unknown>, firmNr: string): Record<string, unknown> {
    const i = input as Record<string, unknown>;
    const g = (camel: string, snake: string) => {
        const v = i[camel] !== undefined ? i[camel] : i[snake];
        return v;
    };
    return {
        firm_nr: firmNr,
        code: g('code', 'code'),
        name: g('name', 'name'),
        description: g('description', 'description') ?? null,
        description_tr: g('description_tr', 'description_tr') ?? null,
        description_en: g('description_en', 'description_en') ?? null,
        description_ar: g('description_ar', 'description_ar') ?? null,
        description_ku: g('description_ku', 'description_ku') ?? null,
        category: g('category', 'category') ?? null,
        category_id: g('categoryId', 'category_id') ?? null,
        category_code: g('categoryCode', 'category_code') ?? null,
        brand: g('brand', 'brand') ?? null,
        model: g('model', 'model') ?? null,
        manufacturer: g('manufacturer', 'manufacturer') ?? null,
        supplier: g('supplier', 'supplier') ?? null,
        origin: g('origin', 'origin') ?? null,
        group_code: g('groupCode', 'group_code') ?? null,
        sub_group_code: g('subGroupCode', 'sub_group_code') ?? null,
        special_code_1: g('specialCode1', 'special_code_1') ?? null,
        special_code_2: g('specialCode2', 'special_code_2') ?? null,
        special_code_3: g('specialCode3', 'special_code_3') ?? null,
        special_code_4: g('specialCode4', 'special_code_4') ?? null,
        special_code_5: g('specialCode5', 'special_code_5') ?? null,
        special_code_6: g('specialCode6', 'special_code_6') ?? null,
        unit: g('unit', 'unit') ?? 'Adet',
        unit_price: num(g('unit_price', 'unit_price'), 0),
        unit_price_usd: i.unit_price_usd !== undefined ? num(i.unit_price_usd) : null,
        unit_price_eur: i.unit_price_eur !== undefined ? num(i.unit_price_eur) : null,
        purchase_price: i.purchase_price !== undefined ? num(i.purchase_price) : null,
        purchase_price_usd: i.purchase_price_usd !== undefined ? num(i.purchase_price_usd) : null,
        purchase_price_eur: i.purchase_price_eur !== undefined ? num(i.purchase_price_eur) : null,
        tax_rate: num(g('tax_rate', 'tax_rate'), 18),
        tax_type: g('tax_type', 'tax_type') ?? null,
        withholding_rate: i.withholding_rate !== undefined ? num(i.withholding_rate) : null,
        discount1: i.discount1 !== undefined ? num(i.discount1) : null,
        discount2: i.discount2 !== undefined ? num(i.discount2) : null,
        discount3: i.discount3 !== undefined ? num(i.discount3) : null,
        image_url: g('image_url', 'image_url') ?? null,
        price_list_1: i.priceList1 !== undefined ? num(i.priceList1) : null,
        price_list_2: i.priceList2 !== undefined ? num(i.priceList2) : null,
        price_list_3: i.priceList3 !== undefined ? num(i.priceList3) : null,
        price_list_4: i.priceList4 !== undefined ? num(i.priceList4) : null,
        price_list_5: i.priceList5 !== undefined ? num(i.priceList5) : null,
        price_list_6: i.priceList6 !== undefined ? num(i.priceList6) : null,
        is_active: i.is_active !== undefined ? Boolean(i.is_active) : true,
    };
}

function patchToDbRow(patch: UpdateServiceInput): Record<string, unknown> {
    const i = patch as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const set = (key: string, val: unknown) => {
        if (val !== undefined) out[key] = val;
    };
    set('code', i.code);
    set('name', i.name);
    set('description', i.description ?? undefined);
    set('description_tr', i.description_tr ?? undefined);
    set('description_en', i.description_en ?? undefined);
    set('description_ar', i.description_ar ?? undefined);
    set('description_ku', i.description_ku ?? undefined);
    set('category', i.category ?? undefined);
    set('category_id', i.categoryId ?? undefined);
    set('category_code', i.categoryCode ?? undefined);
    set('brand', i.brand ?? undefined);
    set('model', i.model ?? undefined);
    set('manufacturer', i.manufacturer ?? undefined);
    set('supplier', i.supplier ?? undefined);
    set('origin', i.origin ?? undefined);
    set('group_code', i.groupCode ?? undefined);
    set('sub_group_code', i.subGroupCode ?? undefined);
    set('special_code_1', i.specialCode1 ?? undefined);
    set('special_code_2', i.specialCode2 ?? undefined);
    set('special_code_3', i.specialCode3 ?? undefined);
    set('special_code_4', i.specialCode4 ?? undefined);
    set('special_code_5', i.specialCode5 ?? undefined);
    set('special_code_6', i.specialCode6 ?? undefined);
    set('unit', i.unit ?? undefined);
    if (i.unit_price !== undefined) out.unit_price = num(i.unit_price);
    if (i.unit_price_usd !== undefined) out.unit_price_usd = num(i.unit_price_usd);
    if (i.unit_price_eur !== undefined) out.unit_price_eur = num(i.unit_price_eur);
    if (i.purchase_price !== undefined) out.purchase_price = num(i.purchase_price);
    if (i.purchase_price_usd !== undefined) out.purchase_price_usd = num(i.purchase_price_usd);
    if (i.purchase_price_eur !== undefined) out.purchase_price_eur = num(i.purchase_price_eur);
    if (i.tax_rate !== undefined) out.tax_rate = num(i.tax_rate);
    set('tax_type', i.tax_type ?? undefined);
    if (i.withholding_rate !== undefined) out.withholding_rate = num(i.withholding_rate);
    if (i.discount1 !== undefined) out.discount1 = num(i.discount1);
    if (i.discount2 !== undefined) out.discount2 = num(i.discount2);
    if (i.discount3 !== undefined) out.discount3 = num(i.discount3);
    set('image_url', i.image_url ?? undefined);
    if (i.priceList1 !== undefined) out.price_list_1 = num(i.priceList1);
    if (i.priceList2 !== undefined) out.price_list_2 = num(i.priceList2);
    if (i.priceList3 !== undefined) out.price_list_3 = num(i.priceList3);
    if (i.priceList4 !== undefined) out.price_list_4 = num(i.priceList4);
    if (i.priceList5 !== undefined) out.price_list_5 = num(i.priceList5);
    if (i.priceList6 !== undefined) out.price_list_6 = num(i.priceList6);
    if (i.is_active !== undefined) out.is_active = i.is_active;
    return out;
}

class ServiceAPI {
    async getAll(): Promise<Service[]> {
        const { rows } = await postgres.query(
            `SELECT * FROM ${tableName()} WHERE firm_nr = $1 ORDER BY created_at DESC`,
            [ERP_SETTINGS.firmNr]
        );
        return (rows as Record<string, unknown>[]).map(mapRow);
    }

    async getActive(): Promise<Service[]> {
        const { rows } = await postgres.query(
            `SELECT * FROM ${tableName()} WHERE firm_nr = $1 AND is_active = true ORDER BY name ASC`,
            [ERP_SETTINGS.firmNr]
        );
        return (rows as Record<string, unknown>[]).map(mapRow);
    }

    async getById(id: string): Promise<Service | null> {
        const { rows } = await postgres.query(
            `SELECT * FROM ${tableName()} WHERE id = $1 AND firm_nr = $2 LIMIT 1`,
            [id, ERP_SETTINGS.firmNr]
        );
        const r = rows[0] as Record<string, unknown> | undefined;
        return r ? mapRow(r) : null;
    }

    async getByCode(code: string): Promise<Service | null> {
        if (!code?.trim()) return null;
        const { rows } = await postgres.query(
            `SELECT * FROM ${tableName()} WHERE firm_nr = $1 AND code = $2 LIMIT 1`,
            [ERP_SETTINGS.firmNr, code.trim()]
        );
        const r = rows[0] as Record<string, unknown> | undefined;
        return r ? mapRow(r) : null;
    }

    async create(service: CreateServiceInput): Promise<Service> {
        const row = inputToDbRow(service as Record<string, unknown>, ERP_SETTINGS.firmNr);
        const entries = Object.entries(row).filter(([, v]) => v !== undefined);
        const cols = entries.map(([k]) => k);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const values = entries.map(([, v]) => v);
        const { rows } = await postgres.query(
            `INSERT INTO ${tableName()} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
            values
        );
        return mapRow(rows[0] as Record<string, unknown>);
    }

    async update(id: string, updates: UpdateServiceInput): Promise<Service> {
        const patch = patchToDbRow(updates);
        if (Object.keys(patch).length === 0) {
            const existing = await this.getById(id);
            if (!existing) throw new Error('Service not found');
            return existing;
        }
        patch.updated_at = new Date().toISOString();
        const keys = Object.keys(patch);
        const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        const values = keys.map((k) => patch[k]);
        const { rows } = await postgres.query(
            `UPDATE ${tableName()} SET ${setClause} WHERE id = $${keys.length + 1} AND firm_nr = $${keys.length + 2} RETURNING *`,
            [...values, id, ERP_SETTINGS.firmNr]
        );
        if (!rows[0]) throw new Error('Service not found');
        return mapRow(rows[0] as Record<string, unknown>);
    }

    async delete(id: string): Promise<void> {
        await postgres.query(
            `DELETE FROM ${tableName()} WHERE id = $1 AND firm_nr = $2`,
            [id, ERP_SETTINGS.firmNr]
        );
    }

    async toggleActive(id: string): Promise<Service> {
        const service = await this.getById(id);
        if (!service) throw new Error('Service not found');
        return this.update(id, { is_active: !service.is_active });
    }

    async search(query: string): Promise<Service[]> {
        const q = `%${String(query)}%`;
        const { rows } = await postgres.query(
            `SELECT * FROM ${tableName()} WHERE firm_nr = $1
             AND (code ILIKE $2 OR name ILIKE $2 OR COALESCE(category,'') ILIKE $2)
             ORDER BY name ASC`,
            [ERP_SETTINGS.firmNr, q]
        );
        return (rows as Record<string, unknown>[]).map(mapRow);
    }
}

export const serviceAPI = new ServiceAPI();
