import { postgres } from '../postgres';

export interface ReportRow {
    [key: string]: any;
}

export interface MaterialExtractRow extends ReportRow {
    date: string;
    trcode: number;
    fiche_no: string;
    description: string;
    quantity: number;
    price: number;
    amount: number;
    running_balance: number;
}

class DynamicReportEngine {
    /**
     * Generates a "Material Extract" (Malzeme Ekstresi) matching Logo's structure
     */
    async getMaterialExtract(productId: string, startDate: string, endDate: string): Promise<MaterialExtractRow[]> {
        const { rows } = await postgres.query(`
            SELECT 
                DATE(m.movement_date) as date,
                m.trcode,
                m.document_no as fiche_no,
                m.description,
                i.quantity,
                i.unit_price as price,
                (i.quantity * i.unit_price) as amount,
                m.movement_type
            FROM stock_movement_items i
            JOIN stock_movements m ON i.movement_id = m.id
            WHERE i.product_id = $1
            AND m.movement_date >= $2
            AND m.movement_date <= $3
            ORDER BY m.movement_date ASC, m.created_at ASC
        `, [productId, startDate, endDate]);

        let balance = 0;
        return rows.map(r => {
            const qty = parseFloat(r.quantity) || 0;
            // In Logo: in-movements increase balance, out-movements decrease
            if (r.movement_type === 'in') balance += qty;
            else if (r.movement_type === 'out') balance -= qty;

            return {
                ...r,
                running_balance: balance
            };
        });
    }

    /**
     * Generates a "Customer Extract" (Cari Hesap Ekstresi) matching Logo's structure
     */
    async getCustomerExtract(customerId: string, startDate: string, endDate: string): Promise<ReportRow[]> {
        const { rows } = await postgres.query(`
            SELECT 
                DATE(t.created_at) as date,
                t.trcode,
                t.fiche_no,
                t.description,
                t.debt as debit,
                t.credit,
                t.currency_id as currency
            FROM transactions t -- Generalized table name
            WHERE t.customer_id = $1
            AND t.created_at >= $2
            AND t.created_at <= $3
            ORDER BY t.created_at ASC
        `, [customerId, startDate, endDate]);

        let balance = 0;
        return rows.map(r => {
            const deb = parseFloat(r.debit) || 0;
            const cre = parseFloat(r.credit) || 0;
            balance += (deb - cre);

            return {
                ...r,
                running_balance: balance,
                status: balance > 0 ? 'D' : balance < 0 ? 'C' : '' // Debt/Credit indicators
            };
        });
    }

    /**
     * Generates a Sales Summary matching Logo's standard groups
     */
    async getSalesAnalysis(groupBy: 'category' | 'customer' | 'date'): Promise<ReportRow[]> {
        let groupField = 'p.category';
        if (groupBy === 'customer') groupField = 'c.name';
        if (groupBy === 'date') groupField = 'DATE(s.created_at)';

        const { rows } = await postgres.query(`
            SELECT 
                ${groupField} as group_name,
                COUNT(s.id) as transaction_count,
                SUM(s.total_amount) as total_sales,
                SUM(s.discount_amount) as total_discounts,
                SUM(s.net_amount) as net_sales
            FROM sales s -- Generalized table name
            LEFT JOIN sale_items si ON s.id = si.sale_id
            LEFT JOIN products p ON si.product_id = p.id
            LEFT JOIN customers c ON s.customer_id = c.id
            GROUP BY 1
            ORDER BY 3 DESC
        `);

        return rows;
    }

    /**
     * Generates a Store Performance Analysis matching Nebim V3 standard
     */
    async getStorePerformanceAnalysis(): Promise<ReportRow[]> {
        const { rows } = await postgres.query(`
            SELECT 
                w.name as store_name,
                COUNT(s.id) as ticket_count,
                SUM(s.net_amount) as total_revenue,
                AVG(s.net_amount) as basket_average,
                SUM(si.quantity) as piece_count
            FROM sales s
            JOIN warehouses w ON s.warehouse_id = w.id
            JOIN sale_items si ON s.id = si.sale_id
            GROUP BY w.name
            ORDER BY 3 DESC
        `);

        return rows;
    }

    /**
     * Generates an Inventory Aging Report matching Nebim V3 standard
     */
    async getInventoryAging(): Promise<ReportRow[]> {
        const { rows } = await postgres.query(`
            SELECT 
                p.id,
                p.name as product_name,
                p.stock as current_stock,
                EXTRACT(DAY FROM (NOW() - MAX(m.movement_date))) as days_since_last_move
            FROM products p
            LEFT JOIN stock_movement_items i ON p.id = i.product_id
            LEFT JOIN stock_movements m ON i.movement_id = m.id
            GROUP BY p.id, p.name, p.stock
            ORDER BY 4 DESC NULLS LAST
        `);

        return rows.map(r => ({
            ...r,
            aging_bucket: r.days_since_last_move > 90 ? 'Critical (90+)' :
                r.days_since_last_move > 60 ? 'Slow (60-90)' :
                    r.days_since_last_move > 30 ? 'Normal (30-60)' : 'Active (0-30)'
        }));
    }

    /**
     * Generates a General Ledger Mizan matching Logo ERP standard
     */
    async getGeneralLedgerMizan(): Promise<ReportRow[]> {
        const { rows } = await postgres.query(`
            SELECT 
                account_code,
                account_name,
                SUM(debt) as debit_total,
                SUM(credit) as credit_total,
                (SUM(debt) - SUM(credit)) as net_balance
            FROM gl_transactions -- Generalized table name
            GROUP BY account_code, account_name
            ORDER BY account_code ASC
        `);

        return rows;
    }
}

export const dynamicReportEngine = new DynamicReportEngine();
