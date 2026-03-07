import { PostgresConnection, ERP_SETTINGS } from './postgres';

export interface YardLocation {
    id: string;
    firm_nr: string;
    code: string;
    type: 'parking' | 'loading_dock' | 'waiting_area' | 'gate';
    status: 'available' | 'occupied' | 'maintenance' | 'closed';
    vehicle_plate?: string;
    driver_name?: string;
    entry_time?: string;
    exit_time?: string;
    warehouse_id?: string;
    notes?: string;
}

export interface LaborStat {
    id: string;
    firm_nr: string;
    user_id: string;
    username?: string;
    task_type: string;
    start_time: string;
    end_time: string;
    duration_min?: number;
    items_processed: number;
    lines_processed?: number;
    efficiency_rate: number;
}

export interface SlottingRecommendation {
    id: string;
    firm_nr: string;
    product_id: string;
    product_name?: string;
    product_code?: string;
    current_location: string;
    recommended_location: string;
    reason: string;
    velocity_class: 'A' | 'B' | 'C';
    is_applied: boolean;
}

export class WMSAdvancedService {
    private static connection = PostgresConnection.getInstance();

    private static firmNr(): string {
        return ERP_SETTINGS.firmNr || '001';
    }

    // -------------------------------------------------------------------------
    // YARD LOCATIONS
    // -------------------------------------------------------------------------

    static async getYardLocations(): Promise<YardLocation[]> {
        const { rows } = await this.connection.query(
            `SELECT * FROM wms.yard_locations
             WHERE firm_nr = $1
             ORDER BY code`,
            [this.firmNr()]
        );
        return rows as YardLocation[];
    }

    static async updateYardStatus(id: string, data: Partial<YardLocation>): Promise<void> {
        await this.connection.query(
            `UPDATE wms.yard_locations
             SET status       = $2,
                 vehicle_plate = $3,
                 driver_name  = $4,
                 entry_time   = $5,
                 exit_time    = $6,
                 notes        = $7,
                 updated_at   = CURRENT_TIMESTAMP
             WHERE id = $1 AND firm_nr = $8`,
            [id, data.status, data.vehicle_plate,
             data.driver_name, data.entry_time, data.exit_time,
             data.notes, this.firmNr()]
        );
    }

    static async createYardLocation(data: Omit<YardLocation, 'id' | 'firm_nr'>): Promise<YardLocation> {
        const { rows } = await this.connection.query(
            `INSERT INTO wms.yard_locations
                (firm_nr, code, type, status, warehouse_id, notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [this.firmNr(), data.code, data.type ?? 'parking',
             data.status ?? 'available', data.warehouse_id ?? null, data.notes ?? null]
        );
        return rows[0] as YardLocation;
    }

    // -------------------------------------------------------------------------
    // LABOR PRODUCTIVITY
    // -------------------------------------------------------------------------

    static async getLaborStats(): Promise<LaborStat[]> {
        const sql = `
            SELECT l.*,
                   COALESCE(l.username, u.raw_user_meta_data->>'full_name') AS user_name
            FROM wms.labor_productivity l
            LEFT JOIN auth.users u ON l.user_id = u.id
            WHERE l.firm_nr = $1
            ORDER BY l.start_time DESC
            LIMIT 50
        `;
        const { rows } = await this.connection.query(sql, [this.firmNr()]);
        return rows as LaborStat[];
    }

    static async logLaborActivity(data: {
        user_id: string;
        username?: string;
        task_type: string;
        reference_id?: string;
        items_processed?: number;
        warehouse_id?: string;
    }): Promise<void> {
        await this.connection.query(
            `INSERT INTO wms.labor_productivity
                (firm_nr, user_id, username, task_type, reference_id,
                 start_time, items_processed, warehouse_id)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)`,
            [this.firmNr(), data.user_id, data.username ?? null,
             data.task_type, data.reference_id ?? null,
             data.items_processed ?? 0, data.warehouse_id ?? null]
        );
    }

    static async closeLaborActivity(laborId: string, itemsProcessed: number, efficiencyRate?: number): Promise<void> {
        await this.connection.query(
            `UPDATE wms.labor_productivity
             SET end_time        = CURRENT_TIMESTAMP,
                 items_processed = $2,
                 efficiency_rate = $3
             WHERE id = $1 AND firm_nr = $4`,
            [laborId, itemsProcessed, efficiencyRate ?? null, this.firmNr()]
        );
    }

    // -------------------------------------------------------------------------
    // SLOTTING RECOMMENDATIONS
    // -------------------------------------------------------------------------

    /**
     * Get open slotting recommendations for the current firm.
     * Product name is stored denormalized (product_name column) to avoid
     * a cross-firm JOIN — the auto-prefix rewrite only works for the
     * currently active firm, which may differ from the recommendation's firm.
     */
    static async getSlottingRecommendations(): Promise<SlottingRecommendation[]> {
        const { rows } = await this.connection.query(
            `SELECT r.*
             FROM wms.slotting_recommendations r
             WHERE r.firm_nr = $1
               AND r.is_applied = false
             ORDER BY r.velocity_class ASC`,
            [this.firmNr()]
        );
        return rows as SlottingRecommendation[];
    }

    /**
     * Create a slotting recommendation.
     * Looks up the product name from the current firm's products table and
     * stores it denormalized so future reads don't need a cross-firm JOIN.
     */
    static async createSlottingRecommendation(data: {
        product_id: string;
        product_code?: string;
        current_location: string;
        recommended_location: string;
        reason: string;
        velocity_class: 'A' | 'B' | 'C';
        daily_picks?: number;
        distance_saved_m?: number;
    }): Promise<void> {
        // Look up product name (auto-rewrite → rex_{firmNr}_products)
        const { rows: pRows } = await this.connection.query(
            `SELECT name, code FROM products WHERE id = $1 LIMIT 1`,
            [data.product_id]
        );
        const productName: string = pRows[0]?.name ?? null;
        const productCode: string = data.product_code ?? pRows[0]?.code ?? null;

        await this.connection.query(
            `INSERT INTO wms.slotting_recommendations
                (firm_nr, product_id, product_code, product_name,
                 current_location, recommended_location, reason,
                 velocity_class, daily_picks, distance_saved_m)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT DO NOTHING`,
            [this.firmNr(), data.product_id, productCode, productName,
             data.current_location, data.recommended_location, data.reason,
             data.velocity_class, data.daily_picks ?? 0, data.distance_saved_m ?? null]
        );
    }

    static async applySlottingRecommendation(id: string, appliedBy: string): Promise<void> {
        await this.connection.query(
            `UPDATE wms.slotting_recommendations
             SET is_applied = true,
                 applied_at = CURRENT_TIMESTAMP,
                 applied_by = $2
             WHERE id = $1 AND firm_nr = $3`,
            [id, appliedBy, this.firmNr()]
        );
    }

    // -------------------------------------------------------------------------
    // PICK WAVES
    // -------------------------------------------------------------------------

    static async getPickWaves(status?: string): Promise<any[]> {
        let sql = `
            SELECT pw.*, s.name AS warehouse_name
            FROM wms.pick_waves pw
            LEFT JOIN public.stores s ON pw.warehouse_id = s.id
            WHERE pw.firm_nr = $1
        `;
        const params: any[] = [this.firmNr()];
        if (status) { sql += ` AND pw.status = $2`; params.push(status); }
        sql += ` ORDER BY pw.priority ASC, pw.created_at DESC`;
        const { rows } = await this.connection.query(sql, params);
        return rows;
    }

    static async createPickWave(data: {
        wave_no: string;
        warehouse_id?: string;
        priority?: number;
        wave_type?: string;
        due_date?: string;
        notes?: string;
        created_by?: string;
    }): Promise<any> {
        const { rows } = await this.connection.query(
            `INSERT INTO wms.pick_waves
                (firm_nr, wave_no, warehouse_id, status, priority, wave_type,
                 due_date, notes, created_by)
             VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8)
             RETURNING *`,
            [this.firmNr(), data.wave_no, data.warehouse_id ?? null,
             data.priority ?? 5, data.wave_type ?? 'standard',
             data.due_date ?? null, data.notes ?? null, data.created_by ?? null]
        );
        return rows[0];
    }

    // -------------------------------------------------------------------------
    // TASK QUEUE
    // -------------------------------------------------------------------------

    static async getPendingTasks(taskType?: string): Promise<any[]> {
        let sql = `
            SELECT tq.*, s.name AS warehouse_name
            FROM wms.task_queue tq
            LEFT JOIN public.stores s ON tq.warehouse_id = s.id
            WHERE tq.firm_nr = $1
              AND tq.status IN ('pending', 'assigned', 'in_progress')
        `;
        const params: any[] = [this.firmNr()];
        if (taskType) { sql += ` AND tq.task_type = $2`; params.push(taskType); }
        sql += ` ORDER BY tq.priority ASC, tq.created_at ASC`;
        const { rows } = await this.connection.query(sql, params);
        return rows;
    }

    static async createTask(data: {
        task_type: string;
        reference_id?: string;
        reference_no?: string;
        priority?: number;
        warehouse_id?: string;
        bin_location?: string;
        product_code?: string;
        quantity?: number;
        notes?: string;
    }): Promise<any> {
        const { rows } = await this.connection.query(
            `INSERT INTO wms.task_queue
                (firm_nr, task_type, reference_id, reference_no, priority, status,
                 warehouse_id, bin_location, product_code, quantity, notes)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10)
             RETURNING *`,
            [this.firmNr(), data.task_type, data.reference_id ?? null,
             data.reference_no ?? null, data.priority ?? 5,
             data.warehouse_id ?? null, data.bin_location ?? null,
             data.product_code ?? null, data.quantity ?? 0, data.notes ?? null]
        );
        return rows[0];
    }

    static async assignTask(taskId: string, assignedTo: string): Promise<void> {
        await this.connection.query(
            `UPDATE wms.task_queue
             SET status = 'assigned', assigned_to = $2, assigned_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND firm_nr = $3`,
            [taskId, assignedTo, this.firmNr()]
        );
    }

    static async completeTask(taskId: string): Promise<void> {
        await this.connection.query(
            `UPDATE wms.task_queue
             SET status = 'completed', completed_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND firm_nr = $2`,
            [taskId, this.firmNr()]
        );
    }
}

