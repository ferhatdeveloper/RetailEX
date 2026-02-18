import { postgres } from '../postgres';

export interface PickWave {
    id: string;
    wave_no: string;
    status: 'pending' | 'picking' | 'completed' | 'cancelled';
    picker_id?: string;
    order_count: number;
    total_items: number;
    created_at: string;
}

export interface PickTask {
    id: string;
    wave_id: string;
    product_id: string;
    product_name: string;
    location_code: string;
    quantity: number;
    picked_quantity: number;
    status: 'pending' | 'completed';
}

class PickingService {
    /**
     * Creates a new pick wave from a list of orders
     */
    async createWave(orderIds: string[]): Promise<string> {
        const waveNo = `PW-${Date.now()}`;

        // 1. Create wave header
        const { rows: waves } = await postgres.query(
            'INSERT INTO wms_pick_waves (wave_no, status, order_count) VALUES ($1, $2, $3) RETURNING id',
            [waveNo, 'pending', orderIds.length]
        );
        const waveId = waves[0].id;

        // 2. Consolidate items from all orders into picking tasks
        // In a real system, we'd pull these from the sales_orders/invoice tables
        // For now, we perform an aggregation query to show the "Engine" logic
        await postgres.query(`
            INSERT INTO wms_pick_tasks (wave_id, product_id, quantity, location_code)
            SELECT 
                $1, 
                product_id, 
                SUM(quantity),
                'LOC-' || (floor(random() * 100) + 1)::text -- Mock location assignment
            FROM sales_order_items -- Generic table name for logic
            WHERE order_id = ANY($2)
            GROUP BY product_id
        `, [waveId, orderIds]);

        return waveId;
    }

    /**
     * Gets optimized picking path for a wave
     * Sorts tasks by location code to minimize travel distance
     */
    async getOptimizedTasks(waveId: string): Promise<PickTask[]> {
        const { rows } = await postgres.query(`
            SELECT 
                t.*, p.name as product_name
            FROM wms_pick_tasks t
            JOIN products p ON t.product_id = p.id
            WHERE t.wave_id = $1
            ORDER BY t.location_code ASC -- Simple S-Shape path optimization logic
        `, [waveId]);

        return rows;
    }

    /**
     * Records a pick action
     */
    async recordPick(taskId: string, quantity: number): Promise<void> {
        await postgres.query(
            'UPDATE wms_pick_tasks SET picked_quantity = picked_quantity + $1, status = CASE WHEN (picked_quantity + $1) >= quantity THEN \'completed\' ELSE \'pending\' END WHERE id = $2',
            [quantity, taskId]
        );
    }
}

export const pickingService = new PickingService();
