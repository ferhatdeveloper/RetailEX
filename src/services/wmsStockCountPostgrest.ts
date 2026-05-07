/**
 * WMS sayım fişleri — PostgREST (connection_provider=rest_api) yolu.
 * pg_bridge ham SQL zaman aşımına düşmesin diye counting_slips / counting_lines buradan yürür.
 */

import { postgrest } from './api/postgrestClient';
import { ERP_SETTINGS } from './postgres';

const WMS = { schema: 'wms' as const };
const PUB = { schema: 'public' as const };

export function wmsFirmNrPadded(): string {
    return String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
}

function productsTable(): string {
    return `rex_${wmsFirmNrPadded()}_products`;
}

function productBarcodesTable(): string {
    return `rex_${wmsFirmNrPadded()}_product_barcodes`;
}

export async function restGenerateFicheNo(): Promise<string> {
    const firm = wmsFirmNrPadded();
    const year = new Date().getFullYear();
    const prefix = `SAY-${year}-`;
    const rows = await postgrest.get<Array<{ fiche_no: string }>>(
        '/counting_slips',
        {
            firm_nr: `eq.${firm}`,
            fiche_no: `like.${prefix}*`,
            select: 'fiche_no',
            order: 'fiche_no.desc',
            limit: 1,
        },
        WMS
    );
    let next = 1;
    const list = Array.isArray(rows) ? rows : [];
    if (list[0]?.fiche_no) {
        const m = String(list[0].fiche_no).match(new RegExp(`^SAY-${year}-(\\d+)$`));
        if (m) next = parseInt(m[1], 10) + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
}

export async function restGetSlips(status?: string): Promise<any[]> {
    const firm = wmsFirmNrPadded();
    const q: Record<string, string | number> = {
        firm_nr: `eq.${firm}`,
        select: '*',
        order: 'created_at.desc',
    };
    if (status) q.status = `eq.${status}`;
    const slips = await postgrest.get<any[]>('/counting_slips', q, WMS);
    const slipList = Array.isArray(slips) ? slips : [];
    if (slipList.length === 0) return [];

    const ids = slipList.map((s) => s.id).filter(Boolean);
    const inList = ids.map((id) => String(id)).join(',');
    let lineRows: Array<{ slip_id: string; id: string }> = [];
    try {
        lineRows = await postgrest.get<Array<{ slip_id: string; id: string }>>(
            '/counting_lines',
            {
                slip_id: `in.(${inList})`,
                select: 'slip_id,id',
            },
            WMS
        );
    } catch {
        lineRows = [];
    }
    const lineArr = Array.isArray(lineRows) ? lineRows : [];
    const countBySlip: Record<string, number> = {};
    for (const l of lineArr) {
        const sid = String(l.slip_id);
        countBySlip[sid] = (countBySlip[sid] || 0) + 1;
    }

    const storeRows = await postgrest.get<Array<{ id: string; name: string }>>(
        '/stores',
        { select: 'id,name', is_active: 'eq.true', limit: 5000 },
        PUB
    );
    const storeMap: Record<string, string> = {};
    for (const s of Array.isArray(storeRows) ? storeRows : []) {
        storeMap[String(s.id)] = String(s.name ?? '');
    }

    return slipList.map((r) => ({
        ...r,
        store_name: storeMap[String(r.store_id)] || undefined,
        line_count: countBySlip[String(r.id)] || 0,
    }));
}

export async function restGetSlipWithLines(slipId: string): Promise<{ slip: any; lines: any[] }> {
    const slipRows = await postgrest.get<any[]>(
        '/counting_slips',
        { id: `eq.${slipId}`, select: '*', limit: 1 },
        WMS
    );
    const slip = Array.isArray(slipRows) ? slipRows[0] : undefined;
    const lineRows = await postgrest.get<any[]>(
        '/counting_lines',
        {
            slip_id: `eq.${slipId}`,
            select: '*',
            order: 'counted_at.desc.nullslast,id.asc',
        },
        WMS
    );
    const lines = Array.isArray(lineRows) ? lineRows : [];
    if (slip?.store_id) {
        try {
            const sr = await postgrest.get<any[]>(
                '/stores',
                { id: `eq.${slip.store_id}`, select: 'name', limit: 1 },
                PUB
            );
            const s0 = Array.isArray(sr) ? sr[0] : undefined;
            if (s0?.name) slip.store_name = s0.name;
        } catch {
            /* ignore */
        }
    }
    return { slip, lines };
}

export async function restCreateSlip(data: {
    store_id: string;
    count_type: 'full' | 'cycle' | 'location';
    location_code?: string;
    description?: string;
    created_by?: string;
}): Promise<any> {
    const firm = wmsFirmNrPadded();
    const ficheNo = await restGenerateFicheNo();
    const today = new Date().toISOString().slice(0, 10);
    const body: Record<string, unknown> = {
        firm_nr: firm,
        store_id: data.store_id,
        fiche_no: ficheNo,
        count_type: data.count_type,
        location_code: data.location_code ?? null,
        description: data.description ?? null,
        status: 'draft',
        created_by: data.created_by ?? null,
        date: today,
    };
    const created = await postgrest.post<any[]>(
        '/counting_slips',
        body,
        { ...WMS, prefer: 'return=representation' }
    );
    const row = Array.isArray(created) ? created[0] : created;
    if (!row) throw new Error('INSERT returned no rows - check wms schema');
    return row;
}

export async function restUpdateSlipStatus(slipId: string, status: string): Promise<void> {
    await postgrest.patch(
        `/counting_slips?id=eq.${encodeURIComponent(slipId)}`,
        { status },
        { ...WMS, prefer: 'return=minimal' }
    );
}

export async function restCompleteReconciliation(slipId: string): Promise<void> {
    await postgrest.patch(
        `/counting_slips?id=eq.${encodeURIComponent(slipId)}`,
        { status: 'completed', completed_at: new Date().toISOString() },
        { ...WMS, prefer: 'return=minimal' }
    );
}

export async function restCancelSlip(slipId: string): Promise<void> {
    await restUpdateSlipStatus(slipId, 'cancelled');
}

export async function restGetLineByBarcode(slipId: string, barcode: string): Promise<any | null> {
    const rows = await postgrest.get<any[]>(
        '/counting_lines',
        {
            slip_id: `eq.${slipId}`,
            barcode: `eq.${barcode}`,
            select: '*',
            limit: 1,
        },
        WMS
    );
    const list = Array.isArray(rows) ? rows : [];
    return list[0] || null;
}

export async function restUpsertLine(
    slipId: string,
    data: {
        product_id?: string;
        barcode?: string;
        product_name?: string;
        location_code?: string;
        expected_qty?: number;
        counted_qty: number;
        counted_by?: string;
        notes?: string;
        unit?: string;
        unit_multiplier?: number;
        base_counted_qty?: number;
    }
): Promise<any> {
    const firm = wmsFirmNrPadded();
    const unitMultiplier = data.unit_multiplier || 1;
    const baseCounted = data.base_counted_qty ?? data.counted_qty * unitMultiplier;

    let existing: any | null = null;
    if (data.barcode) {
        existing = await restGetLineByBarcode(slipId, data.barcode);
    } else if (data.product_id) {
        const rows = await postgrest.get<any[]>(
            '/counting_lines',
            {
                slip_id: `eq.${slipId}`,
                product_id: `eq.${data.product_id}`,
                select: '*',
                limit: 1,
            },
            WMS
        );
        existing = (Array.isArray(rows) ? rows : [])[0] || null;
    }

    if (existing?.id) {
        const patch = {
            counted_qty: data.counted_qty,
            variance: data.counted_qty - (Number(existing.expected_qty) || 0),
            counted_by: data.counted_by ?? null,
            counted_at: new Date().toISOString(),
            location_code: data.location_code ?? existing.location_code ?? null,
            notes: data.notes ?? existing.notes ?? null,
            unit: data.unit ?? existing.unit ?? 'Adet',
            unit_multiplier: unitMultiplier,
            base_counted_qty: baseCounted,
        };
        const updated = await postgrest.patch<any[]>(
            `/counting_lines?id=eq.${encodeURIComponent(String(existing.id))}`,
            patch,
            { ...WMS, prefer: 'return=representation' }
        );
        const u = Array.isArray(updated) ? updated[0] : updated;
        if (!u) throw new Error('Sayım satırı güncellenemedi');
        return u;
    }

    const variance = data.counted_qty - (data.expected_qty || 0);
    const insertBody: Record<string, unknown> = {
        slip_id: slipId,
        firm_nr: firm,
        product_id: data.product_id ?? null,
        barcode: data.barcode ?? null,
        product_name: data.product_name ?? null,
        location_code: data.location_code ?? null,
        expected_qty: data.expected_qty || 0,
        counted_qty: data.counted_qty,
        variance,
        counted_by: data.counted_by ?? null,
        counted_at: new Date().toISOString(),
        notes: data.notes ?? null,
        unit: data.unit || 'Adet',
        unit_multiplier: unitMultiplier,
        base_counted_qty: baseCounted,
    };
    const ins = await postgrest.post<any[]>(
        '/counting_lines',
        insertBody,
        { ...WMS, prefer: 'return=representation' }
    );
    const row = Array.isArray(ins) ? ins[0] : ins;
    if (!row) throw new Error('Sayım satırı eklenemedi');
    return row;
}

export async function restDeleteLine(lineId: string): Promise<void> {
    await postgrest.delete(`/counting_lines?id=eq.${encodeURIComponent(lineId)}`, {
        ...WMS,
        prefer: 'return=minimal',
    });
}

export async function restGetVarianceSummary(slipId: string): Promise<{
    total_items: number;
    items_with_variance: number;
    total_variance: number;
    accuracy_rate: number;
    shortage_qty: number;
    surplus_qty: number;
    shortage_sale_value: number;
    shortage_purchase_value: number;
    surplus_purchase_value: number;
    net_profit_impact: number;
}> {
    const lineRows = await postgrest.get<any[]>(
        '/counting_lines',
        { slip_id: `eq.${slipId}`, select: '*', limit: 100000 },
        WMS
    );
    const lines = (Array.isArray(lineRows) ? lineRows : []).filter((l) => l.counted_qty != null);
    let items_with_variance = 0;
    let total_variance = 0;
    let shortage_qty = 0;
    let surplus_qty = 0;
    for (const l of lines) {
        const v = Number(l.variance) || 0;
        if (Math.abs(v) > 0) {
            items_with_variance++;
            total_variance += Math.abs(v);
            if (v < 0) shortage_qty += Math.abs(v);
            if (v > 0) surplus_qty += v;
        }
    }
    const total_items = lines.length;
    const accuracyRate = total_items > 0 ? ((total_items - items_with_variance) / total_items) * 100 : 100;
    return {
        total_items,
        items_with_variance,
        total_variance,
        accuracy_rate: Math.round(accuracyRate * 10) / 10,
        shortage_qty,
        surplus_qty,
        shortage_sale_value: 0,
        shortage_purchase_value: 0,
        surplus_purchase_value: 0,
        net_profit_impact: 0,
    };
}

export async function restGetProductStock(productId: string): Promise<number> {
    try {
        const table = productsTable();
        const rows = await postgrest.get<Array<{ stock?: number }>>(
            `/${table}`,
            { id: `eq.${productId}`, select: 'stock', limit: 1 },
            PUB
        );
        const r = Array.isArray(rows) ? rows[0] : undefined;
        return Number(r?.stock) || 0;
    } catch {
        return 0;
    }
}

export async function restGetLinesPrices(
    productIds: string[]
): Promise<Record<string, { purchase: number; sale: number }>> {
    const ids = productIds.filter(Boolean);
    if (!ids.length) return {};
    const table = productsTable();
    const inList = ids.map((id) => encodeURIComponent(id)).join(',');
    try {
        const rows = await postgrest.get<any[]>(
            `/${table}`,
            { id: `in.(${inList})`, select: 'id,price_list_1,price,purchase_price' },
            PUB
        );
        const out: Record<string, { purchase: number; sale: number }> = {};
        for (const r of Array.isArray(rows) ? rows : []) {
            const id = String(r.id);
            const sale = Number(r.price_list_1 ?? r.price ?? 0) || 0;
            const purchase = Number(r.purchase_price ?? 0) || 0;
            out[id] = { purchase, sale };
        }
        return out;
    } catch {
        return {};
    }
}

/** Barkod ile ürün arama (PostgREST) — basit yol: doğrudan kod/barkod eşleşmesi + product_barcodes */
export async function restUpdateLineProduct(lineId: string, productId: string, productName: string): Promise<void> {
    await postgrest.patch(
        `/counting_lines?id=eq.${encodeURIComponent(lineId)}`,
        { product_id: productId, product_name: productName },
        { ...WMS, prefer: 'return=minimal' }
    );
}

export async function restCreateProductFromBarcode(data: {
    name: string;
    code: string;
    barcode: string;
    purchase_price?: number;
    sale_price?: number;
}): Promise<string | null> {
    const firm = wmsFirmNrPadded();
    const table = productsTable();
    const trunc = (s: string, n: number) => String(s ?? '').slice(0, n);
    const full: Record<string, unknown> = {
        name: trunc(data.name, 255) || 'Ürün',
        code: trunc(data.code, 100),
        barcode: trunc(data.barcode, 100),
        firm_nr: firm,
        is_active: true,
        purchase_price: data.purchase_price ?? 0,
        price_list_1: data.sale_price ?? 0,
    };
    try {
        const rows = await postgrest.post<any[]>(`/${table}`, full, {
            ...PUB,
            prefer: 'return=representation',
        });
        const r = Array.isArray(rows) ? rows[0] : rows;
        return r?.id != null ? String(r.id) : null;
    } catch {
        try {
            const rows = await postgrest.post<any[]>(
                `/${table}`,
                {
                    name: full.name,
                    code: full.code,
                    barcode: full.barcode,
                    firm_nr: firm,
                    is_active: true,
                },
                { ...PUB, prefer: 'return=representation' }
            );
            const r = Array.isArray(rows) ? rows[0] : rows;
            return r?.id != null ? String(r.id) : null;
        } catch {
            return null;
        }
    }
}

/** Stokları ürün kartına yazar ve fişi tamamlar. `stock_movements` hareketleri yalnızca Tauri/pg SQL yolunda oluşturulur. */
export async function restApplyStockCount(slipId: string): Promise<{
    processed: number;
    surplus: number;
    shortage: number;
}> {
    const { slip, lines } = await restGetSlipWithLines(slipId);
    if (!slip) throw new Error('Sayım fişi bulunamadı');
    const relevant = lines.filter((l: any) => l.product_id != null && l.counted_qty != null);
    if (!relevant.length) {
        await restCompleteReconciliation(slipId);
        return { processed: 0, surplus: 0, shortage: 0 };
    }
    const table = productsTable();
    for (const line of relevant) {
        const newStock = line.base_counted_qty ?? line.counted_qty;
        await postgrest.patch(
            `/${table}?id=eq.${encodeURIComponent(String(line.product_id))}`,
            { stock: newStock },
            { ...PUB, prefer: 'return=minimal' }
        );
    }
    await restCompleteReconciliation(slipId);
    let surplus = 0;
    let shortage = 0;
    for (const line of relevant) {
        const b = Number(line.base_counted_qty ?? line.counted_qty);
        const e = Number(line.expected_qty) || 0;
        if (b > e) surplus++;
        if (b < e) shortage++;
    }
    return { processed: relevant.length, surplus, shortage };
}

export async function restLookupProductByBarcode(barcode: string): Promise<{
    id: string;
    name: string;
    code: string;
    barcode?: string;
    stock: number;
    unit?: string;
    unit_multiplier?: number;
    matched_by: 'barcode' | 'unit_barcode';
} | null> {
    const table = productsTable();
    let p: any | undefined;
    for (const col of ['barcode', 'code'] as const) {
        try {
            const rows = await postgrest.get<any[]>(
                `/${table}`,
                {
                    [col]: `eq.${barcode}`,
                    is_active: 'eq.true',
                    select: 'id,name,code,barcode,unitset_id',
                    limit: 1,
                },
                PUB
            );
            p = Array.isArray(rows) ? rows[0] : undefined;
            if (p) break;
        } catch {
            /* try next */
        }
    }
    if (p) {
        const stock = await restGetProductStock(String(p.id));
        return {
            id: String(p.id),
            name: String(p.name ?? ''),
            code: String(p.code ?? ''),
            barcode: p.barcode ? String(p.barcode) : undefined,
            stock,
            unit: 'Adet',
            unit_multiplier: 1,
            matched_by: 'barcode',
        };
    }

    try {
        const pbRows = await postgrest.get<any[]>(
            `/${productBarcodesTable()}`,
            { barcode_code: `eq.${barcode}`, select: 'product_id,barcode_code,unit', limit: 1 },
            PUB
        );
        const pb = Array.isArray(pbRows) ? pbRows[0] : undefined;
        if (!pb?.product_id) return null;
        const pRows = await postgrest.get<any[]>(
            `/${table}`,
            { id: `eq.${String(pb.product_id)}`, select: 'id,name,code,barcode,unitset_id', limit: 1 },
            PUB
        );
        const prod = Array.isArray(pRows) ? pRows[0] : undefined;
        if (!prod) return null;
        const stock = await restGetProductStock(String(prod.id));
        const unitName = String(pb.unit || 'Birim');
        return {
            id: String(prod.id),
            name: String(prod.name ?? ''),
            code: String(prod.code ?? ''),
            barcode,
            stock,
            unit: unitName,
            unit_multiplier: 1,
            matched_by: 'unit_barcode',
        };
    } catch {
        return null;
    }
}
