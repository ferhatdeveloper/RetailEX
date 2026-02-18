import { postgres } from '../postgres';

export interface PredictionResult {
    product_id: string;
    product_name: string;
    current_stock: number;
    avg_daily_sales: number;
    predicted_sales_30d: number;
    stock_out_days: number | null; // Days until stock runs out
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    suggested_order_qty: number;
}

class AIPredictionService {
    /**
     * Calculates stock predictions for all products based on historical sales
     */
    async getStockPredictions(): Promise<PredictionResult[]> {
        // In a real system, we'd use complex SQL windows or a Python microservice
        // Here we implement the logic using local PostgreSQL data

        const { rows } = await postgres.query(`
            WITH sales_history AS (
                -- Get daily sales for the last 90 days
                SELECT 
                    product_id,
                    SUM(quantity) as total_qty,
                    COUNT(DISTINCT DATE(created_at)) as sales_days
                FROM sale_items
                WHERE created_at >= NOW() - INTERVAL '90 days'
                GROUP BY product_id
            )
            SELECT 
                p.id as product_id,
                p.name as product_name,
                p.stock as current_stock,
                COALESCE(sh.total_qty / 90.0, 0) as daily_avg,
                p.min_stock
            FROM products p
            LEFT JOIN sales_history sh ON p.id = sh.product_id
            WHERE p.is_active = true
        `);

        return rows.map(r => {
            const dailyAvg = parseFloat(r.daily_avg) || 0;
            const currentStock = parseFloat(r.current_stock) || 0;
            const predictedSales30d = dailyAvg * 30;

            let stockOutDays: number | null = null;
            if (dailyAvg > 0) {
                stockOutDays = Math.floor(currentStock / dailyAvg);
            }

            let riskLevel: PredictionResult['risk_level'] = 'low';
            if (stockOutDays !== null) {
                if (stockOutDays <= 3) riskLevel = 'critical';
                else if (stockOutDays <= 7) riskLevel = 'high';
                else if (stockOutDays <= 15) riskLevel = 'medium';
            } else if (currentStock === 0) {
                riskLevel = 'critical';
            }

            // Suggested order: 30 days of sales + safety stock (min_stock)
            const suggestedOrderQty = Math.max(0, (predictedSales30d + (parseFloat(r.min_stock) || 0)) - currentStock);

            return {
                product_id: r.product_id,
                product_name: r.product_name,
                current_stock: currentStock,
                avg_daily_sales: dailyAvg,
                predicted_sales_30d: predictedSales30d,
                stock_out_days: stockOutDays,
                risk_level: riskLevel,
                suggested_order_qty: Math.ceil(suggestedOrderQty)
            };
        });
    }
}

export const aiPredictionService = new AIPredictionService();
