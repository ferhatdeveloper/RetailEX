/**
 * Karkas parçalama API — kasap: 1 karkas → N parça + fire maliyet dağıtımı
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';

function padFirmNr(): string {
    return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function firmTablePrefix(): string {
    return `rex_${padFirmNr()}`;
}

function isRestApi(): boolean {
    return DB_SETTINGS.connectionProvider === 'rest_api';
}

export type AnimalType = 'cattle' | 'sheep';

export interface DisassemblyTemplateOutput {
    id?: string;
    productId: string;
    productName?: string;
    sortOrder: number;
    standardRatioPercent?: number | null;
}

export interface DisassemblyTemplate {
    id?: string;
    name: string;
    animalType: AnimalType;
    inputProductId?: string | null;
    inputProductName?: string;
    description?: string;
    isActive: boolean;
    outputs: DisassemblyTemplateOutput[];
}

export interface DisassemblyOrderOutput {
    id?: string;
    productId: string;
    productName?: string;
    outputKg: number;
    unitCost: number;
    totalCost: number;
    costSharePercent: number;
    sortOrder?: number;
}

export interface DisassemblyOrder {
    id?: string;
    orderNo: string;
    templateId?: string | null;
    templateName?: string;
    animalType: AnimalType;
    inputProductId: string;
    inputProductName?: string;
    inputQtyKg: number;
    inputUnitCost: number;
    inputTotalCost: number;
    outputQtyKg: number;
    wasteQtyKg: number;
    wasteCostAllocated: number;
    costPerKgSalable: number;
    status: 'draft' | 'completed' | 'cancelled';
    note?: string;
    completedAt?: string;
    createdAt?: string;
    outputs: DisassemblyOrderOutput[];
}

async function productNameMap(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return map;
    const px = firmTablePrefix();
    if (isRestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const inList = unique.map((id) => encodeURIComponent(id)).join(',');
        const rows = await postgrest.get<any[]>(
            `/${px}_products`,
            { select: 'id,name', id: `in.(${inList})` },
            { schema: 'public' },
        );
        (Array.isArray(rows) ? rows : []).forEach((p) => map.set(p.id, p.name));
        return map;
    }
    const inPh = unique.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await postgres.query(
        `SELECT id, name FROM ${px}_products WHERE id IN (${inPh})`,
        unique,
    );
    rows.forEach((p: { id: string; name: string }) => map.set(p.id, p.name));
    return map;
}

function mapTemplate(row: any, outputs: any[], names: Map<string, string>): DisassemblyTemplate {
    return {
        id: row.id,
        name: row.name,
        animalType: (row.animal_type || 'cattle') as AnimalType,
        inputProductId: row.input_product_id ?? null,
        inputProductName: row.input_product_id ? names.get(row.input_product_id) : undefined,
        description: row.description ?? undefined,
        isActive: row.is_active !== false,
        outputs: outputs.map((o) => ({
            id: o.id,
            productId: o.product_id,
            productName: names.get(o.product_id),
            sortOrder: Number(o.sort_order ?? 0),
            standardRatioPercent: o.standard_ratio_percent != null ? Number(o.standard_ratio_percent) : null,
        })),
    };
}

function mapOrder(row: any, outputs: any[], names: Map<string, string>): DisassemblyOrder {
    return {
        id: row.id,
        orderNo: row.order_no,
        templateId: row.template_id ?? null,
        templateName: row.template_name,
        animalType: (row.animal_type || 'cattle') as AnimalType,
        inputProductId: row.input_product_id,
        inputProductName: names.get(row.input_product_id),
        inputQtyKg: Number(row.input_qty_kg ?? 0),
        inputUnitCost: Number(row.input_unit_cost ?? 0),
        inputTotalCost: Number(row.input_total_cost ?? 0),
        outputQtyKg: Number(row.output_qty_kg ?? 0),
        wasteQtyKg: Number(row.waste_qty_kg ?? 0),
        wasteCostAllocated: Number(row.waste_cost_allocated ?? 0),
        costPerKgSalable: Number(row.cost_per_kg_salable ?? 0),
        status: row.status,
        note: row.note ?? undefined,
        completedAt: row.completed_at ?? undefined,
        createdAt: row.created_at ?? undefined,
        outputs: outputs.map((o, idx) => ({
            id: o.id,
            productId: o.product_id,
            productName: names.get(o.product_id),
            outputKg: Number(o.output_kg ?? 0),
            unitCost: Number(o.unit_cost ?? 0),
            totalCost: Number(o.total_cost ?? 0),
            costSharePercent: Number(o.cost_share_percent ?? 0),
            sortOrder: Number(o.sort_order ?? idx),
        })),
    };
}

export const disassemblyAPI = {
    async getTemplates(): Promise<DisassemblyTemplate[]> {
        const px = firmTablePrefix();
        try {
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const rows = await postgrest.get<any[]>(
                    `/${px}_disassembly_templates`,
                    { select: '*', is_active: 'eq.true', order: 'name.asc' },
                    { schema: 'public' },
                );
                const list = Array.isArray(rows) ? rows : [];
                if (!list.length) return [];
                const tids = list.map((r) => r.id);
                const inList = tids.map((id) => encodeURIComponent(id)).join(',');
                const outs = await postgrest.get<any[]>(
                    `/${px}_disassembly_template_outputs`,
                    { select: '*', template_id: `in.(${inList})`, order: 'sort_order.asc' },
                    { schema: 'public' },
                );
                const byTpl = new Map<string, any[]>();
                (Array.isArray(outs) ? outs : []).forEach((o) => {
                    if (!byTpl.has(o.template_id)) byTpl.set(o.template_id, []);
                    byTpl.get(o.template_id)!.push(o);
                });
                const pids = [
                    ...list.map((r) => r.input_product_id).filter(Boolean),
                    ...(Array.isArray(outs) ? outs : []).map((o) => o.product_id),
                ] as string[];
                const names = await productNameMap(pids);
                return list.map((r) => mapTemplate(r, byTpl.get(r.id) || [], names));
            }
            const { rows } = await postgres.query(
                `SELECT t.*,
                        COALESCE(json_agg(to_jsonb(o) ORDER BY o.sort_order)
                          FILTER (WHERE o.id IS NOT NULL), '[]') AS outputs
                 FROM ${px}_disassembly_templates t
                 LEFT JOIN ${px}_disassembly_template_outputs o ON o.template_id = t.id
                 WHERE t.is_active = true
                 GROUP BY t.id
                 ORDER BY t.name ASC`,
            );
            const pids = rows.flatMap((r: any) => [
                r.input_product_id,
                ...(Array.isArray(r.outputs) ? r.outputs.map((o: any) => o.product_id) : []),
            ].filter(Boolean));
            const names = await productNameMap(pids);
            return rows.map((r: any) => mapTemplate(r, r.outputs || [], names));
        } catch (e) {
            console.error('[disassemblyAPI] getTemplates failed:', e);
            return [];
        }
    },

    async saveTemplate(template: DisassemblyTemplate): Promise<string> {
        const px = firmTablePrefix();
        const firmNr = padFirmNr();
        let templateId = template.id;

        if (isRestApi()) {
            const { postgrest } = await import('./postgrestClient');
            if (templateId) {
                await postgrest.patch(
                    `/${px}_disassembly_templates?id=eq.${encodeURIComponent(templateId)}`,
                    {
                        name: template.name,
                        animal_type: template.animalType,
                        input_product_id: template.inputProductId ?? null,
                        description: template.description ?? null,
                    },
                    { schema: 'public', prefer: 'return=minimal' },
                );
                await postgrest.delete(
                    `/${px}_disassembly_template_outputs?template_id=eq.${encodeURIComponent(templateId)}`,
                    { schema: 'public', prefer: 'return=minimal' },
                );
            } else {
                const created = await postgrest.post<any[]>(
                    `/${px}_disassembly_templates`,
                    {
                        firm_nr: firmNr,
                        name: template.name,
                        animal_type: template.animalType,
                        input_product_id: template.inputProductId ?? null,
                        description: template.description ?? null,
                    },
                    { schema: 'public', prefer: 'return=representation' },
                );
                templateId = (Array.isArray(created) ? created[0] : created)?.id;
            }
            if (!templateId) throw new Error('Şablon kaydedilemedi');
            for (const out of template.outputs) {
                await postgrest.post(
                    `/${px}_disassembly_template_outputs`,
                    {
                        template_id: templateId,
                        product_id: out.productId,
                        sort_order: out.sortOrder,
                        standard_ratio_percent: out.standardRatioPercent ?? null,
                    },
                    { schema: 'public', prefer: 'return=minimal' },
                );
            }
            return templateId;
        }

        if (templateId) {
            await postgres.query(
                `UPDATE ${px}_disassembly_templates
                 SET name=$2, animal_type=$3, input_product_id=$4, description=$5, updated_at=NOW()
                 WHERE id=$1`,
                [templateId, template.name, template.animalType, template.inputProductId ?? null, template.description ?? null],
            );
            await postgres.query(`DELETE FROM ${px}_disassembly_template_outputs WHERE template_id=$1`, [templateId]);
        } else {
            const { rows } = await postgres.query(
                `INSERT INTO ${px}_disassembly_templates (firm_nr, name, animal_type, input_product_id, description)
                 VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                [firmNr, template.name, template.animalType, template.inputProductId ?? null, template.description ?? null],
            );
            templateId = rows[0].id;
        }
        for (const out of template.outputs) {
            await postgres.query(
                `INSERT INTO ${px}_disassembly_template_outputs (template_id, product_id, sort_order, standard_ratio_percent)
                 VALUES ($1,$2,$3,$4)`,
                [templateId, out.productId, out.sortOrder, out.standardRatioPercent ?? null],
            );
        }
        return templateId!;
    },

    async getOrders(limit = 50): Promise<DisassemblyOrder[]> {
        const px = firmTablePrefix();
        try {
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const rows = await postgrest.get<any[]>(
                    `/${px}_disassembly_orders`,
                    { select: '*', order: 'created_at.desc', limit: String(limit) },
                    { schema: 'public' },
                );
                const list = Array.isArray(rows) ? rows : [];
                if (!list.length) return [];
                const oids = list.map((r) => r.id);
                const inList = oids.map((id) => encodeURIComponent(id)).join(',');
                const outs = await postgrest.get<any[]>(
                    `/${px}_disassembly_order_outputs`,
                    { select: '*', order_id: `in.(${inList})`, order: 'sort_order.asc' },
                    { schema: 'public' },
                );
                const byOrder = new Map<string, any[]>();
                (Array.isArray(outs) ? outs : []).forEach((o) => {
                    if (!byOrder.has(o.order_id)) byOrder.set(o.order_id, []);
                    byOrder.get(o.order_id)!.push(o);
                });
                const pids = [
                    ...list.map((r) => r.input_product_id),
                    ...(Array.isArray(outs) ? outs : []).map((o) => o.product_id),
                ].filter(Boolean) as string[];
                const names = await productNameMap(pids);
                return list.map((r) => mapOrder(r, byOrder.get(r.id) || [], names));
            }
            const { rows } = await postgres.query(
                `SELECT o.*,
                        COALESCE(json_agg(to_jsonb(ol) ORDER BY ol.sort_order)
                          FILTER (WHERE ol.id IS NOT NULL), '[]') AS outputs
                 FROM ${px}_disassembly_orders o
                 LEFT JOIN ${px}_disassembly_order_outputs ol ON ol.order_id = o.id
                 GROUP BY o.id
                 ORDER BY o.created_at DESC
                 LIMIT $1`,
                [limit],
            );
            const pids = rows.flatMap((r: any) => [
                r.input_product_id,
                ...(Array.isArray(r.outputs) ? r.outputs.map((o: any) => o.product_id) : []),
            ].filter(Boolean));
            const names = await productNameMap(pids);
            return rows.map((r: any) => mapOrder(r, r.outputs || [], names));
        } catch (e) {
            console.error('[disassemblyAPI] getOrders failed:', e);
            return [];
        }
    },

    async saveOrder(order: Partial<DisassemblyOrder> & { outputs?: DisassemblyOrderOutput[] }): Promise<string> {
        const px = firmTablePrefix();
        const firmNr = padFirmNr();

        if (order.id && order.status === 'completed') {
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                await postgrest.patch(
                    `/${px}_disassembly_orders?id=eq.${encodeURIComponent(order.id)}`,
                    { status: 'completed', completed_at: new Date().toISOString() },
                    { schema: 'public', prefer: 'return=minimal' },
                );
            } else {
                await postgres.query(
                    `UPDATE ${px}_disassembly_orders SET status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=$1`,
                    [order.id],
                );
            }
            return order.id;
        }

        if (order.id) {
            return order.id;
        }

        const orderNo = `KP-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
        const body = {
            firm_nr: firmNr,
            order_no: orderNo,
            template_id: order.templateId ?? null,
            animal_type: order.animalType ?? 'cattle',
            input_product_id: order.inputProductId,
            input_qty_kg: order.inputQtyKg,
            input_unit_cost: order.inputUnitCost,
            input_total_cost: order.inputTotalCost,
            output_qty_kg: order.outputQtyKg,
            waste_qty_kg: order.wasteQtyKg,
            waste_cost_allocated: order.wasteCostAllocated,
            cost_per_kg_salable: order.costPerKgSalable,
            status: order.status ?? 'completed',
            note: order.note ?? null,
            completed_at: order.status === 'completed' ? new Date().toISOString() : null,
        };

        let orderId: string;
        if (isRestApi()) {
            const { postgrest } = await import('./postgrestClient');
            const created = await postgrest.post<any[]>(
                `/${px}_disassembly_orders`,
                body,
                { schema: 'public', prefer: 'return=representation' },
            );
            orderId = (Array.isArray(created) ? created[0] : created)?.id;
        } else {
            const { rows } = await postgres.query(
                `INSERT INTO ${px}_disassembly_orders
                 (firm_nr, order_no, template_id, animal_type, input_product_id,
                  input_qty_kg, input_unit_cost, input_total_cost, output_qty_kg,
                  waste_qty_kg, waste_cost_allocated, cost_per_kg_salable, status, note, completed_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                 RETURNING id`,
                [
                    body.firm_nr, body.order_no, body.template_id, body.animal_type, body.input_product_id,
                    body.input_qty_kg, body.input_unit_cost, body.input_total_cost, body.output_qty_kg,
                    body.waste_qty_kg, body.waste_cost_allocated, body.cost_per_kg_salable,
                    body.status, body.note, body.completed_at,
                ],
            );
            orderId = rows[0].id;
        }
        if (!orderId) throw new Error('Parçalama kaydı oluşturulamadı');

        const outputs = order.outputs ?? [];
        for (let i = 0; i < outputs.length; i++) {
            const line = outputs[i];
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                await postgrest.post(
                    `/${px}_disassembly_order_outputs`,
                    {
                        order_id: orderId,
                        product_id: line.productId,
                        output_kg: line.outputKg,
                        unit_cost: line.unitCost,
                        total_cost: line.totalCost,
                        cost_share_percent: line.costSharePercent,
                        sort_order: line.sortOrder ?? i,
                    },
                    { schema: 'public', prefer: 'return=minimal' },
                );
            } else {
                await postgres.query(
                    `INSERT INTO ${px}_disassembly_order_outputs
                     (order_id, product_id, output_kg, unit_cost, total_cost, cost_share_percent, sort_order)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [orderId, line.productId, line.outputKg, line.unitCost, line.totalCost, line.costSharePercent, line.sortOrder ?? i],
                );
            }
        }
        return orderId;
    },
};
