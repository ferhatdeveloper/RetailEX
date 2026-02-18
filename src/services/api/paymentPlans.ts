/**
 * Payment Plans API - Direct PostgreSQL Implementation
 */

import { postgres } from '../postgres';

export interface PaymentPlanLine {
    id?: string;
    plan_id?: string;
    line_no: number;
    day_offset: number;
    percent: number;
    amount?: number;
    payment_type: string;
}

export interface PaymentPlan {
    id?: string;
    firm_nr: string;
    code: string;
    name: string;
    description?: string;
    is_active: boolean;
    lines?: PaymentPlanLine[];
    created_at?: string;
    updated_at?: string;
}

export const paymentPlansAPI = {
    /**
     * Get all payment plans for a firm
     */
    async getAll(firmNr: string): Promise<PaymentPlan[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM logic.pay_plans WHERE firm_nr = $1 AND is_active = true ORDER BY code ASC`,
                [firmNr]
            );
            return rows;
        } catch (error) {
            console.error('[PaymentPlansAPI] getAll failed:', error);
            return [];
        }
    },

    /**
     * Get a specific payment plan with its lines
     */
    async getById(id: string): Promise<PaymentPlan | null> {
        try {
            const planResult = await postgres.query(
                `SELECT * FROM logic.pay_plans WHERE id = $1`,
                [id]
            );

            if (planResult.rows.length === 0) return null;

            const plan = planResult.rows[0];

            const linesResult = await postgres.query(
                `SELECT * FROM logic.pay_plan_lines WHERE plan_id = $1 ORDER BY line_no ASC`,
                [id]
            );

            plan.lines = linesResult.rows;
            return plan;
        } catch (error) {
            console.error('[PaymentPlansAPI] getById failed:', error);
            return null;
        }
    },

    /**
     * Create a new payment plan
     */
    async create(plan: PaymentPlan): Promise<PaymentPlan | null> {
        try {
            // Start transaction
            await postgres.query('BEGIN');

            const planResult = await postgres.query(
                `INSERT INTO logic.pay_plans (firm_nr, code, name, description, is_active)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [plan.firm_nr, plan.code, plan.name, plan.description, plan.is_active || true]
            );

            const newPlan = planResult.rows[0];

            if (plan.lines && plan.lines.length > 0) {
                for (let i = 0; i < plan.lines.length; i++) {
                    const line = plan.lines[i];
                    await postgres.query(
                        `INSERT INTO logic.pay_plan_lines (plan_id, line_no, day_offset, percent, amount, payment_type)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [newPlan.id, i + 1, line.day_offset, line.percent, line.amount || null, line.payment_type || 'cash']
                    );
                }
            }

            await postgres.query('COMMIT');
            return await this.getById(newPlan.id);
        } catch (error) {
            await postgres.query('ROLLBACK');
            console.error('[PaymentPlansAPI] create failed:', error);
            return null;
        }
    },

    /**
     * Update an existing payment plan
     */
    async update(id: string, plan: Partial<PaymentPlan>): Promise<PaymentPlan | null> {
        try {
            await postgres.query('BEGIN');

            // Update header
            const updateFields: string[] = [];
            const values: any[] = [];
            let placeholderIdx = 1;

            if (plan.code !== undefined) {
                updateFields.push(`code = $${placeholderIdx++}`);
                values.push(plan.code);
            }
            if (plan.name !== undefined) {
                updateFields.push(`name = $${placeholderIdx++}`);
                values.push(plan.name);
            }
            if (plan.description !== undefined) {
                updateFields.push(`description = $${placeholderIdx++}`);
                values.push(plan.description);
            }
            if (plan.is_active !== undefined) {
                updateFields.push(`is_active = $${placeholderIdx++}`);
                values.push(plan.is_active);
            }

            updateFields.push(`updated_at = NOW()`);
            values.push(id); // For the WHERE clause

            if (updateFields.length > 1) { // More than just updated_at
                await postgres.query(
                    `UPDATE logic.pay_plans SET ${updateFields.join(', ')} WHERE id = $${placeholderIdx}`,
                    values
                );
            }

            // Sync lines if provided
            if (plan.lines) {
                // Delete old lines
                await postgres.query(`DELETE FROM logic.pay_plan_lines WHERE plan_id = $1`, [id]);

                // Insert new lines
                for (let i = 0; i < plan.lines.length; i++) {
                    const line = plan.lines[i];
                    await postgres.query(
                        `INSERT INTO logic.pay_plan_lines (id, plan_id, line_no, day_offset, percent, amount, payment_type)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [line.id || crypto.randomUUID(), id, i + 1, line.day_offset, line.percent, line.amount || null, line.payment_type || 'cash']
                    );
                }
            }

            await postgres.query('COMMIT');
            return await this.getById(id);
        } catch (error) {
            await postgres.query('ROLLBACK');
            console.error('[PaymentPlansAPI] update failed:', error);
            return null;
        }
    },

    /**
     * Delete a payment plan
     */
    async delete(id: string): Promise<boolean> {
        try {
            await postgres.query(`DELETE FROM logic.pay_plans WHERE id = $1`, [id]);
            return true;
        } catch (error) {
            console.error('[PaymentPlansAPI] delete failed:', error);
            return false;
        }
    }
};
