/**
 * Bank Payment Plans API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';

function padBankPayFirmNr(): string {
    return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

// ============================================================================
// TYPES
// ============================================================================

export interface BankPaymentPlanLine {
    id?: string;
    plan_id?: string;
    installment_count: number;
    commission_rate: number;
    delay_days: number;
    is_active?: boolean;
}

export interface BankPaymentPlan {
    id: string;
    code: string;
    name: string;
    bank_name: string;
    card_brand?: string;
    is_active: boolean;
    lines?: BankPaymentPlanLine[];
    created_at?: string;
    updated_at?: string;
}

// ============================================================================
// API
// ============================================================================

export const bankPaymentPlansAPI = {
    /**
     * Get all bank payment plans
     */
    async getAll(): Promise<BankPaymentPlan[]> {
        try {
            if (DB_SETTINGS.connectionProvider === 'rest_api') {
                const { postgrest } = await import('./postgrestClient');
                const fn = padBankPayFirmNr();
                const rows = await postgrest.get<any[]>(
                    `/rex_${fn}_bank_pay_plans`,
                    { select: '*', is_active: 'eq.true', order: 'code.asc' },
                    { schema: 'public' }
                );
                return Array.isArray(rows) ? rows : [];
            }
            const table = this.getTableName();
            const { rows } = await postgres.query(
                `SELECT * FROM ${table} WHERE is_active = true ORDER BY code ASC`
            );
            return rows;
        } catch (error) {
            console.error('[BankPaymentPlansAPI] getAll failed:', error);
            return [];
        }
    },

    /**
     * Get detailed bank payment plan with its lines
     */
    async getById(id: string): Promise<BankPaymentPlan | null> {
        try {
            if (DB_SETTINGS.connectionProvider === 'rest_api') {
                const { postgrest } = await import('./postgrestClient');
                const fn = padBankPayFirmNr();
                const plans = await postgrest.get<any[]>(
                    `/rex_${fn}_bank_pay_plans`,
                    { select: '*', id: `eq.${id}`, limit: 1 },
                    { schema: 'public' }
                );
                const plan = Array.isArray(plans) ? plans[0] : null;
                if (!plan) return null;
                const lineRows = await postgrest
                    .get<any[]>(
                        `/rex_${fn}_bank_pay_plan_lines`,
                        { select: '*', plan_id: `eq.${id}`, order: 'installment_count.asc' },
                        { schema: 'public' }
                    )
                    .catch(() => [] as any[]);
                return {
                    ...plan,
                    lines: Array.isArray(lineRows) ? lineRows : [],
                };
            }
            const table = this.getTableName();
            const linesTable = this.getLinesTableName();

            const { rows: planRows } = await postgres.query(
                `SELECT * FROM ${table} WHERE id = $1`,
                [id]
            );

            if (planRows.length === 0) return null;

            const plan = planRows[0];
            const { rows: lineRows } = await postgres.query(
                `SELECT * FROM ${linesTable} WHERE plan_id = $1 ORDER BY installment_count ASC`,
                [id]
            );

            return {
                ...plan,
                lines: lineRows
            };
        } catch (error) {
            console.error('[BankPaymentPlansAPI] getById failed:', error);
            return null;
        }
    },

    /**
     * Create a new bank payment plan
     */
    async create(plan: Partial<BankPaymentPlan>): Promise<BankPaymentPlan | null> {
        const id = crypto.randomUUID();
        const table = this.getTableName();
        const linesTable = this.getLinesTableName();

        try {
            if (DB_SETTINGS.connectionProvider === 'rest_api') {
                const { postgrest } = await import('./postgrestClient');
                const fn = padBankPayFirmNr();
                const body: Record<string, unknown> = {
                    id,
                    code: plan.code,
                    name: plan.name,
                    bank_name: plan.bank_name,
                    card_brand: plan.card_brand ?? null,
                    is_active: plan.is_active ?? true,
                };
                await postgrest.post(`/rex_${fn}_bank_pay_plans`, body, {
                    schema: 'public',
                    prefer: 'return=minimal',
                });
                if (plan.lines && plan.lines.length > 0) {
                    try {
                        for (const line of plan.lines) {
                            await postgrest.post(
                                `/rex_${fn}_bank_pay_plan_lines`,
                                {
                                    id: crypto.randomUUID(),
                                    plan_id: id,
                                    installment_count: line.installment_count,
                                    commission_rate: line.commission_rate,
                                    delay_days: line.delay_days,
                                    is_active: true,
                                },
                                { schema: 'public', prefer: 'return=minimal' }
                            );
                        }
                    } catch (lineErr) {
                        await postgrest
                            .delete(`/rex_${fn}_bank_pay_plan_lines?plan_id=eq.${encodeURIComponent(id)}`, {
                                schema: 'public',
                                prefer: 'return=minimal',
                            })
                            .catch(() => { });
                        await postgrest
                            .delete(`/rex_${fn}_bank_pay_plans?id=eq.${encodeURIComponent(id)}`, {
                                schema: 'public',
                                prefer: 'return=minimal',
                            })
                            .catch(() => { });
                        throw lineErr;
                    }
                }
                return this.getById(id);
            }
            // Start transaction
            await postgres.query('BEGIN');

            const { rows } = await postgres.query(
                `INSERT INTO ${table} (id, code, name, bank_name, card_brand, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [id, plan.code, plan.name, plan.bank_name, plan.card_brand, plan.is_active ?? true]
            );

            const newPlan = rows[0];

            if (plan.lines && plan.lines.length > 0) {
                for (const line of plan.lines) {
                    await postgres.query(
                        `INSERT INTO ${linesTable} (id, plan_id, installment_count, commission_rate, delay_days, is_active)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [crypto.randomUUID(), id, line.installment_count, line.commission_rate, line.delay_days, true]
                    );
                }
            }

            await postgres.query('COMMIT');
            return this.getById(id);
        } catch (error) {
            if (DB_SETTINGS.connectionProvider !== 'rest_api') {
                try {
                    await postgres.query('ROLLBACK');
                } catch {
                    /* */
                }
            }
            console.error('[BankPaymentPlansAPI] create failed:', error);
            return null;
        }
    },

    /**
     * Update an existing bank payment plan
     */
    async update(id: string, plan: Partial<BankPaymentPlan>): Promise<BankPaymentPlan | null> {
        const table = this.getTableName();
        const linesTable = this.getLinesTableName();

        try {
            if (DB_SETTINGS.connectionProvider === 'rest_api') {
                const { postgrest } = await import('./postgrestClient');
                const fn = padBankPayFirmNr();
                const patchBody: Record<string, unknown> = {};
                if (plan.code !== undefined) patchBody.code = plan.code;
                if (plan.name !== undefined) patchBody.name = plan.name;
                if (plan.bank_name !== undefined) patchBody.bank_name = plan.bank_name;
                if (plan.card_brand !== undefined) patchBody.card_brand = plan.card_brand;
                if (plan.is_active !== undefined) patchBody.is_active = plan.is_active;
                if (Object.keys(patchBody).length > 0) {
                    await postgrest.patch(
                        `/rex_${fn}_bank_pay_plans?id=eq.${encodeURIComponent(id)}`,
                        patchBody,
                        { schema: 'public', prefer: 'return=minimal' }
                    );
                }
                if (plan.lines) {
                    await postgrest
                        .delete(`/rex_${fn}_bank_pay_plan_lines?plan_id=eq.${encodeURIComponent(id)}`, {
                            schema: 'public',
                            prefer: 'return=minimal',
                        })
                        .catch(() => { });
                    for (const line of plan.lines) {
                        await postgrest.post(
                            `/rex_${fn}_bank_pay_plan_lines`,
                            {
                                id: line.id || crypto.randomUUID(),
                                plan_id: id,
                                installment_count: line.installment_count,
                                commission_rate: line.commission_rate,
                                delay_days: line.delay_days,
                                is_active: true,
                            },
                            { schema: 'public', prefer: 'return=minimal' }
                        );
                    }
                }
                return this.getById(id);
            }
            await postgres.query('BEGIN');

            // Update header
            await postgres.query(
                `UPDATE ${table} 
                 SET code = $1, name = $2, bank_name = $3, card_brand = $4, is_active = $5, updated_at = NOW()
                 WHERE id = $6`,
                [plan.code, plan.name, plan.bank_name, plan.card_brand, plan.is_active, id]
            );

            // Update lines: delete and re-insert is often simpler for these simple structures
            await postgres.query(`DELETE FROM ${linesTable} WHERE plan_id = $1`, [id]);

            if (plan.lines && plan.lines.length > 0) {
                for (const line of plan.lines) {
                    await postgres.query(
                        `INSERT INTO ${linesTable} (id, plan_id, installment_count, commission_rate, delay_days, is_active)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [line.id || crypto.randomUUID(), id, line.installment_count, line.commission_rate, line.delay_days, true]
                    );
                }
            }

            await postgres.query('COMMIT');
            return this.getById(id);
        } catch (error) {
            if (DB_SETTINGS.connectionProvider !== 'rest_api') {
                try {
                    await postgres.query('ROLLBACK');
                } catch {
                    /* */
                }
            }
            console.error('[BankPaymentPlansAPI] update failed:', error);
            return null;
        }
    },

    /**
     * Delete a bank payment plan
     */
    async delete(id: string): Promise<boolean> {
        const table = this.getTableName();
        try {
            if (DB_SETTINGS.connectionProvider === 'rest_api') {
                const { postgrest } = await import('./postgrestClient');
                const fn = padBankPayFirmNr();
                await postgrest
                    .delete(`/rex_${fn}_bank_pay_plan_lines?plan_id=eq.${encodeURIComponent(id)}`, {
                        schema: 'public',
                        prefer: 'return=minimal',
                    })
                    .catch(() => { });
                await postgrest.delete(`/rex_${fn}_bank_pay_plans?id=eq.${encodeURIComponent(id)}`, {
                    schema: 'public',
                    prefer: 'return=minimal',
                });
                return true;
            }
            await postgres.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
            return true;
        } catch (error) {
            console.error('[BankPaymentPlansAPI] delete failed:', error);
            return false;
        }
    },

    /**
     * Helper to get active table name based on firm
     */
    getTableName(): string {
        const firmId = ERP_SETTINGS.firmNr;
        if (!firmId) return 'logic.bank_pay_plans';
        return `public.rex_${firmId}_bank_pay_plans`;
    },

    /**
     * Helper to get active lines table name based on firm
     */
    getLinesTableName(): string {
        const firmId = ERP_SETTINGS.firmNr;
        if (!firmId) return 'logic.bank_pay_plan_lines';
        return `public.rex_${firmId}_bank_pay_plan_lines`;
    }
};

